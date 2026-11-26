#!/usr/bin/env node
/* Render a narrated 1280x720 MP4 of the TSP Theater showcase.
   Prereqs: python3 scripts/gen_narration.py  +  Chrome with CDP on :9333
   (headless is fine) + a static server on :8899. Captures the tab via CDP
   screencast paced to the narration, mixes macOS say voiceover, muxes H.264/AAC.
   Output: Desktop/tsp-showcase.mp4 and showcase-out/tsp-showcase.mp4. */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RENDER = path.join(ROOT, 'showcase-out', 'render');
const FRAMES = path.join(RENDER, 'frames');
fs.mkdirSync(FRAMES, { recursive: true });
const BASE = process.env.BASE_URL || 'http://localhost:8899/index.html';
const PORT = process.env.CDP_PORT || '9333';
const BUFFER = 1.2, LEAD = 0.6;
const narr = JSON.parse(fs.readFileSync(path.join(RENDER, 'audio', 'narration.json'), 'utf8'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sh = (cmd) => { console.log('  $ ' + cmd.slice(0, 120)); execSync(cmd, { stdio: 'inherit' }); };

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page){ console.error('No Chrome tab on port ' + PORT); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const frames = []; let firstFrameWall = null;
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Page.screencastFrame'){
    if (firstFrameWall === null) firstFrameWall = Date.now();
    frames.push({ data: m.params.data, ts: m.params.metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => {});
  }
};
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 140)); return r.result.result.value; };
const waitFor = async (expr, ms = 15000) => { const st = Date.now(); while (Date.now() - st < ms){ if (await ev(expr)) return true; await sleep(200); } return false; };
const nav = async (url) => { await send('Page.navigate', { url }); await sleep(2500); };
const caption = (text) => ev(`(()=>{let c=document.getElementById('showcase-caption');if(!c){c=document.createElement('div');c.id='showcase-caption';c.style.cssText='position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99999;background:rgba(17,24,33,.92);color:#fff;font:600 19px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;padding:13px 26px;border-radius:14px;max-width:80vw;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12)';document.body.appendChild(c);}c.textContent=${JSON.stringify(text)};c.style.display='block';})()`);

const CAPTIONS = [
  'One prompt. An interactive TSP explainer on Singapore’s MRT — built in a single conversation.',
  'The loops explode factorially: 20 cities = 6.08×10¹⁶ tours ≈ 2 years at a billion checks/sec.',
  'Nearest neighbor: fast, and short-sighted — it paints itself into a corner.',
  '2-opt untangles the mess: remove two edges, reverse the segment, reconnect shorter.',
  'Annealing: sometimes you must go uphill — worse tours accepted with probability e^(−Δ/T).',
  'Held–Karp dynamic programming proves the true optimum for ≤ 15 cities.',
  'Every heuristic gets an honest scorecard against the proven optimum.',
  'Kovan → SGX Centre 1: fewest stops = 9 (31 min); fastest door-to-door = 10 stops (28 min). The objective is a choice.',
  'Real algorithms, real data, one HTML file — and it tested itself: 8/8 PASS.',
];
const RUN = [
  async () => { await waitFor('!!window.__tsp'); await sleep(1200); },
  async () => { await ev('window.__tsp.setScene(1)'); await ev('window.__tsp.setCities(20)');
              await waitFor('document.getElementById("bf-counter").textContent.includes("6.08×10")', 8000); },
  async () => { await ev('window.__tsp.setCities(12)'); await ev('window.__tsp.setScene(2)');
              await waitFor('window.__tsp.state().done', 20000); },
  async () => { await ev('window.__tsp.setScene(3)'); await ev('window.__tsp.G.speed = 2');
              await waitFor('window.__tsp.state().swaps >= 4', 20000);
              await ev('window.__tsp.finish()'); await ev('window.__tsp.G.speed = 1'); },
  async () => { await ev('window.__tsp.setScene(4)'); await ev('window.__tsp.G.speed = 2');
              await waitFor('window.__tsp.state().moves >= 300', 20000);
              await ev('window.__tsp.finish()'); await ev('window.__tsp.G.speed = 1'); },
  async () => { await ev('window.__tsp.setScene(5)'); await ev('window.__tsp.finish()'); await sleep(1000); },
  async () => { await sleep(1500); },
  async () => { await ev('window.__tsp.setScene(6)');
              await ev(`window.__tsp.setJourney('Kovan','SGX Centre 1')`);
              await ev('window.__tsp.G.speed = 2');
              await waitFor('window.__tsp.state().done', 25000);
              await ev('window.__tsp.G.speed = 1'); },
  async () => { await nav(BASE + '?test=1'); await waitFor('!document.getElementById("test-badge").hidden', 15000); },
];

