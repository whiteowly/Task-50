import { pool } from "../db.js";

function maskValue(key, value, canViewSensitive) {
  if (canViewSensitive) return value;
  if (/ssn|dob|password|token|authorization/i.test(key)) {
    return "[MASKED]";
  }
  return value;
}

function sanitizeObject(input, canViewSensitive) {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item, canViewSensitive));
  }
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (value && typeof value === "object") {
      output[key] = sanitizeObject(value, canViewSensitive);
      continue;
    }
    output[key] = maskValue(key, value, canViewSensitive);
  }
  return output;
}

export async function listAuditLogs(actor, query) {
  const page = Math.max(1, Number(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (query.action) {
    where.push("action = ?");
    params.push(query.action);
  }
  if (query.entityType) {
    where.push("entity_type = ?");
    params.push(query.entityType);
  }
  if (query.actorUserId) {
    where.push("actor_user_id = ?");
    params.push(query.actorUserId);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await pool.execute(
    `SELECT id, actor_user_id, action, entity_type, entity_id, before_value, after_value, created_at
     FROM audit_logs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[countRow]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     ${whereSql}`,
    params
  );

  const canViewSensitive = Boolean(actor.sensitiveDataView);
  const data = rows.map((row) => {
    const beforeObj = row.before_value ? JSON.parse(JSON.stringify(row.before_value)) : null;
    const afterObj = row.after_value ? JSON.parse(JSON.stringify(row.after_value)) : null;
    return {
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      beforeValue: sanitizeObject(beforeObj, canViewSensitive),
      afterValue: sanitizeObject(afterObj, canViewSensitive),
      createdAt: row.created_at
    };
  });

  return {
    page,
    pageSize,
    total: Number(countRow.total),
    data
  };
}
