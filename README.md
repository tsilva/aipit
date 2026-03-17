<div align="center">
  <img src="https://raw.githubusercontent.com/tsilva/aipit/main/logo.png" width="512" alt="aipit logo" />

  # aipit

  Where AI characters clash in moderator-led debates.

  Next.js app for running structured debates between profiled AI participants through [OpenRouter](https://openrouter.ai/).
</div>

## ✨ Features

- Rich character profiles with editable debate traits, guardrails, and prompt notes
- 28 built-in presets and 20 starter bundles for quick debate setup
- Structured flow: opening, rounds, moderator interventions, and closing synthesis
- Multi-model OpenRouter support with streaming responses and automatic failover
- Shareable replay links for completed debates, backed by immutable snapshots
- Token and cost tracking, plus a raw prompt debug view
- Server-rendered setup state to reduce first-load flicker
- Server-side OpenRouter proxy with optional hosted key support
- Hosted-key guardrails: same-origin checks, rate limiting, model allowlisting, and payload caps
- SEO, analytics consent handling, and optional Sentry reporting
- CI coverage for lint, typecheck, tests, build, and Playwright smoke checks

## 🏗️ How It Works

1. **Setup**: Start from a curated bundle or build the panel manually.
2. **Opening**: The moderator frames the topic and establishes the debate tone.
3. **Rounds**: Debaters argue in sequence, with moderator interventions between rounds.
4. **Consensus**: The moderator closes with a synthesis of the strongest points.
5. **Sharing**: Completed debates can be published to `/s/<slug>` and replayed without new model calls.

Each fresh load starts from a random starter bundle unless you deep-link one with `?id=<bundle-id>`. Starter bundles are chosen from Portugal-focused or global pools using browser locale or geolocation headers when available, and the initial setup is resolved on the server so the first HTML already matches the selected bundle.

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
cp .env.example .env.local
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
| `NEXT_PUBLIC_SENTRY_DSN` | No | Browser Sentry DSN |
| `OPENROUTER_API_KEY` | No | Server-side OpenRouter key for the internal proxy |
| `R2_ACCOUNT_ID` | Required for share links | Cloudflare account ID |
| `R2_BUCKET_NAME` | Required for share links | Private R2 bucket name |
| `R2_ACCESS_KEY_ID` | Required for share links | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | Required for share links | R2 secret access key |
| `R2_OBJECT_PREFIX` | No | Snapshot object prefix, defaults to `shares/` |
| `SENTRY_DSN` | No | Server-side Sentry DSN |

If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, EU visitors must opt in before GA loads. Outside the EU, analytics loads by default unless previously declined in that browser.

## ☁️ Deploy to Vercel

This is a standard Next.js App Router project and deploys directly on Vercel.

For a hosted-key deployment, set `OPENROUTER_API_KEY`. In production, also set `NEXT_PUBLIC_SITE_URL`. If you want share links, add the R2 variables. If you want runtime error reporting, set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.

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
- Shared replay links are public-by-URL, immutable, and reject unsupported history versions.
- Transcript content is rendered as plain text inside the markdown shell so generated links and images do not become active content.

## 📄 License

MIT
