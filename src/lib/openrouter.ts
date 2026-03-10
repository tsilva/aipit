import { OPENROUTER_MODEL_LIGHTWEIGHT } from "@/lib/openrouter-models";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const OPENROUTER_CHAT_COMPLETIONS_URL = `${OPENROUTER_BASE_URL}/chat/completions`;
export const OPENROUTER_KEY_URL = `${OPENROUTER_BASE_URL}/key`;
export const OPENROUTER_VALIDATION_MODEL = OPENROUTER_MODEL_LIGHTWEIGHT;
export const OPENROUTER_PROXY_CHAT_COMPLETIONS_PATH = "/api/openrouter/chat/completions";
export const OPENROUTER_PROXY_KEY_PATH = "/api/openrouter/key";

const OPENROUTER_KEY_VALIDATION_RETRIES = 3;
const OPENROUTER_VALIDATION_RETRY_DELAY_MS = 400;

export function missingOpenRouterKeyMessage(): string {
  return "No personal API key saved, and no server-side OpenRouter key is configured.";
}

export function invalidOpenRouterKeyMessage(): string {
  return "This API key is invalid. Add a valid OpenRouter key to run debates.";
}

export function serverOpenRouterKeyMessage(): string {
  return "No personal API key saved. Using the server-side OpenRouter key.";
}

function resolveAppName(): string {
  return process.env.NEXT_PUBLIC_OPENROUTER_APP_NAME || "The AI Pit";
}

export function buildOpenRouterHeaders({
  apiKey,
  siteUrl,
}: {
  apiKey?: string;
  siteUrl?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-OpenRouter-Title": resolveAppName(),
  };

  const trimmedKey = apiKey?.trim();
  if (trimmedKey) {
    headers.Authorization = `Bearer ${trimmedKey}`;
  }

  if (siteUrl) {
    headers["HTTP-Referer"] = siteUrl;
  }

  return headers;
}

export function extractOpenRouterErrorMessage(text: string): string {
  let detail = text;

  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
    };
    detail = parsed.error?.message || parsed.message || text;
  } catch {
    // Keep the raw error body when it isn't JSON.
  }

  return detail.trim();
}

export async function postOpenRouterProxyRequest({
  path,
  apiKey,
  siteUrl,
  body,
  signal,
}: {
  path: string;
  apiKey?: string;
  siteUrl?: string;
  body?: unknown;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      apiKey: apiKey?.trim() || undefined,
      siteUrl,
      body,
    }),
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function shouldRetryValidation(message: string, status?: number): boolean {
  if (status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  const normalized = message.trim().toLowerCase();

  return normalized.includes("user not found") || normalized.includes("temporar") || normalized.includes("timeout");
}

async function probeOpenRouterChat(apiKey: string | undefined, siteUrl?: string): Promise<boolean> {
  const response = await postOpenRouterProxyRequest({
    path: OPENROUTER_PROXY_CHAT_COMPLETIONS_PATH,
    apiKey,
    siteUrl,
    body: {
      model: OPENROUTER_VALIDATION_MODEL,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_completion_tokens: 8,
    },
  });

  return response.ok;
}

export async function validateOpenRouterKey(
  apiKey: string | undefined,
  siteUrl?: string,
): Promise<{ valid: boolean; message: string }> {
  const trimmedKey = apiKey?.trim();
  const isHostedKeyValidation = !trimmedKey;

  let detail = isHostedKeyValidation ? "Missing OpenRouter API key." : "OpenRouter rejected this API key.";
  let status: number | undefined;

  for (let attempt = 1; attempt <= OPENROUTER_KEY_VALIDATION_RETRIES; attempt += 1) {
    const response = await postOpenRouterProxyRequest({
      path: OPENROUTER_PROXY_KEY_PATH,
      apiKey: trimmedKey,
      siteUrl,
    });

    if (response.ok) {
      return {
        valid: true,
        message: isHostedKeyValidation
          ? serverOpenRouterKeyMessage()
          : "OpenRouter API key verified. Selected models are enabled.",
      };
    }

    status = response.status;
    const text = await response.text();
    detail = extractOpenRouterErrorMessage(text) || "OpenRouter rejected this API key.";

    if (attempt < OPENROUTER_KEY_VALIDATION_RETRIES && shouldRetryValidation(detail, status)) {
      await delay(OPENROUTER_VALIDATION_RETRY_DELAY_MS * attempt);
      continue;
    }

    break;
  }

  if (shouldRetryValidation(detail, status)) {
    try {
      const chatProbeOk = await probeOpenRouterChat(trimmedKey, siteUrl);
      if (chatProbeOk) {
        return {
          valid: true,
          message:
            isHostedKeyValidation
              ? serverOpenRouterKeyMessage()
              : "OpenRouter accepted this key on the chat API after a failed key lookup. Their auth lookup may be transiently inconsistent, but debates should run.",
        };
      }
    } catch {
      // Fall through to the original validation failure below.
    }
  }

  return {
    valid: false,
    message: isHostedKeyValidation ? missingOpenRouterKeyMessage() : invalidOpenRouterKeyMessage(),
  };
}

export function resolveOpenRouterModel(model: string, apiKey?: string): string {
  return apiKey?.trim() ? model : model;
}
