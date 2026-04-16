---
name: generate-speaking-avatar
description: Generate and wire speaking avatar clips for the aipit project. Use when Codex needs to turn an existing repo avatar into a short talking video, compress it for runtime playback, update the right preset entry, and keep attribution in sync.
---

# Generate Speaking Avatar

Create built-in speaking clips the way this repo now expects them to exist: derived from an existing avatar image, saved under the static avatar tree, and wired into the preset that should animate during the live speaking phase.

## Files

Use these paths unless the task clearly says otherwise:

- `public/avatars/presets/`
- `public/avatars/presets/speaking/`
- `public/avatars/presets/ATTRIBUTION.md`
- `src/lib/character-presets.ts`
- `src/lib/pit.ts`
- `src/components/pit-studio-primitives.tsx`
- `src/components/pit-studio.tsx`

## Defaults

- Generate a `4s` clip.
- Save a compressed `mp4` at `/avatars/presets/speaking/<preset-id>.mp4`.
- Target `256x256` final output for the current focus-speaker UI.
- Send the prepared avatar as both `first_frame` and `last_frame` so the clip starts and ends on the still portrait.
- Keep the motion subtle: direct-to-camera talking, natural mouth movement, small blinks, minimal head motion, no camera moves, no scene changes.
- The app only swaps to video on the large active-speaker avatar. Queue and transcript avatars stay static images.

## Workflow

1. Confirm the target preset id and source avatar path.
2. Run the bundled generator:

```bash
node .codex/skills/generate-speaking-avatar/scripts/generate-speaking-avatar.mjs \
  --preset-id <preset-id> \
  --avatar <avatar-path>
```

3. The script will:
   - normalize the input avatar for Replicate
   - call `wan-video/wan-2.7-i2v`
   - download the result
   - crop, resize, and compress it to the repo’s runtime format
   - upsert `speakingAvatarUrl` into the matching preset entry in `src/lib/character-presets.ts` or `src/lib/pit.ts`
   - append or refresh the derived-media note in `public/avatars/presets/ATTRIBUTION.md`
4. If the default motion prompt is wrong for the character, rerun with `--prompt` and optionally `--negative-prompt`.
5. Validate the repo after wiring the asset.

## Requirements

- `REPLICATE_API_TOKEN` must be set in the environment.
- Local tools required by the script: `magick`, `ffmpeg`, and `ffprobe`.
- Prefer repo-local avatar paths. Remote image URLs are supported, but local assets are the stable path for built-in presets.

## Validation

Always finish with:

```bash
npm run lint
npm run typecheck
npm run test
```

If only an asset was regenerated and no code changed, still verify the output file exists and is decodable:

```bash
ffprobe public/avatars/presets/speaking/<preset-id>.mp4
```
