// QTE sim-side checks (docs/QTE.md): the order handed over by qte.take() steers the shot, errMul widens the scatter, a mishit is soft, an impossible target falls back.
// The DOM overlay is checked in headless Chrome by hand (see docs/TESTING.md); here the module is stubbed.
'use strict';
const assert = require('assert');
const { load } = require('./load');

function run(label, orderFor, n) {
  const HPO = load(), o = { qte: 0, reasons: {}, dist: [], effort: [] };
  let pend = null;
  HPO.mod.qte = { offer: () => false, take: p => (p.id === 'p0' ? orderFor(p) : null) };
  HPO.BUS.on('shot:hit', e => {
    pend = null;
    if (!e.reason || e.reason.indexOf('qte') !== 0) return;
    o.qte++; o.reasons[e.reason] = (o.reasons[e.reason] || 0) + 1; pend = e.target;
  });
  HPO.BUS.on('ball:bounce', e => { if (pend && e.p) { o.dist.push(Math.hypot(e.p.x - pend.x, e.p.z - pend.z)); pend = null; } });
  for (let i = 0; i < n; i++) { const M = HPO.mod.match.start({ format: 'quick', scoring: 'golden', type: 'M', venue: 'classicBlue', seed: 7000 + i, fast: true }); M.runToEnd(4 * 3600); assert(M.ended, label + ': match did not finish'); }
  o.mean = o.dist.length ? o.dist.reduce((a, b) => a + b, 0) / o.dist.length : NaN;
  return o;
}
const far = (p, dx, z) => ({ x: -Math.sign(p.pos.x) * dx, z: z });   // dx metres into the half opposite the player (sides swap at changeovers)
const good = run('good', p => ({ playerId: p.id, target: far(p, 6.5, -2.5), effort: 0.7, errMul: 0.7 }), 3);
const bad = run('sloppy', p => ({ playerId: p.id, target: far(p, 6.5, -2.5), effort: 0.7, errMul: 2.2 }), 3);
const mish = run('mishit', p => ({ playerId: p.id, mishit: true }), 2);
const imp = run('impossible', p => ({ playerId: p.id, target: far(p, -8, 0), effort: 0.7, errMul: 1 }), 2);

assert(good.qte > 30 && bad.qte > 30, 'QTE shots happened: ' + good.qte + ' / ' + bad.qte);
assert(good.dist.length > 20 && bad.dist.length > 20, 'bounces measured');
assert(good.mean < bad.mean, 'errMul 0.7 lands closer to the target than 2.2: ' + good.mean.toFixed(2) + ' vs ' + bad.mean.toFixed(2));
assert(mish.reasons['qte-mishit'] > 10 && !mish.reasons.qte, 'a mishit order plays the soft shot');
assert(imp.reasons['qte-fallback'] > 10 && !imp.reasons.qte, 'a target the solver cannot fly falls back to the AI shot');
console.log('qte_tests OK  good ' + good.mean.toFixed(2) + ' m (' + good.qte + ' shots), sloppy ' + bad.mean.toFixed(2) + ' m (' + bad.qte + '), mishit ' + mish.reasons['qte-mishit'] + ', fallback ' + imp.reasons['qte-fallback']);
