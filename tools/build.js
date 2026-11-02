// Build: node tools/build.js [--check]
//   dist/littleworld-online.html  : three.js r128 from cdnjs, everything else inline
//   dist/littleworld-offline.html : three.js inlined too (no required network)
//   --check : dupcheck + external-reference scan of the offline file + headless Chrome smoke test (no console errors, draw calls > 0)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');
const root = path.join(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const read = f => fs.readFileSync(f, 'utf8');
const kb = n => (n / 1024).toFixed(0) + ' KB';

const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="2" y="2" width="28" height="28" fill="#fff4b3" stroke="#123954" stroke-width="3"/>' +
  '<text x="7" y="23" font-family="Arial,sans-serif" font-weight="800" font-size="19" fill="#123954">A</text><text x="19" y="15" font-size="11" fill="#177dc5">✦</text></svg>');

// JS safe for inlining in <script>: no literal </script, no <!-- ; full-line // comments dropped (safe: no multi-line template literals in src).
function prepJs(code, name) {
  const out = code.split(/\r?\n/).filter(l => !/^\s*\/\/(?!#)/.test(l)).join('\n');
  return out.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function gameJs() {
  const files = fs.readdirSync(src).filter(f => /^\d.*\.js$/.test(f)).sort();
  const parts = [];
  for (const f of files) {
    const code = read(path.join(src, f));
    try { new vm.Script(code, { filename: f }); } catch (e) { throw new Error('Syntax error in src/' + f + ': ' + e.message); }
    parts.push('/* ' + f + ' */\n' + prepJs(code, f));
  }
  return { js: parts.join('\n'), n: files.length };
}

function page(threeTag, js, css, body) {
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="theme-color" content="#fffaf0">' +
    '<meta name="description" content="A physics-driven 3D pixel-art doubles padel diorama. Made in Jakarta.">' +
    '<title>Littleworld Jakarta Padel Cup</title>' +
    '<link rel="icon" href="' + FAVICON + '">' +
    '<style>\n' + css + '\n</style></head><body>\n' + body + '\n' + threeTag + '\n<script>\n' + js + '\n</script></body></html>\n';
}

function build() {
  const css = read(path.join(src, 'shell.css'));
  const body = read(path.join(src, 'shell.html'));
  const g = gameJs();
  fs.mkdirSync(dist, { recursive: true });
  const online = page('<script src="' + THREE_CDN + '"></script>', g.js, css, body);
  const three = prepJs(read(path.join(root, 'vendor', 'three.min.js')), 'three.min.js');
  // three's own license banner comment is kept (not a // line); only </script and <!-- are escaped.
  const offline = page('<script>\n' + three + '\n</script>', g.js, css, body);
  fs.writeFileSync(path.join(dist, 'littleworld-online.html'), online);
  fs.writeFileSync(path.join(dist, 'littleworld-offline.html'), offline);
  console.log('built ' + g.n + ' scripts');
  console.log('  online : ' + kb(Buffer.byteLength(online)) + '  dist/littleworld-online.html');
  console.log('  offline: ' + kb(Buffer.byteLength(offline)) + '  dist/littleworld-offline.html' + (Buffer.byteLength(offline) > 3 * 1024 * 1024 ? '  (OVER 3 MB TARGET)' : ''));
  return { online, offline };
}

async function check(offline) {
  let bad = 0;
  const fail = m => { bad++; console.log('FAIL ' + m); };
  const d = cp.spawnSync(process.execPath, [path.join(__dirname, 'dupcheck.js')], { encoding: 'utf8' });
  console.log(d.stdout.trim()); if (d.status !== 0) fail('dupcheck');
  // external references in the offline file
  const refs = {}; let m; const re = /https?:\/\/[^\s"'`)<>\\]+/g;
  while ((m = re.exec(offline))) { const u = m[0].replace(/[.,;]+$/, ''); refs[u] = (refs[u] || 0) + 1; }
  const list = Object.keys(refs).sort();
  console.log('http(s) references in offline file (' + list.length + '):');
  list.forEach(u => console.log('   ' + u + (refs[u] > 1 ? ' x' + refs[u] : '')));
  if (/<script[^>]+src=["']?https?:/i.test(offline)) fail('offline file has an external <script src>');
  if (/<link[^>]+href=["']?https?:/i.test(offline)) fail('offline file has a static external <link>');
  if (/@import\s+url\(\s*['"]?https?:/i.test(offline)) fail('offline file has a CSS @import from the network');
  // headless smoke test
  const B = require('./browser');
  const out = path.join(root, 'scratch', 'offline_check.png');
  const url = 'file:///' + path.join(dist, 'littleworld-offline.html').replace(/\\/g, '/') + '?auto=1';
  const r = await B.run({
    url, width: 1280, height: 800, waitMs: 5000, shots: [out],
    evals: [
      'JSON.stringify(HPO.mod.render.stats())',
      'document.title',
      'JSON.stringify(performance.getEntriesByType("resource").map(e=>e.name).filter(n=>!/^file:/.test(n)))',
      'JSON.stringify(HPO.util.errors.slice(0,5))',
      '!!document.getElementById("panel").children.length && !!document.getElementById("sb")'
    ]
  });
  const v = r.results.map(x => x.value !== undefined ? x.value : 'ERR ' + x.error);
  console.log('stats:', v[0], '| title:', v[1], '| network resources:', v[2], '| HPO errors:', v[3], '| ui:', v[4]);
  const errs = r.errors.filter(e => !/fonts\.g(oogleapis|static)\.com/.test(e) && !/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED/.test(e));
  if (errs.length) { fail('console errors:\n   ' + errs.join('\n   ')); }
  try { const s = JSON.parse(v[0]); if (!(s.drawCalls > 0)) fail('draw calls = ' + s.drawCalls); } catch (e) { fail('render.stats() unavailable: ' + v[0]); }
  if (v[4] !== true) fail('ui did not build');
  try { if (JSON.parse(v[2]).some(n => /cdnjs|three/.test(n))) fail('offline file fetched three.js from the network'); } catch (e) { /* ignore */ }
  console.log(bad ? 'CHECK FAILED (' + bad + ')' : 'CHECK OK');
  return bad;
}

(async function () {
  try {
    const b = build();
    if (process.argv.includes('--check')) process.exit((await check(b.offline)) ? 1 : 0);
  } catch (e) { console.error(e.message); process.exit(1); }
})();
