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
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
    process.env.OPENROUTER_API_KEY = "upstream-only";
    vi.stubEnv("AGENTBRIDGE_API_KEY", "gateway-token");
    vi.stubEnv("AGENTBRIDGE_BASE_URL", "http://127.0.0.1:8082/api/v1");
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("ignores spoofed forwarded host headers on hosted requests", async () => {
    const response = await POST(
      new Request("https://aipit.example/api/openrouter/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          "x-forwarded-host": "evil.example",
          "x-forwarded-proto": "https",
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

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8082/api/v1/chat/completions");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer gateway-token" });
    expect(JSON.parse(String(options?.body)).model).toBe(`openrouter/${SUPPORTED_OPENROUTER_MODELS[0]}`);
    expect(JSON.stringify(options)).not.toContain("user-key");
    expect(JSON.stringify(options)).not.toContain("upstream-only");
    expect(response.status).toBe(503);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      error: { message: "Provider unavailable" },
    });
  });
  it("uses only the app production key and direct DeepSeek model in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })));
    const response = await POST(new Request("https://aipit.example/api/openrouter/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://aipit.example" },
      body: JSON.stringify({ body: { model: SUPPORTED_OPENROUTER_MODELS[0], messages: [{ role: "user", content: "Test" }] } }),
    }));
    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(options?.headers).toMatchObject({ Authorization: "Bearer upstream-only" });
    expect(JSON.parse(String(options?.body))).toMatchObject({ model: "deepseek/deepseek-v4.1-flash", reasoning: { enabled: false } });
    expect(JSON.stringify(options)).not.toContain("gateway-token");
  });

  it("does not fall back to the gateway when the production key is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const response = await POST(new Request("https://aipit.example/api/openrouter/chat/completions", {
      method: "POST", headers: { "content-type": "application/json", origin: "https://aipit.example" },
      body: JSON.stringify({ body: { model: SUPPORTED_OPENROUTER_MODELS[0], messages: [{ role: "user", content: "Test" }] } }),
    }));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
