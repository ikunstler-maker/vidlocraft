# Timeline editor plan

Owner-approved answers are in `docs/decisions.md` (2026-11-23). Research with sources: `docs/editor-research.md` (Ukrainian).
"verify" = not confirmed by a source; check during prototyping.

## Idea
A new "Монтаж" section: a timeline editor that works offline, opened from disk, files never leave the device.
UX reference — Instagram Edits (gestures instead of buttons/fields, fixed playhead with the filmstrip moving under it,
pinch zoom from whole project to single frame, contextual toolbar on selection, "apply to all"). Feature ideas from CapCut/InShot;
tracks and Nest/Precompose from Premiere Pro. Add first-run hints (Edits takes ~10 min to learn).
Targets: desktop Chrome/Edge and mobile browsers (adapted layout). Safari/Firefox: feature-detect, show "not supported here".

## Features
| Feature | Approach (library, licence, size) | Effort | Stage |
|---|---|---|---|
| Multi-track timeline (video/overlay/audio) | Own code | 2–3 w | 1 |
| Trim handles, split at playhead, reorder, magnet, ripple delete | Own code | in stage 1 | 1 |
| Scrubbing, pinch/Ctrl+wheel zoom, filmstrip thumbnails, 540p proxies | Own code | in stage 1 | 1 |
| Project scale, resolution, aspect (crop or fit with black/blur fill), on-canvas handles | Reuses interactive-converter components | 3–4 d | 1 |
| Undo/redo (200 steps), autosave | Project JSON in IndexedDB, media in OPFS | 1 w | 1 |
| Export | renderFrame in a Worker → Mediabunny | 1 w | 1 |
| Waveform, volume, fades, detach audio, ducking, voice-over | Web Audio | 1–1.5 w | 2 |
| Text: outline, shadow, box, fonts, in/out animations | Canvas; OFL WOFF2 fonts, 10–15 families ~0.5–0.8 MB | 2 w | 3 |
| Transitions (zoom, whip, glitch, spin, flash, slide…) | GLSL; gl-transitions (MIT, ~30 KB for 40; verify per-file licences) | 1–2 w | 4 |
| Filters, .cube LUTs, colour correction, curves | One shader; own presets | 1.5–2 w | 4 |
| Effects (blur, glitch, VHS, shake), masks | Shaders | 2 w | 4 |
| Chroma key: picker, intensity, softness, despill, choke, feather, garbage mask, matte view | Own WebGL2 shader (~40 lines) | 1 + 1 w | 4 |
| Keyframes + easing | Own code; BezierEasing (MIT, ~1 KB) | 1 w | 5 |
| Speed ramps, freeze frame | Speed curve; existing pitch-keeping stretch | 1 w | 5 |
| Nest/Precompose, adjustment layer | Nested compositions in the project model | 1–2 w | 5 |
| Caption editor, word-by-word/karaoke styles, SRT/VTT import/export, burn-in | Own code; SRT parser exists | 1–2 w | 6 |
| Stickers, emoji, GIF, PiP, blend modes | ImageDecoder; own SVG set | 1–1.5 w | 7 |
| Beat markers (manual), voice effects | Web Audio | 1 w | 7 |
| Templates with slots (+ a few ready ones) | JSON project with placeholders | 1–2 w | 8 |
| **Later (AI, postponed):** auto captions (Whisper via transformers.js; small on desktop, base on phone; model downloaded once ~75–500 MB, verify), background removal without green screen (MediaPipe Selfie, Apache-2.0, <0.5 MB), noise reduction (RNNoise, BSD-3, verify) | free licences only; no GPL/AGPL (RVM, Essentia, aubio) | — | later |
| Music | User's own audio; optional small CC0 SFX set if a suitable offline one exists | — | 2 |

Estimates are for one person and rough.

## Architecture
- **Project model:** versioned JSON — media list, compositions (main + nested), tracks, clips (position, trim, speed, effects, keyframes). Media stay in OPFS, so multi-GB files work. Time unit (seconds vs integer ticks) decided in the prototype.
- **Preview:** one `renderFrame(project, time)` composites all layers with WebGL2 (WebGPU only as acceleration). Web Audio is the clock; video follows audio. Heavy/4K sources preview through 540p proxies.
- **Export:** the same `renderFrame`, frame by frame in a Worker, encoded with Mediabunny — what you see is what you get. Progress, cancel, streaming to disk.
- **Autosave:** on every change (~1 s debounce) and when the tab hides. One drag = one undo step. Project list, project export to file, "relink media" if a source is missing.

## Stages ("Done when")
1. **Timeline skeleton** — tracks (3 video/overlay, 2 audio), import, trim, split, reorder with magnet, ripple delete, zoom, fixed playhead, thumbnails, project format/resolution/crop-or-fit, undo/redo, autosave, export.
   *Done when:* on desktop and phone Chrome, 3 clips are joined, trimmed by finger, split, reordered and exported as 9:16 1080p MP4 within 2 minutes; the project survives a reload; export matches preview frame for frame.
2. **Audio** — waveform, volume, fades, detach, ducking, voice-over. *Done when:* cutting on a waveform peak works and music ducks under voice.
3. **Text** — on-canvas handles, 10–15 Cyrillic fonts, 20 animations. *Done when:* text is dragged/rotated by finger and the animation matches in export.
4. **Look** — 40+ transitions with junction preview, filters/LUTs/correction/effects/masks, chroma key, "apply to all". *Done when:* tapping a junction adds a transition; a green screen is removed with the picker without a green halo on the test clip.
5. **Pro** — keyframes, speed ramps, freeze frame, Nest, adjustment layer. *Done when:* 3 clips nest into one, edits inside show outside, an effect on the nest applies to the group.
6. **Captions (manual)** — editor, styles, SRT/VTT, burn-in. *Done when:* an SRT is imported, edited on the timeline, styled word by word and burnt in.
7. **Overlays** — stickers, GIF, PiP, blend modes, beat markers. *Done when:* a PiP clip with a blend mode exports as previewed.
8. **Templates + mobile polish** — templates, background proxies, limits for weak phones, first-run hints. *Done when:* a template fills with 5 clips in 3 taps and a 60 s project plays smoothly on a mid-range phone.

## Risks
- **Phone performance** (few simultaneous HW decoders, 2–4, verify): preview ≤720p30, proxies, ≤2–3 live videos (others frozen), release frames immediately, Wake Lock during export.
- **Licences:** no GPL/AGPL inlined; check every shader, font, wasm; own LUT presets; add a "Licences and sources" page.
- **Safari/Firefox:** WebGL2 baseline, feature detection, honest "not supported", test iOS Safari after stage 1.
- **Opened from disk (`file://`):** Workers via Blob URLs; multi-threaded wasm won't work there.
- **File size:** fonts/wasm grow `index.html`; lazy-load heavy modules.
