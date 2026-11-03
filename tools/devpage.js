// Regenerates dev.html: vendor/three.min.js + every src/*.js in numeric order, on top of src/shell.html if present.
'use strict';
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort();
const css = fs.existsSync(path.join(root, 'src/shell.css')) ? '<link rel="stylesheet" href="src/shell.css">' : '<style>html,body{margin:0;height:100%;background:#fffaf0}#stage{position:fixed;inset:0}</style>';
let body = '<div id="stage"></div>';
if (fs.existsSync(path.join(root, 'src/shell.html'))) body = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
// optional soundtrack, same convention as tools/build.js: assets_src/music.<ext> becomes HPO.assets.music
let music = '';
for (const [ext, mime] of [['mp3', 'audio/mpeg'], ['m4a', 'audio/mp4'], ['ogg', 'audio/ogg'], ['opus', 'audio/ogg'], ['webm', 'audio/webm']]) {
  const f = path.join(root, 'assets_src', 'music.' + ext);
  if (fs.existsSync(f)) { music = '<script>HPO.assets = HPO.assets || {}; HPO.assets.music = \'data:' + mime + ';base64,' + fs.readFileSync(f).toString('base64') + '\';</script>'; break; }
}
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dev</title>' + css + '</head><body>' + body +
  '<script src="vendor/three.min.js"></script>' + files.map(f => '<script src="src/' + f + '"></script>').join('') + music + '</body></html>';
fs.writeFileSync(path.join(root, 'dev.html'), html);
console.log('dev.html: ' + files.length + ' scripts');
