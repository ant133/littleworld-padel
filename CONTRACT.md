# CONTRACT.md — Littleworld Jakarta Padel Cup

Source of truth for module boundaries. If an interface must change, change this file first, then the code. Version: **0.4 (as built)**. The change log in §18 lists where the build differs from the original draft.

Tournament title is always built as `"Littleworld Jakarta Padel Cup " + new Date().getFullYear()` via `HPO.cfg.TITLE()`; never hard-code the year.

---

## 0. Principles

1. **Physics-driven, AI-decided.** Points are decided by ball physics + rules, never by dice. Randomness only enters as noise on AI intent and execution (seeded).
2. **Sim ≠ render.** Everything in sections 3–9 runs headless in Node (no `THREE`, no `document`). Rendering reads sim state; it never writes it.
3. **Deterministic.** Same seed + same inputs ⇒ same match. All randomness via `HPO.rng`. `Math.random` is forbidden in sim and AI code (allowed only for cosmetic FX in `fx*` modules, and for Play-mode UI choices such as shuffles and the new-player seed, which are then passed into the sim as explicit seeds).
4. **Fixed timestep.** Physics `DT = 1/240 s`; sim logic (AI, movement) `1/60 s`; rendering uses interpolation between the last two sim states.
5. **One namespace.** The only new global is `window.HPO` (plus `THREE`). No other `window.*`/top-level `var` leaks.

---

## 1. World coordinates & dimensions

Right-handed, **Y up**, units are **metres** (1 unit = 1 m). Origin at the centre of the court floor, under the net.

```
            +Z (Side "R", towards camera at default yaw)
             ^
   Team A    |    Team B
  (x < 0)    |    (x > 0)
 <-----------+----------> +X   (court length axis, 20 m)
 back glass A|net (x=0)   back glass B
  x = -10    |             x = +10
             v -Z
```

| Item | Value |
|---|---|
| Court | x ∈ [-10, 10], z ∈ [-5, 5] (20 × 10 m) |
| Net | plane x = 0; height 0.88 m at centre, 0.92 m at posts (z = ±5.05); posts at z = ±5.05 |
| Service line | x = ±6.95 (6.95 m from net); centre service line z = 0 from x=-6.95..6.95 |
| Service boxes | for serving at x<0 side: target boxes are x ∈ [0, 6.95], z ∈ [0,5] (`+Z` box) or [-5,0] (`-Z` box); mirrored for x>0 |
| Back wall (x = ±10) | glass 0–3 m, metallic mesh 3–4 m |
| Side wall (z = ±5) | 3 m glass for \|x\| ∈ [6, 10] (two panels from each back corner; mesh above only on the corner panel \|x\| ∈ [8, 10], up to 4 m); 3 m mesh fence for \|x\| ∈ [1, 6] |
| Entrance | open 2 m gap centred on the net (\|x\| < 1, z = ±5): free below 1.9 m, so a ball can leave through it; mesh header 1.9–3 m. No door leaves or door colliders. The net posts (z = ±5.05) stand in the entrance |
| Ball | radius 0.0335 m, mass 0.0565 kg |
| Player body radius (collision) | 0.35 m; reach (racket centre) ≤ 1.05 m horizontally, up to 2.7 m vertical for smash |
| Island | circular-ish, centred at origin, radius ≈ 48 m; court floor at y = 0; ground plane y = -0.2 |

**Teams & sides:** Team A starts at x < 0, Team B at x > 0; sides swap at changeovers (`state.sides.A = -1|+1`). Court "left/right" for a team is **from that team's viewpoint facing the net**: Team A (facing +X) has its right-hand side at **+Z**; Team B (facing -X) has its right-hand side at **-Z**. Helper: `HPO.court.rightSign(team)` returns the z-sign of that team's right side.

**Heading:** player `heading` is radians about Y, 0 = facing +X, increasing toward +Z (i.e. `dir = (cos h, 0, sin h)`).

**NAV grid:** 0.25 m cells covering x ∈ [-12,12], z ∈ [-7,7] (court + 2 m exit apron) plus a coarse 1 m grid for the whole island used only by visitors/spectator walkers. Court NAV cell flags: `walkable`, `net` (impassable), `outOfCourt`, `door`.

---

## 2. Global namespace & module system

Every module is an IIFE that registers itself:

```js
(function (HPO) {
  'use strict';
  const M = HPO.mod.<name> = { /* public API */ };
  // private helpers stay in closure
})(window.HPO);
```

Rules:
- `HPO` is created by `src/00_core.js` and is the only global. Sub-objects: `HPO.cfg`, `HPO.rng`, `HPO.BUS`, `HPO.mod.*`, `HPO.state` (read-only view for non-owners), `HPO.util`.
- Modules never reference each other by free variable. Access via `HPO.mod.x` **at call time**, never at load time (load order is not a dependency).
- Modules are initialised by `HPO.boot()` in the order listed in §3 via `mod.init(ctx)` where `ctx = { HPO, BUS, rng, cfg, THREE? }`. Headless sim modules get `THREE = undefined`.
- Dependency layers (a module may only call down or sideways at the same layer through BUS, never up):
  - **L0** core, rng, bus, util, palette
  - **L1** court geometry/collision data, nav grid, shot table
  - **L2** ball physics, player kinematics
  - **L3** rules/match flow, AI
  - **L4** presentation: render world, rigs, crowd, fx, audio, replay, UI
- **`dupcheck`** (`tools/dupcheck.js`): scans all `src/*.js`; fails if (a) any top-level declaration exists outside the IIFE wrapper, (b) two modules register the same `HPO.mod.<name>`, (c) two modules declare the same `HPO.<key>`, or (d) a BUS event is emitted that is not listed in §6. Run before every integration and in the build.

---

## 3. Files & responsibilities

Source in `src/`, concatenated in numeric order by `tools/build.js` into `dist/`. Each file is owned by exactly one module agent.

