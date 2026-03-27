import Router from "koa-router";
import {
  enforceAttributeRule,
  requireAuth,
  requirePermission,
  optionalAuth
} from "../middleware/auth.js";
import { pool } from "../db.js";
import {
  attachCandidateFile,
  createCandidateApplication,
  getCandidate
} from "../services/hr-service.js";

const router = new Router({ prefix: "/api/hr" });

router.get("/forms/application", async (ctx) => {
  const [rows] = await pool.execute(
    `SELECT field_key, label, field_type, is_required
     FROM application_form_fields
     ORDER BY sort_order ASC, id ASC`
  );
  ctx.body = rows;
});

router.post("/applications", optionalAuth, async (ctx) => {
  ctx.body = await createCandidateApplication(ctx.request.body, ctx.state.user || null);
});

router.post("/applications/:id/attachments", optionalAuth, async (ctx) => {
  const file = ctx.request.files?.file;
  ctx.body = await attachCandidateFile(ctx.params.id, file, ctx.state.user || null);
});

router.get(
  "/candidates/:id",
  requireAuth,
  requirePermission("CANDIDATE_READ"),
  enforceAttributeRule(async (user, ctx) => {
    if (user.role !== "INTERVIEWER") return true;
    const [rows] = await pool.execute(
      "SELECT 1 FROM interviewer_candidate_assignments WHERE interviewer_user_id = ? AND candidate_id = ? LIMIT 1",
      [user.id, ctx.params.id]
    );
    return rows.length > 0;
  }),
  async (ctx) => {
    ctx.body = await getCandidate(ctx.params.id, ctx.state.user);
  }
);

export default router;
