// Rules: pure scoring engine (rules.score) + live point FSM driven by BUS events. No THREE, no DOM.
(function (HPO) {
  'use strict';
  const M = HPO.mod.rules = {}, _ = HPO.t;
  // pts = points format (Americano): total points played, run = serves in a row per player, flip = points between changes of ends, 0 = never (CONTRACT 8.1)
  const FORMATS = { quick: { G: 4, sets: 1 }, oneSet: { G: 6, sets: 1 }, bo3: { G: 6, sets: 2 }, blitz: { pts: 9, run: 2, flip: 0 }, americano: { pts: 21, run: 5, flip: 0 } };
  const SL = 6.95, HALF_W = 5, HALF_L = 10;
  const TEAMS = ['A', 'B'];
  const other = t => t === 'A' ? 'B' : 'A';
  const c2 = o => ({ A: o.A, B: o.B });
  const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
  const RC = () => HPO.cfg.RULES || {};

  // ================= PART 1: pure scoring =================
  const validSet = (G, a, b) => (a === G && b <= G - 2) || (a === G + 1 && (b === G - 1 || b === G));
  const setDone = (G, a, b) => validSet(G, a, b) || validSet(G, b, a);

  // c: any object with games/points/inTiebreak/setsWon. Returns 'point'|'game'|'set'|'match'.
  function step(c, R, t) {
    const o = other(t), p = c.points;
    p[t]++;
    if (c.inTiebreak) return p[t] >= 7 && p[t] - p[o] >= 2 ? gameWon(c, R, t) : 'point';
    if (R.golden) return p[t] >= 4 ? gameWon(c, R, t) : 'point';
    if (p[t] >= 4 && p[t] - p[o] >= 2) return gameWon(c, R, t);
    if (p[t] >= 4 && p[t] === p[o]) p.A = p.B = 3; // keep deuce/advantage normalised
    return 'point';
  }
  function gameWon(c, R, t) {
    const o = other(t), g = c.games;
    c.points.A = c.points.B = 0; c.inTiebreak = false;
    g[t]++;
    if (validSet(R.G, g[t], g[o])) { c.setsWon[t]++; return c.setsWon[t] >= R.sets ? 'match' : 'set'; }
    if (g.A === R.G && g.B === R.G) c.inTiebreak = true;
    return 'game';
  }
  const teamOfIdx = (s, i) => i % 2 === 0 ? s.config.firstServeTeam : other(s.config.firstServeTeam);

  function serverFor(s) {
    if (s._r.pts) { const p = s.pointNo - 1; return { team: teamOfIdx(s, p === s._r.pts - 1 ? 0 : Math.floor(p / s._r.run) % 4), playerId: s.serveOrder[p === s._r.pts - 1 ? 0 : Math.floor(p / s._r.run) % 4] }; }
    let idx = s._gi % 4;
    if (s.inTiebreak) idx = (s._gi + (s._tbN === 0 ? 0 : Math.floor((s._tbN + 1) / 2))) % 4;
    return { team: teamOfIdx(s, idx), playerId: s.serveOrder[idx] };
  }
  function serveSideOf(s) {
    if (s._r.pts) return (s.pointNo - 1) % s._r.run % 2 === 0 ? 'deuce' : 'ad';
    if (s.goldenPoint && s.goldenReceiverSide) return s.goldenReceiverSide;
    return s._pg % 2 === 0 ? 'deuce' : 'ad';
  }
  function flags(s) {
    const f = { matchPoint: null, setPoint: null, breakPoint: null };
    if (s._r.pts) { // Americano: one point short of the majority, or already past it
      const win = Math.floor(s._r.pts / 2) + 1; f.clinched = null;
      TEAMS.forEach(function (t) { if (s.points[t] >= win) f.clinched = t; });
      if (!s.over && !f.clinched) TEAMS.forEach(function (t) { if (s.points[t] === win - 1) f.matchPoint = f.matchPoint || t; });
      return f;
    }
    if (s.over) return f;
    TEAMS.forEach(function (t) {
      const c = { games: c2(s.games), points: c2(s.points), inTiebreak: s.inTiebreak, setsWon: c2(s.setsWon) };
      const o = step(c, s._r, t);
      if (o === 'match') f.matchPoint = f.matchPoint || t;
      else if (o === 'set') f.setPoint = f.setPoint || t;
      else if (o === 'game' && !s.inTiebreak && t !== s.server.team) f.breakPoint = t;
    });
    return f;
  }
  function refresh(s) {
    if (s._r.pts) s.inTiebreak = !s.over && s.points.A + s.points.B === s._r.pts - 1;   // the last point is the tie-break
    s.goldenPoint = s._r.golden && !s.inTiebreak && s.points.A === 3 && s.points.B === 3;
    if (!s.goldenPoint) s.goldenReceiverSide = null;
    s.server = serverFor(s);
    s.serveSide = serveSideOf(s);
    s.flags = flags(s);
  }
  // HPO.court is a core alias of HPO.mod.court; the court module (and players) read court.sides
  function syncCourt(s) { const c = HPO.mod.court; if (c && s._emit) c.sides = c2(s.sides); }
  function flip(s, last) { s.sides.A = -s.sides.A; s.sides.B = -s.sides.B; s._flips++; last.sidesChanged = true; syncCourt(s); }

  function createMatch(config, opts) {
    const c = Object.assign({ format: 'quick', scoring: RC().golden ? 'golden' : 'advantage', firstServeTeam: 'A' }, config || {});
    const F = FORMATS[c.format];
    if (!F) throw new Error('rules: bad format ' + c.format);
    if (c.scoring !== 'advantage' && c.scoring !== 'golden') throw new Error('rules: bad scoring ' + c.scoring);
    if (c.firstServeTeam !== 'A' && c.firstServeTeam !== 'B') throw new Error('rules: bad firstServeTeam');
    c.serveOrder = (c.serveOrder || ['A1', 'B1', 'A2', 'B2']).slice();
    if (c.serveOrder.length !== 4 || new Set(c.serveOrder).size !== 4) throw new Error('rules: serveOrder needs 4 distinct ids');
    c.timeoutsPerMatch = num(c.timeoutsPerMatch, 1);
    const sideA = c.sideA === 1 ? 1 : -1;
    const s = {
      config: c, phase: 'play', sets: [], games: { A: 0, B: 0 }, points: { A: 0, B: 0 }, setsWon: { A: 0, B: 0 },
      inTiebreak: false, goldenPoint: false, goldenReceiverSide: null, server: null, serveOrder: c.serveOrder.slice(),
      serveSide: 'deuce', gameNo: 1, pointNo: 1, faultCount: 0, sides: { A: sideA, B: -sideA },
      flags: null, timeouts: { A: c.timeoutsPerMatch, B: c.timeoutsPerMatch },
      receivers: {}, over: false, winner: null, stats: { pointsWon: { A: 0, B: 0 } }, log: [], last: null,
      _r: { G: F.G, sets: F.sets, golden: !F.pts && c.scoring === 'golden', pts: F.pts || 0, run: F.run || 0, flip: F.flip || 0 }, _gi: 0, _pg: 0, _tbN: 0, _flips: 0, _emit: !!(opts && opts.emit)
    };
    [0, 1, 2, 3].forEach(function (i) {
      const t = teamOfIdx(s, i), r = s.receivers[t] || (s.receivers[t] = {});
      if (!r.deuce) r.deuce = c.serveOrder[i]; else r.ad = c.serveOrder[i];
    });
    refresh(s);
    syncCourt(s);
    return s;
  }

  function pointWon(s, team, rec) {
    if (s.over) throw new Error('rules: match over');
    if (team !== 'A' && team !== 'B') throw new Error('rules: bad team ' + team);
    rec = rec || {};
    if (s._r.pts) return pointWonPts(s, team, rec);
    const wasTb = s.inTiebreak, pre = c2(s.points), prevFlags = s._emit ? JSON.stringify(s.flags) : '', prevGolden = s.goldenPoint;
    pre[team]++;
    s.log.push({
      pointNo: s.pointNo, gameNo: s.gameNo, set: s.sets.length + 1, server: s.server.playerId, serverTeam: s.server.team,
      serveSide: s.serveSide, winner: team, reason: rec.reason || 'point', kind: rec.kind || 'winner',
      rallyLen: rec.rallyLen | 0, hitter: rec.hitter || null, tb: wasTb
    });
    s.stats.pointsWon[team]++;
    s.pointNo++; s._pg++; if (wasTb) s._tbN++;
    s.faultCount = 0;
    const out = step(s, s._r, team), last = s.last = { winner: team, game: false, set: false, match: false, sidesChanged: false };
    const ev = [];
    if (out === 'point') {
      if (wasTb && s._tbN % 6 === 0) flip(s, last);
    } else {
      last.game = true;
      const total = s.games.A + s.games.B, score = c2(s.games);
      ev.push(['game:end', { winner: team, score: score, tb: wasTb, gameNo: s.gameNo }]);
      if (out !== 'game') {
        last.set = true;
        const e = c2(s.games); if (wasTb) e.tb = pre;
        s.sets.push(e);
        s.games.A = s.games.B = 0;
        ev.push(['set:end', { winner: team, score: e, setNo: s.sets.length }]);
      }
      s.gameNo++; s._gi++; s._pg = 0; s._tbN = 0;
      if (out === 'match') {
        s.over = true; s.winner = team; last.match = true;
        ev.push(['match:end', { winner: team, sets: s.sets, stats: s.stats }]);
      } else if (total % 2 === 1) flip(s, last);
    }
    refresh(s);
    if (s._emit) {
      ev.forEach(function (e) { HPO.BUS.emit(e[0], e[1]); });
      if (prevFlags !== JSON.stringify(s.flags) || prevGolden !== s.goldenPoint) HPO.BUS.emit('flag:update', flagPayload(s));
      HPO.BUS.emit('score:change', { state: s });
    }
    return s;
  }
  // Americano: every point counts 1; the match runs to the full total and the team with more points wins
  function pointWonPts(s, team, rec) {
    const R = s._r, last = s.last = { winner: team, game: false, set: false, match: false, sidesChanged: false }, ev = [];
    s.log.push({
      pointNo: s.pointNo, gameNo: 1, set: 1, server: s.server.playerId, serverTeam: s.server.team, serveSide: s.serveSide, winner: team,
      reason: rec.reason || 'point', kind: rec.kind || 'winner', rallyLen: rec.rallyLen | 0, hitter: rec.hitter || null, tb: s.inTiebreak
    });
    s.stats.pointsWon[team]++; s.points[team]++; s.pointNo++; s._pg++; s.faultCount = 0;
    const total = s.points.A + s.points.B, prevFlags = s._emit ? JSON.stringify(s.flags) : '';
    if (total >= R.pts) {
      s.over = true; s.winner = s.points.A > s.points.B ? 'A' : 'B'; last.match = true;
      s.sets = [c2(s.points)]; s.setsWon[s.winner] = 1;
      ev.push(['match:end', { winner: s.winner, sets: s.sets, stats: s.stats }]);
    } else if (R.flip && total % R.flip === 0) flip(s, last);
    refresh(s);
    if (s._emit) {
      ev.forEach(function (e) { HPO.BUS.emit(e[0], e[1]); });
      if (prevFlags !== JSON.stringify(s.flags)) HPO.BUS.emit('flag:update', flagPayload(s));
      HPO.BUS.emit('score:change', { state: s });
    }
    return s;
  }
  const flagPayload = s => ({ matchPoint: s.flags.matchPoint, setPoint: s.flags.setPoint, breakPoint: s.flags.breakPoint, golden: s.goldenPoint });

  function setGoldenSide(s, side) {
    if (!s.goldenPoint) return false;
    if (side !== 'deuce' && side !== 'ad') throw new Error('rules: bad side');
    s.goldenReceiverSide = side; s.serveSide = side;
    return true;
  }
  function useTimeout(s, team) { if (s.timeouts[team] <= 0) return false; s.timeouts[team]--; return true; }

  function describe(s, names) {
    if (s._r.pts) {
      const f = s.flags, tot = s.points.A + s.points.B;
      return {
        pointsText: { A: String(s.points.A), B: String(s.points.B) }, setsText: s.over ? s.points.A + '-' + s.points.B : '', setsList: s.over ? [s.points.A + '-' + s.points.B] : [], gamesText: '',
        setsWonText: s.setsWon.A + '-' + s.setsWon.B, serverName: names && names[s.server.playerId] || s.server.playerId, serverTeam: s.server.team, serveSide: s.serveSide, tiebreak: s.inTiebreak,
        pointsMode: true, target: s._r.pts, remaining: s._r.pts - tot, banner: s.over ? 'MATCH OVER' : s.inTiebreak ? 'TIE-BREAKER' : f.clinched ? 'CLINCHED' : f.matchPoint ? 'MATCH POINT' : ''
      };
    }
    const pt = t => {
      const p = s.points, o = other(t);
      if (s.inTiebreak) return String(p[t]);
      if (p[t] >= 3 && p[o] >= 3) return p[t] > p[o] ? 'Ad' : '40';
      return ['0', '15', '30', '40'][p[t]];
    };
    const sets = s.sets.map(x => x.A + '-' + x.B + (x.tb ? '(' + Math.min(x.tb.A, x.tb.B) + ')' : ''));
    const f = s.flags;
    return {
      pointsText: { A: pt('A'), B: pt('B') }, setsText: sets.join(' '), setsList: sets, gamesText: s.games.A + '-' + s.games.B,
      setsWonText: s.setsWon.A + '-' + s.setsWon.B, serverName: names && names[s.server.playerId] || s.server.playerId,
      serverTeam: s.server.team, serveSide: s.serveSide, tiebreak: s.inTiebreak,
      banner: s.over ? 'MATCH OVER' : f.matchPoint ? 'MATCH POINT' : f.setPoint ? 'SET POINT' : s.goldenPoint ? 'GOLDEN POINT' : f.breakPoint ? 'BREAK POINT' : ''
    };
  }

  function checkState(s) {
    const bad = [], R = s._r, G = R.G, e = m => bad.push(m);
    if (Math.abs(s.sides.A) !== 1 || s.sides.A + s.sides.B !== 0) e('sides');
    if (R.pts) {
      const tot = s.points.A + s.points.B;
      if (tot !== s.log.length || s.pointNo !== tot + 1 || s.stats.pointsWon.A + s.stats.pointsWon.B !== tot) e('points/log');
      if (s.over !== (tot >= R.pts) || tot > R.pts) e('over flag');
      if (s.over && s.winner !== (s.points.A > s.points.B ? 'A' : 'B')) e('winner');
      if (!s.over) { const sv = serverFor(s); if (sv.playerId !== s.server.playerId || s.serveSide !== serveSideOf(s)) e('server/side'); }
      return bad;
    }
    let wa = 0, wb = 0, gSum = 0;
    s.sets.forEach(function (x, i) {
      if (!setDone(G, x.A, x.B)) e('set ' + i + ' invalid ' + x.A + '-' + x.B);
      if (x.A > x.B) wa++; else wb++;
      if ((Math.max(x.A, x.B) === G + 1 && Math.min(x.A, x.B) === G) !== !!x.tb) e('tb record on set ' + i);
      gSum += x.A + x.B;
    });
    if (wa !== s.setsWon.A || wb !== s.setsWon.B) e('setsWon mismatch');
    if (s.over) {
      if (!s.winner || s.setsWon[s.winner] !== R.sets || s.setsWon[other(s.winner)] >= R.sets) e('bad winner');
      if (s.games.A || s.games.B || s.points.A || s.points.B || s.inTiebreak) e('residual score after match');
    } else {
      if (s.setsWon.A >= R.sets || s.setsWon.B >= R.sets) e('match should be over');
      if (s.winner) e('winner without over');
    }
    const g = s.games, p = s.points;
    gSum += g.A + g.B;
    if (s.gameNo - 1 !== gSum || s._gi !== gSum) e('gameNo/games mismatch ' + s.gameNo + ' vs ' + gSum);
    if (!s.over) {
      if (setDone(G, g.A, g.B)) e('finished set not closed');
      if (g.A > G || g.B > G) e('games out of range');
      if ((g.A === G && g.B === G) !== s.inTiebreak) e('tiebreak flag');
      if (s.inTiebreak) {
        if (p.A + p.B !== s._tbN) e('tb points count');
        if (Math.max(p.A, p.B) >= 7 && Math.abs(p.A - p.B) >= 2) e('tb should be over');
      } else if (R.golden) {
        if (p.A > 3 || p.B > 3) e('golden points');
      } else if (!((p.A <= 3 && p.B <= 3) || (p.A === 4 && p.B === 3) || (p.A === 3 && p.B === 4))) e('points ' + p.A + '-' + p.B);
      if (s.goldenPoint !== (R.golden && !s.inTiebreak && p.A === 3 && p.B === 3)) e('golden flag');
      const sv = serverFor(s);
      if (sv.team !== s.server.team || sv.playerId !== s.server.playerId) e('server mismatch');
      if (s.serveSide !== serveSideOf(s)) e('serveSide');
    }
    if (s.pointNo !== s.log.length + 1) e('pointNo/log');
    if (s.stats.pointsWon.A + s.stats.pointsWon.B !== s.log.length) e('stats/log');
    return bad;
  }
  function assertState(s) {
    const bad = checkState(s);
    if (bad.length) throw new Error('rules.assertState: ' + bad.join('; '));
    return true;
  }
  function rebuild(log, config, opts) {
    const s = createMatch(config, opts);
    log.forEach(function (r) { pointWon(s, r.winner, r); });
    return s;
  }

  // one plain-English line on how a format is scored (tutorial and How to play)
  M.describeFormat = function (format, scoring) {
    const F = FORMATS[format]; if (!F) return '';
    if (F.pts) return _('{pts} points. Every point counts 1, and {win} clinches the match.', { pts: F.pts, win: Math.floor(F.pts / 2) + 1 });
    // whole sentences joined, so the Indonesian 'Points go...' sentence can carry the 'salim' (15-15) joke
    return [format === 'quick' ? _('First to 4 games, with a tie-break at 4-4.') : format === 'oneSet' ? _('First to 6 games, with a tie-break at 6-6.') : _('Win two sets; a set is first to 6 games.'),
      _('Points go 15, 30, 40, then the game.'), scoring === 'advantage' ? _('At 40-40 you need two points in a row.') : _('At 40-40 one golden point decides the game.')].join(' ');
  };
  M.score = { createMatch, pointWon, flags, describe, checkState, assertState, rebuild, serverFor, setGoldenSide, useTimeout, step, formats: FORMATS };
  M.createMatch = createMatch; M.pointWon = pointWon; M.flags = flags; M.describe = describe;
  M.checkState = checkState; M.assertState = assertState; M.rebuild = rebuild;

  // ================= PART 2: live point FSM =================
  let S = null, pt = newPt();
  M.state = null;
  const E = (n, p) => HPO.BUS.emit(n, p);
  const NET = { net: 1, netTape: 1 }, MESH = { meshBack: 1, meshSide: 1, door: 1 };
  const LEAVE = /out|left|exit|ground|over|enclos|bounds/i;

  function newPt() {
    return { phase: 'idle', t: 0, strokes: 0, stroke: null, prev: null, shotKinds: [], retrieving: false, retT: 0,
      netTouched: false, lastP: null, companion: false };
  }
  const live = () => S && !S.over && (pt.phase === 'tossed' || pt.phase === 'serveFlight' || pt.phase === 'serve' || pt.phase === 'rally');

  function teamOfPlayer(pid) {
    const i = S.serveOrder.indexOf(pid);
    if (i >= 0) return teamOfIdx(S, i);
    const P = HPO.mod.players, pl = P && typeof P.get === 'function' ? P.get(pid) : null;
    return pl && pl.team || null;
  }
  function teamAtX(x) { return (x < 0) === (S.sides.A === -1) ? 'A' : 'B'; }
  function inCourt(p) {
    const c = HPO.mod.court;
    if (c && typeof c.inCourt === 'function') return !!c.inCourt(p.x, p.z);
    return Math.abs(p.x) <= HALF_L + 1e-9 && Math.abs(p.z) <= HALF_W + 1e-9;
  }
  function boxOf(team, side) {
    const c = HPO.mod.court;
    if (c && typeof c.serviceBox === 'function') { const b = c.serviceBox(team, side); if (b && b.x && b.z) return b; }
    const left = S.sides[team] === -1, rs = left ? 1 : -1, zs = side === 'deuce' ? -rs : rs;
    return { x: left ? [0, SL] : [-SL, 0], z: zs > 0 ? [0, HALF_W] : [-HALF_W, 0] };
  }
  const boxMargin = (b, p) => 100 * Math.min(p.x - b.x[0], b.x[1] - p.x, p.z - b.z[0], b.z[1] - p.z);

  M.newMatch = function (config) {
    S = M.state = createMatch(config, { emit: true });
    pt = newPt();
    syncCourt(S);
    E('flag:update', flagPayload(S));
    E('score:change', { state: S });
    return S;
  };
  M.currentServer = () => S ? { team: S.server.team, playerId: S.server.playerId } : null;
  M.expectedReceiver = () => S ? S.receivers[other(S.server.team)][S.serveSide] : null;
  M.serveTarget = () => S ? { box: boxOf(S.server.team, S.serveSide), side: S.serveSide } : null;
  M.setReceivers = function (team, deucePid) {
    const r = S.receivers[team];
    if (deucePid !== r.deuce && deucePid !== r.ad) return false;
    if (deucePid === r.ad) { r.ad = r.deuce; r.deuce = deucePid; }
    return true;
  };
  M.setGoldenSide = side => setGoldenSide(S, side);
  M.useTimeout = team => useTimeout(S, team);

  function emitStart(retry) {
    E('point:start', { pointNo: S.pointNo, server: S.server.playerId, serverTeam: S.server.team, serveSide: S.serveSide,
      faultCount: S.faultCount, receiver: M.expectedReceiver(), retry: !!retry });
  }
  M.startPoint = function () {
    if (!S || S.over) return null;
    pt = newPt(); pt.phase = 'serveWait';
    emitStart(false);
    return M.currentServer();
  };
  function toServeWait() {
    Object.assign(pt, { phase: 'serveWait', stroke: null, prev: null, strokes: 0, shotKinds: [], netTouched: false, t: 0,
      retrieving: false, companion: false });
    emitStart(true);
  }

  function classify(winner, reason) {
    const st = pt.stroke;
    if (reason === 'doubleFault') return 'doubleFault';
    if (reason === 'volleyReturn' || reason === 'watchdog' || !st) return 'fault';
    if (winner === st.team) return st.isServe ? 'ace' : 'winner';
    const q = pt.prev ? pt.prev.quality : 0.5;
    return st.pressure < 0.4 && st.reached ? 'unforced' : 'forced'; // comfortable ball and still missed = unforced
  }
  function finish(winner, reason, kind) {
    const st = pt.stroke;
    kind = kind || classify(winner, reason);
    pt.phase = 'ended'; pt.retrieving = false;
    const rec = { reason: reason, kind: kind, hitter: st ? st.hitter : S.server.playerId, rallyLen: pt.strokes };
    E('point:end', { winner: winner, reason: reason, kind: kind, hitter: rec.hitter, rallyLen: rec.rallyLen, shotKinds: pt.shotKinds.slice() });
    pointWon(S, winner, rec);
  }
  function serveFault(kind) {
    const attempt = S.faultCount + 1;
    E('fault', { kind: kind, attempt: attempt });
    if (attempt >= 2) {
      pt.strokes = 0; pt.shotKinds = []; pt.stroke = null; pt.prev = null;
      finish(other(S.server.team), 'doubleFault', 'doubleFault');
    } else { S.faultCount = 1; toServeWait(); }
  }
  function serveLet() {
    E('let', {});
    E('fault', { kind: 'let', attempt: S.faultCount + 1 });
    toServeWait();
  }

  function onToss() {
    if (!S || S.over || (pt.phase !== 'serveWait' && pt.phase !== 'tossed')) return;
    pt.phase = 'tossed'; pt.t = 0; pt.netTouched = false; pt.companion = false;
  }
  // players emit serve:hit and then a companion shot:hit{shot:'serve'}; the companion only refines quality
  function onServeEvt(e) { if (onServeHit(e)) pt.companion = true; }
  function onServeHit(e) {
    if (!S || S.over || (pt.phase !== 'serveWait' && pt.phase !== 'tossed')) return false;
    pt.phase = 'serveFlight'; pt.netTouched = false;
    pt.strokes = 1; pt.prev = null; pt.shotKinds = ['serve'];
    pt.stroke = { n: 1, hitter: S.server.playerId, team: S.server.team, shot: 'serve', quality: num(e.quality, 0.5), pressure: 0,
      reached: true, isServe: true, bounced: false, cnt: { A: 0, B: 0 }, net: false };
    E('rally:stroke', { n: 1, team: S.server.team });
    serveHeight(e);
    return true;
  }
  function serveHeight(e) {
    const y = e.p ? e.p.y : e.y;
    if (typeof y === 'number' && y > 1.0 + 1e-9 && pt.phase === 'serveFlight' && !pt.stroke.hChecked) { pt.stroke.hChecked = true; serveFault('foot'); }
  }

  function onShot(e) {
    if (!S || S.over) return;
    const tm = teamOfPlayer(e.playerId);
    if (e.shot === 'serve') {
      if (pt.companion) {
        pt.companion = false;
        if (pt.phase === 'serveFlight' && tm === pt.stroke.team) { pt.stroke.quality = num(e.quality, pt.stroke.quality); serveHeight(e); }
        return;
      }
      if (pt.phase === 'serveWait' || pt.phase === 'tossed') { onServeHit(e); return; }
      if (pt.phase === 'serveFlight' && tm === pt.stroke.team) { pt.stroke.quality = num(e.quality, pt.stroke.quality); serveHeight(e); return; }
    }
    if (!tm || pt.phase === 'serveWait' || pt.phase === 'tossed' || pt.phase === 'idle' || pt.phase === 'ended') return;
    const st = pt.stroke;
    if (pt.phase === 'serveFlight') { // struck before the serve bounced
      if (tm !== st.team) finish(st.team, 'volleyReturn', 'fault');
      return;
    }
    if (pt.phase === 'serve' && tm === st.team) return; // server's partner: ignore
    pt.prev = st; pt.strokes++; pt.retrieving = false; pt.phase = 'rally';
    pt.stroke = { n: pt.strokes, hitter: e.playerId, team: tm, shot: e.shot || '', quality: num(e.quality, 0.5), pressure: num(e.pressure, 0),
      reached: e.reached !== false, isServe: false, bounced: false, cnt: { A: 0, B: 0 }, net: false };
    pt.shotKinds.push(pt.stroke.shot);
    if (e.p) pt.lastP = e.p;
    E('rally:stroke', { n: pt.strokes, team: tm });
  }

  function leaving(p) {
    const st = pt.stroke;
    if (!st || pt.retrieving) return;
    if (st.bounced && RC().outOfCourtRetrieval) {
      pt.retrieving = true; pt.retT = 0;
      E('ball:out_retrieve', { p: p || pt.lastP });
    } else if (st.bounced) finish(st.team, 'lost');
    else finish(other(st.team), 'out');
  }

  function onContact(e) {
    if (!live() || pt.phase === 'tossed') return;
    const surf = e.surf, st = pt.stroke;
    if (e.p) pt.lastP = e.p;
    if (surf === 'floor' || !st) return;
    if (surf === 'ground' || surf === 'outsideItem') {
      if (pt.phase === 'serveFlight') return serveFault('long');
      return finish(st.bounced ? st.team : other(st.team), st.bounced ? 'lost' : 'out');
    }
    if (pt.retrieving) return;
    if (pt.phase === 'serveFlight') {
      if (NET[surf]) pt.netTouched = true;
      else serveFault(surf === 'ceiling' || surf === 'ground' ? 'long' : 'wallFirst');
      return;
    }
    if (surf === 'ceiling') return finish(other(st.team), 'ceiling');
    if (NET[surf]) { if (!st.bounced) st.net = true; return; }
    if (pt.phase === 'serve' && MESH[surf]) return serveFault('mesh'); // serve fault after bounce
    if (!st.bounced) finish(other(st.team), 'wallFirst');
  }

  function serveBounce(e, p, bt) {
    const st = pt.stroke;
    if (bt === st.team) return serveFault('net');
    const b = boxOf(st.team, S.serveSide), m = boxMargin(b, p), ic = inCourt(p);
    if (!(ic && m >= 0)) {
      const dx = Math.min(p.x - b.x[0], b.x[1] - p.x), dz = Math.min(p.z - b.z[0], b.z[1] - p.z);
      return serveFault(!ic || dx < dz ? 'long' : 'wide');
    }
    if (pt.netTouched) return serveLet();
    st.bounced = true; st.cnt[bt] = 1; pt.phase = 'serve';
  }
  function onBounce(e) {
    if (!live() || pt.retrieving || pt.phase === 'tossed') return;
    const p = e.p || pt.lastP, st = pt.stroke;
    if (!p || !st) return;
    pt.lastP = p;
    const bt = teamAtX(p.x);
    if (pt.phase === 'serveFlight') return serveBounce(e, p, bt);
    const ic = inCourt(p);
    st.cnt[bt]++;
    if (!st.bounced) {
      if (bt === st.team) finish(other(st.team), st.net ? 'net' : 'ownSide');
      else if (!ic) finish(other(st.team), 'out');
      else st.bounced = true;
    } else if (st.cnt[bt] >= 2) finish(other(bt), 'doubleBounce');
  }
  function onDead(e) {
    if (!live() || pt.phase === 'tossed' || pt.retrieving) return; // dead ball while retrieving: wait for the retrieval timer
    const st = pt.stroke, reason = e && e.reason;
    if (!st) return;
    if (pt.phase === 'serveFlight') return serveFault(pt.netTouched ? 'net' : 'long');
    if (LEAVE.test(String(reason || ''))) return leaving(e && e.p);
    if (!st.bounced) finish(other(st.team), st.net ? 'net' : 'out');
    else finish(st.team, 'dead');
  }

  M.update = function (dt) {
    if (!S || S.over) return;
    const ph = pt.phase;
    if (ph !== 'tossed' && ph !== 'serveFlight' && ph !== 'serve' && ph !== 'rally') return;
    pt.t += dt;
    if (pt.retrieving) { pt.retT += dt; if (pt.retT > num(RC().retrieveMaxS, 12)) return finish(pt.stroke.team, 'retrieveFailed'); }
    if (pt.t > num(RC().pointMaxS, 45)) {
      if (pt.stroke) finish(pt.stroke.team, 'watchdog', 'fault');
      else serveFault('foot');
    }
  };

  // ---- wiring ----
  const HANDLERS = [['serve:toss', onToss], ['serve:hit', onServeEvt], ['shot:hit', onShot], ['ball:contact', onContact],
    ['ball:bounce', onBounce], ['ball:dead', onDead]];
  let attached = false;
  M.attach = function () {
    M.detach();
    HANDLERS.forEach(function (h) { HPO.BUS.on(h[0], h[1]); });
    attached = true;
  };
  M.detach = function () {
    if (!attached) return;
    HANDLERS.forEach(function (h) { HPO.BUS.off(h[0], h[1]); });
    attached = false;
  };
  M.init = function () { M.attach(); };
  M.phase = () => pt.phase;
})(typeof window !== 'undefined' ? window.HPO : globalThis.HPO);
