import Router from "koa-router";
import { requireAuth, requirePermission } from "../middleware/auth.js";
import { listAuditLogs } from "../services/audit-query-service.js";

const router = new Router({ prefix: "/api/audit" });

router.get("/", requireAuth, requirePermission("AUDIT_READ"), async (ctx) => {
  ctx.body = await listAuditLogs(ctx.state.user, ctx.query);
});

export default router;
