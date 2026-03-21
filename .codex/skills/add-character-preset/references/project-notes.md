# Project Notes

## Core files

- `src/lib/character-presets.ts` contains both `PARTICIPANT_CHARACTER_RELATIONSHIPS` and `PARTICIPANT_CHARACTER_PRESETS`.
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

## Avatar conventions

- Current repo assets live in `public/avatars/presets/`.
- Existing files are a mix of portrait ratios, but new additions should prefer `512x512` WebP.
- Face-forward crops work better in the preset picker than podium shots or article thumbnails with large text overlays.

## Attribution conventions

- Add one bullet per new file to `public/avatars/presets/ATTRIBUTION.md`.
- Mention:
  - output filename
  - crop/resize note
  - original source URL
  - license or attribution note if the source page specifies one

## Practical checklist

1. Verify the character is not already present.
2. Verify name spelling and likely search aliases.
3. Add relationships if the figure is politically meaningful.
4. Add the preset entry.
5. Add avatar and attribution when requested or clearly valuable.
6. Add a targeted test assertion.
7. Run lint and tests.
