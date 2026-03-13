import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { OPENROUTER_CHAT_COMPLETIONS_URL } from "@/lib/openrouter";
import { isSupportedOpenRouterModel, SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import { OpenRouterProxyError, proxyOpenRouterRequest } from "@/lib/openrouter-server";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";

type ChatProxyRequest = {
  apiKey?: string;
  siteUrl?: string;
  body?: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  let payload: ChatProxyRequest | undefined;

  try {
    payload = (await request.json()) as ChatProxyRequest;
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  if (!isJsonObject(payload) || !isJsonObject(payload.body)) {
    return NextResponse.json(
      { error: { message: "Missing chat completion payload." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  const requestedModel = payload.body.model;

  if (typeof requestedModel !== "string") {
    return NextResponse.json(
      { error: { message: "Missing chat completion model." } },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  if (!isSupportedOpenRouterModel(requestedModel)) {
    return NextResponse.json(
      {
        error: {
          message: `Unsupported model. Allowed models: ${SUPPORTED_OPENROUTER_MODELS.join(", ")}`,
        },
      },
      { status: 400, headers: buildResponseHeaders(requestId) },
    );
  }

  try {
    return await proxyOpenRouterRequest({
      request,
      routeName: "/api/openrouter/chat/completions",
      upstreamUrl: OPENROUTER_CHAT_COMPLETIONS_URL,
      method: "POST",
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
      siteUrl: typeof payload.siteUrl === "string" ? payload.siteUrl : undefined,
      body: payload.body,
      requestId,
      signal: request.signal,
    });
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
        routeName: "/api/openrouter/chat/completions",
      },
    });
    return NextResponse.json(
      { error: { message: "Failed to reach OpenRouter." } },
      { status: 502, headers: buildResponseHeaders(requestId) },
    );
  }
}
