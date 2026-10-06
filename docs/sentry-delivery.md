# Verify Sentry delivery

Runtime configuration and an SDK-generated event ID do not establish receipt. Use a
real captured event and confirm that exact ID in the expected Sentry project.

The app already initializes Sentry through `src/instrumentation-client.ts`,
`src/instrumentation.ts`, `sentry.server.config.ts`, and `sentry.edge.config.ts`.
Browser capture and request-scoped server captures respect error-reporting consent;
performance tracing remains disabled. Keep server-only DSNs on the server when
testing server-only deployments; no browser instrumentation is needed for that case.

## Procedure

1. Resolve the deployment currently serving `aipit.tsilva.eu` in Vercel and record its
   exact commit. Confirm its runtime DSN matches an active key in `tsilva/aipit`.
   Supply the matching runtime DSN and a Sentry token with `project:read` through
   injected environment variables or an ignored `.env.local`. Never paste credentials
   into commands, reports, or chat. Do not assume a source-map upload token grants
   read access.
2. Prefer an existing event from that deployment. If a synthetic event is needed,
   obtain approval before sending it. In a fresh browser on the production domain,
   enable only **Error reporting** through the app's privacy preferences, leaving
   analytics off. Then invoke the existing `window.__sentryTest()` helper once in
   DevTools. A privacy/disabled message is not an event ID; do not bypass it. Keep
   the tab open until the SDK's envelope request completes. Record its HTTP status
   without copying its URL, DSN, authentication parameters, or payload.
3. After ingestion, query the exact event using this read-only command:

   ```bash
   node scripts/verify-sentry-delivery.mjs --event-id <event-id> --release <deployed-sha>
   ```

   The verifier checks an active DSN binding in the expected project and requires
   the exact event ID, production origin, `production` environment, and requested
   release. It makes only GET requests and prints no credentials or event payloads.
   A 404 can mean ingestion is pending; retry after a short wait. Confirm the same
   event in the project's Sentry dashboard. Collection HTTP success alone is not
   sufficient to mark the issue resolved.
4. Return the test browser's error-reporting preference to disabled or discard its
   temporary context. Record the event ID, project, deployment/commit, collection
   status, and dashboard receipt time. Deployment and external configuration
   changes require separate approval.

Sentry documents [project key lookup](https://docs.sentry.io/api/projects/list-a-projects-client-keys/)
and [retrieving an exact event](https://docs.sentry.io/api/events/retrieve-an-event-for-a-project/).

## Audit on 2026-10-05

- Scope: one delivery instance, `aipit.tsilva.eu`, Vercel team `tsilvas-projects`.
- Production deployment: `dpl_BjFDbiEx3xstaecrkH9fQf7ngyaz`, Ready; commit
  `19ce538da4619067a5f13d530da638b5a5274e65`, also local `main` HEAD.
- Production configuration contains both `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`.
  The served client bundle contains Sentry initialization, consent gating, the test
  helper, and the matching release. This is source/configuration evidence, not
  proof that a browser event was delivered.
- The served bundle hardcodes `SENTRY_ENVIRONMENT: "development"` despite
  `NODE_ENV: "production"`. `next.config.ts` omitted environment metadata when
  resolving the browser build configuration. The local fix passes deployment,
  Node, and explicit Sentry environment metadata through to that resolver.
- Delivery remains **unverified**: no local Sentry read token was available, no
  synthetic event was authorized or sent, and the sandbox prevented Chromium from
  launching. The browser check therefore could not be completed. No deployment or
  external configuration was changed. Existing production events from this commit
  may require `--environment development` for a historical receipt lookup; this
  does not confirm that the local environment-label fix has reached production.
- Validation: 35 focused Sentry/consent/configuration tests and seven read-only
  verifier tests passed, along with ESLint, TypeScript, and a production build using
  dummy DSNs with source-map upload and Next.js telemetry disabled. The generated
  client bundle now contains `SENTRY_ENVIRONMENT: "production"`. Run verifier tests
  with `node --test scripts/verify-sentry-delivery.test.mjs`.

## Migration verification on 2026-10-06

Separate `aipit-development-build` and `aipit-production-build` organization tokens
with `org:ci` are stored in the corresponding Infisical environments. These tokens
only support builds/uploads; the receipt lookup uses a separately authorized read token.

The runtime hooks now live in `src`, alongside `src/app`. The deployed protected
`POST /api/sentry-smoke` endpoint checks a private `x-sentry-smoke-token` header,
explicit error-reporting consent, runtime enablement, and a DSN before capturing.
Invalid authentication and denied consent return 404 without capturing. The diagnostic
token is supplied from Infisical; never paste it into a browser console or report.

Verified server receipt: `f0d0f6ce395948a9a89b09768dd5f05a`, project `tsilva/aipit`,
environment `production`, release `19ce538da4619067a5f13d530da638b5a5274e65`,
deployment `dpl_AUFmvaVo6ueBrDtx4GkHq7ttRVC1`. The exact event was fetched from
Sentry and its unique smoke tag matched the endpoint response. Its stack trace
resolved to `src/app/api/sentry-smoke/route.ts` with original source context,
confirming source-map processing. This verifies a deployed server exception, not
a separately generated browser exception. Browser capture still requires user consent.

The prior audit above describes the old deployment and has been superseded by this
received-event check. Local capture remains opt-in with `NEXT_PUBLIC_SENTRY_ENABLED=true`;
development keys are independently stored and usable for local builds.
