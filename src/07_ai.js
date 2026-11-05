// Doubles AI: formations, partner coordination (claim tokens), strike choice, weighted shot selection + aim.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, CFG = HPO.cfg;
  const lvl = a => U.clamp((a - 30) / 65, 0.02, 1);
  const rgn = () => HPO.streams.ai;

  // tunable weights (cfg.TUNE.ai can override)
  const T = CFG.TUNE.ai = Object.assign({ sharp: 0.6, smashDepthMax: 9.8, lobBase: 0.0, aimNoise: 1.0, riskMargin: 1.0, volleyWilling: 1.0, duelCalm: 1.1, smashWilling: 0.32, dropBack: 1, smashAim: 0.6, netSafe: 2.0, resetCalm: 1.2, depthSafe: 1.0, lobTire: 0.45, lobNet: 1.5, smashNearBoost: 1.65, bandejaNear: 0.3, bandejaDeep: 1.2, gamble: 0.6, retreatCost: 0.03, viboraNear: 1.9 }, CFG.TUNE.ai || {});

  const PRESETS = {
    balanced: {}, aggressive: { smash: 1.4, vibora: 1.4, flat: 1.25, lob: 0.7, risk: 0.7 }, safe: { smash: 0.6, vibora: 0.6, lob: 1.3, slice: 1.3, risk: 1.5, flat: 0.8 },
    controlNet: { bandeja: 1.4, volley: 1.25, chiquita: 1.2, lob: 0.85, netBias: 1 }, defensive: { lob: 2.0, wallDef: 1.4, smash: 0.7, risk: 1.3, netBias: -1 },
    targetMiddle: { middle: 1 }, targetGlass: { glass: 1 }, rushNet: { netBias: 2, volley: 1.15 }, focusOne: { focus: 1 }, moreChiquitas: { chiquita: 2.6 }, moreSmashes: { smash: 3.2, lob: 0.35 }
  };

  const teams = {
    A: { formation: 'neutral', since: 0, claim: null, claimAt: 0, orders: { preset: 'balanced' }, aim: null, last: null },
    B: { formation: 'neutral', since: 0, claim: null, claimAt: 0, orders: { preset: 'balanced' }, aim: null, last: null }
  };
  let now = 0, assignAt = { A: -9, B: -9 };
  let lastShot = null; // {team, kind, quality, hitterDepth}
  let volleyRun = 0;   // strokes in a row, both teams, that were volleys
  let lobRun = 0;      // ... that were lobs

  const LOB = { lobDef: 1, lobOff: 1 }, SOFT = { chiquita: 1, dejada: 1 }, SMASH = { smashFlat: 1, smashKick: 1 };

  function opp(team) { return team === 'A' ? 'B' : 'A'; }
  function depthOf(team, x) { return Math.abs(x); } // distance from the net plane
  function pr(id) { return HPO.mod.players.byId[id]; }
  function backGlassLob(p) {
    if (!lastShot || !LOB[lastShot.kind] || lastShot.team === p.team) return false;
    const B = HPO.mod.ball, st = B.state;
    const bounced = st.touchedSinceHit.find(c => c.surf === 'floor');
    const hit = bounced ? { p: { x: bounced.x, z: bounced.z } } : B.predict(st, 5, 30).contacts.find(c => c.surf === 'floor');
    return !!hit && hit.p.x * HPO.court.sides[p.team] >= 8 && Math.abs(hit.p.x) <= 10 && Math.abs(hit.p.z) <= 5;
  }
  // Play-mode coach dock (docs/QTE.md): mindset dial, one plan, style. They compose with the Studio preset: numbers multiply, netBias adds, flags (focus, tire, glass, middle, breakNet) are set.
  const MINDSET = [
    { smash: 0.5, vibora: 0.5, lob: 1.6, wallDef: 1.3, risk: 1.5, flat: 0.7, netBias: -1 }, { smash: 0.7, vibora: 0.7, lob: 1.3, risk: 1.25, flat: 0.85 }, {},
    { smash: 1.3, vibora: 1.3, flat: 1.2, lob: 0.75, risk: 0.8, netBias: 1 }, { smash: 2, vibora: 1.6, flat: 1.4, lob: 0.5, risk: 0.6, netBias: 2 }];
  const PLANS = {
    exhaust: { focus: 1, tire: 1, lob: 1.4, slice: 1.3, chiquita: 1.3, risk: 1.1, smash: 0.8 }, hunt: { focus: 1 }, net: { netBias: 2, volley: 1.2, bandeja: 1.2 },
    breakNet: { breakNet: 1, lob: 1.5 }, glass: { glass: 1, wallDef: 1.2 }, middle: { middle: 1 }
  };
  const STYLES = { spin: { flat: 0.5, top: 1.3, slice: 1.25, vibora: 1.25 }, flat: { flat: 1.8, top: 0.7, slice: 0.7, smash: 1.1 } };
  function mods(team) {
    const o = teams[team].orders, m = { smash: 1, vibora: 1, flat: 1, top: 1, lob: 1, slice: 1, bandeja: 1, volley: 1, chiquita: 1, wallDef: 1, risk: 1, netBias: 0 };
    [PRESETS[o.preset], MINDSET[U.clamp(o.mindset | 0, -2, 2) + 2], PLANS[o.plan], STYLES[o.style]].forEach(t => {
      if (t) for (const k in t) { if (k === 'netBias') m[k] += t[k]; else if (typeof m[k] === 'number') m[k] *= t[k]; else m[k] = t[k]; }
    });
    return m;
  }

  const AI = HPO.mod.ai = {
    teams: teams, PRESETS: PRESETS,
    setOrders(team, orders) {
      teams[team].orders = Object.assign({}, teams[team].orders, orders);
      BUS.emit('coach:change', { team: team, orders: teams[team].orders });
    },
    orders(team) { return teams[team].orders; },
    setAim(team, x, z, ttl) { teams[team].orders.aimPoint = { x: x, z: z, expires: now + (ttl || 12) }; },
    reset() { volleyRun = lobRun = 0; now = 0; assignAt.A = assignAt.B = -9; ['A', 'B'].forEach(t => { teams[t].formation = 'neutral'; teams[t].since = 0; teams[t].claim = null; teams[t].aim = null; teams[t].betKey = -1; }); lastShot = null; },

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
      const server = P.byId[serverId], partner = P.other(server);
      out[partner.id] = { x: sx * 2.6, z: rs * partner.homeLane * 2.1 };   // the partner keeps their own side; the server runs back to theirs after serving
      const box = HPO.court.serviceBox(servingTeam, side);
      const bz = (box.z[0] + box.z[1]) / 2;
      const rcv = (receiverId && P.byId[receiverId]) || chooseReceiver(rec, bz);
      const rp = P.other(rcv);
      out[rcv.id] = { x: rx * 8.0, z: bz > 0 ? 2.4 : -2.4 };
      out[rp.id] = { x: rx * SERVE_BACK, z: bz > 0 ? -2.0 : 2.0 };   // both receivers start behind the service line (6.95 m)
      return { map: out, receiver: rcv.id };
    },

    // --- choose among strike candidates (volley vs let it bounce vs after the glass) ---
    chooseStrike(p, cands) {
      const t = teams[p.team], m = mods(p.team), deepLob = backGlassLob(p);
      const depth = Math.abs(p.pos.x);
      const atNet = depth < 4.2;
      let best = null, bs = -1e9;
      const rr = rgn();
      cands.forEach(function (c) {
        const y = c.p.y, d = Math.abs(c.p.x);
        let s = 0;
        s += Math.min(c.slack, 0.8) * 1.2;                         // time to set up
        s -= Math.abs(y - (atNet ? 1.35 : 1.0)) * 0.9;              // comfortable contact height
        if (y >= 2.1 && y <= 2.95) s += (deepLob ? 4.0 : 1.8) * m.smash;
        if (c.ownBounces === 0) s += atNet ? 0.9 * T.volleyWilling * (1 + (m.netBias > 0 ? 0.3 : 0)) : -0.5; // volley when at the net
        if (c.outside) s -= 2.5;                                      // only when nothing inside the glass can be reached
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
      if (info.outside || info.above) return salvageShot(p, info);
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
      const deepLob = backGlassLob(p);
      if (deepLob && h >= 2.1 && h <= 3.0) {
        const kick = aimFor(p, 'smashKick', info, ops, oppNet, press, m, tm);
        if (S.nominal(info.p, kick.kind, kick.target, { effort: kick.effort }).feasible) { tm.aim = null; kick.reason = 'back-glass-lob'; return kick; }
      }

      if (high) {
        // a smash from the back of the court is a long, flat, low-percentage ball: the bandeja and the vibora take over
        const okSmash = (depth <= T.smashDepthMax && h >= 2.05) ? (depth <= 4.8 ? 1 : depth <= 6.5 ? 0.6 : 0.22) : 0.03;
        // close to the net an overhead is a smash; the bandeja is the ball from the back
        const nearBoost = near ? T.smashNearBoost : 1;
        w.smashFlat = 3.6 * okSmash * m.smash * T.smashWilling * nearBoost; w.smashKick = 2.8 * okSmash * m.smash * T.smashWilling * nearBoost;
        w.bandeja = 2.6 * m.bandeja * (near ? T.bandejaNear : deep ? T.bandejaDeep : 1); w.vibora = 1.5 * m.vibora * (near ? 1.2 : 0.7);
        w.lobOff = deep ? 1.0 * m.lob : 0.35 * m.lob;
        if (info.afterWall && deep) w.bajada = 1.2;
      } else if (near && !low) {
        // a volley duel with the other pair at the net is a coin toss; players reset it with a lob, a drop or a ball at the feet
        // two volleys in a row and the ball is getting faster: somebody takes the pace off it
        const duel = (oppNet >= 2 ? T.duelCalm : 0) + (volleyRun >= 2 ? T.resetCalm : 0);
        w.volleyFH = w.volleyBH = 3.0 * m.volley * Math.max(0.25, 1 - 0.55 * duel * (1 - 0.5 * lvl(p.attrs.net)));
        w.chiquita = (h < 1.15 ? 1.1 : 0.4) * m.chiquita * (1 + 1.6 * duel);
        w.dejada = 0.5 * (ops.every(q => Math.abs(q.pos.x) > 5.5) ? 2 : 0.3) * (1 + 1.2 * duel);
        w.lobOff = 0.35 * m.lob * (oppNet >= 2 ? 2.0 : oppNet === 1 ? 1.4 : 0.6) * (1 + 3.0 * duel);
        if (h >= 1.5) w.vibora = T.viboraNear * m.vibora; // a chest-high ball at the net: the vibora, not just a volley
      } else if (near && low) {
        w.chiquita = 2.6 * m.chiquita; w.volleyFH = w.volleyBH = 1.4 * m.volley; w.lobDef = (0.6 + 0.5 * oppNet) * m.lob;
      } else {
        w.flatGround = 1.0 * m.flat; w.topGround = 1.7 * m.top; w.slice = 1.3 * m.slice;
        w.lobDef = (T.lobBase + T.lobNet * oppNet + 1.3 * press) * m.lob;
        w.lobOff = 0.5 * m.lob * (oppNet ? 1.2 : 0.4);
        w.chiquita = (oppNet >= 1 && h < 1.15 && mid) ? 1.0 * m.chiquita : 0.0;
        if (info.afterWall && h > 0.85 && deep) w.bajada = 2.0;
        if (info.afterWall && press > 0.5) w.wallDef = 1.8 * m.wallDef;
        if (info.walls >= 2 && info.slack > 0.12) w.counterDW = 1.3;
        if (mid && h > 0.6) w.volleyFH = w.volleyBH = 0.8 * m.volley;
      }
      Object.keys(w).forEach(k => { if (LOB[k]) w[k] *= (deepLob ? 0 : 0.55) * (m.breakNet && oppNet >= 1 ? 1.8 : 1) * Math.pow(T.lobTire, Math.max(0, lobRun - 1)); });
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
        const fb = high ? ['smashKick', 'smashFlat', 'bandeja', 'vibora'] : (near ? ['volley', 'chiquita', 'flatGround'] : ['slice', 'flatGround', 'topGround']);
        for (let i = 0; i < fb.length; i++) {
          let k = fb[i]; if (k === 'volley') k = info.fh ? 'volleyFH' : 'volleyBH';
          const alt = aimFor(p, k, info, ops, oppNet, press, m, tm);
          const n2 = S2.nominal(info.p, alt.kind, alt.target, { effort: alt.effort });
          if (n2.feasible) { pick = alt; break; }
        }
      }
      tm.aim = null;
      const qo = HPO.mod.qte && HPO.mod.qte.take ? HPO.mod.qte.take(p) : null;
      return qo ? qteShot(p, info, pick, qo, ops, oppNet, press, m, tm) : pick;
    }
  };

  // The visitor's swipe (docs/QTE.md): the stroke type comes from the ball and the gesture, the swipe supplies target, pace and error. A swipe the solver
  // cannot fly falls back to the AI's own shot; a missed swipe is a mishit (the AI's shot, soft and sloppy).
  function qteKinds(o, info, p) {
    if (o.gesture) return { lob: ['lobDef', 'lobOff'], drive: ['flatGround', 'topGround', 'lobDef'], block: ['chiquita', 'slice', 'lobDef'], wall: ['wallDef', 'lobDef'], scramble: ['lobDef'] }[o.gesture] || ['lobDef'];
    const h = info.height, depth = Math.abs(p.pos.x);
    if (h >= 2.05 && depth < 6.5) return ['smashFlat', 'smashKick', 'vibora'];
    if (h >= 1.85) return ['vibora', 'bandeja'];
    if (depth < 4.8 && h >= 0.95) return [info.fh ? 'volleyFH' : 'volleyBH'];
    return ['flatGround', 'topGround'];
  }
  function qteShot(p, info, pick, o, ops, oppNet, press, m, tm) {
    if (o.skip) return pick;                                                                                                   // "let it play": the AI's own shot, no penalty
    if (o.mishit) { pick.effort = Math.min(pick.effort, 0.4); pick.errMul = 1.6; pick.reason = 'qte-mishit'; return pick; }   // a missed swipe: the AI's shot, softer and a little sloppy
    const S = HPO.mod.shots, ks = qteKinds(o, info, p);
    if (o.target.x * -HPO.court.sides[p.team] < 0.5) { pick.reason = 'qte-fallback'; return pick; }                          // never trust a target on our own half
    for (let i = 0; i < ks.length; i++) {
      const base = aimFor(p, ks[i], info, ops, oppNet, press, m, tm);
      for (const e of [o.effort, o.effort * 0.8, 0.5]) {
        if (S.nominal(info.p, ks[i], o.target, { effort: e, netMargin: base.netMargin }).feasible) {
          return { kind: ks[i], target: { x: o.target.x, z: o.target.z }, effort: e, intent: base.intent, reason: 'qte', netMargin: base.netMargin, errMul: o.errMul };
        }
      }
    }
    pick.reason = 'qte-fallback'; return pick;
  }

  // The ball has flown out of the court after a bounce and the player has run out to it: whatever goes over the fence or through the
  // entrance and lands in the other half will do. Each option is flown through the real integrator first, so a ball that would hit
  // the fence or the net is never chosen.
  function salvageShot(p, info) {
    const S = HPO.mod.shots, ox = -HPO.court.sides[p.team], rr = rgn(), h = info.height, ot = opp(p.team);
    const gap = Math.abs(info.p.x) < 2.4 && Math.abs(info.p.z) > 4.9;
    const kinds = info.above ? ['smashFlat', 'bandeja', 'vibora', 'lobOff'] : h >= 1.9 ? ['bandeja', 'lobOff', 'lobDef'] : h >= 0.9 ? ['lobOff', 'lobDef', 'flatGround'] : ['lobDef', 'lobOff', 'slice'];
    if (gap && h < 1.7) kinds.unshift('flatGround', 'slice');                      // low and flat round the net post, through the opening
    const spots = [[6.5, 0], [7.2, -1.8], [7.2, 1.8], [5.5, 0], [8.2, 0], [4.5, 1.5], [4.5, -1.5]];
    for (let i = 0; i < kinds.length; i++) {
      for (let j = 0; j < spots.length; j++) {
        const target = { x: ox * spots[j][0], z: spots[j][1] + rr.range(-0.3, 0.3) };
        const nom = S.nominal(info.p, kinds[i], target, { effort: 0.65, netMargin: 0.45 });
        if (!nom.feasible) continue;
        const c0 = S.trace(info.p, nom, 3.2).contacts[0];
        if (!c0 || c0.surf !== 'floor' || HPO.court.regionOf(c0.p.x, c0.p.z) !== ot) continue;
        return { kind: kinds[i], target: target, effort: 0.65, intent: 'defend', reason: 'salvage', netMargin: 0.45 };
      }
    }
    return null;
  }

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
    const stretchEst = U.clamp((info.reach - 0.8) / 0.4, 0, 1);   // a lunge widens the error, and the ball goes into the net first
    const kEst = S.sigmaK(HPO.mod.players.execCtx(p, S.difficulty(kind, info.height, info.ballSpeed, stretchEst), press, stretchEst));
    const dist = Math.hypot(info.p.x - ox * 6, info.p.z) * 1.0 + 4;
    const sigLat = dist * Math.tan(kEst * (HPO.cfg.TUNE.errPhi || 1) * Math.PI / 180);
    const wise = 0.6 + 0.6 * lvl(p.attrs.tactics);
    // a flat ball's range moves by about 2 dθ / tan 2θ of its length, so an elevation error costs far more depth than width
    const sigDepth = dist * 2 * kEst * (HPO.cfg.TUNE.errTh || 1) * 0.75 * Math.PI / 180 / 0.45;
    const marginD = U.clamp(Math.max(0.4 + 0.35 * (m.risk - 1) + wise * T.riskMargin * 1.2 * sigLat, 0.5 + wise * T.depthSafe * sigDepth), 0.6, 3.0);
    const marginZ = U.clamp(0.3 + 0.25 * (m.risk - 1) + wise * T.riskMargin * 1.0 * sigLat, 0.45, 2.0);
    const rr = rgn();
    const cands = [];
    const clampT = t => ({ x: U.clamp(t.x, ox * 0, ox * 99), z: t.z });
    const addAim = (dx, z, tag) => cands.push({ x: ox * dx, z: U.clamp(z, -5 + marginZ, 5 - marginZ), tag: tag });
    const weak = ops.slice().sort((a, b) => m.tire ? b.fatigue - a.fatigue : weakness(b) - weakness(a))[0];
    let kindDepth;
    const effortBase = 0.35 + 0.3 * (m.flat - 0.8) + 0.2 * lvl(p.attrs.power);
    let effort = U.clamp(effortBase, 0.2, 0.9);
    effort = U.clamp(effort + 0.25 * (lvl(p.attrs.power) - 0.5), 0.15, 0.95); // power buys pace

    if (LOB[kind] || kind === 'wallDef') {
      const d = 10 - marginD - (kind === 'lobOff' ? (oppNet ? 0.9 : 1.2) : (oppNet ? 1.3 : 1.7)); // with the other pair at the net the ball goes to the back glass to send them running
      [-3, -1.2, 1.2, 3].forEach(z => addAim(d, z + rr.range(-0.4, 0.4), 'lob'));
      effort = kind === 'lobOff' ? 0.5 : 0.35;
    } else if (SMASH[kind]) {
      const sk = kind === 'smashKick';
      [[3.2, -3.4], [3.2, 3.4], [5.5, 0], [4.5, -2.2], [4.5, 2.2], [2.8, -3.2], [2.8, 3.2], [2.9, 0], [3.8, -1.4], [3.8, 1.4]].forEach(a => addAim(a[0], a[1], 'smash'));
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
      addAim(8.0 - marginD * 0.6, -2.8, 'wallside'); addAim(8.0 - marginD * 0.6, 2.8, 'wallside');   // bounce inside the line and run into the glass, not into it addAim(6.5, -3, 'wide'); addAim(6.5, 3, 'wide');
      effort = 0.6;
    } else if (kind === 'bajada') {
      addAim(6.0, -3.2, 'angle'); addAim(6.0, 3.2, 'angle'); addAim(7.5, 0, 'mid'); addAim(8, -2, 'deep'); addAim(8, 2, 'deep');
      effort = 0.6;
    } else if (kind.indexOf('volley') === 0) {
      [[6.5, -3.0], [6.5, 3.0], [7.8, -1.8], [7.8, 1.8], [5.0, 0]].forEach(a => addAim(a[0] - marginD * 0.5, a[1], 'volley'));
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
      c.s0 = 0;
      let dmin = 99; ops.forEach(q => { dmin = Math.min(dmin, Math.hypot(q.pos.x - c.x, q.pos.z - c.z)); });
      s += Math.min(dmin, 5) * (c.tag === 'feet' ? -0.2 : 0.5);
      if (c.tag === 'feet') s += 1.0;
      if (weak) { const dw = Math.hypot(weak.pos.x - c.x, weak.pos.z - c.z); s += m.tire ? Math.min(dw, 6) * 0.4 : (m.focus || tm.orders.preset === 'focusOne' || tm.orders.focusOpponent !== undefined) ? Math.max(0, 3 - dw) * 0.8 : Math.max(0, 3 - dw) * 0.25 * weakness(weak); } // tire: far from them, so they run
      if (m.middle) s += (1.5 - Math.abs(c.z)) * 0.8;
      if (m.glass && (c.tag === 'glass' || c.tag === 'wallside' || Math.abs(c.z) > 2.8)) s += 1.2;
      s -= Math.abs(c.z) > 5 - marginZ ? 1 : 0;
      s += rr.range(-1, 1) * T.aimNoise * (1.2 - lvl(p.attrs.tactics));
      if (aimOrder) s -= Math.hypot(aimOrder.x - c.x, aimOrder.z - c.z) * 0.9;
      c.s0 = s;
      if (s > bs) { bs = s; best = c; }
    });
    // a smash is judged by where the ball actually ends up: the placement the other pair reaches last (or never) wins
    if (SMASH[kind] && T.smashAim > 0 && !aimOrder) {
      let top = null, tb = -1e9;
      cands.slice().sort((a, b) => b.s0 - a.s0).slice(0, 6).forEach(function (c) {
        const r = reachSlack(p, info, kind, c, effort, ops);
        if (!r) return;
        const s = c.s0 - T.smashAim * 2.4 * U.clamp(r.slack, -0.6, 1.4);
        if (s > tb) { tb = s; top = c; }
      });
      if (top) best = top;
    }
    let target = { x: best.x, z: best.z };
    if (aimOrder) { // coach click: honoured only if the shot can really go there
      const nomO = S.nominal(info.p, kind, { x: aimOrder.x, z: aimOrder.z }, { effort: effort });
      if (nomO.feasible && S.difficulty(kind, info.height, info.ballSpeed, 0) < 0.85) { target = { x: aimOrder.x, z: aimOrder.z }; tm.orders.aimPoint = null; }
    }
    const intent = LOB[kind] || kind === 'wallDef' ? 'defend' : (SMASH[kind] || kind === 'vibora' ? 'attack' : (SOFT[kind] ? 'finesse' : 'rally'));
    return { kind: kind, target: target, effort: effort, intent: intent, reason: best.tag, netMargin: SMASH[kind] ? U.clamp(0.3 + 0.1 * kEst, 0.32, 0.7) : U.clamp(T.netSafe * (0.12 + 0.07 * kEst), 0.12, 0.7) };
  }

  // How comfortably can the other pair still hit this smash? slack < 0: nobody gets there in time. null: the shot would not even land in.
  function reachSlack(p, info, kind, c, effort, ops) {
    const S = HPO.mod.shots, P = HPO.mod.players, nav = HPO.mod.nav, ot = opp(p.team);
    const nom = S.nominal(info.p, kind, { x: c.x, z: c.z }, { effort: effort });
    if (!nom.feasible) return null;
    const tr = S.trace(info.p, nom, 3.2);
    const fl = tr.contacts.filter(k => k.surf === 'floor'), first = tr.contacts[0];
    if (!fl.length || !first || first.surf !== 'floor' || HPO.court.regionOf(fl[0].p.x, fl[0].p.z) !== ot) return null;
    const react = ops.map(q => P.reactDelay(q) * (HPO.cfg.TUNE.react || 1) + P.readDelay(q, { v: nom.v, shot: kind }, p));
    let best = -9, ci = 0, ownB = 0;
    for (let i = 0; i < tr.samples.length; i++) {
      const s = tr.samples[i];
      while (ci < fl.length && fl[ci].t <= s.t) { if (HPO.court.regionOf(fl[ci].p.x, fl[ci].p.z) === ot) ownB++; ci++; }
      if (ownB > 1) break;
      if (s.p.y < 0.2 || s.p.y > 2.95 || s.p.x * HPO.court.sides[ot] < 0.15 || Math.abs(s.p.x) > 9.9 || Math.abs(s.p.z) > 4.95) continue;
      for (let k = 0; k < ops.length; k++) {
        const q = ops[k], d = Math.hypot(s.p.x - q.pos.x, s.p.z - q.pos.z);
        const sl = s.t - react[k] - nav.timeTo(Math.max(0, d - 0.95), 0, P.vmax(q), P.accel(q));
        if (sl > best) best = sl;
      }
    }
    return { slack: best };
  }

  function weakness(q) { return (1 - lvl(q.attrs.defense)) * 0.6 + q.fatigue * 0.5 + (1 - q.confidence) * 0.2; }

  // ---- team tick ----
  function tickTeam(team, dt) {
    const P = HPO.mod.players, B = HPO.mod.ball.state, tm = teams[team];
    const ps = P.team(team); if (ps.length < 2) return;
    const sx = HPO.court.sides[team];
    updateFormation(team);

    const incoming = B.state === 'live' && B.lastHitTeam !== team && B.lastHitTeam !== null;
    const serveReturn = incoming && B.hitsSinceServe === 1;
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
        // the receiving partner stays behind the service line until the serve has been returned
        const tx = serveReturn ? sx * Math.max(Math.abs(t.x), SERVE_BACK) : t.x;
        p.intent = { type: 'move', x: tx, z: t.z, cap: arrive };
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
  const BASE = { attack: [2.2, 2.2], neutral: [2.8, 5.6], defend: [7.4, 7.8], press: [3.0, 4.2] };   // press: stepping up to counter the rebound of an expected smash
  const SERVE_BACK = 7.6; // metres from the net: just behind the 6.95 m service line

  // Our ball is on its way to the opponents and will reach them above 1.9 m (a lob, a floater): they get an overhead.
  const ovCache = { A: { k: -1, v: false }, B: { k: -1, v: false } };
  function overheadComing(team) {
    const B = HPO.mod.ball, st = B.state;
    if (st.state !== 'live' || st.lastHitTeam !== team || T.dropBack <= 0) return false;
    const key = st.hitsSinceServe * 1000 + Math.floor(now * 6), c = ovCache[team];
    if (c.k === key) return c.v;
    const sx = HPO.court.sides[team];
    let v = false;
    const s = B.predict(null, 2.4, 20).samples;
    for (let i = 0; i < s.length; i++) {
      const q = s[i];
      if (q.p.x * sx > 0) continue;                       // still on our side of the net
      if (q.floorBounces > 0 && q.p.y < 1.9) break;       // it comes down before anyone can hit it from above
      if (q.p.y >= 1.9 && Math.abs(q.p.x) < 9.2 && Math.abs(q.p.x) > 0.8) { v = true; break; }
    }
    c.k = key; c.v = v; return v;
  }

  // Once per overhead: bet on a weak smash and step up for the rebound, or drop back to the glass. A smash from close to the net is likelier, so the bet is too.
  function pressOrDrop(team) {
    const tm = teams[team], B = HPO.mod.ball.state, key = B.hitsSinceServe;
    if (tm.betKey === key) return tm.bet;
    const P = HPO.mod.players, ops = P.team(opp(team)), m = mods(team);
    const nearest = Math.min.apply(null, ops.map(q => Math.abs(q.pos.x)));
    const smashLikely = U.clamp((6.5 - nearest) / 3, 0, 1);
    const tact = P.team(team).reduce((a, q) => a + lvl(q.attrs.tactics), 0) / 2;
    const prob = U.clamp(T.gamble * (0.4 + 0.6 * smashLikely) * (0.8 + 0.4 * tact) * (1 + 0.25 * m.netBias), 0, 0.9);
    tm.betKey = key; tm.bet = rgn().chance(prob);
    return tm.bet;
  }

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
        else if (SMASH[ls.kind]) want = tm.formation === 'press' ? 'press' : 'defend';   // committed to the net: whether the rebound can be reached is up to the smash
        else if (ls.kind === 'vibora') want = 'defend';
        else if (ls.kind === 'bandeja') want = tm.formation === 'press' ? 'defend' : 'neutral';   // a bandeja sits deep: whoever stepped up has to run back
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
    // the other pair is about to get a ball above the shoulder: nobody stays up to be smashed at, wait for it off the glass
    if (overheadComing(team)) want = pressOrDrop(team) ? 'press' : 'defend';
    if (m.netBias > 0 && want === 'neutral') want = 'attack';
    if (m.netBias < 0 && want === 'attack') want = 'neutral';
    const urgent = (want === 'defend' || want === 'press') && tm.formation !== want;
    if (want !== tm.formation && (urgent || now - tm.since > 1.2)) {
      if (want === 'defend' && tm.formation === 'press') HPO.mod.players.team(team).forEach(q => { q.fatigue = Math.min(1, q.fatigue + T.retreatCost * (1.2 - 0.7 * lvl(q.attrs.stamina))); });
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
    if (ps[0].homeLane && ps[0].homeLane === -ps[1].homeLane) ps.forEach(q => { laneOf[q.id] = q.homeLane; });
    else { const ps2 = ps.slice().sort((a, b) => a.pos.z * rs - b.pos.z * rs); laneOf[ps2[0].id] = -1; laneOf[ps2[1].id] = 1; }
    let ballZ = B.state === 'live' ? U.clamp(B.p.z, -4, 4) : 0;
    const shift = U.clamp(ballZ * 0.3, -1.1, 1.1);
    ordered.forEach(function (p, i) {
      const lane = laneOf[p.id];
      let depth = base[i];
      let z = rs * lane * (tm.formation === 'defend' ? 1.9 : tm.formation === 'attack' || tm.formation === 'press' ? 1.7 : 1.6) + shift;
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
    volleyRun = e.shot === 'volleyFH' || e.shot === 'volleyBH' ? volleyRun + 1 : 0;
    lobRun = LOB[e.shot] ? lobRun + 1 : 0;
  });
  BUS.on('point:start', function () { lastShot = null; volleyRun = lobRun = 0; ['A', 'B'].forEach(t => { teams[t].formation = 'neutral'; teams[t].since = now; teams[t].claim = null; teams[t].betKey = -1; }); });
})(HPO);
