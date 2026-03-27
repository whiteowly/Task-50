import { pool, withTx } from "../db.js";
import { AppError, assert } from "../utils/errors.js";
import { writeAudit } from "./audit-service.js";

const allowedDiscrepancies = ["OVER", "SHORT", "DAMAGED"];

export async function scheduleDockAppointment(input, actor) {
  assert(input.siteId, 400, "siteId required");
  assert(input.startAt, 400, "startAt required");
  assert(input.endAt, 400, "endAt required");

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  assert((end - start) / (1000 * 60) === 30, 400, "Only 30-minute windows are allowed");
  assert(start.getMinutes() === 0 || start.getMinutes() === 30, 400, "Start must be at :00 or :30");

  if (actor.role === "CLERK" && actor.siteId !== input.siteId) {
    throw new AppError(403, "Clerks can schedule only for their site");
  }

  const [conflicts] = await pool.execute(
    `SELECT id
     FROM dock_appointments
     WHERE site_id = ?
       AND status <> 'CANCELLED'
       AND start_at < ?
       AND end_at > ?
     LIMIT 1`,
    [input.siteId, input.endAt, input.startAt]
  );
  assert(!conflicts.length, 409, "Time slot already booked");

  const [result] = await pool.execute(
    `INSERT INTO dock_appointments
      (site_id, po_number, start_at, end_at, status, notes, created_by)
     VALUES (?, ?, ?, ?, 'SCHEDULED', ?, ?)`,
    [input.siteId, input.poNumber || null, input.startAt, input.endAt, input.notes || null, actor.id]
  );

  await writeAudit({
    actorUserId: actor.id,
    action: "CREATE",
    entityType: "dock_appointment",
    entityId: result.insertId,
    beforeValue: null,
    afterValue: input
  });

  return { id: result.insertId };
}

export async function createReceipt(input, actor) {
  assert(input.poNumber, 400, "poNumber required");
  assert(Array.isArray(input.lines) && input.lines.length > 0, 400, "lines required");
  if (actor.role === "CLERK" && actor.siteId !== input.siteId) {
    throw new AppError(403, "Clerks can post only for their site");
  }

  return withTx(async (conn) => {
    const [header] = await conn.execute(
      `INSERT INTO receipts
        (site_id, po_number, status, received_by)
       VALUES (?, ?, 'OPEN', ?)`,
      [input.siteId, input.poNumber, actor.id]
    );

    for (const line of input.lines) {
      await conn.execute(
        `INSERT INTO receipt_lines
          (receipt_id, po_line_no, sku, lot_no, qty_expected, qty_received,
           inspection_status, storage_location_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          header.insertId,
          line.poLineNo,
          line.sku,
          line.lotNo || null,
          line.qtyExpected,
          line.qtyReceived,
          line.inspectionStatus || "PENDING",
          line.storageLocationId || null
        ]
      );

      if (line.discrepancyType) {
        assert(
          allowedDiscrepancies.includes(line.discrepancyType),
          400,
          "Invalid discrepancy type"
        );
        await conn.execute(
          `INSERT INTO receipt_discrepancies
            (receipt_id, po_line_no, discrepancy_type, qty_delta, disposition_note)
           VALUES (?, ?, ?, ?, ?)`,
          [
            header.insertId,
            line.poLineNo,
            line.discrepancyType,
            line.qtyDelta || 0,
            line.dispositionNote || null
          ]
        );
      }
    }

    await writeAudit({
      actorUserId: actor.id,
      action: "CREATE",
      entityType: "receipt",
      entityId: header.insertId,
      beforeValue: null,
      afterValue: input,
      conn
    });

    return { id: header.insertId };
  });
}

export async function closeReceipt(receiptId, actor) {
  const [discrepancies] = await pool.execute(
    `SELECT id
     FROM receipt_discrepancies
     WHERE receipt_id = ?
       AND (disposition_note IS NULL OR disposition_note = '')`,
    [receiptId]
  );
  assert(!discrepancies.length, 400, "All discrepancies must have disposition notes");

  await pool.execute("UPDATE receipts SET status = 'CLOSED', closed_at = NOW() WHERE id = ?", [
    receiptId
  ]);
  await writeAudit({
    actorUserId: actor.id,
    action: "APPROVE",
    entityType: "receipt",
    entityId: receiptId,
    beforeValue: { status: "OPEN" },
    afterValue: { status: "CLOSED" }
  });
}

export async function recommendPutaway({ sku, lotNo, quantity }) {
  const [bins] = await pool.execute(
    `SELECT id, code, capacity_qty, occupied_qty, current_sku, current_lot
     FROM inventory_locations
     WHERE is_active = 1
     ORDER BY occupied_qty ASC, code ASC`
  );

  for (const bin of bins) {
    const available = bin.capacity_qty - bin.occupied_qty;
    if (available < quantity) continue;
    const empty = !bin.current_sku;
    const sameSkuLot = bin.current_sku === sku && bin.current_lot === lotNo;
    if (empty || sameSkuLot) {
      return {
        locationId: bin.id,
        locationCode: bin.code,
        availableQty: available,
        mixedStorageAllowed: sameSkuLot
      };
    }
  }
  throw new AppError(409, "No valid location found for putaway");
}
