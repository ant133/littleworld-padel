// Game instructions: the top-right ? button. One scrollable sheet with how to play, what each player stat means, what the energy and concentration bars
// show and what each mood face does, plus a button for the tutorial and one for the keyboard shortcuts (their own top-bar button). Presentation only.
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, _ = HPO.t, mod = n => HPO.mod[n];
  const Gd = HPO.mod.guide = { el: null, open: open, close: close, toggle: toggle, isOpen: () => !!Gd.el };
  let wasPaused = true;

  // [tag shown on the player cards, name, meaning]
  const STATS = [
    ['PWR', 'Power', 'How hard the ball is hit.'],
    ['ACC', 'Accuracy', 'How close shots land to where they were aimed. Low accuracy means wider misses.'],
    ['REF', 'Reflexes', 'How quickly a player reads the ball and reacts.'],
    ['COV', 'Coverage', 'Running speed and how much of the court they reach.'],
    ['STA', 'Stamina', 'How slowly energy drains.'],
    ['NET', 'Net', 'Calm, sharp volleys and smashes near the net.'],
    ['DEF', 'Defense', 'Digging out hard balls, lobs and resets.'],
    ['WAL', 'Wall read', 'Judging how the ball comes off the glass.'],
    ['TAC', 'Tactics', 'Shot choice and aim, and a cool head: fewer mood swings.']
  ];
  // [what sets it off, what it does]
  const MOOD = {
    angry_partner: ['Their partner keeps making errors.', "Grabs balls, even the partner's. Both may go for the same one."],
    self_blame: ['They keep making errors themselves.', 'Plays safe and leaves balls to the partner. Both may leave one.'],
    fired_up: ['A big winner (smash or ace) or three points in a row.', 'Hits harder and runs faster, but burns energy.'],
    cocky: ['They are well ahead.', 'Tries drop shots and slips on easy balls.'],
    nervous: ['Break, set or match point.', 'Shaky serve, safer shots, slower to react.'],
    flow: ['Several clean points in a row, with energy to spare.', 'Sharper and quicker to react.'],
    defeated: ['They are far behind, late in the match.', 'Slower and gives up on far balls, but spends less energy.'],
    vengeful: ['They were beaten by a smash or an ace.', 'Aims at whoever hurt them, which makes them easier to read.'],
    supportive: ['Their partner erred and they stay calm.', 'Calms the partner and avoids mix-ups.'],
    irritated: ['A close line call went against them.', 'Hits harder and wilder for a moment.']
  };

  function build(api) {
    const h = api.h, M = mod('mind'), G = mod('game'), X = mod('moodui');
    const sec = (title, kids) => h('section', { class: 'gd-sec' }, h('h3', null, _(title)), kids);
    const how = (G && G.how ? G.how : []).map(s => h('div', { class: 'gd-how' }, h('b', null, _(s[0])), h('p', null, typeof s[1] === 'function' ? s[1]() : _(s[1]))));
    const stats = h('dl', { class: 'gd-stats' }, STATS.map(s => [h('dt', null, s[0]), h('dd', null, h('b', null, _(s[1])), ' · ' + _(s[2]))]));
    const moods = Object.keys(M.MOODS).map(id => {
      const d = M.MOODS[id], ico = h('span', { class: 'gd-ico', 'data-tone': d.tone });
      if (X && X.art) ico.style.setProperty('--spr', 'url(' + X.art(id) + ')');
      const tags = h('div', { class: 'mu-tags' }, M.effects(id).map(s => h('span', { class: s.dir > 0 ? 'up' : 'dn' }, s.tag + ' ' + (s.dir > 0 ? '▲' : '▼').repeat(s.n))));
      return h('div', { class: 'gd-mood' }, ico, h('div', null, h('b', null, M.label(id)), h('p', null, _(MOOD[id][1]) + ' ', h('i', null, _('When: {why}', { why: _(MOOD[id][0]).replace(/\.$/, '') }))), tags));
    });
    const tut = () => h('button', { class: 'btn primary gd-tut', type: 'button', onclick: watchTutorial }, _('Watch the tutorial'));
    const keys = () => h('button', { class: 'btn', type: 'button', onclick: () => { close(); const U = mod('ui'); if (U && U.api && U.api.showKeys) U.api.showKeys(); } }, _('Keyboard shortcuts'));
    const bye = () => h('button', { class: 'btn', type: 'button', onclick: () => close() }, _('Close'));
    return h('div', { class: 'modal gd', id: 'gd', role: 'dialog', 'aria-label': _('Game instructions'), onclick: e => { if (e.target === Gd.el) close(); } },
      h('div', { class: 'card sheet guide' },
        h('div', { class: 'tag' }, _('Game instructions')), h('h2', null, _('How it all works')),
        h('div', { class: 'acts' }, tut(), keys(), bye()),
        sec('How to play', how),
        sec('Player stats', [h('p', null, _('Every player has nine stats, from about 40 to 95. They show on the player cards in the match centre.')), stats]),
        sec('Energy and concentration', [
          h('p', null, h('b', null, _('Energy')), ' · ' + _('The bar over each player. It only goes down: running and hard shots cost it, and nothing gives it back. A tired player is slower, less accurate, and smashes less.')),
          h('p', null, h('b', null, _('Concentration')), ' · ' + _('The thin bar under it. It goes up with points won and down with errors, losing runs and big points. A timeout or a changeover settles it. Tired players cannot concentrate fully.'))]),
        sec('Moods', [h('p', null, _('A mood is a timed boost or setback next to the bars. The ring around the face is its timer: it empties, and flashes just before the mood ends. Green tags are stats that go up, red ones go down.')), h('div', { class: 'gd-moods' }, moods)]),
        h('div', { class: 'acts' }, tut(), bye())));
  }

  function watchTutorial() {
    const g = mod('game'), Tu = mod('tutorial'), api = mod('ui') && mod('ui').api;
    close(true);
    if (!g || !Tu) return;
    if (g.mode === 'play' && g.st === 'playing') { setTimeout(() => Tu.start(), 150); return; }
    g.tutorialPending = true;   // the next match starts with it (21_game.js)
    if (api) api.toast(g.mode === 'play' ? _('The tutorial starts with your next match.') : _('The tutorial runs in Play mode: switch to Play and start a match.'), { kind: 'info', ms: 3600 });
  }

  function open() {
    const api = mod('ui') && mod('ui').api; if (!api || Gd.el) return;
    const M = mod('match'); wasPaused = !!(M && M.paused); if (M && !wasPaused && M.pause) M.pause(true);
    Gd.el = build(api);
    // the tutorial button only means something when there is a match to run it in, or one to come
    Gd.el.querySelectorAll('.gd-tut').forEach(b => { b.hidden = !!(mod('game') && mod('game').mode !== 'play'); });
    api.EL.stage.appendChild(Gd.el);
    const card = Gd.el.querySelector('.guide'); if (card) card.scrollTop = 0;
    const hb = document.getElementById('btn-help'); if (hb) hb.setAttribute('aria-expanded', 'true');
  }
  function close(keepPaused) {
    if (!Gd.el) return;
    Gd.el.remove(); Gd.el = null;
    const M = mod('match'); if (M && !wasPaused && !keepPaused && M.pause) M.pause(false);
    const hb = document.getElementById('btn-help'); if (hb) hb.setAttribute('aria-expanded', 'false');
  }
  function toggle() { if (Gd.el) close(); else open(); }

  // while the sheet is open no shortcut may reach the game; Esc and ? close it
  document.addEventListener('keydown', function (e) {
    if (!Gd.el) return;
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); close(); }
    if (!e.ctrlKey && !e.metaKey && e.key !== 'Tab') e.stopImmediatePropagation();
  }, true);
  BUS.on('match:new', function () { if (Gd.el) close(true); });
})(HPO);
