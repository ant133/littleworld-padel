// Headless tests for src/00_i18n.js: lookup, fallback, tokens, pools, and a parity check for every registered dictionary (token names and commentary pool keys).
'use strict';
const assert = require('assert');
const HPO = require('./load').load();
const I = HPO.mod.i18n, tok = s => (String(s).match(/\{\w+\}/g) || []).sort().join();
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

ok(I.lang === 'en' && HPO.t === I.t, 'English by default, HPO.t is the lookup');
ok(HPO.t('Pause') === 'Pause' && HPO.t('Hi {name}', { name: 'Ayu' }) === 'Hi Ayu' && HPO.t('Hi {name}') === 'Hi {name}', 'English passes through, tokens fill, unknown token stays');
ok(!I.setLang('zz'), 'unknown language refused');

I.register('xx', { 'Pause': 'Jeda', 'Hi {name}': 'Halo {name}', 'Empty': '', 'commentary.hold': ['a', 'b'] }, 'xx-XX');
let ev = null; HPO.BUS.on('ui:setting', e => { ev = e; });
ok(I.setLang('xx') && I.lang === 'xx' && I.locale === 'xx-XX' && ev && ev.key === 'lang' && ev.value === 'xx', 'switch language, announce on ui:setting');
ok(HPO.t('Pause') === 'Jeda' && HPO.t('Hi {name}', { name: 'Ayu' }) === 'Halo Ayu', 'translated, tokens survive');
ok(HPO.t('Resume') === 'Resume' && HPO.t('Empty') === 'Empty', 'untranslated and empty entries fall back to English');
ok(I.missing().join() === 'Resume,Empty', 'missing() lists what fell back: ' + I.missing());
ok(I.list('commentary.hold', ['x']).join() === 'a,b' && I.list('commentary.nope', ['x']).join() === 'x', 'pools: translated array, else English');
ok(I.languages().join() === 'en,id,xx', 'languages(): ' + I.languages());
I.setLang('en');
ok(HPO.t('Pause') === 'Pause' && I.locale === 'en-GB' && !I.missing().includes('Pause'), 'back to English');

// every shipped dictionary: tokens in a translation must match the English key; commentary pools must exist and only use tokens the English pool uses
const POOL = HPO.mod.commentary.POOL;
I.languages().filter(l => l !== 'en' && l !== 'xx').forEach(function (lang) {
  const d = I.strings(lang);
  Object.keys(d).forEach(function (k) {
    const m = /^commentary\.(\w+)$/.exec(k), v = d[k];
    if (m) {
      const extra = /^(inter[23]|salim)$/.test(m[1]);   // not engine pools: interjections and the id-only salim jokes carry no tokens
      ok(POOL[m[1]] || extra, lang + ': unknown pool ' + k);
      const allowed = new Set(extra ? [] : POOL[m[1]].lines.join(' ').match(/\{\w+\}/g) || []);
      ok(Array.isArray(v) && v.length > 0, lang + ': ' + k + ' needs an array of lines');
      v.forEach(l => (l.match(/\{\w+\}/g) || []).forEach(t => ok(allowed.has(t), lang + ': ' + k + ' uses ' + t + ' which the English pool does not')));
    } else if (v !== '') ok(tok(k) === tok(v), lang + ': tokens differ for "' + k + '"');
  });
});
// completeness: every _('literal') in src/ must have an Indonesian entry (table-driven labels are checked by the browser pass, see docs/I18N.md)
if (I.languages().includes('id')) {
  const fs = require('fs'), path = require('path'), dir = path.join(__dirname, '..', 'src'), d = I.strings('id'), lack = {};
  fs.readdirSync(dir).filter(f => f.endsWith('.js')).forEach(function (f) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8'), re = /(?<![\w$.])_\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
    let m; while ((m = re.exec(src))) { const k = Function('return ' + m[1])(); if (!(k in d) || d[k] === '') (lack[f] = lack[f] || []).push(k); }
  });
  const files = Object.keys(lack);
  files.forEach(f => console.log('  not translated in ' + f + ': ' + lack[f].map(k => JSON.stringify(k)).join(', ')));
  ok(!files.length, 'every _() literal has an Indonesian entry');
}
console.log('i18n_tests OK (' + n + ' checks, languages: ' + I.languages().join(', ') + ')');
