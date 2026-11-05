// Guided first match (docs/TUTORIAL.md). Annetta walks a new player through the Strategy panel, Aim and a practice QTE: the sim pauses, a spotlight
// sits on the thing being explained, and some steps wait until the player really tries it. Play mode only; started by game.js, skippable at any time.
(function (HPO) {
  'use strict';
  const mod = n => HPO.mod[n];
  const Tu = HPO.mod.tutorial = { active: false, start: start, stop: stop };
  let ui = null, steps = [], at = -1, poll = 0, held = false, qteSeen = false, t0 = 0;

  function steps_() {
    const g = mod('game'), hud = g.hud, orders = () => mod('ai').orders('A');
    const collapsed = () => !!hud.fab && getComputedStyle(hud.fab).display !== 'none';
    const isOpen = () => hud.coach.classList.contains('open');
    const setOpen = v => { if (collapsed() && isOpen() !== v) hud.fab.click(); };
    return [
      { text: "Hi, I'm Annetta. We play by ourselves, so you are the coach. Let me show you around. It takes a minute.", btn: 'Show me' },
      { target: () => document.querySelector('.sb-card'), text: scoreText() },
      { show: collapsed, target: () => hud.fab, text: 'This is Strategy. Tap it to open your coaching panel.', wait: isOpen, before: () => setOpen(false) },
      { target: () => hud.mind, before: () => setOpen(true), text: 'Mindset: the shield plays it safe, the sword goes for it. Tap one to try it.', wait: () => (orders().mindset | 0) !== 0 },
      { target: () => hud.plans, text: 'Then pick one plan. Try "Break the net": lobs over players who crowd the net.', wait: () => !!orders().plan },
      { target: () => hud.style, text: 'Shots sets the spin and pace. Middle balls says who takes the ones down the middle: you, me, or whoever is closer.' },
      { show: () => !hud.tag.hidden && getComputedStyle(hud.tag).display !== 'none', target: () => hud.tag, text: 'Your choices are listed here, and your plan calls out when it works.' },
      { target: () => hud.aim, before: () => setOpen(false), text: 'Aim lets you place your next shot yourself. Tap it.', wait: () => mod('ui').api.S.aim },
      { free: true, text: 'The other side of the court is flashing. Tap anywhere on it and your next shot goes there if it can.', wait: () => !mod('ui').api.S.aim },
      { target: () => hud.go, text: 'Go for it: your next winning chance becomes a swipe shot. Timeout and Challenge are what they sound like.' },
      { qte: true, text: 'Winning chances freeze time. Let me find you one. When the ring flashes, swipe from it toward their court. Longer and faster swipes hit harder.' },
      { text: "That's everything. The rest is playing. Good luck!", btn: "Let's play" }
    ];
  }
  function scoreText() {
    const Rl = mod('rules'), c = Rl && Rl.state && Rl.state.config;
    return 'This is the scoreboard. ' + (c ? Rl.describeFormat(c.format, c.scoring) : '');
  }

  // ---- overlay ----
  function build(api) {
    const h = api.h, mk = (c) => h('div', { class: c });
    ui = { root: h('div', { id: 'tut', class: 'tut', hidden: true }), hole: mk('tut-hole'), b: [mk('tut-b'), mk('tut-b'), mk('tut-b'), mk('tut-b')], text: h('p', { class: 'tut-text' }), count: mk('tut-count') };
    ui.next = h('button', { type: 'button', class: 'tut-next', onclick: () => advance() }, 'Next');
    ui.skipStep = h('button', { type: 'button', class: 'tut-skipstep', onclick: () => advance() }, 'Skip this step');
    ui.skip = h('button', { type: 'button', class: 'tut-skip', onclick: () => stop() }, 'Skip tutorial');
    const an = mod('players').roster().find(x => x.id === 'p5'), face = h('canvas', { class: 'tut-face', width: 24, height: 24 });
    if (an) api.drawPortrait(face, an);
    ui.bubble = h('div', { class: 'tut-bubble' }, face, h('div', { class: 'tut-body' }, ui.count, ui.text, h('div', { class: 'tut-acts' }, ui.skip, ui.skipStep, ui.next)));
    ui.root.append(ui.b[0], ui.b[1], ui.b[2], ui.b[3], ui.hole, ui.bubble);
    api.EL.stage.appendChild(ui.root);
  }

  function start() {
    const api = mod('ui') && mod('ui').api, M = mod('match'), g = mod('game');
    if (!api || !M || !g || !g.hud || g.st !== 'playing') return;
    if (Tu.active) stop();
    if (!ui) build(api);
    steps = steps_(); at = -1; Tu.active = true; qteSeen = false;
    if (!M.paused) { M.pause(true); held = true; } else held = false;
    ui.root.hidden = false;
    clearInterval(poll); poll = setInterval(tick, 150);
    advance();
  }
  function stop() {
    if (!Tu.active) return;
    Tu.active = false; clearInterval(poll); poll = 0;
    if (ui) ui.root.hidden = true;
    const M = mod('match'), Q = mod('qte');
    if (Q) { Q.force = null; Q.armed = false; }
    if (M && held) M.pause(false);
    held = false;
  }

  function advance() {
    if (!Tu.active) return;
    let s = null;
    while (++at < steps.length) { s = steps[at]; if (!s.show || s.show()) break; s = null; }
    if (!s) { stop(); return; }
    if (s.before) s.before();
    ui.count.textContent = 'Tutorial · ' + (at + 1) + ' of ' + steps.length;
    ui.text.textContent = s.text;
    ui.next.textContent = s.btn || 'Next';
    ui.next.hidden = !!(s.wait || s.qte); ui.skipStep.hidden = !(s.wait || s.qte);
    if (s.free) ui.hole.hidden = true;
    if (s.qte) beginQte();
    place();
  }
  // the practice QTE: let the sim run and make the next chance a winning one
  function beginQte() {
    const Q = mod('qte'), M = mod('match'); if (!Q) { advance(); return; }
    Q.setMode('relaxed'); Q.force = 'attack'; Q.armed = true; Q.pointsSince = 9; Q.gameUsed = 0; qteSeen = false; t0 = performance.now();
    if (held) { M.pause(false); held = false; }
  }

  function tick() {
    if (!Tu.active) return;
    const s = steps[at], Q = mod('qte'), api = mod('ui').api;
    if (!s) return;
    if (Q && Q.open) { qteSeen = true; ui.root.hidden = true; return; }       // the QTE overlay has the stage
    ui.root.hidden = false;
    if (s.qte && qteSeen) { Q.force = null; Q.armed = false; const M = mod('match'); if (M && !M.paused) { M.pause(true); held = true; } advance(); return; }
    if (s.qte && performance.now() - t0 > 40000) { Q.force = null; Q.armed = false; ui.text.textContent = 'No chance came up this time. You will get plenty.'; ui.next.hidden = false; ui.skipStep.hidden = true; s.qte = false; }
    if (s.wait && s.wait()) { advance(); return; }
    void api;
    place();
  }

  // ---- spotlight and bubble ----
  function place() {
    const s = steps[at]; if (!s || !ui) return;
    const st = ui.root.parentNode.getBoundingClientRect(), W = st.width, H = st.height;
    let r = null;
    if (s.target && !s.qte && !s.free) { const el = s.target(); if (el && el.getBoundingClientRect) { const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) r = { x: b.left - st.left - 6, y: b.top - st.top - 6, w: b.width + 12, h: b.height + 12 }; } }
    const B = ui.b, put = (e, x, y, w, hh) => { e.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + Math.max(0, w) + 'px;height:' + Math.max(0, hh) + 'px'; };
    if (r) {
      ui.hole.hidden = false; put(ui.hole, r.x, r.y, r.w, r.h);
      put(B[0], 0, 0, W, r.y); put(B[1], 0, r.y + r.h, W, H - r.y - r.h); put(B[2], 0, r.y, r.x, r.h); put(B[3], r.x + r.w, r.y, W - r.x - r.w, r.h);
    } else {
      ui.hole.hidden = true; put(B[0], 0, 0, W, H); put(B[1], 0, 0, 0, 0); put(B[2], 0, 0, 0, 0); put(B[3], 0, 0, 0, 0);
    }
    ui.root.classList.toggle('dim', !(s.qte || s.free));
    // the bubble goes on whichever side of the spotlight has room (top when the target sits low, as the dock does)
    const bh = ui.bubble.offsetHeight || 140;
    const top = !r ? Math.max(12, (H - bh) / 2) : (r.y + r.h / 2 > H * 0.55 ? Math.max(8, r.y - bh - 12) : Math.min(H - bh - 8, r.y + r.h + 12));
    ui.bubble.style.top = (s.qte || s.free ? 12 : top) + 'px';
  }
})(HPO);
