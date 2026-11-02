# SPEC.md — Littleworld Jakarta Padel Cup (requirements digest)

Structured digest of the original prompt (tournament renamed; year is runtime `new Date().getFullYear()`). Original priorities: **physics realism > doubles AI > rules correctness > visuals > UI**. Anything below marked MUST is acceptance criteria.

## 0. Product
- One self-contained HTML page, three.js r128 (cdnjs online; embedded offline). No other external assets, no localStorage/eval/alert. English UI. All names fictional.
- Real-time 3D pixel-art diorama of a professional doubles padel final on a floating island. For annetta.dev; page chrome matches annetta.dev (light theme, see CONTRACT §13).
- Deliverables: online artifact, standalone offline HTML, CONTRACT.md, testing summary. Launches directly into the club with accessible New Match button and a good default camera.

## 1. Look & world
- Orthographic isometric camera at 31°, quarter turns (Q/E), wheel zoom, drag orbit/pan, dynamic follow.
- Low-res render target, Pixel size slider 1–6 (default 2), depth outlines, fixed 90-colour palette (OKLab snap), Bayer dithering.
- Doll's-house cutaway: stands/walls facing camera lift or turn transparent. Living miniature: animated spectators, moving flags, ambient effects.
- **Main stadium:** regulation 20×10 m doubles court, service lines, central net, glass walls, metal mesh, posts, side doors; readable ball through glass; blue or terracotta turf with sand infill look; stands, umpire chair, benches, scoreboard, sponsor boards, broadcast cameras, four floodlight masts.
- **Club grounds:** clubhouse (analog clock, balcony, flags, large LED board), practice padel court with two animated casual players, garden/trees/flowerbeds/paths/outdoor seating, tournament marquee, entrance plaza, ticket booth, merch stand, walking visitors, props (padel bags, bottles, towels, rackets, signage).

## 2. Match
- 8 fictional pros (4 M, 4 W), attributes: power, accuracy, reflexes, court coverage, stamina, net play, defense, wall-reading, tactical intelligence. Men's / Women's / optional Mixed. Recognisable pixel characters (outfit, hair, racket colour, animations). User picks 2 players per team.
- Sequence: introduction + walk-on → player intros (ranking/nationality) → coin toss (server + side) → short warm-up → serve procedure → full simulation (rallies, scoring, games, sets, tie-breaks) → changeovers (water, towel, tactics talk) → match point anticipation/celebration → net handshake (all four) → trophy ceremony (podium, confetti, results screen).
- Formats: Quick (first to 4, tie-break at 4–4); One Set (first to 6, win by 2, TB at 6–6); Best of 3 (standard sets, final-set tie-break). Scoring: Advantage or Golden Point. Optional accelerated simulation with realistic results.

## 3. Physics (MOST IMPORTANT)
MUST: frame-independent trajectory simulation with continuous collision detection (no tunnelling through glass/mesh/net/floor at high speed).
- Gravity, air drag, spin (topspin, backspin/slice, sidespin, combos), Magnus.
- Per-surface COR and friction: floor, glass, mesh, net, net cord. Mesh less predictable (reduced speed, controlled directional variation).
- Ball must bounce on the opponent court before touching their walls (except explicit legal return-off-own-wall mechanics). After the receiving-side bounce, ball may rebound off back/side glass or mesh and remain in play, including double-wall (back→side) sequences. Return allowed after first floor bounce and rebounds until a second floor bounce. Own-back-glass defensive shots legal. Direct hit of opponent wall/fence without bouncing in their court = out. Handle balls leaving the enclosure + optional retrieval through doors. No infinite wall-bounce loops; no impossible trajectories.
- Visible ball trajectory, subtle shadow, optional trail.
- **Serving:** underhand, ball bounced on ground and struck at or below waist, diagonal into correct box, sides alternate, two attempts; faults/double faults/net lets; valid serve may rebound off back/side glass; serve hitting metal fence after first bounce = fault; return after the serve bounced; full four-player rotation, each player serves a whole game.
- **Shots:** flat groundstroke, topspin groundstroke, slice/backspin return, FH volley, BH volley, defensive lob (globo), offensive lob, bandeja, víbora, flat smash (remate), kick smash, drop shot (dejada), chiquita, bajada de pared, defensive wall return, counterattack after double-glass rebound. Each with distinct trajectory, speed, spin, difficulty, tactical value, animation.

## 4. Doubles AI & tactics
- Four players behave as two coordinated pairs: dynamic offensive/neutral/defensive formations; advance together for net control; both retreat on effective lobs; left/right responsibilities; implicit communication to avoid double chasing; middle-ball decision by reachability, dominant side, shot quality, positioning; react to partner and opponents; no overlap, teleport, or formation flicker.
- Tactics: keep net, defensive lobs to recover, chiquitas and low balls to force opponents back, attack weak player/open space, target the middle, bandeja to hold net, víbora/aggressive volley when attacking, selective smashes (height/angle/power/opponent), choose when to let ball rebound off glass, adapt to opponents, model fatigue/confidence/unforced errors/variation.
- Archetypes: aggressive net attacker, defensive wall specialist, all-round tactician, powerful smasher, precision placement, counterattacking strategist.
- Stats tuning (configurable distributions, tuned by repeated headless matches): first serve in ≈ 85–95 %, aces rare, double faults ≈ 1–3 % of service points, rallies 6–12 strokes with variance, frequent lobs/volleys, visible wall-assisted returns, smash winners occasional, plausible winners/forced/unforced mix.

