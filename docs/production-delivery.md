# Production delivery

Push to `main` triggers `.github/workflows/production-delivery.yml`. It tests delivery boundaries and waits for the same commit’s CI before retrieving secrets. Then it syncs the fixed production allowlist in `.github/scripts/production-delivery.json`, deploys that exact commit, and verifies the resulting deployment. Vercel’s automatic Git deployments are disabled so they cannot race the sync.

Infisical remains the source of application secrets. Local development uses the existing human CLI login and Development environment. Production uses one shared GitHub reader with Viewer access to the assigned production vaults. GitHub OIDC issues a 15-minute read-only session only for approved repositories on main, in the Production environment and delivery workflow. Each repository’s script pins its own source vault and key allowlist; the shared identity itself can read all assigned production vaults. The provider credential is a project-scoped `VERCEL_TOKEN` stored in the repository’s GitHub Production environment. No general CLI login is copied into GitHub.

The workflow does not run on pull requests or forks, export `.env` files, upload secret artifacts, delete destination variables, or change preview/development variables. All required source keys and destination targets are checked before writes. Failed CI or sync prevents deployment. Existing production remains live on failure.

After changing a production secret, use **Actions → Production delivery → Run workflow → main** to sync and deploy. A secret change alone does not trigger delivery. There is no schedule or automatic retry; rerun a failed workflow manually after fixing the cause. For an old failed commit superseded by a newer main commit, run a fresh workflow on main. Deployment tokens expire after one year and need rotation before expiry.

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

Production and Preview call OpenRouter directly with their own server-only `OPENROUTER_API_KEY`. Production delivery reads this key only from this app’s isolated production Infisical project; it never copies a development key. Missing production keys fail closed. AgentBridge is used only for development. Production text requests use `deepseek/deepseek-v4.1-flash` with reasoning disabled.
