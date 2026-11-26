# TSP Theater — one-shot kickoff prompt

Paste everything below the line into a clean Qwen (opencode) session started in
this directory (`ambassador-qwen/tsp-theater`).

---

Build **TSP Theater**: an interactive, animated explainer of the Traveling
Salesman Problem, set on Singapore's MRT network. One self-contained
`index.html`, zero network calls, zero API keys, zero external libraries —
vanilla JS + Canvas 2D. Dark theme, mobile-friendly, deterministic (seeded RNG)
so demos are reproducible. This is a showcase piece: it must look gorgeous, be
mathematically honest, and verify itself.

The previous project in `../singapore-map/` is the reference for quality bar and
pipeline. Read its `SHOWCASE.md`, `scripts/showcase.mjs`, `scripts/render_video.mjs`,
and `scripts/gen_narration.py` before starting, and reuse those patterns.

## Data (already in this directory)

- `data/stations-onemap.csv` — 213 MRT/LRT stations: `station_code,station_name,lat,lon,source,comment`.
- `data/sg-regions.geojson` — Singapore's 5 region polygons (38 KB).

Build step (`scripts/build_data.py`):
1. Curate a default set of **12 stations spread across the whole island**
   (e.g. Jurong East, HarbourFront, Dhoby Ghaut, Orchard, Bishan, Woodlands,
   Yishun, Tampines, Bedok, Changi Airport, Punggol, Bukit Panjang — adjust so
   the geometry is interesting, not collinear). Embed them as inline JSON.
2. Embed the full station list too, so the city-count slider can add stations.
3. Simplify the region polygons into one low-poly Singapore silhouette
   (target < 8 KB of coordinates), embed inline, render as a subtle dark
   landmass under the graph.
4. Distances: **haversine km** between stations, computed at runtime. Label
   distances honestly as straight-line ("as the crow flies"), not rail distance.
5. Output `index.html` from `index.template.html` by injecting the data JSON.
   Keep the template editable; never hand-edit the generated file.

## The five scenes

A scene selector (tabs or chapters) plus a shared stage: the Singapore canvas
with station dots, the current tour drawn as a glowing polyline, a live
**distance ticker** (km, animated counting), and an explainer panel showing the
algorithm's idea in 2–3 sentences plus its complexity in plain HTML
(`<sup>`/`<sub>`, no math libraries).

**Scene 1 — The Explosion (brute force).**
- Big animated counter of distinct tours: `(n−1)!/2`. Adding cities makes it
  detonate: 10 → 181,440; 15 → 4.3 billion; 20 → 6.08×10¹⁶. Render big-number
  formatting and a "time to check at 1 billion tours/sec" line that grows from
  milliseconds to centuries.
- For n ≤ 8, actually enumerate permutations step-by-step (speed-controlled),
  flashing each candidate tour briefly, keeping the best-so-far highlighted.
  This is the exact optimum for small n — show it.
- For n > 8 the enumerate button disables with a caption explaining why.

**Scene 2 — Nearest Neighbor (greedy).**
- Animated construction: start station pulses, path grows edge by edge from the
  current city to its nearest unvisited one.
- At the end, zoom/highlight the closing edge and any pathologically long edges
  with a caption: "greedy never looks ahead — it paints itself into a corner."
- Show final distance and, when n ≤ 15, its gap vs the exact optimum.

**Scene 3 — 2-opt (local search) — the money shot.**
- Start from a deliberately tangled random tour (seeded). Animate improvements:
  highlight the two edges being removed (red), the reversed segment (sweeping
  highlight), the two new edges (green). The tour visibly **untangles itself**.
- Distance ticker drops with each accepted swap; a swap counter runs.
- Run to local optimum, then caption honestly: "2-opt guarantees no crossing
  edges remain — but a locally optimal tour can still be globally wrong."
- Offer a "shake" button that perturbs the tour and lets 2-opt re-converge.

**Scene 4 — Simulated Annealing.**
- Temperature gauge (vertical thermometer, cooling schedule visible), candidate
  moves flash: downhill accepted (cyan), uphill accepted (amber, with
  "accepted with probability e^(−Δ/T)" caption), rejected (dim red flash).
- Controls: cooling-rate slider, initial-temperature slider, reheat button.
- Jittery exploration visibly settles into a clean tour as T → 0.
- Same honesty caption: near-optimal, not provably optimal.

