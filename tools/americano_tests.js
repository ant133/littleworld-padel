// Points formats (CONTRACT 8.1): Blitz Americano (9 points) and Americano (21 points). Pure scoring plus one full simulated Blitz match.
'use strict';
const assert = require('assert');
const { load } = require('./load');
const HPO = load(), R = HPO.mod.rules.score;
const ORDER = ['A1', 'B1', 'A2', 'B2'];

[['blitz', 9, 2, 5], ['americano', 21, 5, 11]].forEach(function (f) {
  const fmt = f[0], total = f[1], run = f[2], win = f[3];
  // serve rotation: `run` points per player in the order A1 B1 A2 B2, deuce first and alternating, then the tie-break by A1 on the deuce side
  const s = R.createMatch({ format: fmt, scoring: 'golden', firstServeTeam: 'A', serveOrder: ORDER }), seen = [];
  for (let i = 0; !s.over; i++) { seen.push(s.server.playerId + s.serveSide[0]); R.pointWon(s, i % 3 === 0 ? 'B' : 'A'); assert.strictEqual(R.checkState(s).length, 0, fmt + ' state after point ' + (i + 1) + ': ' + R.checkState(s).join(';')); }
  assert.strictEqual(s.points.A + s.points.B, total, fmt + ' plays to the full total');
  assert.strictEqual(seen.length, total);
  seen.slice(0, total - 1).forEach(function (x, i) { assert.strictEqual(x, ORDER[Math.floor(i / run) % 4] + (i % run % 2 === 0 ? 'd' : 'a'), fmt + ' serve ' + i); });
  assert.strictEqual(seen[total - 1], 'A1d', fmt + ' tie-break served by the first server');
  assert.strictEqual(s.winner, s.points.A > s.points.B ? 'A' : 'B');
  assert.strictEqual(JSON.stringify(s.sets), JSON.stringify([{ A: s.points.A, B: s.points.B }]));
  // clinching: the majority is `win`; play continues afterwards
  const c = R.createMatch({ format: fmt, scoring: 'golden', firstServeTeam: 'A', serveOrder: ORDER });
  for (let i = 0; i < win - 1; i++) R.pointWon(c, 'A');
  assert.strictEqual(c.flags.matchPoint, 'A', fmt + ' match point one short of the majority');
  R.pointWon(c, 'A');
  assert.strictEqual(c.flags.clinched, 'A'); assert(!c.over, 'play continues after the clinch'); assert.strictEqual(R.describe(c).banner, 'CLINCHED');
  while (!c.over) R.pointWon(c, 'B');
  assert.strictEqual(c.winner, 'A', 'the clinched team still wins');
  // sides change every `flip` points
  const flips = R.createMatch({ format: fmt, scoring: 'golden', firstServeTeam: 'A', serveOrder: ORDER });
  while (!flips.over) R.pointWon(flips, 'A');
  assert.strictEqual(flips._flips, Math.floor((total - 1) / (fmt === 'blitz' ? 4 : 6)), fmt + ' side changes');
});

// a whole Blitz match through the live flow
const M = HPO.mod.match.start({ format: 'blitz', scoring: 'golden', type: 'M', venue: 'classicBlue', seed: 5, fast: true });
M.runToEnd(4 * 3600);
const st = HPO.mod.rules.state;
assert(M.ended && st.over && st.points.A + st.points.B === 9 && !HPO.util.errors.length, 'blitz match ran to the end');
console.log('americano_tests OK  blitz match ' + st.points.A + '-' + st.points.B + ' in ' + (M.simTime / 60).toFixed(1) + ' sim minutes');
