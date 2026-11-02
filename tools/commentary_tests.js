// Headless tests for src/18_commentary.js: pure engine behaviour + full simulated matches.
// Usage: node tools/commentary_tests.js [--quiet]
'use strict';
const { load } = require('./load');
const quiet = process.argv.includes('--quiet');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }

// ---------------------------------------------------------------- pure engine
(function pure() {
  const HPO = load(), C = HPO.mod.commentary, POOL = C.POOL;
  Object.keys(POOL).forEach(k => ok(POOL[k].lines.length >= 4, 'pool ' + k + ' has >= 4 phrasings'));
  const e = C.makeEngine(5); let t = 0; e.clockFn = () => t; e.speedFn = () => 1;
  // no immediate repetition, even with a single key hammered
  const seen = [];
  for (let i = 0; i < 300; i++) {
    t += 100;
    const l = e.lineFor({ type: 'shot', shot: 'bandeja', P: 'Mateo', T: 'x', O: 'y', quality: 0.8, depth: 3, t: t });
    ok(!!l, 'bandeja line emitted when allowed'); if (!l) break;
    seen.push(l.text);
    if (seen.length >= 2) ok(seen[seen.length - 1] !== seen[seen.length - 2], 'no immediate repeat (bandeja)');
    if (seen.length >= 3) ok(seen[seen.length - 1] !== seen[seen.length - 3], 'no repeat within 2 (bandeja)');
  }
  ok(new Set(seen).size >= 4, 'bandeja uses >= 4 phrasings');
  // cooldown: second line within cd is dropped; priority 3 passes the gap but not the key cd
  t = 90000;
  const a = e.lineFor({ type: 'shot', shot: 'bandeja', quality: 0.9, depth: 2, P: 'A', t: t });
  const b = e.lineFor({ type: 'shot', shot: 'bandeja', quality: 0.9, depth: 2, P: 'A', t: t + 1 });
  ok(a && !b, 'cooldown drops a repeat of the same key');
  // conditions: bandeja too weak or from the back is not praised; double glass needs glass >= 2
  t = 120000;
  ok(!e.lineFor({ type: 'shot', shot: 'bandeja', quality: 0.3, depth: 2, P: 'A', t: t }), 'weak bandeja gets no line');
  t = 120100; ok(!e.lineFor({ type: 'shot', shot: 'flatGround', afterWall: true, glass: 1, quality: 0.8, P: 'A', t: t }), 'single glass is not a double-glass line');
  t = 120200; const dg = e.lineFor({ type: 'shot', shot: 'flatGround', afterWall: true, glass: 2, quality: 0.8, P: 'A', t: t });
  ok(dg && dg.key === 'doubleGlass', 'double glass line');
  t = 120300; ok(!e.lineFor({ type: 'shot', shot: 'lobDef', pressure: 0.2, quality: 0.8, P: 'A', t: t }), 'relaxed lob is not "unbelievable"');
  t = 120400; ok((e.lineFor({ type: 'shot', shot: 'lobDef', pressure: 0.8, quality: 0.8, P: 'A', t: t }) || {}).key === 'lobDefPressure', 'defensive lob under pressure');
  // rarer situations built from synthetic summaries
  const one = (sm, key, label) => { t += 500; const l = e.lineFor(Object.assign({ t: t }, sm)); ok(l && l.key === key, label + ' -> ' + key + (l ? '' : ' (null)')); return l; };
  t = 200000;
  one({ type: 'shot', shot: 'flatGround', prevShot: 'smashFlat', sameTeamPrev: true, glass: 1, quality: 0.6, P: 'Lukas' }, 'smashBack', 'smash back off glass');
  ok(!e.lineFor({ type: 'shot', shot: 'flatGround', prevShot: 'smashFlat', sameTeamPrev: false, glass: 1, quality: 0.6, P: 'x', t: t + 900 }), 'smash by the other team is not a rebound');
  one({ type: 'shot', shot: 'lobDef', prevShot: 'chiquita', prevQuality: 0.8, sameTeamPrev: false, depth: 7, quality: 0.5, P: 'a', prevP: 'Cami', T: 'x' }, 'chiquitaForce', 'chiquita forces retreat');
  one({ type: 'flag', flags: { matchPoint: 'A', golden: false }, who: { matchPoint: 'Team A' } }, 'matchPoint', 'match point');
  one({ type: 'flag', flags: { golden: true } }, 'goldenPoint', 'golden point');
  one({ type: 'tiebreak' }, 'tiebreak', 'tie-break');
  one({ type: 'challenge', overturned: true, call: 'out', T: 'x' }, 'challengeOver', 'challenge overturned');
  one({ type: 'challenge', overturned: false, call: 'in', T: 'x' }, 'challengeStands', 'challenge stands');
  one({ type: 'streak', n: 4, T: 'Team A' }, 'streak', 'streak');
  one({ type: 'let' }, 'letNet', 'net let');
  // speed scaling: at 4x the same events produce fewer lines
  const e1 = C.makeEngine(9), e4 = C.makeEngine(9); let n1 = 0, n4 = 0; e1.speedFn = () => 1; e4.speedFn = () => 4;
  for (let i = 0; i < 400; i++) {
    const tt = i * 3; e1.clockFn = () => tt; e4.clockFn = () => tt;
    const s = { type: 'point', kind: 'winner', reason: 'dead', rallyLen: 6, lastShot: 'volleyFH', P: 'P', T: 'T', O: 'O', t: tt };
    if (e1.lineFor(s)) n1++; if (e4.lineFor(s)) n4++;
  }
  ok(n4 < n1 * 0.6 && n1 > 0, 'rate limit tightens at 4x (' + n1 + ' vs ' + n4 + ')');
  // scoring words
  const sc = (pts, extra) => C.scoreCall(Object.assign({ server: { team: 'A' }, points: pts, inTiebreak: false, goldenPoint: false }, extra || {}), t => 'Team ' + t);
  ok(sc({ A: 1, B: 0 }) === 'Fifteen–love', 'fifteen-love: ' + sc({ A: 1, B: 0 }));
  ok(sc({ A: 0, B: 2 }) === 'Love–thirty', 'love-thirty');
  ok(sc({ A: 3, B: 2 }) === 'Forty–thirty', 'forty-thirty');
  ok(sc({ A: 2, B: 2 }) === 'Thirty all', 'thirty all');
  ok(sc({ A: 3, B: 3 }) === 'Deuce', 'deuce');
  ok(sc({ A: 4, B: 3 }) === 'Advantage Team A', 'advantage A');
  ok(sc({ A: 3, B: 4 }) === 'Advantage Team B', 'advantage B');
  ok(/^Golden point/.test(sc({ A: 3, B: 3 }, { goldenPoint: true })), 'golden point call');
  ok(sc({ A: 3, B: 1 }, { inTiebreak: true }) === 'Three–one', 'tie-break numbers');
  ok(sc({ A: 5, B: 5 }, { inTiebreak: true }) === 'Five all', 'tie-break all');
})();

