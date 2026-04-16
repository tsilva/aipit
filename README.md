<div align="center">
  <img src="./logo.png" width="520" alt="The AI Pit logo" />

  # The AI Pit

  AI debate simulator for turning any topic into a moderator-led showdown between custom or preset AI characters.

  Next.js app for running structured debates between profiled AI participants through [OpenRouter](https://openrouter.ai/).
</div>

## ✨ Features

- Rich character profiles with editable debate traits, guardrails, prompt notes, and structured authentic-voice guidance for built-in presets
- 41 built-in character presets, 7 moderator presets, and 31 starter bundles for quick debate setup
- Optional preset speaking clips that swap onto the active live speaker once the talking video has loaded
- Structured flow: opening, rounds, moderator interventions, and closing synthesis
- Multi-model OpenRouter support with streaming responses and automatic failover
- Shareable replay links for completed debates, backed by immutable snapshots
- Token and cost tracking, plus a raw prompt debug view
- Server-rendered setup state to reduce first-load flicker
- Server-side OpenRouter proxy with optional hosted key support
- Hosted-key guardrails: same-origin checks, rate limiting, model allowlisting, and payload caps
- SEO, analytics consent handling, optional Sentry reporting, and optional Sentry source map upload
- CI coverage for lint, typecheck, tests, build, and Playwright smoke checks

## 🏗️ How It Works

1. **Setup**: Start from a curated bundle or build the panel manually.
2. **Opening**: The moderator frames the topic and establishes the debate tone.
3. **Rounds**: Debaters argue in sequence, with moderator interventions between rounds.
4. **Consensus**: The moderator closes with a synthesis of the strongest points.
5. **Sharing**: Completed debates can be published to `/s/<slug>` and replayed without new model calls.

Each fresh load starts from a random starter bundle unless you deep-link one with `?id=<bundle-id>`. First-load starter bundles are chosen from Portugal-focused or global pools using browser locale or geolocation headers when available, and the initial setup is resolved on the server so the first HTML already matches the selected bundle. Every built-in participant preset appears in at least one curated starter bundle, and after first load the landing-page wand rerolls from the full starter bundle pool without audience restrictions.

Built-in debaters now carry a structured voice profile in addition to worldview and guardrails. The engine injects cadence, syntax, rhetorical habits, disfluency tolerance, segue style, lexical habits, cleanup bans, and a relevance floor directly into member prompts so distinctive characters sound less like polished archetypes and more like how they actually talk, while moderators remain evidence-focused and coherent.

Core orchestration lives in [`src/lib/pit-engine.ts`](src/lib/pit-engine.ts) and the main UI lives in [`src/components/pit-studio.tsx`](src/components/pit-studio.tsx).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- An [OpenRouter](https://openrouter.ai/) API key if you are not using a hosted server key

### Setup

```bash
git clone https://github.com/tsilva/aipit.git
cd aipit
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Run the full verification suite:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

OpenRouter traffic goes through internal Next.js route handlers under `src/app/api/openrouter`. If `OPENROUTER_API_KEY` is configured on the server, the app can use that hosted key when the browser does not provide its own; a user-supplied key still takes precedence. Shared replays are immutable snapshots stored separately from live debate execution.

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Yes in production | Canonical site URL for metadata, manifest entries, and OG links |
| `NEXT_PUBLIC_OPENROUTER_APP_NAME` | No | OpenRouter attribution label |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Google Analytics 4 measurement ID |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Browser Sentry DSN. If omitted, the app falls back to `SENTRY_DSN` |
| `NEXT_PUBLIC_SENTRY_ENABLED` | No | Force-enable Sentry outside production for local or preview validation |
| `OPENROUTER_API_KEY` | No | Server-side OpenRouter key for the internal proxy |
| `R2_ACCOUNT_ID` | Required for share links | Cloudflare account ID |
| `R2_BUCKET_NAME` | Required for share links | Private R2 bucket name |
| `R2_ACCESS_KEY_ID` | Required for share links | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Required for share links | R2 secret access key |
| `R2_OBJECT_PREFIX` | No | Snapshot object prefix, defaults to `shares/` |
| `SENTRY_DSN` | No | Server-side Sentry DSN. If omitted, the app falls back to `NEXT_PUBLIC_SENTRY_DSN` |

If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, EU visitors must opt in before GA loads. Outside the EU, analytics loads by default unless previously declined in that browser.

Runtime Sentry reporting is production-only by default when a DSN is present. To validate Sentry locally or on preview deploys, set `NEXT_PUBLIC_SENTRY_ENABLED=true`.

Production builds now fail fast when Sentry is only partially configured. If you enable build-time source map upload with `SENTRY_AUTH_TOKEN`, at least one runtime DSN must also be present. If only one of `NEXT_PUBLIC_SENTRY_DSN` or `SENTRY_DSN` is set, the app reuses that DSN for both browser and server runtimes.

For source map upload during builds, set `SENTRY_AUTH_TOKEN` in `.env` for local builds or in the deployment environment for hosted builds. The repo defaults `SENTRY_ORG` to `tsilva`, `SENTRY_PROJECT` to `aipit`, and `SENTRY_BASE_URL` to `https://sentry.io`; override them only if you need a different Sentry org, project, or self-hosted base URL.

For read-only issue queries, set `SENTRY_AUTH_TOKEN` in `.env` with `org:read`, `project:read`, and `event:read`. The same default org, project, and base URL apply there too. Then run:

```bash
npm run sentry:issues -- --help
```

## ☁️ Deploy to Vercel

This is a standard Next.js App Router project and deploys directly on Vercel.

For a hosted-key deployment, set `OPENROUTER_API_KEY`. In production, also set `NEXT_PUBLIC_SITE_URL`. If you want share links, add the R2 variables. If you want runtime error reporting, set either `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN`; if both are set, each runtime uses its matching key, and if only one is set, the app reuses it for both. If you want build-time source map upload, set `SENTRY_AUTH_TOKEN`; `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_BASE_URL` only need to be set when you want to override the repo defaults.

```bash
# Preview deployment
vercel deploy -y

# Production deployment
vercel deploy --prod -y
```

## 🛠️ Tech Stack

- [Next.js](https://nextjs.org/) 16
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) 5
- [Tailwind CSS](https://tailwindcss.com/) 4
- [react-markdown](https://github.com/remarkjs/react-markdown)
- [OpenRouter](https://openrouter.ai/)
- [Vercel](https://vercel.com/)

## 📁 Project Structure

```text
src/
├── app/
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── pit-studio.tsx
│   └── pit-studio-entry.tsx
└── lib/
    ├── pit-engine.ts
    ├── pit.ts
    ├── openrouter.ts
    ├── openrouter-server.ts
    ├── openrouter-models.ts
    ├── character-presets.ts
    └── character-profile.ts
```

## 📝 Notes

- OpenRouter requests are proxied through `src/app/api/openrouter`.
- `OPENROUTER_API_KEY` is server-only and should not use a `NEXT_PUBLIC_` prefix.
- Starter bundles and personal API keys are not persisted across page reloads.
- Built-in presets can optionally define `speakingAvatarUrl`; the live stage keeps still images in the queue and transcript, and only swaps the main active-speaker avatar to video after the clip is ready.
- Avatar media under `public/avatars` is served with immutable year-long caching; the app appends content-hash query versions generated by `scripts/generate-avatar-asset-versions.mjs` so changed files get fresh URLs.
- Shared replay links are public-by-URL, immutable, and reject unsupported history versions.
- Transcript content is rendered as plain text inside the markdown shell so generated links and images do not become active content.

## 📄 License

MIT