| File | `HPO.mod.*` | Owner module | Responsibility |
|---|---|---|---|
| `00_core.js` | — (`HPO.cfg/rng/BUS/util/boot`) | Core | namespace, config tables, seeded RNG (mulberry32), event bus, vector helpers, boot/loop, scheduler (generator coroutines), watchdogs |
| `00_i18n.js`, `00_lang_id.js` | `i18n` (`HPO.t`) | Core | dictionary module (docs/I18N.md): English text is the key, `register(lang, strings, locale)`, `t(key, vars)`, `list(key, english)`, `setLang`, `missing()`; language only from `?lang=`; the Indonesian dictionary is registered in `00_lang_id.js`. Loads before every other module, no DOM at load |
| `01_palette.js` | `palette` | Core | fixed 90-colour palette, OKLab snap tables, Bayer 4×4/8×8 matrices |
| `02_court_data.js` | `court` | M1 | pure-data court geometry: planes, AABBs, surface table, service boxes, line segments, NAV flags |
| `03_nav.js` | `nav` | M5 | NAV grid, A* + steering, avoidance |
| `04_ball.js` | `ball` | M6 | ball integrator, spin, CCD collisions vs `court` surfaces, bounce counting, contact events |
| `05_shots.js` | `shots` | M6/M7 | shot table (§9), solver for launch velocity/spin given target & type, execution-error model |
| `06_players.js` | `players` | M5 | roster, attributes, fatigue/confidence, kinematics (accel/brake/split-step), strike-window logic |
| `07_ai.js` | `ai` | M7 | doubles coordination, formations, interceptor choice, tactics, shot selection, coach-instruction mapping |
| `08_rules.js` | `rules` | M8 | scoring, serve procedure + rotation, fault/let/out decisions, challenge logic, point FSM |
| `09_match.js` | `match` | M8 | match state machine, generator-coroutine sequence (walk-on→ceremony), changeovers, stats aggregation |
| `10_render_core.js` | `render` | Core/M3 | renderer, low-res target, depth outline, palette snap, dither, cameras, cutaway, lighting rigs, shadows |
| `11_world_court.js` | `worldCourt` | M1 | court meshes: turf textures, lines, glass, mesh fence, posts, net, entrance, signage |
| `12_world_island.js` | `worldIsland` | M2 | island, garden, trees, paths, practice court (+2 practice players), marquee, booth, merchandise, props, visitors |
| `13_world_club.js` | `worldClub` | M3 | clubhouse, clock, balcony, flags, stands, umpire chair, benches, scoreboard, LED screen canvas, cameras, floodlights |
| `14_rigs.js` | `rigs`, `actors` | M4 | voxel/pixel character rigs, rackets, outfits, animation clips + blender |
| `15b_assets.js` | — | M9 | embedded mascot sprite as a data URI (source in `assets_src/`) |
| `15_crowd_fx.js` | `crowd`, `fx` | M9 | spectators, reactions, wave, flags, confetti, ball trail/shadow, particles |
| `16_replay_ceremony.js` | `replay`, `ceremony` | M9 | ring-buffer recording, replay playback + slow-mo, line-call visual, handshake, podium, trophy |
| `17_audio.js` | `audio` | M10 | WebAudio synth, mixer, rate-limiter, speech |
| `18_commentary.js` | `commentary` | M9/M8 | event→English line generator with variety memory |
| `19_ui.js` | `ui` | M11 | Studio panel, match centre, scoreboard overlay, full coach controls, camera controls, debug overlay, IndexedDB saved players, shared helpers (`ui.api`) |
| `20_main.js` | — | Core | query flags, `HPO.boot()`, background match autoplay |
| `21_game.js` | `game` | M11 | Play mode: title, create player, quick setup, HUD, limited coach box (dropdowns), match-centre drawer (chevron), pause menu, results (docs/PLAY_MODE.md) |
| `22_callouts.js` | `callouts` | M12 | Presentation only (listens, never emits): comic exclamation bursts (OUT, FAULT, DOUBLE FAULT, NET, LET, SMASH, LOB, BANDEJA, BAJADA, CHIQUITA, DROP SHOT) and the pre-match state ribbon |
| `shell.html` / `shell.css` | — | M11 | page chrome (annetta.dev look) |

`tools/`: `build.js` (online + offline builds, `--check`), `make_artifact.js`, `devpage.js`, `dupcheck.js`, `sim_cli.js` (headless match runner), `matrix.js`, `physics_tests.js`, `scoring_tests.js`, `player_ai_tests.js`, `commentary_tests.js`, and the headless-Chrome drivers `browser.js`, `e2e.js`, `features_browser.js`, `visual_matrix.js`. Commands and latest results: docs/TESTING.md.

---

## 4. Config & RNG

```js
HPO.cfg = {
  TITLE(){ return 'Littleworld Jakarta Padel Cup ' + new Date().getFullYear(); },
  PHYS_DT: 1/240, SIM_DT: 1/60, MAX_SUBSTEPS: 16,
  BALL: { R:0.0335, M:0.0565, CD:0.55, RHO:1.2, MAGNUS:0.00055 /* tuned */, G:9.81 },
  RULES: { outOfCourtRetrieval:true, challengesPerSet:2, golden:false, format:'quick'|'oneSet'|'bo3'|'blitz'|'americano' },
  VENUES: { classicBlue, terracotta, fastBlue, indoor },   // §7.3
  PIXEL: { size:2, palette:90 }
};
HPO.rng = { seed(n), next()/*[0,1)*/, range(a,b), normal(mu,sigma), pick(arr), fork(label)/*independent sub-stream*/ };
```
Streams: `rng.fork('ai')`, `'exec'` (shot execution error), `'ball'` (net-cord/mesh jitter), `'crowd'` (cosmetic). Streams never share state, so changing visuals cannot change match outcomes.

---

## 5. Data models

### 5.1 Player
Custom players: `players.createCustom({name, gender, seed})` creates a roster definition (nationality defaults to Indonesia; `input.country {code, name}` overrides it) using an isolated seeded RNG; `players.restoreCustom(def)` validates and restores a saved definition. UI owns IndexedDB persistence (`littleworld-padel`, store `players`), reports failures, and never uses localStorage. Custom IDs start with `custom-`; gender eligibility is enforced at match start (M=men, W=women, X=one of each per team). The Indonesian woman is Annetta Arslan (id `p5`, shown as "Annetta" in the scoreboard and commentary), and visitors may choose her as a teammate in Women's/Mixed matches.

Exterior collisions: `court.setOutsideTriangles(triangles)` accepts plain world-space triangle vertices from the static world at boot, with no renderer dependency. Only exterior triangles near the playable enclosure are indexed. Contacts use `outsideItem`; all exterior ground/item contacts immediately end the rally, even during retrieval: after a legal opponent-floor bounce the hitter wins, otherwise the hitter loses. Airborne exits can still be recovered before an exterior contact.

AI prioritizes reachable overheads, with increased default smash weights and reduced lob weights. When an incoming lob lands 0–2 m inside the back glass, a reachable overhead prefers a kick smash; unreachable/low contacts keep a physically feasible non-lob fallback.

```ts
Player {
  id: 'p0'..'p7', name, nick, country:{code,name,flagId}, gender:'M'|'F',
  ranking:int, hand:'R'|'L', side:'drive'|'reves'|'either', archetype:Archetype,
  attrs: { power, accuracy, reflexes, coverage, stamina, net, defense, wallRead, tactics }, // 40..95
  look:{ skin, hair, hairStyle, outfit:[primary,secondary], racket, headband? },
  // live state (owned by players module)
  homeLane:±1,   // fixed for the match: +1 plays the team's right, -1 the left (drive/reves; ties and 'either' fill the other lane)
  pos:{x,z}, vel:{x,z}, heading, speed, anim:{clip,t,blend}, fatigue:0..1, confidence:0..1,
  team:'A'|'B', slot:0|1, stats:PlayerStats
}
Archetype = 'netAttacker'|'wallSpecialist'|'allRound'|'smasher'|'precision'|'counterpuncher'
```
Roster: 4 men, 4 women; each of the six archetypes used at least once. All names fictional. Mixed doubles = one M + one F per team. `HPO.mod.players.roster()` returns the eight.

### 5.2 Ball
```ts
Ball {
  p:{x,y,z}, v:{x,y,z}, w:{x,y,z}  /* spin vector rad/s, right-hand rule */,
  state:'held'|'live'|'dead',
  lastHitter:playerId|null, lastHitTeam:'A'|'B'|null,
  // rally bookkeeping (reset on each stroke):
  floorBouncesSinceHit:int, bouncesOnSide:{A:int,B:int}, touchedSinceHit:[{surf,t,x,y,z}],
  hitsSinceServe:int, t:seconds
}
```
Integrator (semi-implicit, substeps until the frame budget is consumed, **swept-sphere CCD** against every surface; max 4 collisions per substep, then force-damp to avoid infinite loops):
- gravity −9.81 y; quadratic drag `−½ρCdA|v|v / m`; Magnus `a = k·(w × v)/m`; spin decays 1–2 %/s in air.
- On contact with surface `s` (normal `n`, restitution `e_n`, friction `μ`, tangential coupling `k_t`): decompose `v = vn + vt`; contact-point velocity `vc = vt + (w × −n)·R`; `vn' = −e_n·vn`; tangential impulse from Coulomb friction limited to `μ·|Δvn|` (slip) or sticking ratio `k_t`; update `w` accordingly. Topspin therefore kicks forward off floor and drops down off glass; backspin dies/skids.
- Per-surface constants live in `HPO.mod.court.SURF[venue]` (§7.3) and include a `jitter` term (std dev in degrees applied to outgoing direction, drawn from `rng 'ball'`) — larger for mesh.
- **Anti-loop safety:** a rally watchdog ends the point if `t_since_hit > 12 s` or `wallContactsSinceFloor > 6` (ball treated as dead and the point awarded per rule §8.4).

