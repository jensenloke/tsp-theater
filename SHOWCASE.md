# TSP Theater — showcase & recording guide

One self-contained `index.html` (vanilla JS + Canvas 2D, zero dependencies, zero
network calls) that explains the Traveling Salesman Problem on Singapore's real
MRT network — plus **Scene 6, the Route Race**: BFS vs Dijkstra vs A* on the
actual commute question "what's the fastest way from Kovan to SGX Centre 1?"

Everything below runs offline against real station coordinates
(`data/stations-onemap.csv`, 213 rows / 181 unique stations, 143 MRT stations
in the routing graph).

## What the demo shows (9 steps)

| # | Step | What you see | Asserted |
|---|------|--------------|----------|
| 1 | Opening | 2-opt untangling a 12-station tour on the island silhouette | n=12, canvas live |
| 2 | The Explosion | (n−1)!/2 counter at 20 cities: 6.08×10¹⁶ tours, ≈1.93 years at 1e9 tours/s | total ≈ 6.0822550204416e16, time in years |
| 3 | Nearest Neighbor | greedy tour grows hop by hop, long closing edge highlighted | done, gap text vs exact |
| 4 | 2-opt | red removed edges → sweeping reversal → green new edges, mid-swap money shot | swaps ≥ 4 mid-run, monotone to done |
| 5 | Annealing | thermometer, cyan downhill / amber uphill / dim-red rejected moves | moves ≥ 300 mid-run, > 500 total |
| 6 | The Exact Answer | Held–Karp bitmask DP, chunked, green optimal reveal | optimum in km, phase=board |
| 7 | Leaderboard | every heuristic scored against the proven optimum (gap %) | ≥ 5 rows, optimal tick, Held–Karp reference |
| 8 | Route Race | Kovan → SGX Centre 1: BFS 9 stops / 31 min vs Dijkstra & A* 10 stops / 28 min door-to-door; A* settles fewer states | BFS total > Dijkstra total, Dijkstra ≡ A*, A* explored ≤ Dijkstra |
| 9 | Self-test | `?test=1` badge | **8/8 PASS** |

## Prerequisites

- macOS with `python3`, `node` ≥ 18 (native WebSocket/fetch), Google Chrome,
  `ffmpeg`/`ffprobe`, and `say` (for narration).
- Build the page first (never hand-edit `index.html`):
  ```sh
  python3 scripts/build_data.py
  ```

## Run the live showcase

```sh
# 1. static server
python3 -m http.server 8899 --bind 127.0.0.1 &

# 2. visible Chrome with CDP
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9333 --user-data-dir=/tmp/tsp-showcase \
  --window-size=1440,900 --no-first-run http://localhost:8899/index.html &

# 3. drive it
node scripts/showcase.mjs
```

Prints `==== SHOWCASE: 9/9 steps verified ====` and writes screenshots +
`results.json` to `showcase-out/`. Exit code is non-zero if any step fails.

| Env | Default | Meaning |
|-----|---------|---------|
| `PACE` | `1` | multiplier on every pause (2 = slower, more readable live) |
| `BASE_URL` | `http://localhost:8899/index.html` | page under test |
| `OUT_DIR` | `./showcase-out` | screenshots + results.json |
| `CDP_PORT` | `9333` | Chrome DevTools port |

Headless variant (no visible Chrome needed): `node scripts/smoke.mjs` launches
its own Chrome + server, runs all 8 self-test groups, exercises every scene,
click-tests add/remove city and shift-click destination, checks 390×844 mobile
layout, and demands zero console errors (26/26 checks).

## Narrated video

```sh
python3 scripts/gen_narration.py     # 9 clips, macOS say (Samantha, -r 182), ~86 s
node scripts/render_video.mjs        # CDP screencast → 1280×720 H.264/AAC
```

Outputs `showcase-out/tsp-showcase.mp4` and copies to `~/Desktop/tsp-showcase.mp4`
(~116 s with holds and tail). The renderer paces each step to its narration
clip, mixes the voiceover at measured wall-clock offsets, and pads the tail.
Requires the same server + CDP Chrome as above (headless Chrome is fine here).

