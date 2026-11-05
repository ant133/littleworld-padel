# Testing summary

Run everything from the repo root with Node 22+. The headless suites need no browser. The browser suites use headless Chrome through `tools/browser.js` (SwiftShader WebGL) and read `dist/`, so run `node tools/build.js` first.

| Command | What it checks |
| --- | --- |
| `node tools/dupcheck.js` | IIFE wrapping, duplicate module/global names, bus events vs CONTRACT §6 |
| `node tools/physics_tests.js` | 20 ball/court cases: tunnelling at 60 m/s, energy, spin, glass/mesh/net/entrance, exterior ground and items, prediction vs live, watchdogs |
| `node tools/scoring_tests.js [--quick]` | 119 cases: 6 format×scoring combos × 10,000 random matches vs an independent reference scorer; serve rotation; tie-breaks; live point FSM; outside-contact scoring |
| `node tools/player_ai_tests.js` | custom-player validation and restoration, gender eligibility, duplicate prevention, kick smashes on both ends, overhead preference, full women's and mixed matches with Annetta |
| `node tools/commentary_tests.js` | commentary generator over simulated events |
| `node tools/i18n_tests.js` | dictionary module: lookup, fallback, tokens, parity of every registered language |
| `node tools/matrix.js [--part k/3]` | 18 full matches: 3 formats × 2 scorings × M/W/X, venues rotated |
| `node tools/sim_cli.js --n N [--seed S] [--tune '{json}']` | aggregate match statistics |
| `node tools/reflex_stats.js [--n N] [--seed S] [--tune '{json}']` | what happens to smashes (winner, error, touched, rally continues) and how often the net players trade 3+ volleys in a row |
| `node tools/build.js --check` | build, dupcheck, external-reference scan of the offline file, headless smoke test |
| `node tools/e2e.js "?speed=12" prefix` | browser: samples a match at 12× through the end-of-match phases |
| `node tools/features_browser.js` | browser, offline build: the Play-mode journey (see below, including the chevron opening the full match centre) plus a phone render |
| `node tools/visual_matrix.js` | browser: courts × lighting × cameras on desktop, plus mobile |

## Latest results — 3 November 2026 (Play mode build)

Re-run on 4 November 2026 after the balance pass (CONTRACT 0.8/0.8.1): `dupcheck` OK, `physics_tests` 20/20, `scoring_tests --quick` 119/119, `player_ai_tests` pass, `commentary_tests` 1624 passed (count varies with match dynamics), `matrix` 18/18 with 0 watchdog trips. The other bullets below are from 3 November and were not re-run.

