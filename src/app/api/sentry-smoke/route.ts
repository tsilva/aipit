import { randomUUID, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { captureRequestException } from "@/lib/sentry-capture";
import { isSentryRuntimeEnabled, resolveSentryDsn } from "@/lib/sentry-build";
import { readTelemetryConsentFromHeaders } from "@/lib/telemetry-consent";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const expected = process.env.SENTRY_SMOKE_TEST_TOKEN;
  const supplied = request.headers.get("x-sentry-smoke-token");
  const expectedBytes = Buffer.from(expected ?? "");
  const suppliedBytes = Buffer.from(supplied ?? "");
  if (!expected || expected.length < 32 || !supplied || suppliedBytes.length !== expectedBytes.length
      || !timingSafeEqual(expectedBytes, suppliedBytes)
      || readTelemetryConsentFromHeaders("errorReporting", request.headers) !== "granted"
      || !isSentryRuntimeEnabled() || !resolveSentryDsn("server")) {
    return response({ ok: false }, 404);
  }

  const smokeId = randomUUID();
  const eventId = captureRequestException(request, new Error("Aipit deployment Sentry delivery check"), {
    tags: { smoke_id: smokeId, source: "deployed-application-endpoint" },
  });
  const flushed = eventId ? await Sentry.flush(10_000) : false;
  return response({ ok: Boolean(eventId && flushed), eventId, smokeId }, eventId && flushed ? 200 : 502);
}
