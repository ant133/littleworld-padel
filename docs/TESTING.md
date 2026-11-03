# Testing summary

Run everything from the repo root with Node 22+. The headless suites need no browser. The browser suites use headless Chrome through `tools/browser.js` (SwiftShader WebGL) and read `dist/`, so run `node tools/build.js` first.

| Command | What it checks |
| --- | --- |
| `node tools/dupcheck.js` | IIFE wrapping, duplicate module/global names, bus events vs CONTRACT §6 |
| `node tools/physics_tests.js` | 20 ball/court cases: tunnelling at 60 m/s, energy, spin, glass/mesh/net/entrance, exterior ground and items, prediction vs live, watchdogs |
| `node tools/scoring_tests.js [--quick]` | 119 cases: 6 format×scoring combos × 10,000 random matches vs an independent reference scorer; serve rotation; tie-breaks; live point FSM; outside-contact scoring |
| `node tools/player_ai_tests.js` | custom-player validation and restoration, gender eligibility, duplicate prevention, kick smashes on both ends, overhead preference, full women's and mixed matches with Annetta |
| `node tools/commentary_tests.js` | commentary generator over simulated events |
| `node tools/matrix.js [--part k/3]` | 18 full matches: 3 formats × 2 scorings × M/W/X, venues rotated |
| `node tools/sim_cli.js --n N [--seed S] [--tune '{json}']` | aggregate match statistics |
| `node tools/build.js --check` | build, dupcheck, external-reference scan of the offline file, headless smoke test |
| `node tools/e2e.js "?speed=12" prefix` | browser: samples a match at 12× through the end-of-match phases |
| `node tools/features_browser.js` | browser, offline build: the Play-mode journey (see below) plus a phone render |
| `node tools/visual_matrix.js` | browser: courts × lighting × cameras on desktop, plus mobile |

## Latest results — 3 November 2026 (Play mode build)

