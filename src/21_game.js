// Play mode: title screen, create-player, quick setup, in-match HUD + coach box, pause menu, results. Studio mode = the full control panel (19_ui.js).
// Presentation only; talks to the sim through the same public APIs as the panel (match.start via ui.newMatch, ai.setOrders, rules.challenge ...).
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS;
  const mod = n => HPO.mod[n];
  let API = null, S = null, EL = null, h = null, add = null, safe = null;
  const AN = 'p5'; // Annetta Arslan
  const NATIONS = [['IDN', 'Indonesia'], ['ESP', 'Spain'], ['ARG', 'Argentina'], ['NED', 'Netherlands'], ['JPN', 'Japan'], ['SWE', 'Sweden'], ['ITA', 'Italy'], ['BRA', 'Brazil'], ['FRA', 'France'], ['GER', 'Germany'], ['POR', 'Portugal'], ['CHI', 'Chile'], ['AUS', 'Australia'], ['GBR', 'United Kingdom']];
  const PRESETS = [['balanced', 'Balanced'], ['aggressive', 'Attack'], ['safe', 'Safe'], ['controlNet', 'Net'], ['defensive', 'Lobs'], ['moreSmashes', 'Smash']];
  const COURTS = [['classicBlue', 'Classic Blue'], ['terracotta', 'Terracotta'], ['fastBlue', 'Fast Blue'], ['indoor', 'Indoor']];
  const CAM_CYCLE = [['close', 'Close-up'], ['follow', 'TV follow'], ['club', 'Whole club'], ['top', 'Top-down']];
  // the whole club is too small to read on a phone, so phones default to the TV follow camera
  const defCam = () => (HPO.cfg.mobile ? 'follow' : 'club');
  const SVG = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const SND_ON = '<svg ' + SVG + '><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const SND_OFF = '<svg ' + SVG + '><path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';
  const CHEV = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';
  const PRE = { intro: 1, walkon: 1, introductions: 1, toss: 1, warmup: 1 };
  const NATION_NAME = {}; NATIONS.forEach(n => { NATION_NAME[n[0]] = n[1]; });

  const G = HPO.mod.game = {
    mode: 'play', st: 'boot', scr: null, player: null, opp: null,
    cfg: { format: 'quick', scoring: 'golden', venue: 'classicBlue', tod: 'day' },
    init: init, update: update, onFeed: onFeed, onEscape: onEscape, blocking: blocking, active: active, results: results,
    showTitle: showTitle, showCreate: showCreate, showSetup: showSetup, setMode: setMode, onSaved: onSaved, suppressResults: suppressResults
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
  function segBtns(opts, get, set, cls) {
    const root = h('div', { class: 'seg gm-seg ' + (cls || '') });
    const btns = opts.map(o => { const b = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => { set(o[0]); paint(); } }, o[1]); b.dataset.v = String(o[0]); root.appendChild(b); return b; });
    function paint() { const v = String(get()); btns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false')); }
    paint(); return { root: root, paint: paint, btns: btns };
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
  function stamp(t) { return h('span', { class: 'sticker gm-stk' }, t); }
  function setSt(s) { G.st = s; EL.app.setAttribute('data-gm', s); updateVisibility(); }

  // ---------- init ----------
  function init(ctx, api) {
    API = api; S = api.S; EL = api.EL; h = api.h; add = api.add; safe = api.safe;
    EL.app = document.getElementById('app') || document.body;
    buildHud();
    const modeBtn = document.getElementById('btn-mode');
    if (modeBtn) modeBtn.addEventListener('click', () => setMode(G.mode === 'play' ? 'studio' : 'play'));
    BUS.on('match:new', function () { hlKey = ''; if (G.st === 'title' || G.st === 'create' || G.st === 'setup') return; });
    BUS.on('match:phase', function (e) { if (e.phase === 'results' && (G.st === 'title' || G.st === 'create' || G.st === 'setup' || G.st === 'watch')) { clearTimeout(attractT); attractT = setTimeout(() => { if (G.st === 'title' || G.st === 'create' || G.st === 'setup') startAttract(); }, 5000); } });
    BUS.on('flag:update', onFlags);
    // the intro/ceremony camera sweeps change the view: when play starts, go back to the camera the player picked
    BUS.on('match:phase', function (e) { if (e.phase === 'play' && G.st === 'playing' && G.camPref) safe(() => { API.setCam(G.camPref); const R = mod('render'); if (R && R.setFollowBall && G.camPref === 'follow') R.setFollowBall(true); }, 'camPref'); });
    const q = HPO.query;
    const m = q && q.get('mode');
    if (m === 'studio') { G.mode = 'studio'; applyModeClass(); setSt('studio'); }
    else if (q && q.get('title') === '0') { G.mode = 'play'; applyModeClass(); startWatch(true); }
    else { G.mode = 'play'; applyModeClass(); showTitle(true); }
  }
  function applyModeClass() {
    EL.app.classList.toggle('mode-play', G.mode === 'play'); EL.app.classList.toggle('mode-studio', G.mode === 'studio');
    const b = document.getElementById('btn-mode'); if (b) b.textContent = G.mode === 'play' ? '⚙︎ Studio' : '▶ Play mode';
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
      h('div', { class: 'gm-top' }, an ? portrait(an, 'gm-portrait sm') : null, h('div', null, h('div', { class: 'tag' }, HPO.cfg.TITLE()), stamp('Doubles · Jakarta'))),
      h('h2', { class: 'gm-h' }, 'Play doubles with ', h('em', null, 'Annetta')),
      h('p', { class: 'gm-p' }, 'Make your player, team up, win the Littleworld Jakarta Padel Cup.'),
      h('div', { class: 'gm-acts' },
        saved
          ? [h('button', { class: 'btn primary big', type: 'button', id: 'gm-continue', onclick: () => { G.player = saved; showSetup(); } }, 'Continue as ' + saved.name),
             h('button', { class: 'btn big', type: 'button', id: 'gm-newplayer', onclick: () => showCreate() }, 'New player')]
          : h('button', { class: 'btn primary big', type: 'button', id: 'gm-play', onclick: () => showCreate() }, 'Play with Annetta'),
        h('button', { class: 'btn big', type: 'button', id: 'gm-watch', onclick: startWatch }, 'Just watch')),
      h('p', { class: 'gm-foot' }, h('a', { href: '#', id: 'gm-studio-link', onclick: e => { e.preventDefault(); setMode('studio'); } }, 'Studio controls'), ' · ',
        h('a', { href: 'https://annetta.dev/' }, '← annetta.dev')),
      h('p', { class: 'gm-foot it' }, 'Made in Jakarta with code, curiosity, and no spare towel.')
    ];
    openScreen('gm-title', kids, 'title');
  }

  // ---------- create player ----------
  function previewDef() {
    const P = mod('players'); if (!P) return null;
    const ros = P.roster(), id = 'custom-' + cp.seed.toString(16), had = ros.some(r => r.id === id);
    let d = null;
    try { d = P.createCustom({ name: cp.name.trim() || 'Your name', gender: cp.gender, seed: cp.seed }); } catch (e) { return null; }
    if (!had) { const i = ros.indexOf(d); if (i >= 0) ros.splice(i, 1); }
    return Object.assign({}, d, { name: cp.name.trim() || 'Your name', country: { code: cp.nat, name: NATION_NAME[cp.nat] || cp.nat } });
  }
  function showCreate() {
    closePause(); clearHighlights();
    if (G.st !== 'create') { cp = { seed: rnd(), name: '', gender: 'F', nat: 'IDN' }; }
    setSt('create');
    const name = h('input', { type: 'text', id: 'gm-name', maxlength: '40', placeholder: 'Your name', autocomplete: 'nickname', 'aria-label': 'Your name', value: cp.name });
    const genderSeg = segBtns([['F', 'Woman'], ['M', 'Man']], () => cp.gender, v => { cp.gender = v; render(); });
    const nat = h('select', { id: 'gm-nat', 'aria-label': 'Nationality' }, NATIONS.map(n => h('option', { value: n[0] }, n[1])));
    nat.value = cp.nat;
    const portraitBox = h('div', { class: 'gm-pbox' });
    const nameLine = h('div', { class: 'gm-nm' }), archLine = h('div', { class: 'gm-meta' });
    const bars = h('div', { class: 'gm-bars' });
    const typeLine = h('p', { class: 'hint', id: 'gm-typeline' });
    const status = h('p', { class: 'hint gm-err', role: 'status', id: 'gm-cstatus' }, '');
    const an = pdef(AN);
    const partner = h('div', { class: 'gm-partner' }, an ? portrait(an, 'gm-portrait xs') : null,
      h('div', null, h('div', { class: 'tag' }, 'Your partner'), h('div', { class: 'gm-nm sm' }, an ? an.name : 'Annetta Arslan'),
        h('div', { class: 'gm-meta' }, (an ? API.ARCH[an.archetype] : '') + ' · World #' + (an ? an.ranking : '-') + ' ', an ? flag(an) : null)));
    function render() {
      const d = previewDef(); if (!d) return;
      portraitBox.textContent = ''; portraitBox.appendChild(portrait(d, 'gm-portrait lg'));
      nameLine.textContent = ''; add(nameLine, [d.name, ' ', flag(d)]);
      archLine.textContent = (API.ARCH[d.archetype] || d.archetype) + ' · ' + (d.hand === 'L' ? 'left' : 'right') + '-handed';
      bars.textContent = ''; API.ATTRS.forEach(a => bars.appendChild(API.mbar(a[1], d.attrs[a[0]], '')));
      typeLine.textContent = cp.gender === 'F' ? "You and Annetta play women's doubles." : 'You and Annetta play mixed doubles.';
      genderSeg.paint();
    }
    name.addEventListener('input', () => { cp.name = name.value; nameLine.firstChild && (nameLine.firstChild.textContent = cp.name.trim() || 'Your name'); });
    nat.addEventListener('change', () => { cp.nat = nat.value; render(); });
    const shuffle = h('button', { class: 'btn', type: 'button', id: 'gm-shuffle', onclick: () => { cp.seed = rnd(); render(); } }, 'Shuffle look & stats');
    const save = h('button', { class: 'btn primary big', type: 'button', id: 'gm-save', onclick: async () => {
      const nm = name.value.trim();
      if (!nm) { status.textContent = 'Give your player a name first.'; name.focus(); name.classList.remove('shake'); void name.offsetWidth; name.classList.add('shake'); return; }
      save.disabled = true;
      try {
        const P = mod('players');
        const def = P.createCustom({ name: nm, gender: cp.gender, seed: cp.seed });
        def.country = { code: cp.nat, name: NATION_NAME[cp.nat] || cp.nat };
        const ok = await API.savePlayerDef(def);
        S.saved = (S.saved || []).filter(x => x.id !== def.id); S.saved.push(def);
        G.player = def;
        API.toast(ok ? def.name + ' saved on this device.' : 'Playing as ' + def.name + '. Local saving is unavailable here.', { kind: ok ? 'good' : 'warn' });
        showSetup();
      } catch (err) { status.textContent = err && err.message ? err.message : 'Could not create that player.'; save.disabled = false; }
    } }, 'Save & continue');
    const card = openScreen('gm-create', [
      h('div', { class: 'tag' }, '01 / Your player'),
      h('h2', { class: 'gm-h sm' }, 'Make your player'),
      h('div', { class: 'gm-prev' }, portraitBox, h('div', { class: 'gm-prevtxt' }, nameLine, archLine, shuffle)),
      h('div', { class: 'field' }, h('label', { for: 'gm-name', class: 'lbl' }, 'Name'), name),
      h('div', { class: 'grid2' }, h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'You are'), genderSeg.root), h('div', { class: 'field' }, h('label', { for: 'gm-nat', class: 'lbl' }, 'Nationality'), nat)),
      typeLine,
      bars,
      partner,
      status,
      h('div', { class: 'gm-acts row' }, h('button', { class: 'btn big', type: 'button', id: 'gm-cback', onclick: () => showTitle(true) }, 'Back'), save)
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
    const fmt = segBtns([['quick', 'Quick'], ['oneSet', 'One set'], ['bo3', 'Best of 3']], () => C.format, v => { C.format = v; });
    const sco = segBtns([['golden', 'Golden Point'], ['advantage', 'Advantage']], () => C.scoring, v => { C.scoring = v; });
    const tod = segBtns([['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], () => C.tod, v => { C.tod = v; });
    const courts = h('div', { class: 'gm-courts' });
    const cbtns = COURTS.map(c => { const b = h('button', { type: 'button', 'aria-pressed': 'false', 'data-v': c[0], onclick: () => { C.venue = c[0]; paintCourts(); } }, h('span', { class: 'ct ct-' + c[0] }, h('i')), h('b', null, c[1])); courts.appendChild(b); return b; });
    function paintCourts() { cbtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.v === C.venue ? 'true' : 'false')); tod.btns.forEach(b => { b.disabled = C.venue === 'indoor'; }); todHint.hidden = C.venue !== 'indoor'; }
    const todHint = h('p', { class: 'hint', hidden: true }, 'Indoor courts always use hall lighting.');
    const oppBox = h('div', { class: 'gm-opp' });
    function paintOpp() {
      oppBox.textContent = '';
      G.opp.forEach(id => { const d = pdef(id); oppBox.appendChild(h('div', { class: 'gm-oppp' }, flag(d), h('span', null, d ? d.name : id))); });
    }
    const me = G.player, an = pdef(AN);
    const kids = [
      h('div', { class: 'tag' }, '02 / Quick match'),
      h('h2', { class: 'gm-h sm' }, 'Set up the match'),
      h('div', { class: 'gm-team' }, h('span', { class: 'dot' }), h('b', null, me.name), flag(me), ' & ', h('b', null, an ? an.name : 'Annetta'), an ? flag(an) : null,
        h('span', { class: 'chip' }, type === 'W' ? "Women's doubles" : 'Mixed doubles')),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Format'), fmt.root),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Scoring'), sco.root),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Court'), courts),
      h('div', { class: 'field' }, h('div', { class: 'lbl' }, 'Time'), tod.root, todHint),
      h('div', { class: 'field' }, h('div', { class: 'lbl rowline' }, h('span', null, 'Opponents · random pair'), h('button', { class: 'btn small', type: 'button', id: 'gm-oppshuffle', onclick: () => { G.opp = randomOpp(type, G.opp); paintOpp(); } }, 'Shuffle')), oppBox),
      h('div', { class: 'gm-acts row' }, h('button', { class: 'btn big', type: 'button', id: 'gm-sback', onclick: () => showTitle(true) }, 'Back'),
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-kick', onclick: kickoff }, 'Kick off'))
    ];
    openScreen('gm-setup', kids, 'setup');
    paintCourts(); paintOpp();
  }

  // ---------- kick off ----------
  function kickoff() {
    const me = G.player; if (!me) return showCreate();
    closeScreen(); closePause(); clearTimeout(attractT);
    const C = G.cfg;
    S.type = myType(); S.teamA = [me.id, AN]; S.teamB = (G.opp || randomOpp(S.type)).slice();
    S.format = C.format; S.scoring = C.scoring; S.venue = C.venue; S.tod = C.tod; S.seed = '';
    S.coachTeam = 'A'; S.coachClaimed = true; S.speed = 1;
    const Ai = mod('ai');
    ['A', 'B'].forEach(t => safe(() => { if (Ai && Ai.setOrders) Ai.setOrders(t, { preset: 'balanced', serveDir: 'auto', returnDir: 'auto', middlePriority: undefined, focusOpponent: undefined, aimPoint: undefined }); }, 'orders'));
    setSt('playing'); hlKey = '';
    API.newMatch();
    const M = mod('match'); if (M) M.coachTeam = 'A';
    G.camPref = HPO.cfg.mobile ? 'follow' : 'close'; API.setCam(G.camPref);
    updateHud(true);
  }

  // ---------- HUD ----------
  function btn(id, cls, label, title, fn) { const b = h('button', { class: 'gm-ib ' + cls, type: 'button', id: id, title: title, 'aria-label': title, onclick: fn }, label); return b; }
  function buildHud() {
    hud.root = h('div', { id: 'gm-hud' });
    // top-right icons
    hud.pause = btn('gm-pause', '', '❚❚', 'Pause (Space)', () => { API.togglePause(); updateHud(true); });
    hud.speed = btn('gm-speed', 'txt', '1×', 'Speed', () => { const nx = { 1: 2, 2: 4, 4: 1 }[S.speed] || 1; API.setSpeed(nx); updateHud(true); });
    hud.cam = btn('gm-cam', 'txt sm', 'CAM', 'Camera', () => { const R = mod('render'); let i = CAM_CYCLE.findIndex(c => c[0] === (R && R.cameraMode)); i = (i + 1) % CAM_CYCLE.length; API.setCam(CAM_CYCLE[i][0]); G.camPref = CAM_CYCLE[i][0]; API.toast('Camera: ' + CAM_CYCLE[i][1], { ms: 1400 }); updateHud(true); });
    hud.sound = btn('gm-sound', 'snd', '', 'Sound on / off (S)', () => { API.setSound(!S.soundOn); updateHud(true); }); hud.sound.innerHTML = SND_OFF;
    hud.studio = btn('gm-studio', '', '⚙︎', 'Studio controls', () => setMode('studio'));
    hud.icons = h('div', { class: 'gm-icons' }, hud.pause, hud.speed, hud.cam, hud.sound, hud.studio);
    // coach bar
    // dropdowns instead of a chip row: the picker costs one line of height on a phone
    hud.tactic = h('select', { class: 'gm-select', id: 'gm-tactic', 'aria-label': 'Coach tactic', onchange: () => { const p = PRESETS.find(x => x[0] === hud.tactic.value); if (p) setPreset(p[0], p[1]); } },
      PRESETS.map(p => h('option', { value: p[0] }, p[1])));
    hud.middle = h('select', { class: 'gm-select', id: 'gm-middle', 'aria-label': 'Who takes the middle balls', onchange: () => setMid(hud.middle.value === '' ? undefined : +hud.middle.value) },
      h('option', { value: '' }, 'Auto'), h('option', { value: '0' }, 'You'), h('option', { value: '1' }, 'Annetta'));
    hud.tmo = h('button', { type: 'button', class: 'gm-act', id: 'gm-timeout', onclick: () => { API.callTimeout(); updateHud(true); } }, 'Timeout');
    hud.chal = h('button', { type: 'button', class: 'gm-act', id: 'gm-challenge', onclick: () => { API.doChallenge(); updateHud(true); } }, 'Challenge');
    hud.coach = h('div', { class: 'gm-coach' },
      h('div', { class: 'gm-coachrow' },
        h('label', { class: 'gm-pick', for: 'gm-tactic' }, h('span', null, 'Coach'), hud.tactic),
        h('label', { class: 'gm-pick mid', for: 'gm-middle' }, h('span', null, 'Middle ball'), hud.middle),
        h('div', { class: 'gm-acts2' }, hud.tmo, hud.chal)));
    hud.ticker = h('div', { class: 'gm-ticker', hidden: true });
    hud.skip = h('button', { type: 'button', class: 'btn small gm-skip', id: 'gm-skip', onclick: () => { API.skipCeremony(); } }, 'Skip intro ▸');
    hud.watchBar = h('div', { class: 'gm-watchbar' }, h('button', { type: 'button', class: 'btn primary', id: 'gm-watch-play', onclick: () => showCreateOrSetup() }, 'Play with Annetta'));
    hud.labels = h('div', { class: 'gm-labels' });
    hud.labYou = h('div', { class: 'gm-lab you' }, 'YOU'); hud.labAn = h('div', { class: 'gm-lab an' }, 'ANNETTA');
    hud.labels.append(hud.labYou, hud.labAn);
    // chevron tab on the left edge: slides the match centre (scoreboard) out of the way and back
    hud.sbTab = h('button', { type: 'button', class: 'gm-sbtab', id: 'gm-sbtab', 'aria-expanded': 'true', 'aria-label': 'Hide match centre', title: 'Match centre', onclick: () => toggleSb() });
    hud.sbTab.innerHTML = CHEV;
    hud.root.append(hud.labels, hud.sbTab, hud.icons, hud.skip, hud.ticker, hud.coach, hud.watchBar);
    EL.stage.appendChild(hud.root);
    hud.root.hidden = true;
  }
  function toggleSb(force) {
    G.sbOff = force === undefined ? !G.sbOff : !!force;
    EL.app.classList.toggle('gm-sb-off', G.sbOff);
    hud.sbTab.setAttribute('aria-expanded', G.sbOff ? 'false' : 'true');
    hud.sbTab.setAttribute('aria-label', G.sbOff ? 'Show match centre' : 'Hide match centre');
  }
  function showCreateOrSetup() { const s = S.saved && S.saved.length; if (s) { G.player = G.player || S.saved[S.saved.length - 1]; showSetup(); } else showCreate(); }
  function updateVisibility() {
    if (!hud.root) return;
    const show = G.mode === 'play' && (G.st === 'playing' || G.st === 'watch') && !G.scr;
    hud.root.hidden = !show;
    EL.app.classList.toggle('gm-hud-on', show);
    hud.coach.hidden = G.st !== 'playing'; hud.watchBar.hidden = G.st !== 'watch';
    if (show) updateHud(true);
  }
  function setPreset(key, label) {
    const Ai = mod('ai'); if (!Ai || !Ai.setOrders) return;
    if (Ai.PRESETS && !Ai.PRESETS[key]) return;
    S.coachTeam = 'A'; API.claimCoach();
    safe(() => Ai.setOrders('A', { preset: key, focusOpponent: undefined }), 'preset');
    API.toast('Coach: ' + label, { kind: 'info', ms: 1800 });
    updateHud(true);
  }
  function setMid(i) {
    const Ai = mod('ai'); if (!Ai || !Ai.setOrders) return;
    S.coachTeam = 'A'; API.claimCoach();
    safe(() => Ai.setOrders('A', { middlePriority: i }), 'mid');
    const P = mod('players'), who = P && P.list && i === 1 ? P.list.filter(p => p.team === 'A').sort((a, b) => a.slot - b.slot)[1] : null;
    API.toast('Middle balls: ' + (i === undefined ? 'whoever is closer' : i === 0 ? 'you' : (who ? who.name.split(' ')[0] : 'Annetta')), { kind: 'info', ms: 1800 });
    updateHud(true);
  }
  function updateHud(force) {
    if (!hud.root || hud.root.hidden) return;
    const M = mod('match'), Rl = mod('rules'), o = API.orders('A');
    hud.pause.textContent = M && M.paused ? '▶' : '❚❚';
    hud.pause.title = M && M.paused ? 'Resume (Space)' : 'Pause (Space)';
    hud.speed.textContent = (M ? M.speed : S.speed) + '×';
    const R = mod('render'); const cc = CAM_CYCLE.find(c => c[0] === (R && R.cameraMode));
    hud.cam.title = 'Camera: ' + (cc ? cc[1] : (R && R.cameraMode) || '-');
    const sndOff = !S.soundOn || S.muted; hud.sound.classList.toggle('off', sndOff);
    if (hud._snd !== sndOff) { hud._snd = sndOff; hud.sound.innerHTML = sndOff ? SND_OFF : SND_ON; }
    hud.sound.title = S.soundOn && !S.muted ? 'Sound on (S)' : 'Sound off (S)';
    const cur = o.preset || 'balanced', mid = o.middlePriority === 0 || o.middlePriority === 1 ? String(o.middlePriority) : '';
    if (document.activeElement !== hud.tactic && hud.tactic.value !== cur) hud.tactic.value = cur;
    if (document.activeElement !== hud.middle && hud.middle.value !== mid) hud.middle.value = mid;
    if (Rl && Rl.state) {
      const st = Rl.state, tl = st.timeouts ? st.timeouts.A : 0, cl = st.challenges ? st.challenges.A : 0;
      const canT = tl > 0 && M && M.phase === 'play' && !st.over;
      hud.tmo.textContent = 'Timeout · ' + tl; hud.tmo.disabled = !canT;
      const canC = Rl.canChallenge ? Rl.canChallenge('A', 0) : false;
      hud.chal.textContent = 'Challenge · ' + cl; hud.chal.disabled = !canC; hud.chal.classList.toggle('ready', canC);
    }
    hud.skip.hidden = !(G.st === 'playing' && M && PRE[M.phase]);
    void force;
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
    if (acc > 0.25) { acc = 0; updateHud(); }
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
    if (rig && rig.root) tmpV.set(rig.root.position.x, 2.35, rig.root.position.z); else tmpV.set(p.pos.x, 2.35, p.pos.z);
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
    const pick = e.matchPoint ? ['Match point', e.matchPoint] : e.setPoint ? ['Set point', e.setPoint] : e.breakPoint ? ['Break point', e.breakPoint] : null;
    if (!pick) return;
    const txt = pick[0] + (pick[1] === 'A' ? ' for you' : ' for them');
    if (txt === lastFlagToast) return; lastFlagToast = txt; setTimeout(() => { if (lastFlagToast === txt) lastFlagToast = ''; }, 8000);
    API.toast(txt + (pick[1] === 'A' ? '!' : '. Hold on.'), { kind: pick[1] === 'A' ? 'good' : 'warn', ms: 2800 });
  }

  // ---------- pause menu ----------
  function onEscape() {
    if (G.mode !== 'play') return;
    if (pauseEl) { resumeFromPause(); return; }
    if (G.st === 'create' || G.st === 'setup') { showTitle(true); return; }
    if (G.st === 'playing' || G.st === 'watch') showPause();
  }
  function showPause() {
    const M = mod('match'); wasPaused = !!(M && M.paused); if (M && !wasPaused) M.pause(true);
    pauseEl = h('div', { class: 'gm-screen', id: 'gm-pause-menu' }, h('div', { class: 'gm-card small' },
      h('div', { class: 'tag' }, 'Paused'), h('h2', { class: 'gm-h sm' }, 'Take a breather'),
      h('div', { class: 'gm-acts' },
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-resume', onclick: resumeFromPause }, 'Resume'),
        G.st === 'playing' ? h('button', { class: 'btn big', type: 'button', id: 'gm-restart', onclick: () => { closePause(true); kickoff(); } }, 'Restart') : null,
        h('button', { class: 'btn big', type: 'button', id: 'gm-totitle', onclick: () => { closePause(true); showTitle(); } }, 'Back to title'),
        h('button', { class: 'btn big', type: 'button', id: 'gm-tostudio', onclick: () => setMode('studio') }, 'Studio controls'))));
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
      won ? stamp('Champions') : stamp('Good fight'),
      h('h2', { class: 'gm-h' }, won ? ['You & ', h('em', null, 'Annetta'), ' take the cup'] : 'So close. Rematch?'),
      h('div', { class: 'gm-score' }, sets || '–', h('small', null, ' vs ' + opp)),
      h('div', { class: 'gm-ks' }, row('Winners', sum('winners')), row('Aces', sum('aces')), row('Longest rally', ms ? (ms.longest || 0) : 0), row('Distance', dist.toFixed(2) + ' km'), row('Points won', ms ? ms.teams.A.pointsWon : '-')),
      mvp ? h('div', { class: 'mvp' }, h('b', null, 'MVP: '), mvp.p.name, ' · ' + mvp.p.stats.winners + ' winners, ' + mvp.p.stats.unforced + ' unforced') : null,
      h('div', { class: 'gm-acts' },
        h('button', { class: 'btn primary big', type: 'button', id: 'gm-again', onclick: kickoff }, 'Play again'),
        h('button', { class: 'btn big', type: 'button', id: 'gm-chsetup', onclick: () => showSetup() }, 'Change setup'),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn', type: 'button', id: 'gm-rnew', onclick: () => showCreate() }, 'New player'),
          h('button', { class: 'btn', type: 'button', id: 'gm-rtitle', onclick: () => showTitle() }, 'Back to title')))
    ], 'results');
  }
})(HPO);