- `dupcheck`: OK, 24 files, 24 modules, 36 contract events.
- `physics_tests`: 20/20.
- `scoring_tests --quick`: 119/119.
- `player_ai_tests`: pass (custom players and restoration, gender rules, duplicates, kick smash on both ends, overhead interception; full women's and mixed matches with no watchdogs and repeatable by seed).
- `commentary_tests`: 1846 passed, 0 failed.
- Ball bounce (6 matches, seed 500, local script): of floor impacts at 9+ m/s vertical, rebounds above 3.9 m went from 13.5 % to 0 % (mean rebound apex 1.95 m to 1.39 m), and out-of-court retrievals from 2.2 % of points to 0. `restit` now lowers restitution with impact speed.
- Volume sliders, toggles and the callouts switch checked in headless Chrome on a 390 px phone (sound/music state, gains, repaint across screens, callouts cleared when off); no errors.
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

### Simulation statistics (12 Quick Match runs, 531 points, seed 200, current tuning)

| Metric | Result | Target | Status |
| --- | --- | --- | --- |
| First serve in | 88.9 % | 85–95 % | ok |
| Aces | 0.0 % | 0.5–2 % | low: receivers return every serve |
| Double faults | 1.1 % | 1–3 % | ok |
| Rally length (strokes incl. serve) | median 11, mean 12.8, p10 4, p90 25 | 11–12 median (asked for), 6–12 in CONTRACT §15 | ok |
| Lobs | 17.8 % of strokes | 8–14 % | high: the fallback for a low ball and the defend formation both lob |
| Volleys | 12.9 % of strokes | 25–35 % | low: defenders wait at the glass, net duels are calmer |
| Wall-assisted returns | 7.7 % of strokes | 15–25 % | low |
| Smash winners | 13.7 % of points | 2–6 % | high, smashes are deadly by request |
| Winners / forced / unforced | 32.6 % / 52.9 % / 13.0 % | unforced 25–40 % | unforced low |
| Point ended by the net | 19.8 % of points (about 1.7 % of strokes) | – | was 25–32 % |
| Point ended by a ball hit long or out | 36 % of points | – | was 54 % |
| Strokes struck with no valid launch at the real contact point | 0 % | 0 | was 9.3 % (they flew off at about 50°) |
| Watchdog-ended points | 2 of 531 (0.4 %) | 0 | nearly there (the 45 s watchdog is about 34 strokes; very long rallies tire the players) |

### Attack and reflex statistics (`reflex_stats.js`, 12 Quick Match runs, men's and women's, seed 900)

| Metric | Before (c2ef9f7) | After |
| --- | --- | --- |
| Smashes, share of strokes | 16.4 % | 7.6 % |
| Points containing a smash | 64.0 % | 59.1 % |
| Last smasher wins the point | 42.9 % | 64.4 % |
| Smash untouched by the defenders (winner) | 4.2 % | 18.6 % |
| Smasher's own error (net, out, back on his side) | 14.4 % | 14.3 % |
| Smash touched by the defenders | 81.4 % | 67.1 % |
| Rally carries on after the defenders' return | 70.2 % | 54.8 % (asked for 55 %) |
| Points with 3+ alternating volleys | 25.1 % | 3.8 % |
| Points with 4+ alternating volleys | 13.3 % | 0.2 % |
| Mean rally (strokes) | 9.7 | 11.7 |

What changed since the first attack/reflex pass: execution error is smaller (`errPhi` 1.755, `errTh` 1.71 after the 0.8 balance pass; 1.95 / 1.9 before); a stroke that has no way over the net from the real contact point is replaced (`rescueShot`: the same stroke with less margin, a lob, a lob, a slice) instead of being struck anyway; the AI sizes net clearance and depth margin from the error it faces (`netSafe`, `depthSafe`); vibora and deep volleys aim inside the lines; two volleys in a row make the next ball a lob, a drop or a ball at the feet (`resetCalm`), and lob wars wear off (`lobTire`); smashes read 0.2 s later (`smashRead`) and the AI places them by flight tracing (`smashAim` 0.6); overheads up to 3.35 m count as legal strikes (they whiffed at 3.05 m).

Live salvage (a quick player plays a ball that bounced in and flew out, just over the fence or after running out through the entrance): balls leave the court after a legal bounce in about 2.6 % of points, most of them over the fence top at 3–5 m, so only a few are reachable; one salvage smash showed up in 12 matches with the default eligibility, and 4 in 72 matches with every player allowed (half of those carried the rally on).

Tuning knobs live under `HPO.cfg.TUNE` and can be overridden with `sim_cli --tune '{...}'` or `reflex_stats --tune '{...}'`: `errPhi`, `errTh`, `errSpeed` (execution error), `speed`, `react`, `readScale` (extra time to read fast, close or smashed balls, 1.265), `smashRead` (the smash share of it, 0.2 s), `smashAftermath` (extra difficulty of the return after a smash, 0.1), `pressK` and `stretchK` (how much time pressure and a lunge widen the error, 1.0 and 1.6), `salvageSkill` (80), `rally` (`{from, per}`), `ai` (`sharp`, `smashDepthMax`, `lobBase` 0, `lobNet` 1.5, `viboraNear` 1.9, `lobTire` 0.45, `aimNoise`, `riskMargin`, `volleyWilling`, `duelCalm` 1.1, `resetCalm` 1.2, `smashWilling` 0.32, `smashNearBoost` 1.65, `bandejaNear` 0.3, `bandejaDeep` 1.2, `gamble` 0.6, `retreatCost` 0.03, `smashAim` 0.6, `netSafe` 2.0, `depthSafe` 1.0, `dropBack` 1).

### Balance pass — 4 November 2026 (position-driven play, 40 Quick/Golden/Classic Blue/Day matches, 1315-1349 points)

Behaviour changes (CONTRACT 0.8): overhead technique depends on depth (near the net: smash 23 % to 63 %, bandeja 51 % to 12 %), players keep their home lane (strokes from own lane 62 % to 88 %), the partner of a server takes the lane opposite the server's, and defenders may gamble by pressing to the net on an expected overhead (`press` formation, about 100 step-ups per match) and pay a stamina cost when a bandeja sends them back (`retreatCost`).

Those changes alone made smashes too deadly (smash winners 38.9 % of points, rally median 6). A 160-match candidate round (scratch tooling, not in the repo) then set these defaults: `errPhi`/`errTh` x0.9, `readScale` 2.3 to 1.265, `smashNearBoost` 2.2 to 1.65, `smashWilling` 0.4 to 0.32, `duelCalm` 2.2 to 1.1, `resetCalm` 2.4 to 1.2.

| Metric | Before the pass (position rules only) | Now | Target |
| --- | --- | --- | --- |
| Rally median / mean / p90 | 6 / 8.0 / 16 | 9 / 10.7 / 21 | 11-12 / - / 22-28 |
| Rallies over 20 strokes / of 3 or fewer | 4.8 % / 18.3 % | 12.9 % / 10.5 % | >=10 % / <=15 % |
| Smash winners (% of points) | 38.9 % | 24.1 % | down |
| Smash untouched / defended and rally continues | 30.5 % / 43.0 % | 18.0 % / 56.0 % | 15-20 % / about 55 % |
| Points with 3+ alternating volleys | 2.6 % | 9.5 % | 10 % |
| Volleys, share of strokes | 17.2 % | 19.8 % | 25-35 % (miss) |
| Lobs / wall returns | 15.0 % / 7.0 % | 14.5 % / 8.0 % | 8-14 % / 15-25 % (wall misses) |
| Winners / forced / unforced | 52 / 40 / 7 % | 41 / 52 / 6 % | 30 / 40 / 30 (miss) |
| First serve in / aces / double faults | 88.9 / 0 / 0.7 % | 89.1 / 0 / 1.0 % | 85-95 / 0.5-2 / 1-3 % |
| Deuce games / close scores | 31.7 % / 52.5 % | 28.9 % / 57.5 % | >=30 % / >=50 % |
| Mean fatigue / sim minutes per match | 9.6 % / 8.3 | 20.9 % / 10.8 | - |

Sensitivity (20-match cells, noise about 3 pp): `readScale` is the strongest smash dial (x0.7: smash winners -12.8 pp, defended-and-continues +6.8 pp); `error` is the rally-length dial (x0.7: mean rally +1.3 but winners +16 pp); `smashNearBoost` and `smashWilling` move smash winners 3-4 pp per 30 %; `speed` only hurts when lowered; `react`, `smashAftermath`, `lobBase`, `gamble` are within noise; `volleyWilling` barely moves volley share (`duelCalm`/`resetCalm` do). Venues: indoor has the shortest rallies, terracotta the most winners. Extra error turns winners into forced errors, not unforced ones, so the unforced 25-40 % target needs the classifier revisited, not the tuning. Open: aces stay at 0, wall returns and volley share are below target, winners are above it. `reflex_stats --n 12`: 14.7 % smashes, 18.9 % untouched, 52.0 % rally continues, 3+ volleys 6.4 %.

Lob and vibora pass (28 matches, 4 Nov / 5 Nov 2026): lob share by opponents at the net (0 / 1 / 2) went from 9.4 / 13.8 / 29.3 % to 8.4 / 17.2 / 35 % (overall 15.9 % to 17.8 %, above the 8-14 % target by request); vibora on near-net balls at 1.5-1.85 m went from 0.1 % to 29 %. The 40-match balance table above was not re-run after this change; regression suites were (dupcheck, physics 20/20, scoring 119/119, player_ai, commentary 1652, matrix 18/18). Touch gestures, the Aim button, the Eagle Eye camera restore and floodlight hiding were checked with synthetic pointer events in headless Chrome at 390x844 (not on a real phone).

Coach dock (5 Nov 2026): 9 matches per setting, team A ordered through `ai.setOrders`, about 300 points each. Fortress: lobs 27 % (base 18.5), smashes 9 % (base 15), rally 12.3 (base 10.3). All-in: smashes 23 %, lobs 10 %. Spin / Flat shift the groundstroke mix (flat 1.5 / 5.5 %, slice 14 / 7 % against 2.6 / 9.8 base). Wear them down: opponents' fatigue 0.30 (base 0.18) and lobs 21 %. Break the net: lobs 30 %. Take the net: volleys 19.6 % (base 15.7). `features_browser` now checks 5 mindset stops, 6 plans, 3 styles and the Aim button. The smart hint and the phone Coach sheet were checked with screenshots at 1280x800 and 390x844 only.

QTE (5 Nov 2026): `tools/qte_tests.js` stubs the module and checks the sim side (a good swipe lands 1.7 m from the target against 3.9 m for a sloppy one; a missed swipe plays the soft shot; a target on the player's own half falls back to the AI shot). The overlay, camera and swipes were checked in headless Chrome with forced triggers (`qte.force`, `qte.durScale`) and synthetic pointer events: attack, defence (glass and drive gestures) and a timeout. The full regression suites and the browser journey were not re-run after the QTE and the dock restyle (by request); the last full pass is the one above.

Points formats (5 Nov 2026): `tools/americano_tests.js` checks the serve rotation (2 or 5 serves per player in the order A1 B1 A2 B2, deuce first, tie-break by A1), clinching, side changes (every 4 / 6 points) and a full simulated Blitz match (about 2.9 sim minutes against 8-10 for Quick; Americano about 6).

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
