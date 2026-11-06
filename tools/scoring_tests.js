// Headless tests for src/08_rules.js: scoring engine, serve rotation, flags, live point FSM.
// Usage: node tools/scoring_tests.js [--quick]   (non-zero exit on failure)
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('./load');

const QUICK = process.argv.includes('--quick');
const N_RANDOM = QUICK ? 500 : 10000, N_DEEP = QUICK ? 40 : 300, N_FSM = QUICK ? 3 : 12;
let pass = 0, fail = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); pass++; console.log('PASS ' + name + (Date.now() - t0 > 1500 ? ' (' + (Date.now() - t0) + ' ms)' : '')); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n       ' + (e && e.message || e)); }
}
const J = JSON.stringify;
function eq(a, b, msg) { if (J(a) !== J(b)) throw new Error((msg || 'eq') + ': got ' + J(a) + ' expected ' + J(b)); }
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const other = t => t === 'A' ? 'B' : 'A';

const H0 = load(), SC = H0.mod.rules.score;
const FORMATS = ['quick', 'oneSet', 'bo3'], SCORINGS = ['advantage', 'golden'];
const ORDER_A = ['A1', 'B1', 'A2', 'B2'], ORDER_B = ['B1', 'A1', 'B2', 'A2'];
const mkCfg = (format, scoring, first) => ({ format, scoring, firstServeTeam: first || 'A', serveOrder: (first === 'B' ? ORDER_B : ORDER_A).slice() });
const teamOfIdx = (cfg, i) => i % 2 === 0 ? cfg.firstServeTeam : other(cfg.firstServeTeam);

// ---------- independent reference scorer (works from a winners list only) ----------
function refRun(winners, cfg) {
  const G = cfg.format === 'quick' ? 4 : 6, need = cfg.format === 'bo3' ? 2 : 1, golden = cfg.scoring === 'golden';
  const sets = [], sw = { A: 0, B: 0 }, games = [];
  let g = { A: 0, B: 0 }, p = { A: 0, B: 0 }, tb = false, winner = null;
  for (const w of winners) {
    if (winner) throw new Error('reference: points after match end');
    const o = other(w);
    p[w]++;
    const done = tb ? (p[w] >= 7 && p[w] - p[o] >= 2) : golden ? p[w] >= 4 : (p[w] >= 4 && p[w] - p[o] >= 2);
    if (!done) continue;
    games.push({ winner: w, tb, pts: { A: p.A, B: p.B } });
    g[w]++; p = { A: 0, B: 0 };
    const wasTb = tb; tb = false;
    const mx = Math.max(g.A, g.B), mn = Math.min(g.A, g.B);
    if (wasTb || (mx >= G && mx - mn >= 2)) {
      sets.push({ A: g.A, B: g.B }); sw[g.A > g.B ? 'A' : 'B']++; g = { A: 0, B: 0 };
      if (sw.A >= need || sw.B >= need) winner = sw.A > sw.B ? 'A' : 'B';
    } else if (g.A === G && g.B === G) tb = true;
  }
  return { sets, winner, games };
}

// Verifies a finished match against the reference, serve rotation, serve side and change of ends (all derived from the log).
function verifyMatch(s, cfg) {
  ok(s.over && s.winner, 'match not finished');
  const log = s.log, ref = refRun(log.map(r => r.winner), cfg), G = cfg.format === 'quick' ? 4 : 6;
  eq(s.sets.map(x => ({ A: x.A, B: x.B })), ref.sets, 'sets');
  eq(s.winner, ref.winner, 'winner');
  const byGame = [];
  log.forEach(r => { (byGame[r.gameNo - 1] = byGame[r.gameNo - 1] || []).push(r); });
  eq(byGame.length, ref.games.length, 'game count');
  let flips = 0, setGames = 0, tbSeen = 0;
  byGame.forEach(function (pts, gi) {
    const rg = ref.games[gi], n = pts.length, lastPt = pts[n - 1], next = byGame[gi + 1];
    eq(lastPt.winner, rg.winner, 'game ' + gi + ' winner');
    eq(pts[0].tb, rg.tb, 'tb flag');
    if (rg.tb) tbSeen++;
    const pa = pts.filter(r => r.winner === 'A').length, pb = n - pa;
    eq({ A: pa, B: pb }, rg.pts, 'game points');
    if (cfg.scoring === 'golden' && !rg.tb) ok(n <= 7, 'golden game longer than 7 points');
    if (!rg.tb && cfg.scoring === 'advantage' && n > 6) ok(Math.abs(pa - pb) === 2, 'advantage game not won by exactly 2 after deuce');
    pts.forEach(function (r, k) {
      let idx = gi % 4;
      if (r.tb) idx = (gi + (k === 0 ? 0 : Math.floor((k + 1) / 2))) % 4;
      eq(r.server, cfg.serveOrder[idx], 'server g' + (gi + 1) + ' p' + k);
      eq(r.serverTeam, teamOfIdx(cfg, idx), 'serverTeam');
      eq(r.serveSide, k % 2 === 0 ? 'deuce' : 'ad', 'serveSide alternation');
      if (r.tb && k > 0 && k % 6 === 0) flips++;
    });
    setGames++;
    if (setGames % 2 === 1 && next) flips++;             // odd game total (incl. set end); no change after the final game
    if (!next || next[0].set !== lastPt.set) setGames = 0;
  });
  s.sets.forEach(x => {
    if (!x.tb) return;
    eq([Math.max(x.A, x.B), Math.min(x.A, x.B)], [G + 1, G], 'tb set score');
    ok(Math.max(x.tb.A, x.tb.B) >= 7 && Math.abs(x.tb.A - x.tb.B) >= 2, 'tb points');
  });
  eq(s.sides.A, flips % 2 === 0 ? -1 : 1, 'final sides');
  return { tb: tbSeen, points: log.length };
}