Surfaces (ids): `floor`, `glassBack`, `glassSide`, `meshBack`, `meshSide`, `net`, `netTape` (top 5 cm, cord), `post`, `door` (id kept in the surface tables but no collider uses it since the entrance became open), `ceiling` (indoor roof only, as a dead surface), `ground` (outside enclosure).

Ball emits `BUS 'ball:contact'` for every surface contact with `{surf, p, vIn, vOut, t}`.

### 5.3 Team
```ts
Team { id:'A'|'B', name, players:[Player,Player], formation:'attack'|'neutral'|'defend'|'press', coach:CoachOrders, side:±1, serverOrderIdx }
CoachOrders { mindset?:-2..2, plan?:'exhaust'|'hunt'|'net'|'breakNet'|'glass'|'middle'|null, style?:'spin'|'mix'|'flat', preset: 'balanced'|'aggressive'|'safe'|'controlNet'|'defensive'|'targetMiddle'|'targetGlass'|'rushNet'|'focusOne'|'moreChiquitas'|'moreSmashes',
              focusOpponent?:slot, middlePriority?:slot, serveDir:'wide'|'T'|'body'|'auto', returnDir:'crosscourt'|'line'|'lob'|'middle'|'auto',
              aimPoint?:{x,z,expires} }
```

### 5.4 Match state (single source of truth, owned by `rules`/`match`)
```ts
MatchState {
  config:{ format, scoring:'advantage'|'golden', type:'M'|'W'|'X', venue, tod, seed },
  phase:'intro'|'walkon'|'introductions'|'toss'|'warmup'|'play'|'changeover'|'setBreak'|'matchEnd'|'handshake'|'ceremony'|'results',
  sets:[{A:int,B:int,tb?:{A,B}}], games:{A,B}, points:{A,B}, inTiebreak:bool, goldenPoint:bool,
  server:{team,playerId}, serveOrder:[pid,pid,pid,pid], serveSide:'deuce'|'ad',
  gameNo, pointNo, faultCount:0|1,
  sides:{A:-1|+1,B:-1|+1},
  flags:{ matchPoint:team|null, setPoint:team|null, breakPoint:team|null },
  challenges:{A:int,B:int}, timeouts:{A:int,B:int},
  stats:{...§11}, log:[PointRecord]
}
```

---

## 6. Event bus (`HPO.BUS`)

`BUS.on(name, fn)`, `BUS.off`, `BUS.emit(name, payload)` — synchronous, ordered, exceptions caught per-listener and logged. `BUS.once`. Payloads are plain objects. **Only the listed events may be emitted** (dupcheck enforced).

| Event | Emitter | Payload |
|---|---|---|
| `boot:ready` | core | `{}` |
| `sim:tick` | core | `{dt, t}` (60 Hz) |
| `match:new` | ui/match | `{config}` |
| `match:phase` | match | `{phase, prev}` |
| `match:end` | rules | `{winner, sets, stats}` (emitted by rules when the last point is scored) |
| `match:finished` | match | `{}` — after handshake/ceremony, results screen is showing |
| `point:start` | rules | `{pointNo, server, serveSide, faultCount}` |
| `serve:toss` | players | `{playerId}` (ball bounce before strike) |
| `serve:hit` | players | `{playerId, attempt}` |
| `shot:planned` | ai | `{playerId, shot, target, intent}` |
| `shot:hit` | players | `{playerId, shot, p, v, w, quality, t}` |
| `ball:contact` | ball | see §5.2 |
| `ball:bounce` | ball | `{side:'A'|'B', p, n}` (floor) |
| `ball:dead` | ball | `{reason}` |
| `ball:out_retrieve` | rules | `{p}` |
| `rally:stroke` | rules | `{n, team}` |
| `fault` | rules | `{kind:'foot'|'long'|'wide'|'net'|'mesh'|'wallFirst'|'let', attempt}` |
| `let` | rules | `{}` |
| `point:end` | rules | `{winner, reason, kind:'winner'|'forced'|'unforced'|'ace'|'doubleFault'|'fault', hitter, rallyLen, shotKinds[]}` |
| `score:change` | rules | `{state}` |
| `flag:update` | rules | `{matchPoint,setPoint,breakPoint,golden}` |
| `game:end` / `set:end` | rules | `{winner, score}` |
| `changeover:start/end` | match | `{kind:'game'|'set'}` |
| `challenge:request` | ui | `{team}` |
| `challenge:result` | rules | `{team, overturned, call, p}` |
| `replay:start/end` | replay | `{kind:'challenge'|'highlight'}` |
| `coach:change` | ui | `{team, orders}` |
| `ai:formation` | ai | `{team, formation}` |
| `crowd:react` | crowd/rules | `{level:0..3, kind}` |
| `speak` | commentary | `{text, voice:'umpire'|'commentator'}` |
| `audio:unlock` | ui | `{}` |
| `cam:mode` | ui | `{mode}` |
| `ui:setting` | ui | `{key, value}` |

---

## 7. Court collision geometry & venues

### 7.1 Surfaces as data (`HPO.mod.court`)
A flat list of planes and boxes (all analytic — no mesh raycasting):

```js
court.SURFACES = [
  {id:'floor',     type:'plane', n:[0,1,0],  d:0, bounds:{x:[-10,10], z:[-5,5]}},
  {id:'glassBack', type:'rect',  p:[-10,0,-5], u:[0,0,10], v:[0,3,0], n:[ 1,0,0]},  // and +10 mirrored
  {id:'meshBack',  type:'rect',  y:[3,4], ...},
  {id:'glassSide', type:'rect',  ... z=±5, x∈[±6,±10], y∈[0,3]},
  {id:'meshSide',  ...},
  {id:'net', type:'rect', x=0, y∈[0,hNet(z)]},   // sagging top: h(z)=0.88+0.04*(|z|/5)^2
  {id:'netTape', type:'segment-capsule', radius:0.03},
  {id:'post', type:'cylinder', ...}
];
court.raycastSphere(p0, p1, r) -> {t, surf, n, p}|null     // swept-sphere, used by ball
court.inCourt(x,z), court.serviceBox(servingTeam, side) -> {x:[a,b], z:[c,d]}
court.regionOf(x,z) -> 'A'|'B'
```
Above y = 4 m on the enclosure is open (balls may leave over the top: out). Indoor adds `ceiling` at y = 8 (a dead surface: ball hitting ceiling ends the point against the last hitter).

### 7.2 Rule-relevant surface classes
`WALL = {glassBack, glassSide, meshBack, meshSide, post, door}`. "Fence" = mesh ids.

### 7.3 Venue table (`HPO.cfg.VENUES`)

