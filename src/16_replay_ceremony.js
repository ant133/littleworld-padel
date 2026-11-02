// Replay (ring buffer + ghost playback for Eagle Eye challenges and highlights) and Ceremony (choreographed match phases).
// Registers HPO.mod.replay and HPO.mod.ceremony. Presentation only: never writes sim state except scripted player intents/anim during ceremony phases.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, S = HPO.sched, TAU = Math.PI * 2;
  const clamp = U.clamp;
  let T3 = null;
  const RN = () => HPO.mod.render, MT = () => HPO.mod.match, PL = () => HPO.mod.players;
  const grp = n => { const r = RN(); return r && r.groups && r.groups[n] || null; };
  const crowd = () => HPO.mod.crowd, fx = () => HPO.mod.fx;
  const skipped = () => { const m = MT(); return !!(m && m.skip) || CM.skipping; };
  const title = () => (HPO.cfg.TITLE ? HPO.cfg.TITLE() : 'Padel Cup');
  const srng = HPO.makeRng(31337);

  function noAlpha(m, additive) {
    m.transparent = true; m.depthWrite = false;
    m.blending = T3.CustomBlending; m.blendEquation = T3.AddEquation; m.blendSrc = T3.SrcAlphaFactor; m.blendDst = additive ? T3.OneFactor : T3.OneMinusSrcAlphaFactor;
    m.blendEquationAlpha = T3.AddEquation; m.blendSrcAlpha = T3.ZeroFactor; m.blendDstAlpha = T3.OneFactor; return m;
  }
  function canvasTex(w, h, draw) {
    const r = RN(); if (r && r.canvasTex) return r.canvasTex(w, h, draw);
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.magFilter = T3.NearestFilter; t.minFilter = T3.NearestFilter; t.generateMipmaps = false; return t;
  }
  const mat = (hex, o) => { const r = RN(); return r && r.mat ? r.mat(hex, o) : new T3.MeshLambertMaterial({ color: hex }); };
  function say(text, voice) {
    BUS.emit('speak', { text: text, voice: voice || 'umpire', priority: 2 });
    const ui = HPO.mod.ui; if (ui && ui.feed) { try { ui.feed({ text: text, icon: voice === 'commentator' ? 'mic' : 'whistle', key: true, kind: 'umpire' }); } catch (e) { /* optional */ } }
  }

  // ---------------------------------------------------------------- DOM overlays (banner / replay badge / verdict)
  const DOM = { root: null, banner: null, badge: null, verdict: null, bars: null, bt: 0 };
  function domInit() {
    if (DOM.root || typeof document === 'undefined') return;
    const r = RN(), cont = (r && r.container) || document.getElementById('stage'); if (!cont) return;
    const root = DOM.root = document.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden;font-family:Manrope,system-ui,sans-serif';
    const mk = (css, parent) => { const d = document.createElement('div'); d.style.cssText = css; d.hidden = true; (parent || root).appendChild(d); return d; };
    DOM.banner = mk('position:absolute;left:50%;top:14%;transform:translateX(-50%);background:#fffaf0;color:#123954;border:2px solid #123954;box-shadow:6px 7px 0 #1264992e;padding:10px 22px;text-align:center;font-weight:800;letter-spacing:-.03em;font-size:clamp(16px,3.2vw,30px);max-width:86%');
    DOM.badge = mk('position:absolute;left:14px;bottom:9%;background:#e5484d;color:#fff;font-weight:800;font-size:13px;letter-spacing:.2em;padding:5px 10px;border:2px solid #123954');
    DOM.verdict = mk('position:absolute;left:50%;top:22%;transform:translateX(-50%);color:#fff;font-weight:800;font-size:clamp(40px,9vw,92px);letter-spacing:-.04em;text-shadow:4px 5px 0 #123954;padding:0 18px');
    DOM.bars = mk('position:absolute;inset:0;box-shadow:inset 0 0 0 9999px transparent');
    DOM.bars.style.cssText = 'position:absolute;left:0;right:0;top:0;height:5%;background:#0b1a2a;opacity:.85';
    DOM.bars2 = mk('position:absolute;left:0;right:0;bottom:0;height:5%;background:#0b1a2a;opacity:.85');
    cont.appendChild(root);
  }
  function banner(text, sub, ms) {
    domInit(); if (!DOM.banner) return;
    DOM.banner.innerHTML = ''; const a = document.createElement('div'); a.textContent = text; DOM.banner.appendChild(a);
    if (sub) { const b = document.createElement('div'); b.textContent = sub; b.style.cssText = 'font-size:.45em;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#177dc5;margin-top:4px'; DOM.banner.appendChild(b); }
    DOM.banner.hidden = false; DOM.bt = ms ? ms / 1000 : 0;
  }
  function hideBanner() { if (DOM.banner) DOM.banner.hidden = true; DOM.bt = 0; }

  // ---------------------------------------------------------------- camera helpers
  const cam = { saved: null };
  function camSave() { const r = RN(); if (r && !cam.saved) cam.saved = { mode: r.cameraMode, zoom: r.view && r.view.zoom, followId: r.followId }; }
  function camRestore() {
    const r = RN(), s = cam.saved; cam.saved = null; if (!r || !s) return;
    try { if (r.followPlayer) r.followPlayer(null); r.setCameraMode(s.mode || 'club'); if (r.view && s.zoom && s.mode !== 'free') r.view.zoom = s.zoom; } catch (e) { U.logError('cam.restore', e); }
  }
  function camFocus(x, z, half, y) { // half = visible half-height in metres
    const r = RN(); if (!r || !r.view) return;
    camSave(); if (r.cameraMode !== 'free') r.setCameraMode('free');
    r.view.tTarget.set(x, y || 0, z); if (half) r.view.zoom = Math.max(0.5, (r.view.freeBase || 30) / half);
  }

  // =====================================================================================
  // REPLAY
  // =====================================================================================
  const STRIDE = 45, NF = 1200;
  const RB = { buf: new Float32Array(STRIDE * NF), head: 0, count: 0, lastT: -1, ids: [], clips: ['idle'], wrapped: false };
  const RS = { init: false, hooked: false, ghostGroup: null, ghosts: null, gball: null, gshadow: null, trail: null, marker: null, line: null, label: null, pulse: null, active: null, lastHL: -999, clock: 0, t: -1,
    lastChallenge: null, pointStartT: 0, wallStreak: 0, maxWall: 0, wrapTick: false };
  function clipId(n) { let i = RB.clips.indexOf(n); if (i < 0) { RB.clips.push(n); i = RB.clips.length - 1; } return i; }
  function frameT(k) { return RB.buf[((RB.head - RB.count + k + NF) % NF) * STRIDE]; }

  function record() {
    const P = PL(), B = HPO.mod.ball; if (!RS.init || !P || !B || !P.list || P.list.length < 4) return;
    const t = P.now; if (t < RB.lastT - 1e-6) { RB.head = 0; RB.count = 0; }
    if (RB.ids.length !== P.list.length || RB.ids[0] !== P.list[0].id) { RB.ids = P.list.map(p => p.id); RB.head = 0; RB.count = 0; }
    RB.lastT = t;
    const o = RB.head * STRIDE, b = RB.buf, bs = B.state;
    b[o] = t; b[o + 1] = bs.p.x; b[o + 2] = bs.p.y; b[o + 3] = bs.p.z; b[o + 4] = bs.state === 'live' ? 1 : bs.state === 'held' ? 2 : 0;
    for (let i = 0; i < 4; i++) {
      const p = P.list[i], q = o + 5 + i * 10, sw = p.swing;
      b[q] = p.pos.x; b[q + 1] = p.pos.z; b[q + 2] = p.heading; b[q + 3] = p.speed || 0; b[q + 4] = clipId(p.anim.clip); b[q + 5] = p.anim.t || 0;
      b[q + 6] = sw && sw.clip ? clipId(sw.clip) : -1; b[q + 7] = sw ? sw.start || 0 : 0; b[q + 8] = sw ? sw.tc || 0 : 0; b[q + 9] = sw && sw.fh === false ? 0 : 1;
    }
    RB.head = (RB.head + 1) % NF; if (RB.count < NF) RB.count++;
  }
  function frameIndexFor(t) { // largest k with frameT(k) <= t
    let lo = 0, hi = RB.count - 1; if (hi < 0) return -1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (frameT(m) <= t) lo = m; else hi = m - 1; }
    return lo;
  }
  function wrapTick() {
    const m = MT(); if (!m || m.__replayWrapped || !m.tick) return;
    const orig = m.tick; m.__replayWrapped = true;
    m.tick = function (dt) { orig.call(m, dt); if (RS.init && !(m.cfg && m.cfg.fast)) record(); };
  }

  function ensureGhosts() {
    if (RS.ghosts) return;
    const G = RS.ghostGroup = new T3.Group(); G.name = 'replayGhosts'; G.visible = false; grp('fx').add(G);
    // ball + shadow + trail
    const core = new T3.Mesh(new T3.SphereGeometry(0.1, 10, 8), new T3.MeshLambertMaterial({ color: 0xd8f24a, emissive: 0x3a4a08 }));
    const shell = new T3.Mesh(new T3.SphereGeometry(0.118, 10, 8), new T3.MeshBasicMaterial({ color: 0x24310d, side: T3.BackSide }));
    RS.gball = new T3.Group(); RS.gball.add(shell, core); G.add(RS.gball);
    const sg = new T3.CircleGeometry(1, 12); sg.rotateX(-Math.PI / 2);
    RS.gshadow = new T3.Mesh(sg, noAlpha(new T3.MeshBasicMaterial({ color: 0x000000, opacity: 0.4 }))); RS.gshadow.renderOrder = 2; G.add(RS.gshadow);
    RS.trail = new T3.InstancedMesh(new T3.SphereGeometry(0.05, 5, 4), new T3.MeshBasicMaterial({ color: 0xeaf59a }), 24); RS.trail.frustumCulled = false; G.add(RS.trail);
    // challenge markers
    RS.marker = new T3.Mesh(new T3.RingGeometry(0.2, 0.3, 24), noAlpha(new T3.MeshBasicMaterial({ color: 0x2fb26b, opacity: 0.95, side: T3.DoubleSide }))); RS.marker.rotation.x = -Math.PI / 2; RS.marker.position.y = 0.04; RS.marker.visible = false; RS.marker.renderOrder = 5; G.add(RS.marker);
    RS.pulse = new T3.Mesh(new T3.SphereGeometry(0.1, 10, 8), noAlpha(new T3.MeshBasicMaterial({ color: 0xfff4b3, opacity: 0.75 }))); RS.pulse.visible = false; RS.pulse.renderOrder = 6; G.add(RS.pulse);
    RS.line = new T3.Mesh(new T3.BoxGeometry(1, 0.03, 0.16), noAlpha(new T3.MeshBasicMaterial({ color: 0xfff4b3, opacity: 0.85 }))); RS.line.visible = false; RS.line.renderOrder = 4; G.add(RS.line);
    const lt = canvasTex(160, 56, function (g, w, h) { g.clearRect(0, 0, w, h); }); lt.needsUpdate = true;
    RS.label = new T3.Sprite(new T3.SpriteMaterial({ map: lt, transparent: true, depthTest: false })); RS.label.scale.set(3.2, 1.12, 1); RS.label.visible = false; RS.label.renderOrder = 30; G.add(RS.label);
    RS.ghosts = [];
  }
  function makeFallbackFigure(look) {
    const g = new T3.Group(), oc = look && look.outfit ? look.outfit[0] : 0x1e6bd6;
    const b = (w, h, d, x, y, z, hex) => { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), new T3.MeshLambertMaterial({ color: hex })); m.position.set(x, y, z); g.add(m); return m; };
    b(0.4, 0.6, 0.25, 0, 1.15, 0, oc); b(0.26, 0.26, 0.26, 0, 1.6, 0, 0xe8b48a); b(0.16, 0.8, 0.16, -0.12, 0.4, 0, 0x222a3a); b(0.16, 0.8, 0.16, 0.12, 0.4, 0, 0x222a3a); b(0.1, 0.5, 0.1, 0.3, 1.15, 0.1, oc); b(0.3, 0.04, 0.3, 0.34, 1.0, 0.3, 0xdddddd);
    return { root: g, heading: 0, fallback: true, update() {}, setLookAt() {}, setPose() {}, beginClip() {}, setClipTime() {}, setHitTarget() {} };
  }
  function ghostFor(i) {
    if (RS.ghosts[i]) return RS.ghosts[i];
    const P = PL(), p = P.list[i], rg = HPO.mod.rigs; let rig = null;
    try { if (rg && rg.create) rig = rg.create(p); } catch (e) { U.logError('replay.ghost', e); }
    if (!rig || !rig.root) rig = makeFallbackFigure(p.def && p.def.look);
    RS.ghostGroup.add(rig.root);
    const g = { rig: rig, px: p.pos.x, pz: p.pos.z, act: null, lastClip: null }; RS.ghosts[i] = g; return g;
  }
  const NEAR_LINES = (function () {
    const L = [];
    [-5, 5].forEach(z => L.push({ x0: -10, x1: 10, z0: z, z1: z, name: 'side line' }));
    [-10, 10].forEach(x => L.push({ x0: x, x1: x, z0: -5, z1: 5, name: 'back line' }));
    [-6.95, 6.95].forEach(x => L.push({ x0: x, x1: x, z0: -5, z1: 5, name: 'service line' }));
    L.push({ x0: -6.95, x1: 6.95, z0: 0, z1: 0, name: 'centre line' });
    return L;
  })();
  function nearestLine(p) {
    let best = null, bd = 1e9;
    NEAR_LINES.forEach(function (l) {
      const dx = l.x1 - l.x0, dz = l.z1 - l.z0, L2 = dx * dx + dz * dz, t = clamp(((p.x - l.x0) * dx + (p.z - l.z0) * dz) / L2, 0, 1);
      const d = Math.hypot(p.x - (l.x0 + dx * t), p.z - (l.z0 + dz * t)); if (d < bd) { bd = d; best = l; }
    });
    return best ? { line: best, dist: bd } : null;
  }
  function labelTex(text, verdict) {
    const tex = canvasTex(160, 56, function (g, w, h) {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#123954'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = verdict === 'OUT' ? '#e5484d' : '#2fb26b'; g.fillRect(6, 6, 52, h - 12);
      g.fillStyle = '#fff'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(verdict, 32, h / 2 + 1);
      g.fillStyle = '#123954'; g.font = 'bold 24px Arial, sans-serif'; g.fillText(text, 110, h / 2 + 1);
    });
    tex.needsUpdate = true; return tex;
  }

  const replay = HPO.mod.replay = {
    active: false, enabled: true, kind: null,
    init(ctx) {
      T3 = (ctx && ctx.THREE) || window.THREE; const r = RN();
      if (!T3 || !r || !r.groups || !r.groups.fx) return;
      RS.init = true; wrapTick(); hookReplay();
    },
    record: record,
    available() { return RB.count; },
    stop() { if (RS.active) endReplay(true); },
    play(o) {
      o = o || {}; if (!RS.init || replay.active || !PL() || RB.count < 20) return false;
      const m = MT(); if (m && m.cfg && m.cfg.fast) return false;
      try { return startReplay(o); } catch (e) { U.logError('replay.play', e); endReplay(true); return false; }
    },
    update(dt, t) {
      if (!RS.init) return;
      if (t !== undefined && t === RS.t) return; RS.t = t === undefined ? -1 : t;
      dt = Math.min(dt || 0.016, 0.1); RS.clock += dt;
      if (!RB.count && MT() && MT().advance) wrapTick();
      if (RS.active) stepReplay(dt);
    }
  };

  function startReplay(o) {
    const P = PL(), m = MT(), r = RN(), kind = o.kind === 'highlight' ? 'highlight' : 'challenge';
    ensureGhosts();
    const tEnd = frameT(RB.count - 1), tStart = frameT(0);
    let from, to, tb = null, info = null;
    if (kind === 'challenge') {
      const lc = RS.lastChallenge && RS.clock - RS.lastChallenge.at < 6 ? RS.lastChallenge : null;
      let p = lc ? lc.p : null, call = lc ? lc.call : null, over = lc ? lc.overturned : false;
      const rl = HPO.mod.rules, lb = rl && rl.lastBounces ? rl.lastBounces() : [];
      if (!p && lb.length) { p = lb[lb.length - 1].p; call = lb[lb.length - 1].call; }
      if (o.close && o.close.x !== undefined) p = { x: o.close.x, z: o.close.z };
      if (!p) return false;
      // bounce time = frame where the ball is nearest the floor point
      let bk = -1, bd = 1e9;
      for (let k = Math.max(0, RB.count - 600); k < RB.count; k++) {
        const q = ((RB.head - RB.count + k + NF) % NF) * STRIDE, d = Math.hypot(RB.buf[q + 1] - p.x, RB.buf[q + 3] - p.z) + Math.max(0, RB.buf[q + 2] - 0.15) * 2;
        if (d < bd) { bd = d; bk = k; }
      }
      if (bk < 0) return false;
      tb = frameT(bk); from = Math.max(tStart, tb - 2.0); to = Math.min(tEnd, tb + 0.9);
      const fin = call ? (over ? (call === 'in' ? 'out' : 'in') : call) : null;
      let margin = null;
      for (let i = 0; i < lb.length; i++) if (lb[i].p && Math.hypot(lb[i].p.x - p.x, lb[i].p.z - p.z) < 0.35 && lb[i].marginCm !== undefined) margin = lb[i].marginCm;
      const nl = nearestLine(p); if (margin === null && nl) margin = Math.max(0, nl.dist * 100 - 2.5);
      info = { p: p, verdict: fin ? fin.toUpperCase() : (nl && nl.dist < 0.03 ? 'IN' : 'OUT'), margin: margin, nl: nl, overturned: over, call: call };
    } else {
      to = tEnd; from = Math.max(tStart, to - clamp(o.span || (to - RS.pointStartT) + 0.5, 3, 9));
      if (o.from !== undefined) from = Math.max(tStart, o.from); if (o.to !== undefined) to = Math.min(tEnd, o.to);
      tb = to - 0.5;
    }
    const act = RS.active = { kind: kind, from: from, to: to, tp: from, tb: tb, info: info, slow: o.speed > 0 ? o.speed : (kind === 'challenge' ? 0.22 : 0.35), real: 0, hold: 0, phase: 'play', pausedBy: false, prevActors: true, trailRing: [], lastTrail: -9 };
    replay.active = true; replay.kind = kind;
    if (m && !m.paused) { m.pause(true); act.pausedBy = true; }
    const ag = grp('actors'); if (ag) { act.prevActors = ag.visible; ag.visible = false; }
    RS.ghostGroup.visible = true;
    P.list.forEach(function (p, i) { const g = ghostFor(i); g.rig.root.visible = true; g.lastClip = null; g.act = null; });
    domInit(); if (DOM.badge) { DOM.badge.textContent = kind === 'challenge' ? 'EAGLE EYE REPLAY' : 'REPLAY'; DOM.badge.hidden = false; DOM.bars.hidden = false; DOM.bars2.hidden = false; }
    camSave();
    if (kind === 'challenge' && info) {
      camFocus(info.p.x, info.p.z, 4.8, 0.5);
      const ok = info.verdict === 'IN', col = ok ? 0x2fb26b : 0xe5484d;
      RS.marker.material.color.setHex(col); RS.marker.position.set(info.p.x, 0.04, info.p.z); RS.marker.visible = false;
      RS.pulse.position.set(info.p.x, 0.1, info.p.z); RS.pulse.visible = false;
      if (info.nl) {
        const l = info.nl.line; RS.line.position.set((l.x0 + l.x1) / 2, 0.05, (l.z0 + l.z1) / 2); RS.line.scale.set(Math.max(0.16, Math.abs(l.x1 - l.x0)) , 1, l.x1 === l.x0 ? 1 : 1);
        RS.line.rotation.y = l.x1 === l.x0 ? Math.PI / 2 : 0; RS.line.scale.x = Math.max(Math.abs(l.x1 - l.x0), Math.abs(l.z1 - l.z0));
        RS.line.visible = false;
      }
      if (RS.label.material.map) RS.label.material.map.dispose();
      RS.label.material.map = labelTex(info.margin !== null ? info.margin.toFixed(1) + ' cm' : '', info.verdict); RS.label.material.needsUpdate = true;
      RS.label.position.set(info.p.x, 1.6, info.p.z); RS.label.visible = false;
    } else if (r && r.setCameraMode) { r.setCameraMode('follow'); if (r.setFollowBall) r.setFollowBall(true); }
    BUS.emit('replay:start', { kind: kind });
    stepReplay(0);
    return true;
  }

  function sampleFrame(tp, out) {
    const k = frameIndexFor(tp); if (k < 0) return false;
    const k2 = Math.min(RB.count - 1, k + 1), t0 = frameT(k), t1 = frameT(k2), a = t1 > t0 ? clamp((tp - t0) / (t1 - t0), 0, 1) : 0;
    const q0 = ((RB.head - RB.count + k + NF) % NF) * STRIDE, q1 = ((RB.head - RB.count + k2 + NF) % NF) * STRIDE, b = RB.buf;
    out.q0 = q0; out.q1 = q1; out.a = a; return true;
  }
  const SF = { q0: 0, q1: 0, a: 0 };
  function stepReplay(dt) {
    const A = RS.active; if (!A) return;
    A.real += dt;
    const fast = 1.0;
    if (A.phase === 'play') {
      const near = Math.abs(A.tp - A.tb);
      let spd = A.kind === 'challenge' ? (near < 0.45 ? A.slow : near < 0.9 ? A.slow + (fast - A.slow) * (near - 0.45) / 0.45 : 0.8) : (A.tp > A.to - 1.6 ? A.slow : 0.9);
      A.spd = spd; A.tp += dt * spd;
      if (A.tp >= A.to) { A.tp = A.to; A.phase = 'hold'; A.hold = 0; }
    } else { A.hold += dt; A.spd = 0; }
    const showAfter = A.kind === 'challenge' && A.info && (A.phase === 'hold' || A.tp >= A.tb - 0.15);
    renderGhosts(A, dt);
    if (A.kind === 'challenge' && A.info) {
      const pul = 1 + 0.25 * Math.sin(A.real * 9);
      RS.marker.visible = showAfter; RS.pulse.visible = showAfter; RS.line.visible = showAfter; RS.label.visible = showAfter;
      RS.marker.scale.setScalar(pul * 1.1); RS.pulse.scale.setScalar(pul); RS.line.material.opacity = 0.55 + 0.35 * Math.sin(A.real * 7);
      if (showAfter && DOM.verdict && DOM.verdict.hidden) { DOM.verdict.textContent = A.info.verdict; DOM.verdict.style.background = A.info.verdict === 'IN' ? '#2fb26b' : '#e5484d'; DOM.verdict.hidden = false; }
    }
    const holdMax = A.kind === 'challenge' ? 2.4 : 0.5;
    if ((A.phase === 'hold' && A.hold > holdMax) || A.real > 22) endReplay(false);
  }
  function renderGhosts(A, dt) {
    const P = PL(), rg = HPO.mod.rigs, CL = rg && rg.CLIPS ? rg.CLIPS : {};
    if (!sampleFrame(A.tp, SF)) return;
    const b = RB.buf, a = SF.a, q0 = SF.q0, q1 = SF.q1, L = (i) => b[q0 + i] + (b[q1 + i] - b[q0 + i]) * a;
    // ball
    const by = Math.max(0.1, L(2));
    RS.gball.position.set(L(1), by, L(3)); RS.gball.visible = b[q0 + 4] !== 0 || by > 0.12;
    RS.gshadow.position.set(L(1), 0.03, L(3)); const sr = 0.13 + 0.012 * Math.min(4, by); RS.gshadow.scale.set(sr, 1, sr);
    // trail from recorded frames behind tp
    const ring = A.trailRing; if (A.tp - A.lastTrail > 0.02) { A.lastTrail = A.tp; ring.push(L(1), by, L(3), A.tp); if (ring.length > 24 * 4) ring.splice(0, 4); }
    const tm = RS.trail, dm = RS.__d || (RS.__d = new T3.Object3D());
    for (let i = 0; i < 24; i++) {
      const k = ring.length / 4 - 1 - i;
      if (k < 0) dm.scale.setScalar(0); else { const age = A.tp - ring[k * 4 + 3], f = age > 0.5 ? 0 : 1 - age / 0.5; dm.position.set(ring[k * 4], ring[k * 4 + 1], ring[k * 4 + 2]); dm.scale.setScalar(f * 0.85); }
      dm.updateMatrix(); tm.setMatrixAt(i, dm.matrix);
    }
    tm.instanceMatrix.needsUpdate = true;
    // players
    const simDt = dt * (A.spd || 0);
    for (let i = 0; i < 4 && i < P.list.length; i++) {
      const g = ghostFor(i), rig = g.rig, o = 5 + i * 10, x = L(o), z = L(o + 1);
      let hd = b[q0 + o + 2]; const h1 = b[q1 + o + 2]; let dh = h1 - hd; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); hd += dh * a;
      rig.root.position.set(x, 0, z); rig.root.rotation.y = -hd; rig.heading = hd;
      const sp = L(o + 3), dist = Math.hypot(x - g.px, z - g.pz); g.px = x; g.pz = z;
      if (rig.fallback) continue;
      const c = rig.ctx; if (c) { c.vf = sp; c.vl = 0; c.speed = sp; if (dist < 1) c.phase = (c.phase + dist / (0.9 + 0.55 * Math.max(0.3, sp)) * TAU) % (TAU * 64); }
      const swId = b[q0 + o + 6], swS = b[q0 + o + 7], swTc = b[q0 + o + 8];
      let handled = false;
      if (swId >= 0 && RB.clips[swId] && CL[RB.clips[swId]]) {
        const def = CL[RB.clips[swId]], u = A.tp < swTc ? def.contact - (swTc - A.tp) : def.contact + (A.tp - swTc);
        if (u >= -0.03 && u <= def.dur) {
          if (g.act !== def) { rig.beginClip(def, b[q0 + o + 9] !== 0, 0.08); g.act = def; g.lastClip = null; }
          rig.setClipTime(u); handled = true;
        } else g.act = null;
      } else g.act = null;
      if (!handled) {
        const name = RB.clips[b[q0 + o + 4]] || 'idle', def = CL[name] || CL.idle;
        if (def) {
          if (g.lastClip !== name || rig.clip !== def) { rig.beginClip(def, true, 0.1); g.lastClip = name; }
          if (['idle', 'walk', 'jog', 'sprint', 'shuffle', 'turnRetreat'].indexOf(name) >= 0) { rig.driven = false; rig.rate = 1; } else rig.setClipTime(L(o + 5));
        }
      }
      rig.update(dt, simDt);
    }
  }
  function endReplay(abort) {
    const A = RS.active; if (!A) { replay.active = false; return; }
    RS.active = null;
    const m = MT(), ag = grp('actors');
    if (ag) ag.visible = true;
    if (RS.ghostGroup) RS.ghostGroup.visible = false;
    [RS.marker, RS.pulse, RS.line, RS.label].forEach(o => { if (o) o.visible = false; });
    if (DOM.badge) { DOM.badge.hidden = true; DOM.verdict.hidden = true; DOM.bars.hidden = true; DOM.bars2.hidden = true; }
    camRestore();
    if (A.pausedBy && m) m.pause(false);
    if (A.kind === 'highlight') RS.lastHL = RS.clock;
    replay.active = false; replay.kind = null;
    BUS.emit('replay:end', { kind: A.kind });
  }

  function hookReplay() {
    if (RS.hooked) return; RS.hooked = true;
    BUS.on('match:new', function () { RB.head = 0; RB.count = 0; RB.lastT = -1; if (RS.active) endReplay(true); RS.lastHL = -999; });
    BUS.on('point:start', function (e) { if (e && e.retry) return; const P = PL(); RS.pointStartT = P ? P.now : 0; RS.wallStreak = 0; RS.maxWall = 0; });
    BUS.on('shot:hit', function (e) { if (!e) return; if (e.afterWall && e.shot !== 'serve') { RS.wallStreak++; if (RS.wallStreak > RS.maxWall) RS.maxWall = RS.wallStreak; } else RS.wallStreak = 0; });
    BUS.on('challenge:result', function (e) { RS.lastChallenge = { p: e && e.p, call: e && e.call, overturned: !!(e && e.overturned), team: e && e.team, at: RS.clock }; });
    BUS.on('point:end', function (e) {
      if (!e || !replay.enabled || replay.active) return;
      const m = MT(); if (!m || !m.cfg || m.cfg.fast || m.speed > 2 || m.phase !== 'play') return;
      if (RS.clock - RS.lastHL < 90) return;
      const last = (e.shotKinds && e.shotKinds[e.shotKinds.length - 1]) || '';
      const spectacular = (e.rallyLen || 0) >= 18 || (e.kind === 'winner' && last.indexOf('smash') === 0) || RS.maxWall >= 3;
      if (!spectacular) return;
      RS.hlWant = RS.clock + 1.1; // let the crowd react first
    });
    BUS.on('match:phase', function (e) { if (e && e.phase !== 'play') RS.hlWant = 0; });
  }
  const _upd = replay.update;
  replay.update = function (dt, t) {
    _upd(dt, t);
    if (RS.hlWant && RS.clock >= RS.hlWant) { RS.hlWant = 0; const m = MT(); if (m && m.phase === 'play' && m.speed <= 2 && !replay.active) replay.play({ kind: 'highlight' }); }
  };

  // =====================================================================================
  // CEREMONY
  // =====================================================================================
  const CM = { skipping: false, driver: null, podium: null, trophy: null, coin: null, lift: {}, medals: [], active: false, sweep: 0, prevCrowd: null, t: -1 };

  function ensureDriver() {
    if (CM.driver && !CM.driver.done) return;
    CM.driver = S.start(function* () {
      for (;;) {
        yield S.wait(0);
        const P = PL(); if (!P) return;
        let any = false;
        P.list.forEach(function (p) {
          if (!p._cm || !p._cm.walk) return; any = true;
          const clip = p.speed < 0.3 ? 'idle' : p.speed < 2.7 ? 'walk' : 'jog';
          if (p.anim.clip !== clip) p.anim = { clip: clip, t: 0, rate: 1 };
        });
        if (!any && !CM.active) return;
      }
    }, 'cmDriver');
  }
  function stand(p, clip, face) {
    p._cm = { walk: false }; p.intent = { type: 'hold', face: face === undefined ? p.heading : face };
    if (p.anim.clip !== clip) p.anim = { clip: clip, t: 0, rate: 1 };
  }
  function* walkPath(p, pts, cap, face, clipAfter) {
    for (let i = 0; i < pts.length; i++) {
      if (skipped()) return;
      const pt = pts[i], hd = Math.atan2(pt.z - p.pos.z, pt.x - p.pos.x);
      p._cm = { walk: true }; p.intent = { type: 'move', x: pt.x, z: pt.z, cap: cap, face: hd };
      yield S.until(() => skipped() || Math.hypot(p.pos.x - pt.x, p.pos.z - pt.z) < 0.3, 9);
    }
    stand(p, clipAfter || 'idle', face);
  }
  function* par(fns, timeout) {
    const cs = fns.map(f => S.start(f, 'cm'));
    yield S.until(() => skipped() || cs.every(c => c.done), timeout);
    cs.forEach(c => { if (!c.done) S.stop(c); });
  }
  function* W(sec) { yield S.until(() => skipped(), sec); }
  function homeSpot(p) { const sx = HPO.court.sides[p.team]; return { x: sx * 7.5, z: (p.slot === 0 ? 1 : -1) * 2.2 }; }
  function ensureInside() {
    const P = PL(); if (!P) return;
    P.list.forEach(function (p) {
      p._cm = null; delete CM.lift[p.id];
      const out = Math.abs(p.pos.x) > 9.7 || Math.abs(p.pos.z) > 4.7;
      if (out) { const h = homeSpot(p); p.pos = { x: h.x, z: h.z }; p.vel = { x: 0, z: 0 }; }
      p.retrieving = false; p.intent = { type: 'idle' }; p.swing = null; p.anim = { clip: 'idle', t: 0, rate: 1 };
      const rig = HPO.mod.actors && HPO.mod.actors.rigOf && HPO.mod.actors.rigOf(p.id); if (rig && rig.holdTrophy) rig.holdTrophy(null);
    });
  }
  function neutralize() {
    const P = PL(); if (P && P.list.length) { ensureInside(); P.list.forEach(p => { const h = homeSpot(p); p.pos = { x: h.x, z: h.z }; p.heading = P.facing(p.team); p.vel = { x: 0, z: 0 }; }); }
    clearProps(); hideBanner(); if (fx() && fx().clear) fx().clear(); camRestore();
    const c = crowd(); if (c) { c.celebrate && c.celebrate(false); }
    CM.coin = null; CM.active = false;
  }
  function clearProps() {
    if (CM.podium) { if (CM.podium.parent) CM.podium.parent.remove(CM.podium); CM.podium = null; }
    if (CM.trophy) { if (CM.trophy.parent) CM.trophy.parent.remove(CM.trophy); CM.trophy = null; }
    CM.medals.forEach(m => { if (m.parent) m.parent.remove(m); }); CM.medals = [];
    if (CM.coinMesh && CM.coinMesh.parent) CM.coinMesh.parent.remove(CM.coinMesh); CM.coinMesh = null;
    CM.lift = {};
  }
  const rigOf = id => HPO.mod.actors && HPO.mod.actors.rigOf ? HPO.mod.actors.rigOf(id) : null;
  const names = () => { const o = {}; PL().list.forEach(p => { o[p.id] = p.name; }); return o; };
  const teamName = t => PL().team(t).map(p => p.name.split(' ').pop()).join(' / ');
  const winnerTeam = () => { const st = HPO.mod.rules && HPO.mod.rules.state, m = MT(); return (st && st.winner) || (m && m.result && m.result.winner) || 'A'; };

  const GATE_Z = 5, QUEUE_Z = 6.9;
  function stagePlayers() {
    const P = PL(); if (!P) return;
    P.list.forEach(function (p) {
      const sx = HPO.court.sides[p.team];
      p.retrieving = true; p.pos = { x: sx * (2.2 + 1.0 * p.slot), z: QUEUE_Z }; p.vel = { x: 0, z: 0 }; p.heading = -Math.PI / 2; p.swing = null;
      stand(p, 'idle', -Math.PI / 2);
    });
  }
  const LINEUP = { A0: { x: -3.3, z: 0.7 }, A1: { x: -1.1, z: 0.7 }, B0: { x: 1.1, z: 0.7 }, B1: { x: 3.3, z: 0.7 } };
  function lineupSpot(p) { const keyed = (p.team === 'A' ? ['A0', 'A1'] : ['B0', 'B1'])[p.slot]; return LINEUP[keyed]; }

  const phases = {
    *intro() {
      CM.skipping = false; CM.active = true; ensureDriver(); clearProps();
      const c = crowd(); if (c) { c.setMood(1); c.react(1, 'applause'); }
      stagePlayers();
      const r = RN(); camSave(); if (r) r.setCameraMode('club');
      banner(title(), 'Welcome to the club', 7000);
      say('Ladies and gentlemen, welcome to the ' + title() + '.');
      try {
        yield* W(2.2); if (r && !skipped()) r.rotate(1);
        yield* W(2.4); if (r && !skipped()) r.rotate(-1);
        yield* W(2.4);
      } finally { hideBanner(); camRestore(); }
    },
    *walkon() {
      CM.active = true; ensureDriver();
      const P = PL(), c = crowd();
      if (!P.list.length) return;
      const r = RN(); camSave(); if (r) r.setCameraMode('close');
      if (c) c.react(2, 'applause');
      stagePlayers();
      try {
        for (let ti = 0; ti < 2 && !skipped(); ti++) {
          const team = ti ? 'B' : 'A', sx = HPO.court.sides[team];
          const gx = sx * 0.55;
          const fns = P.team(team).map(function (p, k) {
            const ls = lineupSpot(p);
            return function* () { yield* W(k * 0.8); yield* walkPath(p, [{ x: gx + (k ? 0.3 : -0.3), z: 5.9 }, { x: gx + (k ? 0.3 : -0.3), z: 3.6 }, { x: ls.x, z: ls.z }], 0.42, Math.PI / 2, 'twirl'); };
          });
          yield* par(fns, 16);
          if (c) c.react(2, 'cheer');
        }
        yield* W(1.6);
        P.list.forEach(p => { if (!skipped()) stand(p, 'idle', Math.PI / 2); });
      } finally { ensureInside(); camRestore(); }
    },
    *introductions() {
      CM.active = true; ensureDriver();
      const P = PL(), c = crowd(), r = RN();
      if (!P.list.length) return;
      camSave();
      try {
        for (let i = 0; i < P.list.length && !skipped(); i++) {
          const p = P.list[i], d = p.def, ctry = d.country || {};
          const line = (i === 0 ? 'First, ' : i === 2 ? 'And their opponents. ' : '') + 'From ' + (ctry.name || 'the world') + ', ranked number ' + d.ranking + ' in the world: ' + d.name + (d.nick ? ', "' + d.nick + '"' : '') + '.';
          say(line);
          banner(d.name, (d.nick ? '"' + d.nick + '" · ' : '') + (ctry.name || '') + ' · World #' + d.ranking, 4200);
          if (r) { r.followPlayer(p.id); if (r.view) r.view.zoom = 2.6; }
          P.list.forEach(q => { stand(q, q === p ? 'twirl' : 'idle', Math.PI / 2); });
          if (c) c.react(ctry.code === 'IDN' ? 3 : 2, 'cheer');
          yield* W(3.6);
        }
        say('Please welcome both teams.');
        if (c) c.react(2, 'applause');
        yield* W(1.0);
      } finally { hideBanner(); if (r && r.followPlayer) r.followPlayer(null); camRestore(); ensureInside(); }
    },
    *toss() {
      CM.active = true; ensureDriver();
      const P = PL(), m = MT(), c = crowd(), r = RN(), tos = (m && m.toss) || { first: 'A' };
      camSave(); if (r) { camFocus(0, -1, 5.5, 1); }
      const T3_ = T3;
      try {
        // everyone to the net for the toss
        yield* par(P.list.map(function (p) {
          const ls = lineupSpot(p); return () => walkPath(p, [{ x: ls.x, z: ls.z }], 0.4, Math.PI / 2);
        }), 8);
        const umpire = 'Umpire';
        say('Team ' + tos.first + ' has won the toss and chooses to serve.');
        // coin
        const coin = new T3_.Mesh(new T3_.CylinderGeometry(0.14, 0.14, 0.035, 14), mat(0xf5c518, { emissive: 0x4a3600 }));
        const g = grp('fx'); if (g) g.add(coin); CM.coinMesh = coin;
        CM.coin = { t0: m ? m.simTime : 0, dur: 1.7, x: 0.35, z: -4.3, y0: 1.5, flip: 7 * TAU, mesh: coin };
        yield* W(1.8);
        coin.rotation.set(0, 0, 0);
        banner('Team ' + tos.first + ' serves first', 'Coin toss', 3500);
        if (c) c.react(1, 'applause');
        yield* W(2.0);
        CM.coin = null; if (CM.coinMesh && CM.coinMesh.parent) CM.coinMesh.parent.remove(CM.coinMesh); CM.coinMesh = null;
        // to their sides
        yield* par(P.list.map(function (p) { const h = homeSpot(p); return () => walkPath(p, [h], 0.45, P.facing(p.team)); }), 10);
      } finally { hideBanner(); CM.coin = null; if (CM.coinMesh && CM.coinMesh.parent) CM.coinMesh.parent.remove(CM.coinMesh); CM.coinMesh = null; ensureInside(); camRestore(); CM.active = false; }
    },
    *changeover(kind) {
      BUS.emit('changeover:start', { kind: kind });
      CM.active = true; ensureDriver();
      const P = PL(), c = crowd();
      try {
        if (c) c.setMood(1);
        yield* par(P.list.map(function (p) {
          const sx = HPO.court.sides[p.team], gx = sx * 0.55, off = p.slot ? 0.5 : -0.5, bx = sx * 5 + (p.slot ? 0.6 : -0.6);
          p.retrieving = true;
          return () => walkPath(p, [{ x: gx + off * 0.4, z: -4.0 }, { x: gx + off * 0.4, z: -5.7 }, { x: bx, z: -5.8 }], 0.5, Math.PI / 2);
        }), 10);
        if (skipped()) return;
        // drink, towel, tactical chat
        P.list.forEach(p => stand(p, 'drink', Math.PI / 2));
        yield* W(kind === 'set' ? 3.6 : 2.4);
        P.list.forEach(p => stand(p, 'towel', Math.PI / 2));
        yield* W(kind === 'set' ? 3.0 : 1.8);
        ['A', 'B'].forEach(function (t) {
          const tm = P.team(t); if (tm.length < 2) return;
          const a = tm[0], b = tm[1], ang = Math.atan2(b.pos.z - a.pos.z, b.pos.x - a.pos.x);
          stand(a, 'encourage', ang); stand(b, 'encourage', ang + Math.PI);
        });
        yield* W(kind === 'set' ? 4 : 2.6);
        P.rest(kind === 'set' ? 0.12 : 0.05);
        yield* par(P.list.map(function (p) {
          const sx = HPO.court.sides[p.team], gx = sx * 0.55, off = p.slot ? 0.5 : -0.5;
          return () => walkPath(p, [{ x: gx + off * 0.4, z: -5.7 }, { x: gx + off * 0.4, z: -3.9 }, { x: sx * 1.2, z: (p.slot ? -1 : 1) * 4.2 }], 0.5, P.facing(p.team));
        }), 12);
      } finally {
        ensureInside(); CM.active = false;
        P.rest(kind === 'set' ? 0.0 : 0.0);
        BUS.emit('changeover:end', { kind: kind });
      }
    },
    *handshake() {
      CM.active = true; ensureDriver();
      const P = PL(), c = crowd(), r = RN(), st = HPO.mod.rules && HPO.mod.rules.state;
      camSave(); camFocus(0, 0, 6.5, 1);
      try {
        const wt = winnerTeam();
        const A = P.team('A'), B = P.team('B');
        const pos = (p, z) => ({ x: (p.team === 'A' ? -0.85 : 0.85), z: z });
        const arrange = function (zs) {
          return par([A[0], A[1], B[0], B[1]].filter(Boolean).map((p, i) => () => walkPath(p, [pos(p, zs[i])], 0.5, p.team === 'A' ? 0 : Math.PI)), 8);
        };
        yield* arrange([1.4, -1.4, 1.4, -1.4]);
        if (!skipped()) { P.list.forEach(p => { p.anim = { clip: 'handshake', t: 0, rate: 1 }; }); if (c) c.react(2, 'applause'); }
        yield* W(2.2);
        yield* arrange([-1.4, 1.4, 1.4, -1.4]);       // team A swaps places: cross handshakes
        if (!skipped()) P.list.forEach(p => { p.anim = { clip: 'handshake', t: 0, rate: 1 }; });
        yield* W(2.2);
        // chair umpire
        const xs = [-1.8, -0.6, 0.6, 1.8];
        yield* par([A[0], A[1], B[0], B[1]].filter(Boolean).map((p, i) => () => walkPath(p, [{ x: xs[i], z: -3.2 }, { x: xs[i], z: -4.5 }], 0.5, -Math.PI / 2)), 9);
        for (let i = 0; i < P.list.length && !skipped(); i++) { const p = [A[0], A[1], B[0], B[1]][i]; if (!p) continue; p.anim = { clip: 'handshake', t: 0, rate: 1 }; yield* W(0.9); }
        let sets = ''; try { sets = HPO.mod.rules.describe(st, names()).setsText; } catch (e) { /* optional */ }
        say('Game, set and match. ' + teamName(wt) + ' win ' + sets + '.');
        if (c) c.react(3, 'applause');
        yield* W(2.2);
      } finally { ensureInside(); camRestore(); CM.active = false; }
    },
    *ceremony() {
      CM.active = true; ensureDriver(); CM.skipping = false;
      const P = PL(), c = crowd(), f = fx(), r = RN(), m = MT(), rg = HPO.mod.rigs;
      const wt = winnerTeam(), W_ = P.team(wt), L_ = P.team(wt === 'A' ? 'B' : 'A');
      const t0 = m ? m.simTime : 0;
      camSave();
      try {
        buildPodium();
        camFocus(4.0, 0, 5.8, 1.2);
        banner('CHAMPIONS', teamName(wt), 9000);
        say('Ladies and gentlemen, your ' + title() + ' champions: ' + teamName(wt) + '.');
        const spots = [{ p: W_[0], x: 3.9, h: 0.7 }, { p: W_[1], x: 5.1, h: 0.7 }, { p: L_[0], x: 1.5, h: 0.45 }, { p: L_[1], x: 2.5, h: 0.45 }];
        yield* par(spots.filter(s => s.p).map(function (s) { return () => walkPath(s.p, [{ x: s.x, z: 2.6 }, { x: s.x, z: 0.5 }], 0.5, Math.PI / 2); }), 12);
        if (skipped()) return;
        spots.forEach(function (s) { if (!s.p) return; s.p.retrieving = true; CM.lift[s.p.id] = { y: 0, to: s.h }; });
        // medals + trophy
        spots.forEach(function (s) { const rg_ = s.p && rigOf(s.p.id); if (rg_) addMedal(rg_, s.h > 0.5 ? 0xf5c518 : 0xc7ccd6); });
        W_.forEach((p, i) => stand(p, i ? 'victory' : 'trophyLift', Math.PI / 2)); L_.forEach(p => stand(p, 'celebrate', Math.PI / 2));
        const cap = rigOf(W_[0].id);
        if (cap && cap.holdTrophy && rg && rg.makeTrophy) { if (CM.trophy && CM.trophy.parent) CM.trophy.parent.remove(CM.trophy); CM.trophy = null; const tr = rg.makeTrophy(1.0); cap.holdTrophy(tr); }
        if (c) { c.react(3, 'celebration'); c.wave(); }
        if (f) { f.confetti(260, { x: 4.5, y: 1.8, z: 0.5, up: 9 }); f.confetti(220, { x: 0, y: 9, z: 0, rain: true, spread: 9 }); f.fireworks(5, { duration: 6 }); f.cameraFlash(10); }
        say('Congratulations to the champions!', 'commentator');
        yield* W(4.5);
        if (f) { f.confetti(240, { x: 3.0, y: 2.0, z: 0.5, up: 10 }); f.fireworks(6, { duration: 5 }); f.cameraFlash(12); }
        if (c) c.wave();
        L_.forEach(p => stand(p, 'idle', Math.PI / 2));
        yield S.until(() => skipped() || (m && m.simTime - t0 >= 14), 16);
        if (f && !skipped()) { f.confetti(160, { x: 0, y: 9, z: 0, rain: true, spread: 9 }); }
        if (!skipped()) BUS.emit('ui:setting', { key: 'results', value: true });
        yield* W(0.6);
      } finally {
        if (skipped()) neutralize(); else { CM.active = false; hideBanner(); }
      }
    }
  };

  // ---- podium + medals ----
  function buildPodium() {
    const g = new T3.Group(); g.name = 'podium'; const fxg = grp('fx'); if (!fxg) return; fxg.add(g);
    const step = (cx, w, h, hex, n) => {
      const b = new T3.Mesh(new T3.BoxGeometry(w, h, 1.5), mat(hex)); b.position.set(cx, h / 2, 0.1); g.add(b);
      const top = new T3.Mesh(new T3.BoxGeometry(w + 0.06, 0.06, 1.56), mat(0xfffaf0)); top.position.set(cx, h + 0.03, 0.1); g.add(top);
      const tex = canvasTex(32, 32, function (c, ww, hh) { c.fillStyle = '#' + hex.toString(16).padStart(6, '0'); c.fillRect(0, 0, ww, hh); c.fillStyle = '#fffaf0'; c.font = 'bold 24px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 16, 17); });
      const pl = new T3.Mesh(new T3.PlaneGeometry(Math.min(w - 0.2, 0.7), 0.5), mat(0xffffff, { map: tex })); pl.position.set(cx, h * 0.55, 0.86); g.add(pl);
    };
    step(4.5, 2.6, 0.7, 0x177dc5, 1); step(2.0, 2.2, 0.45, 0x123954, 2); step(6.6, 1.2, 0.3, 0x2a6aa0, 3);
    // trophy table with the cup (until the captain lifts it)
    const rgs = HPO.mod.rigs;
    CM.podium = g;
  }
  function addMedal(rig, hex) {
    if (!rig || !rig.root) return;
    const ring = new T3.Mesh(new T3.TorusGeometry(0.17, 0.035, 5, 10), mat(hex, { emissive: 0x2a2000, emissiveIntensity: 0.4 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.38, 0); rig.root.add(ring); CM.medals.push(ring);
  }

  const ceremony = HPO.mod.ceremony = {
    phases: phases,
    skip() { CM.skipping = true; neutralize(); },
    init(ctx) {
      T3 = (ctx && ctx.THREE) || window.THREE; if (!T3 || !RN() || !RN().groups) { ceremony.phases = null; return; }
      hookCeremony();
    },
    update(dt, t) {
      if (!T3) return;
      if (t !== undefined && t === CM.t) return; CM.t = t === undefined ? -1 : t;
      dt = Math.min(dt || 0.016, 0.1);
      if (DOM.bt > 0) { DOM.bt -= dt; if (DOM.bt <= 0) hideBanner(); }
      // coin flight (sim time)
      const co = CM.coin, m = MT();
      if (co && m) {
        const u = clamp((m.simTime - co.t0) / co.dur, 0, 1), y = co.y0 + 2.4 * Math.sin(u * Math.PI);
        co.mesh.position.set(co.x, y, co.z); co.mesh.rotation.x = u < 1 ? co.flip * u : 0; co.mesh.rotation.z = u < 1 ? 0.4 : 0;
        if (u >= 1) { co.mesh.position.y = co.y0; co.mesh.rotation.x = Math.PI / 2 * 0; }
      }
      // podium lift: applied after actors.sync (which resets y each frame)
      const P = PL(); if (P && P.list.length) {
        for (const id in CM.lift) {
          const l = CM.lift[id], rg = rigOf(id); l.y += (l.to - l.y) * Math.min(1, dt * 6);
          if (rg) rg.root.position.y = l.y;
        }
      }
      if (CM.active && cam.saved && RN() && RN().cameraMode === 'free' && CM.podium) RN().orbit(Math.sin((RN().t || 0) * 0.4) * 0.05 * dt);
    }
  };

  function hookCeremony() {
    BUS.on('match:new', function () { CM.skipping = false; clearProps(); hideBanner(); CM.active = false; });
    BUS.on('match:phase', function (e) { if (e && e.phase === 'results' && CM.skipping) neutralize(); });
  }

  // drive replay + ceremony from the frame hook as well (idempotent per frame time)
  BUS.on('boot:ready', function () {
    const r = RN(); if (!r || !r.onFrame) return;
    r.onFrame(function (dt, t) { if (replay.update) replay.update(dt, t); if (ceremony.update) ceremony.update(dt, t); });
  });
})(HPO);
