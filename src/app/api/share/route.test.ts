import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { writeSharedConversationSnapshot, MockShareStorageError } = vi.hoisted(() => {
  class MockShareStorageError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.name = "ShareStorageError";
      this.status = status;
    }
  }

  return {
    writeSharedConversationSnapshot: vi.fn(),
    MockShareStorageError,
  };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  captureRequestError: vi.fn(),
  init: vi.fn(),
}));

vi.mock("@/lib/share-storage", () => ({
  ShareStorageError: MockShareStorageError,
  writeSharedConversationSnapshot,
}));

import { POST } from "@/app/api/share/route";

describe("/api/share", () => {
  beforeEach(() => {
    writeSharedConversationSnapshot.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a share slug and URL for a completed conversation payload", async () => {
    writeSharedConversationSnapshot.mockResolvedValue({
      slug: "mock-share-1",
      url: "http://localhost:3000/s/mock-share-1",
    });

    const response = await POST(
      new Request("https://aipit.example/api/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: { mode: "debate" },
          result: { mode: "debate" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({
      slug: "mock-share-1",
      url: "http://localhost:3000/s/mock-share-1",
    });
  });

  it("rejects malformed JSON payloads", async () => {
    const response = await POST(
      new Request("https://aipit.example/api/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Invalid JSON payload." },
    });
  });

  it("rejects incomplete debates", async () => {
    writeSharedConversationSnapshot.mockRejectedValue(
      new MockShareStorageError("Only completed debates can be shared.", 400),
    );

    const response = await POST(
      new Request("https://aipit.example/api/share", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: { mode: "debate" },
          result: { mode: "debate" },
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { message: "Only completed debates can be shared." },
    });
  });
});
