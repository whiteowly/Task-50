import { defineStore } from "pinia";
import { apiRequest, setSessionToken } from "../api.js";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: null,
    user: null,
    loading: false,
    error: null
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user || state.token),
    role: (state) => state.user?.role || ""
  },
  actions: {
    async login(username, password) {
      this.loading = true;
      this.error = null;
      try {
        const payload = await apiRequest("/auth/login", {
          method: "POST",
          body: JSON.stringify({ username, password })
        });
        this.token = payload.token || "session";
        setSessionToken(payload.token || null);
        this.user = payload.user;
      } catch (err) {
        this.error = err.message;
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async bootstrap() {
      try {
        const payload = await apiRequest("/auth/me");
        this.token = this.token || "session";
        this.user = payload.user;
      } catch {
        this.logout();
      }
    },
    async logout() {
      try {
        await apiRequest("/auth/logout", { method: "POST" });
      } catch {
        // ignore network errors on logout
      }
      this.token = null;
      setSessionToken(null);
      this.user = null;
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem("forgeops_token");
      }
    }
  }
});
