# Bitwarden Secrets Manager

The primary local workflow now uses [Infisical](infisical-secrets.md). This guide
retains the earlier Bitwarden workflow under explicitly named commands.

Use Bitwarden as the source of local server credentials and inject them into the
application with `npm run dev:bitwarden`. The application still reads its normal
environment variables; no Bitwarden SDK is needed in the application.

## Create the development project

1. Sign in to your existing Bitwarden account on your usual US or EU server.
2. Create or select a Free organization. In its Admin Console, open
   **Billing → Subscription** and enable **Subscribe to Secrets Manager**.
3. Open Secrets Manager from the product switcher. Create a project named
   `aipit` and copy its project UUID.
4. Optionally add `OPENROUTER_API_KEY` with a development OpenRouter key for
   server-hosted debates. Otherwise enter your personal key in the browser.
   Existing keyenv credentials can be copied with the migration command below.
5. Create a machine account named `aipit-local`. Give it **Can read** access to
   `aipit` only. Create an access token for this machine account and
   save it in your password manager. The token is shown only once.

Official guides: [setup](https://bitwarden.com/help/secrets-manager-quick-start/)
and [CLI](https://bitwarden.com/help/secrets-manager-cli/).

## Install the CLI

Install the native `bws` executable using Bitwarden's
[CLI installation instructions](https://bitwarden.com/help/secrets-manager-cli/#download-and-install)
and ensure it is on your `PATH`. This is a separate CLI from Password Manager's
`bw` command. Check installation with `bws --version`.

For an account on the EU server, configure the endpoint once:

```bash
bws config server-base https://vault.bitwarden.eu
```

For a US account, the default endpoint is appropriate. Do not change region
based on your physical location; use the server that contains your account.

## Run locally

### Copy existing keyenv credentials

For the initial migration, give a temporary machine account **Can read, write**
access to the Bitwarden `aipit` project, then run:

```bash
npm run bitwarden:migrate
```

The command clears inherited app keys so keyenv reads its declared Keychain
accounts. It copies the available credentials directly through the SDK, checks
each stored value against its source without displaying either, and retains all
Keychain originals. Missing optional credentials are skipped. Existing matching
values are verified and skipped; differing values or duplicate entries stop the
transfer before new writes. A retry after a partial transfer skips verified
matching entries.

The token comes from `BWS_ACCESS_TOKEN` if supplied by your secret provider, or a
hidden terminal prompt. Keyenv may display its access prompt and macOS may ask
for Keychain access. Only non-secret project settings are saved locally. After
testing with a read-only machine token, revoke the temporary write token in
Bitwarden.

### Add a key from the terminal

With `uv` and `bws` installed, run:

```bash
npm run bitwarden:add -- OPENROUTER_API_KEY
```

Paste your `aipit-import` machine token at the first hidden prompt, and the
OpenRouter key at the second hidden prompt. The import machine account needs
**Can read, write** access to `aipit`. The helper discovers that
project automatically and saves its UUID and US/EU endpoint in
`.bitwarden.local.json`; neither credential is saved there. Your confirmed US
account is the default when no local server setting exists.

The helper uses the official Python SDK with locked dependencies and a seven-day
release cutoff. Only project metadata goes through CLI output; secret values go
through the SDK in process memory, avoiding the CLI's value arguments and default
secret output. Existing keys are never overwritten. It supports the four private
server credentials listed in `.keyenv.toml`. Keep existing Keychain entries while
testing. SDK errors are reported without their potentially sensitive details.

After importing, use a separate `aipit-local` machine token with **Can read**
permission for checks and application runs. Save tokens in your password manager
and paste them at the prompts when needed.

### Configure without the import helper

From the repository root, copy the configuration example:

```bash
cp bitwarden.config.example.json .bitwarden.local.json
```

In `.bitwarden.local.json`, replace `projectId` with the UUID of
`aipit`, and set `serverUrl` to the server where your Bitwarden
account lives (`https://vault.bitwarden.com` or `https://vault.bitwarden.eu`).
This local configuration is gitignored and contains no credentials. Your vault
address identifies the server region. If you need help identifying the project
UUID, open **Secrets Manager → Projects → aipit** and use its
project-page URL, or use `bws project list` in an authenticated terminal to list
project names and IDs. Project IDs are different from machine-account IDs.

### Check and launch

Run:

```bash
npm run bitwarden:check
npm run dev:bitwarden
```

Each command prompts for the machine token with hidden input. Paste it at that
prompt. It is used for that invocation and is never saved or placed in command
arguments. Do not put it in a command, dotenv file, configuration file, manifest,
or chat. `bitwarden:check` checks access and reports optional-secret presence without
displaying values or making OpenRouter requests. Open the URL printed by Next.js.
If a server OpenRouter key is configured, leave the personal key blank in the app
to exercise it; otherwise enter your personal OpenRouter key in the app.

For automation, a secret provider may supply `BWS_ACCESS_TOKEN` instead of using
the prompt. `BWS_PROJECT_ID` and `BWS_SERVER_URL` can override local configuration.
With no server URL configured, the launcher uses the CLI's existing configuration.

The launcher checks that the project UUID and token are supplied, then uses
`bws run --project-id ... --no-inherit-env` to start the application. The token
is used by `bws` and is not inherited by the application. Other shell variables
are also dropped, except those retained by `bws`, such as `PATH`. Put non-secret
application configuration in `.env` or `.env.local`, where Next.js can load it.

Before switching, remove populated assignments for migrated secrets from local
dotenv files. Keep existing Keychain entries until the Bitwarden workflow has
been verified. This launcher does not implement keyenv's approvals, project
bindings, or plaintext-assignment checks. The launched application and its
descendants can read the injected secrets.

If you supplied the token through your shell instead of the prompt, clear it
after stopping the process:

```zsh
unset BWS_ACCESS_TOKEN
```

Use `npm run build:bitwarden` and `npm run start:bitwarden` with the same development
project for local production-build checks. These commands do not deploy or
synchronize secrets to Vercel.

## Optional local features

Add these secrets to `aipit` only if those features are needed:

| Secret | Purpose |
| --- | --- |
| `R2_ACCESS_KEY_ID` | R2 replay-storage access |
| `R2_SECRET_ACCESS_KEY` | R2 replay-storage authentication |
| `SENTRY_AUTH_TOKEN` | Sentry source-map upload or issue queries; use the token permissions appropriate to the operation |

R2 also needs `R2_ACCOUNT_ID` and `R2_BUCKET_NAME`; these can remain in non-secret
local configuration. Public values such as `NEXT_PUBLIC_SITE_URL` and browser
Sentry/analytics identifiers can also remain there. Never give private keys a
`NEXT_PUBLIC_` prefix.

## Vercel deployment

For a later deployment migration, create a separate `aipit-production` project
and a separate machine identity for synchronization. Development credentials
should not grant access to production secrets. Vercel still needs its own
environment variables populated for hosted builds and functions; running a
local Bitwarden command does not configure them automatically.

Keep production values in Vercel while validating the local trial. A subsequent
sync workflow can copy production secrets from Bitwarden into Vercel, followed
by a new deployment. Vercel environment changes apply to new deployments.
