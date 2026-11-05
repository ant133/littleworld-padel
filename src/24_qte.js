// QTE shots (docs/QTE.md). When the visitor's player has a winning chance (attack) or is stretched by a smash (defence) the sim pauses, the camera swings
// behind the player, a ring flashes on the racket and a swipe picks the shot. players.commitSwing asks qte.offer(); ai.decideShot reads the result with qte.take().
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, U = HPO.util, _ = HPO.t;
  const mod = n => HPO.mod[n];
  const DUR = { attack: 4.2, defence: 3.6 };            // real seconds
  const SIN_EL = Math.sin(62 * Math.PI / 180);          // render core's QTE camera elevation
  const LABEL = { lob: 'LOB', drive: 'DRIVE', block: 'BLOCK', wall: 'GLASS', scramble: 'SCRAMBLE' };

  const Q = HPO.mod.qte = {
    enabled: false, mode: 'relaxed', open: false, armed: false, kind: null, order: null, force: null, durScale: 1, lastOrder: null, key: '', pointsSince: 9, gameUsed: 0, pending: null,
    setMode(m) { Q.mode = m === 'off' || m === 'on' || m === 'occasional' ? m : 'relaxed'; if (Q.mode === 'off') Q.armed = false; },   // relaxed = occasional frequency, no timer
    arm(v) { Q.armed = Q.mode !== 'off' && (v === undefined ? !Q.armed : !!v); return Q.armed; },

    // called by players.commitSwing; true = the QTE is (still) open for this ball, so the swing must wait
    offer(p, pl, info) {
      const G = mod('game'), M = mod('match'), R = mod('render'), Rl = mod('rules'), rp = mod('replay');
      if (!Q.enabled || Q.mode === 'off' || !G || !M || !R || !Rl || !Rl.state || !G.player || G.st !== 'playing' || p.id !== G.player.id) return false;
      const key = p.id + ':' + HPO.mod.ball.state.hitsSinceServe + ':' + Rl.state.pointNo;
      if (Q.open) return Q.key === key;
      if (Q.key === key) return false;
      if (M.phase !== 'play' || M.paused || (rp && rp.active) || info.outside || info.above) return false;
      const kind = chance(p, info);
      if (!kind || !(Q.armed && kind === 'attack') && !budgetOk()) return false;
      Q.key = key; open(kind, p, pl, info); return true;
    },
    // called by ai.decideShot once per committed shot
    take(p) { const o = Q.order; if (o && o.playerId === p.id) { Q.order = null; return o; } return null; },
    cancel() { if (Q.open) close(null, true); }
  };

  const timed = () => Q.mode !== 'relaxed';
  function budgetOk() { return Q.mode === 'on' ? Q.pointsSince >= 2 : Q.pointsSince >= 3 && Q.gameUsed < 1; }
  BUS.on('point:end', function (e) {
    Q.pointsSince++;
    if (Q.pending !== null) {
      const t = Q.pending; Q.pending = null;
      const api = mod('ui') && mod('ui').api;
      if (api && e && e.winner === 'A') api.toast(t === 'defence' ? _('Saved, and you won the point!') : _('Clean winner!'), { kind: 'good', ms: 2200 });
    }
  });
  BUS.on('game:end', function () { Q.gameUsed = 0; });
  BUS.on('point:start', function () { Q.cancel(); });
  BUS.on('shot:hit', function (e) { if (e && e.reason === 'qte') Q.pending = Q.kind || 'attack'; });

  // ---- is there a chance worth stopping the game for? ----
  function chance(p, info) {
    if (Q.force) return Q.force;                                                                          // test hook
    const P = mod('players'), ops = P.list.filter(q => q.team !== p.team), depth = Math.abs(p.pos.x), h = info.height;
    const stretch = U.clamp((info.reach - 0.8) / 0.4, 0, 1);
    if ((P.lastKind === 'smashFlat' || P.lastKind === 'smashKick') && P.now - P.lastKindAt < 3.5 && (info.slack < 0.15 || stretch > 0.5)) return 'defence';
    if (info.slack < 0.1 || stretch > 0.6) return null;
    const atNet = ops.filter(q => Math.abs(q.pos.x) < 4.5).length;
    if (h >= 1.85 && depth < 4.8) return 'attack';                                                      // overhead near the net
    if (ops.every(q => Math.abs(q.pos.x) > 6) && depth < 5.5 && h >= 0.5 && h < 1.85) return 'attack';  // both deep: open court
    if (depth < 4 && h >= 0.95 && h < 1.85 && atNet <= 1) return 'attack';                              // floating volley, a gap at the net
    return null;
  }

  // ---- overlay ----
  let ui = null, raf = 0, t0 = 0, drag = null, cur = null, ringXY = null; // ringXY: where the ring is drawn, which is what the finger aims at
  function build(api) {
    const h = api.h, NS = 'http://www.w3.org/2000/svg';
    const svg = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const ringSvg = svg('svg', { viewBox: '-60 -60 120 120', class: 'qte-ringsvg' });
    ringSvg.appendChild(svg('circle', { class: 'qte-arc', r: '52', 'stroke-dasharray': '326.7', 'stroke-dashoffset': '0', transform: 'rotate(-90)' }));
    ringSvg.appendChild(svg('circle', { class: 'qte-core', r: '30' }));
    const rays = svg('g', { class: 'qte-rays' });
    for (let i = 0; i < 12; i++) rays.appendChild(svg('line', { x1: '36', y1: '0', x2: String(i % 2 ? 46 : 54), y2: '0', transform: 'rotate(' + i * 30 + ')' }));
    ringSvg.appendChild(rays);
    const lines = svg('svg', { class: 'qte-lines' }); const ln = svg('line', { class: 'qte-ln', x1: '0', y1: '0', x2: '0', y2: '0' }); lines.appendChild(ln);
    ui = {
      root: h('div', { id: 'qte', class: 'qte', hidden: true }),
      title: h('div', { class: 'qte-title' }), help: h('div', { class: 'qte-help' }), ring: h('div', { class: 'qte-ring' }, ringSvg),
      mark: h('div', { class: 'qte-mark', hidden: true }, h('span', null)), lines: lines,
      skip: h('button', { type: 'button', class: 'qte-skip' }, _('Let it play')), ln: ln, arc: ringSvg.querySelector('.qte-arc')
    };
    ui.root.append(h('div', { class: 'qte-vig' }), lines, ui.ring, ui.mark, ui.title, ui.help, ui.skip);
    ui.skip.addEventListener('pointerdown', e => e.stopPropagation()); ui.skip.addEventListener('pointerup', e => e.stopPropagation());
    ui.skip.addEventListener('click', () => close({ skip: true }));
    api.EL.stage.appendChild(ui.root);
    ui.root.addEventListener('pointerdown', down); ui.root.addEventListener('pointermove', move);
    ui.root.addEventListener('pointerup', up); ui.root.addEventListener('pointercancel', () => { drag = null; if (ui) ui.mark.hidden = true; });
    ui.root.addEventListener('contextmenu', e => e.preventDefault());
  }

  function open(kind, p, pl, info) {
    const api = mod('ui') && mod('ui').api, R = mod('render'), M = mod('match'); if (!api || !R) return;
    if (!ui) build(api);
    cur = { kind: kind, p: p, pl: pl, info: info, side: HPO.court.sides[p.team], center: new R.THREE.Vector3(pl.p.x, 1.0, pl.p.z), cam: R.camSnapshot() };
    Q.open = true; Q.kind = kind; Q.order = null; Q.pointsSince = 0; Q.gameUsed++; Q.armed = false; drag = null;
    M.pause(true);
    R.qteYaw = cur.side * Math.PI / 2; R.setCameraMode('qte');
    ui.root.className = 'qte ' + kind; ui.root.hidden = false; ui.mark.hidden = true; ui.ln.setAttribute('x2', '0'); ui.ln.setAttribute('y2', '0');
    ui.title.textContent = kind === 'defence' ? _('SAVE IT!') : (info.height >= 1.85 ? _('SMASH IT!') : _('FINISH IT!'));
    const nt = timed() ? '' : _(' (no timer)');
    ui.help.textContent = (kind === 'defence' ? _('Swipe from the ring: up slow = lob, up fast = drive, up-left/right = block, sideways = glass, down = scramble') : _('Swipe from the ring to aim. Longer and faster means harder and deeper')) + nt;
    api.EL.app.classList.add('qte-on');
    try { if (mod('audio') && mod('audio').sting) mod('audio').sting(); if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate([40, 30, 40]); } catch (e) { /* optional */ }
    t0 = performance.now(); placeRing(); raf = requestAnimationFrame(loop);
  }

  function close(order, aborted) {
    if (!Q.open) return;
    cancelAnimationFrame(raf); raf = 0; Q.open = false;
    const R = mod('render'), M = mod('match'), api = mod('ui') && mod('ui').api;
    Q.order = aborted ? null : Object.assign({ playerId: cur.p.id }, order || { mishit: true }); Q.lastOrder = Q.order;
    if (ui) { ui.root.hidden = true; ui.mark.hidden = true; }
    if (api) api.EL.app.classList.remove('qte-on');
    if (R && cur) R.camRestore(cur.cam);
    if (M) M.pause(false);
    if (!aborted && api) { if (Q.order.skip) { /* nothing to say */ } else if (Q.order.mishit) api.toast(_('Too slow: mishit!'), { kind: 'warn', ms: 1800 }); else if (Q.order.label) api.toast(_(Q.order.label), { kind: 'info', ms: 1200 }); }
    drag = null; cur = null;
  }

  function stagePt(e) { const r = ui.root.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function ringPos() { const R = mod('render'), s = R.project(cur.center); return { x: s.x, y: s.y }; }

  function placeRing() { const c = ringXY = ringPos(); ui.ring.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px)'; }
  function loop(now) {
    if (!Q.open) return;
    const el = (now - t0) / 1000, dur = DUR[cur.kind] * Q.durScale;
    placeRing();
    ui.arc.setAttribute('stroke-dashoffset', timed() ? (326.7 * U.clamp(el / dur, 0, 1)).toFixed(1) : '0');
    if (drag && drag.ring) preview();
    if (timed() && el >= dur) { close(null); return; }
    raf = requestAnimationFrame(loop);
  }

  // ---- input ----
  function down(e) {
    if (!Q.open) return; e.preventDefault();
    try { ui.root.setPointerCapture(e.pointerId); } catch (x) { /* synthetic events */ }
    const p = stagePt(e), c = ringXY || ringPos();
    drag = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, t: performance.now(), ring: Math.hypot(p.x - c.x, p.y - c.y) <= 84, cx: c.x, cy: c.y };
  }
  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = stagePt(e); drag.x = p.x; drag.y = p.y; if (drag.ring) preview();
  }
  function up(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag, p = stagePt(e); drag = null; ui.mark.hidden = true; ui.ln.setAttribute('x2', '0'); ui.ln.setAttribute('y2', '0');
    const vx = p.x - d.cx, vy = p.y - d.cy, len = Math.hypot(p.x - d.x0, p.y - d.y0), dt = Math.max(30, performance.now() - d.t), q = timed() ? 1 - U.clamp((performance.now() - t0) / 1000 / (DUR[cur.kind] * Q.durScale), 0, 1) : 0.5;
    if (d.ring && len >= 28) close(orderFor(p.x - d.x0, p.y - d.y0, len / dt, len, q));
    else if (!d.ring && len < 12) { const o = tapOrder(e, q); if (o) close(o); }
  }
  function preview() {
    const dx = drag.x - drag.x0, dy = drag.y - drag.y0, len = Math.hypot(dx, dy); if (len < 10) { ui.mark.hidden = true; return; }
    const o = orderFor(dx, dy, len / Math.max(30, performance.now() - drag.t), len, 1), R = mod('render');
    const s = R.project(new R.THREE.Vector3(o.target.x, 0.05, o.target.z));
    ui.mark.hidden = false; ui.mark.style.transform = 'translate(' + s.x.toFixed(1) + 'px,' + s.y.toFixed(1) + 'px)'; ui.mark.firstChild.textContent = o.label ? _(o.label) : '';
    ui.ln.setAttribute('x1', drag.cx.toFixed(1)); ui.ln.setAttribute('y1', drag.cy.toFixed(1)); ui.ln.setAttribute('x2', s.x.toFixed(1)); ui.ln.setAttribute('y2', s.y.toFixed(1));
  }

  // ---- swipe -> order ----
  function basis() { const y = cur.side * Math.PI / 2; return { fwd: { x: -Math.sin(y), z: -Math.cos(y) }, right: { x: Math.cos(y), z: -Math.sin(y) }, ox: -cur.side }; }
  const clampTarget = (t, ox) => ({ x: ox * U.clamp(t.x * ox, 0.8, 9.3), z: U.clamp(t.z, -4.7, 4.7) });
  function orderFor(dx, dy, speed, len, q) {
    const b = basis(), H = ui.root.clientHeight || 600, spd = U.clamp(speed / 1.4, 0, 1), lenN = U.clamp(len / (0.38 * H), 0, 1), power = 0.6 * lenN + 0.4 * spd;
    const qual = 1.0 - 0.25 * q, p0 = cur.pl.p;
    if (cur.kind === 'attack') {
      let f = -dy / SIN_EL, l = dx; const n = Math.hypot(f, l) || 1; f /= n; l /= n;
      if (f < 0.2) { f = 0.2; const m = Math.hypot(f, l); f /= m; l /= m; }               // always into their court
      const D = 4.5 + 10.5 * power;
      const t = clampTarget({ x: p0.x + (b.fwd.x * f + b.right.x * l) * D, z: p0.z + (b.fwd.z * f + b.right.z * l) * D }, b.ox);
      return { target: t, effort: 0.5 + 0.48 * power, errMul: U.clamp((0.85 + 0.3 * Math.max(0, power - 0.65)) * qual, 0.6, 1.4), label: power > 0.75 ? 'POWER' : power < 0.3 ? 'TOUCH' : '', power: power };
    }
    // defence: the gesture picks the save
    const ang = Math.atan2(dx, -dy) * 180 / Math.PI, aa = Math.abs(ang), zs = dx >= 0 ? b.right.z : -b.right.z, lat = b.right.z * Math.sin(ang * Math.PI / 180);
    let g, t, effort, em;
    if (aa <= 35) { g = spd >= 0.55 ? 'drive' : 'lob'; t = { x: b.ox * (g === 'drive' ? 8.6 : 8.0), z: lat * 3.5 }; effort = g === 'drive' ? 0.8 : 0.4; em = g === 'drive' ? 1.1 : 0.9; }
    else if (aa <= 80) { g = 'block'; t = { x: b.ox * 2.6, z: zs * 2.6 }; effort = 0.35; em = 1.0; }
    else if (aa <= 135) { g = 'wall'; t = { x: b.ox * 7.2, z: zs * 4.3 }; effort = 0.55; em = 1.1; }
    else { g = 'scramble'; t = { x: b.ox * 7.5, z: 0 }; effort = 0.4; em = 0.7; }
    return { gesture: g, label: LABEL[g], target: clampTarget(t, b.ox), effort: effort, errMul: U.clamp(em * qual, 0.6, 1.4) };
  }
  function tapOrder(e, q) { // plain click or tap on the court: a medium shot there (attack) or the safe lob (defence)
    const R = mod('render'), b = basis(), qual = 1.0 - 0.25 * q;
    if (cur.kind === 'defence') return { gesture: 'lob', label: 'LOB', target: clampTarget({ x: b.ox * 8, z: 0 }, b.ox), effort: 0.4, errMul: 0.9 * qual };
    const h = R.pickCourt(e.clientX, e.clientY);
    if (!h) return null;
    return { target: clampTarget(h, b.ox), effort: 0.7, errMul: qual, label: 'TAP' };
  }
})(HPO);
