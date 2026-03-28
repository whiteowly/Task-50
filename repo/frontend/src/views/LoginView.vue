<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth.js";

const username = ref("");
const password = ref("");
const error = ref("");
const auth = useAuthStore();
const router = useRouter();

async function submit() {
  error.value = "";
  if (password.value.length < 12) {
    error.value = "Password must be at least 12 characters.";
    return;
  }
  try {
    await auth.login(username.value, password.value);
    await router.push("/");
  } catch (err) {
    error.value = err.message;
  }
}
</script>

<template>
  <main class="auth-shell">
    <section class="auth-card">
      <h1>ForgeOps Hub</h1>
      <p>Sign in to your role-specific workspace</p>
      <form @submit.prevent="submit" class="form-grid">
        <label>
          Username
          <input v-model="username" autocomplete="username" required />
        </label>
        <label>
          Password
          <input v-model="password" type="password" autocomplete="current-password" required />
        </label>
        <p v-if="error" class="error">{{ error }}</p>
        <button :disabled="auth.loading" type="submit">{{ auth.loading ? "Signing in..." : "Sign in" }}</button>
      </form>
    </section>
  </main>
</template>
