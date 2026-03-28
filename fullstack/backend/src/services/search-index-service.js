import { pool } from "../db.js";

function stringifyTags(tags) {
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.join(",");
  return String(tags);
}

export async function upsertSearchDocument({
  entityType,
  entityId,
  title,
  body,
  tags,
  source,
  topic
}, conn = null) {
  const queryable = conn || pool;
  await queryable.execute(
    `INSERT INTO search_documents
      (entity_type, entity_id, title, body, tags, source, topic)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body = VALUES(body),
       tags = VALUES(tags),
       source = VALUES(source),
       topic = VALUES(topic),
       created_at = NOW()`,
    [entityType, String(entityId), title, body || null, stringifyTags(tags), source || null, topic || null]
  );
}

export async function removeSearchDocument(entityType, entityId) {
  await pool.execute(
    `DELETE FROM search_documents
     WHERE entity_type = ? AND entity_id = ?`,
    [entityType, String(entityId)]
  );
}

export async function archiveSearchDocument(entityType, entityId, conn = null) {
  await upsertSearchDocument({
    entityType,
    entityId,
    title: `[ARCHIVED] ${entityType} ${entityId}`,
    body: "Archived record",
    tags: ["archived"],
    source: "SYSTEM",
    topic: "ARCHIVE"
  }, conn);
}
