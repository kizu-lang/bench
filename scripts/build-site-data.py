#!/usr/bin/env python3
import glob
import json
import os
import re
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS_DIR = os.path.join(ROOT, "results")
OUT_PATH = os.path.join(ROOT, "docs", "data.json")

PROGRAMS = ["fib", "sieve", "matmul", "collatz", "nbody", "binarytrees"]
VARIANTS = [
    "kizu-direct",
    "kizu-llvm",
    "rust",
    "rust-native",
    "go",
    "go-nobounds",
    "zig-safe",
    "zig-fast",
    "c-O2",
    "c-O3native",
]
COMPILE_NOOPT = ["kizu-direct", "kizu-llvm", "rust-debug", "go-noopt", "zig-debug", "c-O0"]
COMPILE_OPT = ["kizu-direct-opt", "kizu-llvm-opt", "rust-release", "go", "zig-fast", "c-O2"]
COMPILE_CHECK = ["kizu-check", "rust-check", "go-vet", "zig-check", "c-check"]
COMPILE_ALL = COMPILE_NOOPT + COMPILE_OPT


def parse_machine(path):
    info = {}
    if not os.path.exists(path):
        return info
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or ":" not in line:
                continue
            k, v = line.split(":", 1)
            info[k.strip()] = v.strip()
    return info


def machine_group_label(machine):
    cpu = machine.get("cpu", "Unknown CPU")
    os_str = machine.get("os", "")
    parts = os_str.split()
    os_name = parts[0] if parts else "Unknown"
    arch = parts[-1] if len(parts) >= 2 else ""
    virt = machine.get("virtualized", "")
    env_bits = [x for x in [os_name, arch, virt] if x]
    if env_bits:
        return f"{cpu} ({' '.join(env_bits)})"
    return cpu


