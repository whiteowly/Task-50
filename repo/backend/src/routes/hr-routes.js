import Router from "koa-router";
import {
  enforceAttributeRule,
  requireAuth,
  requirePermission,
  requireRoles
} from "../middleware/auth.js";
import { pool } from "../db.js";
import { AppError } from "../utils/errors.js";
import {
  attachCandidateFile,
  canActorAttachToCandidate,
  consumeCandidateUploadToken,
  createCandidateApplication,
  getCandidate,
  verifyCandidateUploadToken
} from "../services/hr-service.js";

const router = new Router({ prefix: "/api/hr" });

router.get("/forms/application", requireAuth, async (ctx) => {
  const [rows] = await pool.execute(
    `SELECT field_key, label, field_type, is_required
     FROM application_form_fields
     ORDER BY sort_order ASC, id ASC`
  );
  ctx.body = rows;
});

router.post("/applications", requireAuth, requireRoles(["HR", "ADMIN", "CANDIDATE"]), async (ctx) => {
  ctx.body = await createCandidateApplication(ctx.request.body, ctx.state.user);
});

router.post("/applications/:id/attachments", requireAuth, requireRoles(["HR", "ADMIN", "CANDIDATE"]), async (ctx) => {
  const file = ctx.request.files?.file;
  const actor = ctx.state.user;

  const candidateId = ctx.params.id;
  const uploadToken = ctx.headers["x-candidate-upload-token"];
  const tokenAuthorized = await verifyCandidateUploadToken(uploadToken, candidateId);
  const consumedToken = tokenAuthorized ? await consumeCandidateUploadToken(uploadToken, candidateId) : null;
  const actorAuthorized = await canActorAttachToCandidate(candidateId, actor);

  if ((!tokenAuthorized || !consumedToken) && !actorAuthorized) {
    throw new AppError(403, "Attachment upload requires authorized user or valid candidate upload token");
  }

  ctx.body = await attachCandidateFile(candidateId, file, actor);
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