## Talk track (~86 s, honest numbers)

1. "This entire interactive explainer of the traveling salesman problem was
   built by an AI model from one prompt, in a single conversation."
2. "The problem: visit every station, shortest loop. But the loops explode
   factorially. Twenty cities means six times ten to the sixteen tours. At a
   billion checks per second, that's two years. Thirty cities would outlast
   the universe."
3. "Nearest neighbor is fast: always hop to the closest unvisited station. And
   it's wrong. Greedy never looks ahead, so it paints itself into a corner."
4. "Two opt untangles the mess. Remove two edges, reverse the segment between
   them, reconnect if shorter. Repeat until no swap helps. No crossings left,
   but still no guarantee of the best loop."
5. "Simulated annealing sometimes goes uphill on purpose, accepting worse tours
   with a probability that shrinks as the temperature falls. Hot exploration,
   cold refinement."
6. "For fifteen cities or fewer, Held Karp dynamic programming proves the true
   optimum. No tour enumerated, every subset state solved."
7. "And every heuristic gets an honest scorecard against that optimum. Above
   fifteen cities, exact is intractable, and the board says so."
8. "Now the real commute: Kovan to SGX Centre one. Fewest stops says nine.
   Fastest door to door says ten stops, and three minutes quicker. The
   objective is a choice."
9. "Real algorithms, real MRT coordinates, one self contained HTML file, zero
   dependencies. And it tested itself: eight assertion groups, all passing."

## Honesty notes (kept everywhere: UI, tests, narration)

- Distances are **haversine straight-line km**, labeled "as the crow flies".
  The kickoff prompt's "Jurong East ↔ Changi Airport ≈ 30–35 km" was rail
  intuition: true great-circle is **27.51 km**. Tests assert that, plus
  Boon Lay ↔ Changi Airport = 31.53 km which genuinely sits in 30–35.
- 20 cities ⇒ (19)!/2 = 6.08×10¹⁶ tours ⇒ **≈1.93 years** at 1e9/s, *not* the
  age of the universe. The universe-age comparison appears at ~30 cities
  (computed live, ~10,000× universe age).
- Scene 6 times are **estimates, not live timings**: uniform hop minutes
  (slider 1–4, default 2) + transfer penalty (slider 0–10, default 4), curated
  walk minutes to POIs. LRT is excluded from the routing graph; the Changi
  shuttle (CG) is its own service so you transfer at Tanah Merah, as in real
  life; the Marina Bay branch (CE) through-runs as Circle Line service.
- Missing station numbers (CC18, NS6, NE2, TE10, TE21) are unbuilt reserved
  stations — consecutive *existing* codes are adjacent, which matches reality.
- The Kovan → SGX close fight is real and computed, not scripted: BFS settles
  on Raffles Place (9 stops, 1 transfer, 9 min walk = 31 min); Dijkstra/A*
  choose Telok Ayer via Chinatown (10 stops, 1 transfer, 4 min walk = 28 min).
  A* matches Dijkstra's optimum while settling 102 vs 127 states.
- 2-opt captions admit local optima; annealing captions admit no optimality
  guarantee; the leaderboard marks exact "intractable at this size" above 15.

## What is verified, mechanically

- `?test=1` → 8 assertion groups, console table + on-screen badge:
  tour validity; brute ≡ Held–Karp (n=6,7,8 × 3 seeds, max Δ 7.1e-15 km);
  2-opt monotone + no improving move left; SA improves + e^(−Δ/T) unit checks;
  haversine sanity; determinism (identical move signatures); (n−1)!/2 counter
  matches enumeration (n=5→12, n=6→60); router (BFS stop-optimality,
  Dijkstra ≡ A*, penalty monotonicity, path validity, determinism).
- `scripts/smoke.mjs`: 26/26 checks, zero console errors, mobile 390×844.
- `scripts/showcase.mjs`: 9/9 steps with per-step assertions + screenshots.