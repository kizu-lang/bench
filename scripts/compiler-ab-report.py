#!/usr/bin/env python3
# compiler-ab-report.py OUT: the README.md of a compiler-ab.sh run. Each rev is compared with the one before it.
import os, re, statistics, subprocess, sys

out = sys.argv[1]
revs = open(os.path.join(out, "revs.txt")).read().split()
input_rev = open(os.path.join(out, "input.txt")).read().split()[1]
TOP = 8
# The direct backend's package was renamed; one function keeps one name across revs.
RENAMES = [(r"__internal__arm64__", "__internal__direct__")]


def tsv(name):
    path = os.path.join(out, name)
    if not os.path.exists(path):
        return []
    lines = open(path).read().splitlines()
    head = lines[0].split("\t")
    return [dict(zip(head, l.split("\t"))) for l in lines[1:] if l]


def functions(rev):
    path = os.path.join(out, rev + ".cg")
    if not os.path.exists(path):
        return {}
    text = subprocess.run(["callgrind_annotate", "--threshold=100", path], capture_output=True, text=True).stdout
    found = {}
    for line in text.splitlines():
        m = re.match(r"\s*([\d,]+) \([^)]*\)\s+(?:\?\?\?:)?(\S.*?)(?: \[.*\])?$", line)
        if not m or m.group(2) == "PROGRAM TOTALS":
            continue
        name = m.group(2)
        for a, b in RENAMES:
            name = re.sub(a, b, name)
        found[name] = found.get(name, 0) + int(m.group(1).replace(",", ""))
    return found


def massif_peak(rev):
    path = os.path.join(out, rev + ".massif")
    if not os.path.exists(path):
        return None
    peak, current = None, None
    for line in open(path):
        if line.startswith("mem_heap_B="):
            current = int(line.split("=")[1])
        if line.startswith("heap_tree=peak"):
            peak = current
    return peak


def median(rows, rev, key):
    return statistics.median(float(r[key]) for r in rows if r["rev"] == rev)


def pct(a, b):
    return f"{(b - a) / a * 100:+.1f}%" if a else ""


times = tsv("times.tsv")
perf = tsv("perf.tsv")
counters = {(r["rev"], r["counter"]): float(r["value"]) for r in perf}

print("# compiler A/B\n")
print(f"入力は rev `{input_rev}` の `compiler/`。どの rev の compiler も同じ入力を build する。")
print(f"時間とメモリは {len(times) // max(len(revs), 1)} 回の中央値。命令数と関数ごとの内訳は valgrind の 1 回。\n")

cols = [("wall_s", "wall s"), ("user_s", "user s"), ("sys_s", "sys s"), ("max_rss_kb", "max RSS MB"), ("minor_faults", "minor faults")]
print("| rev | " + " | ".join(c[1] for c in cols) + " | instructions | cycles |")
print("|---" * (len(cols) + 3) + "|")
prev = None
for rev in revs:
    cells = []
    for key, _ in cols:
        v = median(times, rev, key)
        shown = f"{v / 1024:.0f}" if key == "max_rss_kb" else (f"{v:.0f}" if key == "minor_faults" else f"{v:.2f}")
        cells.append(shown + (f" ({pct(median(times, prev, key), v)})" if prev else ""))
    for c in ("instructions", "cycles"):
        v = counters.get((rev, c))
        cells.append("" if v is None else f"{v / 1e9:.2f}G" + (f" ({pct(counters[(prev, c)], v)})" if prev else ""))
    print(f"| `{rev}` | " + " | ".join(cells) + " |")
    prev = rev

peaks = {rev: massif_peak(rev) for rev in revs}
if any(peaks.values()):
    print("\n| rev | heap peak MB (massif) |\n|---|---|")
    for rev in revs:
        print(f"| `{rev}` | {peaks[rev] / 2**20:.0f} |" if peaks[rev] else f"| `{rev}` | |")

fns = {rev: functions(rev) for rev in revs}
for a, b in zip(revs, revs[1:]):
    fa, fb = fns[a], fns[b]
    if not fa or not fb:
        continue
    total_a, total_b = sum(fa.values()), sum(fb.values())
    rows = sorted(((fb.get(k, 0) - fa.get(k, 0), k) for k in set(fa) | set(fb)), key=lambda r: -abs(r[0]))
    print(f"\n## `{a}` → `{b}`: 命令数 {total_a / 1e9:.2f}G → {total_b / 1e9:.2f}G ({pct(total_a, total_b)})\n")
    print("| 差 | 前 | 後 | 関数(self) |\n|---|---|---|---|")
    for d, k in rows[:TOP]:
        print(f"| {d / 1e6:+.0f}M | {fa.get(k, 0) / 1e6:.0f}M | {fb.get(k, 0) / 1e6:.0f}M | `{k}` |")