// One point with full checks: flags vs brute force, invariants, change-of-ends timing.
function deepStep(s, w) {
  const bf = { matchPoint: null, setPoint: null, breakPoint: null };
  ['A', 'B'].forEach(t => {
    const c = JSON.parse(J(s)); SC.pointWon(c, t);
    if (c.last.match) bf.matchPoint = bf.matchPoint || t;
    else if (c.last.set) bf.setPoint = bf.setPoint || t;
    else if (c.last.game && !s.inTiebreak && t !== s.server.team) bf.breakPoint = t;
  });
  eq(s.flags, bf, 'flags vs brute force');
  const b = { gameNo: s.gameNo, g: s.games.A + s.games.B, tb: s.inTiebreak, tbN: s.points.A + s.points.B };
  SC.pointWon(s, w);
  SC.assertState(s);
  let exp = false;
  if (s.gameNo > b.gameNo) exp = (b.g + 1) % 2 === 1 && !s.over;
  else if (b.tb) exp = (b.tbN + 1) % 6 === 0;
  eq(s.last.sidesChanged, exp, 'sides change timing');
}

function playRandom(cfg, seed, deep) {
  const rng = H0.makeRng(seed), pa = rng.next() < 0.25 ? 0.5 : rng.range(0.1, 0.9);
  const s = SC.createMatch(cfg);
  for (let n = 0; !s.over; n++) {
    if (n > 8000) throw new Error('match did not terminate');
    const w = rng.next() < pa ? 'A' : 'B';
    if (deep) deepStep(s, w); else SC.pointWon(s, w);
  }
  return s;
}

// ================= scoring: exhaustive random =================
FORMATS.forEach(fmt => SCORINGS.forEach(sc => {
  test('random matches ' + fmt + '/' + sc + ' x' + N_RANDOM, function () {
    let tbs = 0, pts = 0, three = 0, long = 0;
    for (let i = 0; i < N_RANDOM; i++) {
      const cfg = mkCfg(fmt, sc, i % 5 === 0 ? 'B' : 'A');
      const s = playRandom(cfg, 1000 + i * 7919 + fmt.length * 31 + sc.length, i < N_DEEP);
      SC.assertState(s);
      const r = verifyMatch(s, cfg);
      if (i < N_DEEP) eq(J(SC.rebuild(s.log, s.config)), J(s), 'rebuild(log) != live');
      tbs += r.tb; pts += r.points;
      if (fmt === 'bo3' && s.sets.length === 3) three++;
      if (sc === 'advantage' && s.log.some((x, k, a) => k >= 8 && x.gameNo === a[k - 8].gameNo)) long++;
    }
    ok(tbs > 0, 'no tie-break ever happened');
    if (fmt === 'bo3') ok(three > 0, 'no 3-set match');
    if (sc === 'advantage') ok(long > 0, 'no long (deuce) game');
    console.log('       ' + N_RANDOM + ' matches, avg ' + (pts / N_RANDOM).toFixed(1) + ' pts, tie-breaks ' + tbs + (fmt === 'bo3' ? ', 3-setters ' + three : ''));
  });
}));

test('rebuild(log) equals live state (all combos, 200 matches each)', function () {
  FORMATS.forEach(fmt => SCORINGS.forEach(sc => {
    for (let i = 0; i < 200; i++) {
      const cfg = mkCfg(fmt, sc, i % 2 ? 'B' : 'A'), s = playRandom(cfg, 77 + i, false);
      eq(J(SC.rebuild(s.log, s.config)), J(s), fmt + '/' + sc + ' #' + i);
    }
  }));
});

// ================= scoring: handcrafted =================
function play(s, str) { str.replace(/[^AB]/g, '').split('').forEach(w => SC.pointWon(s, w)); return s; }
const G4 = w => w.repeat(4);
const games = (s, str) => { str.replace(/[^AB]/g, '').split('').forEach(w => play(s, G4(w))); return s; };
const mk = (f, sc, first) => SC.createMatch(mkCfg(f, sc, first));
function throwsOnPoint(s) { let t = false; try { SC.pointWon(s, 'A'); } catch (e) { t = true; } ok(t, 'pointWon after match end must throw'); }

