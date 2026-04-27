import * as Sentry from "@sentry/nextjs";
import { shouldCaptureSentryForRequestHeaders } from "./src/lib/sentry";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (error, request, context) => {
  if (!shouldCaptureSentryForRequestHeaders(request.headers)) {
    return;
  }

  Sentry.captureRequestError(error, request, context);
};
