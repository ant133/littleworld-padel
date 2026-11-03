// Play-mode journey in a real (headless) browser, offline: create player -> setup -> kick off -> reload -> continue -> mixed match.
// Usage: node tools/features_browser.js   (needs dist/littleworld-offline.html; run tools/build.js first)
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const B = require('./browser');
const url = 'file:///' + path.resolve('dist/littleworld-offline.html').replace(/\\/g, '/');
const click = id => `document.getElementById('${id}').click()`;
const create = (name, gender) => `(()=>{const n=document.getElementById('gm-name');n.value=${JSON.stringify(name)};n.dispatchEvent(new Event('input'));document.querySelector('#gm-create .gm-seg button[data-v="${gender}"]').click();${click('gm-save')};return true})()`;
const snap = `JSON.stringify({st:HPO.mod.game.st,mode:HPO.mod.game.mode,type:HPO.mod.ui.state.type,team:HPO.mod.ui.state.teamA,coach:HPO.mod.match.coachTeam,player:HPO.mod.game.player&&HPO.mod.game.player.name,cam:HPO.mod.render.cameraMode,errors:HPO.util.errors})`;
const drawerTest = `(async()=>{const w=ms=>new Promise(r=>setTimeout(r,ms)),tab=t=>{document.querySelector('#gm-drawer .tabs button[data-tab='+t+']').click();return w(250).then(()=>(document.querySelector('#gm-drawer .tabpane.on')||{textContent:''}).textContent.length)};const sbBefore=!!document.getElementById('sb').offsetParent;document.getElementById('gm-sbtab').click();await w(300);const sbOpen=!!document.getElementById('sb').offsetParent&&!document.getElementById('gm-drawer').hidden;const tabs=[...document.querySelectorAll('#gm-drawer .tabs button')].map(b=>b.textContent);const score=await tab('score'),stats=await tab('stats'),players=await tab('players');await tab('feed');document.getElementById('gm-sbtab').click();await w(300);return JSON.stringify({sbBefore,sbOpen,tabs,score,stats,players,closed:document.getElementById('gm-drawer').hidden,homeAgain:!!document.querySelector('#panel #sec-centre')})})()`;
const yawTest = `JSON.stringify((()=>{const R=HPO.mod.render,b=R.view.yaw,v=[];for(let i=0;i<8;i++){R.view.yaw=R.view.yawT=i*Math.PI/4;R.cameraMode='free';R._updateCamera(0);const p=[[-10,-5],[10,-5],[10,5],[-10,5]].map(a=>new THREE.Vector3(a[0],0,a[1]).project(R.camera));v.push(Math.hypot(p[0].x+p[2].x-p[1].x-p[3].x,p[0].y+p[2].y-p[1].y-p[3].y));}R.view.yaw=b;return v;})())`;

