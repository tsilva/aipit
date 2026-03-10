## LLM Council

Next.js app for throwing persona simulations against each other in moderator-led debates through [OpenRouter](https://openrouter.ai/):

- `debate` mode: the moderator frames the prompt, each debater argues in sequence for `N` rounds, the moderator intervenes between rounds, and the moderator closes with a balanced wrap-up.

Each participant has:

- a model id
- a persona
- access to the shared system directive

## Local development

1. Install dependencies.

```bash
npm install
```

2. Create local env vars.

```bash
cp .env.example .env.local
```

3. Start the app.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The repo does not include an OpenRouter API key. On first load, each user must paste their own key, which the app stores in browser local storage and validates against OpenRouter. A valid key is required before debates can run.

## Environment variables

- `NEXT_PUBLIC_OPENROUTER_APP_NAME`: optional OpenRouter attribution title for client-side requests.

## Deploy to Vercel

This app is a standard Next.js App Router project, so Vercel can deploy it without extra adapters.

1. No backend secret is required. Each browser user must provide and validate their own OpenRouter key locally.
2. Deploy a preview:

```bash
vercel deploy -y
```

3. For production later:

```bash
vercel deploy --prod -y
```

## Notes

- OpenRouter requests are made directly from the client, so browser runs require a validated user-provided OpenRouter API key.
- The UI is implemented in `src/components/pit-studio.tsx`.
- The orchestration logic lives in `src/lib/pit-engine.ts`.
