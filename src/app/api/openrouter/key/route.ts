import { NextResponse } from "next/server";
import { OPENROUTER_KEY_URL } from "@/lib/openrouter";
import {
  OpenRouterProxyError,
  isServerOpenRouterKeyRequest,
  proxyOpenRouterRequest,
} from "@/lib/openrouter-server";

type KeyProxyRequest = {
  apiKey?: string;
  siteUrl?: string;
};

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request): Promise<Response> {
  let payload: KeyProxyRequest | undefined;

  try {
    payload = (await request.json()) as KeyProxyRequest;
  } catch {
    return NextResponse.json({ error: { message: "Invalid JSON payload." } }, { status: 400 });
  }

  if (!isJsonObject(payload)) {
    return NextResponse.json({ error: { message: "Invalid proxy payload." } }, { status: 400 });
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
      signal: request.signal,
    });

    if (isServerOpenRouterKeyRequest(apiKey) && response.ok) {
      return new Response(null, {
        status: 204,
        headers: { "Cache-Control": "no-store" },
      });
    }

    return response;
  } catch (error) {
    if (error instanceof OpenRouterProxyError) {
      return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    }

    return NextResponse.json({ error: { message: "Failed to reach OpenRouter." } }, { status: 502 });
  }
}
