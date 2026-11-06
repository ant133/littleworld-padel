# VISUAL_CONTRACT.md — interfaces for the presentation layer (CP2–CP5)

Extends CONTRACT.md §12. Everything here is browser-only (needs `THREE` r128 and DOM). Simulation code in `src/00–09` never depends on it.

## 0. Dev loop
- Camera remains orthographic with a 40° default elevation and viewport-matched aspect ratio; opposite floor edges must remain parallel at every yaw. Floodlight occluders use a dedicated `light` cutaway role triggered by any court-grid overlap: the mast and its glow are hidden outright (not faded) while they block the view.
- `node tools/devpage.js` regenerates `dev.html` (loads `vendor/three.min.js` then every `src/*.js` in numeric order). Open it as `file:///C:/Hermes/project/annetta/padel/dev.html?...`.
- `node tools/browser.js <url> <out.png> [waitMs]` prints console + errors and saves a screenshot (headless Chrome, SwiftShader WebGL). Programmatic: `require('./tools/browser').run({url,width,height,waitMs,evals:[],steps:[{eval},{wait},{shot},{key},{click}],shots:[]})`. **Look at your screenshots** (Read the png) before claiming visuals work.
- Boot in the browser: `HPO.boot({container})` is called by `src/20_main.js`. Query flags: `?mode=studio` (full panel instead of Play mode), `?title=0` (skip the title, watch the live match), `?auto=0` (don't auto-start a background match), `?tod=day|dusk|night`, `?venue=classicBlue|terracotta|fastBlue|indoor`, `?cam=follow|club|close|top|free`, `?px=2`, `?seed=7`, `?speed=1`, `?fast=1`, `?format=`, `?scoring=`, `?type=M|W|X`. The debug overlay is the backtick key.
- Console must be free of errors/warnings from your module. No `Math.random` in sim; cosmetic randomness uses `HPO.streams.crowd` or a local seeded rng.

## 1. World-module interface
Each `HPO.mod.worldX` (worldCourt, worldIsland, worldClub) exposes:

```js
init(ctx)                      // ctx = {HPO, BUS, rng, cfg, THREE, opts}; build meshes, add to render.groups.*
update(dt, t)                  // per rendered frame, cosmetic animation only (seconds)
setTimeOfDay(tod, p)           // 'day'|'dusk'|'night'|'indoor'; p = render.todParams (see §2)
setVenue(venueName)            // 'classicBlue'|'terracotta'|'fastBlue'|'indoor' (turf colours, decoration, roof)
setOptions(o)                  // {glassOpacity 0..1, showMarkings bool, showRoof bool, mobile bool, ...}
dispose()                      // optional
```
Rules:
- 1 unit = 1 m, Y up, same axes as sim (CONTRACT §1). Court centre = origin. Only these `render.groups` exist: `world` (root), `court`, `island`, `club`, `actors`, `fx`, `overlay`. Add your meshes to your group.
- Use **shared geometry/material instances** and `THREE.InstancedMesh` for repeated things (seats, trees, flowers, spectators, fence posts). Budget: whole scene ≤ 350 draw calls, ≤ 350k tris (mobile ≤ 160 / 120k).
- Materials: always create via `render.mat(hex, opts)` (cached; flat/lambert look, supports `emissive`, `transparent`, `opacity`, `side`, `glass:true`, `cutaway:true`). Textures: `render.canvasTex(w,h,draw)` (NearestFilter, sRGB-agnostic) for turf, signage, LED, clock faces. Never load external images/fonts.
- Style: chunky low-poly "miniature" blocks, strong simple colour ramps (3–4 tones per object), no sub-pixel details. Palette is snapped in post, so pick saturated, readable colours. Cream `#fffaf0`, ink `#123954`, blue `#177dc5` are the brand colours (annetta.dev) and should show up in signage/trim.
- Cutaway: structures between the camera and the court (near stands, near clubhouse wing, near walls, near trees) must be registered: `render.cutaway.add(object3D, {role:'stand'|'building'|'wall'|'tree'|'prop', fadeTo: 0.0–1.0})`. The render core fades/lifts them by camera yaw; never fade glass panels (they are already transparent) or the court itself.
- Sponsors (fictional puns only): Lintas Court Rail, Tapak Smash, Bank Mandau Raya, Bank Lapang Amanah, Aquvivo, Go-Jeg, Pokari Sweet, plus `annetta.dev` (A✦ logo). Title banner text: `HPO.cfg.TITLE()` ("Littleworld Jakarta Padel Cup <year>"). Original logos only, drawn with canvas rects/text.
- Annetta cameo: sponsor board "annetta.dev", the "A✦" mark on the LED screen, and a mascot spectator (see crowd).

## 2. render (src/10_render_core.js, src/01_palette.js)
```js
render.THREE, render.renderer, render.scene, render.camera /*Orthographic*/, render.groups
render.init({container})            // creates canvas, ResizeObserver, RAF loop (calls match.advance(realDt) then frame)
render.mat(hex, opts) / render.canvasTex(w,h,draw) / render.box(w,h,d,hex,opts) helper
render.cutaway.add(obj, opts) / render.cutaway.remove(obj)
render.onFrame(fn(dt,t))            // per-frame cosmetic hooks (world modules may use update() instead)
render.todParams                    // {tod, night:0..1, lamps:0..1, indoor:bool, sunDir, skyTop, skyBottom, fog, ambient, sunColor}
render.setTimeOfDay(tod)            // also calls every world module's setTimeOfDay(tod, todParams) and BUS 'ui:setting'
render.setPixelSize(1..6) / render.pixelSize
render.setCameraMode('follow'|'club'|'close'|'top'|'free'); render.cameraMode
render.rotate(dir)                  // +1/-1 quarter turn (Q/E); smooth tween; render.yawIndex 0..3
render.zoom(delta) / render.resetView() / render.followPlayer(id|null) / render.setFollowBall(bool)
render.pan(dx,dz) / render.orbit(dYaw)  // free mode drag
render.setGlassOpacity(v) ; render.setRoof(bool)  // forwarded to worldCourt/worldClub setOptions
render.project(vec3) -> {x,y,visible}  // world->screen px (for UI labels / click aim)
render.pickCourt(clientX, clientY) -> {x,z}|null // screen click -> court-plane point (y=0) for "click to aim"
render.stats() -> {fps, drawCalls, tris}
render.debugRaw(bool)               // "Raw 3D" toggle (bypass palette/dither)
```
Post pipeline (render agent): scene → low-res `WebGLRenderTarget` (colour+depth texture) → fullscreen shader: depth-edge outline (darken), OKLab nearest-colour snap against the fixed **90-colour palette** (LUT texture built at boot from `palette.COLORS`), 8×8 Bayer ordered dither scaled by luminance step, nearest upscale. Pixel size N means each low-res pixel covers N css px, rounded to a whole number of device pixels (`round(N × devicePixelRatio)`), so the target is `ceil(W/n) × ceil(H/n)` in device pixels and the canvas is sized to a whole multiple (cropped by the container). A fractional scale would draw stripes on phones.

## 3. actors (src/14_rigs.js → `HPO.mod.rigs` and `HPO.mod.actors`)
```js
rigs.create(player /*live player from players.list*/) -> Rig
Rig { root:THREE.Group, play(clip, opts), update(dt), setPose({speed,heading,clip,t,swing}), attachRacket(), look(def.look) }
actors.init(ctx)                    // builds ball mesh + shadow + trail, creates rigs for players when 'match:new' fires
actors.sync(alpha)                  // called each frame: interpolates sim state (players.list pos/heading/vel/anim/swing, ball.state p) -> meshes
actors.ballMesh, actors.rigOf(id), actors.setTrail(bool), actors.setBallScale(s)
```
- Ball is drawn ~3× real size with a thin dark outline ring and ground shadow blob so it stays readable; yellow-green `#d8f24a`. Trail = ring buffer of ≤ 24 fading points.
- Sync: the sim advances in fixed 1/60 steps; keep the previous and current `{pos,heading}` per player and the ball, render with `alpha = acc/SIM_DT`. Clip choice comes from `player.anim.clip` (sim sets `idle|walk|jog|sprint|shuffle|splitStep|serveBounce|serveHit|groundstroke|volleyFH|volleyBH|bandeja|vibora|smash|kickSmash|lowDef|wallPrep|drink|towel|celebrate|...`) and `player.swing` (`{clip, tc, start, fh}`: start the swing clip so racket contact lands at `tc`; `fh` selects forehand/backhand mirrored arm). `player.def.look = {skin, hair, hairStyle, outfit:[primary,secondary], racket}`.
- Rig scale: 1.75 m tall (women 1.68), blocky pixel-art body (~7 box parts), racket with coloured head, headband/cap/hair styles from `look`.
- Required clips: `idle, breathe, walk, jog, sprint, shuffle, splitStep, groundstroke(fh/bh), volleyFH, volleyBH, serveBounce, serveHit, bandeja, vibora, smash, kickSmash, lowDef, wallPrep, turnRetreat, celebrate, encourage, frustration, twirl, towel, drink, handshake, trophyLift, victory, dive`. Clips are procedural joint-angle functions of time; blending via crossfade 0.12 s.

## 4. crowd / fx / replay / ceremony (src/15_crowd_fx.js, src/16_replay_ceremony.js)
```js
crowd.init(ctx)         // InstancedMesh spectators filling worldClub seat slots (worldClub.seatSlots: [{x,y,z,facing,tier,block}])
crowd.setMood(0..3); crowd.react(level, kind); crowd.wave(); crowd.update(dt)
crowd.mascot            // Annetta mascot spectator (distinct sprite-like figure with "A✦" shirt)
fx.confetti(n, origin?) ; fx.dust(p) ; fx.glassRipple(p, n); fx.flagWave(mesh)
replay.record()  (called by match tick @60Hz)  replay.play({kind:'highlight', from, to, speed}) ; replay.active
ceremony.walkOn() / introductions() / toss() / handshake() / podium() / trophy() — visual helpers used by match coroutine hooks; ceremony.skip()
```
Listens to BUS: `point:end`, `rally:stroke`, `match:phase`, `flag:update`, `ball:contact` (glass ripple), `ball:bounce` (dust), `match:end`.

## 5. audio / commentary (src/17_audio.js, src/18_commentary.js)
- `audio.unlock()` on first gesture (called from `ui` on any click/key); master gain 0 until the user switches Sound on. Buses `fx, crowd, commentary, ambience` (+ `audio.setVolume(bus, 0..1)`, `audio.setMuted(bool)`).
- Listens to BUS: `shot:hit`, `serve:toss`, `serve:hit`, `ball:contact` (surf → glass/mesh/net), `ball:bounce`, `point:end`, `crowd:react`, `match:phase`, `speak`, footsteps polled from `players.list` speed in `audio.update(dt)`. Per-voice rate limiter + gain ducking by sim speed.
- `commentary` turns real events into English lines using event data (shot kinds, rally length, wall use, score flags, streaks) with a no-repeat memory; emits BUS `speak {text, voice}` and appends to the UI feed via `ui.feed(entry)`. Pure/testable part: `commentary.lineFor(eventSummary)`; Node-testable with `tools/commentary_tests.js`.

## 6. ui (src/19_ui.js, src/shell.html, src/shell.css)
Page shell in annetta.dev style (CONTRACT §13). `ui.init(ctx)` builds panel DOM into `#panel`, TV scoreboard overlay into `#stage`, match centre tabs, coach controls (all presets, serve/return direction, middle priority, focus opponent, click-to-aim `A`, timeout), camera controls, court settings, audio sliders, debug overlay (backtick). Keys: Q/E rotate, 1–5 cameras, +/- zoom, R reset, Space pause, A aim. `ui.feed(entry)`, `ui.setScore(state)`, `ui.toast(text)`. Responsive: desktop panel at right (≥ 900 px), stacked below on mobile.

## 7. Performance & mobile
`HPO.cfg.mobile = matchMedia('(pointer:coarse)').matches || innerWidth < 700` → reduced mode (pixel size stays 2), crowd ×0.5, no shadows, fewer trees/flowers, particles ×0.5. Provide `setOptions({mobile})`.

## 8. World layout zones (so builders don't overlap)
Metres, origin = court centre, +Z towards the default camera, −Z far side. Court enclosure footprint x∈[−10.5,10.5], z∈[−5.5,5.5] (glass/mesh walls, posts, open entrance).
- **Stadium zone — `worldClub` owns** x∈[−27,27], z∈[−36,17]: spectator stands ring (tiers on both long sides z=±(7.5…15) and behind both ends x=±(12.5…20)), umpire chair at net (x=0, z=−6.2), courtside benches (x=±5, z=+6.4/−6.4 inside the apron), scoreboard + sponsor boards, 4 broadcast cameras, 4 floodlight masts at (±15, ±10) ~14 m high (hold lamp heads, glow at night), flags on poles, the **clubhouse on the far side**: footprint x∈[−20,20], z∈[−34,−20], 2 storeys + balcony, analog clock, flags, large LED video board (canvas texture, mirrors the score + A✦ + celebration animation) mounted facing the court. Indoor venue: roof/trusses over x∈[−27,27] × z∈[−20,20] (hideable) + hall lighting. `worldClub.seatSlots` = array of `{x,y,z,facing(rad),tier,block}` (≥ 450 slots, mobile uses half).
- **Court zone — `worldCourt` owns** the enclosure itself: turf (venue colours), lines, glass panels (transparent, subtle reflection), mesh, posts, net + posts + centre strap, the open entrance at the net, apron/run-off (x∈[−13,13], z∈[−7.5,7.5] ground slab), glass-printed/lower-wall signage, ball-boy marks. Court markings toggle (`showMarkings`).
- **Grounds zone — `worldIsland` owns** everything else on the island: terrain disc radius 48 centred at origin (top y=−0.01 outside the court slab, rocky underside to y≈−14 with tapering cone, floating look, small drifting clouds + a few floating rocks), grass, paths (from entrance plaza at (0, 30) to the stadium entrances at (±9, 17) and around), **entrance plaza** at (0, 28±6) with ticket booth (−9,28), merchandise stand (9,28), arch sign; **practice court** at (−38, 8) rotated 90° with two animated casual players (own simple rigs, not the match rigs) and a bench; **tournament marquee** (tent) at (36, 6); garden/flowerbeds/trees (instanced) in the south-east/south-west and along the rim, hedges, fountain or pond (SW), outdoor seating/picnic tables (SE) and (NE), **visitors** walking along paths (instanced simple figures ~14, mobile 7), decorative props (padel bags, bottles, towels, rackets, signage) scattered on benches/tables. Keep everything out of the stadium zone.
