---
name: add-character-preset
description: Add or update debate character presets for the aipit project. Use when Codex needs to create a new participant character, extend the Portuguese or global roster, add or revise character relationships, source and process a real avatar image, update attribution, add search/test coverage for preset discovery, or wire a new preset into starter bundles.
---

# Add Character Preset

Add characters the way this repo already expects them to exist: sourced, searchable, visually usable, and test-covered.

## Files

Use these files unless the request clearly targets something else:

- `src/lib/character-presets.ts`
- `src/lib/starter-bundles.ts`
- `src/lib/pit.test.ts`
- `src/lib/starter-bundles.test.ts`
- `public/avatars/presets/`
- `public/avatars/presets/ATTRIBUTION.md`

Read [references/project-notes.md](references/project-notes.md) before editing if you need the repo-specific conventions and asset rules.

## Workflow

1. Inspect the current roster in `src/lib/character-presets.ts` before adding anything.
2. Decide whether the character belongs in the `portugal` or `global` audience and place them near comparable presets.
3. Add or extend `PARTICIPANT_CHARACTER_RELATIONSHIPS` when the character is politically meaningful enough that debate pairings should feel intentional.
4. Add the preset entry with:
   - a stable hyphenated `id`
   - `name`, `title`, and `summary`
   - `audience`
   - `language`
   - `recommendedModel: OPENROUTER_MODEL_COMBATIVE`
   - `searchTerms` with accented and unaccented variants where relevant
   - `characterProfile` fields filled with a concrete speaking style, perspective, and guardrails
5. If the user wants avatars or the change would be incomplete without one, source a real image from the internet, process it locally, and set `avatarUrl`.
6. Update `ATTRIBUTION.md` for every new avatar file.
7. Make sure the preset appears in at least one relevant entry in `src/lib/starter-bundles.ts`; if no suitable bundle exists, add one instead of leaving the preset unreachable from starter debates.
8. Add or extend a focused test in `src/lib/pit.test.ts` so the new preset is reachable via search and accent-insensitive matching where relevant.
9. Run `npm run lint` and `npm test`.

## Preset Rules

- Match the existing prose style: concise title, one-line summary, then a sharper long-form profile.
- Keep the character recognizable as a debater, not as a generic biography.
- Prefer concrete rhetorical instincts over abstract ideology labels.
- Use European Portuguese framing for Portuguese figures and audience-specific search terms.
- Include birth dates when they are easy to verify from a solid source.
- Do not add placeholder avatars or broken image paths.

## Relationship Rules

- Add relationships when the preset is a serious political, ideological, or media figure likely to appear in multi-person pits.
- Prefer 4-6 high-signal pairings over trying to cover everyone.
- Make each relationship directional and character-specific.
- Write for debate behavior, not biography. The line should tell the model how to treat the other person in argument.

## Avatar Rules

- Prefer Wikimedia Commons or direct official/editorial portrait assets with stable URLs.
- Use real images, not generated stand-ins, unless the character is fictional or no real image is appropriate.
- Crop so the face is prominent in the picker.
- Save as `.webp`.
- Target `512x512` when possible for new additions.
- If a source image is weak, iterate the crop instead of shipping a distant or text-heavy thumbnail.
- Record the source and transformation in `public/avatars/presets/ATTRIBUTION.md`.

## Validation

Always finish with:

```bash
npm run lint
npm test
```

If tests fail on starter-bundle coverage, update `src/lib/starter-bundles.ts` instead of treating that as unrelated fallout.

If avatar assets were added, also verify they exist and decode cleanly, for example with `identify public/avatars/presets/<file>.webp`.
