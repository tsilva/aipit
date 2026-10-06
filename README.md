<div align="center">
  <img src="./public/brand/logo/logo-1024.png" alt="The AI Pit logo" width="512" />

  <h1>The AI Pit</h1>

  <p><strong>🔥 Where AI personas clash in moderator-led debates 🔥</strong></p>

  <p><a href="https://aipit.tsilva.eu">Live Demo</a> · <a href="https://github.com/tsilva/aipit">GitHub</a></p>
</div>

The AI Pit turns a topic into a structured debate with a moderator, multiple AI participants, opening statements, rounds, interventions, and a closing synthesis. It is built with Next.js, React, Tailwind CSS, and OpenRouter.

Use the preset characters and starter bundles to begin quickly, or build a custom lineup with up to four people total: one moderator and as many as three debaters. Random lineups sample eligible personalities directly, with Portuguese personalities included only for clients in Portugal. Completed debates can be saved as replay links when Cloudflare R2 storage is configured.

## Install

Requires Node.js 20.17+ (20.x) or 22.9+ and npm 11.16.0, pinned in `package.json`.

```bash
git clone https://github.com/tsilva/aipit.git
cd aipit
npm install --global "$(node -p "require('./package.json').packageManager")" --ignore-scripts
npm ci
npm run dev:secrets
```

Use `npm ci` to install the committed `package-lock.json`; use `npm install` when intentionally updating dependencies. `.npmrc` enforces a seven-day minimum release age for dependency resolution and disables installation lifecycle scripts. CI uses the same pinned npm version and explicitly installs the Playwright browser separately.

You can paste a personal OpenRouter API key in the app. If users leave the key blank and `OPENROUTER_API_KEY` is supplied to the server, prompts are processed through The AI Pit's built-in OpenRouter key and The AI Pit's OpenRouter account.

## Commands

```bash
npm run dev
npm run dev:secrets
npm run secrets:check
npm run secrets:add -- OPENROUTER_API_KEY # add a development key with hidden value input
npm run secrets:migrate
npm run build:secrets
npm run start:secrets
npm run build         # generate avatar asset versions and build production output
npm run start         # serve the production build
npm run lint          # run ESLint
npm run typecheck     # run TypeScript checks
npm run test          # run Vitest tests
npm run test:e2e      # run Playwright tests
npm run sentry:issues # query Sentry issues with a read-only token
```

## Configuration

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_OPENROUTER_APP_NAME=The AI Pit
OPENROUTER_API_KEY=
```

Optional production features use these variables:

```bash
NEXT_PUBLIC_GA_MEASUREMENT_ID= # Google Analytics 4
NEXT_PUBLIC_SENTRY_DSN=        # browser Sentry DSN
NEXT_PUBLIC_SENTRY_ENABLED=    # force Sentry outside production
SENTRY_DSN=                    # server Sentry DSN
SENTRY_AUTH_TOKEN=             # source map upload; org:ci build token
SENTRY_SMOKE_TEST_TOKEN=       # optional protected deployment diagnostic
SENTRY_ORG=                    # defaults to tsilva
SENTRY_PROJECT=                # defaults to aipit
SENTRY_BASE_URL=https://sentry.io

R2_ACCOUNT_ID=                 # required for share links
R2_BUCKET_NAME=                # required for share links
R2_ACCESS_KEY_ID=              # required for share links
R2_SECRET_ACCESS_KEY=          # required for share links
R2_OBJECT_PREFIX=shares/       # optional share snapshot prefix
```

`NEXT_PUBLIC_SITE_URL` should be set in production unless the deployment platform provides a canonical Vercel URL.

Sentry delivery must be confirmed with an event received in the expected project.
The [delivery verification procedure](docs/sentry-delivery.md) covers consent,
production commit checks, and the read-only `scripts/verify-sentry-delivery.mjs`
verifier. Browser events use the deployment environment, unless `SENTRY_ENVIRONMENT`
explicitly overrides it. Obtain approval before synthetic events or deployment.

## Notes

- OpenRouter calls go through the internal Next.js routes under `src/app/api/openrouter`.
- Personal OpenRouter keys are stored in browser `localStorage` and still transit the app proxy so OpenRouter can fulfill requests.
- Hosted OpenRouter access uses The AI Pit's built-in OpenRouter key, processes prompts through The AI Pit's OpenRouter account, and applies same-origin checks, simple rate limits, model allowlisting, and payload caps.
- Share links are public-by-URL replay snapshots stored in Cloudflare R2. Replay pages do not make new model calls.
- Google Analytics and browser Sentry are optional and respect the app's onboarding privacy preference controls.
- Avatar assets in `public/avatars` are served with long-lived cache headers and versioned by `scripts/generate-avatar-asset-versions.mjs`.
- The app is an experimental AI simulation, not an advice service or official communications channel.

## Architecture

![The AI Pit architecture diagram](./architecture.png)

## License

[MIT](LICENSE)
