import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "./stores/auth.js";
import LoginView from "./views/LoginView.vue";
import WorkspaceView from "./views/WorkspaceView.vue";

const routes = [
  { path: "/login", name: "login", component: LoginView },
  { path: "/", name: "workspace", component: WorkspaceView, meta: { auth: true } }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.user && auth.token) {
    await auth.bootstrap();
  }
  if (to.meta.auth && !auth.isAuthenticated) {
    return "/login";
  }
  if (to.path === "/login" && auth.isAuthenticated) {
    return "/";
  }
  return true;
});

export default router;
