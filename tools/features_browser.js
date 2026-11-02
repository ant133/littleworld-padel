'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const B = require('./browser');
const url = 'file:///' + path.resolve('dist/littleworld-offline.html').replace(/\\/g, '/') + '?auto=1';
(async () => {
  const r = await B.run({ url, width: 1280, height: 900, waitMs: 1800, offline: true, steps: [
    { eval: `HPO.mod.match.paused=true; document.querySelector('#create-player-section').open=true; document.querySelector('#create-name').value='Visitor Woman'; document.querySelector('#create-gender').value='F'; document.querySelector('#create-player').requestSubmit(); true` },
    { wait: 1800 },
    { eval: `JSON.stringify({type:HPO.mod.ui.state.type,team:HPO.mod.ui.state.teamA,status:document.querySelector('#create-status').textContent,player:HPO.mod.players.roster().find(p=>p.custom)})` },
    { eval: `HPO.mod.render.setCameraMode('close'); true` }, { wait: 1000 },
    { shot: 'scratch/features-desktop.png' },
    { eval: `JSON.stringify({camera:HPO.mod.render.camera.isOrthographicCamera,cuts:HPO.mod.render.cutaway.list().filter(x=>x.role==='light'),errors:HPO.util.errors})` },
    { eval: `setTimeout(()=>location.reload(),50); true` }, { wait: 4500 },
    { eval: `(async()=>{for(let i=0;i<100;i++){if(HPO.mod.players.roster().some(p=>p.custom))break;await new Promise(r=>setTimeout(r,100));}return JSON.stringify({players:HPO.mod.players.roster().filter(p=>p.custom),status:document.querySelector('#create-status').textContent,raw:await new Promise((resolve,reject)=>{const req=indexedDB.open('littleworld-padel',1);req.onsuccess=()=>{const read=req.result.transaction('players').objectStore('players').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=reject;};req.onerror=reject;})});})()` },
    { eval: `document.querySelector('#create-name').value='Visitor Man'; document.querySelector('#create-gender').value='M'; document.querySelector('#create-player').requestSubmit(); true` }, { wait: 1800 },
    { eval: `JSON.stringify({type:HPO.mod.ui.state.type,team:HPO.mod.ui.state.teamA,status:document.querySelector('#create-status').textContent})` },
    { eval: `HPO.mod.ui.newMatch(); JSON.stringify({players:HPO.mod.players.list.map(p=>({name:p.name,gender:p.def.gender})),errors:HPO.util.errors})` },
    { eval: `JSON.stringify((()=>{const R=HPO.mod.render, before=R.view.yaw, values=[]; for(let i=0;i<8;i++){R.view.yaw=R.view.yawT=i*Math.PI/4;R.cameraMode='free';R._updateCamera(0); const p=[[-10,-5],[10,-5],[10,5],[-10,5]].map(a=>new THREE.Vector3(a[0],0,a[1]).project(R.camera)); values.push(Math.hypot(p[0].x+p[2].x-p[1].x-p[3].x,p[0].y+p[2].y-p[1].y-p[3].y));} R.view.yaw=before;return values;})())` }
  ] });
  const errs = r.errors.filter(e => !/ERR_INTERNET_DISCONNECTED|fonts\.g(oogleapis|static)/.test(e));
  assert.deepEqual(errs, []);
  r.results.forEach(x => assert(!x.error, x.error));
  const data = r.results.map(x => { try { return JSON.parse(x.value); } catch { return x.value; } });
  require('node:fs').writeFileSync('scratch/features-results.json', JSON.stringify(data, null, 2));
  const created = data[1]; assert.equal(created.type, 'W'); assert.equal(created.team[1], 'p5'); assert.match(created.status, /Saved on this device/);
  const cuts = data[3]; assert(cuts.camera); assert.deepEqual(cuts.errors, []); assert(cuts.cuts.some(c => c.fade < 0.1), JSON.stringify(cuts));
  const restored = data[5]; assert.equal(JSON.stringify(created.player), JSON.stringify(restored.players[0]), JSON.stringify(restored));
  assert.equal(data[7].type, 'X'); assert.equal(data[7].team[1], 'p5');
  assert.equal(data[8].players[0].name, 'Visitor Man'); assert.equal(data[8].players[1].name, 'Annetta Arslan H'); assert.deepEqual(data[8].errors, []);
  assert(data[9].every(x => x < 1e-10), 'court opposite edges parallel at every yaw');
  console.log('PASS browser: saved female/male players, reload restoration, Annetta team, mixed start, orthographic court at eight angles, floodlight fade, offline render; no app errors');
  const mobile = await B.run({ url, width: 390, height: 844, mobile: true, offline: true, waitMs: 1500,
    steps: [{ eval: `HPO.mod.match.paused=true; HPO.mod.render.setCameraMode('close'); true` }, { wait: 800 }],
    shots: ['scratch/features-mobile.png'], evals: ['JSON.stringify(HPO.util.errors)', 'HPO.mod.render.stats().drawCalls'] });
  assert.equal(mobile.results[0].value, '[]'); assert(mobile.results[1].value > 0);
  console.log('PASS offline mobile render');
})().catch(e => { console.error(e); process.exitCode = 1; });
