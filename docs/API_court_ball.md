# API: `HPO.mod.court` (src/02_court_data.js) and `HPO.mod.ball` (src/04_ball.js)

Headless, no THREE/DOM. All vectors are plain `{x,y,z}`; metres, seconds, rad/s. Run `node tools/physics_tests.js` (20 cases).

## court

| Member | Description |
|---|---|
| `setVenue(name)` | `'classicBlue'｜'terracotta'｜'fastBlue'｜'indoor'`; returns the venue def; unknown name is logged and ignored. Sets `court.venue`, `court.def`, `court.surf`, and enables the ceiling (y=8) for indoor. Default `classicBlue`. |
| `VENUES` | `{name:{label, floor:[e,mu], glass:[e,mu], mesh:[e,jitDeg], wind, ceiling(0｜8), speedMult}}`. Also assigned to `HPO.cfg.VENUES` if absent. `wind` is the gust amplitude (m/s) for whoever calls `ball.setWind`; indoor = 0. |
| `SURF` | `SURF[venue][surfId] = {e, mu, kt, jit, xl, td}`: restitution, Coulomb friction, tangential coupling (1 = grip cancels slip), direction jitter sigma (deg), extra speed loss fraction, extra tangential damping. Ids: `floor ground glassBack glassSide meshBack meshSide door net netTape post ceiling`. Mutable (tuning). `court.params(id)` = current venue entry. |
| `SURFACES` | Flat collider list: `rect` {id, ax, c, ia, ib, a0,a1,b0,b1, two, sg, n} and `capsule` {id, a:[x,y,z], b, r}. Floor, ground (y=-0.2), ceiling (indoor only), back glass/mesh at x=±10, side glass/mesh at z=±5 (see the side wall layout below), net face at x=0, 20 tape capsules (r=0.03) along the sagging top, 2 post capsules at z=±5.05 (r=0.05, h=1.0). |
| `raycastSphere(p0,p1,r)` | Swept sphere, earliest hit: `{t (0..1 fraction of p0->p1), surf, n (towards the sphere), c (sphere centre at contact), p (point on surface)}` or `null`. Walls/net are two-sided; floor/ground/ceiling one-sided. Start-penetrating & approaching returns t=0. |
| `inCourt(x,z)` | `|x|<=10 && |z|<=5`. |
| `regionOf(x,z)` | `'A'｜'B'`: team whose half contains x, using `HPO.court.sides` (see below). |
| `serviceBox(team, side)` | `team` serving `'A'｜'B'`, `side` `'deuce'｜'ad'` -> `{x:[a,b], z:[c,d]}` of the receiving (diagonal) box. Deuce = server's right = `rightSign(team)`; box is on the opposite z side, on the other half. |
| `sideOf(team)` | x sign of that team's half. Reads `HPO.court.sides` at call time (`{A:-1,B:+1}` default if `HPO.court`/entry is missing). The `court` module does not create `HPO.court`; rules owns it. |
| `rightSign(team)` | z sign of the team's right hand = `-sideOf(team)` (A default +1, B default -1; flips when sides swap). |
| `nearLine(x,z[,box])` | Signed margin (m). With `box` (e.g. from `serviceBox`): distance to the box edge, + inside / - outside. Without: distance to the nearest painted line (service lines x=±6.95, centre line z=0 for |x|<=6.95, court boundary), + inside the court / - outside. Measured from the ball centre point (rules decides tolerance). |
| `isWall(id)` | glassBack, glassSide, meshBack, meshSide, post, door. `isMesh(id)`: meshBack, meshSide, **door** (door is mesh-class). `isGlass(id)`, `isNet(id)` (net, netTape). |
| `netHeight(z)` | `0.88+0.04*(z/5)^2`. `DIM`, `LINES` constants for render/nav. |

Side wall layout (z=±5): 3 m glass for |x| in [6,10] (mesh above to 4 m only for |x| in [8,10]), 3 m mesh for |x| in [1,6], and an **open entrance** for |x|<1: free below 1.9 m (the ball can leave through it), mesh header 1.9-3 m. There are no door colliders; the `door` id stays in the surface tables but nothing uses it. The net rect spans the posts (|z|<=5.05) and so runs into the entrance. Exterior triangles from the static world can be registered with `court.setOutsideTriangles(tris)`; contacts report `outsideItem` and end the rally immediately.

## ball

State `ball.state` (a stable object, mutated in place; `p/v/w` objects are replaced on `launch/hold/reset`, so do not cache them):
`p v w, state('held'｜'live'｜'dead'), lastHitter, lastHitTeam, floorBouncesSinceHit, bouncesOnSide{A,B}, touchedSinceHit[{surf,t,x,y,z}], wallContactsSinceFloor, hitsSinceServe, t, tSinceHit, resting, restY, restSurf, restT, deadReason`.
`touchedSinceHit` holds every contact since the last stroke **including `floor`** (capped at the last 32); `t` is ball time at the contact, `x,y,z` the point on the surface.

