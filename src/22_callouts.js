// Callouts: comic-style exclamation bursts for line/serve calls and signature shots, plus the big pre-match state ribbon.
// Presentation only: listens to rules/player events, never emits. Styles live in shell.css (.hpo-co*, .hpo-state).
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS;
  const mod = n => HPO.mod[n];

  const SHOT = { smashFlat: 'smash', smashKick: 'smash', lobDef: 'lob', lobOff: 'lob', bandeja: 'bandeja', bajada: 'bajada' };
  // big = call on the whole point (centre of the screen); otherwise anchored above the player who hit the ball.
  // pri decides which burst wins when two arrive together; shake rattles the canvas (1 = knock, 2 = slam).
  const KIND = {
    out:     { text: 'OUT!',          col: '#e5484d', pri: 5, big: 1, shake: 1, rot: -6 },
    fault:   { text: 'FAULT!',        col: '#ff8a1f', pri: 5, big: 1, shake: 1, rot: 5 },
    double:  { text: 'DOUBLE FAULT!', col: '#b3122a', pri: 6, big: 1, shake: 2, rot: -4 },
    net:     { text: 'NET!',          col: '#e0a800', pri: 5, big: 1, shake: 1, rot: 4 },
    let:     { text: 'LET!',          col: '#e0a800', pri: 5, big: 1, shake: 0, rot: -5 },
    first:   { text: 'FIRST SERVE!',  col: '#177dc5', pri: 1, rot: -3 },
    smash:   { text: 'SMASH!',        col: '#ff4d2e', pri: 3, shake: 1, rot: -7 },
    lob:     { text: 'LOB!',          col: '#27a9e1', pri: 2, rot: 5 },
    bandeja: { text: 'BANDEJA!',      col: '#8e5bd9', pri: 2, rot: -4 },
    bajada:  { text: 'BAJADA!',       col: '#2fb26b', pri: 3, rot: 4 }
  };
  // reason on point:end -> callout
  const END = { out: 'out', wallFirst: 'out', ceiling: 'out', net: 'net', doubleFault: 'double' };
  const STATE = {
    intro: ['MATCH INTRO', 'Welcome to the club'], walkon: ['WALK-ON', 'The teams take the court'],
    introductions: ['MEET THE PLAYERS', 'Introductions'], toss: ['COIN TOSS', 'Who serves first?'], warmup: ['WARM-UP', 'Get loose']
  };
  const LIFE_MS = 1500, SOFT_GAP_MS = 2200;

  // a spiky burst: 14 spikes alternating between the outer and inner radius, stretched to the text box
  const STAR = (function () {
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = i % 2 ? 40 : 50; pts.push((50 + Math.cos(a) * r).toFixed(1) + ',' + (50 + Math.sin(a) * r).toFixed(1)); }
    const p = pts.join(' ');
    return '<svg class="hpo-co-star" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon class="sh" points="' + p + '"/><polygon class="fl" points="' + p + '"/></svg>';
  })();

  const C = HPO.mod.callouts = { ready: false, root: null, ribbon: null, live: [], last: null, lastSoft: 0, init: init, update: update, show: show };
  let tmpV = null;

  function init() {
    if (typeof document === 'undefined') return;
    const R = mod('render'), cont = (R && R.container) || document.getElementById('stage'); if (!cont) return;
    const root = C.root = document.createElement('div');
    root.className = 'hpo-callouts'; root.setAttribute('aria-hidden', 'true');
    const ribbon = C.ribbon = document.createElement('div');
    ribbon.className = 'hpo-state'; ribbon.hidden = true;
    ribbon.innerHTML = '<i class="dot"></i><b></b><small></small>';
    root.appendChild(ribbon);
    cont.appendChild(root);
    BUS.on('fault', onFault);
    BUS.on('point:end', onPointEnd);
    BUS.on('serve:hit', onServe);
    BUS.on('shot:hit', onShot);
    BUS.on('match:phase', onPhase);
    // main emits match:new right after starting the match, so keep whatever phase is already running
    BUS.on('match:new', function () { const M = mod('match'); clearAll(); setState((M && STATE[M.phase]) || null); });
    C.ready = true;
  }

  // ---------- gating ----------
  function allowed() {
    const M = mod('match'), rp = mod('replay');
    if (!C.ready || document.hidden) return false;
    if (rp && rp.active) return false;
    if (M && (M.phase !== 'play' || M.speed >= 4 || (M.cfg && M.cfg.fast))) return false; // fast-forwarded play would just be noise
    return true;
  }

  // ---------- events ----------
  function onFault(e) {
    if (!e) return;
    if (e.kind === 'let') return show('let');
    if (e.attempt >= 2) return; // the double fault call follows on point:end
    show(e.kind === 'net' ? 'net' : 'fault');
  }
  function onPointEnd(e) { const k = e && END[e.reason]; if (k) show(k); }
  function onServe(e) { if (e && e.attempt === 1) show('first', ballPos(e.playerId)); }
  function onShot(e) {
    if (!e || e.warmup || e.serve) return;
    const k = SHOT[e.shot]; if (k) show(k, ballPos(e.playerId, e.p));
  }
  function onPhase(e) {
    const s = e && STATE[e.phase];
    if (s) setState(s); else setState(null);
  }
  function ballPos(id, p) {
    const P = mod('players'), pl = P && P.byId && P.byId[id];
    const src = pl && pl.pos ? pl.pos : p; if (!src) return null;
    return { x: src.x, y: 2.7, z: src.z };
  }

  // ---------- bursts ----------
  function removeEntry(en) { clearTimeout(en.tm); if (en.el.parentNode) en.el.parentNode.removeChild(en.el); const i = C.live.indexOf(en); if (i >= 0) C.live.splice(i, 1); }
  function clearAll() { C.live.slice().forEach(removeEntry); C.last = null; }
  function show(key, wp) {
    const k = KIND[key]; if (!k || !allowed()) return;
    const now = performance.now(), last = C.last;
    if (last && now - last.t < 800 && k.pri <= last.pri) return;
    if (!k.big && k.pri < 5 && now - C.lastSoft < SOFT_GAP_MS) return; // keep the shot callouts special
    if (key === 'first' && C.live.length) return;
    if (!k.big && !wp) return;
    if (k.big || k.pri >= 5) C.live.slice().forEach(removeEntry); // a call replaces whatever is still on screen
    const el = document.createElement('div'); el.className = 'hpo-co' + (k.big ? ' big' : '') + ' k-' + key;
    const inn = document.createElement('div'); inn.className = 'hpo-co-in';
    inn.style.setProperty('--co', k.col); inn.style.setProperty('--rot', k.rot + 'deg');
    // fit the text to the stage: on narrow screens a multi-word call stacks on two lines so it can stay big
    const cw = C.root.clientWidth || 360, words = k.text.split(' '), stack = cw < 560 && words.length > 1, longest = stack ? Math.max.apply(null, words.map(function (s) { return s.length; })) : k.text.length;
    const want = k.big ? Math.min(88, cw * 0.115) : Math.max(24, Math.min(44, cw * 0.064));
    inn.style.fontSize = Math.floor(Math.min(want, cw * 0.94 / ((longest * 0.57 + 2.1) * 1.28))) + 'px';
    inn.innerHTML = STAR; const t = document.createElement('span'); t.className = 'hpo-co-t'; t.textContent = stack ? words.join('\n') : k.text; inn.appendChild(t);
    el.appendChild(inn); C.root.appendChild(el);
    const en = { el: el, wp: wp || null, big: !!k.big, pri: k.pri, t: now, tm: 0 };
    en.tm = setTimeout(function () { removeEntry(en); }, LIFE_MS + 100);
    C.live.push(en); C.last = en; if (!k.big && k.pri < 5) C.lastSoft = now;
    place(en);
    if (k.shake) rattle(k.shake);
  }
  function rattle(level) {
    const R = mod('render'), c = R && R.container; if (!c) return;
    c.classList.remove('hpo-shake1', 'hpo-shake2'); void c.offsetWidth; c.classList.add('hpo-shake' + level);
    clearTimeout(rattle.tm); rattle.tm = setTimeout(function () { c.classList.remove('hpo-shake1', 'hpo-shake2'); }, 480);
  }
  function place(en) {
    if (en.big || !en.wp) return;
    const R = mod('render'); if (!R || !R.project || !R.THREE) return;
    if (!tmpV) tmpV = new R.THREE.Vector3();
    tmpV.set(en.wp.x, en.wp.y, en.wp.z);
    const s = R.project(tmpV), cont = R.container, w = cont.clientWidth, h = cont.clientHeight;
    const x = Math.max(70, Math.min(w - 70, s.x)), y = Math.max(54, Math.min(h - 60, s.y));
    en.el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  }
  function update() { for (let i = 0; i < C.live.length; i++) place(C.live[i]); }

  // ---------- state ribbon ----------
  function setState(s) {
    const r = C.ribbon; if (!r) return;
    if (!s) { r.hidden = true; return; }
    r.querySelector('b').textContent = s[0]; r.querySelector('small').textContent = s[1];
    if (r.hidden) { r.hidden = false; r.classList.remove('in'); void r.offsetWidth; r.classList.add('in'); }
  }
})(HPO);
