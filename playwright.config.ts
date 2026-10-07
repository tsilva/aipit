import { defineConfig } from "@playwright/test";

const webServer = process.env.PLAYWRIGHT_BASE_URL
  ? undefined
  : {
      // Browser tests use fixture credentials, never the saved Infisical login.
      command: "node scripts/dev-server.mjs next dev --hostname 127.0.0.1 --port auto",
      env: {
        NEXT_PUBLIC_SITE_URL: "",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-TEST123",
        OPENROUTER_API_KEY: "test-server-key",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        SENTRY_AUTH_TOKEN: "",
        SENTRY_SMOKE_TEST_TOKEN: "",
        BWS_ACCESS_TOKEN: "",
        INFISICAL_TOKEN: "",
        INFISICAL_CLIENT_SECRET: "",
        INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET: "",
        INFISICAL_UNIVERSAL_AUTH_ACCESS_TOKEN: "",
        SENTRY_DSN: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
      },
      wait: { stdout: new RegExp("(?<aipit_e2e_url>http://127[.]0[.]0[.]1:[0-9]+)") },
      stdout: "pipe" as const,
      reuseExistingServer: false,
      timeout: 120_000,
    };

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL,
    browserName: "chromium",
    trace: "on-first-retry",
  },
  webServer,
});
