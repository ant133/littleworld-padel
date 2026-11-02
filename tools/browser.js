// Headless Chrome driver over CDP (no dependencies; uses Node's built-in WebSocket).
// const B = require('./browser'); const r = await B.run({ url, width, height, waitMs, evals:[...], shots:['a.png'] });
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let portSeq = 9300 + Math.floor(Math.random() * 400);

async function run(o) {
  o = Object.assign({ width: 1280, height: 800, waitMs: 1500, evals: [], steps: [], shots: [], mobile: false, timeout: 120000 }, o);
  const port = portSeq++;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpo-chrome-'));
  const args = ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--no-first-run', '--disable-extensions',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--allow-file-access-from-files',
    '--autoplay-policy=no-user-gesture-required', '--window-size=' + o.width + ',' + o.height, 'about:blank'];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  const out = { console: [], errors: [], results: [], shots: [] };
  let ws;
  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      await sleep(250);
      try { const j = await (await fetch('http://127.0.0.1:' + port + '/json')).json(); target = j.find(t => t.type === 'page'); } catch (e) { /* not up yet */ }
    }
    if (!target) throw new Error('chrome did not start');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0; const pend = {};
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; return; }
      if (m.method === 'Runtime.consoleAPICalled') {
        const t = m.params.type, txt = m.params.args.map(a => a.value !== undefined ? a.value : a.description || a.type).join(' ');
        out.console.push(t + ': ' + txt); if (t === 'error') out.errors.push(txt);
      } else if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails; out.errors.push('EXCEPTION ' + (d.exception && d.exception.description || d.text) + ' @' + (d.url || '') + ':' + d.lineNumber);
      } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') out.errors.push('LOG ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    };
    const send = (method, params) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method: method, params: params || {} })); });
    await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: !!o.mobile });
    await send('Page.navigate', { url: o.url });
    await sleep(o.waitMs);
    const ev = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text };
      return { value: r.result && r.result.result ? r.result.result.value : undefined };
    };
    for (const e of o.evals) out.results.push(await ev(e));
    const shotsAt = async (file) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
      fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); out.shots.push(file);
    };
    // steps: [{eval:'...'}, {wait:ms}, {shot:'file.png'}, {key:'q'}, {click:[x,y]}]
    for (const s of o.steps) {
      if (s.eval) out.results.push(await ev(s.eval));
      else if (s.wait) await sleep(s.wait);
      else if (s.shot) await shotsAt(s.shot);
      else if (s.key) { for (const t of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type: t, key: s.key, text: s.key, code: 'Key' + s.key.toUpperCase() }); }
      else if (s.click) { for (const t of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type: t, x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 }); }
    }
    for (const f of o.shots) await shotsAt(f);
  } finally {
    try { ws && ws.close(); } catch (e) { /* ignore */ }
    proc.kill();
    await sleep(200);
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  return out;
}
module.exports = { run, CHROME };
if (require.main === module) {
  const a = process.argv.slice(2);
  run({ url: a[0], shots: a[1] ? [a[1]] : [], waitMs: +a[2] || 2000 }).then(r => { console.log(r.console.join('\n')); console.log('ERRORS:', r.errors); process.exit(0); });
}
