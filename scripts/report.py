#!/usr/bin/env python3
"""report.py RESULT_DIR: prints the tables of one result directory as Markdown."""
import glob, json, os, statistics, sys

d = sys.argv[1]
PROGRAMS = "fib sieve matmul collatz nbody binarytrees".split()
VARIANTS = "kizu-direct kizu-llvm go go-nobounds zig-safe zig-fast c-O2 c-O3native".split()


def walls(path):
    out = {}
    for r in json.load(open(path))["results"]:
        name = r["command"].split("/")[-1]
        out[name] = [m["time_wall_clock"]["value"] for m in r["measurements"]]
    return out


def one(path, key="time_wall_clock"):
    r = json.load(open(path))["results"][0]
    return [m[key]["value"] for m in r["measurements"]]


def runtime(rd):
    t = {}
    for p in PROGRAMS:
        for f in sorted(glob.glob(f"{rd}/{p}-*.json")) + glob.glob(f"{rd}/{p}.json"):
            for name, w in walls(f).items():
                v = name.split(f"{p}-", 1)[1]
                t.setdefault((p, v), []).extend(w)
    if not t:
        return
    print("## 実行時間\n")
    print("中央値(秒)。括弧は C -O2 に対する比。最後の列は 6 本の比の幾何平均。\n")
    print("| | " + " | ".join(PROGRAMS) + " | 幾何平均 |")
    print("|---|" + "---|" * (len(PROGRAMS) + 1))
    for v in [v for v in VARIANTS if (PROGRAMS[0], v) in t]:
        cells, ratios = [], []
        for p in PROGRAMS:
            m = statistics.median(t[(p, v)])
            base = statistics.median(t[(p, "c-O2")])
            ratios.append(m / base)
            cells.append(f"{m:.3f} ({m / base:.2f})")
        print(f"| {v} | " + " | ".join(cells) + f" | {statistics.geometric_mean(ratios):.2f} |")
    spread = max((max(w) - min(w)) / statistics.median(w) for w in t.values())
    n = min(len(w) for w in t.values())
    print(f"\n各セル {n} 回以上。最大の (max-min)/中央値 は {spread:.1%}。\n")
    mem = f"{rd}/mem.txt"
    if os.path.exists(mem):
        m = {}
        for line in open(mem):
            p, v, rss, size = line.split()
            m[(p, v)] = (float(rss), int(size))
        print("| | binarytrees 最大 RSS | nbody 最大 RSS | fib の binary |")
        print("|---|---|---|---|")
        for v in [v for v in VARIANTS if ("fib", v) in m]:
            print(f"| {v} | {m[('binarytrees', v)][0] / 2**20:.1f} MB | {m[('nbody', v)][0] / 2**20:.1f} MB | {m[('fib', v)][1] / 1024:.0f} KB |")
        print()


def instructions(rd):
    f = f"{rd}/instructions.txt"
    if not os.path.exists(f):
        return
    n = {}
    for line in open(f):
        p, v, c = line.split()
        n[(p, v)] = None if c == "-" else int(c)
    print("## 実行命令数(valgrind)\n")
    print("10^9 命令。括弧は C -O2 に対する比。\n")
    print("| | " + " | ".join(PROGRAMS) + " |")
    print("|---|" + "---|" * len(PROGRAMS))
    for v in [v for v in VARIANTS if (PROGRAMS[0], v) in n]:
        cells = []
        for p in PROGRAMS:
            c = n.get((p, v))
            cells.append("—" if c is None else f"{c / 1e9:.2f} ({c / n[(p, 'c-O2')]:.2f})")
        print(f"| {v} | " + " | ".join(cells) + " |")
    print()