## 5. Venues & time
- Four configurations: Classic Blue, Terracotta (slower), Fast Blue (lower friction), Indoor Padel (consistent, no wind). Each changes court texture, decoration, lighting and physics parameters.
- Time of day: Day (bright, soft shadows), Dusk (golden hour, lights switching on), Night (dark blue, four lit masts, glowing scoreboard). Indoor adapts lighting while keeping the diorama look; roof show/hide in indoor mode.

## 6. Animation & characters
Procedural/skeletal pixel rigs: walk/jog/sprint/shuffle/split step; FH/BH groundstrokes and volleys; underhand serve with real ball bounce; bandeja/víbora/smash; low defensive/wall prep; turn-and-retreat; celebrate/encourage/frustration; twirls, breathing, idle, towel; handshake, trophy lift, victory. Racket contact synchronised to physics; predictive interception, pathfinding, accel/braking, collision avoidance, recovery positioning.

## 7. Crowd, officials, presentation
- Chair umpire with score announcements; service fault and net fault calls; electronic review/challenge (configurable) with replay visual of ball contact and line; optional slow-mo for spectacular points.
- Crowd: animated spectators, applause scaled to event (wall saves, long rallies, match point), wave, flags, synchronised celebration, anticipation in long rallies and golden points.
- English commentary driven by real events (examples: "What a spectacular double-glass recovery!", "Perfect bandeja to keep control of the net!", "A brilliant chiquita forces the opponents to retreat!", "That smash comes straight back off the glass!", "Unbelievable defensive lob!", "Golden point! Everything on the line!").

## 8. Controls & UI
- Side panel (right on desktop; stacked below on mobile).
- **Match setup:** format, Team A/B player pickers, M/W/Mixed, Advantage/Golden, New Match, Skip Ceremony, Auto-next, Pause/Resume, speed 0.5/1/2/4×.
- **Court settings:** configuration, time of day, show/hide roof (indoor), glass transparency slider, show/hide markings and ball trail.
- **Coach (either team):** Balanced, Play Aggressive, Play Safe, Control the Net, Defensive/More Lobs, Target the Middle, Target the Glass, Rush the Net, Focus on One Opponent, More Chiquitas, More Smashes; preferred serve and return direction; click court to aim next shot; middle-ball priority player; tactical timeout; challenge a close call; change tactics at changeovers. AI adapts but refuses infeasible orders.
- **Camera:** TV Follow, Whole Club, Court Close-Up, Tactical Top-Down, Free; Q/E rotate; Follow Ball toggle; Follow Player selector; Pixel size slider; Reset View. Glass and cutaways never obstruct ball/players.
- **Match centre:** scoreboard (teams, players, flags, server marker, sets/games/points, tie-break + golden-point indicators, match/set/break point alerts, animated transitions); stats (first serve %, 2nd-serve points won, double faults, winners, unforced, forced, volley winners, smash winners, successful lobs, wall recoveries, break points won/faced, net points won, longest and average rally, duration, distance per player, contribution); player cards (attributes, fatigue, performance); event feed (point-by-point commentary, exceptional shots, tactical adjustments, set changes, challenge/replay events, summary). LED screen mirrors the score with simple celebration animations.

## 9. Sound
WebAudio synthesis only; **off until user interaction**. Distinct sounds: racket impacts, turf bounce, back glass, side glass, mesh, net, footsteps, crowd clap/cheer, umpire announcements (tones or speechSynthesis), ambience (wind, birds, murmur), trophy celebration. Independent volume sliders: effects, crowd, commentary, ambience. Rate-limit at fast simulation.

## 10. Engineering
- Core first (render pipeline, pixel post, palette/dither, coordinates, island/court layout, NAV, lighting, cameras, event bus, fixed-timestep physics, seeded RNG, match state machine), then 11 parallel modules (see CONTRACT §3), generator-coroutine scheduler with watchdogs, `dupcheck`, single namespace, dependency injection.
- Debug overlay (hidden by default): ball pos/vel/spin, predicted landing, collision surface, rally state, active player/interceptor, AI tactical state, physics timestep, FPS, draw calls.
- Performance: low-poly, instancing, shared geometry, cheap colliders, culling, limited shadow updates; reduced mobile mode.

## 11. Reliability MUSTs
Players stay within sensible bounds (except valid retrieval); every point terminates; every shot yields a visible trajectory; every wall rebound coherent; no hitting out of reach; no phantom contacts; no ball teleport; no clipping through glass/mesh; no double-bounce continuation; no missed serve rotation; no deadlocks; no impossible scores; match always reaches walk-on → match point → handshake → trophy ceremony. **Physics-driven with probabilistic tactical decisions — not random point winners with animation.**

## 12. Validation matrix
All 4 venues × 3 formats × M/W/X × Advantage/Golden × coach configurations × all camera modes × Day/Dusk/Night/Indoor × desktop/mobile. Physics tests: serve into box; rotation and side alternation; back glass vs mesh on serve; glass-before-bounce; back/side/double-wall recovery; legal own-glass shot; net cord/let; double bounce; net interception; lob-and-retreat; bandeja/víbora trajectories; smash rebound; partner collision avoidance; out-of-court recovery. Validate scoring independently of the renderer first, then visual sync.

## 13. Visual priorities
(1) enclosed padel court with transparent glass and mesh; (2) four players in believable doubles formations; (3) visible glass rebounds; (4) padel-specific shots (lobs, bandejas, smashes); (5) charming floating-island stadium; (6) pixel-art lighting; (7) legible TV-style scoreboard; (8) responsive controls. Never an open tennis court; never one-player-per-side logic; never decorative wall rebounds.
