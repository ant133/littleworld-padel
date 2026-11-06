// Energy, concentration and mood (src/06_mind.js, CONTRACT section 20): energy only drains, concentration moves both ways, each of the 10 moods can be
// reached from its trigger, moods expire, partners mix up balls, rests do not refund energy. The DOM overlay is checked in headless Chrome by hand.
'use strict';
const assert = require('assert');
const { load } = require('./load');
const HPO = load(), BUS = HPO.BUS, M = HPO.mod.mind, P = HPO.mod.players;

const start = (format, seed) => HPO.mod.match.start({ format: format || 'quick', scoring: 'golden', type: 'M', venue: 'classicBlue', seed: seed || 1, fast: true });

// ---- 1. a whole Blitz match: energy never rises, concentration moves both ways, moods appear and end ----
const lowest = {}, seen = { up: false, down: false }, moods = {}, changes = [];
BUS.on('mood:change', e => { changes.push(e); if (e.mood) moods[e.mood] = (moods[e.mood] || 0) + 1; });
const sample = () => P.list.forEach(p => {
  const l = lowest[p.id];
  if (l !== undefined) assert(p.fatigue >= l - 1e-9, p.id + ' energy rose: fatigue ' + l + ' -> ' + p.fatigue);
  lowest[p.id] = p.fatigue;
  if (p.confidence > p.baseFocus + 0.04) seen.up = true;
  if (p.confidence < p.baseFocus - 0.04) seen.down = true;
});
BUS.on('point:end', sample); BUS.on('shot:hit', sample);
const fat = [];
for (let i = 0; i < 6; i++) { start('blitz', 11 + i).runToEnd(3600); P.list.forEach(p => fat.push(p.fatigue)); }
const meanFat = fat.reduce((a, b) => a + b, 0) / fat.length;
const blitzMoods = JSON.stringify(moods);
assert(seen.up && seen.down, 'concentration goes above and below the baseline');
assert(meanFat > 0.3 && meanFat < 0.6, 'Blitz drains about the target (0.45): ' + meanFat.toFixed(2));
assert(Object.keys(moods).length >= 3, 'a few Blitz matches show several moods: ' + JSON.stringify(moods));
assert(changes.some(e => e.mood === ''), 'moods end');

// ---- 2. rests cool the head, not the legs ----
start('quick', 3);
P.list.forEach(p => { p.fatigue = 0.5; p.confidence = 0.2; });
P.rest(0.12);
assert(P.list.every(p => p.fatigue === 0.5), 'rest() does not refund energy');
assert(P.list.every(p => p.confidence > 0.2 && p.confidence <= p.baseFocus + 1e-9), 'rest() pulls concentration back to the baseline');
assert(M.focus({ confidence: 0.9, fatigue: 0.9 }) < 0.7, 'a tired player cannot concentrate fully');
reset('blitz'); const kB = M.st.K; reset('quick'); const kQ = M.st.K; reset('oneSet'); const kO = M.st.K;
assert(kB > kQ && kQ > kO, 'a shorter format drains faster: ' + [kB, kQ, kO].map(x => x.toFixed(2)));

// ---- 3. each mood can be reached from its trigger ----
function reset(fmt) { M.reset(fmt || 'quick'); }
const A0 = () => P.list.find(p => p.team === 'A' && p.slot === 0), A1 = () => P.list.find(p => p.team === 'A' && p.slot === 1);
const B0 = () => P.list.find(p => p.team === 'B' && p.slot === 0);
const end = (winner, kind, hitter, kinds, reason) => BUS.emit('point:end', { winner: winner, kind: kind, hitter: hitter.id, reason: reason || 'net', rallyLen: 6, shotKinds: kinds || ['flatGround'] });
const temper = t => P.list.forEach(p => { p.temper = t; });
const SCEN = {
  angry_partner: () => { temper(0.95); end('B', 'unforced', A1()); end('B', 'unforced', A1()); },
  self_blame: () => { temper(0.1); end('B', 'unforced', A0()); end('B', 'unforced', A0()); },
  fired_up: () => { temper(0.95); end('A', 'winner', A0(), ['smashFlat']); },
  cocky: () => { temper(0.1); for (let i = 0; i < 5; i++) end('A', 'forced', B0()); },
  defeated: () => { temper(0.1); for (let i = 0; i < 12; i++) end('B', 'forced', A0()); },
  nervous: () => { temper(0.95); HPO.mod.rules.state.flags = { matchPoint: 'A' }; BUS.emit('point:start', { server: A0().id }); },
  flow: () => { temper(0.5); for (let i = 0; i < 9; i++) { P.list.forEach(p => { p.confidence = p.baseFocus + 0.2; }); end(i % 3 === 2 ? 'B' : 'A', 'forced', i % 3 === 2 ? A0() : B0()); } },
  vengeful: () => { temper(0.95); end('B', 'winner', B0(), ['smashFlat']); },
  supportive: () => { temper(0.2); end('B', 'unforced', A1()); },
  irritated: () => { temper(0.95); BUS.emit('ball:bounce', { marginCm: 3, p: { x: 0, y: 0, z: 0 } }); end('B', 'unforced', A0(), ['flatGround'], 'out'); }
};
Object.keys(M.MOODS).forEach(id => assert(SCEN[id], 'a scenario for ' + id));
Object.keys(SCEN).forEach(id => {
  let hit = 0, tries = 300;
  for (let i = 0; i < 300; i++) {
    start('quick', 500 + i); reset('quick'); SCEN[id]();
    if (P.list.some(p => p.team === 'A' && p.mood.id === id)) { hit++; if (id !== 'cocky' && id !== 'flow') break; }
  }
  assert(hit > 0, id + ' never started from its trigger in ' + tries + ' tries');
});

