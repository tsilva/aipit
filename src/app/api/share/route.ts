import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { jsonErrorResponse, parseJsonRequest } from "@/lib/api-route-response";
import { isJsonObject } from "@/lib/json";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";
import { ShareStorageError, writeSharedConversationSnapshot } from "@/lib/share-storage";

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const parsed = await parseJsonRequest(request, requestId);

  if (!parsed.ok) {
    return parsed.response;
  }

  const payload = parsed.payload;

  if (!isJsonObject(payload)) {
    return jsonErrorResponse(requestId, 400, "Invalid share payload.");
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
      return jsonErrorResponse(requestId, error.status, error.message);
    }

    Sentry.captureException(error, {
      extra: {
        requestId,
        routeName: "/api/share",
      },
    });

    return jsonErrorResponse(requestId, 502, "Failed to create a shared conversation.");
  }
}
