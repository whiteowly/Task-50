import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import jwt from "../backend/node_modules/jsonwebtoken/index.js";
import app from "../backend/src/app.js";
import { config } from "../backend/src/config.js";
import { pool } from "../backend/src/db.js";
import { listAuditLogs } from "../backend/src/services/audit-query-service.js";
import { backtrackRecalculate } from "../backend/src/services/rules-service.js";

const originalExecute = pool.execute;
const originalGetConnection = pool.getConnection;

async function startServer() {
  const server = createServer(app.callback());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

test("HR upload endpoints return 401/403 for unauthorized actors", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const unauthPayload = new FormData();
    unauthPayload.append("file", new File(["png-bytes"], "resume.png", { type: "image/png" }));
    const unauthRes = await fetch(`${baseUrl}/api/hr/applications/100/attachments`, {
      method: "POST",
      body: unauthPayload
    });
    assert.equal(unauthRes.status, 401);

    const clerkToken = jwt.sign({ sub: 77, sessionId: "sess-hr-regression" }, config.jwtSecret, { expiresIn: 3600 });
    pool.execute = async (sql) => {
      if (sql.includes("INSERT INTO audit_logs")) return [{ insertId: 1 }];
      if (sql.includes("FROM sessions s")) {
        return [[{
          id: "sess-hr-regression",
          user_id: 77,
          last_activity_at: new Date(),
          username: "clerk-regression",
          role: "CLERK",
          site_id: 1,
          department_id: 1,
          sensitive_data_view: 0,
          has_sensitive_permission: 0
        }]];
      }
      if (sql.includes("SET last_activity_at = NOW()")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    };

    const forbiddenPayload = new FormData();
    forbiddenPayload.append("file", new File(["png-bytes"], "resume.png", { type: "image/png" }));
    const forbiddenRes = await fetch(`${baseUrl}/api/hr/applications/100/attachments`, {
      method: "POST",
      headers: { authorization: `Bearer ${clerkToken}` },
      body: forbiddenPayload
    });
    assert.equal(forbiddenRes.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.execute = originalExecute;
  }
});

test("audit masking recursively masks sensitive keys inside stringified JSON", async () => {
  const nestedJson = JSON.stringify({
    ssn: "123-45-6789",
    profile: { dob: "1990-01-01" },
    sessions: [{ token: "secret-token" }]
  });

  pool.execute = async (sql) => {
    if (sql.includes("FROM audit_logs") && sql.includes("COUNT(*)")) {
      return [[{ total: 1 }]];
    }
    if (sql.includes("FROM audit_logs")) {
      return [[{
        id: 900,
        actor_user_id: 1,
        action: "UPDATE",
        entity_type: "candidate",
        entity_id: "100",
        before_value: JSON.stringify({ payload: nestedJson }),
        after_value: JSON.stringify({ payload: nestedJson }),
        created_at: new Date()
      }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };

  try {
    const result = await listAuditLogs({ sensitiveDataView: false }, { page: 1, pageSize: 10 });
    const maskedPayload = JSON.parse(result.data[0].beforeValue.payload);

    assert.equal(maskedPayload.ssn, "[MASKED]");
    assert.equal(maskedPayload.profile.dob, "[MASKED]");
    assert.equal(maskedPayload.sessions[0].token, "[MASKED]");
  } finally {
    pool.execute = originalExecute;
  }
});

test("rule backtrack immediately recalculates weighted score, GPA, and quality points", async () => {
  let updateParams = null;
  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, params) {
      if (sql.includes("FROM scoring_rule_versions")) {
        return [[{ id: 10, weights_json: JSON.stringify({ coursework: 0.5, midterm: 0.2, final: 0.3 }) }]];
      }
      if (sql.includes("FROM qualification_scores")) {
        return [[{
          id: 501,
          candidate_id: 88,
          coursework_score: 80,
          midterm_score: 70,
          final_score: 90,
          weighted_score: 0,
          gpa: 0,
          credit_hours: 3,
          quality_points: 0
        }]];
      }
      if (sql.includes("UPDATE qualification_scores")) {
        updateParams = params;
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("INSERT INTO audit_logs")) {
        return [{ insertId: 1 }];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };

  pool.getConnection = async () => conn;
  try {
    const result = await backtrackRecalculate(10, { id: 99 });
    assert.equal(result.markedForRecalc, 1);
    assert.ok(updateParams);
    assert.ok(Math.abs(Number(updateParams[0]) - 81) < 0.0001);
    assert.ok(Math.abs(Number(updateParams[1]) - 2.7) < 0.0001);
    assert.ok(Math.abs(Number(updateParams[2]) - 8.1) < 0.0001);
    assert.equal(Number(updateParams[3]), 501);
  } finally {
    pool.getConnection = originalGetConnection;
  }
});
