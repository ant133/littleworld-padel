// Loads the headless (simulation) modules into a Node context in contract order.
// Usage: const HPO = require('./load').load(); (render/world/ui files are skipped)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIM_PREFIXES = ['00_', '01_', '02_', '03_', '04_', '05_', '06_', '07_', '08_', '09_', '18_'];

function load(opts) {
  opts = opts || {};
  const dir = path.join(__dirname, '..', 'src');
  const sandbox = { console: console, Math: Math };
  sandbox.globalThis = sandbox;
  sandbox.window = undefined;
  const ctx = vm.createContext(sandbox);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort()
    .filter(f => opts.all || SIM_PREFIXES.some(p => f.startsWith(p)));
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  }
  if (!opts.noboot && sandbox.HPO.mod.rules && sandbox.HPO.mod.rules.attach) sandbox.HPO.boot();
  return sandbox.HPO;
}
module.exports = { load };
