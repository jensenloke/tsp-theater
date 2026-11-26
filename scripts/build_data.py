#!/usr/bin/env python3
"""Build TSP Theater data payload and inject it into index.template.html -> index.html.

- Curates 12 default stations spread across the island (order chosen so any
  prefix of 5+ is still geographically interesting).
- Dedupes the full 213-row station CSV by name (interchanges share coordinates).
- Simplifies the 5 region MultiPolygons into one low-poly island silhouette
  (< 8 KB of coordinate JSON), rendered as a single dark landmass.
- Distances are NOT baked in: the page computes haversine km at runtime.

Never hand-edit index.html; edit the template and re-run this script.
"""
import csv, json, math, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
R = 6371.0088  # mean Earth radius, km

# ---------------------------------------------------------------- stations
rows = list(csv.DictReader(open(os.path.join(DATA, "stations-onemap.csv"))))
by_name = {}
for r in rows:
    name = r["station_name"].strip()
    s = by_name.setdefault(name, {"name": name, "codes": [],
                                  "lat": float(r["lat"]), "lon": float(r["lon"])})
    s["codes"].append(r["station_code"])

def station(name):
    s = by_name[name]
    return {"code": s["codes"][0], "name": name,
            "lat": round(s["lat"], 6), "lon": round(s["lon"], 6)}

# Default 12, ordered so the first 5-6 are maximally spread (west, far east,
# far north, south, north-east, centre) — small-n demos stay non-collinear.
DEFAULT_NAMES = [
    "Jurong East", "Changi Airport", "Woodlands", "HarbourFront", "Punggol",
    "Bishan", "Tampines", "Yishun", "Bedok", "Dhoby Ghaut", "Orchard",
    "Bukit Panjang",
]
# Slider 13..20 appends these, still spread across the island.
EXTRA_NAMES = [
    "Boon Lay", "Sembawang", "Pasir Ris", "Marina Bay",
    "Sengkang", "Clementi", "Hougang", "Expo",
]
for n in DEFAULT_NAMES + EXTRA_NAMES:
    assert n in by_name, f"missing station: {n}"

defaults = [station(n) for n in DEFAULT_NAMES]
extras = [station(n) for n in EXTRA_NAMES]
stations = [{"code": s["codes"][0], "codes": s["codes"], "name": s["name"],
             "lat": round(s["lat"], 6), "lon": round(s["lon"], 6)}
            for s in sorted(by_name.values(), key=lambda s: s["name"])]

# ---------------------------------------------------------------- island
def ring_area_km2(ring):
    total = 0.0
    for i in range(len(ring) - 1):
        lng1, lat1 = ring[i]
        lng2, lat2 = ring[i + 1]
        total += math.radians(lng2 - lng1) * (
            2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total) * R * R / 2

def perp_dist(p, a, b):
    """Point-to-segment distance in degrees (fine for simplification)."""
    ax, ay = a; bx, by = b; px, py = p
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))

def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp_dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        left = douglas_peucker(pts[:idx + 1], tol)
        right = douglas_peucker(pts[idx:], tol)
        return left[:-1] + right
    return [pts[0], pts[-1]]

geo = json.load(open(os.path.join(DATA, "sg-regions.geojson")))
parts = []  # (area, outer ring)
for f in geo["features"]:
    g = f["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    for poly in polys:
        ring = poly[0]  # outer ring only; SG regions have no enclaves
        parts.append((ring_area_km2(ring), ring))
parts.sort(key=lambda t: -t[0])
# Keep the main island mass + sizeable offshore islands (Sentul, Tekong,
# Jurong Island, Semakau...); drop islets that vanish at demo zoom anyway.
kept = [(a, r) for a, r in parts if a >= 0.9]

def build_island(tol):
    rings = []
    for _, ring in kept:
        simp = douglas_peucker([(p[0], p[1]) for p in ring], tol)
        if len(simp) < 4:
            continue
        if simp[0] != simp[-1]:
            simp.append(simp[0])
        rings.append([[round(x, 4), round(y, 4)] for x, y in simp])
    return rings

TOL = 0.0008
island = build_island(TOL)
while len(json.dumps(island, separators=(",", ":"))) > 7800 and TOL < 0.02:
    TOL *= 1.35
    island = build_island(TOL)
island_json = json.dumps(island, separators=(",", ":"))
assert len(island_json) < 8192, f"island too big: {len(island_json)}"

# ---------------------------------------------------------------- sanity
def haversine(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))

