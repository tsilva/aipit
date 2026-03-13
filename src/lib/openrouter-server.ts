import * as Sentry from "@sentry/nextjs";
import { MODEL_SUGGESTIONS } from "@/lib/openrouter-models";
import { buildOpenRouterHeaders } from "@/lib/openrouter";
import { buildResponseHeaders, resolveRequestId } from "@/lib/request-id";

const HOSTED_KEY_RATE_LIMIT_WINDOW_MS = 60_000;
const HOSTED_KEY_ROUTE_LIMIT = 10;
const HOSTED_CHAT_ROUTE_LIMIT = 30;
const HOSTED_MAX_MESSAGES = 24;
// Debate runs carry persona setup plus rolling transcript context in the system prompt,
// so the hosted proxy needs room for larger single-message payloads than a generic chat UI.
const HOSTED_MAX_MESSAGE_CHARS = 48_000;
const HOSTED_MAX_TOTAL_MESSAGE_CHARS = 180_000;
const HOSTED_MAX_COMPLETION_TOKENS = 2_400;
const HOSTED_MAX_SESSION_ID_LENGTH = 128;

const HOSTED_ALLOWED_MODELS = new Set<string>(MODEL_SUGGESTIONS);
const hostedRequestCounts = new Map<string, { count: number; resetAt: number }>();

type HostedChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type HostedChatBody = {
  model: string;
  messages: HostedChatMessage[];
  temperature?: number;
  max_completion_tokens?: number;
  session_id?: string;
};

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

export function hasServerOpenRouterKey(): boolean {
  return resolveServerApiKey() !== undefined;
}

export function isServerOpenRouterKeyRequest(apiKey?: string): boolean {
  return !apiKey?.trim();
}

export function resolveOpenRouterProxyApiKey(apiKey?: string): string {
  const resolvedApiKey = apiKey?.trim() || resolveServerApiKey();

  if (!resolvedApiKey) {
    throw new OpenRouterProxyError("Missing OpenRouter API key.", 400);
  }

  return resolvedApiKey;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Access control follows the actual request URL and ignores forwarded origin headers.
function resolveRequestOrigin(request: Request): string {
  return new URL(request.url).origin;
}

export function assertHostedKeyOrigin(request: Request): string {
  const requestOrigin = resolveRequestOrigin(request);
  const originHeader = request.headers.get("origin")?.trim();

  if (!originHeader) {
    throw new OpenRouterProxyError("Hosted OpenRouter access requires a browser-originated request.", 403);
  }

  let normalizedOrigin: string;

  try {
    normalizedOrigin = new URL(originHeader).origin;
  } catch {
    throw new OpenRouterProxyError("Invalid request origin.", 403);
  }

  if (normalizedOrigin !== requestOrigin) {
    throw new OpenRouterProxyError("Cross-origin hosted OpenRouter requests are blocked.", 403);
  }

  return normalizedOrigin;
}

// Rate limiting is best-effort and only uses direct platform IP headers when available.
export function resolveClientIdentifier(request: Request): string {
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();

  return connectingIp || "unknown";
}

function enforceHostedKeyRateLimit(request: Request, routeName: string): void {
  const now = Date.now();
  const clientId = resolveClientIdentifier(request);
  const key = `${routeName}:${clientId}`;
  const limit = routeName === "/api/openrouter/key" ? HOSTED_KEY_ROUTE_LIMIT : HOSTED_CHAT_ROUTE_LIMIT;
  const existing = hostedRequestCounts.get(key);

  if (!existing || existing.resetAt <= now) {
    hostedRequestCounts.set(key, { count: 1, resetAt: now + HOSTED_KEY_RATE_LIMIT_WINDOW_MS });
    return;
  }

  if (existing.count >= limit) {
    throw new OpenRouterProxyError("Hosted OpenRouter usage is temporarily rate limited. Try again shortly.", 429);
  }

  existing.count += 1;
}

function normalizeHostedChatMessage(value: unknown): HostedChatMessage {
  if (!isJsonObject(value)) {
    throw new OpenRouterProxyError("Hosted chat messages must be objects.", 400);
  }

  const role = value.role;
  const content = value.content;

  if (role !== "system" && role !== "user" && role !== "assistant") {
    throw new OpenRouterProxyError("Hosted chat messages must use a supported role.", 400);
  }

  if (typeof content !== "string" || content.length === 0) {
    throw new OpenRouterProxyError("Hosted chat messages must contain string content.", 400);
  }

  if (content.length > HOSTED_MAX_MESSAGE_CHARS) {
    throw new OpenRouterProxyError("Hosted chat messages are too large.", 400);
  }

  return { role, content };
}

export function normalizeHostedChatBody(body: unknown): HostedChatBody {
  if (!isJsonObject(body)) {
    throw new OpenRouterProxyError("Missing chat completion payload.", 400);
  }

  const model = body.model;
  if (typeof model !== "string" || !HOSTED_ALLOWED_MODELS.has(model)) {
    throw new OpenRouterProxyError("This model is not available for the hosted OpenRouter key.", 403);
  }

  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0 || rawMessages.length > HOSTED_MAX_MESSAGES) {
    throw new OpenRouterProxyError("Hosted chat requests must include a supported number of messages.", 400);
  }

  const messages = rawMessages.map(normalizeHostedChatMessage);
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);

  if (totalChars > HOSTED_MAX_TOTAL_MESSAGE_CHARS) {
    throw new OpenRouterProxyError("Hosted chat requests are too large.", 400);
  }

  const temperature = body.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    throw new OpenRouterProxyError("Hosted chat temperature must be between 0 and 2.", 400);
  }

  const maxCompletionTokens = body.max_completion_tokens;
  if (
    maxCompletionTokens !== undefined &&
    (typeof maxCompletionTokens !== "number" || !Number.isFinite(maxCompletionTokens) || maxCompletionTokens <= 0)
  ) {
    throw new OpenRouterProxyError("Hosted chat max_completion_tokens must be a positive number.", 400);
  }

  const sessionId = body.session_id;
  if (
    sessionId !== undefined &&
    (typeof sessionId !== "string" || sessionId.length === 0 || sessionId.length > HOSTED_MAX_SESSION_ID_LENGTH)
  ) {
    throw new OpenRouterProxyError("Hosted chat session_id is invalid.", 400);
  }

  return {
    model,
    messages,
    temperature: temperature === undefined ? undefined : temperature,
    max_completion_tokens:
      maxCompletionTokens === undefined ? undefined : Math.min(Math.trunc(maxCompletionTokens), HOSTED_MAX_COMPLETION_TOKENS),
    session_id: sessionId === undefined ? undefined : sessionId,
  };
}