// ---------------------------------------------------------------- full matches
const CONFIGS = [
  { seed: 1, format: 'quick', scoring: 'golden', type: 'M' }, { seed: 2, format: 'quick', scoring: 'advantage', type: 'W' }, { seed: 3, format: 'oneSet', scoring: 'golden', type: 'X' },
  { seed: 4, format: 'bo3', scoring: 'advantage', type: 'M', venue: 'terracotta' }, { seed: 5, format: 'quick', scoring: 'golden', type: 'W', venue: 'indoor' }
];
const keysSeen = {}; let sample = null, totalLines = 0, totalCom = 0, maxWin = 0;
const UMP_OK = [/^(Love|Fifteen|Thirty|Forty|Zero|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen)[– ]/, /^Deuce$/, /^Advantage Team [AB]$/, /^Golden point/, /^Fault$/, /^Foot fault$/,
  /^Let$/, /^Out$/, /^Double fault$/, /^Second serve$/, /^Game, Team [AB]\./, /^Game and (first|second|third) set/, /^Game, set and match/, /^Tie-break, zero all/, /^Challenge /, /^Tactical timeout/];

CONFIGS.forEach(function (cfg) {
  const HPO = load(), C = HPO.mod.commentary, BUS = HPO.BUS, M = HPO.mod.match;
  C.init();
  const lines = [], ev = { shots: [], points: [], contacts: [], flags: [], faults: [], lets: [], phases: [], challenges: [], coach: [], form: [], games: [], sets: [], match: [], changeovers: [] };
  let glassRun = 0, wallsRun = 0;
  const T = () => M.simTime;
  BUS.on('speak', e => lines.push(Object.assign({ at: T() }, e)));
  BUS.on('ball:contact', e => { if (e.surf === 'glassBack' || e.surf === 'glassSide') { glassRun++; wallsRun++; } else if (/mesh|door|post/.test(e.surf)) wallsRun++; });
  BUS.on('shot:hit', e => { ev.shots.push({ t: T(), shot: e.shot, pid: e.playerId, retrieval: !!e.retrieval, team: HPO.mod.players.get(e.playerId).team, afterWall: e.afterWall, q: e.quality, pr: e.pressure, glass: glassRun, walls: wallsRun, x: e.p.x }); glassRun = wallsRun = 0; });
  BUS.on('point:end', e => { ev.points.push(Object.assign({ t: T(), glassEnd: glassRun, flags: JSON.parse(JSON.stringify(HPO.mod.rules.state.flags || {})), golden: HPO.mod.rules.state.goldenPoint }, e)); glassRun = wallsRun = 0; });
  BUS.on('flag:update', e => ev.flags.push(Object.assign({ t: T() }, e)));
  BUS.on('fault', e => ev.faults.push(Object.assign({ t: T() }, e)));
  BUS.on('let', e => ev.lets.push({ t: T() }));
  BUS.on('match:phase', e => ev.phases.push(Object.assign({ t: T() }, e)));
  BUS.on('challenge:result', e => ev.challenges.push(Object.assign({ t: T() }, e)));
  BUS.on('game:end', e => ev.games.push(Object.assign({ t: T() }, e)));
  BUS.on('set:end', e => ev.sets.push(Object.assign({ t: T() }, e)));
  BUS.on('match:end', e => ev.match.push(Object.assign({ t: T() }, e)));
  BUS.on('changeover:start', e => ev.changeovers.push(Object.assign({ t: T() }, e)));
  const feed = []; HPO.mod.ui = { feed: e => feed.push(e) };
  M.start(Object.assign({ fast: true }, cfg));
  M.runToEnd();
  const name = 'match ' + cfg.seed + ' ' + cfg.format + '/' + cfg.scoring;
  ok(M.ended, name + ' finished');
  ok(HPO.util.errors.length === 0, name + ' no errors: ' + JSON.stringify(HPO.util.errors.slice(0, 2)));
  ok(lines.length > 20, name + ' produced lines (' + lines.length + ')');
  ok(feed.length > 0 && feed.every(f => f.text && f.kind && typeof f.t === 'number'), name + ' feed entries well-formed');
  const com = lines.filter(l => l.voice === 'commentator'), ump = lines.filter(l => l.voice === 'umpire');
  totalLines += lines.length; totalCom += com.length;
  ok(lines.every(l => l.text && l.text.indexOf('{') < 0 && l.text.indexOf('undefined') < 0 && l.priority >= 0 && l.priority <= 3), name + ' lines are clean (no unfilled tokens)');
  // no repeats within a window of the 8 previous commentator lines
  let rep = 0; com.forEach((l, i) => { for (let j = Math.max(0, i - 8); j < i; j++) if (com[j].text === l.text) rep++; });
  ok(rep === 0, name + ' no commentator repeats within 8 lines (' + rep + ')');
  // rate limit: non-priority-3 commentator lines per 30 sim seconds
  let mx = 0; const low = com.filter(l => l.priority < 3);
  low.forEach((l, i) => { let c = 0; for (let j = i; j < low.length && low[j].at - l.at < 30; j++) c++; mx = Math.max(mx, c); });
  maxWin = Math.max(maxWin, mx);
  ok(mx <= 6, name + ' <= 6 non-critical commentator lines per 30 s (max ' + mx + ')');
  for (let i = 1; i < com.length; i++) if (com[i].priority < 3 && com[i - 1].priority < 3) { ok(com[i].at - com[i - 1].at >= 0.8, name + ' gap between lines ' + (com[i].at - com[i - 1].at).toFixed(2)); break; }
  // umpire texts conform and match the rules state
  ump.forEach(l => { if (!UMP_OK.some(r => r.test(l.text))) ok(false, name + ' unexpected umpire text: ' + l.text); });
  ok(ump.filter(l => /^Game, set and match/.test(l.text)).length === 1, name + ' exactly one "Game, set and match"');
  ok(ump.filter(l => l.text === 'Deuce').length === 0 || cfg.scoring === 'advantage', name + ' Deuce only in advantage scoring');
  ok(ump.filter(l => /^Golden point/.test(l.text)).length === 0 || cfg.scoring === 'golden', name + ' golden calls only in golden scoring');
  // phases
  ok(com.some(l => l.key === 'phIntro') && com.some(l => l.key === 'phPlay'), name + ' intro and play lines present');

  // justification of every emitted commentator line from independent event data
  const near = (arr, t, tol) => arr.filter(x => Math.abs(x.t - t) <= (tol || 0.05));
  const log = C.engine.log.filter(l => l.voice === 'commentator');
  log.forEach(function (l) {
    keysSeen[l.key] = (keysSeen[l.key] || 0) + 1;
    const w = l.why || {}, k = l.key, pts = near(ev.points, l.t), sh = near(ev.shots, l.t);
    let good = true, why = '';
    switch (k) {
      case 'doubleGlass': case 'tripleGlass': good = sh.some(s => s.afterWall && s.glass >= (k === 'tripleGlass' ? 3 : 2)); why = 'glass>=2 and afterWall'; break;
      case 'smashBack': good = sh.some((s, i) => { const prev = ev.shots[ev.shots.indexOf(s) - 1]; return prev && /smash/.test(prev.shot) && prev.team === s.team && s.glass >= 1; }); why = 'smash by same team then glass'; break;
      case 'bandeja': good = sh.some(s => s.shot === 'bandeja' && s.q >= 0.6); break;
      case 'dejada': good = sh.some(s => s.shot === 'dejada'); break;
      case 'vibora': good = sh.some(s => s.shot === 'vibora'); break;
      case 'smashPower': good = sh.some(s => /smash/.test(s.shot)); break;
      case 'lobDefPressure': good = sh.some(s => s.shot === 'lobDef' && s.pr >= 0.5); break;
      case 'chiquitaForce': good = sh.some(s => { const prev = ev.shots[ev.shots.indexOf(s) - 1]; return prev && prev.shot === 'chiquita' && prev.team !== s.team; }); break;
      case 'wallStreak': good = w.wallStreak >= 3; break;
      case 'rallyN': good = w.n >= 20; break;
      case 'ace': good = pts.some(p => p.kind === 'ace'); break;
      case 'doubleFault': good = pts.some(p => p.kind === 'doubleFault'); break;
      case 'smashWinner': good = pts.some(p => p.kind === 'winner' && /smash/.test(p.shotKinds[p.shotKinds.length - 1])); break;
      case 'volleyWinner': good = pts.some(p => p.kind === 'winner' && /^volley/.test(p.shotKinds[p.shotKinds.length - 1])); break;
      case 'lobWinner': good = pts.some(p => p.kind === 'winner' && /^lob/.test(p.shotKinds[p.shotKinds.length - 1])); break;
      case 'wallWinner': good = pts.some(p => p.kind === 'winner' && p.glassEnd >= 1); break;
      case 'winner': good = pts.some(p => p.kind === 'winner'); break;
      case 'unforced': good = pts.some(p => p.kind === 'unforced'); break;
      case 'forced': good = pts.some(p => p.kind === 'forced'); break;
      case 'longRally': good = pts.some(p => p.rallyLen >= 15); break;
      case 'savedMatch': good = pts.some(p => p.flags.matchPoint && p.flags.matchPoint !== p.winner); break;
      case 'savedSet': good = pts.some(p => p.flags.setPoint && p.flags.setPoint !== p.winner); break;
      case 'savedBreak': good = pts.some(p => p.flags.breakPoint && p.flags.breakPoint !== p.winner); break;
      case 'goldenWon': good = pts.some(p => p.golden); break;
      case 'goldenPoint': good = near(ev.flags, l.t).some(f => f.golden); break;
      case 'goldenCombo': good = near(ev.flags, l.t).some(f => f.golden && (f.matchPoint || f.setPoint)); break;
      case 'matchPoint': good = near(ev.flags, l.t).some(f => f.matchPoint); break;
      case 'setPoint': good = near(ev.flags, l.t).some(f => f.setPoint); break;
      case 'breakPoint': good = near(ev.flags, l.t).some(f => f.breakPoint); break;
      case 'tiebreak': good = ev.games.some(g => g.score.A === g.score.B && Math.abs(g.t - l.t) < 0.05) || ev.sets.length > 0; break;
      case 'streak': good = w.n >= 3; break;
      case 'gameStreak': good = w.n >= 3; break;
      case 'breakOfServe': case 'hold': case 'gameWon': good = near(ev.games, l.t).length > 0; break;
      case 'setWon': good = near(ev.sets, l.t).length > 0; break;
      case 'matchWon': good = near(ev.match, l.t).length > 0; break;
      case 'letNet': good = near(ev.lets, l.t).length > 0 || near(ev.faults, l.t).some(f => f.kind === 'let'); break;
      case 'faultMesh': good = near(ev.faults, l.t).some(f => f.kind === 'mesh'); break;
      case 'faultNet': good = near(ev.faults, l.t).some(f => f.kind === 'net'); break;
      case 'challengeStands': good = near(ev.challenges, l.t).some(c => !c.overturned); break;
      case 'challengeOver': good = near(ev.challenges, l.t).some(c => c.overturned); break;
      case 'changeoverGame': case 'changeoverSet': good = near(ev.changeovers, l.t).length > 0; break;
      case 'fatigue': good = w.fatigue >= C.fatigueThreshold; break;
      case 'formationAttack': case 'formationDefend': good = !!w.formation; break;
      case 'coach': good = !!w.preset; break;
      case 'retrieval': good = sh.some(s => s.retrieval); break;
      case 'timeout': good = lines.some(x => x.voice === 'umpire' && /timeout/i.test(x.text) && !x.key); break;
      case 'anticipate': good = /smash/.test(w.shot); break;
      default: if (/^ph/.test(k)) good = near(ev.phases, l.t).length > 0; break;
    }
    ok(good, name + ' line "' + l.text + '" (' + k + ') not justified' + (why ? ' [' + why + ']' : ''));
  });
  if (!sample) sample = lines.slice(0, 70);
});

console.log('\ncommentary keys exercised over ' + CONFIGS.length + ' matches (' + Object.keys(keysSeen).length + ' distinct): ' + Object.keys(keysSeen).sort().map(k => k + ':' + keysSeen[k]).join(' '));
console.log('lines: ' + totalLines + ' total, ' + totalCom + ' commentator, max non-critical per 30s = ' + maxWin);
if (!quiet && sample) {
  console.log('\n--- sample transcript (match 1) ---');
  sample.forEach(l => console.log(('[' + l.at.toFixed(0) + 's] ').padEnd(8) + (l.voice === 'umpire' ? 'UMPIRE   ' : 'COMMENT  ') + 'p' + l.priority + ' ' + l.text));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