def hyperfine_walls(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    for r in data["results"]:
        name = r["command"].split("/")[-1]
        out[name] = [m["time_wall_clock"]["value"] for m in r["measurements"]]
    return out


def hyperfine_one(path, key="time_wall_clock"):
    with open(path, encoding="utf-8") as f:
        r = json.load(f)["results"][0]
    return [m[key]["value"] for m in r["measurements"]]


def parse_runtime(rd):
    if not os.path.isdir(rd):
        return None
    timings = {}
    for p in PROGRAMS:
        for f in sorted(glob.glob(f"{rd}/{p}-*.json")) + glob.glob(f"{rd}/{p}.json"):
            for name, vals in hyperfine_walls(f).items():
                if f"{p}-" not in name:
                    continue
                v = name.split(f"{p}-", 1)[1]
                timings.setdefault((p, v), []).extend(vals)
    if not timings:
        return None
    mem = {}
    mem_path = f"{rd}/mem.txt"
    if os.path.exists(mem_path):
        with open(mem_path, encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 4:
                    mem[(parts[0], parts[1])] = (float(parts[2]), int(parts[3]))
    instr = {}
    instr_path = f"{rd}/instructions.txt"
    if os.path.exists(instr_path):
        with open(instr_path, encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 3:
                    instr[(parts[0], parts[1])] = None if parts[2] == "-" else int(parts[2])
    c_base = {}
    for p in PROGRAMS:
        if (p, "c-O2") in timings:
            c_base[p] = statistics.median(timings[(p, "c-O2")])
    variants = {}
    for v in VARIANTS:
        if not all((p, v) in timings for p in PROGRAMS):
            continue
        progs = {}
        ratios = []
        for p in PROGRAMS:
            vals = timings[(p, v)]
            med = statistics.median(vals)
            base = c_base.get(p)
            ratio = (med / base) if base else None
            if ratio is not None:
                ratios.append(ratio)
            ins = instr.get((p, v))
            ins_base = instr.get((p, "c-O2"))
            progs[p] = {
                "median": round(med, 6),
                "min": round(min(vals), 6),
                "max": round(max(vals), 6),
                "ratio": round(ratio, 4) if ratio is not None else None,
                "samples": len(vals),
                "instructions_g": round(ins / 1e9, 4) if ins is not None else None,
                "instructions_ratio": round(ins / ins_base, 4) if (ins is not None and ins_base) else None,
            }
        entry = {
            "geomean": round(statistics.geometric_mean(ratios), 4) if ratios else None,
            "programs": progs,
        }
        if ("binarytrees", v) in mem:
            entry["binarytrees_rss_mb"] = round(mem[("binarytrees", v)][0] / 2**20, 2)
        if ("nbody", v) in mem:
            entry["nbody_rss_mb"] = round(mem[("nbody", v)][0] / 2**20, 2)
        if ("fib", v) in mem:
            entry["fib_binary_kb"] = round(mem[("fib", v)][1] / 1024.0, 1)
        variants[v] = entry
    spread = max((max(w) - min(w)) / statistics.median(w) for w in timings.values())
    min_samples = min(len(w) for w in timings.values())
    return {
        "variants": variants,
        "spread": round(spread, 4),
        "min_samples": min_samples,
        "has_instructions": bool(instr),
    }


def parse_compile(cd):
    if not os.path.isdir(cd):
        return None
    size_dirs = sorted(glob.glob(f"{cd}/m*"), key=lambda s: int(s.rsplit("m", 1)[1]))
    if not size_dirs:
        return None
    sizes = [os.path.basename(s) for s in size_dirs]
    scenarios = {"cold": {}, "edit": {}, "noop": {}, "check": {}}
    cache = {}
    rss_by_size = {}
    for sdir, sname in zip(size_dirs, sizes):
        for sc in ("cold", "edit", "noop"):
            row = {}
            for name in COMPILE_ALL:
                fp = f"{sdir}/{name}-{sc}.json"
                if os.path.exists(fp):
                    row[name] = {
                        "wall": round(statistics.median(hyperfine_one(fp, "time_wall_clock")), 4),
                        "cpu": round(statistics.median(hyperfine_one(fp, "time_cpu")), 4),
                    }
            if row:
                scenarios[sc][sname] = row
        chk = {}
        for name in COMPILE_CHECK:
            fp = f"{sdir}/{name}.json"
            if os.path.exists(fp):
                chk[name] = {
                    "wall": round(statistics.median(hyperfine_one(fp, "time_wall_clock")), 4),
                    "cpu": round(statistics.median(hyperfine_one(fp, "time_cpu")), 4),
                }
        if chk:
            scenarios["check"][sname] = chk
        cf = f"{sdir}/cache.json"
        if os.path.exists(cf):
            with open(cf, encoding="utf-8") as f:
                raw = json.load(f)
            crow = {}
            for name in COMPILE_ALL:
                if name in raw:
                    e = raw[name]
                    crow[name] = {
                        "total_bytes": e["total_bytes"],
                        "project_bytes": e["project_bytes"],
                        "seed_bytes": e["seed_bytes"],
                        "total_mb": round(e["total_bytes"] / 2**20, 3),
                        "project_mb": round(e["project_bytes"] / 2**20, 3),
                        "seed_mb": round(e["seed_bytes"] / 2**20, 3),
                        "files": e["files"],
                    }
            if crow:
                cache[sname] = crow
        rf = f"{sdir}/rss.txt"
        if os.path.exists(rf):
            rrow = {}
            with open(rf, encoding="utf-8") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) == 2:
                        rrow[parts[0]] = round(float(parts[1]) / 2**20, 1)
            if rrow:
                rss_by_size[sname] = rrow
    largest = sizes[-1]
    return {
        "sizes": sizes,
        "scenarios": scenarios,
        "cache": cache,
        "rss_mb": rss_by_size.get(largest, {}),
        "rss_by_size": rss_by_size,
    }


def parse_real(rd):
    lines_path = f"{rd}/lines.txt"
    if not os.path.exists(lines_path):
        return []
    with open(lines_path, encoding="utf-8") as f:
        lines = dict(l.split() for l in f if l.strip())
    entries = []
    specs = [
        ("kizu-check", "kizu check compiler", "kizu_compiler_lines"),
        ("kizu-default-cold", "kizu build compiler (direct, cold)", "kizu_compiler_lines"),
        ("kizu-llvm-opt-cold", "kizu build --opt --backend llvm compiler", "kizu_compiler_lines"),
        ("go-cold", "go build cmd/compile (cold)", "go_cmd_compile_lines"),
        ("go-cold-1cpu", "go build -p 1 cmd/compile (1 CPU)", "go_cmd_compile_lines"),
    ]
    for fid, label, key in specs:
        p = f"{rd}/{fid}.json"
        if not os.path.exists(p) or key not in lines:
            continue
        w = statistics.median(hyperfine_one(p, "time_wall_clock"))
        c = statistics.median(hyperfine_one(p, "time_cpu"))
        n = int(lines[key])
        entries.append(
            {
                "id": fid,
                "label": label,
                "lines": n,
                "wall": round(w, 3),
                "cpu": round(c, 3),
                "lines_per_sec": round(n / w),
            }
        )
    return entries


def parse_massif_peak_mb(path):
    if not os.path.exists(path):
        return None
    peak = 0
    heap = 0
    extra = 0
    with open(path, encoding="utf-8") as f:
        for line in f:
            if line.startswith("mem_heap_B="):
                heap = int(line.split("=", 1)[1])
            elif line.startswith("mem_heap_extra_B="):
                extra = int(line.split("=", 1)[1])
                peak = max(peak, heap + extra)
    return round(peak / 2**20, 1) if peak else None


def parse_ab(run_dir, run_id):
    revs_path = os.path.join(run_dir, "revs.txt")
    times_path = os.path.join(run_dir, "times.tsv")
    if not (os.path.exists(revs_path) and os.path.exists(times_path)):
        return None
    machine = parse_machine(os.path.join(run_dir, "machine.txt"))
    inp = ""
    inp_path = os.path.join(run_dir, "input.txt")
    if os.path.exists(inp_path):
        inp = open(inp_path, encoding="utf-8").read().strip()
    revs = [l.strip() for l in open(revs_path, encoding="utf-8") if l.strip()]
    by_rev = {r: {"wall": [], "user": [], "sys": [], "rss": [], "faults": []} for r in revs}
    with open(times_path, encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) < 7 or parts[0] not in by_rev:
                continue
            r = parts[0]
            by_rev[r]["user"].append(float(parts[2]))
            by_rev[r]["sys"].append(float(parts[3]))
            by_rev[r]["wall"].append(float(parts[4]))
            by_rev[r]["rss"].append(float(parts[5]) / 1024.0)
            by_rev[r]["faults"].append(int(parts[6]))
    perf = {}
    perf_path = os.path.join(run_dir, "perf.tsv")
    if os.path.exists(perf_path):
        with open(perf_path, encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) >= 3 and parts[0] in by_rev:
                    perf.setdefault(parts[0], {})[parts[1]] = float(parts[2])
    rows = []
    for r in revs:
        b = by_rev[r]
        if not b["wall"]:
            continue
        p = perf.get(r, {})
        rows.append(
            {
                "rev": r,
                "wall": round(statistics.median(b["wall"]), 3),
                "user": round(statistics.median(b["user"]), 3),
                "sys": round(statistics.median(b["sys"]), 3),
                "rss_mb": round(statistics.median(b["rss"]), 1),
                "heap_peak_mb": parse_massif_peak_mb(os.path.join(run_dir, f"{r}.massif")),
                "instructions_g": round(p["instructions"] / 1e9, 2) if "instructions" in p else None,
                "cycles_g": round(p["cycles"] / 1e9, 2) if "cycles" in p else None,
            }
        )
    return {
        "id": run_id,
        "machine_group": machine_group_label(machine),
        "machine": machine,
        "input": inp,
        "revs": rows,
    }


def parse_heap(run_dir, run_id):
    hp = os.path.join(run_dir, "heap.massif")
    if not os.path.exists(hp):
        return None
    readme = os.path.join(run_dir, "README.md")
    rev = run_id.rsplit("-", 1)[-1]
    rss_mb = None
    wall = None
    tp = os.path.join(run_dir, "time.txt")
    if os.path.exists(tp):
        text = open(tp, encoding="utf-8").read()
        m_rss = re.search(r"Maximum resident set size.*?:\s*(\d+)", text)
        if m_rss:
            rss_mb = round(int(m_rss.group(1)) / 1024.0, 1)
        m_wall = re.search(r"Elapsed \(wall clock\) time.*?:\s*(?:(\d+):)?(\d+):([\d.]+)", text)
        if m_wall:
            h = int(m_wall.group(1) or 0)
            m = int(m_wall.group(2))
            s = float(m_wall.group(3))
            wall = round(h * 3600 + m * 60 + s, 2)
    return {
        "id": run_id,
        "rev": rev,
        "rss_mb": rss_mb,
        "heap_peak_mb": parse_massif_peak_mb(hp),
        "pages_peak_mb": parse_massif_peak_mb(os.path.join(run_dir, "pages.massif")),
        "wall": wall,
        "has_readme": os.path.exists(readme),
    }


def build_data():
    runs = []
    compiler_ab = []
    compiler_heap = []
    if os.path.isdir(RESULTS_DIR):
        for name in sorted(os.listdir(RESULTS_DIR)):
            rdir = os.path.join(RESULTS_DIR, name)
            if not os.path.isdir(rdir):
                continue
            ab = parse_ab(rdir, name)
            if ab:
                compiler_ab.append(ab)
                continue
            hp = parse_heap(rdir, name)
            if hp:
                compiler_heap.append(hp)
                continue
            rt = parse_runtime(os.path.join(rdir, "runtime"))
            cp = parse_compile(os.path.join(rdir, "compile"))
            if not rt and not cp:
                continue
            machine = parse_machine(os.path.join(rdir, "machine.txt"))
            runs.append(
                {
                    "id": name,
                    "kind": "compare",
                    "machine_group": machine_group_label(machine),
                    "machine": machine,
                    "runtime": rt,
                    "compile": cp,
                    "real": parse_real(os.path.join(rdir, "real")),
                }
            )
    runs.sort(key=lambda r: (r["machine"].get("date", ""), r["id"]), reverse=True)
    return {
        "schema_version": 1,
        "programs": PROGRAMS,
        "variants": VARIANTS,
        "compile_variants": {
            "noopt": COMPILE_NOOPT,
            "opt": COMPILE_OPT,
            "check": COMPILE_CHECK,
        },
        "runs": runs,
        "compiler_ab": compiler_ab,
        "compiler_heap": compiler_heap,
    }


def main():
    check = "--check" in sys.argv[1:]
    data = build_data()
    encoded = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if check:
        if not os.path.exists(OUT_PATH):
            sys.stderr.write(f"build-site-data: missing {OUT_PATH}\n")
            return 1
        existing = open(OUT_PATH, encoding="utf-8").read()
        if existing != encoded:
            sys.stderr.write("build-site-data: docs/data.json is out of date; run `just site`\n")
            return 1
        print(f"build-site-data: ok ({len(data['runs'])} runs)")
        return 0
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write(encoded)
    print(f"wrote {OUT_PATH} ({len(data['runs'])} runs, {len(data['compiler_ab'])} ab, {len(data['compiler_heap'])} heap)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
