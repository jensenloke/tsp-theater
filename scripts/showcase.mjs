#!/usr/bin/env node
/* TSP Theater showcase: drives a visible Chrome (CDP port 9333) through a
   9-step tour with on-screen captions and per-step assertions. Writes
   screenshots + results.json to showcase-out/ and prints "N/9 steps verified".

   Launch Chrome first (see SHOWCASE.md), plus a static server on :8899.
   Env: PACE (pause multiplier), BASE_URL, OUT_DIR, CDP_PORT. */
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE_URL || 'http://localhost:8899/index.html';
const PACE = parseFloat(process.env.PACE || '1');
const OUT = process.env.OUT_DIR || path.join(process.cwd(), 'showcase-out');
const PORT = process.env.CDP_PORT || '9333';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms * PACE));

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page){ console.error('No Chrome tab found. Launch Chrome with --remote-debugging-port=' + PORT); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(((m.params.exceptionDetails.exception || {}).description || '').slice(0, 120));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(m.params.entry.text.slice(0, 120));
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 140)); return r.result.result.value; };
const click = (s) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});if(e)e.click();})()`);
const nav = async (url) => { await send('Page.navigate', { url }); await sleep(2500); };
const waitFor = async (expr, ms = 12000) => { const st = Date.now(); while (Date.now() - st < ms){ if (await ev(expr)) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
const shot = async (name) => { const s = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(s.result.data, 'base64')); };
const caption = (text) => ev(`(()=>{let c=document.getElementById('showcase-caption');if(!c){c=document.createElement('div');c.id='showcase-caption';c.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;background:rgba(17,24,33,.92);color:#fff;font:600 19px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:13px 26px;border-radius:14px;max-width:80vw;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12)';document.body.appendChild(c);}c.textContent=${JSON.stringify(text)};c.style.display='block';})()`);
const hideCaption = () => ev(`(()=>{const c=document.getElementById('showcase-caption');if(c)c.style.display='none';})()`);
const st = () => ev('window.__tsp.state()');

await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
const results = [];
async function step(name, cap, run, verify, pause){
  console.log('\n▶ ' + name);
  try {
    if (cap) await caption(cap);
    await run();
    if (verify){ const ok = await verify(); results.push({ name, ok: !!ok }); console.log(ok ? '  ✓ verified' : '  ✗ VERIFY FAILED'); }
    await shot(name.replace(/[^a-z0-9]+/gi, '-').toLowerCase());
    await sleep(pause || 3000);
  } catch (e){ results.push({ name, ok:false, err:String(e.message || e).slice(0, 140) }); console.log('  ✗ ERROR ' + String(e.message || e).slice(0, 140)); }
}

await nav(BASE);
await step('01-opening', 'One prompt. An interactive TSP explainer on Singapore’s MRT — built in a single conversation.',
  async () => { await waitFor('!!window.__tsp'); await sleep(1500); },
  async () => (await st()).n === 12 && await ev('document.getElementById("stage").width > 0'), 4000);

await step('02-explosion', 'Visit every station, shortest loop. But the loops explode factorially: 20 cities = 6.08×10¹⁶ tours.',
  async () => {
    await ev('window.__tsp.setScene(1)');
    await ev('window.__tsp.setCities(20)');
    await waitFor('document.getElementById("bf-counter").textContent.includes("6.08×10")', 8000);
  },
  async () => {
    const s = await st();
    const txt = await ev('document.getElementById("bf-time").textContent');
    return Math.abs(s.total - 6.0822550204416e16) / 6.08e16 < 0.01 && /years/.test(txt);
  }, 5000);

await step('03-greedy', 'Nearest neighbor: always hop to the closest unvisited station. Fast — and short-sighted.',
  async () => {
    await ev('window.__tsp.setCities(12)');
    await ev('window.__tsp.setScene(2)');
    await waitFor('window.__tsp.state().done', 20000);
  },
  async () => {
    const s = await st();
    const gap = await ev('document.getElementById("nn-gap").textContent');
    return s.done && s.ticker > 0 && gap.length > 3;
  }, 4500);

await step('04-twoopt', '2-opt untangles the mess: remove two edges, reverse the segment, reconnect shorter.',
  async () => {
    await ev('window.__tsp.setScene(3)');
    await ev('window.__tsp.G.speed = 2');
    await waitFor('window.__tsp.state().swaps >= 4', 20000);
    await shot('04-twoopt-mid');
    await ev('window.__tsp.finish()');
    await ev('window.__tsp.G.speed = 1');
  },
  async () => { const s = await st(); return s.done && s.swaps > 0; }, 4500);

await step('05-annealing', 'Annealing: sometimes you must go uphill. Worse tours accepted with probability e^(−Δ/T), as T falls.',
  async () => {
    await ev('window.__tsp.setScene(4)');
    await ev('window.__tsp.G.speed = 2');
    await waitFor('window.__tsp.state().moves >= 300', 20000);
    await shot('05-annealing-hot');
    await ev('window.__tsp.finish()');
    await ev('window.__tsp.G.speed = 1');
  },
  async () => { const s = await st(); return s.done && s.moves > 500; }, 4500);

await step('06-exact', 'Held–Karp dynamic programming proves the true optimum — every subset state solved, no tour enumerated.',
  async () => {
    await ev('window.__tsp.setScene(5)');
    await ev('window.__tsp.finish()');
    await sleep(1200);
  },
  async () => {
    const opt = await ev('document.getElementById("hk-opt").textContent');
    const s = await st();
    return /km/.test(opt) && s.phase === 'board' && s.ticker > 0;
  }, 4500);

await step('07-leaderboard', 'Every heuristic gets an honest scorecard against the proven optimum.',
  async () => { await sleep(1200); },
  async () => {
    const rows = await ev('document.querySelectorAll("#board .board-row").length');
    const ok = await ev('!!document.querySelector("#board .bgap.ok")');
    const ref = await ev('document.getElementById("board-ref").textContent');
    return rows >= 5 && ok && /Held–Karp/.test(ref);
  }, 5000);

await step('08-router', 'The real commute: Kovan → SGX Centre 1. Fewest stops says 9; fastest door-to-door says 10 stops — and wins.',
  async () => {
    await ev('window.__tsp.setScene(6)');
    await ev(`window.__tsp.setJourney('Kovan','SGX Centre 1')`);
    await ev('window.__tsp.G.speed = 2');
    await waitFor('window.__tsp.state().rr && window.__tsp.state().rr.lanes[1].explored >= 40', 15000);
    await shot('08-router-mid');
    await waitFor('window.__tsp.state().done', 25000);
    await ev('window.__tsp.G.speed = 1');
  },
  async () => {
    const rr = await ev('window.__tsp.state().rr');
    return rr && rr.winner && rr.lanes[0].result.total > rr.lanes[1].result.total
      && Math.abs(rr.lanes[1].result.total - rr.lanes[2].result.total) < 1e-9
      && rr.lanes[2].result.explored <= rr.lanes[1].result.explored;
  }, 5000);

await step('09-selftest', 'Real algorithms, real data, one HTML file, zero dependencies — and it tested itself.',
  async () => {
    await nav(BASE + '?test=1');
    await waitFor('!document.getElementById("test-badge").hidden', 15000);
    await sleep(800);
  },
  async () => {
    const badge = await ev('document.getElementById("test-badge").textContent');
    return /8\/8 PASS/.test(badge);
  }, 5000);

await hideCaption();
const passed = results.filter(r => r.ok).length;
console.log('\n==== SHOWCASE: ' + passed + '/' + results.length + ' steps verified ====');
console.log('Screenshots + storyboard: ' + OUT);
console.log('Console errors: ' + (errors.length ? errors.slice(0, 3).join(' | ') : 'none'));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
ws.close();
process.exit(passed === results.length ? 0 : 1);