# Project Notes

## Core files

- `src/lib/character-presets.ts` contains both `PARTICIPANT_CHARACTER_RELATIONSHIPS` and `PARTICIPANT_CHARACTER_PRESETS`.
- `src/lib/starter-bundles.ts` must include every built-in participant preset at least once, or `src/lib/starter-bundles.test.ts` will fail.
- `filterParticipantCharacterPresets` uses normalized search text, so add useful aliases and accented variants to `searchTerms`.
- `src/lib/pit.test.ts` already covers audience scoping and search behavior. Extend that instead of creating redundant tests elsewhere.

## Existing style

- Portuguese presets are written as persuasive debate personas, not neutral encyclopedia entries.
- `title` is compact and semicolon-delimited.
- `summary` is one sentence.
- `characterProfile` should be specific on:
  - role
  - personality
  - perspective
  - temperament
  - debateStyle
  - speechStyle
  - guardrails
  - language
  - nationality
  - birthDate when available
  - promptNotes

## Ordering

- Keep Portuguese presets grouped together before the global roster.
- Place new entries near adjacent ideological or stylistic peers rather than always appending at the end of the audience block.

## Avatar references

- Presets can reference `avatarUrl` for still portraits and `speakingAvatarUrl` for generated speaking clips.
- Avatar sourcing, processing, attribution, and validation live in `.codex/skills/avatar-assets/SKILL.md`.

## Practical checklist

1. Verify the character is not already present.
2. Verify name spelling and likely search aliases.
3. Add relationships if the figure is politically meaningful.
4. Add the preset entry.
5. Ensure the preset is covered by at least one starter bundle; add a new bundle if none fits.
6. Use `.codex/skills/avatar-assets/SKILL.md` for avatar media when requested or clearly valuable.
7. Add a targeted test assertion.
8. Run lint and tests.