je, cg = station("Jurong East"), station("Changi Airport")
d = haversine(je, cg)
# True straight-line JE<->CG is 27.5 km (the kickoff prompt's 30-35 guess was
# rail-distance intuition). Assert the honest value, and use Boon Lay<->CG
# (31.5 km) as the pair that genuinely sits in 30-35 km.
assert 27.0 <= d <= 28.5, f"Jurong East <-> Changi Airport = {d:.2f} km, expected ~27.5"
bl = station("Boon Lay")
d2 = haversine(bl, cg)
assert 30 <= d2 <= 35, f"Boon Lay <-> Changi Airport = {d2:.2f} km, expected 30-35"

# ---------------------------------------------------------------- MRT network
# Adjacency is derived from station codes: consecutive EXISTING numbers on a
# line are adjacent (missing numbers are unbuilt reserved stations, e.g. CC18
# Bukit Brown, NS6, NE2, TE10/TE21 — the real line skips them).
# CE (Bayfront–Marina Bay) runs as part of the Circle Line service; CG
# (Expo–Changi Airport) is a separate shuttle service — you transfer at
# Tanah Merah, exactly as in real life. LRT is excluded from the routing graph.
import re
LINE_META = {
    "NS": ("North–South Line", "#e0453a"),
    "EW": ("East–West Line", "#2ea86a"),
    "NE": ("North–East Line", "#b06fd8"),
    "CC": ("Circle Line", "#f5a623"),
    "DT": ("Downtown Line", "#4f8ff7"),
    "TE": ("Thomson–East Coast Line", "#c08a4e"),
    "CE": ("Circle Line · Marina Bay branch", "#f5a623"),
    "CG": ("Changi Airport shuttle", "#2ea86a"),
}
SERVICE_OF = {"CE": "CC"}  # CE through-runs as Circle Line service
MRT_PREFIXES = set(LINE_META)

seqs = {}
for r in rows:
    m = re.match(r"([A-Z]+)(\d+)$", r["station_code"])
    if m and m.group(1) in MRT_PREFIXES:
        seqs.setdefault(m.group(1), []).append((int(m.group(2)), r["station_name"].strip()))
for L in seqs:
    seqs[L].sort()

net_names = sorted({n for L in seqs for _, n in seqs[L]})
net_idx = {n: i for i, n in enumerate(net_names)}
net_nodes = []
for n in net_names:
    s = by_name[n]
    codes = [c for c in s["codes"] if re.match(r"[A-Z]+\d+$", c) and re.match(r"([A-Z]+)", c).group(1) in MRT_PREFIXES]
    services = sorted({SERVICE_OF.get(re.match(r"([A-Z]+)", c).group(1), re.match(r"([A-Z]+)", c).group(1)) for c in codes})
    net_nodes.append({"name": n, "lat": round(s["lat"], 6), "lon": round(s["lon"], 6),
                      "codes": codes, "services": services})

net_edges = []
def chain(stations, line):
    for (_, a), (_, b) in zip(stations, stations[1:]):
        net_edges.append([net_idx[a], net_idx[b], line])
for L in ("NS", "EW", "NE", "CC", "DT", "TE"):
    chain(seqs[L], L)
chain(seqs["CE"], "CE")
chain(seqs["CG"], "CG")
# branch attachments: Promenade (CC4) <-> Bayfront (CE1); Tanah Merah (EW4) <-> Expo (CG1)
net_edges.append([net_idx["Promenade"], net_idx["Bayfront"], "CE"])
net_edges.append([net_idx["Tanah Merah"], net_idx["Expo"], "CG"])

# sanity: the Kovan -> SGX Centre close fight must exist in the graph
def net_hop_count(a, b):
    """BFS fewest stops, build-time sanity only."""
    from collections import deque
    adj = {}
    for i, j, _ in net_edges:
        adj.setdefault(i, []).append(j)
        adj.setdefault(j, []).append(i)
    q, seen = deque([(net_idx[a], 0)]), {net_idx[a]}
    while q:
        u, d = q.popleft()
        if u == net_idx[b]:
            return d
        for v in adj.get(u, []):
            if v not in seen:
                seen.add(v)
                q.append((v, d + 1))
    return None
