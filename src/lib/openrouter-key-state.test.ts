import { describe, expect, it, vi } from "vitest";
import {
  OPENROUTER_API_KEY_STORAGE_KEY,
  OPENROUTER_KEY_SESSION_ONLY_MESSAGE,
  OPENROUTER_KEY_VALIDATION_UNAVAILABLE_MESSAGE,
  readStoredOpenRouterApiKey,
  resolveOpenRouterKeyValidation,
  saveOpenRouterApiKey,
} from "@/lib/openrouter-key-state";

describe("openrouter key state", () => {
  it("treats validation exceptions as unresolved instead of invalid credentials", async () => {
    const result = await resolveOpenRouterKeyValidation({
      apiKey: "sk-or-v1-test",
      siteUrl: "https://aipit.example",
      validate: vi.fn().mockRejectedValue(new Error("network unavailable")),
    });

    expect(result).toEqual({
      status: "unresolved",
      message: OPENROUTER_KEY_VALIDATION_UNAVAILABLE_MESSAGE,
      valid: false,
    });
  });

  it("returns invalid only when OpenRouter rejects credentials", async () => {
    const result = await resolveOpenRouterKeyValidation({
      apiKey: "sk-or-v1-test",
      siteUrl: "https://aipit.example",
      validate: vi.fn().mockResolvedValue({
        valid: false,
        message: "This API key is invalid. Add a valid OpenRouter key to run debates.",
      }),
    });

    expect(result.status).toBe("invalid");
    expect(result.valid).toBe(false);
  });

  it("detects session-only key storage when localStorage rejects writes", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new DOMException("blocked", "SecurityError");
      }),
      removeItem: vi.fn(),
    };

    expect(saveOpenRouterApiKey(storage, "sk-or-v1-test")).toBe(false);
    expect(OPENROUTER_KEY_SESSION_ONLY_MESSAGE).toContain("verified for this session");
  });

  it("reads saved keys without surfacing storage exceptions", () => {
    expect(
      readStoredOpenRouterApiKey({
        getItem: () => "sk-or-v1-saved",
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }),
    ).toBe("sk-or-v1-saved");

    expect(
      readStoredOpenRouterApiKey({
        getItem: () => {
          throw new DOMException("blocked", "SecurityError");
        },
        setItem: vi.fn(),
        removeItem: vi.fn(),
      }),
    ).toBeUndefined();
  });

  it("uses the established storage key name", () => {
    expect(OPENROUTER_API_KEY_STORAGE_KEY).toBe("aipit.openrouter-api-key");
  });
});
