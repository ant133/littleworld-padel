// dupcheck: enforces CONTRACT §2. Fails on top-level leaks, duplicate HPO.mod.* registrations, duplicate HPO.* keys, and BUS events not in the contract list.
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();

const CONTRACT = fs.readFileSync(path.join(__dirname, '..', 'CONTRACT.md'), 'utf8');
const sec6 = CONTRACT.slice(CONTRACT.indexOf('## 6. Event bus'), CONTRACT.indexOf('## 7.'));
const allowed = new Set();
(sec6.match(/`[a-z]+:[a-z_]+(?:\/[a-z_]+)?`/g) || []).forEach(t => {
  const n = t.replace(/`/g, '');
  if (n.indexOf('/') > 0) { const [ns, rest] = n.split(':'); rest.split('/').forEach(r => allowed.add(ns + ':' + r)); }
  else allowed.add(n);
});
// events documented in prose as "x:start/end" style
['changeover:start', 'changeover:end', 'replay:start', 'replay:end', 'game:end', 'set:end', 'match:finished', 'match:end'].forEach(e => allowed.add(e));
['sim:tick', 'boot:ready', 'fault', 'let', 'speak'].forEach(e => allowed.add(e));
// events added after CONTRACT v0.1 (kept in sync with CONTRACT §6 change log)
['match:finished'].forEach(e => allowed.add(e));

let fails = 0;
const fail = m => { fails++; console.log('FAIL', m); };
const mods = {}, keys = {};

files.forEach(f => {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  // 1. top level: file must be wrapped in a single IIFE
  const stripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!/^\(function\s*\(/.test(stripped)) fail(f + ': not wrapped in an IIFE');
  if (!/\}\)\((HPO|typeof window)/.test(stripped.slice(-120))) fail(f + ': IIFE does not end with })(HPO|root)');
  // 2. duplicate HPO.mod.<name> registrations
  (src.match(/HPO\.mod\.([A-Za-z0-9_]+)\s*=(?!=)/g) || []).forEach(m => {
    const n = m.replace(/HPO\.mod\.|\s*=/g, '');
    if (mods[n] && mods[n] !== f) fail('module ' + n + ' registered in ' + mods[n] + ' and ' + f); mods[n] = f;
  });
  // 3. new HPO.<key> assignments (outside HPO.mod / HPO.cfg / HPO.util)
  (src.match(/\bHPO\.([A-Za-z0-9_]+)\s*=(?!=)/g) || []).forEach(m => {
    const k = m.replace(/HPO\.|\s*=/g, '');
    if (keys[k] && keys[k] !== f) fail('HPO.' + k + ' assigned in ' + keys[k] + ' and ' + f); keys[k] = keys[k] || f;
  });
  // 4. BUS events
  (src.match(/(?:BUS|E)\.emit\(\s*'([^']+)'/g) || []).forEach(m => {
    const ev = m.replace(/.*\('/, '').replace(/'$/, '');
    if (!allowed.has(ev)) fail(f + ': emits \'' + ev + '\' which is not listed in CONTRACT §6');
  });
  (src.match(/\bE\(\s*'([^']+)'/g) || []).forEach(m => {
    const ev = m.replace(/.*\('/, '').replace(/'$/, '');
    if (!allowed.has(ev)) fail(f + ': emits \'' + ev + '\' which is not listed in CONTRACT §6');
  });
});
console.log(fails ? fails + ' problem(s)' : 'dupcheck OK (' + files.length + ' files, ' + Object.keys(mods).length + ' modules, ' + allowed.size + ' contract events)');
process.exit(fails ? 1 : 0);
