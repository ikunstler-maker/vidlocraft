# VidLoCraft — specification

## Goal
VidLoCraft (Video Local Craft) is a set of video and audio tools that runs entirely in the browser on the user's device.
Files are never uploaded; the page works without internet, opened straight from disk. It replaces an editing app and online converters for simple jobs.

## Users
- The owner (motion designer): looping clips, converting, preparing video for social media.
- Later: anyone opening it from the website (GitHub Pages) or installing it as a PWA.

## Versions
- **v1 (done)** — features below marked v1.
- **v2** — interactive converter (scale, resolution, aspect, trim timeline), English UI, timeline editor stage 1.
- **Later** — AI features (auto captions, background removal without green screen); ffmpeg.wasm for legacy formats (AVI, WMV, ProRes).

## Features
| Feature | Version | Note |
|---|---|---|
| Loops: N repeats, 1× as converter, copy / re-encode in background / compact file | v1 | "Цикли" tab |
| Add video by URL | v1 | Direct links with CORS only |
| Converter: formats, codecs, quality, bitrate, target size, resolution, fps, presets, batch | v1 | |
| Trim, split into parts | v1 | |
| Rotate, flip, crop, 9:16 canvas with fill, colour | v1 | |
| Logo, text, burnt-in SRT/VTT subtitles | v1 | |
| Speed with pitch kept, reverse | v1 | |
| Audio: extract, remove, replace, mix, volume, normalize, fades | v1 | |
| Frames, ZIP of frames, contact sheet, GIF, animated WebP | v1 | |
| Merge videos | v1 | Always re-encodes |
| Create video from images and audio | v1 | |
| File info, strip metadata, before/after compare | v1 | |
| Write straight to disk, auto-save | v1 | File System Access API (Chrome/Edge) |
| PWA, "Open with" | v1 | Live on GitHub Pages |
| Interactive scale / resolution / aspect tiles, crop on preview, trim timeline with filmstrip and scrubbing | v2 | Done; reuse in the editor |
| English UI (UK/EN switch) | v2 | Done: header switch, remembered, default from browser language |
| Timeline editor | v2+ | Stages 1–2 done ("✂ Монтаж" tab: tracks, media library, audio, flexible export); next stages in `docs/editor-plan.md` |
| CI with browser tests | v2 | Done: `tests/`, `.github/workflows/ci.yml` |

## Security and access
- No server, accounts or keys. All processing is local.
- Settings live only in the user's browser (localStorage, `vlp-…` keys).
- Risk: libraries are inlined — update only to checked versions via `tools/build-libs.mjs`.

## Next stages
1. **Interactive converter.** Scale/resolution tiles with live size, aspect tiles with crop/fit toggle and fill, crop and position by dragging/pinching on the preview, trim timeline with filmstrip, waveform, draggable handles, scrubbing and zoom; numbers folded into "Exact values".
   **Done when:** a trim, an aspect change and a scale change are done without typing a number, on desktop and on a 390 px phone screen, and the output matches.
2. **English UI.** **Done when:** switching UK/EN changes every visible string, the choice is remembered, and the default follows the browser language.
3. ~~**Editor stage 1**~~ — done (see `docs/editor-plan.md`). Editor stage 2 (audio, unlimited tracks, media library, flexible export) — done. Next: editor stage 3 (text).
4. ~~**CI.**~~ Done. **Done when:** each PR shows "N of N checks passed" and a broken script turns a check red.

## Open questions
- [x] Is the repository public? — Yes (2026-11-24).
