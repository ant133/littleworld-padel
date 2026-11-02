// Doubles AI: formations, partner coordination (claim tokens), strike choice, weighted shot selection + aim.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, CFG = HPO.cfg;
  const lvl = a => U.clamp((a - 30) / 65, 0.02, 1);
  const rgn = () => HPO.streams.ai;

  // tunable weights (cfg.TUNE.ai can override)
  const T = CFG.TUNE.ai = Object.assign({ sharp: 0.6, smashDepthMax: 7.0, lobBase: 0.8, aimNoise: 1.0, riskMargin: 1.0, volleyWilling: 1.0 }, CFG.TUNE.ai || {});

  const PRESETS = {
    balanced: {}, aggressive: { smash: 1.4, vibora: 1.4, flat: 1.25, lob: 0.7, risk: 0.7 }, safe: { smash: 0.6, vibora: 0.6, lob: 1.3, slice: 1.3, risk: 1.5, flat: 0.8 },
    controlNet: { bandeja: 1.4, volley: 1.25, chiquita: 1.2, lob: 0.85, netBias: 1 }, defensive: { lob: 2.0, wallDef: 1.4, smash: 0.7, risk: 1.3, netBias: -1 },
    targetMiddle: { middle: 1 }, targetGlass: { glass: 1 }, rushNet: { netBias: 2, volley: 1.15 }, focusOne: { focus: 1 }, moreChiquitas: { chiquita: 2.6 }, moreSmashes: { smash: 2.2 }
  };

  const teams = {
    A: { formation: 'neutral', since: 0, claim: null, claimAt: 0, orders: { preset: 'balanced' }, aim: null, last: null },
    B: { formation: 'neutral', since: 0, claim: null, claimAt: 0, orders: { preset: 'balanced' }, aim: null, last: null }
  };
  let now = 0, assignAt = { A: -9, B: -9 };
  let lastShot = null; // {team, kind, quality, hitterDepth}

  const LOB = { lobDef: 1, lobOff: 1 }, SOFT = { chiquita: 1, dejada: 1 }, SMASH = { smashFlat: 1, smashKick: 1 };

  function opp(team) { return team === 'A' ? 'B' : 'A'; }
  function depthOf(team, x) { return Math.abs(x); } // distance from the net plane
  function pr(id) { return HPO.mod.players.byId[id]; }
  function mods(team) { return Object.assign({ smash: 1, vibora: 1, flat: 1, lob: 1, slice: 1, bandeja: 1, volley: 1, chiquita: 1, wallDef: 1, risk: 1, netBias: 0 }, PRESETS[teams[team].orders.preset] || {}); }

  const AI = HPO.mod.ai = {
    teams: teams, PRESETS: PRESETS,
    setOrders(team, orders) {
      teams[team].orders = Object.assign({}, teams[team].orders, orders);
      BUS.emit('coach:change', { team: team, orders: teams[team].orders });
    },
    orders(team) { return teams[team].orders; },
    setAim(team, x, z, ttl) { teams[team].orders.aimPoint = { x: x, z: z, expires: now + (ttl || 12) }; },
    reset() { now = 0; assignAt.A = assignAt.B = -9; ['A', 'B'].forEach(t => { teams[t].formation = 'neutral'; teams[t].since = 0; teams[t].claim = null; teams[t].aim = null; }); lastShot = null; },

    formation(team) { return teams[team].formation; },

    // --- main tick (called every sim step during live play, and between points for resets) ---
    update(dt, live) {
      now += dt;
      if (!live) return;
      ['A', 'B'].forEach(function (t) { tickTeam(t, dt); });
    },

    // positions for the serve: returns map of playerId -> {x,z} for everyone but the server (who is driven by serveSequence)
    servePositions(servingTeam, serverId, side, receiverId) {
      const P = HPO.mod.players, out = {};
      const rec = opp(servingTeam);
      const sx = HPO.court.sides[servingTeam], rx = HPO.court.sides[rec];
      const rs = HPO.court.rightSign(servingTeam);
      const sgn = side === 'ad' ? -1 : 1;
      const server = P.byId[serverId], partner = P.other(server);
      const lane = rs * sgn;
      out[partner.id] = { x: sx * 2.6, z: -lane * 2.1 };
      const box = HPO.court.serviceBox(servingTeam, side);
      const bz = (box.z[0] + box.z[1]) / 2;
      const rcv = (receiverId && P.byId[receiverId]) || chooseReceiver(rec, bz);
      const rp = P.other(rcv);
      out[rcv.id] = { x: rx * 8.0, z: bz > 0 ? 2.4 : -2.4 };
      out[rp.id] = { x: rx * 2.6, z: bz > 0 ? -2.0 : 2.0 };
      return { map: out, receiver: rcv.id };
    },

    // --- choose among strike candidates (volley vs let it bounce vs after the glass) ---
    chooseStrike(p, cands) {
      const t = teams[p.team], m = mods(p.team);
      const depth = Math.abs(p.pos.x);
      const atNet = depth < 4.2;
      let best = null, bs = -1e9;
      const rr = rgn();
      cands.forEach(function (c) {
        const y = c.p.y, d = Math.abs(c.p.x);
        let s = 0;
        s += Math.min(c.slack, 0.8) * 1.2;                         // time to set up
        s -= Math.abs(y - (atNet ? 1.35 : 1.0)) * 0.9;              // comfortable contact height
        if (c.p.y > 2.1 && d > 7) s -= 0.7;                         // overhead from the deep corner is hard
        if (c.ownBounces === 0) s += atNet ? 0.9 * T.volleyWilling * (1 + (m.netBias > 0 ? 0.3 : 0)) : -0.5; // volley when at the net
        if (c.afterWall) s += lvl(p.attrs.wallRead) * 0.6 - (atNet ? 0.5 : 0);   // wall specialists let it come back
        if (c.ownBounces === 0 && c.dt < 0.25) s -= 0.5;              // too rushed
        if (d < 1.0) s -= 0.6;                                       // too close to net / body in the net
        if (c.reach > 0.9) s -= (c.reach - 0.9) * 1.5;
        s += rr.range(-0.1, 0.1);
        if (s > bs) { bs = s; best = c; }
      });
      return best;
    },

    warmup: false,
    // cooperative warm-up shot: easy pace, aimed at the opponent's comfortable zone
    warmupShot(p, info) {
      const rr = rgn(), ox = -HPO.court.sides[p.team], depth = Math.abs(p.pos.x), h = info.height;
      let kind = h >= 1.85 ? 'bandeja' : (depth < 4.5 && h > 0.5 ? (info.fh ? 'volleyFH' : 'volleyBH') : rr.pick(['flatGround', 'topGround', 'slice', 'slice', 'topGround']));
      if (depth > 6.5 && h < 1.2 && rr.chance(0.18)) kind = 'lobDef';
      const tx = ox * (kind === 'lobDef' ? 7.2 : rr.range(5.0, 7.0)), tz = U.clamp(-p.pos.z * 0.4 + rr.range(-1.2, 1.2), -2.6, 2.6);
      return { kind: kind, target: { x: tx, z: tz }, effort: 0.25, intent: 'warmup', reason: 'warmup', warm: true, netMargin: 0.3 };
    },
    // --- pick the shot at the moment of commitment ---
    decideShot(p, info) {
      if (AI.warmup) return AI.warmupShot(p, info);
      const S = HPO.mod.shots, P = HPO.mod.players;
      const team = p.team, m = mods(team), tm = teams[team];
      const ox = -HPO.court.sides[team];                 // sign of opponent half
      const ops = P.team(opp(team));
      const depth = Math.abs(p.pos.x), h = info.height;
      const oppNet = ops.filter(q => Math.abs(q.pos.x) < 4.0).length;
      const press = U.clamp(1 - info.slack / 0.45, 0, 1);
      const sc = scoreState();
      const w = {};
      const high = h >= 1.85, low = h < 0.95;
      const near = depth < 4.5, mid = depth >= 4.5 && depth < 6.5, deep = depth >= 6.5;

      if (high) {
        const okSmash = (depth <= T.smashDepthMax && h >= 2.05) ? 1 : 0.03;
        w.smashFlat = 1.5 * okSmash * m.smash; w.smashKick = 0.8 * okSmash * m.smash;
        w.bandeja = 2.6 * m.bandeja * (deep ? 1.1 : 1); w.vibora = 1.5 * m.vibora * (near ? 1.2 : 0.7);
        w.lobOff = deep ? 1.0 * m.lob : 0.35 * m.lob;
        if (info.afterWall && deep) w.bajada = 1.2;
      } else if (near && !low) {
        w.volleyFH = w.volleyBH = 3.0 * m.volley;
        w.chiquita = (h < 1.15 ? 1.1 : 0.4) * m.chiquita;
        w.dejada = 0.5 * (ops.every(q => Math.abs(q.pos.x) > 5.5) ? 2 : 0.3);
        w.lobOff = 0.35 * m.lob * (oppNet >= 1 ? 1.4 : 0.6);
      } else if (near && low) {
        w.chiquita = 2.6 * m.chiquita; w.volleyFH = w.volleyBH = 1.4 * m.volley; w.lobDef = 1.0 * m.lob;
      } else {
        w.flatGround = 1.0 * m.flat; w.topGround = 1.7; w.slice = 1.3 * m.slice;
        w.lobDef = (T.lobBase + 1.1 * oppNet + 1.3 * press) * m.lob;
        w.lobOff = 0.5 * m.lob * (oppNet ? 1.2 : 0.4);
        w.chiquita = (oppNet >= 1 && h < 1.15 && mid) ? 1.0 * m.chiquita : 0.0;
        if (info.afterWall && h > 0.85 && deep) w.bajada = 2.0;
        if (info.afterWall && press > 0.5) w.wallDef = 1.8 * m.wallDef;
        if (info.walls >= 2 && info.slack > 0.12) w.counterDW = 1.3;
        if (mid && h > 0.6) w.volleyFH = w.volleyBH = 0.8 * m.volley;
      }
      if (oppNet >= 2) { if (w.flatGround) w.flatGround *= 0.55; if (w.topGround) w.topGround *= 0.7; }
      if (w.volleyFH !== undefined) { if (info.fh) w.volleyBH = 0; else w.volleyFH = 0; }

      // archetype + attributes + difficulty vs pressure
      const arch = p.def.archetype;
      Object.keys(w).forEach(function (k) {
        let x = w[k];
        if (!(x > 0)) { w[k] = 0; return; }
        if (arch === 'netAttacker') { if (k.indexOf('volley') === 0) x *= 1.3; if (k === 'vibora') x *= 1.4; if (k === 'bandeja') x *= 1.1; }
        if (arch === 'wallSpecialist') { if (k === 'lobDef' || k === 'wallDef') x *= 1.35; if (k === 'bajada') x *= 1.2; if (k === 'slice') x *= 1.2; }
        if (arch === 'smasher') { if (SMASH[k]) x *= 1.6; if (k === 'vibora') x *= 1.25; }
        if (arch === 'precision') { if (SOFT[k]) x *= 1.4; if (k === 'bandeja') x *= 1.15; }
        if (arch === 'counterpuncher') { if (k === 'counterDW') x *= 1.6; if (LOB[k]) x *= 1.2; }
        const diff = S.difficulty(k, h, info.ballSpeed, 0);
        x *= S.heightFit(k, h) + 0.02;
        x *= (1 - U.clamp(diff - 0.3 * lvl(p.attrs.accuracy), 0, 1) * (0.5 + press * 0.5));
        if (SMASH[k] && sc.pressure > 0.6) x *= 0.85;
        w[k] = Math.pow(Math.max(x, 0), 1 + T.sharp * lvl(p.attrs.tactics));
      });
      const kinds = Object.keys(w).filter(k => w[k] > 0);
      let kind;
      if (!kinds.length) kind = 'lobDef'; else kind = rgn().weighted(kinds, k => w[k]);

      let pick = aimFor(p, kind, info, ops, oppNet, press, m, tm);
      // coach: preferred return of serve direction (only honoured on the return stroke; the solver check below still vetoes impossible shots)
      const rd = tm.orders.returnDir;
      if (rd && rd !== 'auto' && HPO.mod.ball.state.hitsSinceServe === 1) {
        const side = p.pos.z >= 0 ? 1 : -1;
        if (rd === 'lob') pick = aimFor(p, 'lobDef', info, ops, oppNet, press, m, tm);
        else if (rd === 'middle') pick.target = { x: pick.target.x, z: side * 0.4 };
        else if (rd === 'line') pick.target = { x: pick.target.x, z: side * 2.8 };
        else if (rd === 'crosscourt') pick.target = { x: pick.target.x, z: -side * 2.8 };
        pick.reason = 'coach-return';
      }
      // screen: if the solver can't hit this, fall back to something that can
      const S2 = HPO.mod.shots;
      let nom = S2.nominal(info.p, pick.kind, pick.target, { effort: pick.effort, netMargin: pick.netMargin });
      if (!nom.feasible) {
        const fb = high && depth > 5 ? ['bandeja', 'lobOff'] : (near ? ['volley', 'chiquita', 'lobDef'] : ['lobDef', 'slice', 'flatGround']);
        for (let i = 0; i < fb.length; i++) {
          let k = fb[i]; if (k === 'volley') k = info.fh ? 'volleyFH' : 'volleyBH';
          const alt = aimFor(p, k, info, ops, oppNet, press, m, tm);
          const n2 = S2.nominal(info.p, alt.kind, alt.target, { effort: alt.effort });
          if (n2.feasible) { pick = alt; break; }
        }
      }
      tm.aim = null;
      return pick;
    }
  };

  function scoreState() {
    const R = HPO.mod.rules;
    let pressure = 0;
    try { if (R && R.state && R.state.flags) { const f = R.state.flags; if (f.matchPoint || f.setPoint || f.breakPoint || R.state.goldenPoint) pressure = 0.7; } } catch (e) { /* ignore */ }
    return { pressure: pressure };
  }

  function chooseReceiver(recTeam, boxZ) {
    const P = HPO.mod.players, ps = P.team(recTeam);
    const rs = HPO.court.rightSign(recTeam);
    // a receiver's natural side is where the ball lands relative to their own right/left
    const wantRight = (boxZ * rs) > 0;
    let best = ps[0], bs = -9;
    ps.forEach(function (q) {
      let s = 0;
      if (q.def.side === 'drive') s += wantRight ? 1 : -1; else if (q.def.side === 'reves') s += wantRight ? -1 : 1;
      s += lvl(q.attrs.defense) * 0.3 - q.fatigue; s += rgn().range(0, 0.05);
      if (s > bs) { bs = s; best = q; }
    });
    return best;
  }

  // ---- aim selection ----
  function aimFor(p, kind, info, ops, oppNet, press, m, tm) {
    const S = HPO.mod.shots, ox = -HPO.court.sides[p.team];
    const acc = lvl(p.attrs.accuracy);
    // aim inside the lines by a multiple of the error this stroke is likely to carry (smart players size the margin to the difficulty)
    const kEst = S.sigmaK(HPO.mod.players.execCtx(p, S.difficulty(kind, info.height, info.ballSpeed, 0), press, 0.1));
    const dist = Math.hypot(info.p.x - ox * 6, info.p.z) * 1.0 + 4;
    const sigLat = dist * Math.tan(kEst * (HPO.cfg.TUNE.errPhi || 1) * Math.PI / 180);
    const wise = 0.6 + 0.6 * lvl(p.attrs.tactics);
    const marginD = U.clamp(0.4 + 0.35 * (m.risk - 1) + wise * T.riskMargin * 1.2 * sigLat, 0.6, 2.4);
    const marginZ = U.clamp(0.3 + 0.25 * (m.risk - 1) + wise * T.riskMargin * 1.0 * sigLat, 0.45, 2.0);
    const rr = rgn();
    const cands = [];
    const clampT = t => ({ x: U.clamp(t.x, ox * 0, ox * 99), z: t.z });
    const addAim = (dx, z, tag) => cands.push({ x: ox * dx, z: U.clamp(z, -5 + marginZ, 5 - marginZ), tag: tag });
    const weak = ops.slice().sort((a, b) => weakness(b) - weakness(a))[0];
    let kindDepth;
    const effortBase = 0.35 + 0.3 * (m.flat - 0.8) + 0.2 * lvl(p.attrs.power);
    let effort = U.clamp(effortBase, 0.2, 0.9);
    effort = U.clamp(effort + 0.25 * (lvl(p.attrs.power) - 0.5), 0.15, 0.95); // power buys pace

    if (LOB[kind] || kind === 'wallDef') {
      const d = 10 - marginD - (kind === 'lobOff' ? 1.2 : 1.7);
      [-3, -1.2, 1.2, 3].forEach(z => addAim(d, z + rr.range(-0.4, 0.4), 'lob'));
      effort = kind === 'lobOff' ? 0.5 : 0.35;
    } else if (SMASH[kind]) {
      const sk = kind === 'smashKick';
      [[3.2, -3.4], [3.2, 3.4], [5.5, 0], [4.5, -2.2], [4.5, 2.2]].forEach(a => addAim(a[0], a[1], 'smash'));
      if (sk) { addAim(5.2, -5 + marginZ, 'glass'); addAim(5.2, 5 - marginZ, 'glass'); }
      effort = 0.75 + 0.25 * lvl(p.attrs.power);
    } else if (kind === 'chiquita') {
      ops.filter(q => Math.abs(q.pos.x) < 4.5).forEach(q => addAim(2.4 + rr.range(0, 0.8), q.pos.z + rr.range(-0.6, 0.6), 'feet'));
      addAim(2.6, -1.8, 'feet'); addAim(2.6, 1.8, 'feet'); addAim(3.0, 0, 'mid');
      effort = 0.4;
    } else if (kind === 'dejada') {
      addAim(1.7, -2.2, 'drop'); addAim(1.7, 2.2, 'drop'); addAim(2.0, 0, 'drop');
      effort = 0.3;
    } else if (kind === 'bandeja') {
      addAim(10 - marginD - 1.0, -2.4, 'deep'); addAim(10 - marginD - 1.0, 2.4, 'deep'); addAim(10 - marginD - 1.4, 0, 'deepmid');
      effort = 0.45;
    } else if (kind === 'vibora') {
      addAim(9 - marginD, -4.2 + 0.2, 'wallside'); addAim(9 - marginD, 4.2 - 0.2, 'wallside'); addAim(6.5, -3, 'wide'); addAim(6.5, 3, 'wide');
      effort = 0.6;
    } else if (kind === 'bajada') {
      addAim(6.0, -3.2, 'angle'); addAim(6.0, 3.2, 'angle'); addAim(7.5, 0, 'mid'); addAim(8, -2, 'deep'); addAim(8, 2, 'deep');
      effort = 0.6;
    } else if (kind.indexOf('volley') === 0) {
      [[6.5, -3.0], [6.5, 3.0], [8.5, -1.8], [8.5, 1.8], [5.0, 0]].forEach(a => addAim(a[0] - marginD * 0.4, a[1], 'volley'));
      effort = 0.5;
    } else { // ground strokes, slice, counterattack
      const dd = 10 - marginD - 1.2;
      [[dd, -3.2, 'cross'], [dd, 3.2, 'cross'], [dd, 0, 'mid'], [dd - 1.5, -2, 'line'], [dd - 1.5, 2, 'line'], [5.5, 0, 'short']].forEach(a => addAim(a[0], a[1], a[2]));
      effort = U.clamp(effortBase + (kind === 'counterDW' ? 0.2 : 0), 0.25, 0.95);
    }

    // score aim points
    let best = cands[0], bs = -1e9;
    const aimOrder = tm.orders.aimPoint && tm.orders.aimPoint.expires > now ? tm.orders.aimPoint : null;
    cands.forEach(function (c) {
      let s = 0;
      let dmin = 99; ops.forEach(q => { dmin = Math.min(dmin, Math.hypot(q.pos.x - c.x, q.pos.z - c.z)); });
      s += Math.min(dmin, 5) * (c.tag === 'feet' ? -0.2 : 0.5);
      if (c.tag === 'feet') s += 1.0;
      if (weak) { const dw = Math.hypot(weak.pos.x - c.x, weak.pos.z - c.z); s += (tm.orders.preset === 'focusOne' || tm.orders.focusOpponent !== undefined) ? Math.max(0, 3 - dw) * 0.8 : Math.max(0, 3 - dw) * 0.25 * weakness(weak); }
      if (m.middle) s += (1.5 - Math.abs(c.z)) * 0.8;
      if (m.glass && (c.tag === 'glass' || c.tag === 'wallside' || Math.abs(c.z) > 2.8)) s += 1.2;
      s -= Math.abs(c.z) > 5 - marginZ ? 1 : 0;
      s += rr.range(-1, 1) * T.aimNoise * (1.2 - lvl(p.attrs.tactics));
      if (aimOrder) s -= Math.hypot(aimOrder.x - c.x, aimOrder.z - c.z) * 0.9;
      if (s > bs) { bs = s; best = c; }
    });
    let target = { x: best.x, z: best.z };
    if (aimOrder) { // coach click: honoured only if the shot can really go there
      const nomO = S.nominal(info.p, kind, { x: aimOrder.x, z: aimOrder.z }, { effort: effort });
      if (nomO.feasible && S.difficulty(kind, info.height, info.ballSpeed, 0) < 0.85) { target = { x: aimOrder.x, z: aimOrder.z }; tm.orders.aimPoint = null; }
    }
    const intent = LOB[kind] || kind === 'wallDef' ? 'defend' : (SMASH[kind] || kind === 'vibora' ? 'attack' : (SOFT[kind] ? 'finesse' : 'rally'));
    return { kind: kind, target: target, effort: effort, intent: intent, reason: best.tag, netMargin: U.clamp(0.10 + 0.05 * kEst, 0.1, 0.45) };
  }

  function weakness(q) { return (1 - lvl(q.attrs.defense)) * 0.6 + q.fatigue * 0.5 + (1 - q.confidence) * 0.2; }

  // ---- team tick ----
  function tickTeam(team, dt) {
    const P = HPO.mod.players, B = HPO.mod.ball.state, tm = teams[team];
    const ps = P.team(team); if (ps.length < 2) return;
    const sx = HPO.court.sides[team];
    updateFormation(team);

    const incoming = B.state === 'live' && B.lastHitTeam !== team && B.lastHitTeam !== null;
    let roles = null;
    if (incoming) {
      if (now - assignAt[team] > 0.08) { assignAt[team] = now; roles = pickInterceptor(team, ps.filter(q => !q.scripted).length ? ps.filter(q => !q.scripted) : ps); tm.roles = roles; }
      roles = tm.roles;
    } else { tm.claim = null; tm.roles = null; }

    const pos = formationPositions(team, ps, roles);
    ps.forEach(function (p) {
      if (p.scripted) return;                                   // out-of-court retriever etc. are driven by the match flow
      if (roles && p === roles.interceptor) { p.intent = roles.cands ? { type: 'intercept' } : { type: 'move', x: roles.chase.x, z: roles.chase.z, cap: 1 }; }
      else {
        const t = pos[p.id];
        const arrive = tm.formation === 'attack' ? 0.9 : 0.8;
        p.intent = { type: 'move', x: t.x, z: t.z, cap: arrive };
      }
    });
  }

  function pickInterceptor(team, ps) {
    const tm = teams[team];
    const B = HPO.mod.ball.state;
    const P = HPO.mod.players;
    const res = ps.map(function (p) {
      const c = P.candidates(p);
      return { p: p, c: c, first: c.length ? c[0] : null };
    });
    const bz = B.p.z;
    let best = null, bs = -1e9;
    res.forEach(function (r) {
      let s;
      if (r.first) {
        s = 3 - r.first.dt * 1.0 + Math.min(r.first.slack, 0.6);
        s += (tm.claim === r.p.id ? 0.35 : 0);
        // dominance: forehand side players take balls on their forehand
        const rv = P.rightVec(team);
        const lat = (r.first.p.x - r.p.pos.x) * rv.x + (r.first.p.z - r.p.pos.z) * rv.z;
        s += (r.p.hand === 'R' ? lat > 0 : lat < 0) ? 0.1 : 0;
        s += lvl(r.p.attrs.coverage) * 0.1;
        // middle balls: coach priority, else better wall reader/defender
        if (Math.abs(r.first.p.z) < 1.1) {
          const mp = tm.orders.middlePriority;
          if (mp !== undefined && P.team(team)[mp] === r.p) s += 0.35;
          else s += lvl(r.p.attrs.tactics) * 0.08;
        }
        // the designated receiver owns the return of serve
        if (B.hitsSinceServe === 1 && HPO.mod.rules && HPO.mod.rules.expectedReceiver && HPO.mod.rules.expectedReceiver() === r.p.id) s += 1.5;
        // a high ball over the net player is taken by the back player
        if (B.v.y > -1 && B.p.y > 3 && Math.abs(r.p.pos.x) < Math.abs(r.first.p.x) - 3) s -= 0.4;
      } else {
        // can't reach anything: nearest to where the ball ends up chases it
        const e = ballEnd();
        s = -10 - Math.hypot(r.p.pos.x - e.x, r.p.pos.z - e.z) * 0.2;
      }
      if (s > bs) { bs = s; best = r; }
    });
    tm.claim = best.p.id;
    const e = ballEnd(); const sx = HPO.court.sides[team];
    return { interceptor: best.p, supporter: ps.find(q => q !== best.p), cands: best.first ? best.c : null, chase: { x: U.clamp(e.x, sx < 0 ? -9.4 : 0.8, sx < 0 ? -0.8 : 9.4), z: U.clamp(e.z, -4.4, 4.4) } };
  }
  function ballEnd() {
    const pr = HPO.mod.ball.predict(null, 3, 20);
    const s = pr.samples; return s.length ? s[s.length - 1].p : HPO.mod.ball.state.p;
  }

  // ---- formations ----
  const BASE = { attack: [2.2, 2.2], neutral: [2.8, 5.6], defend: [7.0, 7.0] };

  function updateFormation(team) {
    const tm = teams[team], B = HPO.mod.ball.state, m = mods(team);
    if (B.state !== 'live') return;
    const sx = HPO.court.sides[team];
    let want = tm.formation;
    const ls = lastShot;
    if (ls) {
      if (ls.team !== team) {
        // reacting to the opponent's shot
        if (LOB[ls.kind] && ls.quality > 0.35) want = 'defend';
        else if (SMASH[ls.kind] || ls.kind === 'vibora') want = 'defend';
        else if (ls.kind === 'bandeja') want = 'neutral';
        else if (ls.quality < 0.45 && Math.abs(B.p.x) < 6) want = 'attack'; // weak reply: step up
        else if (SOFT[ls.kind]) want = 'neutral';
        else want = ls.fast ? 'neutral' : tm.formation === 'defend' ? 'neutral' : tm.formation;
      } else {
        // after my own shot
        if (LOB[ls.kind]) want = ls.kind === 'lobDef' ? 'neutral' : 'attack';
        else if (SOFT[ls.kind] || ls.kind.indexOf('volley') === 0 || SMASH[ls.kind] || ls.kind === 'bandeja' || ls.kind === 'vibora') want = 'attack';
        else if (ls.kind === 'wallDef' || ls.kind === 'bajada') want = 'neutral';
        else want = ls.hitterDepth > 5.5 ? 'neutral' : tm.formation;
      }
    }
    if (m.netBias > 0 && want === 'neutral') want = 'attack';
    if (m.netBias < 0 && want === 'attack') want = 'neutral';
    const urgent = want === 'defend' && tm.formation !== 'defend';
    if (want !== tm.formation && (urgent || now - tm.since > 1.2)) {
      tm.formation = want; tm.since = now; BUS.emit('ai:formation', { team: team, formation: want });
    }
  }

  function formationPositions(team, ps, roles) {
    const tm = teams[team], sx = HPO.court.sides[team], B = HPO.mod.ball.state;
    const rs = HPO.court.rightSign(team);
    const base = BASE[tm.formation];
    const out = {};
    // who plays net in a staggered formation: the player already closer to the net keeps it (no swapping)
    const ordered = ps.slice().sort((a, b) => Math.abs(a.pos.x) - Math.abs(b.pos.x));
    // lanes: each player keeps a side (right-side player stays right) unless one is dragged away by the interceptor
    const laneOf = {};
    const ps2 = ps.slice().sort((a, b) => a.pos.z * rs - b.pos.z * rs); // left to right by their own right
    laneOf[ps2[0].id] = -1; laneOf[ps2[1].id] = 1;
    let ballZ = B.state === 'live' ? U.clamp(B.p.z, -4, 4) : 0;
    const shift = U.clamp(ballZ * 0.3, -1.1, 1.1);
    ordered.forEach(function (p, i) {
      const lane = laneOf[p.id];
      let depth = base[i];
      let z = rs * lane * (tm.formation === 'defend' ? 1.9 : tm.formation === 'attack' ? 1.7 : 1.6) + shift;
      // cover the lane vacated by a partner who is chasing wide
      if (roles && roles.interceptor !== p) {
        const it = roles.interceptor, itLane = laneOf[it.id];
        const away = (it.pos.z - rs * itLane * 1.6);
        z -= U.clamp(away * 0.25, -0.8, 0.8);
      }
      out[p.id] = { x: sx * depth, z: U.clamp(z, -4.1, 4.1) };
    });
    return out;
  }

  // ---- event feed ----
  BUS.on('shot:hit', function (e) {
    const p = pr(e.playerId); if (!p) return;
    lastShot = { team: p.team, kind: e.shot, quality: e.quality, hitterDepth: Math.abs(e.p.x), fast: U.len3(e.v) > 20 };
  });
  BUS.on('point:start', function () { lastShot = null; ['A', 'B'].forEach(t => { teams[t].formation = 'neutral'; teams[t].since = now; teams[t].claim = null; }); });
})(HPO);
