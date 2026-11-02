# CLAUDE.md — Littleworld Jakarta Padel Cup

Read `AGENTS.md` first; it holds the shared rules. This file adds Claude Code specifics.

## Project
Web toy for annetta.dev. Working dir: `C:\Hermes\project\annetta\padel` (not a git repo yet). Platform: Windows 11, PowerShell primary, Bash available.

## Dev commands
- `node tools/devpage.js` → dev.html (all src/*.js); open via `file:///.../dev.html?cam=club|close|follow|top&tod=day|dusk|night&venue=classicBlue|terracotta|fastBlue|indoor&speed=1&fast=0|1&px=2`.
- Tests: `node tools/dupcheck.js`, `physics_tests.js`, `scoring_tests.js [--quick]`, `commentary_tests.js`, `matrix.js --part k/3`, `sim_cli.js --n N [--tune {json}]`.
- Browser: `tools/browser.js` (headless Chrome driver), `e2e.js`, `visual_matrix.js`.
- Ship: `node tools/build.js [--check]` → dist/littleworld-online.html + -offline.html; `node tools/make_artifact.js` → dist/littleworld-artifact.html (artifact publish).
- Key docs: CONTRACT.md, docs/VISUAL_CONTRACT.md, docs/API_*.md, docs/TESTING.md.

## Layout
- `SPEC.md` — original full prompt/spec (source of requirements)
- `CONTRACT.md` — architecture and interfaces (write before modules)
- `src/` — modules, one file per responsibility, all under namespace `HPO`
- `tools/` — build (inline modules + three.js into offline HTML), `dupcheck`, headless match harness
- `dist/` — `littleworld-online.html`, `littleworld-offline.html`

## Workflow
1. Core first: render pipeline, pixel post-process, palette, coordinates, NAV grid, BUS, physics loop, seeded RNG, match state machine.
2. Write `CONTRACT.md`, then build the 11 modules in parallel via subagents in isolated worktrees (if git is initialised) or sequentially against the same interfaces.
3. Integrate, run `dupcheck`, run headless match matrix, then visual checks per camera/lighting/layout.
4. Publish artifact; build offline file.

## Site & hosting (confirmed)
- Site source: `C:\Hermes\project\annetta\annetta-website` — static GitHub Pages, no build step, `CNAME` annetta.dev. The toy ships as its own page (e.g. `/padel/`), neutral padel theme, light UI, launches straight into the club (no intro splash). Annetta may appear in-world (sponsor board, spectator/mascot, "Made in Jakarta" sign).
- Reference prior build: artifact EoFoLuqfiLm3q9PiYTTbeD (tennis "Hollybrook Open", ~1.0 MB single HTML with three.js inline). Use ~1–2 MB as the size ballpark for the offline file.

## Decisions (from Q&A rounds 1–2)
- Default load: Quick Match, Golden Point, Men's doubles, Classic Blue, Day; autoplay on load with a visible New Match button; sim speed default 1x.
- Full coach set (all tactics, aim-click, timeout, challenge). Full Eagle-Eye-style challenge + replay, limited challenges per set.
- Audio off by default with a prominent "Sound off ♪" toggle; speech commentary off by default.
- Auto-detect device tier (pixel size, reduced mobile mode); slider overrides.
- Fonts: load Google Fonts when online, fall back to system fonts offline.
- Deploy the offline, fully embedded file at annetta.dev/padel; artifact version loads three.js r128 from cdnjs.
- Annetta in-world: sponsor board (annetta.dev), mascot/spectator sprite, "A✦" logo on LED screen. Do NOT reuse her sprite art; create a new inspired sprite via Higgsfield MCP, then embed small (data URI / procedural palette-snapped) — no external asset files.
- Players/clubs fictional; Indonesian-flavoured sponsors as puns on: Metro Tennis Terminal, Pedal Padel, Bank Mandiri, Bank Syariah Indonesia, Aquviva, Go-jek, Pocari Sweat. Keep puns clearly altered (no real logos/marks).

## Tournament name
"Littleworld Jakarta Padel Cup <YEAR>" — YEAR must come from `new Date().getFullYear()` at runtime (title, scoreboard, banners, trophy, results screen, page <title>). Never hard-code the year. The SPEC.md name "Hollybrook Padel Open" is superseded; sponsor/boards/LED/ceremony text all use the new name.

## Decisions (round 3)
- Sponsor names (pending final user OK): Lintas Court Rail, Tapak Smash, Bank Mandau Raya, Bank Lapang Amanah, Aquvivo, Go-Jeg, Pokari Sweet. Avoid any name matching a real brand; unverifiable offline, so user must sanity-check.
- Hosting: free GitHub Pages only. Main site repo is github.com/ant133/annetta-website (a project repo with CNAME annetta.dev, NOT a user-site repo), so a separate project repo would NOT inherit annetta.dev. Plan: ship as `padel/index.html` inside annetta-website → annetta.dev/padel. Do not commit/push in any repo unless asked.
- Build: many files in `src/`, concatenated by a build script into one HTML. Git init in this folder is OK for worktrees; commit only on request.
- Pause for user approval after CONTRACT.md before spawning module agents.
- Testing: headless Node harness for physics/scoring; browser screenshots if Chrome/Edge present; report anything unverified.
- Accessibility: skipped, polish kept. Scope: FULL version, no feature cuts planned.
- Build is underway/complete: all modules exist; keep CONTRACT.md and docs/ in sync with code changes.
- Higgsfield: user approved generating ~1–3 reference images for the Annetta mascot; check balance first, show result before use.

## Design tokens (read from annetta-website/styles.css)
- Colors: ink `#123954`, blue `#177dc5`, cream `#fffaf0`, accent blue `#268cc2`, tag blue `#257bad`, highlight `#fff4b3`, border `#12395421`.
- Fonts: DM Sans (body), Manrope 700/800 (headings, tight `-.055em` tracking), Georgia italic for accent words.
- Cards: cream `#fffaf0f0`, 1px ink-tint border, hard offset shadow `15px 18px 0 #1264992e`, no rounded corners. Section tags: 10px, 700, uppercase, `.2em` tracking.
- Stickers: slight rotation (-3deg), 2px blue border, cream fill.
- Fonts are loaded from Google Fonts on the site; the toy must NOT rely on that offline — use system fallbacks (`Manrope`→ system-ui, Georgia) unless the user approves embedding.

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