await send('Runtime.enable'); await send('Page.enable');
await nav(BASE);
console.log('Starting screencast...');
await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800, everyNthFrame: 1 });
await sleep(500);

const stepWall = [];
for (let i = 0; i < CAPTIONS.length; i++){
  stepWall[i] = Date.now();
  const hold = (narr[i].duration + BUFFER) * 1000;
  console.log(`Step ${i + 1}: ${CAPTIONS[i]} (hold ${(hold / 1000).toFixed(1)}s)`);
  await caption(CAPTIONS[i]);
  try { await RUN[i](); } catch (e){ console.log('  step error: ' + String(e.message).slice(0, 100)); }
  await sleep(hold);
}
await send('Page.stopScreencast');
await sleep(500);
console.log(`Captured ${frames.length} frames`);
if (frames.length < 10){ console.error('Too few frames captured'); process.exit(1); }

const t0 = frames[0].ts;
let concat = '';
frames.forEach((f, i) => {
  const name = `frame_${String(i).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(FRAMES, name), Buffer.from(f.data, 'base64'));
  const dur = (i < frames.length - 1) ? (frames[i + 1].ts - f.ts) : 0.6;
  concat += `file '${name}'\nduration ${Math.max(0.02, dur).toFixed(4)}\n`;
});
fs.writeFileSync(path.join(FRAMES, 'concat.txt'), concat);
const totalDur = frames[frames.length - 1].ts - t0 + 0.6;
console.log(`Video span: ${totalDur.toFixed(1)}s`);

console.log('Encoding silent video...');
sh(`ffmpeg -y -loglevel error -f concat -safe 0 -i "${path.join(FRAMES, 'concat.txt')}" -vf "scale=1280:720,setsar=1" -fps_mode cfr -pix_fmt yuv420p -c:v libx264 -preset medium -crf 20 -r 30 "${path.join(RENDER, 'silent.mp4')}"`);

console.log('Mixing narration...');
const offsets = stepWall.map(w => (w - firstFrameWall) / 1000 + LEAD);
fs.writeFileSync(path.join(RENDER, 'timing.json'), JSON.stringify({ firstFrameWall, stepWall, offsets }, null, 2));
const inputs = narr.map(n => `-i "${n.wav}"`).join(' ');
const filters = narr.map((n, i) => `[${i}:a]adelay=${Math.round(offsets[i] * 1000)}:all=1[a${i}]`).join(';');
const mix = `[${narr.map((_, i) => `a${i}`).join('][')}]amix=inputs=${narr.length}:duration=longest:normalize=0[aout]`;
sh(`ffmpeg -y -loglevel error ${inputs} -filter_complex "${filters};${mix}" -map "[aout]" -ar 44100 "${path.join(RENDER, 'narration.m4a')}"`);

console.log('Muxing final video...');
const FINAL_DESK = path.join(process.env.HOME, 'Desktop', 'tsp-showcase.mp4');
const FINAL_PROJ = path.join(ROOT, 'showcase-out', 'tsp-showcase.mp4');
sh(`ffmpeg -y -loglevel error -i "${path.join(RENDER, 'silent.mp4')}" -i "${path.join(RENDER, 'narration.m4a')}" -filter_complex "[0:v]tpad=stop_mode=clone:stop_duration=6[v]" -map "[v]" -map 1:a -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 160k -shortest "${FINAL_PROJ}"`);
fs.copyFileSync(FINAL_PROJ, FINAL_DESK);
console.log('\nDONE');
console.log('Final video: ' + FINAL_DESK);
console.log('Also: ' + FINAL_PROJ);
const probe = execSync(`ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "${FINAL_PROJ}"`).toString();
console.log(probe);
ws.close();