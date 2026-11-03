# Littleworld Jakarta Padel Cup

A physics-driven, real-time 3D pixel-art **doubles padel final** on a floating island, built as a web toy for [annetta.dev](https://annetta.dev). The tournament title always carries the current year (`Littleworld Jakarta Padel Cup 2026`, `2027`, …), taken from the visitor's clock at runtime.

You make a player, team up with **Annetta Arslan**, and coach your pair from the coach box while the match plays out: walk-on, toss, warm-up, rallies off the glass and mesh, line-call challenges with replay, changeovers, handshake and trophy ceremony.

- Play: https://ant133.github.io/littleworld-padel/ (GitHub Pages). The intended address is https://padel.annetta.dev; the custom domain still has to be set up, see [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md)
- Repository: https://github.com/ant133/littleworld-padel
- Offline copy: `littleworld-offline.html` (three.js embedded, runs with no network; downloadable from the site)

## How to play

The page opens on a title card over the live club.

1. **Play with Annetta** (or **Continue as <name>** if you already made a player on this device).
2. **Make your player:** name, Woman/Man, nationality, with a live portrait and nine stat bars. *Shuffle look & stats* rerolls. A woman plays women's doubles with Annetta; a man plays mixed doubles.
3. **Set up the match:** format (Quick / One set / Best of 3), scoring (Golden Point / Advantage), court (Classic Blue, Terracotta, Fast Blue, Indoor), time of day, and a random opposing pair you can shuffle.
4. **Kick off.** The camera starts in the close-up; *Skip intro* jumps straight to play.

In the match the court fills the screen. Your pair is ringed and labelled **YOU** and **ANNETTA**. The coach bar controls your team only:

| Control | What it does |
| --- | --- |
| Balanced · Attack · Safe · Net · Lobs · Smash | Team tactic |
| Middle: You / Annetta | Who takes the middle ball |
| Timeout | Rest and re-set (one per match) |
| Challenge | Eagle-Eye style line review with replay (two per set) |

Top-right icons: pause, speed (1×/2×/4×), camera cycle, sound, Studio. `Esc` opens the pause menu. Sound and speech are **off** until you turn them on.

Saved players live in this browser's IndexedDB (database `littleworld-padel`). They belong to this site origin and device; clearing site data removes them.

### Studio mode

The original full control panel is still there, optional: the **⚙ Studio** button, the pause menu, or `?mode=studio`. It has every match setting, all coach presets and serve/return/aim controls, camera and lighting, audio sliders, the match centre (stats, feed), and the debug overlay.

### Keys

`Space` pause · `Q`/`E` rotate · `1`–`5` cameras · `+`/`-` zoom · `R` reset view · `C` challenge · `A` aim-click · `N` new match · `S` sound · `M` mute · `` ` `` debug · `?` all shortcuts.

Dragging orbits the camera and, on release, snaps to the nearest true isometric quarter turn so the court never looks skewed.

### URL flags

| Flag | Effect |
| --- | --- |
| `mode=studio` | Open with the full panel instead of Play mode |
| `title=0` | Skip the title; watch the live match with a *Play with Annetta* button |
| `auto=0` | Do not start a background match |
| `cam=club\|close\|follow\|top\|free` | Starting camera |
| `tod=day\|dusk\|night` | Lighting |
| `venue=classicBlue\|terracotta\|fastBlue\|indoor` | Court |
| `format`, `scoring`, `type=M\|W\|X`, `seed`, `speed`, `fast=1`, `px` | Match and render options (`px` = pixel size) |

## What is in the box

- **Real physics:** swept-sphere ball with drag, Magnus and spin; per-surface restitution and friction for floor, 3 m glass, mesh, net and posts; open entrance at the net that a ball can leave through. Wall rebounds are physics, not decoration.
- **Doubles AI:** formations, claim tokens for the middle, lobs, bandejas, víboras, smashes and kick smashes, wall play, fatigue, reaction delay, tactical timeouts and challenges for the AI teams.
- **Rules:** advantage and golden-point scoring, quick/one-set/best-of-3, tie-breaks, serve rotation, faults and lets, out-of-court retrieval, review.
- **Look:** low-resolution render with depth outline, 90-colour OKLab palette snap and Bayer dither; 4 courts × day/dusk/night plus indoor; cutaway for stands and buildings; floodlights go transparent when they block the court.
- **Show:** crowd, confetti, replays, ceremony, WebAudio synth, commentary (optional speech).
- **Annetta in-world:** `annetta.dev` sponsor board, `A✦` on the LED screen, a mascot in the stands. The roster, clubs and sponsors are all fictional.

## Build and test

Node.js 22 or later. No `npm install`; three.js r128 is vendored in `vendor/`.

```sh
node tools/devpage.js          # dev.html (all src/*.js, open in a browser)
node tools/dupcheck.js         # module boundaries, globals, bus events
node tools/build.js            # dist/littleworld-online.html + -offline.html
node tools/build.js --check    # build + dupcheck + headless browser smoke test
node tools/make_artifact.js    # dist/littleworld-artifact.html (artifact publishing)
```

Output files:

- `dist/littleworld-online.html`: three.js r128 from cdnjs, everything else inline
- `dist/littleworld-offline.html`: three.js embedded; works with no network
- `dist/littleworld-artifact.html`: online build prepared for artifact publishing

Tests (headless unless noted; details and latest results in [docs/TESTING.md](docs/TESTING.md)):

```sh
node tools/physics_tests.js        # ball and court
node tools/scoring_tests.js        # scoring against an independent reference (--quick for a shorter run)
node tools/player_ai_tests.js      # custom players, smash tactics, full women's and mixed matches
node tools/commentary_tests.js
node tools/matrix.js [--part k/3]  # full matches across formats, scoring, types and venues
node tools/sim_cli.js --n 12       # aggregate match statistics (--tune '{json}' to experiment)
node tools/e2e.js                  # browser: a match through to the ceremony and results
node tools/features_browser.js     # browser: Play-mode journey, saved players, camera, offline render
node tools/visual_matrix.js        # browser: courts × lighting × cameras, desktop and mobile
```

## Deploy

Pushing to `main` runs `.github/workflows/pages.yml`: dupcheck, build, physics, scoring and player-AI tests, then it publishes the online build as `index.html` and the offline build as `littleworld-offline.html` on GitHub Pages. Nothing is deployed from a local build alone. Setup, the `padel.annetta.dev` custom domain and DNS record: [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

## Repository layout

```
src/        one file per module, concatenated in numeric order (namespace HPO)
              00–09 headless simulation: core, palette, court, nav, ball, shots, players, AI, rules, match
              10–20 presentation: render, worlds, rigs, crowd/fx, replay/ceremony, audio, commentary, panel UI, main
              21_game.js  Play mode (title, create player, setup, HUD, coach box, results)
              shell.html / shell.css  page chrome in the annetta.dev style
tools/      build, dupcheck, headless and browser test drivers
docs/       API notes, visual contract, testing summary, Pages setup
dist/       build output
vendor/     three.js r128
assets_src/ source for the embedded mascot sprite
.github/    Pages workflow
```

## Documentation

- [CONTRACT.md](CONTRACT.md): architecture, interfaces, events, rules (source of truth for module boundaries)
- [docs/PLAY_MODE.md](docs/PLAY_MODE.md): Play mode flow, states, and how it talks to the sim
- [docs/VISUAL_CONTRACT.md](docs/VISUAL_CONTRACT.md) and [docs/API_render.md](docs/API_render.md): presentation layer
- [docs/API_court_ball.md](docs/API_court_ball.md) and [docs/API_rules.md](docs/API_rules.md): simulation APIs
- [docs/TESTING.md](docs/TESTING.md): test commands, latest results, known gaps
- [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md): publishing at padel.annetta.dev
- [SPEC.md](SPEC.md): the original product brief; [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md): rules for agents working in this repo