export async function proxyOpenRouterRequest({
  request,
  routeName,
  upstreamUrl,
  method,
  apiKey,
  siteUrl,
  body,
  signal,
  requestId,
}: {
  request: Request;
  routeName: string;
  upstreamUrl: string;
  method: "GET" | "POST";
  apiKey?: string;
  siteUrl?: string;
  body?: unknown;
  signal?: AbortSignal;
  requestId?: string;
}): Promise<Response> {
  const startedAt = Date.now();
  const resolvedRequestId = requestId ?? resolveRequestId(request);
  const usingServerKey = isServerOpenRouterKeyRequest(apiKey);
  const resolvedApiKey = resolveOpenRouterProxyApiKey(apiKey);
  const resolvedSiteUrl = usingServerKey ? assertHostedKeyOrigin(request) : siteUrl?.trim() || undefined;

  if (usingServerKey) {
    enforceHostedKeyRateLimit(request, routeName);
  }

  const resolvedBody = usingServerKey && method === "POST" ? normalizeHostedChatBody(body) : body;

  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetch(upstreamUrl, {
      method,
      headers: buildOpenRouterHeaders({
        apiKey: resolvedApiKey,
        siteUrl: resolvedSiteUrl,
      }),
      body: resolvedBody === undefined ? undefined : JSON.stringify(resolvedBody),
      signal,
    });
  } catch (error) {
    Sentry.captureException(error, {
      extra: {
        durationMs: Date.now() - startedAt,
        method,
        requestId: resolvedRequestId,
        routeName,
        siteUrl: resolvedSiteUrl,
        upstreamUrl,
        usingServerKey,
      },
    });
    console.error("OpenRouter proxy request failed", {
      durationMs: Date.now() - startedAt,
      method,
      requestId: resolvedRequestId,
      routeName,
      siteUrl: resolvedSiteUrl,
      upstreamUrl,
      usingServerKey,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const logPayload = {
    durationMs: Date.now() - startedAt,
    method,
    requestId: resolvedRequestId,
    routeName,
    siteUrl: resolvedSiteUrl,
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
    headers: buildResponseHeaders(
      resolvedRequestId,
      contentType ? { "Cache-Control": "no-store", "Content-Type": contentType } : { "Cache-Control": "no-store" },
    ),
  });
}
