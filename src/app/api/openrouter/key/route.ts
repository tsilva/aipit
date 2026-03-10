import { NextResponse } from "next/server";
import { OPENROUTER_KEY_URL } from "@/lib/openrouter";
import { OpenRouterProxyError, proxyOpenRouterRequest } from "@/lib/openrouter-server";

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
    return await proxyOpenRouterRequest({
      routeName: "/api/openrouter/key",
      upstreamUrl: OPENROUTER_KEY_URL,
      method: "GET",
      apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
      siteUrl: typeof payload.siteUrl === "string" ? payload.siteUrl : undefined,
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof OpenRouterProxyError) {
      return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    }

    return NextResponse.json({ error: { message: "Failed to reach OpenRouter." } }, { status: 502 });
  }
}
