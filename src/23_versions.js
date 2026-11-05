// Version history shown at the bottom of the Studio panel. Newest first; add the new version for every shipped change (no notes).
// Version = build date (YYYY.MM.DD), plus .N when more than one version ships the same day.
(function (HPO) {
  'use strict';
  const VERSIONS = ['2026.11.05.5', '2026.11.05.4', '2026.11.05.3', '2026.11.05.2', '2026.11.05.1', '2026.11.03', '2026.11.02'];
  const foot = document.getElementById('foot');
  if (!foot) return;
  const date = v => {
    const p = v.split('.');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const box = el('details', 'versions'), list = el('ul');
  box.open = true;
  box.appendChild(el('summary', '', 'Version ' + VERSIONS[0] + ' · built ' + date(VERSIONS[0])));
  VERSIONS.forEach(x => {
    const li = el('li');
    li.appendChild(el('b', '', x));
    li.appendChild(el('span', 'vdate', ' · ' + date(x)));
    list.appendChild(li);
  });
  box.appendChild(list);
  foot.appendChild(box);
})(HPO);
