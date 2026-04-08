import { describe, expect, it } from "vitest";
import {
  getSentryConnectOrigins,
  hasSentryBuildUploadConfig,
  isSentryRuntimeEnabled,
  resolveSentryBuildConfig,
  resolveSentryDsn,
  resolveSentryRuntimeConfig,
  validateSentryProductionConfig,
} from "@/lib/sentry";

describe("resolveSentryDsn", () => {
  it("uses the public DSN for the browser runtime", () => {
    expect(
      resolveSentryDsn("client", {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
      }),
    ).toBe("https://public@example.ingest.sentry.io/123");
  });

  it("prefers the server DSN for edge and node runtimes", () => {
    const source = {
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
    };

    expect(resolveSentryDsn("server", source)).toBe("https://server@example.ingest.sentry.io/456");
    expect(resolveSentryDsn("edge", source)).toBe("https://server@example.ingest.sentry.io/456");
  });

  it("falls back to the public DSN for edge when the server DSN is missing", () => {
    expect(
      resolveSentryDsn("edge", {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      }),
    ).toBe("https://public@example.ingest.sentry.io/123");
  });

  it("falls back to the server DSN for the browser runtime when the public DSN is missing", () => {
    expect(
      resolveSentryDsn("client", {
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
      }),
    ).toBe("https://server@example.ingest.sentry.io/456");
  });

  it("falls back to the public DSN for the server runtime when the server DSN is missing", () => {
    expect(
      resolveSentryDsn("server", {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
      }),
    ).toBe("https://public@example.ingest.sentry.io/123");
  });
});

describe("isSentryRuntimeEnabled", () => {
  it("enables Sentry by default for production runtimes", () => {
    expect(
      isSentryRuntimeEnabled({
        NODE_ENV: "production",
      }),
    ).toBe(true);
  });

  it("disables Sentry by default for preview deployments", () => {
    expect(
      isSentryRuntimeEnabled({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(false);
  });

  it("accepts an explicit public override for non-production runtimes", () => {
    expect(
      isSentryRuntimeEnabled({
        NEXT_PUBLIC_SENTRY_ENABLED: "true",
        NODE_ENV: "development",
      }),
    ).toBe(true);
  });
});

describe("resolveSentryRuntimeConfig", () => {
  it("keeps a runtime disabled when the DSN is missing", () => {
    expect(
      resolveSentryRuntimeConfig("client", {
        NODE_ENV: "production",
      }),
    ).toMatchObject({
      dsn: undefined,
      enabled: false,
      environment: "production",
      tracesSampleRate: 0.1,
    });
  });
});

describe("getSentryConnectOrigins", () => {
  it("returns unique DSN origins and ignores malformed values", () => {
    expect(
      getSentryConnectOrigins({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        SENTRY_DSN: "not-a-valid-url",
      }),
    ).toEqual(["https://example.ingest.sentry.io"]);
  });
});

describe("hasSentryBuildUploadConfig", () => {
  it("uses the repo defaults for org and project when the token is present", () => {
    expect(
      hasSentryBuildUploadConfig({
        SENTRY_AUTH_TOKEN: "token",
      }),
    ).toBe(true);
  });

  it("treats the placeholder token as missing", () => {
    expect(
      hasSentryBuildUploadConfig({
        SENTRY_AUTH_TOKEN: "sntrys_your_token_here",
      }),
    ).toBe(false);
  });
});

describe("resolveSentryBuildConfig", () => {
  it("falls back to the repo defaults", () => {
    expect(resolveSentryBuildConfig({})).toEqual({
      authToken: undefined,
      org: "tsilva",
      project: "aipit",
      sentryUrl: "https://sentry.io",
    });
  });

  it("accepts SENTRY_BASE_URL ahead of SENTRY_URL", () => {
    expect(
      resolveSentryBuildConfig({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_BASE_URL: "https://self-hosted.example.com",
        SENTRY_URL: "https://ignored.example.com",
      }),
    ).toEqual({
      authToken: "token",
      org: "tsilva",
      project: "aipit",
      sentryUrl: "https://self-hosted.example.com",
    });
  });
});

describe("validateSentryProductionConfig", () => {
  it("accepts a production config when only the server DSN is set", () => {
    expect(
      validateSentryProductionConfig({
        NODE_ENV: "production",
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
      }).errors,
    ).toEqual([]);
  });

  it("requires at least one runtime DSN when source map upload is enabled", () => {
    expect(
      validateSentryProductionConfig({
        NODE_ENV: "production",
        SENTRY_AUTH_TOKEN: "token",
      }).errors,
    ).toEqual([
      "Production source map upload is configured, but no runtime Sentry DSN is available. Set NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN.",
    ]);
  });
});
