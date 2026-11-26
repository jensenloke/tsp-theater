#!/usr/bin/env python3
"""Generate per-step narration with macOS say; convert to WAV; record durations.
9 clips, ~85 s total, matched to scripts/showcase.mjs / render_video.mjs steps."""
import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "showcase-out", "render", "audio")
os.makedirs(OUT, exist_ok=True)

VOICE = "Samantha"
voices = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
if VOICE not in voices:
    VOICE = "Daniel" if "Daniel" in voices else None

LINES = [
    "This entire interactive explainer of the traveling salesman problem was built by an A I model from one prompt, in a single conversation.",
    "The problem: visit every station, shortest loop. But the loops explode factorially. Twenty cities means six times ten to the sixteen tours. At a billion checks per second, that's two years. Thirty cities would outlast the universe.",
    "Nearest neighbor is fast: always hop to the closest unvisited station. And it's wrong. Greedy never looks ahead, so it paints itself into a corner.",
    "Two opt untangles the mess. Remove two edges, reverse the segment between them, reconnect if shorter. Repeat until no swap helps. No crossings left, but still no guarantee of the best loop.",
    "Simulated annealing sometimes goes uphill on purpose, accepting worse tours with a probability that shrinks as the temperature falls. Hot exploration, cold refinement.",
    "For fifteen cities or fewer, Held Karp dynamic programming proves the true optimum. No tour enumerated, every subset state solved.",
    "And every heuristic gets an honest scorecard against that optimum. Above fifteen cities, exact is intractable, and the board says so.",
    "Now the real commute: Kovan to S G X Centre one. Fewest stops says nine. Fastest door to door says ten stops, and three minutes quicker. The objective is a choice.",
    "Real algorithms, real M R T coordinates, one self contained H T M L file, zero dependencies. And it tested itself: eight assertion groups, all passing.",
]

def dur(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "default=noprint_wrappers=1:nokey=1", path],
                       capture_output=True, text=True)
    return float(r.stdout.strip())

meta = []
for i, line in enumerate(LINES, 1):
    aiff = os.path.join(OUT, f"step{i}.aiff")
    wav = os.path.join(OUT, f"step{i}.wav")
    cmd = ["say", "-r", "182", "-o", aiff]
    if VOICE:
        cmd += ["-v", VOICE]
    cmd.append(line)
    subprocess.run(cmd, check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-ac", "1", wav], check=True)
    os.remove(aiff)
    d = dur(wav)
    meta.append({"step": i, "wav": wav, "duration": round(d, 3), "text": line})
    print(f"step {i}: {d:.2f}s  ({VOICE or 'default'})")

json.dump(meta, open(os.path.join(OUT, "narration.json"), "w"), indent=2)
total = sum(m["duration"] for m in meta)
print(f"Total narration: {total:.1f}s across {len(meta)} clips")