def compile_(cd):
    sizes = sorted(glob.glob(f"{cd}/m*"), key=lambda s: int(s.rsplit("m", 1)[1]))
    if not sizes:
        return
    names = ["kizu-direct", "kizu-llvm", "go-noopt", "zig-debug", "c-O0",
             "kizu-direct-opt", "kizu-llvm-opt", "go", "zig-fast", "c-O2"]
    print("## build 時間\n")
    print("中央値。実時間 / CPU 時間(秒)。上 5 行が最適化なし、下 5 行が最適化あり。\n")
    for sc, label in [("cold", "ゼロから"), ("edit", "1 関数編集後"), ("noop", "変更なし")]:
        print(f"### {label}\n")
        print("| | " + " | ".join(os.path.basename(s) for s in sizes) + " |")
        print("|---|" + "---|" * len(sizes))
        for name in names:
            cells = []
            for s in sizes:
                f = f"{s}/{name}-{sc}.json"
                if os.path.exists(f):
                    cells.append(f"{statistics.median(one(f)):.2f} / {statistics.median(one(f, 'time_cpu')):.2f}")
                else:
                    cells.append("—")
            print(f"| {name} | " + " | ".join(cells) + " |")
        print()
    print("### 型検査のみ\n")
    print("| | " + " | ".join(os.path.basename(s) for s in sizes) + " |")
    print("|---|" + "---|" * len(sizes))
    for name in ["kizu-check", "go-vet", "zig-check", "c-check"]:
        cells = []
        for s in sizes:
            f = f"{s}/{name}.json"
            cells.append(f"{statistics.median(one(f)):.2f} / {statistics.median(one(f, 'time_cpu')):.2f}" if os.path.exists(f) else "—")
        print(f"| {name} | " + " | ".join(cells) + " |")
    print()
    print("### compiler の最大 RSS(ゼロからの build、最大の規模)\n")
    rss = {}
    for line in open(f"{sizes[-1]}/rss.txt"):
        k, v = line.split()
        rss[k] = float(v)
    print("| | MB |\n|---|---|")
    for name in names:
        if name in rss:
            print(f"| {name} | {rss[name] / 2**20:.0f} |")
    print()


def real(rd):
    if not os.path.exists(f"{rd}/lines.txt"):
        return
    lines = dict(l.split() for l in open(f"{rd}/lines.txt"))
    print("## 実在のコード\n")
    print("| | 行数(空行除く) | 実時間 | CPU 時間 | 行/秒(実時間) |")
    print("|---|---|---|---|---|")
    for f, label, key in [("kizu-check", "kizu check compiler", "kizu_compiler_lines"),
                          ("kizu-default-cold", "kizu build compiler(既定の backend、ゼロから)", "kizu_compiler_lines"),
                          ("kizu-llvm-opt-cold", "kizu build --opt --backend llvm compiler", "kizu_compiler_lines"),
                          ("go-cold", "go build cmd/compile(ゼロから)", "go_cmd_compile_lines"),
                          ("go-cold-1cpu", "go build -p 1 cmd/compile, GOMAXPROCS=1", "go_cmd_compile_lines")]:
        p = f"{rd}/{f}.json"
        if not os.path.exists(p):
            continue
        w, c, n = statistics.median(one(p)), statistics.median(one(p, "time_cpu")), int(lines[key])
        print(f"| {label} | {n:,} | {w:.2f} | {c:.2f} | {n / w:,.0f} |")
    print()


def c_o2_medians(rd):
    t = {}
    for p in PROGRAMS:
        for f in glob.glob(f"{rd}/runtime/{p}-*.json"):
            t.setdefault(p, []).extend(walls(f).get(f"{p}-c-O2", []))
    return {p: statistics.median(w) for p, w in t.items() if w}


def reused():
    f = f"{d}/reused.txt"
    if not os.path.exists(f):
        return
    info = dict(l.split(" ", 1) for l in open(f).read().splitlines())
    measured, base = info["measured"].split(), info["base"]
    print(f"`{' '.join(measured)}` で始まる版だけをこの run で測り、他は `{base}` の値を使う。")
    now, then = c_o2_medians(d), c_o2_medians(os.path.join(os.path.dirname(os.path.normpath(d)), base))
    common = [p for p in PROGRAMS if p in now and p in then]
    if common:
        drift = statistics.geometric_mean([now[p] / then[p] for p in common])
        print(f"両方の run で測った c-O2 の実行時間は、今回 / `{base}` の幾何平均で {drift:.3f}。"
              "1 から離れていれば、流用した版との比較はマシンの状態の差を含む。")
    print()


if os.path.exists(f"{d}/machine.txt"):
    print("```\n" + open(f"{d}/machine.txt").read() + "```\n")
reused()
runtime(f"{d}/runtime")
instructions(f"{d}/runtime")
compile_(f"{d}/compile")
real(f"{d}/real")
