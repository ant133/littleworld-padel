// Produces dist/littleworld-artifact.html: the online build without <!doctype>/<html>/<head>/<body> wrappers (the Artifact host adds its own skeleton).
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../dist/littleworld-online.html', 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset="utf-8">/, '').replace(/<meta name="viewport"[^>]*>/, '').replace(/<meta name="theme-color"[^>]*>/, '');
const body = src.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
fs.writeFileSync(__dirname + '/../dist/littleworld-artifact.html', head + body);
console.log('artifact page', Math.round((head.length + body.length) / 1024) + ' KB');
