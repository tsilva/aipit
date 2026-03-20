import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

declare global {
  interface Window {
    __sentryTest?: () => string;
  }
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  integrations: [],
  tracesSampleRate: 0.1,
});

if (typeof window !== "undefined") {
  window.__sentryTest = () => {
    const error = new Error("Sentry test exception from window.__sentryTest()");

    return Sentry.captureException(error, {
      tags: {
        source: "window.__sentryTest",
      },
    });
  };
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