| Function | Description |
|---|---|
| `reset()` | Zero everything; state becomes `'dead'` (inactive). |
| `hold(p)` | State `'held'` at `p`; stays there (update/step do nothing). |
| `launch({p,v,w?,hitter?,team?,serve?})` | State `'live'`; resets per-stroke bookkeeping (bounces, touched, wallContacts, tSinceHit). `hitsSinceServe` = 1 if `serve:true`, else +1 when `hitter` or `team` is given (so a toss/drop with neither is not counted). `t` is not reset. |
| `step(dt)` | ONE step, `dt` clamped to `cfg.PHYS_DT`. Semi-implicit Euler, swept-sphere contacts, up to 4 per step then velocity halved. |
| `update(simDt)` | Accumulates `simDt/PHYS_DT` and runs whole steps (carry-over fraction kept, 1e-6 tolerance). **Deviation:** not `ceil(simDt/PHYS_DT)` (that would run 5 steps for 1/60 through float error); this makes results independent of chunking (tested). |
| `predict(stateCopy｜null, maxT=6, sampleHz=60)` | Pure dry-run on a clone with the same integrator, jitter off, no events, no rng. Returns `{samples:[{t,p,v,w,floorBounces}], contacts:[{t,surf,p}], end:{t,state,reason}}`. `t` relative to now; first sample is t=0; `floorBounces` = running `floorBouncesSinceHit`. Contact `t` is the end time of the step containing the hit (<= 1/240 s late). Stops when the ball dies. Cost about 5 ms for 6 s. |
| `clone(state)` | Deep copy of a state. |
| `setWind(vec)` / `getWind()` | Constant wind added to air-relative velocity for drag and Magnus. Default 0; nothing calls it automatically (match/rules may set a gust from `court.def.wind`; prediction uses the current wind). |
| `respond(par, n, v, w, rng?)` | Pure contact response `{v,w,e,vn}` (`n` towards the ball, `par` a SURF entry). Used by the integrator; exposed for shot solvers/tests. |
| `PRM` | Tunables: `magnus` (0.13 multiplier on `cfg.BALL.MAGNUS`), `spinDecay` 0.015/s, `restVn` 0.3 m/s, `rollDecel` 1.0 m/s^2, `maxWall` 6, `maxSince` 12 s, `restTime` 1.5 s. |

### Events (BUS)
- `ball:contact` `{surf, p (surface point), vIn, vOut, t, normal}` for every contact except resting-roll contact. `vOut` is after friction, jitter and speed loss.
- `ball:bounce` `{side:'A'｜'B', p, n, marginCm (|court.nearLine|*100), bounceNo (floorBouncesSinceHit)}` for `floor` only (not `ground`, not rest-landings with |vn|<0.3).
- `ball:dead` `{reason:'rest'｜'watchdog'｜'outOfBounds', p, t}`. `watchdog` = `tSinceHit>12` or `wallContactsSinceFloor>6` (the 7th wall/mesh/post/door contact without a floor bounce). `outOfBounds` = |x|>18 or |z|>12 or y<-1. `rest` = rolling on floor at <0.2 m/s for 1.5 s.

### Physics notes / deviations from CONTRACT
- Ball model: gravity, quadratic drag, Magnus `a = k (w x (v - wind))/m`, spin decay 1.5 %/s, thin-shell inertia (I = 2/3 m R^2, stick fraction 0.4). **Magnus constant:** `cfg.BALL.MAGNUS = 0.00055` is about 7.7x the physical `0.5 rho A R`; `ball.PRM.magnus = 0.13` scales it to physical (200 rad/s topspin at 20 m/s gives about 4 m/s^2 extra downward).
- Contact: `vn' = -e vn`, `e = e0 * lo(|vn|) * hi(|vn|)`: reduced below 3 m/s (down to 0.62 e0 at 0.3 m/s) and slightly above 10 m/s. Friction impulse = `min(mu (1+e)|vn|, kt * 0.4 |v_contact_tangential|)` opposing slip; spin updated from `r x J`. Net face: e 0.1, tangential/spin damping 60 %. Tape: e 0.35, 8 deg jitter (net cord). Mesh: 6 deg jitter (venue table), 4 % extra speed loss. Jitter is drawn only from `HPO.streams.ball` (read at call time) in direction space, keeping the outgoing direction away from the surface.
- Floor rest: floor/ground contact with |vn|<0.3 m/s puts the ball in a rolling state (`resting`, y fixed, kinetic friction + 1 m/s^2 rolling decel) without bounce events; state stays `'live'` until the `rest` watchdog.
- **Floor restitution check:** with the contract value e=0.80 a 2 m drop rebounds to about 1.19 m (e^2 h = 1.28 minus drag), not 1.5-1.6 m. 1.5-1.6 m would need e about 0.88 (inside the contract's +-15 % tuning band); left at 0.80 (tuning goes through `cfg.TUNE`). The test asserts 1.15-1.45 m.
- Net posts at z=±5.05 (contract) stand in the open entrance, just outside the side-wall plane; a ball leaving through the entrance can hit them. The net face spans |z|<=5.05.
- Walls have no thickness and no top-edge/rail collision: a ball centre above y=4 passes over.
- Order of `contact` then `bounce` events within a step; multiple contacts in one step emit in order.
- Not implemented: wall top rail, ball-vs-player collisions (players module), wind gusts over time.

### Tests (`node tools/physics_tests.js`)
Court API (boxes, sides swap, nearLine, raycast classification); determinism (seed); chunking invariance (1/60, 1/30, 1/120); tunnelling sweep (2700 aimed/random 60 m/s shots into glass, mesh, side, doors, net, tape, floor; invariants on enclosure, floor, net crossing); post and outside-fence; energy non-increase over all venues/surfaces with random spin; 2 m drop; low-bounce rest + `ball:dead rest`; topspin vs backspin (pure and live); glass reflection + sidespin, mesh slower and jittery; back glass after bounce; side-then-back double wall; net face and tape (both sides); predict vs live (< 2 cm, pure); watchdogs (wall loop with zero gravity, 12 s, out of bounds); hold/launch/reset bookkeeping; venue differences and indoor ceiling.
