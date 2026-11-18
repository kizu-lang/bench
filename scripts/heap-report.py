#!/usr/bin/env python3
# heap-report.py OUT [FN...]: the README.md of a heap.sh run. Splits the heap at its peak by compiler phase and by
# allocation site. With FN, also the call chains through each FN and the heap without what the FNs allocated.
import collections, os, re, sys

out, drops = sys.argv[1], sys.argv[2:]
MB = 2**20
NODE = re.compile(r"^ *n(\d+): (\d+) (.*)$")
# Frames that allocate on behalf of a caller; the site is the first frame above them.
RUNTIME = re.compile(r"^(kizu_|malloc|realloc|calloc|std__|0x|in |\?\?\?|_)")
PHASE = re.compile(r"compiler__internal__([a-z_0-9]+?)__")


def frame(text):
    m = re.match(r"0x[0-9A-F]+: (\S+)", text)
    return m.group(1) if m else text[:60]


def parse(lines, i):
    n, b, rest = NODE.match(lines[i]).groups()
    kids, j = [], i + 1
    for _ in range(int(n)):
        kid, j = parse(lines, j)
        kids.append(kid)
    return (int(b), frame(rest), kids), j


def snapshots(path):
    lines = open(path).read().split("\n")
    snaps, cur = [], {}
    for i, line in enumerate(lines):
        if line.startswith("snapshot="):
            cur = {"n": int(line[9:])}
            snaps.append(cur)
        elif line.startswith("mem_heap_B="):
            cur["heap"] = int(line[11:])
        elif line in ("heap_tree=detailed", "heap_tree=peak"):
            cur["kind"] = line[10:]
            cur["tree"] = parse(lines, i + 1)[0]
    return snaps


def leaves(node, stack=()):
    b, name, kids = node
    stack = stack + (name,)
    self_b = b - sum(k[0] for k in kids)
    if self_b > 0 and len(stack) > 1:
        yield self_b, stack[1:]
    for k in kids:
        yield from leaves(k, stack)


def under(node, name):
    b, n, kids = node
    return b if n == name else sum(under(k, name) for k in kids)


def table(title, counter, top):
    print(f"\n| MB | {title} |\n|---|---|")
    for k, v in counter.most_common(top):
        print(f"| {v / MB:.1f} | `{k}` |")


heap = snapshots(os.path.join(out, "heap.massif"))
pages = snapshots(os.path.join(out, "pages.massif"))
info = dict(l.split(" ", 1) for l in open(os.path.join(out, "input.txt")).read().splitlines())
time = dict(kv.split("=") for kv in open(os.path.join(out, "time.txt")).read().split())
peak = next(s for s in heap if s.get("kind") == "peak")

print("# heap\n")
print(f"rev `{info['rev']}` の compiler が `{info['input']}` を build したとき。\n")
print("| max RSS MB | heap peak MB (massif) | pages peak MB (massif --pages-as-heap) | wall s | minor faults |")
print("|---|---|---|---|---|")
print(f"| {int(time['max_rss_kb']) / 1024:.0f} | {peak['heap'] / MB:.0f} | {max(s['heap'] for s in pages) / MB:.0f} "
      f"| {time['wall_s']} | {time['minor_faults']} |")

n = len(heap)
print("\nheap MB の推移(snapshot を 10 等分):\n")
print(" → ".join(f"{heap[min(n - 1, n * q // 10)]['heap'] / MB:.0f}" for q in range(11)))
print(f"\nピークは snapshot {peak['n']}(全 {n} 個中)。")

by_phase, by_site = collections.Counter(), collections.Counter()
for b, frames in leaves(peak["tree"]):
    by_site[next((f for f in frames if not RUNTIME.match(f)), frames[-1])] += b
    phase = next((m.group(1) for f in reversed(frames) if (m := PHASE.match(f))), None)
    by_phase[phase or next((f for f in frames if f.startswith("compiler__")), "?")] += b
print("\n## ピークの内訳")
table("phase(stack 上でいちばん外側の compiler の package)", by_phase, 10)
table("確保した場所(runtime を除いた最初の frame)", by_site, 18)

if drops:
    chains = collections.Counter()
    for b, frames in leaves(peak["tree"]):
        for d in drops:
            if d in frames:
                j = frames.index(d)
                chains[" <- ".join(frames[max(0, j - 2):j + 4])] += b
    print("\n## 指定した関数を通る呼び出し")
    table("chain", chains, 12)
    print("\n## 指定した関数の確保がなかったら\n")
    print("| snapshot | 種類 | heap MB | 除いた後 MB | " + " | ".join(f"`{d}`" for d in drops) + " |")
    print("|---" * (len(drops) + 4) + "|")
    for s in heap:
        if "tree" not in s:
            continue
        cut = [under(s["tree"], d) for d in drops]
        print(f"| {s['n']} | {s['kind']} | {s['heap'] / MB:.0f} | {(s['heap'] - sum(cut)) / MB:.0f} | "
              + " | ".join(f"{c / MB:.0f}" for c in cut) + " |")
