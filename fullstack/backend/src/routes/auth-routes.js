import Router from "koa-router";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { createUser, login, logout } from "../services/auth-service.js";

const router = new Router({ prefix: "/api/auth" });

router.post("/login", async (ctx) => {
  const { username, password } = ctx.request.body;
  ctx.body = await login(username, password);
});

router.post("/logout", requireAuth, async (ctx) => {
  await logout(ctx.state.user.sessionId, ctx.state.user.id);
  ctx.body = { ok: true };
});

router.post("/users", requireAuth, requireRoles(["ADMIN"]), async (ctx) => {
  ctx.body = await createUser(ctx.request.body, ctx.state.user.id);
});

router.get("/me", requireAuth, async (ctx) => {
  ctx.body = { user: ctx.state.user };
});

export default router;
