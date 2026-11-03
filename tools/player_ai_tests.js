'use strict';
const assert = require('node:assert/strict');
const { load } = require('./load');
const H = load(), P = H.mod.players, AI = H.mod.ai, B = H.mod.ball;
const f = P.createCustom({ name: '  Visitor Woman  ', gender: 'F', seed: 1234 });
const m = P.createCustom({ name: 'Visitor Man', gender: 'M', seed: 5678 });
assert.equal(f.name, 'Visitor Woman');
assert.equal(f.country.code, 'IDN');
assert(Object.values(f.attrs).every(n => n >= 55 && n <= 95));
assert.equal(P.roster().find(p => p.id === 'p5').name, 'Annetta Arslan');
const restored = load().mod.players.restoreCustom(JSON.parse(JSON.stringify(f)));
assert.equal(JSON.stringify(f), JSON.stringify(restored));
assert.throws(() => P.createCustom({ name: ' ', gender: 'F', seed: 7 }));
assert.throws(() => P.createCustom({ name: 'Test', gender: 'Z', seed: 7 }));
assert.throws(() => P.restoreCustom({ custom: true, name: 'Bad', gender: 'M', seed: -1, id: 'custom--1' }));
for (const [type, teamA, teamB] of [['W', [f.id, 'p5'], ['p6', 'p7']], ['M', [m.id, 'p0'], ['p2', 'p3']], ['X', [m.id, 'p5'], ['p2', f.id]]]) {
  H.mod.match.start({ type, teamA, teamB, fast: true });
  assert.equal(P.list.length, 4);
}
assert.throws(() => H.mod.match.start({ type: 'M', teamA: [f.id, 'p0'], teamB: ['p2', 'p3'] }));
assert.throws(() => H.mod.match.start({ type: 'X', teamA: [m.id, 'p0'], teamB: ['p5', f.id] }));
assert.throws(() => H.mod.match.start({ type: 'W', teamA: [f.id, 'p5'], teamB: ['p5', 'p7'] }));
H.mod.match.start({ type: 'M', sideA: -1, fast: true });
const p = P.get('p0'); p.pos = { x: -9, z: 0 };
B.launch({ p: { x: -9, y: 2.6, z: 0 }, v: { x: -1, y: -2, z: 0 }, hitter: 'p2', team: 'B' });
B.state.touchedSinceHit = [{ surf: 'floor', x: -9, y: 0, z: 0 }];
H.BUS.emit('shot:hit', { playerId: 'p2', shot: 'lobDef', quality: 0.8, p: { x: 4, y: 1, z: 0 }, v: { x: -5, y: 12, z: 0 } });
const info = { p: { x: -9, y: 2.6, z: 0 }, height: 2.6, slack: 0.5, ballSpeed: 4, fh: true, walls: 0, ownBounces: 1 };
const kick = AI.decideShot(p, info);
assert.equal(kick.kind, 'smashKick', JSON.stringify(kick));
assert.equal(kick.reason, 'back-glass-lob');
for (const side of [-1, 1]) {
  H.court.sides.A = side; H.court.sides.B = -side; p.pos.x = side * 9; info.p.x = side * 9;
  B.state.touchedSinceHit[0].x = side * 9;
  assert.equal(AI.decideShot(p, info).kind, 'smashKick');
  const chosen = AI.chooseStrike(p, [
    { p: { x: side * 9, y: 2.6 }, slack: 0.4, dt: 0.6, reach: 0.3, ownBounces: 0 },
    { p: { x: side * 9, y: 1 }, slack: 0.4, dt: 1, reach: 0.3, ownBounces: 1 }
  ]);
  assert.equal(chosen.p.y, 2.6, 'takes the reachable overhead');
}
console.log('PASS custom players, deterministic restoration, gender eligibility, duplicate prevention, deep-lob kick smash on both sides, overhead interception');
let previous;
for (const type of ['W', 'W', 'X']) {
  const cfg = { type, seed: 230, fast: true, teamA: [type === 'W' ? f.id : m.id, 'p5'], teamB: type === 'W' ? ['p6', 'p7'] : ['p2', f.id] };
  H.util.errors.length = 0;
  const match = H.mod.match.start(cfg); match.runToEnd(4 * 3600);
  assert(match.ended && H.mod.rules.state.over);
  assert.equal(H.util.errors.length, 0);
  assert.equal(match.stats.points.filter(p => p.reason === 'watchdog').length, 0);
  const result = JSON.stringify(H.mod.rules.state.sets);
  if (type === 'W' && previous) assert.equal(result, previous, 'custom match determinism');
  previous = result;
}
console.log('PASS full custom women and mixed matches with Annetta, no watchdogs, repeated-seed determinism');
