import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORTED_OPENROUTER_MODELS } from "@/lib/openrouter-models";
import { POST } from "@/app/api/openrouter/chat/completions/route";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
}));

describe("/api/openrouter/chat/completions", () => {
  const originalApiKey = process.env.OPENROUTER_API_KEY;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "server-key";
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("blocks cross-origin hosted requests", async () => {
    const response = await POST(
      new Request("https://aipit.example/api/openrouter/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({
          body: {
            model: SUPPORTED_OPENROUTER_MODELS[0],
            messages: [{ role: "user", content: "Test" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      error: { message: "Cross-origin hosted OpenRouter requests are blocked." },
    });
  });

  it("passes through upstream failures and preserves a request ID header", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Provider unavailable" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("https://aipit.example/api/openrouter/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aipit.example",
        },
        body: JSON.stringify({
          apiKey: "user-key",
          body: {
            model: SUPPORTED_OPENROUTER_MODELS[0],
            messages: [{ role: "user", content: "Test" }],
          },
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      error: { message: "Provider unavailable" },
    });
  });
});
