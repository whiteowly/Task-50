import test from "node:test";
import assert from "node:assert/strict";
import { archiveSearchDocument, removeSearchDocument, upsertSearchDocument } from "../backend/src/services/search-index-service.js";
import { searchHub } from "../backend/src/services/search-service.js";
import { pool } from "../backend/src/db.js";

const originalExecute = pool.execute;

test("search index lifecycle supports upsert, query and remove", async () => {
  const store = new Map();

  pool.execute = async (sql, params) => {
    if (sql.includes("INSERT INTO search_documents")) {
      const entityType = params[0];
      const entityId = params[1];
      store.set(`${entityType}:${entityId}`, {
        entity_type: entityType,
        entity_id: String(entityId),
        title: params[2],
        body: params[3],
        tags: params[4],
        source: params[5],
        topic: params[6],
        created_at: new Date()
      });
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("DELETE FROM search_documents")) {
      store.delete(`${params[0]}:${params[1]}`);
      return [{ affectedRows: 1 }];
    }
    if (sql.includes("FROM search_documents")) {
      return [[...store.values()]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  await upsertSearchDocument({
    entityType: "candidate",
    entityId: 1,
    title: "Jane Candidate",
    body: "Applicant profile",
    tags: ["candidate", "application"],
    source: "PORTAL",
    topic: "APPLICANT"
  });

  let results = await searchHub({
    actor: { id: 2, role: "ADMIN", siteId: 1 },
    query: "aplicant",
    source: "PORTAL",
    topic: null,
    entityType: "candidate",
    startDate: null,
    endDate: null
  });
  assert.equal(results.length, 1);

  await archiveSearchDocument("candidate", 1);
  results = await searchHub({
    actor: { id: 2, role: "ADMIN", siteId: 1 },
    query: "archived",
    source: "SYSTEM",
    topic: "ARCHIVE",
    entityType: "candidate",
    startDate: null,
    endDate: null
  });
  assert.equal(results.length, 1);

  await removeSearchDocument("candidate", 1);
  results = await searchHub({
    actor: { id: 2, role: "ADMIN", siteId: 1 },
    query: "candidate",
    source: null,
    topic: null,
    entityType: "candidate",
    startDate: null,
    endDate: null
  });
  assert.equal(results.length, 0);

  pool.execute = originalExecute;
});
