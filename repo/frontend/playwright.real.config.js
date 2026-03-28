import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  grep: /@real-backend/,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    env: {
      ...process.env,
      VITE_API_BASE_URL: "/api"
    },
    timeout: 60_000
  }
});