| Parameter | Classic Blue | Terracotta | Fast Blue | Indoor |
|---|---|---|---|---|
| floor `e_n` | 0.80 | 0.76 | 0.82 | 0.80 |
| floor `μ` | 0.55 | 0.65 | 0.42 | 0.55 |
| glass `e_n` / `μ` | 0.82/0.20 | 0.80/0.22 | 0.83/0.16 | 0.82/0.20 |
| mesh `e_n` / jitter° | 0.45/6 | 0.42/6 | 0.47/6 | 0.45/6 |
| air density / drag | 1.0× | 1.0× | 1.0× | 1.0× |
| wind | light gust (±0.6 m/s, cosmetic + tiny drag) | same | same | **none** |
| player speed mult | 1.00 | 0.97 | 1.00 | 1.00 |
| visuals | blue turf, blue glass tint | terracotta turf, warm lighting | brighter blue, glossy | roof, hall lighting |

Numbers are initial values. Tuning goes through `cfg.TUNE` (`sim_cli.js --tune '{json}'`); current surface values live in `src/02_court_data.js`.

---

## 8. Rules, scoring & serve (module `rules`; no THREE)

### 8.1 Scoring
- Points 0/15/30/40/Adv. **Advantage** mode: win by 2 points from 40-40. **Golden Point**: at 40-40 one deciding point; receivers choose side (AI: stronger-side convention) and the golden-point flag is raised.
- Games: Quick = first to 4, tie-break at 4–4 (set decided 5–4). One Set = first to 6, win by 2, tie-break at 6–6. Best of 3 = two sets to win; each set as One Set, **including** a final-set tie-break at 6–6.
- Tie-break: first to 7, win by 2. Serving: player whose turn it is serves point 1; then the opponents' players serve 2 points each in order; sides change every 6 points.
- Match/set/break point flags computed purely from score state by `rules.flags(state)`.
- **Points formats (Americano).** `blitz` (Blitz Americano: 2 serves per player, 8 serves + 1 tie-break = 9 points) and `americano` (5 serves per player, 20 serves + 1 tie-break = 21 points). Every point counts 1 (no 15/30/40, no games or sets). The match always plays to the full total (`_r.pts`); the winner has more points. A team that reaches the majority (5 of 9, 11 of 21) has **clinched** the match: `flags.clinched` is that team, `describe().banner` is `CLINCHED`, and play continues. Serving: each player serves `run` points in a row (2 or 5) in the order A1, B1, A2, B2, alternating sides within the run (deuce first); the last point (the tie-break) is served by the first server and `inTiebreak` is true for it. Sides change every 4 points (Blitz) or 6 points (Americano). `flags.matchPoint` is the team one point short of the majority. The final score is stored as one pseudo set (`sets = [{A, B}]`, `setsWon` 1-0) so results and commentary read it as before; `pointsText` is the plain count and `gamesText` is empty.

