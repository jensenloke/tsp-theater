# TSP Theater

One self-contained `index.html` (vanilla JS + Canvas 2D, zero dependencies, zero
network calls) that explains the Traveling Salesman Problem on Singapore's real
MRT network — plus a sixth scene that races BFS, Dijkstra and A* on the actual
commute question "what's the fastest way from Kovan to SGX Centre 1?"

Built by Qwen 4 on Claude Code in a single conversation from the one-shot brief
in [`PROMPT.md`](PROMPT.md). Dark theme, mobile-friendly, seeded and deterministic.

## Run it

Open `index.html` in any browser — it works offline, no server needed.
For the showcase/video pipeline serve it locally instead:

```sh
python3 scripts/build_data.py      # regenerate index.html from index.template.html
python3 -m http.server 8899 --bind 127.0.0.1
```

Never hand-edit `index.html`; it is generated from `index.template.html` with the
station data injected by `scripts/build_data.py`.

## The six scenes

1. **The Explosion** — (n−1)!/2 tour counter; 20 stations = 6.08×10¹⁶ tours ≈ 1.93 years at a billion checks/s.
2. **Nearest Neighbor** — greedy tour growth, closing-edge highlight, gap vs exact.
3. **2-opt** — remove / reverse / reconnect animation, local-optimum honesty caption.
4. **Simulated Annealing** — thermometer, cooling schedule, uphill-move flashes.
5. **Held–Karp** — exact bitmask DP up to 15 stations, leaderboard scoring every heuristic against the proven optimum; marked intractable above 15.
6. **Route Race** — BFS vs Dijkstra vs A* on the 143-station MRT graph, objective toggle (stops / time / transfers), hop + transfer sliders, POI walk legs, click / shift-click to set origin / destination.

Keys: `space` play/pause, `→` step, `1–6` scenes, `R` reset. `?test=1` runs the
self-tests: **8 assertion groups**, console table + on-screen badge.

## Verified

- `?test=1` → 8/8 groups PASS (brute force ≡ Held–Karp to 7.1e-15 km; router BFS stop-optimality, Dijkstra ≡ A*, penalty monotonicity, determinism).
- `node scripts/smoke.mjs` → 26/26 headless checks, zero console errors, mobile 390×844.
- `node scripts/showcase.mjs` → 9/9 CDP tour steps with per-step assertions + screenshots.
- Narrated 1280×720 MP4 (~116 s): `python3 scripts/gen_narration.py` then `node scripts/render_video.mjs`.

See [`SHOWCASE.md`](SHOWCASE.md) for recording instructions, the talk track and
the honesty notes (straight-line distances, estimated journey times, the
corrected Jurong East ↔ Changi Airport figure of 27.51 km).

## Layout

| Path | Purpose |
| --- | --- |
| `index.template.html` | Source of truth for the page (edit this) |
| `index.html` | Generated, self-contained build |
| `scripts/build_data.py` | Curates stations, derives the MRT routing graph + POIs, injects JSON |
| `scripts/smoke.mjs` / `showcase.mjs` | Headless checks / recordable CDP tour |
| `scripts/gen_narration.py` / `render_video.mjs` | macOS `say` voiceover + screencast → MP4 |
| `data/` | Open station coordinates (213 rows) + SG region polygons |
| `showcase-out/` | Screenshots, results.json and the narrated MP4 (render intermediates ignored) |
| `PROMPT.md` / `TASKS.md` | The original one-shot brief and the build checklist |

The showcase pipeline mirrors the sibling `singapore-map` project; the reference
scripts were adapted from there.