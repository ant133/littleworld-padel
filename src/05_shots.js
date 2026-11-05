// Shot table + solver: picks a launch velocity/spin that makes the real integrator land on a target,
// then perturbs it with an execution-error model. Outcomes come from the perturbed launch, not dice.
(function (HPO) {
  'use strict';
  const U = HPO.util, G = HPO.cfg.BALL.G, R = HPO.cfg.BALL.R;
  const D2R = Math.PI / 180;
  HPO.cfg.TUNE.errPhi = HPO.cfg.TUNE.errPhi || 1.755; HPO.cfg.TUNE.errTh = HPO.cfg.TUNE.errTh || 1.71;
  HPO.cfg.TUNE.speed = HPO.cfg.TUNE.speed || 0.85; HPO.cfg.TUNE.react = HPO.cfg.TUNE.react || 1.5;

  // spin rates in rad/s (top>0 topspin, back>0 backspin, side>0 curves left of travel direction)
  // root: 'low' flat trajectory, 'high' lob trajectory. h: preferred contact height window.
  const SHOTS = {
    serve:      { speed: [12, 16],  top: 0,   back: 60,  side: 0,   root: 'low',  h: [0.2, 1.0], diff: 0.30, att: 0.1, def: 0.1, anim: 'serveHit' },
    flatGround: { speed: [15, 23], top: 40,  back: 0,   side: 0,   root: 'low',  h: [0.3, 1.5], diff: 0.45, att: 0.6, def: 0.2, anim: 'groundstroke' },
    topGround:  { speed: [14, 21], top: 150, back: 0,   side: 0,   root: 'low',  h: [0.3, 1.6], diff: 0.45, att: 0.5, def: 0.3, anim: 'groundstroke' },
    slice:      { speed: [11, 17], top: 0,   back: 130, side: 0,   root: 'low',  h: [0.3, 1.5], diff: 0.30, att: 0.2, def: 0.6, anim: 'groundstroke' },
    volleyFH:   { speed: [9, 17],  top: 0,   back: 40,  side: 0,   root: 'low',  h: [0.5, 2.0], diff: 0.45, att: 0.7, def: 0.3, anim: 'volleyFH' },
    volleyBH:   { speed: [9, 16],  top: 0,   back: 50,  side: 0,   root: 'low',  h: [0.5, 2.0], diff: 0.52, att: 0.6, def: 0.3, anim: 'volleyBH' },
    lobDef:     { speed: [11, 15], top: 60,  back: 0,   side: 0,   root: 'high', h: [0.2, 1.8], diff: 0.35, att: 0.0, def: 1.0, anim: 'groundstroke' },
    lobOff:     { speed: [14, 19], top: 80,  back: 0,   side: 0,   root: 'high', h: [0.4, 2.0], diff: 0.50, att: 0.5, def: 0.5, anim: 'groundstroke' },
    bandeja:    { speed: [11, 15], top: 0,   back: 120, side: 40,  root: 'low',  h: [1.9, 2.9], diff: 0.45, att: 0.4, def: 0.4, anim: 'bandeja' },
    vibora:     { speed: [15, 21], top: 0,   back: 70,  side: 150, root: 'low',  h: [1.5, 2.9], diff: 0.62, att: 0.7, def: 0.1, anim: 'vibora' },
    smashFlat:  { speed: [27, 35], top: 30,  back: 0,   side: 0,   root: 'low',  h: [2.1, 3.0], diff: 0.52, att: 1.0, def: 0.0, anim: 'smash' },
    smashKick:  { speed: [24, 32], top: 90,  back: 0,   side: 170, root: 'low',  h: [2.1, 3.0], diff: 0.60, att: 0.9, def: 0.0, anim: 'kickSmash' },
    dejada:     { speed: [5, 8],   top: 0,   back: 150, side: 0,   root: 'low',  h: [0.5, 1.8], diff: 0.60, att: 0.5, def: 0.1, anim: 'volleyFH' },
    chiquita:   { speed: [8, 12],  top: 20,  back: 0,   side: 0,   root: 'low',  h: [0.15, 1.1], diff: 0.55, att: 0.5, def: 0.4, anim: 'lowDef' },
    bajada:     { speed: [16, 25], top: 80,  back: 0,   side: 0,   root: 'low',  h: [0.5, 1.9], diff: 0.62, att: 0.8, def: 0.1, anim: 'groundstroke' },
    wallDef:    { speed: [12, 17], top: 30,  back: 0,   side: 0,   root: 'high', h: [0.2, 1.6], diff: 0.50, att: 0.0, def: 0.9, anim: 'wallPrep' },
    counterDW:  { speed: [17, 25], top: 60,  back: 0,   side: 0,   root: 'low',  h: [0.3, 1.8], diff: 0.75, att: 0.8, def: 0.3, anim: 'groundstroke' }
  };

  // drag-free range to the floor from height h0 at speed s, elevation th
  function rangeNoDrag(s, th, h0) {
    const vy = s * Math.sin(th), vx = s * Math.cos(th);
    const disc = vy * vy + 2 * G * (h0 - R);
    if (disc < 0) return 0;
    return vx * (vy + Math.sqrt(disc)) / G;
  }
  function analyticAngle(s, D, h0, root) {
    const a = G * D * D / (2 * s * s), y = R - h0;
    const disc = D * D - 4 * a * (a + y);
    if (disc < 0) return { th: 45 * D2R, ok: false };
    const sq = Math.sqrt(disc);
    const u = root === 'high' ? (D + sq) / (2 * a) : (D - sq) / (2 * a);
    return { th: Math.atan(u), ok: true };
  }

  function launchState(p, v, w) {
    const B = HPO.mod.ball;
    const st = B.clone(B.state);
    st.p = { x: p.x, y: p.y, z: p.z }; st.v = { x: v.x, y: v.y, z: v.z }; st.w = { x: w.x, y: w.y, z: w.z };
    st.state = 'live'; st.floorBouncesSinceHit = 0; st.wallContactsSinceFloor = 0; st.tSinceHit = 0;
    st.touchedSinceHit = []; st.resting = false;
    return st;
  }

  function dryRun(p, v, w, maxT) {
    const B = HPO.mod.ball;
    const st = launchState(p, v, w);
    const pr = B.predict(st, maxT, 30);
    const c = pr.contacts;
    let floor = null, blocked = null;
    for (let i = 0; i < c.length; i++) {
      if (c[i].surf === 'floor') { floor = c[i]; break; }
      if (!blocked) blocked = c[i];
    }
    // net crossing height
    let netY = null, apex = p.y;
    const s = pr.samples;
    for (let i = 1; i < s.length; i++) {
      if (s[i].p.y > apex) apex = s[i].p.y;
      if (netY === null && (s[i - 1].p.x * s[i].p.x) <= 0 && s[i - 1].p.x !== s[i].p.x) {
        const f = (0 - s[i - 1].p.x) / (s[i].p.x - s[i - 1].p.x);
        netY = { y: s[i - 1].p.y + f * (s[i].p.y - s[i - 1].p.y), z: s[i - 1].p.z + f * (s[i].p.z - s[i - 1].p.z), t: s[i - 1].t + f * (s[i].t - s[i - 1].t) };
      }
      if (floor && s[i].t > floor.t + 0.05) break;
    }
    return { floor: floor, blocked: blocked && !floor ? blocked : (blocked && blocked.t < floor.t ? blocked : null), netY: netY, apex: apex };
  }

  function spinVec(def, dir, scale) {
    // dir: unit horizontal travel direction {x,z}
    const sc = scale === undefined ? 1 : scale;
    const topAxis = { x: dir.z * 0 - 0, y: 0, z: 0 };
    // up x d = (-d.z... ) computed explicitly: up=(0,1,0): up x d = (d.z, 0, -d.x)
    const ux = dir.z, uz = -dir.x;
    const net = (def.top - def.back) * sc; // + topspin
    const w = { x: ux * net, y: def.side * sc, z: uz * net };
    return w;
  }

  function levelOf(a) { return U.clamp((a - 30) / 65, 0.05, 1); }

  const S = HPO.mod.shots = {
    SHOTS: SHOTS,
    // ---- nominal (error-free) solve; returns launch + diagnostics ----
    nominal(p, kind, target, opts) {
      opts = opts || {};
      const def = SHOTS[kind];
      const dx = target.x - p.x, dz = target.z - p.z;
      const D = Math.hypot(dx, dz) || 0.01;
      const dir0 = { x: dx / D, z: dz / D };
      const eff = U.clamp(opts.effort === undefined ? 0.5 : opts.effort, 0, 1);
      let speedBase = U.lerp(def.speed[0], def.speed[1], eff);
      let phi = Math.atan2(dz, dx);
      let tries = 0, best = null, boost = 0, boosts = 0;
      while (tries < 4) {
        let s = speedBase * (tries === 0 ? 1 : Math.pow(0.88, tries));
        if (boost) s = Math.min(speedBase * boost, def.speed[1] * 1.3);
        const an = analyticAngle(s, D * 1.04, p.y, def.root);
        let th = an.th;
        let res = null, f0 = null, th0 = null;
        let thCur = th;
        for (let it = 0; it < 6; it++) {
          const dir = { x: Math.cos(phi), z: Math.sin(phi) };
          const v = { x: s * Math.cos(thCur) * dir.x, y: s * Math.sin(thCur), z: s * Math.cos(thCur) * dir.z };
          const w = spinVec(def, dir, opts.spinScale);
          res = dryRun(p, v, w, Math.min(3.6, 2.2 * (D / Math.max(s * Math.cos(thCur), 3)) + 1.2));
          if (!res.floor) { res.err = 99; break; }
          const lx = res.floor.p.x - p.x, lz = res.floor.p.z - p.z;
          const along = lx * dir0.x + lz * dir0.z, perp = -lx * dir0.z + lz * dir0.x;
          const f = along - D;
          res.err = Math.hypot(f, perp);
          res.f = f; res.perp = perp;
          if (Math.abs(f) < 0.12 && Math.abs(perp) < 0.12) break;
          // correct azimuth for lateral error (sidespin/drag), elevation by secant
          phi -= Math.atan2(perp, D) * 0.9;
          let slope;
          if (f0 !== null && Math.abs(thCur - th0) > 1e-4) slope = (f - f0) / (thCur - th0);
          else slope = (rangeNoDrag(s, thCur + 0.01, p.y) - rangeNoDrag(s, thCur, p.y)) / 0.01;
          if (!isFinite(slope) || Math.abs(slope) < 1) slope = def.root === 'high' ? -30 : 30;
          f0 = f; th0 = thCur;
          thCur = thCur - f / slope;
          thCur = U.clamp(thCur, def.root === 'high' ? 38 * D2R : -50 * D2R, def.root === 'high' ? 82 * D2R : 50 * D2R);
        }
        res.th = thCur; res.phi = phi; res.s = s;
        best = res;
        const clear = res.netY ? res.netY.y - R - HPO.mod.court.netHeight(res.netY.z) : 0;
        res.clear = clear;
        // fell short even at the best angle: hit it harder (lobs from deep need this)
        if (res.floor && res.f < -0.6 && boosts < 3 && s < def.speed[1] * 1.3) { boosts++; boost = (boost || speedBase) * 1.12; continue; }
        const needNet = (p.x * target.x) < 0; // crossing the net
        if (!needNet || clear >= (opts.netMargin === undefined ? 0.12 : opts.netMargin) || res.err > 90) { if (res.err <= 90 || tries >= 3) break; }
        tries++;
      }
      const dir = { x: Math.cos(best.phi), z: Math.sin(best.phi) };
      const v = { x: best.s * Math.cos(best.th) * dir.x, y: best.s * Math.sin(best.th), z: best.s * Math.cos(best.th) * dir.z };
      const w = spinVec(def, dir, opts.spinScale);
      const crosses = (p.x * target.x) < 0;
      const feasible = !!best.floor && best.err < 0.6 && (!crosses || best.clear > 0.02);
      return {
        v: v, w: w, th: best.th, phi: best.phi, speed: best.s, kind: kind, feasible: feasible,
        land: best.floor ? { x: best.floor.p.x, z: best.floor.p.z, t: best.floor.t } : null,
        err: best.err, clear: best.clear === undefined ? 0 : best.clear, apex: best.apex, dir: dir
      };
    },

    // ---- execution error applied to a nominal solution ----
    // ctx: {accuracy 0..100, difficulty 0..1, pressure 0..1, fatigue 0..1, confidence 0..1, stretch 0..1}
    execute(nom, ctx) {
      const rg = HPO.streams.exec;
      const k = S.sigmaK(ctx);
      const hi = SHOTS[nom.kind].root === 'high' ? 0.55 : 1; // lobs: elevation is forgiving, pace carries the error
      const sPhi = 1.0 * k * (HPO.cfg.TUNE.errPhi || 1), sTh = 0.75 * k * hi * (HPO.cfg.TUNE.errTh || 1), sS = (HPO.cfg.TUNE.errSpeed || 0.012) * k;
      const dphi = rg.normal(0, sPhi) * D2R, dth = rg.normal(0, sTh) * D2R, ds = 1 + rg.normal(0, sS);
      const phi = nom.phi + dphi, th = nom.th + dth, s = nom.speed * ds;
      const dir = { x: Math.cos(phi), z: Math.sin(phi) };
      const v = { x: s * Math.cos(th) * dir.x, y: s * Math.sin(th), z: s * Math.cos(th) * dir.z };
      const def = SHOTS[nom.kind];
      const w = { x: nom.w.x, y: nom.w.y, z: nom.w.z };
      const mag = Math.abs(dphi) / D2R / Math.max(sPhi, 0.01) + Math.abs(dth) / D2R / Math.max(sTh, 0.01);
      return { v: v, w: w, kind: nom.kind, quality: U.clamp(1 - mag / 6, 0, 1), sigma: k, nominal: nom };
    },

    // error scale shared by the execution model and by the AI's aim-margin estimate
    sigmaK(ctx) {
      const acc = levelOf(ctx.accuracy === undefined ? 70 : ctx.accuracy);
      return (1.55 - 1.1 * acc) *
        (1 + 1.0 * (ctx.difficulty || 0)) * (1 + (HPO.cfg.TUNE.pressK || 1.0) * (ctx.pressure || 0)) *
        (1 + 0.5 * (ctx.fatigue || 0)) * (1 + 0.4 * (1 - (ctx.confidence === undefined ? 0.5 : ctx.confidence))) *
        (1 + (HPO.cfg.TUNE.stretchK || 1.6) * (ctx.stretch || 0)) * (ctx.errMul || 1); // errMul: QTE swipe quality (docs/QTE.md)
    },
    // fast estimate for AI (no integration): difficulty 0..1 for kind at contact height / ball speed
    difficulty(kind, hitY, ballSpeed, stretch) {
      const def = SHOTS[kind];
      let d = def.diff;
      const lo = def.h[0], hi = def.h[1];
      if (hitY < lo) d += 0.5 * (lo - hitY);
      if (hitY > hi) d += 0.5 * (hitY - hi);
      d += 0.018 * Math.max(0, (ballSpeed || 0) - 12);
      d += 0.5 * (stretch || 0);
      return U.clamp(d, 0.05, 1);
    },
    heightFit(kind, hitY) {
      const h = SHOTS[kind].h;
      if (hitY >= h[0] && hitY <= h[1]) return 1;
      return Math.max(0, 1 - 1.5 * Math.min(Math.abs(hitY - h[0]), Math.abs(hitY - h[1])));
    },
    // sampled path + contacts of a nominal launch, for the AI to judge where a shot leaves the other pair
    trace(p, nom, maxT) { return HPO.mod.ball.predict(launchState(p, nom.v, nom.w), maxT || 3, 30); },
    spinVec: spinVec
  };
})(HPO);
