// Mood UI: over every player an energy bar (like a health bar), a thin concentration bar and the mood as a pixel-art face buff with a countdown ring that
// flashes before it ends. A two-row toast names the mood and the stats it moves (green buffed, red nerfed). Presentation only: reads players and the mind module, never writes.
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, _ = HPO.t, U = HPO.util, mod = n => HPO.mod[n];
  const X = HPO.mod.moodui = { layer: null, els: {}, key: '' };
  let tmpV = null;


  // ---- pixel-art mood faces: 12x12, a base disc plus a few pixels per mood, drawn once to a canvas and scaled with nearest-neighbour (CSS image-rendering) ----
  const PAL = { o: '#4a2f12', y: '#ffd23f', Y: '#f0a800', k: '#1d1a17', w: '#ffffff', r: '#e5484d', R: '#8f1d24', a: '#f0603a', b: '#3b8be0', B: '#a9d8ff', p: '#9a68e6', P: '#4b2a8c', s: '#e8a76b', S: '#b97a43', g: '#b8c0c8', n: '#2b5fb8' };
  const DISC = ['...oooooo...', '..offffffo..', '.offffffffo.', 'offffffffffo', 'offffffffffo', 'offffffffffo', 'offffffffffo', 'offffffffffo', 'offffffffffo', '.offffffffo.', '..offffffo..', '...oooooo...'];
  const disc = (f, ol) => DISC.map(r => r.replace(/f/g, f).replace(/o/g, ol || 'o').split(''));
  const put = (g, c, pts) => { pts.forEach(q => { if (q[0] >= 0 && q[0] < 12 && q[1] >= 0 && q[1] < 12) g[q[1]][q[0]] = c; }); return g; };
  const BROW_MAD = [[2, 3], [3, 4], [4, 4], [9, 3], [8, 4], [7, 4]], BROW_SAD = [[2, 4], [3, 3], [4, 3], [9, 4], [8, 3], [7, 3]];
  const EYES = [[3, 5], [4, 5], [3, 6], [4, 6], [7, 5], [8, 5], [7, 6], [8, 6]], FROWN = [[5, 8], [6, 8], [4, 9], [7, 9]];
  function star(g, cx, cy, r) { for (let i = -r; i <= r; i++) put(g, 'Y', [[cx + i, cy], [cx, cy + i]]); if (r > 1) put(g, 'y', [[cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]]); put(g, 'w', [[cx, cy]]); }
  const FLAME = ['.....oo.....', '....orro....', '....orrro.o.', '...orrOrroro', '..orrOOOrrro', '..orOOyOOrro', '.orOOyyyOOro', '.orOyyyyyOro', '.orOyyyyyOro', '..orOyyyOro.', '...orOOOro..', '....oooo....'];
  const HAND = ['............', '....oooo....', '...oyyyyo...', 'nnosssyyyoww', 'nnosSsSyyoww', 'nnosssSyyoww', 'nnosSsSyyoww', 'nnosssyyyoww', '..osysysyso.', '...oooooo...', '............', '............'];
  const FACE = {
    angry_partner: () => put(put(disc('a'), 'k', BROW_MAD.concat(EYES, FROWN)), 'w', [[3, 5], [7, 5]]),
    self_blame: () => put(put(disc('y'), 'k', BROW_SAD.concat(EYES, FROWN)), 'B', [[3, 7], [3, 8]]),
    cocky: () => put(put(disc('y'), 'k', [[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [3, 5], [4, 5], [7, 5], [8, 5], [4, 8], [5, 8], [6, 8], [7, 8], [8, 7]]), 'w', [[3, 4], [7, 4]]),
    nervous: () => put(put(put(disc('y'), 'w', [[3, 4], [4, 4], [3, 5], [4, 5], [7, 4], [8, 4], [7, 5], [8, 5]]), 'k', [[4, 5], [7, 5], [3, 3], [4, 2], [8, 3], [7, 2], [4, 9], [5, 8], [6, 9], [7, 8]]), 'b', [[9, 6], [9, 7]]),
    defeated: () => put(put(disc('y'), 'k', [[2, 4], [4, 4], [3, 5], [2, 6], [4, 6], [7, 4], [9, 4], [8, 5], [7, 6], [9, 6], [4, 8], [5, 8], [6, 8], [7, 8]]), 'r', [[6, 9], [7, 9]]),
    vengeful: () => put(put(put(put(disc('p', 'P'), 'k', BROW_MAD.concat([[3, 5], [4, 5], [7, 5], [8, 5], [2, 7], [9, 7], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8]])), 'w', [[3, 5], [8, 5], [4, 9], [5, 9], [6, 9], [7, 9]]), 'r', [[3, 0], [3, 1], [4, 1], [8, 0], [8, 1], [7, 1]]), 'R', [[2, 1], [9, 1]]),
    irritated: () => put(put(disc('y'), 'k', BROW_MAD.concat([[3, 5], [4, 5], [7, 5], [8, 5], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [3, 9], [8, 9], [4, 10], [5, 10], [6, 10], [7, 10], [5, 9], [6, 9]])), 'w', [[4, 9], [7, 9]]),
    fired_up: () => FLAME.map(r => r.replace(/o/g, 'R').split('')),
    flow: () => { const g = DISC.map(() => '............'.split('')); star(g, 4, 7, 3); star(g, 9, 3, 2); star(g, 9, 9, 1); return g; },
    supportive: () => HAND.map(r => r.split(''))
  };
  const art = X.art = function (id) {
    X.cache = X.cache || {};
    if (X.cache[id] || !FACE[id]) return X.cache[id];
    const g = FACE[id](), cv = document.createElement('canvas'); cv.width = cv.height = 12;
    const c = cv.getContext('2d');
    g.forEach((row, y) => row.forEach((ch, x) => { if (PAL[ch]) { c.fillStyle = PAL[ch]; c.fillRect(x, y, 1, 1); } }));
    return (X.cache[id] = cv.toDataURL());
  };

  BUS.on('boot:ready', function () {
    const R = mod('render'), cont = (R && R.container) || document.getElementById('stage'); if (!cont || typeof document === 'undefined') return;
    X.layer = document.createElement('div'); X.layer.className = 'mu-layer'; X.layer.setAttribute('aria-hidden', 'true');
    cont.appendChild(X.layer);
    if (R && R.onFrame) R.onFrame(update);
  });

  // the title screen and the menus cover the court: show the meters only when the match is on screen
  function visible(replayOk) {
    const g = mod('game'), M = mod('match'), rp = mod('replay');
    if (!M || M.phase !== 'play' || (rp && rp.active && !replayOk)) return false;
    return !g || g.mode !== 'play' || ((g.st === 'playing' || g.st === 'watch') && !g.scr);
  }
  function build(p) {
    const el = document.createElement('div'); el.className = 'mu'; el.hidden = true;
    el.innerHTML = '<div class="mu-bars"><i class="mu-en"><b></b></i><i class="mu-fo"><b></b></i></div><div class="mu-buff" hidden><span class="mu-ico"></span></div>';
    X.layer.appendChild(el);
    return { el: el, en: el.querySelector('.mu-en b'), fo: el.querySelector('.mu-fo b'), buff: el.querySelector('.mu-buff'), ico: el.querySelector('.mu-ico'), mood: '', lv: '', w: -1, f: -1 };
  }
  function update() {
    const P = mod('players'), R = mod('render'), A = mod('actors'), Mi = mod('mind');
    if (!X.layer || !P || !P.list || !Mi) return;
    const on = visible() && R.project && R.THREE;
    X.layer.hidden = !on;
    if (!on) return;
    const key = P.list.map(p => p.id).join();
    if (key !== X.key) { X.layer.textContent = ''; X.els = {}; X.key = key; }
    if (!tmpV) tmpV = new R.THREE.Vector3();
    P.list.forEach(function (p) {
      const e = X.els[p.id] || (X.els[p.id] = build(p));
      const rig = A && A.rigOf ? A.rigOf(p.id) : null;
      if (rig && rig.root) tmpV.set(rig.root.position.x, 2.05, rig.root.position.z); else tmpV.set(p.pos.x, 2.05, p.pos.z);
      const s = R.project(tmpV);
      if (!s || !s.visible) { e.el.hidden = true; return; }
      e.el.hidden = false; e.el.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%,-100%)';
      const en = Math.round(Mi.energy(p) * 100), fo = Math.round(Mi.focus(p) * 100);
      if (en !== e.w) { e.w = en; e.en.style.width = en + '%'; const lv = en > 55 ? 'hi' : en > 30 ? 'mid' : 'lo'; if (lv !== e.lv) { e.lv = lv; e.el.dataset.lv = lv; } }
      if (fo !== e.f) { e.f = fo; e.fo.style.width = fo + '%'; }
      const id = p.mood.id;
      if (id !== e.mood) {
        e.mood = id; e.buff.hidden = !id;
        if (id) { const d = Mi.MOODS[id]; e.ico.style.setProperty('--spr', 'url(' + art(id) + ')'); e.ico.dataset.mood = id; e.buff.dataset.tone = d.tone; e.buff.title = Mi.label(id); }
      }
      if (id) {
        const left = Mi.left(p), frac = left / p.mood.dur;
        e.buff.style.setProperty('--p', (frac * 100).toFixed(1));
        const b = left < Math.max(3, p.mood.dur * 0.2) ? (left < 1.5 ? 2 : 1) : 0;   // about to end: flash, faster in the last second and a half
        if (b !== e.blink) { e.blink = b; e.buff.classList.toggle('blink', b === 1); e.buff.classList.toggle('blink2', b === 2); }
      }
    });
  }

  // toast, two rows: "Mateo: Fired up" and the stats it moves as short tags with one or two arrows, green up (buffed) and red down (nerfed)
  BUS.on('mood:change', function (e) {
    if (!e || !e.mood || !visible(true)) return;   // a replay may be starting: the toast waits for it (19_ui.js)
    const M = mod('match'), ui = mod('ui'), Mi = mod('mind'), p = mod('players').byId[e.playerId];
    if (!ui || !ui.toast || !p || (M.cfg && M.cfg.fast) || M.speed >= 4) return;
    const node = document.createElement('div'), top = document.createElement('b'), row = document.createElement('div');
    node.className = 'mu-toast'; row.className = 'mu-tags';
    top.textContent = _('{name}: {mood}', { name: p.name.split(' ')[0], mood: Mi.label(e.mood) });
    Mi.effects(e.mood).forEach(function (s) { const t = document.createElement('span'); t.className = s.dir > 0 ? 'up' : 'dn'; t.textContent = s.tag + ' ' + (s.dir > 0 ? '▲' : '▼').repeat(s.n); row.appendChild(t); });
    node.append(top, row);
    const tone = Mi.MOODS[e.mood].tone;
    ui.toast(node, { kind: tone === 'good' ? 'good' : tone === 'bad' ? 'warn' : 'info', ms: 2800 });
  });
  // a mix-up between partners: "Mine!" over the one who went, "Yours?" when both left it
  BUS.on('mood:mixup', function (e) {
    const C = mod('callouts'), p = mod('players').byId[e.who];
    if (C && C.show && p) C.show(e.kind === 'both' ? 'mixBoth' : 'mixNone', { x: p.pos.x, y: 2.7, z: p.pos.z });
  });
})(HPO);
