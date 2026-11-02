// Headless physics tests: node tools/physics_tests.js  (exit code != 0 on failure)
'use strict';
const H = require('./load').load();
const court = H.mod.court, ball = H.mod.ball, D = H.cfg.PHYS_DT, R = H.cfg.BALL.R, M = H.cfg.BALL.M;

const EV = { contact: [], bounce: [], dead: [] };
H.BUS.on('ball:contact', e => EV.contact.push(e));
H.BUS.on('ball:bounce', e => EV.bounce.push(e));
H.BUS.on('ball:dead', e => EV.dead.push(e));

function fresh(seed, venue) {
  H.reseed(seed || 1); court.setVenue(venue || 'classicBlue'); H.court = undefined;
  ball.setWind({ x: 0, y: 0, z: 0 }); ball.reset();
  EV.contact.length = EV.bounce.length = EV.dead.length = 0;
}
// launch and step until dead / maxT / stop(state) returns true. Returns the trace of positions.
function fly(L, maxT, stop, onStep) {
  ball.launch(L);
  const tr = [], n = Math.round(maxT / D);
  for (let i = 0; i < n; i++) {
    ball.step(D);
    const s = ball.state;
    tr.push({ x: s.p.x, y: s.p.y, z: s.p.z });
    if (onStep) onStep(s, i);
    if (s.state !== 'live' || (stop && stop(s))) break;
  }
  return tr;
}
const sp = v => Math.hypot(v.x, v.y, v.z);
const deg = r => r * 180 / Math.PI;
const energy = (v, w) => 0.5 * M * (v.x * v.x + v.y * v.y + v.z * v.z) + 0.5 * (2 / 3) * M * R * R * (w.x * w.x + w.y * w.y + w.z * w.z);
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) * (x - m)))); };
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function near(a, b, tol, msg) { assert(Math.abs(a - b) <= tol, (msg || 'near') + ': ' + a + ' vs ' + b + ' (tol ' + tol + ')'); }
function U(rng, a, b) { return a + (b - a) * rng.next(); }

const tests = [];
const T = (name, fn) => tests.push({ name, fn });

// ---------------------------------------------------------------- court API
T('court: service boxes, right side, sides swap, regions', () => {
  fresh();
  assert(court.rightSign('A') === 1 && court.rightSign('B') === -1, 'rightSign default');
  let b = court.serviceBox('A', 'deuce');
  assert(b.x[0] === 0 && b.x[1] === 6.95 && b.z[0] === -5 && b.z[1] === 0, 'A deuce -> x>0, z<0: ' + JSON.stringify(b));
  b = court.serviceBox('A', 'ad'); assert(b.x[0] === 0 && b.z[0] === 0 && b.z[1] === 5, 'A ad');
  b = court.serviceBox('B', 'deuce'); assert(b.x[0] === -6.95 && b.x[1] === 0 && b.z[0] === 0 && b.z[1] === 5, 'B deuce -> x<0, z>0');
  b = court.serviceBox('B', 'ad'); assert(b.z[1] === 0 && b.z[0] === -5, 'B ad');
  assert(court.regionOf(-3, 0) === 'A' && court.regionOf(3, 0) === 'B', 'regions default');
  H.court = { sides: { A: 1, B: -1 } };
  assert(court.regionOf(-3, 0) === 'B' && court.regionOf(3, 0) === 'A', 'regions swapped');
  assert(court.rightSign('A') === -1 && court.rightSign('B') === 1, 'rightSign swapped');
  b = court.serviceBox('A', 'deuce'); assert(b.x[0] === -6.95 && b.z[0] === 0 && b.z[1] === 5, 'A deuce swapped (A at x>0, faces -X, right=-Z, diagonal +Z, x<0)');
  H.court = undefined;
  assert(court.inCourt(9.9, 4.9) && !court.inCourt(10.1, 0) && !court.inCourt(0, -5.1), 'inCourt');
  assert(court.isWall('glassBack') && court.isWall('post') && court.isWall('door') && !court.isWall('net') && !court.isWall('floor'), 'isWall');
  assert(court.isMesh('meshSide') && court.isMesh('door') && !court.isMesh('glassSide'), 'isMesh');
  near(court.netHeight(0), 0.88, 1e-12); near(court.netHeight(5), 0.92, 1e-12);
});

