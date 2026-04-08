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

type SentryConfigValidation = {
  errors: string[];
};

const SENTRY_ENABLE_VALUES = new Set(["1", "true", "yes", "on"]);
const SENTRY_TRACES_SAMPLE_RATE = 0.1;
const SENTRY_AUTH_TOKEN_PLACEHOLDER = "sntrys_your_token_here";
const DEFAULT_SENTRY_ORG = "tsilva";
const DEFAULT_SENTRY_PROJECT = "aipit";
const DEFAULT_SENTRY_BASE_URL = "https://sentry.io";

function normalizeOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeSentryAuthToken(value: string | undefined): string | undefined {
  const normalized = normalizeOptional(value);

  if (!normalized || normalized === SENTRY_AUTH_TOKEN_PLACEHOLDER) {
    return undefined;
  }

  return normalized;
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
  const sharedDsn = publicDsn ?? serverDsn;

  switch (runtime) {
    case "client":
      return sharedDsn;
    case "server":
      return serverDsn ?? publicDsn;
    case "edge":
      return serverDsn ?? sharedDsn;
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
    authToken: normalizeSentryAuthToken(source.SENTRY_AUTH_TOKEN),
    org: normalizeOptional(source.SENTRY_ORG) ?? DEFAULT_SENTRY_ORG,
    project: normalizeOptional(source.SENTRY_PROJECT) ?? DEFAULT_SENTRY_PROJECT,
    sentryUrl: normalizeOptional(source.SENTRY_BASE_URL) ?? normalizeOptional(source.SENTRY_URL) ?? DEFAULT_SENTRY_BASE_URL,
  };
}

export function resolveSentryClientBuildEnv(
  source: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const dsn = resolveSentryDsn("client", source);
  const environment = resolveSentryEnvironment(source);
  const buildEnv: Record<string, string> = {
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: environment,
  };

  if (dsn) {
    buildEnv.NEXT_PUBLIC_SENTRY_DSN = dsn;
  }

  return buildEnv;
}

export function hasSentryBuildUploadConfig(source: Record<string, string | undefined> = process.env): boolean {
  const buildConfig = resolveSentryBuildConfig(source);

  return Boolean(buildConfig.authToken && buildConfig.org && buildConfig.project);
}

export function validateSentryProductionConfig(
  source: Record<string, string | undefined> = process.env,
): SentryConfigValidation {
  const errors: string[] = [];
  const isProductionRuntime = resolveSentryEnvironment(source) === "production";
  const hasRuntimeDsn = Boolean(resolveSentryDsn("client", source) || resolveSentryDsn("server", source));
  const hasBuildUpload = hasSentryBuildUploadConfig(source);

  if (!isProductionRuntime) {
    return { errors };
  }

  if (hasBuildUpload && !hasRuntimeDsn) {
    errors.push(
      "Production source map upload is configured, but no runtime Sentry DSN is available. Set NEXT_PUBLIC_SENTRY_DSN or SENTRY_DSN.",
    );
  }

  return { errors };
}
