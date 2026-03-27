import fs from "node:fs/promises";
import path from "node:path";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../db.js";
import { config } from "../config.js";

const dndStart = "21:00";
const dndEnd = "07:00";

function inDoNotDisturb(now = dayjs()) {
  const hhmm = now.format("HH:mm");
  return hhmm >= dndStart || hhmm < dndEnd;
}

export async function subscribeNotification(input, actor) {
  const [result] = await pool.execute(
    `INSERT INTO notification_subscriptions
      (user_id, topic, frequency, enabled)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE frequency = VALUES(frequency), enabled = 1`,
    [actor.id, input.topic, input.frequency]
  );
  return { id: result.insertId || null, ok: true };
}

export async function publishEvent(eventType, payload) {
  const [subs] = await pool.execute(
    `SELECT ns.user_id, ns.frequency, nt.body_template
     FROM notification_subscriptions ns
     JOIN notification_templates nt ON nt.topic = ns.topic
     WHERE ns.topic = ? AND ns.enabled = 1`,
    [eventType]
  );
  const now = dayjs();
  for (const sub of subs) {
    if (inDoNotDisturb(now)) {
      await pool.execute(
        `INSERT INTO notifications
          (user_id, event_type, message, status, deliver_after)
         VALUES (?, ?, ?, 'PENDING', ?)`,
        [sub.user_id, eventType, renderTemplate(sub.body_template, payload), now.hour(7).add(1, "day").toDate()]
      );
      continue;
    }

    if (sub.frequency === "IMMEDIATE") {
      await pool.execute(
        `INSERT INTO notifications
          (user_id, event_type, message, status, delivered_at)
         VALUES (?, ?, ?, 'DELIVERED', NOW())`,
        [sub.user_id, eventType, renderTemplate(sub.body_template, payload)]
      );
    } else {
      const deliverAfter =
        sub.frequency === "HOURLY"
          ? now.startOf("hour").add(1, "hour").toDate()
          : now.hour(18).minute(0).second(0).millisecond(0).toDate();
      await pool.execute(
        `INSERT INTO notifications
          (user_id, event_type, message, status, deliver_after)
         VALUES (?, ?, ?, 'PENDING', ?)`,
        [sub.user_id, eventType, renderTemplate(sub.body_template, payload), deliverAfter]
      );
    }
  }
}

export async function processPendingNotifications() {
  const [rows] = await pool.execute(
    `SELECT id FROM notifications
     WHERE status = 'PENDING' AND deliver_after <= NOW()`
  );
  for (const row of rows) {
    await pool.execute(
      "UPDATE notifications SET status = 'DELIVERED', delivered_at = NOW() WHERE id = ?",
      [row.id]
    );
  }
  return { delivered: rows.length };
}

function renderTemplate(template, payload) {
  return template.replace(/\{(\w+)\}/g, (_, key) => payload[key] ?? "");
}

export async function queueOfflineMessage(input) {
  await fs.mkdir(config.exportDir, { recursive: true });
  const id = uuidv4();
  const fileName = `${dayjs().format("YYYYMMDD-HHmmss")}-${id}.json`;
  const filePath = path.join(config.exportDir, fileName);
  const content = {
    id,
    channel: input.channel,
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
    exportedAt: new Date().toISOString(),
    status: "QUEUED"
  };
  await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf8");
  await pool.execute(
    `INSERT INTO message_queue
      (id, channel, recipient, subject, body, status, export_file)
     VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)`,
    [id, input.channel, input.recipient, input.subject, input.body, filePath]
  );
  return { id, filePath };
}

export async function retryFailedMessages() {
  const [rows] = await pool.execute(
    `SELECT id, retry_count
     FROM message_queue WHERE status IN ('FAILED', 'QUEUED')`
  );
  for (const row of rows) {
    await pool.execute(
      `UPDATE message_queue
       SET retry_count = retry_count + 1,
           status = CASE WHEN retry_count + 1 >= 3 THEN 'FAILED' ELSE 'QUEUED' END
       WHERE id = ?`,
      [row.id]
    );
  }
  return { processed: rows.length };
}
