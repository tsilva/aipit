import type { ApiKeyStatus } from "@/lib/pit-studio-state";

export const INVALID_OPENROUTER_KEY_MESSAGE = "This API key is invalid. Add a valid OpenRouter key to run debates.";
export const HOSTED_OPENROUTER_KEY_MESSAGE = "Using this app's configured OpenRouter key. Usage may be limited.";
export const INVALID_OPENROUTER_KEY_FORMAT_MESSAGE = "This API key is invalid. OpenRouter keys should start with sk-or-v1-.";
export const OPENROUTER_API_KEY_STORAGE_KEY = "aipit.openrouter-api-key";
export const OPENROUTER_API_KEY_PATTERN = /^sk-or-v1-[A-Za-z0-9_-]{32,}$/;
export const OPENROUTER_API_KEY_VALIDATION_DEBOUNCE_MS = 450;
export const OPENROUTER_KEY_VALIDATION_UNAVAILABLE_MESSAGE =
  "Could not validate with OpenRouter. Check your connection and try again.";
export const OPENROUTER_KEY_SESSION_ONLY_MESSAGE =
  "OpenRouter API key verified for this session, but this browser did not save it.";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readStoredOpenRouterApiKey(storage: StorageLike): string | undefined {
  try {
    return storage.getItem(OPENROUTER_API_KEY_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveOpenRouterApiKey(storage: StorageLike, apiKey: string): boolean {
  try {
    storage.setItem(OPENROUTER_API_KEY_STORAGE_KEY, apiKey);
    return true;
  } catch {
    return false;
  }
}

export function removeStoredOpenRouterApiKey(storage: StorageLike): boolean {
  try {
    storage.removeItem(OPENROUTER_API_KEY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export async function resolveOpenRouterKeyValidation({
  apiKey,
  siteUrl,
  validate,
}: {
  apiKey: string;
  siteUrl: string;
  validate: (apiKey: string | undefined, siteUrl?: string) => Promise<{ valid: boolean; message: string }>;
}): Promise<{ status: ApiKeyStatus; message: string; valid: boolean }> {
  try {
    const validation = await validate(apiKey, siteUrl);

    return {
      status: validation.valid ? "valid" : "invalid",
      message: validation.message,
      valid: validation.valid,
    };
  } catch {
    return {
      status: "unresolved",
      message: OPENROUTER_KEY_VALIDATION_UNAVAILABLE_MESSAGE,
      valid: false,
    };
  }
}
