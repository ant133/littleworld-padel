// Ball integrator: drag + Magnus + spin, swept-sphere CCD contacts, bounce bookkeeping, watchdogs. Headless.
(function (HPO) {
  'use strict';
  // magnus: multiplier on cfg.BALL.MAGNUS (cfg value is ~7.7x the physical k=0.5*rho*A*R=7.1e-5; 0.13 makes it physical)
  const PRM = { magnus: 0.13, spinDecay: 0.015, restVn: 0.3, rollDecel: 1.0, maxCollisions: 4, restTime: 1.5, maxSince: 12, maxWall: 6, KIN: 0.4 };
  const wind = { x: 0, y: 0, z: 0 };
  const LIVE = { emit: true, jitter: true, rec: null, t0: 0 };

  const copy3 = o => ({ x: o.x, y: o.y, z: o.z });
  function blank() {
    return {
      p: { x: 0, y: 1, z: 0 }, v: { x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 }, state: 'dead',
      lastHitter: null, lastHitTeam: null, floorBouncesSinceHit: 0, bouncesOnSide: { A: 0, B: 0 }, touchedSinceHit: [],
      wallContactsSinceFloor: 0, hitsSinceServe: 0, t: 0, tSinceHit: 0, resting: false, restY: 0, restSurf: 'floor', restT: 0, deadReason: null
    };
  }
  function clone(s) {
    return {
      p: copy3(s.p), v: copy3(s.v), w: copy3(s.w), state: s.state, lastHitter: s.lastHitter, lastHitTeam: s.lastHitTeam,
      floorBouncesSinceHit: s.floorBouncesSinceHit, bouncesOnSide: { A: s.bouncesOnSide.A, B: s.bouncesOnSide.B },
      touchedSinceHit: s.touchedSinceHit.map(o => Object.assign({}, o)), wallContactsSinceFloor: s.wallContactsSinceFloor,
      hitsSinceServe: s.hitsSinceServe, t: s.t, tSinceHit: s.tSinceHit, resting: s.resting, restY: s.restY, restSurf: s.restSurf, restT: s.restT, deadReason: s.deadReason
    };
  }

  function restit(e, vna) {
    const lo = vna >= 3 ? 1 : 0.62 + 0.38 * smooth((vna - 0.3) / 2.7);
    // a real ball loses more of its rebound the harder it lands: a lob dropping from 7-8 m must not climb over the 4 m fence again
    const hi = vna > 6 ? Math.max(0.74, 1 - 0.04 * (vna - 6)) : 1;
    return e * lo * hi;
  }
  function smooth(x) { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); }

  // rotate v's direction by small random angles (sigma deg) and keep it leaving the surface
  function jitterDir(v, n, sigma, rng) {
    const sp = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (sp < 1e-6) return;
    const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
    let ux, uy, uz; // u1 = d x helper
    if (Math.abs(dy) < 0.9) { ux = dz; uy = 0; uz = -dx; } else { ux = 0; uy = -dz; uz = dy; }
    const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
    const wx = dy * uz - dz * uy, wy = dz * ux - dx * uz, wz = dx * uy - dy * ux;
    const s = sigma * Math.PI / 180, a = rng.normal(0, s), b = rng.normal(0, s);
    let nx = dx + ux * a + wx * b, ny = dy + uy * a + wy * b, nz = dz + uz * a + wz * b;
    const dn = nx * n.x + ny * n.y + nz * n.z;
    if (dn < 0.05) { nx += n.x * (0.05 - dn); ny += n.y * (0.05 - dn); nz += n.z * (0.05 - dn); }
    const l = Math.hypot(nx, ny, nz);
    v.x = nx / l * sp; v.y = ny / l * sp; v.z = nz / l * sp;
  }

  // Pure contact response. n points from surface toward ball. rng (optional) enables direction jitter.
  function respond(par, n, v, w, rng) {
    const R = HPO.cfg.BALL.R;
    const o = { v: copy3(v), w: copy3(w), e: 0, vn: 0 };
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn >= 0) return o;
    const vna = -vn, e = restit(par.e, vna), dvn = (1 + e) * vna;
    o.e = e; o.vn = vna;
    const rx = -n.x * R, ry = -n.y * R, rz = -n.z * R;
    let cx = v.x + (w.y * rz - w.z * ry), cy = v.y + (w.z * rx - w.x * rz), cz = v.z + (w.x * ry - w.y * rx);
    const cn = cx * n.x + cy * n.y + cz * n.z; cx -= cn * n.x; cy -= cn * n.y; cz -= cn * n.z;
    const cm = Math.sqrt(cx * cx + cy * cy + cz * cz);
    let jx = 0, jy = 0, jz = 0;
    if (cm > 1e-9) { const j = Math.min(par.mu * dvn, par.kt * PRM.KIN * cm) / cm; jx = -cx * j; jy = -cy * j; jz = -cz * j; }
    const k = 1.5 / (R * R); // m/I for a thin shell
    let vx = v.x + n.x * dvn + jx, vy = v.y + n.y * dvn + jy, vz = v.z + n.z * dvn + jz;
    let wx = w.x + (ry * jz - rz * jy) * k, wy = w.y + (rz * jx - rx * jz) * k, wz = w.z + (rx * jy - ry * jx) * k;
    if (par.td) {
      const d = vx * n.x + vy * n.y + vz * n.z, f = 1 - par.td;
      vx = n.x * d + (vx - n.x * d) * f; vy = n.y * d + (vy - n.y * d) * f; vz = n.z * d + (vz - n.z * d) * f;
      wx *= f; wy *= f; wz *= f;
    }
    if (par.xl) { const f = 1 - par.xl; vx *= f; vy *= f; vz *= f; }
    o.v.x = vx; o.v.y = vy; o.v.z = vz; o.w.x = wx; o.w.y = wy; o.w.z = wz;
    if (rng && par.jit > 0) jitterDir(o.v, n, par.jit, rng);
    return o;
  }

  function die(S, X, reason) {
    S.state = 'dead'; S.deadReason = reason;
    if (X.emit) HPO.BUS.emit('ball:dead', { reason, p: copy3(S.p), t: S.t });
  }

  function rollOnFloor(S, dt, C, B) {
    const v = S.v, w = S.w, R = B.R, par = C.params(S.restSurf || 'floor');
    const cx = v.x + w.z * R, cz = v.z - w.x * R, s = Math.hypot(cx, cz);
    if (s > 1e-6) {
      const j = Math.min(par.mu * B.G * dt, PRM.KIN * s) / s, jx = -cx * j, jz = -cz * j, k = 1.5 / (R * R);
      v.x += jx; v.z += jz; w.x += -R * jz * k; w.z += R * jx * k;
    }
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0) { const f = Math.max(0, sp - PRM.rollDecel * dt) / sp; v.x *= f; v.z *= f; }
  }

  function contact(S, hit, X, C) {
    const surf = hit.surf, n = hit.n, v = S.v, B = HPO.cfg.BALL;
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn >= 0) return;
    if (surf === 'ground' || surf === 'outsideItem') {
      const info = { surf, p: copy3(hit.p), vIn: copy3(v), vOut: { x: 0, y: 0, z: 0 }, t: S.t, normal: copy3(n) };
      if (X.rec) X.rec(info, S);
      if (X.emit) HPO.BUS.emit('ball:contact', info);
      die(S, X, 'outsideContact'); return;
    }
    const floorish = surf === 'floor' || surf === 'ground';
    if (floorish && -vn < PRM.restVn) {
      S.resting = true; S.restY = hit.c.y; S.restSurf = surf; v.y = 0;
      return;
    }
    const par = C.params(surf), vIn = copy3(v);
    const rng = X.jitter && par.jit > 0 ? HPO.streams.ball : null;
    const o = respond(par, n, v, S.w, rng);
    S.v = o.v; S.w = o.w;
    if (S.resting && S.v.y > 0.02) S.resting = false;
    const cp = hit.p;
    S.touchedSinceHit.push({ surf, t: S.t, x: cp.x, y: cp.y, z: cp.z });
    if (S.touchedSinceHit.length > 32) S.touchedSinceHit.shift();
    if (surf === 'floor') {
      S.floorBouncesSinceHit++; S.wallContactsSinceFloor = 0;
      S.bouncesOnSide[C.regionOf(cp.x, cp.z)]++;
    } else if (C.isWall(surf)) S.wallContactsSinceFloor++;
    const info = { surf, p: copy3(cp), vIn, vOut: copy3(S.v), t: S.t, normal: copy3(n) };
    if (X.rec) X.rec(info, S);
    if (X.emit) {
      HPO.BUS.emit('ball:contact', info);
      if (surf === 'floor') {
        HPO.BUS.emit('ball:bounce', {
          side: C.regionOf(cp.x, cp.z), p: copy3(cp), n: copy3(n),
          marginCm: Math.abs(C.nearLine(cp.x, cp.z)) * 100, bounceNo: S.floorBouncesSinceHit
        });
      }
    }
  }

  // one integration step on state S (shared by live ball and prediction)
  function stepState(S, dt, X) {
    if (S.state !== 'live') return;
    const C = HPO.mod.court, B = HPO.cfg.BALL, R = B.R, p = S.p;
    let v = S.v, w = S.w;
    const rx = v.x - wind.x, ry = v.y - wind.y, rz = v.z - wind.z;
    const kd = 0.5 * B.RHO * B.CD * Math.PI * R * R / B.M * Math.sqrt(rx * rx + ry * ry + rz * rz);
    const km = B.MAGNUS * PRM.magnus / B.M;
    v.x += (-kd * rx + km * (w.y * rz - w.z * ry)) * dt;
    v.z += (-kd * rz + km * (w.x * ry - w.y * rx)) * dt;
    if (S.resting) { v.y = 0; rollOnFloor(S, dt, C, B); }
    else v.y += (-B.G - kd * ry + km * (w.z * rx - w.x * rz)) * dt;
    const dec = 1 - PRM.spinDecay * dt; w.x *= dec; w.y *= dec; w.z *= dec;
    S.t += dt; S.tSinceHit += dt;

    let rem = dt, n = 0;
    while (rem > 1e-12) {
      v = S.v;
      const q = { x: p.x + v.x * rem, y: p.y + v.y * rem, z: p.z + v.z * rem };
      const hit = C.raycastSphere(p, q, R);
      if (!hit) { p.x = q.x; p.y = q.y; p.z = q.z; break; }
      p.x = hit.c.x; p.y = hit.c.y; p.z = hit.c.z;
      rem *= 1 - hit.t;
      contact(S, hit, X, C);
      if (S.state !== 'live') return;
      if (++n >= PRM.maxCollisions) { S.v.x *= 0.5; S.v.y *= 0.5; S.v.z *= 0.5; break; }
    }
    if (S.resting) { p.y = S.restY; S.v.y = 0; }

    if (S.tSinceHit > PRM.maxSince || S.wallContactsSinceFloor > PRM.maxWall) return die(S, X, 'watchdog');
    if (Math.abs(p.x) > 18 || Math.abs(p.z) > 12 || p.y < -1) return die(S, X, 'outOfBounds');
    if (S.resting && Math.hypot(S.v.x, S.v.z) < 0.2) { S.restT += dt; if (S.restT >= PRM.restTime) return die(S, X, 'rest'); }
    else S.restT = 0;
  }

  const state = blank();
  let acc = 0;
  function assign(dst, src) { Object.assign(dst, clone(src)); }

  const M = HPO.mod.ball = {
    state, PRM, respond, clone, restit,
    setWind(v) { wind.x = v.x || 0; wind.y = v.y || 0; wind.z = v.z || 0; },
    getWind() { return copy3(wind); },
    reset() { assign(state, blank()); acc = 0; return state; },
    hold(p) {
      assign(state, blank()); state.state = 'held';
      state.p = copy3(p); acc = 0; return state;
    },
    // o: {p, v, w?, hitter?, team?, serve?}
    launch(o) {
      const s = state;
      s.state = 'live'; s.p = copy3(o.p); s.v = copy3(o.v); s.w = o.w ? copy3(o.w) : { x: 0, y: 0, z: 0 };
      s.lastHitter = o.hitter === undefined ? null : o.hitter; s.lastHitTeam = o.team === undefined ? null : o.team;
      s.floorBouncesSinceHit = 0; s.bouncesOnSide = { A: 0, B: 0 }; s.touchedSinceHit = [];
      s.wallContactsSinceFloor = 0; s.tSinceHit = 0; s.resting = false; s.restT = 0; s.deadReason = null;
      if (o.serve) s.hitsSinceServe = 1; else if (o.hitter != null || o.team != null) s.hitsSinceServe++;
      acc = 0; return s;
    },
    step(dt) { stepState(state, Math.min(dt === undefined ? HPO.cfg.PHYS_DT : dt, HPO.cfg.PHYS_DT), LIVE); },
    update(simDt) {
      if (state.state !== 'live') { acc = 0; return; }
      const D = HPO.cfg.PHYS_DT;
      acc += simDt / D;
      while (acc >= 1 - 1e-6 && state.state === 'live') { acc -= 1; stepState(state, D, LIVE); }
    },
    // pure dry-run: same integrator, jitter off, no events, no rng. Returns {samples, contacts, end}
    predict(src, maxT, hz) {
      const S = clone(src || state), D = HPO.cfg.PHYS_DT, dts = 1 / (hz || 60), T = maxT || 6;
      const contacts = [], samples = [];
      let now = 0;
      const X = { emit: false, jitter: false, rec(info) { contacts.push({ t: now, surf: info.surf, p: info.p }); } };
      const snap = t => samples.push({ t, p: copy3(S.p), v: copy3(S.v), w: copy3(S.w), floorBounces: S.floorBouncesSinceHit });
      snap(0);
      if (S.state !== 'live') return { samples, contacts, end: { t: 0, state: S.state, reason: S.deadReason } };
      const steps = Math.ceil(T / D - 1e-9);
      let next = dts;
      for (let i = 1; i <= steps; i++) {
        now = i * D;
        stepState(S, D, X);
        if (now >= next - 1e-9) { snap(now); while (next <= now + 1e-9) next += dts; }
        if (S.state !== 'live') { if (samples[samples.length - 1].t !== now) snap(now); break; }
      }
      return { samples, contacts, end: { t: now, state: S.state, reason: S.deadReason } };
    }
  };
})(HPO);
