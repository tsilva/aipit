import { describe, expect, it } from "vitest";
import { OPENROUTER_MODEL_COMBATIVE } from "@/lib/openrouter-models";
import {
  assertHostedKeyOrigin,
  normalizeHostedChatBody,
  OpenRouterProxyError,
  resolveClientIdentifier,
} from "@/lib/openrouter-server";

describe("openrouter-server helpers", () => {
  it("normalizes hosted chat payloads and clamps token budgets", () => {
    const normalized = normalizeHostedChatBody({
      model: OPENROUTER_MODEL_COMBATIVE,
      messages: [{ role: "user", content: "Test prompt" }],
      max_completion_tokens: 9000,
      temperature: 0.7,
      session_id: "session-123",
    });

    expect(normalized.max_completion_tokens).toBe(2400);
    expect(normalized.messages).toHaveLength(1);
  });

  it("rejects cross-origin hosted requests", () => {
    const request = new Request("https://aipit.example/api/openrouter/key", {
      headers: {
        origin: "https://evil.example",
      },
    });

    expect(() => assertHostedKeyOrigin(request)).toThrow(OpenRouterProxyError);
  });

  it("accepts same-origin hosted requests", () => {
    const request = new Request("https://aipit.example/api/openrouter/key", {
      headers: {
        origin: "https://aipit.example",
      },
    });

    expect(assertHostedKeyOrigin(request)).toBe("https://aipit.example");
  });

  it("rejects spoofed forwarded host headers for hosted requests", () => {
    const request = new Request("https://aipit.example/api/openrouter/key", {
      headers: {
        origin: "https://evil.example",
        "x-forwarded-host": "evil.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => assertHostedKeyOrigin(request)).toThrow(OpenRouterProxyError);
  });

  it("ignores x-forwarded-for and only uses trusted direct IP headers", () => {
    const requestWithTrustedIp = new Request("https://aipit.example/api/openrouter/key", {
      headers: {
        "cf-connecting-ip": "203.0.113.9",
        "x-forwarded-for": "198.51.100.7",
      },
    });
    const requestWithoutTrustedIp = new Request("https://aipit.example/api/openrouter/key", {
      headers: {
        "x-forwarded-for": "198.51.100.7",
      },
    });

    expect(resolveClientIdentifier(requestWithTrustedIp)).toBe("203.0.113.9");
    expect(resolveClientIdentifier(requestWithoutTrustedIp)).toBe("unknown");
  });
});
