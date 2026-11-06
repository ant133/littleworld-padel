# API: `HPO.mod.rules` (src/08_rules.js)

Headless, no THREE/DOM, no `Math.random`. Tests: `node tools/scoring_tests.js [--quick]` (119 cases, about 12 s; 60 000 random scoring matches + full matches driven through the FSM).

Two layers: **`rules.score`** (pure scoring, no BUS/court/ball needed) and the **live FSM** (`newMatch`, `startPoint`, BUS inputs). Pure functions are also aliased on `rules` itself.

## 1. Pure scoring: `rules.score`

| Function | Notes |
|---|---|
| `createMatch(config, opts?) -> MatchState` | `config = {format:'quick'｜'oneSet'｜'bo3', scoring:'advantage'｜'golden', serveOrder:[4 distinct ids], firstServeTeam:'A'｜'B', timeoutsPerMatch?(1), sideA?(-1)}` plus any extra keys (stored in `state.config`). Defaults: `quick`, `advantage` (`golden` if `cfg.RULES.golden`), `['A1','B1','A2','B2']`, team `'A'`. `opts.emit:true` makes `pointWon` emit BUS events and sync `court.sides` (set by `rules.newMatch`; default off so tests/replays are silent). Throws on bad config. |
| `pointWon(state, team, rec?) -> state` | Mutates and returns `state`. `rec = {reason, kind, rallyLen, hitter}` is copied into the log. Throws `'rules: match over'` after the match ended. Sets `state.last = {winner, game, set, match, sidesChanged}` (what this point caused). |
| `flags(state) -> {matchPoint, setPoint, breakPoint}` | Pure; each value is `'A'｜'B'｜null`. `setPoint` excludes match point (a one-set match point is `matchPoint` only). Tie-break points included; `breakPoint` never in a tie-break; at a golden point the receivers have a break point. |
| `describe(state, names?) -> {pointsText:{A,B}, setsText, setsList, gamesText, setsWonText, serverName, serverTeam, serveSide, tiebreak, banner}` | `pointsText`: `'0','15','30','40','Ad'`, raw numbers in a tie-break. `setsText` e.g. `'6-4 7-6(5)'` (tie-break loser's points). `names` maps playerId -> display name. `banner`: `'MATCH OVER'｜'MATCH POINT'｜'SET POINT'｜'GOLDEN POINT'｜'BREAK POINT'｜''`. |
| `checkState(state) -> string[]` | Invariant violations (empty = ok). |
| `assertState(state) -> true` | Throws `Error('rules.assertState: ...')` listing violations. |
| `rebuild(log, config, opts?) -> state` | Replays `log` (needs only `winner` + the rec fields). `JSON(rebuild(live.log, live.config)) === JSON(live)` (tested, all formats). |
| `serverFor(state)`, `setGoldenSide(state, 'deuce'｜'ad')`, `useTimeout(state, team)`, `step`, `formats` | helpers. `setGoldenSide` only works while `state.goldenPoint`; returns bool. |

### Rules implemented
- Points: raw integers `state.points`. Advantage: normalised so deuce is `3-3` and advantage `4-3`/`3-4`. Golden (`scoring:'golden'`): at `3-3` the next point wins the game, `goldenPoint = true`, `goldenReceiverSide` is `null` until `setGoldenSide` is called (it then overrides `serveSide`).
- Sets: quick = first to 4 games **win by 2** (4-0..4-2, 5-3), tie-break at 4-4 (set 5-4); oneSet/bo3 = first to 6 win by 2, tie-break at 6-6 (7-6), also in the third set of bo3. Tie-break: first to 7, win by 2.
- Server: `serveOrder[(gameIdx) % 4]`, a tie-break counts as one game of the cycle. In a tie-break point `n` (0-based) is served by `order[(tbStart + (n==0 ? 0 : floor((n+1)/2))) % 4]` (1, 2, 2, 2, ...), the cycle advances once after it. Continues across sets.
- Serve side: `deuce` on even points of a game (tie-break too), `ad` on odd, reset each game.
- Change of ends (not in Blitz or Americano, which never change ends): after every game whose in-set game total is odd (incl. the last game of a set), every 6 tie-break points; none after the final point of the match. `state.sides = {A:±1, B:∓1}` (`-1` = x<0 half). `state.last.sidesChanged` tells the caller to start a changeover.

### MatchState (CONTRACT §5.4) deviations/additions
- `sets` holds **completed** sets only: `{A, B, tb?:{A,B}}`; current set is `games`. `setsWon:{A,B}` added.
- `points` is raw counts (see above), not text; use `describe`.
- Added: `over`, `winner`, `goldenReceiverSide`, `receivers:{A:{deuce,ad},B:{...}}` (who receives on which side; default first/second of the team in `serveOrder`; `rules.setReceivers`), `last`, `timeouts`, internal `_r _gi _pg _tbN _flips _emit`.
- `server = {team, playerId}`; team of `serveOrder[i]` is `firstServeTeam` for even `i`, the other team for odd `i`.
- `phase` is left at `'play'`; the `match` module owns it. `rules` sets `over/winner` when the match is decided.
- `stats` only contains `pointsWon:{A,B}`; the rest is aggregated by `match` from `point:end`.
- Log record: `{pointNo, gameNo, set(1-based), server, serverTeam, serveSide, winner, reason, kind, rallyLen, hitter, tb}`. `pointNo`/`gameNo` in state are the *next* numbers (1-based); a tie-break is one game.

### Events emitted by `pointWon` (only when `_emit`)
`game:end {winner, score:{A,B}, tb, gameNo}`, `set:end {winner, score, setNo}`, `match:end {winner, sets, stats}` (**rules emits `match:end`; `match` must not**), `flag:update {matchPoint,setPoint,breakPoint,golden}` (only on change), then `score:change {state}` (always, last). All state is already updated when listeners run.

## 2. Live FSM

```
rules.newMatch(config) -> state     // creates + emits flag:update, score:change; sets court.sides
rules.startPoint() -> {team,playerId}|null   // REQUIRED before every point: resets the FSM, emits point:start
rules.update(dt)                    // call at sim rate; drives watchdog + retrieval timer
rules.state                         // the live MatchState (same object for the whole match, even after undo)
rules.currentServer() -> {team, playerId}
rules.expectedReceiver() -> playerId        // from state.receivers[other(server team)][serveSide]
rules.serveTarget() -> {box:{x:[a,b],z:[c,d]}, side}   // court.serviceBox(serverTeam, serveSide) if available, else identical fallback
rules.setReceivers(team, deucePlayerId) -> bool
rules.setGoldenSide('deuce'｜'ad') -> bool;  rules.useTimeout(team) -> bool
rules.phase()  'idle'｜'serveWait'｜'tossed'｜'serveFlight'｜'serve'｜'rally'｜'ended'
rules.lastBounces() -> up to 3 {team,p,marginCm,call,truth,serve,attempt}
rules.attach() / detach() / init()  // BUS wiring; init() (called by HPO.boot) attaches
```

### Inputs (BUS)
`serve:toss {playerId}`, `serve:hit {playerId, attempt, y?}` (+ the companion `shot:hit {shot:'serve'}` that `players` emits right after is merged into the same serve, not a new stroke), `shot:hit {playerId, shot, p, quality, pressure, reached}`, `ball:contact {surf, p}`, `ball:bounce {p, marginCm}`, `ball:dead {reason, p}`. A `shot:hit{shot:'serve'}` with no preceding `serve:hit` also starts a serve. The team of a player comes from `serveOrder` (fallback `HPO.mod.players.get(id).team`). The team owning a bounce is derived from `p.x` and `state.sides` (the `side` field is ignored). `ball:contact` with `surf:'floor'` is ignored (bounce events are used).

### Outputs (BUS)
| Event | Payload |
|---|---|
| `point:start` | `{pointNo, server:playerId, serverTeam, serveSide, faultCount, receiver, retry}`. **Deviation:** `server` is the playerId (extras added). Re-emitted with `retry:true` after a fault or let (new attempt of the same point). |
| `rally:stroke` | `{n, team}`, for the serve too (`n=1`). |
| `fault` | `{kind:'foot'｜'long'｜'wide'｜'net'｜'mesh'｜'wallFirst'｜'let', attempt}`. Let emits `let {}` then `fault{kind:'let'}` (not counted). Double fault emits `fault` (attempt 2) then `point:end`. |
| `point:end` | `{winner, reason, kind, hitter, rallyLen, shotKinds}`. Emitted **before** `game:end`/`score:change` (do not call `startPoint` from inside the handler; start the next point from a coroutine). `rallyLen` includes the serve (ace = 1, double fault = 0). |
| `ball:out_retrieve` | `{p}` |
| `score:change`, `flag:update`, `game:end`, `set:end`, `match:end` | see above |

`reason` values: `doubleBounce`, `wallFirst`, `ownSide` (stroke bounced on hitter's own side), `net`, `out`, `ceiling`, `lost` (left the court after a valid bounce with retrieval disabled), `retrieveFailed`, `dead` (ball died after a valid bounce), `volleyReturn`, `doubleFault`, `watchdog`.
`kind`: `ace` (serve not touched by the receiver), `doubleFault`, `winner` (opponent never struck the last ball), `forced`/`unforced` (hitter's own error; unforced iff the previous opposing stroke had `quality < 0.55` AND the erring stroke had `pressure < 0.4` AND `reached !== false`, else forced), `fault` (volleyReturn, watchdog).

### Decision rules (as implemented)
- Serve: ball must cross, first floor bounce on the receiving side inside `serviceBox` (edges inclusive, ball centre). `long` = beyond the service line (or off court), `wide` = wrong half, `net` = first bounce on server's side or ball died after touching the net, `wallFirst` = any wall/mesh/post/door/ceiling/ground before the bounce, `foot` = contact height `y > 1.0` (from `serve:hit.y` / `shot:hit.p.y`) or no stroke within 45 s of the toss. Net/tape touch + correct box = **let**. After a valid bounce: `meshBack/meshSide/door` or ceiling = fault `mesh`; glass/post legal. Receiver strike before the serve bounced = point to server (`volleyReturn`). Second bounce on the receiving side with no return = ace.
- Rally: the first floor bounce after a stroke must be on the opponent side (own side = hitter loses, `ownSide`/`net`); any wall/fence/post/door/ceiling/ground contact before it = out (net/tape contact is allowed: cord over = in play). Afterwards walls/mesh are legal. A second bounce on one side ends the point against that side. Any strike (either team, volley allowed) starts a new stroke; double hits/body contact are out of scope.
- Leaving the enclosure (`ball:contact surf:'ground'` or `ball:dead` with reason containing `out/left/exit/ground/over/enclos/bounds`, e.g. `outOfBounds`): before a valid bounce = out; after a valid bounce = `ball:out_retrieve` if `cfg.RULES.outOfCourtRetrieval`, else `lost`. While retrieving, floor/wall/dead events are ignored; the next `shot:hit` continues the rally; no strike within `RULES.retrieveMaxS` (12 s of `update`) = `retrieveFailed`. **Live salvage (no rules change):** a quick player can play the live ball outside the court before it reaches the ground (see CONTRACT §8); the stroke is an ordinary `shot:hit` with `reason: 'salvage'`, so the rally simply continues.
  **Protocol note:** the ball module is already `dead` at that moment; whoever fetches the ball must relaunch it (players' normal `ball.launch` + `shot:hit`).
- Other `ball:dead` (`rest`, `watchdog`): before the bounce = hitter loses; after it = hitter wins (`dead`).
- Watchdog: `update(dt)` accumulates from `serve:toss`; at `RULES.pointMaxS` (45 s) the point goes to the team that hit last (`watchdog`, kind `fault`); with no stroke yet it is a `foot` fault.


### Config keys read from `HPO.cfg.RULES`
`outOfCourtRetrieval` (true), `golden` (default scoring), plus optional `retrieveMaxS` (12), `pointMaxS` (45).

## 3. Coupling with other modules
- `HPO.mod.court` (read at call time): `serviceBox(team, side)`, `inCourt(x,z)`; rules writes `HPO.mod.court.sides = {A,B}` (= `HPO.court.sides`, core alias) on `newMatch`, every change of ends and after an undo. Without a court module the same box/in-court maths run internally (test-verified identical to `02_court_data.js`).
- `HPO.mod.ball`: not called. `HPO.mod.players` is only used as a team lookup fallback.
- `players` already reads `HPO.mod.rules.state.serveSide`.

## 4. Open issues / notes for integrators
1. `match` must call `rules.startPoint()` for every point (including after a changeover) and `rules.update(dt)` each sim tick; it should wait for `point:end` rather than call back into rules from the handler.
2. `match` must not emit `match:end` (rules does) and should use `state.last.sidesChanged` / `game:end`/`set:end` to trigger changeovers; `state.phase` is not touched.
3. Retrieval needs a producer (players/match) that relaunches the ball after `ball:out_retrieve`; otherwise the point times out after 12 s as `retrieveFailed`.
4. `players` currently always sends `reached:true`, so `forced` vs `unforced` is decided by incoming `quality` and own `pressure` only.
5. The ball module treats `door` as mesh-class; rules follows (door contact after a serve bounce is fault `mesh`).
6. Serve foot-position (behind the line) and double hits are not checked.
