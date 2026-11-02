// Screenshots venue x tod x camera (and mobile) through the real page, collecting console errors.
'use strict';
const B = require('./browser');
const cfgs = [
  { n: 'day_close_classic', q: '?fast=1&speed=2&cam=close&tod=day&venue=classicBlue' },
  { n: 'dusk_close_terracotta', q: '?fast=1&speed=2&cam=close&tod=dusk&venue=terracotta' },
  { n: 'night_close_fast', q: '?fast=1&speed=2&cam=close&tod=night&venue=fastBlue' },
  { n: 'indoor_close', q: '?fast=1&speed=2&cam=close&venue=indoor' },
  { n: 'day_follow', q: '?fast=1&speed=2&cam=follow&tod=day' },
  { n: 'night_top', q: '?fast=1&speed=2&cam=top&tod=night' },
  { n: 'night_club', q: '?fast=1&speed=2&cam=club&tod=night' },
  { n: 'dusk_club', q: '?fast=1&speed=2&cam=club&tod=dusk' },
  { n: 'mobile_club', q: '?fast=1&speed=2&cam=club', w: 390, h: 844, mobile: true },
  { n: 'mobile_close', q: '?fast=1&speed=2&cam=close&tod=night', w: 390, h: 844, mobile: true }
];
(async () => {
  for (const c of cfgs) {
    const r = await B.run({ url: 'file:///C:/Hermes/project/annetta/padel/dev.html' + c.q, waitMs: 9000, width: c.w || 1280, height: c.h || 800, mobile: !!c.mobile,
      evals: ['JSON.stringify({ph:HPO.mod.match.phase,dc:HPO.mod.render.stats().drawCalls,tris:HPO.mod.render.stats().tris,fps:Math.round(HPO.mod.render.stats().fps),err:HPO.util.errors.length,px:HPO.mod.render.pixelSize,sw:document.documentElement.scrollWidth,cw:innerWidth})'],
      shots: ['scratch/vm_' + c.n + '.png'] });
    console.log(c.n.padEnd(24), r.results[0].value || r.results[0].error, r.errors.length ? 'ERRORS ' + [...new Set(r.errors)].slice(0, 3).join(' | ') : '');
  }
})();
