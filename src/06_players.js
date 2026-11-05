// Players: roster, attributes, kinematics, predictive interception, strike execution, serve routine.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, CFG = HPO.cfg, _ = HPO.t;
  const lvl = a => U.clamp((a - 30) / 65, 0.02, 1);
  // a smash struck close to the net leaves the defenders less to read than one struck from the back of the court
  function smashDepthRead(hitter) {
    const T = HPO.cfg.TUNE, near = T.smashNear === undefined ? 1.8 : T.smashNear, far = T.smashFar === undefined ? 0.55 : T.smashFar;
    return near + (far - near) * U.clamp((Math.abs(hitter.pos.x) - 3) / 4, 0, 1);
  }

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
    { id: 'p5', name: 'Annetta Arslan', nick: 'Annetta', gender: 'F', country: { code: 'IDN', name: 'Indonesia' }, ranking: 6, hand: 'R', side: 'reves', archetype: 'counterpuncher',
      attrs: { power: 62, accuracy: 82, reflexes: 90, coverage: 90, stamina: 86, net: 66, defense: 88, wallRead: 90, tactics: 84 }, look: { skin: 0, hair: 0x101c47, hairStyle: 'bob', outfit: [0xfffaf0, 0x1f55c4], racket: 0x14275f, mascot: true } },
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
      if (!name || name.length > 40 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error(_('Enter a name of 1–40 characters.'));
      if (input.gender !== 'M' && input.gender !== 'F') throw new Error(_('Choose a gender.'));
      if (!Number.isInteger(input.seed) || input.seed < 1 || input.seed > 4294967295) throw new Error(_('Invalid player seed.'));
      const id = 'custom-' + input.seed.toString(16), existing = ROSTER.find(r => r.id === id);
      if (existing) return existing;
      const rg = HPO.makeRng(input.seed), attrs = {};
      ['power', 'accuracy', 'reflexes', 'coverage', 'stamina', 'net', 'defense', 'wallRead', 'tactics'].forEach(k => { attrs[k] = rg.int(55, 95); });
      const colors = [0x177dc5, 0xe5484d, 0x14b8a6, 0x8a5cf6, 0xf28c28, 0x123954];
      const def = { id, name, nick: name.split(' ')[0], gender: input.gender, country: (input.country && /^[A-Z]{3}$/.test(input.country.code) && typeof input.country.name === 'string' && input.country.name.length <= 40) ? { code: input.country.code, name: input.country.name } : { code: 'IDN', name: 'Indonesia' },
        seed: input.seed, custom: true, ranking: rg.int(10, 99), hand: rg.pick(['R', 'R', 'L']), side: 'either',
        archetype: rg.pick(['netAttacker', 'wallSpecialist', 'allRound', 'smasher', 'precision', 'counterpuncher']), attrs,
        look: { skin: rg.int(0, 3), hair: rg.pick([0x15110e, 0x4a2a16, 0x2a1d14]),
          hairStyle: rg.pick(input.gender === 'F' ? ['ponytail', 'bun', 'bob'] : ['short', 'crop']),
          outfit: [rg.pick(colors), rg.pick([0xffffff, 0xfff4b3, 0x123954])], racket: rg.pick(colors) } };
      ROSTER.push(def); return def;
    },
    restoreCustom(def) {
      if (!def || def.custom !== true || def.id !== 'custom-' + Number(def.seed).toString(16)) throw new Error(_('Invalid saved player.'));
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
        // home lane (+1 = the team's right, -1 = left) is fixed for the match: drive plays right, reves left; ties and 'either' keep slot order
        const pair2 = P.list.filter(q => q.team === pair[0]);
        pair2.forEach(q => { q.homeLane = q.def.side === 'drive' ? 1 : q.def.side === 'reves' ? -1 : 0; });
        if (pair2.length === 2) {
          const a = pair2[0], b = pair2[1];
          if (a.homeLane === 0 && b.homeLane === 0) { a.homeLane = 1; b.homeLane = -1; }
          else if (a.homeLane === 0) a.homeLane = -b.homeLane;
          else if (b.homeLane === 0) b.homeLane = -a.homeLane;
          else if (a.homeLane === b.homeLane) b.homeLane = -a.homeLane;
        }
      });
      P.place();
    },
    // facing direction of a team (towards the net)
    facing(team) { return HPO.court.sides[team] < 0 ? 0 : Math.PI; },
    place() {
      P.list.forEach(function (p) {
        const sx = HPO.court.sides[p.team];
        p.pos = { x: sx * 7.5, z: (p.slot === 0 ? 1 : -1) * 2.2 };
        p.vel = { x: 0, z: 0 }; p.heading = P.facing(p.team); p.swing = null; p.intent = { type: 'idle' }; p.salvaging = false;
      });
    },
    setIntent(id, intent) { const p = P.byId[id]; if (p) p.intent = intent; },
    vmax(p) {
      const venue = HPO.mod.court && HPO.mod.court.def ? (HPO.mod.court.def.speedMult || 1) : 1;
      return (4.5 + 1.8 * lvl(p.attrs.coverage)) * (1 - 0.18 * p.fatigue) * venue * (HPO.cfg.TUNE.speed || 1);
    },
    accel(p) { return 9 + 4 * lvl(p.attrs.reflexes); },
    reactDelay(p) { return 0.26 - 0.14 * lvl(p.attrs.reflexes); },
    // extra time to read a shot: pace, a short distance from the hitter and the overhead swing all leave less to see before the ball arrives
    readDelay(q, e, hitter) {
      const T = HPO.cfg.TUNE.readScale === undefined ? 1.265 : HPO.cfg.TUNE.readScale;
      const sp = Math.hypot(e.v.x, e.v.y, e.v.z), gap = Math.abs(hitter.pos.x - q.pos.x);
      const fast = U.clamp((sp - 12) / 16, 0, 1), close = U.clamp(1 - gap / 9, 0, 1);
      const smash = e.shot === 'smashFlat' || e.shot === 'smashKick' ? 1 : 0;
      const sr = (HPO.cfg.TUNE.smashRead === undefined ? 0.2 : HPO.cfg.TUNE.smashRead) * smashDepthRead(hitter);
      return T * (0.12 * fast + 0.12 * close + sr * smash) * (1.35 - 0.7 * lvl(q.attrs.reflexes));
    },
    // only the quickest players try to save a ball that has flown out of the court (see candidates)
    canSalvage(p) {
      const T = HPO.cfg.TUNE.salvageSkill === undefined ? 80 : HPO.cfg.TUNE.salvageSkill;
      return p.salvageOK === true && 0.5 * p.attrs.reflexes + 0.5 * p.attrs.coverage >= T;
    },
    // walking distance when the way out of the court is the open entrance at the net (x about 0, z +-5)
    routeLen(from, to) {
      const sz = (Math.abs(to.z) > 4.95 ? to.z : from.z) >= 0 ? 1 : -1, g1 = { x: 0, z: sz * 4.2 }, g2 = { x: 0, z: sz * 6.0 };
      const fromIn = Math.abs(from.z) < 4.9 && Math.abs(from.x) < 9.9;
      return fromIn ? Math.hypot(from.x - g1.x, from.z - g1.z) + 1.8 + Math.hypot(to.x - g2.x, to.z - g2.z) : Math.hypot(to.x - from.x, to.z - from.z);
    },
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
      const vmax = P.vmax(p), a = P.accel(p), nav = HPO.mod.nav, salv = P.canSalvage(p);
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
        if (s.p.x * sx < 0.15 || s.p.y < 0.2) continue;
        const beyond = Math.abs(s.p.x) > 9.9 || Math.abs(s.p.z) > 4.95;
        // A top player may still go for a ball that bounced in and flew out. Just clearing the fence (up to 3.6 m): leap and play it from
        // inside the glass. Lower and further out: through the entrance, then hit it in the air.
        const above = s.p.y > 2.95;
        if (above && !(beyond && salv && ownB === 1 && s.p.y <= 3.6 && Math.abs(s.p.x) < 10.7 && Math.abs(s.p.z) < 5.7)) continue;
        const outside = beyond && !above;
        if (outside && !(salv && ownB === 1 && Math.abs(s.p.x) < 12.5 && Math.abs(s.p.z) < 7.5)) continue;
        // can the body get close enough in time? racket reach 0.8 m, stretch to 1.15
        const gx = above ? U.clamp(s.p.x, -9.6, 9.6) : s.p.x, gz = above ? U.clamp(s.p.z, -4.6, 4.6) : s.p.z;
        const dx = gx - p.pos.x, dz = gz - p.pos.z, d = outside ? P.routeLen(p.pos, s.p) : Math.hypot(dx, dz);
        const vp = d > 0.01 && !outside ? Math.max(0, (p.vel.x * dx + p.vel.z * dz) / d) : 0;
        const tNeed = nav.timeTo(Math.max(0, d - 0.95), vp, vmax, a);
        const slack = s.t - tNeed - (tStart > 0.05 ? tStart : 0);   // the body only starts moving once the shot has been read
        if (slack < 0) continue;
        const key = ownB + ':' + walls;
        if (seen[key] >= 2) continue;
        seen[key] = (seen[key] || 0) + 1;
        out.push({
          t: P.now + s.t, dt: s.t, p: s.p, v: s.v, ownBounces: ownB, walls: walls, slack: slack, reach: d,
          ballSpeed: U.len3(s.v), afterWall: walls > 0, afterBounce: ownB > 0, outside: outside, above: above
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
  BUS.on('point:start', function () { rallyN = 0; P.list.forEach(function (q) { q.salvageOK = HPO.streams.ai.chance(0.7); }); });
  BUS.on('shot:hit', function (e) {
    rallyN++;
    P.lastKind = e.shot; P.lastKindAt = P.now;
    // opponents need a moment to read the shot before they commit to moving
    const h = P.byId[e.playerId];
    P.list.forEach(function (q) { if (h && q.team !== h.team) q.reactUntil = P.now + P.reactDelay(q) * (HPO.cfg.TUNE.react || 1) + P.readDelay(q, e, h); });
  });
  P.execCtx = execCtx;
  function execCtx(p, difficulty, pressure, stretch) {
    const tune = HPO.cfg.TUNE.rally || { from: 10, per: 0.1 };
    const fat = p.fatigue + Math.max(0, rallyN - tune.from) * tune.per + Math.max(0, rallyN - 20) * 0.25 + Math.max(0, rallyN - 24) * 0.6; // very long rallies always crack (the 45 s point watchdog is about 34 strokes)
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
        if (pl.above) { p.target.x = U.clamp(p.target.x, -9.5, 9.5); p.target.z = U.clamp(p.target.z, -4.5, 4.5); }
        if (pl.t - P.now <= COMMIT) commitSwing(p, pl, bs);
      } else {
        p.target = null;
      }
    }
    if (it.type !== 'intercept') p.plan = null;
    if (p.plan && p.plan.outside) p.salvaging = true;
    else if (p.salvaging && Math.abs(p.pos.z) < 4.5 && Math.abs(p.pos.x) < 9.4) p.salvaging = false;   // back inside the glass

    // --- desired velocity ---
    let tgt = null, cap = 1;
    if (it.type === 'move') { tgt = { x: it.x, z: it.z }; cap = it.cap === undefined ? 1 : it.cap; }
    else if (it.type === 'intercept' && p.target && !reacting) { tgt = p.target; cap = 1; }
    else if (it.type === 'intercept') { tgt = null; }
    if (tgt && p.salvaging) tgt = viaEntrance(p.pos, tgt);
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
    // Clamp to the half the player is standing on, not the half their team now owns: when the sides flip at the end of a game the
    // old bounds would shove everyone to the net in one frame. The changeover walks them across through the entrance instead.
    nav.clamp(p.pos, nav.bounds(Math.abs(p.pos.x) > 0.55 ? Math.sign(p.pos.x) : sx, p.retrieving || p.salvaging));
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

  // The fence has one gap, the entrance at the net: walk to it, through it, then on to the target (and back the same way).
  function viaEntrance(pos, t) {
    const inCourt = q => Math.abs(q.z) < 4.9 && Math.abs(q.x) < 9.9;
    const pi = inCourt(pos), ti = inCourt(t);
    if (pi === ti) return t;
    const sz = (pi ? t.z : pos.z) >= 0 ? 1 : -1, A = { x: 0, z: sz * 4.2 }, B = { x: 0, z: sz * 6.0 }, atGate = Math.abs(pos.x) < 0.8;
    if (pi) return atGate && Math.abs(pos.z) > 3.6 ? B : A;                               // inside, heading out
    if (Math.abs(pos.x) > 9.9 && Math.abs(pos.z) < 5.6) return { x: pos.x, z: sz * 6.0 }; // behind the back glass: round the corner first
    return atGate && Math.abs(pos.z) < 6.4 ? A : B;                                       // outside, heading in
  }

  function commitSwing(p, pl, bs) {
    const ai = HPO.mod.ai;
    const info = {
      p: pl.p, v: pl.v, dt: pl.t - P.now, slack: pl.slack, walls: pl.walls, ownBounces: pl.ownBounces, afterWall: pl.afterWall,
      ballSpeed: pl.ballSpeed, fh: isForehand(p, pl.p), height: pl.p.y, reach: pl.reach, outside: !!pl.outside, above: !!pl.above
    };
    const Q = HPO.mod.qte; if (Q && Q.offer && Q.offer(p, pl, info)) return; // QTE open: the sim is paused until the swipe (or time) resolves it
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
      reason: pick.reason, intent: pick.intent, errMul: pick.errMul, done: false, planAt: p.planAt,
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

  // The ball is not quite where the plan had it and the chosen stroke has no way over the net from here. Instead of swinging anyway (the
  // solver's last guess is a wild ball that clears the whole court) play the same ball with less margin, then a lob, then a slice.
  function rescueShot(p, sw, bp, nom0) {
    const S = HPO.mod.shots, ox = -HPO.court.sides[p.team];
    const tries = [[sw.kind, sw.target, Math.max(0.16, 0.6 * (sw.netMargin || 0.2)), sw.effort], ['lobDef', { x: ox * 6.4, z: sw.target.z * 0.5 }, 0.35, 0.4], ['lobOff', { x: ox * 5.6, z: sw.target.z * 0.4 }, 0.35, 0.55], ['slice', { x: ox * 6.0, z: sw.target.z * 0.5 }, 0.12, 0.45]];
    for (let i = 0; i < tries.length; i++) {
      const t = tries[i];
      const n = S.nominal(bp, t[0], t[1], { effort: t[3], spinScale: sw.spin, netMargin: t[2] });
      if (n.feasible) { if (t[0] !== sw.kind) { sw.kind = t[0]; sw.target = t[1]; sw.effort = t[3]; sw.reason = 'rescue'; } return n; }
    }
    return nom0;
  }

  function executeSwing(p, bs) {
    const sw = p.swing; sw.done = true;
    const B = HPO.mod.ball, sx = HPO.court.sides[p.team];
    const bpos = bs.p;
    const d = Math.hypot(bpos.x - p.pos.x, bpos.z - p.pos.z);
    const legal = bs.state === 'live' && bs.lastHitTeam !== p.team && bpos.x * sx > 0.05 && bpos.y > 0.08 && bpos.y < (sw.reason === 'salvage' ? 3.7 : 3.35);
    if (!legal || d > (sw.reason === 'salvage' ? 1.5 : 1.2)) { p.stats.whiffs++; p.plan = null; P.lastWhiff = { reason: sw.reason, id: p.id, legal: legal, d: d, st: bs.state, last: bs.lastHitTeam, x: bpos.x, y: bpos.y, sx: sx, kind: sw.kind }; return; }
    const stretch = U.clamp((d - 0.8) / 0.4, 0, 1);
    const speed = U.len3(bs.v);
    const bp = { x: bpos.x, y: bpos.y, z: bpos.z };
    // the ball that follows a smash arrives fast, heavy and off the glass: returning it is the hard part of the exchange
    const aftermath = !sw.warm && (P.lastKind === 'smashFlat' || P.lastKind === 'smashKick') && P.now - P.lastKindAt < 3.5 ? (HPO.cfg.TUNE.smashAftermath === undefined ? 0.1 : HPO.cfg.TUNE.smashAftermath) : 0;
    const diff = sw.warm ? 0.15 : HPO.mod.shots.difficulty(sw.kind, bp.y, speed, stretch) + aftermath + (sw.reason === 'salvage' ? 0.3 : 0);
    const tmargin = U.clamp(sw.info.slack / 0.6, 0, 1);
    const pressure = sw.warm ? 0.05 : U.clamp(0.75 * (1 - tmargin) + 0.5 * aftermath + 0.02 * Math.max(0, speed - 12) + (sw.info.afterWall ? 0.08 : 0), 0, 1);
    let nom = HPO.mod.shots.nominal(bp, sw.kind, sw.target, { effort: sw.effort, spinScale: sw.spin, netMargin: sw.netMargin });
    if (!nom.feasible && !sw.warm) nom = rescueShot(p, sw, bp, nom);
    const cx = execCtx(p, diff, pressure, stretch); cx.errMul = sw.errMul;
    const ex = HPO.mod.shots.execute(nom, cx);
    B.launch({ p: bp, v: ex.v, w: ex.w, hitter: p.id, team: p.team });
    p.stats.shots++;
    p.plan = null;
    BUS.emit('shot:hit', {
      playerId: p.id, shot: sw.kind, p: bp, v: ex.v, w: ex.w, quality: ex.quality, t: P.now, pressure: pressure, reached: true, difficulty: diff,
      afterWall: sw.info.afterWall, afterBounce: sw.info.afterBounce, nominalFeasible: nom.feasible, target: sw.target, intent: sw.intent, reason: sw.reason, stretch: stretch
    });
  }
})(HPO);
