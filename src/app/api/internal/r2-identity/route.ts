import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function matches(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  const gate = process.env.SENTRY_SMOKE_TEST_TOKEN ?? "";
  const supplied = request.headers.get("authorization") ?? "";
  const headers = { "Cache-Control": "no-store" };
  if (gate.length < 32 || !matches(supplied, `Bearer ${gate}`)) {
    return new Response(null, { status: 404, headers });
  }
  const actual = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  return Response.json(
    {
      configured: Boolean(actual),
      matchesExpectedToken: matches(actual, "877f2b0ac2e13720d243a1e816632b68"),
    },
    { headers },
  );
}
