export const OPENROUTER_CHAT_COMPLETIONS_URL = "/chat/completions";
export const OPENROUTER_KEY_URL = "/openrouter/key";
export const OPENROUTER_PROXY_CHAT_COMPLETIONS_PATH = "/api/openrouter/chat/completions";

export type OpenRouterPromptCacheControl = {
  type: "ephemeral";
};


export function missingOpenRouterKeyMessage(): string {
  return "Hosted models are unavailable. Try again later.";
}

export function invalidOpenRouterKeyMessage(): string {
  return "Hosted models are unavailable. Try again later.";
}

export function serverOpenRouterKeyMessage(): string {
  return "Debates use The AI Pit’s hosted models. Usage may be limited.";
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
      siteUrl,
      body,
    }),
  });
}

export function buildOpenRouterPromptCacheControl(model: string): OpenRouterPromptCacheControl | undefined {
  const normalizedModel = model.trim().toLowerCase();

  if (normalizedModel.startsWith("anthropic/")) {
    return { type: "ephemeral" };
  }

  return undefined;
}
