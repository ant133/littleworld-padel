// World: the enclosed padel court (turf, lines, glass, mesh fence, posts, net, doors, signage, apron).
// Geometry matches HPO.mod.court.SURFACES exactly (worldCourt.check() verifies it). 1 unit = 1 m, Y up.
(function (HPO) {
  'use strict';
  const U = HPO.util;

  // ---------------------------------------------------------------- constants
  const HL = 10, HW = 5, GH = 3, TOP = 4, DOOR_H = 1.9, POST_Z = 5.05, SVC = 6.95;
  const LINE_W = 0.07, LINE_Y = 0.004;         // slightly wider than the 5 cm rule so it survives the pixel pass
  const HALF_DOOR = 1.0, LEAF_W = 0.9, CORNER = 8, GLASS_END = 6; // side glass spans |x| in [6,10]; only [8,10] has mesh above (4 m)
  const DOOR_POS = [[0, 1], [0, -1]]; // [x, sz]: one 2 m entrance per long side, centred on the net; two leaves with the net post between them
  const netH = z => 0.88 + 0.04 * (z / 5) * (z / 5);

  const VEN = {
    classicBlue: { turf: 0x2b6cb4, sand: 0xd6cba2, run: 0x5f9ad2, runType: 'hard', frame: 0x2d4f73, glass: 0x9fd2ee, gloss: 0, led: 0.55 },
    terracotta: { turf: 0xc2552b, sand: 0xe0b98a, run: 0xd68f5b, runType: 'hard', frame: 0x1f4f3a, glass: 0xd0e6dc, gloss: 0, led: 0.55 },
    fastBlue: { turf: 0x1a9ee0, sand: 0xe4e0b8, run: 0x6fd0ee, runType: 'hard', frame: 0x264f7e, glass: 0x9fe8f8, gloss: 0.5, led: 0.6 },
    indoor: { turf: 0x2563ae, sand: 0xd2c9a8, run: 0xc79c66, runType: 'wood', frame: 0x4a5b70, glass: 0xb9d4ea, gloss: 0.3, led: 0.8 }
  };

  const SPONSORS = [
    { id: 'lintas', name: 'LINTAS', sub: 'COURT RAIL', bg: '#fffaf0', fg: '#123954', acc: '#e8452c', glyph: 'rail' },
    { id: 'tapak', name: 'TAPAK SMASH', sub: '', bg: '#ff7a1a', fg: '#fffaf0', acc: '#123954', glyph: 'foot' },
    { id: 'mandau', name: 'MANDAU RAYA', sub: 'BANK', bg: '#0f4a36', fg: '#f6d04d', acc: '#f6d04d', glyph: 'blade' },
    { id: 'lapang', name: 'LAPANG AMANAH', sub: 'BANK', bg: '#173f7a', fg: '#fffaf0', acc: '#5cc6ff', glyph: 'field' },
    { id: 'aquvivo', name: 'AQUVIVO', sub: '', bg: '#1fb5d9', fg: '#ffffff', acc: '#0e5f86', glyph: 'drop' },
    { id: 'gojeg', name: 'GO-JEG', sub: '', bg: '#16a34a', fg: '#ffffff', acc: '#ffd23f', glyph: 'helmet' },
    { id: 'pokari', name: 'POKARI SWEET', sub: '', bg: '#e8f3ff', fg: '#1b5fb8', acc: '#1b5fb8', glyph: 'wave' },
    { id: 'annetta', name: 'annetta.dev', sub: '', bg: '#fffaf0', fg: '#123954', acc: '#177dc5', glyph: 'annetta' }
  ];
  const LED_TXT = ['LINTAS', 'TAPAK', 'MANDAU', 'LAPANG', 'AQUVIVO', 'GO-JEG', 'POKARI', 'annetta.dev'];

  // ---------------------------------------------------------------- module state
  let T = null, R = null, G = null, inited = false;
  const S = { venue: 'classicBlue', tod: 'day', glassOpacity: 1, showMarkings: true, mobile: false, t: 0, lamps: 0 };
  const M = {};                                  // meshes
  const vMats = { turf: {}, apron: {}, frame: {}, glass: {} };
  let ledTex = null, ledMat = null, glassTexture = null, logoTex = null;
  let fenceRecs = [], glassRecs = [], doorRecs = [];

  const C = HPO.mod.worldCourt = {
    glassPanels: [], doors: [], netMesh: null, venue: 'classicBlue',
    LINE_W: LINE_W,
    init, update, setTimeOfDay, setVenue, setOptions, openDoor, check, dispose
  };

  // ---------------------------------------------------------------- small helpers
  function rgb(hex) { return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]; }
  function css(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }
  function mulc(c, k) { return [U.clamp(c[0] * k, 0, 255), U.clamp(c[1] * k, 0, 255), U.clamp(c[2] * k, 0, 255)]; }
  function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // ---- tiny geometry merger (BufferGeometryUtils is not in the r128 core build) ----
  let unitBox = null, unitCyl = {};
  function Batch() { this.p = []; this.n = []; this.u = []; this.i = []; this.c = 0; }
  Batch.prototype.raw = function (pos, nor, uv, idx) {
    const o = this.c;
    for (let k = 0; k < pos.length; k++) { this.p.push(pos[k]); this.n.push(nor[k]); }
    for (let k = 0; k < uv.length; k++) this.u.push(uv[k]);
    for (let k = 0; k < idx.length; k++) this.i.push(o + idx[k]);
    this.c += pos.length / 3;
  };
  Batch.prototype.geo = function (g, m) {
    const g2 = g.clone(); g2.applyMatrix4(m);
    const P = g2.attributes.position.array, N = g2.attributes.normal.array, UV = g2.attributes.uv.array;
    const idx = g2.index ? Array.prototype.slice.call(g2.index.array) : Array.from({ length: P.length / 3 }, (_, k) => k);
    this.raw(Array.prototype.slice.call(P), Array.prototype.slice.call(N), Array.prototype.slice.call(UV), idx);
    g2.dispose();
  };
  Batch.prototype.box = function (cx, cy, cz, sx, sy, sz) {
    if (!unitBox) unitBox = new T.BoxGeometry(1, 1, 1);
    this.geo(unitBox, new T.Matrix4().makeScale(sx, sy, sz).setPosition(cx, cy, cz));
  };
  Batch.prototype.cyl = function (cx, cy, cz, r, h, seg) {
    seg = seg || 8;
    if (!unitCyl[seg]) unitCyl[seg] = new T.CylinderGeometry(1, 1, 1, seg);
    this.geo(unitCyl[seg], new T.Matrix4().makeScale(r, h, r).setPosition(cx, cy, cz));
  };
  // vertical quad facing the horizontal normal (nx,0,nz); u runs along (up x n) so text reads correctly from the normal side
  Batch.prototype.quadN = function (cx, cy, cz, nx, nz, w, h, u0, u1, v0, v1) {
    const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
    this.raw([cx - rx * hw, cy - hh, cz - rz * hw, cx + rx * hw, cy - hh, cz + rz * hw, cx + rx * hw, cy + hh, cz + rz * hw, cx - rx * hw, cy + hh, cz - rz * hw],
      [nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], [u0, v0, u1, v0, u1, v1, u0, v1], [0, 1, 2, 0, 2, 3]);
  };
  // horizontal quad facing up
  Batch.prototype.flat = function (x0, z0, x1, z1, y, u0, u1, v0, v1) {
    this.raw([x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      [u0, v0, u1, v0, u1, v1, u0, v1], [0, 2, 1, 0, 3, 2]);
  };
  Batch.prototype.mesh = function (mat) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    g.setIndex(this.c > 65535 ? new T.Uint32BufferAttribute(this.i, 1) : new T.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return new T.Mesh(g, mat);
  };

  // ---------------------------------------------------------------- textures
  function mkTurfTex(v) {
    const rng = HPO.makeRng(0x7a1f + (v.turf & 0xffff));
    const base = rgb(v.turf), dark = mulc(base, 0.86), light = mulc(base, 1.13), sand = rgb(v.sand);
    const tex = R.canvasTex(128, 128, function (g, w, h) {
      const img = g.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const r = rng.next(); let c = base;
        if (r < 0.28) c = dark; else if (r > 0.86) c = light;
        const j = 0.97 + rng.next() * 0.06, o = (y * w + x) * 4;
        d[o] = c[0] * j; d[o + 1] = c[1] * j; d[o + 2] = c[2] * j; d[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      for (let i = 0; i < 260; i++) {           // grass blades: short vertical 1x3 streaks, two tones
        g.fillStyle = css(rng.next() < 0.5 ? mulc(base, 0.78) : mulc(base, 1.22));
        g.fillRect(rng.int(0, w - 1), rng.int(0, h - 3), 1, rng.int(2, 3));
      }
      for (let i = 0; i < 110; i++) {           // sand infill specks
        g.fillStyle = css(mixc(sand, base, rng.next() * 0.35));
        g.fillRect(rng.int(0, w - 1), rng.int(0, h - 1), 1, 1);
      }
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(HL * 2 / 4, HW * 2 / 4);
    return tex;
  }
  function mkApronTex(v) {
    const rng = HPO.makeRng(0x31c2 + (v.run & 0xffff));
    const base = rgb(v.run);
    const tex = R.canvasTex(64, 64, function (g, w, h) {
      if (v.runType === 'wood') {
        for (let p = 0; p < 4; p++) {
          const c = mulc(base, 0.92 + rng.next() * 0.16);
          g.fillStyle = css(c); g.fillRect(0, p * 16, w, 16);
          g.fillStyle = css(mulc(base, 0.7)); g.fillRect(0, p * 16, w, 1);
          const sx = rng.int(6, w - 6); g.fillRect(sx, p * 16, 1, 16);
          for (let i = 0; i < 26; i++) { g.fillStyle = css(mulc(c, 0.9 + rng.next() * 0.2)); g.fillRect(rng.int(0, w - 3), p * 16 + rng.int(1, 14), rng.int(2, 6), 1); }
        }
      } else {
        g.fillStyle = css(base); g.fillRect(0, 0, w, h);
        for (let i = 0; i < 360; i++) { g.fillStyle = css(mulc(base, rng.next() < 0.5 ? 0.93 : 1.07)); g.fillRect(rng.int(0, w - 1), rng.int(0, h - 1), 1, 1); }
      }
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(13, 7.5);
    return tex;
  }
  function mkGlassTex() {
    const tex = R.canvasTex(32, 64, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.78)'; g.fillRect(0, 0, w, h);
      // diagonal sheen bands (very subtle: just a touch more opaque and whiter)
      for (let y = 0; y < h; y++) {
        const x0 = Math.floor(w - 1 - (y * 0.5) + 8);
        for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(x0 + k, y, 1, 1); }
        for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(x0 - 9 + k, y, 1, 1); }
      }
      // lighter edge
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1); g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    });
    return tex;
  }
  function mkFenceTex() {
    const tex = R.canvasTex(16, 16, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < w; i++) {              // diamond weave: two diagonals, 2 px thick, wrapping
        g.fillRect(i, i % h, 1, 1); g.fillRect(i, (i + 1) % h, 1, 1);
        g.fillRect(i, (h - 1 - i), 1, 1); g.fillRect(i, (h - 2 - i + h) % h, 1, 1);
      }
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.NearestFilter; tex.needsUpdate = true;
    return tex;
  }
  function mkNetTex() {
    const tex = R.canvasTex(16, 16, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,1)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
    });
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.generateMipmaps = true; tex.minFilter = T.LinearMipmapLinearFilter; tex.magFilter = T.NearestFilter; tex.needsUpdate = true;
    return tex;
  }
  function mkGlossTex() {
    return R.canvasTex(128, 64, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      [[0.12, 0.10, 14], [0.46, 0.07, 8], [0.68, 0.12, 20], [0.9, 0.05, 6]].forEach(function (b) {
        const x0 = b[0] * w, gr = g.createLinearGradient(x0, 0, x0 + b[2], 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (b[1] * 1.6) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.transform(1, 0, -0.6, 1, h * 0.3, 0); g.fillStyle = gr; g.fillRect(x0, 0, b[2], h); g.restore();
      });
    });
  }
  function star4(g, cx, cy, r, ri) {
    g.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 - Math.PI / 2, rr = k % 2 ? ri : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  function mkLogoTex(kind) {
    return R.canvasTex(128, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2;
      g.lineWidth = 7; g.strokeStyle = 'rgba(255,250,240,0.38)'; g.beginPath(); g.arc(cx, cy, 58, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,250,240,0.30)'; g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,250,240,0.38)';
      if (kind === 0) {                          // racket + ball mark with LJ
        g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('LJ', cx, cy - 2);
        g.fillStyle = 'rgba(216,242,74,0.55)'; g.beginPath(); g.arc(cx + 28, cy + 26, 6, 0, Math.PI * 2); g.fill();
      } else {                                   // annetta mark
        g.font = 'bold 40px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', cx - 6, cy);
        g.fillStyle = 'rgba(23,125,197,0.6)'; star4(g, cx + 22, cy - 14, 12, 3.5);
      }
    });
  }

  // ---- sponsor art ----
  function fitFont(g, txt, maxW, px, bold) {
    let s = px;
    for (; s > 5; s--) { g.font = (bold ? 'bold ' : '') + s + 'px sans-serif'; if (g.measureText(txt).width <= maxW) break; }
    g.font = (bold ? 'bold ' : '') + s + 'px sans-serif'; return s;
  }
  function glyph(g, kind, x, y, s, sp) {
    g.save(); g.translate(x, y); g.fillStyle = sp.acc; g.strokeStyle = sp.acc; g.lineWidth = Math.max(1, s * 0.12);
    if (kind === 'rail') { g.fillRect(0, s * 0.25, s, s * 0.14); g.fillRect(0, s * 0.62, s, s * 0.14); for (let i = 0; i < 4; i++) g.fillRect(i * s * 0.3, s * 0.15, s * 0.1, s * 0.7); }
    else if (kind === 'foot') { g.beginPath(); g.ellipse(s * 0.32, s * 0.62, s * 0.2, s * 0.3, 0.2, 0, 7); g.fill(); g.beginPath(); g.ellipse(s * 0.7, s * 0.4, s * 0.18, s * 0.27, 0.2, 0, 7); g.fill(); }
    else if (kind === 'blade') { g.beginPath(); g.moveTo(s * 0.5, 0); g.lineTo(s, s * 0.5); g.lineTo(s * 0.5, s); g.lineTo(0, s * 0.5); g.closePath(); g.fill(); g.fillStyle = sp.bg; g.fillRect(s * 0.42, s * 0.2, s * 0.16, s * 0.6); }
    else if (kind === 'field') { g.strokeRect(s * 0.05, s * 0.1, s * 0.9, s * 0.8); g.beginPath(); g.moveTo(s * 0.5, s * 0.1); g.lineTo(s * 0.5, s * 0.9); g.stroke(); g.beginPath(); g.arc(s * 0.5, s * 0.5, s * 0.16, 0, 7); g.stroke(); }
    else if (kind === 'drop') { g.beginPath(); g.moveTo(s * 0.5, 0); g.lineTo(s * 0.9, s * 0.6); g.arc(s * 0.5, s * 0.62, s * 0.4, 0, Math.PI); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); }
    else if (kind === 'helmet') { g.beginPath(); g.arc(s * 0.5, s * 0.55, s * 0.42, Math.PI, 0); g.lineTo(s * 0.92, s * 0.8); g.lineTo(s * 0.08, s * 0.8); g.closePath(); g.fillStyle = '#103a1e'; g.fill(); g.fillStyle = sp.acc; g.fillRect(s * 0.3, s * 0.45, s * 0.65, s * 0.14); }
    else if (kind === 'wave') { g.beginPath(); g.arc(s * 0.5, s * 0.5, s * 0.46, 0, 7); g.fill(); g.strokeStyle = sp.bg; g.lineWidth = Math.max(1, s * 0.1); g.beginPath(); g.moveTo(s * 0.1, s * 0.55); g.quadraticCurveTo(s * 0.3, s * 0.3, s * 0.5, s * 0.55); g.quadraticCurveTo(s * 0.7, s * 0.8, s * 0.9, s * 0.5); g.stroke(); }
    else if (kind === 'annetta') { g.fillRect(0, 0, s, s); g.fillStyle = '#fffaf0'; g.font = 'bold ' + Math.round(s * 0.75) + 'px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('A', s * 0.08, s * 0.54); star4(g, s * 0.78, s * 0.26, s * 0.2, s * 0.06); }
    g.restore();
  }
  function drawSponsor(g, x, y, w, h, sp, led, idx) {
    g.save(); g.translate(x, y);
    g.fillStyle = sp.bg; g.fillRect(0, 0, w, h);
    const st = Math.max(2, Math.round(h * 0.1)); g.fillStyle = sp.acc; g.fillRect(0, h - st, w, st);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 1);
    const gs = Math.round(h * (led ? 0.62 : 0.66)), gx = Math.round(h * 0.16), gy = Math.round((h - st - gs) / 2);
    glyph(g, sp.glyph, gx, gy, gs, sp);
    g.fillStyle = sp.fg; g.textAlign = 'left'; g.textBaseline = 'middle';
    const tx = gx + gs + 4, mw = w - tx - 3;
    if (led) { fitFont(g, LED_TXT[idx], mw, 9, true); g.fillText(LED_TXT[idx], tx, (h - st) / 2 + 1); }
    else if (sp.sub) { fitFont(g, sp.sub, mw, 7, true); g.fillText(sp.sub, tx, 6); fitFont(g, sp.name, mw, 12, true); g.fillText(sp.name, tx, 17); }
    else { fitFont(g, sp.name, mw, 12, true); g.fillText(sp.name, tx, (h - st) / 2 + 1); }
    g.restore();
  }
  const CELL = { w: 96, h: 29 }, TITLE_R = { x: 0, y: 36, w: 336, h: 72 }, ATLAS = { w: 1024, h: 128 };
  function mkAtlas(outer) {
    return R.canvasTex(ATLAS.w, ATLAS.h, function (g, w, h) {
      g.clearRect(0, 0, w, h);
      g.globalAlpha = outer ? 0.86 : 1;
      for (let k = 0; k < SPONSORS.length; k++) drawSponsor(g, k * CELL.w, 0, CELL.w, CELL.h, SPONSORS[k], false, k);
      // tournament title: two lines, cream with ink outline (hollow-ish on the near side so the ball stays readable)
      g.globalAlpha = outer ? 0.55 : 1;
      const t = HPO.cfg.TITLE(), i = t.indexOf(' Padel'), l1 = (i > 0 ? t.slice(0, i) : t).toUpperCase(), l2 = (i > 0 ? t.slice(i + 1) : '').toUpperCase();
      const R0 = TITLE_R; g.textAlign = 'center'; g.textBaseline = 'middle';
      function line(txt, cy, px) {
        fitFont(g, txt, R0.w - 16, px, true);
        g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = '#123954'; g.strokeText(txt, R0.x + R0.w / 2, cy);
        g.fillStyle = '#fffaf0'; g.fillText(txt, R0.x + R0.w / 2, cy);
      }
      line(l1, R0.y + 20, 24); line(l2, R0.y + 52, 34);
      g.globalAlpha = outer ? 0.7 : 1;
      g.fillStyle = '#d8f24a'; g.strokeStyle = '#123954'; g.lineWidth = 2;
      [R0.x + 12, R0.x + R0.w - 12].forEach(function (bx) { g.beginPath(); g.arc(bx, R0.y + 52, 6, 0, 7); g.fill(); g.stroke(); });
      g.globalAlpha = 1;
    });
  }
  function atlasUV(x, y, w, h) { return [x / ATLAS.w, (x + w) / ATLAS.w, 1 - (y + h) / ATLAS.h, 1 - y / ATLAS.h]; }
  function mkLedTex() {
    const cw = 64, ch = 16;
    const tex = R.canvasTex(cw * SPONSORS.length, ch, function (g, w, h) {
      for (let k = 0; k < SPONSORS.length; k++) {
        drawSponsor(g, k * cw, 0, cw, ch, SPONSORS[k], true, k);
        g.fillStyle = 'rgba(0,0,0,0.35)'; for (let yy = 1; yy < ch; yy += 2) g.fillRect(k * cw, yy, cw, 1); // LED row scan
      }
    });
    tex.wrapS = T.RepeatWrapping; tex.wrapT = T.ClampToEdgeWrapping;
    return tex;
  }

  // ---------------------------------------------------------------- venue-dependent material lookups
  function turfMat(v) {
    if (!vMats.turf[v]) vMats.turf[v] = R.mat(0xffffff, { map: mkTurfTex(VEN[v]) });
    return vMats.turf[v];
  }
  function apronMat(v) {
    if (!vMats.apron[v]) vMats.apron[v] = R.mat(0xffffff, { map: mkApronTex(VEN[v]) });
    return vMats.apron[v];
  }
  function frameMat(v) {
    if (!vMats.frame[v]) vMats.frame[v] = R.mat(VEN[v].frame);
    return vMats.frame[v];
  }
  function glassOp() { return 0.02 + 0.26 * U.clamp(S.glassOpacity, 0, 1); }
  function glassMat(v) {
    if (!vMats.glass[v]) {
      glassTexture = glassTexture || mkGlassTex();
      const m = R.mat(VEN[v].glass, { glass: true, transparent: true, opacity: glassOp(), map: glassTexture });
      m.opacity = glassOp(); m.transparent = true; m.depthWrite = false;
      vMats.glass[v] = m;
    }
    return vMats.glass[v];
  }

  // ---------------------------------------------------------------- build
  function build() {
    const W = 0xffffff;
    // --- ground: apron slab (26 x 15) with skirt down to the ground plane, kerb, turf, lines, logos, gloss
    const apron = new T.Mesh(new T.BoxGeometry(26, 0.2, 15), apronMat(S.venue));
    apron.position.set(0, -0.004 - 0.1, 0); apron.receiveShadow = true; M.apron = apron; G.add(apron);

    const kerb = new Batch(), KW = 0.2;
    kerb.box(0, 0.011, 7.5 - KW / 2, 26, 0.05, KW); kerb.box(0, 0.011, -7.5 + KW / 2, 26, 0.05, KW);
    kerb.box(13 - KW / 2, 0.011, 0, KW, 0.05, 15 - 2 * KW); kerb.box(-13 + KW / 2, 0.011, 0, KW, 0.05, 15 - 2 * KW);
    M.kerb = kerb.mesh(R.mat(0xc9c4b4)); G.add(M.kerb);

    const turf = new T.Mesh(new T.PlaneGeometry(HL * 2, HW * 2).rotateX(-Math.PI / 2), turfMat(S.venue));
    turf.receiveShadow = true; M.turf = turf; G.add(turf);

    const ln = new Batch(), lw = LINE_W / 2, ix = HL - LINE_W, iz = HW - LINE_W;
    const L = HPO.mod.court && HPO.mod.court.LINES, svc = (L && L.service && L.service[1]) || SVC;
    function seg(x0, z0, x1, z1) { ln.flat(x0, z0, x1, z1, LINE_Y, 0, 1, 0, 1); }
    seg(-HL, -HW, HL, -HW + LINE_W); seg(-HL, HW - LINE_W, HL, HW);         // sidelines (inside the wall plane)
    seg(-HL, -HW, -HL + LINE_W, HW); seg(HL - LINE_W, -HW, HL, HW);          // back lines
    seg(-svc - lw, -iz, -svc + lw, iz); seg(svc - lw, -iz, svc + lw, iz);    // service lines
    seg(-svc, -lw, svc, lw);                                                 // centre service line
    const lmat = R.mat(0xf6f6f0); lmat.polygonOffset = true; lmat.polygonOffsetFactor = -2; lmat.polygonOffsetUnits = -2;
    M.lines = ln.mesh(lmat); G.add(M.lines);
    void ix;

    // floor logo rings (one per half, in the back zone so the centre service line does not cross them)
    logoTex = [mkLogoTex(0), mkLogoTex(1)];
    M.logos = [];
    [-1, 1].forEach(function (sx, k) {
      const b = new Batch(); b.flat(sx * 8.5 - 1.5, -1.5, sx * 8.5 + 1.5, 1.5, 0.006, 0, 1, 0, 1);
      const m = b.mesh(R.mat(W, { map: logoTex[k], transparent: true, opacity: 1 })); G.add(m); M.logos.push(m);
    });
    const gloss = new T.Mesh(new T.PlaneGeometry(HL * 2, HW * 2).rotateX(-Math.PI / 2), R.mat(W, { map: mkGlossTex(), transparent: true, opacity: 0.5 }));
    gloss.position.y = 0.009; M.gloss = gloss; G.add(gloss);

    // --- frame (posts, rails, plinths, door jambs): one merged steel mesh
    const fr = new Batch(), tr = new Batch(), FT = 0.08;
    const postXs = [-8, -6, -4, -2, 2, 4, 6, 8], postZs = [-3, -1, 1, 3];   // no post at x=0: the entrance is there
    // back walls
    [-1, 1].forEach(function (sx) {
      const px = sx * (HL + FT / 2);
      postZs.forEach(function (z) { fr.box(px, TOP / 2, z, FT, TOP, FT); });
      fr.box(sx * (HL + 0.05), GH, 0, 0.1, 0.09, HW * 2 + 0.14);          // glass top tube (y=3)
      fr.box(sx * (HL + 0.05), TOP, 0, 0.1, 0.1, HW * 2 + 0.14);          // top rail (y=4)
      fr.box(sx * (HL + 0.065), 0.05, 0, 0.07, 0.1, HW * 2);              // plinth (outside the print band)
    });
    // side walls
    [-1, 1].forEach(function (sz) {
      const pz = sz * (HW + FT / 2);
      postXs.forEach(function (x) { const ph = Math.abs(x) >= CORNER ? TOP : GH; fr.box(x, ph / 2, pz, FT, ph, FT); });
      [[-HL, -GLASS_END], [GLASS_END, HL]].forEach(function (r) { fr.box((r[0] + r[1]) / 2, GH, sz * (HW + 0.05), r[1] - r[0], 0.09, 0.1); }); // top tube on both glass panels
      fr.box(0, GH, sz * (HW + 0.05), GLASS_END * 2, 0.1, 0.1);                                                  // top rail of the 3 m fence, continuous over the entrance
      fr.box(0, DOOR_H + 0.03, sz * (HW + 0.05), HALF_DOOR * 2, 0.07, 0.08);                                   // header bar over the opening
      [[-HL - 0.07, -CORNER], [CORNER, HL + 0.07]].forEach(function (r) { fr.box((r[0] + r[1]) / 2, TOP, sz * (HW + 0.05), r[1] - r[0], 0.1, 0.1); }); // 4 m rail over the corner glass only
      fr.box(0, 0.05, sz * (HW + 0.065), HL * 2, 0.1, 0.07);
      [[-GLASS_END, -HALF_DOOR], [HALF_DOOR, GLASS_END]].forEach(function (r) { fr.box((r[0] + r[1]) / 2, 1.1, sz * (HW + 0.05), r[1] - r[0], 0.05, 0.07); }); // mid rail on the mesh section
    });
    // corner posts (taller, thicker)
    [-1, 1].forEach(function (sx) { [-1, 1].forEach(function (sz) { fr.box(sx * (HL + 0.06), (TOP + 0.1) / 2, sz * (HW + 0.06), 0.12, TOP + 0.1, 0.12); }); });
    // door frames (jambs + header); the leaves are separate moving meshes
    DOOR_POS.forEach(function (d) {
      const x = d[0], sz = d[1], z = sz * (HW + 0.045);
      fr.box(x - HALF_DOOR, DOOR_H / 2 + 0.03, z, 0.08, DOOR_H + 0.06, 0.09); fr.box(x + HALF_DOOR, DOOR_H / 2 + 0.03, z, 0.08, DOOR_H + 0.06, 0.09);
      fr.box(x, DOOR_H + 0.035, z, HALF_DOOR * 2 + 0.08, 0.07, 0.09);
    });
    M.frame = fr.mesh(frameMat(S.venue)); M.frame.castShadow = true; G.add(M.frame);

    // LED boards along the apron edge (housings in the dark trim mesh)
    const LX = 12.3, LZ = 7.3, BH = 0.55, BY = 0.34;
    tr.box(0, BY, LZ + 0.07, LX * 2 + 0.3, BH + 0.1, 0.12); tr.box(0, BY, -LZ - 0.07, LX * 2 + 0.3, BH + 0.1, 0.12);
    tr.box(LX + 0.07, BY, 0, 0.12, BH + 0.1, LZ * 2 + 0.12); tr.box(-LX - 0.07, BY, 0, 0.12, BH + 0.1, LZ * 2 + 0.12);
    // net hardware: anchor plates + stand feet go into the trim too
    [-1, 1].forEach(function (sz) { tr.box(0, 0.012, sz * POST_Z, 0.26, 0.024, 0.26); });
    tr.box(0, 0.012, 0, 0.16, 0.024, 0.16);
    M.trim = tr.mesh(R.mat(0x1c2a38)); G.add(M.trim);

    ledTex = mkLedTex();
    ledMat = R.mat(W, { map: ledTex, emissive: 0xffffff }); ledMat.emissiveMap = ledTex; ledMat.emissiveIntensity = 0.55;
    const lb = new Batch(), ledLen = 24;
    lb.quadN(0, BY, LZ, 0, -1, LX * 2, BH, 0, LX * 2 / ledLen, 0, 1);
    lb.quadN(0, BY, -LZ, 0, 1, LX * 2, BH, 0, LX * 2 / ledLen, 0, 1);
    lb.quadN(LX, BY, 0, -1, 0, LZ * 2, BH, 0, LZ * 2 / ledLen, 0, 1);
    lb.quadN(-LX, BY, 0, 1, 0, LZ * 2, BH, 0, LZ * 2 / ledLen, 0, 1);
    M.led = lb.mesh(ledMat); G.add(M.led);

    // --- glass: one merged mesh per wall, panel table for fx
    const gv = glassMat(S.venue);
    const wallDefs = [];
    [-1, 1].forEach(function (sx) { wallDefs.push({ key: 'back' + sx, id: 'glassBack', ax: 0, s: sx }); });
    [-1, 1].forEach(function (sz) { wallDefs.push({ key: 'side' + sz, id: 'glassSide', ax: 2, s: sz }); });
    M.glass = {};
    wallDefs.forEach(function (wd) {
      const b = new Batch(), panels = [];
      const centres = wd.ax === 0 ? [-4, -2, 0, 2, 4] : [-9, -7, 7, 9], TH = 0.012;   // sides: two glass panels per back corner
      centres.forEach(function (cc) {
        if (wd.ax === 0) { b.box(wd.s * (HL + TH / 2), GH / 2, cc, TH, GH, 1.98); panels.push({ c: new T.Vector3(wd.s * HL, GH / 2, cc), n: new T.Vector3(-wd.s, 0, 0), a: cc }); }
        else { b.box(cc, GH / 2, wd.s * (HW + TH / 2), 1.98, GH, TH); panels.push({ c: new T.Vector3(cc, GH / 2, wd.s * HW), n: new T.Vector3(0, 0, -wd.s), a: cc }); }
        glassRecs.push(wd.ax === 0 ? { kind: 'glass', ax: 0, c: wd.s * HL, h0: cc - 0.99, h1: cc + 0.99, y0: 0, y1: GH } : { kind: 'glass', ax: 2, c: wd.s * HW, h0: cc - 0.99, h1: cc + 0.99, y0: 0, y1: GH });
      });
      const m = b.mesh(gv); m.renderOrder = 2; M.glass[wd.key] = m; G.add(m);
      panels.forEach(function (p, i) { C.glassPanels.push({ id: wd.id, wall: wd.key, index: i, mesh: m, centre: p.c, normal: p.n, w: 2, h: GH }); });
    });

    // --- mesh fence (diamond weave) incl. over-glass strips and door-height gaps
    const fb = new Batch(), CELLM = 0.32;
    function fencePiece(ax, s, h0, h1, y0, y1, kind) {
      if (h1 - h0 < 1e-6 || y1 - y0 < 1e-6) return;
      const w = h1 - h0, h = y1 - y0, off = 0.004;
      if (ax === 0) fb.quadN(s * (HL + off), (y0 + y1) / 2, (h0 + h1) / 2, -s, 0, w, h, h0 / CELLM, h1 / CELLM, y0 / CELLM, y1 / CELLM);
      else fb.quadN((h0 + h1) / 2, (y0 + y1) / 2, s * (HW + off), 0, -s, w, h, h0 / CELLM, h1 / CELLM, y0 / CELLM, y1 / CELLM);
      fenceRecs.push({ kind: kind || 'mesh', ax: ax, c: s * (ax === 0 ? HL : HW), h0: h0, h1: h1, y0: y0, y1: y1 });
    }
    [-1, 1].forEach(function (s) {
      fencePiece(0, s, -HW, HW, GH, TOP);                                  // back wall mesh above glass
      fencePiece(2, s, -HL, -CORNER, GH, TOP); fencePiece(2, s, CORNER, HL, GH, TOP);   // side: above the corner glass panel only
      // long fence between the corner panels is 3 m high, with the entrance at the net
      fencePiece(2, s, -GLASS_END, -HALF_DOOR, 0, GH); fencePiece(2, s, HALF_DOOR, GLASS_END, 0, GH);   // open entrance in between...
      fencePiece(2, s, -HALF_DOOR, HALF_DOOR, DOOR_H, GH);                                                   // ...with mesh above it so the 3 m height is seamless
    });
    const fenceTex = mkFenceTex();
    const fenceMat = R.mat(0x4a5662, { map: fenceTex, transparent: true, opacity: 1, side: T.DoubleSide });
    fenceMat.transparent = true; fenceMat.depthWrite = false; M.fenceMat = fenceMat;
    M.fence = fb.mesh(fenceMat); M.fence.renderOrder = 1; G.add(M.fence);

    // --- the entrance beside the net is an OPEN gap (no door, no mesh): only two jamb posts frame it and the net post stands in it

    // --- net
    const N = 40, nb = new Batch();
    const pos = [], nor = [], uv = [], idx = [], z0n = -POST_Z, z1n = POST_Z, NC = 0.2;
    for (let k = 0; k <= N; k++) {
      const z = z0n + (z1n - z0n) * k / N, yt = netH(Math.min(Math.abs(z), 5) * (z < 0 ? -1 : 1)) - 0.05;
      pos.push(0, 0.02, z, 0, yt, z); nor.push(1, 0, 0, 1, 0, 0); uv.push(z / NC, 0.02 / NC, z / NC, yt / NC);
      if (k < N) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    nb.raw(pos, nor, uv, idx);
    const netMat = R.mat(0x161d26, { map: mkNetTex(), transparent: true, opacity: 1, side: T.DoubleSide });
    netMat.transparent = true; netMat.depthWrite = false;
    C.netMesh = nb.mesh(netMat); C.netMesh.renderOrder = 1; G.add(C.netMesh);
    // tape band along the sagging top + centre strap
    const tb = new Batch(), TT = 0.022, TH = 0.075;
    const tp = [], tn = [], tu = [], ti = [];
    for (let k = 0; k <= N; k++) {
      const z = z0n + (z1n - z0n) * k / N, yt = netH(Math.min(Math.abs(z), 5) * (z < 0 ? -1 : 1)) + 0.001, yb = yt - TH;
      // 4 verts per station: front-top, front-bottom, back-top, back-bottom
      tp.push(TT, yt, z, TT, yb, z, -TT, yt, z, -TT, yb, z); tn.push(1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0); tu.push(0, 1, 0, 0, 0, 1, 0, 0);
      if (k < N) {
        const a = k * 4, b = a + 4;
        ti.push(a, b, a + 1, a + 1, b, b + 1);               // front face
        ti.push(a + 2, a + 3, b + 2, a + 3, b + 3, b + 2);   // back face
        ti.push(a, a + 2, b, b, a + 2, b + 2);               // top face
      }
    }
    tb.raw(tp, tn, tu, ti);
    tb.box(0, (netH(0) + 0.001) / 2 - 0.0, 0, 0.05, netH(0) + 0.001, 0.07);   // centre strap
    const tapeMat = R.mat(0xfffdf6, { side: T.DoubleSide });
    M.tape = tb.mesh(tapeMat); G.add(M.tape);
    // net posts (steel, 1.0 m, r 0.05) with cap and crank
    const nh = new Batch();
    [-1, 1].forEach(function (sz) {
      nh.cyl(0, 0.5, sz * POST_Z, 0.055, 1.0, 10); nh.box(0, 1.01, sz * POST_Z, 0.13, 0.03, 0.13);
      nh.box(0.075, 0.8, sz * POST_Z, 0.05, 0.14, 0.05); nh.box(0.11, 0.8, sz * POST_Z, 0.05, 0.03, 0.03);
    });
    M.netHW = nh.mesh(R.mat(0xb7c4cd)); M.netHW.castShadow = true; G.add(M.netHW);

    // --- signage decals (printed on the glass: inner face reads from inside, outer face from outside)
    const atlasIn = mkAtlas(false), atlasOut = mkAtlas(true);
    const dIn = new Batch(), dOut = new Batch();
    const backCells = { '-1': [0, 1, 7, 2, 3], '1': [4, 5, 7, 6, 0] };
    const sideCells = { '-1': { '-9': 3, '-7': 6, '7': 1, '9': 4 }, '1': { '-9': 0, '-7': 5, '7': 2, '9': 7 } };
    function cellQuad(batch, outer, cx, cz, nx, nz, cell) {
      const uv4 = atlasUV(cell * CELL.w, 0, CELL.w, CELL.h);
      batch.quadN(cx, 0.3, cz, nx, nz, 1.96, 0.6, uv4[0], uv4[1], uv4[2], uv4[3]);
    }
    const tUV = atlasUV(TITLE_R.x, TITLE_R.y, TITLE_R.w, TITLE_R.h), IN = 0.012, OUT = 0.022;
    [-1, 1].forEach(function (sx) {
      [-4, -2, 0, 2, 4].forEach(function (z, k) {
        cellQuad(dIn, false, sx * (HL - IN), z, -sx, 0, backCells[sx][k]);
        cellQuad(dOut, true, sx * (HL + OUT), z, sx, 0, backCells[sx][k]);
      });
      dIn.quadN(sx * (HL - IN), 1.9, 0, -sx, 0, 7.0, 1.5, tUV[0], tUV[1], tUV[2], tUV[3]);
      dOut.quadN(sx * (HL + OUT), 1.9, 0, sx, 0, 7.0, 1.5, tUV[0], tUV[1], tUV[2], tUV[3]);
    });
    [-1, 1].forEach(function (sz) {
      [-9, -7, 7, 9].forEach(function (x) {
        const cell = sideCells[sz][x];
        cellQuad(dIn, false, x, sz * (HW - IN), 0, -sz, cell);
        cellQuad(dOut, true, x, sz * (HW + OUT), 0, sz, cell);
      });
    });
    const mIn = R.mat(W, { map: atlasIn, transparent: true, opacity: 1 }), mOut = R.mat(W, { map: atlasOut, transparent: true, opacity: 1 });
    [mIn, mOut].forEach(function (m) { m.transparent = true; m.depthWrite = false; });
    M.decalIn = dIn.mesh(mIn); M.decalOut = dOut.mesh(mOut); M.decalIn.renderOrder = M.decalOut.renderOrder = 3;
    G.add(M.decalIn, M.decalOut);
  }

  // ---------------------------------------------------------------- interface
  function init(ctx) {
    R = HPO.mod.render; T = (ctx && ctx.THREE) || (R && R.THREE) || window.THREE;
    if (!T || !R || !R.groups || !R.groups.court) return;
    G = R.groups.court;
    const opts = (ctx && ctx.opts) || {};
    S.venue = VEN[opts.venue] ? opts.venue : 'classicBlue';
    build();
    inited = true;
    setVenue(S.venue);
    if (R.todParams) setTimeOfDay(R.todParams.tod || 'day', R.todParams);
    HPO.BUS.on('match:new', function (p) { const v = p && p.config && p.config.venue; if (v && VEN[v]) setVenue(v); });
    HPO.BUS.on('ball:out_retrieve', function (p) {
      if (!p || !p.p) return;
      let best = null, bd = 1e9;
      C.doors.forEach(function (d) { const dd = Math.hypot(d.x - p.p.x, d.z - (p.p.z || 0)); if (dd < bd) { bd = dd; best = d; } });
      if (best) { openDoor(best.i, true); best.closeAt = S.t + 4; }
    });
  }

  function setVenue(name) {
    const v = VEN[name]; if (!v) return;
    S.venue = C.venue = name;
    if (!inited) return;
    M.turf.material = turfMat(name); M.apron.material = apronMat(name);
    M.frame.material = frameMat(name);
    const gm = glassMat(name); gm.opacity = glassOp();
    Object.keys(M.glass).forEach(function (k) { M.glass[k].material = gm; });
    M.gloss.visible = v.gloss > 0 && !S.mobile; M.gloss.material.opacity = v.gloss;
    applyTodLed();
  }

  function applyTodLed() {
    if (!ledMat) return;
    const v = VEN[S.venue];
    ledMat.emissiveIntensity = v.led * (0.7 + 0.5 * S.lamps);
  }

  function setTimeOfDay(tod, p) {
    S.tod = tod; S.lamps = p && p.lamps !== undefined ? p.lamps : (tod === 'night' ? 1 : 0);
    if (inited) applyTodLed();
  }

  function setOptions(o) {
    if (!o) return;
    if (o.glassOpacity !== undefined) {
      S.glassOpacity = U.clamp(+o.glassOpacity, 0, 1);
      Object.keys(vMats.glass).forEach(function (k) { vMats.glass[k].opacity = glassOp(); });
    }
    if (o.showMarkings !== undefined) { S.showMarkings = !!o.showMarkings; if (M.lines) M.lines.visible = S.showMarkings; }
    if (o.mobile !== undefined) { S.mobile = !!o.mobile; if (M.gloss) M.gloss.visible = VEN[S.venue].gloss > 0 && !S.mobile; }
  }

  function openDoor(i, open) {
    const d = C.doors[i]; if (!d) return;
    d.target = open ? 1 : 0;
  }

  function update(dt, t) {
    if (!inited) return;
    S.t = t === undefined ? S.t + dt : t;
    if (ledTex) ledTex.offset.x = (S.t * 0.035) % 1;
    for (let i = 0; i < C.doors.length; i++) {
      const d = C.doors[i];
      if (d.closeAt && S.t > d.closeAt) { d.target = 0; d.closeAt = 0; }
      if (Math.abs(d.open - d.target) > 1e-3) {
        d.open += (d.target - d.open) * Math.min(1, dt * 4);
        d.group.rotation.y = -d.sign * d.open * 1.75;
      } else if (d.open !== d.target) { d.open = d.target; d.group.rotation.y = -d.sign * d.open * 1.75; }
    }
  }

  // Numeric check against the sim's collision surfaces (glass / mesh / door extents and planes).
  function check() {
    const issues = [], court = HPO.mod.court, tol = 0.03;
    if (!court) return { ok: false, issues: ['court module missing'] };
    const kindOf = { glassBack: 'glass', glassSide: 'glass', meshBack: 'mesh', meshSide: 'mesh', door: 'door' };
    const mine = glassRecs.concat(fenceRecs);
    function simNorm(q) { return q.ax === 0 ? { ax: 0, c: q.c, h0: q.b0, h1: q.b1, y0: q.a0, y1: q.a1 } : { ax: 2, c: q.c, h0: q.a0, h1: q.a1, y0: q.b0, y1: q.b1 }; }
    const sims = court.SURFACES.filter(q => q.type === 'rect' && kindOf[q.id]).map(q => Object.assign({ id: q.id, kind: kindOf[q.id] }, simNorm(q)));
    const inRec = (r, h, y) => h >= r.h0 - tol && h <= r.h1 + tol && y >= r.y0 - tol && y <= r.y1 + tol;
    let nCov = 0;
    sims.forEach(function (s) {          // every sim surface sample must be covered by a drawn piece of the right kind on the same plane
      for (let h = s.h0 + 0.125; h < s.h1; h += 0.25) for (let y = s.y0 + 0.125; y < s.y1; y += 0.25) {
        nCov++;
        const ok = mine.some(r => r.ax === s.ax && Math.abs(r.c - s.c) < tol && (r.kind === s.kind || (s.kind === 'mesh' && r.kind === 'door')) && inRec(r, h, y));
        if (!ok) { issues.push('uncovered ' + s.id + ' at plane ' + s.c + ' h=' + h.toFixed(2) + ' y=' + y.toFixed(2)); return; }
      }
    });
    mine.forEach(function (r) {          // every drawn piece must lie inside a sim surface of the same kind
      const ok = sims.some(s => s.ax === r.ax && Math.abs(r.c - s.c) < tol && s.kind === r.kind && r.h0 >= s.h0 - tol && r.h1 <= s.h1 + tol && r.y0 >= s.y0 - tol && r.y1 <= s.y1 + tol)
        || (r.kind === 'mesh' && sims.some(s => s.ax === r.ax && Math.abs(r.c - s.c) < tol && s.kind === 'mesh' && r.h0 >= s.h0 - tol && r.h1 <= s.h1 + tol && r.y0 >= s.y0 - tol && r.y1 <= s.y1 + tol));
      if (!ok) issues.push('drawn ' + r.kind + ' outside sim: ' + JSON.stringify(r));
    });
    // the entrance has no collider/geometry below DOOR_H; only the header mesh above it
    const dim = court.DIM;                // net posts
    if (dim && dim.postZ !== POST_Z) issues.push('postZ differs from sim');
    return { ok: issues.length === 0, issues: issues, samples: nCov, glassPieces: glassRecs.length, fencePieces: fenceRecs.length, doors: C.doors.length, panels: C.glassPanels.length };
  }

  function dispose() {
    if (!G) return;
    Object.keys(M).forEach(function (k) { const o = M[k]; if (o && o.parent) o.parent.remove(o); });
    C.doors.forEach(function (d) { if (d.group.parent) d.group.parent.remove(d.group); });
    if (C.netMesh && C.netMesh.parent) C.netMesh.parent.remove(C.netMesh);
    inited = false;
  }
})(HPO);
