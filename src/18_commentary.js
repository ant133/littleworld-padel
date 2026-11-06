// Commentary + umpire announcements. Pure line engine (Node-testable) plus a BUS-driven event layer.
// Emits BUS 'speak' {text, voice:'commentator'|'umpire', priority 0..3, key, ts, t} and HPO.mod.ui.feed({t, kind, text, icon}).
// No DOM / THREE / window access at load time. Cosmetic randomness uses a private seeded rng (never the sim streams).
(function (HPO) {
  'use strict';
  const BUS = HPO.BUS, _ = HPO.t;
  const L = () => HPO.mod.i18n;

  // ---------------------------------------------------------------- word helpers
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
    'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth'];
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  // number and ordinal words go through the dictionary under num.* / ord.* and fall back to the English word
  const word = (ns, w) => { const k = ns + '.' + w, r = _(k); return r === k ? w : r; };
  const nw = n => (n >= 0 && n < NUM.length ? word('num', NUM[n]) : String(n));
  const ord = n => (ORD[n] ? word('ord', ORD[n]) : n + 'th');
  const pairOf = a => (a.length > 1 ? _('{a} and {b}', { a: a[0], b: a[1] }) : a[0] || '');
  const lastWord = s => String(s || '').trim().split(/\s+/).pop();
  const firstWord = s => String(s || '').trim().split(/\s+/)[0];
  const other = t => (t === 'A' ? 'B' : 'A');

  // ---------------------------------------------------------------- phrase pools
  // key: { pri 0..3, cd (sim seconds at 1x), voice, lines[] }  tokens: {P} player, {T} team (their), {O} opponents, {N} number, {S} extra, {he} {He} {his} {him}
  const POOL = {
    // ---- shots
    bandeja: { pri: 1, cd: 22, lines: [
      'Perfect bandeja to keep control of the net!', '{P} floats a beautiful bandeja and holds the net.', 'Textbook bandeja from {P}, and they keep the net position.',
      '{P} with the bandeja, deep and safe, still in command up front.', 'Lovely bandeja there, {P} owns the net.'] },
    chiquitaForce: { pri: 2, cd: 25, lines: [
      'A brilliant chiquita forces the opponents to retreat!', '{P}\'s chiquita, so low and soft, and {O} are pushed back!', 'That chiquita drags {O} off the net and they have to defend.',
      'Delicious chiquita from {P}, {O} can only lob it back.', 'Chiquita at the feet! {O} are on the back foot.'] },
    lobDefPressure: { pri: 2, cd: 20, lines: [
      'Unbelievable defensive lob!', '{P} gets the lob up from nowhere, and they are back in the point!', 'What a defensive lob under pressure from {P}!',
      '{P} is scrambling, but that lob buys all the time in the world.', 'From deep in trouble, {P} lobs them out of it.'] },
    doubleGlass: { pri: 2, cd: 15, lines: [
      'What a spectacular double-glass recovery!', '{P} reads the double rebound and gets it back, that is class.', 'Off the side glass, off the back glass, and {P} is still there!',
      'Two walls, no problem for {P}!', 'Incredible wall play, {P} tracks it round the glass.'] },
    tripleGlass: { pri: 3, cd: 20, lines: [
      'Three walls! {P} just refuses to lose that ball!', 'The ball has been all around the glass and {P} still gets it back!', 'Triple rebound and {P} is on it. Unbelievable!',
      'That ball went round the whole cage and {P} found it. Remarkable!'] },
    smashBack: { pri: 2, cd: 20, lines: [
      'That smash comes straight back off the glass!', 'The smash rebounds off the glass and flies back over the net!', 'The smash hits the wall and comes right back, {P} has to hit again!',
      'Unbelievable, the smash has bounced off the glass and returned over the net!', 'Off the glass and back it comes! {P} gets a second go at the smash.'] },
    dejada: { pri: 1, cd: 30, lines: [
      'Delicate dejada from {P}, it dies right after the net.', '{P} drops it softly over the net, what touch!', 'A gentle dejada, and {O} are caught flat-footed.',
      'Feather-light dejada by {P}.'] },
    vibora: { pri: 1, cd: 28, lines: [
      'Vibora with real bite from {P}!', '{P} whips a vibora with plenty of side spin.', 'That vibora from {P} curls away from {O}.', 'Nasty vibora, the ball dips and kicks off the glass.'] },
    smashPower: { pri: 1, cd: 25, lines: [
      'Monster smash from {P}!', '{P} unloads a huge overhead!', 'What power on that smash!', '{P} hits that smash like a rocket.'] },
    wallStreak: { pri: 1, cd: 25, lines: [
      'This rally is going wall to wall!', 'Everything is coming back off the glass here.', 'Nobody can finish it, the glass keeps feeding the ball back.',
      'Wall after wall after wall, this is padel at its finest.'] },
    anticipate: { pri: 0, cd: 45, lines: [
      '{P} lines up the smash...', 'Here comes the overhead from {P}!', '{P} is going for the big one.', 'High ball, and {P} is ready to attack it.'] },
    rallyN: { pri: 2, cd: 8, lines: [
      'That\'s {N} shots!', '{N} shots and counting, nobody wants to give an inch.', 'Incredible stamina, {N} shots in this rally!', 'We are at {N} shots now, what a battle.',
      'Still going, {N} shots and the crowd is on its feet.'] },
    // ---- points
    ace: { pri: 2, cd: 10, lines: [
      'Ace! {P} serves it straight through them.', 'Unreturnable! Ace for {P}.', 'Ace from {P}, they never touched it.', 'A clean ace by {P}!'] },
    doubleFault: { pri: 1, cd: 20, lines: [
      'Double fault by {P}, a gift for {O}.', '{P} double faults, the pressure is showing.', 'Two serves, two faults. Point to {O}.', 'Ouch, a double fault from {P}.'] },
    smashWinner: { pri: 2, cd: 14, lines: [
      '{P} smashes it away, no answer!', 'Overhead winner from {P}, thunderous!', 'A smash winner and {T} take the point.', 'Boom! {P} puts it away.'] },
    wallWinner: { pri: 2, cd: 16, lines: [
      '{P} wins it off the glass, what a point!', 'The ball kicks off the glass and {O} cannot reach it.', 'Beautiful use of the wall by {P} to finish.',
      'It comes off the back glass at an angle and it is gone, point to {T}.'] },
    lobWinner: { pri: 2, cd: 18, lines: [
      '{P} lobs them! Over their heads and out of reach.', 'A perfect lob from {P}, {O} have no chance.', 'That lob drops in behind {O}. Point {T}.', 'Over the top! {P} wins it with the lob.'] },
    volleyWinner: { pri: 1, cd: 14, lines: [
      'Sharp volley from {P} finishes the point.', '{P} punches the volley into the open court.', 'Great hands at the net, {P} closes it out.', 'Crisp volley winner by {P}.'] },
    winner: { pri: 1, cd: 12, lines: [
      '{P} finds the winner.', 'Clean winner from {P}.', '{T} take the point with a clean finish.', 'Too good for {O}.', 'No answer to that from {O}.'] },
    unforced: { pri: 0, cd: 24, lines: [
      'Unforced error from {P}.', '{P} gives it away there.', 'A loose one from {P}, and {T} will take that.', 'That was there for the taking, but {P} misses.'] },
    forced: { pri: 0, cd: 24, lines: [
      '{O} forced that error from {P}.', 'Pressure told, {P} could not keep it in.', '{P} was stretched there and it costs the point.', 'Good pressure from {O} draws the mistake.'] },
    longRally: { pri: 2, cd: 12, lines: [
      'What a rally! {N} shots before {T} finally take it.', 'A {N}-shot epic goes to {T}.', '{T} win a marathon, {N} shots long!', 'That {N}-shot battle ends in favour of {T}.'] },
    savedMatch: { pri: 3, cd: 6, lines: [
      '{T} save the match point!', 'They are still alive! Match point saved by {T}.', 'Huge! {T} fend off the match point.', '{T} refuse to go quietly, match point saved.'] },
    savedSet: { pri: 2, cd: 6, lines: [
      '{T} save the set point.', 'Set point saved by {T}, the set goes on.', '{T} hang in there, set point gone.', 'Big point, {T} keep the set alive.'] },
    savedBreak: { pri: 2, cd: 6, lines: [
      '{T} save the break point.', 'Break point saved, {T} stay ahead.', 'Great serving under pressure by {T}, no break.', '{T} hold their nerve and erase the break point.'] },
    goldenWon: { pri: 3, cd: 6, lines: [
      '{T} win the golden point!', 'The golden point goes to {T}!', 'And {T} take the game on the golden point!', 'Golden point decided, {T} come through.'] },
    retrieval: { pri: 1, cd: 25, lines: [
      '{P} chases it outside the court and plays it back!', 'The ball is out of the enclosure, and {P} goes after it!', '{P} fetches that from outside and returns it, amazing effort.', 'Out through the door goes {P}, and the point is still alive!'] },
    // only spoken when the language has its own 'commentary.salim' lines (Bahasa Indonesia: 15-15 is "salim"); the English lines are never emitted
    salim: { pri: 1, cd: 90, lines: [
      'Fifteen all, which they call salim in Jakarta: sama lima.', 'Salim! That is Jakarta for fifteen all.', 'Fifteen all. Salim, short for sama lima, as they say here.',
      'Salim time: fifteen all, and everything still to play for.'] },
    timeout: { pri: 1, cd: 30, lines: [
      'A tactical timeout is called, time for a chat.', 'Timeout! The coach has a few words.', 'They stop the clock for a timeout and regroup.', 'A timeout, a chance to reset the plan.'] },
    // ---- serve
    faultMesh: { pri: 0, cd: 14, lines: [
      'The serve clips the fence, that is a fault.', 'Mesh fault, the serve hits the fence after bouncing.', 'The ball catches the mesh, fault.', 'Off the fence, and that is a fault.'] },
    faultNet: { pri: 0, cd: 14, lines: [
      'Into the net, a fault.', 'The serve does not clear the net.', 'Net fault from the serve.', 'A tentative serve and it is in the net.'] },
    letNet: { pri: 1, cd: 10, lines: [
      'Net cord on the serve, let!', 'It clips the tape and drops in. Let, replay the serve.', 'Let! The serve tickles the net.', 'A net cord there, the serve will be replayed.'] },
    // ---- score situation
    goldenPoint: { pri: 3, cd: 5, lines: [
      'Golden point! Everything on the line!', 'It is golden point, next point takes the game!', 'Golden point, one point for the game.', 'Golden point, the whole game comes down to this.'] },
    goldenCombo: { pri: 3, cd: 5, lines: [
      'Golden point, and it is {FL} for {T}!', '{FL} for {T}, and it is golden point!', 'Everything on the line: golden point and {FL} for {T}.', 'Golden point, {FL}! {T} can end it here.'] },
    matchPoint: { pri: 3, cd: 5, lines: [
      'Match point for {T}!', '{T} are one point away from winning it.', 'Match point! Can {T} close it out?', 'This could be it, match point for {T}.'] },
    setPoint: { pri: 2, cd: 5, lines: [
      'Set point for {T}.', '{T} have a set point.', 'Set point! {T} are one point from the set.', 'A chance to take the set for {T}.'] },
    breakPoint: { pri: 2, cd: 5, lines: [
      'Break point for {T}, can they take it?', '{T} have a break point.', 'Break point! {T} sense an opening.', 'Break chance for {T}, this is a big point.'] },
    tiebreak: { pri: 3, cd: 20, lines: [
      'Tie-break time! First to seven decides it.', 'We are into a tie-break!', 'It is all level and we go to a tie-break.', 'Tie-break! Every point counts now.'] },
    streak: { pri: 2, cd: 14, lines: [
      '{T} have won {N} points in a row!', '{N} on the trot for {T}.', '{T} are on a roll, {N} points in a row.', 'Momentum with {T}: that is {N} straight points.'] },
    gameStreak: { pri: 2, cd: 10, lines: [
      '{T} have won {N} games in a row!', '{N} games on the trot for {T}.', 'The momentum is all with {T}, {N} games in a row.', '{T} have taken {N} straight games.'] },
    breakOfServe: { pri: 2, cd: 8, lines: [
      'That is the break! {T} break serve.', 'Break of serve for {T}!', '{T} break through, the service game is gone.', 'A crucial break for {T}.'] },
    hold: { pri: 1, cd: 20, lines: [
      '{T} hold serve.', 'Comfortable hold for {T}.', 'Service game to {T}.', '{T} hold and move on.'] },
    gameWon: { pri: 1, cd: 14, lines: [
      'Game {T}, {S}.', '{T} take the game, {S}.', 'That is the game to {T}, {S}.', '{S} after that game to {T}.'] },
    setWon: { pri: 3, cd: 6, lines: [
      '{T} take the set, {S}!', 'Set to {T}, {S}.', 'And that is the set for {T}, {S}.', '{T} wrap up the set {S}.'] },
    matchWon: { pri: 3, cd: 6, lines: [
      'Game, set and match to {T}!', 'It is over! {T} win the Littleworld Jakarta Padel Cup match, {S}.', 'Victory for {T}, {S}!', '{T} are the winners, {S}. What a match!'] },
    fatigue: { pri: 1, cd: 40, lines: [
      '{P} is starting to feel the heat.', '{P} is breathing hard now.', 'The legs are going for {P}.', 'You can see the fatigue creeping in for {P}.'] },
    formationAttack: { pri: 0, cd: 30, lines: [
      'They both push up to the net.', '{T} move forward as a pair, taking the net.', '{T} come forward together.', 'Both players of {T} are at the net now.'] },
    formationDefend: { pri: 0, cd: 30, lines: [
      '{T} drop back to defend the glass.', 'Both of {T} retreat, ready to use the walls.', '{T} give up the net and defend deep.', 'The pair of {T} are pushed back to the back wall.'] },
    coach: { pri: 1, cd: 25, lines: [
      '{T} change tactics: {PL}.', 'A tactical switch from {T}, {PL}.', 'New plan for {T}: {PL}.', '{T} adapt their game, {PL}.'] },
    changeoverGame: { pri: 1, cd: 15, lines: [
      'The players change ends and take a drink.', 'Changeover, a chance to towel off and talk tactics.', 'They swap sides now.', 'A short break as the teams change ends.'] },
    changeoverSet: { pri: 1, cd: 15, lines: [
      'Set break: time to regroup and reset.', 'The players take a longer break between sets.', 'A breather between sets, the coaches will have plenty to say.', 'Set break, a chance to recover.'] },
    // ---- phases
    phIntro: { pri: 2, cd: 30, lines: [
      'Welcome to the Littleworld Jakarta Padel Cup!', 'Good day everyone, and welcome to the Littleworld Jakarta Padel Cup.',
      'We are live at the Littleworld Jakarta Padel Cup, the glass is gleaming and the crowd is ready.', 'Hello and welcome, we have a cracking doubles match in store.'] },
    phWalkon: { pri: 1, cd: 30, lines: [
      'And here come the players onto the court.', 'The players walk out to a warm reception.', 'Here they are, walking onto the court.', 'The teams make their way onto the court.'] },
    phIntros: { pri: 1, cd: 30, lines: [
      'Today it is {T} against {O}.', 'Let us meet the players: {T} versus {O}.', '{T} take on {O} in this one.', 'It is {T} versus {O}, and what a match-up.'] },
    phToss: { pri: 1, cd: 30, lines: [
      'A coin toss decides who serves first.', 'The coin toss is done, we are nearly ready.', 'Toss complete, choices made.', 'Sides and serve are decided with the toss.'] },
    phWarmup: { pri: 0, cd: 30, lines: [
      'The players are warming up their wrists and their walls.', 'A few minutes to find the rhythm on this surface.', 'Warm-up time, getting a feel for the glass.', 'They are testing the bounce of the glass before the first point.'] },
    phPlay: { pri: 2, cd: 30, lines: [
      'Here we go! {P} to serve first.', 'We are underway, {P} will serve.', 'Play! {P} steps up to serve.', 'And the match begins, {P} on serve.'] },
    phHandshake: { pri: 1, cd: 30, lines: [
      'Handshakes at the net, great sportsmanship.', 'The teams shake hands after a good contest.', 'Respect all round as they shake hands.', 'A warm handshake at the net.'] },
    phCeremony: { pri: 2, cd: 30, lines: [
      'Now the trophy ceremony.', 'Time for the champions to lift the trophy!', 'The trophy is presented to the winners.', 'Confetti and trophy time at the Littleworld Jakarta Padel Cup.'] },
    phMatchEnd: { pri: 2, cd: 30, lines: [
      'And that is the match!', 'The final point is played, what a match.', 'That is it, the match is decided.', 'It is all over.'] }
  };
  const INTER = {
    2: ['What a shot!', 'Oh, that is special!', 'Wow!', 'Beautiful!', 'Fantastic!'],
    3: ['Incredible!', 'Unbelievable scenes!', 'The crowd is on its feet!', 'Oh my goodness!', 'Absolutely sensational!']
  };
  const NO_INTER = { phIntro: 1, phWalkon: 1, phIntros: 1, phToss: 1, phWarmup: 1, phPlay: 1, phHandshake: 1, phCeremony: 1, phMatchEnd: 1, fatigue: 1, changeoverGame: 1, changeoverSet: 1,
    gameWon: 1, hold: 1, coach: 1, anticipate: 1, formationAttack: 1, formationDefend: 1, faultMesh: 1, faultNet: 1, unforced: 1, forced: 1, matchWon: 1, setWon: 1 };

  const COACH_LABEL = {
    aggressive: 'going aggressive', safe: 'playing safe and patient', controlNet: 'taking control of the net', defensive: 'sitting back in defence', targetMiddle: 'attacking the middle',
    targetGlass: 'using the glass', rushNet: 'rushing the net', focusOne: 'targeting one opponent', moreChiquitas: 'with more chiquitas', moreSmashes: 'looking for more smashes', balanced: 'back to a balanced game'
  };
  const SMASHES = { smashFlat: 1, smashKick: 1 };
  const RETREAT_REPLY = { lobDef: 1, lobOff: 1, wallDef: 1 };
  const GAP = [8, 5, 2.5, 0];     // minimal sim seconds between commentator lines by priority (x speed)
  const WINDOW = { span: 30, max: 6 };
  const MILESTONES = [20, 30, 40, 50, 60];

  // umpire fixed texts
  const FAULT_TEXT = { foot: 'Foot fault', long: 'Fault', wide: 'Fault', net: 'Fault', mesh: 'Fault', wallFirst: 'Fault' };
  const OUT_REASONS = { out: 1, ceiling: 1, lost: 1, wallFirst: 1, retrieveFailed: 1 };

  // ---------------------------------------------------------------- engine
  function makeEngine(seed) {
    const rng = HPO.makeRng((seed || 1) >>> 0);
    const E = {
      rng: rng, recent: [], lastIdx: {}, cdKey: {}, lastLine: null, window: [], log: [], clockFn: null, speedFn: null, stats: { emitted: 0, dropped: 0 },

      clock() { return E.clockFn ? E.clockFn() : 0; },
      speed() { const s = E.speedFn ? E.speedFn() : 1; return s > 1 ? s : 1; },
      reset(seed2) { E.recent.length = 0; E.lastIdx = {}; E.cdKey = {}; E.lastLine = null; E.window.length = 0; if (seed2 !== undefined) rng.seed(seed2 >>> 0); },

      // pick a template index, avoiding the previous 2 for this key and any exact text recently said
      pick(key, vars) {
        const pool = L().list('commentary.' + key, POOL[key].lines), n = pool.length, hist = E.lastIdx[key] || [];
        const avoid = hist.slice(-Math.min(2, n - 2 > 0 ? 2 : 1));
        let idx = -1, text = '';
        for (let tries = 0; tries < 12; tries++) {
          const i = rng.int(0, n - 1);
          if (avoid.indexOf(i) >= 0) continue;
          const tx = fmt(pool[i], vars);
          if (E.recent.indexOf(tx) >= 0) continue;
          idx = i; text = tx; break;
        }
        if (idx < 0) { for (let i = 0; i < n; i++) { if (avoid.indexOf(i) < 0) { idx = i; text = fmt(pool[i], vars); break; } } }
        if (idx < 0) { idx = rng.int(0, n - 1); text = fmt(pool[idx], vars); }
        hist.push(idx); if (hist.length > 4) hist.shift(); E.lastIdx[key] = hist;
        return { idx: idx, text: text };
      },

      // generic emission with gating. opts.force bypasses cooldown/gap (never the duplicate rule)
      say(key, vars, s) {
        s = s || {};
        const def = POOL[key]; if (!def) return null;
        const t = s.t !== undefined ? s.t : E.clock(), spd = E.speed();
        const imp = s.importance | 0;
        const pri = Math.min(3, def.pri + (imp >= 2 ? 2 : imp >= 1 ? 1 : 0));
        if (!s.force) {
          if (E.cdKey[key] !== undefined && t - E.cdKey[key] < def.cd * spd) { E.stats.dropped++; return null; }
          const lc = E.lastLine;
          let g = GAP[pri] * spd;
          if (lc) { if (pri > lc.priority) g *= 0.35; if (s.sameTick && Math.abs(t - lc.t) < 0.02) g = 0; if (t - lc.t < g) { E.stats.dropped++; return null; } }
          if (pri < 3) {
            let c = 0; for (let i = 0; i < E.window.length; i++) if (t - E.window[i] < WINDOW.span * spd) c++;
            if (c >= WINDOW.max) { E.stats.dropped++; return null; }
          }
        }
        const pk = E.pick(key, vars);
        let text = pk.text;
        const ex = Math.min(3, (s.excite !== undefined ? s.excite : pri) + (s.rallyN >= 20 ? 1 : 0) + (imp >= 1 ? 1 : 0));
        if (ex >= 2 && !NO_INTER[key] && rng.chance(ex >= 3 ? 0.55 : 0.3)) {
          const ip = L().list('commentary.inter' + (ex >= 3 ? 3 : 2), INTER[ex >= 3 ? 3 : 2]);
          const w = ip[rng.int(0, ip.length - 1)];
          if (E.recent.indexOf(w) < 0) { text = w + ' ' + text; E.recent.push(w); }
        }
        text = cap(text);
        E.recent.push(text); if (E.recent.length > 16) E.recent.shift();
        E.cdKey[key] = t; E.lastLine = { t: t, priority: pri, key: key };
        E.window.push(t); if (E.window.length > 24) E.window.shift();
        const out = { text: text, key: key, priority: pri, voice: 'commentator', t: t, excite: ex, tpl: pk.idx, why: s.why || null };
        E.log.push(out); if (E.log.length > 400) E.log.shift();
        E.stats.emitted++;
        return out;
      },

      // umpire lines: fixed text, never gated by the commentator window; duplicate within 0.05 s dropped
      call(key, text, pri, s) {
        s = s || {};
        const t = s.t !== undefined ? s.t : E.clock();
        const last = E.cdKey['u:' + key];
        if (last !== undefined && t - last < 0.05 && E.cdKey['u:text:' + key] === text) return null;
        E.cdKey['u:' + key] = t; E.cdKey['u:text:' + key] = text;
        const out = { text: text, key: key, priority: pri, voice: 'umpire', t: t, excite: 0, tpl: 0, why: s.why || null, tone: s.tone || null };
        E.log.push(out); if (E.log.length > 400) E.log.shift();
        E.stats.emitted++;
        return out;
      },

      lineFor(sm) { return dispatch(E, sm); }
    };
    return E;
  }

  function fmt(tpl, v) {
    v = v || {};
    return tpl.replace(/\{(\w+)\}/g, function (m, k) {
      const x = v[k];
      return x === undefined || x === null ? m : String(x);
    });
  }
  function pron(g) { return g === 'F' ? { he: 'she', He: 'She', his: 'her', him: 'her' } : { he: 'he', He: 'He', his: 'his', him: 'him' }; }
  function varsOf(s) {
    const v = Object.assign({ P: s.P, T: s.T, O: s.O, N: s.N, S: s.S, FL: s.FL, PL: s.PL }, pron(s.gender));
    return v;
  }

  // ---------------------------------------------------------------- scoring words (umpire)
  function pointWord(n) { return ['love', 'fifteen', 'thirty', 'forty'][n]; }
  // st: rules MatchState; teamName(t) -> string. Returns the call text for the CURRENT state (server's score first).
  function scoreCall(st, teamName) {
    const sv = st.server ? st.server.team : 'A', rv = other(sv);
    const a = st.points[sv], b = st.points[rv];
    if (st._r && st._r.pts) return a === b ? _('{n} all', { n: cap(nw(a)) }) : cap(nw(a)) + '–' + nw(b);   // Blitz and Americano count plain points
    if (st.inTiebreak) {
      if (a === b) return a === 0 ? _('Tie-break, zero all') : _('{n} all', { n: cap(nw(a)) });
      return cap(nw(a)) + '–' + nw(b);
    }
    if (st.goldenPoint) return _('Golden point, receivers choose the side');
    if (a >= 3 && b >= 3) {
      if (a === b) return 'Deuce';
      return _('Advantage {team}', { team: teamName(a > b ? sv : rv) });
    }
    if (a === b) return a === 1 && !(st._r && st._r.pts) ? _('Fifteen all') : _('{word} all', { word: cap(pointWord(a)) });
    return cap(pointWord(a)) + '–' + pointWord(b);
  }
  function gamesPhrase(sc) {
    const hi = Math.max(sc.A, sc.B), lo = Math.min(sc.A, sc.B);
    return hi === lo ? _('Games {n} all', { n: nw(hi) }) : _('Games {hi}–{lo}', { hi: nw(hi), lo: nw(lo) });
  }
  function setScoreWords(e) {
    const s = nw(e.A) + '–' + nw(e.B);
    return e.tb ? _('{score}, tie-break {n}', { score: s, n: nw(Math.min(e.tb.A, e.tb.B)) }) : s;
  }

  // ---------------------------------------------------------------- dispatch of summaries (pure)
  // summary types: shot, plan, rally, point, fault, let, flag, streak, gameStreak, game, set, match, tiebreak, fatigue, formation, coach, changeover, phase, score
  function dispatch(E, s) {
    if (!s || !s.type) return null;
    switch (s.type) {
      case 'shot': return shotLine(E, s);
      case 'plan': return SMASHES[s.shot] && s.intent !== 'defend' ? E.say('anticipate', varsOf(s), withWhy(s, { shot: s.shot })) : null;
      case 'rally': return MILESTONES.indexOf(s.n) >= 0 || s.force ? E.say('rallyN', varsOf(Object.assign({}, s, { N: s.n })), withWhy(s, { n: s.n, rallyN: s.n })) : null;
      case 'point': return pointLine(E, s);
      case 'fault': return faultLine(E, s);
      case 'let': return E.say('letNet', varsOf(s), withWhy(s, {}));
      case 'flag': return flagLine(E, s);
      case 'streak': return s.n >= 3 ? E.say('streak', varsOf(Object.assign({}, s, { N: s.n })), withWhy(s, { n: s.n, team: s.T })) : null;
      case 'gameStreak': return s.n >= 3 ? E.say('gameStreak', varsOf(Object.assign({}, s, { N: s.n })), withWhy(s, { n: s.n })) : null;
      case 'game': return s.tb ? null : E.say(s.broke ? 'breakOfServe' : s.hold ? 'hold' : 'gameWon', varsOf(s), withWhy(s, { broke: !!s.broke, hold: !!s.hold }));
      case 'set': return E.say('setWon', varsOf(s), withWhy(s, {}));
      case 'match': return E.say('matchWon', varsOf(s), withWhy(s, {}));
      case 'tiebreak': return E.say('tiebreak', varsOf(s), withWhy(s, {}));
      case 'fatigue': return E.say('fatigue', varsOf(s), withWhy(s, { fatigue: s.fatigue }));
      case 'formation': return E.say(s.formation === 'attack' ? 'formationAttack' : s.formation === 'defend' ? 'formationDefend' : null, varsOf(s), withWhy(s, { formation: s.formation }));
      case 'coach': return COACH_LABEL[s.preset] ? E.say('coach', varsOf(Object.assign({}, s, { PL: _(COACH_LABEL[s.preset]) })), withWhy(s, { preset: s.preset })) : null;
      case 'changeover': return E.say(s.kind === 'set' ? 'changeoverSet' : 'changeoverGame', varsOf(s), withWhy(s, { kind: s.kind }));
      case 'retrieval': return E.say('retrieval', varsOf(s), withWhy(s, { retrieval: true }));
      case 'timeout': return E.say('timeout', varsOf(s), withWhy(s, { timeout: true }));
      case 'phase': return phaseLine(E, s);
      case 'score': return E.call('score', s.text, s.priority === undefined ? 1 : s.priority, { t: s.t, tone: s.tone });
      case 'salim': return L().list('commentary.salim', null) ? E.say('salim', varsOf(s), withWhy(s, { salim: true })) : null;
      default: return null;
    }
  }
  function withWhy(s, why) { return { sameTick: s.sameTick, t: s.t, importance: s.importance, rallyN: s.rallyN, excite: s.excite, force: s.force, why: why }; }

  function phaseLine(E, s) {
    const map = { intro: 'phIntro', walkon: 'phWalkon', introductions: 'phIntros', toss: 'phToss', warmup: 'phWarmup', play: 'phPlay', handshake: 'phHandshake', ceremony: 'phCeremony', matchEnd: 'phMatchEnd' };
    const k = map[s.phase]; if (!k) return null;
    return E.say(k, varsOf(s), withWhy(s, { phase: s.phase }));
  }

  function faultLine(E, s) {
    const umpire = E.call('fault', s.kind === 'foot' ? FAULT_TEXT.foot : (FAULT_TEXT[s.kind] || 'Fault'), 2, { t: s.t, why: { kind: s.kind }, tone: 'fault' });
    return umpire;
  }

  function flagLine(E, s) {
    // s.flags {matchPoint,setPoint,breakPoint,golden}; team labels per flag in s.who
    const f = s.flags || {}, who = s.who || {};
    const w = (k) => who[k] || '';
    if (f.matchPoint) {
      if (f.golden) return E.say('goldenCombo', varsOf({ T: w('matchPoint'), FL: 'match point' }), withWhy(s, { flag: 'matchPoint', golden: true }));
      return E.say('matchPoint', varsOf({ T: w('matchPoint') }), withWhy(s, { flag: 'matchPoint' }));
    }
    if (f.setPoint) {
      if (f.golden) return E.say('goldenCombo', varsOf({ T: w('setPoint'), FL: 'set point' }), withWhy(s, { flag: 'setPoint', golden: true }));
      return E.say('setPoint', varsOf({ T: w('setPoint') }), withWhy(s, { flag: 'setPoint' }));
    }
    if (f.golden) return E.say('goldenPoint', varsOf({}), withWhy(s, { flag: 'golden', golden: true }));
    if (f.breakPoint) return E.say('breakPoint', varsOf({ T: w('breakPoint') }), withWhy(s, { flag: 'breakPoint' }));
    return null;
  }

  function shotLine(E, s) {
    const v = varsOf(s), q = s.quality === undefined ? 0.5 : s.quality, pr = s.pressure || 0;
    if (s.shot === 'serve') return null;
    // 1. wall recoveries
    if (s.afterWall && s.glass >= 3 && q >= 0.3) return E.say('tripleGlass', v, withWhy(s, { glass: s.glass, afterWall: true }));
    if (s.afterWall && s.glass >= 2 && q >= 0.3) return E.say('doubleGlass', v, withWhy(s, { glass: s.glass, afterWall: true }));
    // 2. smash coming back off the glass to the smasher's team
    if (SMASHES[s.prevShot] && s.sameTeamPrev && s.glass >= 1) {
      return E.say('smashBack', Object.assign({}, v, { P: s.P }), withWhy(s, { prevShot: s.prevShot, glass: s.glass, sameTeamPrev: true }));
    }
    // 3. defensive lob under pressure
    if (s.shot === 'lobDef' && pr >= 0.5) return E.say('lobDefPressure', v, withWhy(s, { pressure: pr }));
    // 4. previous chiquita forced the reply to be defensive (named after the chiquita player)
    if (s.prevShot === 'chiquita' && !s.sameTeamPrev && s.prevQuality >= 0.5 && (RETREAT_REPLY[s.shot] || s.depth >= 6.5)) {
      return E.say('chiquitaForce', Object.assign({}, v, { P: s.prevP || s.P, O: s.T }), withWhy(s, { prevShot: 'chiquita', reply: s.shot, depth: s.depth }));
    }
    // 5. wall streak
    if (s.wallStreak >= 3) return E.say('wallStreak', v, withWhy(s, { wallStreak: s.wallStreak }));
    // 6. signature shots
    if (s.shot === 'bandeja' && q >= 0.6 && s.depth <= 5.6) return E.say('bandeja', v, withWhy(s, { quality: q, depth: s.depth }));
    if (s.shot === 'dejada' && q >= 0.55) return E.say('dejada', v, withWhy(s, { quality: q }));
    if (s.shot === 'vibora' && q >= 0.6) return E.say('vibora', v, withWhy(s, { quality: q }));
    if (SMASHES[s.shot] && s.speed >= 26 && q >= 0.5) return E.say('smashPower', v, withWhy(s, { speed: s.speed }));
    return null;
  }

  function pointLine(E, s) {
    const v = varsOf(s), imp = s.importance | 0, last = s.lastShot || '';
    const base = { t: s.t, importance: imp, rallyN: s.rallyLen, force: s.force };
    const W = Object.assign({ kind: s.kind, reason: s.reason, rallyLen: s.rallyLen, lastShot: last }, {});
    let r = null;
    if (s.kind === 'ace') return E.say('ace', v, Object.assign(base, { why: W }));
    if (s.kind === 'doubleFault') return E.say('doubleFault', v, Object.assign(base, { why: W }));
    if (s.saved) {
      const key = s.saved === 'match' ? 'savedMatch' : s.saved === 'set' ? 'savedSet' : 'savedBreak';
      r = E.say(key, v, Object.assign({}, base, { why: Object.assign({ saved: s.saved }, W) }));
      if (r) return r;
    }
    if (s.golden && !s.saved) {
      r = E.say('goldenWon', v, Object.assign({}, base, { why: Object.assign({ golden: true }, W) }));
      if (r) return r;
    }
    if (s.rallyLen >= 15) {
      r = E.say('longRally', Object.assign({}, v, { N: s.rallyLen }), Object.assign({}, base, { why: W }));
      if (r) return r;
    }
    if (s.kind === 'winner') {
      let key = 'winner';
      if (SMASHES[last]) key = 'smashWinner';
      else if (s.endWalls >= 1 && s.endGlass >= 1) key = 'wallWinner';
      else if (last === 'lobOff' || last === 'lobDef') key = 'lobWinner';
      else if (last.indexOf('volley') === 0) key = 'volleyWinner';
      r = E.say(key, v, Object.assign({}, base, { why: Object.assign({ endGlass: s.endGlass | 0 }, W) }));
      if (r || key === 'winner') return r;
      return E.say('winner', v, Object.assign({}, base, { why: W }));
    }
    if (s.kind === 'unforced') return E.say('unforced', v, Object.assign({}, base, { why: W }));
    if (s.kind === 'forced') return E.say('forced', v, Object.assign({}, base, { why: W }));
    return null;
  }

  // ---------------------------------------------------------------- event layer
  const DEFAULT = makeEngine(1);
  let ctx = null, handlers = [], teamNames = null;

  function mod() { return HPO.mod; }
  function nowT() { const m = mod().match; return m && typeof m.simTime === 'number' ? m.simTime : 0; }
  function speedNow() { const m = mod().match; return m && m.speed ? m.speed : 1; }
  DEFAULT.clockFn = nowT; DEFAULT.speedFn = speedNow;
  let engine = DEFAULT;

  function newCtx() {
    return {
      names: {}, short: {}, first: {}, nick: {}, gender: {}, teamOf: {}, labelOf: { A: _('Team {team}', { team: 'A' }), B: _('Team {team}', { team: 'B' }) },
      pt: null, bundle: {}, wallsRun: 0, glassRun: 0, pending: false,
      streak: { team: null, n: 0 }, gameStreak: { team: null, n: 0 }, flags: {}, tbAnnounced: false, fatiguePlayers: {}, lastFault: null, lastPointStart: null,
      lastNameUse: null, lastPointServer: null, lastCoach: null, letAt: -9
    };
  }
  function refreshNames() {
    const P = mod().players; if (!P || !P.list) return;
    ctx.labelOf = { A: _('Team {team}', { team: 'A' }), B: _('Team {team}', { team: 'B' }) };
    const byTeam = { A: [], B: [] };
    P.list.forEach(function (p) {
      ctx.names[p.id] = p.name; ctx.short[p.id] = p.id === 'p5' ? 'Annetta' : lastWord(p.name); ctx.first[p.id] = firstWord(p.name);
      ctx.nick[p.id] = p.def && p.def.nick || ''; ctx.gender[p.id] = p.def && p.def.gender || 'M'; ctx.teamOf[p.id] = p.team;
      if (byTeam[p.team]) byTeam[p.team].push(p.id === 'p5' ? 'Annetta' : lastWord(p.name));
    });
    ctx.pair = { A: pairOf(byTeam.A) || _('Team {team}', { team: 'A' }), B: pairOf(byTeam.B) || _('Team {team}', { team: 'B' }) };
  }
  function pName(id) {
    if (!id) return _('the player');
    if (!ctx.short[id]) return id;
    const r = engine.rng.next(); let n = ctx.short[id];
    if (r > 0.88 && ctx.nick[id] && ctx.lastNameUse !== id) n = ctx.nick[id];
    else if (r > 0.62) n = ctx.first[id];
    ctx.lastNameUse = id;
    return n;
  }
  const teamLbl = t => (ctx.pair && ctx.pair[t]) || _('Team {team}', { team: t });      // commentator: surnames
  const umpTeam = t => (teamNames && teamNames[t]) || _('Team {team}', { team: t });    // umpire: scoreboard label

  function emitLine(ln, feedKind, icon) {
    if (!ln) return ln;
    const ev = { text: ln.text, voice: ln.voice, priority: ln.priority, key: ln.key, tone: ln.tone || undefined, ts: Date.now(), t: ln.t };
    BUS.emit('speak', ev);
    const ui = mod().ui;
    if (ui && typeof ui.feed === 'function' && (ln.voice === 'commentator' || ln.priority >= 2)) {
      try { ui.feed({ t: ln.t, kind: ln.voice === 'umpire' ? 'umpire' : (feedKind || 'commentary'), text: ln.text, icon: icon || (ln.voice === 'umpire' ? 'whistle' : 'mic'), priority: ln.priority }); } catch (e) { HPO.util.logError('commentary.feed', e); }
    }
    if (C.onLine) { try { C.onLine(ln); } catch (e) { HPO.util.logError('commentary.onLine', e); } }
    return ln;
  }
  const T = () => nowT();
  const send = (s, icon) => emitLine(engine.lineFor(Object.assign({ t: T() }, s)), null, icon);

  // ---- per-point context
  function newPt() { return { n: 0, rallyN: 0, strokes: [], afterWallRun: 0, faults: 0, lastShotKind: '', retries: 0 }; }

  function onShotHit(e) {
    if (!ctx || !e) return;
    const P = mod().players, pl = P && P.get(e.playerId); if (!pl) return;
    if (!ctx.pt) ctx.pt = newPt();
    const pt = ctx.pt;
    if (e.shot === 'serve') { pt.rallyN = 1; pt.strokes.push({ pid: e.playerId, team: pl.team, kind: 'serve', q: e.quality, serve: true }); ctx.wallsRun = ctx.glassRun = 0; return; }
    const walls = ctx.wallsRun, glass = ctx.glassRun; ctx.wallsRun = ctx.glassRun = 0;
    if (e.retrieval) { pt.rallyN++; pt.strokes.push({ pid: e.playerId, team: pl.team, kind: e.shot, q: e.quality, pressure: e.pressure, retrieval: true }); send({ type: 'retrieval', P: pName(e.playerId), gender: pl.def && pl.def.gender }, 'info'); return; }
    pt.rallyN++;
    const prev = pt.strokes[pt.strokes.length - 1] || null;
    const spd = e.v ? Math.sqrt(e.v.x * e.v.x + e.v.y * e.v.y + e.v.z * e.v.z) : 0;
    const st = { pid: e.playerId, team: pl.team, kind: e.shot, q: e.quality, pressure: e.pressure, afterWall: !!e.afterWall, walls: walls, glass: glass, speed: spd };
    pt.strokes.push(st);
    pt.afterWallRun = e.afterWall ? pt.afterWallRun + 1 : 0;
    const opp = other(pl.team);
    const sm = {
      type: 'shot', shot: e.shot, P: pName(e.playerId), T: teamLbl(pl.team), O: teamLbl(opp), gender: pl.def && pl.def.gender, quality: e.quality, pressure: e.pressure, stretch: e.stretch,
      afterWall: !!e.afterWall, walls: walls, glass: glass, wallStreak: pt.afterWallRun, speed: spd, depth: Math.abs(e.p ? e.p.x : 0), rallyN: pt.rallyN,
      prevShot: prev && !prev.serve ? prev.kind : '', prevQuality: prev ? prev.q : 0, sameTeamPrev: !!prev && prev.team === pl.team, prevP: prev ? pName(prev.pid) : ''
    };
    // rally milestone first, then shot flavour (only one line per stroke)
    if (MILESTONES.indexOf(pt.rallyN) >= 0) { if (send({ type: 'rally', n: pt.rallyN, rallyN: pt.rallyN }, 'rally')) return; }
    send(sm);
  }

  function onShotPlanned(e) {
    if (!ctx || !e) return;
    const pl = mod().players && mod().players.get(e.playerId); if (!pl) return;
    if (!SMASHES[e.shot]) return;
    send({ type: 'plan', shot: e.shot, intent: e.intent, P: pName(e.playerId), gender: pl.def && pl.def.gender });
  }

  function onContact(e) {
    if (!ctx || !e) return;
    const s = e.surf;
    if (s === 'glassBack' || s === 'glassSide') { ctx.wallsRun++; ctx.glassRun++; }
    else if (s === 'meshBack' || s === 'meshSide' || s === 'door' || s === 'post') ctx.wallsRun++;
  }

  function onPointStart(e) {
    if (!ctx) return;
    flush();   // fallback if score:change did not arrive
    refreshNamesIfEmpty();
    if (e && e.retry) {
      if (ctx.lastFault && ctx.lastFault.kind !== 'let' && (e.faultCount | 0) === 1) send({ type: 'score', text: 'Second serve', priority: 1 });
      return;
    }
    ctx.pt = newPt(); ctx.pt.n = e ? e.pointNo : 0; ctx.wallsRun = ctx.glassRun = 0; ctx.lastFault = null;
    checkFatigue();
  }
  function refreshNamesIfEmpty() { if (!ctx.pair) refreshNames(); }

  function onFault(e) {
    if (!ctx || !e) return;
    ctx.lastFault = e;
    if (e.kind === 'let') { if (T() - ctx.letAt > 0.02) { ctx.letAt = T(); send({ type: 'score', text: 'Let', priority: 2, tone: 'let' }); send({ type: 'let' }); } return; }
    send({ type: 'fault', kind: e.kind });
    if (e.kind === 'mesh') { const ln = engine.say('faultMesh', {}, { t: T(), why: { kind: 'mesh' } }); emitLine(ln); }
    else if (e.kind === 'net') { const ln = engine.say('faultNet', {}, { t: T(), why: { kind: 'net' } }); emitLine(ln); }
  }
  function onLet() {
    if (!ctx) return;
    if (T() - ctx.letAt > 0.02) { ctx.letAt = T(); send({ type: 'score', text: 'Let', priority: 2, tone: 'let' }); send({ type: 'let' }); }
  }

  function onPointEnd(e) {
    if (!ctx || !e) return;
    if (!ctx.pt) ctx.pt = newPt();
    const pt = ctx.pt;
    ctx.bundle.point = { e: e, pt: pt, endWalls: ctx.wallsRun, endGlass: ctx.glassRun, flagsAtEnd: Object.assign({}, ctx.flags), t: T() };
    ctx.pending = true;
    // streak bookkeeping
    if (ctx.streak.team === e.winner) ctx.streak.n++; else { ctx.streak.team = e.winner; ctx.streak.n = 1; }
    ctx.wallsRun = ctx.glassRun = 0;
  }
  function onGameEnd(e) { if (ctx) { ctx.bundle.game = e; ctx.pending = true; } }
  function onSetEnd(e) { if (ctx) { ctx.bundle.set = e; ctx.pending = true; } }
  function onMatchEnd(e) { if (ctx) { ctx.bundle.match = e; ctx.pending = true; } }
  function onFlag(e) { if (ctx) { ctx.bundle.flag = e; ctx.pending = true; } }

  function onScoreChange(e) { if (!ctx) return; flush(e && e.state); }

  // ---- the post-point announcements, run once the state is fully updated
  function flush(stIn) {
    if (!ctx || !ctx.pending) return;
    const b = ctx.bundle; ctx.bundle = {}; ctx.pending = false;
    const R = mod().rules, st = stIn || (R && R.state);
    if (!ctx.pair) refreshNames();
    const flagsPrev = b.point ? b.point.flagsAtEnd : ctx.flags;

    if (b.point) {
      const e = b.point.e, pt = b.point.pt, t = b.point.t;
      const hitterTeam = e.hitter ? ctx.teamOf[e.hitter] : null;
      const imp = b.match ? 2 : b.set ? 2 : b.game ? 1 : (flagsPrev.matchPoint || flagsPrev.setPoint || flagsPrev.golden) ? 1 : 0;
      // umpire: out / double fault
      if (e.kind === 'doubleFault') send({ type: 'score', text: 'Double fault', priority: 2, t: t, tone: 'out' });
      else if (OUT_REASONS[e.reason] && e.kind !== 'ace' && e.kind !== 'doubleFault') send({ type: 'score', text: 'Out', priority: 2, t: t, tone: 'out' });
      // who saved what: the team holding the flag did not win the point
      let saved = null;
      if (flagsPrev.matchPoint && flagsPrev.matchPoint !== e.winner) saved = 'match';
      else if (flagsPrev.setPoint && flagsPrev.setPoint !== e.winner) saved = 'set';
      else if (flagsPrev.breakPoint && flagsPrev.breakPoint !== e.winner && !flagsPrev.golden) saved = 'break';
      const erring = (e.kind === 'forced' || e.kind === 'unforced' || e.kind === 'doubleFault');
      const hitterId = e.hitter || (pt.strokes.length ? pt.strokes[pt.strokes.length - 1].pid : null);
      const hitterT = hitterTeam || (hitterId ? ctx.teamOf[hitterId] : null);
      const winTeam = e.winner;
      const sm = {
        type: 'point', kind: e.kind, reason: e.reason, rallyLen: e.rallyLen, lastShot: (e.shotKinds && e.shotKinds.length ? e.shotKinds[e.shotKinds.length - 1] : ''),
        P: hitterId ? pName(hitterId) : teamLbl(winTeam), gender: hitterId ? ctx.gender[hitterId] : 'M',
        T: teamLbl(winTeam), O: teamLbl(other(winTeam)), endWalls: b.point.endWalls, endGlass: b.point.endGlass, importance: imp, saved: saved, golden: !!flagsPrev.golden, t: t
      };
      if (erring) { sm.P = pName(e.kind === 'doubleFault' ? (st && st.server && st.server.playerId) || hitterId : hitterId); }
      if (e.kind === 'doubleFault' && pt.strokes.length === 0 && ctx.lastPointServer) sm.P = pName(ctx.lastPointServer);
      sm.why0 = { hitterT: hitterT };
      send(sm, 'point');
    }

    // umpire call: game / set / match / score
    const names = ctx.names;
    if (b.match) {
      const sets = b.match.sets || (st && st.sets) || [];
      send({ type: 'score', text: _('Game, set and match, {team}. {sets}.', { team: umpTeam(b.match.winner), sets: cap(sets.map(setScoreWords).join(', ')) }), priority: 3, tone: 'set' }, 'trophy');
    } else if (b.set) {
      const n = b.set.setNo || (st ? st.sets.length : 1);
      const score = _('{hi} games to {lo}', { hi: nw(Math.max(b.set.score.A, b.set.score.B)), lo: nw(Math.min(b.set.score.A, b.set.score.B)) }) + (b.set.score.tb ? ' (tie-break)' : '');
      send({ type: 'score', text: _('Game and {ord} set, {team}, {score}.', { ord: ord(n), team: umpTeam(b.set.winner), score: score }), priority: 3, tone: 'set' }, 'flag');
    } else if (b.game) {
      const sc = b.game.score, w = b.game.winner, lead = sc.A === sc.B ? null : sc.A > sc.B ? 'A' : 'B';
      const games = gamesPhrase(sc) + (lead && lead !== w && !b.game.tb ? ' ' + _('to {team}', { team: umpTeam(lead) }) : '');
      send({ type: 'score', text: _('Game, {team}. {games}.', { team: umpTeam(w), games: games }), priority: 2, tone: 'game' }, 'flag');
    } else if (st && b.point) {
      send({ type: 'score', text: scoreCall(st, umpTeam), priority: st.goldenPoint ? 3 : 1 });
      // 15-15 is "salim" (sama lima) in Indonesia; the commentator joke only exists in a dictionary that has the lines
      if (!st.inTiebreak && !(st._r && st._r.pts) && st.points.A === 1 && st.points.B === 1) send({ type: 'salim', sameTick: true });
    }

    // commentator extras: game / set / match
    if (b.game) {
      const gw = b.game.winner;
      if (ctx.gameStreak.team === gw) ctx.gameStreak.n++; else { ctx.gameStreak.team = gw; ctx.gameStreak.n = 1; }
      const lg = st && st.log && st.log.length ? st.log[st.log.length - 1] : null;
      const hold = lg ? lg.serverTeam === gw : false, broke = lg ? lg.serverTeam !== gw : false;
      const sc = b.game.score;
      if (!b.set && !b.match) {
        const g = send({ type: 'game', T: teamLbl(gw), S: sc.A === sc.B ? _('{n} all', { n: nw(sc.A) }) : nw(Math.max(sc.A, sc.B)) + '–' + nw(Math.min(sc.A, sc.B)), tb: b.game.tb, hold: hold && !b.game.tb, broke: broke && !b.game.tb, importance: 0, sameTick: true }, 'flag');
        if (!g && ctx.gameStreak.n >= 3) send({ type: 'gameStreak', T: teamLbl(gw), n: ctx.gameStreak.n, sameTick: true });
      }
    }
    if (b.set) {
      const sc = b.set.score, w = b.set.winner;
      send({ type: 'set', T: teamLbl(w), S: nw(Math.max(sc.A, sc.B)) + '–' + nw(Math.min(sc.A, sc.B)), force: false, importance: 0 }, 'flag');
      ctx.tbAnnounced = false;
    }
    if (b.match) {
      const sets = b.match.sets || [];
      send({ type: 'match', T: teamLbl(b.match.winner), S: sets.map(function (x) { return nw(x.A) + '–' + nw(x.B); }).join(', '), force: true }, 'trophy');
    }
    // flags (after the score call)
    if (b.flag) {
      const f = b.flag, who = { matchPoint: f.matchPoint ? teamLbl(f.matchPoint) : '', setPoint: f.setPoint ? teamLbl(f.setPoint) : '', breakPoint: f.breakPoint ? teamLbl(f.breakPoint) : '' };
      ctx.flags = { matchPoint: f.matchPoint, setPoint: f.setPoint, breakPoint: f.breakPoint, golden: f.golden };
      send({ type: 'flag', flags: f, who: who }, 'flag');
    }
    // tie-break start
    if (st && st.inTiebreak && st.points.A === 0 && st.points.B === 0 && !ctx.tbAnnounced && !st.over) {
      ctx.tbAnnounced = true;
      send({ type: 'tiebreak' }, 'flag');
    }
    // streaks (only when the point did not end a game: those lines are more important)
    if (b.point && !b.game && ctx.streak.n >= 3 && [3, 5, 7, 9, 11].indexOf(ctx.streak.n) >= 0) {
      send({ type: 'streak', T: teamLbl(ctx.streak.team), n: ctx.streak.n, sameTick: true });
    }
  }

  function checkFatigue() {
    const P = mod().players; if (!P || !P.list) return;
    const TH = C.fatigueThreshold;
    P.list.forEach(function (p) {
      const f = p.fatigue || 0, was = ctx.fatiguePlayers[p.id];
      if (f >= TH && !was) {
        const ln = engine.lineFor({ type: 'fatigue', P: pName(p.id), T: teamLbl(p.team), gender: p.def && p.def.gender, fatigue: f, t: T() });
        if (ln) { ctx.fatiguePlayers[p.id] = T(); emitLine(ln, 'info', 'heat'); }
      } else if (was && f < TH * 0.5) delete ctx.fatiguePlayers[p.id];
    });
  }

  function onFormation(e) {
    if (!ctx || !e || (e.formation !== 'attack' && e.formation !== 'defend')) return;
    if (!ctx.pt || ctx.pt.rallyN < 3) return;
    send({ type: 'formation', formation: e.formation, T: teamLbl(e.team), team: e.team });
  }
  function onCoach(e) {
    if (!ctx || !e || !e.orders) return;
    const sig = e.team + ':' + e.orders.preset;
    if (ctx.lastCoach === sig) return;
    ctx.lastCoach = sig;
    const m = mod().match;
    if (m && (m.phase === 'idle' || m.phase === 'intro')) return;
    send({ type: 'coach', preset: e.orders.preset, T: teamLbl(e.team) }, 'coach');
  }
  function onChangeover(e) {
    if (!ctx || !e) return;
    flush();
    send({ type: 'changeover', kind: e.kind }, 'info');
  }
  function onPhase(e) {
    if (!e) return;
    if (e.phase === 'intro' && e.prev !== 'intro') { resetContext(); }
    if (!ctx) return;
    if (e.phase === 'intro' || !ctx.pair) refreshNames();
    const sm = { type: 'phase', phase: e.phase };
    if (e.phase === 'introductions') { sm.T = teamLbl('A'); sm.O = teamLbl('B'); }
    if (e.phase === 'play') {
      const R = mod().rules, sid = R && R.state && R.state.server ? R.state.server.playerId : null;
      sm.P = sid ? ctx.names[sid] || sid : _('the server');
      if (sid) ctx.lastPointServer = sid;
    }
    send(sm, 'info');
  }
  function onSpeak(e) {
    if (!ctx || !e || e.key || e.voice !== 'umpire') return;
    if (e.kind === 'timeout') send({ type: 'timeout' }, 'info');
  }
  function onServeHit(e) { if (ctx && e && e.playerId) ctx.lastPointServer = e.playerId; }

  function resetContext(seed) {
    ctx = newCtx();
    const m = mod().match, sd = seed !== undefined ? seed : (m && m.cfg && m.cfg.seed) || 1;
    engine.reset(((sd * 2654435761) >>> 0) ^ 0x51ED);
    refreshNames();
  }

  // ---------------------------------------------------------------- public API
  const C = HPO.mod.commentary = {
    fatigueThreshold: 0.02,
    onLine: null,
    POOL: POOL, makeEngine: makeEngine, scoreCall: scoreCall, MILESTONES: MILESTONES,
    get engine() { return engine; },
    get log() { return engine.log; },
    // pure: summary -> {text,key,priority,voice,why,t} | null (gated by cooldowns / rate limit of the default engine)
    lineFor(summary) { return DEFAULT.lineFor(summary); },
    setTeamNames(a, b) { teamNames = a ? { A: a, B: b } : null; },
    status() { return { attached: !!ctx, stats: engine.stats, lines: engine.log.length, last: engine.lastLine }; },
    // use a private engine (tests): returns previous
    useEngine(e) { const p = engine; engine = e || DEFAULT; if (e) { e.clockFn = e.clockFn || nowT; e.speedFn = e.speedFn || speedNow; } return p; },
    reset(seed) { resetContext(seed); },
    detach() {
      handlers.forEach(function (h) { BUS.off(h[0], h[1]); });
      handlers = []; ctx = null;
    },
    init() {
      C.detach();
      const on = function (name, fn) { handlers.push([name, BUS.on(name, fn)]); };
      resetContext();
      on('shot:hit', onShotHit); on('shot:planned', onShotPlanned); on('ball:contact', onContact);
      on('point:start', onPointStart); on('point:end', onPointEnd); on('fault', onFault); on('let', onLet);
      on('flag:update', onFlag); on('game:end', onGameEnd); on('set:end', onSetEnd); on('match:end', onMatchEnd); on('score:change', onScoreChange);
      on('match:phase', onPhase); on('ai:formation', onFormation); on('coach:change', onCoach);
      on('speak', onSpeak); on('changeover:start', onChangeover); on('serve:hit', onServeHit);
      on('match:new', function () { resetContext(); });
    }
  };
})(HPO);