- `dupcheck`: OK, 24 files, 24 modules, 36 contract events.
- `physics_tests`: 20/20.
- `scoring_tests --quick`: 119/119.
- `player_ai_tests`: pass (custom players and restoration, gender rules, duplicates, kick smash on both ends, overhead interception; full women's and mixed matches with no watchdogs and repeatable by seed).
- `commentary_tests`: 1620 passed, 0 failed.
- `matrix`: 18/18 full matches (parts 0/3, 1/3, 2/3) finished with valid scores and 0 watchdog trips (quick/one set/best of 3 × advantage/golden × men's/women's/mixed, venues rotated). This is an 18-case sample, not every combination of venue, lighting and camera.
- `build --check`: CHECK OK. Online 769 KB, offline 1359 KB. Title shows the runtime year ("… Cup 2026"). The offline file's only network request is the optional Google Fonts stylesheet; there are no HPO errors, about 203 draw calls and 251k triangles on desktop.
- `features_browser` (offline build, headless Chrome, no network): title offers "Play with Annetta"; the create screen autofocuses the name field and an empty name is refused; a woman is saved and kicked off into a women's match with Annetta (`p5`) as partner, coach team A, close camera, and the coach bar present (tactic dropdown with six options, middle-ball dropdown with three, Timeout, Challenge); obstructing floodlights fade to about 5%; after a page reload the saved player is restored from IndexedDB and the title offers "Continue as Visitor Woman"; a new man player starts a mixed match; opposite court edges stay parallel at eight yaws; a 390×844 phone render has no horizontal scroll. No application errors.
- `e2e` (12 samples at 12×, dev build): no console errors or warnings. The match played through to the handshake, and the later samples show a fresh match starting from its intro (the attract loop). Ceremony and results frames fall between samples, so the ceremony itself was not inspected in this run.
- Flow check (local script, 8× full quick match, per-tick): 0 player position jumps over 0.35 m and 0 net crossings through intro, play, changeovers, handshake and ceremony; the losing team walked through the entrance to the podium; no receiving partner stood in front of the service line during a serve return.
- Phone check (local script, 360×780 at device ratio 2.625, offline build): low-res pixels are 5 device px (whole number), no stripes in screenshots; intro ribbon, callouts, replay label, coach dropdowns, match-centre chevron and speaker icon render; no errors. `visual_matrix` and `e2e` were not rerun after this change.
- `visual_matrix` (earlier run): 10 configurations spanning all four courts, day/dusk/night and the close, follow, top and club cameras, plus phone 390×844 club and close (not the full cross-product), 0 console errors; the phone layout has no horizontal scroll and uses pixel size 3.

### Performance budgets

| | Measured | Target (CONTRACT §15) |
| --- | --- | --- |
| Draw calls, desktop | about 180–210 | ≤ 350 |
| Triangles, desktop | about 250k | ≤ 350k |
| Draw calls, mobile | about 200 | ≤ 160 (**over**) |
| Triangles, mobile | about 145k | ≤ 120k (**over**) |
| Offline file | 1.34 MB | ≤ 3 MB |

Frame rates seen in headless Chrome with software WebGL (12–24 fps) say nothing about real devices.

### Simulation statistics (12 Quick Match runs, 500 points, seed 200, current tuning)

| Metric | Result | Target | Status |
| --- | --- | --- | --- |
| First serve in | 91.2 % | 85–95 % | ok |
| Aces | 0.0 % | 0.5–2 % | low: receivers return every serve |
| Double faults | 0.4 % of points | 1–3 % | slightly low |
| Rally length (strokes incl. serve) | median 8, mean 9.7, p10 2, p90 19 | 6–12 | ok |
| Lobs | 8.6 % of strokes | 8–14 % | ok |
| Volleys | 26.6 % of strokes | 25–35 % | ok |
| Wall-assisted returns | 10.7 % of strokes | 15–25 % | low |
| Smash winners | 6.6 % of points | 2–6 % | slightly high |
| Winners / forced / unforced | 32.5 % / 51.8 % / 15.4 % | unforced 25–40 % | unforced low |
| Watchdog-ended points | 1 of 500 (0.2 %) | 0 | nearly there |

Tuning knobs live under `HPO.cfg.TUNE` and can be overridden with `sim_cli --tune '{...}'`: `errPhi`, `errTh`, `errSpeed` (execution error), `speed`, `react`, `rally` (`{from, per}`), `ai` (`sharp`, `smashDepthMax`, `lobBase`, `aimNoise`, `riskMargin`, `volleyWilling`).

## Not verified / known gaps

- A real Android phone (device pixel ratio, pinch zoom at the new 18× limit, the native dropdown pickers); the stripes fix is verified only at an emulated 2.625 ratio.
- Real GPU frame rate and real touch input (pinch, two-finger pan) on phones; the WebGL1 fallback.
- Audible audio mix and real `speechSynthesis` voices.
- A real challenge call and timeout request through the Play-mode buttons mid-match, and the Play-mode results card at a natural match end (the results card was only opened by forcing the end).
- Portrait phone close-up is small; faded buildings can leave a dither ghost at some camera angles.
- Aces never occur and unforced errors are rare; a point can still rarely end by watchdog.
- Mobile triangle and draw-call counts are above the CONTRACT §15 targets.
- Foot-fault and double-hit detection are out of scope of the rules module.

## History

### Visitor players and gameplay update — 2 November 2026
- Physics 20/20 (immediate exterior-ground termination, swept exterior-item collision at 60 m/s), scoring 119/119 (outside-contact scoring before/after a legal bounce, during retrieval, one point per contact), matrix 18/18, player-AI suite added, seeded high-ball comparison (200 situations): previous AI 41 smash choices, new balanced AI 101, More Smashes preset 173 (tactical selection, not smash success rate). The browser test then covered the old Studio-panel creator; it now covers Play mode.

### Integration (CP2–CP5)
- Browser build checks, `e2e` and `visual_matrix` introduced; unit suites physics 19/19, scoring 119/119, commentary 1805/1805 at that time; headless matrix across all format × scoring × type × venue combinations finished with valid scores.

### Fixed during the first headless checkpoint (found by the harness)
- Serve aim measured depth from the wrong box edge on the negative-x half.
- Rules module was not attached in headless runs (no `HPO.boot()`).
- AI role-assignment timer wasn't reset between matches, silently breaking every match after the first (would have broken "New Match" in the browser).
- Players hit the ball on the exact tick it bounced, when it still lay on the floor.
- A post-solve "power" multiplier changed range by up to 12 % after the shot had been aimed.
- Unforced/forced classification ignored time pressure.

### Later fixes
- Court geometry: open entrance, 3 m side fence, header mesh and second glass panel replaced the original door layout; tunnelling test updated.
- Night lighting looked like day (per-vertex point lights) → light clamp and flood pool; indoor roof no longer blocked by the cutaway; `render.zoom` sign; skip-intro now skips; camera returns to the chosen view after the intro; court skew fixed with quarter-turn snapping.
