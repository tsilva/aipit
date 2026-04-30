# Speaking Avatar Video Audit

Generated: 2026-04-30

Scope: generated MP4 files in `public/avatars/presets/speaking/`.

## Criteria

- Effectively static: `mpdecimate` reduced the 144-frame, 6-second clip to 1-2 retained frames.
- Low motion: `mpdecimate` reduced the clip to 3-30 retained frames. These are not necessarily fully frozen, but they are weak enough to review or regenerate.

Command used:

```bash
for f in public/avatars/presets/speaking/*.mp4; do
  id=$(basename "$f" .mp4)
  line=$(ffmpeg -hide_banner -nostats -i "$f" -vf mpdecimate -an -f null - 2>&1 | grep -E 'frame= *[0-9]+' | tail -1)
  frames=$(printf '%s' "$line" | sed -E 's/.*frame= *([0-9]+).*/\1/')
  if [ "${frames:-999}" -le 30 ]; then
    printf '%s,%s\n' "$id" "$frames"
  fi
done | sort -t, -k2,2n -k1,1
```

## Effectively Static

| Preset | File | Original retained frames | Status |
| --- | --- | ---: | --- |
| Eric Cartman | `public/avatars/presets/speaking/eric-cartman.mp4` | 1 | Done: regenerated, 66 retained frames |
| Cornholio | `public/avatars/presets/speaking/cornholio.mp4` | 2 | Done: regenerated, 111 retained frames |
| Donald Trump | `public/avatars/presets/speaking/donald-trump.mp4` | 2 | Done: regenerated, 101 retained frames |
| Joe Rogan | `public/avatars/presets/speaking/joe-rogan.mp4` | 2 | Done: regenerated, 54 retained frames |
| Knight Who Says Ni | `public/avatars/presets/speaking/knight-who-says-ni.mp4` | 2 | Done: regenerated, 122 retained frames |
| Luis Marques Mendes | `public/avatars/presets/speaking/luis-marques-mendes.mp4` | 2 | Done: regenerated, 119 retained frames |
| Paulo Portas | `public/avatars/presets/speaking/paulo-portas.mp4` | 2 | Done: regenerated, 122 retained frames |
| Ricardo Costa | `public/avatars/presets/speaking/ricardo-costa.mp4` | 2 | Done: regenerated, 117 retained frames |

## Low Motion

| Preset | File | Original retained frames | Status |
| --- | --- | ---: | --- |
| Lex Fridman | `public/avatars/presets/speaking/lex-fridman.mp4` | 7 | Done: regenerated, 60 retained frames |
| Francisco Louca | `public/avatars/presets/speaking/francisco-louca.mp4` | 15 | Done: regenerated, 74 retained frames |
| Catarina Martins | `public/avatars/presets/speaking/catarina-martins.mp4` | 25 | Done: regenerated, 89 retained frames |
| Pedro Nuno Santos | `public/avatars/presets/speaking/pedro-nuno-santos.mp4` | 26 | Done: regenerated, 44 retained frames |
| Rick Sanchez | `public/avatars/presets/speaking/rick-sanchez.mp4` | 26 | Done: regenerated, 59 retained frames |
| Rui Rocha | `public/avatars/presets/speaking/rui-rocha.mp4` | 28 | Done: regenerated, 115 retained frames |

## Regeneration Priority

1. Regenerate the effectively static files first.
2. Review the low-motion files visually, then regenerate any that do not show clear mouth movement in the active-speaker UI.
