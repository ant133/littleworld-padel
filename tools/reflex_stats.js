// Attack and reflex statistics: what happens to smashes, and how often the net players trade volleys.
// Usage: node tools/reflex_stats.js [--n 6] [--seed 900] [--tune {json}]
'use strict';
const { load } = require('./load');
const args = {}; process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) { const k = a.slice(2); args[k] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; } });
const HPO = load();
if (args.tune) { const t = JSON.parse(args.tune); Object.keys(t).forEach(k => { if (typeof t[k] === 'object') HPO.cfg.TUNE[k] = Object.assign(HPO.cfg.TUNE[k] || {}, t[k]); else HPO.cfg.TUNE[k] = t[k]; }); }
const N = +args.n || 6, SEED = +args.seed || 900;

const isSmash = k => k === 'smashFlat' || k === 'smashKick';
const isVolley = k => k === 'volleyFH' || k === 'volleyBH';
const o = { points: 0, strokes: 0, volleys: 0, withSmash: 0, smashWon: 0, smashes: 0, untouched: 0, error: 0, returned: 0, continued: 0, chain3: 0, chain4: 0 };
let smash = null, pending = null, chain = 0, maxChain = 0, prev = null, lastSmasher = null;

HPO.BUS.on('point:start', () => { smash = pending = prev = lastSmasher = null; chain = maxChain = 0; });
HPO.BUS.on('shot:hit', e => {
  if (e.serve) return;
  const h = HPO.mod.players.byId[e.playerId]; if (!h) return;
  o.strokes++;
  if (pending === h.team) o.continued++;          // the smasher's side hit again: the return was good enough to keep the point alive
  pending = null;
  if (smash && smash !== h.team) { o.returned++; pending = smash; }
  smash = null;
  if (isVolley(e.shot)) { o.volleys++; chain = prev && isVolley(prev.k) && prev.t !== h.team ? chain + 1 : 1; } else chain = 0;
  maxChain = Math.max(maxChain, chain); prev = { k: e.shot, t: h.team };
  if (isSmash(e.shot)) { o.smashes++; smash = h.team; lastSmasher = h.team; }
});
HPO.BUS.on('point:end', e => {
  o.points++;
  if (maxChain >= 3) o.chain3++; if (maxChain >= 4) o.chain4++;
  if (smash) { if (e.winner === smash) o.untouched++; else o.error++; }
  if (lastSmasher) { o.withSmash++; if (e.winner === lastSmasher) o.smashWon++; }
  smash = pending = null;
});

for (let i = 0; i < N; i++) HPO.mod.match.start({ format: 'quick', scoring: 'advantage', type: i % 2 ? 'W' : 'M', venue: 'classicBlue', seed: SEED + i, fast: true }).runToEnd(4 * 3600);

const pc = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : 'n/a';
console.log('--- ' + N + ' matches, ' + o.points + ' points, ' + o.strokes + ' strokes (mean rally ' + (o.strokes / Math.max(1, o.points)).toFixed(1) + ')');
console.log('smashes ' + o.smashes + ' (' + pc(o.smashes, o.strokes) + ' of strokes), points containing one ' + pc(o.withSmash, o.points) + ', the last smasher wins ' + pc(o.smashWon, o.withSmash));
console.log('smash fate: untouched winner ' + pc(o.untouched, o.smashes) + ', smasher error ' + pc(o.error, o.smashes) + ', touched by the defenders ' + pc(o.returned, o.smashes) + ', rally continues after the return ' + pc(o.continued, o.smashes));
console.log('volleys ' + pc(o.volleys, o.strokes) + ' of strokes; points with 3+ alternating volleys ' + pc(o.chain3, o.points) + ', 4+ ' + pc(o.chain4, o.points));
