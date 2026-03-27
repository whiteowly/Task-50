import { pool } from "../db.js";

export async function writeAudit({
  actorUserId,
  action,
  entityType,
  entityId,
  beforeValue,
  afterValue,
  conn
}) {
  const queryable = conn || pool;
  await queryable.execute(
    `INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, before_value, after_value)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actorUserId,
      action,
      entityType,
      entityId,
      beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue ? JSON.stringify(afterValue) : null
    ]
  );
}
