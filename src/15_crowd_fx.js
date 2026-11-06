// Crowd (instanced spectators, reactions, wave, flags, mascot) and FX (pooled particles, confetti, dust, glass ripples, sparks, fireworks).
// Registers HPO.mod.crowd and HPO.mod.fx. Cosmetic only: never touches sim state, uses local seeded rngs (no Math.random).
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, TAU = Math.PI * 2;
  const clamp = U.clamp;
  const RN = () => HPO.mod.render;
  let T3 = null;
  const frng = HPO.makeRng(0xA11E77A);          // fx cosmetic stream
  const BRAND = { cream: 0xfffaf0, ink: 0x123954, blue: 0x177dc5, hl: 0xfff4b3 };
  const PARTY = [0xe5484d, 0xf5d90a, 0x2fb26b, 0x8a5cf6, 0xff7ab6, 0xf28c28, 0x14b8a6, 0x1e6bd6];
  const CONF_COLS = [0x177dc5, 0xfffaf0, 0xfff4b3, 0xe5484d, 0xf5d90a, 0x2fb26b, 0x8a5cf6, 0xff7ab6, 0xf28c28, 0x14b8a6];
  const isMobile = () => !!HPO.cfg.mobile;
  const grp = n => { const r = RN(); return r && r.groups && r.groups[n] || null; };
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- shared helpers ----------
  function mergeBoxes(parts) {
    const pos = [], nor = [], col = [], idx = [];
    let off = 0;
    parts.forEach(function (p) {
      const g = new T3.BoxGeometry(p.w, p.h, p.d);
      g.translate(p.x || 0, p.y || 0, p.z || 0);
      const pa = g.attributes.position.array, na = g.attributes.normal.array, ia = g.index.array;
      const c = p.c === undefined ? 0xffffff : p.c, r = ((c >> 16) & 255) / 255, gg = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
      for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
      for (let i = 0; i < pa.length / 3; i++) col.push(r, gg, b);
      for (let i = 0; i < ia.length; i++) idx.push(ia[i] + off);
      off += pa.length / 3; g.dispose();
    });
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new T3.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }
  function canvasTex(w, h, draw) {
    const r = RN();
    if (r && r.canvasTex) return r.canvasTex(w, h, draw);
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new T3.CanvasTexture(c); t.magFilter = T3.NearestFilter; t.minFilter = T3.NearestFilter; t.generateMipmaps = false; return t;
  }
  function patchMat(m) { const r = RN(); if (r && r.patch) r.patch(m); return m; }
  // transparent material that never writes destination alpha (the post pass reads alpha as the dithered-occluder marker)
  function noAlpha(m, additive) {
    m.transparent = true; m.depthWrite = false;
    m.blending = T3.CustomBlending; m.blendEquation = T3.AddEquation; m.blendSrc = T3.SrcAlphaFactor; m.blendDst = additive ? T3.OneFactor : T3.OneMinusSrcAlphaFactor;
    m.blendEquationAlpha = T3.AddEquation; m.blendSrcAlpha = T3.ZeroFactor; m.blendDstAlpha = T3.OneFactor;
    return m;
  }
  function starTex() {
    return canvasTex(32, 32, function (g, w, h) {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,250,200,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff'; g.fillRect(15, 2, 2, 28); g.fillRect(2, 15, 28, 2);
    });
  }
  function drawMark(g, x, y, s, ink, star) { // "A" + four-point star
    g.fillStyle = ink; g.font = 'bold ' + Math.round(s) + 'px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText('A', x - s * 0.18, y);
    const sx = x + s * 0.42, sy = y - s * 0.28, r = s * 0.3;
    g.fillStyle = star; g.beginPath();
    g.moveTo(sx, sy - r); g.lineTo(sx + r * 0.25, sy - r * 0.25); g.lineTo(sx + r, sy); g.lineTo(sx + r * 0.25, sy + r * 0.25);
    g.lineTo(sx, sy + r); g.lineTo(sx - r * 0.25, sy + r * 0.25); g.lineTo(sx - r, sy); g.lineTo(sx - r * 0.25, sy - r * 0.25); g.closePath(); g.fill();
  }

  // =====================================================================================
  // FX
  // =====================================================================================
  const flagTime = { value: 0 };
  const fxS = { init: false, pools: {}, ripples: [], flashes: [], fw: [], net: null, group: null, dust: { puff: 0xe9dcc0, speck: 0xcfb88a }, last: {}, mobile: false, clock: 0, t: -1 };
  const D = new Float32Array(16);

  function Pool(max, geo, mat, mode) {
    this.max = max; this.cap = max; this.n = 0; this.mode = mode;
    this.mesh = new T3.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(T3.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new T3.Color(1, 1, 1)); this.mesh.count = 0;
    this.col = this.mesh.instanceColor.array; this.mesh.instanceColor.setUsage(T3.DynamicDrawUsage);
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxL = new Float32Array(max); this.g = new Float32Array(max); this.drag = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.rot = new Float32Array(max); this.spin = new Float32Array(max); this.ph = new Float32Array(max);
    this.lay = new Uint8Array(max);
  }
  Pool.prototype.emit = function (x, y, z, vx, vy, vz, life, g, drag, s0, s1, hex) {
    if (this.n >= this.cap) return -1;
    const i = this.n++, k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.life[i] = life; this.maxL[i] = life; this.g[i] = g; this.drag[i] = drag; this.s0[i] = s0; this.s1[i] = s1;
    this.rot[i] = frng.next() * TAU; this.spin[i] = (frng.next() - 0.5) * 12; this.ph[i] = frng.next() * TAU; this.lay[i] = 0;
    this.col[k] = ((hex >> 16) & 255) / 255; this.col[k + 1] = ((hex >> 8) & 255) / 255; this.col[k + 2] = (hex & 255) / 255;
    return i;
  };
  Pool.prototype.remove = function (i) {
    const l = --this.n; if (i === l) return;
    const a = i * 3, b = l * 3;
    for (let q = 0; q < 3; q++) { this.p[a + q] = this.p[b + q]; this.v[a + q] = this.v[b + q]; this.col[a + q] = this.col[b + q]; }
    this.life[i] = this.life[l]; this.maxL[i] = this.maxL[l]; this.g[i] = this.g[l]; this.drag[i] = this.drag[l]; this.s0[i] = this.s0[l]; this.s1[i] = this.s1[l];
    this.rot[i] = this.rot[l]; this.spin[i] = this.spin[l]; this.ph[i] = this.ph[l]; this.lay[i] = this.lay[l];
  };
  Pool.prototype.update = function (dt) {
    const a = this.mesh.instanceMatrix.array, tum = this.mode === 'tumble';
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.remove(i); continue; }
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[k] *= dr; this.v[k + 2] *= dr;
      if (tum) { this.ph[i] += dt * 4; this.v[k] += Math.cos(this.ph[i]) * 0.9 * dt; this.v[k + 2] += Math.sin(this.ph[i] * 0.8) * 0.9 * dt; this.v[k + 1] = Math.max(this.v[k + 1] - this.g[i] * dt, -1.6); }
      else { this.v[k + 1] = (this.v[k + 1] - this.g[i] * dt) * (this.drag[i] > 0 ? Math.exp(-this.drag[i] * 0.3 * dt) : 1); }
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (this.p[k + 1] < 0.03 && !this.lay[i]) { this.p[k + 1] = 0.03; this.v[k] = this.v[k + 1] = this.v[k + 2] = 0; this.lay[i] = 1; this.g[i] = 0; this.life[i] = Math.min(this.life[i], 2.5); }
      const u = 1 - this.life[i] / this.maxL[i];
      const grow = this.s0[i] + (this.s1[i] - this.s0[i]) * (1 - (1 - u) * (1 - u));
      const fade = tum ? 1 - smooth(0.82, 1, u) : 1 - smooth(0.4, 1, u);
      const s = grow * fade, o = i * 16;
      this.rot[i] += this.spin[i] * dt;
      if (tum && !this.lay[i]) {
        const cy = Math.cos(this.rot[i]), sy = Math.sin(this.rot[i]), tl = Math.sin(this.ph[i] * 2.3 + this.spin[i]) * 1.3, ca = Math.cos(tl), sa = Math.sin(tl);
        a[o] = cy * s; a[o + 1] = 0; a[o + 2] = -sy * s; a[o + 3] = 0;
        a[o + 4] = sy * sa * s; a[o + 5] = ca * s; a[o + 6] = cy * sa * s; a[o + 7] = 0;
        a[o + 8] = sy * ca * s; a[o + 9] = -sa * s; a[o + 10] = cy * ca * s; a[o + 11] = 0;
      } else if (tum) {
        const cy = Math.cos(this.rot[i]), sy = Math.sin(this.rot[i]);       // lying flat: plane normal up
        a[o] = cy * s; a[o + 1] = 0; a[o + 2] = -sy * s; a[o + 3] = 0;
        a[o + 4] = -sy * s; a[o + 5] = 0; a[o + 6] = -cy * s; a[o + 7] = 0;
        a[o + 8] = 0; a[o + 9] = s; a[o + 10] = 0; a[o + 11] = 0;
      } else {
        a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0; a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0;
      }
      a[o + 12] = this.p[k]; a[o + 13] = this.p[k + 1]; a[o + 14] = this.p[k + 2]; a[o + 15] = 1;
    }
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  };

  function ringTex() {
    return canvasTex(64, 64, function (g, w, h) {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.25, 'rgba(210,245,255,0.35)'); gr.addColorStop(0.6, 'rgba(160,230,255,0.05)'); gr.addColorStop(0.72, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.85, 'rgba(180,235,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
  }

  const fx = HPO.mod.fx = {
    ready: false, enabled: true, pools: fxS.pools,
    init(ctx) {
      T3 = (ctx && ctx.THREE) || window.THREE; const r = RN();
      if (!T3 || !r || !r.groups || !r.groups.fx || fxS.init) return;
      fxS.init = true; fx.ready = true; fxS.mobile = isMobile();
      const G = fxS.group = new T3.Group(); G.name = 'fxPool'; r.groups.fx.add(G);
      const mb = (hex, additive, op) => noAlpha(new T3.MeshBasicMaterial({ color: 0xffffff, opacity: op === undefined ? 1 : op, side: T3.DoubleSide }), additive);
      const quad = new T3.PlaneGeometry(1, 1); quad.rotateX(-Math.PI / 2 * 0); // confetti piece in XY; rotated by matrix
      const cg = new T3.PlaneGeometry(0.2, 0.13);
      fxS.pools.confetti = new Pool(600, cg, mb(0, false), 'tumble');
      const cube = new T3.BoxGeometry(1, 1, 1);
      fxS.pools.dust = new Pool(64, cube, mb(0, false, 0.85), 'cube');
      fxS.pools.speck = new Pool(160, cube, mb(0, false), 'cube');
      fxS.pools.spark = new Pool(520, cube, mb(0, true), 'cube');
      Object.keys(fxS.pools).forEach(function (k) { G.add(fxS.pools[k].mesh); fxS.pools[k].mesh.visible = false; });
      // glass ripples
      const rt = ringTex(), rg = new T3.PlaneGeometry(1, 1);
      for (let i = 0; i < 8; i++) {
        const m = noAlpha(new T3.MeshBasicMaterial({ map: rt, color: 0xcff3ff, opacity: 0, side: T3.DoubleSide }), true);
        const mesh = new T3.Mesh(rg, m); mesh.visible = false; mesh.renderOrder = 20; G.add(mesh);
        fxS.ripples.push({ mesh: mesh, life: 0, max: 0.5, size: 1 });
      }
      // camera flash sprites
      const st = starTex();
      for (let i = 0; i < 14; i++) {
        const sm = noAlpha(new T3.SpriteMaterial({ map: st, color: 0xffffff, opacity: 1 }), true);
        const sp = new T3.Sprite(sm); sp.visible = false; sp.renderOrder = 21; G.add(sp);
        fxS.flashes.push({ sp: sp, life: 0, max: 0.2, size: 0.6 });
      }
      fx.setOptions({ mobile: isMobile() });
      hookFx();
    },
    setOptions(o) {
      o = o || {};
      if (o.mobile !== undefined) {
        fxS.mobile = !!o.mobile; const m = fxS.mobile ? 0.5 : 1, P = fxS.pools;
        Object.keys(P).forEach(function (k) { P[k].cap = Math.max(8, Math.floor(P[k].max * m)); });
      }
      if (o.enabled !== undefined) fx.enabled = !!o.enabled;
    },
    clear() {
      const P = fxS.pools; Object.keys(P).forEach(function (k) { P[k].n = 0; P[k].mesh.count = 0; P[k].mesh.visible = false; });
      fxS.ripples.forEach(function (r) { r.life = 0; r.mesh.visible = false; }); fxS.flashes.forEach(function (f) { f.life = 0; f.sp.visible = false; });
      fxS.fw.length = 0;
    },
    stop() { fx.clear(); },
    setVenue(name) {
      const t = { terracotta: [0xe2a27a, 0xb86a44], indoor: [0xd8dde6, 0xb8bfcc], fastBlue: [0xdde8f0, 0xb8c8d8], classicBlue: [0xe9dcc0, 0xcfb88a] }[name] || [0xe9dcc0, 0xcfb88a];
      fxS.dust.puff = t[0]; fxS.dust.speck = t[1];
    },

    // pieces fall from/around `origin` {x,y,z, spread, rain:bool, up}
    confetti(n, origin) {
      if (!fxS.init || !fx.enabled) return 0;
      origin = origin || {}; const P = fxS.pools.confetti;
      n = Math.min(Math.round(n * (fxS.mobile ? 0.5 : 1)), P.cap - P.n); let made = 0;
      const ox = origin.x || 0, oy = origin.y === undefined ? 3 : origin.y, oz = origin.z || 0, sp = origin.spread === undefined ? 0.4 : origin.spread;
      for (let i = 0; i < n; i++) {
        const hex = CONF_COLS[(frng.next() * CONF_COLS.length) | 0];
        let x, y, z, vx, vy, vz;
        if (origin.rain) { x = ox + (frng.next() - 0.5) * 2 * sp; z = oz + (frng.next() - 0.5) * 2 * sp; y = oy + frng.next() * 2; vx = (frng.next() - 0.5) * 1.2; vz = (frng.next() - 0.5) * 1.2; vy = -frng.next(); }
        else {
          const a = frng.next() * TAU, e = 0.9 + frng.next() * 0.5, up = origin.up || 9;
          x = ox + (frng.next() - 0.5) * sp; y = oy; z = oz + (frng.next() - 0.5) * sp;
          const sh = frng.range(2.5, 7); vx = Math.cos(a) * sh * 0.8; vz = Math.sin(a) * sh * 0.8; vy = up * frng.range(0.55, 1.0) * e;
        }
        if (P.emit(x, y, z, vx, vy, vz, frng.range(5, 8.5), 7, 2.2, 1, 1, hex) >= 0) made++;
      }
      return made;
    },
    dust(p, power) {
      if (!fxS.init || !fx.enabled || !p) return;
      const Pd = fxS.pools.dust, Ps = fxS.pools.speck, k = clamp(power === undefined ? 1 : power, 0.4, 2), x = p.x, z = p.z, y = 0.06;
      for (let i = 0; i < 3; i++) { const a = frng.next() * TAU, s = frng.range(0.2, 0.7); Pd.emit(x + Math.cos(a) * 0.08, y, z + Math.sin(a) * 0.08, Math.cos(a) * s, frng.range(0.1, 0.5), Math.sin(a) * s, frng.range(0.35, 0.6), 0, 1.5, 0.1 * k, 0.26 * k, fxS.dust.puff); }
      const ns = fxS.mobile ? 3 : 6;
      for (let i = 0; i < ns; i++) { const a = frng.next() * TAU, s = frng.range(0.6, 1.8) * k; Ps.emit(x, y, z, Math.cos(a) * s, frng.range(0.8, 2.2) * k, Math.sin(a) * s, frng.range(0.3, 0.55), 9.81, 0.5, 0.035, 0.03, fxS.dust.speck); }
    },
    // quick expanding ring on a glass/mesh panel at p with outward normal n (towards the court)
    glassRipple(p, n, o) {
      if (!fxS.init || !fx.enabled || !p) return;
      o = o || {}; let r = null;
      for (let i = 0; i < fxS.ripples.length; i++) if (fxS.ripples[i].life <= 0) { r = fxS.ripples[i]; break; }
      if (!r) r = fxS.ripples[0];
      let nx = n ? n.x : 0, ny = n ? n.y : 0, nz = n ? n.z : 1; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      r.mesh.position.set(p.x + nx * 0.03, p.y + ny * 0.03, p.z + nz * 0.03);
      r.mesh.quaternion.setFromUnitVectors(new T3.Vector3(0, 0, 1), new T3.Vector3(nx, ny, nz));
      r.max = o.mesh ? 0.3 : 0.5; r.size = o.mesh ? 0.9 : 1.5; r.life = r.max; r.mesh.visible = true;
      r.mesh.material.color.setHex(o.mesh ? 0xe8e8e8 : 0xcff3ff);
    },
    netShake(amount) {
      const wc = HPO.mod.worldCourt; if (!wc) return;
      if (wc.netShake) { try { wc.netShake(amount); return; } catch (e) { U.logError('fx.netShake', e); } }
      const m = wc.netMesh || wc.net; if (!m) return;
      fxS.net = { m: m, t: 0, a: clamp(amount === undefined ? 1 : amount, 0.3, 2), base: m.rotation.z, bx: m.position.x };
    },
    spark(p, power) {
      if (!fxS.init || !fx.enabled || !p) return;
      const P = fxS.pools.spark, k = clamp(power === undefined ? 1 : power, 0.5, 2), ns = fxS.mobile ? 4 : 8;
      P.emit(p.x, p.y, p.z, 0, 0, 0, 0.12, 0, 0, 0.32 * k, 0.1, 0xffffff);
      for (let i = 0; i < ns; i++) {
        const a = frng.next() * TAU, e = frng.range(-0.6, 1), c = Math.sqrt(1 - e * e), s = frng.range(2, 5) * k;
        P.emit(p.x, p.y, p.z, Math.cos(a) * c * s, e * s, Math.sin(a) * c * s, frng.range(0.18, 0.34), 6, 2, 0.07, 0.03, i % 2 ? 0xfff4b3 : 0xffe27a);
      }
    },
    // firework bursts: n bursts over ~dur seconds around opts.center
    fireworks(n, o) {
      if (!fxS.init || !fx.enabled) return;
      o = o || {}; const c = o.center || { x: 0, y: 16, z: -8 }, dur = o.duration || 7;
      for (let i = 0; i < n; i++) {
        const t0 = (i / Math.max(1, n)) * dur + frng.next() * 0.4;
        const cx = c.x + frng.range(-14, 14), cy = c.y + frng.range(-3, 5), cz = c.z + frng.range(-8, 8);
        fxS.fw.push({ t: -t0, lx: cx * 0.6, lz: cz * 0.6, cx: cx, cy: cy, cz: cz, rise: 0.9, burst: false, c1: PARTY[(frng.next() * PARTY.length) | 0], c2: frng.chance(0.5) ? 0xfff4b3 : PARTY[(frng.next() * PARTY.length) | 0] });
      }
    },
    // camera-flash pops in the stands (positions from crowd seats)
    cameraFlash(n) {
      if (!fxS.init || !fx.enabled) return;
      const cr = HPO.mod.crowd; n = Math.min(n || 4, fxS.mobile ? 5 : 12);
      for (let i = 0; i < n; i++) {
        let f = null; for (let k = 0; k < fxS.flashes.length; k++) if (fxS.flashes[k].life <= 0) { f = fxS.flashes[k]; break; }
        if (!f) return;
        const pt = cr && cr.randomSeat ? cr.randomSeat(D) : null; if (!pt) return;
        f.sp.position.set(pt.x, pt.y + 0.95, pt.z); f.max = frng.range(0.14, 0.26); f.life = f.max + frng.next() * 0.5 /* delay */; f.delay = f.life - f.max; f.size = frng.range(0.5, 0.9);
        f.sp.visible = false;
      }
    },
    // vertical sine wave on a flag mesh (x axis = along the flag, anchored at geometry min x). Works for Mesh and InstancedMesh.
    flagWave(mesh, o) {
      if (!mesh || !mesh.material) return mesh;
      o = o || {}; if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox, ax = o.anchor !== undefined ? o.anchor : bb.min.x, ln = o.length || Math.max(0.01, bb.max.x - ax);
      const m = mesh.material.clone(); m.side = T3.DoubleSide; patchMat(m);
      const base = m.onBeforeCompile, amp = { value: o.amp === undefined ? 0.07 : o.amp }, fr = { value: o.freq || 16 }, an = { value: ax }, le = { value: ln };
      m.onBeforeCompile = function (sh) {
        if (base) base.call(this, sh);
        sh.uniforms.uFlagTime = flagTime; sh.uniforms.uFlagAmp = amp; sh.uniforms.uFlagFreq = fr; sh.uniforms.uFlagAn = an; sh.uniforms.uFlagLen = le;
        sh.vertexShader = 'uniform float uFlagTime; uniform float uFlagAmp; uniform float uFlagFreq; uniform float uFlagAn; uniform float uFlagLen;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float fwK = clamp((position.x - uFlagAn) / uFlagLen, 0.0, 1.0);\n float fwPh = 0.0;\n #ifdef USE_INSTANCING\n fwPh = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;\n #endif\n transformed.z += sin(uFlagTime * 8.0 + position.x * uFlagFreq + fwPh) * uFlagAmp * fwK;');
      };
      m.customProgramCacheKey = function () { return 'hpoFlagWave'; };
      m.needsUpdate = true; mesh.material = m; return mesh;
    },
    update(dt, t) {
      if (!fxS.init) return;
      if (t !== undefined && t === fxS.t) return; fxS.t = t === undefined ? -1 : t;
      dt = Math.min(dt || 0.016, 0.1); fxS.clock += dt; flagTime.value = fxS.clock;
      const P = fxS.pools; for (const k in P) P[k].update(dt);
      for (let i = 0; i < fxS.ripples.length; i++) {
        const r = fxS.ripples[i]; if (r.life <= 0) continue;
        r.life -= dt; if (r.life <= 0) { r.mesh.visible = false; continue; }
        const u = 1 - r.life / r.max, s = r.size * (0.25 + 0.75 * (1 - (1 - u) * (1 - u)));
        r.mesh.scale.set(s, s, 1); r.mesh.material.opacity = Math.pow(1 - u, 1.4);
      }
      for (let i = 0; i < fxS.flashes.length; i++) {
        const f = fxS.flashes[i]; if (f.life <= 0) continue;
        f.life -= dt; if (f.life <= 0) { f.sp.visible = false; continue; }
        if (f.life > f.max) { f.sp.visible = false; continue; }
        const u = 1 - f.life / f.max, s = f.size * Math.sin(u * Math.PI) + 0.1; f.sp.visible = true; f.sp.scale.set(s, s, 1); f.sp.material.opacity = 1 - u * 0.4;
      }
      // fireworks
      for (let i = fxS.fw.length - 1; i >= 0; i--) {
        const f = fxS.fw[i]; f.t += dt; if (f.t < 0) continue;
        const Ps = P.spark;
        if (!f.burst) {
          const u = Math.min(1, f.t / f.rise), x = f.lx + (f.cx - f.lx) * u, y = 0.5 + (f.cy - 0.5) * (1 - (1 - u) * (1 - u)), z = f.lz + (f.cz - f.lz) * u;
          Ps.emit(x, y, z, frng.range(-0.3, 0.3), frng.range(-1, 0), frng.range(-0.3, 0.3), 0.4, 3, 1, 0.1, 0.03, 0xffd88a);
          if (u >= 1) {
            f.burst = true; const nb = fxS.mobile ? 22 : 40;
            for (let k = 0; k < nb; k++) {
              const a = frng.next() * TAU, e = frng.range(-1, 1), c = Math.sqrt(1 - e * e), s = frng.range(4.5, 7.5);
              Ps.emit(f.cx, f.cy, f.cz, Math.cos(a) * c * s, e * s, Math.sin(a) * c * s, frng.range(1.3, 2.1), 3.2, 1.5, 0.22, 0.05, k % 2 ? f.c1 : f.c2);
            }
          }
        } else fxS.fw.splice(i, 1);
      }
      if (fxS.net) {
        const n = fxS.net; n.t += dt; const e = Math.exp(-n.t * 7) * Math.sin(n.t * 34);
        n.m.rotation.z = n.base + e * 0.035 * n.a; n.m.position.x = n.bx + e * 0.03 * n.a;
        if (n.t > 0.9) { n.m.rotation.z = n.base; n.m.position.x = n.bx; fxS.net = null; }
      }
    }
  };

  function hookFx() {
    if (fxS.hooked) return; fxS.hooked = true;
    const lastAt = {};
    const gate = (k, min) => { const n = fxS.clock; if (lastAt[k] !== undefined && n - lastAt[k] < min) return false; lastAt[k] = n; return true; };
    BUS.on('match:new', function () { fx.clear(); const m = HPO.mod.match; fx.setVenue(m && m.cfg && m.cfg.venue); });
    BUS.on('ball:bounce', function (e) { if (e && e.p && Math.abs(e.p.x) < 10.6 && Math.abs(e.p.z) < 5.6) fx.dust(e.p, 1); });
    BUS.on('ball:contact', function (e) {
      if (!e || !e.p) return; const s = e.surf || '';
      if (s === 'net' || s === 'netTape') { if (gate('net', 0.15)) fx.netShake(1); return; }
      const glass = s.indexOf('glass') === 0, mesh = s.indexOf('mesh') === 0 || s === 'door';
      if (!glass && !mesh) return;
      if (!gate('rip' + s, 0.08)) return;
      let n = null;
      if (e.vOut && e.vIn) { n = { x: e.vOut.x - e.vIn.x, y: e.vOut.y - e.vIn.y, z: e.vOut.z - e.vIn.z }; }
      if (!n || Math.hypot(n.x, n.y, n.z) < 1e-3) n = s === 'glassBack' || s === 'meshBack' ? { x: -Math.sign(e.p.x), y: 0, z: 0 } : { x: 0, y: 0, z: -Math.sign(e.p.z) };
      const wc = HPO.mod.worldCourt;
      if (glass && wc && wc.glassPanels && wc.glassPanels.length) { // snap to the nearest panel's plane + normal
        let best = null, bd = 9;
        wc.glassPanels.forEach(function (gp) { if (!gp.centre || !gp.normal) return; const d = Math.hypot(gp.centre.x - e.p.x, gp.centre.z - e.p.z); if (d < bd) { bd = d; best = gp; } });
        if (best && bd < 2.2) n = { x: best.normal.x, y: best.normal.y, z: best.normal.z };
      }
      fx.glassRipple(e.p, n, { mesh: mesh });
    });
    BUS.on('shot:hit', function (e) {
      if (!e || !e.p || !e.v || e.warmup) return;
      const sp = Math.hypot(e.v.x, e.v.y, e.v.z), k = String(e.shot || '');
      if ((sp > 21 || k.indexOf('smash') === 0) && gate('spark', 0.08)) fx.spark(e.p, clamp(sp / 22, 0.8, 1.8));
    });
    BUS.on('point:end', function (e) { if (e && e.rallyLen >= 12 && gate('flash', 3)) fx.cameraFlash(5); });
  }

  // =====================================================================================
  // CROWD
  // =====================================================================================
  const CS = { people: 0, sets: [], list: [], key: '', source: 'none', clock: 0, accum: 0, env: { app: 0, cheer: 0, gasp: 0, groan: 0, cel: 0, tens: 0, anti: 0 }, tgt: { app: 0, cheer: 0, gasp: 0, groan: 0, cel: 0, tens: 0, anti: 0 },
    until: { app: 0, cheer: 0, gasp: 0, groan: 0, cel: 0 }, moodBase: 1, energy: 0.3, wave: { on: false, u: 0, dur: 9 }, poll: 0, tmpGroup: null, t: -1, mobile: false,
    mascot: null, mascotSlot: -1, mascotYawK: 99, mascotCheck: 0, hooked: false, lastWave: -99, seat: null };
  const SKIN = [0xf6d3b3, 0xe8b48a, 0xc98f62, 0xa56a43, 0x7a4a2c, 0x56331f];
  const HAIR = [0x1a1410, 0x2a1d14, 0x4a2a16, 0x8a5a2b, 0xd8b25c, 0x9a9a9a, 0xb8401f, 0x0f0f12];
  const CAPS = [BRAND.blue, BRAND.cream, 0xe5484d, 0xf5d90a, BRAND.ink, 0x2fb26b];
  const SHIRT = [[BRAND.cream, 3], [BRAND.blue, 3.5], [BRAND.ink, 1.5], [0xe5484d, 2], [0xf28c28, 1.5], [0xf5d90a, 1.5], [0x2fb26b, 1.5], [0x14b8a6, 1.5], [0x8a5cf6, 1.2], [0xff7ab6, 1.2], [0x9fd8ff, 1.2], [0xffffff, 1.5], [0x3a4a5c, 1]];
  const PANTS = [0x2a3f63, 0x1e2a3c, 0x3b3b3f, 0x6b5a3e, 0x14202e, 0x4a5a78];
  const FLAGC = [BRAND.blue, BRAND.cream, 0xe5484d, 0xf5d90a, 0x2fb26b, 0xff7ab6, 0xf28c28];
  let G_ = null;

  function wpick(r, tab) { let t = 0; tab.forEach(w => { t += w[1]; }); let x = r.next() * t; for (let i = 0; i < tab.length; i++) { x -= tab[i][1]; if (x <= 0) return tab[i][0]; } return tab[0][0]; }

  function spectatorGeos() {
    const dk = 0x15151a;
    return {
      torso: mergeBoxes([{ w: 0.36, h: 0.46, d: 0.2, x: 0, y: 0.25, z: -0.02 }]),
      legs: mergeBoxes([{ w: 0.3, h: 0.14, d: 0.34, y: 0, z: 0.14 }, { w: 0.3, h: 0.34, d: 0.13, y: -0.17, z: 0.3 }, { w: 0.3, h: 0.08, d: 0.2, y: -0.38, z: 0.36, c: 0x777777 }]),
      head: mergeBoxes([{ w: 0.24, h: 0.24, d: 0.24, y: 0.14 }, { w: 0.04, h: 0.04, d: 0.02, x: -0.06, y: 0.15, z: 0.125, c: dk }, { w: 0.04, h: 0.04, d: 0.02, x: 0.06, y: 0.15, z: 0.125, c: dk }]),
      hat: mergeBoxes([{ w: 0.27, h: 0.09, d: 0.27, y: 0.285 }, { w: 0.26, h: 0.04, d: 0.07, y: 0.245, z: 0.15 }, { w: 0.27, h: 0.15, d: 0.05, y: 0.2, z: -0.11 }]),
      arms: mergeBoxes([{ w: 0.08, h: 0.32, d: 0.08, x: -0.22, y: -0.16 }, { w: 0.08, h: 0.32, d: 0.08, x: 0.22, y: -0.16 }]),
      flag: (function () { // hangs from the shoulder along -Y like the arm; cloth extends to +X at the free end
        const g = mergeBoxes([{ w: 0.025, h: 0.7, d: 0.025, x: 0.22, y: -0.4, c: 0xdddddd }]);
        const cl = new T3.PlaneGeometry(0.34, 0.22, 4, 2); cl.translate(0.22 + 0.19, -0.66, 0);
        const col = new Float32Array(cl.attributes.position.count * 3).fill(1); cl.setAttribute('color', new T3.BufferAttribute(col, 3));
        const merged = mergeGeoList([g, cl]); return merged;
      })()
    };
  }
  function mergeGeoList(list) {
    const pos = [], nor = [], col = [], idx = []; let off = 0;
    list.forEach(function (g) {
      const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array, ia = g.index.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); col.push(c[i]); }
      for (let i = 0; i < ia.length; i++) idx.push(ia[i] + off); off += p.length / 3;
    });
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T3.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new T3.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
    return geo;
  }

  function fallbackSlots() {
    const out = [];
    [-1, 1].forEach(function (sd) {
      for (let tier = 0; tier < 6; tier++) for (let x = -11; x <= 11; x += 1) out.push({ x: x, y: 0.55 + tier * 0.6, z: sd * (8.2 + tier * 0.8), tier: tier, side: sd > 0 ? '+z' : '-z' });
    });
    [-1, 1].forEach(function (sd) {
      for (let tier = 0; tier < 4; tier++) for (let z = -6; z <= 6; z += 1) out.push({ x: sd * (13.2 + tier * 0.8), y: 0.55 + tier * 0.6, z: z, tier: tier, side: sd > 0 ? '+x' : '-x' });
    });
    return out;
  }
  function sideOf(s) { return s.side || (Math.abs(s.z) * 1.3 >= Math.abs(s.x) ? (s.z > 0 ? '+z' : '-z') : (s.x > 0 ? '+x' : '-x')); }

  function teardown() {
    CS.sets.forEach(function (S) {
      if (S.group.parent) S.group.parent.remove(S.group);
      const r = RN(); if (r && r.cutaway && r.cutaway.remove) { try { r.cutaway.remove(S.group); } catch (e) { /* ignore */ } }
      S.meshes.forEach(function (m) { m.dispose(); });
    });
    CS.sets = []; CS.list = []; CS.people = 0;
  }

  function build(slots, source) {
    teardown();
    const r = RN(), parent = grp('club') || grp('world') || (r && r.scene);
    if (!parent) return;
    const mobile = CS.mobile || isMobile(), rg = HPO.makeRng(5150);
    const keep = mobile ? 0.42 : 0.86;
    const chosen = [];
    slots.forEach(function (s, idx) { const q = rg.next(); if (q < keep) chosen.push({ s: s, idx: idx }); });
    const geos = spectatorGeos();
    const bySide = {};
    chosen.forEach(function (c) { (bySide[sideOf(c.s)] = bySide[sideOf(c.s)] || []).push(c); });
    const mat = () => patchMat(new T3.MeshLambertMaterial({ vertexColors: true }));
    const flagMat = () => { const m = new T3.MeshLambertMaterial({ vertexColors: true, side: T3.DoubleSide }); return patchMat(m); };
    const colr = new T3.Color();
    let total = 0, nFlags = mobile ? 7 : 14;
    const totalN = chosen.length;
    Object.keys(bySide).forEach(function (side) {
      const list = bySide[side], n = list.length;
      const S = { side: side, n: n, group: new T3.Group(), meshes: [], flagN: 0 };
      S.group.name = 'crowd' + side;
      const mk = (geo, name) => { const m = new T3.InstancedMesh(geo, mat(), n); m.name = name; m.instanceMatrix.setUsage(T3.DynamicDrawUsage); m.frustumCulled = false; m.castShadow = false; m.setColorAt(0, colr.setHex(0xffffff)); S.group.add(m); S.meshes.push(m); return m; };
      S.torso = mk(geos.torso, 'sp_torso'); S.legs = mk(geos.legs, 'sp_legs'); S.head = mk(geos.head, 'sp_head'); S.hat = mk(geos.hat, 'sp_hat'); S.arms = mk(geos.arms, 'sp_arms');
      S.aT = S.torso.instanceMatrix.array; S.aL = S.legs.instanceMatrix.array; S.aH = S.head.instanceMatrix.array; S.aC = S.hat.instanceMatrix.array; S.aA = S.arms.instanceMatrix.array;
      S.list = list;
      const flagIdx = [];
      list.forEach(function (c, li) {
        const s = c.s, id = CS.list.length, P = {
          s: s, slotIdx: c.idx, set: S, li: li, x: s.x, y: s.y, z: s.z,
          fy: Math.atan2(-s.x, -s.z), ph: rg.next() * TAU, sp: 0.8 + rg.next() * 0.45, ju: 0.55 + rg.next() * 0.8, gb: rg.chance(0.5), fl: -1, hidden: false, zeroed: false,
          ua: (Math.atan2(s.z, s.x) + Math.PI) / TAU
        };
        CS.list.push(P);
        S.torso.setColorAt(li, colr.setHex(wpick(rg, SHIRT)));
        S.legs.setColorAt(li, colr.setHex(rg.pick(PANTS)));
        S.head.setColorAt(li, colr.setHex(rg.pick(SKIN)));
        S.hat.setColorAt(li, colr.setHex(rg.chance(0.38) ? rg.pick(CAPS) : rg.pick(HAIR)));
        if (rg.chance(0.07)) P.nohat = true;
      });
      // arms colour = torso colour
      for (let li = 0; li < n; li++) { S.torso.getColorAt(li, colr); S.arms.setColorAt(li, colr); }
      [S.torso, S.legs, S.head, S.hat, S.arms].forEach(function (m) { m.instanceColor.needsUpdate = true; });
      CS.sets.push(S); total += n;
    });
    // flag holders: spread over the sets
    const sets = CS.sets, per = Math.max(1, Math.round(nFlags / Math.max(1, sets.length)));
    sets.forEach(function (S) {
      const cand = CS.list.filter(P => P.set === S && P.s.tier !== undefined);
      const pickN = Math.min(per, cand.length);
      if (!pickN) return;
      S.flagMesh = new T3.InstancedMesh(geos.flag, flagMat(), pickN); S.flagMesh.frustumCulled = false; S.flagMesh.instanceMatrix.setUsage(T3.DynamicDrawUsage); S.flagMesh.setColorAt(0, colr.setHex(0xffffff));
      S.flagMesh.name = 'sp_flag'; S.aF = S.flagMesh.instanceMatrix.array; S.flagN = pickN; S.flagOwner = [];
      for (let k = 0; k < pickN; k++) {
        const P = cand[(rg.next() * cand.length) | 0]; if (P.fl >= 0) { k--; continue; }
        P.fl = k; S.flagOwner.push(P); S.flagMesh.setColorAt(k, colr.setHex(FLAGC[k % FLAGC.length]));
      }
      S.flagMesh.instanceColor.needsUpdate = true;
      fx.flagWave(S.flagMesh, { anchor: 0.26, length: 0.34, amp: 0.06, freq: 18 });
      S.group.add(S.flagMesh); S.meshes.push(S.flagMesh);
    });
    sets.forEach(function (S) {
      parent.add(S.group);
      if (r && r.cutaway && r.cutaway.add) r.cutaway.add(S.group, { role: 'stand', fadeTo: 0.0 });
    });
    CS.people = total; CS.source = source; CS.key = slots.length + ':' + source;
    crowd.count = total; crowd.source = source;
    CS.mascotSlot = -1;
    animate(0, true);
  }

  // matrix writer: M = T(base + Q(posYaw,posLean)*off*s) * Ry(rotYaw) * Rx(rotAng) * S(s, s*sy, s)
  function put(a, i, bx, by, bz, fy, lp, fyr, ar, ox, oy, oz, s, sy) {
    const cy = Math.cos(fy), sn = Math.sin(fy), cl = Math.cos(lp), sl = Math.sin(lp), o = i * 16, oyy = oy * sy;
    a[o + 12] = bx + s * (cy * ox + sn * sl * oyy + sn * cl * oz);
    a[o + 13] = by + s * (cl * oyy - sl * oz);
    a[o + 14] = bz + s * (-sn * ox + cy * sl * oyy + cy * cl * oz);
    a[o + 15] = 1;
    const cY = Math.cos(fyr), sY = Math.sin(fyr), cA = Math.cos(ar), sA = Math.sin(ar), s2 = s * sy;
    a[o] = cY * s; a[o + 1] = 0; a[o + 2] = -sY * s; a[o + 3] = 0;
    a[o + 4] = sY * sA * s2; a[o + 5] = cA * s2; a[o + 6] = cY * sA * s2; a[o + 7] = 0;
    a[o + 8] = sY * cA * s; a[o + 9] = -sA * s; a[o + 10] = cY * cA * s; a[o + 11] = 0;
  }
  function zero(a, i, x, y, z) { const o = i * 16; for (let k = 0; k < 12; k++) a[o + k] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1; }

  function waveAt(P) {
    const w = CS.wave; if (!w.on) return 0;
    let d = P.ua - w.u; d -= Math.round(d); const q = d / 0.075; return Math.exp(-q * q);
  }

  function animate(dt, force) {
    const tt = CS.clock, e = CS.energy, A = CS.env, L = CS.list, N = L.length, mc = CS.mascotSlot;
    for (let i = 0; i < N; i++) {
      const P = L[i], S = P.set, li = P.li;
      const hide = P.slotIdx === mc;
      if (hide) { if (!P.zeroed || force) { zero(S.aT, li, P.x, P.y, P.z); zero(S.aL, li, P.x, P.y, P.z); zero(S.aH, li, P.x, P.y, P.z); zero(S.aC, li, P.x, P.y, P.z); zero(S.aA, li, P.x, P.y, P.z); if (P.fl >= 0) zero(S.aF, P.fl, P.x, P.y, P.z); P.zeroed = true; } continue; }
      P.zeroed = false;
      const ph = P.ph, sp = P.sp;
      const sw = Math.sin(tt * 0.8 * sp + ph);
      let lean = 0.03 * sw * (0.5 + e) + A.tens * 0.2 * (0.7 + 0.3 * Math.sin(ph * 5)) + A.anti * 0.15 - A.groan * 0.07;
      const nod = A.groan * 0.5 + 0.05 * Math.sin(tt * 1.3 * sp + ph * 2);
      const hy = 0.35 * Math.sin(tt * 0.5 * sp + ph * 3) * (0.3 + e * 0.7) * (1 - A.anti * 0.7);
      let dy = Math.max(0, Math.sin(tt * (4 + 3 * e) * sp + ph)) * 0.022 * e;
      let a = -0.12 + 0.05 * sw;
      if (A.app > 0.01) a += (-(1.15 + 0.4 * Math.sin(tt * 15 * sp + ph)) - a) * A.app;
      if (P.gb && A.gasp > 0.01) a += (-2.3 - a) * A.gasp;
      const ch = Math.min(1, A.cheer + A.cel);
      if (ch > 0.01) {
        const j = Math.max(0, Math.sin(tt * 6.5 * sp + ph * (A.cel > 0.5 ? 0.15 : 1)));
        dy += j * 0.3 * P.ju * ch; a += (-(2.65 + 0.35 * Math.sin(tt * 9 * sp + ph)) - a) * Math.min(1, ch * 1.3); lean -= 0.1 * ch;
      }
      let wv = 0;
      if (CS.wave.on) { wv = waveAt(P); if (wv > 0.01) { a += (-2.85 - a) * wv; lean -= 0.08 * wv; } }
      if (P.fl >= 0) a = -2.8 + 0.3 * Math.sin(tt * (3 + 4 * e) * sp + ph);
      const by = P.y + dy, rise = 0.32 * wv, sy = 1 + 0.9 * wv, bz = P.z, bx = P.x, fy = P.fy;
      put(S.aT, li, bx, by + rise, bz, fy, lean, fy, lean, 0, 0, 0, 1, 1);
      put(S.aL, li, bx, P.y + dy + rise * 0.0, bz, fy, 0, fy, 0, 0, 0, 0, 1, sy);
      put(S.aH, li, bx, by + rise, bz, fy, lean, fy + hy, lean + nod, 0, 0.5, 0, 1, 1);
      if (P.nohat) zero(S.aC, li, P.x, P.y, P.z); else put(S.aC, li, bx, by + rise, bz, fy, lean, fy + hy, lean + nod, 0, 0.5, 0, 1, 1);
      put(S.aA, li, bx, by + rise, bz, fy, lean, fy, lean + a, 0, 0.42, 0, 1, 1);
      if (P.fl >= 0) put(S.aF, P.fl, bx, by + rise, bz, fy, lean, fy, lean + a, 0, 0.42, 0, 1, 1);
    }
    CS.sets.forEach(function (S) {
      S.torso.instanceMatrix.needsUpdate = true; S.legs.instanceMatrix.needsUpdate = true; S.head.instanceMatrix.needsUpdate = true; S.hat.instanceMatrix.needsUpdate = true; S.arms.instanceMatrix.needsUpdate = true;
      if (S.flagMesh) S.flagMesh.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- mascot ----
  function buildMascot() {
    const r = RN(); if (CS.mascot || !r) return;
    const M = { group: new T3.Group(), spriteMesh: null, voxel: new T3.Group(), jumpT: -99, nextJump: 4, texture: null, sprite: null, slot: -1, armR: null };
    M.group.name = 'annettaMascot';
    const mat = (hex) => patchMat(new T3.MeshLambertMaterial({ color: hex }));
    const bx = (w, h, d, x, y, z, hex, parent) => { const m = new T3.Mesh(new T3.BoxGeometry(w, h, d), mat(hex)); m.position.set(x, y, z); (parent || M.voxel).add(m); return m; };
    const shirtTex = canvasTex(64, 64, function (g, w, h) { g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, 6); drawMark(g, 30, 36, 34, '#123954', '#177dc5'); });
    const mats = [mat(0xfffaf0), mat(0xfffaf0), mat(0xfffaf0), mat(0xfffaf0), new T3.MeshLambertMaterial({ map: shirtTex }), mat(0xfffaf0)];
    patchMat(mats[4]);
    const body = new T3.Mesh(new T3.BoxGeometry(0.42, 0.46, 0.25), mats); body.position.y = 0.25; M.voxel.add(body);
    bx(0.36, 0.14, 0.36, 0, 0.0, 0.14, BRAND.ink); bx(0.36, 0.34, 0.14, 0, -0.17, 0.3, BRAND.ink); bx(0.14, 0.08, 0.2, -0.1, -0.38, 0.38, 0xf28c28); bx(0.14, 0.08, 0.2, 0.1, -0.38, 0.38, 0xf28c28);
    const head = bx(0.36, 0.32, 0.32, 0, 0.7, 0.0, 0xf2c29b); bx(0.05, 0.06, 0.02, -0.09, 0.72, 0.165, 0x15151a); bx(0.05, 0.06, 0.02, 0.09, 0.72, 0.165, 0x15151a);
    bx(0.07, 0.04, 0.02, -0.14, 0.66, 0.165, 0xff9aa8); bx(0.07, 0.04, 0.02, 0.14, 0.66, 0.165, 0xff9aa8); bx(0.08, 0.025, 0.02, 0, 0.64, 0.165, 0x7a2e2e);
    bx(0.4, 0.12, 0.36, 0, 0.9, 0, BRAND.blue); bx(0.41, 0.05, 0.37, 0, 0.84, 0, BRAND.cream); bx(0.1, 0.1, 0.1, 0, 1.0, 0, BRAND.hl);
    bx(0.08, 0.3, 0.08, -0.25, 0.1, 0, 0xfffaf0);
    M.armR = new T3.Group(); M.armR.position.set(0.25, 0.42, 0); M.voxel.add(M.armR);
    bx(0.08, 0.3, 0.08, 0, -0.15, 0, 0xfffaf0, M.armR); bx(0.025, 0.7, 0.025, 0.02, -0.38, 0, 0xdddddd, M.armR);
    const ftex = canvasTex(64, 40, function (g, w, h) { g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); drawMark(g, 30, 21, 26, '#fffaf0', '#fff4b3'); });
    const cloth = new T3.Mesh(new T3.PlaneGeometry(0.4, 0.26, 6, 2), patchMat(new T3.MeshLambertMaterial({ map: ftex, side: T3.DoubleSide })));
    cloth.position.set(0.22, -0.62, 0); M.armR.add(cloth); fx.flagWave(cloth, { amp: 0.07, freq: 14 });
    M.voxel.scale.setScalar(1.25); M.group.add(M.voxel);
    M.flagGroup = M.armR;
    M.group.visible = false;
    const parent = grp('club') || grp('fx') || r.scene; parent.add(M.group);
    CS.mascot = M; crowd.mascot = M;
    if (CS.pendingTex) crowd.setMascotTexture(CS.pendingTex);
  }
  function camHoriz(out) {
    const r = RN(); if (!r || !r.camera) return null;
    try { r.camera.getWorldDirection(out); const l = Math.hypot(out.x, out.z) || 1; out.x = -out.x / l; out.z = -out.z / l; return out; } catch (e) { return null; }
  }
  const _cd = { x: 0, y: 0, z: 0 };
  function placeMascot() {
    const M = CS.mascot; if (!M || !CS.list.length) return;
    const c = camHoriz(_cd ? new T3.Vector3() : null); if (!c) return;
    const r = RN(), view = r && r.view;
    let best = -1, bs = 1e9;
    for (let i = 0; i < CS.list.length; i++) {
      const P = CS.list[i], s = P.x * c.x + P.z * c.z, l = Math.abs(P.x * c.z - P.z * c.x);
      if (s > -4 || l > 7) continue;
      const sc = (P.s.tier || 0) * 3 + l * 0.5 + (s > -9 ? 4 : 0);
      if (sc < bs) { bs = sc; best = i; }
    }
    if (best < 0) { M.group.visible = false; CS.mascotSlot = -1; return; }
    const P = CS.list[best]; CS.mascotSlot = P.slotIdx; M.slot = best;
    M.group.position.set(P.x, P.y, P.z); M.group.rotation.y = P.fy; M.group.visible = true; M.bx = P.x; M.by = P.y; M.bz = P.z;
    if (M.sprite) M.sprite.position.set(P.x, P.y + 0.9, P.z);
    CS.mascotYaw = view ? view.yaw : 0;
    animate(0, true);
    if (fx.dust) fx.dust({ x: P.x, z: P.z }, 0.5);
  }
  function updateMascot(dt) {
    const M = CS.mascot; if (!M || !M.group.visible) return;
    const t = CS.clock, e = CS.env, ch = Math.min(1, e.cheer + e.cel);
    if (t >= M.nextJump) { M.jumpT = t; M.nextJump = t + 6 + (Math.sin(t * 12.9) * 0.5 + 0.5) * 6; }
    if (ch > 0.5 && t - M.jumpT > 0.9) M.jumpT = t;
    const ju = t - M.jumpT, hop = ju >= 0 && ju < 0.55 ? Math.sin(ju / 0.55 * Math.PI) * 0.28 : 0;
    M.group.position.y = M.by + hop;
    if (M.armR) M.armR.rotation.x = -2.5 + 0.35 * Math.sin(t * (4 + 5 * ch)) - (hop > 0 ? 0.2 : 0);
    if (M.sprite) { M.sprite.position.y = M.by + 0.85 + hop; M.sprite.position.x = M.bx; M.sprite.position.z = M.bz; M.sprite.scale.y = M.sprite.userData.h * (1 + 0.03 * Math.sin(t * 5)); }
  }

  function setEnv(kind, v, dur) {
    const now = CS.clock;
    if (kind === 'tens' || kind === 'anti') { CS.tgt[kind] = v; return; }
    CS.tgt[kind] = Math.max(CS.tgt[kind] * (CS.until[kind] > now ? 1 : 0), v); CS.until[kind] = Math.max(CS.until[kind], now + dur);
  }
  function applyReact(level, kind) {
    level = clamp(level | 0, 0, 3);
    const L = [0, 0.45, 0.75, 1][level];
    switch (kind) {
      case 'applause': setEnv('app', 0.4 + 0.2 * level, 1.4 + 0.9 * level); break;
      case 'cheer': setEnv('cheer', L, 1.1 + 0.8 * level); setEnv('app', 0.6, 2 + level); break;
      case 'ace': case 'smash': case 'winner': setEnv('cheer', L * 0.9, 1.4 + 0.5 * level); setEnv('app', 0.8, 3); break;
      case 'wallSave': case 'longRally': setEnv('cheer', L, 2 + level * 0.6); setEnv('app', 0.9, 4); if (level >= 3) crowd.wave(); break;
      case 'gasp': setEnv('gasp', 0.5 + 0.15 * level, 1.1); break;
      case 'groan': setEnv('groan', 0.4 + 0.2 * level, 1.5); break;
      case 'wave': crowd.wave(); break;
      case 'celebration': setEnv('cel', 1, 16); setEnv('cheer', 1, 16); setEnv('app', 1, 16); break;
      case 'anticipation': setEnv('anti', 1, 0); break;
      default: setEnv('app', 0.3 + 0.2 * level, 1.5 + level);
    }
    CS.boost = Math.max(CS.boost || 0, [0, 0.25, 0.55, 0.9][level]);
  }

  const crowd = HPO.mod.crowd = {
    mood: 1, count: 0, source: 'none', mascot: null, ready: false,
    init(ctx) {
      T3 = (ctx && ctx.THREE) || window.THREE; if (!T3 || !RN() || !RN().groups) return;
      CS.mobile = isMobile(); crowd.ready = true; hookCrowd();
      buildMascot();
      crowd.rebuild();
    },
    rebuild() {
      if (!T3) return;
      const wc = HPO.mod.worldClub, real = wc && wc.seatSlots && wc.seatSlots.length >= 50;
      build(real ? wc.seatSlots : fallbackSlots(), real ? 'club' : 'fallback');
      placeMascot();
    },
    setMood(m) { crowd.mood = clamp(Math.round(m), 0, 3); CS.moodBase = crowd.mood; },
    react(level, kind) { applyReact(level, kind || 'applause'); CS.emitting = true; BUS.emit('crowd:react', { level: clamp(level | 0, 0, 3), kind: kind || 'applause' }); CS.emitting = false; },
    wave(o) { if (CS.clock - CS.lastWave < 4 && CS.wave.on) return; CS.lastWave = CS.clock; CS.wave = { on: true, u: -0.12, dur: (o && o.duration) || 9 }; },
    celebrate(on) { if (on === false) { CS.until.cel = 0; CS.until.cheer = 0; } else applyReact(3, 'celebration'); },
    setOptions(o) {
      o = o || {};
      if (o.mobile !== undefined && !!o.mobile !== CS.mobile) { CS.mobile = !!o.mobile; if (T3 && crowd.ready) crowd.rebuild(); }
      if (fx.setOptions && o.mobile !== undefined) fx.setOptions({ mobile: !!o.mobile });
    },
    setMascotTexture(uri) {
      if (!uri) { if (CS.mascot && CS.mascot.sprite) CS.mascot.sprite.visible = false; if (CS.mascot) CS.mascot.voxel.visible = true; return; }
      CS.pendingTex = uri; const M = CS.mascot; if (!M || typeof Image === 'undefined') return;
      const img = new Image();
      img.onload = function () {
        const tex = new T3.Texture(img); tex.magFilter = T3.NearestFilter; tex.minFilter = T3.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
        const h = 1.55, w = h * img.width / img.height;
        if (!M.sprite) {
          const sm = new T3.SpriteMaterial({ map: tex, transparent: true, depthWrite: true, alphaTest: 0.4 });
          M.sprite = new T3.Sprite(sm); M.sprite.center.set(0.5, 0.0); M.group.parent.add(M.sprite);
        } else { M.sprite.material.map = tex; M.sprite.material.needsUpdate = true; }
        M.sprite.scale.set(w, h, 1); M.sprite.userData.h = h; M.sprite.visible = true; M.spriteTex = tex;
        M.sprite.position.set(M.bx || 0, (M.by || 0) + 0.85, M.bz || 0);
        M.voxel.children.forEach(function (c) { if (c !== M.armR) c.visible = false; }); // keep only the flag arm next to the sprite
        M.armR.position.set(0.55, 0.9, 0.05);
      };
      img.src = uri;
    },
    randomSeat(out) {
      const L = CS.list; if (!L.length) return null; const P = L[(frng.next() * L.length) | 0]; out = out || {}; out.x = P.x; out.y = P.y; out.z = P.z; return out;
    },
    update(dt, t) {
      if (!crowd.ready) return;
      if (t !== undefined && t === CS.t) return; CS.t = t === undefined ? -1 : t;
      dt = Math.min(dt || 0.016, 0.1); CS.clock += dt;
      // slots from worldClub appear late: rebuild once
      CS.poll -= dt;
      if (CS.poll <= 0) {
        CS.poll = 0.7; const wc = HPO.mod.worldClub, n = wc && wc.seatSlots ? wc.seatSlots.length : 0;
        if (n >= 50 && (CS.source !== 'club' || CS.key !== n + ':club')) crowd.rebuild();
        const r = RN(), v = r && r.view; CS.mascotCheck = (CS.mascotCheck || 0) + 1;
        if (v && CS.mascot && Math.abs(v.yaw - (CS.mascotYaw || 0)) > 0.9 && Math.abs(v.yaw - (v.yawT === undefined ? v.yaw : v.yawT)) < 0.05) placeMascot();
      }
      // envelopes
      const now = CS.clock, env = CS.env, tg = CS.tgt;
      ['app', 'cheer', 'gasp', 'groan', 'cel'].forEach(function (k) {
        const want = CS.until[k] > now ? tg[k] : 0, rate = want > env[k] ? 7 : (k === 'cel' ? 1 : 1.6);
        env[k] += (want - env[k]) * Math.min(1, dt * rate);
        if (env[k] < 0.002 && want === 0) { env[k] = 0; tg[k] = 0; }
      });
      env.tens += (tg.tens - env.tens) * Math.min(1, dt * 1.5); env.anti += (tg.anti - env.anti) * Math.min(1, dt * 1.5);
      CS.boost = Math.max(0, (CS.boost || 0) - dt * 0.3);
      const baseE = [0.08, 0.3, 0.5, 0.75][CS.moodBase] || 0.3;
      const eT = clamp(baseE + CS.boost * 0.5 + env.tens * 0.1, 0, 1) * (1 - 0.7 * env.anti);
      CS.energy += (eT - CS.energy) * Math.min(1, dt * 2);
      if (CS.wave.on) { CS.wave.u += dt / CS.wave.dur; if (CS.wave.u > 1.15) CS.wave.on = false; }
      CS.accum += dt;
      if (CS.accum >= 1 / 30) { CS.accum = 0; animate(dt); }
      updateMascot(dt);
    },
    dispose() { teardown(); }
  };

  function hookCrowd() {
    if (CS.hooked) return; CS.hooked = true;
    let wallStreak = 0, maxWall = 0, lastGasp = -9;
    BUS.on('point:start', function (e) { if (e && e.retry) return; wallStreak = 0; maxWall = 0; CS.tgt.tens = 0; });
    BUS.on('shot:hit', function (e) {
      if (!e || e.warmup) return;
      if (e.afterWall && e.shot !== 'serve') { wallStreak++; if (wallStreak > maxWall) maxWall = wallStreak; } else wallStreak = 0;
    });
    BUS.on('rally:stroke', function (e) {
      const n = e && e.n || 0;
      CS.tgt.tens = n >= 8 ? clamp((n - 6) / 12, 0, 1) : 0;
      if (n >= 12 && n % 4 === 0 && CS.clock - lastGasp > 3) { lastGasp = CS.clock; crowd.react(1, 'gasp'); }
    });
    BUS.on('flag:update', function (e) {
      if (!e) return;
      const strong = !!(e.matchPoint || e.golden), soft = !!(e.setPoint || e.breakPoint);
      CS.tgt.anti = strong ? 1 : soft ? 0.5 : 0;
    });
    BUS.on('point:end', function (e) {
      if (!e) return;
      CS.tgt.tens = 0;
      const rl = e.rallyLen || 0, last = (e.shotKinds && e.shotKinds[e.shotKinds.length - 1]) || '';
      let level = rl >= 15 ? 3 : rl >= 8 ? 2 : 1, kind = 'applause';
      if (e.kind === 'ace') { level = 2; kind = 'ace'; }
      else if (e.kind === 'winner' && last.indexOf('smash') === 0) { level = Math.max(2, level); kind = 'smash'; }
      else if (e.kind === 'winner') { kind = level >= 2 ? 'cheer' : 'applause'; }
      else if (e.kind === 'doubleFault' || e.kind === 'unforced') { kind = rl >= 8 ? 'groan' : 'applause'; level = Math.max(1, level - 1); }
      if (maxWall >= 2 && e.kind !== 'doubleFault') { level = Math.max(level, 2); kind = 'wallSave'; }
      if (rl >= 15) kind = 'longRally';
      const st = HPO.mod.rules && HPO.mod.rules.state; if (st && st.over) { level = 3; kind = 'cheer'; }
      crowd.react(level, kind);
      if (level === 3 && CS.clock - CS.lastWave > 25) crowd.wave();
    });
    BUS.on('match:phase', function (e) {
      if (!e) return; const ph = e.phase;
      if (ph === 'intro' || ph === 'toss' || ph === 'introductions') crowd.setMood(1);
      else if (ph === 'walkon') { crowd.setMood(2); crowd.react(2, 'applause'); }
      else if (ph === 'play') crowd.setMood(2);
      else if (ph === 'setBreak') crowd.setMood(1);
      else if (ph === 'matchEnd') { crowd.react(3, 'cheer'); CS.tgt.anti = 0; }
      else if (ph === 'handshake') crowd.react(2, 'applause');
      else if (ph === 'ceremony') { crowd.setMood(3); applyReact(3, 'celebration'); crowd.wave(); }
      else if (ph === 'results') { crowd.celebrate(false); crowd.setMood(1); }
    });
    BUS.on('changeover:start', function () { crowd.setMood(1); });
    BUS.on('changeover:end', function () { crowd.setMood(2); });
    BUS.on('crowd:react', function (e) { if (CS.emitting || !e) return; applyReact(e.level, e.kind); });
    BUS.on('match:new', function () { CS.until = { app: 0, cheer: 0, gasp: 0, groan: 0, cel: 0 }; ['app', 'cheer', 'gasp', 'groan', 'cel', 'tens', 'anti'].forEach(k => { CS.tgt[k] = 0; CS.env[k] = 0; }); CS.wave.on = false; });
  }

  // hook per-frame updates even if the render loop only drives some modules; update() is idempotent per frame time
  BUS.on('boot:ready', function () {
    const r = RN(); if (!r || !r.onFrame) return;
    r.onFrame(function (dt, t) { if (fx.update) fx.update(dt, t); if (crowd.update) crowd.update(dt, t); });
  });
})(HPO);
