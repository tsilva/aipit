import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig, shouldCaptureSentryClientEvent } from "./src/lib/sentry";
import { TELEMETRY_CONSENT_CHANGE_EVENT } from "./src/lib/telemetry-consent";

const sentryConfig = resolveSentryRuntimeConfig("client", {
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
  NODE_ENV: process.env.NODE_ENV,
  SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});

declare global {
  interface Window {
    __sentryTest?: () => string;
  }
}

let hasInitializedSentry = false;

function initializeSentryIfAllowed() {
  if (hasInitializedSentry || !sentryConfig.enabled || !shouldCaptureSentryClientEvent()) {
    return;
  }

  Sentry.init({
    ...sentryConfig,
  });
  hasInitializedSentry = true;
}

initializeSentryIfAllowed();

if (typeof window !== "undefined") {
  window.addEventListener(TELEMETRY_CONSENT_CHANGE_EVENT, initializeSentryIfAllowed);

  window.__sentryTest = () => {
    if (!sentryConfig.enabled) {
      if (!sentryConfig.dsn) {
        return "Sentry client capture is disabled because NEXT_PUBLIC_SENTRY_DSN is not set for this deployment.";
      }

      return "Sentry client capture is disabled. Set NEXT_PUBLIC_SENTRY_ENABLED=true to test outside production.";
    }

    if (!shouldCaptureSentryClientEvent()) {
      return "Sentry client capture is disabled by privacy preferences.";
    }

    initializeSentryIfAllowed();

    const error = new Error("Sentry test exception from window.__sentryTest()");

    return Sentry.captureException(error, {
      tags: {
        source: "window.__sentryTest",
      },
    });
  };
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
