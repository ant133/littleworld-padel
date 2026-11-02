// worldIsland: the floating island, club grounds, practice court, marquee, garden, visitors. (VISUAL_CONTRACT §1, §8)
(function (HPO) {
  'use strict';
  const W = HPO.mod.worldIsland = { paths: [], ready: false, version: 1 };
  const PI = Math.PI, TAU = Math.PI * 2;
  let T, R, G, rng, mobile = false;
  let atlas = null, matStatic = null, matGlow = null;
  const cutList = [];           // objects registered for cutaway
  const todListeners = [];      // fns(p) called on setTimeOfDay
  const updaters = [];          // fns(dt,t)
  let lampLevel = 0, curTod = 'day', indoor = false;
  const sky = { group: null };  // clouds/birds/rocks hidden when indoor
  const _m = [], tmpC = [];

  // brand + palette
  const C = {
    cream: 0xfffaf0, ink: 0x123954, blue: 0x177dc5, sky: 0x8fd3ff, yellow: 0xffd23f, red: 0xe8453c, orange: 0xff8c2e, pink: 0xff7fb0,
    purple: 0x9b5de5, white: 0xffffff, green: 0x3fae4a, dgreen: 0x2e8a3c, lgreen: 0x7cc653, wood: 0xa9743f, dwood: 0x7a4e2c, stone: 0xd8cdb0,
    steel: 0x8e99a6, dsteel: 0x5b6573, rubber: 0x2a2f38, curb: 0xf3ead2
  };

  // ---------------------------------------------------------------- tiny helpers
  const hyp = Math.hypot, sin = Math.sin, cos = Math.cos, abs = Math.abs, min = Math.min, max = Math.max;
  const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
  const hexMul = (hex, k) => { const r = clamp(((hex >> 16) & 255) * k, 0, 255), g = clamp(((hex >> 8) & 255) * k, 0, 255), b = clamp((hex & 255) * k, 0, 255); return ((r << 16) | (g << 8) | b) >>> 0; };
  const hexCss = hex => '#' + ('000000' + (hex >>> 0).toString(16)).slice(-6);
  const hexMix = (a, b, t) => { const f = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t)); return (f(16) << 16) | (f(8) << 8) | f(0); };

  // ---------------------------------------------------------------- geometry templates (non-indexed, flat normals)
  const TPL = {};
  function prep(g) {
    g = g.index ? g.toNonIndexed() : g;
    const pos = g.attributes.position.array, n = g.attributes.position.count, nor = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 3) {
      const ax = pos[i * 3], ay = pos[i * 3 + 1], az = pos[i * 3 + 2];
      const ux = pos[i * 3 + 3] - ax, uy = pos[i * 3 + 4] - ay, uz = pos[i * 3 + 5] - az, vx = pos[i * 3 + 6] - ax, vy = pos[i * 3 + 7] - ay, vz = pos[i * 3 + 8] - az;
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = hyp(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { nor[(i + k) * 3] = nx; nor[(i + k) * 3 + 1] = ny; nor[(i + k) * 3 + 2] = nz; }
    }
    return { pos: pos, nor: nor, n: n };
  }
  function tpl(key) {
    if (TPL[key]) return TPL[key];
    const p = key.split(':'); let g;
    if (p[0] === 'box') g = new T.BoxGeometry(1, 1, 1);
    else if (p[0] === 'cyl') g = new T.CylinderGeometry(+p[2], 1, 1, +p[1]);           // cyl:seg:topRatio (bottom radius 1)
    else if (p[0] === 'ico') g = new T.IcosahedronGeometry(1, +p[1]);
    else if (p[0] === 'oct') g = new T.OctahedronGeometry(1, 0);
    else if (p[0] === 'wedge') {                                                     // triangular prism, apex up, base y=-.5..: x width 1, z length 1
      const a = [-0.5, -0.5, -0.5], b = [0.5, -0.5, -0.5], c = [0, 0.5, -0.5], d = [-0.5, -0.5, 0.5], e = [0.5, -0.5, 0.5], f = [0, 0.5, 0.5];
      const v = [].concat(a, c, b, d, e, f, a, d, f, a, f, c, b, c, f, b, f, e, a, b, e, a, e, d);
      g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(v), 3));
    }
    return (TPL[key] = prep(g));
  }

  // ---------------------------------------------------------------- Batch: merged geometry with vertex colours + atlas uv
  let M4, Q4, E4, V3a, V3b, S3, NM, COL;
  function initTmp() { M4 = new T.Matrix4(); Q4 = new T.Quaternion(); E4 = new T.Euler(); V3a = new T.Vector3(); V3b = new T.Vector3(); S3 = new T.Vector3(); NM = new T.Matrix3(); COL = new T.Color(); }

  function Batch(groundUV) { this.p = []; this.n = []; this.c = []; this.u = []; this.gu = !!groundUV; }
  Batch.prototype.push = function (x, y, z, nx, ny, nz, r, g, b, u, v) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(r, g, b);
    if (this.gu) this.u.push((x + 50) / 100, 1 - (z + 50) / 100); else this.u.push(u === undefined ? atlas.wu : u, v === undefined ? atlas.wv : v);
  };
  Batch.prototype.add = function (t, m, hex) {
    NM.getNormalMatrix(m); COL.setHex(hex); const e = m.elements;
    for (let i = 0; i < t.n; i++) {
      const x = t.pos[i * 3], y = t.pos[i * 3 + 1], z = t.pos[i * 3 + 2];
      const nx0 = t.nor[i * 3], ny0 = t.nor[i * 3 + 1], nz0 = t.nor[i * 3 + 2], ne = NM.elements;
      let nx = ne[0] * nx0 + ne[3] * ny0 + ne[6] * nz0, ny = ne[1] * nx0 + ne[4] * ny0 + ne[7] * nz0, nz = ne[2] * nx0 + ne[5] * ny0 + ne[8] * nz0;
      const l = hyp(nx, ny, nz) || 1;
      this.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], nx / l, ny / l, nz / l, COL.r, COL.g, COL.b);
    }
    return this;
  };
  function compose(x, y, z, sx, sy, sz, ry, rx, rz) {
    V3a.set(x, y, z); S3.set(sx, sy, sz);
    E4.set(rx || 0, ry || 0, rz || 0, 'YXZ'); Q4.setFromEuler(E4);
    return M4.compose(V3a, Q4, S3);
  }
  // centre-positioned box
  Batch.prototype.box = function (x, y, z, w, h, d, hex, ry, rx, rz) { return this.add(tpl('box'), compose(x, y, z, w, h, d, ry, rx, rz), hex); };
  // box standing on yb
  Batch.prototype.boxB = function (x, yb, z, w, h, d, hex, ry, rx, rz) { return this.add(tpl('box'), compose(x, yb + h / 2, z, w, h, d, ry, rx, rz), hex); };
  Batch.prototype.cyl = function (x, yb, z, rb, rt, h, seg, hex, ry) {
    const k = rt / rb; return this.add(tpl('cyl:' + seg + ':' + (+k.toFixed(2))), compose(x, yb + h / 2, z, rb, h, rb, ry || 0), hex);
  };
  Batch.prototype.cone = function (x, yb, z, r, h, seg, hex, ry) { return this.add(tpl('cyl:' + seg + ':0'), compose(x, yb + h / 2, z, r, h, r, ry || 0), hex); };
  Batch.prototype.ico = function (x, y, z, rx, ry_, rz, hex, ry, detail) { return this.add(tpl('ico:' + (detail || 0)), compose(x, y, z, rx, ry_, rz, ry || 0), hex); };
  Batch.prototype.wedge = function (x, y, z, w, h, d, hex, ry) { return this.add(tpl('wedge'), compose(x, y, z, w, h, d, ry || 0), hex); };
  Batch.prototype.tri = function (a, b, c, hex, hint, uvs) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = hyp(nx, ny, nz); if (l < 1e-9) return this;
    nx /= l; ny /= l; nz /= l;
    if (hint) { const d = nx * ((a[0] + b[0] + c[0]) / 3 - hint[0]) + ny * ((a[1] + b[1] + c[1]) / 3 - hint[1]) + nz * ((a[2] + b[2] + c[2]) / 3 - hint[2]); if (d < 0) { const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; if (uvs) { uvs = [uvs[0], uvs[2], uvs[1]]; } } }
    COL.setHex(hex);
    const P = [a, b, c];
    for (let i = 0; i < 3; i++) this.push(P[i][0], P[i][1], P[i][2], nx, ny, nz, COL.r, COL.g, COL.b, uvs ? uvs[i][0] : undefined, uvs ? uvs[i][1] : undefined);
    return this;
  };
  Batch.prototype.quad = function (a, b, c, d, hex, hint) { this.tri(a, b, c, hex, hint); return this.tri(a, c, d, hex, hint); };
  // flat sign plane at (x,y,z), size w x h, facing local +z rotated by ry; rect = atlas rect
  Batch.prototype.sign = function (x, y, z, w, h, ry, rect, tint) {
    const s = sin(ry), c = cos(ry), hw = w / 2, hh = h / 2;
    const P = (lx, ly) => [x + lx * c, y + ly, z - lx * s];
    const bl = P(-hw, -hh), br = P(hw, -hh), tr = P(hw, hh), tl = P(-hw, hh);
    const hint = [x - s * 10, y, z - c * 10];
    this.tri(bl, br, tr, tint === undefined ? 0xffffff : tint, hint, [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1]]);
    this.tri(bl, tr, tl, tint === undefined ? 0xffffff : tint, hint, [[rect.u0, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]]);
    return this;
  };
  // sign mounted on a thin board (box) so it has a back and thickness; rotates about Y
  Batch.prototype.board = function (x, yc, z, w, h, ry, rect, frame, thick) {
    thick = thick || 0.08; const s = sin(ry), c = cos(ry);
    this.box(x, yc, z, w + 0.12, h + 0.12, thick, frame === undefined ? C.ink : frame, ry);
    this.sign(x + s * (thick / 2 + 0.006), yc, z + c * (thick / 2 + 0.006), w, h, ry, rect);
    return this;
  };
  Batch.prototype.build = function (mat, ox, oz) {
    ox = ox || 0; oz = oz || 0;
    const g = new T.BufferGeometry(), n = this.p.length / 3, pos = new Float32Array(this.p);
    if (ox || oz) for (let i = 0; i < n; i++) { pos[i * 3] -= ox; pos[i * 3 + 2] -= oz; }
    g.setAttribute('position', new T.BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(this.u), 2));
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new T.Mesh(g, mat); m.position.set(ox, 0, oz); m.frustumCulled = false; m.matrixAutoUpdate = false; m.updateMatrix();
    return m;
  };
  Batch.prototype.geometry = function () {   // for InstancedMesh templates
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new T.BufferAttribute(new Float32Array(this.c), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(this.u), 2));
    g.computeBoundingSphere(); return g;
  };

  // ---------------------------------------------------------------- atlas (all signage + a white texel for solid colours)
  function makeAtlas() {
    const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    const A = { cv: cv, g: g, S: S, rects: {}, x: 8, y: 8, rowH: 0, wu: 4 / S, wv: 1 - 4 / S };
    A.slot = function (name, w, h, draw) {
      if (A.x + w + 4 > S) { A.x = 8; A.y += A.rowH + 4; A.rowH = 0; }
      const x = A.x, y = A.y; A.x += w + 4; A.rowH = max(A.rowH, h);
      g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); g.imageSmoothingEnabled = false; draw(g, w, h); g.restore();
      A.rects[name] = { u0: x / S, u1: (x + w) / S, v1: 1 - y / S, v0: 1 - (y + h) / S, w: w, h: h };
      return A.rects[name];
    };
    return A;
  }
  const FONT = '"Trebuchet MS", "Segoe UI", Verdana, Arial, sans-serif';
  function fitText(g, text, w, size, weight) {
    let s = size; g.font = (weight || 'bold') + ' ' + s + 'px ' + FONT;
    while (g.measureText(text).width > w && s > 8) { s -= 1; g.font = (weight || 'bold') + ' ' + s + 'px ' + FONT; }
    return s;
  }
  function textBoard(g, w, h, bg, fg, text, opts) {
    opts = opts || {};
    g.fillStyle = hexCss(bg); g.fillRect(0, 0, w, h);
    if (opts.border) { g.fillStyle = hexCss(opts.border); g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3); }
    g.fillStyle = hexCss(fg); g.textBaseline = 'middle'; g.textAlign = opts.align || 'center';
    const pad = opts.pad === undefined ? 10 : opts.pad;
    fitText(g, text, w - pad * 2 - (opts.iconW || 0), opts.size || h * 0.55, opts.weight);
    const tx = opts.align === 'left' ? pad + (opts.iconW || 0) : opts.align === 'right' ? w - pad : w / 2 + (opts.iconW || 0) / 2;
    g.fillText(text, tx, h / 2 + 1);
  }
  function star4(g, cx, cy, r, col) {
    g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * PI / 4 - PI / 2, rr = i % 2 ? r * 0.38 : r; g.lineTo(cx + cos(a) * rr, cy + sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function arrowShape(g, w, h, dir, col) {
    g.fillStyle = col; const cx = dir > 0 ? w - 22 : 22, ty = h / 2;
    g.beginPath(); g.moveTo(cx + dir * 14, ty); g.lineTo(cx - dir * 4, ty - 11); g.lineTo(cx - dir * 4, ty + 11); g.closePath(); g.fill();
  }
  function buildAtlas() {
    const A = atlas = makeAtlas();
    const title = (HPO.cfg && HPO.cfg.TITLE) ? HPO.cfg.TITLE() : 'Littleworld Jakarta Padel Cup';
    A.slot('title', 768, 112, (g, w, h) => {
      g.fillStyle = '#123954'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.fillStyle = '#fffaf0'; for (let i = 0; i < w; i += 32) g.fillRect(i + 8, 3, 8, 4);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, title, w - 150, 54); g.fillStyle = '#fffaf0'; g.fillText(title, w / 2 + 30, h / 2 + 2);
      // ball + racket emblem
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(52, h / 2, 26, 0, TAU); g.fill();
      g.strokeStyle = '#fffaf0'; g.lineWidth = 3; g.beginPath(); g.arc(46, h / 2, 22, -0.8, 0.8); g.stroke();
      g.fillStyle = '#fffaf0'; g.fillRect(w - 98, 20, 3, h - 40);
      star4(g, w - 50, h / 2, 22, '#ffd23f');
    });
    A.slot('tickets', 256, 64, (g, w, h) => { textBoard(g, w, h, C.blue, C.cream, 'TICKETS', { size: 40, border: C.ink }); });
    A.slot('merch', 256, 64, (g, w, h) => { textBoard(g, w, h, C.ink, C.yellow, 'MERCH', { size: 42, border: C.blue }); });
    A.slot('boxoffice', 192, 40, (g, w, h) => { textBoard(g, w, h, C.cream, C.ink, 'BOX OFFICE', { size: 24 }); });
    A.slot('coffee', 192, 48, (g, w, h) => { textBoard(g, w, h, 0x4a2c1a, C.cream, 'CAFE', { size: 30, border: C.yellow }); });
    A.slot('menu', 96, 128, (g, w, h) => {
      g.fillStyle = '#2b3a33'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0'; g.font = 'bold 16px ' + FONT; g.textAlign = 'center'; g.fillText('MENU', w / 2, 20);
      g.fillRect(8, 26, w - 16, 2); g.font = '12px ' + FONT; g.textAlign = 'left';
      ['Kopi susu', 'Es teh', 'Pisang goreng', 'Es kelapa', 'Roti bakar'].forEach((s, i) => { g.fillText(s, 8, 46 + i * 15); });
    });
    A.slot('sp_lintas', 384, 96, (g, w, h) => {
      g.fillStyle = '#123954'; g.fillRect(0, 0, w, h); g.fillStyle = '#177dc5'; g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#fffaf0'; for (let i = 0; i < w; i += 24) g.fillRect(i, h - 14, 12, 10);
      g.fillStyle = '#fffaf0'; g.fillRect(0, h - 11, w, 3);
      textBoard(g, w, h - 20, 0x123954, C.cream, 'LINTAS COURT RAIL', { size: 44 });
    });
    A.slot('sp_tapak', 384, 96, (g, w, h) => {
      g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#123954'; g.beginPath(); g.ellipse(50, 54, 20, 28, 0.3, 0, TAU); g.fill(); [[28, 20], [42, 12], [56, 12], [70, 20]].forEach(p => { g.beginPath(); g.arc(p[0] + 6, p[1] + 4, 7, 0, TAU); g.fill(); });
      g.fillStyle = '#123954'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'TAPAK SMASH', w - 110, 48); g.fillText('TAPAK SMASH', 100, h / 2 + 2);
    });
    A.slot('sp_mandau', 384, 96, (g, w, h) => {
      g.fillStyle = '#17724c'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
      g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(24, 70); g.lineTo(46, 22); g.lineTo(68, 70); g.lineTo(46, 58); g.closePath(); g.fill();
      g.fillStyle = '#fffaf0'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'BANK MANDAU RAYA', w - 100, 40); g.fillText('BANK MANDAU RAYA', 84, h / 2 + 1);
    });
    A.slot('sp_lapang', 384, 96, (g, w, h) => {
      g.fillStyle = '#c93a32'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0';
      g.beginPath(); g.moveTo(20, 18); g.lineTo(70, 18); g.lineTo(70, 54); g.lineTo(45, 78); g.lineTo(20, 54); g.closePath(); g.fill();
      g.fillStyle = '#c93a32'; g.fillRect(40, 28, 10, 30); g.fillRect(31, 38, 28, 10);
      g.fillStyle = '#fffaf0'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'BANK LAPANG AMANAH', w - 100, 34); g.fillText('BANK LAPANG AMANAH', 84, h / 2 + 1);
    });
    A.slot('sp_aquvivo', 384, 96, (g, w, h) => {
      g.fillStyle = '#17b0d4'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fffaf0'; g.lineWidth = 6;
      for (let k = 0; k < 2; k++) { g.beginPath(); for (let x = 12; x <= 84; x += 4) g.lineTo(x, 34 + k * 24 + sin(x * 0.28) * 7); g.stroke(); }
      g.fillStyle = '#fffaf0'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'AQUVIVO', w - 110, 52); g.fillText('AQUVIVO', 100, h / 2 + 2);
    });
    A.slot('sp_gojeg', 384, 96, (g, w, h) => {
      g.fillStyle = '#12a35a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0';
      g.beginPath(); g.arc(30, 66, 11, 0, TAU); g.fill(); g.beginPath(); g.arc(74, 66, 11, 0, TAU); g.fill(); g.fillRect(30, 50, 44, 8); g.fillRect(58, 30, 8, 24); g.fillRect(52, 28, 22, 6);
      g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'GO-JEG', w - 110, 54); g.fillText('GO-JEG', 100, h / 2 + 2);
    });
    A.slot('sp_pokari', 384, 96, (g, w, h) => {
      g.fillStyle = '#f2f8ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
      g.beginPath(); g.moveTo(44, 22); g.quadraticCurveTo(70, 52, 44, 74); g.quadraticCurveTo(18, 52, 44, 22); g.fill();
      g.fillStyle = '#123954'; g.textAlign = 'left'; g.textBaseline = 'middle'; fitText(g, 'POKARI SWEET', w - 100, 40); g.fillText('POKARI SWEET', 84, h / 2 + 1);
    });
    A.slot('annetta', 320, 128, (g, w, h) => {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#123954'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
      g.fillStyle = '#177dc5'; g.fillRect(14, 22, 84, 84);
      g.fillStyle = '#fffaf0'; g.font = 'bold 66px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', 52, 66); star4(g, 84, 36, 14, '#ffd23f');
      g.fillStyle = '#123954'; g.textAlign = 'left'; fitText(g, 'annetta.dev', 190, 46); g.fillText('annetta.dev', 110, 54);
      g.fillStyle = '#177dc5'; g.font = 'bold 14px ' + FONT; g.fillText('made with care', 112, 88);
    });
    A.slot('banner_hosp', 640, 96, (g, w, h) => {
      g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, h); g.fillStyle = '#fffaf0'; for (let i = 0; i < w; i += 40) g.fillRect(i, 0, 20, 8);
      g.fillStyle = '#123954'; g.fillRect(0, h - 12, w, 12);
      g.fillStyle = '#fffaf0'; g.textAlign = 'center'; g.textBaseline = 'middle'; fitText(g, 'HOSPITALITY  by  LINTAS COURT RAIL', w - 40, 44); g.fillText('HOSPITALITY  by  LINTAS COURT RAIL', w / 2, 46);
    });
    A.slot('practice', 256, 48, (g, w, h) => { textBoard(g, w, h, C.blue, C.cream, 'PRACTICE COURT', { size: 28, border: C.ink }); });
    A.slot('welcome', 256, 64, (g, w, h) => { textBoard(g, w, h, C.ink, C.cream, 'WELCOME', { size: 38, border: C.yellow }); });
    A.slot('goj_zone', 192, 48, (g, w, h) => { textBoard(g, w, h, 0x12a35a, C.cream, 'GO-JEG RIDE ZONE', { size: 22 }); });
    A.slot('bikes', 96, 32, (g, w, h) => { textBoard(g, w, h, C.cream, C.ink, 'BIKES', { size: 22 }); });
    A.slot('notice', 128, 192, (g, w, h) => {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, 36);
      g.fillStyle = '#fffaf0'; g.font = 'bold 18px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TODAY', w / 2, 19);
      g.fillStyle = '#123954'; g.font = 'bold 22px ' + FONT; g.fillText('FINALS', w / 2, 62); g.font = '13px ' + FONT;
      ['Court 1  14:00', 'Practice  open', 'Cafe  all day', 'Kids clinic 11:00'].forEach((s, i) => g.fillText(s, w / 2, 92 + i * 18));
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(w / 2, 170, 12, 0, TAU); g.fill();
    });
    const posts = [['court1', 'Court 1', 1], ['practice_l', 'Practice', -1], ['practice_r', 'Practice', 1], ['cafe', 'Cafe', 1], ['cafe_l', 'Cafe', -1], ['marquee', 'Marquee', 1], ['garden', 'Garden', -1], ['tickets_l', 'Tickets', -1], ['merch_r', 'Merch', 1], ['court1_l', 'Court 1', -1], ['marquee_l', 'Marquee', -1]];
    posts.forEach(p => { A.slot('post_' + p[0], 192, 40, (g, w, h) => {
      g.fillStyle = '#fffaf0'; g.fillRect(0, 0, w, h); g.fillStyle = '#177dc5'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
      g.fillStyle = '#123954'; g.textBaseline = 'middle'; g.textAlign = 'left'; fitText(g, p[1], w - 56, 24);
      g.fillText(p[1], p[2] > 0 ? 12 : 40, h / 2 + 1); arrowShape(g, w, h, p[2], '#177dc5');
    }); });
    const tex = new T.CanvasTexture(A.cv); tex.magFilter = T.NearestFilter; tex.minFilter = T.NearestFilter; tex.generateMipmaps = false;
    A.tex = tex;
    return A;
  }
  function vcMat(opts) {
    const t = atlas.tex.clone(); t.needsUpdate = true;
    const m = R.mat(0xffffff, Object.assign({ map: t }, opts || {})); m.vertexColors = true; m.needsUpdate = true; return m;
  }
  function addTo(parent, obj) { parent.add(obj); return obj; }
  function cutaway(obj, role, extra) {
    if (R.cutaway && R.cutaway.add) R.cutaway.add(obj, Object.assign({ role: role }, extra || {}));
    cutList.push(obj); return obj;
  }

  // ================================================================ LAYOUT DATA
  const RIM = 47.2, RIM_OUT = 48.2, DEG = PI / 180;
  const STADIUM = [-28, 28, -37, 17.5];   // worldClub's zone (+ margin)
  const POND = { x: -26.5, z: 31.5, r: 4.2 };
  const NODES = {
    spawn: [0, 44], gate: [0, 34.5], plazaC: [0, 26], plazaL: [-8, 24.5], plazaR: [8, 24.5], entL: [-9, 19], entR: [9, 19],
    swC: [-29, 20], westMid: [-29, 8], westBack: [-29, -18], clubW: [-29, -31], backW: [-27, -39], backC: [0, -40], backE: [27, -39], clubE: [29, -31],
    eastBack: [29, -18], eastMid: [29, 6], seC: [29, 20], practiceDoor: [-31.4, 11], tentDoor: [30.6, 6], gardenW: [-15, 28.5], pondN: [-22.5, 29.5],
    pondS: [-20.5, 35], cart: [16, 26.5], picSE: [25, 29], picNE: [35, -14], viewNW: [-36, -22], merch: [9, 29.8], tickets: [-9, 30.2]
  };
  const EDGES = [
    ['spawn', 'gate', 1, []], ['gate', 'plazaC', 1, []], ['plazaC', 'plazaL', 1, []], ['plazaC', 'plazaR', 1, []], ['plazaL', 'entL', 1, []], ['plazaR', 'entR', 1, []],
    ['entL', 'swC', 1, [[-18, 20.5]]], ['entR', 'seC', 1, [[18, 20.5]]], ['swC', 'westMid', 1, []], ['westMid', 'westBack', 1, []], ['westBack', 'clubW', 1, []],
    ['clubW', 'backW', 1, [[-28, -36]]], ['backW', 'backC', 1, []], ['backC', 'backE', 1, []], ['backE', 'clubE', 1, [[28, -36]]], ['clubE', 'eastBack', 1, []],
    ['eastBack', 'eastMid', 1, []], ['eastMid', 'seC', 1, []], ['westMid', 'practiceDoor', 0, []], ['eastMid', 'tentDoor', 0, []], ['plazaL', 'gardenW', 0, []],
    ['gardenW', 'pondN', 0, []], ['pondN', 'pondS', 0, [[-18.8, 32.5]]], ['plazaR', 'cart', 0, []], ['cart', 'picSE', 0, []], ['eastBack', 'picNE', 0, []], ['westBack', 'viewNW', 0, []]
  ];
  const TERR = [ // angle degrees (atan2(z,x), +z = towards default camera), radii, top height
    { a0: -160, a1: -20, r0: 44, r1: RIM_OUT, h: 0.45 }, { a0: -140, a1: -40, r0: 46.2, r1: 47.9, h: 0.9, base: 0.45 },
    { a0: 20, a1: 75, r0: 41, r1: RIM_OUT, h: 0.4 }, { a0: 142, a1: 165, r0: 41, r1: RIM_OUT, h: 0.4 }
  ];
  function hAt(x, z) {
    const r = hyp(x, z); if (r < 40) return 0; const a = Math.atan2(z, x) / DEG; let h = 0;
    for (let i = 0; i < TERR.length; i++) { const t = TERR[i]; if (r >= t.r0 && a >= t.a0 && a <= t.a1) h = max(h, t.h); }
    return h;
  }
  const L = { trees: [], beds: [], lamps: [], benches: [], tables: [], hedges: [], rocks: [], polylines: [], nodeAdj: {} };

  function inRect(x, z, r) { return x > r[0] && x < r[1] && z > r[2] && z < r[3]; }
  function distSeg(px, pz, a, b) {
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz; let t = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0; t = clamp(t, 0, 1);
    return hyp(px - (a[0] + dx * t), pz - (a[1] + dz * t));
  }
  function nearPath(x, z, d) {
    for (let i = 0; i < L.polylines.length; i++) { const P = L.polylines[i].pts; for (let k = 0; k < P.length - 1; k++) if (distSeg(x, z, P[k], P[k + 1]) < d) return true; }
    return false;
  }
  function blocked(x, z, m) {
    m = m || 0;
    if (inRect(x, z, [STADIUM[0] - m, STADIUM[1] + m, STADIUM[2] - m, STADIUM[3] + m])) return true;
    if (inRect(x, z, [-17 - m, 17 + m, 20 - m, 37 + m])) return true;          // plaza
    if (inRect(x, z, [-47 - m, -29 + m, -6 - m, 22 + m])) return true;         // practice court
    if (inRect(x, z, [27 - m, 45 + m, -2 - m, 14 + m])) return true;           // marquee
    if (inRect(x, z, [-9 - m, 9 + m, 36, 48])) return true;                    // drop-off
    if (hyp(x - POND.x, z - POND.z) < 8 + m) return true;
    if (hyp(x - 26, z - 29) < 7.5 + m || hyp(x - 35.5, z + 14) < 6.5 + m || hyp(x + 36, z + 22) < 5 + m) return true;
    for (let i = 0; i < L.beds.length; i++) { const b = L.beds[i]; if (hyp((x - b.x) / (b.rx + 1.6 + m), (z - b.z) / (b.rz + 1.6 + m)) < 1) return true; }
    return nearPath(x, z, 2.3 + m);
  }

  function layout() {
    const rl = HPO.makeRng(4242);
    // paths as polylines (graph + drawn shapes)
    const adj = L.nodeAdj;
    Object.keys(NODES).forEach(k => { adj[k] = []; });
    EDGES.forEach(e => {
      const pts = [NODES[e[0]]].concat(e[3]).concat([NODES[e[1]]]);
      L.polylines.push({ a: e[0], b: e[1], main: e[2], pts: pts });
      const len = pts.reduce((s, p, i) => i ? s + hyp(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
      adj[e[0]].push({ to: e[1], pts: pts, len: len }); adj[e[1]].push({ to: e[0], pts: pts.slice().reverse(), len: len });
    });
    W.paths = L.polylines.map(p => p.pts.map(q => ({ x: q[0], z: q[1] })));
    W.paths.named = {}; Object.keys(NODES).forEach(k => { W.paths.named[k] = { x: NODES[k][0], z: NODES[k][1] }; });
    // flowerbeds
    L.beds = [
      { x: -11, z: 36.8, rx: 3.6, rz: 1.5 }, { x: 11, z: 36.8, rx: 3.6, rz: 1.5 }, { x: -33, z: 27, rx: 3.2, rz: 2.4 }, { x: 18, z: 34.5, rx: 3.4, rz: 2.2 },
      { x: 34, z: 25, rx: 3.2, rz: 2.4 }, { x: -20, z: 23.4, rx: 3.6, rz: 1.1 }, { x: 20, z: 23.4, rx: 3.4, rz: 1.1 }, { x: 40, z: -3, rx: 2.4, rz: 2.8 }
    ];
    // lamp posts along paths
    const lp = [];
    L.polylines.forEach(pl => {
      if (!pl.main && !/plaza|cart|pond|gardenW/.test(pl.a + pl.b)) return;
      let acc = 6, side = 1;
      for (let k = 0; k < pl.pts.length - 1; k++) {
        const a = pl.pts[k], b = pl.pts[k + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = hyp(dx, dz) || 1;
        for (let s = acc; s < l - 1.5; s += 12) {
          let x = a[0] + dx / l * s - dz / l * 1.9 * side, z = a[1] + dz / l * s + dx / l * 1.9 * side;
          if (inRect(x, z, STADIUM)) { x = a[0] + dx / l * s + dz / l * 1.9 * side; z = a[1] + dz / l * s - dx / l * 1.9 * side; }
          if (!inRect(x, z, STADIUM) && !lp.some(q => hyp(q.x - x, q.z - z) < 7) && hyp(x, z) < 45) lp.push({ x: x, z: z });
          side = -side;
        }
        acc = 6;
      }
    });
    L.lamps = lp;
    // trees
    const want = mobile ? 40 : 56, trees = [];
    for (let tries = 0; tries < 4000 && trees.length < want; tries++) {
      const r = 47 - 33 * Math.pow(rl.next(), 1.6), a = rl.next() * TAU, x = cos(a) * r, z = sin(a) * r;
      if (blocked(x, z, 0.5)) continue;
      const south = z > 18, back = z < -36, side = abs(x) > 30;
      const pr = south ? 1 : back ? 0.9 : side ? 0.8 : 0.12; if (rl.next() > pr) continue;
      if (trees.some(t => hyp(t.x - x, t.z - z) < 3.4)) continue;
      let type;
      const u = rl.next();
      if (south && abs(x) > 12) type = u < 0.42 ? 'palm' : u < 0.7 ? 'round' : 'blossom';
      else if (back) type = u < 0.6 ? 'cone' : 'round';
      else type = u < 0.38 ? 'round' : u < 0.58 ? 'cone' : u < 0.74 ? 'palm' : 'blossom';
      trees.push({ x: x, z: z, y: hAt(x, z), type: type, s: 0.85 + rl.next() * 0.5, ry: rl.next() * TAU });
    }
    L.trees = trees;
    // hedges: [x0,z0,x1,z1]
    L.hedges = [
      [-14.5, 21, -11, 21], [11, 21, 14.5, 21], [-7, 21.2, -4.2, 21.2], [4.2, 21.2, 7, 21.2], [-33.5, 29.8, -29, 29.8], [-33.5, 24.4, -29.5, 24.4],
      [-24, 36.8, -18.5, 36.8], [22, 33.2, 27, 33.2], [14.5, 31, 14.5, 36.5], [-14.5, 31, -14.5, 36.5], [38.5, 23, 38.5, 28], [33, 21.5, 38.5, 21.5]
    ];
    // benches [x,z,ry] (ry: front faces +z rotated)
    L.benches = [
      { x: -12.5, z: 21.8, ry: PI, id: 'b1' }, { x: 12.5, z: 21.8, ry: PI, id: 'b2' }, { x: -24, z: 25.8, ry: 0, id: 'b3' }, { x: -29.6, z: 35, ry: -2.2, id: 'b4' },
      { x: -23, z: 36, ry: PI, id: 'b5' }, { x: -24.5, z: 27, ry: 0, id: 'b6' }, { x: 21, z: 25, ry: PI * 1.5, id: 'b7' }, { x: 30.5, z: 14, ry: PI * 0.5, id: 'b8' },
      { x: -30.8, z: -4, ry: PI * 1.5, id: 'b9' }, { x: -33.5, z: -20, ry: 0.4, id: 'b10' }, { x: 31, z: -6, ry: PI * 0.5, id: 'b11' }
    ];
    // picnic tables SE and NE
    L.tables = [
      { x: 23, z: 28, ry: 0 }, { x: 28, z: 31, ry: 0.4 }, { x: 25.5, z: 25.5, ry: -0.3 }, { x: 34, z: -12, ry: 0.2 }, { x: 37.5, z: -16.5, ry: -0.5 }
    ];
    L.rocks = [[-31, 33.5, 1.3], [-23.5, 35.2, 0.9], [-29, 29, 0.7], [20, 37, 1.1], [41, 2, 1.2], [-40, -8, 1.4], [8, -43, 1.3], [-14, -43, 1.0], [38, -26, 1.3], [30.5, 34, 0.9]];
  }

  // ================================================================ GROUND TEXTURE
  function paverPattern(g, S, base, mortar, tone) {
    const px = Math.max(4, Math.round(S * 0.5)), cols = 8, c = document.createElement('canvas'); c.width = c.height = px * cols;
    const h = c.getContext('2d'); h.fillStyle = hexCss(mortar); h.fillRect(0, 0, c.width, c.height);
    const rp = HPO.makeRng(99);
    for (let r = 0; r < cols; r++) for (let q = -1; q < cols; q++) {
      const off = (r % 2) * px / 2; h.fillStyle = hexCss(hexMul(base, 1 + (rp.next() - 0.5) * (tone || 0.1)));
      h.fillRect(q * px + off, r * px, px - 1, px - 1);
    }
    return g.createPattern(c, 'repeat');
  }
  function paintGround(g, size) {
    const S = size / 100, rp = HPO.makeRng(777);
    const X = x => (x + 50) * S, Y = z => (z + 50) * S;
    const rect = (x0, z0, x1, z1) => g.fillRect(X(x0), Y(z0), (x1 - x0) * S, (z1 - z0) * S);
    // grass
    g.fillStyle = '#68b845'; g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(255,255,255,0.05)'; for (let x = -50; x < 50; x += 6) rect(x, -50, x + 3, 50);
    g.fillStyle = 'rgba(20,70,20,0.04)'; for (let z = -50; z < 50; z += 6) rect(-50, z, 50, z + 3);
    const sp = Math.round(size * size / 70); const cols = ['#5aa63c', '#58a83c', '#7cc653', '#8ad15a', '#4f9a37'];
    for (let i = 0; i < sp; i++) { g.fillStyle = cols[(rp.next() * cols.length) | 0]; const s = rp.next() < 0.2 ? 3 : 2; g.fillRect((rp.next() * size) | 0, (rp.next() * size) | 0, s, s); }
    // darker rim ring
    g.strokeStyle = 'rgba(30,90,30,0.25)'; g.lineWidth = 2.2 * S; g.beginPath(); g.arc(X(0), Y(0), 46 * S, 0, TAU); g.stroke();
    // stadium forecourt
    g.fillStyle = paverPattern(g, S, 0xc9bfa5, 0xaea58c, 0.08); rect(-28, -37, 28, 17.5);
    g.strokeStyle = '#a79d82'; g.lineWidth = 0.4 * S; g.strokeRect(X(-28), Y(-37), 56 * S, 54.5 * S);
    // practice court apron + court
    g.fillStyle = paverPattern(g, S, 0xdcd2b2, 0xc3b794, 0.07); rect(-46, -5, -30, 21);
    g.fillStyle = '#2d7fc4'; rect(-43, -2, -33, 18);
    g.fillStyle = '#3189cf'; for (let z = -2; z < 18; z += 5) rect(-43, z, -33, z + 2.5);
    g.fillStyle = '#ffffff'; const lw = 0.11;
    rect(-43, -2, -33, -2 + lw); rect(-43, 18 - lw, -33, 18); rect(-43, -2, -43 + lw, 18); rect(-33 - lw, -2, -33, 18);
    rect(-43, 8 - 6.95, -33, 8 - 6.95 + lw); rect(-43, 8 + 6.95 - lw, -33, 8 + 6.95); rect(-38 - lw / 2, 8 - 6.95, -38 + lw / 2, 8 + 6.95);
    g.fillStyle = '#123954'; rect(-43, 8 - 0.06, -33, 8 + 0.06);
    // marquee deck
    g.fillStyle = '#c99a62'; rect(29.5, 1.5, 42.5, 10.5);
    g.fillStyle = '#b3844f'; for (let x = 29.5; x < 42.5; x += 0.5) rect(x, 1.5, x + 0.04, 10.5);
    g.fillStyle = '#e8d3a8'; rect(29.5, 1.5, 42.5, 1.7); rect(29.5, 10.3, 42.5, 10.5);
    // pond: sand ring + stream
    g.fillStyle = '#e6d8a4'; g.beginPath(); g.ellipse(X(POND.x), Y(POND.z), (POND.r + 1) * S, (POND.r + 0.8) * S, 0, 0, TAU); g.fill();
    g.strokeStyle = '#4aa8e6'; g.lineWidth = 0.9 * S; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(-29.5), Y(33.4)); g.lineTo(X(-31), Y(35)); g.lineTo(X(-30.3), Y(36.4)); g.stroke();
    // paths
    const pat = paverPattern(g, S, 0xefe2bd, 0xd6c496, 0.09);
    g.lineJoin = 'round'; g.lineCap = 'round';
    L.polylines.forEach(pl => {
      const w = pl.main ? 2.3 : 1.5;
      g.strokeStyle = '#b39a68'; g.lineWidth = (w + 0.45) * S; g.beginPath(); pl.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
    });
    L.polylines.forEach(pl => {
      const w = pl.main ? 2.3 : 1.5;
      g.strokeStyle = pat; g.lineWidth = w * S; g.beginPath(); pl.pts.forEach((p, i) => i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))); g.stroke();
    });
    // entrance plaza
    g.fillStyle = '#b39a68'; rect(-15.6, 21.4, 15.6, 36.6);
    g.fillStyle = pat; rect(-15.2, 21.8, 15.2, 36.2);
    g.fillStyle = '#177dc5'; rect(-14.4, 22.6, 14.4, 23.2); rect(-14.4, 35, 14.4, 35.6); rect(-14.4, 22.6, -13.8, 35.6); rect(13.8, 22.6, 14.4, 35.6);
    g.fillStyle = '#fffaf0'; rect(-14.4, 23.2, 14.4, 23.5); rect(-14.4, 34.7, 14.4, 35);
    g.fillStyle = '#123954'; [[-14.4, 22.6], [13.2, 22.6], [-14.4, 34.4], [13.2, 34.4]].forEach(c => rect(c[0], c[1], c[0] + 1.2, c[1] + 1.2));
    const mx = X(0), mz = Y(27.4);
    g.fillStyle = '#177dc5'; g.beginPath(); g.arc(mx, mz, 5 * S, 0, TAU); g.fill();
    g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(mx, mz, 4.3 * S, 0, TAU); g.fill();
    g.fillStyle = '#123954'; g.beginPath(); g.arc(mx, mz, 3.6 * S, 0, TAU); g.fill();
    g.fillStyle = '#177dc5'; g.beginPath(); g.arc(mx, mz, 3.2 * S, 0, TAU); g.fill();
    g.fillStyle = '#fffaf0'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * PI / 4 - PI / 2, rr = (i % 2 ? 1.0 : 3.0) * S; g.lineTo(mx + cos(a) * rr, mz + sin(a) * rr); } g.closePath(); g.fill();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(mx, mz, 0.9 * S, 0, TAU); g.fill();
    // drop-off lane
    g.fillStyle = '#7d8591'; rect(-8, 37, 8, 48); g.fillStyle = '#656c78'; rect(-8, 37, 8, 37.4);
    g.fillStyle = '#fffaf0'; for (let z = 38; z < 47.5; z += 2) rect(-0.08, z, 0.08, z + 1);
    g.fillStyle = '#ffd23f'; rect(-8, 37.4, 8, 37.55);
    // flowerbeds
    L.beds.forEach(b => {
      g.fillStyle = '#e8dcc0'; g.beginPath(); g.ellipse(X(b.x), Y(b.z), (b.rx + 0.35) * S, (b.rz + 0.35) * S, 0, 0, TAU); g.fill();
      g.fillStyle = '#7b4f33'; g.beginPath(); g.ellipse(X(b.x), Y(b.z), b.rx * S, b.rz * S, 0, 0, TAU); g.fill();
      g.fillStyle = '#6a4228'; for (let i = 0; i < 24; i++) g.fillRect(X(b.x + (rp.next() - 0.5) * 2 * b.rx * 0.8), Y(b.z + (rp.next() - 0.5) * 2 * b.rz * 0.8), 3, 2);
    });
    // picnic pavers
    g.fillStyle = pat; [[25.5, 28.2, 7], [35.8, -14.3, 5.5], [-36, -22, 3.6]].forEach(c => { g.beginPath(); g.arc(X(c[0]), Y(c[1]), c[2] * S, 0, TAU); g.fill(); });
    g.strokeStyle = '#b39a68'; g.lineWidth = 0.35 * S; [[25.5, 28.2, 7], [35.8, -14.3, 5.5], [-36, -22, 3.6]].forEach(c => { g.beginPath(); g.arc(X(c[0]), Y(c[1]), c[2] * S, 0, TAU); g.stroke(); });
    // soft blob shadows (sun from -x,+z so shadows fall +x,-z)
    g.fillStyle = 'rgba(20,70,35,0.28)';
    L.trees.forEach(t => { const r = (t.type === 'palm' ? 1.3 : 1.7) * t.s; g.beginPath(); g.ellipse(X(t.x + 0.9 * t.s), Y(t.z - 0.5 * t.s), r * S, r * 0.8 * S, 0.5, 0, TAU); g.fill(); });
    g.fillStyle = 'rgba(30,50,40,0.22)'; L.benches.forEach(b => { g.beginPath(); g.ellipse(X(b.x + 0.3), Y(b.z - 0.2), 1.1 * S, 0.5 * S, 0, 0, TAU); g.fill(); });
    L.rocks.forEach(r => { g.beginPath(); g.ellipse(X(r[0] + 0.4), Y(r[1] - 0.2), r[2] * 1.1 * S, r[2] * 0.8 * S, 0, 0, TAU); g.fill(); });
  }

  // ================================================================ TERRAIN + UNDERSIDE (merged)
  function buildTerrain(G0, Sb) {
    const gb = new Batch(true), up = [0, -5, 0];
    const SEG = 72;
    for (let i = 0; i < SEG; i++) {
      const a0 = i / SEG * TAU, a1 = (i + 1) / SEG * TAU;
      gb.tri([0, -0.01, 0], [cos(a0) * RIM, -0.01, sin(a0) * RIM], [cos(a1) * RIM, -0.01, sin(a1) * RIM], 0xffffff, up);
    }
    // curb ring (skipped under terraces)
    for (let i = 0; i < 120; i++) {
      const a0 = i / 120 * TAU, a1 = (i + 1) / 120 * TAU, am = (a0 + a1) / 2;
      if (hAt(cos(am) * 47.5, sin(am) * 47.5) > 0) continue;
      const col = i % 2 ? C.curb : hexMul(C.curb, 0.92), c0 = cos(a0), s0 = sin(a0), c1 = cos(a1), s1 = sin(a1), cy = [0, 0, 0];
      Sb.quad([c0 * RIM, 0.28, s0 * RIM], [c1 * RIM, 0.28, s1 * RIM], [c1 * RIM_OUT, 0.28, s1 * RIM_OUT], [c0 * RIM_OUT, 0.28, s0 * RIM_OUT], col, [0, -5, 0]);
      Sb.quad([c0 * RIM, -0.01, s0 * RIM], [c1 * RIM, -0.01, s1 * RIM], [c1 * RIM, 0.28, s1 * RIM], [c0 * RIM, 0.28, s0 * RIM], hexMul(col, 0.82), [(c0 + c1) * 30, 0, (s0 + s1) * 30]);
      Sb.quad([c0 * RIM_OUT, 0.28, s0 * RIM_OUT], [c1 * RIM_OUT, 0.28, s1 * RIM_OUT], [c1 * RIM_OUT, -0.7, s1 * RIM_OUT], [c0 * RIM_OUT, -0.7, s0 * RIM_OUT], hexMul(col, 0.88), cy);
    }
    // terraces
    TERR.forEach(t => {
      const a0 = t.a0 * DEG, a1 = t.a1 * DEG, n = Math.max(2, Math.round((a1 - a0) / (4 * DEG))), base = t.base || 0, wall = 0xd8cba4;
      for (let i = 0; i < n; i++) {
        const b0 = lerp(a0, a1, i / n), b1 = lerp(a0, a1, (i + 1) / n), c0 = cos(b0), s0 = sin(b0), c1 = cos(b1), s1 = sin(b1);
        gb.quad([c0 * t.r0, t.h, s0 * t.r0], [c1 * t.r0, t.h, s1 * t.r0], [c1 * t.r1, t.h, s1 * t.r1], [c0 * t.r1, t.h, s0 * t.r1], 0xffffff, up);
        Sb.quad([c0 * t.r0, base - 0.01, s0 * t.r0], [c1 * t.r0, base - 0.01, s1 * t.r0], [c1 * t.r0, t.h, s1 * t.r0], [c0 * t.r0, t.h, s0 * t.r0], i % 2 ? wall : hexMul(wall, 0.93), [(c0 + c1) * 30, 0, (s0 + s1) * 30]);
        Sb.quad([c0 * t.r1, t.h, s0 * t.r1], [c1 * t.r1, t.h, s1 * t.r1], [c1 * t.r1, base ? base : -0.7, s1 * t.r1], [c0 * t.r1, base ? base : -0.7, s0 * t.r1], i % 2 ? hexMul(wall, 0.9) : hexMul(wall, 0.84), [0, 0, 0]);
      }
      [[a0, -1], [a1, 1]].forEach(e => {
        const c = cos(e[0]), s = sin(e[0]);
        Sb.quad([c * t.r0, base - 0.01, s * t.r0], [c * t.r1, base - 0.01, s * t.r1], [c * t.r1, t.h, s * t.r1], [c * t.r0, t.h, s * t.r0], hexMul(wall, 0.88), [c * t.r0 + s * e[1] * 5, 0, s * t.r0 - c * e[1] * 5]);
      });
    });
    G0.add(gb.build(R.mat(0xffffff, { map: W._groundTex }), 0, 0));
    // underside strata
    const prof = [[-0.7, 48.2], [-1.9, 47.6], [-3.3, 45.4], [-4.9, 41.5], [-6.6, 36.6], [-8.3, 30.5], [-9.9, 23.5], [-11.3, 16], [-12.5, 9], [-13.4, 4], [-14.2, 0]];
    const N = 30, band = [0x7a4e2f, 0xa56b3f, 0xc58d52, 0xb98a5e, 0x9a9fb0, 0x7d8299, 0x6a708c, 0x5a6080, 0x4a5070, 0x3f4564];
    const rn = HPO.makeRng(31337), V = [];
    for (let j = 0; j < prof.length; j++) {
      V[j] = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * TAU, last = j === prof.length - 1, k = last ? 0 : (1 + (rn.next() - 0.5) * (j === 0 ? 0 : 0.16));
        V[j][i] = [cos(a) * prof[j][1] * k, prof[j][0] + (last || j === 0 ? 0 : (rn.next() - 0.5) * 0.8), sin(a) * prof[j][1] * k];
      }
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < N; i++) {
      const i2 = (i + 1) % N, col = hexMul(band[j], 0.9 + rn.next() * 0.2), hint = [0, (V[j][i][1] + V[j + 1][i][1]) / 2, 0];
      Sb.tri(V[j][i], V[j][i2], V[j + 1][i2], col, hint); Sb.tri(V[j][i], V[j + 1][i2], V[j + 1][i], hexMul(col, 0.94), hint);
    }
    // lumps, spikes, vines
    for (let n = 0; n < 16; n++) {
      const j = 1 + ((rn.next() * 6) | 0), i = (rn.next() * N) | 0, p = V[j][i], k = 1.05, s = 1.2 + rn.next() * 2.2;
      Sb.ico(p[0] * k, p[1], p[2] * k, s, s * 0.8, s, hexMul(band[j + 1], 0.95 + rn.next() * 0.2), rn.next() * 3);
    }
    const tip = V[prof.length - 1][0];
    [[0, 0, 3.2], [1.5, 0.8, 2.0], [-1.6, 0.5, 2.4], [0.6, -1.6, 1.8], [-0.8, 1.7, 1.6]].forEach((s, n) => Sb.cone(s[0], tip[1] - s[2] + 0.2 - n * 0.1, s[1], 0.8 - n * 0.05, s[2], 5, band[9], 0).cone(s[0], tip[1] - s[2] * 0.5, s[1], 0.5, 0.8, 4, hexMul(band[8], 1.1), 0));
    for (let n = 0; n < (mobile ? 18 : 34); n++) {
      const i = (rn.next() * N) | 0, j0 = (rn.next() * 3) | 0, len = 2 + ((rn.next() * 4) | 0);
      for (let j = j0; j < min(j0 + len, prof.length - 2); j++) {
        const a = V[j][i], b = V[j + 1][i], k = 1.035, p0 = [a[0] * k, a[1], a[2] * k], p1 = [b[0] * k, b[1], b[2] * k];
        beam(Sb, p0, p1, j === j0 ? 0.16 : 0.11, j % 2 ? 0x2e7d32 : 0x4a8f35);
        if (rn.next() < 0.5) Sb.box((p0[0] + p1[0]) / 2 * 1.02, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2 * 1.02, 0.4, 0.12, 0.4, 0x5fbf45, rn.next() * 3);
      }
    }
    W._under = V;
  }
  function beam(B, a, b, th, hex) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = hyp(dx, dy, dz) || 1;
    V3a.set(dx / l, dy / l, dz / l); Q4.setFromUnitVectors(V3b.set(0, 1, 0), V3a); S3.set(th, l, th);
    V3a.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    M4.compose(V3a, Q4, S3); B.add(tpl('box'), M4, hex);
  }

  // ================================================================ BUILD FRAMEWORK
  const BUILDERS = [];
  const B = {};            // shared build context: S (static batch), Gl (glow batch), grp
  const glowPts = [];      // {x,y,z,r,c,k} additive glow sprites (lamps, windows)
  const bulbPts = [];      // string-light bulbs
  const rects = () => atlas.rects;

  function cutBatch(role, cx, cz, fn, name) {
    const b = new Batch(); fn(b); const m = b.build(matStatic, cx, cz); m.name = name || ('island_' + role); B.grp.add(m); cutaway(m, role); return m;
  }
  function groundTop(x, z) { return hAt(x, z); }

  // ----- plaza: arch, flagpoles, booths, stanchions, boards, planters
  const FLAGS = [];
  const BUNT = [];
  BUILDERS.push(function plaza() {
    const S = B.S, rr = rects();
    // arch
    cutBatch('building', 0, 32, function (b) {
      [-1, 1].forEach(sx => {
        const x = sx * 5.4;
        b.boxB(x, 0, 32, 1.9, 0.5, 1.9, C.blue).boxB(x, 0.5, 32, 1.45, 3.6, 1.45, C.cream).boxB(x, 4.1, 32, 1.8, 0.28, 1.8, C.ink);
        b.boxB(x, 0.5, 32, 1.5, 0.35, 1.5, hexMul(C.cream, 0.9)).boxB(x, 2.3, 31.2, 0.9, 0.12, 0.08, C.blue).boxB(x, 2.1, 31.2, 0.9, 0.12, 0.08, C.blue);
        b.ico(x, 6.75, 32, 0.5, 0.5, 0.5, C.yellow, 0.4, 1);
      });
      b.boxB(0, 4.38, 32, 12.4, 1.9, 0.8, C.ink).boxB(0, 6.28, 32, 12.4, 0.22, 0.95, C.blue).boxB(0, 4.28, 32, 12.6, 0.14, 0.95, C.cream);
      [-1, 1].forEach(sz => b.sign(0, 5.33, 32 + sz * 0.405, 10.8, 1.58, sz > 0 ? 0 : PI, rr.title));
      b.boxB(0, 6.5, 32, 3.4, 0.4, 0.7, C.cream).boxB(0, 6.9, 32, 1.8, 0.3, 0.6, C.blue);
      for (let i = -5; i <= 5; i++) b.boxB(i * 1.1, 6.5, 31.55, 0.3, 0.18, 0.2, i % 2 ? C.yellow : C.cream);
    }, 'island_arch');
    // flagpoles + flags
    const poles = [[-13.8, 23], [13.8, 23], [-13.8, 35], [13.8, 35], [-8.6, 32.6], [8.6, 32.6]];
    const designs = [[C.blue, C.cream, C.ink], [0x17724c, C.cream, 0x17724c], [C.yellow, C.ink, C.yellow], [0x17b0d4, C.cream, 0x17b0d4], [0xc93a32, C.cream, 0xc93a32], [C.ink, C.blue, C.ink]];
    poles.forEach((p, i) => {
      S.cyl(p[0], 0, p[1], 0.22, 0.22, 0.4, 8, C.steel).cyl(p[0], 0.4, p[1], 0.075, 0.06, 6.8, 6, 0xe9eef2).ico(p[0], 7.3, p[1], 0.12, 0.12, 0.12, C.yellow, 0, 0);
      FLAGS.push({ x: p[0], y: 7.0, z: p[1], len: 2.3, h: 1.35, wind: -0.55 + (i % 2) * 0.15, ph: i * 1.7, col: designs[i] });
    });
    // sponsor boards on hedge line
    [[-12.75, 'sp_mandau', 3.0], [-5.6, 'sp_lintas', 2.6], [5.6, 'sp_aquvivo', 2.6], [12.75, 'sp_lapang', 3.0]].forEach(s => {
      const w = s[2], h = w / 4, z = 20.95;
      S.boxB(s[0] - w / 2 + 0.2, 0, z, 0.12, 1.15, 0.12, C.steel).boxB(s[0] + w / 2 - 0.2, 0, z, 0.12, 1.15, 0.12, C.steel);
      S.board(s[0], 1.15 + h / 2 + 0.05, z, w, h, 0, rr[s[1]], C.ink, 0.1);
    });
    // annetta.dev board + welcome board
    S.boxB(12.1, 0, 33.6, 0.14, 2.1, 0.14, C.dwood).boxB(15.1, 0, 33.6, 0.14, 2.1, 0.14, C.dwood).board(13.6, 2.35, 33.6, 3.0, 1.2, -0.25, rr.annetta, C.cream, 0.12);
    S.board(0, 0.62, 36.2, 2.4, 0.6, 0, rr.welcome, C.ink, 0.1);
    S.boxB(-1.0, 0, 36.2, 0.1, 0.35, 0.1, C.steel).boxB(1.0, 0, 36.2, 0.1, 0.35, 0.1, C.steel);
    // planters
    [[-12.8, 25.8], [12.8, 25.8], [-3.6, 33.6], [3.6, 33.6]].forEach(p => {
      S.boxB(p[0], 0, p[1], 1.5, 0.6, 1.5, C.stone).boxB(p[0], 0.6, p[1], 1.3, 0.1, 1.3, 0x6a4228).ico(p[0], 1.05, p[1], 0.65, 0.5, 0.65, 0x4aa63c, 0.3).ico(p[0] + 0.3, 1.2, p[1] - 0.2, 0.35, 0.3, 0.35, 0x66c04a, 1);
      [C.red, C.yellow, C.pink, C.white].forEach((c, k) => S.box(p[0] - 0.4 + k * 0.28, 1.45 + (k % 2) * 0.05, p[1] + 0.25 - (k % 3) * 0.25, 0.13, 0.13, 0.13, c));
    });
    // queue stanchions
    const Q = [[-10.2, 30.1], [-7.8, 30.1], [-10.2, 32.1], [-7.8, 32.1], [-10.2, 34], [-7.8, 34]];
    Q.forEach(q => S.cyl(q[0], 0, q[1], 0.09, 0.09, 0.05, 8, C.steel).cyl(q[0], 0.05, q[1], 0.035, 0.035, 0.9, 6, C.steel).ico(q[0], 0.98, q[1], 0.07, 0.07, 0.07, C.yellow, 0, 0));
    for (let i = 0; i < Q.length; i++) {
      [[i, i + 2]].forEach(e => { if (Q[e[1]]) beam(S, [Q[e[0]][0], 0.85, Q[e[0]][1]], [Q[e[1]][0], 0.85, Q[e[1]][1]], 0.035, C.blue); });
    }
    // ticket booth
    cutBatch('building', -9, 28, function (b) {
      const x = -9, z = 28;
      b.boxB(x, 0, z, 3.7, 0.45, 2.9, C.blue);
      b.boxB(x, 0.45, z - 1.35, 3.5, 2.1, 0.2, C.cream).boxB(x - 1.65, 0.45, z, 0.2, 2.1, 2.5, C.cream).boxB(x + 1.65, 0.45, z, 0.2, 2.1, 2.5, C.cream);
      b.boxB(x, 0.45, z + 1.25, 3.5, 0.6, 0.2, C.cream).boxB(x, 2.05, z + 1.25, 3.5, 0.5, 0.2, C.cream).boxB(x - 1.35, 1.05, z + 1.25, 0.8, 1.0, 0.2, C.cream).boxB(x + 1.35, 1.05, z + 1.25, 0.8, 1.0, 0.2, C.cream);
      b.boxB(x, 0.45, z + 1.4, 1.9, 0.08, 0.5, C.wood).boxB(x, 0.45, z + 1.22, 1.9, 0.62, 0.05, 0xe9dcc0);
      b.boxB(x, 0.45, z, 3.3, 0.06, 2.5, 0x6b5a48);
      b.boxB(x, 2.55, z, 4.3, 0.22, 3.5, C.ink).boxB(x, 2.77, z, 3.6, 0.16, 2.9, C.blue);
      for (let i = 0; i < 6; i++) b.add(tpl('box'), compose(x - 1.0 + i * 0.4, 2.25, z + 1.85, 0.4, 0.07, 1.0, 0, 0.5), i % 2 ? C.cream : C.blue);
      b.board(x, 3.45, z + 1.2, 2.4, 0.6, 0, rr.tickets, C.ink, 0.1);
      b.boxB(x - 0.9, 2.93, z + 1.2, 0.1, 0.25, 0.1, C.ink).boxB(x + 0.9, 2.93, z + 1.2, 0.1, 0.25, 0.1, C.ink);
      b.board(x + 1.78, 1.5, z + 0.2, 1.0, 0.21, PI / 2, rr.boxoffice, C.ink, 0.06);
      b.boxB(x - 1.0, 0.45, z - 0.4, 0.5, 0.5, 0.4, 0x3c5b72).boxB(x - 0.55, 0.95, z + 1.18, 0.35, 0.3, 0.02, C.yellow);   // till + ticket card
    }, 'island_ticketbooth');
    // merch stand
    cutBatch('building', 9, 28, function (b) {
      const x = 9, z = 28, cols = [C.red, C.yellow, C.blue, C.white, C.green, C.pink, C.orange];
      b.boxB(x, 0, z, 5.2, 0.15, 3.0, 0x8a9aa8);
      [[-2.4, -1.35], [2.4, -1.35], [-2.4, 1.35], [2.4, 1.35]].forEach(p => b.boxB(x + p[0], 0.15, z + p[1], 0.14, 2.45, 0.14, C.ink));
      b.boxB(x, 0.15, z - 1.4, 4.9, 2.3, 0.14, 0xcfe6f4).boxB(x - 2.4, 0.15, z, 0.1, 2.3, 2.7, 0xcfe6f4);
      [0.95, 1.55].forEach(y => b.boxB(x, y, z - 1.2, 4.6, 0.07, 0.4, C.wood));
      for (let i = 0; i < 8; i++) { b.boxB(x - 2.0 + i * 0.55, 1.0, z - 1.2, 0.38, 0.42, 0.1, cols[i % cols.length]); b.boxB(x - 1.7 + i * 0.55, 1.6, z - 1.2, 0.2, 0.2, 0.2, cols[(i + 3) % cols.length]); b.boxB(x - 1.7 + i * 0.55, 1.82, z - 1.2, 0.26, 0.07, 0.3, cols[(i + 1) % cols.length]); }
      for (let i = 0; i < 4; i++) { b.boxB(x + 1.9 - i * 0.14, 0.15, z - 1.0, 0.07, 0.8, 0.04, C.dwood, 0, 0, 0.2).boxB(x + 1.95 - i * 0.14, 0.9, z - 1.0, 0.2, 0.22, 0.04, cols[i + 2], 0, 0, 0.2); }
      b.boxB(x, 0.15, z + 1.2, 4.8, 0.95, 0.5, C.cream).boxB(x, 1.1, z + 1.2, 5.0, 0.08, 0.7, C.blue);
      for (let i = 0; i < 7; i++) { b.boxB(x - 2.1 + i * 0.7, 1.18, z + 1.15, 0.45, 0.3, 0.4, cols[i % cols.length]); }
      b.cyl(x + 1.5, 1.18, z + 1.4, 0.07, 0.06, 0.28, 6, C.blue).cyl(x + 1.75, 1.18, z + 1.4, 0.07, 0.06, 0.28, 6, C.red).cyl(x + 2.0, 1.18, z + 1.4, 0.07, 0.06, 0.28, 6, C.green);
      b.boxB(x, 2.55, z, 5.8, 0.2, 3.6, C.ink);
      for (let i = 0; i < 9; i++) b.add(tpl('box'), compose(x - 2.4 + i * 0.6, 2.9, z, 0.6, 0.08, 3.9, 0, 0, 0), i % 2 ? C.cream : C.blue);
      b.boxB(x, 2.75, z, 5.5, 0.14, 3.3, C.blue);
      b.board(x, 3.4, z + 1.7, 2.6, 0.65, 0, rr.merch, C.ink, 0.1);
      b.boxB(x - 1.1, 2.75, z + 1.7, 0.1, 0.25, 0.1, C.ink).boxB(x + 1.1, 2.75, z + 1.7, 0.1, 0.25, 0.1, C.ink);
      b.boxB(x + 3.3, 0, z + 0.6, 0.08, 1.8, 0.08, C.steel).boxB(x + 3.9, 0, z + 0.6, 0.08, 1.8, 0.08, C.steel).boxB(x + 3.6, 1.75, z + 0.6, 0.9, 0.06, 0.06, C.steel);
      for (let i = 0; i < 5; i++) b.boxB(x + 3.3 + i * 0.13, 1.0, z + 0.6, 0.12, 0.7, 0.2, cols[(i + 2) % cols.length]);
    }, 'island_merch');
    glowPts.push({ x: -9, y: 1.7, z: 28.9, r: 2.2, c: 0xffd890, k: 0.7 }, { x: 9, y: 1.8, z: 28.5, r: 2.6, c: 0xffd890, k: 0.7 });
    // string lights from arch to booths + bunting
    const sl = [[-5.4, 3.9, 32.6, -10.3, 3.2, 29.6], [5.4, 3.9, 32.6, 10.3, 3.2, 29.6], [-10.3, 3.2, 29.6, -10.3, 3.3, 24.6], [10.3, 3.2, 29.6, 10.3, 3.3, 24.6]];
    sl.forEach(l => stringLine(l, 0.7, 13));
    buntLine([-13.8, 6.2, 23, 13.8, 6.2, 23], 1.3, 40);
    buntLine([-13.8, 6.2, 35, -8.6, 6.2, 32.6], 0.5, 12);
    buntLine([13.8, 6.2, 35, 8.6, 6.2, 32.6], 0.5, 12);
    buntLine([-5.4, 5.8, 31.5, 5.4, 5.8, 31.5], 0.0, 0);
  });

  // catenary-ish point
  function linePt(l, u, sag) { return [lerp(l[0], l[3], u), lerp(l[1], l[4], u) - sag * 4 * u * (1 - u), lerp(l[2], l[5], u)]; }
  function stringLine(l, sag, nBulbs) {
    const n = 8;
    for (let i = 0; i < n; i++) beam(B.S, linePt(l, i / n, sag), linePt(l, (i + 1) / n, sag), 0.025, 0x2b2b33);
    for (let i = 1; i < nBulbs; i++) { const p = linePt(l, i / nBulbs, sag); bulbPts.push({ x: p[0], y: p[1] - 0.12, z: p[2], c: [0xfff0b0, 0xffc860, 0xfff0b0, 0xffe080][i % 4] }); }
  }
  function buntLine(l, sag, count) {
    if (!count) return;
    const n = 12;
    for (let i = 0; i < n; i++) beam(B.S, linePt(l, i / n, sag), linePt(l, (i + 1) / n, sag), 0.03, 0x2b2b33);
    const yaw = Math.atan2(l[3] - l[0], l[5] - l[2]);
    const cols = [C.blue, C.cream, C.yellow, C.red, C.ink, C.green];
    for (let i = 0; i < count; i++) { const p = linePt(l, (i + 0.5) / count, sag); BUNT.push({ x: p[0], y: p[1], z: p[2], yaw: yaw, ph: i * 0.9 + l[0], col: cols[i % cols.length] }); }
  }

  // ================================================================ GARDEN: trees, flowers, hedges, pond, benches, lamps, signposts, props
  function leafBox(b, a, c, w, th, hex) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2], l = hyp(dx, dy, dz) || 1;
    V3a.set(dx / l, dy / l, dz / l); Q4.setFromUnitVectors(V3b.set(0, 0, 1), V3a); S3.set(w, th, l);
    V3a.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2); M4.compose(V3a, Q4, S3); b.add(tpl('box'), M4, hex);
  }
  function treeGeo(type) {
    const b = new Batch(), r = HPO.makeRng(type.length * 977 + type.charCodeAt(0));
    if (type === 'round' || type === 'blossom') {
      const bl = type === 'blossom';
      b.boxB(0, 0, 0, 0.5, 1.7, 0.5, 0x7a4a2a).boxB(0, 1.4, 0, 0.7, 0.35, 0.7, 0x6a3f24, 0.5);
      b.ico(0, 2.9, 0, 1.95, 1.6, 1.95, bl ? 0x6fbf50 : 0x4e9e3a, 0.3).ico(0.1, 4.2, 0.1, 1.3, 1.05, 1.3, bl ? 0x86d060 : 0x66b849, 1.0).ico(-1.1, 2.5, 0.6, 0.95, 0.8, 0.95, bl ? 0x5ab044 : 0x3f8a34, 2.0).ico(1.0, 2.6, -0.6, 0.9, 0.75, 0.9, bl ? 0x5ab044 : 0x3f8a34, 0.7);
      if (bl) for (let i = 0; i < 18; i++) { const u = r.next() * TAU, v = r.next() * 1.5 + 0.2, rr = 1.9 * Math.sin(v) * 0.98; b.box(cos(u) * rr, 2.9 + 1.5 * cos(v) * 1.0, sin(u) * rr, 0.3, 0.3, 0.3, i % 3 ? 0xff8fb3 : 0xffd0e0, u); }
    } else if (type === 'cone') {
      b.boxB(0, 0, 0, 0.42, 1.2, 0.42, 0x6a4028).cone(0, 0.9, 0, 1.9, 2.5, 6, 0x2f7d43, 0.3).cone(0, 2.3, 0, 1.5, 2.2, 6, 0x3a9150, 0.8).cone(0, 3.7, 0, 1.05, 2.0, 6, 0x4aa65f, 0.1);
    } else { // palm
      const P = [[0, 0, 0], [0.1, 1.2, 0], [0.35, 2.4, 0], [0.75, 3.5, 0], [1.3, 4.5, 0], [1.9, 5.3, 0]];
      for (let i = 0; i < P.length - 1; i++) beam(b, P[i], P[i + 1], 0.42 - i * 0.04, i % 2 ? 0xb38a5a : 0x9c7448);
      const top = P[P.length - 1];
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU, dx = cos(a), dz = sin(a), len = 2.3 + (i % 2) * 0.3;
        const mid = [top[0] + dx * len * 0.55, top[1] + 0.55, top[2] + dz * len * 0.55], end = [top[0] + dx * len, top[1] - 0.75, top[2] + dz * len];
        leafBox(b, top, mid, 0.5, 0.07, i % 2 ? 0x3fae4a : 0x2e9140); leafBox(b, mid, end, 0.42, 0.07, i % 2 ? 0x2e9140 : 0x45b84f);
      }
      b.ico(top[0] + 0.2, top[1] - 0.3, top[2] + 0.2, 0.2, 0.2, 0.2, 0x7a4a2a, 0).ico(top[0] - 0.2, top[1] - 0.3, top[2], 0.2, 0.2, 0.2, 0x6a3f24, 1).ico(top[0], top[1] - 0.4, top[2] - 0.25, 0.2, 0.2, 0.2, 0x7a4a2a, 2);
    }
    return b.geometry();
  }
  BUILDERS.push(function trees() {
    const groups = {};
    L.trees.forEach(t => { const k = t.type + (t.x > 0 ? 'E' : 'W') + (t.z > 0 ? 'S' : 'N'); (groups[k] = groups[k] || []).push(t); });
    const geos = {}, mat = vcMat(); B.treeMeshes = [];
    Object.keys(groups).forEach(k => {
      const arr = groups[k], type = arr[0].type; geos[type] = geos[type] || treeGeo(type);
      const cx = arr.reduce((s, t) => s + t.x, 0) / arr.length, cz = arr.reduce((s, t) => s + t.z, 0) / arr.length;
      const im = new T.InstancedMesh(geos[type], mat, arr.length); im.frustumCulled = false; im.name = 'island_trees_' + k; im.position.set(cx, 0, cz);
      arr.forEach((t, i) => {
        V3a.set(t.x - cx, t.y, t.z - cz); E4.set(0, t.ry, 0); Q4.setFromEuler(E4); S3.set(t.s, t.s * (0.9 + (i % 3) * 0.1), t.s); M4.compose(V3a, Q4, S3); im.setMatrixAt(i, M4);
        const sh = 0.86 + ((i * 37) % 11) / 11 * 0.26; COL.setRGB(sh, sh, sh); im.setColorAt(i, COL);
      });
      G.add(im); cutaway(im, 'tree'); B.treeMeshes.push({ mesh: im, n: arr.length });
    });
    mobileHooks.push(m => B.treeMeshes.forEach(o => { o.mesh.count = m ? Math.max(1, Math.ceil(o.n * 0.55)) : o.n; }));
  });

  // ----- flowers (instanced, swaying)
  const FL = { items: [], stems: null, heads: null, n: 0, vis: 0 };
  BUILDERS.push(function flowers() {
    const cols = [C.red, C.yellow, C.pink, C.white, C.purple, C.orange], rf = HPO.makeRng(555), per = mobile ? 28 : 34;
    L.beds.forEach((b, bi) => {
      for (let i = 0; i < per; i++) {
        const a = rf.next() * TAU, rr = Math.sqrt(rf.next()) * 0.92;
        FL.items.push({ x: b.x + cos(a) * rr * b.rx, z: b.z + sin(a) * rr * b.rz, h: 0.32 + rf.next() * 0.28, ph: rf.next() * TAU, c: cols[(bi + i + (rf.next() * 3 | 0)) % cols.length] });
      }
    });
    // shuffle so reduced counts still cover every bed
    for (let i = FL.items.length - 1; i > 0; i--) { const j = (rf.next() * (i + 1)) | 0, t = FL.items[i]; FL.items[i] = FL.items[j]; FL.items[j] = t; }
    FL.n = FL.items.length;
    const sg = new T.BoxGeometry(0.05, 1, 0.05); sg.translate(0, 0.5, 0);
    const hg = new T.BoxGeometry(0.2, 0.14, 0.2);
    [sg, hg].forEach(g => { const n = g.attributes.position.count; g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); const u = g.attributes.uv.array; for (let i = 0; i < u.length; i += 2) { u[i] = atlas.wu; u[i + 1] = atlas.wv; } });
    const mat = vcMat();
    FL.stems = new T.InstancedMesh(sg, mat, FL.n); FL.heads = new T.InstancedMesh(hg, mat, FL.n);
    [FL.stems, FL.heads].forEach(m => { m.frustumCulled = false; G.add(m); });
    FL.stems.name = 'island_flower_stems'; FL.heads.name = 'island_flower_heads';
    COL.setHex(0x3e9a3a); for (let i = 0; i < FL.n; i++) { FL.stems.setColorAt(i, COL); COL.setHex(FL.items[i].c); FL.heads.setColorAt(i, COL); COL.setHex(0x3e9a3a); }
    let acc = 0;
    function upd(t) {
      for (let i = 0; i < FL.vis; i++) {
        const f = FL.items[i], sw = sin(t * 1.7 + f.ph) * 0.1, sx = cos(t * 1.3 + f.ph * 1.7) * 0.07;
        E4.set(sx, 0, sw, 'YXZ'); Q4.setFromEuler(E4); V3a.set(f.x, 0, f.z); S3.set(1, f.h, 1); M4.compose(V3a, Q4, S3); FL.stems.setMatrixAt(i, M4);
        V3b.set(0, f.h, 0).applyQuaternion(Q4).add(V3a); V3a.copy(V3b); S3.set(1, 1, 1); M4.compose(V3a, Q4, S3); FL.heads.setMatrixAt(i, M4);
      }
      FL.stems.instanceMatrix.needsUpdate = true; FL.heads.instanceMatrix.needsUpdate = true;
    }
    FL.vis = FL.n; upd(0);
    updaters.push((dt, t) => { acc += dt; if (acc < 0.04) return; acc = 0; upd(t); });
    mobileHooks.push(m => { FL.vis = m ? Math.ceil(FL.n * 0.5) : FL.n; FL.stems.count = FL.heads.count = FL.vis; upd(tAnim); });
  });

  // ----- hedges (cutaway 'prop', per locality)
  BUILDERS.push(function hedges() {
    const buckets = {};
    L.hedges.forEach(h => { const k = h[0] < -20 ? 'W' : h[0] > 20 ? 'E' : 'C'; (buckets[k] = buckets[k] || []).push(h); });
    Object.keys(buckets).forEach(k => {
      const arr = buckets[k], cx = arr.reduce((s, h) => s + (h[0] + h[2]) / 2, 0) / arr.length, cz = arr.reduce((s, h) => s + (h[1] + h[3]) / 2, 0) / arr.length;
      cutBatch('prop', cx, cz, function (b) {
        arr.forEach(h => {
          const dx = h[2] - h[0], dz = h[3] - h[1], l = hyp(dx, dz), ry = Math.atan2(-dz, dx), mx = (h[0] + h[2]) / 2, mz = (h[1] + h[3]) / 2;
          b.add(tpl('box'), compose(mx, 0.45, mz, l, 0.9, 0.85, ry), 0x3f9a3a); b.add(tpl('box'), compose(mx, 0.93, mz, l - 0.15, 0.14, 0.7, ry), 0x5cb54a);
          for (let i = 0; i < l / 0.7; i++) { const u = (i + 0.5) * 0.7 / l - 0.5; b.box(mx + dx * u + sin(i * 2.3) * 0.1, 0.62 + (i % 3) * 0.12, mz + dz * u + 0.43 * cos(ry) * (i % 2 ? 1 : -1) * 0.95, 0.12, 0.12, 0.12, i % 2 ? 0xffe066 : 0xffffff); }
        });
      }, 'island_hedges_' + k);
    });
  });

  // ----- pond with fountain, water shimmer
  let waterTex = null, jetMesh = null;
  BUILDERS.push(function pond() {
    const S = B.S;
    waterTex = R.canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#3aa0e0'; g.fillRect(0, 0, w, h); const rp = HPO.makeRng(5);
      for (let i = 0; i < 90; i++) { g.fillStyle = rp.next() < 0.5 ? '#6cc4f2' : '#2b8ccc'; g.fillRect((rp.next() * w) | 0, (rp.next() * h) | 0, 3 + ((rp.next() * 4) | 0), 1); }
      for (let i = 0; i < 14; i++) { g.fillStyle = '#d6f2ff'; g.fillRect((rp.next() * w) | 0, (rp.next() * h) | 0, 2, 1); }
    });
    waterTex.wrapS = waterTex.wrapT = T.RepeatWrapping; waterTex.repeat.set(3, 3);
    const wm = new T.Mesh(new T.CylinderGeometry(POND.r, POND.r, 0.1, 20), R.mat(0xffffff, { map: waterTex })); wm.position.set(POND.x, 0.0, POND.z); wm.name = 'island_water'; G.add(wm);
    // stone rim + decor
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; S.box(POND.x + cos(a) * (POND.r + 0.25), 0.2, POND.z + sin(a) * (POND.r + 0.25), 1.35, 0.45, 0.6, i % 2 ? 0xd8cdb0 : 0xc3b898, -a); }
    S.cyl(POND.x, 0, POND.z, 1.1, 1.1, 0.5, 8, 0xd8cdb0).cyl(POND.x, 0.5, POND.z, 0.35, 0.3, 1.0, 8, 0xe8e0c8).cyl(POND.x, 1.4, POND.z, 0.9, 0.5, 0.3, 8, 0xd8cdb0).cyl(POND.x, 1.7, POND.z, 0.7, 0.7, 0.1, 8, 0x3aa0e0);
    [[1.8, 1.2], [-2.2, 0.4], [0.5, -2.4], [-1.0, 2.1], [2.5, -1.2]].forEach((p, i) => { S.cyl(POND.x + p[0], 0.05, POND.z + p[1], 0.38, 0.38, 0.03, 8, 0x4aa63c); if (i % 2 === 0) S.ico(POND.x + p[0] + 0.1, 0.12, POND.z + p[1], 0.14, 0.1, 0.14, C.pink, 0, 0); });
    jetMesh = new T.Mesh(new T.CylinderGeometry(0.1, 0.22, 1.5, 6), R.mat(0xbfeaff, { transparent: true, opacity: 0.75 })); jetMesh.position.set(POND.x, 2.5, POND.z); jetMesh.name = 'island_jet'; G.add(jetMesh);
    updaters.push((dt, t) => { waterTex.offset.set(t * 0.012, t * 0.02); jetMesh.scale.set(1 + sin(t * 9) * 0.06, 0.9 + sin(t * 3.1) * 0.15 + sin(t * 7.7) * 0.05, 1 + cos(t * 8) * 0.06); jetMesh.position.y = 1.75 + 0.75 * jetMesh.scale.y; });
  });

  // ----- benches with props, picnic tables, umbrellas, lamps, signposts, rocks, bins, bike rack, scooters
  function wl(o, lx, ly, lz) { const c = cos(o.ry), s = sin(o.ry); return [o.x + lx * c + lz * s, ly, o.z - lx * s + lz * c]; }
  function bench(S, o, i) {
    const wp = (lx, ly, lz) => wl(o, lx, ly, lz), p = wp(0, 0, 0);
    S.add(tpl('box'), compose(p[0], 0.46, p[2], 1.6, 0.08, 0.46, o.ry), 0xc08a4a);
    S.add(tpl('box'), compose(...wp(0, 0.82, -0.22), 1.6, 0.36, 0.07, o.ry, -0.15), 0xa9743f);
    [-0.65, 0.65].forEach(lx => { const q = wp(lx, 0.22, 0); S.add(tpl('box'), compose(q[0], 0.22, q[2], 0.1, 0.44, 0.42, o.ry), C.ink); });
    const k = i % 5;
    if (k === 0) { const q = wp(-0.3, 0.52, 0.03); S.add(tpl('box'), compose(q[0], 0.52, q[2], 0.7, 0.05, 0.42, o.ry, 0, 0), C.cream); S.add(tpl('box'), compose(...wp(-0.3, 0.9, -0.3), 0.7, 0.4, 0.04, o.ry, -0.15), C.blue); }
    else if (k === 1) { const q = wp(0.35, 0.65, 0.05); S.add(tpl('box'), compose(q[0], 0.65, q[2], 0.78, 0.3, 0.3, o.ry), 0x2b3a55); S.add(tpl('box'), compose(...wp(0.35, 0.82, 0.05), 0.3, 0.06, 0.1, o.ry), C.yellow); const r2 = wp(-0.55, 0.6, 0.0); S.add(tpl('box'), compose(r2[0], 0.62, r2[2], 0.28, 0.7, 0.04, o.ry, 0, 0.45), 0x3a3f48); }
    else if (k === 2) { const q = wp(0.5, 0.58, 0.05); S.cyl(q[0], 0.5, q[2], 0.05, 0.05, 0.22, 6, C.blue); S.cyl(wp(0.35, 0, 0)[0], 0.5, wp(0.35, 0, 0)[2], 0.05, 0.05, 0.22, 6, 0x7fd6ff); S.cyl(wp(-0.4, 0, 0.05)[0], 0.5, wp(-0.4, 0, 0.05)[2], 0.045, 0.045, 0.28, 6, C.yellow); }
    else if (k === 3) { const q = wp(0.1, 0.5, 0.0); S.add(tpl('box'), compose(q[0], 0.54, q[2], 0.5, 0.06, 0.38, o.ry, 0, 0.0), C.red); const q2 = wp(0.75, 0, 0.45); S.add(tpl('box'), compose(q2[0], 0.45, q2[2], 0.3, 0.9, 0.04, o.ry, -0.3, 0.12), 0xe8ecef); }
  }
  BUILDERS.push(function furniture() {
    const S = B.S, rr = rects();
    L.benches.forEach((o, i) => bench(S, o, i));
    // lamps
    L.lamps.forEach(l => {
      S.cyl(l.x, 0, l.z, 0.2, 0.14, 0.35, 6, C.dsteel).cyl(l.x, 0.35, l.z, 0.07, 0.06, 3.1, 6, C.ink).boxB(l.x, 3.45, l.z, 0.46, 0.08, 0.46, C.ink);
      B.Gl.box(l.x, 3.62, l.z, 0.34, 0.28, 0.34, 0xfff0b0); S.cone(l.x, 3.76, l.z, 0.3, 0.2, 4, C.ink, 0.78);
      glowPts.push({ x: l.x, y: 3.6, z: l.z, r: 2.1, c: 0xffd890 });
    });
    // signposts
    [[-6.4, 23.2, ['post_court1', 'post_practice_l']], [6.4, 23.2, ['post_court1_l', 'post_marquee', 'post_cafe']], [-17.6, 27.2, ['post_garden', 'post_tickets_l']], [-27.6, 18.8, ['post_practice_l', 'post_court1']], [27.6, 18.8, ['post_marquee', 'post_court1_l']]].forEach(p => {
      S.cyl(p[0], 0, p[1], 0.08, 0.08, 2.9, 6, C.dwood);
      p[2].forEach((n, i) => S.board(p[0] + (n.indexOf('_l') > 0 || n === 'post_garden' ? -0.3 : 0.3), 2.5 - i * 0.42, p[1] + 0.02 * i, 1.4, 0.29, i % 2 ? 0.12 : -0.1, rr[n], C.dwood, 0.07));
    });
    // notice board + sponsor board posts
    S.boxB(-17.3, 0, 22.6, 0.1, 1.9, 0.1, C.dwood).boxB(-15.7, 0, 22.6, 0.1, 1.9, 0.1, C.dwood).board(-16.5, 1.55, 22.6, 1.0, 1.5, 0, rr.notice, C.dwood, 0.08);
    S.boxB(24.0, 0, 33.2, 0.12, 1.15, 0.12, C.steel).boxB(27.0, 0, 33.2, 0.12, 1.15, 0.12, C.steel).board(25.5, 1.56, 33.2, 3.0, 0.75, 0, rr.sp_pokari, C.ink, 0.1);
    // rocks
    L.rocks.forEach((r, i) => { S.ico(r[0], 0.3 * r[2], r[1], r[2], r[2] * 0.7, r[2] * 0.9, i % 2 ? 0x9aa0ad : 0xb0b5bf, i, 0); if (i % 2) S.ico(r[0] + r[2] * 0.7, 0.2 * r[2], r[1] + 0.3, r[2] * 0.5, r[2] * 0.4, r[2] * 0.5, 0x858c9a, i + 1, 0); });
    // bins
    [[-14.2, 22.4, C.blue], [14.2, 22.4, C.green], [-22.8, 26.4, C.green], [30.2, 16.5, C.blue], [-30.4, 6.5, C.green], [22, 23.6, C.blue]].forEach(p => { S.cyl(p[0], 0, p[1], 0.3, 0.27, 0.8, 8, p[2]).cyl(p[0], 0.8, p[1], 0.32, 0.32, 0.08, 8, C.dsteel); });
    // bike rack + bikes
    const bx = -18.2, bz = 32.6;
    for (let i = 0; i < 4; i++) { S.box(bx + i * 0.6, 0.4, bz, 0.05, 0.8, 0.05, C.steel).box(bx + i * 0.6 + 0.3, 0.4, bz, 0.05, 0.8, 0.05, C.steel); }
    S.boxB(bx + 0.9, 0.8, bz, 2.3, 0.05, 0.05, C.steel);
    S.board(bx + 0.9, 1.35, bz - 0.4, 1.0, 0.33, 0, rr.bikes, C.ink, 0.05);
    [[0.3, 0x2f8a4a], [1.5, 0xe8453c]].forEach(b => {
      [-0.5, 0.5].forEach(o => S.add(tpl('cyl:10:1'), compose(bx + b[0], 0.33, bz + 0.45 + o * 0.0 + 0, 0.33, 0.06, 0.33, 0, 0, PI / 2), C.rubber));
      S.box(bx + b[0], 0.55, bz + 0.45, 0.06, 0.4, 0.9, b[1], 0).box(bx + b[0], 0.88, bz + 0.2, 0.4, 0.05, 0.05, C.steel).box(bx + b[0], 0.78, bz + 0.75, 0.1, 0.06, 0.2, C.ink);
    });
    // scooters + drop-off signage
    [[3.8, 41.2, 0.4], [5.3, 42.4, -0.2], [6.6, 40.8, 0.1]].forEach((s, i) => {
      S.box(s[0], 0.22, s[1], 0.3, 0.07, 1.1, 0x12a35a, s[2]).box(s[0], 0.42, s[1] + 0.35, 0.28, 0.45, 0.45, i % 2 ? 0xfff0b0 : 0x12a35a, s[2]);
      const c = cos(s[2]), n = sin(s[2]);
      S.add(tpl('cyl:10:1'), compose(s[0] + 0.5 * n, 0.2, s[1] + 0.5 * c, 0.19, 0.1, 0.19, s[2], 0, PI / 2), C.rubber);
      S.add(tpl('cyl:10:1'), compose(s[0] - 0.5 * n, 0.2, s[1] - 0.5 * c, 0.19, 0.1, 0.19, s[2], 0, PI / 2), C.rubber);
      S.box(s[0] + 0.55 * n, 0.9, s[1] + 0.55 * c, 0.6, 0.05, 0.06, C.steel, s[2]).box(s[0] + 0.55 * n, 0.55, s[1] + 0.55 * c, 0.05, 0.7, 0.05, C.steel, s[2]).ico(s[0] - 0.1 * n, 0.58, s[1] - 0.1 * c, 0.2, 0.15, 0.2, 0x12a35a, 0, 0);
    });
    S.boxB(-4.2, 0, 38.4, 0.12, 1.2, 0.12, C.steel).boxB(-1.2, 0, 38.4, 0.12, 1.2, 0.12, C.steel).board(-2.7, 1.55, 38.4, 3.0, 0.75, 0, rr.sp_gojeg, C.ink, 0.1);
    S.boxB(4.5, 0, 38.4, 0.12, 1.0, 0.12, C.steel).boxB(7.5, 0, 38.4, 0.12, 1.0, 0.12, C.steel).board(6.0, 1.4, 38.4, 3.0, 0.75, 0, rr.sp_tapak, C.ink, 0.1);
    S.boxB(-6.6, 0, 39.6, 0.1, 1.5, 0.1, C.steel).board(-6.6, 1.95, 39.6, 1.5, 0.375, 0.15, rr.goj_zone, C.ink, 0.06);
    // kerb bollards at drop-off edge
    for (let i = -3; i <= 3; i++) S.cyl(i * 2.2, 0, 36.8, 0.14, 0.14, 0.5, 6, i % 2 ? C.yellow : C.ink);
  });

  // ----- picnic tables + umbrellas (cutaway props, local batches)
  function umbrella(b, x, z, y, r, hex1, hex2, ry) {
    b.cyl(x, 0, z, 0.05, 0.05, y, 6, C.steel);
    const N = 8, top = [x, y + 0.62, z];
    for (let i = 0; i < N; i++) {
      const a0 = i / N * TAU + (ry || 0), a1 = (i + 1) / N * TAU + (ry || 0), col = i % 2 ? hex1 : hex2;
      b.tri(top, [x + cos(a0) * r, y, z + sin(a0) * r], [x + cos(a1) * r, y, z + sin(a1) * r], col, [x, y - 6, z]);
      b.tri(top, [x + cos(a0) * r, y, z + sin(a0) * r], [x + cos(a1) * r, y, z + sin(a1) * r], hexMul(col, 0.7), [x, y + 8, z]);
    }
    b.ico(x, y + 0.66, z, 0.08, 0.08, 0.08, C.steel, 0, 0);
  }
  function table(b, o, i) {
    const wp = (lx, ly, lz) => wl(o, lx, ly, lz), p = wp(0, 0, 0);
    b.add(tpl('box'), compose(p[0], 0.76, p[2], 1.9, 0.07, 0.85, o.ry), 0xc9a066);
    [-0.8, 0.8].forEach(lx => { const q = wp(lx, 0, 0); b.add(tpl('box'), compose(q[0], 0.38, q[2], 0.1, 0.76, 1.3, o.ry), C.dwood); });
    [-0.7, 0.7].forEach(lz => { const q = wp(0, 0, lz); b.add(tpl('box'), compose(q[0], 0.44, q[2], 1.9, 0.06, 0.3, o.ry), 0xb08350); });
    const items = [[-0.5, 0.1, C.red], [0.1, -0.15, C.yellow], [0.55, 0.12, C.white], [-0.1, 0.2, C.blue]];
    items.forEach((it, k) => { const q = wp(it[0], 0, it[1]); if (k % 2) b.cyl(q[0], 0.8, q[2], 0.06, 0.05, 0.14, 6, it[2]); else b.add(tpl('box'), compose(q[0], 0.86, q[2], 0.26, 0.06, 0.2, o.ry), it[2]); });
    const q = wp(0, 0, 0); b.cyl(q[0], 0.8, q[2], 0.07, 0.07, 0.4, 6, 0x7fd6ff);
  }
  BUILDERS.push(function picnic() {
    [[L.tables.slice(0, 3), 26, 28], [L.tables.slice(3), 36, -14]].forEach(g => {
      cutBatch('prop', g[1], g[2], function (b) {
        g[0].forEach((o, i) => { table(b, o, i); umbrella(b, o.x, o.z, 2.35, 1.75, i % 2 ? C.blue : C.red, C.cream, i); });
      }, 'island_picnic_' + g[1]);
    });
    // coffee cart
    cutBatch('prop', 16.3, 25.2, function (b) {
      const x = 16.3, z = 25.2, rr = rects();
      b.boxB(x, 0.3, z, 2.2, 0.9, 1.2, C.cream).boxB(x, 0.3, z, 2.25, 0.18, 1.25, C.blue).boxB(x, 1.2, z, 2.4, 0.08, 1.4, C.wood);
      [[-0.9, 0.7], [0.9, 0.7]].forEach(w => b.add(tpl('cyl:10:1'), compose(x + w[0], 0.3, z + w[1] * 0.0 + 0.0, 0.3, 0.1, 0.3, 0, 0, PI / 2), C.rubber));
      b.box(x + 1.45, 0.6, z, 0.9, 0.06, 0.06, C.steel).cyl(x - 0.7, 1.28, z + 0.1, 0.13, 0.12, 0.26, 6, C.steel).cyl(x - 0.3, 1.28, z + 0.15, 0.06, 0.05, 0.12, 6, C.white).cyl(x, 1.28, z + 0.2, 0.06, 0.05, 0.12, 6, C.white).boxB(x + 0.5, 1.28, z + 0.1, 0.3, 0.2, 0.3, C.orange);
      umbrella(b, x, z - 0.35, 2.4, 1.6, C.yellow, C.cream, 0.3);
      b.board(x, 0.85, z + 0.65, 1.3, 0.34, 0, rr.coffee, C.ink, 0.05);
      b.board(x + 1.55, 0.7, z + 0.9, 0.55, 0.73, -0.4, rr.menu, C.dwood, 0.06);
    }, 'island_coffeecart');
    glowPts.push({ x: 16.3, y: 2.2, z: 25.0, r: 2.4, c: 0xffd890, k: 0.6 });
  });
  // viewpoint + back area decor (static)
  BUILDERS.push(function viewpoint() {
    const S = B.S;
    S.cyl(-37.6, 0, -23.4, 0.14, 0.1, 1.4, 6, C.steel).box(-37.6, 1.55, -23.4, 0.25, 0.25, 0.7, C.ink, 0.6, -0.3).cyl(-37.6, 1.2, -23.4, 0.06, 0.06, 0.4, 6, C.yellow);
    for (let i = 0; i < 9; i++) { const a = PI * 0.15 + i / 8 * PI * 1.1, x = -36 + cos(a) * 3.2, z = -22 - sin(a) * 3.2; S.boxB(x, 0, z, 0.1, 1.0, 0.1, C.dwood); if (i) { const pa = PI * 0.15 + (i - 1) / 8 * PI * 1.1; beam(S, [-36 + cos(pa) * 3.2, 0.9, -22 - sin(pa) * 3.2], [x, 0.9, z], 0.06, C.dwood); } }
  });

  // ================================================================ PEOPLE (instanced blocky figures: visitors, guests, sellers, practice players)
  const PPL = { list: [], ess: 0, mesh: {}, queue: [], q: [[-9, 30.7], [-9, 31.9], [-9, 33.1]] };
  const SHIRTS = [0xe8453c, 0xffd23f, 0x177dc5, 0xffffff, 0x3fae4a, 0xff7fb0, 0xff8c2e, 0x9b5de5, 0x123954, 0x17b0d4, 0xfffaf0];
  const PANTS = [0x2b3a55, 0x3a3f48, 0xc9b48a, 0x5b6fa8, 0x1f2a3a, 0xe8e0d0, 0x6a4a3a];
  const SKINS = [0xf2c9a0, 0xd9a273, 0xb5794a, 0x8a5a38, 0xffdcb8];
  const HAIRS = [0x222222, 0x3a2416, 0x8a5a2a, 0xe8c060, 0x7a2a2a, 0xd8d8d8, 0x1a1a2a];
  let ROOT, LM, PM, AM, Q4b, E4b, ONE, NEG;

  function personGeos() {
    const g = {}, W0 = 0xffffff;
    let b = new Batch();
    b.box(0, 1.12, 0, 0.4, 0.58, 0.22, W0).box(0, 0.86, 0, 0.41, 0.07, 0.23, 0x666666).box(-0.265, 1.31, 0, 0.14, 0.2, 0.17, W0).box(0.265, 1.31, 0, 0.14, 0.2, 0.17, W0);
    g.torso = b.geometry();
    b = new Batch();
    b.box(0, 1.55, 0, 0.25, 0.25, 0.24, W0).box(-0.06, 1.57, 0.125, 0.04, 0.05, 0.015, 0x1a1a24).box(0.06, 1.57, 0.125, 0.04, 0.05, 0.015, 0x1a1a24).box(0, 1.49, 0.125, 0.08, 0.02, 0.015, 0x9a4a4a).box(0, 1.53, 0.14, 0.04, 0.05, 0.03, 0xe8b090);
    g.head = b.geometry();
    b = new Batch();
    b.box(0, 1.69, -0.005, 0.27, 0.09, 0.26, W0).box(0, 1.58, -0.115, 0.27, 0.22, 0.06, W0).box(-0.13, 1.62, 0, 0.03, 0.15, 0.2, W0).box(0.13, 1.62, 0, 0.03, 0.15, 0.2, W0).box(0, 1.655, 0.125, 0.26, 0.05, 0.03, W0);
    g.hair = b.geometry();
    b = new Batch(); b.box(0, -0.4, 0, 0.16, 0.8, 0.17, W0).box(0, -0.76, 0.035, 0.17, 0.09, 0.24, 0x2c2c34); g.leg = b.geometry();
    b = new Batch(); b.box(0, -0.28, 0, 0.12, 0.56, 0.12, W0).box(0, -0.58, 0, 0.11, 0.09, 0.11, 0xf2c9a0); g.arm = b.geometry();
    b = new Batch(); b.box(0, -0.1, 0, 0.04, 0.2, 0.04, 0x2a2a30).box(0, -0.43, 0, 0.27, 0.32, 0.03, 0x1a1a22).box(0, -0.43, 0.012, 0.22, 0.26, 0.03, W0).box(0, -0.43, 0.03, 0.06, 0.06, 0.01, 0x111111); g.racket = b.geometry();
    return g;
  }
  function newPerson(o) {
    const r = rng;
    const p = Object.assign({
      kind: 'static', s: 1, x: 0, z: 0, y: 0, ry: 0, ph: r.next() * TAU, sp: 0, vis: 1, st: 'idle', timer: 0, id: PPL.list.length,
      shirt: r.pick(SHIRTS), pants: r.pick(PANTS), skin: r.pick(SKINS), hair: r.pick(HAIRS), longSleeve: r.next() < 0.3, act: null, actT: 0,
      po: { ax: [0, 0], az: [0, 0], hx: 0, hy: 0, lean: 0, bob: 0, legs: [0, 0] }, racket: false, spd: 1.2
    }, o || {});
    p.armCol = p.longSleeve ? p.shirt : p.skin; return p;
  }
  function createPeople() {
    const L2 = [], add = o => { const p = newPerson(o); L2.push(p); return p; };
    // essential
    const pl0 = add({ kind: 'player', x: -38.4, z: 14, ry: PI, shirt: C.blue, pants: C.ink, skin: SKINS[0], hair: 0x3a2416, racket: true, rcol: 0x2c7be5, name: 'pA' });
    const pl1 = add({ kind: 'player', x: -37.6, z: 2, ry: 0, shirt: C.orange, pants: 0xf0ece0, skin: SKINS[3], hair: 0x1a1a2a, racket: true, rcol: 0xff6a2e, name: 'pB' });
    add({ kind: 'static', x: -9.3, z: 28.3, ry: 0, shirt: C.blue, pants: C.ink, hair: 0x3a2416, name: 'seller1' });
    add({ kind: 'static', x: 9.4, z: 28.6, ry: 0, shirt: C.ink, pants: 0x3a3f48, hair: 0x7a2a2a, name: 'seller2' });
    add({ kind: 'static', x: 16.6, z: 24.1, ry: 0, shirt: 0x4a2c1a, pants: C.ink, hair: 0x222222, name: 'barista' });
    const V = [];
    const vis = (o) => { const p = add(Object.assign({ kind: 'visitor' }, o)); V.push(p); return p; };
    const a = vis({ spd: 1.15 }), a2 = vis({}), a3 = vis({ s: 0.62, spd: 1.7, kid: true });
    a2.leader = a; a2.lag = 0.9; a2.fside = 0.9; a3.leader = a; a3.lag = 1.6; a3.fside = -0.7;
    const b1 = vis({ spd: 1.25 }), b2 = vis({ s: 0.66, spd: 1.7, kid: true }); b2.leader = b1; b2.lag = 0.8; b2.fside = 0.7;
    const c1 = vis({ spd: 1.3 }), c2 = vis({}); c2.leader = c1; c2.lag = 0.6; c2.fside = -0.85;
    add({ kind: 'static', x: 34.4, z: 4.8, ry: 0.9, shirt: C.pink, pants: C.ink, hair: 0xe8c060, name: 'guestA', drinks: true });
    add({ kind: 'static', x: 35.3, z: 5.7, ry: 4.1, shirt: C.cream, pants: 0x5b6fa8, hair: 0x222222, name: 'guestB' });
    PPL.ess = L2.length;
    // optional
    for (let i = 0; i < 7; i++) vis({ spd: 1.0 + rng.next() * 0.5 });
    add({ kind: 'static', x: 39.0, z: 7.0, ry: 2.0, shirt: C.yellow, pants: 0x6a4a3a, hair: 0x7a2a2a, name: 'guestC', drinks: true });
    add({ kind: 'static', x: 39.9, z: 6.3, ry: 5.2, shirt: C.green, pants: C.ink, hair: 0xd8d8d8, name: 'guestD' });
    PPL.list = L2; PPL.players = [pl0, pl1]; PPL.visitors = V;
    return L2;
  }

  // ---- visitors behaviour
  const POIS = [
    { n: 'entL', w: 2, face: [-9, 8], enter: true }, { n: 'entR', w: 2, face: [9, 8], enter: true }, { n: 'practiceDoor', w: 1.6, face: [-38, 9], pause: [6, 14], act: 'photo' },
    { n: 'tentDoor', w: 1.6, face: [36, 6], pause: [5, 12], act: 'drink' }, { n: 'pondN', w: 1.2, face: [POND.x, POND.z], pause: [5, 12], act: 'photo' }, { n: 'pondS', w: 0.7, face: [POND.x, POND.z], pause: [4, 9] },
    { n: 'picSE', w: 1.3, face: [24.5, 28.5], pause: [6, 14], act: 'drink' }, { n: 'picNE', w: 1.0, face: [35.5, -13], pause: [6, 14], act: 'drink' }, { n: 'cart', w: 1.3, face: [16.3, 25.2], pause: [4, 8], act: 'drink' },
    { n: 'viewNW', w: 0.8, face: [-28, -8], pause: [6, 14], act: 'photo' }, { n: 'merch', w: 1.1, face: [9, 28.2], pause: [4, 9] }, { n: 'plazaC', w: 0.9, face: [0, 33], pause: [3, 7], act: 'photo' },
    { n: 'eastMid', w: 0.7, face: [20, 6], pause: [4, 9], act: 'wave' }, { n: 'westMid', w: 0.7, face: [-20, 6], pause: [4, 9] }, { n: 'clubW', w: 0.5, face: [-18, -28], pause: [4, 8] },
    { n: 'clubE', w: 0.5, face: [18, -28], pause: [4, 8] }, { n: 'backC', w: 0.5, face: [0, -34], pause: [4, 8], act: 'photo' }, { n: 'queue', w: 1.4 }, { n: 'spawn', w: 0.5, leave: true }
  ];
  function nodeNear(x, z) { let best = 'plazaC', bd = 1e9; Object.keys(NODES).forEach(k => { const d = hyp(NODES[k][0] - x, NODES[k][1] - z); if (d < bd) { bd = d; best = k; } }); return best; }
  function bfs(a, b) {
    if (a === b) return [a]; const prev = {}, qq = [a]; prev[a] = null;
    while (qq.length) { const c = qq.shift(); if (c === b) break; L.nodeAdj[c].forEach(e => { if (!(e.to in prev)) { prev[e.to] = c; qq.push(e.to); } }); }
    if (!(b in prev)) return [a]; const out = []; for (let c = b; c; c = prev[c]) out.unshift(c); return out;
  }
  function routeFor(p, dest) {
    const nodes = bfs(p.node || nodeNear(p.x, p.z), dest), pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const e = L.nodeAdj[nodes[i]].find(q => q.to === nodes[i + 1]);
      for (let k = (i ? 1 : 0); k < e.pts.length; k++) pts.push([e.pts[k][0], e.pts[k][1]]);
    }
    if (!pts.length) pts.push([NODES[dest][0], NODES[dest][1]]);
    const J = p.jit || 0.55; // lateral jitter so people do not walk in single file
    return pts.map((q, i) => i === pts.length - 1 ? [q[0] + (rng.next() - 0.5) * 0.5, q[1] + (rng.next() - 0.5) * 0.5] : [q[0] + (rng.next() - 0.5) * J, q[1] + (rng.next() - 0.5) * J]);
  }
  function pickDest(p) {
    let poi, tries = 0;
    do { poi = rng.weighted(POIS); tries++; } while (tries < 8 && (poi.n === p.destName || (poi.n === 'queue' && PPL.queue.length >= 3)));
    p.destName = poi.n; p.poi = poi;
    if (poi.n === 'queue') { p.route = routeFor(p, 'gate'); p.st = 'walk'; p.toQueue = true; }
    else { p.route = routeFor(p, poi.n); p.st = 'walk'; p.toQueue = false; }
    p.ri = 0;
  }
  function walkTo(p, tx, tz, dt, v) {
    const dx = tx - p.x, dz = tz - p.z, d = hyp(dx, dz); if (d < 1e-4) return 0;
    const want = Math.atan2(dx, dz), turn = abs(angDiff(p.ry, want)); p.ry += angDiff(p.ry, want) * Math.min(1, dt * 8);
    const vv = v * (turn > 1.2 ? 0.25 : 1), step = Math.min(d, vv * dt); p.x += dx / d * step; p.z += dz / d * step; return d;
  }
  function faceToward(p, tx, tz, dt) { p.ry += angDiff(p.ry, Math.atan2(tx - p.x, tz - p.z)) * Math.min(1, dt * 5); }
  function startAct(p, name, dur) { p.act = name; p.actT = 0; p.actD = dur; }
  function updVisitor(p, dt, t) {
    const x0 = p.x, z0 = p.z;
    if (p.leader) { // follower: trail the leader's recorded path
      const L0 = p.leader, h = L0.hist, n = h.length / 3, back = Math.round(p.lag / 0.05);
      let idx = (L0.hi - back + n * 4) % n; const hx = h[idx * 3 + 1], hz = h[idx * 3 + 2], ang = L0.ry;
      const tx = hx + cos(ang) * p.fside, tz = hz - sin(ang) * p.fside, d = hyp(tx - p.x, tz - p.z);
      if (d > 0.04) { const v = Math.min(d * 5, 2.6), step = Math.min(d, v * dt); p.x += (tx - p.x) / d * step; p.z += (tz - p.z) / d * step; }
      if (hyp(p.x - x0, p.z - z0) / Math.max(dt, 1e-4) > 0.25) p.ry += angDiff(p.ry, Math.atan2(p.x - x0, p.z - z0)) * Math.min(1, dt * 8); else p.ry += angDiff(p.ry, L0.ry) * Math.min(1, dt * 2);
      p.vis = L0.vis; p.act = L0.act === 'photo' && p.kid ? null : L0.act; p.actT = L0.actT; p.actD = L0.actD;
      return;
    }
    switch (p.st) {
      case 'pause':
        p.timer -= dt; faceToward(p, p.poi ? p.poi.face[0] : p.x, p.poi ? p.poi.face[1] : p.z + 1, dt);
        if (p.act) { p.actT += dt; if (p.actT > p.actD) p.act = null; }
        if (p.timer <= 0) { p.act = null; pickDest(p); }
        break;
      case 'walk': {
        const wp = p.route[p.ri]; if (!wp) { p.st = 'arrive'; break; }
        const d = walkTo(p, wp[0], wp[1], dt, p.spd); if (d < 0.22) p.ri++;
        break; }
      case 'arrive': {
        const poi = p.poi; p.node = poi.n === 'queue' ? 'gate' : poi.n;
        if (p.toQueue) { PPL.queue.push(p); p.st = 'qwalk'; break; }
        if (poi.enter) { p.st = 'enter'; p.enterZ = p.z - 2.4; break; }
        if (poi.leave) { p.st = 'enter'; p.enterZ = p.z + 2.6; break; }
        p.st = 'pause'; p.timer = rng.range(poi.pause ? poi.pause[0] : 3, poi.pause ? poi.pause[1] : 7);
        if (poi.act) { const du = rng.range(1.8, 3.2); startAct(p, poi.act, du); p.actT = -rng.range(0.2, 1.5); }
        break; }
      case 'enter': {
        walkTo(p, p.x, p.enterZ, dt, 1.1); p.vis = Math.max(0, p.vis - dt * 1.3);
        if (p.vis <= 0.02) { p.vis = 0; p.st = 'hidden'; p.timer = rng.range(8, 24); }
        break; }
      case 'hidden':
        p.timer -= dt;
        if (p.timer <= 0) { const n = p.poi && p.poi.leave ? 'spawn' : (rng.next() < 0.5 ? 'entL' : 'entR'); p.x = NODES[n][0] + rng.range(-0.6, 0.6); p.z = NODES[n][1] + (n === 'spawn' ? 2 : -2); p.node = n; p.vis = 0.01; p.st = 'emerge'; }
        break;
      case 'emerge':
        p.vis = Math.min(1, p.vis + dt * 1.5); walkTo(p, p.x, p.z + (p.node === 'spawn' ? -3 : 3), dt, 0.9);
        if (p.vis >= 1) { p.destName = null; pickDest(p); }
        break;
      case 'qwalk': {
        const qi = PPL.queue.indexOf(p), s = PPL.q[Math.min(qi, 2)]; const d = walkTo(p, s[0] + (p.id % 3 - 1) * 0.12, s[1], dt, p.spd);
        if (d < 0.1) { faceToward(p, s[0], s[1] - 5, dt); p.sp *= 0.8; if (qi === 0) { p.st = 'buy'; p.timer = rng.range(3, 5.5); } }
        else if (d < 0.5) faceToward(p, s[0], s[1] - 5, dt);
        break; }
      case 'buy':
        p.timer -= dt; faceToward(p, p.x, p.z - 5, dt); if (!p.act) startAct(p, 'drink', 99); // 'drink' arm used as holding ticket up to the window
        if (p.timer <= 0) { PPL.queue.shift(); p.act = null; p.node = 'plazaL'; p.destName = null; p.poi = POIS[rng.next() < 0.5 ? 0 : 1]; p.route = routeFor(p, p.poi.n); p.ri = 0; p.st = 'walk'; p.toQueue = false; }
        break;
      default: p.st = 'pause'; p.timer = rng.range(0, 5);
    }
    if (p.st === 'qwalk' || p.st === 'buy') { /* queue members keep their slot ordering updated each frame (index lookup above) */ }
    // leader history
    p.ht = (p.ht || 0) + dt; if (p.hist && p.ht >= 0.05) { p.ht -= 0.05; p.hi = (p.hi + 1) % (p.hist.length / 3); p.hist[p.hi * 3] = t; p.hist[p.hi * 3 + 1] = p.x; p.hist[p.hi * 3 + 2] = p.z; }
    void x0; void z0;
  }
  function initVisitors() {
    const V = PPL.visitors, starts = ['plazaC', 'plazaL', 'plazaR', 'entL', 'entR', 'gardenW', 'cart', 'swC', 'seC', 'westMid', 'eastMid', 'pondN', 'picSE', 'gate'];
    V.forEach((p, i) => {
      if (p.leader) return;
      const n = starts[(i * 5 + 1) % starts.length]; p.node = n; p.x = NODES[n][0] + rng.range(-1, 1); p.z = NODES[n][1] + rng.range(-1, 1); p.ry = rng.next() * TAU;
      p.st = 'pause'; p.timer = rng.range(0, 4); p.poi = POIS.find(q => q.n === n) || null; p.hist = new Float32Array(3 * 200); p.hi = 0; p.vis = 1;
      for (let k = 0; k < 200; k++) { p.hist[k * 3 + 1] = p.x; p.hist[k * 3 + 2] = p.z; }
    });
    V.forEach(p => { if (p.leader) { p.x = p.leader.x + p.fside; p.z = p.leader.z - 0.6; p.ry = p.leader.ry; } });
  }
  function updStatic(p, dt, t) {
    if (p.name === 'guestA' || p.name === 'guestC') { const c = (t * 0.2 + p.id) % 1; p.act = c < 0.2 ? 'drink' : null; p.actT = c * 5; p.actD = 1; }
    if (p.name === 'seller1' || p.name === 'seller2' || p.name === 'barista') { const c = (t * 0.07 + p.id * 0.3) % 1; p.act = c < 0.12 ? 'wave' : null; p.actT = c * 9; p.actD = 1; p.po.hy0 = sin(t * 0.4 + p.id) * 0.4; }
    else if (p.name === 'guestB' || p.name === 'guestD') { p.po.hy0 = sin(t * 0.5 + p.id) * 0.5; }
  }
  // ---- animation pose
  function pose(p, dt, t, moved) {
    const po = p.po, sp = dt > 0 ? moved / dt : 0; p.sp += (sp - p.sp) * Math.min(1, dt * 8);
    const k = clamp(p.sp / 1.4, 0, 1.4), idle = clamp(1 - p.sp * 2, 0, 1);
    p.ph += p.sp * dt * (p.kid ? 6.2 : 4.4) * (p.s > 0.9 ? 1 : 1.1);
    const sw = sin(p.ph) * 0.62 * k;
    po.legs[0] = sw; po.legs[1] = -sw;
    po.ax[0] = -sw * 0.85 + sin(t * 1.3 + p.id) * 0.03 * idle; po.ax[1] = sw * 0.85 + sin(t * 1.1 + p.id * 2) * 0.03 * idle;
    po.az[0] = 0.06 + 0.04 * idle; po.az[1] = 0.06 + 0.04 * idle;
    po.bob = abs(sin(p.ph)) * 0.05 * k * (p.kid ? 1.6 : 1) + sin(t * 1.7 + p.id) * 0.004 * idle;
    po.lean = 0.05 * k; po.hx = (po.hy0 ? 0 : sin(t * 0.8 + p.id) * 0.03); po.hy = po.hy0 || 0;
    if (p.act) {
      const u = p.actT; if (u >= 0 && u <= p.actD) {
        if (p.act === 'photo') { po.ax[1] = -1.55; po.az[1] = 0.1; po.hx = -0.15; }
        else if (p.act === 'drink') { po.ax[1] = -2.0 + sin(t * 3) * 0.05; po.az[1] = 0.05; po.hx = -0.12; }
        else if (p.act === 'wave') { po.ax[1] = -0.3; po.az[1] = 2.5 + sin(t * 11) * 0.3; }
        else if (p.act === 'laugh') { po.hx = sin(t * 24) * 0.18 - 0.25; po.bob += abs(sin(t * 12)) * 0.07; po.ax[0] = -0.8; po.ax[1] = -0.8; po.az[0] = 0.5; po.az[1] = 0.5; po.lean = -0.1 + sin(t * 24) * 0.03; }
      }
    }
  }
  function drawPeople() {
    const M = PPL.mesh, list = PPL.list, n = list.length;
    for (let k = 0; k < n; k++) {
      const p = list[k], po = p.po, s = p.s * p.vis;
      if (s < 0.03) { M4.makeScale(0, 0, 0); ['torso', 'head', 'hair'].forEach(m => M[m].setMatrixAt(k, M4)); [0, 1].forEach(j => { M.legs.setMatrixAt(k * 2 + j, M4); M.arms.setMatrixAt(k * 2 + j, M4); }); if (p.racket) M.racket.setMatrixAt(p.rk, M4); continue; }
      V3a.set(p.x, p.y + po.bob * p.s, p.z); E4.set(po.lean, p.ry, 0, 'YXZ'); Q4.setFromEuler(E4); S3.set(s, s, s); ROOT.compose(V3a, Q4, S3);
      M.torso.setMatrixAt(k, ROOT);
      put(M.head, k, 0, 1.45, 0, po.hx, po.hy, 0, true); put(M.hair, k, 0, 1.45, 0, po.hx, po.hy, 0, true);
      put(M.legs, k * 2, -0.1, 0.82, 0, -po.legs[0], 0, 0); put(M.legs, k * 2 + 1, 0.1, 0.82, 0, -po.legs[1], 0, 0);
      put(M.arms, k * 2, -0.27, 1.38, 0, -po.ax[0], 0, -po.az[0]);
      AM.copy(put(M.arms, k * 2 + 1, 0.27, 1.38, 0, -po.ax[1], 0, po.az[1]));
      if (p.racket) { LM.compose(V3a.set(0, -0.58, 0), Q4.setFromEuler(E4.set(-0.45, 0, 0)), S3.set(1, 1, 1)); PM.multiplyMatrices(AM, LM); M.racket.setMatrixAt(p.rk, PM); p.rkM = PM.clone(); }
    }
    for (const k in M) { M[k].instanceMatrix.needsUpdate = true; }
  }
  function put(mesh, idx, tx, ty, tz, rx, ry, rz, back) {
    LM.compose(V3b.set(tx, ty, tz), Q4b.setFromEuler(E4b.set(rx, ry, rz, 'XYZ')), ONE);
    if (back) { // rotate about (tx,ty,tz) but geometry is authored in world-from-feet space
      LM.multiply(NEG.makeTranslation(-tx, -ty, -tz));
    }
    PM.multiplyMatrices(ROOT, LM); mesh.setMatrixAt(idx, PM); return PM;
  }
  // ================================================================ PRACTICE COURT (walls, net, props) + CASUAL RALLY
  function meshQuad(b, x0, z0, x1, z1, y0, y1) {
    const len = hyp(x1 - x0, z1 - z0) / 1.0, hh = (y1 - y0) / 1.0, a = [x0, y0, z0], c = [x1, y0, z1], d = [x1, y1, z1], e = [x0, y1, z0], h = [(x0 + x1) / 2, 50, (z0 + z1) / 2 + 50];
    b.tri(a, c, d, 0xffffff, h, [[0, 0], [len, 0], [len, hh]]); b.tri(a, d, e, 0xffffff, h, [[0, 0], [len, hh], [0, hh]]);
  }
  const RY = { st: 'ready', t: 0, server: 0, shot: 0, missAt: 8, seg: null, ball: [0, 1, 0], laugh: 0 };
  let ballM = null, ballSh = null;
  BUILDERS.push(function practiceCourt() {
    const S = B.S, rr = rects(), x0 = -38, xW = -43, xE = -33, zN = -2, zS = 18, steel = 0xb7c3cf;
    // glass + mesh walls
    const gl = new Batch(), mw = new Batch(), g3 = 0xcfeaff;
    gl.box(x0, 1.5, zN, 10, 3, 0.05, g3).box(x0, 1.5, zS, 10, 3, 0.05, g3);
    [xW, xE].forEach(x => { gl.box(x, 1.5, 0, 0.05, 3, 4, g3).box(x, 1.5, 16, 0.05, 3, 4, g3); meshQuad(mw, x, 2, x, 14, 0, 4); meshQuad(mw, x, -2, x, 2, 3, 4); meshQuad(mw, x, 14, x, 18, 3, 4); });
    meshQuad(mw, xW, zN, xE, zN, 3, 4); meshQuad(mw, xW, zS, xE, zS, 3, 4);
    meshQuad(mw, xW + 0.05, 8, xE - 0.05, 8, 0, 0.88);
    const meshTex = R.canvasTex(8, 8, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(70,86,104,1)'; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
    meshTex.wrapS = meshTex.wrapT = T.RepeatWrapping;
    const mm = R.mat(0xffffff, { map: meshTex, transparent: true, opacity: 1, side: T.DoubleSide }); mm.vertexColors = true; mm.alphaTest = 0.3; mm.needsUpdate = true;
    const gm = vcMat({ glass: true, opacity: 0.22 });
    const glM = gl.build(gm, 0, 0); glM.name = 'island_practice_glass'; G.add(glM);
    const mwM = mw.build(mm, 0, 0); mwM.name = 'island_practice_mesh'; G.add(mwM);
    // frame posts + rails + net posts
    for (let i = 0; i <= 4; i++) { const x = xW + i * 2.5; S.boxB(x, 0, zN, 0.12, 4.1, 0.12, steel).boxB(x, 0, zS, 0.12, 4.1, 0.12, steel); }
    for (let i = 0; i <= 8; i++) { const z = zN + i * 2.5; S.boxB(xW, 0, z, 0.12, 4.1, 0.12, steel).boxB(xE, 0, z, 0.12, 4.1, 0.12, steel); }
    S.box(x0, 4.07, zN, 10.1, 0.07, 0.1, steel).box(x0, 4.07, zS, 10.1, 0.07, 0.1, steel).box(xW, 4.07, 8, 0.1, 0.07, 20.1, steel).box(xE, 4.07, 8, 0.1, 0.07, 20.1, steel);
    S.box(x0, 3.0, zN, 10.05, 0.05, 0.08, steel).box(x0, 3.0, zS, 10.05, 0.05, 0.08, steel);
    S.boxB(xW + 0.1, 0, 8, 0.1, 0.96, 0.1, C.dsteel).boxB(xE - 0.1, 0, 8, 0.1, 0.96, 0.1, C.dsteel).box(x0, 0.9, 8, 9.8, 0.07, 0.04, 0xffffff).box(x0, 0.5, 8, 0.03, 0.8, 0.03, 0xffffff);
    // door frame on east side (net + 3 m)
    S.boxB(xE + 0.03, 0, 11, 0.12, 2.1, 0.12, C.blue).boxB(xE + 0.03, 0, 12, 0.12, 2.1, 0.12, C.blue).boxB(xE + 0.03, 2.05, 11.5, 0.12, 0.12, 1.1, C.blue).box(xE + 0.12, 1.0, 11.85, 0.06, 0.12, 0.08, C.yellow);
    // sponsor boards outside end walls
    [[-41.2, 'sp_lintas'], [-38, 'sp_tapak'], [-34.8, 'sp_pokari']].forEach(s => { S.board(s[0], 0.5, zS + 0.28, 2.8, 0.7, 0, rr[s[1]], C.ink, 0.1); S.board(s[0], 0.5, zN - 0.28, 2.8, 0.7, PI, rr[s[1] === 'sp_tapak' ? 'sp_aquvivo' : s[1] === 'sp_lintas' ? 'sp_mandau' : 'sp_lapang'], C.ink, 0.1); });
    S.boxB(-31.6, 0, 14.2, 0.1, 1.8, 0.1, C.dwood).board(-31.6, 2.1, 14.2, 1.6, 0.3, -PI / 2, rr.practice, C.ink, 0.07);
    // bench with bags/bottles + ball basket
    const bo = { x: -31.2, z: 5.2, ry: -PI / 2 }; bench(S, bo, 2); bench(S, { x: -31.2, z: 6.8, ry: -PI / 2 }, 1);
    S.box(-30.5, 0.2, 4.6, 0.7, 0.4, 0.34, 0x2b3a55, 0.2).box(-30.5, 0.45, 4.6, 0.3, 0.06, 0.1, C.yellow, 0.2).cyl(-30.7, 0, 7.8, 0.06, 0.06, 0.22, 6, C.blue).cyl(-30.5, 0, 7.9, 0.06, 0.06, 0.22, 6, 0x7fd6ff);
    S.cyl(-31.0, 0, 9.4, 0.3, 0.33, 0.55, 8, 0x6b7785); for (let i = 0; i < 6; i++) S.ico(-31.0 + sin(i * 2.4) * 0.17, 0.58 + (i % 2) * 0.05, 9.4 + cos(i * 2.4) * 0.17, 0.085, 0.085, 0.085, 0xd8f24a, i, 0);
    [[-30.6, 12.8], [-44.2, 3.0], [-44.0, 14]].forEach((p, i) => { S.ico(p[0], 0.09, p[1], 0.09, 0.09, 0.09, 0xd8f24a, i, 0); });
    // practice ball + shadow
    ballM = new T.Mesh(new T.IcosahedronGeometry(0.1, 0), R.mat(0xd8f24a, { emissive: 0x404a10 })); ballM.name = 'island_pball'; G.add(ballM);
    ballSh = new T.Mesh(new T.CircleGeometry(0.11, 8), R.mat(0x0b1a10, { transparent: true, opacity: 0.35 })); ballSh.rotation.x = -PI / 2; ballSh.position.y = 0.02; G.add(ballSh);
    glowPts.push({ x: -38, y: 5.5, z: 8, r: 5, c: 0xcfe6ff, k: 0.3 });
  });

  const PC = { x0: -38, net: 8, minx: -42.4, maxx: -33.6 };
  function contactPt(p) { const f = [sin(p.ry), cos(p.ry)], r = [cos(p.ry), -sin(p.ry)]; return [p.x + f[0] * 0.95 + r[0] * 0.3, 0.98, p.z + f[1] * 0.95 + r[1] * 0.3]; }
  function baseOf(i) { return i === 0 ? [PC.x0 + rng.range(-1.2, 1.2), 14 + rng.range(-1, 1.5)] : [PC.x0 + rng.range(-1.2, 1.2), 2 + rng.range(-1.5, 1)]; }
  function startSwing(p) { p.sw = 0.0001; }
  function swingCurve(u) {
    const e = x => x * x * (3 - 2 * x);
    if (u < 0.45) return lerp(0.1, -1.0, e(u / 0.45));
    if (u < 0.62) return lerp(-1.0, 1.15, e((u - 0.45) / 0.17));
    if (u < 0.8) return lerp(1.15, 1.9, (u - 0.62) / 0.18);
    return lerp(1.9, 0.1, e((u - 0.8) / 0.2));
  }
  function launch(i) {
    const P = PPL.players, sh = P[i], rc = P[1 - i], H = contactPt(sh), ry = RY;
    const sideZ = rc.z > PC.net ? 1 : -1, L2 = [clamp(PC.x0 + rng.range(-2.4, 2.4), PC.minx + 0.6, PC.maxx - 0.6), PC.net + sideZ * rng.range(3.6, 6.3)];
    const C2 = [L2[0], 0.98, L2[1] + sideZ * 0.9];
    const f = [sin(rc.ry), cos(rc.ry)], r = [cos(rc.ry), -sin(rc.ry)];
    rc.tgt = [clamp(C2[0] - f[0] * 0.95 - r[0] * 0.3, PC.minx, PC.maxx), C2[2] - f[1] * 0.95 - r[1] * 0.3]; rc.vmax = 3.6;
    sh.tgt = baseOf(i); sh.vmax = 2.0;
    ry.seg = { k: 1, t: 0, d1: 0.95 + rng.range(-0.1, 0.15), d2: 0.62, H: H, L: L2, C: C2, apex: rng.range(1.9, 2.7), from: i }; ry.shot++;
    ry.miss = ry.shot >= ry.missAt; ry.swingDone = false;
  }
  function updRally(dt, t) {
    const P = PPL.players, ry = RY; if (!P || P.length < 2) return;
    ry.t += dt;
    P.forEach(p => {
      if (p.tgt) { const dx = p.tgt[0] - p.x, dz = p.tgt[1] - p.z, d = hyp(dx, dz), v = Math.min(p.vmax || 2, d * 3.2), st = Math.min(d, v * dt); if (d > 1e-4) { p.x += dx / d * st; p.z += dz / d * st; } }
      if (p.sw) { p.sw += dt; if (p.sw > 0.9) p.sw = 0; }
      p.ry = (p === P[0] ? PI : 0) + (p.sw ? sin(clamp(p.sw / 0.5, 0, 1) * PI) * -0.25 * (p === P[0] ? 1 : -1) * 0 : 0);
    });
    const ball = ry.ball;
    if (ry.st === 'ready') {
      const sv = P[ry.server], f = [sin(sv.ry), cos(sv.ry)], r = [cos(sv.ry), -sin(sv.ry)];
      ball[0] = sv.x + f[0] * 0.4 + r[0] * 0.3; ball[2] = sv.z + f[1] * 0.4 + r[1] * 0.3; ball[1] = 1.0 + abs(sin(ry.t * 3)) * 0.18;
      if (ry.t > 1.3 && !sv.sw) startSwing(sv);
      if (sv.sw > 0.3) { launch(ry.server); ry.st = 'fly'; }
    } else if (ry.st === 'fly') {
      const s = ry.seg; s.t += dt; const other = P[1 - s.from];
      if (s.k === 1) {
        const u = clamp(s.t / s.d1, 0, 1); ball[0] = lerp(s.H[0], s.L[0], u); ball[2] = lerp(s.H[2], s.L[1], u); ball[1] = lerp(s.H[1], 0.1, u) + 4 * s.apex * u * (1 - u) * 0.9;
        if (u >= 1) { s.k = 2; s.t = 0; }
      } else {
        const u = clamp(s.t / s.d2, 0, 1); ball[0] = lerp(s.L[0], s.C[0], u); ball[2] = lerp(s.L[1], s.C[2], u); ball[1] = 0.1 + (s.C[1] - 0.1) * (1 - (1 - u) * (1 - u));
        if (!other.sw && s.t > s.d2 - 0.3 && !ry.swingDone) { startSwing(other); ry.swingDone = true; }
        if (u >= 1) {
          if (ry.miss) { ry.st = 'loose'; ry.t = 0; const d = [s.C[0] - s.L[0], s.C[2] - s.L[1]], l = hyp(d[0], d[1]) || 1; ry.v = [d[0] / l * 2.6, 2.0, d[1] / l * 2.6]; ry.laugh = 0; ry.loser = 1 - s.from; ry.shot = 0; ry.missAt = rng.int(5, 13); }
          else launch(1 - s.from);
        }
      }
    } else if (ry.st === 'loose') {
      const v = ry.v; v[1] -= 9.8 * dt; ball[0] += v[0] * dt; ball[1] += v[1] * dt; ball[2] += v[2] * dt;
      if (ball[1] < 0.1) { ball[1] = 0.1; v[1] = abs(v[1]) * 0.5; if (v[1] < 0.6) v[1] = 0; v[0] *= 0.7; v[2] *= 0.7; }
      ball[0] = clamp(ball[0], PC.minx - 0.8, PC.maxx + 0.8); ball[2] = clamp(ball[2], -3.0, 19);
      if (ry.t < 0.2) P.forEach(p => { p.act = 'laugh'; p.actT = 0; p.actD = 2.6; });
      P.forEach(p => { if (p.act === 'laugh') p.actT += dt * 0; });
      if (ry.t > 3.2) { ry.st = 'ready'; ry.t = 0; ry.server = ry.loser; P.forEach((p, i) => { p.tgt = baseOf(i); p.vmax = 2.2; p.act = null; }); }
    }
    // keep laugh timers alive while in 'loose'
    if (ry.st === 'loose') P.forEach(p => { p.actT = Math.min(p.actT + dt, 2.5); });
    ballM.position.set(ball[0], ball[1], ball[2]); ballSh.position.set(ball[0], 0.03, ball[2]); const sc = clamp(1 - ball[1] * 0.12, 0.5, 1); ballSh.scale.set(sc, sc, 1);
  }

  // ================================================================ PEOPLE BUILDER + UPDATE
  BUILDERS.push(function people() {
    LM = new T.Matrix4(); PM = new T.Matrix4(); AM = new T.Matrix4(); ROOT = new T.Matrix4(); NEG = new T.Matrix4(); Q4b = new T.Quaternion(); E4b = new T.Euler(); ONE = new T.Vector3(1, 1, 1);
    const geos = personGeos(), list = createPeople(), N = list.length, mat = vcMat(); initVisitors();
    const mk = (name, geo, n) => { const m = new T.InstancedMesh(geo, mat, n); m.frustumCulled = false; m.name = 'island_ppl_' + name; G.add(m); PPL.mesh[name] = m; return m; };
    const M = {}; M.torso = mk('torso', geos.torso, N); M.head = mk('head', geos.head, N); M.hair = mk('hair', geos.hair, N); M.legs = mk('legs', geos.leg, N * 2); M.arms = mk('arms', geos.arm, N * 2);
    const rackets = list.filter(p => p.racket); M.racket = mk('racket', geos.racket, Math.max(1, rackets.length));
    rackets.forEach((p, i) => { p.rk = i; COL.setHex(p.rcol || C.blue); M.racket.setColorAt(i, COL); });
    list.forEach((p, k) => {
      COL.setHex(p.shirt); M.torso.setColorAt(k, COL); COL.setHex(p.skin); M.head.setColorAt(k, COL); COL.setHex(p.hair); M.hair.setColorAt(k, COL);
      COL.setHex(p.pants); M.legs.setColorAt(k * 2, COL); M.legs.setColorAt(k * 2 + 1, COL); COL.setHex(p.armCol); M.arms.setColorAt(k * 2, COL); M.arms.setColorAt(k * 2 + 1, COL);
    });
    // seed the players
    const P = PPL.players; P.forEach((p, i) => { p.tgt = baseOf(i); p.vmax = 2; }); RY.server = 0; RY.missAt = 7;
    PPL.active = list.length;
    mobileHooks.push(m => { PPL.active = m ? PPL.ess : list.length; M.torso.count = M.head.count = M.hair.count = PPL.active; M.legs.count = M.arms.count = PPL.active * 2; });
    updaters.push((dt, t) => {
      updRally(dt, t);
      for (let k = 0; k < PPL.active; k++) {
        const p = list[k], x0 = p.x, z0 = p.z;
        if (p.kind === 'visitor') updVisitor(p, dt, t); else if (p.kind === 'static') updStatic(p, dt, t);
        else if (p.kind === 'player' && p.sw) { /* swing applied below */ }
        pose(p, dt, t, hyp(p.x - x0, p.z - z0));
        if (p.kind === 'player') {
          if (p.sw) { const u = clamp(p.sw / 0.5, 0, 1.8); p.po.ax[1] = swingCurve(Math.min(u, 1)); p.po.az[1] = 0.15; p.po.lean = 0.12; p.po.hx = 0.1; }
          else if (!p.act) { p.po.ax[1] = 0.25 + sin(t * 2 + p.id) * 0.05; }
        }
      }
      drawPeople();
    });
  });

  // ================================================================ TOURNAMENT MARQUEE (36.5, 6)
  BUILDERS.push(function marquee() {
    const S = B.S, rr = rects(), cx = 36.5, cz = 6, x0 = 30.5, x1 = 42.5, z0 = 2, z1 = 10, eave = 2.4, ridge = 4.3, ang = Math.atan2(ridge - eave, 4);
    cutBatch('building', cx, cz, function (b) {
      for (let i = 0; i < 12; i++) {
        const x = x0 + 0.5 + i, col = i % 2 ? C.cream : C.blue, len = hyp(4, ridge - eave) + 0.12;
        b.add(tpl('box'), compose(x, (eave + ridge) / 2 + 0.03, 4, 1.0, 0.07, len, 0, -ang), col);
        b.add(tpl('box'), compose(x, (eave + ridge) / 2 + 0.03, 8, 1.0, 0.07, len, 0, ang), col);
        b.boxB(x - 0.25, eave - 0.45, z0 - 0.05, 0.5, 0.45, 0.05, i % 2 ? C.blue : C.cream); b.boxB(x + 0.25, eave - 0.4, z0 - 0.05, 0.5, 0.4, 0.05, i % 2 ? C.cream : C.blue);
        b.boxB(x - 0.25, eave - 0.45, z1 + 0.05, 0.5, 0.45, 0.05, i % 2 ? C.blue : C.cream); b.boxB(x + 0.25, eave - 0.4, z1 + 0.05, 0.5, 0.4, 0.05, i % 2 ? C.cream : C.blue);
      }
      b.box(cx, ridge + 0.1, cz, 12.3, 0.16, 0.2, C.ink).box(cx, eave, z0, 12.3, 0.1, 0.1, C.ink).box(cx, eave, z1, 12.3, 0.1, 0.1, C.ink);
      [0, 4, 8, 12].forEach(d => { const x = x0 + d; b.boxB(x, 0, z0, 0.14, eave, 0.14, C.cream).boxB(x, 0, z1, 0.14, eave, 0.14, C.cream); if (d % 6 === 0 || d === 12) b.boxB(x, 0, cz, 0.16, ridge, 0.16, C.cream); });
      b.boxB(x1 - 0.05, 0, cz, 0.06, eave, z1 - z0, C.cream).boxB(x1 - 0.05, 0, cz, 0.08, 0.5, z1 - z0, C.blue);
      b.tri([x1, eave, z0], [x1, eave, z1], [x1, ridge, cz], C.cream, [x1 - 10, 3, cz]); b.tri([x1, eave, z0], [x1, eave, z1], [x1, ridge, cz], C.cream, [x1 + 10, 3, cz]);
      b.tri([x0, eave, z0], [x0, eave, z1], [x0, ridge, cz], C.blue, [x0 - 10, 3, cz]); b.tri([x0, eave, z0], [x0, eave, z1], [x0, ridge, cz], C.blue, [x0 + 10, 3, cz]);
      b.sign(x1 - 0.12, 1.55, cz, 6.2, 0.93, -PI / 2, rr.banner_hosp);
      for (let i = 0; i < 7; i++) { b.add(tpl('wedge'), compose(x0 + 0.5 + i * 1.8, ridge + 0.5, cz, 0.35, 0.5, 0.05, 0), i % 2 ? C.yellow : C.red); }
    }, 'island_marquee');
    // interior: tables, cloths, buffet, decor (static: stays visible when the roof fades)
    function longTable(x, z, len, along, cloth, ry) {
      S.add(tpl('box'), compose(x, 0.82, z, along ? len : 0.9, 0.06, along ? 0.9 : len, 0), 0xc9a066);
      S.add(tpl('box'), compose(x, 0.45, z, along ? len + 0.1 : 1.0, 0.85, along ? 1.0 : len + 0.1, 0), cloth);
      S.add(tpl('box'), compose(x, 0.86, z, along ? len : 0.3, 0.03, along ? 0.3 : len, 0), C.cream);
    }
    longTable(35.5, 3.4, 6.2, true, C.blue); longTable(41.3, 6, 5.2, false, C.cream);
    S.boxB(32.6, 0.88, 3.4, 0.5, 0.18, 0.4, C.steel).boxB(33.5, 0.88, 3.3, 0.6, 0.1, 0.45, C.cream).cyl(34.3, 0.88, 3.4, 0.2, 0.2, 0.22, 8, C.red).cyl(35.1, 0.88, 3.5, 0.12, 0.12, 0.3, 6, C.blue).cyl(35.4, 0.88, 3.4, 0.12, 0.12, 0.3, 6, C.green).boxB(36.2, 0.88, 3.4, 0.4, 0.2, 0.4, 0xe9b44c).boxB(36.9, 0.88, 3.3, 0.35, 0.08, 0.35, C.pink).cyl(37.6, 0.88, 3.4, 0.22, 0.22, 0.14, 8, C.white).ico(37.6, 1.12, 3.4, 0.12, 0.1, 0.12, C.orange, 0, 0).boxB(38.4, 0.88, 3.4, 0.5, 0.16, 0.4, C.yellow);
    [5.0, 5.9, 6.8].forEach((z, i) => { S.boxB(41.2, 0.88, z, 0.7, 0.2, 0.5, C.steel).boxB(41.2, 1.08, z, 0.74, 0.05, 0.54, C.dsteel); S.cyl(41.5, 0.88, z + 0.28, 0.08, 0.08, 0.2, 6, [C.red, C.green, C.yellow][i]); });
    S.boxB(41.2, 0.88, 7.7, 0.55, 0.18, 0.45, C.white).boxB(41.3, 0.88, 4.1, 0.4, 0.3, 0.4, C.blue);
    [[34.5, 7.6], [38.4, 7.6], [36.4, 5.4]].forEach((p, i) => {
      S.cyl(p[0], 0, p[1], 0.62, 0.62, 0.06, 10, C.cream).cyl(p[0], 0.06, p[1], 0.07, 0.07, 1.0, 6, C.steel).cyl(p[0], 1.04, p[1], 0.65, 0.65, 0.05, 10, i === 2 ? C.blue : C.cream);
      S.cyl(p[0], 1.08, p[1], 0.07, 0.05, 0.22, 6, 0xbfeaff).ico(p[0], 1.38, p[1], 0.12, 0.1, 0.12, [C.pink, C.yellow, C.red][i], 0, 0);
    });
    // standing heater / crates / drinks tub
    S.boxB(31.4, 0, 8.8, 0.9, 0.55, 0.6, 0x3c6e9a).boxB(31.4, 0.55, 8.8, 0.95, 0.06, 0.65, C.blue); S.cyl(31.3, 0.6, 8.8, 0.1, 0.1, 0.3, 6, C.yellow).cyl(31.6, 0.6, 8.9, 0.1, 0.1, 0.3, 6, C.red);
    glowPts.push({ x: 34, y: 3.2, z: 6, r: 3.6, c: 0xffd890, k: 0.5 }, { x: 39, y: 3.2, z: 6, r: 3.6, c: 0xffd890, k: 0.5 });
    stringLine([30.7, 2.35, 3.4, 42.3, 2.35, 3.4], 0.5, 18); stringLine([30.7, 2.35, 8.6, 42.3, 2.35, 8.6], 0.5, 18);
  });

  // ================================================================ SKY LAYER: clouds, floating rocks, birds + waterfall
  const SKY = { clouds: [], rocks: [], birds: [] };
  BUILDERS.push(function skyLayer() {
    const grp = new T.Group(); grp.name = 'island_sky'; G.add(grp); sky.group = grp;
    const mat = vcMat(), rs = HPO.makeRng(808);
    // clouds
    const proto = [
      [[0, 0, 0, 3.2, 1.6, 2.4], [2.8, -0.2, 0.3, 2.3, 1.3, 1.9], [-2.7, -0.3, -0.2, 2.1, 1.2, 1.7], [0.6, 1.0, 0, 2.1, 1.3, 1.8]],
      [[0, 0, 0, 2.6, 1.3, 2.0], [2.2, 0.3, 0, 1.8, 1.2, 1.6], [-2.0, -0.1, 0.2, 1.6, 1.0, 1.4]],
      [[0, 0, 0, 3.8, 1.5, 2.6], [3.2, 0.1, 0.2, 2.6, 1.2, 2.0], [-3.4, -0.2, 0, 2.4, 1.1, 1.8], [0.2, 1.2, 0.2, 2.4, 1.3, 1.9], [-1.4, 0.9, -0.3, 1.5, 1.0, 1.3]]
    ];
    const cl = [[0.6, 62, -3, 1.3, 0.004], [1.9, 70, 3, 1.0, 0.003], [3.1, 58, -6, 1.5, 0.005], [4.2, 82, 8, 1.8, 0.0025], [5.3, 66, 1, 1.1, 0.0035], [2.5, 90, 12, 2.0, 0.002], [0.1, 76, -8, 1.6, 0.003], [3.9, 64, 5, 0.9, 0.0045], [5.9, 74, -2, 1.2, 0.003]];
    proto.forEach((pr, v) => {
      const b = new Batch(); pr.forEach((p, i) => b.ico(p[0], p[1], p[2], p[3], p[4], p[5], i % 2 ? 0xeef6ff : 0xffffff, i, 1));
      const mine = cl.filter((c, i) => i % 3 === v), im = new T.InstancedMesh(b.geometry(), mat, mine.length); im.frustumCulled = false; im.name = 'island_clouds' + v; grp.add(im);
      SKY.clouds.push({ mesh: im, list: mine.map(c => ({ a: c[0], r: c[1], y: c[2], s: c[3], sp: c[4] })) });
    });
    // floating rocks
    const rb = new Batch();
    rb.ico(0, 0, 0, 2.2, 1.2, 2.0, 0x8a8fa3, 0.4, 0).add(tpl('cyl:6:0'), compose(0, -2.1, 0, 1.7, 3.2, 1.6, 0, PI), 0x6a708c).add(tpl('cyl:6:0'), compose(0.6, -2.9, 0.3, 0.8, 2.2, 0.8, 0, PI), 0x565b78);
    rb.cyl(0, 0.9, 0, 2.15, 1.9, 0.45, 7, 0x68b845).cyl(0, 1.3, 0, 1.7, 1.6, 0.18, 7, 0x7cc653).boxB(0.5, 1.4, 0.2, 0.25, 0.8, 0.25, 0x7a4a2a).ico(0.5, 2.5, 0.2, 0.8, 0.7, 0.8, 0x4e9e3a, 0.2, 0).boxB(-0.9, 1.4, -0.3, 0.45, 0.28, 0.35, 0xb0b5bf);
    const rp = [[56, -5, 10, 1.0], [-60, -2, -20, 1.3], [30, -7, -62, 1.1], [-44, 3, 52, 0.8], [64, 2, -34, 1.5], [-20, -9, 66, 1.0]];
    const rim = new T.InstancedMesh(rb.geometry(), mat, rp.length); rim.frustumCulled = false; rim.name = 'island_floatrocks'; grp.add(rim); SKY.rocks = rp.map((r, i) => ({ x: r[0], y: r[1], z: r[2], s: r[3], ph: i * 1.3 })); SKY.rockMesh = rim;
    // birds (two wing instances per bird)
    const wb = new Batch(); wb.box(0.32, 0, 0, 0.64, 0.035, 0.26, 0xffffff).box(0.6, 0, 0.02, 0.2, 0.036, 0.2, 0x3a4458);
    const nb = 8, bm = new T.InstancedMesh(wb.geometry(), vcMat({ side: T.DoubleSide }), nb * 2); bm.frustumCulled = false; bm.name = 'island_birds'; grp.add(bm);
    for (let i = 0; i < nb; i++) SKY.birds.push({ a: rs.next() * TAU, r: rs.range(14, 40), y: rs.range(11, 16), sp: rs.range(0.05, 0.12) * (i % 2 ? 1 : -1), ph: rs.next() * TAU });
    SKY.birdMesh = bm;
    function draw(t) {
      SKY.clouds.forEach(c => c.list.forEach((o, i) => {
        const aa = o.a + t * o.sp * 4; V3a.set(cos(aa) * o.r, o.y + sin(t * 0.2 + i) * 0.3, sin(aa) * o.r); E4.set(0, -aa + 0.4, 0); Q4.setFromEuler(E4); S3.set(o.s, o.s, o.s); M4.compose(V3a, Q4, S3); c.mesh.setMatrixAt(i, M4);
      })); SKY.clouds.forEach(c => { c.mesh.instanceMatrix.needsUpdate = true; });
      SKY.rocks.forEach((r, i) => { V3a.set(r.x, r.y + sin(t * 0.5 + r.ph) * 0.6, r.z); E4.set(0, t * 0.05 + r.ph, 0); Q4.setFromEuler(E4); S3.set(r.s, r.s, r.s); M4.compose(V3a, Q4, S3); rim.setMatrixAt(i, M4); }); rim.instanceMatrix.needsUpdate = true;
      SKY.birds.forEach((b, i) => {
        const a = b.a + t * b.sp, flap = sin(t * 9 + b.ph) * 0.6;
        V3a.set(cos(a) * b.r, b.y + sin(t * 0.7 + b.ph) * 0.6, sin(a) * b.r); E4.set(0, -a + (b.sp > 0 ? PI : 0), 0); Q4.setFromEuler(E4); S3.set(1, 1, 1); ROOT.compose(V3a, Q4, S3);
        [1, -1].forEach((sd, k) => { LM.compose(V3b.set(0, 0, 0), Q4b.setFromEuler(E4b.set(0, 0, flap * sd)), ONE.set(sd, 1, 1)); PM.multiplyMatrices(ROOT, LM); bm.setMatrixAt(i * 2 + k, PM); ONE.set(1, 1, 1); });
      }); bm.instanceMatrix.needsUpdate = true;
    }
    draw(0);
    updaters.push((dt, t) => draw(t));
    todListeners.push(p => { bm.visible = p.night < 0.7 && !p.indoor; });
    mobileHooks.push(m => { SKY.clouds.forEach(c => { c.mesh.count = m ? 1 : c.list.length; }); rim.count = m ? 3 : rp.length; bm.count = (m ? 4 : nb) * 2; });
    // waterfall off the pond spill
    const a = Math.atan2(36.4, -30.3), wfTex = R.canvasTex(32, 64, (g, w, h) => {
      g.clearRect(0, 0, w, h); const rw = HPO.makeRng(12);
      for (let i = 0; i < 26; i++) { g.fillStyle = rw.next() < 0.5 ? 'rgba(255,255,255,0.95)' : 'rgba(150,215,250,0.9)'; g.fillRect((rw.next() * w) | 0, (rw.next() * h) | 0, 2, 6 + ((rw.next() * 14) | 0)); }
      g.fillStyle = 'rgba(90,180,235,0.75)'; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 5, h);
    });
    wfTex.wrapS = wfTex.wrapT = T.RepeatWrapping; wfTex.repeat.set(1, 3);
    const wm = R.mat(0xffffff, { map: wfTex, transparent: true, opacity: 0.88, side: T.DoubleSide });
    const wf = new T.Mesh(new T.PlaneGeometry(1.2, 11), wm); wf.position.set(cos(a) * 48.1, -5.2, sin(a) * 48.1); wf.rotation.y = Math.atan2(cos(a), sin(a)); wf.name = 'island_waterfall'; G.add(wf);
    updaters.push((dt, t) => { wfTex.offset.y = (t * 1.1) % 1; });
  });

  // ================================================================ FINISHERS (flags, bunting, bulbs, glow sprites)
  const mobileHooks = [];
  let flagMesh = null, buntMesh = null, bulbMesh = null, glowMesh = null, glowMat = null;

  function finishFlags() {
    if (!FLAGS.length) return;
    const cols = 6, rows = 3, cells = [];
    FLAGS.forEach((f, fi) => { for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) cells.push({ f: fi, i: i, j: j, col: i === 0 && j === 1 ? C.yellow : f.col[j] }); });
    const nv = cells.length * 6, pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), colr = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    cells.forEach((c, k) => {
      COL.setHex(c.col); const f = FLAGS[c.f], wx = cos(f.wind), wz = sin(f.wind);
      for (let v = 0; v < 6; v++) { const o = (k * 6 + v) * 3; colr[o] = COL.r; colr[o + 1] = COL.g; colr[o + 2] = COL.b; nor[o] = -wz; nor[o + 1] = 0; nor[o + 2] = wx; uv[(k * 6 + v) * 2] = atlas.wu; uv[(k * 6 + v) * 2 + 1] = atlas.wv; }
    });
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nor, 3));
    g.setAttribute('color', new T.BufferAttribute(colr, 3)); g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    flagMesh = new T.Mesh(g, vcMat({ side: T.DoubleSide })); flagMesh.frustumCulled = false; flagMesh.userData.cells = cells; flagMesh.name = 'island_flags';
    G.add(flagMesh); updateFlags(0);
  }
  function updateFlags(t) {
    if (!flagMesh) return;
    const cells = flagMesh.userData.cells, P = flagMesh.geometry.attributes.position.array, cols = 6, rows = 3;
    const pt = (f, u, v) => {
      const wx = cos(f.wind), wz = sin(f.wind), a = u * f.len, w = sin(t * 4.2 - u * 7 + f.ph) * 0.2 * u + sin(t * 2.3 + f.ph) * 0.08 * u;
      return [f.x + wx * a - wz * w, f.y - v * f.h - 0.12 * u * u + sin(t * 3 - u * 5 + f.ph) * 0.05 * u, f.z + wz * a + wx * w];
    };
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], f = FLAGS[c.f], u0 = c.i / cols, u1 = (c.i + 1) / cols, v0 = c.j / rows, v1 = (c.j + 1) / rows;
      const a = pt(f, u0, v0), b = pt(f, u1, v0), cc = pt(f, u1, v1), d = pt(f, u0, v1), o = k * 18, q = [a, b, cc, a, cc, d];
      for (let v = 0; v < 6; v++) { P[o + v * 3] = q[v][0]; P[o + v * 3 + 1] = q[v][1]; P[o + v * 3 + 2] = q[v][2]; }
    }
    flagMesh.geometry.attributes.position.needsUpdate = true;
  }
  function finishBunting() {
    if (!BUNT.length) return;
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.17, 0, 0, 0.17, 0, 0, 0, -0.38, 0]), 3));
    g.setAttribute('normal', new T.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)); g.setAttribute('color', new T.BufferAttribute(new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1]), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array([atlas.wu, atlas.wv, atlas.wu, atlas.wv, atlas.wu, atlas.wv]), 2));
    const n = BUNT.length; buntMesh = new T.InstancedMesh(g, vcMat({ side: T.DoubleSide }), n); buntMesh.frustumCulled = false; buntMesh.name = 'island_bunting';
    BUNT.forEach((b, i) => { COL.setHex(b.col); buntMesh.setColorAt(i, COL); });
    G.add(buntMesh); updateBunting(0);
  }
  function updateBunting(t) {
    if (!buntMesh) return;
    for (let i = 0; i < BUNT.length; i++) {
      const b = BUNT[i]; E4.set(sin(t * 2.1 + b.ph) * 0.35, b.yaw - PI / 2, 0, 'YXZ'); Q4.setFromEuler(E4); V3a.set(b.x, b.y, b.z); S3.set(1, 1, 1);
      M4.compose(V3a, Q4, S3); buntMesh.setMatrixAt(i, M4);
    }
    buntMesh.instanceMatrix.needsUpdate = true;
  }
  function finishBulbs() {
    if (!bulbPts.length) return;
    bulbMesh = new T.InstancedMesh(new T.BoxGeometry(0.16, 0.16, 0.16), matGlow, bulbPts.length); bulbMesh.frustumCulled = false; bulbMesh.name = 'island_bulbs';
    bulbPts.forEach((b, i) => { M4.makeTranslation(b.x, b.y, b.z); bulbMesh.setMatrixAt(i, M4); COL.setHex(b.c); bulbMesh.setColorAt(i, COL); });
    // plain box geometry has no vertex colours: supply white
    const n = bulbMesh.geometry.attributes.position.count, cArr = new Float32Array(n * 3).fill(1); bulbMesh.geometry.setAttribute('color', new T.BufferAttribute(cArr, 3));
    const uvA = bulbMesh.geometry.attributes.uv.array; for (let i = 0; i < uvA.length; i += 2) { uvA[i] = atlas.wu; uvA[i + 1] = atlas.wv; }
    G.add(bulbMesh);
  }
  function finishGlow() {
    if (!glowPts.length) return;
    const tex = R.canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(0.65, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    tex.magFilter = tex.minFilter = T.LinearFilter;
    glowMat = new T.MeshBasicMaterial({ map: tex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0, fog: false });
    glowMesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), glowMat, glowPts.length); glowMesh.frustumCulled = false; glowMesh.visible = false; glowMesh.name = 'island_glow'; glowMesh.renderOrder = 5;
    glowPts.forEach((p, i) => { COL.setHex(p.c); glowMesh.setColorAt(i, COL); });
    G.add(glowMesh);
  }
  function updateGlow() {
    if (!glowMesh) return;
    const on = lampLevel > 0.03; glowMesh.visible = on; if (!on) return;
    glowMat.opacity = clamp(lampLevel, 0, 1) * 0.8;
    const q = R.camera.quaternion;
    for (let i = 0; i < glowPts.length; i++) { const p = glowPts[i]; V3a.set(p.x, p.y, p.z); S3.set(p.r * 2, p.r * 2, 1); M4.compose(V3a, q, S3); glowMesh.setMatrixAt(i, M4); }
    glowMesh.instanceMatrix.needsUpdate = true;
  }

  // ================================================================ MODULE API
  let tAnim = 0;
  function init(ctx) {
    T = ctx.THREE || window.THREE; R = HPO.mod.render; G = R.groups.island || R.groups.world;
    mobile = !!((ctx.opts && ctx.opts.mobile) || (HPO.cfg && HPO.cfg.mobile));
    initTmp(); rng = HPO.makeRng(20240611);
    buildAtlas(); layout();
    const size = mobile ? 1024 : 2048;
    W._groundTex = R.canvasTex(size, size, (g, w, h) => paintGround(g, w));
    matStatic = vcMat(); matGlow = vcMat({ emissive: 0xffc860, emissiveIntensity: 0 });
    B.grp = G; B.S = new Batch(); B.Gl = new Batch();
    buildTerrain(G, B.S);
    BUILDERS.forEach(fn => { try { fn(); } catch (e) { HPO.util.logError('worldIsland:' + (fn.name || 'builder'), e); if (typeof console !== 'undefined') console.error('[worldIsland]', fn.name, e); } });
    const sm = B.S.build(matStatic, 0, 0); sm.name = 'island_static'; G.add(sm); B.staticMesh = sm;
    if (B.Gl.p.length) { const gm = B.Gl.build(matGlow, 0, 0); gm.name = 'island_glowgeo'; G.add(gm); }
    finishFlags(); finishBunting(); finishBulbs(); finishGlow();
    W.ready = true;
    const p = R.todParams; if (p) setTimeOfDay(R.tod || p.tod, p);
    setOptions({ mobile: mobile });
  }
  function update(dt, t) {
    if (!W.ready) return;
    tAnim += dt; const tt = tAnim;
    updateFlags(tt); updateBunting(tt); updateGlow();
    for (let i = 0; i < updaters.length; i++) { try { updaters[i](dt, tt); } catch (e) { HPO.util.logError('worldIsland.update', e); } }
  }
  function setTimeOfDay(tod, p) {
    p = p || (R && R.todParams) || { lamps: 0, indoor: false };
    curTod = tod; lampLevel = p.lamps || 0; indoor = !!p.indoor;
    if (matGlow) matGlow.emissiveIntensity = lampLevel * 1.15;
    if (bulbMesh) bulbMesh.visible = true;
    for (let i = 0; i < todListeners.length; i++) { try { todListeners[i](p); } catch (e) { HPO.util.logError('worldIsland.tod', e); } }
  }
  function setVenue(name) {
    if (sky.group) sky.group.visible = name !== 'indoor';
    W.venue = name; W.indoorVenue = name === 'indoor';
  }
  function setOptions(o) {
    o = o || {};
    if (o.mobile !== undefined) { mobile = !!o.mobile; mobileHooks.forEach(f => f(mobile)); }
  }
  function dispose() {
    cutList.forEach(o => { if (R.cutaway && R.cutaway.remove) R.cutaway.remove(o); });
    while (G && G.children.length) { const c = G.children.pop(); if (c.geometry) c.geometry.dispose(); }
    W.ready = false;
  }
  W.init = init; W.update = update; W.setTimeOfDay = setTimeOfDay; W.setVenue = setVenue; W.setOptions = setOptions; W.dispose = dispose;
})(HPO);