test('point text 0/15/30/40/Ad and deuce return', function () {
  const s = mk('quick', 'advantage');
  eq(SC.describe(s).pointsText, { A: '0', B: '0' });
  play(s, 'A'); eq(SC.describe(s).pointsText, { A: '15', B: '0' });
  play(s, 'AB'); eq(SC.describe(s).pointsText, { A: '30', B: '15' });
  play(s, 'AB'); eq(SC.describe(s).pointsText, { A: '40', B: '30' });
  play(s, 'B'); eq(SC.describe(s).pointsText, { A: '40', B: '40' }); eq(s.goldenPoint, false);
  play(s, 'A'); eq(SC.describe(s).pointsText, { A: 'Ad', B: '40' });
  play(s, 'B'); eq(SC.describe(s).pointsText, { A: '40', B: '40' });
  play(s, 'BA'); eq(SC.describe(s).pointsText, { A: '40', B: '40' });
  play(s, 'AA'); eq(s.games, { A: 1, B: 0 }); eq(s.points, { A: 0, B: 0 });
});
test('advantage: alternating points never end the game, two in a row do', function () {
  const s = mk('quick', 'advantage'); play(s, 'AAABBB');
  for (let i = 0; i < 40; i++) { play(s, i % 2 ? 'B' : 'A'); eq(s.games, { A: 0, B: 0 }); }
  play(s, 'BB'); eq(s.games, { A: 0, B: 1 }, 'win by two');
});
test('golden point: 40-40 flag, receiver side choice, decided by one point', function () {
  const s = mk('quick', 'golden'); play(s, 'AAABBB');
  ok(s.goldenPoint, 'golden flag'); eq(s.flags.breakPoint, 'B', 'receivers have game point at the golden point');
  eq(s.goldenReceiverSide, null);
  ok(SC.setGoldenSide(s, 'ad')); eq(s.serveSide, 'ad'); eq(s.goldenReceiverSide, 'ad');
  play(s, 'B'); eq(s.games, { A: 0, B: 1 }); eq(s.goldenPoint, false); eq(s.goldenReceiverSide, null);
  ok(!SC.setGoldenSide(s, 'ad'), 'cannot choose outside the golden point');
  const t = mk('oneSet', 'golden'); play(t, 'AAABBB'); play(t, 'A'); eq(t.games, { A: 1, B: 0 });
});
test('quick: 4-2 and 5-3 win, 4-3 does not, tie-break at exactly 4-4', function () {
  const s = mk('quick', 'advantage'); games(s, 'AABBAB'); eq(s.games, { A: 3, B: 3 });
  play(s, G4('A')); eq(s.games, { A: 4, B: 3 }); eq(s.over, false); eq(s.inTiebreak, false);
  play(s, G4('B')); eq(s.games, { A: 4, B: 4 }); ok(s.inTiebreak, 'tie-break at 4-4');
  const t = games(mk('quick', 'advantage'), 'AAAA'); eq(t.over, true); eq(t.sets[0], { A: 4, B: 0 });
  const u = games(mk('quick', 'advantage'), 'AABBAB'); games(u, 'AA'); eq(u.over, true); eq(u.sets[0], { A: 5, B: 3 });
  const v = games(mk('quick', 'advantage'), 'BBAAAA'); eq(v.over, true); eq(v.sets[0], { A: 4, B: 2 });
});
test('quick tie-break: servers A1,B1,B1,A2,A2,B2,B2,A1,A1,B1,B1,A2; sides change after points 6 and 12', function () {
  const s = games(mk('quick', 'advantage'), 'AABBABAB'); ok(s.inTiebreak); eq(s.gameNo, 9);
  const x0 = s.sides.A, seq = [], sides = [];
  'ABABABABABAB'.split('').forEach(w => { seq.push(s.server.playerId); sides.push(s.sides.A); play(s, w); });
  eq(seq, ['A1', 'B1', 'B1', 'A2', 'A2', 'B2', 'B2', 'A1', 'A1', 'B1', 'B1', 'A2'], 'tb server rotation');
  eq(sides, [x0, x0, x0, x0, x0, x0, -x0, -x0, -x0, -x0, -x0, -x0], 'tb side changes every 6 points');
  eq(s.sides.A, x0); eq(s.points, { A: 6, B: 6 });
});
test('tie-break win by two (8-6) is recorded as 5-4 with tb score', function () {
  const s = games(mk('quick', 'advantage'), 'AABBABAB');
  play(s, 'AAAAA'); play(s, 'BBBBB'); play(s, 'AB'); eq(s.over, false); play(s, 'A'); eq(s.over, false); play(s, 'A'); eq(s.over, true);
  eq(s.sets[0], { A: 5, B: 4, tb: { A: 8, B: 6 } }); eq(s.winner, 'A'); throwsOnPoint(s);
});
test('oneSet: 6-4 and 7-5 win, 6-5 continues, tie-break at 6-6, 7-6 recorded', function () {
  let s = games(mk('oneSet', 'advantage'), 'AAAABBBBAA'); eq(s.over, true); eq(s.sets[0], { A: 6, B: 4 });
  s = games(mk('oneSet', 'advantage'), 'AAAAABBBBB'); eq(s.games, { A: 5, B: 5 }); games(s, 'A'); eq(s.over, false); eq(s.games, { A: 6, B: 5 });
  games(s, 'A'); eq(s.over, true); eq(s.sets[0], { A: 7, B: 5 });
  s = games(mk('oneSet', 'advantage'), 'AAAAABBBBB'); games(s, 'AB'); ok(s.inTiebreak); eq(s.games, { A: 6, B: 6 });
  play(s, 'BBBBBBB'); eq(s.over, true); eq(s.winner, 'B'); eq(s.sets[0], { A: 6, B: 7, tb: { A: 0, B: 7 } });
});
test('bo3: two sets to win, third-set tie-break at 6-6, tb match point', function () {
  const s = games(mk('bo3', 'advantage'), 'AAAAAA'); eq(s.over, false); eq(s.sets.length, 1); eq(s.setsWon, { A: 1, B: 0 }); eq(s.games, { A: 0, B: 0 });
  games(s, 'BBBBBB'); eq(s.over, false); eq(s.setsWon, { A: 1, B: 1 });
  games(s, 'AAAAABBBBB'); games(s, 'AB'); ok(s.inTiebreak, 'tie-break in the deciding set'); eq(s.games, { A: 6, B: 6 });
  eq(s.flags.matchPoint, null); play(s, 'AAAAAA'); eq(s.flags.matchPoint, 'A', 'tb match point at 6-0'); play(s, 'A');
  eq(s.over, true); eq(s.winner, 'A'); eq(s.sets.length, 3); eq(s.sets[2].tb, { A: 7, B: 0 }); throwsOnPoint(s);
});
test('serve rotation continues across games, sets and tie-breaks', function () {
  const s = mk('bo3', 'advantage'), got = [];
  const g = w => { got.push(s.server.playerId); play(s, G4(w)); };
  for (let i = 0; i < 6; i++) g('A');
  eq(got, ['A1', 'B1', 'A2', 'B2', 'A1', 'B1']); eq(s.server.playerId, 'A2', 'set 2 continues the cycle');
  'ABABABABAB'.split('').forEach(g); g('A'); g('B');
  ok(s.inTiebreak); eq(s.gameNo, 19);
  eq(s.server.playerId, ORDER_A[(s.gameNo - 1) % 4], 'tb first server = next in cycle');
  const tbFirst = s.server.playerId; play(s, 'BBBBBBB');
  eq(s.setsWon, { A: 1, B: 1 }); eq(s.server.playerId, ORDER_A[(ORDER_A.indexOf(tbFirst) + 1) % 4], 'cycle advances once after the tie-break');
});
test('sides: change after odd games (none after even, incl. 6-0 set end)', function () {
  const s = mk('bo3', 'advantage'), seq = [];
  for (let i = 0; i < 6; i++) { play(s, G4('A')); seq.push(s.sides.A); }
  eq(seq, [1, 1, -1, -1, 1, 1]);
});
test('sides: change at set end when the game total is odd (6-1)', function () {
  const s = games(mk('bo3', 'advantage'), 'BAAAAA'); eq(s.sets.length, 0); const before = s.sides.A;
  games(s, 'A'); eq(s.sets[0], { A: 6, B: 1 }); eq(s.sides.A, -before, 'ends changed at set end (7 games)'); eq(s.last.sidesChanged, true);
});
test('serve side: deuce first, alternates every point, resets each game', function () {
  const s = mk('quick', 'advantage'), sides = [];
  for (let i = 0; i < 6; i++) { sides.push(s.serveSide); play(s, i % 2 ? 'A' : 'B'); }
  eq(sides, ['deuce', 'ad', 'deuce', 'ad', 'deuce', 'ad']);
  const t = mk('quick', 'advantage'); play(t, 'AAA'); eq(t.serveSide, 'ad'); play(t, 'A'); eq(t.serveSide, 'deuce', 'new game starts on deuce');
});
test('flags: break point (and a server game point is none)', function () {
  const s = mk('quick', 'advantage'); eq(s.server.team, 'A');
  play(s, 'AAA'); eq(s.flags.breakPoint, null, 'server game point is not a break point');
  const t = mk('quick', 'advantage'); play(t, 'BBB'); eq(t.flags.breakPoint, 'B'); play(t, 'A'); eq(t.flags.breakPoint, 'B');
  play(t, 'AAA'); eq(t.flags.breakPoint, null, 'server advantage'); play(t, 'BB'); eq(t.flags.breakPoint, 'B', 'receiver advantage');
  play(t, 'A'); eq(t.flags.breakPoint, null, 'deuce');
  const u = games(mk('quick', 'advantage'), 'A'); eq(u.server.team, 'B'); play(u, 'AAA'); eq(u.flags.breakPoint, 'A');
});
test('flags: set point, match point (oneSet, quick, bo3), tie-break points', function () {
  let s = games(mk('oneSet', 'advantage'), 'AAAAA'); play(s, 'AAA'); eq(s.flags.matchPoint, 'A', 'one set: set point is match point'); eq(s.flags.setPoint, null);
  s = games(mk('bo3', 'advantage'), 'AAAAA'); play(s, 'AAA'); eq(s.flags.setPoint, 'A'); eq(s.flags.matchPoint, null);
  play(s, 'A'); eq(s.setsWon, { A: 1, B: 0 });
  games(s, 'BBBBB'); play(s, 'BBB'); eq(s.flags.setPoint, 'B'); play(s, 'B'); eq(s.setsWon, { A: 1, B: 1 });
  games(s, 'AAAAA'); play(s, 'AAA'); eq(s.flags.matchPoint, 'A');
  s = games(mk('quick', 'advantage'), 'AAA'); play(s, 'AAA'); eq(s.flags.matchPoint, 'A', 'quick 3-0, 40-0');
  s = games(mk('oneSet', 'advantage'), 'AAAAABBBBB'); games(s, 'AB'); eq(s.flags.matchPoint, null);
  play(s, 'AAAAAA'); eq(s.flags.matchPoint, 'A', '6-0 in tie-break'); play(s, 'B'); eq(s.flags.matchPoint, 'A');
  play(s, 'BBBBBB'); eq(s.points, { A: 6, B: 7 }); eq(s.flags.matchPoint, 'B');
  play(s, 'A'); eq(s.flags.matchPoint, null, '7-7');
});
test('flags: golden point deciding the set is match/set point', function () {
  const s = games(mk('oneSet', 'golden'), 'AAAAA'); play(s, 'AAABBB'); eq(s.goldenPoint, true); eq(s.flags.matchPoint, 'A');
  const t = games(mk('oneSet', 'golden'), 'BBBBBA'); play(t, 'AAABBB'); eq(t.flags.matchPoint, 'B', '1-5: B wins the golden point -> 6-1 match');
});
test('timeouts: one per match, consumption helper', function () {
  const s = mk('bo3', 'advantage'); eq(s.timeouts, { A: 1, B: 1 });
  ok(SC.useTimeout(s, 'A') && !SC.useTimeout(s, 'A') && SC.useTimeout(s, 'B'));
});
test('describe(): sets/games/server text and banners', function () {
  const s = games(mk('bo3', 'advantage'), 'AAAAAABB');
  const d = SC.describe(s);
  eq([d.setsText, d.gamesText, d.serverTeam, d.serverName], ['6-0', '0-2', 'A', 'A1']);
  eq(SC.describe(s, { A1: 'Dewi' }).serverName, 'Dewi');
  const t = games(mk('quick', 'advantage'), 'AABBABAB'); play(t, 'AAB');
  eq(SC.describe(t).pointsText, { A: '2', B: '1' }); eq(SC.describe(t).banner, ''); eq(SC.describe(t).tiebreak, true);
  const u = games(mk('oneSet', 'advantage'), 'AAAAABBBBB'); games(u, 'AB'); play(u, 'AAAAAAA');
  eq(SC.describe(u).banner, 'MATCH OVER'); eq(SC.describe(u).setsText, '7-6(0)');
});
test('assertState detects corrupted states', function () {
  const s = play(mk('oneSet', 'advantage'), 'AAABBB');
  SC.assertState(s);
  const bad = [x => { x.points.A = 9; }, x => { x.games.A = 7; }, x => { x.sides.B = x.sides.A; }, x => { x.server.playerId = 'zz'; },
    x => { x.pointNo = 99; }, x => { x.inTiebreak = true; }, x => { x.sets.push({ A: 6, B: 6 }); }];
  bad.forEach((f, i) => { const c = JSON.parse(J(s)); f(c); let t = false; try { SC.assertState(c); } catch (e) { t = true; } ok(t, 'corruption #' + i + ' not detected'); });
});
test('bad configs rejected; first server team B supported', function () {
  ['format', 'scoring'].forEach(k => { let t = false; try { SC.createMatch({ [k]: 'nope' }); } catch (e) { t = true; } ok(t, k); });
  let t = false; try { SC.createMatch({ serveOrder: ['a', 'a', 'b', 'c'] }); } catch (e) { t = true; } ok(t, 'dup serveOrder');
  const s = mk('quick', 'advantage', 'B'); eq(s.server, { team: 'B', playerId: 'B1' }); games(s, 'A'); eq(s.server, { team: 'A', playerId: 'A1' });
});