assert net_hop_count("Kovan", "Raffles Place") == 9, "Kovan->Raffles Place should be 9 stops"
assert net_hop_count("Kovan", "Shenton Way") == 11, "Kovan->Shenton Way should be 11 stops"
assert net_hop_count("Kovan", "Telok Ayer") == 10, "Kovan->Telok Ayer should be 10 stops (via Chinatown)"

# Curated points of interest with estimated walking minutes from nearby
# stations (honest estimates, labeled as such in the UI).
POIS = [
    {"name": "SGX Centre 1", "anchor": "Shenton Way",
     "walk": [["Shenton Way", 2], ["Telok Ayer", 4], ["Downtown", 6], ["Raffles Place", 9]]},
    {"name": "Marina Bay Sands", "anchor": "Bayfront",
     "walk": [["Bayfront", 3], ["Marina Bay", 8]]},
    {"name": "Gardens by the Bay", "anchor": "Gardens by the Bay",
     "walk": [["Gardens by the Bay", 2], ["Bayfront", 12]]},
    {"name": "Changi Airport / Jewel", "anchor": "Changi Airport",
     "walk": [["Changi Airport", 5]]},
    {"name": "Orchard Road", "anchor": "Orchard",
     "walk": [["Orchard", 2], ["Somerset", 5]]},
    {"name": "National Stadium", "anchor": "Stadium",
     "walk": [["Stadium", 4], ["Kallang", 9]]},
    {"name": "VivoCity", "anchor": "HarbourFront",
     "walk": [["HarbourFront", 2]]},
]
for p in POIS:
    for wname, _ in p["walk"]:
        assert wname in net_idx, f"POI walk station missing: {wname}"
    p["walkIdx"] = [[net_idx[w], mins] for w, mins in p["walk"]]
    a = by_name[p["anchor"]]
    p["lat"], p["lon"] = round(a["lat"], 6), round(a["lon"], 6)

JOURNEYS = [
    {"from": "Kovan", "to": "SGX Centre 1"},
    {"from": "Woodlands", "to": "Changi Airport / Jewel"},
    {"from": "Jurong East", "to": "Marina Bay Sands"},
    {"from": "HarbourFront", "to": "Punggol"},
    {"from": "Boon Lay", "to": "Gardens by the Bay"},
]

network = {
    "nodes": net_nodes,
    "edges": net_edges,
    "lines": {L: {"name": LINE_META[L][0], "color": LINE_META[L][1]} for L in LINE_META},
    "pois": POIS,
    "journeys": JOURNEYS,
}
network_json = json.dumps(network, ensure_ascii=False, separators=(",", ":"))

payload = {
    "defaults": defaults,
    "extras": extras,
    "stations": stations,
    "island": island,
    "radiusKm": R,
    "network": network,
}
data_js = "window.TSP_DATA=" + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";"

tpl_path = os.path.join(ROOT, "index.template.html")
html = open(tpl_path).read()
assert "__DATA_JS__" in html, "template missing __DATA_JS__ placeholder"
html = html.replace("__DATA_JS__", data_js)
out = os.path.join(ROOT, "index.html")
open(out, "w").write(html)

npts = sum(len(r) for r in island)
print(f"Wrote {out} ({os.path.getsize(out)/1024:.0f} KB)")
print(f"  defaults={len(defaults)} extras={len(extras)} stations={len(stations)}")
print(f"  island: {len(island)} rings, {npts} points, {len(island_json)/1024:.1f} KB (tol={TOL:.5f} deg)")
print(f"  haversine sanity: Jurong East <-> Changi Airport = {d:.2f} km (true ~27.5)")
print(f"                    Boon Lay <-> Changi Airport = {d2:.2f} km (30-35 band)")
print(f"  network: {len(net_nodes)} MRT stations, {len(net_edges)} edges, "
      f"{len(POIS)} POIs, {len(JOURNEYS)} preset journeys, {len(network_json)/1024:.1f} KB")
print(f"  Kovan->Raffles Place = {net_hop_count('Kovan','Raffles Place')} stops · "
      f"Kovan->Shenton Way = {net_hop_count('Kovan','Shenton Way')} stops")