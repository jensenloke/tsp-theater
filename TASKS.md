# TSP Theater — build checklist

Definition of done: `index.html` builds from template · all 8 `?test=1` groups pass ·
showcase verifies 9/9 · SHOWCASE.md written · zero console errors · mobile checked at
390×844 · narrated MP4 on Desktop. **All met.**

## Phase 0 — setup
- [x] Read PROMPT.md, README.md, reference singapore-map scripts (showcase/render/narration/SHOWCASE.md)
- [x] Inspect data: 213 stations CSV, 5-region MultiPolygon GeoJSON
- [x] Check tooling: python3, node, Chrome, ffmpeg

## Phase 1 — data pipeline
- [x] `scripts/build_data.py`: curate 12 default stations, dedupe full station list,
      simplify region polygons → island silhouette < 8 KB, inject JSON into template
- [x] Verify haversine sanity (true JE↔CG 27.51 km; Boon Lay↔CG 31.53 km in 30–35 band)
- [x] Derive MRT routing network from station codes (143 stations, 165 edges, 8 services);
      consecutive existing codes adjacent (missing = unbuilt); CE through-runs as CC,
      CG separate shuttle (transfer at Tanah Merah); LRT excluded; 7 POIs + 5 preset journeys

## Phase 2 — index.template.html (vanilla JS + Canvas 2D, zero deps)
- [x] Shell: dark theme, scene tabs, shared stage (canvas + ticker + explainer), controls bar, mobile layout
- [x] Core: seeded RNG (mulberry32), haversine matrix, projection, render loop, glow drawing, tooltips
- [x] Shared controls: play/pause/step/reset, speed 0.25–8×, city slider 5–20, click add/remove city,
      seed input, keyboard (space/→/1–6/R), algorithm color language
- [x] Scene 1 brute force: (n−1)!/2 animated counter, big-number + time-at-1e9/s formatting,
      step enumeration n≤8 (best-so-far), disabled + caption n>8
- [x] Scene 2 nearest neighbor: animated growth, closing-edge + long-edge highlight, gap vs exact n≤15
- [x] Scene 3 2-opt: seeded tangled tour, red-remove / sweep-reverse / green-add animation,
      swap counter, local-optimum caption, shake button
- [x] Scene 4 annealing: thermometer + cooling schedule, cyan/amber/dim-red move flashes,
      cooling-rate + T0 sliders, reheat, honesty caption
- [x] Scene 5 Held–Karp: chunked async DP n≤15 with progress + state counts, green reveal,
      leaderboard with gap % (heuristics-only + intractable marker n>15), P vs NP explainer
- [x] Scene 6 Route Race: BFS vs Dijkstra vs A* on the real network, 3-panel canvas,
      objective toggle (stops/time/transfers), hop + transfer sliders, origin/dest pickers,
      POI walk legs, click/shift-click set origin/dest, winning-route line chips
- [x] `?test=1`: 8 assertion groups, console PASS/FAIL table + on-screen badge; `window.__tsp` hooks

## Phase 3 — verify
- [x] Build index.html; headless smoke: 26/26 checks, 8/8 test groups PASS, zero console errors (`scripts/smoke.mjs`)
- [x] `scripts/showcase.mjs`: 9-step CDP tour, captions, per-step assertions, screenshots + results.json
- [x] Run showcase against local server → 9/9 verified
- [x] Mobile layout check at 390×844 (screenshot, no horizontal scroll; scene 6 stacks 3 panels)
- [x] Visual polish pass on screenshots (glow, easing, legible numbers, spacing, panel headers)

## Phase 4 — showcase pipeline
- [x] `scripts/gen_narration.py` (macOS say, ~86 s talk track, 9 clips)
- [x] `scripts/render_video.mjs` (CDP screencast → 1280×720 MP4 with narration → Desktop/tsp-showcase.mp4)
- [x] `SHOWCASE.md`: recording instructions + talk track + honesty notes
- [x] Render narrated MP4 end-to-end (116 s, 4.6 MB, Desktop + showcase-out)

## Phase 5 — Scene 6 "real problem" extension (user request)
- [x] Brainstorm + /recommend: chose Scene-6-in-TSP, algorithm race, estimates+sliders, stations+POI walk
- [x] Network graph + sanity asserts (Kovan→Raffles Pl 9, →Shenton Way 11, →Telok Ayer 10 stops)
- [x] BFS / Dijkstra / A* generators with (station,service) states, admissible A* heuristic, binary heap
- [x] Test group 8: BFS stop-optimality, Dijkstra≡A*, penalty monotonicity, path validity, determinism
- [x] Smoke + showcase extended (router checks, step 08, badge 8/8); narration + video 9 steps

## Notes / decisions
- Distances are haversine straight-line km, labeled "as the crow flies" everywhere.
- PROMPT's haversine example was wrong: Jurong East ↔ Changi Airport is 27.51 km
  straight-line (30–35 was rail intuition). Tests assert the true value AND
  Boon Lay ↔ Changi Airport = 31.53 km, which genuinely sits in the 30–35 band.
- 20 cities ⇒ (19)!/2 = 6.08×10¹⁶ tours ⇒ ~1.93 years at 1e9/s (NOT universe age —
  talk track stays honest; universe-age comparison appears at ~30 cities).
- Scene 6 times are estimates (uniform hop + transfer penalty + curated walk), labeled
  "not live timings". The Kovan→SGX close fight is computed, not scripted: BFS picks
  Raffles Place (9 stops, 31 min door-to-door); Dijkstra/A* pick Telok Ayer via Chinatown
  (10 stops, 28 min). A* settles 102 states vs Dijkstra 127, same optimum.
- Reference showcase uses 9 steps; TSP spec asked 8 → original build merged closing into
  exact/leaderboard; the Scene-6 extension brings it back to 9 (router + selftest).