// Core: namespace, config, seeded RNG, event bus, math helpers, coroutine scheduler.
(function (root) {
  'use strict';
  const HPO = root.HPO = { mod: {}, util: {}, version: '0.1' };
  // HPO.court is an alias of HPO.mod.court (rules writes court.sides on swaps; everyone reads through this)
  Object.defineProperty(HPO, 'court', {
    get() { return HPO.mod.court; }, enumerable: true,
    set(v) { const c = HPO.mod.court; if (c) c.sides = v && v.sides ? v.sides : { A: -1, B: 1 }; } // tests/rules may assign {sides} or undefined to reset
  });

  // ---------- config ----------
  HPO.cfg = {
    TITLE() { return 'Littleworld Jakarta Padel Cup ' + new Date().getFullYear(); },
    PHYS_DT: 1 / 240, SIM_DT: 1 / 60, MAX_SUBSTEPS: 16,
    BALL: { R: 0.0335, M: 0.0565, CD: 0.55, RHO: 1.2, MAGNUS: 0.00055, G: 9.81 },
    RULES: { outOfCourtRetrieval: true, challengesPerSet: 2 },
    PIXEL: { size: 2, palette: 90 },
    TUNE: {} // filled by modules (ai/shots) with their tunables
  };

  // ---------- seeded RNG (mulberry32) ----------
  function makeRng(seed) {
    let s = seed >>> 0;
    const r = {
      seed(n) { s = n >>> 0; return r; },
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(a, b) { return a + (b - a) * r.next(); },
      int(a, b) { return Math.floor(r.range(a, b + 1)); },
      normal(mu, sigma) {
        let u = 0, v = 0;
        while (u === 0) u = r.next();
        v = r.next();
        return (mu || 0) + (sigma === undefined ? 1 : sigma) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
      chance(p) { return r.next() < p; },
      pick(arr) { return arr[Math.floor(r.next() * arr.length)]; },
      // weighted pick: items [{w, ...}] or parallel arrays
      weighted(items, wfn) {
        let tot = 0; const ws = items.map(it => { const w = Math.max(0, wfn ? wfn(it) : it.w); tot += w; return w; });
        if (tot <= 0) return items[0];
        let x = r.next() * tot;
        for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x <= 0) return items[i]; }
        return items[items.length - 1];
      },
      // independent sub-stream, derived from this stream's seed and a label
      fork(label) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < label.length; i++) { h ^= label.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return makeRng((h ^ base) >>> 0);
      }
    };
    const base = s;
    return r;
  }
  HPO.makeRng = makeRng;
  HPO.rng = makeRng(1);
  // Named streams are re-derived from the match seed by HPO.reseed().
  HPO.streams = {};
  HPO.reseed = function (seed) {
    HPO.rng = makeRng(seed);
    HPO.streams = {};
    ['ai', 'exec', 'ball', 'rules', 'crowd'].forEach(function (k) { HPO.streams[k] = makeRng(seed).fork(k); });
    return HPO.rng;
  };
  HPO.reseed(1);

  // ---------- event bus ----------
  const handlers = Object.create(null);
  HPO.BUS = {
    on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return fn; },
    off(name, fn) { const a = handlers[name]; if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } },
    once(name, fn) { const w = function (p) { HPO.BUS.off(name, w); fn(p); }; return HPO.BUS.on(name, w); },
    emit(name, payload) {
      const a = handlers[name]; if (!a) return;
      const copy = a.slice();
      for (let i = 0; i < copy.length; i++) {
        try { copy[i](payload); } catch (e) { HPO.util.logError(name, e); }
      }
    },
    clear() { for (const k in handlers) delete handlers[k]; }
  };

  // ---------- util ----------
  const U = HPO.util;
  U.errors = [];
  U.logError = function (where, e) {
    U.errors.push({ where: where, msg: String(e && e.stack || e) });
    if (U.errors.length > 200) U.errors.shift();
    if (typeof console !== 'undefined' && HPO.verbose) console.error('[HPO]', where, e);
  };
  U.clamp = (x, a, b) => x < a ? a : x > b ? b : x;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.sign = x => x < 0 ? -1 : 1;
  U.dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  U.v3 = (x, y, z) => ({ x: x || 0, y: y || 0, z: z || 0 });
  U.len3 = v => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  U.cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
  U.dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
  U.angleDiff = function (a, b) { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; };
  U.smoothstep = (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- coroutine scheduler ----------
  // A coroutine is a generator; it yields one of:
  //   HPO.sched.wait(sec) | HPO.sched.until(fn, timeoutSec) | HPO.sched.waitEvent(name, timeoutSec)
  // Time is simulation time (scaled by speed), advanced via sched.update(dt).
  const co = [];
  HPO.sched = {
    wait(sec) { return { k: 'wait', t: sec }; },
    until(fn, timeout) { return { k: 'until', fn: fn, t: timeout === undefined ? Infinity : timeout }; },
    waitEvent(name, timeout) { return { k: 'event', name: name, t: timeout === undefined ? Infinity : timeout }; },
    start(genFn, label) {
      const c = { gen: genFn(), label: label || 'co', cond: null, done: false, elapsed: 0 };
      co.push(c); advance(c); return c;
    },
    stop(c) { c.done = true; },
    stopAll() { co.length = 0; },
    count() { return co.length; },
    update(dt) {
      for (let i = co.length - 1; i >= 0; i--) {
        const c = co[i];
        if (c.done) { co.splice(i, 1); continue; }
        const w = c.cond;
        if (!w) { advance(c); continue; }
        w.t -= dt;
        let ready = false;
        if (w.k === 'wait') ready = w.t <= 0;
        else if (w.k === 'until') { try { ready = w.fn(); } catch (e) { U.logError('until', e); ready = true; } if (!ready && w.t <= 0) ready = true; }
        else if (w.k === 'event') ready = w.fired || w.t <= 0;
        if (ready) { if (w.off) HPO.BUS.off(w.name, w.off); advance(c); }
        if (c.done) co.splice(co.indexOf(c), 1);
      }
    }
  };
  function advance(c) {
    let r;
    try { r = c.gen.next(); } catch (e) { U.logError('coroutine:' + c.label, e); c.done = true; return; }
    if (r.done) { c.done = true; return; }
    const y = r.value;
    if (!y || !y.k) { c.cond = null; return; }
    c.cond = y;
    if (y.k === 'event') { y.off = HPO.BUS.on(y.name, function () { y.fired = true; }); }
  }

  // ---------- boot ----------
  // order = module registration order for init(); modules are looked up at call time.
  HPO.initOrder = ['palette', 'court', 'nav', 'ball', 'shots', 'players', 'ai', 'rules', 'match',
    'render', 'worldCourt', 'worldIsland', 'worldClub', 'rigs', 'actors', 'crowd', 'fx', 'replay', 'ceremony', 'callouts',
    'audio', 'commentary', 'ui'];
  HPO.boot = function (opts) {
    const ctx = { HPO: HPO, BUS: HPO.BUS, rng: HPO.rng, cfg: HPO.cfg, THREE: root.THREE, opts: opts || {} };
    HPO.initOrder.forEach(function (name) {
      const m = HPO.mod[name];
      if (m && typeof m.init === 'function') { try { m.init(ctx); } catch (e) { U.logError('init:' + name, e); } }
    });
    HPO.BUS.emit('boot:ready', {});
    return ctx;
  };
})(typeof window !== 'undefined' ? window : globalThis);
