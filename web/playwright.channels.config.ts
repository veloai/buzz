import { defineConfig, devices } from "@playwright/test";

// Keep checks away from web/dist: the running relay serves it directly.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "channels.spec.ts",
  timeout: 30_000,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4176",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --port 4176 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4176",
    reuseExistingServer: false,
  },
});
