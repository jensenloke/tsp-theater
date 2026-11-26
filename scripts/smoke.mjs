#!/usr/bin/env node
/* Headless smoke check: launches its own Chrome + static server, loads the page
   with ?test=1, requires 8/8 self-test groups, exercises every scene at several
   city counts, checks mobile layout at 390x844, and demands zero console errors.
   Usage: node scripts/smoke.mjs   (env: SMOKE_PORT, CHROME_BIN) */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'showcase-out', 'smoke');
fs.mkdirSync(OUT, { recursive: true });
const HTTP_PORT = process.env.SMOKE_PORT || '8899';
const CDP_PORT = '9334';
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = `http://127.0.0.1:${HTTP_PORT}/index.html`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn('python3', ['-m', 'http.server', HTTP_PORT, '--bind', '127.0.0.1'],
  { cwd: ROOT, stdio: 'ignore' });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tsp-smoke-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill(); } catch {} try { server.kill(); } catch {} };
process.on('exit', cleanup);

let page = null;
for (let i = 0; i < 60; i++){
  await sleep(400);
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    page = list.find(t => t.type === 'page');
    if (page) break;
  } catch {}
}
if (!page){ console.error('Chrome did not start'); cleanup(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown')
    errors.push('exception: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '').slice(0, 200));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
    errors.push('log: ' + m.params.entry.text.slice(0, 200));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    errors.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200));
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 200));
  return r.result.result.value;
};
const waitFor = async (expr, ms = 15000) => {
  const st = Date.now();
  while (Date.now() - st < ms){ if (await ev(expr)) return true; await sleep(200); }
  return false;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.result.data, 'base64'));
};
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? '  ✓ ' : '  ✗ ') + name + (detail ? ' — ' + detail : '')); };

await send('Page.navigate', { url: BASE + '?test=1' });
const testsReady = await waitFor('!!(window.__tsp && window.__tsp.testResults)');
check('page loads + self-tests run', testsReady);
const groups = await ev('window.__tsp.testResults');
if (groups){
  for (const g of groups) check(g.name, g.pass, g.detail);
}
await sleep(1200);
await shot('desktop-scene3');

// exercise every scene at n=12
for (const k of [1,2,3,4,5,6]){
  await ev(`window.__tsp.setScene(${k})`);
  const done = await ev('window.__tsp.finish()');
  const st = await ev('window.__tsp.state()');
  check(`scene ${k} runs to completion (n=12)`, done, JSON.stringify({ ticker: +st.ticker.toFixed(2), swaps: st.swaps, moves: st.moves, phase: st.phase }));
  if (k === 5) await shot('desktop-scene5-board');
  if (k === 1) await shot('desktop-scene1');
  if (k === 6) await shot('desktop-scene6-race');
}
// scene 6 specifics: the Kovan -> SGX Centre 1 close fight
const rr = await ev('window.__tsp.state().rr');
check('router: A* settles ≤ Dijkstra, same optimum',
  rr && rr.lanes[2].result.explored <= rr.lanes[1].result.explored
     && Math.abs(rr.lanes[2].result.total - rr.lanes[1].result.total) < 1e-9,
  rr ? `A* ${rr.lanes[2].result.explored} vs Dij ${rr.lanes[1].result.explored} settled` : 'no rr state');
check('router: door-to-door beats fewest-stops route (Kovan→SGX)',
  rr && rr.lanes[1].result.total < rr.lanes[0].result.total,
  rr ? `BFS ${rr.lanes[0].result.total} min vs Dijkstra ${rr.lanes[1].result.total} min` : 'no rr state');
await ev(`window.__tsp.setObj('stops')`);
await ev('window.__tsp.finish()');
const rrStops = await ev('window.__tsp.state().rr');
check('router: stops objective — all three agree on min stops',
  rrStops && rrStops.lanes.every(l => l.result.stops === rrStops.lanes[0].result.stops),
  rrStops ? rrStops.lanes.map(l => l.result.stops).join('/') : 'no rr state');
