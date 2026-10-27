# Production delivery

Push to `main` triggers `.github/workflows/production-delivery.yml`. After secret scanning, it calls the trusted workflow in public `tsilva/.github`, pinned to a reviewed full commit SHA. The privileged job checks out only the shared implementation, waits for the same latest main commit's CI, syncs its fixed Production allowlist, deploys that exact commit, and verifies the resulting READY deployment. Vercel's automatic Git deployments remain disabled so they cannot race synchronization.

Infisical remains the source of application secrets. Development uses the existing human CLI login. The shared GitHub reader has Viewer access to the assigned production vaults, and the completed rollout requires its server-side OIDC policy to match the exact approved reusable workflow revision, caller repository IDs, owner ID, main branch and Production context. The trusted `apps.json` selects the source vault and destination from the immutable caller repository ID; app files and inputs cannot change that mapping. The reader itself can access all assigned vaults inside the trusted job. Its token and fetched values never leave that job. The Vercel deployment credential remains in this repository's GitHub Production environment.

The pinned shared source and [trust contract](https://github.com/tsilva/.github/blob/e0c6d64d4fc917ea0e108d27ce8d1a5304aeb3c6/.github/actions/production-delivery/README.md) are authoritative. App repositories retain only the pinned caller workflow. Source/destination mappings, credential handling and boundary tests are maintained centrally; no app code executes in the privileged job.

The workflow does not run on pull requests or forks, export `.env` files, upload secret artifacts, delete secret variables, or change preview/development variables. All required source keys and destination targets are checked before writes. Failed CI or sync prevents deployment. Existing production remains live on failure.

Automatic secret-change delivery uses a standalone Cloudflare Worker with a private GitHub App, independent of application deployments. Each vault's signed General webhook is restricted to `prod`, `/`, and `secrets.modified`. The relay receives event metadata and never fetches application secrets. It verifies raw-body HMACs and timestamps, stores pending routing metadata durably, coalesces bursts and retries dispatches during GitHub outages. A per-repository installation token starts only the fixed entry workflow on `main`. The relay endpoint is `https://production-deployment-relay.tsilva-production-delivery.workers.dev/infisical`. Webhook activation and per-app live verification are required before calling the automatic path operational.

Use **Actions → Production delivery → Run workflow → main** to recover after fixing a failed workflow. A relay acknowledgement confirms durable acceptance, and a GitHub dispatch acknowledgement confirms only that the run was accepted. Neither confirms deployment success. There is no polling schedule. Deployment credentials expire after one year and need rotation before expiry.

Native Infisical syncs are disabled after this workflow has successfully replaced them. Updating a deployment credential in GitHub does not replace application keys in Infisical.

## R2 environments

Configured and verified on 2026-10-14:

| Environment | Bucket | Cloudflare account token | Infisical source |
| --- | --- | --- | --- |
| Local development / Vercel Preview | `aipit-development` | `aipit-development-20261014` | Linked `aipit` project, Development `/` |
| Production | `aipit` | `aipit-production-20261014` | `aipit-production`, Production `/` |

Both tokens permit Object Read & Write only on their named bucket and expire
on October 14, 2027. Rotate before expiry. The Development bucket has no public
development URL or custom domain. Production's existing enabled
`aipit-shares.tsilva.eu` custom domain was retained. Public replay links are served by the application; browser
clients never receive storage credentials. Production bucket names, object
prefixes and existing replay links were retained.

The local helper reads private credentials from the Development vault; local
`R2_BUCKET_NAME=aipit-development` remains non-secret configuration in the ignored
`.env`. Vercel Development and Preview use the same non-production bucket/token.
Preview has no explicit `NEXT_PUBLIC_SITE_URL`, so share links use `VERCEL_URL`.

For rotation, create an overlapping replacement restricted to the same bucket,
verify synthetic write/read/delete and denial on the other bucket, update the
corresponding Infisical source and Vercel environment, and redeploy. Verify share
creation, replay retrieval and existing Production links before revoking the old
token. Historical deployments freeze credentials: after revocation, rebuild an
older application commit with current environment values before rolling back.

Production and Preview call OpenRouter directly with their own server-only `OPENROUTER_API_KEY`. Production delivery reads this key only from this app’s isolated production Infisical project; it never copies a development key. Missing production keys fail closed. AgentBridge is used only for development. Production text requests use `deepseek/deepseek-v4.1-flash-1017` with reasoning disabled.

Production delivery classifies public settings through the pinned `configNames` list; all other allowlisted values remain write-only Secrets. Vercel’s Require Separate Values policy stays enabled: real Production secrets must differ from non-production values. Existing variables are updated by their exact Production IDs. A legacy Secret explicitly listed as public configuration is replaced only in Production because Vercel cannot convert it to Config in place; Preview and Development rows are preserved. Provider responses and credential values are never logged. A failed sync holds deployment; rerun delivery after fixing the named key at its source.
