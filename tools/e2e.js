// Browser end-to-end: plays a match at high speed, samples state + screenshots. Usage: node tools/e2e.js "?speed=12&format=quick" outPrefix [samples] [intervalMs]
'use strict';
const B = require('./browser');
const q = process.argv[2] || '?speed=12'; const prefix = process.argv[3] || 'scratch/e2e'; const n = +process.argv[4] || 12; const ms = +process.argv[5] || 15000;
const steps = [];
const st = 'JSON.stringify({ph:HPO.mod.match.phase,t:Math.round(HPO.mod.match.simTime),score:HPO.mod.rules.describe(HPO.mod.rules.state).pointsText,games:HPO.mod.rules.state.games,sets:HPO.mod.rules.state.sets.length,ended:HPO.mod.match.ended,err:HPO.util.errors.length,fps:Math.round(HPO.mod.render.stats().fps),dc:HPO.mod.render.stats().drawCalls})';
for (let i = 0; i < n; i++) { steps.push({ wait: ms }); steps.push({ eval: st }); steps.push({ shot: prefix + '_' + i + '.png' }); }
B.run({ url: 'file:///C:/Hermes/project/annetta/padel/dev.html' + q, waitMs: 4000, steps: steps, width: +process.env.W || 1280, height: +process.env.H || 800, mobile: !!process.env.MOBILE }).then(r => {
  r.results.forEach((x, i) => console.log(i, x.value || x.error));
  console.log('console errors:', [...new Set(r.errors)].slice(0, 8));
  console.log('warnings:', [...new Set(r.console.filter(c => /^warning/.test(c)))].slice(0, 5));
});
