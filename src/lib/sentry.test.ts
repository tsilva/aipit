import { describe, expect, it } from "vitest";
import {
  sanitizeSentryEvent,
  getSentryConnectOrigins,
  hasSentryBuildUploadConfig,
  isSentryRuntimeEnabled,
  resolveSentryBuildConfig,
  resolveSentryClientBuildEnv,
  resolveSentryDsn,
  resolveSentryRuntimeConfig,
  shouldCaptureSentryForRequestHeaders,
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
      tracesSampleRate: undefined,
    });
  });

  it("keeps Sentry performance tracing disabled unless it gets its own consent gate", () => {
    expect(
      resolveSentryRuntimeConfig("client", {
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        NEXT_PUBLIC_SENTRY_ENABLED: "true",
        NODE_ENV: "development",
      }).tracesSampleRate,
    ).toBeUndefined();
    expect(
      resolveSentryRuntimeConfig("server", {
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
        NODE_ENV: "production",
      }).tracesSampleRate,
    ).toBeUndefined();
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

describe("resolveSentryClientBuildEnv", () => {
  it("publishes the explicit public DSN for the client build", () => {
    expect(
      resolveSentryClientBuildEnv({
        NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
        VERCEL_ENV: "production",
      }),
    ).toEqual({
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@example.ingest.sentry.io/123",
    });
  });

  it("publishes the server DSN when the public DSN is omitted", () => {
    expect(
      resolveSentryClientBuildEnv({
        SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
        VERCEL_ENV: "preview",
      }),
    ).toEqual({
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "preview",
      NEXT_PUBLIC_SENTRY_DSN: "https://server@example.ingest.sentry.io/456",
    });
  });

  it("leaves the client build env empty when no DSN is configured", () => {
    expect(resolveSentryClientBuildEnv({ NODE_ENV: "development" })).toEqual({
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "development",
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

describe("Sentry privacy controls", () => {
  it("suppresses request-scoped captures when error reporting is denied", () => {
    expect(
      shouldCaptureSentryForRequestHeaders({
        cookie: "aipit-error-reporting-consent=denied; aipit-country=US",
      }),
    ).toBe(false);
  });

  it("allows request-scoped captures by default outside the EU", () => {
    expect(shouldCaptureSentryForRequestHeaders({ "x-vercel-ip-country": "US" })).toBe(true);
  });

  it("requires request-scoped consent in EU or unknown regions", () => {
    expect(shouldCaptureSentryForRequestHeaders({ "x-vercel-ip-country": "PT" })).toBe(false);
    expect(shouldCaptureSentryForRequestHeaders({})).toBe(false);
  });

  it("filters sensitive request and extra fields before sending", () => {
    const sanitized = sanitizeSentryEvent({
      type: undefined,
      request: {
        cookies: { session: "secret" },
        headers: {
          authorization: "Bearer token",
          cookie: "session=secret",
          "user-agent": "test",
        },
      },
      extra: {
        apiKey: "sk-or-v1-secret",
        safeField: "ok",
        nested: {
          secretToken: "secret",
        },
      },
    });

    expect(sanitized.request?.cookies).toBeUndefined();
    expect(sanitized.request?.headers).toEqual({ "user-agent": "test" });
    expect(sanitized.extra).toEqual({
      apiKey: "[Filtered]",
      safeField: "ok",
      nested: {
        secretToken: "[Filtered]",
      },
    });
  });
});
