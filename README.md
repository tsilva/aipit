<div align="center">
  <img src="logo.png" width="512" alt="aipit logo" />

  # aipit

  🔥 Where AI characters clash in moderator-led debates 🔥

  A Next.js app that throws richly profiled AI characters against each other in structured, moderator-led debates powered by [OpenRouter](https://openrouter.ai/).

</div>

## ✨ Features

- 🎭 **Rich character profiles** — 12-field character sheets (role, personality, perspective, temperament, debate style, speech style, guardrails, language, gender, nationality, birth date, prompt notes)
- 👥 **28 built-in debater presets** — includes Portuguese political voices plus globally recognizable media and pop-culture characters
- 🎬 **20 curated starter bundles** — cold-start debates seed a moderator, three debaters, and a high-friction topic in one click, with locale-aware audience defaults
- 🏟️ **Structured debate flow** — opening → rounds → interventions → consensus
- 🔗 **Character relationships** — pairwise awareness so debaters know how to engage each other
- 🤖 **Multi-model support via OpenRouter** — characters default to Grok 4.1 Fast, with other supported models still available in the editor
- 🔁 **Automatic model failover** — recoverable model/provider failures rotate to another supported model and the live queue reflects the replacement
- 🧠 **Cache-friendly prompt envelopes** — stable system and session-prefix messages improve OpenRouter prompt-cache reuse and sticky routing during a debate run
- 🚦 **Playback-aware generation backpressure** — once the opening is out, the engine keeps at most one unseen turn buffered ahead of the live playback to avoid spending tokens on debate branches the user never watches
- 🎛️ **Configurable parameters** — rounds, temperature, max tokens, shared directives
- 💬 **Bubble-based playback** — conversation and transcript views
- 📊 **Token and cost tracking** — per-debate usage summary
- 🐛 **Raw prompt debug mode** — inspect exactly what each model receives
- ⚡ **Server-rendered setup view** — the initial bundle, roster, and hosted-key availability are rendered on the server to reduce first-load flicker
- 🔐 **Server-side OpenRouter proxy** — requests flow through Next.js route handlers, with optional Vercel-hosted API key
- 🛡️ **Hosted-key abuse guardrails** — same-origin enforcement, per-IP rate limits, model allowlisting, payload caps, and no server-key metadata exposure
- 📣 **Topic-aware SEO previews** — the homepage and each starter-bundle deep link publish tuned titles, descriptions, canonicals, and generated OG images for richer search and social sharing
- 🧭 **Installable web metadata** — ships a web manifest, Gemini-generated platform icon set, and branded social card so browsers, crawlers, and share targets all get the right assets
- 📈 **Region-aware analytics + observability** — EU visitors must opt in before GA loads, non-EU visitors are tracked by default unless they decline, runtime failures can be reported to Sentry, and proxy responses carry request IDs for debugging
- ✅ **CI-backed release gate** — lint, typecheck, unit tests, build, and Playwright smoke coverage run in GitHub Actions

## 🏗️ How It Works

1. **Setup** — Start from a curated bundle or customize manually: each starter bundle seeds a moderator, three debaters, and a topic; the wand rerolls a fresh starter bundle from the same auto-detected audience pool.
2. **Opening** — The moderator (José Rodrigues dos Santos or Anderson Cooper, depending on the starter bundle) frames the prompt and sets the stage.
3. **Rounds** — Each debater argues in sequence for N rounds. The moderator intervenes between rounds to sharpen the discussion.
4. **Consensus** — The moderator closes with a balanced wrap-up synthesizing the key arguments.

Each fresh page load starts from a random starter bundle unless you deep-link one with `?id=<bundle-id>`, for example `http://localhost:3000/?id=ai-liability-meltdown`. The default starter pool is chosen on the server from the browser locale or geolocation headers when available: `CF-IPCountry=PT` is used when the app sits behind Cloudflare, `X-Vercel-IP-Country=PT` is used on Vercel, and Portuguese visitors default to Portugal-focused debates while everyone else defaults to the global roster. An explicit `?id=` bundle still wins, and the wand rerolls within that same detected pool. That starter bundle is resolved on the server so the first HTML already contains the real setup UI instead of a client-side loading shell. If you want the dumbest possible cold open, `?id=silliest` resolves to `ocean-democracy-meltdown`.

The orchestration engine lives in [`pit-engine.ts`](src/lib/pit-engine.ts) and the full UI in [`pit-studio.tsx`](src/components/pit-studio.tsx).

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- An [OpenRouter](https://openrouter.ai/) API key if you are running in bring-your-own-key mode

### Setup

```bash
git clone https://github.com/tsilva/aipit.git
cd aipit
npm install
```

Create local environment variables:

```bash
cp .env.example .env.local
```

Start the dev server:

```bash
npm run dev
```

Run the full verification suite:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Open [http://localhost:3000](http://localhost:3000).

OpenRouter traffic is proxied through internal Next.js API routes under `src/app/api/openrouter`.
When the shared server key is used, the proxy only accepts browser requests whose `Origin` exactly matches the request URL origin, rate-limits them with best-effort trusted IP detection, clamps completion budgets, strips unsupported OpenRouter options, and only forwards the supported model list exposed in the editor. The hosted payload caps are tuned for debate-sized prompts, so moderator turns can carry character setup plus rolling transcript context without tripping generic chat limits. Hosted key validation also returns an empty success response instead of relaying server-key metadata from OpenRouter. Arbitrary forwarded host/proto/IP headers are not trusted as proof of origin or client identity.

Every debate request now uses a stable prompt prefix per speaker while still sending the full transcript as the live turn packet. That preserves debate quality and makes OpenRouter prompt caching more likely to pay off on cache-capable providers because more of the repeated prompt prefix stays unchanged from turn to turn. The session anchor intentionally avoids repeating the debate topic and shared directive, and the transcript packet uses a compact line-based format to reduce prompt overhead without dropping debate content.

The live studio also applies generation backpressure while a debate is running. After the first response is produced, the client only lets the engine stay one turn ahead of the playback cursor. If the viewer pauses or leaves early, the app stops precomputing deeper turns until playback advances again, which cuts avoidable token spend.

If you deploy behind a custom reverse proxy, sanitize and verify any forwarding metadata there instead of expecting the app to trust raw forwarded headers automatically.

If `OPENROUTER_API_KEY` is configured on the server, the proxy uses that key whenever the browser does not send a user-provided key. Users can still paste their own key, and that key takes precedence for validation and debate runs. Personal keys are kept in memory for the current page session only and are cleared on reload.

Transcript views intentionally render prompt and model output as plain text inside the markdown shell so generated links, images, and other markdown syntax do not become active content.

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Yes in production | Canonical site URL used for metadata, manifest entries, and OG links |
| `NEXT_PUBLIC_OPENROUTER_APP_NAME` | No | OpenRouter attribution title for client-side requests |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | No | Google Analytics 4 measurement ID; EU visitors must opt in before it loads, non-EU visitors can decline per browser |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Browser-side Sentry DSN for client error reporting |
| `OPENROUTER_API_KEY` | No | Server-side OpenRouter API key used by the internal proxy when present |
| `SENTRY_DSN` | No | Server-side Sentry DSN for API route and server runtime error reporting |

If `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, the app uses Cloudflare or Vercel geolocation headers to decide whether consent is required. EU visitors are prompted before the GA4 tag loads; outside the EU the tag loads by default unless analytics was previously declined in that browser. The app then emits events for page views, starter bundle rerolls, character additions, debate starts, debate completions, debate cancellations, debate failures, and transcript copies.

## ☁️ Deploy to Vercel

This app is a standard Next.js App Router project, so Vercel can deploy it without extra adapters.

To prepare a shared hosted key on Vercel, add `OPENROUTER_API_KEY` to the project environment variables. The UI now supports both modes: users can bring their own key, or leave the field empty and rely on the hosted server key.

For production deployments, also set `NEXT_PUBLIC_SITE_URL` to the final canonical origin. If you want production error reporting, set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.

```bash
# Preview deployment
vercel deploy -y

# Production deployment
vercel deploy --prod -y
```

## 🛠️ Tech Stack

- [Next.js](https://nextjs.org/) 16 — App Router, React Server Components
- [React](https://react.dev/) 19
- [TypeScript](https://www.typescriptlang.org/) 5
- [Tailwind CSS](https://tailwindcss.com/) 4
- [react-markdown](https://github.com/remarkjs/react-markdown) — Markdown rendering in debate bubbles
- [OpenRouter](https://openrouter.ai/) — Multi-model AI gateway
- [Vercel](https://vercel.com/) — Deployment platform

## 📁 Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Main page (renders pit-studio)
├── components/
│   ├── pit-studio.tsx          # Main UI component (debate studio)
│   └── pit-studio-entry.tsx    # Entry point / setup screen
└── lib/
    ├── pit-engine.ts           # Debate orchestration engine
    ├── pit.ts                  # Core types and interfaces
    ├── openrouter.ts           # OpenRouter proxy client helpers
    ├── openrouter-server.ts    # Server-side OpenRouter proxy helpers
    ├── openrouter-models.ts    # Available model definitions
    ├── character-presets.ts      # 28 predefined debate characters
    ├── character-profile.ts      # Character profile types/utilities
    └── ...
```

## 📝 Notes

- OpenRouter requests are sent through internal route handlers in `src/app/api/openrouter`.
- `OPENROUTER_API_KEY` is server-only and should not be prefixed with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SITE_URL` should be set explicitly in production so metadata, manifest URLs, and OG links use the canonical domain.
- Starter bundles and personal API keys are not persisted in browser storage; reloads start from a fresh random bundle unless `?id=` is provided.
- EU visitors must opt in before analytics loads. Outside the EU, declining analytics in the current browser keeps the app fully usable and prevents GA from loading.
- `public/sitemap.xml` is generated from the starter bundle list and includes each deep-linkable `/?id=<bundle-id>` route.
- The app also publishes a web manifest at `/manifest.webmanifest` and exposes Gemini-generated favicon, Apple touch, Android Chrome, and social-card assets for richer browser and sharing metadata.
- `npm install` runs `prepare`, which points Git at the repo-managed hook in `.githooks/`; every commit regenerates and stages `public/sitemap.xml`.
- The UI is implemented in `src/components/pit-studio.tsx`.
- The orchestration logic lives in `src/lib/pit-engine.ts`.

## 📄 License

MIT
