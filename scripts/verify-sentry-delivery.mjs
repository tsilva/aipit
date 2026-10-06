#!/usr/bin/env node

import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";

const HELP = `Usage: node scripts/verify-sentry-delivery.mjs --event-id <id> [options]

Read-only: verify a captured event in the configured Sentry project. Never sends events.

Options:
  --event-id <id>       Required 32-character event ID returned by the SDK
  --site <url>          Expected origin (default: https://aipit.tsilva.eu)
  --environment <name>  Expected environment (default: production)
  --release <sha>       Optionally require the exact deployed release
  --help               Show this help

Uses .env.local/.env or injected environment variables. Requires SENTRY_AUTH_TOKEN
with project:read, the expected runtime DSN, and SENTRY_ORG/SENTRY_PROJECT
(defaults: tsilva/aipit). Prints no DSNs, tokens, or event payloads.
`;

export function parseArgs(argv) {
  const options = { site: "https://aipit.tsilva.eu", environment: "production" };
  const names = { "--event-id": "eventId", "--site": "site", "--environment": "environment", "--release": "release" };
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--help") return { help: true };
    const name = names[argv[index]];
    const value = argv[++index];
    if (!name || !value || value.startsWith("--")) throw new Error("Invalid arguments; use --help.");
    options[name] = value;
  }
  if (!/^[a-f0-9]{32}$/i.test(options.eventId ?? "")) throw new Error("A valid --event-id is required.");
  try {
    const site = new URL(options.site);
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password) throw new Error();
    options.site = site.origin;
  } catch {
    throw new Error("Invalid --site; use an HTTP(S) URL without credentials.");
  }
  return options;
}

export function verifyEvent(event, options) {
  const tags = Object.fromEntries((event.tags ?? []).map(tag => [tag.key, tag.value]));
  const requestUrl = event.entries?.find(entry => entry.type === "request")?.data?.url ?? tags.url;
  let origin;
  try { origin = new URL(requestUrl).origin; } catch { /* Missing URLs fail verification below. */ }
  if (event.eventID?.toLowerCase() !== options.eventId.toLowerCase()) throw new Error("Event ID does not match.");
  if (origin !== options.site) throw new Error("Event origin does not match the declared site.");
  if (tags.environment !== options.environment) throw new Error("Event environment does not match.");
  const release = event.release?.version ?? tags.release;
  if (options.release && release !== options.release) throw new Error("Event release does not match the deployed commit.");
  return { eventId: event.eventID, origin, environment: tags.environment, release, receivedAt: event.dateCreated };
}

export async function verifyDelivery(options, env, fetchImpl = fetch) {
  const token = env.SENTRY_AUTH_TOKEN?.trim();
  const dsn = (env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN)?.trim();
  if (!token || token === "sntrys_your_token_here") throw new Error("SENTRY_AUTH_TOKEN with project:read is required; supply it through an ignored env file or secret launcher.");
  if (!dsn) throw new Error("The expected runtime DSN is required to verify project binding.");
  const org = env.SENTRY_ORG?.trim() || "tsilva";
  const project = env.SENTRY_PROJECT?.trim() || "aipit";
  const base = new URL(env.SENTRY_BASE_URL || env.SENTRY_URL || "https://sentry.io");
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("Sentry API base URL must use HTTPS without credentials.");
  const path = `/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/`;
  async function get(suffix) {
    const response = await fetchImpl(new URL(path + suffix, base), {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Sentry read request failed (HTTP ${response.status}).`);
    return response.json();
  }
  const keys = await get("keys/");
  if (!Array.isArray(keys) || !keys.some(key => key.isActive && key.dsn?.public === dsn)) {
    throw new Error("The runtime DSN does not match an active key in the expected Sentry project.");
  }
  const event = await get(`events/${options.eventId}/`);
  return { project: `${org}/${project}`, ...verifyEvent(event, options) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const result = await verifyDelivery(options, process.env);
  console.log(JSON.stringify({ status: "delivery-verified", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Print only our validation errors, never fetch errors containing request URLs or credentials.
    console.error(error instanceof Error && /^(Invalid |A valid |Event |SENTRY_AUTH_TOKEN |The expected |Sentry API |Sentry read |The runtime )/.test(error.message)
      ? error.message : "Sentry verification failed; no request or response details were printed.");
    process.exitCode = 1;
  });
}
