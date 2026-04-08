export type SentryRuntime = "client" | "server" | "edge";

type SentryRuntimeConfig = {
  dsn?: string;
  enabled: boolean;
  environment: string;
  tracesSampleRate: number;
};

type SentryBuildConfig = {
  authToken?: string;
  org?: string;
  project?: string;
  sentryUrl?: string;
};

const SENTRY_ENABLE_VALUES = new Set(["1", "true", "yes", "on"]);
const SENTRY_TRACES_SAMPLE_RATE = 0.1;

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isSentryDevOverrideEnabled(source: Record<string, string | undefined>): boolean {
  const rawValue = normalizeOptional(source.NEXT_PUBLIC_SENTRY_ENABLED);

  if (!rawValue) {
    return false;
  }

  return SENTRY_ENABLE_VALUES.has(rawValue.toLowerCase());
}

export function resolveSentryEnvironment(source: Record<string, string | undefined> = process.env): string {
  return (
    normalizeOptional(source.SENTRY_ENVIRONMENT) ??
    normalizeOptional(source.VERCEL_ENV) ??
    normalizeOptional(source.NODE_ENV) ??
    "development"
  );
}

export function isSentryRuntimeEnabled(source: Record<string, string | undefined> = process.env): boolean {
  const vercelEnv = normalizeOptional(source.VERCEL_ENV);
  const nodeEnv = normalizeOptional(source.NODE_ENV) ?? "development";
  const isProductionRuntime = vercelEnv ? vercelEnv === "production" : nodeEnv === "production";

  return isProductionRuntime || isSentryDevOverrideEnabled(source);
}

export function resolveSentryDsn(
  runtime: SentryRuntime,
  source: Record<string, string | undefined> = process.env,
): string | undefined {
  const publicDsn = normalizeOptional(source.NEXT_PUBLIC_SENTRY_DSN);
  const serverDsn = normalizeOptional(source.SENTRY_DSN);

  switch (runtime) {
    case "client":
      return publicDsn;
    case "server":
      return serverDsn;
    case "edge":
      return serverDsn ?? publicDsn;
  }
}

export function resolveSentryRuntimeConfig(
  runtime: SentryRuntime,
  source: Record<string, string | undefined> = process.env,
): SentryRuntimeConfig {
  const dsn = resolveSentryDsn(runtime, source);

  return {
    dsn,
    enabled: Boolean(dsn) && isSentryRuntimeEnabled(source),
    environment: resolveSentryEnvironment(source),
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  };
}

export function getSentryConnectOrigins(source: Record<string, string | undefined> = process.env): string[] {
  const origins = new Set<string>();

  for (const dsn of [
    resolveSentryDsn("client", source),
    resolveSentryDsn("server", source),
    resolveSentryDsn("edge", source),
  ]) {
    if (!dsn) {
      continue;
    }

    try {
      origins.add(new URL(dsn).origin);
    } catch {
      // Ignore malformed DSNs and keep the rest of the policy intact.
    }
  }

  return Array.from(origins);
}

export function resolveSentryBuildConfig(
  source: Record<string, string | undefined> = process.env,
): SentryBuildConfig {
  return {
    authToken: normalizeOptional(source.SENTRY_AUTH_TOKEN),
    org: normalizeOptional(source.SENTRY_ORG),
    project: normalizeOptional(source.SENTRY_PROJECT),
    sentryUrl: normalizeOptional(source.SENTRY_URL),
  };
}

export function hasSentryBuildUploadConfig(source: Record<string, string | undefined> = process.env): boolean {
  const buildConfig = resolveSentryBuildConfig(source);

  return Boolean(buildConfig.authToken && buildConfig.org && buildConfig.project);
}