### 8.2 Serve rotation
- `serveOrder = [A_i, B_j, A_k(partner of A_i), B_l(partner of B_j)]`, fixed at the coin toss + chosen at start of match, continues across sets (next server is the next in cycle after the last game's server). Each player serves an entire service game. Order violations are impossible by construction and asserted in tests.
- Serve side alternates every point; first point of a game from the deuce side (the server's right). Receiver is the opposing player on the diagonal; the receiving partner stands in the other half (typical padel).
- Change of sides: after odd games (1,3,5…) in a set and every 6 points in a tie-break; also end of set when games total is odd.

### 8.3 Serve procedure
1. Server stands behind the service line (x beyond ±6.95 on own side), at the server-side half, both feet behind line.
2. Toss = ball released and **bounces once on the floor**; struck after the bounce at or below waist height (`y_hit ≤ 1.0 m`). Higher contact ⇒ fault `foot`/`high` (AI avoids; fatigue/nerves can cause occasional errors).
3. Underhand only; ball must cross net into the **diagonal** service box (floor bounce inside box lines counts as in; line = in).
4. After the first bounce the serve may hit back/side glass and stay in play. If it hits **mesh** after the first bounce ⇒ fault (`mesh`). If it hits a wall without bouncing in the box ⇒ fault. Touching the net and landing in correct box ⇒ **let**, replay without fault count. Lands outside box/long/wide/net ⇒ fault.
5. Two attempts; second fault ⇒ double fault, point to receivers.
6. Return must be struck after the serve has bounced in the box (volley return of the serve = illegal ⇒ point to server).

### 8.4 Point decision (state machine in `rules`)
A rally is a sequence of strokes alternating teams. After each stroke the ball is tracked until: second floor bounce on a side, or an out-event, or a hit by the next player. Rules:
- **In play** after a stroke if the ball's first floor bounce is on the opponent's side within court lines (line = in). A direct hit on any WALL/fence/net/post/door/ceiling/outside **before** that first bounce ⇒ **out**; point to the opponent of the hitter.
- After the opponent-side bounce, the ball may hit back/side glass and **mesh** (any number of times ≤ cap) and remain in play. If it exits the enclosure (over the top, through the open section above 4 m, or through the open entrance) before being hit ⇒ ball lost for the receiving team *unless* `outOfCourtRetrieval` (on by default) and the ball bounced in court first and left over the side/back: then the receiving player may exit via the entrance (`ball:out_retrieve`) and play it (legal only if the ball goes back into the opponent's court by the same rules). Ball leaving after being struck by the receiver and not first bouncing in the opponent court ⇒ point to the original hitter's opponent. **Live salvage:** a ball that bounced in and flies out is no longer simply given up. A quick player (`players.canSalvage`: reflexes/coverage average ≥ `TUNE.salvageSkill`, 80) may play it in the air, either just over the fence top (up to 3.6 m, a leap from inside the glass) or after running out through the entrance (`players.routeLen`, `viaEntrance`); `ai.salvageShot` only picks a stroke whose traced flight lands in the other half, and the ball touching the outside ground first still ends the point as `lost`.
- A team may return the ball after its first floor bounce and any subsequent wall rebounds, up to the moment of a second floor bounce. **Own-wall defensive shots** (ball bounced on own side, then struck off own back glass → comes back) are legal. The ball may be struck on the volley **before** the floor bounce too.
- **Second floor bounce** on a side without a legal strike ⇒ point to the other team.
- Ball touching a player's body/clothing/racket illegally (hit twice, carry), net contact by player/racket during live ball, or player touching the net post ⇒ point to opponent.
- Net: ball hitting net and falling back ⇒ ball in net ⇒ stroke error. Net cord that trickles over and bounces correctly ⇒ in play.
- `point:end.kind` classification: `winner` (opponent couldn't touch/return legally and shot was high quality), `forced` (error under time pressure: hit but failed under difficulty), `unforced` (comfortable ball, error).

### 8.5 Challenge / review
- Close calls: bounce within ±8 cm of a line, or net/wall ambiguity flagged by `ball:bounce` with `marginCm`. Each team has `challengesPerSet` (default 2); a *successful* challenge keeps the challenge. Resolution is exact (computed from recorded trajectory), then replay visual plays (§12).
- AI teams challenge when `margin<6cm` and `confidence`-weighted probability > 0.5.

---

## 9. Shot interface (`HPO.mod.shots`)

```ts
ShotType = 'flatGround'|'topGround'|'slice'|'volleyFH'|'volleyBH'|'lobDef'|'lobOff'|
           'bandeja'|'vibora'|'smashFlat'|'smashKick'|'dejada'|'chiquita'|
           'bajada'|'wallDef'|'counterDW'|'serve'

ShotSpec {                       // table row per ShotType, tunable data
  kind, minY,maxY /* contact height window */, speed:[min,max] m/s at power 50..95,
  spin:{top,side,back} base rad/s, arc:'flat'|'mid'|'high',  // target apex heights
  difficulty:0..1, tacticalValue:{attack,defend,neutral}, anim:string,
  needs:{ netSide?:bool, ballAfterWall?:bool, ballHeight? }
}

ShotRequest { player, kind, target:{x,z}, ballState, pressure:0..1 }
ShotResult  { v:{x,y,z}, w:{x,y,z}, quality:0..1, err:{dx,dz}, kind, willBeIn:bool(for AI use only) }
shots.solve(req) -> ShotResult
```
`solve` picks a launch velocity that, under the ball's own integrator (dry-run, 240 Hz, no randomness), lands on `target` after the requested arc, then applies an execution error drawn from `rng 'exec'` with σ = f(accuracy, difficulty, pressure, fatigue, confidence, reachQuality, ballSpeed). **Shot outcomes come from the real integration of the perturbed launch.** `willBeIn` is for AI evaluation of the intended shot only.

Typical envelopes (hit at contact height `h`):
- Flat/top groundstroke 14–24 m/s, apex ≤ 2.4 m; slice 11–19 m/s, low, backspin ≈ −120 rad/s.
- Volleys 9–18 m/s, contact above net height; chiquita 7–11 m/s from below net, bounces near the opponent's feet then dies.
- Lobs: defensive apex 7–9 m (deep, 1.5 m inside back wall), offensive apex 4.5–6 m, landing 1–3 m from back glass.
- Bandeja: 11–15 m/s, slice, apex ≤ 3.2 m, lands deep and dies against back glass. Víbora: 14–20 m/s, sidespin, skids toward side glass.
- Smash flat 24–34 m/s; kick smash with sidespin to exit via side glass; **Por-3 / Por-4** options if ball and tactics allow (by `bajada`/`smashKick` with target beyond glass).
- Dejada: 5–8 m/s, backspin, landing 0.5–2 m from net. Bajada: ground stroke off the back glass, 16–26 m/s.
- Defensive wall return / counter off double glass: speed from incoming ball, lowered ceiling.

---

## 10. Players, movement & AI interfaces

### 10.1 Movement / kinematics (`players`, `nav`)
- Each player has max speed `5.0–6.3 m/s` (scaled by coverage, fatigue 1→0.82×), accel 11 m/s², brake 14 m/s², turn rate 12 rad/s. Split step: 120 ms pre-contact crouch event for opponent shots.
- `players.setIntent(playerId, intent)` where `intent = { type:'moveTo'|'intercept'|'recover'|'idle'|'serve'|..., target:{x,z}, speedCap, faceBall:bool }`.
- `nav.path(from,to,opts)` → waypoints (A* on NAV grid; courts are open so paths are mainly entrance/out-of-court trips through the two exits at (0, ±5)); `nav.steer(...)` uses separation force between teammates (min 1.2 m centre distance) and net avoidance (≥ 0.35 m).
- **Predictive interception:** `ai.predict(ball, horizon)` returns the ball trajectory samples at 60 Hz (including predicted wall bounces, using the *same* integrator in a sandboxed copy). `players` computes for each candidate strike sample `(t_i, p_i)` whether the player can reach `p_i` by `t_i` (given accel/brake); the earliest feasible sample with acceptable contact height is the intercept. If none feasible, the player runs to the closest approach and the shot is `desperation` (reach cap 1.05 m + 0.25 m dive stretch, quality ↓).
- **Strike contract (no phantom contacts):** a player may hit the ball only when, in a fixed update, `dist(racketTip, ball) ≤ 0.9 m && ballHeight within shot window && strikeWindow open (anim contact frame)`. The swing animation's contact frame time `t_contact` is scheduled from the intercept; the physics hit is applied *at that frame*, and the ball must be within reach at that instant, otherwise the swing whiffs (ball keeps going; possible miss-point).
- `players` exposes `players.get(id)`, `players.team(team)`, `players.setCoach(...)` (no) — coaching lives in `ai`.

### 10.2 AI (`ai`) — per team, each sim tick (60 Hz) with decisions at event times
```ts
ai.update(dt, ctx) // reads BallPrediction, both teams' players, CoachOrders, MatchState flags
ai.decideShot(playerId) -> { kind, target, risk, intent, reason:string }   // reason feeds commentary
ai.assign(team)         -> { interceptor:playerId, supporter:playerId, formation, positions:{pid:{x,z}} }
```
Formations (positions on a team's own half, with `x` measured from the net toward own back wall `depth`):

| Formation | Partner depths from net (m) | Notes |
|---|---|---|
| attack | both 1.8–2.6 | volleying, close to net; weights chiquita/bandeja/víbora/smash |
| neutral | one 2.5, one 4.5 (staggered) | default after a service return |
| press | 3.0 and 4.2 | a bet made once per overhead the team has just given up (probability `TUNE.ai.gamble`, higher when the opponents' nearest player is close to the net): step up to counter the rebound of a weak smash. Held through a smash (a strong one rebounds out of reach); a bandeja or vibora sends the team back to `defend`, which costs each player `TUNE.ai.retreatCost` fatigue |
| defend | 7.4 and 7.8, near back glass | after lobs / against smashes, and as soon as the ball in flight will reach the opponents above 1.9 m (`overheadComing`); wallSpecialist leads |

Rules: formation changes need hysteresis (≥ 1.2 s dwell) and a tactical trigger (lob over, opponents' ball quality, own error). Both advance together after a good lob/chiquita; both retreat on a defended lob. Left/right responsibilities: drive/reves side preference for `either`: side of the court by `side` attr; middle balls decided by: reachability time, dominance (forehand on middle by hand), shot quality of incoming ball, `CoachOrders.middlePriority`, partner's position. Tie → forehand player. A `claim` token prevents both from committing; the loser of the claim moves to cover the vacated lane.

Shot-selection is weighted sampling (seeded): `P(kind) ∝ base[kind | situation] × archetype × coachWeights × attrFit × pressureMod`, where `situation = { contactHeightBand, ballAfterWall, ownPosition(net/mid/back), oppFormation, oppMovement, scoreLeverage }`. Aim point candidates scored by: open space, weakest opponent (low `defense` / fatigue), middle, glass-first-bounce target, etc. Coach orders adjust weights and *clamps* infeasible requests: e.g. a smash is refused when contact height < 2.0 m or from deep position; "Rush the Net" is ignored in defend situations; `aimPoint` is applied only if `shots.solve` yields `willBeIn` and difficulty < 0.85.

Statistical targets for tuning (configurable in `cfg.TUNE`): first serve in 85–95 %, aces 0.5–2 %, double faults 1–3 %, avg rally 6–12 strokes (σ≈4), lobs ≈ 8–14 % of strokes, volleys ≈ 25–35 %, wall rebounds struck ≈ 15–25 %, smash winners 2–6 % of points, unforced error share of points 25–40 %.

---

## 11. Stats model (collected by `match`, read by `ui`)

Per player: `distance`, `winners`, `unforced`, `forced`, `volleyWinners`, `smashWinners`, `aces`, `doubleFaults`, `lobsSuccess`, `wallRecoveries`, `netPointsWon/Played`, `firstServeIn/Total`, `secondServePointsWon/Played`, `bpFaced/Won`. Team/match: `longestRally`, `avgRally`, `duration`, `pointsWonByTeam`. Contribution score = weighted (winners + forced error induced − unforced − dfs).

---

## 12. Presentation interfaces

### 12.1 Render (`render`)
```js
render.init({canvas, container})
render.setPixelSize(1..6)            // default 2, auto tier on boot
render.setTimeOfDay('day'|'dusk'|'night'|'indoor')  // indoor chosen by venue
render.setCameraMode('follow'|'club'|'close'|'top'|'free')
render.setCutaway(opts) ; render.setGlassOpacity(0..1)
render.frame(alpha)                  // draws interpolated state
render.stats() -> {fps, drawCalls}
```
- Pipeline: scene → low-res `WebGLRenderTarget` (colour + depth) → fullscreen pass: depth/normal edge outline, **OKLab nearest-colour snap to the fixed 90-colour palette** (LUT texture 32³ built at boot), 8×8 Bayer ordered dither strength by lighting, upscale nearest.
- Camera: orthographic, elevation 40°, yaw in quarter turns (Q/E ±90°), wheel zoom, drag orbit/pan in Free mode. When a drag is released the yaw snaps to the nearest isometric quarter turn, so opposite court edges stay parallel and the court never looks skewed. Follow mode smooths toward ball/rally centroid.
- **Cutaway:** near-camera stands/walls/clubhouse parts register as `cutaway` objects; each frame set opacity/lift based on camera yaw and whether they occlude the court rectangle in screen space; transparency uses dithered discard (palette-friendly), never hides ball/players (court glass never occludes: it is `glass` material with separate depth write off + outline suppression).
- Shadows: one directional shadow map for sun/moon (1024², updated every 2nd frame), blob shadows for ball and players as fallback; night uses 4 floodlight decals + emissive glows (no real-time spot shadows).

### 12.2 Rigs (`rigs`)
```js
rigs.create(player) -> Rig { root:THREE.Object3D, play(clip, opts), setPose(state), update(dt), attachRacket, setLook }
```
Voxel-blocky skeleton: pelvis, torso, head, 2×(upper/lower arm), 2×(thigh/shin), racket joint. Clips (procedural keyframes + blend): `idle, breathe, walk, jog, sprint, shuffleL/R, splitStep, fh, bh, fhVolley, bhVolley, serveBounce, serveHit, bandeja, vibora, smash, kickSmash, lowDef, wallPrep, turnRetreat, celebrate, encourage, frustration, twirl, towel, drink, handshake, trophyLift, victory, dive`. **Contact sync:** each stroke clip exposes `contactFrame` (seconds from start); `players` starts the clip at `t_contact − contactFrame`.

### 12.3 Crowd/FX/Replay/Ceremony
- `crowd.setMood(level)`, reacts to `crowd:react` and `point:end`. InstancedMesh spectators with per-instance animation phase by shader or CPU `instanceMatrix` bob; wave on long rallies; flags animated by vertex shader sine.
- `fx.confetti(n)`, ball trail (ring buffer), subtle ball shadow, dust puff on bounce, glass impact ripple.
- `replay`: 20 s ring buffer of `{t, ball, players[]}` at 60 Hz. `replay.play({from,to,speed,cam})`; close-call visual draws the ball position and line boundary (ghost ball at contact, line highlight, margin label).
- `ceremony`: walk-on, introductions, coin toss, handshake, podium, trophy, confetti — driven by `match` coroutine; `skip()` jumps to results.

### 12.4 Audio (`audio`)
Synth-only. `audio.unlock()` on first user gesture; master default muted/off. Buses: `fx`, `crowd`, `commentary`, `ambience` with independent gains. Per-sound voice limiter (e.g. ≤ 6 racket hits/s, ≤ 8 footsteps/s overall) and speed-aware gain ducking at 2×/4×. Sound mapping: `shot:hit` → racket (pitch by shot), `ball:bounce` → turf, `ball:contact` by `surf` → glass back/side, mesh, net; `crowd:react`; `speak` → speechSynthesis if available and enabled.

### 12.5 UI (`ui`)
Two experiences share the same sim and canvas. **Play mode** (default, `21_game.js`, docs/PLAY_MODE.md): title → create player → quick setup → full-screen match with a limited coach box for the visitor's team only (six tactics, middle-ball choice, timeout, challenge), pause menu and results card; the panel is hidden. **Studio mode** (`19_ui.js`, optional via the ⚙ Studio button or `?mode=studio`): responsive grid, desktop = canvas left, panel right (min 340 px); mobile = canvas on top, panel stacked. Panel sections: Match, Court, Coach, Camera, Audio, Stats (tabs), Event feed. Scoreboard overlay (TV style) inside canvas container. Debug overlay toggled with backtick `` ` `` (hidden by default). All strings English. Style rules: §13.

---

## 13. Page chrome & style (annetta.dev match)

Light theme. Tokens (from annetta-website `styles.css`): ink `#123954`, blue `#177dc5`, cream `#fffaf0`, accent `#268cc2`, tag `#257bad`, highlight `#fff4b3`, hairline `#12395421`, hard shadow `15px 18px 0 #1264992e`.
Fonts: `Manrope` (headings, tight tracking) / `DM Sans` (body) from Google Fonts when online (`<link>` injected at runtime only if `navigator.onLine`), fallbacks `system-ui` and `Georgia` italic accents. Square corners, 1 px hairlines, small uppercase 10 px tracked section tags ("01 / Match"). UI text is **not** pixelated. Footer: "← annetta.dev", "Made in Jakarta with code, curiosity, and no spare towel." Annetta cameo: sponsor board `annetta.dev`, "A✦" on LED screen, mascot spectator sprite (new sprite, not reused art).

Sponsors (fictional puns): Lintas Court Rail, Tapak Smash, Bank Mandau Raya, Bank Lapang Amanah, Aquvivo, Go-Jeg, Pokari Sweet. Each gets an original logo/colour treatment — no real logos or marks.

---

## 14. Match flow (module `match`, generator-coroutine scheduler)

`HPO.sched` runs coroutines as generators yielding `wait(seconds)`, `until(fn, timeout)`, `waitEvent(name, timeout)`. The match flow is a single generator:

```
intro → walkOn → introductions → coinToss → warmup(≈20 s cooperative rallies, rules suspended)
→ loop { play game(s) → changeover(water/towel/discussion; coach may change tactics)
         → setBreak } → matchEnd → handshake → ceremony (podium, confetti) → results
```
Sim speed multiplier (0.5/1/2/4×) scales `SIM_DT`/`PHYS_DT` steps per real frame (clamped to `MAX_SUBSTEPS`); cosmetic timings (waits) scale too. At 4× audio rate-limits tighter; replays disabled except challenges.

**Watchdogs** (any triggers `BUS 'ball:dead'` + deterministic fallback, logged):
- Point > 45 s of sim time ⇒ end by rule §8.4 against last unreturned team.
- Ball with |v| < 0.2 m/s on floor for 1.5 s, or outside bounds > 8 s.
- Player idle > 20 s in state requiring input ⇒ default input.
- Phase stuck > N s ⇒ skip to next phase.
- Invalid score transitions are asserted (`rules.assertState`), recoverable by recomputing from `log`.

---

## 15. Performance targets

| Target | Desktop | Mobile (reduced) |
|---|---|---|
| Frame rate | 60 fps @ pixel size 2 | ≥ 30 fps, auto pixel size 3 (the default is 2 everywhere, phones included) |
| Draw calls | ≤ 350 | ≤ 160 |
| Triangles | ≤ 350 k | ≤ 120 k |
| Sim cost | ≤ 2 ms / frame at 1×, ≤ 8 ms at 4× | ≤ 3 ms / 10 ms |
| Offline file | ≤ 3 MB | — |

Techniques: shared geometries/materials, `InstancedMesh` for spectators/trees/flowers/fence segments, merged static geometry per module, frustum culling, shadow update every 2 frames, mobile tier disables far props, halves crowd, caps particles, no shadow map.

---

## 16. Testing & integration contracts

Headless (Node, no DOM):
- `tools/scoring_tests.js` — exhaustive scoring/serve-rotation/tie-break tests independent of physics (feed point sequences).
- `tools/physics_tests.js` — scripted cases: serve into box; back-glass-then-mesh fault; glass-before-bounce out; back-glass recovery; side-glass; double-wall; legal own-glass defensive shot; net cord/let; double bounce; tunnelling at 45 m/s; smash back across net; assert determinism via seed.
- `tools/sim_cli.js --format --scoring --type --venue --seed --n` — runs N full matches (no rendering) and prints the §11 stats vs. `cfg.TUNE` targets and flags any watchdog trips (must be 0).
- `tools/matrix.js [--part k/n]` — full matches across formats, scoring, types and venues; `tools/player_ai_tests.js` — custom players, smash tactics, women's and mixed matches; `tools/commentary_tests.js`.

Browser:
- Query flags (`src/20_main.js`, `src/21_game.js`): `auto`, `cam`, `tod`, `venue`, `format`, `scoring`, `type`, `seed`, `speed`, `fast`, `px`, `mode`, `title`. Tests drive the page through `HPO.mod.*` from `tools/browser.js`; there is no separate `HPO.test` API.
- Matrix run: venue × format × type × scoring × tod × camera × layout, check no console errors, no watchdog trips, reaches `results`.
- Screenshots (if Chrome/Edge available): default camera, each camera mode, each tod, mobile viewport. Anything unverified is reported, not claimed.

Integration checkpoints (each ends in running `dupcheck` + headless matrix):
1. **CP0 Core:** namespace, bus, rng, scheduler, render pipeline with test cube, palette snap, cameras, island placeholder, court data, nav.
2. **CP1 Sim:** ball + shots + players + rules + match run headless; 100 matches without watchdog trips; stats in range.
3. **CP2 World:** court/island/club meshes, rigs, cutaway, lighting; visible full match with interpolation.
4. **CP3 Show:** crowd, fx, replay, ceremony, audio, commentary.
5. **CP4 UI:** panel, coach, camera, match centre, debug overlay, responsive.
6. **CP5 Ship:** build online + offline, size/perf passes, offline test with network disabled.

---

## 17. Build outputs

- GitHub Pages: `.github/workflows/pages.yml` builds on pushes to `main`, publishes the online build as `index.html`, and includes the offline HTML as a download. The repository is `ant133/littleworld-padel`; the intended custom domain is `padel.annetta.dev`, configured in GitHub Pages settings and DNS (see `docs/GITHUB_PAGES.md`).
- `dist/littleworld-online.html` — loads `three@0.128.0/build/three.min.js` from cdnjs; all game code inline; publishable as artifact.
- `dist/littleworld-offline.html` — identical plus three.js r128 inlined; published beside the online page as `littleworld-offline.html` and works with no network.
- `dist/littleworld-artifact.html` — the online build prepared by `tools/make_artifact.js` for artifact publishing.
- Google Fonts `<link>` injected only when online; no other external requests.

---

## 18. Change log
- 0.1 — initial draft for user approval.
- 0.2 — CP1 (headless sim) implemented. Deviations: `HPO.court` is an alias of `HPO.mod.court` (holds `sides`); `match:end` is emitted by rules, `match:finished` added; Quick format is first to 4 *win by 2* with tie-break at 4–4; `outOfCourtRetrieval` defaults to false; `cfg.TUNE` holds the tuning knobs listed in docs/TESTING.md; first-pass numbers: floor e 0.80 kept, Magnus scaled by `ball.PRM.magnus`. Per-module API notes: docs/API_court_ball.md, docs/API_rules.md.
- 0.3 — Visual layer implemented (see docs/VISUAL_CONTRACT.md, docs/API_render.md). Court geometry corrected to match real padel references: back wall 3 m glass + mesh to 4 m; on each long side the first TWO glass panels from each back corner are 3 m glass (only the first, |x| in [8,10], has mesh above to 4 m); between them a 3 m mesh fence; an OPEN 2 m entrance centred on the net (|x|<1, z=±5) is free below 1.9 m (ball can leave through it) with a mesh header from 1.9–3 m; no doors/leaves. Out-of-court retrieval is ON by default: the receiving team nearest player fetches a validly-bounced ball that left the court and returns it (match.js retrieve()). New match behaviours: warm-up rallies, AI Eagle-Eye challenges (rules lineErrorCm default 2 cm on serve calls), AI tactical timeouts, coach returnDir honoured. Sim speed multiplier is applied in match.advance. cfg.TUNE defaults: errPhi/errTh 2.0, speed 0.85, react 1.5, rally {from:10,per:0.1}.
- 0.5 — Ball: floor restitution now falls with impact speed (`restit`: factor 1 up to 6 m/s, then 1 − 0.04·(v − 6) down to 0.74), so a lob dropping from 7–8 m rebounds to about 3 m instead of climbing over the 4 m fence (hard drops rebounding above 3.9 m went from 13.5 % to 0 %; out-of-court retrievals 2.2 % of points to 0 in the 6-match sample). `audio` master default 0.8; shared `ui.api.setVolume`, `setCallouts`; callouts halved in size, FIRST SERVE removed, on/off switch; Play-mode volume sliders and HUD popover; orange shuffle buttons. Music: `audio` gets a `music` bus (straight into the compressor, so it ignores the sound-effects mute), `audio.setMusic/hasMusic`, `ui:setting` key `music`, `ui.api.setMusic`; the optional track is `assets_src/music.*`, inlined by `tools/build.js` as `HPO.assets.music` (data URI), decoded on first use and looped; Sound and Music On/Off choices on the title, setup and pause screens. Also added `22_callouts.js` and the `callouts` module (init order after `ceremony`, no new bus events); render core: each low-res pixel covers a whole number of device pixels (fixes stripes on fractional-DPR phones), zoom range up to 18×, phones start on and tighten the TV follow camera, follow clamps z to ±7.5; intro, walk-on and replays always use TV follow; replay label flashes; default pixel size 2 on all devices; Play-mode coach bar uses dropdowns, match-centre chevron, speaker icon; players are clamped to the half they stand on (no snap to the net when the sides flip) and walk to the entrance, out and round at changeovers; ceremony walks cross through the entrance; the receiving partner starts and stays behind the service line until the serve is returned.
- 0.6 — Reflexes and attack: `players.readDelay(q, shotEvent, hitter)` adds read time for pace, short distance and smashes to `reactUntil` (`TUNE.readScale`), and the interception reach check now includes that delay; `shots.trace(p, nom, maxT)` returns the sampled flight of a nominal launch; smashes are faster (flat 27–35, kick 24–32 m/s), have a lower base difficulty and a bigger net margin, are chosen less often (`ai.smashWilling`, deep ones rarer) and are placed by `reachSlack` (the placement the opponents reach last); the ball after a smash is harder to return (`TUNE.smashAftermath`); `sigmaK` weights time pressure and stretch more (`pressK`, `stretchK`) and `difficulty` rises 0.018 per m/s over 12; AI: defend formation 7.4/7.8 m, triggered early by `overheadComing`, and calmer volley duels (`duelCalm`). No new bus events. Numbers in docs/TESTING.md; new `tools/reflex_stats.js`.
- 0.7 — Accuracy and attack: execution error is smaller (`TUNE.errPhi` 1.85, `errTh` 1.75), strokes struck with no valid launch solution at the real contact point now fall back (`rescueShot`: same stroke with less margin, then lob, lob, slice) instead of flying off at 50° (9.3 % of strokes before), the AI sizes its net clearance (`netSafe`) and depth margin (`depthSafe`, a flat ball's range is far more sensitive to elevation than its width to azimuth) from the error it is facing, vibora and deep volleys aim inside the lines, the AI takes the pace off after two volleys in a row (`resetCalm`) and tires of lob wars (`lobTire`); overheads up to 3.35 m are legal strikes (they whiffed at 3.05 m); smashes read 0.2 s later (`TUNE.smashRead`) and are placed by `reachSlack` at weight 0.6; live salvage of balls that bounce in and fly out (see §8); callouts CHIQUITA and DROP SHOT; Play mode: the chevron opens the full match centre in a drawer under the scoreboard instead of hiding the scoreboard. Rally and smash numbers in docs/TESTING.md.
- 0.4 — As built. Added: visitor-created players (`players.createCustom/restoreCustom`, IndexedDB `littleworld-padel`, nationality), Annetta Arslan renamed and shown as "Annetta"; **Play mode** (`21_game.js`, docs/PLAY_MODE.md) as the default experience with the full panel kept as optional Studio mode; camera orbit snaps to isometric quarter turns on release (elevation 40°, parallel court edges at every yaw); obstructing floodlights fade through a dedicated `light` cutaway role; exterior ground/item collisions end the rally (`court.setOutsideTriangles`, `outsideItem`); more smashes by default and kick smashes for lobs that land within 2 m of the back glass; `15b_assets.js` embedded mascot sprite; `tools/features_browser.js`, `player_ai_tests.js`, `make_artifact.js`; GitHub Pages workflow and `padel.annetta.dev` hosting (docs/GITHUB_PAGES.md). Superseded: the `stats_tune.js` tool and the `HPO.test` hook were never built; the `annetta-website/padel/` deployment plan was replaced by the standalone repo `ant133/littleworld-padel`.
- 0.8 — Position-driven play: overhead technique depends on the hitter's depth (within 4.5 m of the net a smash gets `TUNE.ai.smashNearBoost` and the bandeja `bandejaNear`; from the back the bandeja gets `bandejaDeep`); `players.readDelay` scales the smash read time by where the smash was struck (`TUNE.smashNear` 1.8 close to the net down to `smashFar` 0.55 from the back); players keep a fixed `homeLane` (formations use it instead of the current z, the serving partner stands in their own lane and the server runs back to theirs); new `press` formation (see §10) with a fatigue cost on retreat. `ai:formation` can now carry `press`.
- 0.8.1 — Balance pass: defaults `TUNE.errPhi` 1.755, `errTh` 1.71, `readScale` 1.265, `ai.smashNearBoost` 1.65, `ai.smashWilling` 0.32, `ai.duelCalm` 1.1, `ai.resetCalm` 1.2. No interface change. Numbers in docs/TESTING.md.
- 0.8.2 — Version history: `src/23_versions.js` lists every shipped version (build date `YYYY.MM.DD`, `.N` for a second one the same day) at the bottom of the Studio panel (`#foot`); CLAUDE.md workflow step 6 requires a new entry per shipped change. No interface change.
- 0.8.3 — Touch camera: one finger pans, two fingers rotate (snaps to a quarter turn) and pinch zooms; mouse unchanged. Play-mode **Aim** button (`ui.api.toggleAim`); aim taps must land on the opponent's half. Replay camera restore now covers a free camera (position, zoom) and the follow target. `render.cutaway.link(obj, other)`; the `light` role hides the mast and its glow outright. AI: `TUNE.ai.lobBase` 0, `lobNet` 1.5, new `viboraNear` 1.9; vibora height range is now 1.5-2.9 m and is chosen on chest-high balls near the net; lobs aim deeper when the other pair is at the net.
- 0.9 — Coach dock (docs/QTE.md): Play mode replaces the tactic and middle-ball dropdowns with a floating dock. New coach orders `mindset` (-2..2), `plan` (`exhaust`, `hunt`, `net`, `breakNet`, `glass`, `middle`, or null) and `style` (`spin`, `mix`, `flat`) compose with `preset` in `ai.mods` (numbers multiply, `netBias` adds, flags set); new multiplier `top`. `exhaust` targets the more tired opponent and aims far from them. Smart hint in the UI. QTE shots are specified in docs/QTE.md and not built yet.
- 0.9.1 — QTE shots (docs/QTE.md, `src/24_qte.js`, module `qte`): `qte.offer(p, pl, info)` is called by `players.commitSwing` and freezes the sim (`match.pause`) while the overlay is open; `qte.take(p)` is read by `ai.decideShot` (`qteShot`: reasons `qte`, `qte-mishit`, `qte-fallback`). New: `shots.execute` ctx `errMul`, swing field `errMul`, render camera mode `qte` (`render.qteYaw`), `render.camSnapshot()/camRestore()` (also used by replays), audio `sting()`. Window 4.2 s attack, 3.6 s defence; a missed swipe is a mild mishit. Play-mode setting QTE shots Off/Occasional/On (pause menu) and a Go for it button. Dock restyled to the site's card style with a Strategy toggle on small screens.
- 0.10 — Playtest pass: points formats `blitz` (9 points) and `americano` (21 points) in `rules` (CONTRACT 8.1; `flags.clinched`, `describe().pointsMode`), shown on the TV and LED scoreboards as a plain point count; Play mode defaults to Blitz. QTE mode `relaxed` (no timer) is the default, with a `Let it play` button (`order.skip`). Gender-coded hairstyles (women: ponytail, bun, bob; men: short, crop), proportional wheel zoom, top-down camera at 74 degrees (the net was edge-on at 89), music bus x0.4, brighter dusk and night ambient, no pixel-size slider. First-run How to play, strategy tag and plan shot labels, Speed and Studio moved to the pause menu.
- 0.10.1 — Guided first match: module `tutorial` (`src/25_tutorial.js`, docs/TUTORIAL.md). `game.hud` exposes the HUD elements; `G.tutorialPending` starts it at the first play phase; the pause menu has a Tutorial button. It pauses the sim per step, waits for real taps on the dock, and runs a practice QTE through `qte.force`.
- 0.10.2 — `rules.describeFormat(format, scoring)` returns one plain-English scoring line; the tutorial's scoreboard step and the fourth How to play card use it, so they follow the chosen format. Annetta uses a mascot look (`look.mascot`): white polo with blue trim and a star, blue skirt, fringe, blush, standard eyes.
- 0.10.3 — i18n dictionary module (`src/00_i18n.js`, `src/00_lang_id.js`, docs/I18N.md, `tools/i18n_tests.js`): `HPO.t` and `HPO.mod.i18n`; English by default, Bahasa Indonesia with `?lang=id`; emits the existing `ui:setting` with key `lang`. Player-facing text now goes through it (`const _ = HPO.t`); the Indonesian dictionary is split into `src/00_lang_id*.js`; in-world texts (LED, scoreboards, signs, banners) and padel terms stay English; 15-15 is "Salim" in Indonesian. `speak` events from `match` carry `kind: 'timeout'`, umpire lines carry `tone` for the speech chime; speech uses voices of the page language and stays silent if there is none. `scoreCall` no longer throws in the point-count formats.
- 0.10.4 — Aim mode flashes the opponent's half (`ui` SVG `.aimzone`, projected from the court corners); the tutorial's Aim step is now two steps (tap Aim, then tap the flashing half, undimmed). Intro cards (welcome, players, coin toss) sit at 58% height so they clear the scoreboard and the state ribbon; the ribbon's live dot is smaller.
