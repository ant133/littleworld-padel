// i18n: dictionary module (docs/I18N.md). The English text in the code is the key, so anything a dictionary does not cover stays English and a language can be filled in bit by bit.
// A language is a flat object added with register(): UI strings use their English text as key ({name} tokens allowed), pools of lines use a dotted key and an array.
// No DOM or THREE access at load time; headless tests load it with the sim.
(function (HPO) {
  'use strict';
  const dicts = {}, miss = {};
  const want = typeof location !== 'undefined' && location.search ? new URLSearchParams(location.search).get('lang') : null;

  const fmt = (s, v) => v ? s.replace(/\{(\w+)\}/g, (m, k) => v[k] === undefined || v[k] === null ? m : String(v[k])) : s;
  function raw(key) {
    const d = dicts[I.lang], s = d && d.strings[key];
    if ((s === undefined || s === '') && I.lang !== 'en') miss[key] = 1;
    return s;
  }

  const I = HPO.mod.i18n = {
    lang: 'en', locale: 'en-GB',
    // language comes from ?lang=id only; a changed language needs a reload because the panels are built once (ponytail: no live re-render)
    register(lang, strings, locale) {
      const d = dicts[lang] || (dicts[lang] = { strings: {}, locale: locale || lang });
      Object.assign(d.strings, strings); if (locale) d.locale = locale;
      if (lang === want) I.setLang(lang, true);
      return I;
    },
    setLang(lang, quiet) {
      if (lang !== 'en' && !dicts[lang]) return false;
      I.lang = lang; I.locale = lang === 'en' ? 'en-GB' : dicts[lang].locale;
      if (typeof document !== 'undefined') document.documentElement.lang = lang;
      if (!quiet) HPO.BUS.emit('ui:setting', { key: 'lang', value: lang });
      return true;
    },
    languages() { return ['en'].concat(Object.keys(dicts)); },
    strings(lang) { return dicts[lang] ? dicts[lang].strings : {}; },
    // English keys asked for while a non-English language was active and not translated: play through, then read this to see what is left
    missing() { return Object.keys(miss); },
    t(key, vars) { const s = raw(key); return fmt(typeof s === 'string' && s !== '' ? s : key, vars); },
    // a pool of lines (commentary): the translated array, else the English one passed in
    list(key, english) { const s = raw(key); return Array.isArray(s) && s.length ? s : english; }
  };
  HPO.t = I.t;
})(HPO);
