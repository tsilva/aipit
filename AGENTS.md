# CLAUDE.md

## Development Commands

- `npm run dev` — Start Next.js dev server
- `npm run build` — Production build
- `npm run lint` — Run ESLint

## Architecture

Next.js 16 + React 19 + Tailwind CSS 4 App Router application for AI debates ("pits") via OpenRouter.

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

- README.md must be kept up to date with any significant project changes
