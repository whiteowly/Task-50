import { beforeEach, test, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { mount } from "@vue/test-utils";
import router from "../src/router.js";
import LoginView from "../src/views/LoginView.vue";
import { useAuthStore } from "../src/stores/auth.js";
import { setSessionToken } from "../src/api.js";

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await router.replace("/login");
});

test("shows password policy validation message for short password", async () => {
  const wrapper = mount(LoginView, {
    global: {
      plugins: [createPinia(), router]
    }
  });

  await wrapper.find('input[autocomplete="username"]').setValue("hr1");
  await wrapper.find('input[autocomplete="current-password"]').setValue("short");
  await wrapper.find("form").trigger("submit.prevent");

  expect(wrapper.text()).toContain("Password must be at least 12 characters.");
});

test("submits login and routes to workspace", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  const loginSpy = vi.spyOn(auth, "login").mockResolvedValue(undefined);
  const pushSpy = vi.spyOn(router, "push").mockResolvedValue(undefined);

  const wrapper = mount(LoginView, {
    global: {
      plugins: [pinia, router]
    }
  });

  await wrapper.find('input[autocomplete="username"]').setValue("admin");
  await wrapper.find('input[autocomplete="current-password"]').setValue("LongPassword123");
  await wrapper.find("form").trigger("submit.prevent");

  expect(loginSpy).toHaveBeenCalledWith("admin", "LongPassword123");
  expect(pushSpy).toHaveBeenCalledWith("/");
});

test("logout clears in-memory auth and local storage artifacts", async () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  const token = "legacy-token";
  auth.token = token;
  auth.user = { id: 1, username: "admin", role: "ADMIN" };
  localStorage.setItem("forgeops_token", token);
  setSessionToken(token);

  await auth.logout();

  expect(auth.token).toBe(null);
  expect(auth.user).toBe(null);
  expect(localStorage.getItem("forgeops_token")).toBe(null);
});

test("auth store does not hydrate token from localStorage by default", () => {
  localStorage.setItem("forgeops_token", "persisted-token");
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  expect(auth.token).toBe(null);
});
