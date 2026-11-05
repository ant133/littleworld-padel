// Bahasa Indonesia: umpire calls, number words, ceremony announcements, match errors (docs/I18N.md). The pools of commentary lines are in 00_lang_id_pools.js.
// Point calls (love, fifteen, thirty, forty, deuce, advantage), fault/out/let and golden point stay English; 15-15 is "Salim" (sama lima).
(function (HPO) {
  'use strict';
  HPO.mod.i18n.register('id', {
    // fallbacks used inside commentary lines ({P}, {T}) and phrase joins
    'the player': 'pemain itu',
    'the server': 'si server',
    'the world': 'dunia',
    '{a} and {b}': '{a} dan {b}',

    // umpire: score calls
    'Fifteen all': 'Salim',
    '{word} all': '{word} all',
    '{n} all': '{n} sama',
    'Tie-break, zero all': 'Tie-break, nol sama',
    'Golden point, receivers choose the side': 'Golden point, receiver memilih sisi',
    'Advantage {team}': 'Advantage {team}',
    'Games {n} all': 'Game {n} sama',
    'Games {hi}–{lo}': 'Game {hi}–{lo}',
    'to {team}': 'untuk {team}',
    '{score}, tie-break {n}': '{score}, tie-break {n}',
    'Game, {team}. {games}.': 'Game, {team}. {games}.',
    '{hi} games to {lo}': '{hi} game lawan {lo}',
    'Game and {ord} set, {team}, {score}.': 'Game dan set {ord}, {team}, {score}.',
    'Game, set and match, {team}. {sets}.': 'Game, set, dan match, {team}. {sets}.',

    // number and ordinal words (looked up as num.<word> / ord.<word>)
    'num.zero': 'nol', 'num.one': 'satu', 'num.two': 'dua', 'num.three': 'tiga', 'num.four': 'empat', 'num.five': 'lima', 'num.six': 'enam', 'num.seven': 'tujuh',
    'num.eight': 'delapan', 'num.nine': 'sembilan', 'num.ten': 'sepuluh', 'num.eleven': 'sebelas', 'num.twelve': 'dua belas', 'num.thirteen': 'tiga belas',
    'num.fourteen': 'empat belas', 'num.fifteen': 'lima belas', 'num.sixteen': 'enam belas', 'num.seventeen': 'tujuh belas', 'num.eighteen': 'delapan belas',
    'num.nineteen': 'sembilan belas', 'num.twenty': 'dua puluh',
    'ord.first': 'pertama', 'ord.second': 'kedua', 'ord.third': 'ketiga', 'ord.fourth': 'keempat', 'ord.fifth': 'kelima',

    // match flow (spoken and shown in the feed)
    'Challenge from Team {team}. The call is overturned.': 'Challenge dari Team {team}. Keputusan dibatalkan.',
    'Challenge from Team {team}. The call stands.': 'Challenge dari Team {team}. Keputusan tetap.',
    'Tactical timeout, Team {team}.': 'Timeout taktik, Team {team}.',
    'Choose four different players eligible for this match type.': 'Pilih empat pemain berbeda yang sesuai dengan jenis pertandingan ini.',
    'Mixed teams require one woman and one man.': 'Tim campuran harus terdiri dari satu perempuan dan satu laki-laki.',

    // ceremony announcements
    'Welcome to the club': 'Selamat datang di klub',
    'Ladies and gentlemen, welcome to the {title}.': 'Hadirin sekalian, selamat datang di {title}.',
    'First,': 'Pertama:',
    'And their opponents.': 'Lalu lawan mereka.',
    'From {country}, ranked number {rank} in the world: {name}{nick}.': 'Dari {country}, peringkat {rank} dunia: {name}{nick}.',
    'World #{rank}': 'Peringkat dunia #{rank}',
    'Please welcome both teams.': 'Mari sambut kedua tim.',
    'Team {team} has won the toss and chooses to serve.': 'Team {team} menang undian koin dan memilih servis lebih dulu.',
    'Team {team} serves first': 'Team {team} servis duluan',
    'Game, set and match. {team} win {sets}.': 'Game, set, dan match. {team} menang {sets}.',
    'CHAMPIONS': 'JUARA',
    'Ladies and gentlemen, your {title} champions: {team}.': 'Hadirin sekalian, inilah juara {title}: {team}.',
    'Congratulations to the champions!': 'Selamat untuk sang juara!'
  }, 'id-ID');
})(HPO);
