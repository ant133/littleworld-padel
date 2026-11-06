// Mind: energy, concentration and mood. Energy is `1 - p.fatigue` and only drains; concentration is `p.confidence` and moves both ways around a
// per-player baseline; one mood at a time (MOODS), a timed buff or debuff: it lasts `dur` seconds of match time (scaled by its strength) and then ends. Headless: it listens to the rules events and hands
// small multipliers to players (error, speed, read time) and to the AI (shot weights, who takes a ball). Rules in CONTRACT.md section 10.3.
(function (HPO) {
  'use strict';
  const U = HPO.util, BUS = HPO.BUS, _ = HPO.t;
  const lvl = a => U.clamp((a - 30) / 65, 0.02, 1);
  // target: mean energy an average player has lost by the last point; mix/mixDelay: mix-ups; drain scales the whole cost
  const T = HPO.cfg.TUNE.mind = Object.assign({ target: 0.45, drain: 1, mix: 0.35, mixDelay: 0.22 }, HPO.cfg.TUNE.mind || {});
  // [points a format usually takes, raw drain of one point at K = 1 (measured 6 Nov 2026)]: a 9-point match drains as much as a long one
  const FMT = { blitz: [9, 0.0078], americano: [21, 0.0124], quick: [33, 0.0136], oneSet: [64, 0.0150], bo3: [110, 0.0150] };

  // fx: multipliers (err shot error, aggr attacking shots, safe lobs and resets, soft drop shots and chiquitas, speed, read time to read a shot, drain energy cost,
  // tell how fast the opponents read this player's shots, serve) and additions (effort pace, claim extra score when two partners contest a ball).
  // dur: seconds of match time at full strength; tone: good, bad or mixed (ring colour); Effects are scaled by 0.5 + 0.5 * strength.
  const MOODS = {
    angry_partner: { dur: 40, tone: 'bad',  fx: { err: 1.10, effort: 0.10, aggr: 1.2, safe: 0.85, claim: 0.9, drain: 1.15 } },
    self_blame:    { dur: 40, tone: 'bad',  fx: { effort: -0.08, aggr: 0.7, safe: 1.25, claim: -0.6 } },
    fired_up:      { dur: 25, tone: 'good',  fx: { err: 1.08, effort: 0.12, aggr: 1.3, speed: 1.04, drain: 1.35 } },
    cocky:         { dur: 35, tone: 'mixed',  fx: { err: 1.12, aggr: 1.1, soft: 2.2, read: 1.08 } },
    nervous:       { dur: 30, tone: 'bad', fx: { err: 1.15, serve: 1.25, effort: -0.10, aggr: 0.7, safe: 1.2, read: 1.1 } },
    flow:          { dur: 45, tone: 'good', fx: { err: 0.90, read: 0.92, speed: 1.02 } },
    defeated:      { dur: 60, tone: 'bad',  fx: { speed: 0.93, read: 1.12, aggr: 0.85, drain: 0.7, effort: -0.05 } },
    vengeful:      { dur: 35, tone: 'mixed',  fx: { err: 1.05, aggr: 1.15, effort: 0.08, tell: 0.88 } },
    supportive:    { dur: 35, tone: 'good',  fx: { err: 0.97, claim: 0.3 } },
    irritated:     { dur: 20, tone: 'bad',  fx: { err: 1.10, effort: 0.12, aggr: 1.1 } }
  };
  const MUL = ['err', 'aggr', 'safe', 'soft', 'speed', 'read', 'drain', 'tell', 'serve'], ADD = ['effort', 'claim'];
  const CLEARS_ON_TIMEOUT = { angry_partner: 1, self_blame: 1, nervous: 1, irritated: 1, fired_up: 1, cocky: 1 };
  const ATTACK = { smashFlat: 1, smashKick: 1, vibora: 1, flatGround: 1, volleyFH: 1, volleyBH: 1 }, SAFE = { lobDef: 1, lobOff: 1, slice: 1, wallDef: 1, bajada: 1 }, TOUCH = { dejada: 1, chiquita: 1 };
  const COST = { smashFlat: 0.0045, smashKick: 0.0045, vibora: 0.003, bandeja: 0.0015, lobDef: 0.0012, lobOff: 0.0012 }, COST0 = 0.0008;
  const NONE = { id: '', k: 0 };

  const st = { n: 0, pts: { A: 0, B: 0 }, streak: { team: null, n: 0 }, server: null, margin: 99, mix: { A: -1, B: -1 }, K: 1 };
  const M = HPO.mod.mind = { MOODS: MOODS, st: st };
  const P = () => HPO.mod.players, rg = () => HPO.streams.mind || HPO.streams.ai, other = t => t === 'A' ? 'B' : 'A';

  // ---- per-player setup ----
  // temper: the power players with few tactics lose their cool first; baseline concentration is a little higher for tacticians
  M.init = function (p) {
    p.temper = U.clamp(0.75 - 0.6 * lvl(p.attrs.tactics) + 0.3 * lvl(p.attrs.power), 0.1, 0.95);
    p.baseFocus = U.clamp(0.5 + 0.2 * (lvl(p.attrs.tactics) - 0.65), 0.35, 0.65);
    p.confidence = p.baseFocus; p.mood = { id: '', k: 0, t0: 0, dur: 0 }; p.mind = { errs: 0, clean: 0, revenge: null };
  };
  M.reset = function (format) {
    st.n = 0; st.pts = { A: 0, B: 0 }; st.streak = { team: null, n: 0 }; st.server = null; st.margin = 99; st.mix = { A: -1, B: -1 };
    const f = FMT[format] || FMT.quick; st.K = T.drain * T.target / (f[0] * f[1]);
    P().list.forEach(M.init);
  };

  // ---- what the rest of the sim reads ----
  function fx(p) {
    const m = p.mood || NONE, d = MOODS[m.id], s = 0.5 + 0.5 * m.k, o = { err: 1, aggr: 1, safe: 1, soft: 1, speed: 1, read: 1, drain: 1, tell: 1, serve: 1, effort: 0, claim: 0 };
    if (d) { MUL.forEach(k => { if (d.fx[k] !== undefined) o[k] = 1 + (d.fx[k] - 1) * s; }); ADD.forEach(k => { if (d.fx[k] !== undefined) o[k] = d.fx[k] * s; }); }
    return o;
  }
  const tire = p => U.clamp((p.fatigue - 0.25) / 0.75, 0, 1);   // tiredness only bites from a quarter of the energy gone
  M.fx = fx;
  M.energy = p => 1 - p.fatigue;
  M.focus = p => Math.min(p.confidence, 0.6 + 0.4 * (1 - p.fatigue));   // a tired head cannot concentrate fully
  M.drainOf = p => st.K * fx(p).drain;
  M.speedMul = p => fx(p).speed;
  M.serveMul = p => fx(p).serve;
  M.tell = p => fx(p).tell;
  M.readMul = p => fx(p).read * (1 + 0.6 * p.fatigue * p.fatigue) * U.clamp(1 + 0.5 * (0.5 - M.focus(p)), 0.9, 1.25);
  M.errMul = (p, difficulty, pressure) => (p.mood && p.mood.id === 'cocky' && pressure > 0.3) ? 1 : fx(p).err;   // a cocky player only slips on the easy ball
  M.effort = p => fx(p).effort - 0.2 * tire(p);
  M.claim = p => { const m = p.mood || NONE, d = MOODS[m.id]; return d && d.fx.claim ? d.fx.claim * (0.5 + 0.5 * m.k) : 0; };
  M.shotMul = function (p, kind) {
    const f = fx(p), tr = tire(p);
    if (ATTACK[kind]) return f.aggr * (kind.indexOf('smash') === 0 || kind === 'vibora' ? 1 - 0.5 * tr : 1);
    if (SAFE[kind]) return f.safe * (1 + 0.5 * tr);
    if (TOUCH[kind]) return f.soft;
    return 1;
  };
  M.weak = q => (q.mood && (q.mood.id === 'nervous' || q.mood.id === 'defeated' || q.mood.id === 'self_blame' || q.mood.id === 'angry_partner') ? 0.15 : 0);   // opponents aim at a rattled player
  // What a mood changes, for the toast: [stat, inverted (a higher number is worse), smallest change worth showing, change that earns two arrows, short tag]
  const STAT = { err: ['Accuracy', 1, 0.04, 0.12, 'ACC'], effort: ['Power', 0, 0.05, 0.1, 'PWR'], aggr: ['Attack', 0, 0.08, 0.25, 'ATK'], safe: ['Safe shots', 0, 0.08, 0.25, 'SAFE'], soft: ['Touch', 0, 0.2, 1, 'TCH'],
    speed: ['Speed', 0, 0.015, 0.05, 'SPD'], read: ['Reactions', 1, 0.05, 0.1, 'REA'], drain: ['Stamina', 1, 0.1, 0.3, 'STA'], tell: ['Disguise', 0, 0.05, 0.2, 'DSG'], serve: ['Serve', 1, 0.1, 0.2, 'SRV'], claim: ['Takes balls', 0, 0.2, 0.6, 'CALL'] };
  M.effects = function (id) {
    const d = MOODS[id], out = [];
    if (d) Object.keys(d.fx).forEach(function (k) {
      const c = STAT[k], v = d.fx[k] - (k === 'effort' || k === 'claim' ? 0 : 1), a = Math.abs(v);
      if (a >= c[2]) out.push({ name: c[0], tag: c[4], dir: (v > 0 ? 1 : -1) * (c[1] ? -1 : 1), n: a >= c[3] ? 2 : 1, w: a / c[3] });
    });
    return out.sort((x, y) => y.w - x.w).slice(0, 4);
  };
  // seconds of the mood left
  M.left = p => { const m = p.mood; return m && m.id ? Math.max(0, m.dur - (P().now - m.t0)) : 0; };
  M.tick = function () { P().list.forEach(p => { if (p.mood.id && M.left(p) <= 0) setMood(p, '', 0); }); };
  const strength = p => p.mood.id ? p.mood.k * M.left(p) / p.mood.dur : 0;   // a mood about to end gives way to a new one
  M.label = id => MOODS[id] ? _(({ angry_partner: 'Fuming at partner', self_blame: 'Blaming self', fired_up: 'Fired up', cocky: 'Cocky', nervous: 'Nervous', flow: 'In the flow', defeated: 'Defeated', vengeful: 'Out for revenge', supportive: 'Backing partner', irritated: 'Irritated' })[id]) : '';

  function setMood(p, id, k, quiet) {
    const m = p.mood, was = m.id;
    if (id === was) { m.k = Math.max(m.k, k); m.t0 = P().now; m.dur = MOODS[id].dur * (0.6 + 0.8 * m.k); return; }
    m.id = id; m.k = id ? k : 0; m.t0 = P().now; m.dur = id ? MOODS[id].dur * (0.6 + 0.8 * k) : 0;
    if (!quiet) BUS.emit('mood:change', { playerId: p.id, team: p.team, mood: id, was: was });
  }
  M.setMood = setMood;
  const conf = (p, d) => { p.confidence = U.clamp(p.confidence + d, 0.05, 0.98); };
  function spend(p, c) { p.fatigue = Math.min(1, p.fatigue + c * M.drainOf(p) * (1.2 - 0.7 * lvl(p.attrs.stamina))); }

  // ---- two partners contest a ball: an angry one grabs it (both go), a blaming or beaten one leaves it (neither goes). Both cost time. ----
  M.contest = function (team, a, b, gap, hits) {
    if (gap > 1.0) return;
    const key = st.n * 100 + hits; if (st.mix[team] === key) return; st.mix[team] = key;
    const ca = M.claim(a), cb = M.claim(b);
    let kind = null;
    if (ca > 0.3 || cb > 0.3) kind = 'both'; else if ((ca < -0.3 && cb < 0.1) || (cb < -0.3 && ca < 0.1)) kind = 'neither';
    if (!kind) return;
    let chance = T.mix * (1 + Math.abs(ca) + Math.abs(cb));
    if ((a.mood.id === 'supportive') || (b.mood.id === 'supportive')) chance *= 0.3;   // they talk to each other
    if (!rg().chance(chance)) return;
    const until = P().now + T.mixDelay * rg().range(0.8, 1.3);
    a.reactUntil = Math.max(a.reactUntil, until); b.reactUntil = Math.max(b.reactUntil, until);
    BUS.emit('mood:mixup', { team: team, kind: kind, a: a.id, b: b.id, who: (ca >= cb ? a : b).id });
  };

  // ---- rests: concentration comes back toward the baseline and moods cool; energy is not refunded ----
  M.rest = function (amount) {
    P().list.forEach(function (p) {
      p.confidence += (p.baseFocus - p.confidence) * Math.min(1, amount * 10);
      if (p.mood.id) { p.mood.t0 -= amount * 60; if (M.left(p) <= 0) setMood(p, '', 0); }
    });
  };
  M.timeout = function (team) {
    P().team(team).forEach(function (p) {
      p.confidence = p.baseFocus;
      if (CLEARS_ON_TIMEOUT[p.mood.id]) setMood(p, '', 0); else if (p.mood.id) p.mood.t0 -= 12;
    });
  };

  // ---- events ----
  BUS.on('shot:hit', function (e) {
    if (e.warmup) return; const p = P().byId[e.playerId]; if (!p) return;
    spend(p, (e.serve ? 0.0012 : COST[e.shot] || COST0) + (e.stretch > 0.5 ? 0.001 : 0));
  });
  BUS.on('ball:bounce', function (e) { st.margin = e.marginCm; });
  // a break, set or match point (or golden point): everybody feels it, some more than others
  BUS.on('point:start', function (e) {
    if (e.retry) return;
    st.server = e.server; st.margin = 99;
    const R = HPO.mod.rules, s = R && R.state, f = s && s.flags;
    if (!f || !(f.matchPoint || f.setPoint || f.breakPoint || s.goldenPoint)) return;
    P().list.forEach(function (p) {
      conf(p, -0.04);
      if (rg().chance(0.08 + 0.4 * p.temper * (1.15 - lvl(p.attrs.tactics)))) setMood(p, 'nervous', 0.55);
    });
  });
  BUS.on('point:end', function (e) {
    const Pl = P(), win = e.winner, lose = other(win), byId = Pl.byId;
    st.n++; st.pts[win]++;
    st.streak = st.streak.team === win ? { team: win, n: st.streak.n + 1 } : { team: win, n: 1 };
    const kinds = e.shotKinds || [], last = kinds[kinds.length - 1] || '';
    const hitter = e.hitter ? byId[e.hitter] : null;
    const erred = e.kind === 'doubleFault' ? (st.server ? byId[st.server] : null) : (e.kind === 'unforced' ? hitter : null);
    const winnerShot = (e.kind === 'winner' || e.kind === 'ace') && hitter;
    const bigShot = winnerShot && (e.kind === 'ace' || /^smash|^vibora/.test(last));
    const tight = e.reason === 'out' && st.margin < 8;
    Pl.list.forEach(function (p) { p.mind.errs = p.mind.errs * 0.55 + (erred === p ? 1 : 0); p.mind.clean = erred === p ? 0 : p.mind.clean + 1; });   // first for everybody: moods read the partner's count
    Pl.list.forEach(function (p) {
      const part = Pl.other(p), mine = p.team === win, m = p.mood, mi = p.mind, r = rg(), t = p.temper;
      // concentration: points move it, errors cost, a losing run and a scare cost more; then it drifts back to the baseline
      let d = mine ? 0.03 : -0.03;
      if (mine && e.rallyLen >= 8) d += 0.015;
      if (mine && hitter === p && winnerShot) d += 0.04;
      if (erred === p) d -= e.kind === 'doubleFault' ? 0.08 : 0.06;
      if (!mine && st.streak.n >= 3) d -= Math.min(0.06, 0.02 * (st.streak.n - 2));
      if (!mine && bigShot) d -= 0.02;
      if (!mine && tight && hitter && hitter.team === p.team) d -= 0.03;
      if (part.mood.id === 'defeated') d -= 0.02;
      if (part.mood.id === 'supportive') d += 0.02;
      conf(p, d); conf(p, (p.baseFocus - p.confidence) * 0.1);
      p.confidence = Math.min(p.confidence, M.focus(p));
      // a supportive partner shortens the bad ones
      if (m.id && part.mood.id === 'supportive' && (m.id === 'angry_partner' || m.id === 'self_blame')) m.t0 -= 8;
      if (m.id && M.left(p) <= 0) setMood(p, '', 0);
      // what this point stirs up (the strongest wins; a stronger mood already running stays)
      const lead = st.pts[p.team] - st.pts[other(p.team)], pe = part.mind.errs;
      let best = null; const add = (id, k) => { if (!best || k > best.k) best = { id: id, k: k }; };
      if (erred === part && pe >= 1.5 && r.chance(0.25 + 0.7 * t)) add('angry_partner', 0.5 + 0.4 * t);
      if (erred === p && (mi.errs >= 1.55 || tight) && r.chance(0.85 - 0.35 * t)) add('self_blame', 0.4 + 0.2 * mi.errs);
      if (mine && ((hitter === p && bigShot) || st.streak.n >= 3) && r.chance(0.15 + 0.35 * t)) add('fired_up', 0.55);
      if (lead >= 3 && lead / st.n >= 0.3 && p.confidence >= p.baseFocus && r.chance(0.3)) add('cocky', 0.5);
      if (lead <= -4 && st.n >= 8 && lead / st.n <= -0.3 && r.chance(0.8 - 0.2 * t)) add('defeated', 0.6);
      if (!mine && bigShot && hitter && r.chance(0.08 + 0.35 * t)) { add('vengeful', 0.55); mi.revenge = hitter.id; }
      if (erred === part && t < 0.5 && p.confidence >= p.baseFocus - 0.05 && r.chance(0.7)) add('supportive', 0.5);
      if (!mine && tight && hitter && hitter.team === p.team && r.chance(0.35 + 0.5 * t)) { add('irritated', 0.55); conf(p, -0.03); }
      if (!m.id && !best && mi.clean >= 3 && p.confidence >= p.baseFocus + 0.08 && M.energy(p) >= 0.4) add('flow', 0.5);
      if (best && (best.id === m.id || best.k > strength(p))) setMood(p, best.id, best.k);
      if (p.mood.id !== 'vengeful') mi.revenge = null;
    });
  });
})(HPO);
