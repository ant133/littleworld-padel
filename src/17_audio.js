// Audio: everything synthesized with WebAudio (no assets). Browser only; nothing touches window/AudioContext at load time.
// Layout: mixer (buses -> duck -> master -> compressor -> limiter), sound designs S.* (pure functions of an env so they can be rendered offline),
// BUS wiring, crowd / ambience / tension loops, speech queue + tone fallback.
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, U = HPO.util;
  const clamp = U.clamp;
  const rng = HPO.makeRng(0xA0D10);
  const rr = (a, b) => rng.range(a, b);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ------------------------------------------------------------------ env + node helpers
  function makeEnv(ac, out, counters) {
    return { ac: ac, out: out, nb: {}, vc: counters || { active: 0, started: 0 } };
  }
  function noiseBuf(E, kind) {
    if (E.nb[kind]) return E.nb[kind];
    const ac = E.ac, len = Math.floor(ac.sampleRate * 2), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = rng.next() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return (E.nb[kind] = b);
  }
  // sparse applause: dense short decaying noise ticks
  function clapBuf(E, dense) {
    const k = 'clap' + dense;
    if (E.nb[k]) return E.nb[k];
    const ac = E.ac, sr = ac.sampleRate, len = Math.floor(sr * 3), b = ac.createBuffer(1, len, sr), d = b.getChannelData(0);
    const n = Math.floor(dense * 3);
    for (let i = 0; i < n; i++) {
      const pos = Math.floor(rng.next() * (len - 400)), amp = 0.2 + rng.next() * 0.8, L = 60 + Math.floor(rng.next() * 140);
      for (let j = 0; j < L; j++) d[pos + j] += (rng.next() * 2 - 1) * amp * Math.exp(-j / (L * 0.28));
    }
    let pk = 0; for (let i = 0; i < len; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= (pk || 1);
    return (E.nb[k] = b);
  }
  function envGain(E, t, peak, a, dur) {
    const g = E.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.max(0.001, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }
  function biq(E, type, f, q) { const f1 = E.ac.createBiquadFilter(); f1.type = type; f1.frequency.value = f; if (q) f1.Q.value = q; return f1; }
  function chain(E, src, nodes, dest) {
    let prev = src;
    nodes.forEach(function (n) { prev.connect(n); prev = n; });
    prev.connect(dest);
    E.vc.active++; E.vc.started++;
    src.onended = function () { try { src.disconnect(); nodes.forEach(function (n) { n.disconnect(); }); } catch (e) { /* already gone */ } E.vc.active--; };
  }
  function panNode(E, x) {
    if (!E.ac.createStereoPanner || !x) return null;
    const p = E.ac.createStereoPanner(); p.pan.value = clamp(x, -0.8, 0.8); return p;
  }
  // oscillator voice. o: {type,f0,f1,t,dur,peak,a,filter:[type,f,q],dest,pan}
  function osc(E, o) {
    const ac = E.ac, s = ac.createOscillator(), dest = o.dest || E.out;
    s.type = o.type || 'sine';
    s.frequency.setValueAtTime(o.f0, o.t);
    if (o.f1) s.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur);
    if (o.detune) s.detune.value = o.detune;
    const nodes = [];
    if (o.filter) nodes.push(biq(E, o.filter[0], o.filter[1], o.filter[2]));
    nodes.push(envGain(E, o.t, o.peak, o.a || 0.004, o.dur));
    const pn = panNode(E, o.pan); if (pn) nodes.push(pn);
    chain(E, s, nodes, dest);
    s.start(o.t); s.stop(o.t + o.dur + 0.04);
    return s;
  }
  // noise voice. o: {kind,ftype,f0,f1,q,t,dur,peak,a,filter2,dest,pan}
  function noise(E, o) {
    const ac = E.ac, s = ac.createBufferSource(), dest = o.dest || E.out;
    s.buffer = o.buf || noiseBuf(E, o.kind || 'white');
    const nodes = [], f = biq(E, o.ftype || 'bandpass', o.f0, o.q || 1);
    if (o.f1) { f.frequency.setValueAtTime(o.f0, o.t); f.frequency.exponentialRampToValueAtTime(o.f1, o.t + o.dur); }
    nodes.push(f);
    if (o.filter2) nodes.push(biq(E, o.filter2[0], o.filter2[1], o.filter2[2]));
    nodes.push(envGain(E, o.t, o.peak, o.a || 0.002, o.dur));
    const pn = panNode(E, o.pan); if (pn) nodes.push(pn);
    chain(E, s, nodes, dest);
    const off = rng.next() * (s.buffer.duration - Math.min(o.dur + 0.05, s.buffer.duration - 0.01));
    s.start(o.t, off, o.dur + 0.04);
    return s;
  }

  // ------------------------------------------------------------------ sound designs
  const KIND = { // [bodyHz, clickHz, gain, decay]
    serve: [160, 2300, 0.55, 0.07], flatGround: [170, 2400, 0.75, 0.07], topGround: [165, 2300, 0.75, 0.07], slice: [190, 2800, 0.6, 0.06],
    volleyFH: [200, 3000, 0.55, 0.05], volleyBH: [200, 3000, 0.55, 0.05], lobDef: [140, 1800, 0.45, 0.08], lobOff: [150, 2000, 0.55, 0.08],
    bandeja: [180, 2500, 0.55, 0.07], vibora: [215, 3200, 0.7, 0.06], smashFlat: [250, 3800, 1.0, 0.09], smashKick: [240, 3600, 0.95, 0.09],
    dejada: [150, 1500, 0.25, 0.05], chiquita: [160, 1800, 0.4, 0.06], bajada: [190, 2900, 0.8, 0.07], wallDef: [150, 1900, 0.5, 0.07], counterDW: [185, 2700, 0.8, 0.07]
  };
  const S = {
    // padel racket: dull 'pok' (low-mid body + short filtered click)
    pok(E, t, p) {
      const k = KIND[p.kind] || KIND.flatGround, l = clamp(0.35 + (p.speed || 15) / 30, 0.3, 1.1) * k[2], q = 0.8 + 0.4 * clamp(p.q === undefined ? 0.5 : p.q, 0, 1);
      osc(E, { type: 'triangle', f0: k[0] * q, f1: k[0] * q * 0.55, t: t, dur: k[3] + 0.04, peak: 0.55 * l, a: 0.003, pan: p.pan });
      osc(E, { type: 'sine', f0: k[0] * 1.7, f1: k[0] * 0.95, t: t, dur: 0.05, peak: 0.22 * l, pan: p.pan });
      noise(E, { ftype: 'bandpass', f0: k[1], q: 1.2, t: t, dur: 0.022, peak: 0.45 * l, a: 0.001, pan: p.pan });
    },
    // artificial turf: soft muffled thud
    turf(E, t, p) {
      const l = clamp((p.v || 8) / 18, 0.15, 1);
      noise(E, { kind: 'brown', ftype: 'lowpass', f0: 420, q: 0.7, t: t, dur: 0.09, peak: 0.38 * l, a: 0.002, pan: p.pan });
      osc(E, { type: 'sine', f0: 95, f1: 55, t: t, dur: 0.09, peak: 0.34 * l, a: 0.003, pan: p.pan });
    },
    // glass: resonant 'tonk' with ringing partials. back = longer and lower, side = a little higher and shorter
    glass(E, t, p) {
      const back = !!p.back, l = clamp((p.v || 10) / 20, 0.18, 1), base = back ? [480, 1130, 1890, 2710] : [620, 1420, 2350], pk = [0.26, 0.15, 0.085, 0.05], dec = back ? 0.55 : 0.3;
      base.forEach(function (f, i) {
        osc(E, { type: 'sine', f0: f * 1.05, f1: f, t: t, dur: dec * (1 - i * 0.16), peak: pk[i] * l, a: 0.002, detune: rr(-8, 8), pan: p.pan });
      });
      noise(E, { ftype: 'highpass', f0: 3200, q: 0.7, t: t, dur: 0.012, peak: 0.28 * l, a: 0.001, pan: p.pan });
    },
    // metal mesh: rattly band-passed noise with decay
    mesh(E, t, p) {
      const l = clamp((p.v || 10) / 20, 0.2, 1);
      noise(E, { ftype: 'bandpass', f0: 3200, q: 4, t: t, dur: 0.3, peak: 0.75 * l, a: 0.001, pan: p.pan });
      [[0.02, 2400], [0.05, 4100], [0.09, 5200]].forEach(function (b) {
        noise(E, { ftype: 'bandpass', f0: b[1], q: 6, t: t + b[0], dur: 0.12, peak: 0.3 * l, a: 0.001, pan: p.pan });
      });
      osc(E, { type: 'square', f0: 1800, f1: 1500, t: t, dur: 0.05, peak: 0.08 * l, filter: ['bandpass', 2200, 3], pan: p.pan });
    },
    // net: cloth flap + cord twang
    net(E, t, p) {
      const l = clamp((p.v || 8) / 15, 0.2, 1);
      noise(E, { kind: 'brown', ftype: 'lowpass', f0: 700, q: 0.6, t: t, dur: 0.16, peak: 0.7 * l, a: 0.004, pan: p.pan });
      osc(E, { type: 'triangle', f0: 192, f1: 184, t: t + 0.01, dur: 0.38, peak: 0.16 * l, a: 0.01, pan: p.pan });
    },
    tape(E, t, p) {
      osc(E, { type: 'triangle', f0: 2300, f1: 1500, t: t, dur: 0.035, peak: 0.24, a: 0.001, pan: p.pan });
      noise(E, { ftype: 'highpass', f0: 4200, t: t, dur: 0.012, peak: 0.12, a: 0.001, pan: p.pan });
    },
    post(E, t, p) { osc(E, { type: 'sine', f0: 900, f1: 780, t: t, dur: 0.18, peak: 0.2 * clamp((p.v || 10) / 20, 0.2, 1), a: 0.001, pan: p.pan }); },
    ceiling(E, t, p) { noise(E, { kind: 'brown', ftype: 'lowpass', f0: 300, t: t, dur: 0.12, peak: 0.25, pan: p.pan }); },
    step(E, t, p) {
      const l = clamp((p.v || 3) / 7, 0.3, 1);
      noise(E, { kind: 'brown', ftype: 'lowpass', f0: 520, q: 0.5, t: t, dur: 0.05, peak: 0.1 * l, a: 0.003, pan: p.pan });
      osc(E, { type: 'sine', f0: 75, f1: 55, t: t, dur: 0.05, peak: 0.07 * l, a: 0.003, pan: p.pan });
    },
    tok(E, t, p) {
      osc(E, { type: 'sine', f0: 430, f1: 230, t: t, dur: 0.06, peak: 0.28, a: 0.002, pan: p && p.pan });
      noise(E, { ftype: 'bandpass', f0: 1600, q: 1, t: t, dur: 0.015, peak: 0.12, a: 0.001, pan: p && p.pan });
    },
    sting(E, t) { osc(E, { type: 'sawtooth', f0: 220, f1: 990, t: t, dur: 0.4, peak: 0.16, a: 0.01, filter: ['lowpass', 2600, 0.8] }); osc(E, { type: 'square', f0: 110, f1: 330, t: t, dur: 0.4, peak: 0.1, a: 0.01, filter: ['lowpass', 1200, 0.7] }); },
    click(E, t) { osc(E, { type: 'square', f0: 920, f1: 640, t: t, dur: 0.05, peak: 0.1, a: 0.002, filter: ['lowpass', 3000, 0.7] }); },
    clap(E, t, p) {
      const l = clamp(p.level === undefined ? 1 : p.level, 0.3, 3), dur = 1.6 + l * 0.7, dense = 220 + l * 120;
      const s = noise(E, { buf: clapBuf(E, dense), ftype: 'bandpass', f0: 1700, q: 0.6, t: t, dur: Math.min(dur, 2.9), peak: 0.6 + 0.35 * l, a: 0.25, dest: p.dest });
      return s;
    },
    cheer(E, t, p) {
      const l = clamp(p.level === undefined ? 1 : p.level, 0.3, 3), dur = 1.5 + l * 0.8, pk = 0.3 + 0.2 * l;
      noise(E, { ftype: 'bandpass', f0: 750, q: 2, t: t, dur: dur, peak: pk, a: 0.5, dest: p.dest });
      noise(E, { ftype: 'bandpass', f0: 1300, q: 2, t: t, dur: dur, peak: pk * 0.7, a: 0.55, dest: p.dest });
      noise(E, { ftype: 'bandpass', f0: 2700, q: 1, t: t, dur: dur, peak: pk * 0.3, a: 0.6, dest: p.dest });
      const n = 2 + Math.round(l * 1.5);
      for (let i = 0; i < n; i++) {
        const f = rr(250, 420), st = t + rr(0.1, dur * 0.6);
        osc(E, { type: 'sawtooth', f0: f, f1: f * rr(1.05, 1.2), t: st, dur: rr(0.35, 0.8), peak: 0.09 * (0.6 + l * 0.3), a: 0.08, filter: ['bandpass', 950, 3], dest: p.dest });
      }
    },
    gasp(E, t, p) {
      noise(E, { ftype: 'bandpass', f0: 2100, q: 0.9, t: t, dur: 0.6, peak: 0.2, a: 0.28, dest: p.dest });
      osc(E, { type: 'sawtooth', f0: 330, f1: 410, t: t + 0.25, dur: 0.4, peak: 0.04, a: 0.08, filter: ['bandpass', 750, 3], dest: p.dest });
    },
    groan(E, t, p) {
      [0, 1].forEach(function (i) {
        osc(E, { type: 'sawtooth', f0: 175 + i * 6, f1: 118, t: t + i * 0.05, dur: 0.85, peak: 0.07, a: 0.12, filter: ['lowpass', 700, 0.8], dest: p.dest });
      });
      noise(E, { ftype: 'bandpass', f0: 520, q: 1.5, t: t, dur: 0.8, peak: 0.16, a: 0.15, dest: p.dest });
    },
    wave(E, t, p) {
      noise(E, { ftype: 'bandpass', f0: 350, f1: 1800, q: 1.4, t: t, dur: 1.6, peak: 0.4, a: 0.9, dest: p.dest });
      noise(E, { ftype: 'bandpass', f0: 1800, f1: 350, q: 1.4, t: t + 1.6, dur: 1.6, peak: 0.32, a: 0.2, dest: p.dest });
    },
    chime(E, t, p) { // umpire fallback tones
      const k = p.kind || 'point', d = p.dest;
      const tone = (f, at, dur, pk, type) => osc(E, { type: type || 'sine', f0: f, t: t + at, dur: dur, peak: pk, a: 0.006, dest: d });
      if (k === 'fault') { tone(440, 0, 0.14, 0.18, 'triangle'); tone(330, 0.16, 0.2, 0.18, 'triangle'); }
      else if (k === 'let') { tone(523, 0, 0.08, 0.14); tone(523, 0.11, 0.08, 0.14); }
      else if (k === 'out') osc(E, { type: 'sawtooth', f0: 210, f1: 190, t: t, dur: 0.22, peak: 0.1, a: 0.01, filter: ['lowpass', 900, 0.8], dest: d });
      else if (k === 'game') { tone(523, 0, 0.12, 0.15); tone(659, 0.1, 0.12, 0.15); tone(784, 0.2, 0.25, 0.16); }
      else if (k === 'set') { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.1, 0.3, 0.14); }); }
      else { tone(660, 0, 0.18, 0.12); tone(990, 0, 0.12, 0.05); }
    },
    pop(E, t, p) {
      noise(E, { ftype: 'highpass', f0: 2000, q: 0.7, t: t, dur: 0.06, peak: 0.3, a: 0.001, dest: p && p.dest });
      osc(E, { type: 'sine', f0: 220, f1: 80, t: t, dur: 0.07, peak: 0.28, a: 0.001, dest: p && p.dest });
    },
    bird(E, t, p) {
      const n = 2 + Math.floor(rng.next() * 3), f = rr(2600, 4200);
      for (let i = 0; i < n; i++) {
        osc(E, { type: 'sine', f0: f * rr(0.9, 1.1), f1: f * rr(1.2, 1.5), t: t + i * 0.11, dur: 0.07, peak: 0.05, a: 0.01, dest: p && p.dest, pan: p && p.pan });
      }
    },
    // brass-like fanfare: detuned saws through an opening lowpass
    fanfare(E, t, p) {
      const d = p && p.dest, C4 = 261.63, semis = s => C4 * Math.pow(2, s / 12);
      const chords = [[0, 4, 7], [0, 5, 9], [2, 7, 11], [0, 4, 7, 12]], times = [0, 0.4, 0.8, 1.25], lens = [0.35, 0.35, 0.4, 1.8];
      chords.forEach(function (ch, ci) {
        ch.forEach(function (s) {
          [-7, 7].forEach(function (dt) {
            osc(E, { type: 'sawtooth', f0: semis(s), t: t + times[ci], dur: lens[ci], peak: 0.05, a: 0.04, detune: dt, filter: ['lowpass', 1900, 0.9], dest: d });
          });
        });
        osc(E, { type: 'triangle', f0: semis(ch[0] - 12), t: t + times[ci], dur: lens[ci], peak: 0.1, a: 0.03, dest: d });
      });
    }
  };

  // ------------------------------------------------------------------ module state
  const cfgVol = { master: 0.8, fx: 0.9, crowd: 0.8, commentary: 0.9, ambience: 0.7, music: 0.5 };
  const LIMITS = { // [minGapMs, maxPerSecond]
    sting: [400, 2], pok: [90, 6], turf: [50, 9], glass: [110, 5], mesh: [120, 4], net: [150, 4], tape: [120, 4], post: [150, 3], step: [90, 8], tok: [300, 2], click: [40, 10],
    clap: [1500, 1], cheer: [2200, 1], gasp: [1800, 1], groan: [1800, 1], wave: [8000, 1], chime: [200, 4], bird: [1200, 2], pop: [60, 12], fanfare: [5000, 1]
  };
  const A = HPO.mod.audio = {
    ac: null, unlocked: false, enabled: true, muted: true, speech: false, vol: cfgVol, musicOn: false,
    buses: null, E: null, env: null,
    perSec: { count: 0, lastWindow: 0 }, started: {}, dropped: {}, venue: 'classicBlue', tension: 0, mood: 0
  };
  let hist = {}, recentStarts = [], lastRate = 0, sec = 0, stepAcc = {}, stepClock = 0, murLevel = 0, murTarget = 0.25, pendingReact = null, lastReactAt = -9, birdT = 3, clinkT = 8;
  let loops = null, speechQ = [], speaking = false, speakStart = 0, voicesLang = null, hooked = false;

  const on = () => A.unlocked && A.enabled && !A.muted;
  const speedNow = () => { const m = HPO.mod.match; return m && m.speed ? m.speed : 1; };
  const tNow = () => (A.ac ? A.ac.currentTime + 0.004 : 0);

  function allow(name) {
    const lim = LIMITS[name]; if (!lim) return true;
    const spd = speedNow(), t = now(), h = hist[name] || (hist[name] = []);
    const gap = lim[0] * (spd >= 4 ? 2.4 : spd >= 2 ? 1.6 : 1), cap = Math.max(1, Math.floor(lim[1] / (spd >= 4 ? 2.5 : spd >= 2 ? 1.5 : 1)));
    while (h.length && t - h[0] > 1000) h.shift();
    if ((h.length && t - h[h.length - 1] < gap) || h.length >= cap || (A.E && A.E.vc.active > 90)) { A.dropped[name] = (A.dropped[name] || 0) + 1; return false; }
    h.push(t); A.started[name] = (A.started[name] || 0) + 1; recentStarts.push(t); if (recentStarts.length > 400) recentStarts.shift();
    return true;
  }
  function play(name, p, bus) {
    if (!on() || !allow(name)) return;
    const E = A.env[bus || 'fx'];
    try { S[name](E, tNow(), p || {}); } catch (e) { U.logError('audio.' + name, e); }
  }
  const mag = v => (v && typeof v === 'object' ? Math.sqrt((v.x || 0) * (v.x || 0) + (v.y || 0) * (v.y || 0) + (v.z || 0) * (v.z || 0)) : +v || 0);
  const panOf = p => (p ? clamp(p.x / 14, -0.6, 0.6) : 0);

  // ------------------------------------------------------------------ mixer
  function build() {
    const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!Ctx) return false;
    const ac = A.ac = new Ctx({ latencyHint: 'interactive' });
    const master = ac.createGain(), comp = ac.createDynamicsCompressor(), lim = ac.createDynamicsCompressor(), duck = ac.createGain();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.006; comp.release.value = 0.2;
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    duck.connect(master); master.connect(comp); comp.connect(lim); lim.connect(ac.destination);
    // music has its own bus into the compressor, so it follows the Music switch and not the sound-effects mute
    const music = ac.createGain(); music.gain.value = 0; music.connect(comp);
    const buses = { master: master, duck: duck, music: music }, env = {};
    const counters = { active: 0, started: 0 };
    ['fx', 'crowd', 'commentary', 'ambience'].forEach(function (b) {
      const g = ac.createGain(); g.connect(duck); buses[b] = g; env[b] = makeEnv(ac, g, counters);
    });
    A.buses = buses; A.env = env; A.E = env.fx;
    applyGains();
    startLoops();
    return true;
  }
  function applyGains() {
    if (!A.buses) return;
    const t = A.ac.currentTime;
    A.buses.master.gain.setTargetAtTime(on() ? cfgVol.master : 0, t, 0.03);
    ['fx', 'crowd', 'commentary', 'ambience'].forEach(function (b) { A.buses[b].gain.setTargetAtTime(cfgVol[b], t, 0.05); });
    applyMusic();
  }

  // ------------------------------------------------------------------ music: one embedded track (HPO.assets.music, a data URI), decoded on first use and looped
  const MU = { buf: null, loading: null, src: null, stopT: 0, off: 0, t0: 0 }; // off = where the song was left, so switching music back on resumes instead of restarting
  const hasMusic = () => !!(HPO.assets && HPO.assets.music);
  function loadMusic() {
    if (MU.buf) return Promise.resolve(MU.buf);
    if (MU.loading) return MU.loading;
    const uri = HPO.assets && HPO.assets.music; if (!uri || !A.ac) return Promise.resolve(null);
    MU.loading = new Promise(function (res, rej) {
      const b = atob(uri.slice(uri.indexOf(',') + 1)), u8 = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u8[i] = b.charCodeAt(i);
      const p = A.ac.decodeAudioData(u8.buffer, res, rej); if (p && p.catch) p.catch(rej); // old Safari only takes the callbacks
    }).then(function (buf) { MU.buf = buf; return buf; }, function (e) { U.logError('audio.music', e); MU.loading = null; return null; });
    return MU.loading;
  }
  function applyMusic() {
    if (!A.buses || !A.buses.music) return;
    const t = A.ac.currentTime, want = A.musicOn && A.unlocked && hasMusic();
    A.buses.music.gain.setTargetAtTime(want ? cfgVol.music * 0.4 : 0, t, want ? 0.6 : 0.25); // x0.4: the track is mastered hot, at the 50% default it covered the effects
    clearTimeout(MU.stopT);
    if (want) {
      if (!MU.buf) { loadMusic().then(function (b) { if (b && A.musicOn) applyMusic(); }); return; }
      if (!MU.src) {
        const s = A.ac.createBufferSource(); s.buffer = MU.buf; s.loop = true; s.connect(A.buses.music); s.start(0, MU.off % MU.buf.duration);
        MU.src = s; MU.t0 = A.ac.currentTime;
      }
    } else if (MU.src) {
      MU.stopT = setTimeout(function () {
        if (A.musicOn || !MU.src) return;
        MU.off = (MU.off + A.ac.currentTime - MU.t0) % MU.buf.duration;
        try { MU.src.stop(); } catch (e) { /* ignore */ } MU.src = null;
      }, 1500);
    }
  }

  // persistent beds: crowd murmur, wind, club atmosphere, crickets, tension drone
  function startLoops() {
    const ac = A.ac, Ec = A.env.crowd, Ea = A.env.ambience, L = loops = {};
    const loopNoise = function (E, kind, ftypes, dest) {
      const s = ac.createBufferSource(); s.buffer = noiseBuf(E, kind); s.loop = true;
      const g = ac.createGain(); g.gain.value = 0;
      let prev = s; ftypes.forEach(function (f) { const b = biq(E, f[0], f[1], f[2]); prev.connect(b); prev = b; });
      prev.connect(g); g.connect(dest); s.start(0, rng.next());
      return { s: s, g: g };
    };
    const lfo = function (freq, depth, target) {
      const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); o.start(); return { o: o, g: g };
    };
    L.mur = loopNoise(Ec, 'brown', [['bandpass', 450, 0.4], ['lowpass', 1500, 0.7]], Ec.out); L.murLfo = lfo(0.13, 0.04, L.mur.g.gain);
    L.wind = loopNoise(Ea, 'brown', [['bandpass', 280, 0.7]], Ea.out); L.windLfo = lfo(0.07, 0.04, L.wind.g.gain);
    L.club = loopNoise(Ea, 'brown', [['bandpass', 190, 0.5], ['lowpass', 600, 0.6]], Ea.out);
    // crickets: 4.4 kHz tone chopped at ~18 Hz
    L.cric = { o: ac.createOscillator(), g: ac.createGain(), chop: ac.createGain() };
    L.cric.o.type = 'sine'; L.cric.o.frequency.value = 4400; L.cric.g.gain.value = 0; L.cric.chop.gain.value = 0;
    L.cric.o.connect(L.cric.chop); L.cric.chop.connect(L.cric.g); L.cric.g.connect(Ea.out); L.cric.o.start();
    L.cricLfo = lfo(18, 0.5, L.cric.chop.gain); L.cric.chop.gain.value = 0.5; L.cricLfo2 = lfo(2.3, 0.3, L.cric.chop.gain);
    // tension drone: 55 Hz + 82 Hz with slow tremolo
    L.ten = { a: ac.createOscillator(), b: ac.createOscillator(), g: ac.createGain() };
    L.ten.a.frequency.value = 55; L.ten.b.type = 'triangle'; L.ten.b.frequency.value = 82.4; L.ten.g.gain.value = 0;
    L.ten.a.connect(L.ten.g); L.ten.b.connect(L.ten.g); L.ten.g.connect(Ec.out); L.ten.a.start(); L.ten.b.start(); L.tenLfo = lfo(1.4, 0.02, L.ten.g.gain);
  }
  function isIndoor() {
    const r = HPO.mod.render, p = r && r.todParams;
    return A.venue === 'indoor' || !!(p && p.indoor) || !!(HPO.mod.court && HPO.mod.court.venue === 'indoor');
  }
  function night() { const p = HPO.mod.render && HPO.mod.render.todParams; return p && typeof p.night === 'number' ? p.night : 0; }
  function updateBeds(dt) {
    if (!loops) return;
    const t = A.ac.currentTime, ind = isIndoor(), ni = night();
    // crowd murmur follows mood (excitement) and tension
    murTarget = 0.1 + 0.07 * A.mood + 0.06 * A.tension;
    murLevel += (murTarget - murLevel) * Math.min(1, dt * 0.8);
    loops.mur.g.gain.setTargetAtTime(on() ? murLevel : 0, t, 0.3);
    loops.wind.g.gain.setTargetAtTime(on() && !ind ? 0.09 : 0, t, 1.0);
    loops.club.g.gain.setTargetAtTime(on() ? (ind ? 0.12 : 0.06) : 0, t, 1.0);
    loops.cric.g.gain.setTargetAtTime(on() && !ind && ni > 0.5 ? 0.012 * ni : 0, t, 1.5);
    loops.ten.g.gain.setTargetAtTime(on() && A.tension > 0.05 ? 0.05 * A.tension : 0, t, 0.8);
    // speed ducking of the fx/crowd mix
    const spd = speedNow(), d = spd >= 4 ? 0.5 : spd >= 2 ? 0.72 : 1;
    A.buses.duck.gain.setTargetAtTime(d, t, 0.2);
    // sporadic ambience: birds by day outdoors, distant glass clink
    birdT -= dt; clinkT -= dt;
    if (birdT <= 0) { birdT = rr(2.5, 8); if (!ind && ni < 0.3 && on() && spd < 4) { if (allow('bird')) S.bird(A.env.ambience, tNow(), { dest: A.env.ambience.out, pan: rr(-0.7, 0.7) }); } }
    if (clinkT <= 0) { clinkT = rr(6, 15); if (on() && spd < 4 && A.env.ambience.vc.active < 60) osc(A.env.ambience, { type: 'sine', f0: rr(2000, 2600), t: tNow(), dur: 0.12, peak: 0.012, a: 0.002, pan: rr(-0.8, 0.8) }); }
  }

  // ------------------------------------------------------------------ crowd reactions
  function react(level, kind) {
    if (!on()) return;
    const t = now(); if (t - lastReactAt < 700) return;
    lastReactAt = t; pendingReact = null;
    level = clamp(level === undefined ? 1 : level, 0, 3);
    A.mood = Math.max(A.mood, level);
    kind = String(kind || '');
    const d = A.env.crowd.out;
    if (/gasp|ooh|ohh/i.test(kind)) play('gasp', { dest: d }, 'crowd');
    else if (/groan|sigh|disappoint|aww/i.test(kind)) play('groan', { dest: d }, 'crowd');
    else if (/wave/i.test(kind)) play('wave', { dest: d }, 'crowd');
    else if (/cheer|roar|shout/i.test(kind) || level >= 3) { play('cheer', { level: level, dest: d }, 'crowd'); if (level >= 2) play('clap', { level: level, dest: d }, 'crowd'); }
    else if (level >= 1) play('clap', { level: level, dest: d }, 'crowd');
  }
  function onPointEnd(e) {
    if (!on() || !e) return;
    const rl = e.rallyLen | 0;
    const level = (e.kind === 'ace' ? 2 : e.kind === 'winner' ? 2 : 1) + (rl >= 12 ? 1 : 0) + (rl >= 25 ? 1 : 0);
    const err = e.kind === 'unforced' || e.kind === 'doubleFault' || e.kind === 'fault';
    // the crowd module may emit its own crowd:react right after; only fall back if it stays silent
    pendingReact = { at: now() + 250, level: err ? 1 : level, kind: err && rl < 8 ? 'groan' : (rl >= 14 ? 'cheer' : 'clap') };
  }

  // ------------------------------------------------------------------ speech
  function speechOK() { return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'; }
  function loadVoices() {
    if (!speechOK()) return [];
    const v = speechSynthesis.getVoices() || [];
    voicesLang = v.filter(function (x) { return new RegExp('^' + langPre(), 'i').test(x.lang); });
    return voicesLang;
  }
  // speech follows the page language (i18n.locale); English keeps its voice preferences, other languages take the first voice of that language
  function langPre() { return String(HPO.mod.i18n && HPO.mod.i18n.locale || 'en').slice(0, 2); }
  function pickVoice(role) {
    const v = voicesLang && voicesLang.length ? voicesLang : loadVoices(); if (!v.length) return null;
    if (langPre() !== 'en') return v[0];
    const prefer = role === 'umpire' ? [/Google UK English Female/i, /Zira|Hazel|Samantha|Susan|Female/i, /en-GB/i] : [/Google UK English Male/i, /David|Daniel|Alex|Mark|Male/i, /en-GB/i, /en-US/i];
    for (let i = 0; i < prefer.length; i++) { const f = v.find(function (x) { return prefer[i].test(x.name) || prefer[i].test(x.lang); }); if (f) return f; }
    return v[0];
  }
  // no voice for the page language: stay silent (text and chimes only) rather than read it with an English voice
  function speechActive() { return A.speech && speechOK() && cfgVol.commentary > 0 && (langPre() === 'en' || (voicesLang && voicesLang.length > 0) || loadVoices().length > 0); }
  function toneKind(text) {
    if (/foot fault|^fault/i.test(text)) return 'fault';
    if (/^let/i.test(text)) return 'let';
    if (/^out|double fault/i.test(text)) return 'out';
    if (/set and match|and (first|second|third) set/i.test(text)) return 'set';
    if (/^game/i.test(text)) return 'game';
    return 'point';
  }
  function onSpeak(ev) {
    if (!ev || !ev.text || !on()) return;
    const p = ev.priority | 0, spd = speedNow();
    if (speechActive()) { enqueueSpeech(ev, p, spd); return; }
    // tone fallback (umpire only): short cues, rate-limited
    if (ev.voice === 'umpire' && p >= 1 && !(spd >= 4 && p < 3) && !(spd >= 2 && p < 2)) play('chime', { kind: ev.tone || toneKind(ev.text), dest: A.env.commentary.out }, 'commentary');
  }
  function enqueueSpeech(ev, p, spd) {
    if (spd >= 4 && p < 3) return;
    if (spd >= 2 && p < 2) return;
    const busy = speaking || speechQ.length > 0;
    if (ev.voice !== 'umpire' && busy && p < 2) return;
    const item = { text: String(ev.text).replace(/–/g, ', ').replace(/\s+/g, ' '), voice: ev.voice, p: p, at: now() };
    if (speechQ.length >= 3) {
      let wi = -1, wv = 99;
      speechQ.forEach(function (q, i) { const v = q.p + (q.voice === 'umpire' ? 1 : 0); if (v < wv) { wv = v; wi = i; } });
      if (wv > p + (item.voice === 'umpire' ? 1 : 0)) return;
      speechQ.splice(wi, 1);
    }
    speechQ.push(item);
    speechQ.sort(function (a, b) { return (b.p + (b.voice === 'umpire' ? 1 : 0)) - (a.p + (a.voice === 'umpire' ? 1 : 0)) || a.at - b.at; });
    pump();
  }
  function pump() {
    if (speaking || !speechQ.length || !speechActive()) return;
    let it = speechQ.shift();
    while (it && now() - it.at > 9000) it = speechQ.shift();   // stale
    if (!it) return;
    try {
      const u = new SpeechSynthesisUtterance(it.text), v = pickVoice(it.voice);
      if (v) u.voice = v;
      u.lang = (v && v.lang) || (HPO.mod.i18n && HPO.mod.i18n.locale) || 'en-GB';
      u.rate = it.voice === 'umpire' ? 0.95 : 1.12; u.pitch = it.voice === 'umpire' ? 0.85 : 1.05; u.volume = clamp(cfgVol.commentary * cfgVol.master, 0, 1);
      const done = function () { speaking = false; pump(); };
      u.onend = done; u.onerror = done;
      speaking = true; speakStart = now();
      speechSynthesis.speak(u);
    } catch (e) { speaking = false; U.logError('audio.speech', e); }
  }
  function cancelSpeech() { speechQ.length = 0; speaking = false; try { if (speechOK()) speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  // ------------------------------------------------------------------ public API
  Object.assign(A, {
    S: S, makeEnv: makeEnv,
    unlock() {
      if (A.unlocked) { if (A.ac && A.ac.state === 'suspended') A.ac.resume(); return true; }
      if (!A.ac && !build()) return false;
      A.unlocked = true;
      try { A.ac.resume(); } catch (e) { /* ignore */ }
      applyGains();
      return true;
    },
    setEnabled(v) { A.enabled = !!v; if (!on()) cancelSpeech(); applyGains(); },
    setMuted(v) { A.muted = !!v; if (!on()) cancelSpeech(); applyGains(); },
    hasMusic: hasMusic,
    setMusic(v) { A.musicOn = !!v; if (v && !A.unlocked) A.unlock(); applyMusic(); },
    setSpeech(v) { A.speech = !!v; if (v && speechOK()) loadVoices(); if (!v) cancelSpeech(); },
    setVolume(bus, v) { if (!(bus in cfgVol)) return; cfgVol[bus] = clamp(+v || 0, 0, 1); applyGains(); if (bus === 'commentary' && cfgVol.commentary <= 0) cancelSpeech(); },
    uiClick() { play('click', {}); },
    sting() { play('sting', {}); },
    fanfare() { if (!on()) return; allow('fanfare'); try { S.fanfare(A.env.fx, tNow(), { dest: A.env.fx.out }); } catch (e) { U.logError('audio.fanfare', e); } },
    celebrate() {
      if (!on()) return;
      A.fanfare();
      const d = A.env.crowd.out;
      play('cheer', { level: 3, dest: d }, 'crowd'); play('clap', { level: 3, dest: d }, 'crowd');
      for (let i = 0; i < 8; i++) {
        const dt = 0.8 + i * rr(0.15, 0.3);
        setTimeout(function () { if (on() && allow('pop')) S.pop(A.env.fx, tNow(), { dest: A.env.fx.out }); }, dt * 1000);
      }
    },
    react: react,
    status() {
      const t = now(), ev = recentStarts.filter(function (x) { return t - x < 1000; }).length;
      return {
        unlocked: A.unlocked, enabled: A.enabled, muted: A.muted, on: on(), music: A.musicOn, musicLoaded: !!MU.buf, musicOffset: +MU.off.toFixed(1), hasMusic: hasMusic(), speech: A.speech, speechAvailable: speechOK(), ctxState: A.ac ? A.ac.state : 'none',
        volumes: Object.assign({}, cfgVol), voices: { active: A.E ? A.E.vc.active : 0, started: A.E ? A.E.vc.started : 0, perSec: ev },
        queue: speechQ.length, speaking: speaking, started: Object.assign({}, A.started), dropped: Object.assign({}, A.dropped), venue: A.venue, tension: A.tension, speed: speedNow()
      };
    },
    // footsteps + beds + pending crowd fallback; called per frame (render.onFrame) or manually
    update(dt) {
      if (!A.unlocked || !(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      A.mood = Math.max(0, A.mood - dt * 0.15);
      if (pendingReact && now() >= pendingReact.at) { const r = pendingReact; pendingReact = null; react(r.level, r.kind); }
      if (speaking && now() - speakStart > 14000) { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } speaking = false; pump(); }
      sec += dt; stepClock += dt;
      if (sec >= 0.2) { updateBeds(sec); sec = 0; }
      if (!on()) return;
      const P = HPO.mod.players, spd = speedNow();
      if (P && P.list && spd < 4) {
        P.list.forEach(function (p) {
          const v = p.speed !== undefined ? p.speed : mag(p.vel);
          if (!(v > 1.2)) { stepAcc[p.id] = 0; return; }
          stepAcc[p.id] = (stepAcc[p.id] || 0) + v * dt * Math.min(spd, 2);
          if (stepAcc[p.id] >= 1.15) { stepAcc[p.id] -= 1.15; play('step', { v: v, pan: panOf(p.pos) }); }
        });
      }
    },
    // OfflineAudioContext check: renders each sound alone, returns [{name, peak, rms, dur}]
    renderTable() {
      const OAC = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
      if (!OAC) return Promise.resolve([]);
      const list = [
        ['pok flat', 'pok', { kind: 'flatGround', speed: 18, q: 0.6 }, 0.4], ['pok smash', 'pok', { kind: 'smashFlat', speed: 28, q: 0.7 }, 0.4], ['pok lob', 'pok', { kind: 'lobDef', speed: 13 }, 0.4],
        ['pok dejada', 'pok', { kind: 'dejada', speed: 6 }, 0.4], ['turf', 'turf', { v: 12 }, 0.4], ['glass back', 'glass', { back: true, v: 14 }, 1.0], ['glass side', 'glass', { back: false, v: 14 }, 0.7],
        ['mesh', 'mesh', { v: 14 }, 0.6], ['net', 'net', { v: 10 }, 0.7], ['net tape', 'tape', {}, 0.3], ['post', 'post', { v: 12 }, 0.4], ['step', 'step', { v: 5 }, 0.3], ['tok', 'tok', {}, 0.3], ['ui click', 'click', {}, 0.3],
        ['clap', 'clap', { level: 1 }, 4], ['cheer', 'cheer', { level: 2 }, 5], ['gasp', 'gasp', {}, 1.2], ['groan', 'groan', {}, 1.4], ['wave', 'wave', {}, 4],
        ['tone fault', 'chime', { kind: 'fault' }, 0.6], ['tone point', 'chime', { kind: 'point' }, 0.5], ['tone game', 'chime', { kind: 'game' }, 0.6], ['pop', 'pop', {}, 0.3], ['bird', 'bird', {}, 0.7], ['fanfare', 'fanfare', {}, 3.4]
      ];
      const sr = 44100;
      return list.reduce(function (pr, it) {
        return pr.then(function (rows) {
          const oc = new OAC(1, Math.ceil(sr * it[3]), sr), out = oc.createGain();
          out.connect(oc.destination);
          const E = makeEnv(oc, out);
          S[it[1]](E, 0.01, Object.assign({ dest: out }, it[2]));
          return oc.startRendering().then(function (buf) {
            const d = buf.getChannelData(0); let pk = 0, ss = 0;
            for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; ss += d[i] * d[i]; }
            rows.push({ name: it[0], peak: +pk.toFixed(3), rms: +Math.sqrt(ss / d.length).toFixed(4), dur: it[3], voices: E.vc.started });
            return rows;
          });
        });
      }, Promise.resolve([]));
    },
    detach() { hooked = false; }
  });

  // ------------------------------------------------------------------ BUS wiring
  function hook() {
    if (hooked) return; hooked = true;
    BUS.on('shot:hit', function (e) { if (on() && e) play('pok', { kind: e.shot, speed: mag(e.v), q: e.quality, pan: panOf(e.p) }); });
    BUS.on('serve:toss', function () { play('tok', {}); });
    BUS.on('ball:contact', function (e) {
      if (!on() || !e) return;
      const v = mag(e.vIn), pan = panOf(e.p);
      switch (e.surf) {
        case 'floor': play('turf', { v: v, pan: pan }); break;
        case 'glassBack': play('glass', { back: true, v: v, pan: pan }); break;
        case 'glassSide': play('glass', { back: false, v: v, pan: pan }); break;
        case 'meshBack': case 'meshSide': case 'door': play('mesh', { v: v, pan: pan }); break;
        case 'net': play('net', { v: v, pan: pan }); break;
        case 'netTape': play('tape', { pan: pan }); break;
        case 'post': play('post', { v: v, pan: pan }); break;
        case 'ceiling': play('ceiling', { pan: pan }); break;
        default: break;
      }
    });
    BUS.on('ball:bounce', function (e) { if (on() && e) { const B = HPO.mod.ball; play('turf', { v: B && B.state ? mag(B.state.v) : 8, pan: panOf(e.p) }); } });
    BUS.on('point:end', onPointEnd);
    BUS.on('crowd:react', function (e) { if (e) react(e.level, e.kind); });
    BUS.on('flag:update', function (e) {
      if (!e) return;
      A.tension = e.matchPoint ? 1 : (e.setPoint || e.golden) ? 0.6 : e.breakPoint ? 0.35 : 0;
    });
    BUS.on('match:phase', function (e) {
      if (!e) return;
      if (e.phase === 'ceremony') A.celebrate();
      else if (e.phase === 'matchEnd') { A.tension = 0; react(3, 'cheer'); }
      else if (e.phase === 'intro') { A.tension = 0; A.mood = 0; }
    });
    BUS.on('match:new', function (e) { const c = e && e.config; if (c && c.venue) A.venue = c.venue; });
    BUS.on('speak', onSpeak);
    BUS.on('ui:setting', function (e) {
      if (!e) return;
      if (e.key === 'sound') A.setMuted(!e.value);
      else if (e.key === 'music') A.setMusic(!!e.value);
      else if (e.key === 'speech') A.setSpeech(!!e.value);
      else if (typeof e.key === 'string' && e.key.indexOf('volume:') === 0) A.setVolume(e.key.slice(7), e.value);
      else if (e.key === 'venue' && typeof e.value === 'string') A.venue = e.value;
    });
    BUS.on('audio:unlock', function () { A.unlock(); });
  }
  A.init = function () {
    hook();
    if (typeof document !== 'undefined' && !A._gesture) {
      A._gesture = true;
      const once = function () { A.unlock(); ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) { document.removeEventListener(n, once, true); }); };
      ['pointerdown', 'keydown', 'touchstart'].forEach(function (n) { document.addEventListener(n, once, true); });
    }
    const r = HPO.mod.render;
    if (r && typeof r.onFrame === 'function' && !A._frame) { A._frame = true; r.onFrame(function (dt) { A.update(dt); }); }
    else if (!A._frame && typeof requestAnimationFrame !== 'undefined') {
      A._frame = true; let last = now();
      const loop = function () { const n = now(); A.update((n - last) / 1000); last = n; requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    if (speechOK() && speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', loadVoices);
    // a backgrounded tab should go quiet
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', function () { if (!A.ac) return; try { if (document.hidden) A.ac.suspend(); else if (A.unlocked) A.ac.resume(); } catch (e) { /* ignore */ } });
  };
})(HPO);
