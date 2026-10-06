import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs, verifyDelivery } from "./verify-sentry-delivery.mjs";

const eventId = "0123456789abcdef0123456789abcdef";
const dsn = "https://public@example.ingest.sentry.io/123";
const env = { SENTRY_AUTH_TOKEN: "test-token", NEXT_PUBLIC_SENTRY_DSN: dsn };
const options = { eventId, site: "https://aipit.tsilva.eu", environment: "production", release: "deployed-sha" };
const event = {
  eventID: eventId,
  tags: [{ key: "environment", value: "production" }],
  release: { version: "deployed-sha" },
  entries: [{ type: "request", data: { url: "https://aipit.tsilva.eu/?topic=private" } }],
};

function api(eventResponse = event, keys = [{ isActive: true, dsn: { public: dsn } }]) {
  const requests = [];
  return {
    requests,
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, json: async () => url.pathname.endsWith("keys/") ? keys : eventResponse };
    },
  };
}

test("confirms receipt using only project-scoped GETs and prints no payload", async () => {
  const mock = api();
  const result = await verifyDelivery(options, env, mock.fetch);
  assert.equal(result.project, "tsilva/aipit");
  assert.equal(result.eventId, eventId);
  assert.equal(result.origin, options.site);
  assert.equal(mock.requests.length, 2);
  assert.equal(mock.requests[1].url.pathname, `/api/0/projects/tsilva/aipit/events/${eventId}/`);
  assert.ok(mock.requests.every(request => !request.init.method && !request.init.body));
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.ok(!JSON.stringify(result).includes(dsn));
  assert.ok(!JSON.stringify(result).includes(env.SENTRY_AUTH_TOKEN));
});

test("rejects inactive or different project keys before reading the event", async () => {
  for (const keys of [[{ isActive: false, dsn: { public: dsn } }], [{ isActive: true, dsn: { public: "different" } }]]) {
    const mock = api(event, keys);
    await assert.rejects(verifyDelivery(options, env, mock.fetch), /does not match an active key/);
    assert.equal(mock.requests.length, 1);
  }
});

test("rejects events from another site, environment, release, or event ID", async () => {
  for (const override of [
    { entries: [{ type: "request", data: { url: "https://other.example" } }] },
    { tags: [{ key: "environment", value: "development" }] },
    { release: { version: "old-sha" } },
    { eventID: "ffffffffffffffffffffffffffffffff" },
  ]) {
    await assert.rejects(verifyDelivery(options, env, api({ ...event, ...override }).fetch), /does not match/);
  }
});

test("requires credentials without performing requests", async () => {
  const mock = api();
  await assert.rejects(verifyDelivery(options, { ...env, SENTRY_AUTH_TOKEN: "" }, mock.fetch), /project:read is required/);
  assert.equal(mock.requests.length, 0);
});

test("supports server-only configuration without publishing the DSN", async () => {
  const result = await verifyDelivery(options, { SENTRY_AUTH_TOKEN: "test-token", SENTRY_DSN: dsn }, api().fetch);
  assert.equal(result.eventId, eventId);
  assert.ok(!JSON.stringify(result).includes(dsn));
});

test("does not expose API response bodies on failure", async () => {
  await assert.rejects(verifyDelivery(options, env, async () => ({ ok: false, status: 403, text: () => dsn })), {
    message: "Sentry read request failed (HTTP 403).",
  });
});

test("rejects malformed arguments and accepts a read-only event lookup", () => {
  assert.throws(() => parseArgs([]), /valid --event-id/);
  assert.throws(() => parseArgs(["--event-id", eventId, "--site", "https://user:password@example.com"]), /Invalid --site/);
  assert.throws(() => parseArgs(["--send"]), /Invalid arguments/);
  assert.equal(parseArgs(["--event-id", eventId]).environment, "production");
});
