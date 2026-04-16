import { defineConfig } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_PORT ?? "3107";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      command: `NEXT_PUBLIC_SITE_URL=${baseURL} NEXT_PUBLIC_GA_MEASUREMENT_ID=G-TEST123 OPENROUTER_API_KEY=test-server-key npm run dev -- --hostname 127.0.0.1 --port ${e2ePort}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    browserName: "chromium",
    trace: "on-first-retry",
  },
  webServer,
});
