import { jsonErrorResponse, parseJsonRequest } from "@/lib/api-route-response";
import { isJsonObject } from "@/lib/json";
import { OPENROUTER_CHAT_COMPLETIONS_URL } from "@/lib/openrouter";
import { isSupportedOpenRouterModel, SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import { OpenRouterProxyError, proxyOpenRouterRequest } from "@/lib/openrouter-server";
import { resolveRequestId } from "@/lib/request-id";
import { captureRequestException } from "@/lib/sentry-capture";

export async function POST(request: Request): Promise<Response> {
  const requestId = resolveRequestId(request);
  const parsed = await parseJsonRequest(request, requestId);

  if (!parsed.ok) {
    return parsed.response;
  }

  const payload = parsed.payload;

  if (!isJsonObject(payload) || !isJsonObject(payload.body)) {
    return jsonErrorResponse(requestId, 400, "Missing chat completion payload.");
  }

  const requestedModel = payload.body.model;

  if (typeof requestedModel !== "string") {
    return jsonErrorResponse(requestId, 400, "Missing chat completion model.");
  }

  if (!isSupportedOpenRouterModel(requestedModel)) {
    return jsonErrorResponse(
      requestId,
      400,
      `Unsupported model. Allowed models: ${SUPPORTED_OPENROUTER_MODELS.join(", ")}`,
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
      return jsonErrorResponse(requestId, error.status, error.message);
    }

    captureRequestException(request, error, {
      extra: {
        requestId,
        routeName: "/api/openrouter/chat/completions",
      },
    });
    return jsonErrorResponse(requestId, 502, "Failed to reach OpenRouter.");
  }
}
