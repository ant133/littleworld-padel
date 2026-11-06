// Play mode: title screen, create-player, quick setup, in-match HUD + coach box, pause menu, results. Studio mode = the full control panel (19_ui.js).
// Presentation only; talks to the sim through the same public APIs as the panel (match.start via ui.newMatch, ai.setOrders, rules.challenge ...).
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, _ = HPO.t;
  const mod = n => HPO.mod[n];
  let API = null, S = null, EL = null, h = null, add = null, safe = null;
  const AN = 'p5'; // Annetta Arslan
  const NATIONS = [['IDN', 'Indonesia'], ['ESP', 'Spain'], ['ARG', 'Argentina'], ['NED', 'Netherlands'], ['JPN', 'Japan'], ['SWE', 'Sweden'], ['ITA', 'Italy'], ['BRA', 'Brazil'], ['FRA', 'France'], ['GER', 'Germany'], ['POR', 'Portugal'], ['CHI', 'Chile'], ['AUS', 'Australia'], ['GBR', 'United Kingdom']];
  // coach dock (docs/QTE.md section 1)
  const MIND = ['Fortress', 'Safe', 'Balanced', 'Pressure', 'All-in'];
  const PLAN_UI = [['exhaust', 'Wear them down', 'Aim at the tired one and make them run', 'Q'], ['hunt', 'Hunt the weak one', 'Every ball at the weaker defender', 'W'], ['net', 'Take the net', 'Step up and volley', 'E'],
    ['breakNet', 'Break the net', 'Lob deep over a pair at the net', 'R'], ['glass', 'Use the glass', 'Angles and rebounds', 'T'], ['middle', 'Down the middle', 'Split the pair', 'Y']];
  const STYLE_UI = [['spin', 'Spin'], ['mix', 'Mix'], ['flat', 'Flat']];
  const FMT_PTS = { blitz: 1, americano: 1 };
  const FMT_OPEN = FMT_PTS;   // the other formats are shown but locked until they are tuned for Play mode
  const FMT_HINT = { blitz: '9 points, 2 serves each. 5 points clinches it. About 3 minutes.', americano: '21 points, 5 serves each. 11 points clinches it. About 6 minutes.', quick: 'First to 4 games.', oneSet: 'First to 6 games.', bo3: 'Two sets to win. A long one.' };
  const MIND_FX = ['mostly lobs and glass, almost no smashes', 'more lobs, fewer risky shots', 'the normal mix', 'more smashes and net play', 'smashes everywhere, few lobs, big risks'];
  const STYLE_FX = { spin: 'topspin, slice and vibora: safer, awkward bounces', mix: 'the normal mix', flat: 'flat and fast: more winners, more errors' };
  const MID_UI = [['', 'Auto'], ['0', 'You'], ['1', 'Annetta']];   // who takes the middle balls
  const MID_FX = ['Whoever is closer takes it', 'You take every ball down the middle', 'Annetta takes every ball down the middle'];
  const P_ = d => '<svg ' + 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + '>' + d + '</svg>';
  const IC = {
    shield: P_('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'), sword: P_('<path d="M20 4l-10 10M15 4h5v5M8 16l-4 4M6 12l6 6"/>'),
    exhaust: P_('<rect x="3" y="8" width="16" height="9" rx="1"/><path d="M21 11v3M6 12v1"/>'), hunt: P_('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
    net: P_('<path d="M3 5v15M21 5v15M3 8h18M3 12h18M3 16h18M9 8v8M15 8v8"/>'), breakNet: P_('<path d="M3 19C6 2 18 2 21 19M17 15l4 4 1-5"/>'),
    glass: P_('<path d="M3 5v14M3 6l8 12 4-12 6 10"/>'), middle: P_('<path d="M5 4v16M19 4v16M12 5v13M9 15l3 3 3-3"/>'),
    go: P_('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'), aim: P_('<circle cx="12" cy="12" r="6"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>'), timeout: P_('<circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6"/>'),
    chev: P_('<path d="M6 15l6-6 6 6"/>'),
    coach: P_('<path d="M4 6h16M4 12h16M4 18h16"/>')
  };
  const COURTS = [['classicBlue', 'Classic Blue'], ['terracotta', 'Terracotta'], ['fastBlue', 'Fast Blue'], ['indoor', 'Indoor']];
  const CAM_CYCLE = [['close', 'Close-up'], ['follow', 'TV follow'], ['club', 'Whole club'], ['top', 'Top-down']];
  // the whole club is too small to read on a phone, so phones default to the TV follow camera
  const defCam = () => (HPO.cfg.mobile ? 'follow' : 'club');
  const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const SND_ON = '<svg ' + SVG + '><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const SND_OFF = '<svg ' + SVG + '><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
  const EXPAND = '<svg ' + SVG.replace('width="22" height="22"', 'width="15" height="15"') + '><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  const COLLAPSE = '<svg ' + SVG.replace('width="22" height="22"', 'width="15" height="15"') + '><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
  const PRE = { intro: 1, walkon: 1, introductions: 1, toss: 1, warmup: 1 };
  const NATION_NAME = {}; NATIONS.forEach(n => { NATION_NAME[n[0]] = n[1]; });

  const G = HPO.mod.game = {
    mode: 'play', st: 'boot', scr: null, player: null, opp: null, qte: 'relaxed',
    cfg: { format: 'blitz', scoring: 'golden', venue: 'classicBlue', tod: 'day' },
    init: init, update: update, onFeed: onFeed, onEscape: onEscape, blocking: blocking, active: active, results: results,
    hotkey: hotkey, cycleCam: cycleCam, showTitle: showTitle, showHow: showHow, showCreate: showCreate, showSetup: showSetup, setMode: setMode, onSaved: onSaved, suppressResults: suppressResults
  };
  let cp = { seed: 1, name: '', gender: 'F', nat: 'IDN' };
  let hud = {}, pauseEl = null, wasPaused = false, tickerT = 0, acc = 0, hlKey = '', lastFlagToast = '', attractT = 0;
  const rnd = () => 1 + Math.floor(Math.random() * 4294967294);

  // ---------- helpers ----------
  const players = () => (mod('players') && mod('players').roster && mod('players').roster()) || [];
  function pdef(id) { return players().find(r => r.id === id); }
  function lastName(d) { return d ? d.name.split(' ').slice(-1)[0] : ''; }
  function flag(d) { return API.flagEl(d && d.country && d.country.code); }
  function portrait(def, cls) { const c = h('canvas', { class: cls || 'gm-portrait', width: 24, height: 24 }); API.drawPortrait(c, def); return c; }
  function segBtns(opts, get, set, cls, raw) {
    const root = h('div', { class: 'seg gm-seg ' + (cls || '') });
    const btns = opts.map(o => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { set(o[0]); paint(); } }, raw ? o[1] : _(o[1])); b.dataset.v = String(o[0]); root.appendChild(b); return b; });
    function paint() { const v = String(get()); btns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false')); }
    paint(); return { root: root, paint: paint, btns: btns };
  }
  const MUS_ON = '<svg ' + SVG + '><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  const MUS_OFF = '<svg ' + SVG + '><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="m3 3 18 18"/></svg>';
  const MIX = '<svg ' + SVG + '><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>';
  const SHUF = '<svg ' + SVG + '><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>';
  const ico = svg => { const e = document.createElement('span'); e.className = 'gm-ico'; e.innerHTML = svg; return e; };

  // Sound (effects, crowd, commentary) and Music each get a one-click on/off button plus a volume slider. Rows repaint together so the
  // title, setup, pause and HUD copies never disagree.
  const paints = [];
  function refreshAudio() {
    for (let i = paints.length - 1; i >= 0; i--) { if (!paints[i].el.isConnected) paints.splice(i, 1); else paints[i].fn(); }
  }
  const soundIsOn = () => !!(S.soundOn && !S.muted);
  const DEF_VOL = { master: 0.8, music: 0.5 };
  function toggleAudio(bus) {
    const music = bus === 'music', on = music ? !!S.musicOn : soundIsOn();
    if (!on && (S.vol[bus] || 0) <= 0) API.setVolume(bus, DEF_VOL[bus]);
    if (music) API.setMusic(!on); else API.setSound(!on);
    refreshAudio();
  }
  function volRow(bus) {
    const music = bus === 'music', A = mod('audio'), has = !music || !!(A && A.hasMusic && A.hasMusic()), label = _(music ? 'Music' : 'Sound');
    const isOn = () => (music ? !!S.musicOn : soundIsOn());
    const setOn = v => { if (music) API.setMusic(v); else API.setSound(v); };
    const tog = h('button', { type: 'button', class: 'gm-vtog', 'data-bus': bus, 'aria-label': _('{name} on or off', { name: label }), title: _('{name} on / off', { name: label }), onclick: () => toggleAudio(bus) });
    const rng = h('input', { type: 'range', class: 'gm-vol', 'data-bus': bus, min: '0', max: '100', step: '5', 'aria-label': _('{name} volume', { name: label }),
      oninput: () => { const v = +rng.value / 100; API.setVolume(bus, v); if (v > 0 && !isOn()) setOn(true); else if (v === 0 && isOn()) setOn(false); refreshAudio(); } });
    const val = h('span', { class: 'gm-vval' });
    const row = h('div', { class: 'gm-vrow' }, tog, h('div', { class: 'gm-vmid' }, h('div', { class: 'lbl rowline' }, h('span', null, has ? label : _('{name} · no track yet', { name: label })), val), rng));
    let last = '';
    function paint() {
      const on = isOn(), v = Math.round((S.vol[bus] || 0) * 100), key = on + ':' + v + ':' + has;
      if (key === last && document.activeElement !== rng) return; last = key;
      row.classList.toggle('off', !on);
      tog.innerHTML = music ? (on ? MUS_ON : MUS_OFF) : (on ? SND_ON : SND_OFF);
      tog.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (document.activeElement !== rng) rng.value = String(v);
      val.textContent = on ? v + '%' : _('Off');
      tog.disabled = rng.disabled = !has;
    }
    paints.push({ el: row, fn: paint }); paint(); return row;
  }
  function audioBlock() { return h('div', { class: 'gm-audio' }, volRow('master'), volRow('music')); }
  // Language switch: the panels are built once, so it reloads with ?lang= (no storage). Mid-match it asks first because the match is lost.
  function langBtn() {
    const id = HPO.mod.i18n.lang === 'id';
    return h('button', { class: 'btn small gm-lang', type: 'button', id: 'gm-lang', lang: id ? 'en' : 'id', onclick: () => {
      if (G.st !== 'title' && G.st !== 'create' && G.st !== 'setup' && !confirm(_('Switching language restarts the match. Continue?'))) return;
      const u = new URL(location.href); u.searchParams.set('lang', id ? 'en' : 'id'); location.href = u.href;
    } }, id ? 'English' : 'Bahasa Indonesia');
  }
  function calloutRow() {
    const sg = segBtns([['on', 'On'], ['off', 'Off']], () => (S.callouts ? 'on' : 'off'), v => API.setCallouts(v === 'on'), 'gm-co');
    paints.push({ el: sg.root, fn: sg.paint });
    return h('div', { class: 'field gm-cofield' }, h('div', { class: 'lbl' }, _('Callouts (OUT!, SMASH! ...)')), sg.root);
  }
  function speedRow() {
    const sg = segBtns([['1', '1×'], ['2', '2×'], ['4', '4×']], () => String(S.speed), v => { API.setSpeed(+v); updateHud(true); }, 'gm-spd', true);
    paints.push({ el: sg.root, fn: sg.paint });
    return h('div', { class: 'field gm-cofield' }, h('div', { class: 'lbl' }, _('Game speed')), sg.root);
  }
  function qteRow() {
    const sg = segBtns([['off', 'Off'], ['relaxed', 'No timer'], ['occasional', 'Timed'], ['on', 'Timed, often']], () => G.qte, v => { G.qte = v; const Q = mod('qte'); if (Q) Q.setMode(v); }, 'gm-qte');
    paints.push({ el: sg.root, fn: sg.paint });
    return h('div', { class: 'field gm-cofield' }, h('div', { class: 'lbl' }, _('QTE shots (swipe to aim winners and saves)')), sg.root);
  }
  function openScreen(id, kids, cls) {
    closeScreen();
    const card = h('div', { class: 'gm-card ' + (cls || ''), role: 'dialog', 'aria-label': id });
    add(card, kids);
    const el = h('div', { class: 'gm-screen', id: id }, card);
    EL.stage.appendChild(el); EL.stage.classList.add('gm-covered');
    G.scr = el; updateVisibility();
    return card;
  }
  function closeScreen() { if (G.scr) { G.scr.remove(); G.scr = null; } EL.stage.classList.remove('gm-covered'); }
  // a sentence with one <em>: '{em}' marks where it goes
  function rich(tpl, em) { const p = tpl.split('{em}'); return [p[0], h('em', null, em), p[1] || null]; }
  const hint = f => FMT_HINT[f] ? _(FMT_HINT[f]) : '';
  function stamp(t) { return h('span', { class: 'sticker gm-stk' }, t); }
  function setSt(s) {
    G.st = s; EL.app.setAttribute('data-gm', s); updateVisibility();
    const Q = mod('qte'); if (Q) { Q.enabled = s === 'playing'; if (!Q.enabled) Q.cancel(); }
    const Tu = mod('tutorial'); if (Tu && s !== 'playing') { G.tutorialPending = false; Tu.stop(); }
  }

  // ---------- init ----------
  function init(ctx, api) {
    API = api; S = api.S; EL = api.EL; h = api.h; add = api.add; safe = api.safe;
    EL.app = document.getElementById('app') || document.body;
    buildHud(); G.hud = hud;
    const modeBtn = document.getElementById('btn-mode');
    if (modeBtn) modeBtn.addEventListener('click', () => setMode(G.mode === 'play' ? 'studio' : 'play'));
    BUS.on('match:new', function () { hlKey = ''; if (G.st === 'title' || G.st === 'create' || G.st === 'setup') return; });
    BUS.on('match:phase', function (e) { if (e.phase === 'results' && (G.st === 'title' || G.st === 'create' || G.st === 'setup' || G.st === 'watch')) { clearTimeout(attractT); attractT = setTimeout(() => { if (G.st === 'title' || G.st === 'create' || G.st === 'setup') startAttract(); }, 5000); } });
    BUS.on('flag:update', onFlags);
    BUS.on('replay:start', function () { EL.app.classList.add('gm-replaying'); updateHud(true); });
    BUS.on('replay:end', function () { EL.app.classList.remove('gm-replaying'); updateHud(true); });
    BUS.on('shot:hit', onShot);
    document.addEventListener('pointerdown', function (e) { if (hud.pop && !hud.pop.hidden && !hud.pop.contains(e.target) && !hud.mix.contains(e.target)) toggleMix(false); }, true);
    // the intro/ceremony camera sweeps change the view: when play starts, go back to the camera the player picked
    BUS.on('match:phase', function (e) { if (e.phase === 'play' && G.st === 'playing' && G.tutorialPending) { G.tutorialPending = false; const Tu = mod('tutorial'); if (Tu) setTimeout(() => Tu.start(), 300); } });
    BUS.on('match:phase', function (e) { if (e.phase === 'play' && G.st === 'playing' && G.camPref) safe(() => { API.setCam(G.camPref); const R = mod('render'); if (R && R.setFollowBall && G.camPref === 'follow') R.setFollowBall(true); }, 'camPref'); });
    const q = HPO.query;
    const m = q && q.get('mode');
    if (m === 'studio') { G.mode = 'studio'; applyModeClass(); setSt('studio'); }
    else if (q && q.get('title') === '0') { G.mode = 'play'; applyModeClass(); startWatch(true); }
    else { G.mode = 'play'; applyModeClass(); showTitle(true); }
  }
  function applyModeClass() {
    EL.app.classList.toggle('mode-play', G.mode === 'play'); EL.app.classList.toggle('mode-studio', G.mode === 'studio');
    const b = document.getElementById('btn-mode'); if (b) { b.textContent = G.mode === 'play' ? _('⚙︎ Studio') : _('▶ Play mode'); b.title = _('Switch between Play and Studio'); }
    window.dispatchEvent(new Event('resize'));
  }
  function setMode(m) {
    if (m === G.mode) return;
    if (m === 'studio') {
      G.resume = G.st; closePause(); closeScreen(); G.mode = 'studio'; applyModeClass(); setSt('studio'); clearHighlights();
    } else {
      G.mode = 'play'; applyModeClass();
      const r = G.resume;
      if (r === 'playing' || r === 'watch') { setSt(r); } else showTitle();
    }
    BUS.emit('ui:setting', { key: 'mode', value: G.mode });
  }
  function active() { return G.mode === 'play' && G.st === 'playing'; }
  function blocking() { return G.mode === 'play' && (!!G.scr || !!pauseEl); }
  function suppressResults() { return G.mode === 'play' && (G.st === 'title' || G.st === 'create' || G.st === 'setup'); }
  function onSaved() { if (G.st === 'title') showTitle(true); }

  // ---------- attract / watch ----------
  function startAttract() {
    S.coachClaimed = false; const M = mod('match'); if (M) M.coachTeam = null;
    S.type = 'M'; S.speed = 1; S.seed = '';
    API.newMatch({ draw: true });
    API.setCam(defCam());
    const A = mod('audio'); void A;
  }
  function startWatch(first) {
    closeScreen(); closePause(); setSt('watch'); clearHighlights();
    if (!first) API.setCam(defCam());
    updateVisibility();
  }

  // ---------- title ----------
  function showTitle(keep) {
    closePause(); clearHighlights();
    setSt('title');
    const M = mod('match');
    if (!keep) { const R = mod('render'); if (R && R.cameraMode !== defCam()) API.setCam(defCam()); if (M && M.coachTeam) { startAttract(); } }
    if (M && M.paused) M.pause(false);
    const saved = (S.saved && S.saved.length) ? S.saved[S.saved.length - 1] : null;
    const an = pdef(AN);
    const kids = [
      h('div', { class: 'gm-top' }, an ? portrait(an, 'gm-portrait sm') : null, h('div', null, h('div', { class: 'tag' }, HPO.cfg.TITLE()), stamp(_('Doubles · Jakarta')))),
      h('h2', { class: 'gm-h' }, rich(_('Play doubles with {em}'), 'Annetta')),
      h('p', { class: 'gm-p' }, _('Make your player, team up, win the Littleworld Jakarta Padel Cup.')),
      h('div', { class: 'gm-acts' },
        saved
          ? [h('button', { class: 'btn primary big', type: 'button', id: 'gm-continue', onclick: () => { G.player = saved; showSetup(); } }, _('Continue as {name}', { name: saved.name })),
             h('button', { class: 'btn big', type: 'button', id: 'gm-newplayer', onclick: () => showCreate() }, _('New player'))]
          : h('button', { class: 'btn primary big', type: 'button', id: 'gm-play', onclick: () => showCreate() }, _('Play with Annetta')),
        h('button', { class: 'btn big', type: 'button', id: 'gm-watch', onclick: startWatch }, _('Just watch'))),
      audioBlock(),
      h('p', { class: 'gm-foot' }, langBtn()),
      h('p', { class: 'gm-foot' }, h('a', { href: '#', id: 'gm-how-link', onclick: e => { e.preventDefault(); showHow(() => showTitle(true)); } }, _('How to play')), ' · ', h('a', { href: '#', id: 'gm-studio-link', onclick: e => { e.preventDefault(); setMode('studio'); } }, _('Studio controls')), ' · ',
        h('a', { href: 'https://annetta.dev/' }, _('← annetta.dev'))),
      h('p', { class: 'gm-foot it' }, _('Made in Jakarta with code, curiosity, and no spare towel.'))
    ];
    openScreen('gm-title', kids, 'title');
  }

  // ---------- create player ----------
  function previewDef() {
    const P = mod('players'); if (!P) return null;
    const ros = P.roster(), id = 'custom-' + cp.seed.toString(16), had = ros.some(r => r.id === id);
    let d = null;
    try { d = P.createCustom({ name: cp.name.trim() || _('Your name'), gender: cp.gender, seed: cp.seed }); } catch (e) { return null; }
    if (!had) { const i = ros.indexOf(d); if (i >= 0) ros.splice(i, 1); }
    return Object.assign({}, d, { name: cp.name.trim() || _('Your name'), country: { code: cp.nat, name: NATION_NAME[cp.nat] || cp.nat } });
  }
  function showCreate() {
    closePause(); clearHighlights();
    if (G.st !== 'create') { cp = { seed: rnd(), name: '', gender: 'F', nat: 'IDN' }; }
    setSt('create');
    const name = h('input', { type: 'text', id: 'gm-name', maxlength: '40', placeholder: _('Your name'), autocomplete: 'nickname', 'aria-label': _('Your name'), value: cp.name });
    const genderSeg = segBtns([['F', 'Woman'], ['M', 'Man']], () => cp.gender, v => { cp.gender = v; render(); });
    const nat = h('select', { id: 'gm-nat', 'aria-label': _('Nationality') }, NATIONS.map(n => h('option', { value: n[0] }, _(n[1]))));
    nat.value = cp.nat;
    const portraitBox = h('div', { class: 'gm-pbox' });
    const nameLine = h('div', { class: 'gm-nm' }), archLine = h('div', { class: 'gm-meta' });
    const bars = h('div', { class: 'gm-bars' });
    const typeLine = h('p', { class: 'hint', id: 'gm-typeline' });
    const status = h('p', { class: 'hint gm-err', role: 'status', id: 'gm-cstatus' }, '');
    const an = pdef(AN);
    const partner = h('div', { class: 'gm-partner' }, an ? portrait(an, 'gm-portrait xs') : null,
      h('div', null, h('div', { class: 'tag' }, _('Your partner')), h('div', { class: 'gm-nm sm' }, an ? an.name : 'Annetta Arslan'),
        h('div', { class: 'gm-meta' }, _('{arch} · World #{rank}', { arch: an ? _(API.ARCH[an.archetype]) : '', rank: an ? an.ranking : '-' }) + ' ', an ? flag(an) : null)));
    function render() {
      const d = previewDef(); if (!d) return;
      portraitBox.textContent = ''; portraitBox.appendChild(portrait(d, 'gm-portrait lg'));
      nameLine.textContent = ''; add(nameLine, [d.name, ' ', flag(d)]);
      archLine.textContent = _(d.hand === 'L' ? '{arch} · left-handed' : '{arch} · right-handed', { arch: _(API.ARCH[d.archetype] || d.archetype) });
      bars.textContent = ''; API.ATTRS.forEach(a => bars.appendChild(API.mbar(_(a[1]), d.attrs[a[0]], '')));
      typeLine.textContent = cp.gender === 'F' ? _("You and Annetta play women's doubles.") : _('You and Annetta play mixed doubles.');
      genderSeg.paint();
    }
    name.addEventListener('input', () => { cp.name = name.value; nameLine.firstChild && (nameLine.firstChild.textContent = cp.name.trim() || _('Your name')); });
    nat.addEventListener('change', () => { cp.nat = nat.value; render(); });
    const shuffle = h('button', { class: 'btn orange', type: 'button', id: 'gm-shuffle', onclick: () => { cp.seed = rnd(); render(); } }, ico(SHUF), _('Shuffle look & stats'));
    const save = h('button', { class: 'btn primary big', type: 'button', id: 'gm-save', onclick: async () => {
      const nm = name.value.trim();
      if (!nm) { status.textContent = _('Give your player a name first.'); name.focus(); name.classList.remove('shake'); void name.offsetWidth; name.classList.add('shake'); return; }
      save.disabled = true;
      try {
        const P = mod('players');
        const def = P.createCustom({ name: nm, gender: cp.gender, seed: cp.seed });
        def.country = { code: cp.nat, name: NATION_NAME[cp.nat] || cp.nat };
        const ok = await API.savePlayerDef(def);
        S.saved = (S.saved || []).filter(x => x.id !== def.id); S.saved.push(def);
        G.player = def; G.firstRun = true;
        API.toast(ok ? _('{name} saved on this device.', { name: def.name }) : _('Playing as {name}. Local saving is unavailable here.', { name: def.name }), { kind: ok ? 'good' : 'warn' });
        showSetup();
      } catch (err) { status.textContent = err && err.message ? err.message : _('Could not create that player.'); save.disabled = false; }
    } }, _('Save & continue'));
    const card = openScreen('gm-create', [
      h('div', { class: 'tag' }, _('01 / Your player')),
      h('h2', { class: 'gm-h sm' }, _('Make your player')),
      h('div', { class: 'gm-prev' }, portraitBox, h('div', { class: 'gm-prevtxt' }, nameLine, archLine, shuffle)),
      h('div', { class: 'field' }, h('label', { for: 'gm-name', class: 'lbl' }, _('Name')), name),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('div', { class: 'lbl' }, _('You are')), genderSeg.root), h('div', { class: 'field' }, h('label', { for: 'gm-nat', class: 'lbl' }, _('Nationality')), nat)),
      typeLine,
      bars,
      partner,
      status,
      h('div', { class: 'gm-acts row' }, h('button', { class: 'btn big', type: 'button', id: 'gm-cback', onclick: () => showTitle(true) }, _('Back')), save)
    ], 'create');
    render();
    setTimeout(() => { try { name.focus(); } catch (e) { /* ignore */ } }, 60);
    void card;
  }

  // ---------- quick setup ----------
  function randomOpp(type, prev) {
    const r = players().filter(x => !x.custom && x.id !== AN);
    const sh = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
    const wom = r.filter(x => x.gender === 'F'), men = r.filter(x => x.gender === 'M');
    for (let tries = 0; tries < 8; tries++) {
      const pair = type === 'W' ? sh(wom).slice(0, 2).map(x => x.id) : [sh(men)[0].id, sh(wom)[0].id];
      if (!prev || pair.join() !== prev.join() || tries === 7) return pair;
    }
  }
  function myType() { return G.player && G.player.gender === 'M' ? 'X' : 'W'; }
  function showSetup() {
    closePause(); clearHighlights();
    if (!G.player) return showCreate();
    setSt('setup');
    const type = myType();
    if (!G.opp || G.oppType !== type || G.opp.some(id => id === G.player.id)) { G.opp = randomOpp(type); G.oppType = type; }
    const C = G.cfg;
    const fmt = segBtns([['blitz', 'Blitz'], ['americano', 'Americano'], ['quick', 'Quick'], ['oneSet', 'One set'], ['bo3', 'Best of 3']], () => C.format, v => { C.format = v; scoField.hidden = FMT_PTS[v]; fmtHint.textContent = hint(v) + ' ' + _('Other formats are coming soon.'); });
    if (!FMT_OPEN[C.format]) C.format = 'blitz';
    fmt.btns.forEach(b => { if (!FMT_OPEN[b.dataset.v]) { b.disabled = true; b.title = _('Coming soon'); } });
    fmt.paint();
    const sco = segBtns([['golden', 'Golden Point'], ['advantage', 'Advantage']], () => C.scoring, v => { C.scoring = v; });
    const tod = segBtns([['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], () => C.tod, v => { C.tod = v; });
    const scoField = h('div', { class: 'field' }, h('div', { class: 'lbl' }, _('Scoring')), sco.root), fmtHint = h('p', { class: 'hint' }, hint(C.format) + ' ' + _('Other formats are coming soon.'));
    scoField.hidden = !!FMT_PTS[C.format];
    const courts = h('div', { class: 'gm-courts' });
    const cbtns = COURTS.map(c => { const b = h('button', { type: 'button', 'aria-pressed': 'false', 'data-v': c[0], onclick: () => { C.venue = c[0]; paintCourts(); } }, h('span', { class: 'ct ct-' + c[0] }, h('i')), h('b', null, _(c[1]))); courts.appendChild(b); return b; });
    function paintCourts() { cbtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === C.venue ? 'true' : 'false')); tod.btns.forEach(b => { b.disabled = C.venue === 'indoor'; }); todHint.hidden = C.venue !== 'indoor'; }
    const todHint = h('p', { class: 'hint', hidden: true }, _('Indoor courts always use hall lighting.'));
    const oppBox = h('div', { class: 'gm-opp' });
    function paintOpp() {
      oppBox.textContent = '';
      G.opp.forEach(id => { const d = pdef(id); oppBox.appendChild(h('div', { class: 'gm-oppp' }, flag(d), h('span', null, d ? d.name : id))); });
    }
    const me = G.player, an = pdef(AN);
    const kids = [
      h('div', { class: 'tag' }, _('02 / Quick match')),
      h('h2', { class: 'gm-h sm' }, _('Set up the match')),
      h('div', { class: 'gm-team' }, h('span', { class: 'dot' }), h('b', null, me.name), flag(me), ' & ', h('b', null, an ? an.name : 'Annetta'), an ? flag(an) : null,
        h('span', { class: 'chip' }, type === 'W' ? _("Women's doubles") : _('Mixed doubles'))),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, _('Format')), fmt.root, fmtHint),
      scoField,
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, _('Court')), courts),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, _('Time')), tod.root, todHint),
      h('div', { class: 'field' }, h('div', { class: 'lbl rowline' }, h('span', null, _('Opponents · random pair')), h('button', { class: 'btn small orange', type: 'button', id: 'gm-oppshuffle', onclick: () => { G.opp = randomOpp(type, G.opp); paintOpp(); } }, ico(SHUF), _('Shuffle'))), oppBox),
      h('div', { class: 'gm-acts row' }, h('button', { class: 'btn big', type: 'button', id: 'gm-sback', onclick: () => showTitle(true) }, _('Back')),
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-kick', onclick: kickoff }, _('Kick off')))
    ];
    openScreen('gm-setup', kids, 'setup');
    paintCourts(); paintOpp();
  }

  // ---------- how to play (shown once for a new player, and from the title screen) ----------
  const HOW = [
    ['You are the coach', 'You and Annetta play by themselves, so there is nothing to steer. Your job is the game plan, plus a few big moments.'],
    ['Set the strategy', 'Open Strategy at the bottom. Pick a mindset (shield is safe, sword is attack), one plan, the kind of shots, and who takes the middle balls. A small tag shows what is switched on, and your plan announces itself when it works.'],
    ['Winning chances', 'When your player gets a winning chance, or a hard smash is coming at you, time freezes. Swipe from the glowing ring to aim the shot. No time? Tap "Let it play". Aim lets you place your next shot yourself; Timeout is a breather.'],
    ['Padel in 20 seconds', () => _('Two against two. Serve underhand into the diagonal box. The ball may bounce once on your side, and it may also hit the glass walls and stay in play. {format}', { format: mod('rules') ? mod('rules').describeFormat(G.cfg.format, G.cfg.scoring) : '' })]
  ];
  G.how = HOW;   // the instructions sheet (27_guide.js) shows the same four cards
  function showHow(next) {
    let i = 0;
    const body = h('div', { class: 'gm-howbody' }), nb = h('button', { class: 'btn primary big', type: 'button', id: 'gm-hownext' }, _('Next'));
    const done = () => { if (next) next(); else showTitle(true); };
    function paint() {
      body.textContent = '';
      add(body, [h('div', { class: 'tag' }, _('How to play · {n} of {total}', { n: i + 1, total: HOW.length })), h('h2', { class: 'gm-h sm' }, _(HOW[i][0])), h('p', { class: 'gm-p' }, typeof HOW[i][1] === 'function' ? HOW[i][1]() : _(HOW[i][1]))]);
      nb.textContent = i === HOW.length - 1 ? _("Let's play") : _('Next');
    }
    nb.onclick = () => { if (i < HOW.length - 1) { i++; paint(); } else done(); };
    paint();
    openScreen('gm-how', [body, h('div', { class: 'gm-acts row' }, h('button', { class: 'btn big', type: 'button', id: 'gm-howskip', onclick: done }, _('Skip')), nb)], 'how');
  }

  // ---------- kick off ----------
  function kickoff() {
    const me = G.player; if (!me) return showCreate();
    closeScreen(); closePause(); clearTimeout(attractT); hideHint();
    const C = G.cfg;
    S.type = myType(); S.teamA = [me.id, AN]; S.teamB = (G.opp || randomOpp(S.type)).slice();
    S.format = C.format; S.scoring = C.scoring; S.venue = C.venue; S.tod = C.tod; S.seed = '';
    S.coachTeam = 'A'; S.coachClaimed = true; S.speed = 1;
    const Qt = mod('qte'); if (Qt) { Qt.setMode(G.qte); Qt.armed = false; Qt.pointsSince = 9; Qt.gameUsed = 0; }
    const Ai = mod('ai');
    ['A', 'B'].forEach(t => safe(() => { if (Ai && Ai.setOrders) Ai.setOrders(t, { preset: 'balanced', mindset: 0, plan: null, style: 'mix', serveDir: 'auto', returnDir: 'auto', middlePriority: undefined, focusOpponent: undefined, aimPoint: undefined }); }, 'orders'));
    setSt('playing'); hlKey = '';
    API.newMatch();
    if (G.firstRun) { G.firstRun = false; G.tutorialPending = true; setTimeout(() => API.skipCeremony(), 400); }   // a new player's first match is the guided one
    const M = mod('match'); if (M) M.coachTeam = 'A';
    G.camPref = HPO.cfg.mobile ? 'follow' : 'close'; API.setCam(G.camPref);
    updateHud(true);
  }

  // ---------- HUD ----------
  // One tooltip for the whole dock. Native titles are slow, tiny and never show on touch; this one is drawn above the button, with its key.
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  function tip(el, name, desc, key, badge) {
    el.dataset.tipName = name; el.dataset.tipDesc = desc || ''; if (key) el.dataset.tipKey = key; if (badge) el.dataset.kb = badge;
    el.removeAttribute('title'); el.setAttribute('aria-label', name + (desc ? ': ' + desc : '')); return el;
  }
  G.tipText = el => { const n = el && el.dataset.tipName; return n ? n + (el.dataset.tipDesc ? ': ' + el.dataset.tipDesc : '') + '.' + (el.dataset.tipKey ? ' ' + _('Key: {key}.', { key: el.dataset.tipKey }) : '') : ''; };
  let tipT = 0;
  function showTip(el, touch) {
    clearTimeout(tipT);
    hud.tipName.textContent = el.dataset.tipName; hud.tipDesc.textContent = el.dataset.tipDesc || '';
    hud.tipKey.textContent = el.dataset.tipKey || ''; hud.tipKey.hidden = !el.dataset.tipKey;
    hud.tip.hidden = false;
    const st = EL.stage.getBoundingClientRect(), r = el.getBoundingClientRect(), w = hud.tip.offsetWidth;
    hud.tip.style.left = Math.round(Math.max(6, Math.min(st.width - w - 6, r.left - st.left + r.width / 2 - w / 2))) + 'px';
    hud.tip.style.bottom = Math.round(st.bottom - r.top + 10) + 'px';
    if (touch) tipT = setTimeout(hideTip, 2600);
  }
  function hideTip() { clearTimeout(tipT); if (hud.tip) hud.tip.hidden = true; }
  function bindTips(root) {
    const pick = e => e.target.closest && e.target.closest('[data-tip-name]');
    root.addEventListener('pointerover', e => { const el = pick(e); if (el) showTip(el, e.pointerType === 'touch'); });
    root.addEventListener('pointerout', e => { if (e.pointerType !== 'touch' && pick(e) && !(e.relatedTarget && pick(e).contains(e.relatedTarget))) hideTip(); });
    root.addEventListener('focusin', e => { const el = pick(e); if (el && el.matches(':focus-visible')) showTip(el); });
    root.addEventListener('focusout', hideTip);
  }
  function btn(id, cls, label, title, fn) { const b = h('button', { class: 'gm-ib ' + cls, type: 'button', id: id, title: title, 'aria-label': title, onclick: fn }, label); return b; }
  function buildHud() {
    hud.root = h('div', { id: 'gm-hud' });
    // top-right icons
    hud.pause = btn('gm-pause', '', '❚❚', _('Pause (Space)'), () => { API.togglePause(); updateHud(true); });
    hud.cam = btn('gm-cam', 'txt sm', 'CAM', _('Camera'), () => cycleCam());
    hud.mix = btn('gm-mix', '', '', _('Volume and callouts'), () => toggleMix()); hud.mix.innerHTML = MIX; hud.mix.setAttribute('aria-expanded', 'false');
    hud.pop = h('div', { class: 'gm-pop', id: 'gm-pop', hidden: true }, h('div', { class: 'tag' }, _('Sound, music, callouts')), audioBlock(), calloutRow(), h('div', { class: 'gm-langrow' }, langBtn()));
    hud.icons = h('div', { class: 'gm-icons' }, hud.pause, hud.cam, hud.mix);
    // coach bar
    hud.steps = MIND.map((n, i) => h('button', { type: 'button', class: 'gm-step', 'data-v': String(i - 2), 'aria-pressed': 'false', onclick: () => setOrder({ mindset: i - 2 }, _('Mindset: {name}: {fx}', { name: _(n), fx: _(MIND_FX[i]) })) }));
    hud.steps.forEach((b, i) => tip(b, _('Mindset: {name}', { name: _(MIND[i]) }), cap(_(MIND_FX[i])), String(i + 1)));
    hud.mindLab = h('span', { class: 'gm-lab2' }, _('Balanced'));
    const ic = (cls, svg) => { const e = h('span', { class: cls }); e.innerHTML = svg; return e; };
    hud.mind = h('div', { class: 'gm-mind' }, h('div', { class: 'gm-mindrow' }, ic('gm-ico', IC.shield), h('div', { class: 'gm-steps' }, hud.steps), ic('gm-ico', IC.sword)), hud.mindLab);
    hud.planBtns = PLAN_UI.map(q => { const b = h('button', { type: 'button', class: 'gm-plan', 'data-plan': q[0], 'aria-pressed': 'false', onclick: () => togglePlan(q[0]) }); b.innerHTML = IC[q[0]]; return tip(b, _(q[1]), _(q[2]), q[3], q[3]); });
    hud.planLab = h('span', { class: 'gm-lab2' }, _('No plan'));
    hud.plans = h('div', { class: 'gm-plans' }, h('div', { class: 'gm-planrow' }, hud.planBtns), hud.planLab);
    hud.styleBtns = STYLE_UI.map(q => h('button', { type: 'button', class: 'gm-sty', 'data-style': q[0], 'aria-pressed': 'false', onclick: () => setOrder({ style: q[0] }, _('Shots: {name}: {fx}', { name: _(q[1]), fx: _(STYLE_FX[q[0]]) })) }, _(q[1])));
    hud.styleBtns.forEach((b, i) => tip(b, _('Shots: {name}', { name: _(STYLE_UI[i][1]) }), cap(_(STYLE_FX[STYLE_UI[i][0]])), 'P'));
    hud.style = h('div', { class: 'gm-style' }, h('div', { class: 'gm-sty-row' }, hud.styleBtns), h('span', { class: 'gm-lab2' }, _('Shots')));
    hud.midBtns = MID_UI.map(q => h('button', { type: 'button', class: 'gm-sty gm-mid', 'data-mid': q[0], 'aria-pressed': 'false', onclick: () => setMid(q[0] === '' ? undefined : +q[0]) }, _(q[1])));
    hud.midBtns.forEach((b, i) => tip(b, _('Middle balls: {who}', { who: _(MID_UI[i][1]) }), _(MID_FX[i]), 'V'));
    hud.mid = h('div', { class: 'gm-style' }, h('div', { class: 'gm-sty-row' }, hud.midBtns), h('span', { class: 'gm-lab2' }, _('Middle balls')));
    const moment = (id, svg, title, fn) => { const b = h('button', { type: 'button', class: 'gm-mo', id: id, onclick: fn }); b.innerHTML = svg + '<span class="gm-badge" hidden></span>'; return b; };
    hud.go = moment('gm-go', IC.go, '', () => goForIt()); hud.go.setAttribute('aria-pressed', 'false');
    hud.aim = moment('gm-aim', IC.aim, '', () => API.toggleAim()); hud.aim.setAttribute('aria-pressed', 'false');
    hud.tmo = moment('gm-timeout', IC.timeout, '', () => { API.callTimeout(); updateHud(true); });
    tip(hud.go, _('Go for it'), _('The next ball you get becomes a swipe shot'), 'F', 'F');
    tip(hud.aim, _('Aim'), _('Place your next shot yourself'), 'A', 'A');
    tip(hud.tmo, _('Timeout'), _('A breather after this point to rethink your strategy. One per match'), 'O', 'O');
    hud.fab = h('button', { type: 'button', class: 'gm-fab', id: 'gm-fab', 'aria-expanded': 'false', 'aria-label': _('Strategy'), onclick: () => { const o = hud.coach.classList.toggle('open'); hud.fab.setAttribute('aria-expanded', String(o)); } });
    hud.fab.innerHTML = '<span class="gm-chev">' + IC.chev + '</span><span>' + _('Strategy') + '</span>';
    hud.hintTxt = h('span', null);
    hud.hint = h('div', { class: 'gm-hint', hidden: true }, hud.hintTxt,
      h('button', { type: 'button', class: 'gm-hint-go', onclick: () => { if (hs.cur) togglePlan(hs.cur[0], true); hideHint(); } }, _('Apply')),
      h('button', { type: 'button', class: 'gm-hint-x', 'aria-label': _('Dismiss hint'), onclick: () => hideHint() }, '×'));
    hud.tag = h('div', { class: 'gm-tag', hidden: true });
    hud.tipName = h('b'); hud.tipDesc = h('span'); hud.tipKey = h('kbd', { class: 'keycap' });
    hud.tip = h('div', { class: 'gm-tip', role: 'tooltip', hidden: true }, hud.tipName, hud.tipDesc, hud.tipKey);
    hud.sheet = h('div', { class: 'gm-sheet' }, hud.mind, hud.plans, hud.style, hud.mid);
    hud.coach = h('div', { class: 'gm-dock' }, hud.hint, hud.tag, h('div', { class: 'gm-dockrow' }, hud.sheet, h('div', { class: 'gm-moments' }, hud.fab, hud.go, hud.aim, hud.tmo)));
    hud.ticker = h('div', { class: 'gm-ticker', hidden: true });
    hud.skip = h('button', { type: 'button', class: 'btn small gm-skip', id: 'gm-skip', onclick: () => { const rp = mod('replay'); if (rp && rp.active) rp.stop(); else API.skipCeremony(); updateHud(true); } }, _('Skip intro ▸'));
    hud.watchBar = h('div', { class: 'gm-watchbar' }, h('button', { type: 'button', class: 'btn primary', id: 'gm-watch-play', onclick: () => showCreateOrSetup() }, _('Play with Annetta')));
    hud.labels = h('div', { class: 'gm-labels' });
    hud.labYou = h('div', { class: 'gm-lab you' }, _('YOU')); hud.labAn = h('div', { class: 'gm-lab an' }, _('ANNETTA'));
    hud.labels.append(hud.labYou, hud.labAn);
    // expand icon in the scoreboard's bottom-right corner: it grows the scoreboard into the full match centre (score, stats, players, feed)
    hud.sbTab = h('button', { type: 'button', class: 'gm-sbx', id: 'gm-sbtab', 'aria-expanded': 'false', 'aria-controls': 'gm-drawer', 'aria-label': _('Open match centre'), title: _('Match centre'), onclick: () => toggleSb() });
    hud.sbTab.innerHTML = EXPAND;
    if (EL.sbCard) EL.sbCard.appendChild(hud.sbTab);
    hud.drawer = h('div', { class: 'gm-drawer', id: 'gm-drawer', hidden: true });
    ['pointerdown', 'wheel', 'touchstart'].forEach(ev => hud.drawer.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
    hud.root.append(hud.labels, hud.drawer, hud.icons, hud.pop, hud.skip, hud.ticker, hud.coach, hud.tip, hud.watchBar);
    bindTips(hud.coach);
    EL.stage.appendChild(hud.root);
    hud.root.hidden = true;
  }
  function cycleCam() {
    const R = mod('render'); let i = CAM_CYCLE.findIndex(c => c[0] === (R && R.cameraMode)); i = (i + 1) % CAM_CYCLE.length;
    API.setCam(CAM_CYCLE[i][0]); G.camPref = CAM_CYCLE[i][0]; API.toast(_('Camera: {name}', { name: _(CAM_CYCLE[i][1]) }), { ms: 1400 }); updateHud(true);
  }
  // Go for it: the button and the F key both toggle
  function goForIt(on) {
    const Q = mod('qte'); if (!Q) return;
    const set = Q.arm(on);
    API.toast(set ? _('Go for it: you take the next ball you get') : (Q.mode === 'off' ? _('QTE shots are off (pause menu)') : _('Go for it cancelled')), { kind: 'info', ms: 1800 }); updateHud(true);
  }
  function toggleMix(force) {
    const open = force === undefined ? hud.pop.hidden : !!force;
    hud.pop.hidden = !open; hud.mix.setAttribute('aria-expanded', open ? 'true' : 'false'); if (open) refreshAudio();
  }
  // The Studio panel owns the match-centre section; Play mode borrows it for the drawer and hands it back when the drawer closes.
  let centreHome = null;
  function toggleSb(force) {
    const open = force === undefined ? !G.sbOpen : !!force, sec = document.getElementById('sec-centre');
    G.sbOpen = open && !!sec;
    if (G.sbOpen) {
      if (sec.parentNode !== hud.drawer) { centreHome = { parent: sec.parentNode, next: sec.nextSibling }; hud.drawer.appendChild(sec); }
      sec.open = true;
      const r = EL.sb.getBoundingClientRect(), s = EL.stage.getBoundingClientRect();
      hud.drawer.style.top = Math.max(60, Math.round(r.bottom - s.top + 8)) + 'px';
      hud.drawer.hidden = false;
      if (API.renderTab) API.renderTab();
    } else {
      hud.drawer.hidden = true;
      if (sec && centreHome && sec.parentNode === hud.drawer) { centreHome.parent.insertBefore(sec, centreHome.next && centreHome.next.parentNode === centreHome.parent ? centreHome.next : null); centreHome = null; }
    }
    EL.app.classList.toggle('gm-sb-open', G.sbOpen);
    hud.sbTab.setAttribute('aria-expanded', G.sbOpen ? 'true' : 'false');
    hud.sbTab.setAttribute('aria-label', G.sbOpen ? _('Close match centre') : _('Open match centre'));
    hud.sbTab.innerHTML = G.sbOpen ? COLLAPSE : EXPAND;
  }
  function showCreateOrSetup() { const s = S.saved && S.saved.length; if (s) { G.player = G.player || S.saved[S.saved.length - 1]; showSetup(); } else showCreate(); }
  function updateVisibility() {
    if (!hud.root) return;
    const show = G.mode === 'play' && (G.st === 'playing' || G.st === 'watch') && !G.scr;
    if (!show && G.sbOpen) toggleSb(false);
    hud.root.hidden = !show;
    EL.app.classList.toggle('gm-hud-on', show);
    hud.coach.hidden = G.st !== 'playing'; hud.watchBar.hidden = G.st !== 'watch';
    if (show) updateHud(true);
  }
  function setOrder(o, label) {
    const Ai = mod('ai'); if (!Ai || !Ai.setOrders) return;
    S.coachTeam = 'A'; API.claimCoach();
    safe(() => Ai.setOrders('A', Object.assign({ focusOpponent: undefined }, o)), 'order');
    if (label) API.toast(label, { kind: 'info', ms: 1600 });
    updateHud(true);
  }
  function togglePlan(k, on) {
    const cur = API.orders('A').plan, q = PLAN_UI.find(x => x[0] === k); if (!q) return;
    const clear = !on && cur === k;
    hs.planN = 0;
    setOrder({ plan: clear ? null : k }, clear ? _('Plan cleared') : _('Plan: {name}: {desc}', { name: _(q[1]), desc: _(q[2]) }));
  }
  // smart hint: every 0.25 s sample where the opponents stand; suggest a plan at most every 30 s (docs/QTE.md section 1)
  const hs = { net: [], deep: [], clock: 0, shownAt: -99, cur: null, planN: 0, planAt: -99 };
  // a shot the current plan asked for: count it and say so now and then, so the plan is felt
  function onShot(e) {
    if (G.st !== 'playing' || !e || e.serve) return;
    const P = mod('players'), hit = P && P.byId[e.playerId]; if (!hit || hit.team !== 'A') return;
    const pl = API.orders('A').plan; if (!pl) return;
    const ops = P.list.filter(p => p.team === 'B'), k = e.shot, t = e.target || { x: 0, z: 0 }, lob = k === 'lobDef' || k === 'lobOff';
    let msg = null;
    if (pl === 'breakNet' && lob && ops.some(p => Math.abs(p.pos.x) < 4)) msg = _('Over the net pair');
    else if (pl === 'exhaust' && (lob || k === 'dejada' || k === 'slice' || k === 'chiquita')) msg = _('Wearing them down');
    else if (pl === 'hunt') { const w = ops.slice().sort((a, b) => a.attrs.defense - b.attrs.defense)[0]; if (w && Math.hypot(w.pos.x - t.x, w.pos.z - t.z) < 3.2) msg = _('At {name}', { name: w.name.split(' ')[0] }); }
    else if (pl === 'net' && /volley|smash|bandeja|vibora/.test(k)) msg = _('Taking the net');
    else if (pl === 'glass' && (k === 'wallDef' || k === 'bajada' || Math.abs(t.z) > 4)) msg = _('Using the glass');
    else if (pl === 'middle' && Math.abs(t.z) < 1) msg = _('Down the middle');
    if (!msg) return;
    hs.planN++;
    if (hs.clock - hs.planAt > 7) { hs.planAt = hs.clock; API.toast(_('Your plan: {msg}', { msg: msg }), { kind: 'good', ms: 1500 }); }
  }
  function showHint(sg) { hs.cur = sg; hs.shownAt = hs.clock; hud.hintTxt.textContent = sg[1]; hud.hint.hidden = false; hud.root.classList.add('hinting'); }
  function hideHint() { hs.cur = null; if (hud.hint) hud.hint.hidden = true; if (hud.root) hud.root.classList.remove('hinting'); }
  function hintTick(dt) {
    const P = mod('players'), M = mod('match');
    if (G.st !== 'playing' || !P || !P.list || !M || M.phase !== 'play' || (mod('tutorial') && mod('tutorial').active)) return;
    const ops = P.list.filter(p => p.team === 'B'); if (ops.length < 2) return;
    hs.clock += dt;
    hs.net.push(ops.every(p => Math.abs(p.pos.x) < 4) ? 1 : 0); hs.deep.push(ops.every(p => Math.abs(p.pos.x) > 6) ? 1 : 0);
    if (hs.net.length > 32) { hs.net.shift(); hs.deep.shift(); }
    if (hs.cur) { if (hs.clock - hs.shownAt > 9) hideHint(); return; }
    if (hs.clock - hs.shownAt < 30 || hs.net.length < 24) return;
    const frac = a => a.reduce((x, y) => x + y, 0) / a.length, o = API.orders('A'), nm = p => p.name.split(' ')[0];
    const byFat = ops.slice().sort((a, b) => b.fatigue - a.fatigue), byDef = ops.slice().sort((a, b) => a.attrs.defense - b.attrs.defense);
    let sg = null;
    if (byFat[0].fatigue >= 0.12 && byFat[0].fatigue - byFat[1].fatigue >= 0.04) sg = ['exhaust', _('{name} is tired: wear them down', { name: nm(byFat[0]) })];
    else if (frac(hs.net) >= 0.6) sg = ['breakNet', _("They're glued to the net: lob over them")];
    else if (frac(hs.deep) >= 0.6) sg = ['net', _("They're sitting deep: take the net")];
    else if (byDef[1].attrs.defense - byDef[0].attrs.defense >= 10) sg = ['hunt', _('{name} defends worst: hunt them', { name: nm(byDef[0]) })];
    if (sg && sg[0] !== o.plan) showHint(sg);
  }
  // Keys: 1-5 mindset (fortress to all-in), Q W E R T Y the six plans in dock order, P shots, V middle balls, F go for it, O timeout (A, aim, lives in 19_ui.js). Each one presses the button it names.
  const PLAN_KEY = {}; PLAN_UI.forEach(q => { PLAN_KEY[q[3].toLowerCase()] = q[0]; });
  function hotkey(k, e) {
    const Q = mod('qte');
    if (G.mode !== 'play' || G.st !== 'playing' || G.scr || pauseEl || (Q && Q.open)) return false;
    const o = API.orders('A'), pressBtn = b => { if (b && !b.disabled) b.click(); };
    let b = null;
    if (PLAN_KEY[k]) b = hud.planBtns.find(x => x.dataset.plan === PLAN_KEY[k]);
    else if (k >= '1' && k <= '5' && k.length === 1) b = hud.steps[+k - 1];
    else if (k === 'p') b = hud.styleBtns[(STYLE_UI.findIndex(q => q[0] === (o.style || 'mix')) + 1) % STYLE_UI.length];
    else if (k === 'v') b = hud.midBtns[(MID_UI.findIndex(q => q[0] === (o.middlePriority === 0 || o.middlePriority === 1 ? String(o.middlePriority) : '')) + 1) % MID_UI.length];
    else if (k === 'f') { if (!e.repeat) goForIt(); return true; }
    else if (k === 'o') { if (!e.repeat) API.callTimeout(); updateHud(true); return true; }
    else return false;
    if (!e.repeat) pressBtn(b);
    return true;
  }
  function setMid(i) {
    const Ai = mod('ai'); if (!Ai || !Ai.setOrders) return;
    S.coachTeam = 'A'; API.claimCoach();
    safe(() => Ai.setOrders('A', { middlePriority: i }), 'mid');
    const P = mod('players'), who = P && P.list && i === 1 ? P.list.filter(p => p.team === 'A').sort((a, b) => a.slot - b.slot)[1] : null;
    API.toast(_('Middle balls: {who}', { who: i === undefined ? _('whoever is closer') : i === 0 ? _('you') : (who ? who.name.split(' ')[0] : 'Annetta') }), { kind: 'info', ms: 1800 });
    updateHud(true);
  }
  const U_clamp = v => Math.max(-2, Math.min(2, v));
  function badge(b, n) { const e = b.lastChild; e.textContent = n; e.hidden = !(n > 0); }
  function updateHud(force) {
    if (!hud.root || hud.root.hidden) return;
    const M = mod('match'), Rl = mod('rules'), o = API.orders('A');
    hud.pause.textContent = M && M.paused ? '▶' : '❚❚';
    hud.pause.title = M && M.paused ? _('Resume (Space)') : _('Pause (Space)');
    const R = mod('render'); const cc = CAM_CYCLE.find(c => c[0] === (R && R.cameraMode));
    hud.cam.title = _('Camera: {name}', { name: cc ? _(cc[1]) : (R && R.cameraMode) || '-' });
    refreshAudio();
    const mid = o.middlePriority === 0 || o.middlePriority === 1 ? String(o.middlePriority) : '', mi = U_clamp(o.mindset | 0), pl = o.plan || '', st = o.style || 'mix';
    const Qh = mod('qte'); if (Qh) { hud.go.setAttribute('aria-pressed', String(Qh.armed)); hud.go.disabled = Qh.mode === 'off'; }
    hud.steps.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === mi))); hud.mindLab.textContent = _(MIND[mi + 2]);
    hud.planBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plan === pl))); hud.planLab.textContent = pl ? _(PLAN_UI.find(q => q[0] === pl)[1]) : _('No plan');
    hud.styleBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.style === st)));
    hud.midBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mid === mid)));
    const tg = [mi ? _(MIND[mi + 2]) : '', pl ? _(PLAN_UI.find(q => q[0] === pl)[1]) + (hs.planN ? ' x' + hs.planN : '') : '', st !== 'mix' ? _(st) : '', mid !== '' ? _('middle: {who}', { who: mid === '0' ? _('you') : 'Annetta' }) : ''].filter(Boolean);
    hud.tag.hidden = !tg.length; if (tg.length) hud.tag.textContent = _('Your strategy: {list}', { list: tg.join(' · ') });
    if (Rl && Rl.state) {
      const st = Rl.state, tl = st.timeouts ? st.timeouts.A : 0;
      const canT = tl > 0 && M && M.phase === 'play' && !st.over;
      hud.tmo.disabled = !canT; badge(hud.tmo, tl);
    }
    // one skip button: a replay is skipped, otherwise the intro
    const rep = mod('replay'), replaying = !!(rep && rep.active);
    hud.skip.hidden = !(replaying || (G.st === 'playing' && M && PRE[M.phase]));
    const lab = replaying ? _('Skip replay ▸') : _('Skip intro ▸'); if (hud.skip.textContent !== lab) hud.skip.textContent = lab;
    void force;
  }
  // the dock grows (strategy sheet, hint, tag) and the commentary line wraps; everything stacked above them reads these two sizes from CSS
  let dockH = -1, tickH = -1;
  function dockMetrics() {
    const dh = hud.coach.hidden ? 12 : hud.coach.offsetHeight + 20, th = hud.ticker.hidden ? 0 : hud.ticker.offsetHeight + 6;
    if (dh !== dockH) { dockH = dh; EL.stage.style.setProperty('--dock-h', dh + 'px'); }
    if (th !== tickH) { tickH = th; EL.stage.style.setProperty('--tick-h', th + 'px'); }
  }
  function clearHighlights() {
    const A = mod('actors'), P = mod('players');
    if (A && A.highlight && P && P.list) P.list.forEach(p => safe(() => A.highlight(p.id, false), 'hl'));
    hlKey = '';
  }

  // ---------- per frame ----------
  function update(dt) {
    if (!hud.root) return;
    acc += dt;
    if (acc > 0.25) { acc = 0; dockMetrics(); updateHud(); hintTick(0.25); }
    if (hud.root.hidden || G.st !== 'playing') return;
    const P = mod('players'), A = mod('actors'), R = mod('render'), rp = mod('replay');
    if (!P || !P.list || !G.player) return;
    const me = P.byId[G.player.id], an = P.byId[AN];
    // highlight rings
    const key = (mod('match') && mod('match').cfg ? mod('match').cfg.seed : '') + ':' + P.list.map(p => p.id).join();
    if (key !== hlKey && A && A.highlight && A.rigOf && me && an && A.rigOf(me.id) && A.rigOf(an.id)) { A.highlight(me.id, true); A.highlight(an.id, true); hlKey = key; }
    const hidden = (rp && rp.active) || !R || !R.project || !R.THREE;
    hud.labels.hidden = !!hidden;
    if (hidden) return;
    place(hud.labYou, me, A, R); place(hud.labAn, an, A, R);
  }
  let tmpV = null;
  function place(el, p, A, R) {
    if (!p) { el.hidden = true; return; }
    if (!tmpV) tmpV = new R.THREE.Vector3();
    const rig = A && A.rigOf ? A.rigOf(p.id) : null;
    if (rig && rig.root) tmpV.set(rig.root.position.x, 3.05, rig.root.position.z); else tmpV.set(p.pos.x, 3.05, p.pos.z);
    const s = R.project(tmpV);
    if (!s || !s.visible) { el.hidden = true; return; }
    el.hidden = false; el.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%,-100%)';
  }

  // ---------- ticker + flags ----------
  function onFeed(it, entry) {
    if (!hud.ticker || entry.src === 'ui' || G.mode !== 'play' || (G.st !== 'playing' && G.st !== 'watch')) return;
    hud.ticker.textContent = it.text; hud.ticker.hidden = false; hud.ticker.classList.remove('fade'); void hud.ticker.offsetWidth;
    clearTimeout(tickerT); tickerT = setTimeout(() => { hud.ticker.classList.add('fade'); setTimeout(() => { if (hud.ticker.classList.contains('fade')) hud.ticker.hidden = true; }, 600); }, 5000);
  }
  function onFlags(e) {
    if (G.mode !== 'play' || G.st !== 'playing') return;
    const pick = e.matchPoint ? ['m', e.matchPoint] : e.setPoint ? ['s', e.setPoint] : e.breakPoint ? ['b', e.breakPoint] : null;
    if (!pick) return;
    const mine = pick[1] === 'A', txt = pick[0] + pick[1];
    if (txt === lastFlagToast) return; lastFlagToast = txt; setTimeout(() => { if (lastFlagToast === txt) lastFlagToast = ''; }, 8000);
    API.toast(pick[0] === 'm' ? (mine ? _('Match point for you!') : _('Match point for them. Hold on.')) : pick[0] === 's' ? (mine ? _('Set point for you!') : _('Set point for them. Hold on.')) : (mine ? _('Break point for you!') : _('Break point for them. Hold on.')), { kind: mine ? 'good' : 'warn', ms: 2800 });
  }

  // ---------- pause menu ----------
  function onEscape() {
    if (G.mode !== 'play') return;
    if (hud.pop && !hud.pop.hidden) { toggleMix(false); return; }
    if (pauseEl) { resumeFromPause(); return; }
    if (G.st === 'create' || G.st === 'setup') { showTitle(true); return; }
    if (G.st === 'playing' || G.st === 'watch') showPause();
  }
  function showPause() {
    if (mod('qte') && mod('qte').open) return;
    const rp = mod('replay'); if (rp && rp.active) { rp.stop(); return; }   // pause during a replay skips it
    const M = mod('match'); wasPaused = !!(M && M.paused); if (M && !wasPaused) M.pause(true);
    pauseEl = h('div', { class: 'gm-screen', id: 'gm-pause-menu' }, h('div', { class: 'gm-card small' },
      h('div', { class: 'tag' }, _('Paused')), h('h2', { class: 'gm-h sm' }, _('Take a breather')),
      audioBlock(), calloutRow(), qteRow(), speedRow(),
      h('div', { class: 'gm-acts' },
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-resume', onclick: resumeFromPause }, _('Resume')),
        G.st === 'playing' ? h('button', { class: 'btn big', type: 'button', id: 'gm-tutorial', onclick: () => { closePause(); const Tu = mod('tutorial'); if (Tu) Tu.start(); } }, _('Tutorial')) : null,
        G.st === 'playing' ? h('button', { class: 'btn big', type: 'button', id: 'gm-restart', onclick: () => { closePause(true); kickoff(); } }, _('Restart')) : null,
        h('button', { class: 'btn big', type: 'button', id: 'gm-totitle', onclick: () => { closePause(true); showTitle(); } }, _('Back to title')),
        h('button', { class: 'btn big', type: 'button', id: 'gm-tostudio', onclick: () => setMode('studio') }, _('Studio controls')))));
    EL.stage.appendChild(pauseEl); EL.stage.classList.add('gm-menu');
  }
  function resumeFromPause() { closePause(); }
  function closePause(keepPaused) {
    if (!pauseEl) return;
    pauseEl.remove(); pauseEl = null; EL.stage.classList.remove('gm-menu');
    const M = mod('match'); if (M && !wasPaused && !keepPaused) M.pause(false);
    updateHud(true);
  }

  // ---------- results ----------
  function results() {
    const Rl = mod('rules'), M = mod('match'), P = mod('players');
    const st = Rl && Rl.state; if (!st || !P || !G.player) return;
    closePause();
    const won = (st.winner || (M && M.result && M.result.winner)) === 'A';
    let sets = ''; try { sets = Rl.describe(st).setsText; } catch (e) { /* ignore */ }
    const mine = P.list.filter(p => p.team === 'A'), ms = M && M.stats;
    const sum = k => API.teamSum('A', k);
    const dist = mine.reduce((a, p) => a + p.stats.distance, 0) / 1000;
    const mvp = mine.map(p => ({ p: p, c: API.contribution(p) })).sort((a, b) => b.c - a.c)[0];
    const row = (l, v) => [h('span', { class: 'l' }, l), h('b', null, String(v))];
    const opp = P.list.filter(p => p.team === 'B').map(p => lastName(p.def)).join(' & ');
    setSt('results');
    openScreen('gm-results', [
      h('div', { class: 'tag' }, HPO.cfg.TITLE()),
      won ? stamp(_('Champions')) : stamp(_('Good fight')),
      h('h2', { class: 'gm-h' }, won ? rich(_('You & {em} take the cup'), 'Annetta') : _('So close. Rematch?')),
      h('div', { class: 'gm-score' }, sets || '–', h('small', null, _(' vs {opp}', { opp: opp }))),
      h('div', { class: 'gm-ks' }, row(_('Winners'), sum('winners')), row(_('Aces'), sum('aces')), row(_('Longest rally'), ms ? (ms.longest || 0) : 0), row(_('Distance'), dist.toFixed(2) + ' km'), row(_('Points won'), ms ? ms.teams.A.pointsWon : '-')),
      mvp ? h('div', { class: 'mvp' }, h('b', null, _('MVP: ')), mvp.p.name, _(' · {w} winners, {u} unforced', { w: mvp.p.stats.winners, u: mvp.p.stats.unforced })) : null,
      h('div', { class: 'gm-acts' },
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-again', onclick: kickoff }, _('Play again')),
        h('button', { class: 'btn big', type: 'button', id: 'gm-chsetup', onclick: () => showSetup() }, _('Change setup')),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn', type: 'button', id: 'gm-rnew', onclick: () => showCreate() }, _('New player')),
          h('button', { class: 'btn', type: 'button', id: 'gm-rtitle', onclick: () => showTitle() }, _('Back to title'))))
    ], 'results');
  }
})(HPO);
