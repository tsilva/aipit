---
name: avatar-assets
description: Generate, fix, audit, and wire avatar assets for the aipit project. Use when Codex needs to source or process still preset avatars, crop or convert portrait images, generate speaking avatar videos, repair broken avatarUrl or speakingAvatarUrl paths, update avatar attribution, validate avatar media, or audit built-in avatar coverage.
---

# Avatar Assets

Own AIPIT avatar media end to end: sourced still portraits, generated speaking clips, attribution, preset wiring, and asset audits. For full character creation, use `add-character-preset` for persona data and this skill for the avatar work.

## Files

Use these paths unless the task clearly says otherwise:

- `public/avatars/presets/`
- `public/avatars/presets/speaking/`
- `public/avatars/presets/ATTRIBUTION.md`
- `src/lib/character-presets.ts`
- `src/lib/pit.ts`
- `src/components/pit-studio-primitives.tsx`
- `src/components/pit-studio.tsx`

## Still Avatars

- Prefer Wikimedia Commons or direct official/editorial portrait assets with stable source URLs.
- Use real images, not generated stand-ins, unless the character is fictional or no real image is appropriate.
- Crop so the face is prominent in the picker; avoid distant podium shots, text overlays, and weak crops.
- Save new built-in still avatars as `.webp`, targeting `512x512` when possible.
- Wire the public path as `avatarUrl: "/avatars/presets/<preset-id>.webp"` on the matching preset.
- Add one attribution bullet per new still image with filename, source URL, license/attribution note, and crop/resize note.

## Speaking Videos

Defaults:

- Generate a `6s` clip unless the user asks for a different duration.
- Save compressed MP4 output at `/avatars/presets/speaking/<preset-id>.mp4`.
- Target `256x256` final output for the active-speaker UI.
- Send the prepared avatar as both `first_frame` and `last_frame` so the clip starts and ends on the still portrait.
- Keep motion subtle: direct-to-camera talking, natural mouth movement, small blinks, minimal head motion, no camera moves, no scene changes.
- The app only swaps to video on the large active-speaker avatar. Queue and transcript avatars stay static images.

Run the bundled generator:

```bash
node .codex/skills/avatar-assets/scripts/generate-speaking-avatar.mjs \
  --preset-id <preset-id> \
  --avatar <avatar-path>
```

The script normalizes the input avatar, calls `wan-video/wan-2.7-i2v`, downloads the result, crops/resizes/compresses it, upserts `speakingAvatarUrl`, and updates the speaking-video attribution note. If the default motion prompt is wrong for the character, rerun with `--prompt` and optionally `--negative-prompt`.

Requirements:

- `REPLICATE_API_TOKEN` must be set.
- Local tools required by the script: `magick`, `ffmpeg`, and `ffprobe`.
- Prefer repo-local avatar paths. Remote image URLs are supported, but local assets are the stable path for built-in presets.

## Audit And Fixes

For avatar audits or repairs, check:

- every built-in `avatarUrl` and `speakingAvatarUrl` points to an existing file under `public/`
- still images decode cleanly and have usable portrait crops
- speaking videos decode cleanly, are muted, square, and runtime-sized
- `ATTRIBUTION.md` has one accurate bullet for every added or regenerated avatar asset
- preset metadata points at the intended public paths and does not keep stale generated-video links after a still avatar is replaced

## Validation

Use focused validation for the asset type changed:

```bash
identify public/avatars/presets/<preset-id>.webp
ffprobe public/avatars/presets/speaking/<preset-id>.mp4
```

If preset source files were rewired, also run:

```bash
npm run lint
npm run typecheck
npm run test
```
