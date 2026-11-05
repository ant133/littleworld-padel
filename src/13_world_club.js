// worldClub: stadium zone (stands + seatSlots, umpire chair, benches, scoreboard, LED video board, clubhouse,
// clock, flags, broadcast cameras, floodlight masts, sponsor boards, indoor hall roof). Cosmetic only.
// seatSlots: {x,y,z,facing,tier,block}; y = seat surface; facing = heading in sim convention (0 = +X, dir=(cos,0,sin)) towards court centre.
(function (HPO) {
  'use strict';
  const U = HPO.util;
  const PI = Math.PI;
  const W = HPO.mod.worldClub = {
    seatSlots: [], blocks: [], led: null, scoreboard: null, standGroups: {}, ready: false, venue: 'classicBlue',
    init: init, update: update, setTimeOfDay: setTimeOfDay, setVenue: setVenue, setOptions: setOptions, redrawLED: redrawLED, dispose: dispose
  };

  let T = null, R = null, G = null, rng = null;
  let P = { tod: 'day', night: 0, lamps: 0, indoor: false };
  const O = { showRoof: true, mobile: false };
  let TT = 0;
  const S = { // scene handles
    seatMeshes: [], ledMats: [], hoard: [], winMats: [], lampMats: [], glows: [], beams: null, beamMat: null, lights: [],
    flags: null, clock: null, cams: [], roof: null, masts: [], tally: [], sb: null, led: null, hall: null
  };

  const C = {
    cream: 0xfffaf0, ink: 0x123954, blue: 0x177dc5, sky: 0x6ec1ee, steel: 0xaab6c4, steelD: 0x66737f, steelL: 0xd2dae2,
    conc: 0xcfc9b8, concD: 0xa9a393, concL: 0xe6e1d2, teal: 0x20a898, amber: 0xf2a93b, coral: 0xe0583f, gold: 0xf2c14e,
    wall: 0xf4ead2, wallD: 0xe0cfa6, roof: 0xc65a3c, roofD: 0xa24429, green: 0x3e9a4a, greenD: 0x2c7437, greenL: 0x6cc060,
    wood: 0xb9824f, woodD: 0x8a5d36, skin: 0xe8b48a, skinD: 0xb87f58, glass: 0x7fb6d8, red: 0xd9382c, lime: 0xd8f24a, brick: 0xa9503a
  };

  // ---------------------------------------------------------------- geometry builder (merged, vertex-coloured)
  const PRIM = {};
  function polyPrim(faces, inner) {
    const p = [], n = [];
    faces.forEach(function (f) {
      let a = f[0], b = f[1], c = f[2];
      let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      let cx = 0, cy = 0, cz = 0; f.forEach(function (q) { cx += q[0]; cy += q[1]; cz += q[2]; });
      cx = cx / f.length - inner[0]; cy = cy / f.length - inner[1]; cz = cz / f.length - inner[2];
      if (nx * cx + ny * cy + nz * cz < 0) { f = f.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (let i = 1; i < f.length - 1; i++) [f[0], f[i], f[i + 1]].forEach(function (q) { p.push(q[0], q[1], q[2]); n.push(nx, ny, nz); });
    });
    return { p: p, n: n };
  }
  function primBox(bottom) {
    const k = 'box' + bottom; if (PRIM[k]) return PRIM[k];
    const a = -.5, b = .5, f = [
      [[a, 1, a], [a, 1, b], [b, 1, b], [b, 1, a]], [[a, 0, b], [b, 0, b], [b, 1, b], [a, 1, b]], [[b, 0, a], [a, 0, a], [a, 1, a], [b, 1, a]],
      [[b, 0, b], [b, 0, a], [b, 1, a], [b, 1, b]], [[a, 0, a], [a, 0, b], [a, 1, b], [a, 1, a]]];
    if (bottom) f.push([[a, 0, a], [b, 0, a], [b, 0, b], [a, 0, b]]);
    return PRIM[k] = polyPrim(f, [0, .5, 0]);
  }
  function primCyl(seg, off) {
    const k = 'cyl' + seg + off; if (PRIM[k]) return PRIM[k];
    const f = [], top = [];
    for (let i = 0; i < seg; i++) {
      const a0 = off + i / seg * 2 * PI, a1 = off + (i + 1) / seg * 2 * PI;
      const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
      f.push([[x0, 0, z0], [x1, 0, z1], [x1, 1, z1], [x0, 1, z0]]); top.push([x0, 1, z0]);
    }
    f.push(top);
    return PRIM[k] = polyPrim(f, [0, .5, 0]);
  }
  function primCone(seg, off) {
    const k = 'cone' + seg + off; if (PRIM[k]) return PRIM[k];
    const f = [];
    for (let i = 0; i < seg; i++) {
      const a0 = off + i / seg * 2 * PI, a1 = off + (i + 1) / seg * 2 * PI;
      f.push([[Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], [0, 1, 0]]);
    }
    return PRIM[k] = polyPrim(f, [0, .3, 0]);
  }
  function primGable() {
    if (PRIM.gable) return PRIM.gable;
    const a = -.5, b = .5;
    return PRIM.gable = polyPrim([
      [[a, 0, a], [a, 0, b], [0, 1, b], [0, 1, a]], [[b, 0, b], [b, 0, a], [0, 1, a], [0, 1, b]],
      [[a, 0, b], [b, 0, b], [0, 1, b]], [[b, 0, a], [a, 0, a], [0, 1, a]]], [0, .3, 0]);
  }

  function makeGeo() {
    const pos = [], nor = [], col = [];
    const m = new T.Matrix4(), nm = new T.Matrix3(), v = new T.Vector3(), q = new T.Quaternion(), e = new T.Euler(0, 0, 0, 'YXZ'),
      sc = new T.Vector3(), tp = new T.Vector3(), c = new T.Color();
    function put(prim, x, y, z, sx, sy, sz, qq, hex) {
      tp.set(x, y, z); sc.set(sx, sy, sz); m.compose(tp, qq, sc); nm.getNormalMatrix(m); c.setHex(hex);
      const Pp = prim.p, N = prim.n;
      for (let i = 0; i < Pp.length; i += 3) {
        v.set(Pp[i], Pp[i + 1], Pp[i + 2]).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    }
    function qe(o) { if (!o) { q.set(0, 0, 0, 1); return q; } e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); return q.setFromEuler(e); }
    const g = {
      box(x, y, z, w, h, d, hex, o) { put(primBox(o && o.bottom), x, y, z, w, h, d, qe(o), hex); return g; },
      cyl(x, y, z, r, h, hex, o, seg) { put(primCyl(seg || 8, 0.3927), x, y, z, r, h, r, qe(o), hex); return g; },
      cone(x, y, z, r, h, hex, o, seg) { put(primCone(seg || 8, 0.3927), x, y, z, r, h, r, qe(o), hex); return g; },
      gable(x, y, z, w, h, d, hex, o) { put(primGable(), x, y, z, w, h, d, qe(o), hex); return g; },
      pyr(x, y, z, w, h, d, hex, o) { put(primCone(4, PI / 4), x, y, z, w / 1.4142, h, d / 1.4142, qe(o), hex); return g; },
      beam(x0, y0, z0, x1, y1, z1, t, hex) {
        const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz) || 1e-3;
        const qq = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx / len, dy / len, dz / len));
        put(primBox(false), x0, y0, z0, t, len, t, qq, hex); return g;
      },
      person(x, y, z, shirt, pants, hair, ry, seated) {
        const o = { ry: ry || 0 };
        const s = seated ? 0.5 : 0;
        g.box(x, y, z, .3, seated ? .22 : .5, .22, pants, o);
        g.box(x, y + (seated ? .22 : .5) - s * 0, z, .34, .5, .22, shirt, o);
        g.box(x, y + (seated ? .72 : 1.0), z, .22, .22, .22, C.skin, o);
        g.box(x, y + (seated ? .92 : 1.2), z, .24, .08, .24, hair, o);
        return g;
      },
      count() { return pos.length / 3; },
      mesh(mat, name) {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        geo.computeBoundingSphere();
        const mesh = new T.Mesh(geo, mat); mesh.name = name || 'club'; return mesh;
      }
    };
    return g;
  }

  // ---------------------------------------------------------------- materials
  let vcTag = 0;
  function vcMat(extra, emissiveHex) {
    const o = Object.assign({ cutaway: true, emissive: 0x000001 + (vcTag++) }, extra || {});
    const m = R.mat(0xffffff, o);
    m.vertexColors = true;
    if (m.emissive) m.emissive.setHex(emissiveHex || 0);
    m.needsUpdate = true; return m;
  }
  function screenMat(tex, cut) {
    const m = R.mat(0x000000, { map: tex, cutaway: !!cut });
    if (m.emissive) { m.emissive.setHex(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0.9; }
    m.needsUpdate = true; return m;
  }
  function cut(obj, role, o) { try { if (R.cutaway && R.cutaway.add) R.cutaway.add(obj, Object.assign({ role: role }, o || {})); } catch (e) { U.logError('worldClub.cutaway', e); } }
  function txt(g, s, x, y, size, color, align, base) {
    g.font = 'bold ' + size + 'px "Courier New", monospace'; g.fillStyle = color; g.textAlign = align || 'left'; g.textBaseline = base || 'middle'; g.fillText(s, x, y);
  }
  function hexS(h) { return '#' + ('000000' + h.toString(16)).slice(-6); }

  // ---------------------------------------------------------------- sponsor textures
  const SPONSORS = [
    { name: 'LINTAS COURT RAIL', bg: 0x1fa39b, fg: 0xffffff, icon: 'rail' },
    { name: 'TAPAK SMASH', bg: 0xf28a1c, fg: 0x2a1a0a, icon: 'foot' },
    { name: 'BANK MANDAU RAYA', bg: 0x1b3a8c, fg: 0xffd25a, icon: 'coin' },
    { name: 'BANK LAPANG AMANAH', bg: 0x2e8b4f, fg: 0xffffff, icon: 'shield' },
    { name: 'AQUVIVO', bg: 0x2bb7e6, fg: 0xffffff, icon: 'drop' },
    { name: 'GO-JEG', bg: 0xd7372f, fg: 0xffffff, icon: 'wheel' },
    { name: 'POKARI SWEET', bg: 0xeef4ff, fg: 0x1a5fb4, icon: 'bottle' },
    { name: 'annetta.dev', bg: 0xfffaf0, fg: 0x123954, icon: 'a' }
  ];
  function sponsorIcon(g, ic, x, y, h, fg) {
    g.fillStyle = hexS(fg);
    const s = h / 32;
    if (ic === 'rail') { g.fillRect(x, y + 10 * s, 18 * s, 3 * s); g.fillRect(x, y + 18 * s, 18 * s, 3 * s); for (let i = 0; i < 4; i++) g.fillRect(x + 2 * s + i * 5 * s, y + 8 * s, 2 * s, 15 * s); }
    else if (ic === 'foot') { g.fillRect(x + 4 * s, y + 12 * s, 9 * s, 12 * s); [0, 3, 6, 9].forEach(function (k) { g.fillRect(x + (3 + k) * s, y + 7 * s, 2 * s, 3 * s); }); }
    else if (ic === 'coin') { g.beginPath(); g.arc(x + 9 * s, y + 16 * s, 8 * s, 0, 7); g.fill(); g.fillStyle = hexS(0x1b3a8c); g.fillRect(x + 8 * s, y + 10 * s, 2 * s, 12 * s); }
    else if (ic === 'shield') { g.fillRect(x + 2 * s, y + 8 * s, 14 * s, 10 * s); g.fillRect(x + 4 * s, y + 18 * s, 10 * s, 4 * s); g.fillRect(x + 7 * s, y + 22 * s, 4 * s, 3 * s); }
    else if (ic === 'drop') { g.beginPath(); g.arc(x + 9 * s, y + 19 * s, 6 * s, 0, 7); g.fill(); g.beginPath(); g.moveTo(x + 9 * s, y + 6 * s); g.lineTo(x + 15 * s, y + 18 * s); g.lineTo(x + 3 * s, y + 18 * s); g.fill(); }
    else if (ic === 'wheel') { g.beginPath(); g.arc(x + 9 * s, y + 20 * s, 6 * s, 0, 7); g.fill(); g.fillStyle = hexS(0xd7372f); g.beginPath(); g.arc(x + 9 * s, y + 20 * s, 2.5 * s, 0, 7); g.fill(); g.fillStyle = hexS(fg); g.fillRect(x + 8 * s, y + 8 * s, 8 * s, 3 * s); }
    else if (ic === 'bottle') { g.fillRect(x + 6 * s, y + 6 * s, 6 * s, 4 * s); g.fillRect(x + 3 * s, y + 10 * s, 12 * s, 14 * s); }
    else if (ic === 'a') { g.font = 'bold ' + 20 * s + 'px "Courier New", monospace'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('A✦', x, y + 17 * s); }
  }
  function drawSponsorStrip(g, w, h) {
    const pw = w / SPONSORS.length;
    SPONSORS.forEach(function (sp, i) {
      const x = i * pw;
      g.fillStyle = hexS(sp.bg); g.fillRect(x, 0, pw, h);
      sponsorIcon(g, sp.icon, x + 5, 0, h, sp.fg);
      g.fillStyle = hexS(sp.fg);
      let size = Math.round(h * 0.42);
      g.font = 'bold ' + size + 'px "Courier New", monospace';
      while (g.measureText(sp.name).width > pw - 34 && size > 6) { size--; g.font = 'bold ' + size + 'px "Courier New", monospace'; }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sp.name, x + 18 + (pw - 18) / 2, h / 2 + 1);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + pw - 2, 0, 2, h);
    });
    g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 1; y < h; y += 2) g.fillRect(0, y, w, 1);
  }
  function titleLines() {
    const t = HPO.cfg.TITLE().toUpperCase().split(' ');
    return t.length === 5 ? [t[0], t[1], t[2] + ' ' + t[3], t[4]] : [t.join(' ')];
  }
  function drawBanners(g, w, h) {
    const cw = w / 3;
    g.fillStyle = hexS(C.blue); g.fillRect(0, 0, cw, h);
    g.fillStyle = hexS(C.cream); const L = titleLines();
    L.forEach(function (s, i) { txt(g, s, cw / 2, 26 + i * 30, s.length > 9 ? 15 : 20, hexS(C.cream), 'center'); });
    g.fillStyle = hexS(C.cream); g.fillRect(8, h - 34, cw - 16, 3);
    txt(g, '✦', cw / 2, h - 16, 22, hexS(C.amber), 'center');
    g.fillStyle = hexS(C.cream); g.fillRect(cw, 0, cw, h);
    txt(g, 'A✦', cw * 1.5, 62, 40, hexS(C.ink), 'center');
    txt(g, 'annetta.dev', cw * 1.5, 100, 15, hexS(C.blue), 'center');
    g.fillStyle = hexS(C.blue); g.fillRect(cw + 8, h - 28, cw - 16, 6);
    g.fillStyle = hexS(C.ink); g.fillRect(cw * 2, 0, cw, h);
    txt(g, 'FINAL', cw * 2.5, 30, 26, hexS(C.gold), 'center');
    g.fillStyle = hexS(C.gold); g.fillRect(cw * 2.5 - 14, 56, 28, 24); g.fillRect(cw * 2.5 - 4, 80, 8, 14); g.fillRect(cw * 2.5 - 14, 94, 28, 6);
    g.fillRect(cw * 2.5 - 22, 58, 8, 12); g.fillRect(cw * 2.5 + 14, 58, 8, 12);
    txt(g, 'CUP', cw * 2.5, h - 12, 16, hexS(C.cream), 'center');
  }

  // ---------------------------------------------------------------- stands
  const ROWS = 9, SEAT_PITCH = 0.5;
  const SIDES = [
    { id: '+z', ry: 0, L: 12.3, d0: 7.9, hd: 7.44, far: false, blocks: [[-12.3, -9.5, C.teal], [-8.5, -3.5, C.blue], [-2.5, 2.5, C.amber], [3.5, 8.5, C.blue], [9.5, 12.3, C.teal]] },
    { id: '-z', ry: PI, L: 12.3, d0: 7.9, hd: 7.44, far: true, vip: 2, blocks: [[-12.3, -9.5, C.teal], [-8.5, -3.5, C.blue], [-2.5, 2.5, C.amber], [3.5, 8.5, C.blue], [9.5, 12.3, C.teal]] },
    { id: '+x', ry: PI / 2, L: 7.3, d0: 12.9, hd: 12.44, far: false, blocks: [[-7.3, -0.5, C.coral], [0.5, 7.3, C.teal]] },
    { id: '-x', ry: -PI / 2, L: 7.3, d0: 12.9, hd: 12.44, far: true, blocks: [[-7.3, -0.5, C.teal], [0.5, 7.3, C.coral]] }
  ];
  function toWorld(sd, u, d) { const c = Math.cos(sd.ry), s = Math.sin(sd.ry); return { x: u * c + d * s, z: -u * s + d * c }; }
  const stepTop = function (r) { return 0.35 + 0.5 * r; };

  function buildStands() {
    const seatGeo = makeGeo();
    seatGeo.box(0, 0, 0, .09, .3, .09, 0xffffff).box(0, .28, 0, .4, .07, .38, 0xffffff).box(0, .35, .17, .4, .34, .06, 0xffffff);
    const seatBuf = seatGeo.mesh(undefined).geometry;
    const seatMat = vcMat(); // vertexColors white * instanceColor
    seatMat.vertexColors = true;
    const hoardTex = R.canvasTex(1024, 32, function (g, w, h) { drawSponsorStrip(g, w, h); });
    hoardTex.wrapS = T.RepeatWrapping; hoardTex.wrapT = T.ClampToEdgeWrapping; hoardTex.needsUpdate = true;
    const ban = R.canvasTex(384, 144, drawBanners);
    let blockId = 0, slotIdx = 0;
    const slotsAll = [];
    const rr = HPO.makeRng(4242);

    SIDES.forEach(function (sd, si) {
      const grp = new T.Group(); grp.name = 'stand' + sd.id; grp.rotation.y = sd.ry;
      grp.userData.side = sd.id; grp.userData.normal = { x: Math.sin(sd.ry), z: Math.cos(sd.ry) };
      const gs = makeGeo(), L = sd.L, d0 = sd.d0, dEnd = d0 + ROWS * 0.8;
      for (let r = 0; r < ROWS; r++) {
        const y = stepTop(r), dc = d0 + r * 0.8 + 0.4;
        gs.box(0, 0, dc, 2 * L + 0.6, y, 0.8, r % 2 ? C.conc : C.concL);
        gs.box(0, y - 0.03, d0 + r * 0.8 + 0.01, 2 * L + 0.6, 0.03, 0.02, C.concD);
      }
      // back wall + side cheeks + hoarding body + safety rail
      gs.box(0, 0, dEnd + 0.15, 2 * L + 0.6, stepTop(ROWS - 1) + 1.2, 0.3, C.ink);
      gs.box(0, stepTop(ROWS - 1) + 1.2, dEnd + 0.15, 2 * L + 0.8, 0.12, 0.42, C.blue);
      gs.box(0, 0, sd.hd + 0.14, 2 * L + 0.6, 0.95, 0.28, C.ink);
      gs.box(0, 0.95, sd.hd + 0.14, 2 * L + 0.6, 0.07, 0.34, C.cream);
      for (let u = -L; u <= L + 0.01; u += 3) gs.box(u, 0.95, sd.hd + 0.3, .06, .5, .06, C.steelD);
      gs.box(0, 1.42, sd.hd + 0.3, 2 * L, .05, .05, C.steel);
      // aisles
      for (let b = 0; b < sd.blocks.length - 1; b++) {
        const ua = (sd.blocks[b][1] + sd.blocks[b + 1][0]) / 2;
        for (let r = 0; r < ROWS; r++) {
          const y = stepTop(r);
          gs.box(ua, y, d0 + r * 0.8 + 0.4, 0.96, 0.03, 0.8, C.cream);
          gs.box(ua, y, d0 + r * 0.8 + 0.05, 0.96, 0.05, 0.1, C.amber);
        }
        [-0.5, 0.5].forEach(function (k) {
          for (let r = 0; r < ROWS; r += 2) gs.box(ua + k, stepTop(r), d0 + r * 0.8 + 0.4, .06, .9, .06, C.steelD);
          gs.beam(ua + k, stepTop(0) + 0.9, d0 + 0.4, ua + k, stepTop(ROWS - 1) + 0.9, d0 + (ROWS - 1) * 0.8 + 0.4, .05, C.steel);
        });
      }
      // seats + slots
      const seats = []; // {u,r,col, gi}
      sd.blocks.forEach(function (bk, bi) {
        const id = blockId++, n = Math.floor((bk[1] - bk[0]) / SEAT_PITCH), start = bk[0] + ((bk[1] - bk[0]) - n * SEAT_PITCH) / 2 + SEAT_PITCH / 2;
        W.blocks.push({ id: id, side: sd.id, color: bk[2], index: bi, vip: sd.vip === bi });
        for (let r = 0; r < ROWS; r++) {
          const vip = sd.vip === bi && r >= 6;
          for (let i = 0; i < n; i++) {
            const u = start + i * SEAT_PITCH, dS = d0 + r * 0.8 + 0.4;
            let col = bk[2];
            if (vip) col = C.gold; else if ((i + r * 2) % 9 === 0) col = C.cream; else if (r === 0) col = C.ink;
            const wp = toWorld(sd, u, dS);
            const slot = { x: wp.x, y: stepTop(r) + 0.35, z: wp.z, facing: Math.atan2(-wp.z, -wp.x), tier: r, block: id, side: sd.id };
            seats.push({ u: u, r: r, d: dS, col: col, gi: slotsAll.length });
            slotsAll.push(slot);
            if (vip) gs.box(u, stepTop(r) + 0.35, dS, .34, .09, .3, 0xc43d4b);
          }
        }
      });
      // VIP box dressing (far long side)
      if (sd.vip !== undefined) {
        const bk = sd.blocks[sd.vip], dv = d0 + 6 * 0.8;
        gs.box(bk[0] - 0.1, stepTop(5), dv + 1.2, .1, 1.7, 2.4, C.ink); gs.box(bk[1] + 0.1, stepTop(5), dv + 1.2, .1, 1.7, 2.4, C.ink);
        gs.box(0, stepTop(8) + 0.9, dEnd + 0.01, 5.2, .5, .06, C.gold);
        gs.box(-1.7, stepTop(8), dEnd - 0.5, .5, .5, .5, C.woodD).box(-1.7, stepTop(8) + .5, dEnd - 0.5, .56, .06, .56, C.cream);
        gs.box(1.7, stepTop(8), dEnd - 0.5, .3, .6, .3, C.greenD).cone(1.7, stepTop(8) + .6, dEnd - 0.5, .35, .7, C.green);
        const gl = new T.Mesh(new T.BoxGeometry(5.0, 1.0, 0.05), R.mat(0x9fd8ff, { transparent: true, opacity: 0.3, glass: true }));
        gl.position.set(0, stepTop(5) + 0.9, dv - 0.02); grp.add(gl);
        const vs = R.canvasTex(64, 16, function (g, w, h) { g.fillStyle = hexS(C.gold); g.fillRect(0, 0, w, h); txt(g, 'VIP BOX', w / 2, h / 2 + 1, 12, hexS(C.ink), 'center'); });
        const vp = new T.Mesh(new T.PlaneGeometry(2.4, 0.6), screenMat(vs)); vp.position.set(0, stepTop(5) + 1.65, dv - 0.05); vp.rotation.y = PI; grp.add(vp);
      }
      const structMat = vcMat();
      grp.add(gs.mesh(structMat, 'stand_struct' + sd.id));
      // seat instances (even global index first so mobile can halve)
      const order = seats.filter(function (s) { return s.gi % 2 === 0; }).concat(seats.filter(function (s) { return s.gi % 2 === 1; }));
      const im = new T.InstancedMesh(seatBuf, seatMat, order.length);
      const mtx = new T.Matrix4(), cc = new T.Color();
      order.forEach(function (s, i) { mtx.makeTranslation(s.u, stepTop(s.r), s.d); im.setMatrixAt(i, mtx); im.setColorAt(i, cc.setHex(s.col)); });
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false; im.userData.even = seats.filter(function (s) { return s.gi % 2 === 0; }).length; im.userData.all = order.length;
      grp.add(im); S.seatMeshes.push(im);
      // LED hoarding
      const ht = hoardTex.clone(); ht.needsUpdate = true; ht.wrapS = T.RepeatWrapping; ht.repeat.x = (2 * L) / 6.4 / 8; ht.offset.x = si * 0.17;
      const hm = screenMat(ht, true); hm.emissiveIntensity = 0.75;
      const hp = new T.Mesh(new T.PlaneGeometry(2 * L + 0.4, 0.78), hm); hp.position.set(0, 0.52, sd.hd - 0.001); hp.rotation.y = PI; grp.add(hp);
      S.hoard.push({ tex: ht, speed: 0.012 + si * 0.003, mat: hm });
      S.ledMats.push(hm);
      // far side canopy + banners
      if (sd.id === '-z') buildCanopy(grp, sd, ban);
      W.standGroups[sd.id] = grp; G.add(grp);
      cut(grp, 'stand', { side: sd.id, fadeTo: 0.0 });
    });
    W.seatSlots = slotsAll;
    // contiguous blocks already by construction; renumber check
    applyMobile();
  }
  function buildCanopy(grp, sd, ban) {
    const gc = makeGeo(), L = sd.L;
    const ang = 0.14;
    gc.box(0, 8.35, 12.4, 2 * L + 1.6, 0.25, 8.6, C.cream, { rx: ang });
    gc.box(0, 8.55, 8.15, 2 * L + 1.6, 0.35, 0.3, C.blue, { rx: ang });
    gc.box(0, 7.55, 16.4, 2 * L + 1.6, 0.35, 0.3, C.blue, { rx: ang });
    for (let u = -12; u <= 12.01; u += 6) {
      gc.cyl(u, 0, 15.9, 0.18, 8.0, C.steelL);
      gc.beam(u, 7.9, 15.9, u, 8.3, 8.6, 0.16, C.steelD);
    }
    for (let u = -12; u <= 12.01; u += 2) gc.box(u, 8.55, 12.4, 0.08, 0.06, 8.4, C.steelL, { rx: ang });
    gc.box(0, 5.6, 16.45, 2 * L + 1.2, 2.2, 0.15, C.ink);
    grp.add(gc.mesh(vcMat(), 'canopy'));
    // banners hung from the front edge (front + back faces)
    const bw = 2.5, bh = 3.0, pos = [], uv = [], idx = [];
    [-7.5, 0, 7.5].forEach(function (u, i) {
      const x0 = u - bw / 2, x1 = u + bw / 2, y1 = 8.5, y0 = y1 - bh, d = 8.1, u0 = i / 3, u1 = (i + 1) / 3;
      const b = pos.length / 3;
      // front (towards court, local -z)
      pos.push(x0, y0, d - 0.02, x1, y0, d - 0.02, x1, y1, d - 0.02, x0, y1, d - 0.02); uv.push(u1, 0, u0, 0, u0, 1, u1, 1); idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      pos.push(x0, y0, d + 0.02, x1, y0, d + 0.02, x1, y1, d + 0.02, x0, y1, d + 0.02); uv.push(u0, 0, u1, 0, u1, 1, u0, 1); idx.push(b + 4, b + 6, b + 5, b + 4, b + 7, b + 6);
    });
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
    const bgn = new Float32Array(pos.length); for (let i = 0; i < pos.length; i += 3) bgn[i + 2] = 1; bg.setAttribute('normal', new T.BufferAttribute(bgn, 3));
    const bm = R.mat(0xffffff, { map: ban, side: T.DoubleSide, cutaway: true });
    grp.add(new T.Mesh(bg, bm));
  }
  function applyMobile() {
    S.seatMeshes.forEach(function (im) { im.count = O.mobile ? im.userData.even : im.userData.all; });
  }

  // ---------------------------------------------------------------- props: umpire chair, benches, stools, sensor
  let PG = null;
  function buildProps() {
    const g = PG = makeGeo();
    // umpire chair (0,-6.2) facing +z; legs straddle a 2.2 m walkway (court entrance beside the net)
    const cz = -6.2;
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) { g.beam(sx * 1.3, 0, cz + sz * 0.75, sx * 1.1, 2.35, cz + sz * 0.6, 0.1, C.steelL); });
      g.beam(sx * 1.2, 0.9, cz - 0.68, sx * 1.2, 0.9, cz + 0.68, 0.06, C.steel);
      g.beam(sx * 1.15, 1.9, cz - 0.64, sx * 1.15, 1.9, cz + 0.64, 0.06, C.steel);
    });
    g.beam(-1.12, 2.2, cz - 0.62, 1.12, 2.2, cz - 0.62, 0.07, C.steelD);
    g.box(0, 2.35, cz, 2.5, 0.12, 1.45, C.ink);
    g.box(0, 2.47, cz - 0.05, 1.0, 0.13, 0.85, 0x2e9e5b);
    g.box(0, 2.6, cz - 0.55, 1.0, 0.75, 0.12, C.blue);
    g.box(-0.62, 2.47, cz - 0.05, 0.1, 0.35, 0.8, C.steelD).box(0.62, 2.47, cz - 0.05, 0.1, 0.35, 0.8, C.steelD);
    g.box(0, 2.95, cz + 0.62, 2.0, 0.05, 0.4, C.woodD);
    g.box(-0.9, 2.47, cz + 0.62, 0.06, 0.48, 0.06, C.steelD).box(0.9, 2.47, cz + 0.62, 0.06, 0.48, 0.06, C.steelD);
    g.box(-0.5, 3.0, cz + 0.6, 0.4, 0.03, 0.28, C.cream).box(0.1, 3.0, cz + 0.6, 0.3, 0.05, 0.2, C.ink);
    g.cyl(0.65, 3.0, cz + 0.62, 0.025, 0.28, C.steelD).box(0.65, 3.27, cz + 0.62, 0.07, 0.07, 0.07, 0x222222);
    for (let i = 0; i < 6; i++) g.box(1.55 + 0.05 * (5 - i) * 0.1, 0.4 * i + 0.2, cz - 0.05, 0.4 - 0.0, 0.05, 0.08, C.steel, { rz: 0 });
    g.beam(1.3, 0, cz - 0.35, 1.15, 2.35, cz - 0.35, 0.06, C.steelD).beam(1.3, 0, cz + 0.25, 1.15, 2.35, cz + 0.25, 0.06, C.steelD);
    // team benches
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        const bx = sx * 5, bz = sz * 6.4, back = bz + sz * 0.3, main = sx < 0 ? C.blue : C.amber, acc = sx < 0 ? C.cream : C.ink;
        g.box(bx, 0.4, bz, 2.4, 0.07, 0.5, C.wood);
        g.box(bx, 0.47, back, 2.4, 0.55, 0.06, main);
        [-1, 1].forEach(function (k) { g.box(bx + k * 1.1, 0, bz, 0.07, 0.4, 0.45, C.steelD); });
        g.box(bx - 0.5, 0.47, bz, 0.5, 0.04, 0.4, acc).box(bx - 0.5, 0.47, bz, 0.5, 0.045, 0.1, main, {});
        g.box(bx + 0.4, 0.47, bz - sz * 0.02, 0.45, 0.04, 0.35, C.cream);
        g.box(bx - 1.9, 0, bz + sz * 0.1, 0.7, 0.34, 0.3, main).box(bx - 1.9, 0.34, bz + sz * 0.1, 0.5, 0.04, 0.12, C.steelD);
        g.box(bx + 1.8, 0, bz, 0.6, 0.4, 0.4, C.blue).box(bx + 1.8, 0.4, bz, 0.62, 0.05, 0.42, C.cream);
        [0xff8a3d, C.sky, C.lime].forEach(function (cc, i) { g.cyl(bx + 1.6 + i * 0.14, 0.45, bz, 0.04, 0.22, cc); });
        const rx = bx + 2.7 * sx * -1 * -1 + (sx > 0 ? 0.2 : -4.2);
        const sx0 = sx * 5 + sx * 2.6;
        g.box(sx0 - 0.3, 0, bz, 0.05, 0.9, 0.05, C.steelD).box(sx0 + 0.3, 0, bz, 0.05, 0.9, 0.05, C.steelD).box(sx0, 0.7, bz, 0.7, 0.05, 0.05, C.steelD);
        [-0.2, 0, 0.2].forEach(function (k, i) { g.box(sx0 + k, 0.72, bz, 0.09, 0.34, 0.025, [C.red, C.blue, C.amber][i], { rz: k * 0.6 }); });
      });
    });
    // ball-kid stools + ball baskets
    [[-8.3, 6.5], [8.3, 6.5], [-8.3, -6.5], [8.3, -6.5]].forEach(function (q, i) {
      g.cyl(q[0], 0, q[1], 0.22, 0.45, i % 2 ? C.amber : C.blue);
      g.box(q[0] + 0.55, 0, q[1], 0.3, 0.25, 0.3, C.wood);
      for (let k = 0; k < 3; k++) g.box(q[0] + 0.45 + k * 0.1, 0.25, q[1], 0.07, 0.07, 0.07, C.lime);
    });
    // net post sensor boxes
    [-1, 1].forEach(function (s) { g.box(0, 0.8, s * 4.93, 0.18, 0.3, 0.14, C.ink).box(0.05, 1.0, s * 4.93, 0.05, 0.05, 0.16, C.red); });
    return g;
  }

  // ---------------------------------------------------------------- score model + canvases
  const E = { pointT: -99, pointMsg: '', pointWin: null, gameT: -99, gameWin: null, setT: -99, setWin: null, setScore: '', phase: 'idle', rally: 0, forced: null, forceUntil: 0, conf: [], ledAcc: 0, sbAcc: 0 };
  function surname(n) { return String(n || '').split(' ').pop().toUpperCase(); }
  function teamNames(t) { const l = (HPO.mod.players && HPO.mod.players.list) || []; return l.filter(function (p) { return p.team === t; }).map(function (p) { return surname(p.name); }); }
  function snap() {
    const rules = HPO.mod.rules, st = rules && rules.state;
    const out = { nm: { A: teamNames('A'), B: teamNames('B') }, empty: true, A: { pt: '0', g: 0 }, B: { pt: '0', g: 0 }, sets: [], server: null, tb: false, banner: '', over: false, winner: null, golden: false, setsText: '' };
    if (!st || !st.points || !rules.describe) return out;
    try {
      const names = {}; ((HPO.mod.players && HPO.mod.players.list) || []).forEach(function (p) { names[p.id] = p.name; });
      const d = rules.describe(st, names);
      out.empty = false; out.A = { pt: d.pointsText.A, g: st.games.A }; out.B = { pt: d.pointsText.B, g: st.games.B };
      out.sets = st.sets || []; out.server = st.server && st.server.team; out.tb = !!d.tiebreak; out.banner = d.banner; out.over = !!st.over; out.winner = st.winner;
      out.golden = !!st.goldenPoint; out.setsText = d.setsText; out.serverName = surname(d.serverName);
    } catch (e) { U.logError('worldClub.snap', e); }
    return out;
  }
  function label(sn, t, per) { const a = sn.nm[t]; return a.length ? a.map(function (s) { return s.slice(0, per); }).join('/') : 'TEAM ' + t; }
  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function trophy(g, x, y, s) {
    g.fillStyle = '#f2c14e'; g.fillRect(x + 3 * s, y, 10 * s, 8 * s); g.fillRect(x, y + s, 3 * s, 5 * s); g.fillRect(x + 13 * s, y + s, 3 * s, 5 * s);
    g.fillRect(x + 6 * s, y + 8 * s, 4 * s, 6 * s); g.fillRect(x + 3 * s, y + 14 * s, 10 * s, 3 * s);
    g.fillStyle = '#fff4b3'; g.fillRect(x + 5 * s, y + s, 2 * s, 5 * s);
  }
  function spawnConf(n) {
    const cols = ['#f2a93b', '#e0583f', '#20a898', '#fffaf0', '#6ec1ee', '#d8f24a'];
    for (let i = 0; i < n && E.conf.length < 160; i++) E.conf.push({ x: rng.range(0, 256), y: rng.range(-30, 10), vx: rng.range(-10, 10), vy: rng.range(25, 60), c: cols[i % cols.length] });
  }
  function ledMode(sn) {
    if (E.forced && TT < E.forceUntil) return E.forced;
    if (sn.over) return 'win';
    if (TT - E.setT < 3.6) return 'set';
    if (TT - E.gameT < 2.4) return 'game';
    if (E.phase === 'intro' || E.phase === 'walkon' || E.phase === 'introductions' || E.phase === 'toss') return 'intro';
    return 'score';
  }
  function ledFooter(g, sn) {
    rect(g, 0, 94, 256, 34, '#07131f');
    let msg = '', col = '#fffaf0', size = 20;
    const pulse = Math.floor(TT * 3) % 2;
    if (TT - E.pointT < 2 && E.pointMsg) { msg = E.pointMsg; col = '#d8f24a'; }
    else if (sn.banner === 'MATCH POINT') { msg = 'MATCH POINT'; col = pulse ? '#e0583f' : '#fffaf0'; }
    else if (sn.banner === 'SET POINT') { msg = 'SET POINT'; col = pulse ? '#f2a93b' : '#fffaf0'; }
    else if (sn.banner === 'GOLDEN POINT') { msg = 'GOLDEN POINT!'; col = pulse ? '#f2c14e' : '#fff4b3'; rect(g, 0, 94, 256, 3, pulse ? '#f2c14e' : '#7a5d10'); rect(g, 0, 125, 256, 3, pulse ? '#f2c14e' : '#7a5d10'); }
    else if (sn.banner === 'BREAK POINT') { msg = 'BREAK POINT'; col = '#6ec1ee'; }
    else if (E.rally >= 3) { msg = 'RALLY ' + E.rally; col = '#6ec1ee'; }
    else if (!sn.empty) { msg = 'SERVE ' + (sn.serverName || '') + (sn.tb ? ' - TIE-BREAK' : ''); size = 13; col = '#9fc5e4'; }
    else { msg = 'LITTLEWORLD PADEL'; size = 14; col = '#9fc5e4'; }
    if (msg.length * size * 0.6 > 246) size = Math.floor(246 / (msg.length * 0.6));
    txt(g, msg, 128, 111, size, col, 'center');
  }
  function drawLED() {
    const L = S.led, g = L.ctx; if (!g) return;
    const sn = snap(), mode = ledMode(sn); L.mode = mode;
    rect(g, 0, 0, 256, 128, '#0a1b2c');
    rect(g, 0, 0, 256, 18, '#0d2a44');
    txt(g, 'A✦', 5, 9, 13, '#f2a93b');
    const title = HPO.cfg.TITLE().toUpperCase(); let ts = 9; g.font = 'bold ' + ts + 'px "Courier New", monospace';
    while (g.measureText(title).width > 190 && ts > 5) { ts--; g.font = 'bold ' + ts + 'px "Courier New", monospace'; }
    txt(g, title, 130, 9, ts, '#fffaf0', 'center');
    if (!sn.empty && Math.floor(TT * 1.5) % 2 === 0) { g.fillStyle = '#e0583f'; g.beginPath(); g.arc(247, 9, 3, 0, 7); g.fill(); }
    if (mode === 'score') {
      ['A', 'B'].forEach(function (tm, k) {
        const y = 20 + k * 36, hot = TT - E.pointT < 1.2 && E.pointWin === tm;
        rect(g, 0, y, 256, 34, hot ? (Math.floor(TT * 8) % 2 ? '#2d7d46' : '#1f5f36') : (k ? '#0c2237' : '#10304d'));
        if (sn.server === tm) { g.fillStyle = '#d8f24a'; g.beginPath(); g.arc(8, y + 17, 4, 0, 7); g.fill(); }
        txt(g, label(sn, tm, 7), 17, y + 17, 11, '#fffaf0');
        for (let i = 0; i < 3; i++) {
          const st = sn.sets[i], x = 124 + i * 20; rect(g, x, y + 4, 18, 26, '#0a1b2c');
          if (st) { const v = st[tm], o = st[tm === 'A' ? 'B' : 'A']; txt(g, String(v), x + 9, y + 17, 16, v > o ? '#fffaf0' : '#6f8aa5', 'center'); }
        }
        rect(g, 186, y + 4, 26, 26, '#f2a93b'); txt(g, String(sn[tm].g), 199, y + 17, 20, '#123954', 'center');
        const pt = sn[tm].pt; txt(g, pt, 234, y + 17, pt.length > 2 ? 18 : 26, '#fffaf0', 'center');
      });
      ledFooter(g, sn);
    } else if (mode === 'game' || mode === 'set') {
      const stripe = Math.floor(TT * 6) % 2; rect(g, 0, 18, 256, 110, stripe ? '#10304d' : '#0c2742');
      const w = mode === 'set' ? E.setWin : E.gameWin;
      txt(g, mode === 'set' ? 'SET!' : 'GAME', 128, 52, mode === 'set' ? 44 : 38, mode === 'set' ? '#f2c14e' : '#d8f24a', 'center');
      txt(g, w ? label(sn, w, 9) : '', 128, 88, 15, '#fffaf0', 'center');
      txt(g, mode === 'set' ? E.setScore : sn.A.g + ' - ' + sn.B.g, 128, 112, 14, '#9fc5e4', 'center');
    } else if (mode === 'win') {
      rect(g, 0, 18, 256, 110, '#0b2036');
      const bob = Math.round(Math.sin(TT * 3) * 3); trophy(g, 22, 40 + bob, 5);
      const w = sn.winner || E.winner;
      txt(g, 'CHAMPIONS', 168, 42, 19, Math.floor(TT * 4) % 2 ? '#f2c14e' : '#fff4b3', 'center');
      label(sn, w || 'A', 9).split('/').forEach(function (s, i) { txt(g, s, 168, 66 + i * 16, 14, '#fffaf0', 'center'); });
      txt(g, sn.setsText || '', 168, 112, 12, '#9fc5e4', 'center');
    } else if (mode === 'intro') {
      rect(g, 0, 18, 256, 110, '#0b2036');
      const L2 = titleLines(), bob = Math.abs(Math.sin(TT * 3)) * 8;
      rect(g, 8, 30, 52, 52, '#fffaf0'); txt(g, 'A✦', 34, 56 - bob * 0.5, 26, '#123954', 'center');
      L2.forEach(function (s, i) { txt(g, s, 158, 34 + i * 17, s.length > 10 ? 13 : 16, i === 3 ? '#f2a93b' : '#fffaf0', 'center'); });
      rect(g, 0, 98, 256, 30, '#07131f');
      txt(g, label(sn, 'A', 6) + '  VS  ' + label(sn, 'B', 6), 128, 113, 13, '#9fc5e4', 'center');
      const sx = (TT * 80) % 340 - 40; rect(g, sx, 18, 14, 110, 'rgba(255,255,255,0.08)');
    } else { // generic: golden / match point forced displays
      rect(g, 0, 18, 256, 110, Math.floor(TT * 4) % 2 ? '#3a2a08' : '#1a1204');
      txt(g, mode === 'matchpoint' ? 'MATCH POINT' : 'GOLDEN POINT!', 128, 70, 26, '#f2c14e', 'center');
    }
    // confetti
    g.fillStyle = '#fff'; E.conf.forEach(function (p) { g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), 3, 3); });
    L.tex.needsUpdate = true;
  }
  function drawSB() {
    const B = S.sb; if (!B || !B.ctx) return;
    const g = B.ctx, sn = snap();
    rect(g, 0, 0, 192, 96, '#0b1a2a'); rect(g, 0, 0, 192, 14, '#177dc5');
    txt(g, 'A✦', 4, 7, 10, '#fffaf0'); txt(g, 'LJPC FINAL', 96, 7, 9, '#fffaf0', 'center');
    ['A', 'B'].forEach(function (tm, k) {
      const y = 17 + k * 29;
      rect(g, 2, y, 188, 27, k ? '#0e2236' : '#12304a');
      if (sn.server === tm && Math.floor(TT * 2) % 2 === 0 || (sn.server === tm && TT - E.pointT > 0)) { g.fillStyle = '#d8f24a'; g.beginPath(); g.arc(9, y + 13, 3.5, 0, 7); g.fill(); }
      txt(g, label(sn, tm, 3), 17, y + 14, 11, '#fffaf0');
      for (let i = 0; i < 3; i++) { const st = sn.sets[i]; rect(g, 82 + i * 18, y + 3, 16, 21, '#07111c'); if (st) txt(g, String(st[tm]), 90 + i * 18, y + 14, 13, st[tm] > st[tm === 'A' ? 'B' : 'A'] ? '#fffaf0' : '#6f8aa5', 'center'); }
      rect(g, 138, y + 3, 20, 21, '#f2a93b'); txt(g, String(sn[tm].g), 148, y + 14, 15, '#123954', 'center');
      txt(g, sn[tm].pt, 175, y + 14, sn[tm].pt.length > 2 ? 14 : 18, '#fffaf0', 'center');
    });
    rect(g, 0, 76, 192, 20, '#07111c');
    const pulse = Math.floor(TT * 3) % 2;
    for (let i = 0; i < 5; i++) {
      let on = false, c = '#f2c14e';
      if (sn.golden) on = pulse ? i % 2 === 0 : i % 2 === 1; else if (sn.banner === 'MATCH POINT') { on = true; c = '#e0583f'; } else if (sn.banner === 'SET POINT') { on = i < 3; c = '#f2a93b'; }
      g.fillStyle = on ? c : '#2a3340'; g.beginPath(); g.arc(14 + i * 14, 86, 4, 0, 7); g.fill();
    }
    txt(g, sn.tb ? 'TIE-BREAK' : sn.golden ? 'GOLDEN PT' : sn.banner || (sn.empty ? '' : sn.serveSide ? '' : ''), 178, 86, 10, '#fffaf0', 'right');
    B.tex.needsUpdate = true;
  }
  function redrawLED(mode) { if (mode) { E.forced = mode; E.forceUntil = TT + 3; } if (S.led) drawLED(); }
  function hookBus() {
    const B = HPO.BUS;
    B.on('score:change', function () { E.sbAcc = 9; });
    B.on('flag:update', function () { E.sbAcc = 9; });
    B.on('match:phase', function (p) { E.phase = p && p.phase; });
    B.on('match:new', function () { E.gameT = E.setT = E.pointT = -99; E.conf.length = 0; E.forced = null; });
    B.on('point:start', function () { E.rally = 0; });
    B.on('rally:stroke', function (e) { E.rally = e && e.n || 0; });
    B.on('point:end', function (e) {
      E.pointT = TT; E.pointWin = e.winner; E.rally = 0;
      const k = e.kind; E.pointMsg = e.rallyLen >= 12 ? 'RALLY ' + e.rallyLen + '!' : k === 'ace' ? 'ACE!' : k === 'doubleFault' ? 'DOUBLE FAULT' : k === 'winner' ? 'WINNER!' : (k === 'forced' || k === 'unforced') ? 'ERROR' : 'POINT';
      if (e.rallyLen >= 12) spawnConf(14);
    });
    B.on('game:end', function (e) { E.gameT = TT; E.gameWin = e.winner; spawnConf(30); });
    B.on('set:end', function (e) { E.setT = TT; E.setWin = e.winner; const s = e.score; E.setScore = s ? s.A + ' - ' + s.B : ''; spawnConf(80); });
    B.on('match:end', function () { spawnConf(140); });
  }

  // ---------------------------------------------------------------- clubhouse
  function quadMesh(corners, uvs, mat, name) { // corners: array of 4 [x,y,z] (lb, rb, rt, lt)
    const pos = [], uv = [];
    corners.forEach(function (c, i) { pos.push(c[0], c[1], c[2]); uv.push(uvs[i][0], uvs[i][1]); });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new T.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); geo.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new T.Mesh(geo, mat); m.name = name || 'quad'; return m;
  }
  function drawClock(g, w, h, now) {
    rect(g, 0, 0, w, h, hexS(C.blue)); rect(g, 3, 3, w - 6, h - 6, hexS(C.cream));
    const cx = w / 2, cy = h / 2, r = w / 2 - 9;
    g.fillStyle = hexS(C.cream); g.beginPath(); g.arc(cx, cy, r + 3, 0, 7); g.fill(); g.strokeStyle = hexS(C.ink); g.lineWidth = 3; g.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * PI; g.fillStyle = hexS(C.ink); const l = i % 3 === 0 ? 7 : 4; g.fillRect(cx + Math.sin(a) * (r - l / 2) - 1.5, cy - Math.cos(a) * (r - l / 2) - 1.5, 3, 3); if (i % 3 === 0) g.fillRect(cx + Math.sin(a) * (r - 6) - 2, cy - Math.cos(a) * (r - 6) - 2, 4, 4); }
    if (now) {
      const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, mi = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + mi / 60;
      const hand = function (a, len, wd, col) { g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'butt'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); g.stroke(); };
      hand(hr / 12 * 2 * PI, r * 0.5, 4, hexS(C.ink)); hand(mi / 60 * 2 * PI, r * 0.78, 3, hexS(C.ink)); hand(s / 60 * 2 * PI, r * 0.85, 1.5, hexS(C.coral));
      g.fillStyle = hexS(C.coral); g.fillRect(cx - 2, cy - 2, 4, 4);
    }
  }
  function buildClubhouse() {
    const grp = new T.Group(); grp.name = 'clubhouse';
    const b = makeGeo(), wA = makeGeo(), wB = makeGeo();
    const wr = HPO.makeRng(777);
    // plinth, terrace, steps
    b.box(0, 0, -27, 40.4, 0.25, 14.4, C.concD).box(14, 0, -19.8, 12.4, 0.17, 5.2, C.concL).box(-12, 0, -21.2, 14, 0.12, 2.2, C.concL);
    // L wing (pitched roof), chimney
    b.box(-13.75, 0.25, -27.25, 10.5, 8.15, 9.5, C.wall).box(-13.75, 0.25, -27.25, 10.7, 0.55, 9.7, C.brick);
    b.box(-13.75, 4.2, -27.25, 10.7, 0.18, 9.7, C.blue);
    b.gable(-13.75, 8.4, -27.25, 10.8, 2.8, 12.0, C.roof, { ry: PI / 2 }).box(-13.75, 11.15, -27.25, 12.2, 0.14, 0.3, C.roofD);
    b.box(-10.4, 8.4, -26.4, 1.1, 4.4, 1.1, C.brick).box(-10.4, 12.8, -26.4, 1.4, 0.2, 1.4, C.concD);
    // clock tower
    b.box(-18.6, 0.25, -23.9, 3.2, 12.15, 3.2, C.wall).box(-18.6, 0.25, -23.9, 3.4, 0.55, 3.4, C.brick);
    b.box(-18.6, 8.3, -23.9, 3.5, 0.25, 3.5, C.blue).box(-18.6, 11.55, -23.9, 3.5, 0.25, 3.5, C.blue);
    b.pyr(-18.6, 12.4, -23.9, 4.0, 3.6, 4.0, C.roof).cyl(-18.6, 16.0, -23.9, 0.05, 1.2, C.steelD).box(-18.6, 16.9, -23.9, 0.7, 0.14, 0.05, C.coral);
    // centre block with LED mount
    b.box(0, 0.25, -26.25, 17, 10.95, 9.5, C.wall).box(0, 0.25, -26.25, 17.2, 0.55, 9.7, C.brick).box(0, 11.2, -26.25, 17.4, 0.12, 9.9, C.concD);
    b.box(0, 11.3, -21.45, 17.4, 0.55, 0.25, C.blue).box(-8.6, 11.3, -26.25, 0.25, 0.55, 9.9, C.blue).box(8.6, 11.3, -26.25, 0.25, 0.55, 9.9, C.blue).box(0, 11.3, -31.1, 17.4, 0.55, 0.25, C.blue);
    b.box(0, 4.05, -21.4, 13.7, 6.85, 0.5, C.ink).box(0, 10.9, -21.4, 14.1, 0.18, 0.62, C.blue).box(0, 3.9, -21.4, 14.1, 0.18, 0.62, C.blue);
    // portico + door
    b.box(0, 3.5, -20.9, 7.6, 0.3, 2.0, C.blue).box(0, 3.8, -20.9, 7.8, 0.08, 2.2, C.cream);
    [-3.4, 3.4].forEach(function (x) { b.cyl(x, 0.25, -20.1, 0.2, 3.25, C.cream); });
    b.box(0, 0.25, -21.55, 3.0, 3.3, 0.1, C.ink).box(0, 0.12, -20.5, 4.6, 0.13, 1.8, C.concL).box(0, 0.0, -19.8, 4.2, 0.12, 0.9, C.concL);
    wA.box(-0.68, 0.4, -21.46, 1.25, 2.9, 0.06, C.glass).box(0.68, 0.4, -21.46, 1.25, 2.9, 0.06, C.glass);
    b.box(0, 0.4, -21.43, 0.07, 2.9, 0.05, C.cream).box(0, 2.15, -21.43, 2.6, 0.07, 0.05, C.cream);
    // R wing (flat roof, balcony, awning)
    b.box(13.75, 0.25, -27.25, 10.5, 8.15, 9.5, C.wall).box(13.75, 0.25, -27.25, 10.7, 0.55, 9.7, C.brick);
    b.box(13.75, 8.4, -27.25, 10.9, 0.14, 9.9, C.concD);
    b.box(13.75, 8.54, -22.4, 10.9, 0.55, 0.2, C.blue).box(8.3, 8.54, -27.25, 0.2, 0.55, 9.9, C.blue).box(19.2, 8.54, -27.25, 0.2, 0.55, 9.9, C.blue).box(13.75, 8.54, -32.1, 10.9, 0.55, 0.2, C.blue);
    b.box(14, 4.1, -21.4, 9.8, 0.2, 2.3, C.concL).box(14, 4.0, -20.25, 9.8, 0.14, 0.12, C.blue);
    for (let x = 9.3; x <= 18.8; x += 1.2) b.box(x, 4.3, -20.3, 0.07, 1.0, 0.07, C.steelD);
    b.box(14, 5.25, -20.3, 9.6, 0.07, 0.09, C.blue).box(9.2, 4.3, -21.4, 0.07, 1.0, 2.2, C.steelD).box(18.8, 4.3, -21.4, 0.07, 1.0, 2.2, C.steelD).box(9.2, 5.25, -21.4, 0.09, 0.07, 2.2, C.blue).box(18.8, 5.25, -21.4, 0.09, 0.07, 2.2, C.blue);
    b.cyl(13.6, 4.3, -21.2, 0.35, 0.7, C.wood).cone(13.6, 5.05, -21.2, 1.3, 0.6, C.amber).cyl(13.6, 4.3, -21.2, 0.04, 2.2, C.steelD);
    b.box(12.5, 4.3, -21.2, 0.35, 0.4, 0.35, C.woodD).box(14.7, 4.3, -21.2, 0.35, 0.4, 0.35, C.woodD);
    b.person(10.4, 4.3, -21.4, 0x2b3f58, 0x1c2a3c, 0x222222, 0).person(10.9, 4.3, -21.6, 0x7a3a3a, 0x1c2a3c, 0x331a0a, 0).person(12.5, 4.5, -21.2, 0x3a5a7a, 0x1c2a3c, 0x222222, 0, true).person(14.7, 4.5, -21.2, 0x5a3a6a, 0x1c2a3c, 0x331a0a, 0, true).person(17.6, 4.3, -20.9, 0x2b3f58, 0x1c2a3c, 0x222222, 0);
    for (let i = 0; i < 10; i++) b.box(9.0 + i * 1.0, 2.55, -21.85, 1.0, 0.07, 1.5, i % 2 ? C.blue : C.cream, { rx: 0.4 });
    // R rooftop umbrella
    b.cyl(14, 8.55, -25, 0.04, 2.4, C.steelD).cone(14, 10.4, -25, 1.5, 0.6, C.coral).cyl(14, 8.55, -25, 0.35, 0.55, C.wood);
    // terrace: tables, chairs, umbrellas, people
    [[10.6, -19.4, C.cream], [13.6, -19.4, C.coral], [16.6, -19.4, C.amber], [12.1, -17.9, C.teal]].forEach(function (q, i) {
      b.cyl(q[0], 0.17, q[1], 0.45, 0.7, C.woodD).cyl(q[0], 0.17, q[1], 0.05, 2.3, C.steelD).cone(q[0], 2.4, q[1], 1.6, 0.6, q[2]);
      [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]].forEach(function (c) { b.box(q[0] + c[0], 0.17, q[1] + c[1], 0.38, 0.45, 0.38, C.wood); });
      if (i < 3) b.person(q[0] + 0.7, 0.27, q[1], [0x2b3f58, 0x7a3a3a, 0x3a5a7a][i], 0x1c2a3c, 0x222222, -PI / 2, true);
    });
    // planters
    for (let x = 8.8; x < 20; x += 2.6) b.box(x, 0.17, -17.3, 0.9, 0.5, 0.5, C.coral).cone(x, 0.67, -17.3, 0.55, 0.75, C.green).cone(x + 0.2, 0.67, -17.3, 0.35, 1.0, C.greenL);
    [-2.7, 2.7].forEach(function (x) { b.box(x, 0.12, -19.7, 0.8, 0.55, 0.8, C.blue).cone(x, 0.67, -19.7, 0.6, 1.2, C.green); });
    // windows
    function win(face, wc, a, y, w, h, o) {
      const gw = (o && o.gw) || (wr.next() < 0.62 ? wA : wB), z = face === '+z' || face === '-z', sg = (face === '+z' || face === '+x') ? 1 : -1;
      const fr = function (g, al, yy, wl, hh, dp, off, hex) { if (z) g.box(al, yy, wc + sg * off, wl, hh, dp, hex); else g.box(wc + sg * off, yy, al, dp, hh, wl, hex); };
      fr(b, a, y - 0.12, w + 0.24, h + 0.24, 0.12, 0.0, C.cream);
      fr(gw, a, y, w, h, 0.06, 0.07, o && o.door ? C.glass : C.glass);
      fr(b, a, y, 0.06, h, 0.05, 0.1, C.cream); fr(b, a, y + h * 0.55, w, 0.06, 0.05, 0.1, C.cream);
      fr(b, a, y - 0.22, w + 0.5, 0.1, 0.22, 0.08, C.blue);
      if (!o || !o.noShutter) { fr(b, a - w / 2 - 0.3, y, 0.28, h, 0.07, 0.07, C.blue); fr(b, a + w / 2 + 0.3, y, 0.28, h, 0.07, 0.07, C.blue); }
    }
    [-15.3, -12.9].forEach(function (x) { win('+z', -22.5, x, 0.95, 1.3, 1.9); });
    [-15.3, -12.9, -10.5].forEach(function (x) { win('+z', -22.5, x, 5.3, 1.3, 1.7); });
    b.box(-10.2, 0.25, -22.53, 1.4, 2.7, 0.1, C.ink).box(-10.2, 2.95, -22.55, 1.8, 0.12, 0.2, C.blue);
    [-6, -3.6, 3.6, 6].forEach(function (x) { win('+z', -21.5, x, 0.95, 1.3, 1.9, { noShutter: true }); });
    [-7.7, 7.7].forEach(function (x) { [5.4, 8.3].forEach(function (y) { win('+z', -21.5, x, y, 0.7, 1.5, { noShutter: true }); }); });
    [10.8, 13.4, 16.0, 18.2].forEach(function (x) { win('+z', -22.5, x, 0.95, 1.3, 1.9); });
    [10.8, 13.4, 16.0].forEach(function (x) { win('+z', -22.5, x, 4.35, 1.2, 2.5, { noShutter: true, door: true }); });
    [-16, -13, -10].forEach(function (x) { win('-z', -32.0, x, 1.0, 1.3, 1.8, { noShutter: true }); win('-z', -32.0, x, 5.2, 1.3, 1.7, { noShutter: true }); });
    [-5, 0, 5].forEach(function (x) { [1.0, 5.3, 8.4].forEach(function (y) { win('-z', -31.0, x, y, 1.3, 1.8, { noShutter: true }); }); });
    [11, 14, 17].forEach(function (x) { win('-z', -32.0, x, 1.0, 1.3, 1.8, { noShutter: true }); win('-z', -32.0, x, 5.2, 1.3, 1.7, { noShutter: true }); });
    [-24.5, -27.5, -30].forEach(function (z) { win('+x', 19.0, z, 1.0, 1.2, 1.8, { noShutter: true }); win('+x', 19.0, z, 5.2, 1.2, 1.7, { noShutter: true }); });
    [-28, -30.8].forEach(function (z) { win('-x', -19.0, z, 1.0, 1.2, 1.8, { noShutter: true }); win('-x', -19.0, z, 5.2, 1.2, 1.7, { noShutter: true }); });
    win('+x', -8.5, -27, 1.0, 1.2, 1.8, { noShutter: true });
    const bm = vcMat();
    grp.add(b.mesh(bm, 'club_body'));
    const mA = vcMat({}, 0xffcf70), mB = vcMat({}, 0xffcf70); S.winMats.push(mA, mB);
    grp.add(wA.mesh(mA, 'club_winA'), wB.mesh(mB, 'club_winB'));
    // sign
    const sign = R.canvasTex(512, 64, function (g, w, h) {
      rect(g, 0, 0, w, h, hexS(C.blue)); rect(g, 3, 3, w - 6, h - 6, hexS(C.cream)); rect(g, 6, 6, w - 12, h - 12, hexS(C.blue));
      txt(g, 'LITTLEWORLD JAKARTA PADEL CLUB', w / 2, h / 2 + 1, 27, hexS(C.cream), 'center');
    });
    const sg = new T.Mesh(new T.PlaneGeometry(7.4, 0.925), screenMat(sign, true)); sg.position.set(-12.8, 4.3, -22.545); grp.add(sg); S.ledMats.push(sg.material);
    sg.material.emissiveIntensity = 0.35;
    // LED video board
    const ledTex = R.canvasTex(256, 128, function (g) { rect(g, 0, 0, 256, 128, '#0a1b2c'); });
    const lm = screenMat(ledTex, true), lp = new T.Mesh(new T.PlaneGeometry(13, 6.5), lm); lp.position.set(0, 7.45, -21.13); lp.name = 'led'; grp.add(lp);
    S.led = { canvas: ledTex.image, ctx: ledTex.image.getContext('2d'), tex: ledTex, mesh: lp, mode: 'score' }; S.ledMats.push(lm);
    W.led = { canvas: S.led.canvas, ctx: S.led.ctx, texture: ledTex, mesh: lp, get mode() { return S.led.mode; } };
    // clock (4 faces, one shared texture)
    const ck = R.canvasTex(96, 96, function (g, w, h) { drawClock(g, w, h, true); });
    const cm = R.mat(0xffffff, { map: ck, cutaway: true }); if (cm.emissive) { cm.emissive.setHex(0xffffff); cm.emissiveMap = ck; cm.emissiveIntensity = 0; cm.needsUpdate = true; }
    S.clock = { tex: ck, mat: cm, acc: 0 }; S.ledMats.push(cm); cm._clock = true;
    [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(function (n) {
      const cx = -18.6 + n[0] * 1.62, cz = -23.9 + n[1] * 1.62, rx = n[1], rz = -n[0], s = 1.15, y0 = 8.85, y1 = 11.15;
      const m = quadMesh([[cx - rx * s, y0, cz - rz * s], [cx + rx * s, y0, cz + rz * s], [cx + rx * s, y1, cz + rz * s], [cx - rx * s, y1, cz - rz * s]], [[0, 0], [1, 0], [1, 1], [0, 1]], cm, 'clockface'); grp.add(m);
    });
    G.add(grp); W.clubGroup = grp; cut(grp, 'building', { fadeTo: 0.25 });
    buildFlags(grp);
  }
  function buildFlags(grp) {
    const COLS = 9, ROWS_ = 6;
    const PAT = {
      idn: function (u, v) { return v < 0.5 ? 0xd7261e : 0xfafafa; },
      esp: function (u, v) { return v < 0.25 || v > 0.75 ? 0xc60b1e : 0xffc400; },
      arg: function (u, v) { return Math.hypot(u - 0.5, (v - 0.5) * 0.7) < 0.1 ? 0xf6b40e : (v > 0.33 && v < 0.67 ? 0xfafafa : 0x74acdf); },
      ned: function (u, v) { return v < 0.34 ? 0xae1c28 : v < 0.67 ? 0xfafafa : 0x21468b; },
      jpn: function (u, v) { return Math.hypot(u - 0.5, (v - 0.5) * 1.3) < 0.26 ? 0xbc002d : 0xfafafa; },
      swe: function (u, v) { return (u > 0.28 && u < 0.45) || (v > 0.4 && v < 0.62) ? 0xfecc00 : 0x006aa7; },
      brand: function (u, v) { return Math.hypot(u - 0.5, (v - 0.45) * 1.2) < 0.2 ? 0x123954 : v > 0.7 ? 0x177dc5 : 0xfffaf0; },
      lintas: function (u, v) { return v > 0.4 && v < 0.6 ? 0xffffff : 0x1fa39b; },
      tapak: function (u, v) { return u < 0.3 ? 0x2a1a0a : 0xf28a1c; }
    };
    const defs = [[-7, 11.7, -21.7, 'idn', 4.2], [-3.5, 11.7, -21.7, 'brand', 4.2], [0, 11.7, -21.7, 'esp', 4.2], [3.5, 11.7, -21.7, 'arg', 4.2], [7, 11.7, -21.7, 'ned', 4.2],
      [-13.75, 11.25, -27.25, 'jpn', 4.0], [14, 8.6, -22.9, 'swe', 3.6], [-4.6, 0.25, -19.3, 'lintas', 5.0], [4.6, 0.25, -19.3, 'tapak', 5.0]];
    const pg = makeGeo(), pos = [], col = [], base = [], idx = []; const flags = [];
    defs.forEach(function (d, i) {
      pg.cyl(d[0], d[1], d[2], 0.07, d[4], C.steelL).box(d[0], d[1] + d[4], d[2], 0.2, 0.2, 0.2, C.gold);
      const fw = 2.4, fh = 1.45, top = d[1] + d[4] - 0.2, start = pos.length / 3, f = PAT[d[3]], cc = new T.Color();
      for (let r = 0; r < ROWS_; r++) for (let c = 0; c < COLS; c++) {
        cc.setHex(f((c + 0.5) / COLS, (r + 0.5) / ROWS_));
        const k = pos.length / 3;
        [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]].forEach(function (q) { const lx = q[0] / COLS * fw, ly = -q[1] / ROWS_ * fh; base.push(lx, ly); pos.push(d[0] + lx, top + ly, d[2]); col.push(cc.r, cc.g, cc.b); });
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      }
      flags.push({ x: d[0], y: top, z: d[2], start: start, end: pos.length / 3, ph: i * 1.7 });
    });
    grp.add(pg.mesh(vcMat(), 'poles'));
    const geo = new T.BufferGeometry(); const pa = new T.BufferAttribute(new Float32Array(pos), 3); pa.setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', pa); geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    const nn = new Float32Array(pos.length); for (let i = 0; i < nn.length; i += 3) nn[i + 2] = 1; geo.setAttribute('normal', new T.BufferAttribute(nn, 3)); geo.setIndex(idx);
    const fm = new T.Mesh(geo, vcMat({ side: T.DoubleSide })); fm.frustumCulled = false; fm.name = 'flags'; grp.add(fm);
    S.flags = { geo: geo, pa: pa, base: base, flags: flags };
  }
  function updateFlags(t) {
    const F = S.flags; if (!F) return; const a = F.pa.array;
    F.flags.forEach(function (f) {
      for (let v = f.start; v < f.end; v++) {
        const lx = F.base[v * 2], ly = F.base[v * 2 + 1], k = lx / 2.4;
        a[v * 3] = f.x + lx * (1 - 0.06 * Math.sin(t * 3 + f.ph + k * 2)); a[v * 3 + 1] = f.y + ly - k * k * 0.12 + Math.sin(t * 2.2 + f.ph + k * 4) * 0.04 * k;
        a[v * 3 + 2] = f.z + Math.sin(t * 4 + f.ph - lx * 3.0 + ly * 0.8) * 0.28 * k;
      }
    });
    F.pa.needsUpdate = true;
  }
  function buildScoreboard() {
    const tex = R.canvasTex(192, 96, function (g) { rect(g, 0, 0, 192, 96, '#0b1a2a'); });
    const grp = W.standGroups['-z']; if (!grp) return;
    const m = screenMat(tex, true), pl = new T.Mesh(new T.PlaneGeometry(4.4, 2.2), m); pl.position.set(-3.8, 6.1, 8.0); pl.rotation.y = PI; grp.add(pl);
    const fg = makeGeo(); fg.box(-3.8, 4.9, 8.1, 4.7, 2.5, 0.14, C.ink).beam(-5.6, 7.4, 8.1, -5.6, 8.5, 8.1, 0.07, C.steelD).beam(-2.0, 7.4, 8.1, -2.0, 8.5, 8.1, 0.07, C.steelD);
    grp.add(fg.mesh(vcMat(), 'sb_frame'));
    S.sb = { canvas: tex.image, ctx: tex.image.getContext('2d'), tex: tex, mesh: pl }; S.ledMats.push(m);
    W.scoreboard = { canvas: tex.image, ctx: tex.image.getContext('2d'), texture: tex, mesh: pl, redraw: drawSB };
  }

  // ---------------------------------------------------------------- broadcast cameras
  function buildCameras() {
    const hg = makeGeo();
    hg.box(0, -0.36, -0.1, 0.4, 0.36, 0.7, 0x2d3a47).cyl(0, -0.2, 0.25, 0.13, 0.5, 0x161e26, { rx: PI / 2 }).cyl(0, -0.2, 0.7, 0.17, 0.12, 0x0a0f14, { rx: PI / 2 })
      .box(0.27, -0.3, 0, 0.12, 0.2, 0.3, C.steelD).box(0, -0.02, -0.15, 0.1, 0.12, 0.4, 0x2d3a47);
    const headGeo = hg.mesh(undefined).geometry, headMat = vcMat();
    const tg = new T.BoxGeometry(0.1, 0.07, 0.1), tOn = R.mat(0xff2020, { emissive: 0xff2020 }), tOff = R.mat(0x601010);
    S.tally = { on: tOn, off: tOff };
    const g = PG;
    // 1 high stand (back of the +z stand), 2 jib crane (behind -x end), 3 tripod (+x apron corner), 4 boom pole (-x, +z apron)
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (q) { g.beam(-3 + q[0] * 1.1, 0, 16.6 + q[1] * 0.8, -3 + q[0] * 1.0, 6.2, 16.6 + q[1] * 0.7, 0.14, C.steel); });
    g.beam(-4.1, 2.5, 15.8, -1.9, 2.5, 17.4, 0.07, C.steelD).beam(-1.9, 2.5, 15.8, -4.1, 2.5, 17.4, 0.07, C.steelD);
    g.box(-3, 6.2, 16.6, 2.8, 0.14, 2.2, C.steelL); for (let x = -4.3; x <= -1.6; x += 0.9) g.box(x, 6.34, 17.7, 0.05, 0.9, 0.05, C.steelD);
    g.box(-3, 7.24, 17.7, 2.8, 0.05, 0.05, C.steelD);
    [[0, 0.5], [0.45, -0.3], [-0.45, -0.3]].forEach(function (q) { g.beam(-3 + q[0] * 0.2, 7.0, 16.6 + q[1] * 0.2, -3 + q[0], 6.34, 16.6 + q[1], 0.05, C.steelD); });
    g.box(-22.2, 0, 0, 1.8, 0.45, 1.3, C.ink).cyl(-22.2, 0.45, 0, 0.18, 2.0, C.steelL).beam(-22.2, 2.4, 0, -15.2, 5.4, 0, 0.14, C.steel).beam(-22.2, 2.4, 0, -24.0, 2.0, 0, 0.14, C.steel).box(-24.2, 1.4, 0, 0.8, 0.8, 0.9, C.concD);
    g.beam(-15.2, 5.4, 0, -15.2, 5.0, 0, 0.05, C.steelD);
    [0, 1, 2].forEach(function (i) { const a = i / 3 * 2 * PI; g.beam(11.6 + Math.cos(a) * 0.8, 0, -6.8 + Math.sin(a) * 0.8, 11.6, 1.6, -6.8, 0.05, C.steelD); });
    g.box(11.6, 1.5, -6.8, 0.25, 0.12, 0.25, C.steelD);
    [0, 1, 2].forEach(function (i) { const a = i / 3 * 2 * PI; g.beam(-11.6 + Math.cos(a) * 0.8, 0, 6.9 + Math.sin(a) * 0.8, -11.6, 1.3, 6.9, 0.05, C.steelD); });
    g.beam(-11.8, 1.3, 7.0, -9.7, 2.5, 6.1, 0.09, C.steel);
    [[-3, 7.7, 16.6], [-15.2, 5.0, 0], [11.6, 1.8, -6.8], [-9.6, 2.4, 6.1]].forEach(function (p, i) {
      const h = new T.Group(); h.position.set(p[0], p[1], p[2]); h.rotation.order = 'YXZ';
      h.add(new T.Mesh(headGeo, headMat)); const t = new T.Mesh(tg, tOff); t.position.set(0, 0.1, -0.35); h.add(t);
      h.userData = { tally: t, yaw: 0, pitch: 0, y: p[1], x: p[0], z: p[2] }; G.add(h); S.cams.push(h);
    });
  }
  function updateCams(dt) {
    const bs = HPO.mod.ball && HPO.mod.ball.state, bp = bs && bs.p ? bs.p : { x: 0, y: 1, z: 0 }, k = 1 - Math.exp(-dt * 3);
    const live = Math.floor(TT / 4) % 4;
    S.cams.forEach(function (h, i) {
      const d = h.userData, dx = bp.x - d.x, dz = bp.z - d.z, hy = Math.atan2(dx, dz), hp = Math.atan2(d.y - bp.y, Math.hypot(dx, dz));
      d.yaw += U.angleDiff(d.yaw, hy) * k; d.pitch += (hp - d.pitch) * k; h.rotation.set(d.pitch, d.yaw, 0);
      const on = i === live; if (d.on !== on) { d.on = on; d.tally.material = on ? S.tally.on : S.tally.off; }
    });
  }

  // ---------------------------------------------------------------- floodlight masts
  function buildMasts() {
    const mg = makeGeo();
    mg.cyl(0, 0, 0, 0.42, 0.5, C.concD).cyl(0, 0.5, 0, 0.3, 6.5, C.steel).cyl(0, 7.0, 0, 0.22, 6.0, C.steelL).box(0, 13.0, 0, 1.1, 0.14, 1.1, C.steelD);
    mg.box(0.33, 0.5, 0, 0.06, 12.5, 0.4, C.steelD); for (let y = 0.8; y < 12.6; y += 0.5) mg.box(0.38, y, 0, 0.06, 0.04, 0.4, C.steelD);
    const hg = makeGeo(); hg.box(0, -1.65, -0.05, 3.2, 2.5, 0.25, C.steelD).box(0, 0.9, -0.05, 3.3, 0.12, 0.35, C.steelL).box(0, -1.75, -0.2, 3.3, 2.65, 0.1, 0x3a4652);
    const mastMat = vcMat(), headMat = vcMat();
    const lensGeo = new T.BoxGeometry(0.8, 0.7, 0.1);
    const lm = R.mat(0xdde6ee, { emissive: 0xfff3c0, emissiveIntensity: 0 }); S.lampMats.push(lm);
    const hm = new T.Matrix4(), tm = new T.Matrix4(), mm = new T.Matrix4();
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (s) {
      const x = s[0] * 15, z = s[1] * 10, grp = new T.Group(); grp.position.set(x, 0, z); grp.name = 'mast';
      grp.add(mg.mesh(mastMat, 'mast_pole'));
      const head = new T.Group(); head.position.set(0, 13.9, 0); head.rotation.order = 'YXZ'; head.rotation.set(0.42, Math.atan2(-x, -z), 0); head.updateMatrix(); grp.add(head);
      head.add(hg.mesh(headMat, 'mast_head'));
      const im = new T.InstancedMesh(lensGeo, lm, 9); let n = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { tm.makeTranslation((c - 1) * 1.02, -0.5 - r * 0.8, -0.3); im.setMatrixAt(n++, tm); }
      im.frustumCulled = false; head.add(im);
      G.add(grp); S.masts.push(grp); cut(grp, 'light');
      // glow
      if (R.addPointGlow) { const p = new T.Vector3(0, -1.3, -0.6).applyMatrix4(head.matrix).add(new T.Vector3(x, 13.9, z)); try { const gl = R.addPointGlow({ x: p.x, y: p.y, z: p.z }, 0xfff2c0, 5.5, { intensity: 0.9, parent: G }); S.glows.push(gl); if (R.cutaway && R.cutaway.link) R.cutaway.link(grp, gl); } catch (e) { U.logError('worldClub.glow', e); } }
    });
    // faint volumetric beams (merged, additive)
    const pos = [], uv = [], idx = [];
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (s) {
      const a = new T.Vector3(s[0] * 15, 12.6, s[1] * 10), b = new T.Vector3(s[0] * 3, 0.1, s[1] * 1.5), ax = b.clone().sub(a).normalize();
      const w1 = new T.Vector3().crossVectors(ax, new T.Vector3(0, 1, 0)).normalize(), w2 = new T.Vector3().crossVectors(ax, w1).normalize();
      [w1, w2].forEach(function (w) {
        const k = pos.length / 3, w0 = 0.9, w3 = 7.0;
        [[a, -w0, 0, 0], [a, w0, 1, 0], [b, w3, 1, 1], [b, -w3, 0, 1]].forEach(function (q) { const p = q[0].clone().addScaledVector(w, q[1]); pos.push(p.x, p.y, p.z); uv.push(q[2], q[3]); });
        idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
      });
    });
    const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
    const btex = R.canvasTex(32, 64, function (g, w, h) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const u = (x + 0.5) / w * 2 - 1, v = y / h; g.fillStyle = 'rgba(255,244,200,' + (Math.max(0, 1 - u * u) * (1 - v) * (v < 0.04 ? v / 0.04 : 1)).toFixed(3) + ')'; g.fillRect(x, y, 1, 1); }
    });
    btex.magFilter = btex.minFilter = T.LinearFilter;
    S.beamMat = new T.MeshBasicMaterial({ map: btex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false });
    S.beams = new T.Mesh(bg, S.beamMat); S.beams.frustumCulled = false; S.beams.visible = false; G.add(S.beams);
    [-8, 8].forEach(function (x) { const l = new T.PointLight(0xffe2a8, 0, 60, 1); l.position.set(x, 12, 0); G.add(l); S.lights.push(l); });
  }

  // ---------------------------------------------------------------- indoor hall roof
  function buildRoof() {
    const rg = new T.Group(); rg.name = 'hallroof';
    const gr = makeGeo(), gp = makeGeo(), yA = function (z) { return 9.0 + 2.2 * (1 - (z / 20) * (z / 20)); };
    const zs = []; for (let z = -20; z <= 20.01; z += 2.5) zs.push(z);
    for (let x = -27; x <= 27.01; x += 6) {
      for (let i = 0; i < zs.length - 1; i++) {
        gr.beam(x, yA(zs[i]), zs[i], x, yA(zs[i + 1]), zs[i + 1], 0.34, C.steel);
        gr.beam(x, 9.0, zs[i], x, yA(zs[i]), zs[i], 0.12, C.steelD);
        gr.beam(x, 9.0, zs[i], x, yA(zs[i + 1]), zs[i + 1], 0.1, C.steelD);
      }
      gr.beam(x, 9.0, -20, x, 9.0, 20, 0.24, C.steelD);
    }
    zs.forEach(function (z) { gr.beam(-27, yA(z) + 0.1, z, 27, yA(z) + 0.1, z, 0.16, C.steelD); });
    for (let i = 0; i < zs.length - 1; i++) {
      const dy = yA(zs[i + 1]) - yA(zs[i]), zm = (zs[i] + zs[i + 1]) / 2;
      gp.box(0, (yA(zs[i]) + yA(zs[i + 1])) / 2 + 0.2, zm, 54, 0.06, 2.55, i % 2 ? 0xdbe8f3 : 0xf3efe2, { rx: -Math.atan2(dy, 2.5) });
    }
    for (let x = -26.5; x <= 26.6; x += 9) { gr.cyl(x, 0, 19.5, 0.35, 9.2, C.steelL); gr.cyl(x, 0, -19.5, 0.35, 9.2, C.steelL); }
    for (let z = -13; z <= 13.1; z += 6.5) { gr.cyl(-26.5, 0, z, 0.35, 9.2, C.steelL); gr.cyl(26.5, 0, z, 0.35, 9.2, C.steelL); }
    rg.add(gr.mesh(vcMat(), 'hall_truss'));
    rg.add(gp.mesh(vcMat({ transparent: true, opacity: 0.3 }), 'hall_panels'));
    const lm = R.mat(0xe8eef4, { emissive: 0xfff6d8, emissiveIntensity: 0 }); S.hall = lm;
    const lg = new T.BoxGeometry(5, 0.3, 1.1), im = new T.InstancedMesh(lg, lm, 12), mt = new T.Matrix4(), rods = makeGeo(); let n = 0;
    [-18, -6, 6, 18].forEach(function (x) { [-10, 0, 10].forEach(function (z) { mt.makeTranslation(x, 8.75, z); im.setMatrixAt(n++, mt); rods.beam(x - 2, 8.9, z, x - 2, yA(z), z, 0.06, C.steelD).beam(x + 2, 8.9, z, x + 2, yA(z), z, 0.06, C.steelD); }); });
    im.frustumCulled = false; rg.add(im, rods.mesh(vcMat(), 'hall_rods'));
    G.add(rg); S.roof = rg; cut(rg, 'roof', { fadeTo: 0.3 });
  }

  // ---------------------------------------------------------------- tod / venue / options
  function refreshVisibility() {
    const indoor = W.venue === 'indoor' || !!P.indoor, roof = indoor && O.showRoof;
    if (S.roof) S.roof.visible = roof;
    S.masts.forEach(function (m) { m.visible = !roof; });
    if (S.beams) S.beams.visible = !roof && (P.lamps || 0) > 0.02;
    S.glows.forEach(function (g) { if (roof && g.parent) g.parent.remove(g); else if (!roof && !g.parent) G.add(g); });
  }
  function applyTOD() {
    if (!W.ready) return;
    const l = P.lamps || 0, n = P.night || 0, k = Math.max(n, l * 0.8), indoor = W.venue === 'indoor' || !!P.indoor;
    if (S.winMats[0] && S.winMats[0].emissive) { S.winMats[0].emissiveIntensity = k * 0.95; S.winMats[1].emissiveIntensity = k * 0.35; }
    S.ledMats.forEach(function (m) { m.emissiveIntensity = m._clock ? n * 0.6 : 0.7 + 0.3 * Math.max(n, l); });
    S.lampMats.forEach(function (m) { m.emissiveIntensity = l * 1.1; });
    if (S.hall) S.hall.emissiveIntensity = indoor ? 1 : l;
    if (S.beamMat) S.beamMat.opacity = l * 0.17;
    S.lights.forEach(function (li) { li.intensity = l * 0.55; });
    refreshVisibility();
  }
  function setTimeOfDay(tod, p) { if (p) P = p; applyTOD(); }
  function setVenue(v) { W.venue = v; refreshVisibility(); applyTOD(); }
  function setOptions(o) {
    if (!o) return;
    if (o.mobile !== undefined) { O.mobile = !!o.mobile; applyMobile(); }
    if (o.showRoof !== undefined) { O.showRoof = !!o.showRoof; refreshVisibility(); }
  }

  // ---------------------------------------------------------------- lifecycle
  function init(ctx) {
    T = ctx.THREE || window.THREE; R = HPO.mod.render; G = R.groups.club; rng = HPO.makeRng(31337);
    O.mobile = !!(HPO.cfg && HPO.cfg.mobile);
    W.seatSlots = []; W.blocks = [];
    buildProps(); buildStands(); buildScoreboard(); buildClubhouse(); buildCameras(); buildMasts(); buildRoof();
    G.add(PG.mesh(vcMat(), 'club_props'));
    S.led.mode = 'score'; hookBus(); W.ready = true;
    drawLED(); drawSB(); drawClockTex();
    if (R.todParams) P = R.todParams;
    applyTOD();
  }
  function drawClockTex() { if (!S.clock) return; const im = S.clock.tex.image; drawClock(im.getContext('2d'), im.width, im.height, true); S.clock.tex.needsUpdate = true; }
  function update(dt, t) {
    if (!W.ready) return;
    TT += dt;
    updateFlags(TT); updateCams(dt);
    S.hoard.forEach(function (h) { h.tex.offset.x = (h.tex.offset.x + h.speed * dt) % 1; });
    E.conf.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; }); E.conf = E.conf.filter(function (p) { return p.y < 130; });
    E.ledAcc += dt; if (E.ledAcc > 1 / 12) { E.ledAcc = 0; drawLED(); }
    E.sbAcc += dt; if (E.sbAcc > 0.4) { E.sbAcc = 0; drawSB(); }
    S.clock.acc += dt; if (S.clock.acc > 0.1) { S.clock.acc = 0; drawClockTex(); }
  }
  function dispose() {
    [G.children.slice()].forEach(function (arr) { arr.forEach(function (o) { G.remove(o); }); });
    S.seatMeshes.length = 0; S.cams.length = 0; S.masts.length = 0; W.ready = false;
  }
})(HPO);
