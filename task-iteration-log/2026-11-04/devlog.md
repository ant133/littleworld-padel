# Devlog 2026-11-04


## 15:00 · Clean up cloned repo layout and enable task-iteration-log · claude · padel@main
- **Status:** done
- **Prompt:** Repo was moved to the top directory by hand; clean up leftovers, read the project, then start the task log and make Claude always use it.
- **Plan:** Restore .git and .github/workflows, read README/CLAUDE.md, add a rule to CLAUDE.md.
- **Done:** Moved .git up from littleworld-padel/, removed the empty folder, renamed workflows/ back to .github/workflows/ (git status clean). Added workflow step 6 to CLAUDE.md requiring the skill. Custom domain was set up by the user.
- **Files:** `CLAUDE.md`, `.github/workflows/pages.yml`
- **Decisions:** D-2026-11-04-1500
- **Follow-ups:** verify padel.annetta.dev serves the game
- **Links:** 34de422

## 15:28 · Game-balance statistics and intensity tuning sweep · claude · padel@main
- **Status:** done
- **Prompt:** Run balance tests and report stats; tune for intensity (3+ volley chains back to 10%, deadly but defendable smashes). Full pass approved.
- **Plan:** Parallel runner in scratchpad (no repo edits): baseline 120 Quick, 9-knob x2 sweep x40, venue check, regression suites; report tables.
- **Done:** Added position-driven play (depth-based overhead choice, home lanes, serve partner lane, press/retreat gamble with stamina cost), then a 540-job sensitivity sweep and a 160-job candidate round; applied candidate C as defaults (error x0.9, readScale 1.265, smashNearBoost 1.65, smashWilling 0.32, duelCalm 1.1, resetCalm 1.2). 40-match check on the repo reproduces C: rally median 9, 3+ volley chains 9.5%, smash untouched 18%, defended-and-continues 56%. Suites pass (physics 20/20, scoring 119/119, player_ai, commentary 1624, matrix 18/18). Sweep tooling lived in the session scratchpad only, not in the repo.
- **Files:** `src/05_shots.js`, `src/06_players.js`, `src/07_ai.js`, `CONTRACT.md`, `docs/TESTING.md`
- **Decisions:** D-2026-11-04-1842
- **Follow-ups:** aces still 0%, wall returns 8% (target 15-25), volley share 20% (25-35), winners 41% (30); unforced target needs the classifier revisited; rally median 9 vs 11-12
- **Links:** f7ef398

