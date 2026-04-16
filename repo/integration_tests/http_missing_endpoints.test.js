import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../backend/src/app.js";
import { pool } from "../backend/src/db.js";
import { integrationPoolLifecycle } from "./pool-lifecycle.js";

import { encryptString } from "../backend/src/utils/crypto.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbIntegrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS !== "0";
const adminUsername = process.env.DB_INT_ADMIN_USER || "admin";
const adminPassword = process.env.DB_INT_ADMIN_PASS || "AdminPassw0rd!";
const clerkUsername = process.env.DB_INT_CLERK_USER || "clerk1";
const clerkPassword = process.env.DB_INT_CLERK_PASS || "ClerkPassw0rd!";
const plannerUsername = "planner1";
const plannerPassword = "PlannerPassw0rd!";
const hrUsername = "hr1";
const hrPassword = "HrRecruitPassw0rd!";
const interviewerUsername = "interviewer1";
const interviewerPassword = "InterviewerPass!";
const candidateUsername = "candidate1";
const candidatePassword = "CandidatePassw0rd!";

const releaseSuitePool = integrationPoolLifecycle.acquireSuite();
after(async () => { await releaseSuitePool(); });

async function startServer() {
  const server = createServer(app.callback());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
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

function authHeaders(token) {
  return { "content-type": "application/json", authorization: `Bearer ${token}` };
}

if (!dbIntegrationEnabled) {
  test("HTTP missing-endpoint tests explicitly disabled", { skip: true }, () => {});
} else {

  // ─── 1. POST /api/auth/users ──────────────────────────────────────────
  test("integration: POST /api/auth/users — admin creates user successfully", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const uniqueName = `testuser-${Date.now()}`;
      const res = await fetch(`${baseUrl}/api/auth/users`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          username: uniqueName,
          password: "SecurePass123!",
          role: "CLERK",
          siteId: 1,
          departmentId: null,
          sensitiveDataView: false
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id, "response must contain created user id");

      // verify DB side effect
      const [[dbRow]] = await pool.execute(
        "SELECT username, role, site_id FROM users WHERE id = ?",
        [body.id]
      );
      assert.equal(dbRow.username, uniqueName);
      assert.equal(dbRow.role, "CLERK");

      // verify audit log
      const [auditRows] = await pool.execute(
        `SELECT action FROM audit_logs
         WHERE entity_type = 'user' AND entity_id = ? AND action = 'CREATE'
         LIMIT 1`,
        [String(body.id)]
      );
      assert.equal(auditRows.length, 1);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/auth/users — clerk is forbidden", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/auth/users`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          username: `should-fail-${Date.now()}`,
          password: "SecurePass123!",
          role: "CLERK"
        })
      });
      assert.ok([403, 401].includes(res.status), `expected 403, got ${res.status}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/auth/users — password too short returns 400", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const res = await fetch(`${baseUrl}/api/auth/users`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          username: `short-pw-${Date.now()}`,
          password: "short",
          role: "CLERK"
        })
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.ok(body.error);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 2. GET /api/planning/mps/:planId/mrp ─────────────────────────────
  test("integration: GET /api/planning/mps/:planId/mrp — planner runs MRP", async () => {
    const { server, baseUrl } = await startServer();
    try {
      // admin creates plan (admin has all permissions)
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const suffix = Date.now();
      const weeks = Array.from({ length: 12 }, (_, i) => ({
        weekIndex: i + 1,
        itemCode: `MRP-ITEM-${suffix}`,
        plannedQty: 10
      }));

      const planRes = await fetch(`${baseUrl}/api/planning/mps`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          siteId: 1,
          planName: `MRP-Plan-${suffix}`,
          startWeek: "2026-05-18",
          weeks
        })
      });
      const planBody = await planRes.json();
      assert.equal(planRes.status, 200);
      assert.ok(planBody.id);

      // run MRP
      const mrpRes = await fetch(`${baseUrl}/api/planning/mps/${planBody.id}/mrp`, {
        headers: authHeaders(adminLogin.token)
      });
      const mrpBody = await mrpRes.json();
      assert.equal(mrpRes.status, 200);
      assert.ok(Array.isArray(mrpBody), "MRP should return an array of requirements");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: GET /api/planning/mps/:planId/mrp — clerk lacks MRP_RUN permission", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/planning/mps/1/mrp`, {
        headers: authHeaders(clerkLogin.token)
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 3. POST /api/planning/work-orders ────────────────────────────────
  test("integration: POST /api/planning/work-orders — admin creates work order", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const suffix = Date.now();

      // create plan first
      const weeks = Array.from({ length: 12 }, (_, i) => ({
        weekIndex: i + 1,
        itemCode: `WO-ITEM-${suffix}`,
        plannedQty: 5
      }));
      const planRes = await fetch(`${baseUrl}/api/planning/mps`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          siteId: 1,
          planName: `WO-Plan-${suffix}`,
          startWeek: "2026-05-25",
          weeks
        })
      });
      const planBody = await planRes.json();
      assert.equal(planRes.status, 200);

      // create work order
      const woRes = await fetch(`${baseUrl}/api/planning/work-orders`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          planId: planBody.id,
          itemCode: `WO-ITEM-${suffix}`,
          qtyTarget: 50,
          scheduledStart: "2026-06-01",
          scheduledEnd: "2026-06-15"
        })
      });
      const woBody = await woRes.json();
      assert.equal(woRes.status, 200);
      assert.ok(woBody.id, "response must contain work order id");

      // verify DB
      const [[dbRow]] = await pool.execute(
        "SELECT item_code, status FROM work_orders WHERE id = ?",
        [woBody.id]
      );
      assert.equal(dbRow.item_code, `WO-ITEM-${suffix}`);
      assert.equal(dbRow.status, "OPEN");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/planning/work-orders — clerk lacks permission", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/planning/work-orders`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          planId: 1,
          itemCode: "X",
          qtyTarget: 1,
          scheduledStart: "2026-06-01",
          scheduledEnd: "2026-06-15"
        })
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 4. POST /api/planning/plans/:planId/adjustments ──────────────────
  test("integration: POST /api/planning/plans/:planId/adjustments — planner requests adjustment", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const suffix = Date.now();

      // create plan
      const weeks = Array.from({ length: 12 }, (_, i) => ({
        weekIndex: i + 1,
        itemCode: `ADJ-ITEM-${suffix}`,
        plannedQty: 8
      }));
      const planRes = await fetch(`${baseUrl}/api/planning/mps`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          siteId: 1,
          planName: `ADJ-Plan-${suffix}`,
          startWeek: "2026-06-01",
          weeks
        })
      });
      const planBody = await planRes.json();
      assert.equal(planRes.status, 200);

      // use planner to request adjustment
      const plannerLogin = await login(baseUrl, plannerUsername, plannerPassword);
      const adjRes = await fetch(`${baseUrl}/api/planning/plans/${planBody.id}/adjustments`, {
        method: "POST",
        headers: authHeaders(plannerLogin.token),
        body: JSON.stringify({
          reasonCode: "DEMAND_CHANGE",
          before: { note: "original" },
          after: { note: "adjusted", planName: `ADJ-Plan-${suffix}-v2` }
        })
      });
      const adjBody = await adjRes.json();
      assert.equal(adjRes.status, 200);
      assert.ok(adjBody.id, "response must contain adjustment id");

      // verify DB
      const [[adjRow]] = await pool.execute(
        "SELECT reason_code, status FROM plan_adjustments WHERE id = ?",
        [adjBody.id]
      );
      assert.equal(adjRow.reason_code, "DEMAND_CHANGE");
      assert.equal(adjRow.status, "PENDING");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/planning/plans/:planId/adjustments — clerk lacks PLAN_ADJUST", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/planning/plans/1/adjustments`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({ reasonCode: "TEST", before: {}, after: {} })
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 5. POST /api/notifications/events ────────────────────────────────
  test("integration: POST /api/notifications/events — HR publishes event", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);

      const res = await fetch(`${baseUrl}/api/notifications/events`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          eventType: "RECEIPT_ACK",
          payload: { receiptId: `EVT-${Date.now()}` }
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok("created" in body, "response must contain created count");
      assert.equal(typeof body.created, "number");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/notifications/events — clerk lacks NOTIFY_PUBLISH", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/notifications/events`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({ eventType: "RECEIPT_ACK", payload: {} })
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 6. POST /api/notifications/dispatch ──────────────────────────────
  test("integration: POST /api/notifications/dispatch — HR dispatches pending notifications", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);

      const res = await fetch(`${baseUrl}/api/notifications/dispatch`, {
        method: "POST",
        headers: authHeaders(hrLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok("delivered" in body, "response must contain delivered count");
      assert.equal(typeof body.delivered, "number");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/notifications/dispatch — clerk lacks NOTIFY_PUBLISH", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/notifications/dispatch`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token)
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 7. POST /api/rules/versions ──────────────────────────────────────
  test("integration: POST /api/rules/versions — HR creates rule version", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);
      const suffix = Date.now();

      const res = await fetch(`${baseUrl}/api/rules/versions`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          versionName: `Rule-${suffix}`,
          weights: { coursework: 0.4, midterm: 0.2, final: 0.4 },
          retakePolicy: "HIGHEST_SCORE",
          effectiveDate: "2026-07-01"
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id, "response must contain rule version id");
      assert.equal(typeof body.markedForRecalc, "number");

      // verify DB
      const [[dbRow]] = await pool.execute(
        "SELECT version_name, retake_policy FROM scoring_rule_versions WHERE id = ?",
        [body.id]
      );
      assert.equal(dbRow.version_name, `Rule-${suffix}`);
      assert.equal(dbRow.retake_policy, "HIGHEST_SCORE");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/rules/versions — clerk lacks RULES_WRITE", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/rules/versions`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          versionName: "Should-fail",
          weights: { coursework: 0.4, midterm: 0.2, final: 0.4 },
          effectiveDate: "2026-07-01"
        })
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 8. POST /api/rules/score ─────────────────────────────────────────
  test("integration: POST /api/rules/score — HR scores qualification", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);
      const suffix = Date.now();

      // create a rule version first
      const rvRes = await fetch(`${baseUrl}/api/rules/versions`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          versionName: `Score-Rule-${suffix}`,
          weights: { coursework: 0.4, midterm: 0.2, final: 0.4 },
          retakePolicy: "HIGHEST_SCORE",
          effectiveDate: "2026-07-01"
        })
      });
      const rvBody = await rvRes.json();
      assert.equal(rvRes.status, 200);

      // create a candidate to score
      const fakeCandidateId = 800000 + (suffix % 100000);
      await pool.execute(
        `INSERT IGNORE INTO candidates (id, full_name, dob_enc, ssn_last4_enc, source)
         VALUES (?, 'Score Test', 'enc', 'enc', 'PORTAL')`,
        [fakeCandidateId]
      );

      const scoreRes = await fetch(`${baseUrl}/api/rules/score`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          candidateId: fakeCandidateId,
          ruleVersionId: rvBody.id,
          courseworkScores: [85, 90],
          midtermScores: [78],
          finalScores: [92],
          creditHours: 3
        })
      });
      const scoreBody = await scoreRes.json();
      assert.equal(scoreRes.status, 200);
      assert.ok(scoreBody.scoreId, "response must contain scoreId");
      assert.equal(typeof scoreBody.weightedFinal, "number");
      assert.equal(typeof scoreBody.gpa, "number");
      assert.equal(typeof scoreBody.qualityPoints, "number");

      // verify DB
      const [[dbRow]] = await pool.execute(
        "SELECT candidate_id, rule_version_id FROM qualification_scores WHERE id = ?",
        [scoreBody.scoreId]
      );
      assert.equal(Number(dbRow.candidate_id), fakeCandidateId);
      assert.equal(Number(dbRow.rule_version_id), rvBody.id);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/rules/score — clerk lacks RULES_SCORE", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/rules/score`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          candidateId: 1,
          ruleVersionId: 1,
          courseworkScores: [80],
          midtermScores: [80],
          finalScores: [80],
          creditHours: 3
        })
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 9. POST /api/rules/versions/:id/recalculate ─────────────────────
  test("integration: POST /api/rules/versions/:id/recalculate — HR recalculates scores", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);
      const suffix = Date.now();

      // create rule version
      const rvRes = await fetch(`${baseUrl}/api/rules/versions`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          versionName: `Recalc-Rule-${suffix}`,
          weights: { coursework: 0.3, midterm: 0.3, final: 0.4 },
          retakePolicy: "HIGHEST_SCORE",
          effectiveDate: "2026-08-01"
        })
      });
      const rvBody = await rvRes.json();
      assert.equal(rvRes.status, 200);

      // insert a candidate and score so recalculate has rows to process
      const fakeCandidateId = 900000 + (suffix % 100000);
      await pool.execute(
        `INSERT IGNORE INTO candidates (id, full_name, dob_enc, ssn_last4_enc, source)
         VALUES (?, 'Recalc Test', 'enc', 'enc', 'PORTAL')`,
        [fakeCandidateId]
      );

      const scoreRes = await fetch(`${baseUrl}/api/rules/score`, {
        method: "POST",
        headers: authHeaders(hrLogin.token),
        body: JSON.stringify({
          candidateId: fakeCandidateId,
          ruleVersionId: rvBody.id,
          courseworkScores: [70],
          midtermScores: [80],
          finalScores: [90],
          creditHours: 4
        })
      });
      assert.equal(scoreRes.status, 200);

      // recalculate
      const recalcRes = await fetch(`${baseUrl}/api/rules/versions/${rvBody.id}/recalculate`, {
        method: "POST",
        headers: authHeaders(hrLogin.token)
      });
      const recalcBody = await recalcRes.json();
      assert.equal(recalcRes.status, 200);
      assert.equal(typeof recalcBody.markedForRecalc, "number");
      assert.ok(recalcBody.markedForRecalc >= 1, "should have recalculated at least 1 score");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: POST /api/rules/versions/:id/recalculate — clerk lacks RULES_WRITE", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const res = await fetch(`${baseUrl}/api/rules/versions/1/recalculate`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token)
      });
      assert.equal(res.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 10. GET /api/hr/forms/application ────────────────────────────────
  test("integration: GET /api/hr/forms/application — authenticated user gets form schema", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const candidateLogin = await login(baseUrl, candidateUsername, candidatePassword);

      const res = await fetch(`${baseUrl}/api/hr/forms/application`, {
        headers: authHeaders(candidateLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body), "response must be an array of form fields");
      assert.ok(body.length > 0, "should have at least one form field");

      // verify field structure
      const field = body[0];
      assert.ok("field_key" in field, "field must have field_key");
      assert.ok("label" in field, "field must have label");
      assert.ok("field_type" in field, "field must have field_type");
      assert.ok("is_required" in field, "field must have is_required");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: GET /api/hr/forms/application — unauthenticated request is rejected", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const res = await fetch(`${baseUrl}/api/hr/forms/application`);
      assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 11. GET /api/dashboard (ADMIN) ───────────────────────────────────
  test("integration: GET /api/dashboard — admin sees activeWorkOrders and candidates", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const res = await fetch(`${baseUrl}/api/dashboard`, {
        headers: authHeaders(adminLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.role, "ADMIN");
      assert.equal(typeof body.widgets.activeWorkOrders, "number");
      assert.equal(typeof body.widgets.candidates, "number");

      // cross-check DB counts
      const [[woCount]] = await pool.execute(
        "SELECT COUNT(*) AS count FROM work_orders WHERE status IN ('OPEN', 'IN_PROGRESS')"
      );
      const [[candCount]] = await pool.execute("SELECT COUNT(*) AS count FROM candidates");
      assert.equal(body.widgets.activeWorkOrders, woCount.count);
      assert.equal(body.widgets.candidates, candCount.count);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 12. GET /api/dashboard (INTERVIEWER restricted) ──────────────────
  test("integration: GET /api/dashboard — interviewer sees null candidates (redacted)", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const interviewerLogin = await login(baseUrl, interviewerUsername, interviewerPassword);
      const res = await fetch(`${baseUrl}/api/dashboard`, {
        headers: authHeaders(interviewerLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.role, "INTERVIEWER");
      assert.equal(body.widgets.candidates, null);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 13. POST /api/receiving/dock-appointments (success) ──────────────
  test("integration: POST /api/receiving/dock-appointments — clerk creates appointment", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const suffix = Date.now();
      // use a far-future unique window to avoid conflict; MySQL datetime needs YYYY-MM-DD HH:MM:SS
      const hour = 10 + (suffix % 12);
      const minute = (suffix % 2) === 0 ? 0 : 30;
      const day = 10 + (suffix % 18);
      const startAt = `2028-01-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
      const endMinute = minute + 30;
      const endHour = endMinute >= 60 ? hour + 1 : hour;
      const endMin = endMinute >= 60 ? endMinute - 60 : endMinute;
      const endAt = `2028-01-${String(day).padStart(2, "0")} ${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}:00`;

      const res = await fetch(`${baseUrl}/api/receiving/dock-appointments`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          siteId: 1,
          poNumber: `DOCK-PO-${suffix}`,
          startAt,
          endAt,
          notes: "integration test"
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id, "response must contain created appointment id");

      // verify DB
      const [[dbRow]] = await pool.execute(
        "SELECT po_number, status FROM dock_appointments WHERE id = ?",
        [body.id]
      );
      assert.equal(dbRow.po_number, `DOCK-PO-${suffix}`);
      assert.equal(dbRow.status, "SCHEDULED");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 14. POST /api/receiving/putaway/recommend (success + isolation) ──
  test("integration: POST /api/receiving/putaway/recommend — clerk gets recommendation for own site", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const suffix = Date.now();
      const sku = `PUT-SKU-${suffix}`;
      const lot = `PUT-LOT-${suffix}`;
      const locationCode = `BIN-${suffix}`;

      // seed an active inventory location with free capacity for site 1
      await pool.execute(
        `INSERT INTO inventory_locations (site_id, code, capacity_qty, occupied_qty, current_sku, current_lot, is_active)
         VALUES (1, ?, 100, 10, NULL, NULL, 1)`,
        [locationCode]
      );

      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);

      // success: own site
      const res = await fetch(`${baseUrl}/api/receiving/putaway/recommend`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({ siteId: 1, sku, lotNo: lot, quantity: 5 })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.locationId, "response must contain locationId");
      assert.ok(body.locationCode, "response must contain locationCode");
      assert.equal(typeof body.availableQty, "number");

      // negative: cross-site request returns 403
      const crossSiteRes = await fetch(`${baseUrl}/api/receiving/putaway/recommend`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({ siteId: 2, sku, lotNo: lot, quantity: 5 })
      });
      assert.equal(crossSiteRes.status, 403);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 15. POST /api/planning/work-orders/:id/events (validation) ───────
  test("integration: POST /api/planning/work-orders/:id/events — downtime without reasonCode returns 400", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const suffix = Date.now();

      // create plan + work order
      const weeks = Array.from({ length: 12 }, (_, i) => ({
        weekIndex: i + 1,
        itemCode: `EVT-ITEM-${suffix}`,
        plannedQty: 5
      }));
      const planRes = await fetch(`${baseUrl}/api/planning/mps`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          siteId: 1,
          planName: `EVT-Plan-${suffix}`,
          startWeek: "2026-07-06",
          weeks
        })
      });
      const planBody = await planRes.json();
      assert.equal(planRes.status, 200);

      const woRes = await fetch(`${baseUrl}/api/planning/work-orders`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          planId: planBody.id,
          itemCode: `EVT-ITEM-${suffix}`,
          qtyTarget: 20,
          scheduledStart: "2026-07-10",
          scheduledEnd: "2026-07-20"
        })
      });
      const woBody = await woRes.json();
      assert.equal(woRes.status, 200);

      // DOWNTIME without reasonCode → 400
      const evtRes = await fetch(`${baseUrl}/api/planning/work-orders/${woBody.id}/events`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          eventType: "DOWNTIME",
          qty: 0,
          reasonCode: "",
          notes: "missing reason"
        })
      });
      assert.equal(evtRes.status, 400);
      const evtBody = await evtRes.json();
      assert.ok(evtBody.error.toLowerCase().includes("reason"), "error should mention reason requirement");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 16. POST /api/planning/adjustments/:id/approve (success) ─────────
  test("integration: POST /api/planning/adjustments/:id/approve — admin approves adjustment", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const suffix = Date.now();

      // create plan
      const weeks = Array.from({ length: 12 }, (_, i) => ({
        weekIndex: i + 1,
        itemCode: `APR-ITEM-${suffix}`,
        plannedQty: 6
      }));
      const planRes = await fetch(`${baseUrl}/api/planning/mps`, {
        method: "POST",
        headers: authHeaders(adminLogin.token),
        body: JSON.stringify({
          siteId: 1,
          planName: `APR-Plan-${suffix}`,
          startWeek: "2026-08-03",
          weeks
        })
      });
      const planBody = await planRes.json();
      assert.equal(planRes.status, 200);

      // create pending adjustment (planner)
      const plannerLogin = await login(baseUrl, plannerUsername, plannerPassword);
      const adjRes = await fetch(`${baseUrl}/api/planning/plans/${planBody.id}/adjustments`, {
        method: "POST",
        headers: authHeaders(plannerLogin.token),
        body: JSON.stringify({
          reasonCode: "CAPACITY_CHANGE",
          before: { note: "before" },
          after: { planName: `APR-Plan-${suffix}-approved` }
        })
      });
      const adjBody = await adjRes.json();
      assert.equal(adjRes.status, 200);

      // approve (admin)
      const approveRes = await fetch(`${baseUrl}/api/planning/adjustments/${adjBody.id}/approve`, {
        method: "POST",
        headers: authHeaders(adminLogin.token)
      });
      const approveBody = await approveRes.json();
      assert.equal(approveRes.status, 200);
      assert.ok(approveBody.ok, "response must include ok: true");

      // verify DB
      const [[adjRow]] = await pool.execute(
        "SELECT status, approved_by FROM plan_adjustments WHERE id = ?",
        [adjBody.id]
      );
      assert.equal(adjRow.status, "APPROVED");
      assert.equal(Number(adjRow.approved_by), adminLogin.user.id);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 17. GET /api/hr/candidates/:id (masking) ─────────────────────────
  test("integration: GET /api/hr/candidates/:id — HR sees unmasked sensitive fields", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const suffix = Date.now();
      const candidateId = 700000 + (suffix % 100000);
      const dob = "1990-06-15";
      const ssn4 = "5678";

      // insert candidate with encrypted PII
      await pool.execute(
        `INSERT IGNORE INTO candidates (id, full_name, email, dob_enc, ssn_last4_enc, source)
         VALUES (?, ?, ?, ?, ?, 'PORTAL')`,
        [candidateId, `Cand-${suffix}`, `cand-${suffix}@test.local`, encryptString(dob), encryptString(ssn4)]
      );

      const hrLogin = await login(baseUrl, hrUsername, hrPassword);
      const res = await fetch(`${baseUrl}/api/hr/candidates/${candidateId}`, {
        headers: authHeaders(hrLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.fullName, `Cand-${suffix}`);
      // HR has SENSITIVE_DATA_VIEW → unmasked
      assert.equal(body.dob, dob);
      assert.equal(body.ssnLast4, ssn4);
      assert.ok("attachmentCompleteness" in body);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  test("integration: GET /api/hr/candidates/:id — interviewer sees masked fields when assigned", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const suffix = Date.now();
      const candidateId = 710000 + (suffix % 100000);
      const dob = "1985-03-20";
      const ssn4 = "1234";

      // insert candidate
      await pool.execute(
        `INSERT IGNORE INTO candidates (id, full_name, dob_enc, ssn_last4_enc, source)
         VALUES (?, ?, ?, ?, 'PORTAL')`,
        [candidateId, `MaskCand-${suffix}`, encryptString(dob), encryptString(ssn4)]
      );

      // get interviewer user id and assign them to this candidate
      const [[interviewer]] = await pool.execute(
        "SELECT id FROM users WHERE username = ?",
        [interviewerUsername]
      );
      await pool.execute(
        `INSERT IGNORE INTO interviewer_candidate_assignments (interviewer_user_id, candidate_id)
         VALUES (?, ?)`,
        [interviewer.id, candidateId]
      );

      const interviewerLogin = await login(baseUrl, interviewerUsername, interviewerPassword);
      const res = await fetch(`${baseUrl}/api/hr/candidates/${candidateId}`, {
        headers: authHeaders(interviewerLogin.token)
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.equal(body.fullName, `MaskCand-${suffix}`);
      // INTERVIEWER does NOT have SENSITIVE_DATA_VIEW → masked
      assert.notEqual(body.dob, dob, "dob should be masked for interviewer");
      assert.notEqual(body.ssnLast4, ssn4, "ssnLast4 should be masked for interviewer");
      assert.ok(body.dob.includes("*"), "masked dob should contain asterisks");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 18. GET /api/audit (real, non-mocked) ────────────────────────────
  test("integration: GET /api/audit — admin lists audit logs with sensitive masking", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const suffix = Date.now();
      const entityId = `audit-test-${suffix}`;

      // insert a known audit row with sensitive keys
      await pool.execute(
        `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, before_value, after_value)
         VALUES (NULL, 'UPDATE', 'candidate', ?, ?, ?)`,
        [
          entityId,
          JSON.stringify({ ssn: "999-88-7777", name: "AuditTest" }),
          JSON.stringify({ dob: "2000-01-01", name: "AuditTest" })
        ]
      );

      const adminLogin = await login(baseUrl, adminUsername, adminPassword);
      const res = await fetch(
        `${baseUrl}/api/audit?page=1&pageSize=100&entityType=candidate`,
        { headers: authHeaders(adminLogin.token) }
      );
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.total >= 1, "should have at least 1 audit row");
      assert.ok(Array.isArray(body.data));

      // find our row and verify masking based on admin's sensitiveDataView
      const row = body.data.find((r) => r.entityId === entityId);
      assert.ok(row, "inserted audit row must be present in results");
      assert.equal(row.action, "UPDATE");
      assert.equal(row.entityType, "candidate");
      // admin has sensitiveDataView=true → values should be unmasked
      assert.equal(row.beforeValue.name, "AuditTest");
      assert.equal(row.afterValue.name, "AuditTest");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 19. GET /api/notifications (real, non-mocked) ────────────────────
  test("integration: GET /api/notifications — user sees scoped notification inbox", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const hrLogin = await login(baseUrl, hrUsername, hrPassword);
      const suffix = Date.now();

      // insert a notification for this user
      await pool.execute(
        `INSERT INTO notifications (user_id, event_type, message, status, created_at)
         VALUES (?, 'TICKET_UPDATE', ?, 'PENDING', NOW())`,
        [hrLogin.user.id, `Test notification ${suffix}`]
      );

      const res = await fetch(
        `${baseUrl}/api/notifications?page=1&pageSize=50`,
        { headers: authHeaders(hrLogin.token) }
      );
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.total >= 1, "should have at least 1 notification");
      assert.ok(Array.isArray(body.data));
      assert.ok(body.data.length >= 1);

      // verify all rows belong to this user (non-admin scoping)
      for (const row of body.data) {
        assert.equal(Number(row.user_id), hrLogin.user.id, "all notifications must be scoped to the logged-in user");
      }

      // find our specific notification
      const ours = body.data.find((r) => r.message === `Test notification ${suffix}`);
      assert.ok(ours, "inserted notification must be present");
      assert.equal(ours.event_type, "TICKET_UPDATE");
      assert.equal(ours.status, "PENDING");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 20. GET /api/search (site-scoped, real integration) ──────────────
  test("integration: GET /api/search — clerk sees only own-site results", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const suffix = Date.now();
      // use a unique tag that will appear in the search_documents row
      const uniqueTag = `srchtag${suffix}`;

      // insert two search_documents rows directly with the unique tag
      // site-1 receipt (clerk should see)
      const site1ReceiptId = 990000 + (suffix % 10000);
      await pool.execute(
        `INSERT IGNORE INTO receipts (id, site_id, po_number, status, received_by)
         VALUES (?, 1, ?, 'OPEN', ?)`,
        [site1ReceiptId, `SRCH1-${suffix}`, clerkLogin.user.id]
      );
      await pool.execute(
        `INSERT INTO search_documents (entity_type, entity_id, title, body, tags, source, topic)
         VALUES ('receipt', ?, ?, ?, ?, 'RECEIVING', 'INBOUND')`,
        [String(site1ReceiptId), `${uniqueTag} site1 receipt`, `${uniqueTag} body`, uniqueTag]
      );

      // site-2 receipt (clerk must NOT see)
      const site2ReceiptId = 990000 + (suffix % 10000) + 1;
      await pool.execute(
        `INSERT IGNORE INTO receipts (id, site_id, po_number, status, received_by)
         VALUES (?, 2, ?, 'OPEN', ?)`,
        [site2ReceiptId, `SRCH2-${suffix}`, clerkLogin.user.id]
      );
      await pool.execute(
        `INSERT INTO search_documents (entity_type, entity_id, title, body, tags, source, topic)
         VALUES ('receipt', ?, ?, ?, ?, 'RECEIVING', 'INBOUND')`,
        [String(site2ReceiptId), `${uniqueTag} site2 receipt`, `${uniqueTag} body`, uniqueTag]
      );

      const res = await fetch(
        `${baseUrl}/api/search?q=${uniqueTag}&page=1&pageSize=50`,
        { headers: authHeaders(clerkLogin.token) }
      );
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body), "search should return an array");

      // site-2 receipt must not appear for clerk
      const site2Hit = body.find((r) => r.entity_id === String(site2ReceiptId));
      assert.ok(!site2Hit, "site-2 receipt must not appear for clerk");

      // site-1 receipt should be present
      const ours = body.find((r) => r.entity_id === String(site1ReceiptId));
      assert.ok(ours, "site-1 receipt search doc must be present");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 21. GET /api/search (auth boundary) ──────────────────────────────
  test("integration: GET /api/search — unauthenticated request is rejected", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const res = await fetch(`${baseUrl}/api/search?q=test`);
      assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 22. POST /api/hr/applications (real integration) ─────────────────
  test("integration: POST /api/hr/applications — candidate creates application", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const candidateLogin = await login(baseUrl, candidateUsername, candidatePassword);
      const suffix = Date.now();

      const res = await fetch(`${baseUrl}/api/hr/applications`, {
        method: "POST",
        headers: authHeaders(candidateLogin.token),
        body: JSON.stringify({
          fullName: `IntTest Candidate ${suffix}`,
          email: `inttest-${suffix}@example.local`,
          phone: "555-0100",
          dob: "1995-03-15",
          ssnLast4: "4321",
          source: "PORTAL",
          formData: [
            { fieldKey: "work_eligibility", fieldValue: "yes" },
            { fieldKey: "years_experience", fieldValue: "3" }
          ]
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(body.id, "response must contain candidate id");
      assert.equal(typeof body.duplicateFlag, "boolean");
      assert.ok("attachmentCompleteness" in body, "response must include attachmentCompleteness");
      assert.ok(body.uploadToken, "response must include uploadToken");
      assert.ok(Array.isArray(body.attachmentCompleteness.missingRequiredClasses));

      // verify DB
      const [[dbRow]] = await pool.execute(
        "SELECT full_name, source FROM candidates WHERE id = ?",
        [body.id]
      );
      assert.equal(dbRow.full_name, `IntTest Candidate ${suffix}`);
      assert.equal(dbRow.source, "PORTAL");

      // store for use by attachment test
      globalThis.__hrAppTestResult = { candidateId: body.id, uploadToken: body.uploadToken, baseUrl, token: candidateLogin.token, server };
    } catch (e) {
      await new Promise((r) => server.close(r));
      throw e;
    }
    // don't close server yet — attachment test uses it
    await new Promise((r) => server.close(r));
  });

  // ─── 23. POST /api/hr/applications/:id/attachments (real integration) ─
  test("integration: POST /api/hr/applications/:id/attachments — upload with token", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const candidateLogin = await login(baseUrl, candidateUsername, candidatePassword);
      const suffix = Date.now();

      // create a fresh application
      const appRes = await fetch(`${baseUrl}/api/hr/applications`, {
        method: "POST",
        headers: authHeaders(candidateLogin.token),
        body: JSON.stringify({
          fullName: `Attach Test ${suffix}`,
          email: `attach-${suffix}@example.local`,
          dob: "1992-07-20",
          ssnLast4: "8765",
          source: "PORTAL",
          formData: [
            { fieldKey: "work_eligibility", fieldValue: "yes" },
            { fieldKey: "years_experience", fieldValue: "5" }
          ]
        })
      });
      const appBody = await appRes.json();
      assert.equal(appRes.status, 200);
      assert.ok(appBody.uploadToken);

      // create a tiny valid PDF-like file for upload
      const tmpDir = path.join(__dirname, "..", "storage", "test_uploads");
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `resume-${suffix}.pdf`);
      // minimal PDF header
      await fs.writeFile(tmpFile, "%PDF-1.4 test content");

      // build multipart form
      const fileContent = await fs.readFile(tmpFile);
      const blob = new Blob([fileContent], { type: "application/pdf" });
      const form = new FormData();
      form.append("file", blob, `resume-${suffix}.pdf`);

      const uploadRes = await fetch(
        `${baseUrl}/api/hr/applications/${appBody.id}/attachments`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${candidateLogin.token}`,
            "x-candidate-upload-token": appBody.uploadToken
          },
          body: form
        }
      );
      const uploadBody = await uploadRes.json();
      assert.equal(uploadRes.status, 200);
      assert.ok(uploadBody.id, "response must contain attachment id");
      assert.ok("attachmentCompleteness" in uploadBody, "response must include completeness");

      // verify DB
      const [[attRow]] = await pool.execute(
        "SELECT candidate_id, classification, mime_type FROM candidate_attachments WHERE id = ?",
        [uploadBody.id]
      );
      assert.equal(Number(attRow.candidate_id), appBody.id);
      assert.equal(attRow.mime_type, "application/pdf");
      assert.equal(attRow.classification, "RESUME");

      // cleanup tmp
      await fs.unlink(tmpFile).catch(() => {});
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 24. POST + GET /api/receiving/receipts/:id/documents (real) ──────
  test("integration: POST + GET /api/receiving/receipts/:id/documents — upload and list", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const clerkLogin = await login(baseUrl, clerkUsername, clerkPassword);
      const suffix = Date.now();

      // create receipt
      const receiptRes = await fetch(`${baseUrl}/api/receiving/receipts`, {
        method: "POST",
        headers: authHeaders(clerkLogin.token),
        body: JSON.stringify({
          siteId: 1,
          poNumber: `DOC-PO-${suffix}`,
          lines: [{ poLineNo: "1", sku: "DOC-SKU", lotNo: "DOC-LOT", qtyExpected: 5, qtyReceived: 5, inspectionStatus: "PASS" }]
        })
      });
      const receiptBody = await receiptRes.json();
      assert.equal(receiptRes.status, 200);

      // create a tiny file
      const tmpDir = path.join(__dirname, "..", "storage", "test_uploads");
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpFile = path.join(tmpDir, `receipt-doc-${suffix}.pdf`);
      await fs.writeFile(tmpFile, "%PDF-1.4 receipt document content");

      const fileContent = await fs.readFile(tmpFile);
      const blob = new Blob([fileContent], { type: "application/pdf" });
      const form = new FormData();
      form.append("file", blob, `receipt-doc-${suffix}.pdf`);
      form.append("title", `Integration Doc ${suffix}`);
      form.append("poLineNo", "1");
      form.append("lotNo", "DOC-LOT");
      form.append("batchNo", `BATCH-${suffix}`);

      // upload document
      const uploadRes = await fetch(
        `${baseUrl}/api/receiving/receipts/${receiptBody.id}/documents`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${clerkLogin.token}` },
          body: form
        }
      );
      const uploadBody = await uploadRes.json();
      assert.equal(uploadRes.status, 200);
      assert.ok(uploadBody.id, "upload response must contain document id");

      // list documents
      const listRes = await fetch(
        `${baseUrl}/api/receiving/receipts/${receiptBody.id}/documents`,
        { headers: authHeaders(clerkLogin.token) }
      );
      const listBody = await listRes.json();
      assert.equal(listRes.status, 200);
      assert.ok(Array.isArray(listBody), "list should return an array");
      assert.ok(listBody.length >= 1, "should have at least 1 document");

      const doc = listBody.find((d) => d.id === uploadBody.id);
      assert.ok(doc, "uploaded document must appear in listing");
      assert.equal(doc.title, `Integration Doc ${suffix}`);
      assert.equal(doc.lotNo, "DOC-LOT");
      assert.equal(doc.batchNo, `BATCH-${suffix}`);
      assert.equal(doc.mimeType, "application/pdf");

      // cleanup tmp
      await fs.unlink(tmpFile).catch(() => {});
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  // ─── 25. POST /api/receiving/receipts/:id/documents (auth failure) ────
  test("integration: POST /api/receiving/receipts/:id/documents — unauthenticated is rejected", async () => {
    const { server, baseUrl } = await startServer();
    try {
      const form = new FormData();
      form.append("file", new Blob(["test"], { type: "application/pdf" }), "test.pdf");
      const res = await fetch(`${baseUrl}/api/receiving/receipts/1/documents`, {
        method: "POST",
        body: form
      });
      assert.ok([401, 403].includes(res.status), `expected 401/403, got ${res.status}`);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

}
