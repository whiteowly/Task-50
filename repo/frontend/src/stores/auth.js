import { defineStore } from "pinia";
import { apiRequest } from "../api.js";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    token: localStorage.getItem("forgeops_token"),
    user: null,
    loading: false,
    error: null
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.token),
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
        this.token = payload.token;
        this.user = payload.user;
        localStorage.setItem("forgeops_token", payload.token);
      } catch (err) {
        this.error = err.message;
        throw err;
      } finally {
        this.loading = false;
      }
    },
    async bootstrap() {
      if (!this.token) return;
      try {
        const payload = await apiRequest("/auth/me");
        this.user = payload.user;
      } catch {
        this.logout();
      }
    },
    async logout() {
      try {
        if (this.token) {
          await apiRequest("/auth/logout", { method: "POST" });
        }
      } catch {
        // ignore network errors on logout
      }
      this.token = null;
      this.user = null;
      localStorage.removeItem("forgeops_token");
    }
  }
});
