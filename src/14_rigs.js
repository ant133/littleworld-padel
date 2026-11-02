// Rigs + actors: blocky pixel-art characters with procedural joint-angle clips (HPO.mod.rigs) and the sim->scene sync (HPO.mod.actors).
// Rig-local frame: +X forward, +Y up, +Z right. Poses are 32 floats (see NAMES); canonical authoring is right-handed, left-handed = mirrored.
(function (HPO) {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const THREE = root.THREE;
  if (!THREE) { HPO.mod.rigs = { init() {} }; HPO.mod.actors = { init() {}, sync() {} }; return; }
  const U = HPO.util, BUS = HPO.BUS;
  const DEG = Math.PI / 180, PI = Math.PI, TAU = Math.PI * 2;
  const clamp = U.clamp, lerp = U.lerp;
  const FADE = 0.12;

  // ---------------------------------------------------------------- colours / geometry
  function rgb(h) { return [(h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255]; }
  function shade(h, f) { const c = rgb(h).map(v => clamp(v * f, 0, 1)); return (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255); }
  function lum(h) { const c = rgb(h); return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]; }
  const SKIN = [0xf6d2b4, 0xe8b48c, 0xb97a50, 0x7a4a2e];
  const FACES = [
    { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
    { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
    { n: [0, 1, 0], v: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
    { n: [0, -1, 0], v: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
    { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
    { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] }
  ];
  const TRI = [0, 1, 2, 0, 2, 3];
  function Bx(s) { this.p = []; this.n = []; this.c = []; this.s = s || 1; }
  Bx.prototype.add = function (cx, cy, cz, w, h, d, hex) {
    const s = this.s, col = rgb(hex); cx *= s; cy *= s; cz *= s; w *= s * 0.5; h *= s * 0.5; d *= s * 0.5;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      for (let i = 0; i < 6; i++) {
        const v = F.v[TRI[i]];
        this.p.push(cx + v[0] * w, cy + v[1] * h, cz + v[2] * d); this.n.push(F.n[0], F.n[1], F.n[2]); this.c.push(col[0], col[1], col[2]);
      }
    }
    return this;
  };
  Bx.prototype.geo = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  };
  const FONT = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111', 6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' };

  const geoCache = {};
  function buildParts(look, female, number) {
    const s = female ? 0.96 : 1, skin = SKIN[look.skin | 0] || SKIN[1];
    const prim = (look.outfit && look.outfit[0]) || 0x1e6bd6, sec = (look.outfit && look.outfit[1]) || 0xffffff;
    const hair = look.hair === undefined ? 0x2a1d14 : look.hair, hs = look.hairStyle || 'short';
    const bottom = look.bottom || (female ? 'skirt' : 'shorts');
    const G = {};
    // pelvis (origin = hip joint height)
    let b = new Bx(s);
    b.add(0, 0.02, 0, 0.22, 0.16, female ? 0.32 : 0.34, sec).add(0, 0.09, 0, 0.224, 0.03, female ? 0.324 : 0.344, prim);
    if (bottom === 'skirt') b.add(0, -0.08, 0, 0.27, 0.2, 0.40, sec).add(0, -0.17, 0, 0.28, 0.025, 0.41, prim);
    G.pelvis = b.geo();
    // torso (origin = spine pivot)
    const tw = female ? 0.37 : 0.40;
    b = new Bx(s);
    b.add(0, 0.22, 0, 0.22, 0.44, tw, prim).add(0, 0.015, 0, 0.226, 0.03, tw + 0.004, sec).add(0, 0.43, 0, 0.226, 0.03, tw + 0.004, sec);
    b.add(0, 0.24, tw / 2 + 0.002, 0.1, 0.3, 0.004, sec).add(0, 0.24, -tw / 2 - 0.002, 0.1, 0.3, 0.004, sec);
    b.add(0.1115, 0.31, 0.09, 0.004, 0.07, 0.07, sec).add(0, 0.47, 0, 0.09, 0.08, 0.09, skin);
    const nstr = String(number == null ? 0 : number), px = 0.032, dcol = lum(prim) < 0.45 ? 0xffffff : 0x1a1a22;
    const totW = nstr.length * 3 * px + (nstr.length - 1) * px; let ox = -totW / 2 + px / 2;
    for (let di = 0; di < nstr.length; di++) {
      const g = FONT[nstr[di]] || FONT[0];
      for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g[r * 3 + c] === '1') b.add(-0.1135, 0.30 - r * px, ox + c * px, 0.004, px, px, dcol);
      ox += 4 * px;
    }
    G.torso = b.geo();
    // head (origin = neck pivot; centre of head box at y=0.15)
    b = new Bx(s);
    b.add(0, 0.15, 0, 0.25, 0.27, 0.25, skin);
    b.add(0.1265, 0.17, 0.055, 0.012, 0.045, 0.04, 0x22232e).add(0.1265, 0.17, -0.055, 0.012, 0.045, 0.04, 0x22232e);
    b.add(0.126, 0.22, 0.055, 0.008, 0.014, 0.05, shade(hair, 0.8)).add(0.126, 0.22, -0.055, 0.008, 0.014, 0.05, shade(hair, 0.8));
    b.add(0.14, 0.12, 0, 0.03, 0.04, 0.035, shade(skin, 0.92)).add(0.1265, 0.075, 0, 0.008, 0.014, 0.06, shade(skin, 0.62));
    b.add(0, 0.15, 0.1265, 0.03, 0.07, 0.016, shade(skin, 0.95)).add(0, 0.15, -0.1265, 0.03, 0.07, 0.016, shade(skin, 0.95));
    const hl = shade(hair, 1.3);
    const capHex = look.cap;
    if (capHex === undefined) {
      if (hs === 'crop') {
        b.add(0, 0.295, 0, 0.27, 0.025, 0.27, hair).add(0, 0.25, 0, 0.27, 0.06, 0.27, shade(hair, 0.9)).add(0, 0.255, 0.0, 0.25, 0.06, 0.25, skin);
        b.add(0, 0.285, 0, 0.268, 0.012, 0.268, hl);
      } else {
        b.add(0, 0.305, 0, 0.27, 0.04, 0.27, hair).add(0, 0.327, 0, 0.2, 0.012, 0.2, hl).add(0.1325, 0.265, 0, 0.012, 0.04, 0.27, hair);
        b.add(0, 0.23, 0.1325, 0.27, 0.11, 0.012, hair).add(0, 0.23, -0.1325, 0.27, 0.11, 0.012, hair).add(-0.1325, 0.19, 0, 0.012, 0.19, 0.27, hair);
      }
    } else {
      b.add(0, 0.305, 0, 0.27, 0.04, 0.27, capHex).add(0.19, 0.285, 0, 0.14, 0.014, 0.2, shade(capHex, 0.8));
      b.add(0, 0.23, 0.1325, 0.27, 0.11, 0.012, hair).add(0, 0.23, -0.1325, 0.27, 0.11, 0.012, hair).add(-0.1325, 0.19, 0, 0.012, 0.19, 0.27, hair);
    }
    if (hs === 'long') b.add(-0.15, 0.06, 0, 0.05, 0.36, 0.27, hair).add(-0.04, 0.07, 0.1325, 0.2, 0.2, 0.012, hair).add(-0.04, 0.07, -0.1325, 0.2, 0.2, 0.012, hair);
    if (hs === 'bob') b.add(-0.15, 0.1, 0, 0.05, 0.2, 0.27, hair).add(-0.04, 0.115, 0.1325, 0.2, 0.15, 0.012, hair).add(-0.04, 0.115, -0.1325, 0.2, 0.15, 0.012, hair);
    if (hs === 'ponytail') b.add(-0.15, 0.24, 0, 0.05, 0.06, 0.06, sec).add(-0.19, 0.12, 0, 0.07, 0.25, 0.07, hair).add(-0.19, 0.0, 0, 0.05, 0.06, 0.05, hl);
    if (hs === 'bun') b.add(-0.07, 0.37, 0, 0.13, 0.1, 0.13, hair).add(-0.07, 0.425, 0, 0.09, 0.02, 0.09, hl);
    if (look.headband !== undefined) {
      const hb = look.headband;
      b.add(0.1275, 0.245, 0, 0.012, 0.035, 0.27, hb).add(0, 0.245, 0.1275, 0.27, 0.035, 0.012, hb).add(0, 0.245, -0.1275, 0.27, 0.035, 0.012, hb).add(-0.1275, 0.245, 0, 0.012, 0.035, 0.27, hb);
    }
    G.head = b.geo();
    // limbs
    b = new Bx(s); b.add(0, -0.115, 0, 0.095, 0.33, 0.095, skin).add(0, -0.03, 0, 0.115, 0.17, 0.115, prim).add(0, 0.045, 0, 0.12, 0.03, 0.12, sec); G.uarm = b.geo();
    b = new Bx(s); b.add(0, -0.13, 0, 0.09, 0.26, 0.09, skin).add(0, -0.235, 0, 0.1, 0.04, 0.1, sec).add(0, -0.30, 0, 0.1, 0.09, 0.1, skin); G.farm = b.geo();
    b = new Bx(s); b.add(0, -0.225, 0, 0.14, 0.45, 0.14, skin);
    if (bottom !== 'skirt') b.add(0, -0.14, 0, 0.15, female ? 0.2 : 0.28, 0.15, sec).add(0, -0.01, 0, 0.152, 0.025, 0.152, prim);
    G.thigh = b.geo();
    b = new Bx(s); b.add(0, -0.19, 0, 0.115, 0.38, 0.115, skin).add(0, -0.29, 0, 0.125, 0.13, 0.125, 0xfafafa)
      .add(0.05, -0.40, 0, 0.27, 0.1, 0.13, 0xf4f4f4).add(0.05, -0.44, 0, 0.27, 0.02, 0.132, 0x2a2a33).add(0.175, -0.395, 0, 0.04, 0.07, 0.136, prim);
    G.shin = b.geo();
    // racket (unscaled; origin at hand, head along -Y, face normal +-Z)
    const rc = look.racket === undefined ? 0x14b8a6 : look.racket, rim = shade(rc, 0.65), hole = lum(rc) > 0.3 ? 0x1b2230 : 0x9aa3b3;
    b = new Bx(1);
    b.add(0, -0.03, 0, 0.04, 0.18, 0.032, 0x2b2f3a).add(0, 0.06, 0, 0.05, 0.03, 0.036, 0xdddddd).add(0, -0.145, 0, 0.034, 0.05, 0.03, 0xc7ccd6);
    const lay = [[-0.17, -0.22, 0.12], [-0.22, -0.27, 0.19], [-0.27, -0.32, 0.23], [-0.32, -0.40, 0.25], [-0.40, -0.46, 0.23], [-0.46, -0.50, 0.18], [-0.50, -0.53, 0.10]];
    lay.forEach(function (l) { const h = l[0] - l[1], cy = (l[0] + l[1]) / 2; b.add(0, cy, 0, l[2], h, 0.036, rim).add(0, cy, 0, l[2] - 0.04, h - 0.01, 0.040, rc); });
    [[-0.225, [-0.035, 0.035]], [-0.275, [-0.07, 0, 0.07]], [-0.325, [-0.075, -0.025, 0.025, 0.075]], [-0.375, [-0.075, -0.025, 0.025, 0.075]], [-0.425, [-0.07, 0, 0.07]], [-0.47, [-0.035, 0.035]]]
      .forEach(function (r) { r[1].forEach(function (x) { b.add(x, r[0], 0, 0.02, 0.02, 0.046, hole); }); });
    G.racket = b.geo();
    return G;
  }
  function partsFor(look, female, number) {
    const key = [female ? 1 : 0, look.skin, look.hair, look.hairStyle, look.outfit && look.outfit[0], look.outfit && look.outfit[1], look.racket, look.headband, look.cap, look.bottom, number].join('|');
    return geoCache[key] || (geoCache[key] = buildParts(look, female, number));
  }
  let propGeo = null;
  function props() {
    if (propGeo) return propGeo;
    const bt = new Bx(1); bt.add(0, 0.0, 0, 0.07, 0.2, 0.07, 0x2aa8e8).add(0, 0.11, 0, 0.04, 0.03, 0.04, 0xffffff).add(0, 0.02, 0, 0.074, 0.06, 0.074, 0xffffff);
    const tw = new Bx(1); tw.add(0, 0, 0, 0.1, 0.16, 0.26, 0xffffff).add(0, 0, 0, 0.104, 0.04, 0.262, 0x177dc5);
    propGeo = { bottle: bt.geo(), towel: tw.geo() }; return propGeo;
  }
  let MAT = null;
  function mat() { return MAT || (MAT = new THREE.MeshLambertMaterial({ vertexColors: true })); }

  // ---------------------------------------------------------------- pose layout
  const NAMES = ['lean', 'twist', 'tilt', 'pelv', 'hn', 'hy', 'ht', 'Rsz', 'Rsx', 'Rsy', 'Rel', 'Lsz', 'Lsx', 'Lsy', 'Lel', 'Rhz', 'Rhx', 'Rky', 'Lhz', 'Lhx', 'Lky',
    'hsx', 'hsz', 'hdy', 'yaw', 'roll', 'pitch', 'rwz', 'rwx', 'rwy', 'two'];
  const NP = NAMES.length, I = {};
  NAMES.forEach(function (n, i) { I[n] = i; });
  const UNIT = new Float32Array(NP).fill(DEG);
  ['hsx', 'hsz', 'hdy', 'two'].forEach(function (n) { UNIT[I[n]] = 1; });
  const SWAPS = [['Rsz', 'Lsz'], ['Rsx', 'Lsx'], ['Rsy', 'Lsy'], ['Rel', 'Lel'], ['Rhz', 'Lhz'], ['Rhx', 'Lhx'], ['Rky', 'Lky']].map(p => [I[p[0]], I[p[1]]]);
  const NEGS = ['twist', 'tilt', 'pelv', 'hy', 'ht', 'hsz', 'yaw', 'roll', 'rwx', 'rwy'].map(n => I[n]);
  function mirror(a) {
    for (let i = 0; i < SWAPS.length; i++) { const x = SWAPS[i][0], y = SWAPS[i][1], t = a[x]; a[x] = a[y]; a[y] = t; }
    for (let i = 0; i < NEGS.length; i++) a[NEGS[i]] = -a[NEGS[i]];
  }
  function pose(base, o) { const a = new Float32Array(base || NP); if (!base) a.fill(0); for (const k in o) a[I[k]] = o[k] * UNIT[I[k]]; return a; }
  const READY = pose(null, { lean: 12, hn: 4, Rsz: 38, Rsx: 10, Rel: 85, Lsz: 40, Lsx: 6, Lel: 80, Rhz: 14, Rhx: 9, Rky: 30, Lhz: 22, Lhx: 9, Lky: 34, rwz: 38, two: 1 });
  const R = o => pose(READY, o);

  // keyframes: [[t, overrides]...] -> sorted keys with Float32Array poses (Catmull-Rom through them)
  function mkKeys(list) { return list.map(function (k) { return { t: k[0], v: k[1] instanceof Float32Array ? k[1] : R(k[1]) }; }); }
  function evalKeys(out, keys, t) {
    const n = keys.length;
    if (t <= keys[0].t) { out.set(keys[0].v); return; }
    if (t >= keys[n - 1].t) { out.set(keys[n - 1].v); return; }
    let i = 0; while (i < n - 2 && t >= keys[i + 1].t) i++;
    const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
    const h = k2.t - k1.t, u = (t - k1.t) / h, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const d1 = i === 0 ? 1 / h : 1 / (k2.t - k0.t), d2 = i === n - 2 ? 1 / h : 1 / (k3.t - k1.t);
    for (let j = 0; j < NP; j++) {
      const p0 = k0.v[j], p1 = k1.v[j], p2 = k2.v[j], p3 = k3.v[j];
      const m1 = (i === 0 ? p2 - p1 : p2 - p0) * d1 * h, m2 = (i === n - 2 ? p2 - p1 : p3 - p1) * d2 * h;
      out[j] = h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
    }
  }

  // ---------------------------------------------------------------- clips
  const CLIPS = {};
  function defKeys(name, dur, contact, list, o) { const c = Object.assign({ name: name, dur: dur, contact: contact || 0, keys: mkKeys(list), loop: false, fn: null, release: dur }, o || {}); CLIPS[name] = c; return c; }
  function defFn(name, dur, fn, o) { const c = Object.assign({ name: name, dur: dur, contact: 0, keys: null, loop: true, fn: fn, release: dur }, o || {}); CLIPS[name] = c; return c; }
  const bump = x => { const v = 0.5 + 0.5 * Math.cos(x); return v * v; };

  const IDLE = R({ lean: 5, hn: 2, Rsz: 30, Rsx: 10, Rel: 75, rwz: 32, Lsz: 22, Lsx: 6, Lel: 50, Rhz: 6, Rky: 12, Lhz: 8, Lhx: 7, Rhx: 7, Lky: 14, two: 0.6 });
  defFn('idle', 1, o => o.set(IDLE));
  const BREATHE = R({ lean: 30, hn: 20, Rsz: 30, Rsx: 6, Rel: 8, Lsz: 30, Lsx: 6, Lel: 8, Rhz: 26, Rky: 52, Lhz: 26, Lky: 52, rwz: 5, two: 0 });
  defFn('breathe', 3.2, (o, t) => { o.set(BREATHE); const b = Math.sin(t / 3.2 * TAU * 3.5); o[I.lean] += b * 3 * DEG; o[I.hdy] += b * 0.006; o[I.Rsz] += b * 2 * DEG; o[I.Lsz] += b * 2 * DEG; }, { noLook: true });

  const GAITS = {
    walk: { A: 26, Kb: 6, K: 40, Kl: 8, Aa: 20, Eb: 30, E: 12, lean: 5, P: 6, Tw: 8, two: 0.45 },
    jog: { A: 40, Kb: 16, K: 70, Kl: 14, Aa: 38, Eb: 85, E: 12, lean: 12, P: 8, Tw: 14, two: 0.12 },
    sprint: { A: 54, Kb: 20, K: 98, Kl: 16, Aa: 56, Eb: 95, E: 10, lean: 20, P: 10, Tw: 18, two: 0 }
  };
  function loco(out, c, g) {
    out.set(READY); const ph = c.phase, s = Math.sin(ph), s2 = -s, sc = clamp(0.75 + 0.1 * c.speed, 0.8, 1.15);
    out[I.Rhz] = g.A * sc * s * DEG; out[I.Lhz] = g.A * sc * s2 * DEG;
    out[I.Rky] = (g.Kb + g.K * bump(ph + 0.35) + g.Kl * 0.5 * bump(ph - PI)) * DEG; out[I.Lky] = (g.Kb + g.K * bump(ph + PI + 0.35) + g.Kl * 0.5 * bump(ph)) * DEG;
    out[I.Rhx] = out[I.Lhx] = 5 * DEG; out[I.hsz] = 0.015 * s; out[I.pelv] = g.P * s * DEG; out[I.twist] = -g.Tw * s * DEG; out[I.lean] = g.lean * DEG;
    out[I.Lsz] = g.Aa * s * DEG; out[I.Lel] = (g.Eb + g.E * (0.5 + 0.5 * s)) * DEG; out[I.Lsx] = 8 * DEG;
    out[I.Rsz] = (34 - 0.3 * g.Aa * s) * DEG; out[I.Rel] = (80 + 6 * s) * DEG; out[I.Rsx] = 10 * DEG; out[I.rwz] = 38 * DEG; out[I.two] = g.two;
  }
  defFn('walk', 1, (o, t, c) => loco(o, c, GAITS.walk));
  defFn('jog', 1, (o, t, c) => loco(o, c, GAITS.jog));
  defFn('sprint', 1, (o, t, c) => loco(o, c, GAITS.sprint));
  defFn('turnRetreat', 1, (o, t, c) => { loco(o, c, c.speed > 4 ? GAITS.sprint : GAITS.jog); o[I.twist] += 28 * DEG; o[I.Rsz] = 62 * DEG; o[I.Rel] = 100 * DEG; o[I.rwz] = 40 * DEG; });
  defFn('shuffle', 1, (o, t, c) => {
    o.set(READY); const ph = c.phase, sg = c.vl >= 0 ? 1 : -1, s = Math.sin(ph);
    o[I.Rhx] = (15 + 18 * sg * s) * DEG; o[I.Lhx] = (15 - 18 * sg * s) * DEG; o[I.Rky] = o[I.Lky] = (36 + 6 * Math.abs(s)) * DEG; o[I.Rhz] = o[I.Lhz] = 14 * DEG;
    o[I.lean] = 11 * DEG; o[I.hsz] = 0.02 * Math.cos(ph); o[I.twist] = 4 * s * DEG;
  });
  defKeys('splitStep', 0.42, 0, [[0, { lean: 10 }], [0.10, { lean: 6, hdy: 0.07, Rky: 6, Lky: 6, Rhz: 4, Lhz: 4, Rhx: 12, Lhx: 12, Rsz: 46, Lsz: 46 }],
    [0.20, { lean: 20, Rky: 58, Lky: 58, Rhz: 34, Lhz: 34, Rhx: 14, Lhx: 14, hn: 6 }], [0.42, { lean: 17, Rky: 46, Lky: 46, Rhz: 30, Lhz: 30, Rhx: 13, Lhx: 13 }]]);

  // ---- strokes (right-handed canonical). fh = forehand (racket side), bh = backhand
  const GS_FH = defKeys('groundstroke', 0.70, 0.24, [[0, {}],
    [0.09, { twist: -38, pelv: -14, lean: 13, tilt: 4, hy: 12, Rsz: -18, Rsx: 38, Rel: 72, rwz: 28, Lsz: 48, Lsx: -14, Lel: 55, two: 0, Rhz: 6, Rky: 40, Lhz: 28, Lky: 30, hsx: -0.05, hsz: 0.02 }],
    [0.24, { twist: 12, pelv: 20, lean: 15, tilt: -4, hy: -8, Rsz: 58, Rsx: 22, Rel: 24, rwz: 55, Lsz: -25, Lsx: 30, Lel: 30, two: 0, Rhz: 22, Rky: 22, Lhz: 34, Lky: 30, hsx: 0.07 }],
    [0.40, { twist: 50, pelv: 30, lean: 10, hy: -30, Rsz: 90, Rsx: -30, Rel: 85, rwz: 20, Lsz: -35, Lsx: 35, Lel: 50, two: 0, Rhz: 24, Rky: 24, Lhz: 30, Lky: 26, hsx: 0.1 }],
    [0.54, { twist: 20, pelv: 10, lean: 12, Rsz: 60, Rsx: -5, Rel: 85, two: 0.5 }], [0.70, {}]], { release: 0.55 });
  GS_FH.bhDef = defKeys('groundstroke_bh', 0.70, 0.24, [[0, {}],
    [0.09, { twist: 42, pelv: 15, lean: 14, tilt: -3, hy: -15, Rsz: 24, Rsx: -18, Rel: 80, rwz: 30, two: 1, Rhz: 20, Rky: 30, Lhz: 8, Lky: 40, hsx: -0.05 }],
    [0.24, { twist: -14, pelv: -20, lean: 15, tilt: 4, hy: 8, Rsz: 55, Rsx: -20, Rel: 30, rwz: 55, two: 1, Rhz: 32, Rky: 24, Lhz: 14, Lky: 32, hsx: 0.07 }],
    [0.40, { twist: -48, pelv: -30, lean: 10, hy: 28, Rsz: 100, Rsx: 0, Rel: 60, rwz: 10, two: 1, hsx: 0.1 }],
    [0.54, { twist: -18, pelv: -10, lean: 12, Rsz: 70, Rel: 80, two: 1 }], [0.70, {}]], { release: 0.55 });
  CLIPS.groundstroke_bh.name = 'groundstroke';
  defKeys('volleyFH', 0.46, 0.12, [[0, {}],
    [0.06, { twist: -18, pelv: -6, lean: 14, Rsz: 22, Rsx: 28, Rel: 80, rwz: 55, Lsz: 30, Lsx: -6, Lel: 60, two: 0.3, hy: 6 }],
    [0.12, { twist: 6, pelv: 6, lean: 16, Rsz: 55, Rsx: 18, Rel: 30, rwz: 78, Lsz: 22, Lsx: 24, Lel: 30, two: 0, hsx: 0.06, Lhz: 34, Lky: 36 }],
    [0.22, { twist: 12, lean: 14, Rsz: 68, Rel: 35, rwz: 70, two: 0.2 }], [0.46, {}]], { release: 0.34 });
  defKeys('volleyBH', 0.46, 0.12, [[0, {}],
    [0.06, { twist: 24, pelv: 8, lean: 14, Rsz: 35, Rsx: -12, Rel: 75, rwz: 50, two: 1 }],
    [0.12, { twist: -8, pelv: -6, lean: 16, Rsz: 55, Rsx: -12, Rel: 30, rwz: 78, two: 1, hsx: 0.06, Rhz: 30, Rky: 30 }],
    [0.22, { twist: -14, lean: 14, Rsz: 66, Rel: 38, rwz: 70, two: 1 }], [0.46, {}]], { release: 0.34 });
  defKeys('bandeja', 0.78, 0.28, [[0, {}],
    [0.14, { twist: -52, pelv: -22, lean: -2, tilt: -6, hy: 30, Rsz: 140, Rsx: 62, Rel: 105, rwz: 15, Lsz: 150, Lsx: 15, Lel: 15, two: 0, Rhz: 4, Rky: 26, Lhz: 30, Lky: 20, hsx: -0.06 }],
    [0.28, { twist: -18, pelv: -8, lean: 2, tilt: -10, Rsz: 155, Rsx: 25, Rel: 18, rwz: 30, Lsz: 90, Lsx: 25, Lel: 30, two: 0, Rhz: 8, Rky: 24 }],
    [0.44, { twist: 25, pelv: 15, lean: 12, Rsz: 85, Rsx: -35, Rel: 55, rwz: 10, Lsz: 30, Lsx: 20, Lel: 45, two: 0 }], [0.62, { lean: 12, Rsz: 55, Rel: 80, two: 0.5 }], [0.78, {}]], { release: 0.62 });
  defKeys('vibora', 0.78, 0.28, [[0, {}],
    [0.14, { twist: -60, pelv: -26, lean: -2, tilt: -8, hy: 34, Rsz: 135, Rsx: 70, Rel: 110, rwz: 10, Lsz: 150, Lsx: 15, Lel: 15, two: 0, Rhz: 4, Rky: 26, Lhz: 30, Lky: 20, hsx: -0.06 }],
    [0.28, { twist: -5, pelv: 0, lean: 4, tilt: -14, Rsz: 150, Rsx: 35, Rel: 22, rwz: 40, Lsz: 80, Lsx: 25, Lel: 30, two: 0, Rhz: 8, Rky: 24 }],
    [0.42, { twist: 40, pelv: 22, lean: 16, Rsz: 80, Rsx: -50, Rel: 60, rwz: 0, Lsz: 20, Lsx: 25, Lel: 45, two: 0 }], [0.62, { lean: 12, Rsz: 55, Rel: 80, two: 0.5 }], [0.78, {}]], { release: 0.62 });
  defKeys('smash', 0.85, 0.30, [[0, {}],
    [0.10, { lean: -6, twist: -40, pelv: -14, hy: 20, Rsz: 85, Rsx: 75, Rsy: 80, Rel: 100, rwz: 10, Lsz: 150, Lsx: 10, Lel: 10, two: 0, Rhz: -4, Rky: 30, Lhz: 30, Lky: 25 }],
    [0.20, { lean: -2, twist: -30, Rsz: 40, Rsx: 70, Rsy: 80, Rel: 120, rwz: 10, Lsz: 130, Lsx: 15, Lel: 20, two: 0, Rky: 20, Lky: 20 }],
    [0.30, { lean: 6, twist: 10, pelv: 12, Rsz: 160, Rsx: 12, Rel: 10, rwz: 25, Lsz: 30, Lsx: 30, Lel: 70, two: 0, hdy: 0.08, Rky: 8, Lky: 8, Rhz: 2, Lhz: 2 }],
    [0.46, { lean: 30, twist: 34, pelv: 20, Rsz: 95, Rsx: -30, Rel: 45, two: 0, Rky: 40, Lky: 40 }], [0.66, { lean: 18, Rsz: 60, Rel: 80, two: 0.5 }], [0.85, {}]], { release: 0.66 });
  defKeys('kickSmash', 0.85, 0.30, [[0, {}],
    [0.10, { lean: -8, twist: -48, pelv: -18, tilt: -8, hy: 24, Rsz: 85, Rsx: 80, Rsy: 80, Rel: 100, rwz: 10, Lsz: 150, Lsx: 20, Lel: 10, two: 0, Rhz: -4, Rky: 30, Lhz: 30, Lky: 25 }],
    [0.20, { lean: -4, twist: -34, Rsz: 40, Rsx: 75, Rsy: 80, Rel: 125, two: 0, Rky: 20, Lky: 20 }],
    [0.30, { lean: 4, twist: 26, pelv: 16, tilt: 14, Rsz: 150, Rsx: 40, Rel: 12, rwz: 20, Lsz: 20, Lsx: 40, Lel: 60, two: 0, hdy: 0.12, Rky: 6, Lky: 6, Rhz: -6, Lhz: 10 }],
    [0.46, { lean: 34, twist: 48, pelv: 26, Rsz: 100, Rsx: -40, Rel: 50, two: 0, Rky: 44, Lky: 44 }], [0.66, { lean: 20, Rsz: 60, Rel: 80, two: 0.5 }], [0.85, {}]], { release: 0.66 });
  defKeys('lowDef', 0.70, 0.20, [[0, {}],
    [0.10, { lean: 30, twist: -14, Rky: 62, Lky: 70, Rhz: 42, Lhz: 30, hsx: -0.1, Rsz: 30, Rsx: 20, Rel: 40, rwz: 20, two: 0.3 }],
    [0.20, { lean: 34, twist: 8, Rky: 78, Lky: 58, Rhz: 55, Lhz: 24, hsx: 0.12, Rsz: 62, Rsx: 14, Rel: 12, rwz: -20, hn: 10, Lsz: -10, two: 0 }],
    [0.36, { lean: 26, Rsz: 90, Rel: 40, rwz: 5, Rky: 60, Lky: 50, two: 0.3 }], [0.52, { lean: 18, Rky: 40, Lky: 40 }], [0.70, {}]], { release: 0.52 });
  defKeys('wallPrep', 0.75, 0.22, [[0, {}],
    [0.10, { yaw: -35, twist: -30, lean: 5, hy: 50, Rsz: 95, Rsx: 55, Rel: 95, rwz: 20, Lsz: 60, Lsx: -10, Lel: 50, two: 0, Rhz: 10, Rky: 30, Lky: 36, Lhz: 24 }],
    [0.22, { yaw: -20, twist: -8, lean: 10, hy: 25, Rsz: 100, Rsx: 20, Rel: 30, rwz: 40, Lsz: 40, two: 0 }],
    [0.38, { yaw: 10, twist: 20, Rsz: 85, Rsx: -20, Rel: 60, two: 0 }], [0.55, { yaw: 5, lean: 12, Rsz: 60, Rel: 80, two: 0.5 }], [0.75, {}]], { release: 0.58 });
  defFn('serveBounce', 0.7, (o, t) => {
    o.set(R({ lean: 9, hn: 10, Rsz: 18, Rsx: 12, Rel: 55, rwz: 25, Lsz: 42, Lsx: 4, Lel: 40, two: 0, Rhz: 14, Rky: 24, Lhz: 22, Lky: 28 }));
    const b = Math.sin(t / 0.7 * TAU); o[I.Rky] += b * 5 * DEG; o[I.Lky] += b * 5 * DEG;
  });
  defKeys('serveHit', 0.55, 0.18, [[0, { lean: 9, twist: -8, Rsz: 20, Rsx: 12, Rel: 55, rwz: 5, Lsz: 30, Lel: 40, two: 0, hn: 12 }],
    [0.09, { twist: -24, pelv: -10, lean: 12, Rsz: -32, Rsx: 15, Rel: 25, rwz: 8, Lsz: 55, Lsx: -5, Lel: 30, two: 0, hsx: -0.04, Rky: 34, Lky: 30 }],
    [0.18, { twist: 6, pelv: 10, lean: 20, hn: 20, Rsz: 38, Rsx: 14, Rel: 12, rwz: 30, Lsz: 10, Lel: 30, two: 0, hsx: 0.06, Rky: 38, Lky: 44, Lhz: 36, Rhz: 24 }],
    [0.34, { twist: 20, lean: 12, Rsz: 98, Rsx: 6, Rel: 48, rwz: 20, Lsz: 10, two: 0, hsx: 0.1 }], [0.55, {}]], { release: 0.4 });

  // ---- scripted / ceremony
  const CYC = (name, dur, list, o) => defKeys(name, dur, 0, list, Object.assign({ loop: true, noLook: true }, o || {}));
  CYC('celebrate', 1.6, [[0, { lean: 6, Rsz: 40, Lsz: 40, two: 0 }], [0.2, { lean: 14, Rky: 50, Lky: 50, Rhz: 30, Lhz: 30, Rsz: 30, Lsz: 30, two: 0 }],
    [0.45, { lean: -6, hdy: 0.14, Rky: 4, Lky: 4, Rhz: 0, Lhz: 0, Rsz: 160, Lsz: 160, Rsx: 22, Lsx: 22, Rel: 20, Lel: 20, two: 0, hn: -10 }], [0.7, { lean: 10, Rky: 40, Lky: 40, Rsz: 100, Lsz: 40, Rel: 60, two: 0 }],
    [1.0, { lean: 0, Rsz: 130, Rsx: 20, Rel: 100, Lsz: 20, Lel: 30, two: 0, hn: -6 }], [1.3, { lean: 0, Rsz: 120, Rsx: 20, Rel: 95, two: 0 }], [1.6, { lean: 6, Rsz: 40, Lsz: 40, two: 0 }]]);
  CYC('encourage', 1.4, [[0, { lean: 8, Rsz: 60, Lsz: 60, Rel: 60, Lel: 60, Rsx: -10, Lsx: -10, two: 0 }], [0.2, { lean: 8, Rsz: 78, Lsz: 78, Rel: 50, Lel: 50, Rsx: -18, Lsx: -18, rwz: 20, two: 0 }],
    [0.4, { lean: 8, Rsz: 60, Lsz: 60, Rel: 60, Lel: 60, two: 0 }], [0.6, { lean: 8, Rsz: 78, Lsz: 78, Rel: 50, Lel: 50, Rsx: -18, Lsx: -18, rwz: 20, two: 0 }], [0.8, { lean: 6, Rsz: 60, Lsz: 60, Rel: 60, Lel: 60, two: 0 }], [1.4, { lean: 6, Rsz: 40, Lsz: 40, Rel: 70, Lel: 70, two: 0 }]]);
  CYC('frustration', 1.6, [[0, { lean: 20, hn: 18, Rsz: 10, Rel: 30, Lsz: 10, Lel: 30, two: 0 }], [0.3, { lean: 22, hn: 20, hy: 28, Rsz: 25, Rel: 50, two: 0 }], [0.5, { lean: 22, hn: 20, hy: -28, Rsz: 5, Rel: 20, two: 0 }],
    [0.7, { lean: 22, hy: 28, Rsz: 40, Rel: 60, two: 0 }], [0.85, { lean: 22, hy: 0, Rsz: 2, Rel: 12, Rsx: 5, two: 0 }], [1.2, { lean: 18, hy: -10, Rsz: 8, Rel: 28, two: 0 }], [1.6, { lean: 20, hn: 18, Rsz: 10, Rel: 30, two: 0 }]]);
  defFn('twirl', 1.6, (o, t) => { o.set(R({ lean: 4, Rsz: 50, Rsx: 14, Rel: 100, Lsz: 20, Lel: 40, two: 0 })); o[I.rwz] = (t / 0.7) * TAU; o[I.hdy] = 0.004 * Math.sin(t * 8); }, { noLook: true });
  defFn('towel', 2.0, (o, t) => { o.set(R({ lean: 8, hn: 8, Rsz: 20, Rel: 45, rwz: 10, Lsz: 118, Lsx: -12, Lel: 135, Rhz: 8, Lhz: 8, Rky: 14, Lky: 14, two: 0 })); const w = Math.sin(t * 9); o[I.Lsz] += 10 * w * DEG; o[I.Lel] += 6 * w * DEG; o[I.ht] = 6 * w * DEG; }, { props: 'towel', noLook: true });
  defFn('drink', 4.2, (o, t) => {
    o.set(R({ lean: 6, Rsz: 18, Rel: 45, rwz: 10, Rhz: 8, Lhz: 8, Rky: 14, Lky: 14, two: 0 }));
    const k = clamp(t < 0.6 ? t / 0.6 : t < 2.4 ? 1 : t < 3.0 ? 1 - (t - 2.4) / 0.6 : 0, 0, 1), e = k * k * (3 - 2 * k);
    o[I.Lsz] = (25 + 105 * e) * DEG; o[I.Lel] = (40 + 100 * e) * DEG; o[I.Lsx] = 8 * DEG; o[I.hn] = (4 - 24 * e) * DEG; o[I.lean] = (6 - 4 * e) * DEG;
  }, { props: 'bottle', noLook: true });
  defFn('handshake', 1.6, (o, t) => { o.set(R({ lean: 6, hn: 8, Rsz: 80, Rsx: -4, Rel: 18, rwz: -50, Lsz: 14, Lel: 40, Rhz: 8, Lhz: 8, Rky: 12, Lky: 12, two: 0 })); o[I.Rsz] += 7 * Math.sin(t * 18) * DEG; }, { racket: 'hide', noLook: true });
  defKeys('trophyLift', 2.8, 0, [[0, { lean: 6, Rsz: 70, Lsz: 70, Rel: 90, Lel: 90, Rsx: -10, Lsx: -10, two: 0 }], [0.9, { lean: 0, Rsz: 120, Lsz: 120, Rel: 60, Lel: 60, Rsx: 5, Lsx: 5, two: 0 }],
    [1.5, { lean: -8, hn: -8, Rsz: 168, Lsz: 168, Rel: 20, Lel: 20, Rsx: 15, Lsx: 15, two: 0 }], [1.9, { lean: -12, hn: -12, Rsz: 170, Lsz: 170, Rel: 18, Lel: 18, Rsx: 15, Lsx: 15, hdy: 0.05, Rky: 6, Lky: 6, two: 0 }],
    [2.3, { lean: -8, hn: -8, Rsz: 168, Lsz: 168, Rel: 20, Lel: 20, Rsx: 15, Lsx: 15, two: 0 }], [2.8, { lean: -8, hn: -8, Rsz: 168, Lsz: 168, Rel: 20, Lel: 20, Rsx: 15, Lsx: 15, two: 0 }]], { racket: 'hide', noLook: true });
  CYC('victory', 1.4, [[0, { lean: -4, Rsz: 150, Lsz: 150, Rsx: 50, Lsx: 50, Rel: 15, Lel: 15, two: 0, hn: -10, Rky: 20, Lky: 20 }], [0.35, { lean: -8, hdy: 0.14, Rsz: 160, Lsz: 160, Rsx: 55, Lsx: 55, Rel: 10, Lel: 10, two: 0, hn: -14, Rky: 4, Lky: 4, Rhz: 0, Lhz: 0 }],
    [0.7, { lean: -4, Rsz: 150, Lsz: 150, Rsx: 50, Lsx: 50, Rel: 15, Lel: 15, two: 0, hn: -10, Rky: 30, Lky: 30, Rhz: 14, Lhz: 14 }], [1.05, { lean: -8, hdy: 0.14, Rsz: 160, Lsz: 160, Rsx: 55, Lsx: 55, Rel: 10, Lel: 10, two: 0, Rky: 4, Lky: 4, Rhz: 0, Lhz: 0 }], [1.4, { lean: -4, Rsz: 150, Lsz: 150, Rsx: 50, Lsx: 50, Rel: 15, Lel: 15, two: 0, Rky: 20, Lky: 20 }]]);
  defKeys('dive', 1.2, 0, [[0, {}], [0.15, { pitch: 55, hdy: -0.15, hsx: 0.2, Rsz: 160, Lsz: 160, Rel: 20, Lel: 20, Rhz: -20, Lhz: -10, Rky: 20, Lky: 40, lean: 0, two: 0 }],
    [0.35, { pitch: 82, hdy: -0.5, hsx: 0.5, Rsz: 175, Lsz: 175, Rsx: 10, Lsx: 10, Rel: 8, Lel: 8, Rhz: -30, Lhz: -20, Rky: 10, Lky: 30, lean: -12, hn: -20, two: 0 }],
    [0.8, { pitch: 84, hdy: -0.55, hsx: 0.7, Rsz: 175, Lsz: 175, Rel: 8, Lel: 8, Rhz: -30, Lhz: -20, Rky: 10, Lky: 30, lean: -12, hn: -20, two: 0 }], [1.2, { pitch: 40, hdy: -0.3, hsx: 0.5, lean: 30, Rsz: 60, Lsz: 60, Rky: 60, Lky: 60, Rhz: 40, Lhz: 40, two: 0 }]], { noLook: true });

  function resolveClip(name, fh) { const c = CLIPS[name] || CLIPS.idle; return fh === false && c.bhDef ? c.bhDef : c; }
  const LOCO = { idle: 1, walk: 1, jog: 1, sprint: 1, shuffle: 1, turnRetreat: 1 };
  const NV = { groundstroke: 0.15, volleyFH: 0.05, volleyBH: 0.05, bandeja: -0.3, vibora: -0.35, smash: -0.7, kickSmash: -0.65, lowDef: 0.5, wallPrep: 0.35, serveHit: 0.2 };

  // ---------------------------------------------------------------- IK helpers (rig-root-local frame)
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3(), v5 = new THREE.Vector3(), v6 = new THREE.Vector3();
  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), q4 = new THREE.Quaternion(), q5 = new THREE.Quaternion();
  const w1 = new THREE.Vector3(), w2 = new THREE.Vector3(), w3 = new THREE.Vector3(), w4 = new THREE.Vector3(), wq1 = new THREE.Quaternion(), wq2 = new THREE.Quaternion(), wm = new THREE.Matrix4();
  function armIK(rig, side, H, w) {
    const ua = rig.uarm[side], fa = rig.farm[side], a = rig.dim.ua, b = rig.dim.fa, qs = rig.qSpine;
    const S = v1.copy(ua.position).applyMatrix4(rig.mSpine);
    q1.copy(qs).multiply(ua.quaternion);
    const Ecur = v2.set(0, -a, 0).applyQuaternion(q1).add(S);
    const dn = v3.copy(H).sub(S), L = Math.max(dn.length(), 1e-4); dn.multiplyScalar(1 / L);
    const Lc = clamp(L, Math.abs(a - b) + 0.04, (a + b) * 0.998);
    const cosA = (a * a + Lc * Lc - b * b) / (2 * a * Lc), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const pole = v4.copy(Ecur).sub(S); pole.addScaledVector(dn, -pole.dot(dn));
    if (pole.lengthSq() < 1e-6) { pole.set(0, -1, 0); pole.addScaledVector(dn, -pole.dot(dn)); }
    pole.normalize();
    const E = v5.copy(S).addScaledVector(dn, a * cosA).addScaledVector(pole, a * sinA);
    v6.copy(Ecur).sub(S).normalize(); v2.copy(E).sub(S).normalize();
    q2.setFromUnitVectors(v6, v2);
    q3.copy(q2).multiply(q1);                     // new world upper quat
    q4.copy(qs).invert().multiply(q3);            // local
    ua.quaternion.slerp(q4, w);
    q1.copy(qs).multiply(ua.quaternion);          // Qu blended
    const Eb = v5.set(0, -a, 0).applyQuaternion(q1).add(S);
    q3.copy(q1).multiply(fa.quaternion);          // Qf'
    v6.set(0, -1, 0).applyQuaternion(q3);
    const des = v4.copy(S).addScaledVector(dn, Lc).sub(Eb).normalize();
    q2.setFromUnitVectors(v6, des); q5.identity().slerp(q2, w);
    q3.premultiply(q5);                           // Qf new world
    fa.quaternion.copy(q1.invert().multiply(q3));
    ua.updateMatrix(); fa.updateMatrix();
  }

  // ---------------------------------------------------------------- Rig
  function Rig(look, o) {
    o = o || {};
    this.look = look || {}; this.female = !!o.female; this.hand = o.hand === 'L' ? 'L' : 'R'; this.number = o.number;
    this.s = this.female ? 0.96 : 1;
    this.dim = { ua: 0.28 * this.s, fa: 0.30 * this.s, hc: 0.345, leg: 0.45 * this.s };
    this.root = new THREE.Group(); this.root.name = 'rig';
    this.pose = new Float32Array(NP); this.blend = new Float32Array(NP); this.snap = new Float32Array(NP); this.tmp = new Float32Array(NP); this.tmp2 = new Float32Array(NP);
    this.snap.set(READY); this.blend.set(READY); this.pose.set(READY);
    this.clip = CLIPS.idle; this.clipT = 0; this.fade = 1; this.driven = false; this.rate = 1; this.mir = this.hand === 'L'; this.fhFlag = true;
    this.ctx = { speed: 0, phase: 0, vf: 0, vl: 0, fat: 0, t: 0 };
    this.realT = Math.random() * 10; this.fat = 0; this.lookYaw = 0; this.lookPitch = 0; this.lookY = 0; this.lookP = 0; this.look_on = true;
    this.hit = null; this.ikFree = null; this.heading = 0; this.held = null; this.highlighted = false;
    this.mSpine = new THREE.Matrix4(); this.qSpine = new THREE.Quaternion(); this.rpos = new THREE.Vector3();
    this.rig_visible = true;
    this._build();
  }
  const Rp = Rig.prototype;
  Rp._build = function () {
    const G = partsFor(this.look, this.female, this.number), m = mat(), s = this.s, self = this;
    function J(geo, order) { const x = new THREE.Mesh(geo, m); x.matrixAutoUpdate = false; x.rotation.order = order || 'ZXY'; return x; }
    function G0(order) { const x = new THREE.Group(); x.matrixAutoUpdate = false; x.rotation.order = order || 'ZXY'; return x; }
    this.parts = G;
    this.hips = G0('YZX'); this.root.add(this.hips);
    this.pelvis = J(G.pelvis, 'YZX'); this.hips.add(this.pelvis);
    this.spine = J(G.torso, 'YZX'); this.spine.position.set(0, 0.08 * s, 0); this.spine.updateMatrix(); this.pelvis.add(this.spine);
    this.head = J(G.head, 'YZX'); this.head.position.set(0, 0.44 * s, 0); this.head.updateMatrix(); this.spine.add(this.head);
    this.thigh = [J(G.thigh), J(G.thigh)]; this.shin = [J(G.shin), J(G.shin)]; this.uarm = [J(G.uarm), J(G.uarm)]; this.farm = [J(G.farm), J(G.farm)];
    for (let k = 0; k < 2; k++) {
      const z = (k === 0 ? 1 : -1);
      this.thigh[k].position.set(0, 0, 0.10 * s * z); this.thigh[k].updateMatrix(); this.hips.add(this.thigh[k]);
      this.shin[k].position.set(0, -0.45 * s, 0); this.shin[k].updateMatrix(); this.thigh[k].add(this.shin[k]);
      this.uarm[k].position.set(0, 0.36 * s, 0.255 * s * z); this.uarm[k].updateMatrix(); this.spine.add(this.uarm[k]);
      this.farm[k].position.set(0, -0.28 * s, 0); this.farm[k].updateMatrix(); this.uarm[k].add(this.farm[k]);
    }
    this.racket = J(G.racket, 'ZXY'); this.racket.position.set(0, -0.30 * s, 0); this.racket.updateMatrix();
    this.farm[this.mir ? 1 : 0].add(this.racket);
    // props
    const P = props();
    this.bottle = new THREE.Mesh(P.bottle, m); this.bottle.visible = false; this.bottle.position.set(0.06, -0.34, 0.0); this.bottle.rotation.set(0, 0, 0.3);
    this.towel = new THREE.Mesh(P.towel, m); this.towel.visible = false; this.towel.position.set(0.06, -0.38, 0);
    // shadow + highlight ring
    if (!Rig.shadowGeo) {
      Rig.shadowGeo = new THREE.CircleGeometry(1, 14); Rig.shadowGeo.rotateX(-Math.PI / 2);
      Rig.shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      Rig.ringGeo = new THREE.RingGeometry(0.46, 0.58, 20); Rig.ringGeo.rotateX(-Math.PI / 2);
      Rig.ringMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.85, depthWrite: false });
    }
    this.shadow = new THREE.Mesh(Rig.shadowGeo, Rig.shadowMat); this.shadow.position.y = 0.02; this.shadow.scale.set(0.46, 1, 0.4); this.shadow.renderOrder = 1; this.root.add(this.shadow);
    this.ring = new THREE.Mesh(Rig.ringGeo, Rig.ringMat); this.ring.position.y = 0.025; this.ring.visible = false; this.root.add(this.ring);
    this._attachProps();
    this._apply(this.pose);
  };
  Rp._attachProps = function () {
    const free = this.mir ? 0 : 1;
    this.farm[free].add(this.bottle); this.farm[free].add(this.towel);
    this.farm[this.mir ? 1 : 0].add(this.racket);
  };
  Rp.setRacketHand = function (h) {
    const m = h === 'L'; if (m === this.mir) return;
    this.mir = m; this._attachProps();
  };
  Rp.attachRacket = function (h) { this.setRacketHand(h || this.hand); this.racket.visible = true; };
  Rp.setLook = Rp.setLookDef = function (look, o) {
    this.look = look || {}; if (o) { if (o.female !== undefined) this.female = !!o.female; if (o.number !== undefined) this.number = o.number; }
    const G = partsFor(this.look, this.female, this.number); this.parts = G;
    this.pelvis.geometry = G.pelvis; this.spine.geometry = G.torso; this.head.geometry = G.head; this.racket.geometry = G.racket;
    for (let k = 0; k < 2; k++) { this.thigh[k].geometry = G.thigh; this.shin[k].geometry = G.shin; this.uarm[k].geometry = G.uarm; this.farm[k].geometry = G.farm; }
  };
  Rp.look_ = Rp.setLook;
  Rp.beginClip = function (def, fh, fade) {
    this.snap.set(this.blend); this.clip = def; this.clipT = 0; this.fade = fade === undefined ? 0 : fade; this.fhFlag = fh;
    this.bottle.visible = def.props === 'bottle'; this.towel.visible = def.props === 'towel';
    this.racket.visible = def.racket !== 'hide';
  };
  Rp.play = function (name, o) {
    o = o || {}; const def = resolveClip(name, o.fh);
    if (def === this.clip && !o.restart) { return this; }
    this.beginClip(def, o.fh, o.fade === undefined ? 0 : o.fade); this.driven = !!o.driven; this.rate = o.rate || 1; if (o.t) this.clipT = o.t; return this;
  };
  Rp.setClipTime = function (t) { this.clipT = t < 0 ? 0 : t; this.driven = true; };
  Rp.setPose = function (s) {
    if (s.heading !== undefined) this.root.rotation.y = -s.heading, this.heading = s.heading;
    if (s.speed !== undefined) this.ctx.speed = s.speed;
    if (s.clip) this.play(s.clip, { fh: s.swing ? s.swing.fh : s.fh });
    if (s.t !== undefined) this.setClipTime(s.t);
  };
  Rp.setHitTarget = function (x, y, z, dx, dy, dz) {
    if (x === null) { this.hit = null; return; }
    const h = this.hit || (this.hit = { p: new THREE.Vector3(), n: new THREE.Vector3() });
    h.p.set(x, y, z); h.n.set(dx, dy, dz);
  };
  Rp.setFreeTarget = function (x, y, z) { if (x === null) { this.ikFree = null; return; } (this.ikFree || (this.ikFree = new THREE.Vector3())).set(x, y, z); };
  Rp.setLookAt = function (yaw, pitch) { this.lookYaw = yaw; this.lookPitch = pitch; };
  Rp.toLocal = function (x, y, z, out) {
    const r = this.root, th = r.rotation.y, c = Math.cos(th), s = Math.sin(th), dx = x - r.position.x, dz = z - r.position.z;
    return out.set(dx * c - dz * s, y - r.position.y, dx * s + dz * c);
  };
  Rp.dirToLocal = function (x, y, z, out) { const th = this.root.rotation.y, c = Math.cos(th), s = Math.sin(th); return out.set(x * c - z * s, y, x * s + z * c); };
  Rp.setVisible = function (v) { this.root.visible = v; };
  Rp.highlight = function (v) { this.highlighted = v; this.ring.visible = v; };
  Rp.holdTrophy = function (obj) { if (this.held && this.held.parent === this.root) this.root.remove(this.held); this.held = obj || null; if (obj) this.root.add(obj); };

  // pose (radians) -> joint transforms
  Rp._apply = function (P) {
    const s = this.s, LT = this.dim.leg;
    const cr = Math.cos(P[I.Rhx]), cl = Math.cos(P[I.Lhx]);
    const hR = LT * (Math.cos(P[I.Rhz]) + Math.cos(P[I.Rhz] - P[I.Rky])) * cr, hL = LT * (Math.cos(P[I.Lhz]) + Math.cos(P[I.Lhz] - P[I.Lky])) * cl;
    this.hips.position.set(P[I.hsx], Math.max(hR, hL) + P[I.hdy], P[I.hsz]);
    this.hips.rotation.set(P[I.roll], P[I.yaw], -P[I.pitch]); this.hips.updateMatrix();
    this.pelvis.rotation.set(0, P[I.pelv], 0); this.pelvis.updateMatrix();
    this.spine.rotation.set(P[I.tilt], P[I.twist], -P[I.lean]); this.spine.updateMatrix();
    this.head.rotation.set(P[I.ht], P[I.hy], -P[I.hn]); this.head.updateMatrix();
    this.thigh[0].rotation.set(-P[I.Rhx], 0, P[I.Rhz]); this.thigh[1].rotation.set(P[I.Lhx], 0, P[I.Lhz]);
    this.shin[0].rotation.set(0, 0, -P[I.Rky]); this.shin[1].rotation.set(0, 0, -P[I.Lky]);
    this.uarm[0].rotation.set(-P[I.Rsx], P[I.Rsy], P[I.Rsz]); this.uarm[1].rotation.set(P[I.Lsx], -P[I.Lsy], P[I.Lsz]);
    this.farm[0].rotation.set(0, 0, P[I.Rel]); this.farm[1].rotation.set(0, 0, P[I.Lel]);
    this.racket.rotation.set(P[I.rwx], P[I.rwy], P[I.rwz]);
    for (let k = 0; k < 2; k++) { this.thigh[k].updateMatrix(); this.shin[k].updateMatrix(); this.uarm[k].updateMatrix(); this.farm[k].updateMatrix(); }
    this.racket.updateMatrix();
    this.mSpine.copy(this.hips.matrix).multiply(this.pelvis.matrix).multiply(this.spine.matrix);
    this.qSpine.setFromRotationMatrix(this.mSpine);
  };

  // racket-arm IK: head centre -> T (root-local), face normal -> n (root-local), blended by w
  const hD = new THREE.Vector3(), hE = new THREE.Vector3(), BIAS = [0.9, 0.5, 0.2, 0, -0.3];
  Rp._racketIK = function (T, n, w) {
    const side = this.mir ? 1 : 0, ua = this.uarm[side], fa = this.farm[side], rk = this.racket, qs = this.qSpine;
    wq1.copy(qs).multiply(ua.quaternion).multiply(fa.quaternion).multiply(rk.quaternion);   // Qr current
    const zc = w2.set(0, 0, 1).applyQuaternion(wq1);
    const nn = w3.copy(n); if (zc.dot(nn) < 0) nn.negate();
    const Sh = w1.copy(ua.position).applyMatrix4(this.mSpine), axis = w4;
    const dd = hD.copy(T).sub(Sh).normalize(), hcl = this.dim.hc, lim = (this.dim.ua + this.dim.fa) * 0.96;
    for (let bi = 0; bi < 5; bi++) {
      axis.copy(dd); axis.y += BIAS[bi]; axis.addScaledVector(nn, -axis.dot(nn));
      if (axis.lengthSq() < 0.09) { axis.set(0, 1, 0); axis.addScaledVector(nn, -axis.dot(nn)); if (axis.lengthSq() < 0.09) axis.set(0, 0, 1).addScaledVector(nn, -nn.z); }
      axis.normalize();
      if (hE.copy(T).addScaledVector(axis, -hcl).sub(Sh).length() <= lim) break;
    }
    const Yw = axis.negate(); const Xw = hE.copy(Yw).cross(nn);
    wm.makeBasis(Xw, Yw, nn); wq2.setFromRotationMatrix(wm);                                // Qr desired
    const HT = w1.set(0, this.dim.hc, 0).applyQuaternion(wq2).add(T);
    armIK(this, side, HT, w);
    wq1.copy(qs).multiply(ua.quaternion).multiply(fa.quaternion).invert().multiply(wq2);
    rk.quaternion.slerp(wq1, w); rk.updateMatrix();
  };
  const hT = new THREE.Vector3(), hN = new THREE.Vector3(), hHand = new THREE.Vector3();
  Rp.update = function (dt, simDt) {
    if (!this.root.visible) return;
    this.realT += dt; const c = this.ctx, def = this.clip;
    if (!this.driven) this.clipT += (simDt === undefined ? dt : simDt) * this.rate;
    let t = this.clipT; if (def.loop) t = t % def.dur;
    const A = this.tmp;
    c.t = this.realT;
    if (def.fn) def.fn(A, t, c); else evalKeys(A, def.keys, t);
    if (this.mir) mirror(A);
    // blend
    const B = this.blend;
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + dt / FADE); const f = this.fade * this.fade * (3 - 2 * this.fade); for (let i = 0; i < NP; i++) B[i] = this.snap[i] + (A[i] - this.snap[i]) * f; }
    else B.set(A);
    // layers
    const P = this.pose; P.set(B);
    const fat = this.fat, still = def.name === 'idle' || def.name === 'breathe' || def.name === 'splitStep' ? 1 : 0.3;
    const br = Math.sin(this.realT * TAU * (0.28 + 0.35 * fat)) * (0.8 + 2.2 * fat) * still;
    P[I.lean] += (br * 0.6 + fat * 5 + clamp(c.vf, -3, 6) * 1.3) * DEG; P[I.Rsz] += br * DEG; P[I.Lsz] += br * DEG; P[I.hdy] += br * 0.002;
    P[I.Rky] += fat * 4 * DEG; P[I.Lky] += fat * 4 * DEG; P[I.tilt] += clamp(c.vl, -4, 4) * 1.8 * DEG; P[I.hn] += fat * 3 * DEG;
    if (!def.noLook) {
      this.lookY += (this.lookYaw - this.lookY) * Math.min(1, dt * 9); this.lookP += (this.lookPitch - this.lookP) * Math.min(1, dt * 9);
      P[I.hy] += this.lookY * 0.8; P[I.twist] += this.lookY * 0.2; P[I.hn] += this.lookP;
    }
    this._apply(P);
    // IK
    let did = false;
    const hit = this.hit;
    if (hit && def.contact) {
      const cu = this.clipT, k = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      const w = k((cu - (def.contact - 0.10)) / 0.10) * (1 - k((cu - (def.contact + 0.02)) / 0.12));
      if (w > 0.002) {
        this.toLocal(hit.p.x, hit.p.y, hit.p.z, hT); this.dirToLocal(hit.n.x, hit.n.y, hit.n.z, hN);
        this._racketIK(hT, hN, w); did = true;
      }
    }
    const fside = this.mir ? 0 : 1;
    if (this.ikFree) { this.toLocal(this.ikFree.x, this.ikFree.y, this.ikFree.z, hHand); armIK(this, fside, hHand, 1); }
    else if (P[I.two] > 0.02) {
      // free hand on the racket handle
      wm.copy(this.mSpine); const rk = this.racket, rs = this.mir ? 1 : 0;
      wq1.copy(this.qSpine).multiply(this.uarm[rs].quaternion).multiply(this.farm[rs].quaternion).multiply(rk.quaternion);
      hHand.set(0, -this.dim.fa, 0).applyQuaternion(wq1.copy(this.qSpine).multiply(this.uarm[rs].quaternion).multiply(this.farm[rs].quaternion));
      v6.copy(this.uarm[rs].position).applyMatrix4(this.mSpine);
      q1.copy(this.qSpine).multiply(this.uarm[rs].quaternion); w2.set(0, -this.dim.ua, 0).applyQuaternion(q1).add(v6);   // elbow
      q1.multiply(this.farm[rs].quaternion); w3.set(0, -0.30 * this.s, 0).applyQuaternion(q1).add(w2);                 // hand pivot
      q1.multiply(rk.quaternion); w4.set(0.01, -0.095, 0.03).applyQuaternion(q1).add(w3);                             // second grip spot
      armIK(this, fside, w4, P[I.two]);
    }
    if (this.held) {
      // trophy between both hands
      for (let k = 0; k < 2; k++) {
        q1.copy(this.qSpine).multiply(this.uarm[k].quaternion); v6.copy(this.uarm[k].position).applyMatrix4(this.mSpine);
        w2.set(0, -this.dim.ua, 0).applyQuaternion(q1).add(v6); q1.multiply(this.farm[k].quaternion); w3.set(0, -0.30 * this.s, 0).applyQuaternion(q1).add(w2);
        if (k === 0) w4.copy(w3); else w4.add(w3).multiplyScalar(0.5);
      }
      this.held.position.copy(w4);
    }
    this.hit = this.hit; // (target kept until the owner clears it)
  };
  Rp.probe = function (out) {   // racket head centre + face normal + hand (root-local) for tuning
    this.root.updateMatrixWorld(true);
    const m = this.racket.matrixWorld, inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    const head = new THREE.Vector3(0, -this.dim.hc, 0).applyMatrix4(m).applyMatrix4(inv);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(m).transformDirection(inv);
    const hand = new THREE.Vector3(0, 0, 0).applyMatrix4(m).applyMatrix4(inv);
    return { head: head, n: n, hand: hand };
  };
  Rp.dispose = function () { if (this.root.parent) this.root.parent.remove(this.root); };

  // ---------------------------------------------------------------- extras
  function trophyGeo() {
    const b = new Bx(1), g = 0xf5c518, g2 = 0xffe27a, d = 0xb8860b;
    b.add(0, 0.02, 0, 0.2, 0.04, 0.2, 0x3a2a1a).add(0, 0.06, 0, 0.16, 0.04, 0.16, d).add(0, 0.13, 0, 0.05, 0.12, 0.05, g).add(0, 0.2, 0, 0.1, 0.04, 0.1, d);
    b.add(0, 0.30, 0, 0.2, 0.16, 0.2, g).add(0, 0.38, 0, 0.24, 0.04, 0.24, g2).add(0.11, 0.3, 0, 0.04, 0.12, 0.04, d).add(-0.11, 0.3, 0, 0.04, 0.12, 0.04, d).add(0, 0.3, 0.11, 0.04, 0.12, 0.04, d).add(0, 0.3, -0.11, 0.04, 0.12, 0.04, d);
    b.add(0.102, 0.3, 0, 0.01, 0.1, 0.06, g2);
    return b.geo();
  }
  let trophyMat = null;
  const rigs = HPO.mod.rigs = {
    CLIPS: CLIPS, NAMES: NAMES, Rig: Rig, extras: [], ready: false,
    init(ctx) {
      rigs.ready = true;
      const a = HPO.mod.actors; if (a && a.init) a.init(ctx);
    },
    create(player, o) {
      const def = player.def || player, idn = parseInt(String(def.id || '').replace(/\D/g, ''), 10);
      const NUMS = [10, 7, 22, 9, 5, 14, 3, 11];
      const rig = new Rig(def.look || {}, Object.assign({ female: def.gender === 'F', hand: def.hand || player.hand || 'R', number: (def.look && def.look.number) || NUMS[(isNaN(idn) ? 0 : idn) % 8] }, o || {}));
      rig.player = player; return rig;
    },
    createGeneric(look, o) { o = o || {}; return new Rig(look || {}, { female: o.female || o.gender === 'F', hand: o.hand, number: o.number === undefined ? 1 : o.number }); },
    makeTrophy(scale) {
      if (!trophyMat) trophyMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x4a3600, emissiveIntensity: 0.6 });
      const m = new THREE.Mesh(trophyGeo(), trophyMat); m.name = 'trophy'; m.scale.setScalar(scale || 1.2); return m;
    },
    makeUmpire(o) {
      o = o || {};
      const rig = rigs.createGeneric({ skin: 1, hair: 0x2a2a2a, hairStyle: 'short', outfit: [0xf2f2f2, 0x14304a], racket: 0xffffff, cap: undefined }, { number: 0 });
      rig.racket.visible = false; rig.shadow.visible = false;
      const seated = pose(null, { lean: 4, Rsz: 70, Rel: 60, Lsz: 70, Lel: 60, Rhz: 88, Lhz: 88, Rky: 88, Lky: 88, Rhx: 6, Lhx: 6, two: 0 });
      const um = { rig: rig, root: rig.root, ball: null, yaw: 0 };
      rig.clip = { name: 'seated', dur: 1, keys: null, loop: false, fn: function (out) { out.set(seated); }, contact: 0 };
      rig.root.rotation.y = -PI / 2; rig.root.position.set(o.x || 0, o.y || 2.2, o.z === undefined ? -6.2 : o.z);
      um.update = function (dt) {
        const b = HPO.mod.ball && HPO.mod.ball.state; if (b) { const target = clamp(-b.p.x / 10, -1, 1) * 0.6; um.yaw += (target - um.yaw) * Math.min(1, dt * 6); }
        rig.setLookAt(um.yaw, 0.05); rig.update(dt);
      };
      um.update(0.016); rigs.extras.push(um); return um;
    }
  };

  // ---------------------------------------------------------------- actors
  const SIM_DT = HPO.cfg.SIM_DT || 1 / 60;
  const TRAIL_N = 24;
  const dummy = new THREE.Object3D();
  function floorY(x, z) { return (Math.abs(x) < 13 && Math.abs(z) < 7.5) ? 0.02 : -0.18; }
  const A = HPO.mod.actors = {
    recs: [], byId: {}, ballMesh: null, ballShadow: null, trailMesh: null, ready: false, trailOn: true, ballScale: 1,
    lastTv: 0, deadT: 0, bps: '', bpx: 0, bpy: 1, bpz: 0, tHead: 0, tCount: 0, lastTrailT: -9, sig: '', vx: 0, vy: 1, vz: 0,
    _ft: { ball: { x: 0, y: 1, z: 0, live: false }, players: [], rally: { x: 0, z: 0 } },
    init(ctx) {
      if (A.ready) return;
      const render = HPO.mod.render, T = THREE;
      A.render = render; A.groups = render && render.groups ? render.groups : null;
      if (!A.groups || !A.groups.actors) return;
      A.ready = true;
      const core = new T.Mesh(new T.SphereGeometry(0.1, 10, 8), new T.MeshLambertMaterial({ color: 0xd8f24a, emissive: 0x3a4a08 }));
      const shell = new T.Mesh(new T.SphereGeometry(0.118, 10, 8), new T.MeshBasicMaterial({ color: 0x24310d, side: T.BackSide }));
      A.ballMesh = new T.Group(); A.ballMesh.name = 'ball'; A.ballMesh.add(shell); A.ballMesh.add(core); A.ballMesh.visible = false;
      A.groups.actors.add(A.ballMesh);
      A.bsMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const sg = new T.CircleGeometry(1, 12); sg.rotateX(-Math.PI / 2);
      A.ballShadow = new T.Mesh(sg, A.bsMat); A.ballShadow.renderOrder = 1; A.ballShadow.visible = false; A.groups.actors.add(A.ballShadow);
      A.trailMesh = new T.InstancedMesh(new T.SphereGeometry(0.05, 5, 4), new T.MeshBasicMaterial({ color: 0xeaf59a }), TRAIL_N);
      A.trailMesh.frustumCulled = false; A.trailMesh.visible = false; A.trailRing = new Float32Array(TRAIL_N * 4);
      (A.groups.fx || A.groups.actors).add(A.trailMesh);
      const M = HPO.mod.match;
      if (M && !M._actorsWrapped) {
        const orig = M.tick; M._actorsWrapped = true;
        M.tick = function (dt) { A._snap(); return orig.call(M, dt); };
      }
      BUS.on('match:new', function () { A.sig = 'dirty'; A._ensure(); });
      BUS.on('match:phase', function () { A._ensure(); });
      A._ensure();
    },
    _snap() {
      const rs = A.recs;
      for (let i = 0; i < rs.length; i++) { const r = rs[i], p = r.p; r.px = p.pos.x; r.pz = p.pos.z; r.ph = p.heading; }
      const B = HPO.mod.ball && HPO.mod.ball.state;
      if (B) { A.bpx = B.p.x; A.bpy = B.p.y; A.bpz = B.p.z; A.bps = B.state; }
    },
    _ensure() {
      const P = HPO.mod.players; if (!P || !P.list || !A.ready) return;
      let ok = A.recs.length === P.list.length && A.sig !== 'dirty';
      for (let i = 0; ok && i < P.list.length; i++) if (A.recs[i].p !== P.list[i]) ok = false;
      if (ok) return;
      A.sig = '';
      A.recs.forEach(function (r) { r.rig.dispose(); });
      A.recs = []; A.byId = {};
      P.list.forEach(function (p) {
        const rig = rigs.create(p); A.groups.actors.add(rig.root);
        const rec = { p: p, rig: rig, px: p.pos.x, pz: p.pos.z, ph: p.heading, lx: p.pos.x, lz: p.pos.z, act: null, swObj: null, animObj: null };
        rig.root.position.set(p.pos.x, 0, p.pos.z); rig.root.rotation.y = -p.heading;
        A.recs.push(rec); A.byId[p.id] = rec;
      });
      A._ft.players.length = 0; A.recs.forEach(function (r) { A._ft.players.push({ id: r.p.id, x: 0, z: 0, heading: 0 }); });
    },
    rigOf(id) { const r = A.byId[id]; return r ? r.rig : null; },
    setTrail(b) { A.trailOn = !!b; if (!b) { A.tCount = 0; if (A.trailMesh) A.trailMesh.visible = false; } },
    setBallScale(s) { A.ballScale = s > 0 ? s : 1; },
    highlight(id, b) { const r = A.rigOf(id); if (r) r.highlight(!!b); },
    followTargets() {
      const f = A._ft, B = HPO.mod.ball && HPO.mod.ball.state;
      if (B) { f.ball.x = B.p.x; f.ball.y = B.p.y; f.ball.z = B.p.z; f.ball.live = B.state === 'live'; }
      let sx = 0, sz = 0;
      for (let i = 0; i < A.recs.length; i++) { const r = A.recs[i], o = f.players[i], p = r.rig.root.position; o.x = p.x; o.z = p.z; o.heading = r.rig.heading; sx += p.x; sz += p.z; }
      const n = Math.max(1, A.recs.length); f.rally.x = sx / n; f.rally.z = sz / n; return f;
    },

    sync(alpha, dt) {
      if (!A.ready) return;
      const P = HPO.mod.players; if (!P || !P.list) return;
      A._ensure();
      alpha = alpha > 1 ? 1 : alpha < 0 ? 0 : (alpha || 0); dt = dt || 0.016;
      const tv = (P.now || 0) - (1 - alpha) * SIM_DT;
      let ds = tv - A.lastTv; if (!(ds >= 0 && ds < 0.5)) { ds = 0; if (tv < A.lastTv - 0.05) A.tCount = 0; }
      A.lastTv = tv;
      const B = HPO.mod.ball && HPO.mod.ball.state;
      if (B) A._ball(B, alpha, dt, tv);
      for (let i = 0; i < A.recs.length; i++) A._player(A.recs[i], alpha, dt, ds, tv, B);
      const ex = rigs.extras; for (let i = 0; i < ex.length; i++) ex[i].update(dt);
    },

    _ball(B, alpha, dt, tv) {
      let bx = B.p.x, by = B.p.y, bz = B.p.z;
      if (A.bps === B.state && A.bps !== 'dead') {
        const dx = bx - A.bpx, dy = by - A.bpy, dz = bz - A.bpz;
        if (dx * dx + dy * dy + dz * dz < 9) { bx = A.bpx + dx * alpha; by = A.bpy + dy * alpha; bz = A.bpz + dz * alpha; }
      }
      let vis = B.state === 'held' || B.state === 'live';
      if (B.state === 'dead') { A.deadT += dt; vis = B.deadReason !== null && A.deadT < 2.5 && Math.abs(bx) < 18 && Math.abs(bz) < 12 && by > -0.5; } else A.deadT = 0;
      if (B.state === 'held') {
        let sr = null;
        for (let i = 0; i < A.recs.length; i++) if (A.recs[i].p.anim.clip === 'serveBounce') { sr = A.recs[i]; break; }
        if (sr) { const t = sr.p.anim.t, amp = t < 0.35 ? 1 : t < 0.5 ? 1 - (t - 0.35) / 0.15 : 0; by -= amp * 0.3 * Math.abs(Math.sin(t * Math.PI / 0.3)); }
      }
      const sc = A.ballScale, r = 0.1 * sc;
      if (by < r) by = r;
      A.vx = bx; A.vy = by; A.vz = bz;
      const m = A.ballMesh; m.visible = vis; m.position.set(bx, by, bz); m.scale.setScalar(sc);
      const s = A.ballShadow, gy = floorY(bx, bz), h = Math.max(0, by - gy);
      s.visible = vis; s.position.set(bx, gy, bz); const rad = (0.13 + 0.012 * Math.min(h, 4)) * sc; s.scale.set(rad, 1, rad);
      A.bsMat.opacity = 0.45 / (1 + 0.35 * h);
      const tm = A.trailMesh;
      if (A.trailOn && B.state === 'live') {
        if (tv - A.lastTrailT >= 0.02 || tv < A.lastTrailT) {
          A.lastTrailT = tv; const k = A.tHead * 4, g = A.trailRing; g[k] = bx; g[k + 1] = by; g[k + 2] = bz; g[k + 3] = tv;
          A.tHead = (A.tHead + 1) % TRAIL_N; if (A.tCount < TRAIL_N) A.tCount++;
        }
      }
      if (A.trailOn && A.tCount > 0) {
        tm.visible = true; let any = false;
        for (let i = 0; i < TRAIL_N; i++) {
          if (i >= A.tCount) { dummy.scale.setScalar(0); } else {
            const k = ((A.tHead - 1 - i + TRAIL_N * 2) % TRAIL_N) * 4, g = A.trailRing, age = tv - g[k + 3];
            const f = age > 0.45 || age < 0 ? 0 : (1 - age / 0.45); if (f > 0) any = true;
            dummy.position.set(g[k], g[k + 1], g[k + 2]); dummy.scale.setScalar(f * 0.85 * sc);
          }
          dummy.updateMatrix(); tm.setMatrixAt(i, dummy.matrix);
        }
        tm.instanceMatrix.needsUpdate = true; if (!any && B.state !== 'live') A.tCount = 0;
      } else tm.visible = false;
    },

    _player(rec, alpha, dt, ds, tv, B) {
      const p = rec.p, rig = rec.rig, c = rig.ctx;
      let x = rec.px + (p.pos.x - rec.px) * alpha, z = rec.pz + (p.pos.z - rec.pz) * alpha;
      if ((p.pos.x - rec.px) * (p.pos.x - rec.px) + (p.pos.z - rec.pz) * (p.pos.z - rec.pz) > 2.25) { x = p.pos.x; z = p.pos.z; }
      const hd = U.angleDiff(rec.ph, p.heading), h = Math.abs(hd) > 2 ? p.heading : rec.ph + hd * alpha;
      rig.root.position.set(x, 0, z); rig.root.rotation.y = -h; rig.heading = h;
      const ch = Math.cos(h), sh = Math.sin(h);
      const vf = p.vel.x * ch + p.vel.z * sh, vl = -p.vel.x * sh + p.vel.z * ch, k = Math.min(1, dt * 10);
      c.vf += (vf - c.vf) * k; c.vl += (vl - c.vl) * k; c.speed += (p.speed - c.speed) * k; rig.fat = p.fatigue || 0;
      const dist = Math.hypot(x - rec.lx, z - rec.lz); rec.lx = x; rec.lz = z;
      const sp = Math.max(0.3, p.speed), stride = 0.9 + 0.55 * sp, dir = (p.anim.clip !== 'shuffle' && vf < -0.35 * p.speed) ? -1 : 1;
      c.phase = (c.phase + dir * dist / stride * TAU) % (TAU * 64);
      if (B && (B.state === 'live' || B.state === 'held')) {
        const bx = A.vx - x, bz = A.vz - z, bd = Math.hypot(bx, bz);
        let rel = Math.atan2(bz, bx) - h; rel = Math.atan2(Math.sin(rel), Math.cos(rel));
        rig.setLookAt(-clamp(rel, -1.15, 1.15), clamp(-Math.atan2(A.vy - 1.55, Math.max(0.5, bd)) * 0.6, -0.35, 0.35));
      } else rig.setLookAt(0, 0);

      const sw = p.swing;
      if (sw && sw !== rec.swObj) {
        rec.swObj = sw;
        if (sw.kind === 'serve') {
          if (rec.act && rec.act.serve) rec.act.tc = sw.tc;
          else rec.act = { def: CLIPS.serveHit, tc: sw.tc, k: 1, serve: true, sw: sw, begun: false, fh: true };
        } else {
          const def = resolveClip(sw.clip, sw.fh), avail = sw.tc - tv;
          rec.act = { def: def, tc: sw.tc, k: avail >= def.contact ? 1 : Math.min(2.2, def.contact / Math.max(avail, 0.02)), serve: false, sw: sw, begun: false, fh: sw.fh !== false };
        }
      }
      const an = p.anim.clip;
      if (!rec.act && an === 'serveBounce' && B && B.state === 'live' && B.floorBouncesSinceHit >= 1 && B.lastHitter == null) {
        const y = B.p.y, vy = B.v.y, d = vy * vy + 19.62 * (y - 0.86);
        const tHit = (vy < 0 && y <= 0.86) ? 0 : d >= 0 ? (vy + Math.sqrt(d)) / 9.81 : Math.max(0, vy) / 9.81;
        if (tHit <= 0.2 + ds) rec.act = { def: CLIPS.serveHit, tc: tv + tHit, k: 1, serve: true, sw: null, begun: false, fh: true };
      }
      let handled = false;
      const act = rec.act;
      if (act) {
        const def = act.def, u = tv < act.tc ? def.contact - act.k * (act.tc - tv) : def.contact + (tv - act.tc);
        if (u > def.dur || (!p.swing && u > def.release)) { rec.act = null; rig.setHitTarget(null); }
        else if (u >= -0.03) {
          if (!act.begun || rig.clip !== def) { rig.beginClip(def, act.fh, FADE); rig.setRacketHand(rig.hand); rig.setFreeTarget(null); act.begun = true; }
          rig.setClipTime(u); handled = true;
          if (act.serve) {
            if (tv <= act.tc && B) { const f = HPO.mod.players.facing(p.team); rig.setHitTarget(B.p.x, B.p.y, B.p.z, Math.cos(f), 0.25, Math.sin(f)); }
          } else if (act.sw && act.sw.info && tv <= act.tc + 0.05) {
            const ip = act.sw.info.p, tg = act.sw.target;
            const dx = tg ? tg.x - ip.x : ch, dz = tg ? tg.z - ip.z : sh, dl = Math.hypot(dx, dz) || 1, nv = NV[act.sw.clip] || 0, hc = Math.sqrt(Math.max(0, 1 - nv * nv));
            rig.setHitTarget(ip.x, ip.y, ip.z, dx / dl * hc, nv, dz / dl * hc);
          }
        }
      }
      if (!handled) {
        if (rig.hit) rig.setHitTarget(null);
        const name = CLIPS[an] ? an : 'idle', def = CLIPS[name];
        if (name === 'serveBounce' && B) {
          const zl = -(A.vx - x) * sh + (A.vz - z) * ch;
          rig.setRacketHand(zl >= 0 ? 'L' : 'R');
          if (B.state === 'held') rig.setFreeTarget(A.vx, A.vy + 0.07, A.vz); else rig.setFreeTarget(null);
        } else { rig.setRacketHand(rig.hand); rig.setFreeTarget(null); }
        if (LOCO[name]) { if (rig.clip !== def) rig.beginClip(def, true, 0); rig.driven = false; rig.rate = 1; rec.animObj = p.anim; }
        else {
          if (rig.clip !== def || rec.animObj !== p.anim) { rig.beginClip(def, true, 0); rec.animObj = p.anim; }
          rig.setClipTime(p.anim.t || 0);
        }
      }
      rig.update(dt, ds);
      if (rig.highlighted) { const s = 1 + 0.08 * Math.sin(rig.realT * 6); rig.ring.scale.set(s, 1, s); }
    }
  };
  rigs.actors = A;
})(HPO);
