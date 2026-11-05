# AGENTS.md — Littleworld Jakarta Padel Cup

Shared instructions for every agent (Claude Code, subagents, other tools) working in this repo.

## What this is
A live, shareable web toy for **annetta.dev**: a real-time 3D pixel-art diorama of a professional doubles padel final, "Littleworld Jakarta Padel Cup <year>", on a floating island. It is a physics-driven simulation, not an animation. Visitors make a player, team up with Annetta Arslan and coach their pair in **Play mode** (the default); the full control panel is the optional **Studio mode**.

Status: feature-complete. Hosted on GitHub Pages from `ant133/littleworld-padel` (intended domain `padel.annetta.dev`, not yet configured); check `git status` for work that is not yet pushed, since only pushed commits are live. Work now is fixes, polish and tuning.

Where things live:
- `README.md` — overview, how to play, build/test/deploy commands
- `SPEC.md` — original product brief (requirements source; parts are superseded, see CONTRACT.md §18)
- `CONTRACT.md` — architecture and interfaces; source of truth for module boundaries
- `docs/PLAY_MODE.md` — Play mode flow and boundaries; `docs/VISUAL_CONTRACT.md`, `docs/API_*.md` — presentation and simulation APIs
- `docs/TESTING.md` — test commands, latest results, known gaps; `docs/GITHUB_PAGES.md` — hosting

## Deliverables
1. Online page: one self-contained HTML file, three.js r128 from cdnjs only (`dist/littleworld-online.html`; also prepared as `dist/littleworld-artifact.html` for artifact publishing).
2. Offline file: same game with three.js embedded, works with no network (`dist/littleworld-offline.html`).
3. GitHub Pages deployment from `main` via `.github/workflows/pages.yml`.
4. `CONTRACT.md`, docs and a testing summary kept in sync with the code.

## Hard constraints
- Single HTML output per build; no other external assets, no `localStorage`, no `eval`, no `alert`. The only persistence is IndexedDB (`littleworld-padel`, store `players`) for visitor-created players; the page must work when it is unavailable.
- All people, clubs, sponsors, tournaments are original and fictional. UI language: English. The tournament year always comes from `new Date().getFullYear()` via `HPO.cfg.TITLE()`; never hard-code it.
- Audio is OFF until direct user interaction; synthesized WebAudio only. Speech commentary is off by default.
- One app namespace (`HPO`), shared event bus `BUS`, dependency injection between modules. No stray globals; run `dupcheck` before every integration.
- Fixed-timestep physics, seeded deterministic RNG, scoring logic independent of the renderer. `Math.random` is allowed only in cosmetic code and in Play-mode UI choices (shuffles, new player seed); never in sim or AI.
- Do not simplify the court into an open tennis court; do not reduce doubles to one-player-per-side logic; wall rebounds are physics, never decoration. The side wall has an open 2 m entrance at the net, not doors.
- Real brands, logos and people must not appear; sponsor names are deliberate puns (see CONTRACT.md §13).

## Working rules
- Read `CONTRACT.md` before touching a module; change the contract first if an interface must change.
- Each module owns its files and nothing else. Cross-module calls go through BUS events or injected interfaces (`ui.api` for Play mode).
- Prefer reliability over decoration. If perf or complexity forces a trade-off, cut props, not physics or rules.
- Every change that touches physics, scoring or AI must be validated headless (no renderer) before merging: `physics_tests`, `scoring_tests`, `player_ai_tests`, and `matrix` for flow changes.
- Every UI or camera change must be looked at in the browser (screenshots, including a phone-sized viewport). Do not run the full regression suites or the browser journey (`features_browser`) after each change; run them only when the user asks.
- Keep debug overlay hidden by default.
- After changing code, rebuild (`node tools/build.js`) and update the docs it affects; do not leave a stale test or doc behind.
- Never commit or push unless the user asks; pushing to `main` deploys the public site.

## Module map (see CONTRACT.md §3 for files)
core/bus/rng · palette · court data · nav · ball · shots · players · doubles AI · rules · match flow · render core · court/island/club worlds · rigs/actors · crowd/fx · replay/ceremony · audio · commentary · UI (Studio panel) · game (Play mode) · main.

## Style target
Pixel-art diorama inside a page whose chrome (panel, type, copy, motion) matches annetta.dev. See CLAUDE.md "Design language".

## Done means
Plays walk-on → trophy ceremony without deadlock on all 4 courts × 4 lightings × 3 formats × 2 scoring modes; passes dupcheck and the test suites in `docs/TESTING.md`; the Play-mode journey (title → create → setup → match) works on desktop and phone; the offline file opens with network disabled.