(async () => {
  const r = await B.run({ url, width: 1280, height: 900, waitMs: 2200, offline: true, steps: [
    { eval: `JSON.stringify({st:HPO.mod.game.st,play:!!document.getElementById('gm-play')})` },                                                  // 0 title
    { eval: `${click('gm-play')};true` }, { wait: 300 },
    { eval: `HPO.mod.game.st + '|' + !!document.getElementById('gm-name') + '|' + (document.activeElement && document.activeElement.id)` },     // 1 create screen, name autofocus
    { eval: `${click('gm-save')};document.getElementById('gm-cstatus').textContent` },                                                         // 2 empty name refused
    { eval: create('Visitor Woman', 'F') }, { wait: 1800 },
    { eval: snap },                                                                                                                            // 3 setup
    { eval: `${click('gm-kick')};true` }, { wait: 1500 },
    { eval: snap },                                                                                                                            // 4 playing, coach box
    { eval: `JSON.stringify({tactics:[...document.querySelectorAll('#gm-tactic option')].length,middle:[...document.querySelectorAll('#gm-middle option')].length,chips:document.querySelectorAll('#gm-hud .gm-chip').length,tmo:!!document.getElementById('gm-timeout'),chal:!!document.getElementById('gm-challenge')})` }, // 5
    { eval: `HPO.mod.match.paused=true; HPO.mod.render.setCameraMode('close'); true` }, { wait: 800 },
    { shot: 'scratch/features-desktop.png' },
    { eval: `JSON.stringify({ortho:HPO.mod.render.camera.isOrthographicCamera,lights:HPO.mod.render.cutaway.list().filter(x=>x.role==='light'),errors:HPO.util.errors})` }, // 6
    { eval: `setTimeout(()=>location.reload(),50); true` }, { wait: 4500 },
    { eval: `(async()=>{for(let i=0;i<100;i++){if(HPO.mod.players.roster().some(p=>p.custom)&&document.getElementById('gm-continue'))break;await new Promise(r=>setTimeout(r,100));}return JSON.stringify({players:HPO.mod.players.roster().filter(p=>p.custom).map(p=>p.name),cont:document.getElementById('gm-continue')&&document.getElementById('gm-continue').textContent})})()` }, // 7 restored after reload
    { eval: `${click('gm-newplayer')};true` }, { wait: 300 },
    { eval: create('Visitor Man', 'M') }, { wait: 1800 },
    { eval: `${click('gm-kick')};true` }, { wait: 1500 },
    { eval: snap },                                                                                                                            // 8 mixed match
    { eval: `JSON.stringify(HPO.mod.players.list.map(p=>({name:p.name,gender:p.def.gender})))` },                                              // 9
    { eval: yawTest },                                                                                                                         // 10
    { eval: drawerTest }                                                                                                                       // 11 chevron opens the full match centre
  ] });
  const errs = r.errors.filter(e => !/ERR_INTERNET_DISCONNECTED|fonts\.g(oogleapis|static)/.test(e));
  assert.deepEqual(errs, []);
  r.results.forEach(x => assert(!x.error, x.error));
  // only eval steps return values; wait/shot steps are skipped
  const v = r.results.filter(x => x.value !== undefined).map(x => { try { return JSON.parse(x.value); } catch { return x.value; } });
  require('node:fs').writeFileSync('scratch/features-results.json', JSON.stringify(v, null, 2));
  const title = v[0]; assert(title.play, 'title offers Play with Annetta');
  assert.match(String(v[2]), /^create\|true\|gm-name$/, 'create screen with focused name field');
  assert.match(String(v[3]), /name/i, 'empty name is refused with a message');
  const setup = v[5]; assert.equal(setup.st, 'setup'); assert.equal(setup.player, 'Visitor Woman');
  const play = v[7]; assert.equal(play.st, 'playing'); assert.equal(play.type, 'W'); assert.equal(play.team[1], 'p5'); assert.equal(play.coach, 'A'); assert.equal(play.cam, 'close'); assert.deepEqual(play.errors, []);
  const bar = v[8]; assert.equal(bar.tactics, 6); assert.equal(bar.middle, 3); assert.equal(bar.chips, 0); assert(bar.tmo && bar.chal);
  const cam = v[10]; assert(cam.ortho); assert.deepEqual(cam.errors, []); assert(cam.lights.some(c => c.fade < 0.1), 'obstructing floodlights fade');
  const back = v[12]; assert.deepEqual(back.players, ['Visitor Woman']); assert.match(back.cont, /Continue as Visitor Woman/);
  const mixed = v[16]; assert.equal(mixed.type, 'X'); assert.equal(mixed.team[1], 'p5'); assert.equal(mixed.st, 'playing'); assert.deepEqual(mixed.errors, []);
  const names = v[17].map(p => p.name); assert(names.includes('Visitor Man') && names.includes('Annetta Arslan'), names.join());
  assert(v[18].every(x => x < 1e-10), 'court opposite edges parallel at every yaw');
  const dr = v[19]; assert(dr.sbBefore && dr.sbOpen, 'the scoreboard stays while the match centre is open'); assert.deepEqual(dr.tabs, ['Score', 'Stats', 'Players', 'Feed']); assert(dr.score > 50 && dr.stats > 200 && dr.players > 200, 'every tab has content: ' + JSON.stringify(dr)); assert(dr.closed && dr.homeAgain, 'closing hands the section back to the Studio panel');
  console.log('PASS browser (Play mode): title -> create (autofocus, validation) -> setup -> kick off with limited coach bar; chevron opens the full match centre (score, stats, players, feed); reload restores saved player and offers Continue; mixed match with Annetta; orthographic parallel court at 8 yaws; floodlight fade; offline render; no app errors');
  const mobile = await B.run({ url, width: 390, height: 844, mobile: true, offline: true, waitMs: 1500,
    steps: [{ eval: `${click('gm-play')};true` }, { wait: 400 }, { shot: 'scratch/features-mobile-create.png' }],
    shots: ['scratch/features-mobile.png'], evals: ['JSON.stringify(HPO.util.errors)', 'HPO.mod.render.stats().drawCalls', 'document.documentElement.scrollWidth<=window.innerWidth'] });
  assert.equal(mobile.results[0].value, '[]'); assert(mobile.results[1].value > 0); assert.equal(String(mobile.results[2].value), 'true');
  console.log('PASS offline mobile render (390x844, no horizontal scroll)');
})().catch(e => { console.error(e); process.exitCode = 1; });
