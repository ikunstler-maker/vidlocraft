# VidLoCraft (Video Local Craft)

Offline in-browser app: video loops, converter, frames & GIF, merge, create video; next — a timeline editor.
`docs/SPEC.md` is the source of truth, amended by `docs/decisions.md` (owner's decisions). If a request contradicts them, ask first.
Docs in `docs/` are in English to save tokens. Talk to the owner in Ukrainian. `docs/agents.md` stays Ukrainian (the owner pastes it).
`docs/editor-research.md` (Ukrainian, long) — read only the section a task needs.

## Task triage (first reply to every new task)
State one line in Ukrainian: `Режим: <mode> — <why, ≤10 words>`. Wait for the owner's OK before modes B–D.
- A. Single agent — one goal, sequential steps, ≤~10 files. Just do it.
- B. Subagents — 2–5 independent checks or research threads to merge. Workers: `sonnet-worker` (`.claude/agents/`).
- C. Workflow — many similar items (≥20), migration, codebase-wide audit, cross-checked research. Bulk on Sonnet; Opus plans and synthesizes.
- D. Filter → Workflow — large/dirty data: a deterministic script drops noise first; only the rest goes to a Sonnet workflow. Report counts per stage.
Unsure between two modes → name both with the trade-off (speed vs usage) and recommend one. No ultracode / max effort unless asked; default effort medium.

## How we work
- Stage by stage (SPEC → stages): plan → owner's OK → code → "Done when" check → commit/PR.
- Current version only; "Later" items are not built but not blocked architecturally.
- Fixed stack: single `index.html` (HTML + Tailwind CSS + vanilla JS), inlined Mediabunny, LAME MP3 encoder, gifenc, mp4box.js; PWA (`manifest.webmanifest`, `sw.js`). New library or service only with OK.
- Must work offline, opened from disk: no CDN or external requests. Libraries and styles are inlined; rebuild with
  `node tools/build-css.mjs` (styles) and `node tools/build-libs.mjs` (libraries).
- User files never leave the device: no servers, analytics or uploads.
- The owner is not a developer: explain briefly, plain Ukrainian, address as «ви», technical terms explained in brackets.
- UI in Ukrainian and English. Ukrainian text in `index.html` is the source; English lives in `tools/i18n-en.json`.
  After adding or changing UI text: `node tools/i18n.mjs` (lists untranslated), add translations, `node tools/i18n.mjs --inline`.
  Strings built from pieces work via patterns (`{0}`) and word/unit fallbacks; user content gets `translate="no"`.
- Code, comments, names and commits in English.
- Raise risky, costly or irreversible requirements before starting.
- Log every owner decision as a row in `docs/decisions.md` (date | topic | decision).
- When the owner must act: step-by-step (site → section → button → what to paste).
- Hard concept or architecture → offer a diagram or HTML page instead of long text. On request "STE" → ASD-STE100 style.

## Merging PRs (owner's rule)
- Standing permission (owner, 2026-11-24): merge own PRs whenever all checks are green — no need to ask each time.
- Merge only own PRs, only after checks pass; never drafts or prototypes. After merging, say what changed in the app.
- "Dangerous" merge → separate warning and a separate «так» / «зроблю сама»: losing users' saved settings (`vlp-…` keys in localStorage),
  service worker changes that may stop the installed app from updating, anything hard to roll back.

## Secrets
- The app uses no keys or accounts. If ever needed: only public keys in the browser; secret ones in GitHub → Settings → Secrets. Never ask for a secret in chat.

## Checks
- CI: GitHub Actions `.github/workflows/ci.yml` runs `tests/` (syntax, i18n, converter, editor, UI) on every PR and push to main.
  Locally: `node tests/run.mjs` (needs Playwright + ffmpeg). Add a scenario to `tests/` for every new feature.
- Before handing over: syntax check of every `<script>`, page opened from disk offline with no console errors, browser scenarios (Playwright),
  media outputs checked with ffprobe/ffmpeg. Report honestly with numbers; name what could not be checked.
