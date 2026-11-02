# AGENTS.md — Littleworld Jakarta Padel Cup

Shared instructions for every agent (Claude Code, subagents, other tools) working in this repo.

## What this is
A live, shareable web toy for **annetta.dev**: a real-time 3D pixel-art diorama of a professional doubles padel final, "Littleworld Jakarta Padel Cup", on a floating island. It is a physics-driven simulation, not an animation. Full product spec lives in `SPEC.md`; architecture and interfaces live in `CONTRACT.md` (source of truth for module boundaries; visual layer in docs/VISUAL_CONTRACT.md).

## Deliverables
1. Online artifact: one self-contained HTML page, three.js r128 from cdnjs only.
2. Offline file: same game with three.js embedded, works with no network.
3. `CONTRACT.md` and a testing summary.

## Hard constraints
- Single HTML output per build; no other external assets, no `localStorage`, no `eval`, no `alert`.
- All people, clubs, sponsors, tournaments are original and fictional. UI language: English.
- Audio is OFF until direct user interaction; synthesized WebAudio only.
- One app namespace (`HPO`), shared event bus `BUS`, dependency injection between modules. No stray globals; run `dupcheck` before every integration.
- Fixed-timestep physics, seeded deterministic RNG, scoring logic independent of the renderer.
- Do not simplify the court into an open tennis court; do not reduce doubles to one-player-per-side logic; wall rebounds are physics, never decoration.

## Working rules
- Read `CONTRACT.md` before touching a module; change the contract first if an interface must change.
- Each module owns its files and nothing else. Cross-module calls go through BUS events or injected interfaces.
- Prefer reliability over decoration. If perf or complexity forces a trade-off, cut props, not physics or rules.
- Every change that touches physics, scoring or AI must be validated headless (no renderer) with the automated match harness before merging.
- Keep debug overlay hidden by default.

## Module map (see CONTRACT.md for detail)
court · island/grounds · clubhouse/stands/LED/lights · player rigs · movement/nav · ball physics · doubles AI · match flow/scoring · crowd/FX/replay/ceremony · audio · UI/match centre/camera.

## Style target
Pixel-art diorama inside a page whose chrome (panel, type, copy, motion) matches annetta.dev. See CLAUDE.md "Design language".

## Done means
Plays walk-on → trophy ceremony without deadlock on all 4 courts × 4 lightings × 3 formats × 2 scoring modes; passes dupcheck; offline file opens with network disabled.
