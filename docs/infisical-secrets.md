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

## Import existing keyenv credentials

```bash
npm run secrets:migrate
npm run secrets:check
```

The import uses keyenv's installed native macOS Keychain backend and respects its
manifest bindings. The user must authorize the migration; macOS may additionally
request Keychain access. Credentials pass through a private pipe and the logged-in
Infisical CLI's stdin. Provider stdout/stderr are captured, never displayed.
No plaintext credential file is created and no value is placed in command
arguments. Only key names and status messages are printed.

All existing destination values are compared before the first write. Differing
values stop migration; matching values are verified and skipped. Each new value
is read back without expansion or personal overrides and compared byte-for-byte.
Missing source keys are skipped. Keychain originals remain. After an interrupted
transfer, rerunning verifies matching entries and imports the remaining keys.
Avoid concurrent dashboard edits during import: the CLI's set operation can
update an entry created between the final absence check and its request.

The helpers use your saved human login. Clear temporary machine-token variables
from your shell; they are stripped from the helpers' provider/app environments.
The human CLI login must have write access for migration and adding secrets.

## Add or use credentials

```bash
npm run secrets:add -- OPENROUTER_API_KEY
npm run dev
npm run dev:secrets
npm run build:secrets
npm run start:secrets
```

Adding prompts for the value with hidden input, rejects an existing key, and
verifies readback. Intentional updates can be made in the Infisical dashboard.
`npm run dev` fetches Infisical secrets by default; `dev:secrets` is equivalent.
Both select an available port. A fetch/login failure stops before launching Next.js.
The app helpers inject the four private server keys in `.keyenv.toml`:
`OPENROUTER_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and
`SENTRY_AUTH_TOKEN`, plus the optional `SENTRY_SMOKE_TEST_TOKEN` diagnostic credential. Arbitrary stored variables cannot override `PATH` or launch
settings. The check prints presence only and makes no API/model requests.
Dev/start select an available port; open the URL printed by the server.

All four keys are optional. Without a server OpenRouter key, enter your personal
key in the browser. Keep non-secret and public configuration in `.env` or
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

Development and production use separate OpenRouter API keys, each with a $10 total
spend limit, no recurring reset, and no expiry. Each environment also has its own
Sentry `org:ci` build token. These upload source maps; event lookup requires a
separate token with `project:read`, never additional read scopes on the app token.
R2 credentials were copied from the matching existing Vercel environments.

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
`start:bitwarden`, `bitwarden:check`, `bitwarden:add` and `bitwarden:migrate`.

Official references: [CLI](https://infisical.com/docs/cli/overview),
[machine authentication](https://infisical.com/docs/documentation/platform/identities/universal-auth),
[access roles](https://infisical.com/docs/documentation/platform/access-controls/role-based-access-controls).

Local R2 sharing also needs the non-secret `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, and
optional `R2_OBJECT_PREFIX` in your ignored `.env`. The credentials come from Infisical.
The development launcher supplies the selected localhost port as `NEXT_PUBLIC_SITE_URL`
unless explicitly overridden in the shell. Production uses `https://aipit.tsilva.eu`.
