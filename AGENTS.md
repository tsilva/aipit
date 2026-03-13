# CLAUDE.md

## Development Commands

- `npm run dev` — Start Next.js dev server
- `npm run build` — Production build
- `npm run lint` — Run ESLint

## Architecture

Next.js 16 + React 19 + Tailwind CSS 4 single-page application for AI debates ("pits") via OpenRouter.

**Client-side only** — no backend server. The OpenRouter API key is stored in localStorage and API calls are made directly from the browser.

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
