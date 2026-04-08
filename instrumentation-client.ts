import * as Sentry from "@sentry/nextjs";
import { resolveSentryRuntimeConfig } from "./src/lib/sentry";

const sentryConfig = resolveSentryRuntimeConfig("client");

declare global {
  interface Window {
    __sentryTest?: () => string;
  }
}

Sentry.init({
  ...sentryConfig,
});

if (typeof window !== "undefined") {
  window.__sentryTest = () => {
    if (!sentryConfig.enabled) {
      if (!sentryConfig.dsn) {
        return "Sentry client capture is disabled because NEXT_PUBLIC_SENTRY_DSN is not set for this deployment.";
      }

      return "Sentry client capture is disabled. Set NEXT_PUBLIC_SENTRY_ENABLED=true to test outside production.";
    }

    const error = new Error("Sentry test exception from window.__sentryTest()");

    return Sentry.captureException(error, {
      tags: {
        source: "window.__sentryTest",
      },
    });
  };
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