await ev(`window.__tsp.setObj('time')`);
await ev('window.__tsp.finish()');
// shift-click a network station sets destination
const rect6 = await ev('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return {x:r.left,y:r.top};})()');
const ns = await ev(`window.__tsp.netScreen(window.__tsp.NIDX['Bishan'])`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect6.x + ns[0], y: rect6.y + ns[1], button: 'left', clickCount: 1, modifiers: 8 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect6.x + ns[0], y: rect6.y + ns[1], button: 'left', clickCount: 1, modifiers: 8 });
await sleep(400);
check('router: shift-click station sets destination',
  await ev(`window.__tsp.state().rr.dst === 'Bishan'`), await ev('window.__tsp.state().rr.dst'));
await ev(`window.__tsp.setJourney('Kovan','SGX Centre 1')`);
await ev('window.__tsp.finish()');
// n=16: scenes 1 & 5 must adapt (no enumeration, heuristics-only board)
await ev('window.__tsp.setCities(16)');
await ev('window.__tsp.setScene(1)');
check('scene 1 adapts at n=16 (counter only)', await ev('window.__tsp.finish()'));
await ev('window.__tsp.setScene(5)');
const b16 = await ev('window.__tsp.state().board');
check('scene 5 heuristics-only board at n=16', b16 && b16.find(r => r.key === 'exact').km === null,
  b16 ? b16.map(r => `${r.key}:${r.km == null ? '—' : r.km.toFixed(1)}`).join(' ') : 'no board');
await shot('desktop-scene5-n16');
// n=6: brute enumeration + HK agree live
await ev('window.__tsp.setCities(6)');
await ev('window.__tsp.setScene(1)');
await ev('window.__tsp.finish()');
const bf6 = await ev('window.__tsp.state()');
await ev('window.__tsp.setScene(5)');
await ev('window.__tsp.finish()');
const hk6 = await ev('window.__tsp.state()');
check('n=6 brute optimum == HK optimum', Math.abs(bf6.ticker - hk6.ticker) < 1e-6,
  `brute ${bf6.ticker.toFixed(3)} vs HK ${hk6.ticker.toFixed(3)}`);
// custom city add/remove via real canvas clicks (canvas top-left corner = sea)
await ev('window.__tsp.setCities(12)');
await ev('window.__tsp.setScene(3)');
await sleep(600);
const rect = await ev('(()=>{const r=document.getElementById("stage").getBoundingClientRect();return {x:r.left,y:r.top};})()');
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
await clickAt(rect.x + 15, rect.y + 15);
await sleep(400);
const nAdd = await ev('window.__tsp.state().n');
check('click empty map adds custom city', nAdd === 13, `n=${nAdd}`);
const cs = await ev('window.__tsp.cityScreen(window.__tsp.state().n - 1)');
await clickAt(rect.x + cs[0], rect.y + cs[1]);
await sleep(400);
const nRem = await ev('window.__tsp.state().n');
check('click city removes it', nRem === 12, `n=${nRem}`);

// mobile layout 390x844
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await sleep(900);
await ev('window.__tsp.setScene(3)');
await sleep(1800);
const noHScroll = await ev('document.documentElement.scrollWidth <= window.innerWidth + 1');
check('no horizontal scroll at 390x844', noHScroll,
  `scrollWidth=${await ev('document.documentElement.scrollWidth')}`);
await shot('mobile-390-scene3');
await ev('window.__tsp.setScene(5)');
await ev('window.__tsp.finish()');
await sleep(1200);
await shot('mobile-390-scene5');
await ev('window.__tsp.setScene(6)');
await ev('window.__tsp.finish()');
await sleep(900);
await shot('mobile-390-scene6');
await send('Emulation.clearDeviceMetricsOverride');

const errCount = errors.length;
check('zero console errors', errCount === 0, errCount ? errors.slice(0, 5).join(' | ') : 'none');
fs.writeFileSync(path.join(OUT, 'smoke-results.json'), JSON.stringify({ results, errors }, null, 2));
const passed = results.filter(r => r.ok).length;
console.log(`\n==== SMOKE: ${passed}/${results.length} checks passed · console errors: ${errCount} ====`);
console.log('Artifacts: ' + OUT);
ws.close();
cleanup();
process.exit(passed === results.length ? 0 : 1);