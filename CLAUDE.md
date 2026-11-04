# CLAUDE.md — Littleworld Jakarta Padel Cup

Read `AGENTS.md` first; it holds the shared rules. This file adds Claude Code specifics.

## Project
Web toy for annetta.dev, feature-complete and deployed through GitHub Pages. Working dir: `C:\Hermes\project\annetta\padel`, git repo `ant133/littleworld-padel` (branch `main`). Platform: Windows 11, PowerShell primary, Bash available. Overview and how to play: `README.md`.

## Dev commands
- `node tools/devpage.js` → dev.html (all src/*.js); open via `file:///.../dev.html?cam=club|close|follow|top&tod=day|dusk|night&venue=classicBlue|terracotta|fastBlue|indoor&speed=1&fast=0|1&px=2`. Play mode is the default; add `mode=studio` for the full panel, `title=0` to skip the title.
- Tests: `node tools/dupcheck.js`, `physics_tests.js`, `scoring_tests.js [--quick]`, `player_ai_tests.js`, `commentary_tests.js`, `reflex_stats.js [--n N]` (smash and volley-chain statistics), `matrix.js --part k/3`, `sim_cli.js --n N [--tune {json}]`. Results and gaps: docs/TESTING.md.
- Browser (headless Chrome via `tools/browser.js`): `e2e.js` (match sampler), `features_browser.js` (Play-mode journey, saved players, camera, offline render, phone), `visual_matrix.js` (courts × lighting × cameras). Run `node tools/build.js` first for the ones that load `dist/`.
- Ship: `node tools/build.js [--check]` → dist/littleworld-online.html + -offline.html; `node tools/make_artifact.js` → dist/littleworld-artifact.html (artifact publish).
- Key docs: CONTRACT.md, docs/PLAY_MODE.md, docs/VISUAL_CONTRACT.md, docs/API_*.md, docs/TESTING.md, docs/GITHUB_PAGES.md.
- Windows tips: the Bash tool mangles big heredocs with quotes; write files with the Write tool. Node one-liners that match markdown table cells must account for escaped pipes (`\|`).

## Layout
- `SPEC.md` — original brief (requirements source; some items superseded, see CONTRACT.md §18)
- `CONTRACT.md` — architecture and interfaces
- `src/` — one file per module under namespace `HPO` (00–09 headless sim, 10–20 presentation, 21 Play mode), plus `shell.html`/`shell.css`
- `tools/` — build, dupcheck, headless and browser test drivers
- `docs/` — API notes, Play mode, visual contract, testing, Pages setup
- `dist/` — build output (online, offline, artifact)
- `vendor/` — three.js r128; `assets_src/` — mascot sprite source; `scratch/` — local screenshots and test output (not source)
- `.github/workflows/pages.yml` — dupcheck, build, physics/scoring/player-AI tests, deploy

## Workflow for changes
1. Read CONTRACT.md for the module; change the contract first if an interface changes.
2. Sim, rules or AI change → run the headless suites (`physics_tests`, `scoring_tests`, `player_ai_tests`, `matrix`).
3. UI, camera or world change → `node tools/build.js`, then `features_browser.js` and look at screenshots (desktop and 390×844).
4. Update the docs the change touches (CONTRACT.md change log, docs/TESTING.md numbers) in the same pass.
5. Do not commit or push unless asked; a push to `main` publishes the site.
6. Always use the `task-iteration-log` skill: open an entry in `task-iteration-log/` when a task starts, close it when it ends, and stage it with the task's changes. Skip it for pure Q&A.

## Site & hosting (current)
- Hosting: free GitHub Pages from `ant133/littleworld-padel`, built by the Actions workflow. Intended address `https://padel.annetta.dev` (CNAME `padel` → `ant133.github.io`, custom domain set in the repo's Pages settings); default address `https://ant133.github.io/littleworld-padel/`. Steps: docs/GITHUB_PAGES.md.
- This supersedes the earlier plan to ship as `padel/index.html` inside `annetta-website` (that repo is a project repo with its own CNAME, so a separate repo cannot inherit `annetta.dev`; the subdomain route avoids touching it). Site source for reference: `C:\Hermes\project\annetta\annetta-website`, which should link to the toy ("Jump in" style CTA) if the user asks.
- The online page loads three.js r128 from cdnjs; the offline file is published beside it as `littleworld-offline.html`.
- Reference prior build: artifact EoFoLuqfiLm3q9PiYTTbeD (tennis "Hollybrook Open", ~1.0 MB). Current files: online ~0.75 MB, offline ~1.3 MB.

## Decisions in force
- Experience: Play mode by default (title → create player → quick setup → full-screen match with a limited coach box for the visitor's team only); full panel optional as Studio. Match defaults: Quick, Golden Point, Classic Blue, Day, 1×; the title screen plays a live match behind it. Visitor teams up with Annetta Arslan (id `p5`, shown as "Annetta"); women's doubles for a woman, mixed for a man.
- Coach: Play mode has six tactics, middle-ball choice, one timeout, two challenges per set; Studio has the full set (all presets, serve/return direction, aim-click, focus opponent). Eagle-Eye-style challenge with replay.
- Audio and speech commentary are off by default with a visible sound toggle.
- Device tier is auto-detected (reduced mobile mode; pixel size is 2 on every device); the slider overrides. Phones start on the TV follow camera, never the whole-club camera.
- Fonts: Google Fonts when online, system fallbacks offline. Pixel art stays in the canvas; UI text is not pixelated.
- Persistence: visitor players in IndexedDB only; no `localStorage`.
- Annetta in-world: sponsor board (annetta.dev), mascot spectator sprite (new art, embedded as a data URI; do NOT reuse her original sprite art), "A✦" on the LED screen.
- Fictional Indonesian-flavoured sponsors (puns, no real marks): Lintas Court Rail, Tapak Smash, Bank Mandau Raya, Bank Lapang Amanah, Aquvivo, Go-Jeg, Pokari Sweet. The user approved the names; the user is responsible for the final real-world clearance check.
- Court: 3 m glass back wall and corner panels, 3 m mesh between, open 2 m entrance at the net with a mesh header; no doors. Camera is orthographic at 40° and snaps to isometric quarter turns after a drag.
- Scope: full version, no feature cuts; accessibility intentionally deprioritised, polish kept.

## Tournament name
"Littleworld Jakarta Padel Cup <YEAR>" — YEAR must come from `new Date().getFullYear()` at runtime (title, scoreboard, banners, trophy, results screen, page <title>). Never hard-code the year. The SPEC.md name "Hollybrook Padel Open" is superseded; sponsor/boards/LED/ceremony text all use the new name.

## Design tokens (read from annetta-website/styles.css)
- Colors: ink `#123954`, blue `#177dc5`, cream `#fffaf0`, accent blue `#268cc2`, tag blue `#257bad`, highlight `#fff4b3`, border `#12395421`.
- Fonts: DM Sans (body), Manrope 700/800 (headings, tight `-.055em` tracking), Georgia italic for accent words.
- Cards: cream `#fffaf0f0`, 1px ink-tint border, hard offset shadow `15px 18px 0 #1264992e`, no rounded corners. Section tags: 10px, 700, uppercase, `.2em` tracking.
- Stickers: slight rotation (-3deg), 2px blue border, cream fill.
- Fonts are loaded from Google Fonts on the site; the toy must NOT rely on that offline — use system fallbacks (`Manrope`→ system-ui, Georgia).

## Design language (annetta.dev)
Observed from the live site (copy and structure):
- Pool-themed narrative: "Public Pool" admit-one ticket motif, timestamped scene captions (e.g. "2:41 PM · POOL DECK"), numbered sections ("01 / About").
- Playful, self-deprecating, short sentences; towel/pool gags. Footer line style: "Made in Jakarta with code, curiosity, and no spare towel."
- Nav logo "A✦"; button CTAs with arrows ("Jump in ↗", "Skip intro ↘").
- Sprite/pixel-looking character art.
Apply to: panel chrome, typography, button style, microcopy, loader ("Inflating one last floatie…"-style), and a "back to annetta.dev" link. Pixel art stays inside the 3D canvas; do not pixelate UI text.

## Conventions
- Match surrounding code style; minimal comments, explain *why* only.
- Plain ES2017+ JS, no build-time frameworks; bundle by concatenation/inlining.
- Never commit/push without being asked.
- When unsure about a product decision, ask; otherwise choose the sensible default and state it.
