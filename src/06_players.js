// Players: roster, attributes, kinematics, predictive interception, strike execution, serve routine.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, CFG = HPO.cfg;
  const lvl = a => U.clamp((a - 30) / 65, 0.02, 1);

  // Original, fictional players. attrs 40..95.
  const ROSTER = [
    { id: 'p0', name: 'Mateo Valdrez', nick: 'El Muro', gender: 'M', country: { code: 'ESP', name: 'Spain' }, ranking: 4, hand: 'R', side: 'reves', archetype: 'wallSpecialist',
      attrs: { power: 66, accuracy: 78, reflexes: 80, coverage: 82, stamina: 88, net: 62, defense: 92, wallRead: 94, tactics: 80 }, look: { skin: 2, hair: 0x2a1d14, hairStyle: 'short', outfit: [0x1e6bd6, 0xffffff], racket: 0x14b8a6 } },
    { id: 'p1', name: 'Rafael Quintero', nick: 'La Red', gender: 'M', country: { code: 'ARG', name: 'Argentina' }, ranking: 2, hand: 'R', side: 'drive', archetype: 'netAttacker',
      attrs: { power: 78, accuracy: 76, reflexes: 90, coverage: 76, stamina: 74, net: 94, defense: 62, wallRead: 70, tactics: 82 }, look: { skin: 1, hair: 0x0f0f12, hairStyle: 'long', outfit: [0xe5484d, 0xffffff], racket: 0xf5d90a } },
    { id: 'p2', name: 'Bima Aryasatya', nick: 'The Scalpel', gender: 'M', country: { code: 'IDN', name: 'Indonesia' }, ranking: 7, hand: 'L', side: 'drive', archetype: 'precision',
      attrs: { power: 64, accuracy: 94, reflexes: 78, coverage: 72, stamina: 80, net: 80, defense: 74, wallRead: 78, tactics: 90 }, look: { skin: 3, hair: 0x15110e, hairStyle: 'crop', outfit: [0xc81d25, 0xffffff], racket: 0xffffff } },
    { id: 'p3', name: 'Lukas Verhoeven', nick: 'Thunder', gender: 'M', country: { code: 'NED', name: 'Netherlands' }, ranking: 9, hand: 'R', side: 'drive', archetype: 'smasher',
      attrs: { power: 95, accuracy: 70, reflexes: 70, coverage: 68, stamina: 72, net: 82, defense: 56, wallRead: 62, tactics: 66 }, look: { skin: 0, hair: 0xd8b25c, hairStyle: 'short', outfit: [0xf28c28, 0x222222], racket: 0x222222 } },
    { id: 'p4', name: 'Camila Ferreyra', nick: 'Cami', gender: 'F', country: { code: 'ARG', name: 'Argentina' }, ranking: 3, hand: 'R', side: 'either', archetype: 'allRound',
      attrs: { power: 74, accuracy: 84, reflexes: 82, coverage: 80, stamina: 84, net: 80, defense: 80, wallRead: 82, tactics: 86 }, look: { skin: 1, hair: 0x4a2a16, hairStyle: 'ponytail', outfit: [0x8a5cf6, 0xffffff], racket: 0xff7ab6 } },
    { id: 'p5', name: 'Annetta Arslan H', nick: 'Annetta', gender: 'F', country: { code: 'IDN', name: 'Indonesia' }, ranking: 6, hand: 'R', side: 'reves', archetype: 'counterpuncher',
      attrs: { power: 62, accuracy: 82, reflexes: 90, coverage: 90, stamina: 86, net: 66, defense: 88, wallRead: 90, tactics: 84 }, look: { skin: 3, hair: 0x0b0b0d, hairStyle: 'bun', outfit: [0xe5484d, 0xfff4b3], racket: 0xfff4b3 } },
    { id: 'p6', name: 'Hana Kobayashi', nick: 'Glass Hana', gender: 'F', country: { code: 'JPN', name: 'Japan' }, ranking: 8, hand: 'L', side: 'reves', archetype: 'wallSpecialist',
      attrs: { power: 58, accuracy: 80, reflexes: 82, coverage: 78, stamina: 90, net: 60, defense: 90, wallRead: 92, tactics: 78 }, look: { skin: 1, hair: 0x14100c, hairStyle: 'bob', outfit: [0x14b8a6, 0xffffff], racket: 0x1e6bd6 } },
    { id: 'p7', name: 'Marta Lindqvist', nick: 'Viking', gender: 'F', country: { code: 'SWE', name: 'Sweden' }, ranking: 5, hand: 'R', side: 'drive', archetype: 'smasher',
      attrs: { power: 90, accuracy: 72, reflexes: 74, coverage: 70, stamina: 76, net: 86, defense: 58, wallRead: 64, tactics: 70 }, look: { skin: 0, hair: 0xe8d28c, hairStyle: 'ponytail', outfit: [0x2563eb, 0xf5d90a], racket: 0xf5d90a } }
  ];

  const SWING = { // seconds from swing start to racket contact
    groundstroke: 0.24, volleyFH: 0.12, volleyBH: 0.12, bandeja: 0.28, vibora: 0.28, smash: 0.30, kickSmash: 0.30, lowDef: 0.2, wallPrep: 0.22, serveHit: 0.18
  };
  const COMMIT = 0.34; // time before contact at which the shot is chosen

  const P = HPO.mod.players = {
    now: 0, list: [], byId: {}, ROSTER: ROSTER,
    roster() { return ROSTER; },
    createCustom(input) {
      const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Enter a name of 1–40 characters.');
      if (input.gender !== 'M' && input.gender !== 'F') throw new Error('Choose a gender.');
      if (!Number.isInteger(input.seed) || input.seed < 1 || input.seed > 4294967295) throw new Error('Invalid player seed.');
      const id = 'custom-' + input.seed.toString(16), existing = ROSTER.find(r => r.id === id);
      if (existing) return existing;
      const rg = HPO.makeRng(input.seed), attrs = {};
      ['power', 'accuracy', 'reflexes', 'coverage', 'stamina', 'net', 'defense', 'wallRead', 'tactics'].forEach(k => { attrs[k] = rg.int(55, 95); });
      const colors = [0x177dc5, 0xe5484d, 0x14b8a6, 0x8a5cf6, 0xf28c28, 0x123954];
      const def = { id, name, nick: name.split(' ')[0], gender: input.gender, country: { code: 'IDN', name: 'Indonesia' },
        seed: input.seed, custom: true, ranking: rg.int(10, 99), hand: rg.pick(['R', 'R', 'L']), side: 'either',
        archetype: rg.pick(['netAttacker', 'wallSpecialist', 'allRound', 'smasher', 'precision', 'counterpuncher']), attrs,
        look: { skin: rg.int(0, 3), hair: rg.pick([0x15110e, 0x4a2a16, 0x2a1d14]),
          hairStyle: rg.pick(input.gender === 'F' ? ['ponytail', 'bun', 'bob', 'short'] : ['short', 'crop', 'long']),
          outfit: [rg.pick(colors), rg.pick([0xffffff, 0xfff4b3, 0x123954])], racket: rg.pick(colors) } };
      ROSTER.push(def); return def;
    },
    restoreCustom(def) {
      if (!def || def.custom !== true || def.id !== 'custom-' + Number(def.seed).toString(16)) throw new Error('Invalid saved player.');
      return P.createCustom(def);
    },
    get(id) { return P.byId[id]; },
    team(t) { return P.list.filter(p => p.team === t); },
    other(p) { return P.list.find(q => q.team === p.team && q !== p); },

    // build live players for two teams (arrays of roster ids)
    setup(idsA, idsB) {
      P.list = []; P.byId = {}; P.now = 0;
      [['A', idsA], ['B', idsB]].forEach(function (pair) {
        pair[1].forEach(function (id, slot) {
          const def = ROSTER.find(r => r.id === id);
          const p = {
            id: def.id, def: def, name: def.name, attrs: def.attrs, hand: def.hand, team: pair[0], slot: slot,
            pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, heading: 0, speed: 0,
            anim: { clip: 'idle', t: 0, rate: 1 }, fatigue: 0, confidence: 0.5,
            intent: { type: 'idle' }, swing: null, plan: null, planAt: -9, reactUntil: 0, retrieving: false,
            stats: newStats()
          };
          P.list.push(p); P.byId[p.id] = p;
        });
      });
      P.place();
    },
    // facing direction of a team (towards the net)
    facing(team) { return HPO.court.sides[team] < 0 ? 0 : Math.PI; },
    place() {
      P.list.forEach(function (p) {
        const sx = HPO.court.sides[p.team];
        p.pos = { x: sx * 7.5, z: (p.slot === 0 ? 1 : -1) * 2.2 };
        p.vel = { x: 0, z: 0 }; p.heading = P.facing(p.team); p.swing = null; p.intent = { type: 'idle' };
      });
    },
    setIntent(id, intent) { const p = P.byId[id]; if (p) p.intent = intent; },
    vmax(p) {
      const venue = HPO.mod.court && HPO.mod.court.def ? (HPO.mod.court.def.speedMult || 1) : 1;
      return (4.5 + 1.8 * lvl(p.attrs.coverage)) * (1 - 0.18 * p.fatigue) * venue * (HPO.cfg.TUNE.speed || 1);
    },
    accel(p) { return 9 + 4 * lvl(p.attrs.reflexes); },
    reactDelay(p) { return 0.26 - 0.14 * lvl(p.attrs.reflexes); },
    rightVec(team) { const f = P.facing(team); const d = { x: Math.cos(f), z: Math.sin(f) }; return { x: -d.z, z: d.x }; },

    // --- candidate strikes along the predicted ball path ---
    candidates(p) {
      const B = HPO.mod.ball, bs = B.state;
      if (bs.state !== 'live') return [];
      if (bs.lastHitTeam === p.team) return [];
      const sx = HPO.court.sides[p.team];
      const pred = cachePred();
      const serveRet = bs.hitsSinceServe === 1;
      const own0 = bs.bouncesOnSide[p.team] || 0;
      const out = [], seen = {};
      const vmax = P.vmax(p), a = P.accel(p), nav = HPO.mod.nav;
      const tStart = Math.max(0.05, p.reactUntil - P.now);
      let ownB = own0, ci = 0, walls = 0;
      const fl = pred.floor, wl = pred.walls;
      for (let i = 0; i < pred.samples.length; i++) {
        const s = pred.samples[i];
        while (ci < fl.length && fl[ci].t <= s.t) { if (HPO.court.regionOf(fl[ci].p.x, fl[ci].p.z) === p.team) ownB++; ci++; }
        walls = 0; for (let k = 0; k < wl.length; k++) if (wl[k] <= s.t) walls++;
        if (s.t < tStart) continue;
        if (ownB > 1) break;
        if (serveRet && ownB < 1) continue;
        if (s.p.x * sx < 0.15 || s.p.y < 0.2 || s.p.y > 2.95) continue;
        if (Math.abs(s.p.x) > 9.9 || Math.abs(s.p.z) > 4.95) continue;
        // can the body get close enough in time? racket reach 0.8 m, stretch to 1.15
        const dx = s.p.x - p.pos.x, dz = s.p.z - p.pos.z, d = Math.hypot(dx, dz);
        const vp = d > 0.01 ? Math.max(0, (p.vel.x * dx + p.vel.z * dz) / d) : 0;
        const tNeed = nav.timeTo(Math.max(0, d - 0.95), vp, vmax, a);
        const slack = s.t - tNeed;
        if (slack < 0) continue;
        const key = ownB + ':' + walls;
        if (seen[key] >= 2) continue;
        seen[key] = (seen[key] || 0) + 1;
        out.push({
          t: P.now + s.t, dt: s.t, p: s.p, v: s.v, ownBounces: ownB, walls: walls, slack: slack, reach: d,
          ballSpeed: U.len3(s.v), afterWall: walls > 0, afterBounce: ownB > 0
        });
        if (out.length >= 10) break;
      }
      return out;
    },

    // ---- main update (60 Hz) ----
    update(dt) {
      P.now += dt;
      const bs = HPO.mod.ball.state;
      P.list.forEach(function (p) { stepPlayer(p, dt, bs); });
      // teammate separation + net/bounds
      for (let i = 0; i < P.list.length; i++) for (let j = i + 1; j < P.list.length; j++) {
        const a = P.list[i], b = P.list[j];
        if (a.team !== b.team) continue;
        const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.7 && d > 1e-4) { const push = (0.7 - d) * 0.5; a.pos.x += dx / d * push; a.pos.z += dz / d * push; b.pos.x -= dx / d * push; b.pos.z -= dz / d * push; }
      }
    },

    // serve routine: use with `yield* HPO.mod.players.serveSequence(...)`, runs inside a scheduler coroutine
    serveSequence: function* (id, target, attempt, effort) {
      const p = P.byId[id], B = HPO.mod.ball, S = HPO.sched;
      const sx = HPO.court.sides[p.team], rs = HPO.court.rightSign(p.team);
      const deuce = (HPO.mod.rules && HPO.mod.rules.state && HPO.mod.rules.state.serveSide === 'ad') ? -1 : 1;
      const spot = { x: sx * 8.2, z: rs * deuce * 1.9 };
      p.intent = { type: 'move', x: spot.x, z: spot.z, cap: 0.7, face: P.facing(p.team) };
      yield S.until(function () { return Math.hypot(p.pos.x - spot.x, p.pos.z - spot.z) < 0.25 && p.speed < 0.6; }, 5);
      p.intent = { type: 'hold' };
      p.anim = { clip: 'serveBounce', t: 0, rate: 1 };
      const f = P.facing(p.team), rv = P.rightVec(p.team);
      const hs = p.hand === 'R' ? -1 : 1; // the ball is held in the non-racket hand
      const hand = { x: p.pos.x + Math.cos(f) * 0.35 + rv.x * 0.3 * hs, y: 0.95, z: p.pos.z + Math.sin(f) * 0.35 + rv.z * 0.3 * hs };
      B.hold(hand);
      yield S.wait(0.5);
      BUS.emit('serve:toss', { playerId: id });
      B.launch({ p: { x: hand.x, y: hand.y, z: hand.z }, v: { x: 0, y: -1.2, z: 0 }, w: { x: 0, y: 0, z: 0 } });
      const noise = HPO.streams.exec.normal(0, 0.035);
      const strikeY = 0.86 + noise;
      yield S.until(function () { return B.state.state !== 'live' || (B.state.floorBouncesSinceHit >= 1 && B.state.v.y < 0 && B.state.p.y <= strikeY); }, 3);
      if (B.state.state !== 'live') return;
      p.swing = { kind: 'serve', clip: 'serveHit', tc: P.now + 0.0, start: P.now, done: true };
      p.anim = { clip: 'serveHit', t: 0, rate: 1 };
      const bp = { x: B.state.p.x, y: B.state.p.y, z: B.state.p.z };
      const nom = HPO.mod.shots.nominal(bp, 'serve', target, { effort: effort === undefined ? 0.5 : effort });
      const ex = HPO.mod.shots.execute(nom, execCtx(p, 0.3, 0.15 + 0.15 * (attempt - 1), 0));
      B.launch({ p: bp, v: ex.v, w: ex.w, hitter: id, team: p.team, serve: true });
      p.stats.shots++;
      BUS.emit('serve:hit', { playerId: id, attempt: attempt, y: bp.y });
      BUS.emit('shot:hit', { playerId: id, shot: 'serve', p: bp, v: ex.v, w: ex.w, quality: ex.quality, t: P.now, pressure: 0.2, reached: true, difficulty: 0.3, serve: true, attempt: attempt });
      yield S.wait(0.15);
      p.swing = null; p.intent = { type: 'idle' };
    },

    adjustConfidence(id, d) { const p = P.byId[id]; if (p) p.confidence = U.clamp(p.confidence + d, 0.05, 0.98); },
    rest(amount) { P.list.forEach(p => { p.fatigue = Math.max(0, p.fatigue - amount); }); },
    setAnim(id, clip, rate) { const p = P.byId[id]; if (p) p.anim = { clip: clip, t: 0, rate: rate || 1 }; },
    reset() { P.list.forEach(p => { p.swing = null; p.plan = null; p.intent = { type: 'idle' }; p.vel = { x: 0, z: 0 }; }); invalidate(); }
  };

  function newStats() {
    return { distance: 0, winners: 0, unforced: 0, forced: 0, volleyWinners: 0, smashWinners: 0, aces: 0, doubleFaults: 0, lobsSuccess: 0, lobs: 0, wallRecoveries: 0,
      netPointsWon: 0, netPointsPlayed: 0, shots: 0, whiffs: 0, firstServeIn: 0, firstServeTotal: 0, secondPtsWon: 0, secondPtsPlayed: 0, bpFaced: 0, bpWon: 0 };
  }

  // prediction cache: rebuilt after any hit/contact or every 0.25 s
  let predCache = null, predAt = -9, predDirty = true;
  function invalidate() { predDirty = true; }
  BUS.on('shot:hit', invalidate); BUS.on('ball:contact', invalidate); BUS.on('serve:toss', invalidate);
  function cachePred() {
    if (!predDirty && P.now - predAt < 0.25 && predCache) {
      return rebase(predCache);
    }
    const pr = HPO.mod.ball.predict(null, 4.5, 60);
    const floor = pr.contacts.filter(c => c.surf === 'floor');
    const walls = pr.contacts.filter(c => HPO.mod.court.isWall(c.surf)).map(c => c.t);
    predCache = { at: P.now, samples: pr.samples, floor: floor, walls: walls };
    predAt = P.now; predDirty = false;
    return rebase(predCache);
  }
  // shift cached relative times to now (cheap: copy only when stale by > 1 tick)
  function rebase(c) {
    const off = P.now - c.at;
    if (off < 1e-6) return c;
    const samples = [];
    for (let i = 0; i < c.samples.length; i++) { const s = c.samples[i]; if (s.t - off >= 0) samples.push({ t: s.t - off, p: s.p, v: s.v, w: s.w, floorBounces: s.floorBounces }); }
    return { at: P.now, samples: samples, floor: c.floor.map(x => ({ t: x.t - off, p: x.p })), walls: c.walls.map(t => t - off) };
  }

  let rallyN = 0;
  BUS.on('point:start', function () { rallyN = 0; });
  BUS.on('shot:hit', function (e) {
    rallyN++;
    // opponents need a moment to read the shot before they commit to moving
    const h = P.byId[e.playerId];
    P.list.forEach(function (q) { if (h && q.team !== h.team) q.reactUntil = P.now + P.reactDelay(q) * (HPO.cfg.TUNE.react || 1); });
  });
  P.execCtx = execCtx;
  function execCtx(p, difficulty, pressure, stretch) {
    const tune = HPO.cfg.TUNE.rally || { from: 10, per: 0.1 };
    const fat = p.fatigue + Math.max(0, rallyN - tune.from) * tune.per + Math.max(0, rallyN - 24) * 0.2; // very long rallies always crack
    return { accuracy: p.attrs.accuracy, difficulty: difficulty, pressure: pressure, fatigue: fat, confidence: p.confidence, stretch: stretch };
  }

  function stepPlayer(p, dt, bs) {
    const sx = HPO.court.sides[p.team];
    const nav = HPO.mod.nav, it = p.intent;
    // --- planning for interception ---
    const reacting = P.now < p.reactUntil;
    if (it.type === 'intercept' && !p.swing && !reacting) {
      if (P.now - p.planAt > 0.1 || p.plan === null) {
        p.planAt = P.now;
        const cands = P.candidates(p);
        const ai = HPO.mod.ai;
        const pick = cands.length ? (ai && ai.chooseStrike ? ai.chooseStrike(p, cands) : cands[0]) : null;
        p.plan = pick;
      }
      const pl = p.plan;
      if (pl) {
        // body target: stand 0.65 m from the contact point on the side the racket arm is
        const dx = pl.p.x - p.pos.x, dz = pl.p.z - p.pos.z, d = Math.hypot(dx, dz) || 1;
        const off = Math.min(0.65, d);
        p.target = { x: pl.p.x - dx / d * off, z: pl.p.z - dz / d * off };
        if (pl.t - P.now <= COMMIT) commitSwing(p, pl, bs);
      } else {
        p.target = null;
      }
    }
    if (it.type !== 'intercept') p.plan = null;

    // --- desired velocity ---
    let tgt = null, cap = 1;
    if (it.type === 'move') { tgt = { x: it.x, z: it.z }; cap = it.cap === undefined ? 1 : it.cap; }
    else if (it.type === 'intercept' && p.target && !reacting) { tgt = p.target; cap = 1; }
    else if (it.type === 'intercept') { tgt = null; }
    const vmax = P.vmax(p) * cap * (p.swing ? 0.9 : 1);
    let dvx = 0, dvz = 0;
    if (tgt && it.type !== 'hold') {
      const dx = tgt.x - p.pos.x, dz = tgt.z - p.pos.z, d = Math.hypot(dx, dz);
      const brake = 13;
      const vd = Math.min(vmax, Math.sqrt(2 * brake * Math.max(0, d - 0.03)));
      if (d > 1e-3) { dvx = dx / d * vd; dvz = dz / d * vd; }
    }
    // teammate avoidance
    P.list.forEach(function (q) {
      if (q === p || q.team !== p.team) return;
      const s = nav.separation(p.pos, q.pos, 1.15);
      dvx += s.x * 2.2; dvz += s.z * 2.2;
    });
    const a = P.accel(p), dvx2 = dvx - p.vel.x, dvz2 = dvz - p.vel.z, dl = Math.hypot(dvx2, dvz2);
    const maxd = (dl > 0 && Math.hypot(dvx, dvz) < Math.hypot(p.vel.x, p.vel.z) ? 13 : a) * dt;
    if (dl > maxd) { p.vel.x += dvx2 / dl * maxd; p.vel.z += dvz2 / dl * maxd; } else { p.vel.x = dvx; p.vel.z = dvz; }
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    nav.clamp(p.pos, nav.bounds(sx, p.retrieving));
    p.speed = Math.hypot(p.vel.x, p.vel.z);

    // fatigue and distance
    const step = p.speed * dt;
    p.stats.distance += step;
    p.fatigue = Math.min(1, p.fatigue + step * 0.00012 * (1.2 - 0.7 * lvl(p.attrs.stamina)));

    // heading
    const face = P.facing(p.team);
    let th = it.face !== undefined && typeof it.face === 'number' ? it.face : face;
    if (p.swing && p.swing.dirAngle !== undefined) th = p.swing.dirAngle;
    else if (p.speed > 2.5) {
      const vf = p.vel.x * Math.cos(face) + p.vel.z * Math.sin(face);
      if (vf < -2.2) th = Math.atan2(p.vel.z, p.vel.x); // retreating: turn and run
    }
    const diff = U.angleDiff(p.heading, th), turn = 12 * dt;
    p.heading += Math.abs(diff) < turn ? diff : Math.sign(diff) * turn;

    // --- swing execution ---
    if (p.swing && !p.swing.done && P.now >= p.swing.tc - 0.03) {
      // strike as soon as the ball is within racket reach inside the contact window; give up shortly after
      const dd = Math.hypot(bs.p.x - p.pos.x, bs.p.z - p.pos.z);
      const wait = (bs.hitsSinceServe === 1 && (bs.bouncesOnSide[p.team] || 0) < 1) || bs.p.y < 0.1; // a serve must bounce first; the racket cannot reach a ball lying on the floor
      if (!wait && (dd <= 1.05 || P.now >= p.swing.tc + 0.12)) executeSwing(p, bs);
      else if (wait && P.now >= p.swing.tc + 0.3) p.swing.done = true;
    }
    if (p.swing && P.now > p.swing.tc + 0.4) p.swing = null;

    // animation selection (rigs may override via setAnim during scripted phases)
    if (p.swing) { /* clip set at commit */ }
    else if (it.type === 'hold') { /* scripted */ }
    else {
      const lat = Math.abs(p.vel.x * -Math.sin(face) + p.vel.z * Math.cos(face)), fwd = Math.abs(p.vel.x * Math.cos(face) + p.vel.z * Math.sin(face));
      let clip = p.speed < 0.3 ? 'idle' : p.speed < 1.6 ? 'walk' : p.speed < 3.6 ? 'jog' : 'sprint';
      if (p.speed >= 1.2 && lat > fwd * 1.3) clip = 'shuffle';
      if (p.speed < 0.5 && bs.state === 'live' && bs.lastHitTeam !== p.team && p.speed < 0.5 && it.type === 'intercept') clip = 'splitStep';
      if (p.anim.clip !== clip) p.anim = { clip: clip, t: 0, rate: 1 };
    }
    p.anim.t += dt * (p.anim.rate || 1);
  }

  function commitSwing(p, pl, bs) {
    const ai = HPO.mod.ai;
    const info = {
      p: pl.p, v: pl.v, dt: pl.t - P.now, slack: pl.slack, walls: pl.walls, ownBounces: pl.ownBounces, afterWall: pl.afterWall,
      ballSpeed: pl.ballSpeed, fh: isForehand(p, pl.p), height: pl.p.y, reach: pl.reach
    };
    const pick = ai && ai.decideShot ? ai.decideShot(p, info) : { kind: 'flatGround', target: { x: -HPO.court.sides[p.team] * 6, z: 0 }, effort: 0.5 };
    if (!pick) { p.plan = null; p.swing = null; p.intent = { type: 'move', x: p.pos.x, z: p.pos.z }; return; }
    let kind = pick.kind;
    if (kind === 'volley') kind = info.fh ? 'volleyFH' : 'volleyBH';
    const def = HPO.mod.shots.SHOTS[kind];
    const clip = def.anim;
    const lead = SWING[clip] || 0.22;
    const tc = Math.max(P.now + 0.05, pl.t);
    p.swing = {
      kind: kind, target: pick.target, effort: pick.effort, spin: pick.spinScale, netMargin: pick.netMargin, warm: !!pick.warm, tc: tc, start: tc - lead, clip: clip, fh: info.fh, info: info,
      reason: pick.reason, intent: pick.intent, done: false, planAt: p.planAt,
      dirAngle: Math.atan2(pick.target.z - p.pos.z, pick.target.x - p.pos.x) * 0.55 + P.facing(p.team) * 0.45
    };
    p.anim = { clip: clip + (info.fh ? '' : ''), t: 0, rate: 1, fh: info.fh };
    BUS.emit('shot:planned', { playerId: p.id, shot: kind, target: pick.target, intent: pick.intent || 'rally', reason: pick.reason });
  }

  function isForehand(p, pt) {
    const rv = P.rightVec(p.team);
    const lat = (pt.x - p.pos.x) * rv.x + (pt.z - p.pos.z) * rv.z;
    return p.hand === 'R' ? lat >= -0.05 : lat <= 0.05;
  }

  function executeSwing(p, bs) {
    const sw = p.swing; sw.done = true;
    const B = HPO.mod.ball, sx = HPO.court.sides[p.team];
    const bpos = bs.p;
    const d = Math.hypot(bpos.x - p.pos.x, bpos.z - p.pos.z);
    const legal = bs.state === 'live' && bs.lastHitTeam !== p.team && bpos.x * sx > 0.05 && bpos.y > 0.08 && bpos.y < 3.05;
    if (!legal || d > 1.2) { p.stats.whiffs++; p.plan = null; P.lastWhiff = { id: p.id, legal: legal, d: d, st: bs.state, last: bs.lastHitTeam, x: bpos.x, y: bpos.y, sx: sx, kind: sw.kind }; return; }
    const stretch = U.clamp((d - 0.8) / 0.4, 0, 1);
    const speed = U.len3(bs.v);
    const bp = { x: bpos.x, y: bpos.y, z: bpos.z };
    const diff = sw.warm ? 0.15 : HPO.mod.shots.difficulty(sw.kind, bp.y, speed, stretch);
    const tmargin = U.clamp(sw.info.slack / 0.6, 0, 1);
    const pressure = sw.warm ? 0.05 : U.clamp(0.75 * (1 - tmargin) + 0.01 * Math.max(0, speed - 12) + (sw.info.afterWall ? 0.08 : 0), 0, 1);
    const nom = HPO.mod.shots.nominal(bp, sw.kind, sw.target, { effort: sw.effort, spinScale: sw.spin, netMargin: sw.netMargin });
    const ex = HPO.mod.shots.execute(nom, execCtx(p, diff, pressure, stretch));
    B.launch({ p: bp, v: ex.v, w: ex.w, hitter: p.id, team: p.team });
    p.stats.shots++;
    p.plan = null;
    BUS.emit('shot:hit', {
      playerId: p.id, shot: sw.kind, p: bp, v: ex.v, w: ex.w, quality: ex.quality, t: P.now, pressure: pressure, reached: true, difficulty: diff,
      afterWall: sw.info.afterWall, afterBounce: sw.info.afterBounce, nominalFeasible: nom.feasible, target: sw.target, intent: sw.intent, reason: sw.reason, stretch: stretch
    });
  }
})(HPO);
