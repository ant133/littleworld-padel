// Match flow: owns the sim tick order, the match coroutine (walk-on -> ceremony), point loop and statistics.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, S = HPO.sched;
  const R = () => HPO.mod.rules, P = () => HPO.mod.players, A = () => HPO.mod.ai, Bl = () => HPO.mod.ball;
  const NETSHOTS = { volleyFH: 1, volleyBH: 1, smashFlat: 1, smashKick: 1, bandeja: 1, vibora: 1, chiquita: 1, dejada: 1 };

  const M = HPO.mod.match = {
    cfg: null, phase: 'idle', speed: 1, paused: false, acc: 0, simTime: 0, ended: false,
    stats: null, pt: null, co: null,

    // ---- configure and start a new match ----
    start(cfg) {
      cfg = Object.assign({ format: 'quick', scoring: 'advantage', type: 'M', venue: 'classicBlue', seed: 1, fast: false, teamA: null, teamB: null, autoCeremony: true }, cfg || {});
      S.stopAll();
      HPO.reseed(cfg.seed);
      HPO.cfg.RULES.lineErrorCm = cfg.lineErrorCm === undefined ? 2.0 : cfg.lineErrorCm;
      HPO.mod.court.setVenue(cfg.venue);
      HPO.mod.court.sides = { A: -1, B: 1 };
      const roster = P().roster();
      const pool = roster.filter(r => cfg.type === 'M' ? r.gender === 'M' : cfg.type === 'W' ? r.gender === 'F' : true);
      let ta = cfg.teamA, tb = cfg.teamB;
      if (!ta || !tb) {
        const men = roster.filter(r => r.gender === 'M'), wom = roster.filter(r => r.gender === 'F');
        if (cfg.type === 'M') { ta = [men[0].id, men[1].id]; tb = [men[2].id, men[3].id]; }
        else if (cfg.type === 'W') { ta = [wom[0].id, wom[1].id]; tb = [wom[2].id, wom[3].id]; }
        else { ta = [men[0].id, wom[0].id]; tb = [men[2].id, wom[2].id]; }
      }
      const ids = ta.concat(tb);
      if (ta.length !== 2 || tb.length !== 2 || new Set(ids).size !== 4 || ids.some(id => !pool.some(p => p.id === id))) throw new Error('Choose four different players eligible for this match type.');
      if (cfg.type === 'X' && [ta, tb].some(team => team.filter(id => roster.find(p => p.id === id).gender === 'F').length !== 1)) throw new Error('Mixed teams require one woman and one man.');
      cfg.teamA = ta; cfg.teamB = tb;
      M.cfg = cfg;
      P().setup(ta, tb); A().reset(); Bl().reset();
      // coin toss: first server team + who serves first inside the team (best server)
      const rg = HPO.streams.rules;
      const first = rg.chance(0.5) ? 'A' : 'B';
      const pick = ids => ids.slice().sort((a, b) => serveSkill(b) - serveSkill(a));
      const sA = pick(ta), sB = pick(tb);
      const other = first === 'A' ? 'B' : 'A';
      const order = first === 'A' ? [sA[0], sB[0], sA[1], sB[1]] : [sB[0], sA[0], sB[1], sA[1]];
      const swapEnds = cfg.sideA || (rg.chance(0.5) ? 1 : -1);
      M.toss = { first: first, sideA: swapEnds };
      R().newMatch({ format: cfg.format, scoring: cfg.scoring, firstServeTeam: first, serveOrder: order, sideA: swapEnds });
      // deuce-side receiver = the drive player (right side), the other takes the ad side
      ['A', 'B'].forEach(function (t) {
        const ids = t === 'A' ? ta : tb;
        const drive = ids.find(id => P().get(id).def.side === 'drive') || ids[0];
        R().setReceivers(t, drive);
      });
      P().place();
      M.stats = newStats();
      M.skip = false; M.streak = null; M.retrieving = false;
      M.pt = null; M.ended = false; M.simTime = 0; M.acc = 0; M.paused = false; M.result = null;
      setPhase('intro');
      M.co = S.start(mainFlow, 'match');
      return M;
    },

    // ---- stepping ----
    // advance by real seconds (scaled by speed); fixed SIM_DT steps
    advance(realDt) {
      if (M.paused || M.phase === 'idle') return 0;
      M.acc += Math.min(realDt, 0.1) * M.speed;
      let n = 0;
      const dt = HPO.cfg.SIM_DT, max = HPO.cfg.MAX_SUBSTEPS * 2;
      while (M.acc >= dt && n < max && !M.paused) { M.tick(dt); M.acc -= dt; n++; }
      if (n >= max) M.acc = 0;
      return n;
    },
    tick(dt) {
      M.simTime += dt;
      const ph = R().phase();
      const live = ph === 'serveFlight' || ph === 'serve' || ph === 'rally' || (M.phase === 'warmup' && Bl().state.state === 'live');
      A().update(dt, live);
      P().update(dt);
      Bl().update(dt);
      R().update(dt);
      S.update(dt);
    },
    // run to completion without rendering (tests/tools). Returns sim seconds used.
    runToEnd(maxSimSeconds) {
      const lim = maxSimSeconds || 3 * 3600;
      const dt = HPO.cfg.SIM_DT;
      while (!M.ended && M.simTime < lim) M.tick(dt);
      return M.simTime;
    },
    setSpeed(s) { M.speed = s; },
    pause(v) { M.paused = v === undefined ? !M.paused : v; },
    skipCeremony() { M.skip = true; }
  };

  function serveSkill(id) { const a = P().get(id).attrs; return a.accuracy * 0.5 + a.tactics * 0.3 + a.power * 0.2; }
  function setPhase(ph) { const prev = M.phase; M.phase = ph; BUS.emit('match:phase', { phase: ph, prev: prev }); }
  const wait = sec => M.cfg && (M.cfg.fast || M.skip) ? S.wait(0) : S.wait(sec);

  function newStats() {
    return { rallies: [], longest: 0, pointsPlayed: 0, teams: { A: tm(), B: tm() }, points: [], startedAt: 0 };
    function tm() { return { bpFaced: 0, bpWon: 0, pointsWon: 0, aces: 0, doubleFaults: 0, firstIn: 0, firstTotal: 0, secondWon: 0, secondPlayed: 0 }; }
  }

  // ---------- per-point bookkeeping ----------
  function startRec() { M.pt = { faults: 0, strokes: [], netPlayers: {}, bp: null, server: null, serverTeam: null }; }
  BUS.on('point:start', function (e) {
    if (e.retry) return;
    startRec();
    const st = R().state;
    M.pt.server = e.server; M.pt.serverTeam = e.serverTeam;
    M.pt.bp = st && st.flags && st.flags.breakPoint;
  });
  BUS.on('fault', function (e) { if (M.pt && e.kind !== 'let') M.pt.faults++; });
  BUS.on('shot:hit', function (e) {
    if (!M.pt) return;
    const p = P().get(e.playerId); if (!p) return;
    M.pt.strokes.push({ pid: e.playerId, team: p.team, kind: e.shot, afterWall: !!e.afterWall, x: e.p.x });
    if (e.afterWall && e.shot !== 'serve') p.stats.wallRecoveries++;
    if (NETSHOTS[e.shot] && Math.abs(e.p.x) < 4.8) M.pt.netPlayers[p.id] = true;
  });
  BUS.on('point:end', function (e) {
    const pt = M.pt; if (!pt) return;
    const st = M.stats, P_ = P();
    const winner = e.winner, loser = winner === 'A' ? 'B' : 'A';
    const server = pt.server ? P_.get(pt.server) : null;
    const rl = e.rallyLen;
    st.pointsPlayed++; if (rl > st.longest) st.longest = rl;
    st.rallies.push(rl);
    st.teams[winner].pointsWon++;
    const h = e.hitter ? P_.get(e.hitter) : null;
    const lastKind = e.shotKinds[e.shotKinds.length - 1] || '';
    if (e.kind === 'winner' && h) {
      h.stats.winners++;
      if (lastKind.indexOf('volley') === 0) h.stats.volleyWinners++;
      if (lastKind === 'smashFlat' || lastKind === 'smashKick') h.stats.smashWinners++;
    } else if (e.kind === 'ace' && h) { h.stats.aces++; h.stats.winners++; st.teams[h.team].aces++; }
    else if (e.kind === 'unforced' && h) h.stats.unforced++;
    else if (e.kind === 'forced' && h) h.stats.forced++;
    else if (e.kind === 'doubleFault' && server) { server.stats.doubleFaults++; st.teams[server.team].doubleFaults++; }
    // serve stats (per point, lets excluded)
    if (server) {
      server.stats.firstServeTotal++;
      st.teams[server.team].firstTotal++;
      if (pt.faults === 0) { server.stats.firstServeIn++; st.teams[server.team].firstIn++; }
      else if (pt.faults === 1) {
        server.stats.secondPtsPlayed++; st.teams[server.team].secondPlayed++;
        if (winner === server.team) { server.stats.secondPtsWon++; st.teams[server.team].secondWon++; }
      }
    }
    // break points
    if (pt.bp) { st.teams[pt.bp].bpFaced++; /* team that holds break point is the receiver */ }
    if (pt.bp && winner === pt.bp) st.teams[pt.bp].bpWon++;
    // net points
    Object.keys(pt.netPlayers).forEach(function (id) { const q = P_.get(id); q.stats.netPointsPlayed++; if (q.team === winner) q.stats.netPointsWon++; });
    // lobs
    pt.strokes.forEach(function (s, i) {
      if (s.kind !== 'lobDef' && s.kind !== 'lobOff') return;
      const q = P_.get(s.pid); q.stats.lobs++;
      const nxt = pt.strokes[i + 1];
      if (winner === s.team || (nxt && nxt.kind !== 'smashFlat' && nxt.kind !== 'smashKick')) q.stats.lobsSuccess++;
    });
    // confidence + rest
    P_.list.forEach(function (q) { q.confidence = U.clamp(q.confidence + (q.team === winner ? 0.012 : -0.012), 0.05, 0.98); });
    if (h && (e.kind === 'unforced')) h.confidence = U.clamp(h.confidence - 0.03, 0.05, 0.98);
    st.points.push({ n: st.pointsPlayed, winner: winner, kind: e.kind, reason: e.reason, rallyLen: rl, shots: e.shotKinds.slice(0, 40) });
  });
  BUS.on('match:end', function (e) { M.result = e; });

  // ---- out-of-court retrieval: a valid ball left through the entrance (or over the fence): the receiving team's nearest player fetches it and plays it back ----
  BUS.on('ball:out_retrieve', function () { if (M.cfg && !M.retrieving) { M.retrieving = true; S.start(retrieve, 'retrieve'); } });
  function* retrieve() {
    const B = Bl().state, pl = P(), other = t => t === 'A' ? 'B' : 'A';
    try {
      const team = other(B.lastHitTeam || 'A');
      const bp = { x: U.clamp(B.p.x, -12, 12), z: U.clamp(B.p.z, -7.5, 7.5) };
      const cands = pl.team(team);
      // nearest entrance (z=+-5, x=0) to the ball
      const sz = bp.z >= 0 ? 1 : -1;
      const me = cands.slice().sort((p, q) => Math.hypot(p.pos.x, p.pos.z - sz * 5) - Math.hypot(q.pos.x, q.pos.z - sz * 5))[0];
      me.scripted = true; me.retrieving = true;
      const go = (x, z, cap) => { me.intent = { type: 'move', x: x, z: z, cap: cap || 0.9 }; };
      const near = (x, z, r) => Math.hypot(me.pos.x - x, me.pos.z - z) < (r || 0.35);
      go(0, sz * 4.3); yield S.until(() => near(0, sz * 4.3, 0.5), 5);
      go(0, sz * 6.0); yield S.until(() => near(0, sz * 6.0, 0.5), 3);
      const hx = Math.abs(bp.z) < 5.6 ? 0 : bp.x;                                  // ball still beside the wall: pick it up where it lies
      go(bp.x, sz * Math.max(6.4, Math.abs(bp.z))); yield S.until(() => near(bp.x, sz * Math.max(6.4, Math.abs(bp.z)), 0.6), 7);
      Bl().hold({ x: me.pos.x, y: 0.9, z: me.pos.z + sz * 0.2 });
      me.anim = { clip: 'lowDef', t: 0, rate: 1 }; yield wait(0.5);
      const ox = -HPO.court.sides[team], rg = HPO.streams.ai;
      const hand = { x: me.pos.x, y: 1.0, z: me.pos.z };
      let sol = null;
      const tries = [['lobDef', 7.2], ['lobOff', 6.0], ['lobDef', 5.0], ['flatGround', 7.0]];
      for (let i = 0; i < tries.length && !sol; i++) {
        const n = HPO.mod.shots.nominal(hand, tries[i][0], { x: ox * tries[i][1], z: rg.range(-2, 2) }, { effort: 0.7, netMargin: 0.4 });
        if (n.feasible) sol = { n: n, kind: tries[i][0] };
      }
      if (sol) {
        const ex = HPO.mod.shots.execute(sol.n, P().execCtx(me, 0.55, 0.4, 0.1));
        Bl().launch({ p: hand, v: ex.v, w: ex.w, hitter: me.id, team: team });
        me.stats.shots++;
        BUS.emit('shot:hit', { playerId: me.id, shot: sol.kind, p: hand, v: ex.v, w: ex.w, quality: ex.quality, t: pl.now, pressure: 0.4, reached: true, difficulty: 0.55, afterWall: false, afterBounce: true, retrieval: true, intent: 'defend', reason: 'retrieval' });
      }
      yield wait(0.6);
      go(0, sz * 6.0, 0.8); yield S.until(() => near(0, sz * 6.0, 0.6), 4);
      go(0, sz * 4.3, 0.8); yield S.until(() => near(0, sz * 4.3, 0.6), 4);
      void hx;
    } finally {
      pl.list.forEach(p => { p.scripted = false; if (Math.abs(p.pos.z) < 5.2) p.retrieving = false; });
      M.retrieving = false;
    }
  }

  // ---------- coroutine flow ----------
  // visual choreography hook: HPO.mod.ceremony.phases[name] is a generator that fully replaces the fallback (skipped in fast/headless mode)
  function* phaseHook(name, fallback, arg) {
    const c = HPO.mod.ceremony;
    if (c && c.phases && c.phases[name] && !(M.cfg && M.cfg.fast) && !M.skip) yield* c.phases[name](arg); else yield* fallback(arg);
  }

  function* mainFlow() {
    setPhase('intro'); yield* phaseHook('intro', function* () { yield wait(3); });
    setPhase('walkon'); yield* phaseHook('walkon', walkOn);
    setPhase('introductions'); yield* phaseHook('introductions', function* () { yield wait(8); });
    setPhase('toss'); yield* phaseHook('toss', function* () { yield wait(5); });
    setPhase('warmup'); yield* phaseHook('warmup', warmup);
    if (M.skip) { P().place(); P().list.forEach(p => { p.retrieving = false; p.intent = { type: 'idle' }; }); Bl().reset(); A().warmup = false; }
    M.skip = false;                                                  // 'Skip intro' only skips the pre-match phases
    setPhase('play');
    while (!R().state.over) {
      yield* playPoint();
      const st = R().state;
      if (st.over) break;
      const last = st.last;
      if (last && last.set) { setPhase('setBreak'); yield* phaseHook('changeover', changeover, 'set'); setPhase('play'); }
      else if (last && last.sidesChanged) { yield* phaseHook('changeover', changeover, 'game'); }
      else yield wait(1.2);
    }
    M.stats.durationSim = M.simTime;
    setPhase('matchEnd'); yield wait(3);
    setPhase('handshake'); yield* phaseHook('handshake', handshake);
    if (!M.skip) { setPhase('ceremony'); yield* phaseHook('ceremony', function* () { yield wait(12); }); }
    setPhase('results');
    M.ended = true;
    BUS.emit('match:finished', {});
  }

  function* walkOn() {
    const pl = P();
    pl.list.forEach(function (p, i) {
      const sx = HPO.court.sides[p.team];
      p.retrieving = true;
      p.pos = { x: sx * 12.5, z: 6.5 * (p.slot ? -1 : 1) };
      p.intent = { type: 'move', x: sx * 5, z: (p.slot ? -1 : 1) * 2, cap: 0.4 };
      if (M.skip) p.pos = { x: p.intent.x, z: p.intent.z };
    });
    yield S.until(() => pl.list.every(p => Math.hypot(p.pos.x - p.intent.x, p.pos.z - p.intent.z) < 0.4), 14);
    pl.list.forEach(p => { p.retrieving = false; });
  }

  // cooperative rallies at the start: the real AI/physics with relaxed shots, rules idle (no score)
  function* warmup() {
    if (M.cfg.fast) { P().rest(0.05); return; }
    const pl = P(), B = Bl(), S_ = HPO.sched;
    A().warmup = true;
    pl.place();
    const pos = pl.list.filter(p => true);
    pl.list.forEach(function (p) { const sx = HPO.court.sides[p.team]; p.intent = { type: 'move', x: sx * (p.slot === 0 ? 6.8 : 3.2), z: (p.slot === 0 ? 1 : -1) * 1.6, cap: 0.6 }; });
    yield S_.wait(1.5);
    const tEnd = M.simTime + 26;
    let feeder = 'A';
    while (M.simTime < tEnd && !M.skip) {
      const t = pl.team(feeder), f = t.find(q => q.slot === 0) || t[0], sx = HPO.court.sides[feeder], ox = -sx;
      const hand = { x: f.pos.x + Math.cos(pl.facing(feeder)) * 0.4, y: 1.0, z: f.pos.z };
      const nom = HPO.mod.shots.nominal(hand, 'slice', { x: ox * 6.2, z: -f.pos.z * 0.3 }, { effort: 0.3, netMargin: 0.35 });
      B.launch({ p: hand, v: nom.v, w: nom.w, hitter: f.id, team: feeder });
      BUS.emit('shot:hit', { playerId: f.id, shot: 'slice', p: hand, v: nom.v, w: nom.w, quality: 0.8, t: pl.now, pressure: 0, reached: true, difficulty: 0.1, warmup: true });
      const t0 = M.simTime;
      yield S_.until(function () { return B.state.state !== 'live' || B.state.tSinceHit > 7 || M.simTime - t0 > 14; }, 16);
      B.reset();
      pl.list.forEach(function (p) { p.intent = { type: 'idle' }; p.swing = null; });
      yield S_.wait(1.0);
      feeder = feeder === 'A' ? 'B' : 'A';
    }
    A().warmup = false;
    B.reset(); pl.rest(0.05);
  }

  function* changeover(kind) {
    BUS.emit('changeover:start', { kind: kind });
    const pl = P();
    pl.list.forEach(function (p) { p.retrieving = true; p.intent = { type: 'move', x: HPO.court.sides[p.team] * 1.2, z: (p.slot ? -1 : 1) * 4.2, cap: 0.5 }; });
    yield wait(kind === 'set' ? 9 : 5);
    pl.list.forEach(p => { p.retrieving = false; p.anim = { clip: 'drink', t: 0, rate: 1 }; });
    pl.rest(kind === 'set' ? 0.12 : 0.05);
    BUS.emit('changeover:end', { kind: kind });
  }

  function* handshake() {
    const pl = P();
    pl.list.forEach(p => { p.intent = { type: 'move', x: HPO.court.sides[p.team] * 0.7, z: (p.slot ? -1 : 1) * 1.6, cap: 0.5 }; });
    yield wait(6);
  }

  // positions everyone for the serve, runs the serve attempts until the point ends
  function* playPoint() {
    const st = R().state;
    const serverInfo = R().startPoint();
    const players = P();
    const server = players.get(serverInfo.playerId);
    // players are clamped to the half they stand on, so a skipped changeover must not leave anyone on the wrong one
    players.list.forEach(function (p) { if (p.pos.x * HPO.court.sides[p.team] < 0) p.pos = { x: -p.pos.x, z: p.pos.z }; });
    yield wait(0.4);
    let guard = 0;
    for (;;) {
      if (R().phase() === 'ended') break;
      const attempt = R().state.faultCount + 1;
      const tgt = R().serveTarget();
      const sp = A().servePositions(server.team, server.id, st.serveSide, R().expectedReceiver());
      players.list.forEach(function (p) {
        if (p === server) return;
        const t = sp.map[p.id]; p.intent = { type: 'move', x: t.x, z: t.z, cap: 0.7 };
      });
      Bl().reset();
      yield S.until(() => players.list.every(p => p === server || Math.hypot(p.pos.x - p.intent.x, p.pos.z - p.intent.z) < 0.5), 6);
      const box = tgt.box;
      const aimX = (box.x[0] + box.x[1]) / 2, aimZ = (box.z[0] + box.z[1]) / 2;
      const target = serveAim(server, box, attempt);
      yield* players.serveSequence(server.id, target, attempt, attempt === 1 ? (HPO.streams.ai.chance(0.2) ? 0.95 : 0.75) : 0.4);
      yield S.until(() => { const ph = R().phase(); return ph === 'ended' || ph === 'serveWait'; }, 60);
      if (R().phase() === 'ended') break;
      if (++guard > 8) { break; }
    }
    // point over: everyone stops
    P().reset();
    yield wait(0.6);
    yield* review();
  }

  // Eagle Eye window after each point: AI teams (not the human-coached one) challenge close calls; tactical timeouts for AI teams on a bad run
  function* review() {
    const rl = R(), st = rl.state;
    if (st.over || !st.last) return;
    const loser = st.last.winner === 'A' ? 'B' : 'A';
    if (M.coachTeam !== loser && rl.canChallenge && rl.canChallenge(loser, 0)) {
      const b = rl.lastBounces().slice(-1)[0];
      if (b && b.marginCm <= 6 && HPO.streams.ai.chance(0.6)) {
        const res = rl.challenge(loser, 0);
        if (res) {
          BUS.emit('speak', { text: 'Challenge from Team ' + loser + '. ' + (res.overturned ? 'The call is overturned.' : 'The call stands.'), voice: 'umpire', priority: 2 });
          const rp = HPO.mod.replay;
          if (rp && rp.play && !M.cfg.fast) { rp.play({ kind: 'challenge', speed: 0.3 }); yield S.until(() => !rp.active, 14); } else yield wait(1);
        }
      }
    }
    // AI timeout when the opponent has won 4 straight points
    M.streak = M.streak || { team: null, n: 0 };
    if (M.streak.team === st.last.winner) M.streak.n++; else M.streak = { team: st.last.winner, n: 1 };
    if (M.streak.n >= 4 && M.coachTeam !== loser && st.timeouts[loser] > 0 && HPO.streams.ai.chance(0.5) && rl.useTimeout(loser)) {
      M.streak = { team: null, n: 0 };
      yield* M.timeout(loser);
    }
  }
  M.timeout = function* (team) {
    BUS.emit('changeover:start', { kind: 'timeout', team: team });
    BUS.emit('speak', { text: 'Tactical timeout, Team ' + team + '.', voice: 'umpire', priority: 2 });
    P().list.forEach(function (p) { p.intent = { type: 'move', x: HPO.court.sides[p.team] * 1.4, z: (p.slot ? -1 : 1) * 4.2, cap: 0.5 }; });
    yield wait(8);
    P().rest(0.04);
    BUS.emit('changeover:end', { kind: 'timeout', team: team });
  };
  // UI entry: a human-requested timeout between points
  M.requestTimeout = function (team) {
    if (!R().state || R().state.over || !R().useTimeout || R().phase() !== 'ended') return false;
    if (!R().useTimeout(team)) return false;
    S.start(function* () { yield* M.timeout(team); }, 'timeout');
    return true;
  };

  // underhand serves aim for the back/side of the service box with a safety margin; second serves play safer
  function serveAim(server, box, attempt) {
    const rg = HPO.streams.ai, c = HPO.mod.court;
    const m = attempt === 1 ? 0.2 : 0.75;
    const xs = box.x[1] > 0 ? 1 : -1;               // box lies on +x or -x; depth is measured from the net
    const x = xs * rg.range(0.5, 0.82) * 6.95;
    const zs = box.z[0] >= 0 ? 1 : -1;
    const zmid = (box.z[0] + box.z[1]) / 2;
    const orders = HPO.mod.ai.orders(server.team);
    let zt;
    const pref = orders.serveDir || 'auto';
    if (pref === 'wide') zt = zs * 4.0; else if (pref === 'T') zt = zs * 1.0; else if (pref === 'body') zt = zmid; else zt = zs * rg.range(1.2, 3.9);
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    zt = zs > 0 ? cl(zt, box.z[0] + m, box.z[1] - m) : cl(zt, box.z[0] + m, box.z[1] - m);
    const xt = cl(x, Math.min(box.x[0], box.x[1]) + m, Math.max(box.x[0], box.x[1]) - m);
    return { x: xt, z: zt };
  }
})(HPO);
