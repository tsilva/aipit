import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Sentry environment in the Next.js client build", () => {
  async function buildEnvironment(vercelEnv: string, sentryEnvironment = "") {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", vercelEnv);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://aipit.tsilva.eu");
    vi.stubEnv("SENTRY_ENVIRONMENT", sentryEnvironment);
    vi.stubEnv("SENTRY_AUTH_TOKEN", "");
    const { default: config } = await import("../../next.config");
    return config.env?.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
  }

  it("labels production browser events as production", async () => {
    expect(await buildEnvironment("production")).toBe("production");
  });

  it("retains the preview deployment label in a production-mode build", async () => {
    expect(await buildEnvironment("preview")).toBe("preview");
  });

  it("respects an explicit Sentry environment", async () => {
    expect(await buildEnvironment("production", "custom-production")).toBe("custom-production");
  });
});
