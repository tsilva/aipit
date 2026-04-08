import { describe, expect, it } from "vitest";
import {
  getSentryConnectOrigins,
  hasSentryBuildUploadConfig,
  isSentryRuntimeEnabled,
  resolveSentryDsn,
  resolveSentryRuntimeConfig,
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
  it("requires the auth token, org, and project to enable upload", () => {
    expect(
      hasSentryBuildUploadConfig({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "org",
        SENTRY_PROJECT: "project",
      }),
    ).toBe(true);

    expect(
      hasSentryBuildUploadConfig({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_ORG: "org",
      }),
    ).toBe(false);
  });
});
