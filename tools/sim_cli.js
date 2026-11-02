// Headless full-match runner. Usage: node tools/sim_cli.js [--n 5] [--format quick] [--scoring golden] [--type M] [--venue classicBlue] [--seed 1] [--v]
'use strict';
const { load } = require('./load');
const args = {}; process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) { const k = a.slice(2); const v = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; args[k] = v; } });
const N = +args.n || 1;
const HPO = load();
if (args.tune) { const t = JSON.parse(args.tune); Object.keys(t).forEach(k => { if (typeof t[k] === 'object') HPO.cfg.TUNE[k] = Object.assign(HPO.cfg.TUNE[k] || {}, t[k]); else HPO.cfg.TUNE[k] = t[k]; }); }
const agg = { points: 0, rallies: [], aces: 0, df: 0, firstIn: 0, firstTot: 0, winners: 0, unforced: 0, forced: 0, smashW: 0, volleyW: 0, lobs: 0, wallRec: 0, shots: 0, whiffs: 0, kinds: {}, reasons: {}, dur: 0, trips: 0, fails: 0 };
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const cfg = { format: args.format || 'quick', scoring: args.scoring || 'advantage', type: args.type || 'M', venue: args.venue || 'classicBlue', seed: (+args.seed || 1) + i, fast: true, sideA: args.sideA ? +args.sideA : undefined };
  HPO.util.errors.length = 0;
  const M = HPO.mod.match.start(cfg);
  M.runToEnd(4 * 3600);
  const st = M.stats, S = HPO.mod.rules.state;
  if (!M.ended || !S.over) { agg.fails++; console.log('FAIL: match did not finish', cfg.seed, 'phase', M.phase, 'sim', M.simTime.toFixed(0), JSON.stringify(S.sets), S.games, S.points, HPO.mod.rules.phase()); }
  if (HPO.util.errors.length) { agg.trips++; if (args.v || i < 2) console.log('ERR', HPO.util.errors.slice(0, 3).map(e => e.where + ': ' + e.msg.split('\n').slice(0, 3).join(' | ')).join('\n')); }
  agg.points += st.pointsPlayed; st.rallies.forEach(r => agg.rallies.push(r)); agg.dur += M.simTime;
  st.points.forEach(p => { agg.reasons[p.reason] = (agg.reasons[p.reason] || 0) + 1; p.shots.forEach(k => agg.kinds[k] = (agg.kinds[k] || 0) + 1); });
  HPO.mod.players.list.forEach(p => { const s = p.stats; agg.aces += s.aces; agg.df += s.doubleFaults; agg.firstIn += s.firstServeIn; agg.firstTot += s.firstServeTotal; agg.winners += s.winners; agg.unforced += s.unforced; agg.forced += s.forced; agg.smashW += s.smashWinners; agg.volleyW += s.volleyWinners; agg.lobs += s.lobs; agg.wallRec += s.wallRecoveries; agg.shots += s.shots; agg.whiffs += s.whiffs; });
  if (args.v) console.log('match', cfg.seed, 'sets', JSON.stringify(S.sets), 'winner', S.winner, 'points', st.pointsPlayed, 'sim', (M.simTime / 60).toFixed(1), 'min');
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : 'n/a';
console.log('--- ' + N + ' matches in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's, fails ' + agg.fails + ', error runs ' + agg.trips);
const srt = agg.rallies.slice().sort((a, b) => a - b); const qq = f => srt.length ? srt[Math.floor(srt.length * f)] : 0;
console.log('rally strokes p10/p25/median/p75/p90', qq(.1), qq(.25), qq(.5), qq(.75), qq(.9));
console.log('points', agg.points, 'avg rally strokes', avg(agg.rallies), 'longest', Math.max.apply(null, agg.rallies.concat([0])), 'avg sim min/match', (agg.dur / N / 60).toFixed(1));
console.log('1st serve in', pct(agg.firstIn, agg.firstTot), 'aces', pct(agg.aces, agg.firstTot), 'double faults', pct(agg.df, agg.firstTot));
console.log('winners', pct(agg.winners, agg.points), 'unforced', pct(agg.unforced, agg.points), 'forced', pct(agg.forced, agg.points), 'smash winners', pct(agg.smashW, agg.points), 'volley winners', pct(agg.volleyW, agg.points));
console.log('lobs/stroke', pct(agg.lobs, agg.shots), 'wall returns/stroke', pct(agg.wallRec, agg.shots), 'whiffs', agg.whiffs);
console.log('point end reasons', JSON.stringify(agg.reasons));
const tot = Object.values(agg.kinds).reduce((a, b) => a + b, 0);
console.log('shot mix', Object.entries(agg.kinds).sort((a, b) => b[1] - a[1]).map(e => e[0] + ' ' + (100 * e[1] / tot).toFixed(1)).join(', '));
