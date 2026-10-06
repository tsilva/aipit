import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.hoisted(() => vi.fn());
const flush = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ flush }));
vi.mock("@/lib/sentry-capture", () => ({ captureRequestException: capture }));
import { POST } from "./route";

const token = "dummy-diagnostic-token-with-32-characters";
function request(key = token, consent = "granted") {
  return new Request("https://aipit.tsilva.eu/api/sentry-smoke", {
    method: "POST", headers: { "x-sentry-smoke-token": key,
      cookie: `aipit-error-reporting-consent=${consent}` },
  });
}

beforeEach(() => {
  vi.stubEnv("SENTRY_SMOKE_TEST_TOKEN", token);
  vi.stubEnv("SENTRY_DSN", "https://dummy@example.ingest.sentry.io/123");
  vi.stubEnv("VERCEL_ENV", "production");
  capture.mockReturnValue("a".repeat(32));
  flush.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("deployment Sentry diagnostic", () => {
  it("rejects missing, incorrect, and equal-length incorrect credentials without sending events", async () => {
    for (const key of ["", "invalid", "x".repeat(token.length), "é".repeat(token.length)]) {
      expect((await POST(request(key))).status).toBe(404);
    }
    expect(capture).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
  });
  it("stays disabled when its secret is absent", async () => {
    vi.stubEnv("SENTRY_SMOKE_TEST_TOKEN", "");
    expect((await POST(request())).status).toBe(404);
    expect(capture).not.toHaveBeenCalled();
  });
  it("requires explicit error-reporting consent", async () => {
    for (const consent of ["denied", "unset"]) expect((await POST(request(token, consent))).status).toBe(404);
    expect(capture).not.toHaveBeenCalled();
  });
  it("returns a receipt identifier only after an authorized application capture and flush", async () => {
    const result = await POST(request());
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toMatchObject({ ok: true, eventId: "a".repeat(32) });
    expect(capture).toHaveBeenCalledWith(expect.any(Request), expect.any(Error), {
      tags: { smoke_id: expect.any(String), source: "deployed-application-endpoint" },
    });
  });
  it("reports failed delivery instead of treating a capture ID as success", async () => {
    flush.mockResolvedValue(false);
    expect((await POST(request())).status).toBe(502);
  });
});