**Scene 5 — The Exact Answer (Held–Karp DP).**
- For n ≤ 15, run Held–Karp dynamic programming (bitmask DP, O(n²·2ⁿ)) with a
  progress indicator; yield to the UI thread (chunked async) so the page never
  freezes. Show the DP table size and state count as big numbers.
- Reveal the optimal tour in green, then a **leaderboard**: horizontal bars for
  every algorithm's tour length on the current city set, each annotated with
  its optimality gap % vs exact. For n > 15, leaderboard shows heuristics only
  and marks exact as "intractable at this size".
- Closing explainer: P vs NP in three sentences, no hype, no claims of solving
  NP-hardness.

## Shared controls

- Play / pause / single-step / reset; speed slider (0.25×–8×).
- City-count slider 5–20 (exact baseline available ≤ 15; above that, scenes 1
  and 5 adapt as described). Click empty map to add a custom city; click a
  city to remove it (minimum 4). Custom cities get haversine distances too.
- Algorithm color language, consistent everywhere: brute force white,
  nearest-neighbor amber `#f5a623`, 2-opt cyan `#22d3ee`, annealing magenta
  `#e879f9`, exact green `#4ade80`.
- Keyboard: space = play/pause, → = step, 1–5 = scenes, R = reset.
- Seeded RNG (mulberry32 or similar) with a visible seed input; same seed +
  same cities ⇒ identical runs.
- Hover a station: name + code tooltip. Hover a tour edge: its km.
- Layout works at phone width (stage on top, controls below, no horizontal
  scroll).

## Correctness — non-negotiable

Implement a `?test=1` mode that runs silently on load and prints a PASS/FAIL
table to console plus an on-screen badge. Assertions must include:

1. Tour validity: every algorithm's output is a permutation of the cities.
2. Brute force (n=6,7,8) and Held–Karp agree on optimal length and tour cost,
   across 3 seeds each.
3. 2-opt: tour length is monotonically non-increasing over accepted swaps;
   final tour has no improving 2-opt move (check all pairs).
4. Simulated annealing: final length ≤ initial length on the default seed;
   acceptance probability math matches `exp(-delta/T)` (unit-check the function).
5. Haversine sanity: known pair (e.g. Jurong East ↔ Changi Airport ≈ 30–35 km)
   within tolerance; symmetry; zero self-distance.
6. Determinism: two runs with the same seed produce identical move sequences.
7. `(n−1)!/2` counter matches enumerated distinct-tour count for n=5,6.

Also run a headless smoke check (node or Chrome CDP) that the page loads with
zero console errors, and fix anything it finds before declaring done.

## Showcase pipeline (mirror singapore-map)

- `scripts/showcase.mjs`: drives a visible Chrome via CDP (port 9333) through
  an 8-step tour with on-screen captions and per-step assertions (counter
  detonated, greedy path complete, 2-opt swaps happened, annealing cooled,
  exact tour revealed, leaderboard present, tests badge PASS). Writes
  screenshots + `results.json` to `showcase-out/`, prints `N/8 steps verified`.
  Env vars `PACE`, `BASE_URL`, `OUT_DIR`, `CDP_PORT` like the reference.
- `scripts/gen_narration.py` + `scripts/render_video.mjs`: adapt the reference
  scripts to render a narrated 1280×720 MP4 (macOS `say`, ffmpeg) to the
  Desktop as `tsp-showcase.mp4`.
- `SHOWCASE.md`: recording instructions + a ~70-second talk track. Suggested
  beats: (1) "One prompt built this." (2) The problem: visit every station,
  shortest loop. (3) The factorial explosion — 20 cities, longer than the
  universe's age at a billion checks/sec. (4) Greedy is fast and wrong.
  (5) Watch 2-opt untangle the mess. (6) Annealing: sometimes you must go
  uphill to find the best route. (7) For 15 cities, dynamic programming
  proves the true optimum — and every heuristic gets an honest scorecard.
  (8) "Real algorithms, real data, one HTML file, and it tested itself."

## Working agreements

- Keep a `TASKS.md` checklist in this directory; update it as you go.
- Definition of done: `index.html` builds from template; all 7 test groups
  pass; showcase script verifies 8/8; SHOWCASE.md written; no console errors;
  mobile layout checked at 390×844.
- Keep going without "shall I continue?" pauses. Stop and ask only if blocked
  or before destructive operations.
- Aesthetic bar: this is a demo video prop. Glowing tour lines on a dark
  navy island, smooth easing on every animation, big legible numbers,
  generous spacing. If a choice is between correct-but-plain and
  correct-and-beautiful, do both.

Start by reading the reference files listed above, write TASKS.md, then build.
