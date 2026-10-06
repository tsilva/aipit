# CLAUDE.md

## Development Commands

- `npm run dev` — Fetch Infisical development secrets and start Next.js on an available port
- `npm run dev:secrets` — Start with Infisical development secrets and an available port
- `npm run secrets:check` — Check Infisical access and secret presence without displaying values
- `npm run secrets:add -- OPENROUTER_API_KEY` — Add a development secret through the Infisical CLI with a hidden value prompt; existing keys are rejected
- `npm run secrets:migrate` — Copy existing keyenv credentials to the Infisical `aipit` Development environment, verify values without displaying them, and retain Keychain originals
- `npm run build` — Production build
- `npm run lint` — Run ESLint

## Architecture

Next.js 16 + React 19 + Tailwind CSS 4 App Router application for AI debates ("pits") via OpenRouter.

Live site: https://aipit.tsilva.eu

OpenRouter requests go through internal Next.js API routes. Personal OpenRouter API keys are stored in browser localStorage and sent through the proxy for the user's account. If `OPENROUTER_API_KEY` is configured server-side, blank-key hosted debates can use the app's hosted key with same-origin checks, rate limiting, model allowlisting, and payload caps. Completed debate shares are immutable snapshots served through `/s/<slug>`.

### Path Alias

`@/*` → `./src/*`

### Key Files

- `src/components/pit-studio.tsx` — Main UI component (debate studio)
- `src/components/pit-studio-entry.tsx` — Entry point / setup screen
- `src/lib/pit-engine.ts` — Debate orchestration engine
- `src/lib/pit.ts` — Core types and interfaces
- `src/lib/openrouter.ts` — OpenRouter API client
- `src/lib/openrouter-models.ts` — Available model definitions
- `src/lib/character-presets.ts` — Predefined debate characters
- `src/lib/character-profile.ts` — Character profile types/utilities
- `src/app/page.tsx` — Next.js page (renders pit-studio)
- `src/app/layout.tsx` — Root layout

## Guidelines

- Local secrets use Infisical via the saved human CLI login. `.infisical.json` contains the project UUID, cloud domain and `dev` environment only. The Python 3.11+ helpers capture provider output in memory, transport imported credentials through stdin/private pipes, check readback, and remove secrets-manager credentials before launching the app. Never persist or display credential values or include them in command arguments. Keep native Keychain originals during migration. Use separate projects for production when local readers must not access it; Free built-in Viewer permissions cover the entire project. Vercel builds use provider-injected variables and the normal build command; local helpers do not sync or deploy. Explicit `*:bitwarden` / `bitwarden:*` scripts retain the earlier workflow.
- README.md must be kept up to date with any significant project changes
- Do not suggest skill improvements for official OpenAI plugin skills. Skill retrospective suggestions should only be made for project-local or user-maintained skills.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
