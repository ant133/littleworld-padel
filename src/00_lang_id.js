// Bahasa Indonesia dictionary (docs/I18N.md). Opt-in with ?lang=id; English is the default and the fallback for every key left out.
// Keys: the English text exactly as in the code ({name} tokens must stay in the translation), or 'commentary.<pool>' / 'umpire.<name>' with a string or an array of lines.
// The dictionary is split by area, all registered into the same 'id' language: this file (shared words), 00_lang_id_studio.js, 00_lang_id_play.js, 00_lang_id_commentary.js.
//
// House style: casual and friendly like annetta.dev, "kamu" (never "Anda"), short sentences.
// Padel and tennis terms stay as they are, because players and commentators use them in Indonesia too: smash, lob, bandeja, bajada, chiquita, vibora, dejada, drop shot,
// volley, ace, fault, double fault, let, net, out, serve, return, rally, winner, unforced/forced error, deuce, advantage, golden point, tie-break, set, game, match,
// match point, set point, break point, break, hold, timeout, challenge, Eagle Eye. Point calls (love, fifteen, thirty, forty) stay English, except 15-15, which Indonesians call
// "salim" (short for "sama lima", slang for "lima belas sama"): the umpire says "Salim" and commentary jokes about it.
// In-world texts (LED screen, scoreboards, signs, banners, court floor, replay line-call sprite) stay English on purpose: cosmetic, not needed to play.
(function (HPO) {
  'use strict';
  HPO.mod.i18n.register('id', {
    'Made in Jakarta with code, curiosity, and no spare towel.': 'Made in Jakarta with code, curiosity, and no spare towel.',
    'Pause': 'Pause',
    'Resume': 'Resume',
    'Team {team}': 'Team {team}',
    'Back': 'Kembali',
    'Next': 'Lanjut',
    'Skip': 'Lewati',
    'Auto': 'Auto',
    'On': 'On',
    'Off': 'Off',
    'None': 'None',
    'Day': 'Siang',
    'Dusk': 'Sore',
    'Night': 'Malam',
    'Back to annetta.dev': 'Kembali ke annetta.dev',
    '← annetta.dev': '← annetta.dev',
    'Studio': 'Studio',
    'Annetta': 'Annetta',
    // country names are shown through _(country.name); the English name (also what IndexedDB stores for saved players) is the key
    'Indonesia': 'Indonesia', 'Spain': 'Spanyol', 'Argentina': 'Argentina', 'Netherlands': 'Belanda', 'Japan': 'Jepang', 'Sweden': 'Swedia', 'Italy': 'Italia',
    'Brazil': 'Brasil', 'France': 'Prancis', 'Germany': 'Jerman', 'Portugal': 'Portugal', 'Chile': 'Chili', 'Australia': 'Australia', 'United Kingdom': 'Inggris'
  }, 'id-ID');
})(HPO);