// ================= source hygiene =================
test('source: no Math.random, no DOM/THREE, only contract-listed events emitted', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', '08_rules.js'), 'utf8');
  ok(!/Math\.random/.test(src), 'Math.random used');
  ok(!/\b(document|THREE)\./.test(src), 'DOM/THREE reference');
  const contract = fs.readFileSync(path.join(__dirname, '..', 'CONTRACT.md'), 'utf8');
  const sec6 = contract.slice(contract.indexOf('## 6. Event bus'), contract.indexOf('## 7.'));
  const allowed = new Set();
  sec6.split('\n').forEach(l => {
    const m = /^\| `([^|]+)` \|/.exec(l); if (!m) return;
    m[1].replace(/`/g, '').split(/ *\/ */).forEach((p, i, arr) => { p = p.trim(); if (p) allowed.add(p.indexOf(':') < 0 && i > 0 ? arr[0].split(':')[0] + ':' + p : p); });
  });
  const emitted = new Set(); let m; const re = /\b(?:E|BUS\.emit)\(\s*'([^']+)'|\['((?:game|set|match):end)'/g;
  while ((m = re.exec(src))) emitted.add(m[1] || m[2]);
  ok(emitted.size >= 10, 'emit scan found only ' + emitted.size);
  emitted.forEach(n => ok(allowed.has(n), 'event not in CONTRACT s6: ' + n));
});

// ================= live FSM =================
const stubCourt = () => ({
  sides: null,
  inCourt: (x, z) => Math.abs(x) <= 10 && Math.abs(z) <= 5,
  serviceBox(team, side) {
    const left = this.sides[team] === -1, tz = (side === 'deuce' ? -1 : 1) * (left ? 1 : -1);
    return { x: left ? [0, 6.95] : [-6.95, 0], z: tz > 0 ? [0, 5] : [-5, 0] };
  }
});
function mkFSM(courtMode) {
  const H = load(); H.BUS.clear();
  if (courtMode === 'none') delete H.mod.court; else if (courtMode === 'stub' || !H.mod.court) H.mod.court = stubCourt();
  const R = H.mod.rules; R.attach();
  const evs = [], orig = H.BUS.emit;
  H.BUS.emit = function (n, p) { evs.push({ n, p }); return orig.call(H.BUS, n, p); };
  const P = (x, z) => ({ x, y: 0, z });
  const h = {
    H, R, evs,
    all: n => evs.filter(e => e.n === n).map(e => e.p),
    last: n => { const a = h.all(n); return a[a.length - 1]; },
    start: cfg => { R.newMatch(Object.assign({ format: 'quick', scoring: 'advantage', serveOrder: ['a1', 'b1', 'a2', 'b2'] }, cfg)); evs.length = 0; R.startPoint(); return R.state; },
    toss: id => H.BUS.emit('serve:toss', { playerId: id }),
    hit: (id, extra) => H.BUS.emit('serve:hit', Object.assign({ playerId: id, attempt: 1 }, extra)),
    bounce: (x, z, margin) => H.BUS.emit('ball:bounce', { side: x < 0 ? 'A' : 'B', p: P(x, z), marginCm: margin === undefined ? 100 : margin, bounceNo: 1 }),
    contact: (surf, x, z) => H.BUS.emit('ball:contact', { surf, p: { x: x || 0, y: 1, z: z || 0 } }),
    shot: (id, o) => H.BUS.emit('shot:hit', Object.assign({ playerId: id, shot: 'flatGround', p: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, quality: 0.5, t: 0, pressure: 0.2, reached: true }, o)),
    dead: reason => H.BUS.emit('ball:dead', { reason }),
    goodServe: () => { // serve into the centre of the correct diagonal box
      const sv = R.currentServer(), b = R.serveTarget().box;
      h.toss(sv.playerId); h.hit(sv.playerId); h.bounce((b.x[0] + b.x[1]) / 2, (b.z[0] + b.z[1]) / 2);
    },
    end: () => h.last('point:end')
  };
  return h;
}
const HAS_REAL_COURT = !!(load().mod.court && typeof load().mod.court.serviceBox === 'function');
const MODES = ['none', 'stub'].concat(HAS_REAL_COURT ? ['real'] : []);
function fsmTest(name, fn) { MODES.forEach(m => test('FSM ' + name + ' [court=' + m + ']', () => fn(mkFSM(m)))); }

fsmTest('start: point:start payload, serve target box and expected receiver', function (h) {
  const S = h.start(); const ps = h.last('point:start');
  eq([ps.pointNo, ps.server, ps.serverTeam, ps.serveSide, ps.faultCount, ps.receiver, ps.retry], [1, 'a1', 'A', 'deuce', 0, 'b1', false]);
  eq(h.R.serveTarget(), { box: { x: [0, 6.95], z: [-5, 0] }, side: 'deuce' });
  eq(h.R.currentServer(), { team: 'A', playerId: 'a1' }); eq(h.R.expectedReceiver(), 'b1');
  if (h.H.mod.court) eq(h.H.mod.court.sides, { A: -1, B: 1 });
  ok(h.R.setReceivers('B', 'b2') && h.R.expectedReceiver() === 'b2', 'receivers can swap sides'); eq(S.receivers.B, { deuce: 'b2', ad: 'b1' });
});
fsmTest('ace: good serve never touched, second bounce -> point to server', function (h) {
  const S = h.start(); h.goodServe(); eq(h.R.phase(), 'serve');
  h.bounce(8, -3);
  const e = h.end(); eq([e.winner, e.kind, e.reason, e.rallyLen, e.hitter, e.shotKinds], ['A', 'ace', 'doubleBounce', 1, 'a1', ['serve']]);
  eq(S.points, { A: 1, B: 0 }); eq(S.log.length, 1); ok(h.last('score:change').state === S);
});
fsmTest('serve faults: long, wide, own side, foot; second fault = double fault', function (h) {
  const S = h.start();
  h.toss('a1'); h.hit('a1'); h.bounce(7.5, -2, 55);
  eq(h.last('fault'), { kind: 'long', attempt: 1 }); eq(S.faultCount, 1);
  const ps = h.last('point:start'); eq([ps.faultCount, ps.retry, ps.pointNo], [1, true, 1]);
  h.toss('a1'); h.hit('a1'); h.bounce(3, 2);
  eq(h.last('fault'), { kind: 'wide', attempt: 2 });
  const e = h.end(); eq([e.winner, e.kind, e.reason, e.rallyLen, e.hitter], ['B', 'doubleFault', 'doubleFault', 0, 'a1']);
  eq(S.points, { A: 0, B: 1 }); eq(S.faultCount, 0);
  h.R.startPoint(); h.toss('a1'); h.hit('a1'); h.bounce(-3, -2);
  eq(h.last('fault'), { kind: 'net', attempt: 1 });
  h.toss('a1'); h.hit('a1', { p: { x: -8, y: 1.6, z: 2 } });
  eq(h.last('fault'), { kind: 'foot', attempt: 2 }); eq(h.end().kind, 'doubleFault');
});
fsmTest('service box lines are in; wrong half is wide; serve side alternates the box', function (h) {
  const S = h.start(); h.toss('a1'); h.hit('a1'); h.bounce(3, 0);               // centre line = in (deuce box z in [-5,0])
  eq(h.R.phase(), 'serve'); eq(S.faultCount, 0);
  h.bounce(4, 0, 3); eq(h.end().winner, 'A');
  h.R.startPoint(); eq(h.R.serveTarget().box, { x: [0, 6.95], z: [0, 5] }, 'ad box');
  h.toss('a1'); h.hit('a1'); h.bounce(6.95, 5); eq(h.R.phase(), 'serve', 'corner = in');
});
fsmTest('serve hits wall/mesh/post before bouncing -> fault wallFirst', function (h) {
  const S = h.start();
  h.toss('a1'); h.hit('a1'); h.contact('glassBack', 10, -2); eq(h.last('fault'), { kind: 'wallFirst', attempt: 1 });
  h.toss('a1'); h.hit('a1'); h.contact('meshSide', 6, 5); eq(h.last('fault'), { kind: 'wallFirst', attempt: 2 });
  eq(h.end().winner, 'B'); h.R.startPoint();
  h.toss('a1'); h.hit('a1'); h.contact('post', 0, 5.05); eq(h.last('fault').kind, 'wallFirst');
  ok(S.faultCount === 1);
});
fsmTest('mesh AFTER the first bounce is a fault; glass after the bounce is legal and play continues', function (h) {
  const S = h.start(); h.goodServe(); h.contact('meshBack', 10, -2);
  eq(h.last('fault'), { kind: 'mesh', attempt: 1 }); eq(S.faultCount, 1);
  h.goodServe(); h.contact('glassBack', 10, -2);
  eq(h.all('fault').length, 1, 'glass after bounce is not a fault'); eq(h.R.phase(), 'serve');
  h.shot('b1', { quality: 0.4, pressure: 0.2 });
  eq(h.last('rally:stroke'), { n: 2, team: 'B' }); eq(h.R.phase(), 'rally');
});
fsmTest('net touch + correct box = let (not counted); net touch + wrong place = fault', function (h) {
  const S = h.start(); h.toss('a1'); h.hit('a1'); h.contact('netTape', 0, -1); h.bounce(3, -2.5);
  eq(h.all('let').length, 1); eq(S.faultCount, 0); eq(h.last('fault').kind, 'let');
  const ps = h.last('point:start'); eq([ps.retry, ps.faultCount], [true, 0]);
  h.toss('a1'); h.hit('a1'); h.contact('net', 0, 1); h.bounce(-1, 1);             // falls back on the server's side
  eq(h.last('fault'), { kind: 'net', attempt: 1 }); eq(h.all('let').length, 1);
  h.toss('a1'); h.hit('a1'); h.contact('net', 0, 1); h.bounce(3, 3);               // over but in the wrong box
  eq(h.last('fault').kind, 'wide'); eq(h.end().kind, 'doubleFault');
});
fsmTest('serve ball dies without bouncing: fault', function (h) {
  const S = h.start(); h.toss('a1'); h.hit('a1'); h.contact('net', 0, 0); h.dead('rest'); eq(h.last('fault'), { kind: 'net', attempt: 1 });
  ok(S.faultCount === 1);
});
fsmTest('players-style serve: serve:hit{y} followed by companion shot:hit{serve} is one serve; high contact = foot fault', function (h) {
  const S = h.start(), sv = (y, q) => {
    h.toss('a1'); h.H.BUS.emit('serve:hit', { playerId: 'a1', attempt: S.faultCount + 1, y });
    h.H.BUS.emit('shot:hit', { playerId: 'a1', shot: 'serve', p: { x: -8, y, z: 1 }, quality: q, pressure: 0.2, reached: true, serve: true });
  };
  sv(0.8, 0.7); eq(h.R.phase(), 'serveFlight'); eq(h.all('rally:stroke').length, 1, 'companion did not create a second stroke');
  h.bounce(3, -2.5); h.shot('b1'); eq(h.last('rally:stroke'), { n: 2, team: 'B' });
  h.R.startPoint(); sv(1.3, 0.7);
  eq(h.last('fault'), { kind: 'foot', attempt: 1 }); eq(h.R.phase(), 'serveWait', 'companion after a foot fault must not restart the serve'); eq(S.faultCount, 1);
});
fsmTest('serve: door/mesh after the bounce is a fault like the fence', function (h) {
  h.start(); h.goodServe(); h.contact('door', 3, 5); eq(h.last('fault').kind, 'mesh');
});
fsmTest('HPO.court alias carries sides (court module / players read HPO.court.sides)', function (h) {
  const S = h.start();
  if (!h.H.mod.court) return;
  ok(h.H.court === h.H.mod.court, 'HPO.court aliases HPO.mod.court'); eq(h.H.court.sides, { A: -1, B: 1 });
  'AAAA'.split('').forEach(w => h.R.pointWon(S, w)); eq(h.H.court.sides, { A: 1, B: -1 });
  h.R.newMatch({ format: 'quick' }); eq(h.H.court.sides, { A: -1, B: 1 });
});
fsmTest('volley return of the serve is illegal -> point to server', function (h) {
  const S = h.start(); h.toss('a1'); h.hit('a1'); h.shot('b1');
  const e = h.end(); eq([e.winner, e.reason, e.kind], ['A', 'volleyReturn', 'fault']); eq(S.points.A, 1);
});
fsmTest('rally: unreachable ball is a winner; error classification forced/unforced', function (h) {
  h.start(); h.goodServe();
  h.shot('b1', { quality: 0.4 }); h.bounce(-4, 1);                  // valid first bounce on A's side
  h.shot('a1', { quality: 0.5 }); h.bounce(4, 1); h.bounce(8, 0);   // B never reaches it
  let e = h.end(); eq([e.winner, e.kind, e.reason, e.rallyLen, e.hitter], ['A', 'winner', 'doubleBounce', 3, 'a1']);
  eq(e.shotKinds, ['serve', 'flatGround', 'flatGround']);
  const run = (retQ, pressure, reached) => {
    h.R.startPoint(); h.goodServe(); h.shot('b1', { quality: retQ }); h.bounce(-4, 1);
    h.shot('a1', { quality: 0.5, pressure, reached }); h.contact('glassBack', -10, 0); return h.end();
  };
  e = run(0.4, 0.2, true); eq([e.winner, e.reason, e.kind], ['B', 'wallFirst', 'unforced']);
  e = run(0.4, 0.2, false); eq(e.kind, 'forced', 'not reached comfortably');
  e = run(0.4, 0.7, true); eq(e.kind, 'forced', 'pressure');
  e = run(0.8, 0.2, true); eq(e.kind, 'unforced', 'comfortable ball is unforced whatever the incoming quality');
});
fsmTest('rally: own-side bounce / net / wall-before-bounce / ceiling are errors by the hitter', function (h) {
  const S = h.start(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.bounce(-3, 0);
  let e = h.end(); eq([e.winner, e.reason], ['B', 'ownSide']);
  h.R.startPoint(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.contact('net', 0, 0); h.bounce(-1, 0);
  e = h.end(); eq([e.winner, e.reason], ['B', 'net']);
  h.R.startPoint(); h.goodServe(); h.shot('b1'); h.contact('meshSide', 3, 5);
  e = h.end(); eq([e.winner, e.reason], ['A', 'wallFirst']);
  h.R.startPoint(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.contact('ceiling', 0, 0);
  e = h.end(); eq([e.winner, e.reason], ['B', 'ceiling']);
  ok(S.log.length === 4);
});
fsmTest('rally: net cord trickling over is in play; walls after the bounce are legal', function (h) {
  h.start(); h.goodServe(); h.shot('b1'); h.contact('netTape', 0, 0); h.bounce(-1, 0);
  eq(h.R.phase(), 'rally'); ok(!h.end());
  h.contact('glassBack', -10, 0); h.contact('meshSide', -8, 5); h.contact('glassSide', -8, -5); ok(!h.end(), 'walls after bounce are legal');
  h.shot('a2'); h.bounce(5, 0); h.contact('meshBack', 10, 0); h.shot('b2'); h.bounce(-2, 2);
  eq(h.last('rally:stroke'), { n: 4, team: 'B' }); ok(!h.end());
});
fsmTest('own-wall defensive shot is legal; second bounce on a side ends the point against that side', function (h) {
  h.start(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.contact('glassBack', -10, 1);
  ok(!h.end(), 'a1 may play the ball off his own back glass'); h.shot('a1'); h.bounce(5, 0);
  h.contact('glassBack', 10, 0); h.bounce(3, 0);        // second bounce on B's side
  const e = h.end(); eq([e.winner, e.reason, e.kind], ['A', 'doubleBounce', 'winner']);
});
fsmTest('outside ground and items finish immediately before/after a legal bounce, including retrieval', function (h) {
  ['ground', 'outsideItem'].forEach(surf => {
    [false, true].forEach(retrieval => {
      h.H.cfg.RULES.outOfCourtRetrieval = retrieval;
      h.start(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.bounce(4, 1);
      h.contact(surf, 9, 6);
      eq([h.end().winner, h.end().reason], ['A', 'lost']);
      eq(h.all('ball:out_retrieve').length, 0);
      const count = h.all('point:end').length; h.dead('outsideContact'); h.contact(surf, 9, 6);
      eq(h.all('point:end').length, count, 'exactly one point');
      h.start(); h.goodServe(); h.shot('b1'); h.contact(surf, -12, 1);
      eq([h.end().winner, h.end().reason], ['A', 'out']);
    });
    h.H.cfg.RULES.outOfCourtRetrieval = true;
    h.start(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.dead('ballLeftCourt');
    ok(!h.end(), 'an airborne exit can still be retrieved');
    h.contact(surf, -12, 1); eq([h.end().winner, h.end().reason], ['B', 'lost']);
  });
});
fsmTest('ball:dead cases', function (h) {
  h.start(); h.goodServe(); h.dead('rest'); let e = h.end(); eq([e.winner, e.kind], ['A', 'ace']);
  h.R.startPoint(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.bounce(4, 1); h.dead('watchdog'); e = h.end(); eq([e.winner, e.kind], ['A', 'winner']);
  h.R.startPoint(); h.goodServe(); h.shot('b1'); h.dead('rest'); e = h.end(); eq([e.winner, e.reason], ['A', 'out']);
});
fsmTest('watchdog: 45 s of sim time ends the point against the team that did not hit last', function (h) {
  const S = h.start(); h.goodServe(); h.shot('b1'); h.bounce(-4, 1);
  for (let i = 0; i < 44; i++) h.R.update(1);
  ok(!h.end()); h.R.update(1.5);
  const e = h.end(); eq([e.winner, e.reason, e.kind], ['B', 'watchdog', 'fault']); eq(S.points.B, 1);
  h.R.startPoint(); h.toss('a1'); h.R.update(46); eq(h.last('fault'), { kind: 'foot', attempt: 1 });
  h.R.update(0.5); eq(h.R.phase(), 'serveWait');
});
fsmTest('events outside a live point and after the point ended are ignored', function (h) {
  const S = h.start(); h.shot('b1'); h.bounce(1, 1); h.contact('net'); h.dead('x'); eq(h.all('point:end').length, 0);
  h.goodServe(); h.bounce(8, -3); eq(h.all('point:end').length, 1);
  h.bounce(8, -3); h.dead('x'); h.shot('b1'); h.contact('glassBack'); eq(h.all('point:end').length, 1, 'no double end');
  ok(S.points.A === 1);
});
MODES.forEach(m => test('FSM game flow: 4 aces by A, B serves next, ends swapped, court.sides follows [court=' + m + ']', function () {
  const h = mkFSM(m), S = h.start();
  for (let i = 0; i < 4; i++) {
    if (i) h.R.startPoint();
    eq(h.R.serveTarget().side, i % 2 ? 'ad' : 'deuce'); eq(h.R.expectedReceiver(), i % 2 ? 'b2' : 'b1');
    h.goodServe(); h.bounce(8, 0); eq(h.end().winner, 'A');
  }
  eq(S.games, { A: 1, B: 0 }); eq(S.sides, { A: 1, B: -1 }); eq(h.last('game:end').winner, 'A');
  if (h.H.mod.court) eq(h.H.mod.court.sides, { A: 1, B: -1 });
  h.R.startPoint(); const ps = h.last('point:start'); eq([ps.server, ps.serverTeam, ps.serveSide], ['b1', 'B', 'deuce']);
  eq(h.R.serveTarget().box, { x: [0, 6.95], z: [-5, 0] }, 'B now on x<0, serves deuce into x>0');
  h.goodServe(); h.bounce(8, 0); eq(h.end().winner, 'B'); eq(S.points, { A: 0, B: 1 });
}));

// Full matches through the FSM with a scripted point generator; expected winners come from the script, not from the FSM.
function fsmMatch(mode, cfg, seed) {
  const h = mkFSM(mode), R = h.R, rng = h.H.makeRng(seed), S = h.start(cfg);
  const sgn = t => S.sides[t] === -1 ? -1 : 1, pl = (t, k) => S.serveOrder.filter((id, i) => teamOfIdx(S.config, i) === t)[k];
  const half = (t, x, z) => h.bounce(sgn(t) * x, z);
  for (let guard = 0; !S.over; guard++) {
    if (guard > 2500) throw new Error('fsm match did not finish');
    if (guard) R.startPoint();
    const T = S.server.team, Rt = other(T), srv = S.server.playerId, plan = rng.next(), n0 = S.log.length;
    let win, len;
    const fault = () => {
      const k = rng.int(0, 4), b = R.serveTarget().box, zmid = (b.z[0] + b.z[1]) / 2;
      h.toss(srv);
      if (k === 4) return h.hit(srv, { p: { x: sgn(T) * 8, y: 2, z: 0 } });
      h.hit(srv);
      if (k === 0) half(Rt, 8, zmid);                         // long
      else if (k === 1) half(Rt, 3, zmid > 0 ? -2 : 2);        // wrong half
      else if (k === 2) h.contact('glassBack', sgn(Rt) * 10, 0);
      else half(T, 3, 1);                                      // own side
    };
    if (plan < 0.08) { fault(); fault(); win = Rt; len = 0; }
    else {
      if (plan < 0.18) fault();
      h.goodServe(); len = 1;
      if (rng.next() < 0.2) { half(Rt, 8, 1); win = T; }       // ace
      else {
        let X = Rt;
        const strokes = rng.int(1, 7);
        for (let k = 0; k < strokes; k++) {
          h.shot(pl(X, rng.int(0, 1)), { quality: rng.next(), pressure: rng.next() }); len++;
          if (k < strokes - 1) { half(other(X), 4 + rng.int(0, 4), rng.range(-4, 4)); X = other(X); }
        }
        const end = rng.int(0, 4);
        if (end === 0) { half(other(X), 4, 1); half(other(X), 7, 2); win = X; }
        else if (end === 1) { h.contact(rng.pick(['glassBack', 'meshSide', 'glassSide', 'door']), sgn(other(X)) * 10, 0); win = other(X); }
        else if (end === 2) { half(X, 3, 1); win = other(X); }
        else if (end === 3) { half(other(X), 4, 1); h.dead('rest'); win = X; }
        else { half(other(X), 4, 1); h.contact('ground', sgn(other(X)) * 9, 6); R.update(13); win = X; }
      }
    }
    ok(S.log.length === n0 + 1, 'point did not end, plan=' + plan);
    const rec = S.log[S.log.length - 1];
    eq(rec.winner, win, 'winner of point ' + rec.pointNo + ' reason ' + rec.reason + ' plan ' + plan);
    eq(rec.rallyLen, len, 'rallyLen');
    SC.assertState(S);
  }
  verifyMatch(S, S.config);
  const rb = R.rebuild(S.log, S.config); rb._emit = S._emit;
  eq(J(rb), J(S), 'rebuild(log) == live');
  return S;
}
MODES.forEach(m => FORMATS.forEach(f => SCORINGS.forEach(sc => test('FSM full match ' + f + '/' + sc + ' [court=' + m + '] x' + N_FSM, function () {
  let pts = 0;
  for (let i = 0; i < N_FSM; i++) pts += fsmMatch(m, mkCfg(f, sc, i % 3 === 2 ? 'B' : 'A'), 500 + i * 13 + f.length).log.length;
  console.log('       ' + pts + ' points played through the FSM');
}))));

test('FSM point:end kinds ace/winner/forced/unforced/doubleFault/fault all reachable', function () {
  const h = mkFSM('none'), seen = new Set(); h.start({ format: 'bo3' });
  const run = f => { h.R.startPoint(); f(); seen.add(h.end().kind); };
  run(() => { h.goodServe(); h.bounce(8, 0); });
  run(() => { h.goodServe(); h.shot('b1'); h.bounce(-4, 1); h.shot('a1'); h.bounce(4, 1); h.bounce(7, 1); });
  run(() => { h.goodServe(); h.shot('b1', { quality: 0.3 }); h.bounce(-4, 1); h.shot('a1', { pressure: 0.1 }); h.contact('glassBack'); });
  run(() => { h.goodServe(); h.shot('b1', { quality: 0.9 }); h.bounce(-4, 1); h.shot('a1', { pressure: 0.7 }); h.contact('glassBack'); });
  run(() => { h.toss('a1'); h.hit('a1'); h.bounce(9, 0); h.toss('a1'); h.hit('a1'); h.bounce(9, 0); });
  run(() => { h.toss('a1'); h.hit('a1'); h.shot('b1'); });
  eq(Array.from(seen).sort(), ['ace', 'doubleFault', 'fault', 'forced', 'unforced', 'winner']);
});

// ---------- court module cross-check ----------
test('court: HPO.mod.court.serviceBox agrees with the rules fallback (only if the real module exists)', function () {
  const real = load().mod.court;
  if (!real || typeof real.serviceBox !== 'function') { console.log('       (real court module absent: skipped)'); return; }
  const a = mkFSM('real'), b = mkFSM('none');
  a.start(); b.start();
  for (let g = 0; g < 2; g++) {
    ['deuce', 'ad'].forEach(side => {
      [a, b].forEach(h => { h.R.state.serveSide = side; });
      eq(a.R.serveTarget().box, b.R.serveTarget().box, 'game ' + g + ' ' + side + ' sides ' + J(a.R.state.sides));
    });
    [a, b].forEach(h => 'AAAA'.split('').forEach(w => h.R.pointWon(h.R.state, w)));
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