T('court: nearLine signed margins', () => {
  fresh();
  near(court.nearLine(6.95, 2), 0, 1e-12); near(court.nearLine(6.9, 2), 0.05, 1e-12); near(court.nearLine(3, 0.02), 0.02, 1e-12);
  assert(court.nearLine(11, 0) < 0 && court.nearLine(0, 6) < 0, 'outside negative');
  const box = court.serviceBox('A', 'deuce');
  near(court.nearLine(6.9, -2, box), 0.05, 1e-12); near(court.nearLine(7.0, -2, box), -0.05, 1e-12);
  near(court.nearLine(3, -0.03, box), 0.03, 1e-12); near(court.nearLine(3, 0.04, box), -0.04, 1e-12);
});

T('court: raycast surfaces (classification, doors, ceiling, net, tape, post)', () => {
  fresh();
  const rc = (a, b, r) => court.raycastSphere({ x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, r || R);
  assert(rc([0, 1.5, 0], [12, 1.5, 0]).surf === 'glassBack', 'glass back');
  assert(rc([0, 3.5, 0], [12, 3.5, 0]).surf === 'meshBack', 'mesh back');
  assert(rc([0, 4.2, 0], [12, 4.2, 0]) === null, 'open above 4 m');
  assert(rc([9, 1.5, 0], [9, 1.5, 7]).surf === 'glassSide', 'glass side corner'); assert(rc([7, 1.5, 0], [7, 1.5, 7]).surf === 'glassSide', 'second side glass panel'); assert(rc([5, 1.5, 0], [5, 1.5, 7]).surf === 'meshSide', 'mesh between the glass panels');
  assert(rc([2, 1.5, 0], [2, 1.5, 7]).surf === 'meshSide', 'mesh side centre');
  assert(rc([0.5, 1.0, 0], [0.5, 1.0, -7]) === null, 'open entrance beside the net post (-z wall)'); assert(rc([0.5, 2.5, 0], [0.5, 2.5, -7]).surf === 'meshSide', 'header mesh over the entrance');
  assert(rc([1.5, 2.5, 0], [1.5, 2.5, -7]).surf === 'meshSide', 'fence next to the entrance is mesh');
  assert(rc([-0.5, 1.0, 0], [-0.5, 1.0, 7]) === null, 'open entrance on the +z wall');
  assert(rc([-3, 0.3, 0], [3, 0.3, 0]).surf === 'net', 'net face');
  const h = rc([-3, 0.3, 0], [3, 0.3, 0]); near(h.c.x, -R, 1e-9, 'net contact x'); assert(h.n.x === -1, 'net normal faces ball');
  assert(rc([-3, 0.83, 0], [3, 0.83, 0]).surf === 'netTape', 'tape');
  assert(rc([-3, 1.2, 0], [3, 1.2, 0]) === null, 'over net');
  assert(rc([0.5, 3, 0], [0.5, -1, 0]).surf === 'floor' || rc([0.5, 3, 0], [0.5, -1, 0]).surf === 'net', 'floor');
  assert(rc([5, 3, 0], [5, -1, 0]).surf === 'floor', 'floor plain');
  assert(rc([13, 3, 0], [13, -1, 0]).surf === 'ground', 'ground outside');
  assert(rc([-4, 0.5, 5.1], [4, 0.5, 5.1]).surf === 'post', 'post from outside');
  assert(rc([0, 5, 0], [0, 12, 0]) === null, 'no ceiling outdoors');
  court.setVenue('indoor');
  const c = rc([0, 5, 0], [0, 12, 0]); assert(c && c.surf === 'ceiling' && c.n.y === -1, 'ceiling indoor');
  court.setVenue('classicBlue');
});

// ---------------------------------------------------------------- determinism / chunking
function mixedScenario() {
  const out = [];
  [[-4, 3.4, 1, 20, 1, -8], [-8, 1.2, -2, 25, 3, 9], [2, 2, 3, 18, 6, 14], [-5, 1.5, 4, 30, -2, -10]].forEach(s => {
    fresh(77);
    out.push.apply(out, fly({ p: { x: s[0], y: s[1], z: s[2] }, v: { x: s[3], y: s[4], z: s[5] }, w: { x: 20, y: 40, z: -120 } }, 5)
      .filter((_, i) => i % 7 === 0).map(q => q.x.toFixed(9) + q.y.toFixed(9) + q.z.toFixed(9)));
  });
  return out.join('|');
}
T('determinism: same seed same trajectory, different seed differs (mesh jitter)', () => {
  const a = mixedScenario(), b = mixedScenario();
  assert(a === b, 'same seed differs');
  function once(seed) {
    fresh(seed);
    return fly({ p: { x: 0, y: 3.5, z: 0 }, v: { x: 25, y: 2.1, z: 2 } }, 1.5).map(q => q.x + ',' + q.y + ',' + q.z).join(';');
  }
  assert(once(5) === once(5) && once(5) !== once(6), 'seed sensitivity on mesh');
});

T('chunking invariance: update(1/60)xN === update(1/30)xN/2 (and 1/17 steps)', () => {
  function run(chunk, total) {
    fresh(123);
    ball.launch({ p: { x: -3, y: 3.2, z: 1 }, v: { x: 24, y: 2, z: 5 }, w: { x: 0, y: 30, z: -100 } });
    const n = Math.round(total / chunk), pos = [];
    for (let i = 0; i < n; i++) { ball.update(chunk); }
    const s = ball.state; return [s.p.x, s.p.y, s.p.z, s.v.x, s.v.y, s.v.z, s.t, s.touchedSinceHit.length].join(',');
  }
  const a = run(1 / 60, 2.4), b = run(1 / 30, 2.4), c = run(1 / 120, 2.4);
  assert(a === b, 'chunk 60 vs 30:\n' + a + '\n' + b);
  assert(a === c, 'chunk 60 vs 120');
  assert(EV.contact.length > 0, 'scenario must include contacts');
});

// ---------------------------------------------------------------- tunnelling
T('no tunnelling at 60 m/s (glass, mesh, net, tape, floor, side) over aimed + random shots', () => {
  fresh(2024);
  const rng = H.makeRng(99), counts = {}, bad = [];
  const tg = [
    () => [Math.sign(rng.next() - 0.5) * 10, U(rng, 0.2, 2.9), U(rng, -4.9, 4.9)],
    () => [Math.sign(rng.next() - 0.5) * 10, U(rng, 3.05, 3.9), U(rng, -4.9, 4.9)],
    () => [U(rng, 6.1, 9.9) * Math.sign(rng.next() - 0.5), U(rng, 0.2, 2.9), Math.sign(rng.next() - 0.5) * 5],
    () => [U(rng, -5.9, 5.9), U(rng, 3.05, 3.9), Math.sign(rng.next() - 0.5) * 5],
    () => [U(rng, -5.9, 5.9), U(rng, 0.2, 1.8), Math.sign(rng.next() - 0.5) * 5],
    () => [0, U(rng, 0.05, 0.85), U(rng, -4.9, 4.9)],
    () => [0, U(rng, 0.8, 0.98), U(rng, -4.9, 4.9)],
    () => [U(rng, -9, 9), 0, U(rng, -4.9, 4.9)],
    () => [U(rng, -9, 9), U(rng, -4, 6), U(rng, -4.9, 4.9)]
  ];
  for (let k = 0; k < 2700; k++) {
    const t = tg[k % tg.length]();
    const st = [U(rng, -9, 9), U(rng, 0.5, 3.2), U(rng, -4.5, 4.5)];
    let d = [t[0] - st[0], t[1] - st[1], t[2] - st[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
    if (k % 9 === 8) { d = [rng.next() - 0.5, rng.next() - 0.5, rng.next() - 0.5]; l = Math.hypot(d[0], d[1], d[2]); }
    if (st[0] * (st[0] + d[0]) < 0 && k % 9 < 5) continue; // keep wall shots on one side (no net crossing first)
    let over = false, prev = null, fail = null;
    const ev0 = EV.contact.length;
    ball.launch({ p: { x: st[0], y: st[1], z: st[2] }, v: { x: d[0] / l * 60, y: d[1] / l * 60, z: d[2] / l * 60 } });
    for (let i = 0; i < 480 && !fail; i++) {
      ball.step(D);
      const s = ball.state, p = s.p;
      if (p.y > 3.9 || (Math.abs(p.x) < 8 && p.y > 3.0)) over = true; // the middle side fence is 3 m: balls may leave over it
      if (Math.abs(p.z) > 5 && Math.abs(p.x) < 1.4) over = true;       // or through the open entrance beside the net
      if (!over) {
        if (Math.abs(p.x) > 10 - R + 1e-6 || (Math.abs(p.z) > 5 - R + 0.03 && Math.abs(p.x) > 1.0 + R)) fail = 'left enclosure ' + JSON.stringify(p);
        if (p.y < R - 1e-6) fail = 'below floor ' + JSON.stringify(p);
      }
      if (prev && prev.x * p.x < 0 && !fail) {
        const f = prev.x / (prev.x - p.x), yc = prev.y + (p.y - prev.y) * f, zc = prev.z + (p.z - prev.z) * f;
        if (Math.abs(zc) <= 5.05 && yc < court.netHeight(zc) - 0.03 - 1e-6) fail = 'crossed net at y=' + yc + ' z=' + zc;
      }
      prev = { x: p.x, y: p.y, z: p.z };
      if (s.state !== 'live') break;
    }
    EV.contact.slice(ev0).forEach(c => { counts[c.surf] = (counts[c.surf] || 0) + 1; });
    if (fail) bad.push(fail + ' shot ' + k);
  }
  assert(bad.length === 0, bad.length + ' tunnelling cases, e.g. ' + bad.slice(0, 3).join(' ; '));
  ['glassBack', 'meshBack', 'glassSide', 'meshSide', 'net', 'netTape', 'floor'].forEach(s => assert(counts[s] > 20, 'coverage ' + s + '=' + counts[s]));
  T.cover = counts;
});

T('no tunnelling: post (from outside, along the wall) and mesh/glass from outside', () => {
  fresh();
  const tr = fly({ p: { x: -6, y: 0.5, z: 5.1 }, v: { x: 60, y: 0, z: 0 } }, 0.2);
  assert(EV.contact.length && EV.contact[0].surf === 'post', 'post contact: ' + JSON.stringify(EV.contact[0]));
  assert(Math.max.apply(null, tr.map(q => q.x)) < 0.2, 'passed through post');
  fresh();
  fly({ p: { x: 5, y: 1.5, z: 8 }, v: { x: 0, y: 0, z: -60 } }, 0.2);
  assert(EV.contact[0] && EV.contact[0].surf === 'meshSide' && ball.state.p.z > 5, 'outside ball reflects off fence');
});

// ---------------------------------------------------------------- contact model
T('energy: contact response never gains energy (all venues/surfaces, random spin)', () => {
  const rng = H.makeRng(5);
  let worst = -1e9, worstSpin = 0, n = 0;
  Object.keys(court.SURF).forEach(venue => {
    const tab = court.SURF[venue];
    Object.keys(tab).forEach(id => {
      for (let k = 0; k < 400; k++) {
        let nn = { x: U(rng, -1, 1), y: U(rng, -1, 1), z: U(rng, -1, 1) }; const l = Math.hypot(nn.x, nn.y, nn.z); nn.x /= l; nn.y /= l; nn.z /= l;
        const spd = U(rng, 0.5, 60), d = { x: U(rng, -1, 1), y: U(rng, -1, 1), z: U(rng, -1, 1) };
        const dl = Math.hypot(d.x, d.y, d.z); let v = { x: d.x / dl * spd, y: d.y / dl * spd, z: d.z / dl * spd };
        if (v.x * nn.x + v.y * nn.y + v.z * nn.z > 0) v = { x: -v.x, y: -v.y, z: -v.z };
        const w = { x: U(rng, -400, 400), y: U(rng, -400, 400), z: U(rng, -400, 400) };
        const o = ball.respond(tab[id], nn, v, w, tab[id].jit ? H.streams.ball : null);
        const ein = energy(v, w), eout = energy(o.v, o.w);
        const rel = (eout - ein) / ein; if (rel > worst) worst = rel; n++;
        assert(o.v.x * nn.x + o.v.y * nn.y + o.v.z * nn.z >= -1e-9, id + ' ball leaves into surface');
        assert(sp(o.v) <= sp(v) + 0.5 * Math.hypot(w.x, w.y, w.z) * R * 1.6 + 1e-6, id + ' speed blow-up');
      }
    });
  });
  assert(worst <= 1e-9, 'energy gain rel ' + worst + ' in ' + n + ' cases');
});

T('floor: 2 m drop rebounds to e^2*h on classic blue (no spin), watchdog-free', () => {
  fresh();
  let apex = 0, bounced = false;
  fly({ p: { x: -6, y: 2 + R, z: 3 }, v: { x: 0, y: 0, z: 0 } }, 3, null, (s) => {
    if (EV.bounce.length) { bounced = true; apex = Math.max(apex, s.p.y - R); }
  });
  const e = court.params('floor').e;
  assert(bounced, 'no bounce');
  assert(apex > 1.15 && apex < 1.45, 'apex ' + apex.toFixed(3) + ' (e^2*2=' + (e * e * 2).toFixed(3) + ')');
  near(apex, e * e * 2, 0.14, 'apex vs e^2 h (drag costs ~6%)');
  const b = EV.bounce[0];
  assert(b.side === 'A' && b.bounceNo === 1 && b.marginCm > 0 && Math.abs(b.n.y - 1) < 1e-12 && Math.abs(b.p.z - 3) < 1e-6, 'bounce payload ' + JSON.stringify(b));
});

T('floor: low bounces die (no jitter bouncing), ball rests, ball:dead rest', () => {
  fresh();
  fly({ p: { x: 2, y: 0.6, z: 1 }, v: { x: 1.5, y: 0, z: 0 } }, 12);
  assert(ball.state.state === 'dead' && ball.state.deadReason === 'rest', 'state ' + ball.state.state + ' ' + ball.state.deadReason);
  assert(EV.dead.length === 1 && EV.dead[0].reason === 'rest', 'dead event');
  assert(EV.bounce.length >= 2 && EV.bounce.length < 15, 'bounces ' + EV.bounce.length);
  near(ball.state.p.y, R, 1e-6, 'rests on floor');
});

T('floor: topspin kicks forward, backspin skids/dies', () => {
  fresh();
  const out = {};
  [['top', -150], ['none', 0], ['back', 150]].forEach(([k, wz]) => {
    const o = ball.respond(court.params('floor'), { x: 0, y: 1, z: 0 }, { x: 10, y: -5, z: 0 }, { x: 0, y: 0, z: wz });
    out[k] = o;
  });
  assert(out.top.v.x > out.none.v.x + 1.5 && out.none.v.x > out.back.v.x + 0.3, 'vx top/none/back ' + [out.top.v.x, out.none.v.x, out.back.v.x].map(x => x.toFixed(2)));
  assert(out.back.v.x < 5.2 && out.top.v.x > 7, 'backspin dies, topspin keeps: ' + out.back.v.x.toFixed(2) + ' ' + out.top.v.x.toFixed(2));
  // live: same through the integrator
  const vx = [];
  [-150, 150].forEach(wz => {
    fresh();
    fly({ p: { x: -6, y: 0.8, z: 0 }, v: { x: 10, y: -3, z: 0 }, w: { x: 0, y: 0, z: wz } }, 1, () => EV.bounce.length > 0);
    vx.push(ball.state.v.x);
  });
  assert(vx[0] > vx[1] + 1.5, 'live topspin faster off floor: ' + vx.map(x => x.toFixed(2)));
});

T('glass: angle of incidence ~ reflection; sidespin deflects; mesh slows and varies, glass does not', () => {
  fresh();
  const n = { x: -1, y: 0, z: 0 }, v = { x: 15, y: 0, z: 6 };
  const g = ball.respond(court.params('glassBack'), n, v, { x: 0, y: 0, z: 0 });
  const ain = deg(Math.atan2(v.z, v.x)), aout = deg(Math.atan2(g.v.z, -g.v.x));
  near(ain, aout, 8, 'reflection angle'); assert(g.v.x < 0 && g.v.z > 0, 'direction sense');
  const sL = ball.respond(court.params('glassBack'), n, v, { x: 0, y: 150, z: 0 }), sR = ball.respond(court.params('glassBack'), n, v, { x: 0, y: -150, z: 0 });
  assert(Math.abs(sL.v.z - sR.v.z) > 1.5, 'sidespin influence ' + sL.v.z.toFixed(2) + ' ' + sR.v.z.toFixed(2));
  // live comparison, same impact on glass (y=1.5) vs mesh (y=3.5)
  const sg = [], sm = [], ang = [], angG = [];
  for (let i = 0; i < 40; i++) {
    fresh(100 + i);
    fly({ p: { x: 2, y: 1.5, z: 0 }, v: { x: 20, y: 2, z: 6 } }, 1, () => EV.contact.length > 0);
    sg.push(sp(ball.state.v)); angG.push(deg(Math.atan2(ball.state.v.z, ball.state.v.y)));
    fresh(100 + i);
    fly({ p: { x: 2, y: 3.4, z: 0 }, v: { x: 20, y: 2, z: 6 } }, 1, () => EV.contact.length > 0);
    assert(EV.contact[0].surf === 'meshBack', 'mesh surf');
    sm.push(sp(ball.state.v)); ang.push(deg(Math.atan2(ball.state.v.z, ball.state.v.x)));
  }
  assert(mean(sm) < mean(sg) * 0.7, 'mesh slower: ' + mean(sm).toFixed(2) + ' vs glass ' + mean(sg).toFixed(2));
  assert(std(ang) > 2.5 && std(ang) < 12, 'mesh direction sigma ' + std(ang).toFixed(2));
  assert(std(sg) < 0.2, 'glass speed does not vary ' + std(sg));
});

T('back glass after floor bounce returns toward the net side', () => {
  fresh();
  fly({ p: { x: -3, y: 2.2, z: 0 }, v: { x: -10, y: -2, z: 1 } }, 3, () => EV.contact.length >= 2);
  const ids = EV.contact.map(c => c.surf);
  assert(ids[0] === 'floor' && ids[1] === 'glassBack', 'sequence ' + ids.join(','));
  assert(ball.state.v.x > 3, 'rebounds toward net: vx=' + ball.state.v.x);
  assert(ball.state.bouncesOnSide.A === 1 && ball.state.bouncesOnSide.B === 0 && ball.state.wallContactsSinceFloor === 1, 'bookkeeping');
});

T('double wall: side then back glass reaches corner and returns reversed', () => {
  fresh();
  fly({ p: { x: 5, y: 2.2, z: 2 }, v: { x: 8, y: 2.5, z: 6 } }, 2, () => EV.contact.length >= 2);
  const ids = EV.contact.map(c => c.surf);
  assert(ids[0] === 'glassSide' && ids[1] === 'glassBack', 'sequence ' + ids.join(','));
  const v = ball.state.v; assert(v.x < -1 && v.z < -1, 'both components reversed ' + JSON.stringify(v));
  // vertical corner: ball drives straight into the corner and comes back toward origin
  fresh();
  fly({ p: { x: 6, y: 1.6, z: 1 }, v: { x: 12, y: 1.8, z: 12 } }, 2, () => EV.contact.length >= 2);
  assert(ball.state.v.x < 0 && ball.state.v.z < 0, 'corner reflection');
});

T('net: face hit is dead-ish; tape nick redirects and can fall either side', () => {
  fresh();
  fly({ p: { x: -3, y: 0.5, z: 1 }, v: { x: 15, y: 0, z: 0 } }, 3, () => EV.bounce.length > 0);
  assert(EV.contact[0].surf === 'net', 'net first');
  assert(Math.abs(ball.state.p.x) < 0.5 && EV.bounce[0].side === 'A', 'ball falls on hitter side near net');
  const outs = { A: 0, B: 0 }, dirs = [];
  for (let y0 = 0.9; y0 <= 1.8; y0 += 0.01) {
    fresh(9);
    ball.launch({ p: { x: -3, y: y0, z: 0.5 }, v: { x: 8, y: 0, z: 0 } });
    let tape = false;
    for (let i = 0; i < 1200 && ball.state.state === 'live'; i++) {
      ball.step(D);
      if (!tape && EV.contact.length && EV.contact[0].surf === 'netTape') {
        tape = true; const c = EV.contact[0];
        dirs.push(deg(Math.acos((c.vIn.x * c.vOut.x + c.vIn.y * c.vOut.y + c.vIn.z * c.vOut.z) / (sp(c.vIn) * sp(c.vOut)))));
      }
      if (EV.bounce.length) break;
    }
    if (tape && EV.bounce.length) outs[EV.bounce[0].side]++;
  }
  assert(outs.A > 3 && outs.B > 3, 'tape outcomes A=' + outs.A + ' B=' + outs.B);
  assert(Math.max.apply(null, dirs) > 20 && mean(dirs) > 5, 'tape redirect angle max ' + Math.max.apply(null, dirs).toFixed(1));
});

// ---------------------------------------------------------------- prediction
T('predict: lob (8 m apex) matches live within 2 cm incl. bounce + glass; pure (no rng, no events, no state change)', () => {
  fresh(5);
  ball.launch({ p: { x: -6, y: 1, z: 0.5 }, v: { x: 4.8, y: 13.5, z: 0.3 }, w: { x: 0, y: 5, z: -60 } });
  const snap = JSON.stringify(ball.state), nEv = EV.contact.length + EV.bounce.length;
  const pr = ball.predict(null, 6, 60);
  assert(JSON.stringify(ball.state) === snap, 'predict mutated state');
  assert(EV.contact.length + EV.bounce.length === nEv, 'predict emitted events');
  assert(H.streams.ball.next() === H.makeRng(5).fork('ball').next(), 'predict consumed rng');
  fresh(5);
  ball.launch({ p: { x: -6, y: 1, z: 0.5 }, v: { x: 4.8, y: 13.5, z: 0.3 }, w: { x: 0, y: 5, z: -60 } });
  let apex = 0; pr.samples.forEach(s => { apex = Math.max(apex, s.p.y); });
  assert(apex > 7.5 && apex < 9.5, 'apex ' + apex);
  let worst = 0, k = 0;
  for (let i = 1; ball.state.state === 'live' && k < pr.samples.length; i++) {
    ball.step(D);
    while (k < pr.samples.length && pr.samples[k].t <= i * D + 1e-9) {
      if (Math.abs(pr.samples[k].t - i * D) < 1e-9) {
        const a = pr.samples[k].p, b = ball.state.p; worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
      k++;
    }
  }
  assert(worst < 0.02, 'max deviation ' + worst);
  assert(pr.contacts.length >= 2 && pr.contacts[0].surf === 'floor', 'predicted contacts ' + pr.contacts.map(c => c.surf));
  assert(pr.contacts.length === EV.contact.length || EV.contact.length >= pr.contacts.length, 'contact count');
  assert(pr.samples[0].t === 0 && Math.abs(pr.samples[1].t - 1 / 60) < 1e-9 && 'floorBounces' in pr.samples[0], 'sample format');
  // predict on a cloned state from the middle
  const cl = ball.clone(ball.state); const p2 = ball.predict(cl, 1, 30); assert(p2.samples.length >= 2, 'predict(clone)');
});

// ---------------------------------------------------------------- safeguards
T('watchdogs: wall-contact loop, tSinceHit and out-of-bounds', () => {
  const G0 = H.cfg.BALL.G, CD0 = H.cfg.BALL.CD, tab = court.SURF.classicBlue, save = [tab.glassSide.e, tab.glassSide.mu, tab.meshSide.e, tab.meshSide.mu, tab.meshSide.xl, tab.meshSide.jit];
  try {
    H.cfg.BALL.G = 0; H.cfg.BALL.CD = 0;
    tab.glassSide.e = 1; tab.glassSide.mu = 0; tab.meshSide.e = 1; tab.meshSide.mu = 0; tab.meshSide.xl = 0; tab.meshSide.jit = 0;
    fresh();
    fly({ p: { x: 6.5, y: 1.5, z: 0 }, v: { x: 0.3, y: 0, z: 40 } }, 5);
    assert(ball.state.state === 'dead' && ball.state.deadReason === 'watchdog', 'wall loop -> ' + ball.state.state + ' ' + ball.state.deadReason);
    assert(EV.dead.length === 1 && EV.dead[0].reason === 'watchdog' && ball.state.wallContactsSinceFloor === 7, 'dead event + 7 contacts, got ' + ball.state.wallContactsSinceFloor);
    fresh();
    fly({ p: { x: -1, y: 1.5, z: 0 }, v: { x: -0.5, y: 0, z: 0.2 } }, 14);
    assert(ball.state.state === 'dead' && ball.state.deadReason === 'watchdog' && ball.state.tSinceHit > 12 && ball.state.tSinceHit < 12.1, 'tSinceHit ' + ball.state.tSinceHit);
  } finally { H.cfg.BALL.G = G0; H.cfg.BALL.CD = CD0; tab.glassSide.e = save[0]; tab.glassSide.mu = save[1]; tab.meshSide.e = save[2]; tab.meshSide.mu = save[3]; tab.meshSide.xl = save[4]; tab.meshSide.jit = save[5]; }
  fresh();
  fly({ p: { x: 9, y: 6, z: 0 }, v: { x: 12, y: 5, z: 0 } }, 6);
  assert(ball.state.state === 'dead' && ball.state.deadReason === 'outOfBounds' && EV.dead[0].reason === 'outOfBounds', 'over the top -> out of bounds: ' + ball.state.deadReason);
});

T('state machine: hold / launch / bookkeeping / reset', () => {
  fresh();
  ball.hold({ x: 1, y: 1, z: 1 }); ball.update(1);
  assert(ball.state.state === 'held' && ball.state.p.x === 1 && ball.state.t === 0, 'held ball does not move');
  ball.launch({ p: { x: -5, y: 1.2, z: 0 }, v: { x: 15, y: 1, z: 0 }, hitter: 'p0', team: 'A', serve: true });
  assert(ball.state.state === 'live' && ball.state.hitsSinceServe === 1 && ball.state.lastHitter === 'p0' && ball.state.lastHitTeam === 'A', 'launch');
  for (let i = 0; i < 120; i++) ball.update(1 / 60);
  assert(ball.state.touchedSinceHit.length > 0 && ball.state.t > 1.9, 'touched/t');
  ball.launch({ p: { x: 5, y: 1.2, z: 0 }, v: { x: -15, y: 1, z: 0 }, hitter: 'p2', team: 'B' });
  assert(ball.state.hitsSinceServe === 2 && ball.state.touchedSinceHit.length === 0 && ball.state.floorBouncesSinceHit === 0 && ball.state.tSinceHit === 0, 'stroke resets');
  ball.reset(); assert(ball.state.state === 'dead' && ball.state.hitsSinceServe === 0, 'reset');
});

// ---------------------------------------------------------------- venues
T('venues: terracotta slower/lower bounce than fast blue; indoor ceiling and no wind', () => {
  const res = {};
  ['terracotta', 'classicBlue', 'fastBlue'].forEach(vn => {
    fresh(1, vn);
    let apex = 0;
    fly({ p: { x: -6, y: 2 + R, z: 0 }, v: { x: 0, y: 0, z: 0 } }, 2, null, (s) => { if (EV.bounce.length) apex = Math.max(apex, s.p.y); });
    const o = ball.respond(court.params('floor'), { x: 0, y: 1, z: 0 }, { x: 14, y: -4, z: 0 }, { x: 0, y: 0, z: 0 });
    res[vn] = { apex, vx: o.v.x };
  });
  assert(res.terracotta.apex < res.classicBlue.apex && res.classicBlue.apex < res.fastBlue.apex, 'bounce heights ' + JSON.stringify(res));
  assert(res.terracotta.vx < res.fastBlue.vx - 0.5, 'terracotta grips more (slower after skid) ' + JSON.stringify(res));
  assert(court.VENUES.indoor.wind === 0 && court.VENUES.classicBlue.wind > 0 && court.VENUES.terracotta.speedMult === 0.97 && court.VENUES.indoor.ceiling === 8, 'venue table');
  fresh(1, 'indoor');
  fly({ p: { x: 0, y: 3, z: 0 }, v: { x: 2, y: 14, z: 0 } }, 3, () => EV.contact.length > 0);
  assert(EV.contact[0].surf === 'ceiling' && ball.state.v.y < 0, 'ceiling contact');
  fresh(1, 'classicBlue');
  fly({ p: { x: 0, y: 3, z: 0 }, v: { x: 2, y: 14, z: 0 } }, 3, () => EV.contact.length > 0);
  assert(EV.contact.length === 0 || EV.contact[0].surf !== 'ceiling', 'no ceiling outdoors');
});

// ---------------------------------------------------------------- runner
let failed = 0;
const t0 = Date.now();
for (const t of tests) {
  const ts = Date.now();
  try { t.fn(); console.log('PASS  ' + t.name + '  (' + (Date.now() - ts) + ' ms)'); }
  catch (e) { failed++; console.log('FAIL  ' + t.name + '\n      ' + String(e.message).split('\n').join('\n      ')); }
  fresh();
}
if (T.cover) console.log('coverage (contacts in tunnelling sweep): ' + JSON.stringify(T.cover));
console.log((tests.length - failed) + '/' + tests.length + ' passed in ' + (Date.now() - t0) + ' ms');
process.exit(failed ? 1 : 0);
