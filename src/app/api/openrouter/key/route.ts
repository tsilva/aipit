import { jsonErrorResponse, parseJsonRequest } from "@/lib/api-route-response";
import { isJsonObject } from "@/lib/json";
import { OPENROUTER_KEY_URL } from "@/lib/openrouter";
import {
  OpenRouterProxyError,
  isServerOpenRouterKeyRequest,
  proxyOpenRouterRequest,
} from "@/lib/openrouter-server";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";
import { captureRequestException } from "@/lib/sentry-capture";

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const parsed = await parseJsonRequest(request, requestId);

  if (!parsed.ok) {
    return parsed.response;
  }

  const payload = parsed.payload;

  if (!isJsonObject(payload)) {
    return jsonErrorResponse(requestId, 400, "Invalid proxy payload.");
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
      return jsonErrorResponse(requestId, error.status, error.message);
    }

    captureRequestException(request, error, {
      extra: {
        requestId,
        routeName: "/api/openrouter/key",
      },
    });
    return jsonErrorResponse(requestId, 502, "Failed to reach OpenRouter.");
  }
}
