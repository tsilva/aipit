# Infisical development secrets

Install the native CLI and sign into the same region as your dashboard:

```bash
brew install infisical/get-cli/infisical
export INFISICAL_DOMAIN=https://app.infisical.com
infisical login
infisical init
```

For EU Cloud use `https://eu.infisical.com`. Select your organization and the
Secrets Management project `aipit`. `.infisical.json` contains only project
metadata; set its `domain` to your cloud URL and `defaultEnvironment` to `dev`.
The helpers explicitly select that linked UUID, domain, Development environment
and root folder, regardless of an inherited project/environment override.
Python 3.11+ is required; the helpers have no third-party Python dependencies.

## Verify development secrets

```bash
npm run secrets:check
```

The legacy Keyenv manifest and one-time import commands have been retired.
Retain Keychain originals until migration and provider rotation are verified.
The helpers use your saved human Infisical login. Write access is needed only
when adding or updating secrets. Manager tokens are stripped from provider and
application environments.

## Add or use credentials

```bash
npm run secrets:add -- AGENTBRIDGE_API_KEY
npm run dev
npm run dev:secrets
npm run build:secrets
npm run start:secrets
```

Adding prompts for the value with hidden input, rejects an existing key, and
verifies readback. Intentional updates can be made in the Infisical dashboard.
`npm run dev` fetches Infisical secrets by default; `dev:secrets` is equivalent.
Both select an available port. A fetch/login failure stops before launching Next.js.
The app helpers inject the four private server keys allowlisted in
`scripts/infisical/common.py`:
`AGENTBRIDGE_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`SENTRY_AUTH_TOKEN`, plus the optional `SENTRY_SMOKE_TEST_TOKEN` diagnostic credential. Arbitrary stored variables cannot override `PATH` or launch
settings. The check prints presence only and makes no API/model requests.
Dev/start select an available port; open the URL printed by the server.

All four keys are optional. Models use the configured AgentBridge endpoint; the
browser does not accept personal provider keys. Keep non-secret and public configuration in `.env` or
`.env.local`; Next.js loads it normally. Remove populated plaintext assignments
for migrated private keys. The helpers clear inherited copies and inject empty
values for missing keys so an unset Infisical key cannot silently fall back to
a stale shell or dotenv credential.

## Access and deployments

Human CLI login is appropriate for initial setup and interactive development.
For later unattended workloads, use scoped machine identities and separate
credentials per device/automation. On Free, the built-in Viewer role reads every
environment in its project. Keep production in a separate project when local
readers must not access production credentials.

The development project is `aipit` (`533e0bdd-5b7d-493e-abbc-d3935a9bce7b`),
using Development (`dev`) at `/`. Local commands fetch from this project only.

Production uses the separate project `aipit-production`
(`c18b9241-653d-4426-b9e2-3949352c0d76`), Production (`prod`) at `/`.
Its `aipit-production-vercel` Secret Sync uses the organization connection
`vercel-sync` and targets Vercel project `aipit`, Production only. Secret deletion
protection is enabled and synced variables are marked Sensitive in Vercel.
No Infisical token is needed inside the deployed application: the sync supplies
Vercel's native environment variables, and Vercel builds use `npm run build`.

Automatic syncing is enabled and the initial production sync has succeeded.
Synced production variables are Sensitive and deletion protection is enabled.
Redeploy after changing a production secret: sync updates the Vercel configuration,
while existing deployments retain their original environment. Preview remains
separately configured in Vercel.

Upstream OpenRouter keys and spend limits belong to AgentBridge. Configure a
reachable gateway URL and, when required, an environment-specific gateway token. Each environment also has its own
Sentry `org:ci` build token. These upload source maps; event lookup requires a
separate token with `project:read`, never additional read scopes on the app token.
R2 credentials are stored separately for Development and Production, with one
bucket-restricted token per environment. Vercel Preview uses the Development token.

Development servers use separate `.next-dev-<pid>` directories so a new managed
run can be verified without stopping existing servers. Development remains pinned
to the `aipit` project and `dev` environment; production overrides are rejected.

The production-only `SENTRY_SMOKE_TEST_TOKEN` enables `/api/sentry-smoke` for
operator verification. The POST requires that private token in
`x-sentry-smoke-token`, explicit error-reporting consent, and enabled Sentry.
Missing or incorrect credentials return 404 without sending an event. This endpoint
captures a labeled synthetic exception and returns an event identifier only after
flushing. Confirm the exact identifier in Sentry before claiming delivery.

Earlier Bitwarden helpers are retained as `dev:bitwarden`, `build:bitwarden`,
`start:bitwarden`, `bitwarden:check` and `bitwarden:add`.

Official references: [CLI](https://infisical.com/docs/cli/overview),
[machine authentication](https://infisical.com/docs/documentation/platform/identities/universal-auth),
[access roles](https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls).

Local R2 sharing also needs the non-secret `R2_ACCOUNT_ID`, `R2_BUCKET_NAME=aipit-development`, and
optional `R2_OBJECT_PREFIX` in your ignored `.env`. The credentials come from Infisical.
The development launcher supplies the selected localhost port as `NEXT_PUBLIC_SITE_URL`
unless explicitly overridden in the shell. Production uses `https://aipit.tsilva.eu`.

R2 credentials are separate by environment. The Development credentials access
only `aipit-development`; Production credentials access only `aipit`. See
[R2 environments](production-delivery.md#r2-environments) for rotation and expiry.

Production builds and `next start` require the deployment’s own `OPENROUTER_API_KEY`. The development launcher supplies AgentBridge only; it does not deliver production credentials.
