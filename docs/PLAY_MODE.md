# Play mode (`src/21_game.js`, `HPO.mod.game`)

Play mode is the default experience: a game-like flow with the match as the focus and a small coach box. **Studio** is the original full control panel (`src/19_ui.js`) and stays available as an option. Play mode is presentation only. It never touches physics, rules or AI internals; it drives the sim through the same public calls as the panel.

Style: annetta.dev chrome (cream cards, hard shadows, uppercase section tags, Manrope/DM Sans with system fallbacks). Pixel art stays inside the canvas; UI text is not pixelated.

## Flow and states

`HPO.mod.game.st` is the current state; `#app[data-gm]` mirrors it for CSS.

| `st` | Screen | Leaves via |
| --- | --- | --- |
| `title` | "Play with Annetta" (or "Continue as <name>" + "New player" when a saved player exists), "Just watch", "Studio controls". The live club plays behind it, camera `club`. | Create / Continue / Watch / Studio |
| `create` | 01 / Your player: name (autofocus, required), Woman/Man, nationality, live portrait + nine stat bars, "Shuffle look & stats", Annetta shown as partner. "Save & continue" writes the player to IndexedDB. | `setup` |
| `setup` | 02 / Quick match: format, scoring, four court thumbnails, time of day (disabled for Indoor), random opposing pair with Shuffle. "Kick off". | `playing` |
| `playing` | Full-screen match: HUD, coach box, YOU / ANNETTA labels. | pause menu, `results`, Studio |
| `watch` | Background match with a "Play with Annetta" button (`?title=0`, or "Just watch"). | create/setup |
| `results` | Champions / Good fight card: score, winners, aces, longest rally, distance, points won, MVP. Play again · Change setup · New player · Back to title. | any of those |
| `studio` | Full panel; Play HUD hidden. | "▶ Play mode" button |

URL: default is Play mode with the title. `?mode=studio` opens Studio; `?title=0` opens the watch state.

## Match setup rules

- A woman plays **women's doubles** (`type: 'W'`) with Annetta; a man plays **mixed** (`type: 'X'`).
- Team A is always the visitor's pair `[custom player, 'p5']` (p5 = Annetta Arslan). Opponents are a random pair from the fixed roster, shuffled without repeating the previous pair.
- Defaults: Quick format, Golden Point, Classic Blue, Day, speed 1×, seed random.
- `kickoff()` resets both teams' coach orders to Balanced, sets `match.coachTeam = 'A'`, starts a new match, and switches the camera to `close` (TV follow on phones) (`G.camPref`). After the intro/ceremony camera sweeps, the camera returns to the player's chosen view when play starts.
- "Skip intro" calls the same skip as the Studio ceremony skip: walk-on, introductions, toss and warm-up are bypassed and players are placed for the first serve.

## HUD and coach box

Top-right icons: pause, speed (1× → 2× → 4×), camera cycle (Close-up, TV follow, Whole club, Top-down), sound (off by default; speaker icon, crossed when off), Studio. Sound (effects, crowd, commentary) and Music (the optional embedded soundtrack, see README) each have a one-click on/off button and a volume slider (`gm-vrow`): on the title screen under the buttons, on setup and pause, and in a HUD popover opened by the sliders button, which also holds the Callouts switch. The HUD icon column has only the one sliders button (no separate speaker and note buttons); `S` still toggles sound. Switching music off remembers the position in the song and switching it back on resumes there. Both start off; the sliders and toggles share `ui.api.setVolume/setSound/setMusic`, and every copy repaints together (`refreshAudio`). Callouts can be switched off (`ui.api.setCallouts`, `ui:setting` key `callouts`); the Studio panel has the same switch. A chevron tab on the left edge slides the match centre (scoreboard) away and back. On phones the camera defaults to TV follow (the whole club is too small to read); intro, walk-on and replays use TV follow everywhere. Callouts (OUT!, FAULT!, SMASH! …) appear as comic bursts, and the pre-match phases show a large state ribbon (MATCH INTRO, WALK-ON, COIN TOSS, WARM-UP); a replay shows a flashing REPLAY label. `Esc` opens a pause menu (Resume, Restart, Back to title, Studio controls); `Space` also pauses.

The coach bar controls **team A only** and is intentionally limited:

| Control | Maps to |
| --- | --- |
| Coach dropdown (`#gm-tactic`): Balanced, Attack, Safe, Net, Lobs, Smash | `ai.setOrders('A', {preset})` with `balanced`, `aggressive`, `safe`, `controlNet`, `defensive`, `moreSmashes` |
| Middle ball dropdown (`#gm-middle`): Auto, You, Annetta | `ai.setOrders('A', {middlePriority: undefined, 0 or 1})` |
| Timeout · n | `rules` timeout (one per match); enabled only during play |
| Challenge · n | `rules.canChallenge('A')`; two per set |

Everything else (serve/return direction, aim-click, focus opponent, all other presets) is Studio-only. A commentary ticker shows the latest feed line above the coach bar; match/set/break point shows as a toast. Your pair is ringed (`actors.highlight`) and labelled by projecting the rigs' positions each frame.

## Persistence

Saved players are stored in IndexedDB database `littleworld-padel`, object store `players` (written by `ui`, restored through `players.restoreCustom`). No `localStorage`. If IndexedDB is unavailable the player still works for the session and a toast says local saving is unavailable.

## Module boundary

`ui.init` calls `game.init(ctx, ui.api)`. `ui.api` exposes the helpers Play mode needs (`newMatch`, `setCam`, `setSpeed`, `togglePause`, `setSound`, `callTimeout`, `doChallenge`, `skipCeremony`, `claimCoach`, `orders`, `savePlayerDef`, `drawPortrait`, `flagEl`, `mbar`, `toast`, `teamSum`, `contribution`, plus the shared state `S` and DOM refs `EL`). `ui` calls back `game.update(dt)` each frame, `game.onFeed`, `game.onSaved`, `game.onEscape`, and `game.results()` when a match ends while Play mode is active. `game` adds no new BUS events (it listens to `match:phase`, `flag:update`, `match:new` and emits the existing `ui:setting` when the mode changes).

## Test

`node tools/features_browser.js` drives the real journey in headless Chrome against the offline build: title → create (focus, empty-name validation) → setup → kick off (coach bar, ring/label, camera) → reload (saved player restored, "Continue as") → man → mixed match; plus the orthographic-court check and a 390×844 phone render with no horizontal scroll.
