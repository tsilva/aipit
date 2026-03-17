import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";
import { ShareStorageError, writeSharedConversationSnapshot } from "@/lib/share-storage";

type ShareRequestBody = {
  input?: unknown;
  result?: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  let payload: ShareRequestBody | undefined;

  try {
    payload = (await request.json()) as ShareRequestBody;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  if (!isJsonObject(payload)) {
    return NextResponse.json(
      { error: { message: "Invalid share payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  try {
    const sharedConversation = await writeSharedConversationSnapshot({
      input: payload.input,
      result: payload.result,
      signal: request.signal,
    });

    return NextResponse.json(sharedConversation, {
      status: 200,
      headers: buildResponseHeaders(requestId, { "Cache-Control": "no-store" }),
    });
  } catch (error) {
    if (error instanceof ShareStorageError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status, headers: buildResponseHeaders(requestId) },
      );
    }

    Sentry.captureException(error, {
      extra: {
        requestId,
        routeName: "/api/share",
      },
    });

    return NextResponse.json(
      { error: { message: "Failed to create a shared conversation." } },
      { status: 502, headers: buildResponseHeaders(requestId) },
    );
  }
}
