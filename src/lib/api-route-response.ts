import { NextResponse } from "next/server";
import { buildResponseHeaders } from "@/lib/request-id";

export type ParsedJsonRequest =
  | { ok: true; payload: unknown }
  | { ok: false; response: Response };

export async function parseJsonRequest(request: Request, requestId: string): Promise<ParsedJsonRequest> {
  try {
    return { ok: true, payload: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { message: "Invalid JSON payload." } },
        { status: 400, headers: buildResponseHeaders(requestId) },
      ),
    };
  }
}

export function jsonErrorResponse(requestId: string, status: number, message: string): Response {
  return NextResponse.json(
    { error: { message } },
    { status, headers: buildResponseHeaders(requestId) },
  );
}
