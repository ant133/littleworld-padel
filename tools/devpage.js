// Regenerates dev.html: vendor/three.min.js + every src/*.js in numeric order, on top of src/shell.html if present.
'use strict';
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const files = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).sort();
const css = fs.existsSync(path.join(root, 'src/shell.css')) ? '<link rel="stylesheet" href="src/shell.css">' : '<style>html,body{margin:0;height:100%;background:#fffaf0}#stage{position:fixed;inset:0}</style>';
let body = '<div id="stage"></div>';
if (fs.existsSync(path.join(root, 'src/shell.html'))) body = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>dev</title>' + css + '</head><body>' + body +
  '<script src="vendor/three.min.js"></script>' + files.map(f => '<script src="src/' + f + '"></script>').join('') + '</body></html>';
fs.writeFileSync(path.join(root, 'dev.html'), html);
console.log('dev.html: ' + files.length + ' scripts');