// ---- 4. a mood is timed: it ends, and what it does reads in stat names with arrows ----
start('quick', 9); reset('quick');
const p0 = A0(); changes.length = 0;
M.setMood(p0, 'nervous', 0.6);
assert(p0.mood.id === 'nervous' && M.left(p0) > 15, 'a mood has a duration (' + M.left(p0).toFixed(1) + ' s)');
P.now += 5; M.tick(); assert(p0.mood.id === 'nervous', 'still on after 5 s');
P.now += p0.mood.dur; M.tick();
assert(p0.mood.id === '' && changes.some(e => e.playerId === p0.id && e.mood === '' && e.was === 'nervous'), 'the mood ends when its time is up');
const fx = id => M.effects(id).reduce((o, s) => { o[s.name] = s.dir * s.n; return o; }, {});
assert.deepStrictEqual([fx('fired_up').Power, fx('fired_up').Attack, fx('fired_up').Stamina, fx('fired_up').Speed], [2, 2, -2, 1], 'fired up: more power, attack and speed, much less stamina (the toast shows the four biggest)');
assert(fx('self_blame')['Takes balls'] < 0 && fx('angry_partner')['Takes balls'] > 0, 'blaming yourself leaves the ball, anger grabs it');
assert(fx('flow').Accuracy > 0 && fx('nervous').Serve < 0, 'flow helps accuracy, nerves hurt the serve');
Object.keys(M.MOODS).forEach(id => assert(M.effects(id).length > 0 && M.effects(id).length <= 4, id + ' lists 1 to 4 stats'));
M.setMood(p0, 'cocky', 0.8); assert(M.errMul(p0, 0.2, 0.1) > 1 && M.errMul(p0, 0.6, 0.8) === 1, 'cocky only slips on easy balls');
M.setMood(p0, 'nervous', 0.8); assert(M.shotMul(p0, 'smashFlat') < 1 && M.shotMul(p0, 'lobDef') > 1, 'nerves: fewer smashes, more lobs');
p0.mood = { id: '', k: 0, t0: 0, dur: 0 }; p0.fatigue = 0.9; assert(M.shotMul(p0, 'smashFlat') < 0.7 && M.effort(p0) < 0, 'a tired player smashes less and with less pace');

// ---- 5. partners mix up a ball: an angry one grabs it (both go), a blaming one leaves it (neither goes) ----
function mixups(a, b, ma, mb) {
  start('quick', 21); reset('quick'); P.list.forEach(p => { p.reactUntil = 0; });
  if (ma) M.setMood(a, ma, 0.8); if (mb) M.setMood(b, mb, 0.8);
  let n = 0, kinds = {}; const h = BUS.on('mood:mixup', e => { n++; kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
  for (let i = 0; i < 300; i++) M.contest('A', a, b, 0.4, i + 1);
  BUS.off('mood:mixup', h);
  return { n: n, kinds: kinds, held: Math.max(a.reactUntil, b.reactUntil) > 0 };
}
const none = mixups(A0(), A1()), ang = mixups(A0(), A1(), 'angry_partner'), blame = mixups(A0(), A1(), 'self_blame', 'self_blame'), talk = mixups(A0(), A1(), 'angry_partner', 'supportive');
assert(none.n === 0 && !none.held, 'calm partners never mix up');
assert(ang.n > 40 && ang.kinds.both === ang.n && ang.held, 'an angry partner makes both go: ' + ang.n);
assert(blame.n > 20 && blame.kinds.neither === blame.n, 'two blaming partners both leave it: ' + blame.n);
assert(talk.n < ang.n * 0.6, 'a supportive partner talks it through: ' + talk.n + ' vs ' + ang.n);
assert(mixups(A0(), A1(), 'angry_partner').n > 0 && (() => { start('quick', 22); reset('quick'); let n = 0; BUS.on('mood:mixup', () => n++); M.setMood(A0(), 'angry_partner', 0.8); for (let i = 0; i < 100; i++) M.contest('A', A0(), A1(), 2.5, i + 1); return n === 0; })(), 'a clearly better-placed player takes the ball: no mix-up when the gap is wide');

assert(HPO.util.errors.filter(e => !/commentary|^point:end|^shot:hit/.test(e.where)).length === 0, 'no errors: ' + JSON.stringify(HPO.util.errors.slice(0, 2)));
console.log('mind_tests OK  Blitz mean energy lost ' + meanFat.toFixed(2) + ', moods in 6 matches ' + blitzMoods + ', mix-ups per 300 contests: angry ' + ang.n + ', blaming ' + blame.n + ', supportive ' + talk.n);
