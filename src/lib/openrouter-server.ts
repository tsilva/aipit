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
  routeName,
  upstreamUrl,
  method,
  apiKey,
  siteUrl,
  body,
  signal,
}: {
  routeName: string;
  upstreamUrl: string;
  method: "GET" | "POST";
  apiKey?: string;
  siteUrl?: string;
  body?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const startedAt = Date.now();
  const usingServerKey = !apiKey?.trim();
  const resolvedApiKey = resolveOpenRouterProxyApiKey(apiKey);
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: buildOpenRouterHeaders({
        apiKey: resolvedApiKey,
        siteUrl,
      }),
      body,
      signal,
    });
  } catch (error) {
    console.error("OpenRouter proxy request failed", {
      durationMs: Date.now() - startedAt,
      method,
      routeName,
      siteUrl,
      upstreamUrl,
      usingServerKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const logPayload = {
    durationMs: Date.now() - startedAt,
    method,
    routeName,
    siteUrl,
    status: upstreamResponse.status,
    upstreamUrl,
    usingServerKey,
  };

  if (upstreamResponse.ok) {
    console.info("OpenRouter proxy request completed", logPayload);
  } else {
    console.warn("OpenRouter proxy request failed", logPayload);
  }

  const contentType = upstreamResponse.headers.get("content-type");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}
