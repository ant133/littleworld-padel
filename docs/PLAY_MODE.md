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

Top-right icons: pause, speed (1× → 2× → 4×), camera cycle (Close-up, TV follow, Whole club, Top-down), sound (off by default; speaker icon, crossed when off), Studio. Sound (effects, crowd, commentary) and Music (the optional embedded soundtrack, see README) each have a one-click on/off button and a volume slider (`gm-vrow`): on the title screen under the buttons, on setup and pause, and in a HUD popover opened by the sliders button, which also holds the Callouts switch. The HUD icon column has only the one sliders button (no separate speaker and note buttons); `S` still toggles sound. Switching music off remembers the position in the song and switching it back on resumes there. Both start off; the sliders and toggles share `ui.api.setVolume/setSound/setMusic`, and every copy repaints together (`refreshAudio`). Callouts can be switched off (`ui.api.setCallouts`, `ui:setting` key `callouts`); the Studio panel has the same switch. The quick scoreboard always stays on screen; the chevron tab on its left edge opens the full match centre (Score, Stats, Players, Feed) in a drawer under it, and closes it again. The drawer borrows the Studio panel's match-centre section (`#sec-centre`) while it is open and hands it back when it closes or the HUD hides. On phones the camera defaults to TV follow (the whole club is too small to read); intro, walk-on and replays use TV follow everywhere. Callouts (OUT!, FAULT!, SMASH!, CHIQUITA!, DROP SHOT! …) appear as comic bursts, and the pre-match phases show a large state ribbon (MATCH INTRO, WALK-ON, COIN TOSS, WARM-UP); a replay shows a flashing REPLAY label. `Esc` opens a pause menu (Resume, Restart, Back to title, Studio controls); `Space` also pauses.

The coach bar controls **team A only** and is intentionally limited:

| Control | Maps to |
| --- | --- |
| Mindset dial (`.gm-step`, 5 stops, shield to sword) | `ai.setOrders('A', {mindset: -2..2})` |
| Plan icons (`.gm-plan`, one at a time; tap again to clear) | `{plan: 'exhaust' \| 'hunt' \| 'net' \| 'breakNet' \| 'glass' \| 'middle' \| null}` |
| Shots (`.gm-sty`): Spin, Mix, Flat | `{style: 'spin' \| 'mix' \| 'flat'}` |
| Middle balls (`.gm-mid`, fourth group of the sheet): Auto, You, Annetta | `ai.setOrders('A', {middlePriority: undefined, 0 or 1})` |
| Go for it (`#gm-go`) | `qte.arm()`: the next ball the player gets becomes a swipe shot (the button and the `F` key both toggle) |
| Aim (`#gm-aim`) | `ui.api.toggleAim()`: tap the opponent's half |
| Timeout (`#gm-timeout`, badge = left) | `rules` timeout (one per match); enabled only during play |
| Hint chip | suggests a plan from the opponents' fatigue, net/deep positions and defense; Apply sets it (see docs/QTE.md) |

The dock floats at the bottom of the match view. On phones and short windows only the Strategy button and the moment buttons show; Strategy (chevron above the label) opens the dial, plans and shots as a sheet. QTE shots: see docs/QTE.md; the pause menu has the Off / Occasional / On setting. Everything else (serve/return direction, aim-click, focus opponent, all other presets) is Studio-only. A commentary ticker shows the latest feed line above the coach bar; match/set/break point shows as a toast. Your pair is ringed (`actors.highlight`) and labelled by projecting the rigs' positions each frame.

## Persistence

Saved players are stored in IndexedDB database `littleworld-padel`, object store `players` (written by `ui`, restored through `players.restoreCustom`). No `localStorage`. If IndexedDB is unavailable the player still works for the session and a toast says local saving is unavailable.

## Module boundary

`ui.init` calls `game.init(ctx, ui.api)`. `ui.api` exposes the helpers Play mode needs (`newMatch`, `setCam`, `setSpeed`, `togglePause`, `setSound`, `callTimeout`, `skipCeremony`, `claimCoach`, `orders`, `savePlayerDef`, `drawPortrait`, `flagEl`, `mbar`, `toast`, `teamSum`, `contribution`, plus the shared state `S` and DOM refs `EL`). `ui` calls back `game.update(dt)` each frame, `game.onFeed`, `game.onSaved`, `game.onEscape`, and `game.results()` when a match ends while Play mode is active. `game` adds no new BUS events (it listens to `match:phase`, `flag:update`, `match:new` and emits the existing `ui:setting` when the mode changes).

## Test

`node tools/features_browser.js` drives the real journey in headless Chrome against the offline build: title → create (focus, empty-name validation) → setup → kick off (coach bar, ring/label, camera) → reload (saved player restored, "Continue as") → man → mixed match; plus the orthographic-court check and a 390×844 phone render with no horizontal scroll.

## Formats, how to play, calmer HUD (5 Nov 2026 playtest pass)
- Format picker on the setup screen: **Blitz** (default, 9 points, about 3 minutes), **Americano** (21 points), Quick, One set, Best of 3. Blitz and Americano count every point as 1; 5 of 9 or 11 of 21 clinches the match but play goes on to the full total (CONTRACT 8.1). Scoring (Golden Point / Advantage) is hidden for them.
- A new player's first match is the guided **tutorial** (docs/TUTORIAL.md): Annetta pauses the game and walks through Strategy, Aim and a practice swipe. The pause menu has a Tutorial button to replay it, and the title screen has a four-card How to play link.
- The top-right icons are Pause, Camera and Sound. Speed (1x/2x/4x) and Studio controls are in the pause menu. Pausing during a replay skips the replay.
- The strategy tag above the dock lists what is switched on ("Your strategy: Pressure · Break the net x4"); a plan-driven shot flashes "Your plan: ..." at most every 7 s and bumps the counter.
- Setting a mindset, plan or shot style toasts what it does.

