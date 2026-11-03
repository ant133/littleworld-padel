// UI: page shell glue, TV scoreboard, control panel (match / court / coach / camera / audio / match centre), results screen, keyboard, debug overlay.
// Everything is guarded: other presentation modules may be missing; the UI degrades without console errors.
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, U = HPO.util;
  const mod = n => HPO.mod[n];
  const $ = (s, r) => (r || document).querySelector(s);

  // ---------- small DOM helpers ----------
  function h(tag, a) {
    const e = document.createElement(tag);
    if (a) for (const k in a) {
      const v = a[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(x => add(e, x));
    else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
  }
  function safe(fn, where) { try { return fn(); } catch (e) { U.logError('ui:' + (where || ''), e); } }
  const fmtClock = s => { s = Math.max(0, Math.floor(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const hex = n => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
  const other = t => t === 'A' ? 'B' : 'A';

  // ---------- constants ----------
  const PRESET_LABELS = [
    ['balanced', 'Balanced'], ['aggressive', 'Play Aggressive'], ['safe', 'Play Safe'], ['controlNet', 'Control the Net'],
    ['defensive', 'Defensive / More Lobs'], ['targetMiddle', 'Target the Middle'], ['targetGlass', 'Target the Glass'], ['rushNet', 'Rush the Net'],
    ['focusOne', 'Focus on One Opponent'], ['moreChiquitas', 'More Chiquitas'], ['moreSmashes', 'More Smashes']
  ];
  const VENUES = [['classicBlue', 'Classic Blue'], ['terracotta', 'Terracotta'], ['fastBlue', 'Fast Blue'], ['indoor', 'Indoor Padel']];
  const CAMS = [['follow', 'TV Follow'], ['club', 'Whole Club'], ['close', 'Court Close-Up'], ['top', 'Tactical Top-Down'], ['free', 'Free']];
  const ATTRS = [['power', 'PWR'], ['accuracy', 'ACC'], ['reflexes', 'REF'], ['coverage', 'COV'], ['stamina', 'STA'], ['net', 'NET'], ['defense', 'DEF'], ['wallRead', 'WAL'], ['tactics', 'TAC']];
  const ARCH = { netAttacker: 'Net attacker', wallSpecialist: 'Wall specialist', allRound: 'All-rounder', smasher: 'Smasher', precision: 'Precision', counterpuncher: 'Counter-puncher' };
  const SKIN = ['#f7d9c0', '#efc29a', '#c98f62', '#8d5a3b'];
  const FORMAT_NAMES = { quick: 'Quick', oneSet: 'One Set', bo3: 'Best of 3' };
  const PHASE_NAMES = { intro: 'Welcome', walkon: 'Walk-on', introductions: 'Introductions', toss: 'Coin toss', warmup: 'Warm-up', changeover: 'Changeover', setBreak: 'Set break', matchEnd: 'Match over', handshake: 'Handshake', ceremony: 'Ceremony', results: 'Final' };
  const KEYS = [['Space', 'Pause / resume'], ['N', 'New match'], ['Q / E', 'Rotate camera'], ['1 - 5', 'Camera mode'], ['+ / -', 'Zoom'], ['R', 'Reset view'], ['C', 'Challenge'], ['A', 'Aim next shot, then click the court'], ['S', 'Sound on / off'], ['M', 'Mute'], ['`', 'Debug overlay'], ['?', 'This sheet']];

  // ---------- state ----------
  const S = {
    format: 'quick', scoring: 'golden', type: 'M', venue: 'classicBlue', tod: 'day', teamA: [], teamB: [], seed: '',
    speed: 1, ff: false, autoNext: false, roof: true, markings: true, trail: true, raw: false, glass: 0.4, px: 2,
    soundOn: false, musicOn: false, callouts: true, muted: false, speech: false, vol: { master: 0.8, music: 0.5, fx: 0.8, crowd: 0.7, commentary: 0.8, ambience: 0.5 },
    coachTeam: 'A', coachClaimed: false, aim: false, debug: false, followBall: false, followPlayer: '',
    tab: 'score', feedKey: false
  };
  const ui = HPO.mod.ui = {
    state: S, root: null, stage: null, panel: null,
    init: init, update: update, feed: feed, toast: toast, setScore: setScore, newMatch: newMatch
  };
  let ctxRef = null;
  const syncs = [];
  const sync = () => syncs.forEach(f => safe(f, 'sync'));
  const EL = {}; // cached elements
  let pendingVenue = null, pendingTimeout = null, tmo = null, nextAt = 0, nextTimer = 0, resultsShown = false;
  let lastOrders = { A: {}, B: {} };
  let playStartSim = 0, rallyN = 0, lastSurf = '-', lastSurfAt = 0, lastPhase = 'idle', accT = 0, acc4 = 0, accDbg = 0, accStats = 0;
  let feedItems = [], feedSeq = 0, aimSetAt = 0, aimTeam = null;
  let toastCount = 0, flags = { matchPoint: null, setPoint: null, breakPoint: null, golden: false };
  let dbg = { line: null, mark: null, tAcc: 0, pred: null };

  // ---------- roster helpers ----------
  const roster = () => (mod('players') && mod('players').roster && mod('players').roster()) || [];
  const rdef = id => roster().find(r => r.id === id);
  function defaultsFor(type) {
    const r = roster(), men = r.filter(x => x.gender === 'M'), wom = r.filter(x => x.gender === 'F');
    if (type === 'W') return { A: [wom[0], wom[1]], B: [wom[2], wom[3]] };
    if (type === 'X') return { A: [men[0], wom[0]], B: [men[2], wom[2]] };
    return { A: [men[0], men[1]], B: [men[2], men[3]] };
  }
  function applyDefaults(type) {
    const d = defaultsFor(type);
    S.teamA = d.A.filter(Boolean).map(x => x.id); S.teamB = d.B.filter(Boolean).map(x => x.id);
  }
  function randomDraw(type) {
    const r = roster(), men = r.filter(x => x.gender === 'M'), wom = r.filter(x => x.gender === 'F');
    const sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    if (type === 'X') { const m = sh(men), w = sh(wom); return { A: [m[0].id, w[0].id], B: [m[1].id, w[1].id] }; }
    const p = sh(type === 'W' ? wom : men); return { A: [p[0].id, p[1].id], B: [p[2].id, p[3].id] };
  }
  function shortName(def, long) {
    if (!def) return '';
    const parts = def.name.split(' ');
    const mobile = HPO.cfg.mobile || (EL.stage && EL.stage.clientWidth < 520);
    if (def.id === 'p5' && !long) return 'Annetta';
    if (long || parts.length < 2) return def.name;
    return mobile ? parts[parts.length - 1] : parts[0][0] + '. ' + parts.slice(1).join(' ');
  }
  function pairName(ids) { return ids.map(id => { const d = rdef(id); return d ? (d.id === 'p5' ? 'Annetta' : d.name.split(' ').slice(-1)[0]) : id; }).join(' / '); }
  function teamIds(team) { const pl = mod('players'); if (pl && pl.list && pl.list.length) return pl.list.filter(p => p.team === team).sort((a, b) => a.slot - b.slot).map(p => p.id); return team === 'A' ? S.teamA : S.teamB; }
  function teamName(team) { return pairName(teamIds(team)); }

  // ---------- init ----------
  function init(ctx) {
    ctxRef = ctx;
    EL.stage = document.getElementById('stage') || (ctx.opts && ctx.opts.container) || document.body;
    EL.panel = document.getElementById('panel');
    if (!EL.panel) { EL.panel = h('aside', { id: 'panel' }); document.body.appendChild(EL.panel); }
    ui.stage = EL.stage; ui.panel = EL.panel; ui.root = EL.panel.parentNode;
    document.title = HPO.cfg.TITLE();
    const t = document.getElementById('title'); if (t) t.textContent = HPO.cfg.TITLE();
    loadFonts();
    const R = mod('render');
    S.px = (R && R.pixelSize) || 2;
    if (R && R.cameraMode) S.cam = R.cameraMode;
    S.cam = (R && R.cameraMode) || 'club';
    if (R && R.todParams && R.todParams.tod && R.todParams.tod !== 'indoor') S.tod = R.todParams.tod;
    const q = HPO.query;
    if (q && q.get('venue') && VENUES.some(v => v[0] === q.get('venue'))) S.venue = q.get('venue');
    applyDefaults(S.type);
    // overlays
    EL.sb = h('div', { id: 'sb', 'aria-live': 'off' }); EL.stage.appendChild(EL.sb);
    EL.toasts = h('div', { id: 'toasts', 'aria-live': 'polite' }); EL.stage.appendChild(EL.toasts);
    EL.fab = h('div', { id: 'fab' },
      h('button', { class: 'btn small', type: 'button', id: 'fab-pause', title: 'Pause / resume (Space)', onclick: togglePause }, 'Pause'),
      h('button', { class: 'btn primary small', type: 'button', id: 'fab-new', title: 'New match (N)', onclick: () => newMatch() }, 'New Match'));
    EL.stage.appendChild(EL.fab);
    EL.banner = h('div', { id: 'banner', hidden: true }); EL.stage.appendChild(EL.banner);
    EL.aimhud = h('div', { class: 'aimhud', hidden: true }, 'Click the court to aim your next shot (Esc to cancel)'); EL.stage.appendChild(EL.aimhud);
    EL.aimmark = h('div', { id: 'aimmark', hidden: true }); EL.stage.appendChild(EL.aimmark);
    EL.debug = h('div', { id: 'debug', hidden: true }); EL.stage.appendChild(EL.debug);
    buildScoreboard();
    buildPanel();
    loadSavedPlayers();
    const help = document.getElementById('btn-help'); if (help) help.addEventListener('click', showKeys);
    // events
    bindBus();
    document.addEventListener('keydown', onKey);
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, firstGesture, { capture: true, passive: true }));
    EL.stage.addEventListener('click', onStageClick, true);
    window.addEventListener('resize', () => { if (lastScoreState) setScore(lastScoreState); });
    window.addEventListener('online', loadFonts);
    // initial audio state: off
    const A = mod('audio'); if (A && A.setMuted) safe(() => A.setMuted(true), 'audio.muted');
    // adopt an already running match
    const M = mod('match');
    if (M && M.cfg) onMatchNew({ config: M.cfg });
    sync();
    ui.api = { S: S, EL: EL, h: h, add: add, safe: safe, toast: toast, feed: feed, drawPortrait: drawPortrait, flagEl: flagEl, mbar: mbar, teamName: teamName, teamIds: teamIds, rdef: rdef, roster: roster,
      contribution: contribution, teamSum: teamSum, newMatch: newMatch, applyVenueVisuals: applyVenueVisuals, applyTod: applyTod, applyDefaults: applyDefaults, refillPickers: refillPickers,
      renderTab: renderTab, setSpeed: setSpeed, togglePause: togglePause, setMusic: setMusic, setVolume: setVolume, setCallouts: setCallouts, skipCeremony: skipCeremony, doChallenge: doChallenge, callTimeout: callTimeout, setCam: setCam, setSound: setSound, orders: orders,
      claimCoach: claimCoach, closeModal: closeModal, fmtClock: fmtClock, M_clock: M_clock, savePlayerDef: savePlayerDef, openStudioPanel: null, ARCH: ARCH, ATTRS: ATTRS, FORMAT_NAMES: FORMAT_NAMES,
      PHASE_NAMES: PHASE_NAMES, VENUES: VENUES, CAMS: CAMS, showKeys: showKeys, setScore: setScore, shortName: shortName, other: other, hex: hex,
      isBusy: () => !!tmo, resultsReset: () => { resultsShown = false; } };
    const G = mod('game'); if (G && G.init) safe(() => G.init(ctx, ui.api), 'game.init');
  }

  let fontsLoaded = false;
  function loadFonts() {
    if (fontsLoaded || typeof navigator === 'undefined' || !navigator.onLine) return;
    fontsLoaded = true;
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;700;800&display=swap';
    document.head.appendChild(l);
  }
  let gestured = false;
  function firstGesture() {
    if (gestured) return; gestured = true;
    const A = mod('audio'); if (A && A.unlock) safe(() => A.unlock(), 'audio.unlock');
    BUS.emit('audio:unlock', {});
  }

  // ---------- scoreboard ----------
  let lastScoreState = null, sbPrev = {};
  function buildScoreboard() {
    EL.sbTop = h('div', { class: 'sb-top' }, h('span', { id: 'sb-fmt' }, 'Quick'), h('span', { class: 'ph', id: 'sb-ph' }, ''));
    EL.sbRows = { A: h('div', { class: 'sb-row a' }), B: h('div', { class: 'sb-row b' }) };
    EL.sbInfo = h('div', { class: 'sb-info' });
    EL.sbCard = h('div', { class: 'sb-card' }, EL.sbTop, EL.sbRows.A, EL.sbRows.B, EL.sbInfo);
    EL.sb.appendChild(EL.sbCard);
    EL.chipClock = h('span', { class: 'chip', title: 'Match clock' }, '00:00');
    EL.chipRally = h('span', { class: 'chip', title: 'Rally strokes', hidden: true }, '');
    EL.chipSpeed = h('span', { class: 'chip', title: 'Sim speed' }, '1×');
    EL.chipTb = h('span', { class: 'chip', hidden: true }, 'TIE-BREAK');
    EL.stkGolden = h('span', { class: 'sticker gp', hidden: true }, 'GOLDEN POINT');
    EL.sbInfo.append(EL.chipClock, EL.chipRally, EL.chipSpeed, EL.chipTb, EL.stkGolden);
  }
  function flagEl(code) { return h('span', { class: 'flag flag-' + (code || 'XXX'), title: code || '' }); }
  function setScore(st) {
    lastScoreState = st || lastScoreState;
    st = lastScoreState; if (!st || !EL.sbRows) return;
    const Rl = mod('rules'), P = mod('players');
    const names = {}; if (P && P.list) P.list.forEach(p => { names[p.id] = p.name; });
    let d = null; try { d = Rl && Rl.describe ? Rl.describe(st, names) : null; } catch (e) { d = null; }
    ['A', 'B'].forEach(function (team) {
      const row = EL.sbRows[team];
      const ids = teamIds(team);
      const srv = st.server && st.server.team === team ? st.server.playerId : null;
      const sig = ids.join(',') + '|' + srv + '|' + (EL.stage.clientWidth < 520);
      if (row._sig !== sig) {
        row._sig = sig; row.textContent = '';
        const dotCol = h('div', { class: 'sb-srv' }, h('i', { class: srv ? 'on' : '' }));
        const nm = h('div', { class: 'sb-names' }, ids.map(id => {
          const def = rdef(id);
          return h('div', { class: 'sb-p' + (id === srv ? ' srv' : '') }, flagEl(def && def.country && def.country.code), h('span', null, shortName(def)));
        }));
        row._dot = dotCol.firstChild; row._cells = h('div', { style: 'display:flex' }); row._pts = h('div', { class: 'sb-pts' }, h('span', null, '0'));
        row._stk = h('div', { class: 'stk' });
        row.append(dotCol, nm, row._cells, row._pts, row._stk);
        row._cellSig = ''; row._ptsText = null;
        // server dot placed on the serving team's row, next to whichever player serves
        if (srv) { const idx = ids.indexOf(srv); dotCol.style.alignItems = idx === 1 ? 'end' : 'start'; dotCol.style.paddingBlock = '9px'; }
      }
      // cells: completed sets + current games
      const sets = st.sets || [];
      const oth = other(team);
      const cellVals = sets.map(s => ({ v: s[team] + (s.tb && s[team] < s[oth] ? '' : ''), win: s[team] > s[oth] }));
      const games = st.games ? st.games[team] : 0;
      const csig = JSON.stringify([cellVals, games]);
      if (row._cellSig !== csig) {
        const prevG = row._games;
        row._cellSig = csig; row._cells.textContent = '';
        cellVals.forEach(c => row._cells.appendChild(h('div', { class: 'sb-cell dim' + (c.win ? ' win' : '') }, String(c.v))));
        const gc = h('div', { class: 'sb-cell g' }, h('span', { class: prevG !== undefined && prevG !== games ? 'flip' : '' }, String(games)));
        row._cells.appendChild(gc);
      }
      row._games = games;
      let pt = d ? d.pointsText[team] : '0';
      if (st.over) pt = '–';
      if (row._ptsText !== pt) {
        const sp = row._pts.firstChild; sp.textContent = pt;
        if (row._ptsText !== null) { sp.classList.remove('flip'); void sp.offsetWidth; sp.classList.add('flip'); }
        row._ptsText = pt;
      }
    });
    const f = st.config && st.config.format ? st.config.format : (mod('match') && mod('match').cfg && mod('match').cfg.format) || 'quick';
    const sc = (st.config && st.config.scoring) || S.scoring;
    $('#sb-fmt', EL.sbCard).textContent = (FORMAT_NAMES[f] || f) + (sc === 'golden' ? ' · Golden Point' : ' · Advantage');
    EL.chipTb.hidden = !st.inTiebreak;
    updateStickers(st);
    updatePhaseLabel();
    renderScoreTab();
  }
  function updateStickers(st) {
    const fl = (st && st.flags) || flags;
    const gold = !!(st && st.goldenPoint) || flags.golden;
    EL.stkGolden.hidden = !gold || !!(st && st.over);
    ['A', 'B'].forEach(function (team) {
      const row = EL.sbRows[team]; if (!row || !row._stk) return;
      const want = [];
      if (fl.matchPoint === team) want.push('MATCH POINT');
      if (fl.setPoint === team) want.push('SET POINT');
      if (fl.breakPoint === team) want.push('BREAK POINT');
      const sig = want.join('|');
      if (row._stkSig === sig) return;
      row._stkSig = sig; row._stk.textContent = '';
      want.forEach(w => row._stk.appendChild(h('span', { class: 'sticker' }, w)));
    });
  }
  function updatePhaseLabel() {
    const M = mod('match'), ph = M ? M.phase : 'idle', el = $('#sb-ph', EL.sbCard);
    if (!el) return;
    el.textContent = PHASE_NAMES[ph] || '';
  }

  // ---------- toasts, banner ----------
  function toast(text, opts) {
    opts = opts || {};
    if (!EL.toasts) return;
    while (EL.toasts.children.length >= 3) EL.toasts.removeChild(EL.toasts.firstChild);
    const t = h('div', { class: 'toast ' + (opts.kind || 'info') }, text);
    EL.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, opts.ms || 3600);
  }
  function banner(html, actions) {
    if (!html) { EL.banner.hidden = true; return; }
    EL.banner.hidden = false; EL.banner.textContent = '';
    add(EL.banner, html);
    if (actions) add(EL.banner, actions);
  }

  // ---------- feed ----------
  function feed(entry) {
    if (!entry) return;
    if (typeof entry === 'string') entry = { text: entry };
    const it = { id: ++feedSeq, text: String(entry.text || ''), icon: entry.icon || '•', key: !!entry.key, t: M_clock() };
    feedItems.unshift(it);
    if (feedItems.length > 200) feedItems.length = 200;
    if (EL.feedList) {
      const empty = EL.feedList.querySelector('.empty'); if (empty) empty.remove();
      EL.feedList.insertBefore(feedNode(it), EL.feedList.firstChild);
      while (EL.feedList.children.length > 200) EL.feedList.removeChild(EL.feedList.lastChild);
    }
    const G = mod('game'); if (G && G.onFeed) safe(() => G.onFeed(it, entry), 'game.onFeed');
  }
  function feedNode(it) { return h('div', { class: 'it' + (it.key ? ' key' : '') }, h('span', { class: 'ic' }, it.icon), h('span', null, it.text), h('span', { class: 'tm' }, it.t)); }
  function M_clock() { const M = mod('match'); return M ? fmtClock((M.simTime || 0) - playStartSim) : '00:00'; }
  function feedReset() { feedItems = []; if (EL.feedList) { EL.feedList.textContent = ''; EL.feedList.appendChild(h('div', { class: 'empty' }, 'Quiet so far. The first point will show up here.')); } }

  // ---------- panel building ----------
  function section(num, tag, title, open, body, id) {
    const d = h('details', { class: 'sec', id: id });
    if (open) d.open = true;
    d.append(h('summary', null, h('span', { class: 'tag' }, num + ' / ' + tag), h('h2', null, title)), h('div', { class: 'body' }, body));
    return d;
  }
  function seg(opts, get, set, cls) {
    const root = h('div', { class: 'seg ' + (cls || '') });
    const btns = opts.map(o => {
      const b = h('button', { type: 'button', 'aria-pressed': 'false', title: o[2] || '', onclick: () => set(o[0]) }, o[1]); b.dataset.v = String(o[0]); root.appendChild(b); return b;
    });
    const f = () => { const v = String(get()); btns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false')); };
    syncs.push(f); f();
    return { root: root, btns: btns, sync: f };
  }
  function field(label, ctl, hint) { return h('div', { class: 'field' }, h('div', { class: 'lbl' }, label), ctl, hint ? h('p', { class: 'hint' }, hint) : null); }
  function sw(label, get, set, id) {
    const inp = h('input', { type: 'checkbox', id: id }); inp.addEventListener('change', () => set(inp.checked));
    const l = h('label', { class: 'switch' }, inp, h('span', { class: 'box' }), h('span', null, label));
    syncs.push(() => { inp.checked = !!get(); });
    return { root: l, input: inp };
  }
  function slider(min, max, step, get, set, id) {
    const inp = h('input', { type: 'range', min: min, max: max, step: step, id: id });
    inp.addEventListener('input', () => set(+inp.value));
    syncs.push(() => { inp.value = get(); });
    return inp;
  }

  function buildPanel() {
    const foot = $('#foot', EL.panel);
    const nodes = [buildHead(), buildMatchSec(), buildCourtSec(), buildCoachSec(), buildCameraSec(), buildAudioSec(), buildCentreSec()];
    nodes.forEach(n => EL.panel.insertBefore(n, foot));
    const desk = window.innerWidth >= 900;
    $('#sec-match').open = true;
    $('#sec-centre').open = desk;
    $('#sec-coach').open = desk;
  }

  function buildHead() {
    EL.btnNew = h('button', { class: 'btn primary', type: 'button', id: 'btn-new', title: 'Start a new match (N)', onclick: () => newMatch() }, 'New Match');
    EL.btnPause = h('button', { class: 'btn', type: 'button', id: 'btn-pause', title: 'Pause / resume (Space)', onclick: togglePause }, 'Pause');
    const speeds = [[0.5, '0.5×'], [1, '1×'], [2, '2×'], [4, '4×'], [8, '8×'], [16, '16×']];
    EL.speed = seg(speeds, () => S.speed, setSpeed, 'speed');
    // 8x / 16x only when fast-forward enabled; long-press on 4x also enables it
    EL.speed.btns.forEach(b => { if (+b.dataset.v > 4) b.classList.add('ffbtn'); });
    const four = EL.speed.btns[3]; let lp = 0;
    four.addEventListener('pointerdown', () => { lp = setTimeout(() => { S.ff = true; sync(); toast('Fast-forward unlocked: 8× and 16×.'); lp = -1; }, 650); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => four.addEventListener(ev, () => { if (lp > 0) clearTimeout(lp); }));
    four.addEventListener('click', e => { if (lp === -1) { e.stopImmediatePropagation(); lp = 0; } }, true);
    syncs.push(() => EL.speed.btns.forEach(b => { b.hidden = b.classList.contains('ffbtn') && !S.ff; }));
    syncs.push(() => {
      const M = mod('match'); const p = !!(M && M.paused);
      EL.btnPause.textContent = p ? 'Resume' : 'Pause'; const fp = $('#fab-pause'); if (fp) fp.textContent = p ? 'Resume' : 'Pause';
    });
    return h('div', { class: 'panel-head' },
      h('div', { class: 'row' }, EL.btnNew, EL.btnPause),
      h('div', { class: 'row' }, EL.speed.root));
  }

  function buildMatchSec() {
    const b = [];
    b.push(field('Format', seg([['quick', 'Quick', 'First to 4 games, tie-break at 4-4'], ['oneSet', 'One Set', 'First to 6 games'], ['bo3', 'Best of 3', 'Two sets to win']], () => S.format, v => { S.format = v; sync(); }).root));
    b.push(field('Match type', seg([['M', "Men's"], ['W', "Women's"], ['X', 'Mixed']], () => S.type, v => { S.type = v; applyDefaults(v); refillPickers(); sync(); }).root));
    b.push(field('Scoring', seg([['advantage', 'Advantage'], ['golden', 'Golden Point', 'One deciding point at 40-40']], () => S.scoring, v => { S.scoring = v; sync(); }).root));
    EL.pick = {};
    const pk = h('div', { class: 'pickers' });
    [['A', 'Team A'], ['B', 'Team B']].forEach(function (t) {
      pk.appendChild(h('div', { class: 'team-tag' }, h('i', { class: 'dot' + (t[0] === 'B' ? ' b' : '') }), h('span', { class: 'tag' }, t[1])));
      for (let i = 0; i < 2; i++) {
        const sel = h('select', { 'aria-label': t[1] + ' player ' + (i + 1), id: 'pk-' + t[0] + i });
        sel.addEventListener('change', () => { (t[0] === 'A' ? S.teamA : S.teamB)[i] = sel.value; refillPickers(); });
        EL.pick[t[0] + i] = sel; pk.appendChild(sel);
      }
    });
    b.push(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Players'), pk));
    refillPickers();
    b.push(buildCreatePlayer());
    const seedIn = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'random', id: 'in-seed', 'aria-label': 'Seed' });
    seedIn.addEventListener('input', () => { S.seed = seedIn.value.replace(/[^0-9]/g, ''); });
    syncs.push(() => { if (document.activeElement !== seedIn) seedIn.value = S.seed; });
    const ff = sw('Fast-forward (adds 8× and 16×)', () => S.ff, v => { S.ff = v; if (!v && S.speed > 4) setSpeed(4); sync(); }, 'sw-ff');
    b.push(h('div', { class: 'grid2', style: 'margin-top:8px' },
      h('button', { class: 'btn', type: 'button', id: 'btn-skip', title: 'Skip walk-on, toss and ceremony', onclick: skipCeremony }, 'Skip ceremony'),
      sw('Auto-next match', () => S.autoNext, v => { S.autoNext = v; if (!v) { nextAt = 0; } }, 'sw-auto').root));
    b.push(h('details', { class: 'adv' }, h('summary', null, 'Advanced'), field('Seed (same seed = same match)', seedIn), ff.root));
    return section('01', 'Match', 'Match setup', true, b, 'sec-match');
  }

  let playerDB;
  function openPlayerDB() {
    if (!playerDB) playerDB = new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('Storage unavailable'));
      const request = window.indexedDB.open('littleworld-padel', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('players', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Storage blocked'));
    });
    return playerDB;
  }
  async function loadSavedPlayers() {
    S.saved = []; S.savedOk = true;
    try {
      const db = await openPlayerDB();
      const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction('players', 'readonly'), req = tx.objectStore('players').getAll();
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      saved.sort((x, y) => (x.savedAt || 0) - (y.savedAt || 0));
      saved.forEach(def => {
        try {
          const live = mod('players').restoreCustom(def);
          if (def.country && def.country.code) live.country = { code: def.country.code, name: def.country.name };
          live.savedAt = def.savedAt || 0; S.saved.push(live);
        } catch (e) { /* skip invalid records */ }
      });
      refillPickers();
    } catch (e) { S.savedOk = false; }
    const G = mod('game'); if (G && G.onSaved) safe(() => G.onSaved(), 'game.onSaved');
  }
  async function savePlayerDef(def) {
    try {
      def.savedAt = Date.now();
      const db = await openPlayerDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('players', 'readwrite'); tx.objectStore('players').put(JSON.parse(JSON.stringify(def)));
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      return true;
    } catch (err) { return false; }
  }
  function buildCreatePlayer() {
    EL.playerStatus = h('p', { class: 'hint', role: 'status', id: 'create-status' }, 'Random stats and look. Saved on this device and browser.');
    const btn = h('button', { class: 'btn primary block', type: 'button', id: 'btn-create-player', onclick: () => { const G = mod('game'); if (G && G.showCreate) G.showCreate(); } }, 'Create player · play with Annetta');
    return h('div', { class: 'field', id: 'create-player-section' }, btn, EL.playerStatus);
  }

  function refillPickers() {
    const r = roster(); if (!r.length || !EL.pick) return;
    const men = r.filter(x => x.gender === 'M'), wom = r.filter(x => x.gender === 'F');
    const chosen = S.teamA.concat(S.teamB);
    ['A', 'B'].forEach(function (t) {
      const ids = t === 'A' ? S.teamA : S.teamB;
      for (let i = 0; i < 2; i++) {
        const sel = EL.pick[t + i];
        const pool = S.type === 'M' ? men : S.type === 'W' ? wom : (i === 0 ? men : wom);
        sel.textContent = '';
        pool.forEach(p => {
          const o = h('option', { value: p.id }, p.name);
          const me = ids[i];
          if (p.id !== me && chosen.indexOf(p.id) >= 0) o.disabled = true;
          sel.appendChild(o);
        });
        if (!pool.some(p => p.id === ids[i])) { const free = pool.find(p => chosen.indexOf(p.id) < 0) || pool[0]; ids[i] = free.id; }
        sel.value = ids[i];
      }
    });
  }

  function buildCourtSec() {
    const b = [];
    b.push(field('Court configuration', seg(VENUES, () => S.venue, onVenue).root));
    EL.todSeg = seg([['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], () => S.tod, v => { S.tod = v; applyTod(); sync(); });
    EL.todField = field('Time of day', EL.todSeg.root, 'Indoor courts always use hall lighting.');
    b.push(EL.todField);
    syncs.push(() => { const ind = S.venue === 'indoor'; EL.todSeg.btns.forEach(x => { x.disabled = ind; }); });
    EL.roofSw = sw('Show roof', () => S.roof, v => { S.roof = v; const R = mod('render'); if (R && R.setRoof) safe(() => R.setRoof(v), 'roof'); }, 'sw-roof');
    syncs.push(() => { EL.roofSw.root.hidden = S.venue !== 'indoor'; });
    b.push(EL.roofSw.root);
    const gl = slider(0, 1, 0.05, () => S.glass, v => { S.glass = v; const R = mod('render'); if (R && R.setGlassOpacity) safe(() => R.setGlassOpacity(v), 'glass'); }, 'rg-glass');
    b.push(field('Glass transparency', gl));
    b.push(sw('Court markings', () => S.markings, v => { S.markings = v; const w = mod('worldCourt'); if (w && w.setOptions) safe(() => w.setOptions({ showMarkings: v }), 'markings'); }, 'sw-marks').root);
    b.push(sw('Ball trail', () => S.trail, v => { S.trail = v; const a = mod('actors'); if (a && a.setTrail) safe(() => a.setTrail(v), 'trail'); }, 'sw-trail').root);
    const out = h('span', { class: 'mono' }, '2');
    const px = slider(1, 6, 1, () => S.px, v => { S.px = v; const R = mod('render'); if (R && R.setPixelSize) safe(() => R.setPixelSize(v), 'px'); out.textContent = v; }, 'rg-px');
    syncs.push(() => { out.textContent = S.px; });
    b.push(h('div', { class: 'field' }, h('div', { class: 'lbl rowline' }, h('span', null, 'Pixel size'), out), px, h('p', { class: 'hint' }, 'Chunkier pixels run faster.')));
    b.push(sw('Raw 3D (debug look)', () => S.raw, v => { S.raw = v; const R = mod('render'); if (R && R.debugRaw) safe(() => R.debugRaw(v), 'raw'); }, 'sw-raw').root);
    return section('02', 'Court', 'Court and look', false, b, 'sec-court');
  }

  function onVenue(v) {
    S.venue = v;
    const M = mod('match'), C = mod('court');
    applyVenueVisuals(v);
    const live = M && M.phase === 'play';
    if (live) { pendingVenue = v; toast('Court change applies from the next point.', { kind: 'warn' }); }
    else { if (C && C.setVenue) safe(() => C.setVenue(v), 'court.setVenue'); if (M && M.cfg) M.cfg.venue = v; pendingVenue = null; }
    applyTod(); sync();
  }
  function applyVenueVisuals(v) {
    ['worldCourt', 'worldIsland', 'worldClub'].forEach(n => { const m = mod(n); if (m && m.setVenue) safe(() => m.setVenue(v), n + '.setVenue'); });
    const R = mod('render');
    if (v === 'indoor' && R && R.setRoof) safe(() => R.setRoof(S.roof), 'roof');
  }
  function applyTod() {
    const R = mod('render'); if (!R || !R.setTimeOfDay) return;
    const want = S.venue === 'indoor' ? 'indoor' : S.tod;
    if (R.todParams && R.todParams.tod === want) return;
    safe(() => R.setTimeOfDay(want), 'tod');
  }

  // ----- Coach -----
  function orders(t) { const A = mod('ai'); return (A && A.teams && A.teams[t] && A.teams[t].orders) || {}; }
  function claimCoach() {
    const M = mod('match');
    if (M) M.coachTeam = S.coachTeam;
    S.coachClaimed = true;
  }
  function setOrder(patch) {
    const A = mod('ai'); if (!A || !A.setOrders) return;
    claimCoach();
    safe(() => A.setOrders(S.coachTeam, patch), 'setOrders');
    sync();
  }
  function buildCoachSec() {
    const b = [];
    const teamSeg = seg([['A', 'Team A'], ['B', 'Team B']], () => S.coachTeam, v => { S.coachTeam = v; claimCoach(); sync(); });
    EL.coachTeamSeg = teamSeg;
    b.push(field('You coach', teamSeg.root, 'Pick a team, then give orders. Changes take effect on the next shot.'));
    const keys = (mod('ai') && mod('ai').PRESETS) || null;
    const grid = h('div', { class: 'preset-grid' });
    PRESET_LABELS.forEach(function (p) {
      if (keys && !keys[p[0]]) return;
      const btn = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setOrder(p[0] === 'focusOne' ? { preset: 'focusOne', focusOpponent: orders(S.coachTeam).focusOpponent !== undefined ? orders(S.coachTeam).focusOpponent : 0 } : { preset: p[0], focusOpponent: undefined }) }, p[1]);
      syncs.push(() => btn.setAttribute('aria-pressed', (orders(S.coachTeam).preset || 'balanced') === p[0] ? 'true' : 'false'));
      grid.appendChild(btn);
    });
    b.push(h('div', { class: 'sub' }, 'Tactic'), grid);
    EL.focusSel = h('select', { 'aria-label': 'Focus opponent', id: 'sel-focus' });
    EL.focusSel.addEventListener('change', () => setOrder({ preset: 'focusOne', focusOpponent: +EL.focusSel.value }));
    EL.focusField = field('Focus on', EL.focusSel);
    b.push(EL.focusField);
    syncs.push(() => {
      EL.focusField.hidden = (orders(S.coachTeam).preset !== 'focusOne');
      const opp = teamIds(other(S.coachTeam)); EL.focusSel.textContent = '';
      opp.forEach((id, i) => EL.focusSel.appendChild(h('option', { value: i }, (rdef(id) || {}).name || id)));
      const fo = orders(S.coachTeam).focusOpponent; EL.focusSel.value = fo !== undefined ? fo : 0;
    });
    b.push(h('div', { class: 'sub' }, 'Serve and return'));
    b.push(field('Serve direction', seg([['auto', 'Auto'], ['wide', 'Wide'], ['T', 'T'], ['body', 'Body']], () => orders(S.coachTeam).serveDir || 'auto', v => setOrder({ serveDir: v })).root));
    b.push(field('Return direction', seg([['auto', 'Auto'], ['crosscourt', 'Cross'], ['line', 'Line'], ['lob', 'Lob'], ['middle', 'Middle']], () => orders(S.coachTeam).returnDir || 'auto', v => setOrder({ returnDir: v })).root));
    EL.midSel = h('select', { 'aria-label': 'Middle ball priority', id: 'sel-mid' });
    EL.midSel.addEventListener('change', () => setOrder({ middlePriority: EL.midSel.value === '' ? undefined : +EL.midSel.value }));
    b.push(field('Middle-ball priority', EL.midSel));
    syncs.push(() => {
      const ids = teamIds(S.coachTeam); EL.midSel.textContent = '';
      EL.midSel.appendChild(h('option', { value: '' }, 'Auto'));
      ids.forEach((id, i) => EL.midSel.appendChild(h('option', { value: i }, (rdef(id) || {}).name || id)));
      const mp = orders(S.coachTeam).middlePriority; EL.midSel.value = mp === undefined ? '' : String(mp);
    });
    b.push(h('div', { class: 'sub' }, 'In the moment'));
    EL.btnAim = h('button', { class: 'btn', type: 'button', id: 'btn-aim', onclick: toggleAim, title: 'Aim next shot (A)' }, h('span', null, 'Aim next shot '), h('span', { class: 'keycap' }, 'A'));
    EL.btnTmo = h('button', { class: 'btn', type: 'button', id: 'btn-timeout', onclick: callTimeout }, 'Call timeout');
    EL.btnChal = h('button', { class: 'btn', type: 'button', id: 'btn-challenge', onclick: doChallenge, title: 'Challenge the last line call (C)' }, h('span', null, 'Challenge '), h('span', { class: 'keycap' }, 'C'));
    b.push(h('div', { class: 'grid3' }, EL.btnAim, EL.btnTmo, EL.btnChal));
    EL.coachInfo = h('p', { class: 'hint' }, '');
    b.push(EL.coachInfo);
    return section('03', 'Coach', 'Coach box', window.innerWidth >= 900, b, 'sec-coach');
  }
  function toggleAim() {
    if (!mod('render') || !mod('render').pickCourt) { toast('Aiming needs the 3D view.', { kind: 'warn' }); return; }
    S.aim = !S.aim; claimCoach();
    EL.stage.classList.toggle('aiming', S.aim); EL.aimhud.hidden = !S.aim;
    EL.btnAim.setAttribute('aria-pressed', S.aim ? 'true' : 'false');
  }
  function setAimAt(x, z) {
    S.aim = false; EL.stage.classList.remove('aiming'); EL.aimhud.hidden = true;
    const A = mod('ai');
    if (!A || !A.setAim) return;
    if (Math.abs(x) > 10 || Math.abs(z) > 5) { toast('Aim inside the court lines.', { kind: 'warn' }); return; }
    claimCoach();
    A.setAim(S.coachTeam, x, z);
    aimSetAt = performance.now(); aimTeam = S.coachTeam; aimXZ = { x: x, z: z };
    toast('Aim set. Your next shot goes there if it is on.', { kind: 'good' });
  }
  let aimXZ = null;
  function onStageClick(e) {
    if (!S.aim) return;
    const R = mod('render'); if (!R || !R.pickCourt) return;
    const p = R.pickCourt(e.clientX, e.clientY);
    e.stopPropagation(); e.preventDefault();
    if (p) setAimAt(p.x, p.z); else toast('Click on the court.', { kind: 'warn' });
  }
  function callTimeout() {
    const Rl = mod('rules'), M = mod('match');
    if (!Rl || !Rl.state) return;
    claimCoach();
    const t = S.coachTeam;
    if (Rl.state.over) { toast('The match is over.', { kind: 'warn' }); return; }
    if (!(Rl.state.timeouts && Rl.state.timeouts[t] > 0)) { toast('No timeouts left.', { kind: 'warn' }); return; }
    if (M && M.phase !== 'play') { toast('Timeouts are for live play.', { kind: 'warn' }); return; }
    pendingTimeout = t;
    if (!tryTimeout()) toast('Timeout requested. Taken after this point.', { kind: 'info' });
  }
  function tryTimeout() {
    const Rl = mod('rules'), M = mod('match'); const t = pendingTimeout;
    if (!t || !Rl) return false;
    if (Rl.phase && Rl.phase() !== 'ended') return false;
    pendingTimeout = null;
    if (M && M.requestTimeout) { if (!M.requestTimeout(t)) toast('Timeout not available now.', { kind: 'warn' }); return true; }
    // fallback: own 20 s rest
    if (!Rl.useTimeout || !Rl.useTimeout(t)) { toast('No timeouts left.', { kind: 'warn' }); return true; }
    const P = mod('players'); if (P && P.rest) P.rest(0.04);
    startRest('Timeout, Team ' + t, 20);
    return true;
  }
  function startRest(label, secs) {
    const M = mod('match'); tmo = { label: label, left: secs, resumeMatch: !(M && M.paused) };
    if (M) M.pause(true);
    feed({ src: 'ui', icon: '⏸', text: label + ' (' + secs + ' s). Coaching time.', key: true });
    sync();
  }
  function endRest() { const M = mod('match'); if (tmo && tmo.resumeMatch && M) M.pause(false); tmo = null; banner(null); sync(); }
  function doChallenge() {
    const Rl = mod('rules'); if (!Rl || !Rl.canChallenge) return;
    claimCoach();
    const t = S.coachTeam;
    BUS.emit('challenge:request', { team: t });
    if (!Rl.canChallenge(t, 0)) {
      const left = Rl.state && Rl.state.challenges ? Rl.state.challenges[t] : 0;
      toast(left > 0 ? 'No close call to challenge right now.' : 'No challenges left this set.', { kind: 'warn' }); return;
    }
    const res = Rl.challenge(t, 0);
    if (!res) toast('Too late to challenge that one.', { kind: 'warn' });
  }

  // ----- Camera -----
  function buildCameraSec() {
    const b = [];
    EL.camSeg = seg(CAMS.map((c, i) => [c[0], c[1], 'Key ' + (i + 1)]), () => { const R = mod('render'); return (R && R.cameraMode) || S.cam; }, v => setCam(v));
    b.push(h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Camera'), EL.camSeg.root));
    b.push(sw('Callouts (OUT!, SMASH! ...)', () => S.callouts, v => setCallouts(v), 'sw-callouts').root);
    b.push(sw('Follow ball', () => S.followBall, v => { S.followBall = v; const R = mod('render'); if (R && R.setFollowBall) safe(() => R.setFollowBall(v), 'followBall'); }, 'sw-fball').root);
    EL.fpSel = h('select', { id: 'sel-fp', 'aria-label': 'Follow player' });
    EL.fpSel.addEventListener('change', () => { S.followPlayer = EL.fpSel.value; const R = mod('render'); if (R && R.followPlayer) safe(() => R.followPlayer(S.followPlayer || null), 'followPlayer'); });
    b.push(field('Follow player', EL.fpSel));
    b.push(h('div', { class: 'grid2', style: 'margin-top:6px' },
      h('button', { class: 'btn', type: 'button', id: 'btn-rotl', title: 'Rotate (Q)', onclick: () => rot(-1) }, '⟲ Rotate'),
      h('button', { class: 'btn', type: 'button', id: 'btn-rotr', title: 'Rotate (E)', onclick: () => rot(1) }, 'Rotate ⟳')));
    b.push(h('div', { class: 'grid3', style: 'margin-top:6px' },
      h('button', { class: 'btn', type: 'button', id: 'btn-zout', title: 'Zoom out (-)', onclick: () => zoomBy(-1) }, '−'),
      h('button', { class: 'btn', type: 'button', id: 'btn-zin', title: 'Zoom in (+)', onclick: () => zoomBy(1) }, '+'),
      h('button', { class: 'btn', type: 'button', id: 'btn-reset', title: 'Reset view (R)', onclick: resetView }, 'Reset view')));
    b.push(h('p', { class: 'hint' }, 'In Free mode: drag to orbit, wheel to zoom.'));
    return section('04', 'Camera', 'Camera', false, b, 'sec-camera');
  }
  function refillFollow() {
    const P = mod('players'); if (!EL.fpSel) return;
    EL.fpSel.textContent = ''; EL.fpSel.appendChild(h('option', { value: '' }, 'None'));
    if (P && P.list) P.list.forEach(p => EL.fpSel.appendChild(h('option', { value: p.id }, p.name)));
    EL.fpSel.value = S.followPlayer = '';
  }
  function setCam(m) { const R = mod('render'); S.cam = m; if (R && R.setCameraMode) safe(() => R.setCameraMode(m), 'cam'); sync(); }
  function rot(d) { const R = mod('render'); if (R && R.rotate) safe(() => R.rotate(d), 'rotate'); }
  function zoomBy(d) { const R = mod('render'); if (R && R.zoom) safe(() => R.zoom(d), 'zoom'); }
  function resetView() { const R = mod('render'); if (R && R.resetView) safe(() => R.resetView(), 'reset'); sync(); }

  // ----- Audio -----
  function applyAudio() {
    const A = mod('audio'); if (!A) return;
    safe(() => { if (A.setMuted) A.setMuted(!S.soundOn || S.muted); }, 'audio.mute');
    BUS.emit('ui:setting', { key: 'sound', value: S.soundOn && !S.muted });
  }
  function setSound(on) {
    S.soundOn = on; if (on) { S.muted = false; const A = mod('audio'); if (A && A.unlock) safe(() => A.unlock(), 'unlock'); }
    applyAudio(); sync();
    if (on && !mod('audio')) toast('Audio is not available in this build.', { kind: 'warn' });
  }
  // one volume setter for every slider (Play-mode menus, HUD popover, Studio panel)
  function setVolume(bus, v) {
    v = Math.max(0, Math.min(1, +v || 0)); S.vol[bus] = v;
    const A = mod('audio'); if (A && A.setVolume) safe(() => A.setVolume(bus, v), 'vol');
    BUS.emit('ui:setting', { key: 'volume:' + bus, value: v });
  }
  function setCallouts(on) { S.callouts = !!on; BUS.emit('ui:setting', { key: 'callouts', value: S.callouts }); sync(); }
  function setMusic(on) {
    S.musicOn = !!on; const A = mod('audio');
    if (on && A && A.unlock) safe(() => A.unlock(), 'unlock');
    BUS.emit('ui:setting', { key: 'music', value: S.musicOn }); sync();
    if (on && A && A.hasMusic && !A.hasMusic()) toast('No music track is bundled in this build.', { kind: 'warn' });
  }
  function buildAudioSec() {
    const b = [];
    EL.soundBtn = h('button', { class: 'btn block', type: 'button', id: 'btn-sound', onclick: () => setSound(!S.soundOn), 'aria-pressed': 'false' }, 'Sound off');
    syncs.push(() => { EL.soundBtn.textContent = S.soundOn ? (S.muted ? 'Sound on (muted)' : 'Sound on') : 'Sound off'; EL.soundBtn.setAttribute('aria-pressed', S.soundOn ? 'true' : 'false'); EL.soundBtn.classList.toggle('primary', S.soundOn); });
    b.push(EL.soundBtn);
    b.push(field('Sound volume', slider(0, 1, 0.05, () => S.vol.master, v => setVolume('master', v), 'rg-vol-master')));
    b.push(sw('Music', () => S.musicOn, v => setMusic(v), 'sw-music').root);
    b.push(field('Music volume', slider(0, 1, 0.05, () => S.vol.music, v => setVolume('music', v), 'rg-vol-music')));
    b.push(h('div', { class: 'lbl' }, 'Mix'));
    [['fx', 'Effects'], ['crowd', 'Crowd'], ['commentary', 'Commentary'], ['ambience', 'Ambience']].forEach(function (bus) {
      b.push(field(bus[1], slider(0, 1, 0.05, () => S.vol[bus[0]], v => { S.vol[bus[0]] = v; const A = mod('audio'); if (A && A.setVolume) safe(() => A.setVolume(bus[0], v), 'vol'); BUS.emit('ui:setting', { key: 'volume:' + bus[0], value: v }); }, 'rg-vol-' + bus[0])));
    });
    b.push(sw('Speech commentary', () => S.speech, v => { S.speech = v; const A = mod('audio'); if (A && A.setSpeech) safe(() => A.setSpeech(v), 'speech'); BUS.emit('ui:setting', { key: 'speech', value: v }); if (v && !S.soundOn) setSound(true); }, 'sw-speech').root);
    b.push(h('p', { class: 'hint' }, 'Sound and music start off. Press S to switch sound on, M to mute.'));
    return section('05', 'Audio', 'Sound', false, b, 'sec-audio');
  }

  // ----- Match centre -----
  function buildCentreSec() {
    const tabs = [['score', 'Score'], ['stats', 'Stats'], ['players', 'Players'], ['feed', 'Feed']];
    EL.tabs = h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => {
      const bt = h('button', { type: 'button', role: 'tab', 'data-tab': t[0], 'aria-selected': t[0] === S.tab ? 'true' : 'false', onclick: () => setTab(t[0]) }, t[1]); return bt;
    }));
    EL.paneScore = h('div', { class: 'tabpane', id: 'pane-score' }, h('div', { class: 'score-card', id: 'score-card' }));
    EL.paneStats = h('div', { class: 'tabpane', id: 'pane-stats' });
    EL.panePlayers = h('div', { class: 'tabpane', id: 'pane-players' }, h('div', { class: 'pcards', id: 'pcards' }));
    EL.feedList = h('div', { class: 'feed', id: 'feed' }, h('div', { class: 'empty' }, 'Quiet so far. The first point will show up here.'));
    const fb = h('div', { class: 'feedbar' }, seg([[false, 'All'], [true, 'Key moments']], () => S.feedKey, v => { S.feedKey = v; EL.feedList.classList.toggle('keyonly', v); sync(); }).root);
    EL.paneFeed = h('div', { class: 'tabpane', id: 'pane-feed' }, fb, EL.feedList);
    setTab(S.tab, true);
    return section('06', 'Match centre', 'Match centre', window.innerWidth >= 900, [EL.tabs, EL.paneScore, EL.paneStats, EL.panePlayers, EL.paneFeed], 'sec-centre');
  }
  function setTab(t, quiet) {
    S.tab = t;
    EL.tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'));
    [['score', EL.paneScore], ['stats', EL.paneStats], ['players', EL.panePlayers], ['feed', EL.paneFeed]].forEach(p => p[1].classList.toggle('on', p[0] === t));
    if (!quiet) { renderTab(); }
  }
  function renderTab() {
    if (S.tab === 'score') renderScoreTab();
    else if (S.tab === 'stats') renderStats();
    else if (S.tab === 'players') updatePlayerCards(true);
  }
  function renderScoreTab() {
    const el = EL.paneScore && EL.paneScore.firstChild; if (!el || S.tab !== 'score') return;
    const st = lastScoreState, Rl = mod('rules'), M = mod('match');
    if (!st) { el.textContent = 'Waiting for the first serve.'; return; }
    const names = {}; (mod('players').list || []).forEach(p => { names[p.id] = p.name; });
    let d = null; try { d = Rl.describe(st, names); } catch (e) { return; }
    const cfg = (M && M.cfg) || {};
    const line = (k, v) => h('div', { class: 'line' }, h('span', null, k), h('b', null, v));
    el.textContent = '';
    el.append(
      line('Team A', teamName('A')), line('Team B', teamName('B')),
      line('Sets', (d.setsText || '-') + '  (' + d.setsWonText + ')'),
      line('Games', d.gamesText), line('Points', d.pointsText.A + ' - ' + d.pointsText.B),
      line('Serving', d.serverName + (d.serveSide ? ' · ' + d.serveSide : '')),
      line('Challenges left', 'A ' + st.challenges.A + ' · B ' + st.challenges.B),
      line('Timeouts left', 'A ' + st.timeouts.A + ' · B ' + st.timeouts.B),
      line('Court', (VENUES.find(v => v[0] === cfg.venue) || [0, cfg.venue || '-'])[1]),
      line('Seed', String(cfg.seed != null ? cfg.seed : '-')));
  }

  // stats ------------------------------------------------
  function teamSum(team, key) { const P = mod('players'); return (P && P.list ? P.list : []).filter(p => p.team === team).reduce((a, p) => a + (p.stats[key] || 0), 0); }
  const pct = (n, d) => d > 0 ? Math.round(100 * n / d) + '%' : '–';
  function contribution(p) {
    const P = mod('players'), s = p.stats, opp = other(p.team);
    const oppForced = (P.list || []).filter(q => q.team === opp).reduce((a, q) => a + q.stats.forced + q.stats.unforced * 0.5, 0) / 2;
    return 2 * s.winners + 0.5 * s.volleyWinners + 0.5 * s.smashWinners + 0.4 * s.lobsSuccess + 0.3 * s.wallRecoveries + 0.2 * s.netPointsWon + 0.5 * oppForced
      - 1.5 * s.unforced - 0.6 * s.forced - 2 * s.doubleFaults;
  }
  function renderStats() {
    const pane = EL.paneStats; if (!pane || S.tab !== 'stats') return;
    const P = mod('players'), M = mod('match');
    if (!P || !P.list || !P.list.length || !M || !M.stats) { pane.textContent = 'Stats appear once the match is on.'; return; }
    const ms = M.stats, tm = ms.teams;
    const rl = ms.rallies || [], avg = rl.length ? (rl.reduce((a, b) => a + b, 0) / rl.length) : 0;
    const rows = [];
    const row = (label, a, b, opt) => rows.push({ label: label, a: a, b: b, opt: opt || {} });
    const sec = t => rows.push({ sec: t });
    sec('Serve');
    row('First serve in', pct(tm.A.firstIn, tm.A.firstTotal), pct(tm.B.firstIn, tm.B.firstTotal), { na: tm.A.firstTotal ? tm.A.firstIn / tm.A.firstTotal : -1, nb: tm.B.firstTotal ? tm.B.firstIn / tm.B.firstTotal : -1 });
    row('2nd-serve points won', teamSum('A', 'secondPtsWon') + '/' + teamSum('A', 'secondPtsPlayed'), teamSum('B', 'secondPtsWon') + '/' + teamSum('B', 'secondPtsPlayed'), { na: teamSum('A', 'secondPtsWon'), nb: teamSum('B', 'secondPtsWon') });
    row('Aces', teamSum('A', 'aces'), teamSum('B', 'aces'), { na: teamSum('A', 'aces'), nb: teamSum('B', 'aces') });
    row('Double faults', teamSum('A', 'doubleFaults'), teamSum('B', 'doubleFaults'), { na: teamSum('A', 'doubleFaults'), nb: teamSum('B', 'doubleFaults'), low: true });
    sec('Shots');
    [['Winners', 'winners'], ['Unforced errors', 'unforced', 1], ['Forced errors', 'forced', 1], ['Volley winners', 'volleyWinners'], ['Smash winners', 'smashWinners']].forEach(r => {
      const a = teamSum('A', r[1]), b = teamSum('B', r[1]); row(r[0], a, b, { na: a, nb: b, low: !!r[2] });
    });
    row('Successful lobs', teamSum('A', 'lobsSuccess') + '/' + teamSum('A', 'lobs'), teamSum('B', 'lobsSuccess') + '/' + teamSum('B', 'lobs'), { na: teamSum('A', 'lobsSuccess'), nb: teamSum('B', 'lobsSuccess') });
    row('Wall recoveries', teamSum('A', 'wallRecoveries'), teamSum('B', 'wallRecoveries'), { na: teamSum('A', 'wallRecoveries'), nb: teamSum('B', 'wallRecoveries') });
    sec('Pressure');
    row('Break points won', tm.A.bpWon + '/' + tm.A.bpFaced, tm.B.bpWon + '/' + tm.B.bpFaced, { na: tm.A.bpWon, nb: tm.B.bpWon });
    row('Net points won', teamSum('A', 'netPointsWon') + '/' + teamSum('A', 'netPointsPlayed'), teamSum('B', 'netPointsWon') + '/' + teamSum('B', 'netPointsPlayed'), { na: teamSum('A', 'netPointsWon'), nb: teamSum('B', 'netPointsWon') });
    row('Points won', tm.A.pointsWon, tm.B.pointsWon, { na: tm.A.pointsWon, nb: tm.B.pointsWon });
    sec('Match');
    row('Longest rally', ms.longest || 0, ms.longest || 0, {});
    row('Average rally', avg.toFixed(1), avg.toFixed(1), {});
    row('Duration', M_clock(), M_clock(), {});
    sec('Distance covered');
    const t = h('table', { class: 'stats' }, h('tr', null, h('th', null, 'Team A'), h('th', null, ''), h('th', null, 'Team B')));
    t.firstChild.remove();
    t.appendChild(h('thead', null, h('tr', null, h('th', null, shortTeam('A')), h('th', null, ''), h('th', null, shortTeam('B')))));
    const tb = h('tbody');
    rows.forEach(r => {
      if (r.sec) { tb.appendChild(h('tr', { class: 'sec-row' }, h('td', { colspan: 3 }, r.sec))); return; }
      const o = r.opt; let la = false, lb = false;
      if (o.na != null && o.nb != null && o.na !== o.nb) { const aWins = o.low ? o.na < o.nb : o.na > o.nb; la = aWins; lb = !aWins; }
      tb.appendChild(h('tr', null, h('td', { class: 'v' + (la ? ' lead' : '') }, String(r.a)), h('td', { class: 'l' }, r.label), h('td', { class: 'v' + (lb ? ' lead b' : '') }, String(r.b))));
    });
    // distance per player
    ['A', 'B'].forEach(tt => { });
    const pa = P.list.filter(p => p.team === 'A').sort((a, b) => a.slot - b.slot), pb = P.list.filter(p => p.team === 'B').sort((a, b) => a.slot - b.slot);
    for (let i = 0; i < 2; i++) {
      const a = pa[i], b = pb[i];
      tb.appendChild(h('tr', null, h('td', { class: 'v' }, a ? (a.stats.distance / 1000).toFixed(2) + ' km' : ''), h('td', { class: 'l' }, a ? a.name.split(' ').slice(-1)[0] + ' / ' + (b ? b.name.split(' ').slice(-1)[0] : '') : ''), h('td', { class: 'v' }, b ? (b.stats.distance / 1000).toFixed(2) + ' km' : '')));
    }
    t.appendChild(tb);
    // contribution chart
    const cs = P.list.map(p => ({ p: p, c: contribution(p) }));
    const mx = Math.max(4, ...cs.map(x => Math.abs(x.c)));
    const chart = h('div', { class: 'contrib' }, cs.map(x => {
      const w = Math.min(50, Math.abs(x.c) / mx * 50);
      return h('div', { class: 'c' }, h('span', null, x.p.name.split(' ').slice(-1)[0]),
        h('div', { class: 'bar' }, h('i', { class: (x.c < 0 ? 'neg' : x.p.team === 'B' ? 'b' : ''), style: x.c < 0 ? 'right:50%;left:auto;width:' + w + '%' : 'left:50%;width:' + w + '%' })),
        h('b', null, x.c.toFixed(1)));
    }));
    pane.textContent = '';
    pane.append(t, h('div', { class: 'sub' }, 'Contribution'), chart);
  }
  function shortTeam(t) { return teamName(t); }

  // player cards ------------------------------------------
  function drawPortrait(cv, def) {
    cv.width = 24; cv.height = 24;
    const g = cv.getContext('2d'), L = def.look || {};
    const R = (x, y, w, hh, c) => { g.fillStyle = c; g.fillRect(x, y, w, hh); };
    const skin = SKIN[L.skin] || SKIN[1], hair = hex(L.hair || 0x222222), o1 = hex((L.outfit || [0x1e6bd6, 0xffffff])[0]), o2 = hex((L.outfit || [0, 0xffffff])[1]);
    g.clearRect(0, 0, 24, 24);
    const style = L.hairStyle || 'short';
    if (style === 'long') { R(6, 5, 12, 14, hair); }
    if (style === 'bob') { R(6, 5, 12, 10, hair); }
    if (style === 'ponytail') { R(16, 6, 4, 9, hair); }
    if (style === 'bun') { R(10, 1, 5, 4, hair); }
    R(4, 17, 16, 7, o1); R(10, 17, 4, 2, o2); R(9, 15, 6, 3, skin);
    R(7, 5, 10, 11, skin);
    R(7, 4, 10, style === 'crop' ? 2 : 3, hair);
    if (style !== 'crop') { R(6, 5, 1, 4, hair); R(17, 5, 1, 4, hair); }
    if (style === 'long' || style === 'bob') { R(6, 5, 2, style === 'long' ? 12 : 8, hair); R(16, 5, 2, style === 'long' ? 12 : 8, hair); }
    R(9, 10, 2, 2, '#123954'); R(13, 10, 2, 2, '#123954'); R(11, 13, 2, 1, '#b0584a');
    if (L.headband) R(7, 6, 10, 1, hex(L.headband));
  }
  function buildPlayerCards() {
    const P = mod('players'), box = $('#pcards'); if (!box) return;
    box.textContent = '';
    ((P && P.list) || []).slice().sort((a, b) => a.team === b.team ? a.slot - b.slot : (a.team < b.team ? -1 : 1)).forEach(function (p) {
      const d = p.def, cv = h('canvas', { width: 24, height: 24 });
      drawPortrait(cv, d);
      const bars = h('div', { class: 'bars' }, ATTRS.map(a => mbar(a[1], d.attrs[a[0]], '')));
      const live = h('div', { class: 'bars' }, h('div', { class: 'mbar live', 'data-k': 'conf' }, h('span', null, 'CONF'), h('div', { class: 't' }, h('i')), h('b', null, '')), h('div', { class: 'mbar fat', 'data-k': 'fat' }, h('span', null, 'FATIG'), h('div', { class: 't' }, h('i')), h('b', null, '')));
      const mini = h('div', { class: 'mini' });
      const card = h('div', { class: 'pcard ' + (p.team === 'A' ? 'a' : 'b'), 'data-id': p.id },
        cv,
        h('div', null, h('div', { class: 'nm' }, d.name), h('div', { class: 'meta' }, '“' + d.nick + '” · ' + (d.country ? d.country.name : '') + ' ', flagEl(d.country && d.country.code)),
          h('div', { class: 'meta' }, 'World #' + d.ranking + ' · ' + (ARCH[d.archetype] || d.archetype) + ' · ' + (d.hand === 'L' ? 'left' : 'right') + '-handed · Team ' + p.team)),
        bars, live, mini);
      card._live = live; card._mini = mini; card._pid = p.id;
      box.appendChild(card);
    });
    updatePlayerCards(true);
  }
  function mbar(label, v, cls) {
    return h('div', { class: 'mbar ' + cls }, h('span', null, label), h('div', { class: 't' }, h('i', { style: 'width:' + Math.round(U.clamp((v - 30) / 65, 0.04, 1) * 100) + '%' })), h('b', null, String(v)));
  }
  function updatePlayerCards(force) {
    if (S.tab !== 'players' && !force) return;
    const P = mod('players'); if (!P) return;
    document.querySelectorAll('#pcards .pcard').forEach(card => {
      const p = P.byId[card._pid]; if (!p) return;
      const set = (k, v) => { const m = card._live.querySelector('[data-k=' + k + ']'); m.querySelector('i').style.width = Math.round(U.clamp(v, 0, 1) * 100) + '%'; m.querySelector('b').textContent = Math.round(v * 100); };
      set('conf', p.confidence); set('fat', p.fatigue);
      card._mini.textContent = 'Winners ' + p.stats.winners + ' · Unforced ' + p.stats.unforced + ' · Aces ' + p.stats.aces + ' · ' + (p.stats.distance / 1000).toFixed(2) + ' km';
    });
  }

  // ---------- actions ----------
  function setSpeed(v) {
    S.speed = v; const M = mod('match'); if (M && M.setSpeed) M.setSpeed(v);
    BUS.emit('ui:setting', { key: 'speed', value: v });
    EL.chipSpeed.textContent = (v < 1 ? v : v) + '×'; sync();
  }
  function togglePause() { const M = mod('match'); if (!M) return; if (tmo) { endRest(); return; } M.pause(); sync(); updateBannerPause(); }
  function updateBannerPause() {
    const M = mod('match');
    if (tmo) return;
    if (M && M.paused) banner(h('span', null, 'Paused', h('small', null, 'Space to resume'))); else if (!resultsShown || true) { if (!nextAt) banner(null); }
  }
  function skipCeremony() {
    const M = mod('match'), C = mod('ceremony');
    if (!M) return;
    M.skipCeremony(); if (C && C.skip) safe(() => C.skip(), 'ceremony.skip');
    toast('Skipping the show. On to the game!', { kind: 'info' });
  }
  function gatherCfg() {
    return { format: S.format, scoring: S.scoring, type: S.type, venue: S.venue, seed: S.seed ? +S.seed : (1 + Math.floor(Math.random() * 99998)), teamA: S.teamA.slice(), teamB: S.teamB.slice() };
  }
  function newMatch(opts) {
    opts = opts || {};
    const M = mod('match'); if (!M) return;
    if (opts.draw) { const d = randomDraw(S.type); S.teamA = d.A; S.teamB = d.B; refillPickers(); }
    const cfg = gatherCfg();
    if (opts.rematch && M.cfg) { cfg.seed = (S.seed ? +S.seed : 1 + Math.floor(Math.random() * 99998)); cfg.teamA = M.cfg.teamA.slice(); cfg.teamB = M.cfg.teamB.slice(); }
    M.skip = false;
    closeModal(); tmo = null; pendingTimeout = null; nextAt = 0; pendingVenue = null; banner(null);
    safe(() => M.start(cfg), 'match.start');
    if (M.setSpeed) M.setSpeed(S.speed);
    applyVenueVisuals(cfg.venue); applyTod();
    BUS.emit('match:new', { config: M.cfg });
  }

  // ---------- results ----------
  function buildResults() {
    const Rl = mod('rules'), M = mod('match'), P = mod('players');
    const st = Rl && Rl.state; if (!st || !P) return;
    const G = mod('game'); if (G && G.active && G.active()) { resultsShown = true; G.results(); return; }
    resultsShown = true; closeModal();
    const win = st.winner || (M.result && M.result.winner) || 'A';
    let sets = ''; try { sets = Rl.describe(st).setsText; } catch (e) { /* ignore */ }
    const names = teamIds(win).map(id => (rdef(id) || {}).name || id);
    const winners = P.list.filter(p => p.team === win);
    const mvp = winners.map(p => ({ p: p, c: contribution(p) })).sort((a, b) => b.c - a.c)[0];
    const ms = M.stats, tm = ms ? ms.teams : null, rl = ms ? ms.rallies : [];
    const kv = [];
    const kr = (l, a, b) => kv.push(h('b', null, String(a)), h('span', { class: 'l' }, l), h('b', null, String(b)));
    kr('Aces', teamSum('A', 'aces'), teamSum('B', 'aces'));
    kr('Winners', teamSum('A', 'winners'), teamSum('B', 'winners'));
    kr('Unforced errors', teamSum('A', 'unforced'), teamSum('B', 'unforced'));
    if (tm) kr('Points won', tm.A.pointsWon, tm.B.pointsWon);
    const card = h('div', { class: 'card', role: 'dialog', 'aria-label': 'Match result' },
      h('div', { class: 'tag' }, HPO.cfg.TITLE()),
      h('h2', null, 'Champions'),
      h('div', { class: 'champ' }, names.join(' & '), h('em', null, ' take the cup.')),
      h('div', { class: 'setscore' }, sets || '–'),
      h('div', { class: 'keystats' }, h('b', { class: 'tag' }, 'Team A'), h('span'), h('b', { class: 'tag' }, 'Team B'), kv),
      mvp ? h('div', { class: 'mvp' }, h('b', null, 'MVP: '), mvp.p.name, ' · ', mvp.p.stats.winners + ' winners, ' + mvp.p.stats.unforced + ' unforced, ' + (mvp.p.stats.distance / 1000).toFixed(2) + ' km') : null,
      ms ? h('p', { class: 'hint' }, 'Longest rally ' + (ms.longest || 0) + ' strokes · average ' + (rl.length ? (rl.reduce((a, b) => a + b, 0) / rl.length).toFixed(1) : '0') + ' · ' + M_clock()) : null,
      EL.nextLine = h('p', { class: 'hint', id: 'next-line', hidden: !S.autoNext }, ''),
      h('div', { class: 'acts' },
        h('button', { class: 'btn primary', type: 'button', id: 'res-new', onclick: () => newMatch({ draw: true }) }, 'New Match'),
        h('button', { class: 'btn', type: 'button', id: 'res-rematch', onclick: () => newMatch({ rematch: true }) }, 'Rematch'),
        mod('replay') && mod('replay').play ? h('button', { class: 'btn', type: 'button', id: 'res-replay', onclick: () => { closeModal(); safe(() => mod('replay').play({ kind: 'highlight' }), 'replay'); } }, 'Watch highlights') : null,
        h('button', { class: 'btn', type: 'button', id: 'res-keep', onclick: () => { closeModal(); } }, 'Keep watching')));
    EL.modal = h('div', { class: 'modal', id: 'results' }, card);
    EL.stage.appendChild(EL.modal);
    if (S.autoNext) nextAt = performance.now() + 15000;
    feed({ src: 'ui', icon: '★', text: 'Final: ' + names.join(' & ') + ' win ' + (sets || ''), key: true });
  }
  function closeModal() { if (EL.modal) { EL.modal.remove(); EL.modal = null; } }

  // ---------- keys sheet ----------
  function showKeys() {
    if (EL.sheet) { EL.sheet.remove(); EL.sheet = null; return; }
    const dl = h('dl', null, KEYS.map(k => [h('dt', null, h('span', { class: 'keycap' }, k[0])), h('dd', { style: 'margin:0' }, k[1])]));
    EL.sheet = h('div', { class: 'modal', onclick: e => { if (e.target === EL.sheet) showKeys(); } },
      h('div', { class: 'card sheet' }, h('div', { class: 'tag' }, 'Keyboard'), h('h2', null, 'Shortcuts'), dl, h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: showKeys }, 'Got it'))));
    EL.stage.appendChild(EL.sheet);
  }

  // ---------- keyboard ----------
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target, tn = tg && tg.tagName;
    if (tn === 'INPUT' && tg.type !== 'range' && tg.type !== 'checkbox') return;
    if (tn === 'TEXTAREA') return;
    const k = e.key, G = mod('game');
    if (k === 'Escape') { if (S.aim) { toggleAim(); return; } if (EL.sheet) { showKeys(); return; } if (G && G.onEscape) G.onEscape(); return; }
    if (G && G.blocking && G.blocking()) return;
    if (tn === 'SELECT' && k !== '`' && k !== '?') return;
    const lk = k.length === 1 ? k.toLowerCase() : k;
    let used = true;
    switch (lk) {
      case ' ': case 'Spacebar': togglePause(); break;
      case 'q': rot(-1); break;
      case 'e': rot(1); break;
      case '1': case '2': case '3': case '4': case '5': setCam(CAMS[+lk - 1][0]); break;
      case '+': case '=': zoomBy(1); break;
      case '-': case '_': zoomBy(-1); break;
      case 'r': resetView(); break;
      case 'c': doChallenge(); break;
      case 'a': toggleAim(); break;
      case 'n': newMatch(); break;
      case 's': setSound(!S.soundOn); break;
      case 'm': S.muted = !S.muted; if (S.muted === false && !S.soundOn) { /* stays off */ } applyAudio(); sync(); toast(S.muted ? 'Muted' : (S.soundOn ? 'Sound on' : 'Sound is off (press S)'), { ms: 1500 }); break;
      case '`': toggleDebug(); break;
      case '?': showKeys(); break;
      default: used = false;
    }
    if (used) { e.preventDefault(); }
  }

  // ---------- debug ----------
  function toggleDebug() {
    S.debug = !S.debug; EL.debug.hidden = !S.debug;
    const R = mod('render');
    if (S.debug) ensureDebug3D(); else if (dbg.group) dbg.group.visible = false;
    if (S.debug && dbg.group) dbg.group.visible = true;
    BUS.emit('ui:setting', { key: 'debug', value: S.debug });
    void R;
  }
  function ensureDebug3D() {
    const R = mod('render'); if (dbg.group || !R || !R.THREE || !R.groups || !R.groups.overlay) return;
    safe(function () {
      const T = R.THREE, N = 90;
      const geo = new T.BufferGeometry(); const arr = new Float32Array(N * 3); geo.setAttribute('position', new T.BufferAttribute(arr, 3)); geo.setDrawRange(0, 0);
      const line = new T.Line(geo, new T.LineBasicMaterial({ color: 0xff2d95 })); line.frustumCulled = false;
      const mark = new T.Mesh(new T.RingGeometry(0.25, 0.4, 16), new T.MeshBasicMaterial({ color: 0xffe14a, side: T.DoubleSide })); mark.rotation.x = -Math.PI / 2; mark.position.y = 0.03; mark.visible = false;
      const g = new T.Group(); g.add(line, mark); g.name = 'debugPredict'; R.groups.overlay.add(g);
      dbg.group = g; dbg.line = line; dbg.mark = mark; dbg.N = N;
    }, 'debug3d');
  }
  function f2(x) { return (x < 0 ? '' : ' ') + x.toFixed(2); }
  function updateDebug(dt) {
    const B = mod('ball'), Rl = mod('rules'), Ai = mod('ai'), P = mod('players'), R = mod('render'), M = mod('match');
    const L = [];
    if (B && B.state) {
      const s = B.state, sp = Math.hypot(s.v.x, s.v.y, s.v.z);
      L.push('ball ' + s.state + '  p(' + f2(s.p.x) + ',' + f2(s.p.y) + ',' + f2(s.p.z) + ')');
      L.push('     v(' + f2(s.v.x) + ',' + f2(s.v.y) + ',' + f2(s.v.z) + ') |v|=' + sp.toFixed(1));
      L.push('     w(' + s.w.x.toFixed(0) + ',' + s.w.y.toFixed(0) + ',' + s.w.z.toFixed(0) + ') rad/s');
      L.push('     last hitter ' + (s.lastHitter || '-') + ' hits ' + (s.hitsSinceServe || 0) + ' bnc A/B ' + (s.bouncesOnSide ? s.bouncesOnSide.A + '/' + s.bouncesOnSide.B : '-'));
      let land = null;
      if (s.state === 'live' && B.predict) {
        const pr = B.predict(null, 4, 20); dbg.pred = pr;
        const fc = pr.contacts.find(c => c.surf === 'floor');
        if (fc) land = fc;
        L.push('land ' + (fc ? '(' + f2(fc.p.x) + ',' + f2(fc.p.z) + ') in ' + fc.t.toFixed(2) + 's' : '-') + '  end ' + (pr.end ? pr.end.state + ' ' + (pr.end.reason || '') : ''));
        updateDebug3D(pr, fc);
      } else { L.push('land -'); if (dbg.line) { dbg.line.geometry.setDrawRange(0, 0); dbg.mark.visible = false; } }
    }
    L.push('last contact ' + lastSurf + ' (' + ((performance.now() - lastSurfAt) / 1000).toFixed(1) + 's ago)');
    if (Rl) L.push('rules ' + (Rl.phase ? Rl.phase() : '-') + '  strokes ' + rallyN + '  server ' + (Rl.state && Rl.state.server ? Rl.state.server.playerId : '-'));
    if (Ai && Ai.teams) ['A', 'B'].forEach(t => { const tm = Ai.teams[t]; L.push('AI ' + t + ' ' + tm.formation + ' claim=' + (tm.claim || '-') + ' preset=' + (tm.orders.preset || '-') + (tm.orders.serveDir ? ' sv=' + tm.orders.serveDir : '') + (tm.orders.aimPoint ? ' AIM' : '')); });
    if (P && P.list) P.list.forEach(p => L.push(' ' + p.id + ' ' + p.team + p.slot + ' ' + (p.anim ? p.anim.clip : '') + ' ' + (p.intent ? p.intent.type : '') + ' v' + (p.speed || 0).toFixed(1) + ' fat' + p.fatigue.toFixed(2)));
    const rs = R && R.stats ? R.stats() : null;
    L.push('sim x' + (M ? M.speed : '-') + ' t=' + (M ? M.simTime.toFixed(1) : '-') + ' dt=' + (HPO.cfg.PHYS_DT * 1000).toFixed(2) + 'ms phase ' + (M ? M.phase : '-'));
    if (rs) L.push('fps ' + rs.fps.toFixed(0) + '  draws ' + rs.drawCalls + '  tris ' + rs.tris);
    EL.debug.textContent = L.join('\n');
  }
  function updateDebug3D(pr, fc) {
    ensureDebug3D(); if (!dbg.line) return;
    const arr = dbg.line.geometry.attributes.position.array, n = Math.min(pr.samples.length, dbg.N);
    for (let i = 0; i < n; i++) { const p = pr.samples[i].p; arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; }
    dbg.line.geometry.setDrawRange(0, n); dbg.line.geometry.attributes.position.needsUpdate = true;
    if (fc) { dbg.mark.position.x = fc.p.x; dbg.mark.position.z = fc.p.z; dbg.mark.visible = true; } else dbg.mark.visible = false;
  }

  // ---------- BUS wiring ----------
  const KIND_TXT = { ace: 'Ace', doubleFault: 'Double fault', winner: 'Winner', forced: 'Forced error', unforced: 'Unforced error', fault: 'Fault' };
  function bindBus() {
    BUS.on('match:new', onMatchNew);
    BUS.on('match:phase', function (e) {
      const M = mod('match');
      if (e.phase === 'play' && lastPhase !== 'play' && lastPhase !== 'changeover') playStartSim = M ? M.simTime : 0;
      lastPhase = e.phase; updatePhaseLabel();
      if (e.phase === 'results') buildResults();
      if (e.phase === 'setBreak') feed({ src: 'ui', icon: '☕', text: 'Set break. Towels out.', key: false });
    });
    BUS.on('match:finished', function () { if (!EL.modal && !resultsShown) buildResults(); });
    BUS.on('score:change', function (e) { setScore(e && e.state); });
    BUS.on('flag:update', function (e) {
      flags = { matchPoint: e.matchPoint || null, setPoint: e.setPoint || null, breakPoint: e.breakPoint || null, golden: !!e.golden };
      updateStickers(lastScoreState);
      const key = e.matchPoint ? 'Match point, Team ' + e.matchPoint : e.setPoint ? 'Set point, Team ' + e.setPoint : e.breakPoint ? 'Break point, Team ' + e.breakPoint : e.golden ? 'Golden point' : null;
      if (key) feed({ src: 'ui', icon: '▲', text: key + '.', key: true });
    });
    BUS.on('point:start', function (e) {
      rallyN = 0; EL.chipRally.hidden = true;
      if (!e.retry && pendingVenue) {
        const C = mod('court'), M = mod('match');
        if (C && C.setVenue) safe(() => C.setVenue(pendingVenue), 'court.setVenue');
        if (M && M.cfg) M.cfg.venue = pendingVenue;
        toast('Court switched: ' + (VENUES.find(v => v[0] === pendingVenue) || [0, pendingVenue])[1], { kind: 'good' });
        pendingVenue = null;
      }
    });
    BUS.on('rally:stroke', function (e) { rallyN = e.n; EL.chipRally.hidden = rallyN < 2; EL.chipRally.textContent = 'Rally ' + rallyN; });
    BUS.on('point:end', function (e) {
      const who = teamName(e.winner);
      feed({ src: 'ui', icon: '●', text: who + ' · ' + (KIND_TXT[e.kind] || e.kind) + (e.rallyLen > 1 ? ' (' + e.rallyLen + ' strokes)' : ''), key: e.kind === 'ace' || e.rallyLen >= 14 });
      if (e.rallyLen >= 14) toast('Rally of ' + e.rallyLen + ' strokes!', { kind: 'good', ms: 2400 });
      if (S.tab === 'stats') renderStats();
    });
    BUS.on('game:end', function (e) { feed({ src: 'ui', icon: '◆', text: 'Game ' + teamName(e.winner) + (e.score ? ' (' + e.score.A + '-' + e.score.B + ')' : ''), key: true }); });
    BUS.on('set:end', function (e) { feed({ src: 'ui', icon: '★', text: 'Set ' + teamName(e.winner) + (e.score ? ' (' + e.score.A + '-' + e.score.B + ')' : ''), key: true }); toast('Set to ' + teamName(e.winner), { kind: 'good' }); });
    BUS.on('match:end', function (e) { feed({ src: 'ui', icon: '★', text: 'Match to ' + teamName(e.winner) + '.', key: true }); });
    BUS.on('coach:change', function (e) {
      const prev = lastOrders[e.team] || {}, o = e.orders || {}; const bits = [];
      if (o.preset !== prev.preset) bits.push((PRESET_LABELS.find(p => p[0] === o.preset) || [0, o.preset])[1]);
      if (o.serveDir !== prev.serveDir && o.serveDir) bits.push('serve ' + o.serveDir);
      if (o.returnDir !== prev.returnDir && o.returnDir) bits.push('return ' + o.returnDir);
      if (o.middlePriority !== prev.middlePriority) bits.push(o.middlePriority === undefined ? 'middle: auto' : 'middle: player ' + (o.middlePriority + 1));
      if (o.focusOpponent !== prev.focusOpponent && o.focusOpponent !== undefined) bits.push('focus opponent ' + (o.focusOpponent + 1));
      if (o.aimPoint && o.aimPoint !== prev.aimPoint) bits.push('aim set');
      lastOrders[e.team] = Object.assign({}, o);
      if (bits.length) feed({ src: 'ui', icon: '✎', text: 'Coach ' + e.team + ': ' + bits.join(', '), key: false });
      sync();
    });
    let fmTs = {};
    BUS.on('ai:formation', function (e) {
      const k = e.team + e.formation, now = performance.now(); if (fmTs[k] && now - fmTs[k] < 4000) return; fmTs[k] = now;
      feed({ src: 'ui', icon: '⇄', text: 'Team ' + e.team + ' shifts to ' + e.formation + '.', key: false });
    });
    BUS.on('changeover:start', function (e) {
      if (e.kind === 'timeout') { banner(h('span', null, 'Timeout, Team ' + e.team, h('small', null, 'Adjust the tactics in the coach box'))); }
      else toast('Changeover. A good moment for new orders.', { kind: 'info' });
      const c = $('#sec-coach'); if (c) { c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); setTimeout(() => c.classList.remove('pulse'), 4000); }
      feed({ src: 'ui', icon: '⇅', text: (e.kind === 'timeout' ? 'Timeout, Team ' + e.team : e.kind === 'set' ? 'Set changeover' : 'Changeover') + '.', key: e.kind === 'timeout' });
    });
    BUS.on('changeover:end', function (e) { if (e.kind === 'timeout') banner(null); });
    BUS.on('challenge:result', function (e) {
      const fin = e.overturned ? (e.call === 'in' ? 'OUT' : 'IN') : (e.call || '').toUpperCase();
      const txt = 'Eagle Eye: ' + fin + ' — ' + (e.overturned ? 'call overturned' : 'call stands');
      toast(txt + ' (Team ' + e.team + ')', { kind: e.overturned ? 'good' : 'warn', ms: 4500 });
      feed({ src: 'ui', icon: '◎', text: txt + ', challenge by Team ' + e.team + '.', key: true });
      const rp = mod('replay'); const M = mod('match');
      // the match flow plays the replay for AI challenges; a coach challenge plays it here
      if (rp && rp.play && !rp.active && S.coachClaimed && e.team === S.coachTeam && !(M && M.cfg && M.cfg.fast)) safe(() => rp.play({ kind: 'challenge' }), 'replay');
    });
    BUS.on('ball:contact', function (e) { lastSurf = e.surf; lastSurfAt = performance.now(); });
    BUS.on('cam:mode', function (e) { S.cam = e.mode; sync(); });
    BUS.on('ui:setting', function (e) {
      if (!e) return;
      if (e.key === 'canvasClick' && S.aim) {
        const v = e.value || {}; let p = null;
        if (typeof v.x === 'number' && typeof v.z === 'number') p = v;
        else { const R = mod('render'); const cx = v.clientX !== undefined ? v.clientX : v.cx, cy = v.clientY !== undefined ? v.clientY : v.cy; if (R && R.pickCourt && cx !== undefined) p = R.pickCourt(cx, cy); }
        if (p) setAimAt(p.x, p.z);
      } else if (e.key === 'tod' && e.value && e.value !== 'indoor' && S.tod !== e.value) { S.tod = e.value; sync(); }
      else if (e.key === 'results') buildResults();
    });
  }

  function onMatchNew(e) {
    const cfg = e && e.config; const M = mod('match');
    if (cfg) {
      S.format = cfg.format || S.format; S.scoring = cfg.scoring || S.scoring; S.type = cfg.type || S.type;
      if (cfg.venue && VENUES.some(v => v[0] === cfg.venue)) S.venue = cfg.venue;
      if (cfg.teamA && cfg.teamB) { S.teamA = cfg.teamA.slice(); S.teamB = cfg.teamB.slice(); }
      refillPickers();
    }
    const R = mod('render'); if (R && R.pixelSize) S.px = R.pixelSize;
    if (M && !S.coachClaimed) M.coachTeam = null;
    ['A', 'B'].forEach(t => { const o = orders(t); lastOrders[t] = Object.assign({}, o); if (o && o.aimPoint) delete o.aimPoint; });
    aimXZ = null; S.aim = false; EL.stage.classList.remove('aiming'); EL.aimhud.hidden = true;
    resultsShown = false; closeModal(); nextAt = 0; rallyN = 0; flags = { matchPoint: null, setPoint: null, breakPoint: null, golden: false };
    playStartSim = 0; lastPhase = 'intro';
    ['A', 'B'].forEach(t => { const r = EL.sbRows[t]; r._sig = ''; r._ptsText = null; r._cellSig = ''; r._games = undefined; r._stkSig = ''; });
    feedReset();
    buildPlayerCards(); refillFollow();
    const Rl = mod('rules'); if (Rl && Rl.state) setScore(Rl.state);
    feed({ src: 'ui', icon: '✦', text: 'New match: ' + teamName('A') + ' vs ' + teamName('B') + ' · ' + (FORMAT_NAMES[S.format] || S.format) + ' · ' + (S.type === 'M' ? "men's" : S.type === 'W' ? "women's" : 'mixed') + '.', key: true });
    sync(); renderTab();
  }

  // ---------- per-frame ----------
  function update(dt) {
    dt = dt || 0.016;
    accT += dt; acc4 += dt; accDbg += dt; accStats += dt;
    const M = mod('match');
    // aim marker follows the camera
    if (EL.aimmark) {
      let show = false;
      if (aimXZ && aimTeam) {
        const o = orders(aimTeam);
        const alive = o.aimPoint && performance.now() - aimSetAt < 12000;
        if (alive) {
          const R = mod('render');
          if (R && R.project && R.THREE) {
            const p = R.project(new R.THREE.Vector3(aimXZ.x, 0.02, aimXZ.z));
            if (p && p.visible) { EL.aimmark.style.left = p.x + 'px'; EL.aimmark.style.top = p.y + 'px'; show = true; }
          }
        } else if (aimXZ) { if (!o.aimPoint && performance.now() - aimSetAt > 800) { toast('Aim used or expired.', { ms: 1500 }); } aimXZ = null; }
      }
      EL.aimmark.hidden = !show;
    }
    // timeout rest countdown
    if (tmo) {
      tmo.left -= dt;
      banner(h('span', null, tmo.label, h('small', null, Math.ceil(tmo.left) + ' s · adjust tactics, then resume')), h('button', { class: 'btn small', type: 'button', onclick: endRest }, 'Resume now'));
      if (tmo.left <= 0) endRest();
    }
    if (pendingTimeout) tryTimeout();
    // auto-next
    if (nextAt) {
      const left = Math.ceil((nextAt - performance.now()) / 1000);
      if (EL.nextLine && EL.modal) { EL.nextLine.hidden = false; EL.nextLine.textContent = 'Next match in ' + Math.max(0, left) + ' s (switch Auto-next off to stay)'; }
      else EL.chipSpeed.title = 'Next in ' + left;
      if (!S.autoNext) { nextAt = 0; }
      else if (left <= 0) { nextAt = 0; newMatch({ draw: true }); }
    }
    if (acc4 > 0.25) {
      acc4 = 0;
      if (M) {
        EL.chipClock.textContent = fmtClock((M.simTime || 0) - playStartSim);
        EL.chipSpeed.textContent = M.speed + '×' + (M.paused ? ' ⏸' : '');
        if (M.speed !== S.speed && !M.paused && M.phase !== 'idle') { S.speed = M.speed; }
        const fp = $('#fab-pause'); const pl = M.paused ? 'Resume' : 'Pause';
        if (EL.btnPause.textContent !== pl) { EL.btnPause.textContent = pl; if (fp) fp.textContent = pl; EL.speed && EL.speed.sync(); updateBannerPause(); }
        EL.speed.sync();
      }
      const Rl = mod('rules');
      if (Rl && Rl.state && EL.btnTmo) {
        const t = S.coachTeam, st = Rl.state;
        EL.btnTmo.textContent = 'Timeout (' + (st.timeouts ? st.timeouts[t] : 0) + ')';
        const can = Rl.canChallenge ? Rl.canChallenge(t, 0) : false;
        EL.btnChal.firstChild.textContent = 'Challenge (' + (st.challenges ? st.challenges[t] : 0) + ') ';
        EL.btnChal.classList.toggle('primary', can);
        EL.btnTmo.setAttribute('aria-disabled', st.timeouts && st.timeouts[t] > 0 ? 'false' : 'true');
        EL.btnChal.setAttribute('aria-disabled', can ? 'false' : 'true');
        EL.coachInfo.textContent = 'Coaching Team ' + t + ' (' + teamName(t) + '). ' + (can ? 'Eagle Eye available: press C.' : '');
      }
      if (S.tab === 'players') updatePlayerCards();
      if (S.tab === 'score') renderScoreTab();
    }
    if (accStats > 1 && S.tab === 'stats') { accStats = 0; renderStats(); }
    if (S.debug && accDbg > 0.1) { accDbg = 0; safe(() => updateDebug(dt), 'debug'); }
    const G = mod('game'); if (G && G.update) safe(() => G.update(dt), 'game.update');
  }
  let lastBannerKey = '';
  void lastBannerKey;
})(HPO);
