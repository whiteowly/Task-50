import { pool } from "../db.js";

function parseAuditValue(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  return structuredClone ? structuredClone(raw) : JSON.parse(JSON.stringify(raw));
}

function maskValue(key, value, canViewSensitive) {
  if (canViewSensitive) return value;
  if (/ssn|dob|password|token|authorization/i.test(key)) {
    return "[MASKED]";
  }
  return value;
}

function sanitizeStringifiedJson(input, canViewSensitive) {
  if (typeof input !== "string") return input;
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return input;
    return JSON.stringify(sanitizeObject(parsed, canViewSensitive));
  } catch {
    return input;
  }
}

function sanitizeObject(input, canViewSensitive) {
  if (!input || typeof input !== "object") {
    return sanitizeStringifiedJson(input, canViewSensitive);
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item, canViewSensitive));
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    if (!canViewSensitive && /ssn|dob|password|token|authorization/i.test(key)) {
      output[key] = "[MASKED]";
      continue;
    }

    if (value && typeof value === "object") {
      output[key] = sanitizeObject(value, canViewSensitive);
      continue;
    }

    const parsedValue = sanitizeStringifiedJson(value, canViewSensitive);
    output[key] = maskValue(key, parsedValue, canViewSensitive);
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

  const [rows] = await pool.query(
    `SELECT id, actor_user_id, action, entity_type, entity_id, before_value, after_value, created_at
     FROM audit_logs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM audit_logs
     ${whereSql}`,
    params
  );

  const canViewSensitive = Boolean(actor.sensitiveDataView);
  const data = rows.map((row) => {
    const beforeObj = parseAuditValue(row.before_value);
    const afterObj = parseAuditValue(row.after_value);
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
