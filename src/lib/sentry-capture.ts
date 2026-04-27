import * as Sentry from "@sentry/nextjs";
import { shouldCaptureSentryForRequestHeaders } from "@/lib/sentry";

export function captureRequestException(
  request: Request,
  error: unknown,
  context?: Parameters<typeof Sentry.captureException>[1],
): string | undefined {
  if (!shouldCaptureSentryForRequestHeaders(request.headers)) {
    return undefined;
  }

  return Sentry.captureException(error, context);
}
