import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/openrouter/key/route";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
}));

describe("/api/openrouter/key", () => {
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

  it("returns 204 for a valid hosted-key probe and sets X-Request-Id", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const response = await POST(
      new Request("https://aipit.example/api/openrouter/key", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://aipit.example",
        },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
  });
});
