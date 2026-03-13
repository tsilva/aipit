import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    trace: "on-first-retry",
  },
  webServer: {
    command:
      "NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000 NEXT_PUBLIC_GA_MEASUREMENT_ID=G-TEST123 OPENROUTER_API_KEY=test-server-key npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