## Playtest feedback pass (6 Nov 2026)
- **Strategy keys** (`game.hotkey`, called from the `ui` key handler, Play mode, only while playing and no screen, pause menu or QTE is open): `1`-`5` mindset from fortress to all-in, `Q` `W` `E` `R` `T` `Y` the six plans in dock order (wear down, hunt, take net, break net, glass, down the middle), `P` cycles Shots, `V` cycles Middle balls, `F` Go for it, `O` Timeout, `A` Aim (existing). Each key presses the button it names, so the toast and the pressed state are the same as a tap. They take over `Q`/`E`/`R` and `1`-`5` from the camera in Play mode, so the camera has `←` `→` (rotate), `C` (next camera, same as the CAM button) and `0` (reset view) there; Studio keeps the old camera keys. Keys are listed in the `?` sheet; plan and moment buttons show theirs in a corner on mouse devices.
- **Tooltip**: one `.gm-tip` for the whole dock, drawn above the hovered, keyboard-focused or touched button (touch hides it after 2.6 s): name, what it does, key. Buttons carry `data-tip-name`, `data-tip-desc`, `data-tip-key` instead of `title`; `game.tipText(el)` gives the same text to the tutorial.
- **Setup**: only Blitz and Americano can be chosen; Quick, One set and Best of 3 are shown but disabled ("Coming soon"). Studio still has every format.
- **Match centre**: an expand icon in the bottom-right corner of the scoreboard (`#gm-sbtab`, class `gm-sbx`) opens the full match centre (Score, Stats, Players, Feed) under the scoreboard; the icon turns into a collapse icon. It replaces the old chevron tab on the left edge.
- **Challenge / Eagle Eye removed** (padel has no review): no button, key, badge, replay kind, AI challenge or commentary. Officials' calls are exact.
- **Callouts**: `VIBORA!` joins the shot callouts.
- **Tutorial**: one step per plan button and per moment button, a match-centre step, and camera steps (rotate, zoom, pan, top-down) that wait for the player to really do it; the camera is put back afterwards, also when the tutorial is skipped. Docs/TUTORIAL.md has the table.

## HUD stacking (6 Nov 2026)
Bottom-of-screen elements never use fixed offsets. `game.js` (`dockMetrics`, every 0.25 s) sets `--dock-h` (dock height + margin) and `--tick-h` (commentary line height) on the stage. The commentary line sits at `--dock-h`; Skip intro, small-screen toasts, the ceremony lower third and the small-screen REPLAY badge sit above it at `--dock-h + --tick-h`. Ceremony cards stay in the lower third so the players on show are never covered.

## Energy, concentration and mood (6 Nov 2026)
Over every player (yours, Annetta and both opponents): a bar like a health bar for **energy** (green, amber below 55 %, red below 30 %; it only goes down), a thin blue bar under it for **concentration** (goes up and down), and the **mood** as a pixel-art face buff beside it (custom 12x12 sprites, not system emoji). The ring around the face is its timer; it flashes for its last fifth, faster in the last second and a half, then the icon goes. When a player picks up a mood a two-row toast shows `Hana: Nervous` and, under it, the stats it moves as short tags: each with one or two arrows (▲ green for buffed, ▼ red for nerfed; two for a big change) (ACC accuracy, PWR power, ATK attack, SAFE safe shots, TCH touch, SPD speed, REA reactions, STA stamina, DSG disguise, SRV serve, CALL takes balls). Moods: fuming at partner (grabs the middle and the partner's balls, so both go for the same ball), blaming self (leaves balls, plays safe), fired up, cocky, nervous, in the flow, defeated, out for revenge, backing partner (calms the partner, fewer mix-ups), irritated. A timeout wipes the hot ones and resets concentration; a changeover cools heads half way, a set break fully; nothing gives energy back. The rules and numbers are in CONTRACT §10.3; the overlay is `src/26_moodui.js`. The Studio Players cards show FOCUS, ENERGY and the mood too.
- **Skip replay**: while a replay plays, the `Skip intro` button (`#gm-skip`) becomes `Skip replay ▸` and stops it (pause or Esc also skip it). Shown in play and watch states.

## Game instructions and keyboard shortcuts (6 Nov 2026)
The `?` button at the top right (and the `?` key) opens **Game instructions** (`src/27_guide.js`, module `guide`): the four How to play cards, what each of the nine player stats means (PWR ACC REF COV STA NET DEF WAL TAC), what the energy and concentration bars show, and all ten moods with their pixel face, what sets them off, what they do and their stat tags (green up, red down). Buttons: Watch the tutorial (hidden in Studio mode; outside a running match it queues the tutorial for the next one), Keyboard shortcuts, Close. Opening it pauses the match and closing resumes it; while it is open no game shortcut reaches the game, and Esc or `?` closes it. The shortcut sheet moved to its own keyboard-icon button next to `?` and to the `K` key (`ui.api.showKeys`).
