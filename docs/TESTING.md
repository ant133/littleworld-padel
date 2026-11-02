# Testing summary

## Visitor players and gameplay update — 2 November 2026

- `node tools/dupcheck.js`: 22 modules, all event declarations valid.
- `node tools/physics_tests.js`: 20/20, including immediate exterior-ground termination and swept exterior-item collision at 60 m/s; prediction agrees with live physics.
- `node tools/scoring_tests.js`: 119/119, including immediate outside-contact scoring before/after a legal bounce, during retrieval, with one point awarded per contact.
- `node tools/matrix.js`: 18/18 full matches across all three formats, both scoring modes, all match types, and rotating venues; no watchdogs or application errors. This is an 18-case matrix, not the full Cartesian product of every venue and presentation setting.
- `node tools/player_ai_tests.js`: custom-player validation, repeatable stats/appearance after restoration, gender restrictions, duplicate prevention, reachable deep-lob kick smashes on both ends, and overhead interception preference.
- Seeded high-ball comparison (200 identical situations): previous AI 41 smash choices; new balanced AI 101; new More Smashes preset 173. This measures tactical selection, not smash success rate.
- `node tools/features_browser.js`: female/male creation, IndexedDB write and exact roster restoration after reload, team-up with Annetta, mixed match start, parallel court edges at eight camera angles, obstructing floodlight visibility near 5%, desktop/mobile screenshots, and rendering with network disabled. No application errors. IndexedDB is asynchronous; the test waits for restored records rather than assuming a fixed refresh delay.
- Both HTML files rebuilt. Desktop and mobile screenshots inspected. Real GPU frame rate and real touch input were not measured in this update.

## Integration (CP2–CP5, browser)
Headless Chrome (SwiftShader WebGL) via tools/browser.js:
- `node tools/build.js --check`: dupcheck OK, offline file loads with no console errors, drawCalls ≈ 200, no network needed (only the optional Google Fonts link is requested when online).
- `node tools/e2e.js`: a Quick Match plays at 12× through 1100 simulated seconds (3–3 in games) with 0 errors; forcing the match end walks matchEnd → handshake → ceremony (podium, confetti) → results card with 0 errors.
- `node tools/visual_matrix.js`: 10 configs (classic/terracotta/fast/indoor × day/dusk/night × close/follow/top/club, mobile 390×844) – 0 console errors, mobile has no horizontal scroll, mobile pixel size 3.
- Unit suites: physics 19/19, scoring 119/119, commentary 1805/1805, dupcheck OK (22 files).
- Headless matrix (`node tools/matrix.js --part k/3`): all format×scoring×type×venue combinations finish with valid scores.
- Budgets: ≈ 200 draw calls, ≈ 250k tris desktop; ≈ 145k tris mobile (target 120k – slightly over).

Not verifiable here: real GPU frame rate (SwiftShader ≈ 10–50 fps), real speechSynthesis voices and audible mix quality, touch gestures (pinch / two-finger pan), WebGL1 fallback.

# Testing summary — CP0/CP1 (headless simulation)

Run everything from the repo root with Node (no browser needed).

| Command | What it checks | Last result |
|---|---|---|
| `node tools/dupcheck.js` | IIFE wrapping, duplicate module/global names, bus events vs CONTRACT §6 | OK (9 files, 8 modules) |
| `node tools/physics_tests.js` | 19 ball/court cases: tunnelling at 60 m/s, energy, spin, glass/mesh/net, prediction vs live, watchdogs | 19/19 pass |
| `node tools/scoring_tests.js` | 119 cases: 6 format×scoring combos × 10,000 random matches vs an independent reference scorer; serve rotation; tie-breaks; live point FSM | 119/119 pass |
| `node tools/matrix.js --part k/n` | 18 full matches: 3 formats × 2 scorings × M/W/X, venues rotated | 18/18 finish, 0 errors, valid final scores |
| `node tools/sim_cli.js --n 12 --seed 200` | Aggregate match statistics | below |

## Simulated statistics (12 Quick Match runs, 488 points, seed 200, default tuning)

| Metric | Result | Target (SPEC) | Status |
|---|---|---|---|
| First serve in | 90.4 % | 85–95 % | ok |
| Aces | 0.0 % | rare | too low — receivers return everything |
| Double faults | 0.4 % of points | 1–3 % | low |
| Rally length (strokes incl. serve) | median 12, mean 13.3, p10 3, p90 24 | 6–12 | upper edge |
| Lobs | 21 % of strokes | frequent | ok (a bit high) |
| Volleys | 22 % of strokes | frequent | ok |
| Wall-assisted returns | 8.4 % of strokes | integral | ok |
| Smash winners | 4.1 % of points | occasional | ok |
| Volley winners | 17.8 % of points | — | high |
| Winners / forced / unforced | 34 % / 54 % / 10 % | plausible mix | unforced too low |
| Watchdog-ended points (45 s) | 1.4 % | 0 | needs more tuning |

Tuning knobs (all under `HPO.cfg.TUNE`, overridable via `sim_cli --tune '{...}'`): `errPhi`, `errTh`, `errSpeed` (execution error), `speed` (player speed), `react` (reaction delay multiplier), `rally` (`{from, per}` fatigue in long rallies), `ai` (`sharp`, `smashDepthMax`, `lobBase`, `aimNoise`, `riskMargin`, `volleyWilling`).

## Fixed during this checkpoint (found by the harness)
- Serve aim measured depth from the wrong box edge on the negative-x half.
- Rules module was not attached in headless runs (no `HPO.boot()`).
- AI role-assignment timer wasn't reset between matches, silently breaking every match after the first (would have broken "New Match" in the browser).
- Players hit the ball on the exact tick it bounced, when it still lay on the floor.
- A post-solve "power" multiplier changed range by up to 12 % after the shot had been aimed.
- Unforced/forced classification ignored time pressure.

## Not implemented yet / known gaps (CP1)
- Out-of-court retrieval relaunch (rules flag exists, default off; no ball-boy/door walk yet).
- Warm-up cooperative rallies (phase exists, no rallies yet).
- AI use of challenges, tactical timeouts, and the coach "focus on one opponent" target selection UI hook.
- Commentary generator (`18_commentary.js`) and everything in CP2+ (rendering, rigs, crowd, audio, UI).
- Foot-fault and double-hit detection are out of scope of the rules module.
