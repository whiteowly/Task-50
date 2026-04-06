import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import { publishEvent } from "../backend/src/services/notification-service.js";
import { listAuditLogs } from "../backend/src/services/audit-query-service.js";
import {
  issueCandidateUploadToken,
  verifyCandidateUploadToken,
  reserveCandidateUploadToken,
  consumeReservedCandidateUploadToken
} from "../backend/src/services/hr-service.js";
import app from "../backend/src/app.js";
import { pool } from "../backend/src/db.js";
import { runDbPreflightChecks } from "./db_preflight.js";
import { integrationPoolLifecycle } from "./pool-lifecycle.js";

const dbIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS !== "0";
const adminUsername = process.env.DB_INT_ADMIN_USER || "admin";
const adminPassword = process.env.DB_INT_ADMIN_PASS || "AdminPassw0rd!";
const clerkUsername = process.env.DB_INT_CLERK_USER || "clerk1";
const clerkPassword = process.env.DB_INT_CLERK_PASS || "ClerkPassw0rd!";
const releaseSuitePool = integrationPoolLifecycle.acquireSuite();

after(async () => {
  await releaseSuitePool();
});

async function startServer() {
  const server = createServer(app.callback());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${addr.port}`
  };
}

async function login(baseUrl, username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const body = await response.json();
  assert.equal(response.status, 200, `login failed for ${username}: ${body.error || "unknown"}`);
  return body;
}

if (!dbIntegrationEnabled) {
  test("DB integration tests explicitly disabled via RUN_DB_INTEGRATION_TESTS=0", { skip: true }, () => {});
} else {
  await runDbPreflightChecks({
    adminUsername,
    clerkUsername,
    verifyLogins: async () => {
      const { server, baseUrl } = await startServer();
      try {
        await login(baseUrl, adminUsername, adminPassword);
        await login(baseUrl, clerkUsername, clerkPassword);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    }
  });

  test("integration: login -> session use -> logout lifecycle", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const loginResult = await login(baseUrl, adminUsername, adminPassword);
      assert.equal(typeof loginResult.token, "string");

      const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${loginResult.token}` }
      });
      const meBody = await meResponse.json();
      assert.equal(meResponse.status, 200);
      assert.equal(meBody.user.username, adminUsername);

      const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { authorization: `Bearer ${loginResult.token}` }
      });
      assert.equal(logoutResponse.status, 200);

      const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { authorization: `Bearer ${loginResult.token}` }
      });
      assert.ok([401, 403].includes(meAfterLogout.status));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("integration: create receipt -> close receipt -> audit row exists", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const loginResult = await login(baseUrl, clerkUsername, clerkPassword);
      const poNumber = `PO-INT-${Date.now()}`;

      const createRes = await fetch(`${baseUrl}/api/receiving/receipts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginResult.token}`
        },
        body: JSON.stringify({
          siteId: 1,
          poNumber,
          lines: [
            {
              poLineNo: "1",
              sku: "INT-SKU-1",
              lotNo: "INT-LOT-1",
              qtyExpected: 10,
              qtyReceived: 10,
              inspectionStatus: "PASS",
              storageLocationId: null
            }
          ]
        })
      });
      const createBody = await createRes.json();
      assert.equal(createRes.status, 200);
      assert.ok(createBody.id);

      const closeRes = await fetch(`${baseUrl}/api/receiving/receipts/${createBody.id}/close`, {
        method: "POST",
        headers: { authorization: `Bearer ${loginResult.token}` }
      });
      assert.equal(closeRes.status, 200);

      const [auditRows] = await pool.execute(
        `SELECT id
         FROM audit_logs
         WHERE entity_type = 'receipt'
           AND entity_id = ?
           AND action = 'APPROVE'
         ORDER BY id DESC
         LIMIT 1`,
        [String(createBody.id)]
      );
      assert.equal(auditRows.length, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("integration: offline queue retry preserves queued rows and processes failed rows", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const loginResult = await login(baseUrl, adminUsername, adminPassword);

      const queueRes = await fetch(`${baseUrl}/api/notifications/offline-queue`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginResult.token}`
        },
        body: JSON.stringify({
          channel: "EMAIL",
          recipient: "integration@example.local",
          subject: "Integration export",
          body: "connector payload"
        })
      });
      const queueBody = await queueRes.json();
      assert.equal(queueRes.status, 200);
      assert.ok(queueBody.id);
      await fs.access(queueBody.filePath);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const retryRes = await fetch(`${baseUrl}/api/notifications/offline-queue/retry`, {
          method: "POST",
          headers: { authorization: `Bearer ${loginResult.token}` }
        });
        assert.equal(retryRes.status, 200);
      }

      const [[queuedRow]] = await pool.execute(
        `SELECT retry_count, status
         FROM message_queue
         WHERE id = ?`,
        [queueBody.id]
      );
      assert.equal(Number(queuedRow.retry_count), 0);
      assert.equal(queuedRow.status, "QUEUED");

      await pool.execute(
        `UPDATE message_queue
         SET status = 'FAILED', retry_count = 1
         WHERE id = ?`,
        [queueBody.id]
      );

      const failedRetryRes = await fetch(`${baseUrl}/api/notifications/offline-queue/retry`, {
        method: "POST",
        headers: { authorization: `Bearer ${loginResult.token}` }
      });
      assert.equal(failedRetryRes.status, 200);

      const [[failedRow]] = await pool.execute(
        `SELECT retry_count, status
         FROM message_queue
         WHERE id = ?`,
        [queueBody.id]
      );
      assert.equal(Number(failedRow.retry_count), 2);
      assert.equal(failedRow.status, "QUEUED");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("integration: same-day DND subscription defers delivery until DND end", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const loginResult = await login(baseUrl, adminUsername, adminPassword);
      const actor = loginResult.user;
      const receiptId = `DND-${Date.now()}`;

      const subRes = await fetch(`${baseUrl}/api/notifications/subscriptions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${loginResult.token}`
        },
        body: JSON.stringify({
          topic: "RECEIPT_ACK",
          frequency: "IMMEDIATE",
          dndStart: "13:00",
          dndEnd: "17:00"
        })
      });
      assert.equal(subRes.status, 200);

      const simulatedNow = new Date();
      simulatedNow.setHours(14, 15, 0, 0);
      const expectedRelease = new Date(simulatedNow);
      expectedRelease.setHours(17, 0, 0, 0);

      await publishEvent(
        "RECEIPT_ACK",
        { receiptId },
        { id: actor.id },
        simulatedNow
      );

      const [rows] = await pool.execute(
        `SELECT status, deliver_after, created_at, message
         FROM notifications
         WHERE user_id = ?
           AND event_type = 'RECEIPT_ACK'
           AND message LIKE ?
         ORDER BY id DESC
         LIMIT 1`,
        [actor.id, `%${receiptId}%`]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "PENDING");

      const deliverAfter = new Date(rows[0].deliver_after);
      assert.equal(deliverAfter.getTime(), expectedRelease.getTime());
      assert.ok(deliverAfter.getTime() > simulatedNow.getTime());
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("integration: audit_logs immutability trigger rejects UPDATE and DELETE", async () => {
    const [inserted] = await pool.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES (NULL, 'TEST', 'integration_test', ?, NULL, '{"test":true}')`,
      [`immut-${Date.now()}`]
    );
    const logId = inserted.insertId;

    await assert.rejects(
      () => pool.execute("UPDATE audit_logs SET action = 'MODIFIED' WHERE id = ?", [logId]),
      (err) => {
        assert.ok(err.message.includes("audit_logs is immutable"));
        return true;
      }
    );

    await assert.rejects(
      () => pool.execute("DELETE FROM audit_logs WHERE id = ?", [logId]),
      (err) => {
        assert.ok(err.message.includes("audit_logs is immutable"));
        return true;
      }
    );
  });

  test("integration: sensitive-field masking in audit query service with real DB rows", async () => {
    const entityId = `mask-${Date.now()}`;
    await pool.execute(
      `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
       VALUES (NULL, 'UPDATE', 'candidate', ?, ?, ?)`,
      [
        entityId,
        JSON.stringify({ ssn: "123-45-6789", name: "Alice" }),
        JSON.stringify({ dob: "1990-01-01", name: "Alice" })
      ]
    );

    const resultMasked = await listAuditLogs(
      { sensitiveDataView: false },
      { entityType: "candidate", page: 1, pageSize: 100 }
    );
    const maskedRow = resultMasked.data.find((r) => r.entityId === entityId);
    assert.ok(maskedRow, "Audit row should be returned");
    assert.equal(maskedRow.beforeValue.ssn, "[MASKED]");
    assert.equal(maskedRow.beforeValue.name, "Alice");
    assert.equal(maskedRow.afterValue.dob, "[MASKED]");
    assert.equal(maskedRow.afterValue.name, "Alice");

    const resultVisible = await listAuditLogs(
      { sensitiveDataView: true },
      { entityType: "candidate", page: 1, pageSize: 100 }
    );
    const visibleRow = resultVisible.data.find((r) => r.entityId === entityId);
    assert.ok(visibleRow);
    assert.equal(visibleRow.beforeValue.ssn, "123-45-6789");
    assert.equal(visibleRow.afterValue.dob, "1990-01-01");
  });

  test("integration: site-isolation for receipt access returns 403 for wrong site", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);

      const [[clerkUser]] = await pool.execute(
        "SELECT id, site_id FROM users WHERE username = ?",
        [clerkUsername]
      );

      const otherSiteId = Number(clerkUser.site_id) === 1 ? 2 : 1;

      const [existingSite] = await pool.execute(
        "SELECT id FROM receipts WHERE site_id = ? LIMIT 1",
        [otherSiteId]
      );

      let receiptId;
      if (existingSite.length) {
        receiptId = existingSite[0].id;
      } else {
        const createRes = await fetch(`${baseUrl}/api/receiving/receipts`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${adminLogin.token}`
          },
          body: JSON.stringify({
            siteId: otherSiteId,
            poNumber: `PO-SITE-ISO-${Date.now()}`,
            lines: [
              {
                poLineNo: "1",
                sku: "ISO-SKU-1",
                lotNo: "ISO-LOT-1",
                qtyExpected: 5,
                qtyReceived: 5,
                inspectionStatus: "PASS"
              }
            ]
          })
        });
        const createBody = await createRes.json();
        assert.equal(createRes.status, 200);
        receiptId = createBody.id;
      }

      const closeRes = await fetch(`${baseUrl}/api/receiving/receipts/${receiptId}/close`, {
        method: "POST",
        headers: { authorization: `Bearer ${clerkLogin.token}` }
      });
      assert.equal(closeRes.status, 403);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("integration: upload token lifecycle — issue, reserve, consume, replay rejected", async () => {
    const fakeCandidateId = 999999;
    await pool.execute(
      `INSERT IGNORE INTO candidates (id, full_name, dob_enc, ssn_last4_enc, source)
       VALUES (?, 'Token Test', 'enc', 'enc', 'PORTAL')`,
      [fakeCandidateId]
    );

    const token = await issueCandidateUploadToken(fakeCandidateId);
    assert.equal(typeof token, "string");

    const verified = await verifyCandidateUploadToken(token, fakeCandidateId);
    assert.equal(verified, true);

    const reserved = await reserveCandidateUploadToken(token, fakeCandidateId);
    assert.ok(reserved);
    assert.ok(reserved.jti);

    await consumeReservedCandidateUploadToken(reserved.jti);

    const replayVerify = await verifyCandidateUploadToken(token, fakeCandidateId);
    assert.equal(replayVerify, false);

    const replayReserve = await reserveCandidateUploadToken(token, fakeCandidateId);
    assert.equal(replayReserve, null);
  });
}
