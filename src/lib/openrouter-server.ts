import { buildOpenRouterHeaders } from "@/lib/openrouter";

export class OpenRouterProxyError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "OpenRouterProxyError";
    this.status = status;
  }
}

function resolveServerApiKey(): string | undefined {
  const configuredKey = process.env.OPENROUTER_API_KEY?.trim();

  return configuredKey || undefined;
}

export function resolveOpenRouterProxyApiKey(apiKey?: string): string {
  const resolvedApiKey = apiKey?.trim() || resolveServerApiKey();

  if (!resolvedApiKey) {
    throw new OpenRouterProxyError("Missing OpenRouter API key.", 400);
  }

  return resolvedApiKey;
}

export async function proxyOpenRouterRequest({
  upstreamUrl,
  method,
  apiKey,
  siteUrl,
  body,
  signal,
}: {
  upstreamUrl: string;
  method: "GET" | "POST";
  apiKey?: string;
  siteUrl?: string;
  body?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const upstreamResponse = await fetch(upstreamUrl, {
    method,
    headers: buildOpenRouterHeaders({
      apiKey: resolveOpenRouterProxyApiKey(apiKey),
      siteUrl,
    }),
    body,
    signal,
  });

  const contentType = upstreamResponse.headers.get("content-type");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}
