// Court geometry, surface tables per venue, analytic swept-sphere raycast. Headless, no THREE.
(function (HPO) {
  'use strict';
  const TAPE_R = 0.03, POST_Z = 5.05, POST_R = 0.05, POST_H = 1.0, SVC = 6.95, DOOR_H = 1.9, E = 1e-9;
  const hNet = z => 0.88 + 0.04 * (z / 5) * (z / 5);
  const WALL = { glassBack: 1, glassSide: 1, meshBack: 1, meshSide: 1, post: 1, door: 1 };
  const MESH = { meshBack: 1, meshSide: 1, door: 1 };

  // [e, mu] pairs; mesh [e, jitterDeg]
  const VENUES = {
    classicBlue: { label: 'Classic Blue', floor: [0.80, 0.55], glass: [0.82, 0.20], mesh: [0.45, 6], wind: 0.6, ceiling: 0, speedMult: 1.0 },
    terracotta: { label: 'Terracotta', floor: [0.76, 0.65], glass: [0.80, 0.22], mesh: [0.42, 6], wind: 0.6, ceiling: 0, speedMult: 0.97 },
    fastBlue: { label: 'Fast Blue', floor: [0.82, 0.42], glass: [0.83, 0.16], mesh: [0.47, 6], wind: 0.6, ceiling: 0, speedMult: 1.0 },
    indoor: { label: 'Indoor', floor: [0.80, 0.55], glass: [0.82, 0.20], mesh: [0.45, 6], wind: 0, ceiling: 8, speedMult: 1.0 }
  };
  // e restitution, mu Coulomb friction, kt tangential coupling (1 = grip removes slip), jit direction sigma deg, xl extra speed loss, td tangential damping
  const mk = (e, mu, kt, jit, xl, td) => ({ e, mu, kt, jit: jit || 0, xl: xl || 0, td: td || 0 });
  function table(d) {
    const g = () => mk(d.glass[0], d.glass[1], 0.7), m = () => mk(d.mesh[0], 0.35, 0.6, d.mesh[1], 0.04);
    const door = m(); door.e *= 0.9;
    return {
      floor: mk(d.floor[0], d.floor[1], 1.1), ground: mk(0.45, 0.8, 1),
      glassBack: g(), glassSide: g(), meshBack: m(), meshSide: m(), door,
      net: mk(0.1, 0.9, 0.5, 3, 0, 0.6), netTape: mk(0.35, 0.5, 0.8, 8), post: mk(0.5, 0.3, 0.8, 2),
      ceiling: mk(0.4, 0.4, 0.8)
    };
  }
  const SURF = {};
  Object.keys(VENUES).forEach(k => { SURF[k] = table(VENUES[k]); });

  // ---- colliders ----
  // rect: axis-aligned plane patch. ax = normal axis, c = plane coord, ia/ib = in-plane axes, [a0,a1]x[b0,b1] bounds, two = collides from both sides, sg = allowed side if one-sided.
  const SURFACES = [];
  function rect(id, ax, c, a0, a1, b0, b1, o) {
    const q = Object.assign({ id, type: 'rect', ax, c, ia: ax === 0 ? 1 : 0, ib: ax === 2 ? 1 : 2, a0, a1, b0, b1, two: true, sg: 1, top: null }, o);
    q.n = [0, 0, 0]; q.n[ax] = q.two ? (c >= 0 ? -1 : 1) : q.sg;
    SURFACES.push(q); return q;
  }
  rect('floor', 1, 0, -10, 10, -5, 5, { two: false, sg: 1 });
  rect('ground', 1, -0.2, -80, 80, -80, 80, { two: false, sg: 1 });
  const ceil = rect('ceiling', 1, 8, -80, 80, -80, 80, { two: false, sg: -1, venueOnly: true });
  [-10, 10].forEach(c => { rect('glassBack', 0, c, 0, 3, -5, 5); rect('meshBack', 0, c, 3, 4, -5, 5); });
  [-5, 5].forEach(c => {
    [[-10, -8], [8, 10]].forEach(xr => { rect('glassSide', 2, c, xr[0], xr[1], 0, 3); rect('meshSide', 2, c, xr[0], xr[1], 3, 4); }); // first side glass panel from the back: 3 m glass + mesh to 4 m
    [[-8, -6], [6, 8]].forEach(xr => rect('glassSide', 2, c, xr[0], xr[1], 0, 3));                                                    // second side glass panel: 3 m, level with the long fence
    rect('meshSide', 2, c, -6, -1, 0, 3); rect('meshSide', 2, c, 1, 6, 0, 3);                                                          // 3 m mesh fence
    rect('meshSide', 2, c, -1, 1, DOOR_H, 3);                                                                                          // header over the open entrance: the 3 m fence line stays continuous, the gap below stays open
    // no collider between x=-1 and x=1: the entrance beside the net is an open gap (the net post stands in it), a ball can leave through it
  });
  rect('net', 0, 0, 0, 0, -POST_Z, POST_Z, { top: z => hNet(z) - TAPE_R });   // runs into the entrance: the net post stands between the two door leaves
  const CAPS = [];
  function cap(id, ax, ay, az, bx, by, bz, r) { const q = { id, type: 'capsule', a: [ax, ay, az], b: [bx, by, bz], r }; SURFACES.push(q); CAPS.push(q); }
  for (let i = 0, N = 20; i < N; i++) {
    const z0 = -5 + 10 * i / N, z1 = -5 + 10 * (i + 1) / N;
    cap('netTape', 0, hNet(z0) - TAPE_R, z0, 0, hNet(z1) - TAPE_R, z1, TAPE_R);
  }
  [-POST_Z, POST_Z].forEach(z => cap('post', 0, 0, z, 0, POST_H, z, POST_R));
  const RECTS = SURFACES.filter(q => q.type === 'rect');

  // ---- swept sphere vs capsule: smallest t in [0,1] where |P+tD - segment| = Rt ----
  function rayCapsule(P, D, q, r, out) {
    const A = q.a, B = q.b, Rt = r + q.r;
    const abx = B[0] - A[0], aby = B[1] - A[1], abz = B[2] - A[2];
    const apx = P[0] - A[0], apy = P[1] - A[1], apz = P[2] - A[2];
    const abab = abx * abx + aby * aby + abz * abz;
    const abm = abx * apx + aby * apy + abz * apz, abd = abx * D[0] + aby * D[1] + abz * D[2];
    const dd = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
    // starting inside: hit at t=0 only if approaching
    let u0 = Math.min(1, Math.max(0, abm / abab));
    let qx = apx - abx * u0, qy = apy - aby * u0, qz = apz - abz * u0;
    const d2 = qx * qx + qy * qy + qz * qz;
    if (d2 < Rt * Rt) {
      const dl = Math.sqrt(d2) || 1e-9;
      if ((qx * D[0] + qy * D[1] + qz * D[2]) / dl < 0) { out.t = 0; out.nx = qx / dl; out.ny = qy / dl; out.nz = qz / dl; return true; }
      return false;
    }
    let bt = 2;
    const A2 = abab * dd - abd * abd;
    if (A2 > 1e-12) {
      const apd = apx * D[0] + apy * D[1] + apz * D[2];
      const B2 = abab * apd - abm * abd;
      const C2 = abab * (apx * apx + apy * apy + apz * apz - Rt * Rt) - abm * abm;
      const disc = B2 * B2 - A2 * C2;
      if (disc >= 0) {
        const t = (-B2 - Math.sqrt(disc)) / A2, u = (abm + t * abd) / abab;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) bt = t;
      }
    }
    for (let k = 0; k < 2; k++) {
      const S = k ? B : A, sx = P[0] - S[0], sy = P[1] - S[1], sz = P[2] - S[2];
      const b = sx * D[0] + sy * D[1] + sz * D[2], c = sx * sx + sy * sy + sz * sz - Rt * Rt;
      if (dd < 1e-18 || b >= 0) continue;
      const disc = b * b - dd * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / dd;
      if (t >= 0 && t <= 1 && t < bt) bt = t;
    }
    if (bt > 1) return false;
    const cx = P[0] + D[0] * bt, cy = P[1] + D[1] * bt, cz = P[2] + D[2] * bt;
    const ex = cx - A[0], ey = cy - A[1], ez = cz - A[2];
    const u = Math.min(1, Math.max(0, (ex * abx + ey * aby + ez * abz) / abab));
    qx = ex - abx * u; qy = ey - aby * u; qz = ez - abz * u;
    const l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1e-9;
    out.t = bt; out.nx = qx / l; out.ny = qy / l; out.nz = qz / l;
    return true;
  }

  let venue = 'classicBlue', def = VENUES.classicBlue, ceilOn = false;
  const cap_out = { t: 0, nx: 0, ny: 0, nz: 0 };

  // earliest hit of sphere (radius r) moving p0->p1. Returns {t, surf, n, p (surface point), c (sphere centre at hit)} | null
  function raycastSphere(p0, p1, r) {
    const P = [p0.x, p0.y, p0.z], D = [p1.x - p0.x, p1.y - p0.y, p1.z - p0.z];
    let bt = 2, bid = null, bn = null;
    for (let i = 0; i < RECTS.length; i++) {
      const q = RECTS[i];
      if (q.venueOnly && !ceilOn) continue;
      const ax = q.ax, s0 = P[ax] - q.c, ds = D[ax], sg = q.two ? (s0 >= 0 ? 1 : -1) : q.sg;
      const d0 = s0 * sg, dd = ds * sg;
      if (dd >= 0 || d0 < -r) continue;
      const t = d0 <= r ? 0 : (d0 - r) / -dd;
      if (t > 1 || t > bt) continue;
      const a = P[q.ia] + D[q.ia] * t, b = P[q.ib] + D[q.ib] * t, hi = q.top ? q.top(b) : q.a1;
      if (a < q.a0 - E || a > hi + E || b < q.b0 - E || b > q.b1 + E) continue;
      bt = t; bid = q.id; bn = [0, 0, 0]; bn[ax] = sg;
    }
    const xmin = Math.min(P[0], P[0] + D[0]), xmax = Math.max(P[0], P[0] + D[0]);
    if (xmin <= r + POST_R + TAPE_R && xmax >= -(r + POST_R + TAPE_R)) {
      for (let i = 0; i < CAPS.length; i++) {
        const q = CAPS[i];
        if (rayCapsule(P, D, q, r, cap_out) && cap_out.t < bt) { bt = cap_out.t; bid = q.id; bn = [cap_out.nx, cap_out.ny, cap_out.nz]; }
      }
    }
    if (!bid) return null;
    const c = { x: P[0] + D[0] * bt, y: P[1] + D[1] * bt, z: P[2] + D[2] * bt };
    const n = { x: bn[0], y: bn[1], z: bn[2] };
    return { t: bt, surf: bid, n, c, p: { x: c.x - n.x * r, y: c.y - n.y * r, z: c.z - n.z * r } };
  }

  // ---- teams / sides ----
  function sideOf(team) { const s = HPO.court && HPO.court.sides; return (s && s[team]) || (team === 'A' ? -1 : 1); }
  function rightSign(team) { return -sideOf(team); }
  function regionOf(x, z) { const s = x < 0 ? -1 : 1; return sideOf('A') === s ? 'A' : 'B'; }
  function inCourt(x, z) { return Math.abs(x) <= 10 && Math.abs(z) <= 5; }
  function serviceBox(team, side) {
    const zs = side === 'deuce' ? -rightSign(team) : rightSign(team), xs = -sideOf(team);
    return { x: xs > 0 ? [0, SVC] : [-SVC, 0], z: zs > 0 ? [0, 5] : [-5, 0] };
  }
  // signed margin (m): with box -> distance to box edge (+ inside); without -> distance to nearest painted line/boundary (+ inside court)
  function nearLine(x, z, box) {
    if (box) {
      const dx = Math.min(x - box.x[0], box.x[1] - x), dz = Math.min(z - box.z[0], box.z[1] - z);
      return dx >= 0 && dz >= 0 ? Math.min(dx, dz) : -Math.hypot(Math.min(dx, 0), Math.min(dz, 0));
    }
    const ax = Math.abs(x), az = Math.abs(z);
    if (ax > 10 || az > 5) return -Math.hypot(Math.max(ax - 10, 0), Math.max(az - 5, 0));
    return Math.min(10 - ax, 5 - az, Math.abs(ax - SVC), ax <= SVC ? az : Math.hypot(ax - SVC, az));
  }

  function setVenue(name) {
    if (!VENUES[name]) { HPO.util.logError('court.setVenue', 'unknown venue ' + name); return M.def; }
    venue = name; def = VENUES[name]; ceilOn = !!def.ceiling; ceil.c = def.ceiling || 8;
    M.venue = name; M.def = def; M.surf = SURF[name];
    return def;
  }

  const M = HPO.mod.court = {
    sides: { A: -1, B: 1 },
    SURFACES, SURF, VENUES, venue, def, surf: SURF[venue],
    DIM: { L: 20, W: 10, serviceX: SVC, netY: 0.88, netPostY: 0.92, postZ: POST_Z, tapeR: TAPE_R, wallH: 4, glassH: 3, doorH: DOOR_H },
    LINES: { service: [-SVC, SVC], center: { z: 0, x: [-SVC, SVC] }, boundary: { x: [-10, 10], z: [-5, 5] } },
    setVenue, raycastSphere, inCourt, regionOf, serviceBox, nearLine, rightSign, sideOf,
    netHeight: hNet,
    params(id) { return SURF[venue][id]; },
    isWall(id) { return !!WALL[id]; },
    isMesh(id) { return !!MESH[id]; },
    isGlass(id) { return id === 'glassBack' || id === 'glassSide'; },
    isNet(id) { return id === 'net' || id === 'netTape'; },
    init() { setVenue(venue); }
  };
  if (!HPO.cfg.VENUES) HPO.cfg.VENUES = VENUES;
})(HPO);
