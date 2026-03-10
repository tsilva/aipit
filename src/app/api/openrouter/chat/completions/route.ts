import { NextResponse } from "next/server";
import { OPENROUTER_CHAT_COMPLETIONS_URL } from "@/lib/openrouter";
import { isSupportedOpenRouterModel, SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import { OpenRouterProxyError, proxyOpenRouterRequest } from "@/lib/openrouter-server";

type ChatProxyRequest = {
  apiKey?: string;
  siteUrl?: string;
  body?: unknown;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  let payload: ChatProxyRequest | undefined;

  try {
    payload = (await request.json()) as ChatProxyRequest;
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON payload." } }, { status: 400 });
  }

  if (!isJsonObject(payload) || !isJsonObject(payload.body)) {
    return NextResponse.json({ error: { message: "Missing chat completion payload." } }, { status: 400 });
  }

  const requestedModel = payload.body.model;

  if (typeof requestedModel !== "string") {
    return NextResponse.json({ error: { message: "Missing chat completion model." } }, { status: 400 });
  }

  if (!isSupportedOpenRouterModel(requestedModel)) {
    return NextResponse.json(
      {
        error: {
          message: `Unsupported model. Allowed models: ${SUPPORTED_OPENROUTER_MODELS.join(", ")}`,
        },
      },
      { status: 400 },
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
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof OpenRouterProxyError) {
      return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    }

    return NextResponse.json({ error: { message: "Failed to reach OpenRouter." } }, { status: 502 });
  }
}
