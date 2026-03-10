<div align="center">
  <img src="logo.png" width="512" alt="aipit logo" />

  # aipit

  🔥 Where AI personas clash in moderator-led debates 🔥

  A Next.js app that throws richly profiled AI personas against each other in structured, moderator-led debates powered by [OpenRouter](https://openrouter.ai/).

</div>

## ✨ Features

- 🎭 **Rich persona profiles** — 12-field character sheets (role, personality, perspective, temperament, debate style, speech style, guardrails, language, gender, nationality, birth date, prompt notes)
- 👥 **15 built-in presets** — Portuguese political figures (Montenegro, Mortágua, Ventura, Marques Mendes, Gouveia e Melo, Cotrim de Figueiredo, Seguro) + international media & pop-culture voices (Alex Jones, Lex Fridman, Joe Rogan, Donald Trump, Elon Musk, Homer Simpson, Rick Sanchez, The Knight Who Says "Ni")
- 🏟️ **Structured debate flow** — opening → rounds → interventions → consensus
- 🔗 **Persona relationships** — pairwise awareness so debaters know how to engage each other
- 🤖 **Multi-model support via OpenRouter** — Claude, DeepSeek, Grok, Gemini, Mistral, and more
- 🎛️ **Configurable parameters** — rounds, temperature, max tokens, shared directives
- 💬 **Bubble-based playback** — conversation and transcript views
- 📊 **Token and cost tracking** — per-debate usage summary
- 🐛 **Raw prompt debug mode** — inspect exactly what each model receives
- 🎲 **57 built-in controversial debate topics** — random topic picker for instant pit sessions
- 🔐 **Server-side OpenRouter proxy** — requests flow through Next.js route handlers, with optional Vercel-hosted API key
- 🛡️ **Hosted-key abuse guardrails** — same-origin enforcement, per-IP rate limits, model allowlisting, payload caps, and no server-key metadata exposure

## 🏗️ How It Works

1. **Setup** — Pick a topic (or roll a random one), choose your debaters from presets or build custom personas, assign models, and configure round count / temperature / max tokens.
2. **Opening** — The moderator (José Rodrigues dos Santos by default) frames the prompt and sets the stage.
3. **Rounds** — Each debater argues in sequence for N rounds. The moderator intervenes between rounds to sharpen the discussion.
4. **Consensus** — The moderator closes with a balanced wrap-up synthesizing the key arguments.

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

Open [http://localhost:3000](http://localhost:3000).

OpenRouter traffic is proxied through internal Next.js API routes under `src/app/api/openrouter`.
When the shared server key is used, the proxy only accepts same-origin browser requests, rate-limits them per IP, clamps completion budgets, strips unsupported OpenRouter options, and only forwards the supported model list exposed in the editor. Hosted key validation also returns an empty success response instead of relaying server-key metadata from OpenRouter.

If `OPENROUTER_API_KEY` is configured on the server, the proxy uses that key whenever the browser does not send a user-provided key. Users can still paste their own key, and that key takes precedence for validation and debate runs.

## ⚙️ Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_OPENROUTER_APP_NAME` | No | OpenRouter attribution title for client-side requests |
| `OPENROUTER_API_KEY` | No | Server-side OpenRouter API key used by the internal proxy when present |

## ☁️ Deploy to Vercel

This app is a standard Next.js App Router project, so Vercel can deploy it without extra adapters.

To prepare a shared hosted key on Vercel, add `OPENROUTER_API_KEY` to the project environment variables. The UI now supports both modes: users can bring their own key, or leave the field empty and rely on the hosted server key.

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
    ├── persona-presets.ts      # 15 predefined debate personas
    ├── persona-profile.ts      # Persona profile types/utilities
    └── ...
```

## 📝 Notes

- OpenRouter requests are sent through internal route handlers in `src/app/api/openrouter`.
- `OPENROUTER_API_KEY` is server-only and should not be prefixed with `NEXT_PUBLIC_`.
- The UI is implemented in `src/components/pit-studio.tsx`.
- The orchestration logic lives in `src/lib/pit-engine.ts`.

## 📄 License

MIT
