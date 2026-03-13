import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { OPENROUTER_KEY_URL } from "@/lib/openrouter";
import {
  OpenRouterProxyError,
  isServerOpenRouterKeyRequest,
  proxyOpenRouterRequest,
} from "@/lib/openrouter-server";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";

type KeyProxyRequest = {
  apiKey?: string;
  siteUrl?: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  let payload: KeyProxyRequest | undefined;

  try {
    payload = (await request.json()) as KeyProxyRequest;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  if (!isJsonObject(payload)) {
    return NextResponse.json(
      { error: { message: "Invalid proxy payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  try {
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey : undefined;
    const response = await proxyOpenRouterRequest({
      request,
      routeName: "/api/openrouter/key",
      upstreamUrl: OPENROUTER_KEY_URL,
      method: "GET",
      apiKey,
      siteUrl: typeof payload.siteUrl === "string" ? payload.siteUrl : undefined,
      requestId,
      signal: request.signal,
    });

    if (isServerOpenRouterKeyRequest(apiKey) && response.ok) {
      return new Response(null, {
        status: 204,
        headers: buildResponseHeaders(requestId, { "Cache-Control": "no-store" }),
      });
    }

    return response;
  } catch (error) {
    if (error instanceof OpenRouterProxyError) {
      return NextResponse.json(
        { error: { message: error.message } },
        { status: error.status, headers: buildResponseHeaders(requestId) },
      );
    }

    Sentry.captureException(error, {
      extra: {
        requestId,
        routeName: "/api/openrouter/key",
      },
    });
    return NextResponse.json(
      { error: { message: "Failed to reach OpenRouter." } },
      { status: 502, headers: buildResponseHeaders(requestId) },
    );
  }
}
