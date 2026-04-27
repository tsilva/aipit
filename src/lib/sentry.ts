import type { ErrorEvent, EventHint } from "@sentry/nextjs";
import {
  hasTelemetryPermission,
  hasTelemetryPermissionForHeaders,
  readTelemetryConsent,
  readTelemetryConsentRequirement,
} from "@/lib/telemetry-consent";
import type { SentryRuntime } from "./sentry-build";
import { isSentryRuntimeEnabled, resolveSentryDsn, resolveSentryEnvironment } from "./sentry-build";

export type { SentryRuntime } from "./sentry-build";
export {
  getSentryConnectOrigins,
  hasSentryBuildUploadConfig,
  isSentryRuntimeEnabled,
  resolveSentryBuildConfig,
  resolveSentryClientBuildEnv,
  resolveSentryDsn,
  resolveSentryEnvironment,
  validateSentryProductionConfig,
} from "./sentry-build";

type SentryRuntimeConfig = {
  dsn?: string;
  enabled: boolean;
  environment: string;
  beforeSend: (event: ErrorEvent, hint: EventHint) => ErrorEvent | null;
  tracesSampleRate: number;
};

const SENTRY_TRACES_SAMPLE_RATE = 0.1;
const SENSITIVE_FIELD_PATTERN = /(api[-_ ]?key|authorization|bearer|cookie|token|secret|password|credential)/i;

type SentryEvent = ErrorEvent & {
  request?: ErrorEvent["request"] & {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  };
  extra?: Record<string, unknown>;
};

type SentryHeaderSource =
  | {
      get(name: string): string | null;
    }
  | Record<string, string | string[] | undefined>
  | undefined;

export function resolveSentryRuntimeConfig(
  runtime: SentryRuntime,
  source: Record<string, string | undefined> = process.env,
): SentryRuntimeConfig {
  const dsn = resolveSentryDsn(runtime, source);

  return {
    dsn,
    enabled: Boolean(dsn) && isSentryRuntimeEnabled(source),
    environment: resolveSentryEnvironment(source),
    beforeSend: (event) => beforeSendSentryEvent(runtime, event),
    tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE,
  };
}

function sanitizeUnknown(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeUnknown(entry, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      SENSITIVE_FIELD_PATTERN.test(key) ? "[Filtered]" : sanitizeUnknown(entry, depth + 1),
    ]),
  );
}

export function sanitizeSentryEvent(event: SentryEvent): SentryEvent {
  const sanitized = sanitizeUnknown(event) as SentryEvent;

  if (sanitized.request) {
    delete sanitized.request.cookies;

    if (sanitized.request.headers) {
      sanitized.request.headers = Object.fromEntries(
        Object.entries(sanitized.request.headers).filter(([key]) => !SENSITIVE_FIELD_PATTERN.test(key)),
      );
    }
  }

  return sanitized;
}

export function shouldCaptureSentryClientEvent(): boolean {
  return hasTelemetryPermission({
    consent: readTelemetryConsent("errorReporting"),
    requireConsent: readTelemetryConsentRequirement(),
  });
}

export function shouldCaptureSentryForRequestHeaders(headers: SentryHeaderSource): boolean {
  return hasTelemetryPermissionForHeaders("errorReporting", headers);
}

export function beforeSendSentryEvent(runtime: SentryRuntime, event: ErrorEvent): ErrorEvent | null {
  if (runtime === "client" && !shouldCaptureSentryClientEvent()) {
    return null;
  }

  return sanitizeSentryEvent(event);
}
