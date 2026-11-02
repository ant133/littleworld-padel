// Runs full headless matches across format x scoring x type x venue. Usage: node tools/matrix.js [--part k/n] [--seed 100]
'use strict';
const { load } = require('./load');
const args = {}; process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1]; });
const [pk, pn] = (args.part || '0/1').split('/').map(Number);
const HPO = load();
const combos = [];
['quick', 'oneSet', 'bo3'].forEach(f => ['advantage', 'golden'].forEach(s => ['M', 'W', 'X'].forEach(t => combos.push({ format: f, scoring: s, type: t }))));
const venues = ['classicBlue', 'terracotta', 'fastBlue', 'indoor'];
combos.forEach((c, i) => { c.venue = venues[i % 4]; c.seed = (+args.seed || 100) + i; });
let bad = 0, n = 0;
combos.forEach((c, i) => {
  if (i % pn !== pk) return;
  HPO.util.errors.length = 0;
  const t0 = Date.now();
  const M = HPO.mod.match.start(Object.assign({ fast: true }, c));
  M.runToEnd(6 * 3600);
  const S = HPO.mod.rules.state, chk = HPO.mod.rules.assertState ? HPO.mod.rules.assertState(S) : null;
  const wd = M.stats.points.filter(p => p.reason === 'watchdog').length;
  const ok = M.ended && S.over && !HPO.util.errors.length && !(chk && chk.length);
  n++; if (!ok) bad++;
  console.log((ok ? 'PASS ' : 'FAIL ') + [c.format, c.scoring, c.type, c.venue].join(' ').padEnd(34), 'sets', JSON.stringify(S.sets.map(s => s.A + '-' + s.B)), 'pts', M.stats.pointsPlayed, 'watchdog', wd, 'sim', (M.simTime / 60).toFixed(0) + 'min', ((Date.now() - t0) / 1000).toFixed(0) + 's', HPO.util.errors.length ? 'ERR ' + HPO.util.errors[0].msg.slice(0, 160) : '', chk && chk.length ? 'INVALID ' + JSON.stringify(chk) : '');
});
console.log(bad ? bad + ' of ' + n + ' FAILED' : 'all ' + n + ' passed');
process.exit(bad ? 1 : 0);
