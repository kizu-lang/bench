#!/usr/bin/env python3
import argparse
import datetime
import glob
import json
import os
import pathlib
import platform
import re
import resource
import shutil
import statistics
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
ALL_BENCHMARKS = ["fib", "sieve", "matmul", "collatz", "nbody", "binarytrees"]
BENCH_FUNCS = {
    "fib": ("fib", "main"),
    "sieve": ("sieve", "main"),
    "matmul": ("matmul", "main"),
    "collatz": ("collatz", "main"),
    "nbody": ("body", "advance", "energy", "main"),
    "binarytrees": ("make", "check", "deinit", "main"),
}
ARM64_MEM_PREFIXES = ("ldr", "str", "ldp", "stp", "ldur", "stur")
RUNTIME_SYMBOL_PREFIXES = (
    "kz_std",
    "std__",
    "kizu_",
    "std::",
    "core::",
    "alloc::",
    "__",
    "dyld",
    "frame_dummy",
    "register_tm",
    "deregister_tm",
    "start",
)


def norm_arch():
    m = platform.machine().lower()
    if m in ("arm64", "aarch64"):
        return "arm64"
    if m in ("x86_64", "amd64"):
        return "x86_64"
    return m


def parse_kizu_label(version_str):
    m = re.search(r"kizu\s+([^\s]+)\s+\(([0-9a-f]+)", version_str)
    if m:
        ver, sha = m.group(1), m.group(2)
        return f"devel ({sha[:12]})" if ver == "devel" else ver
    m2 = re.search(r"kizu\s+([^\s]+)", version_str)
    if m2:
        return m2.group(1)
    return version_str.strip() or "unknown"


def clamp_nofile():
    try:
        soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
        target = 65536
        if soft > target or soft == resource.RLIM_INFINITY:
            new_soft = target if hard == resource.RLIM_INFINITY else min(target, hard)
            resource.setrlimit(resource.RLIMIT_NOFILE, (new_soft, hard))
    except (ValueError, OSError):
        pass


def run_cmd(cmd, cwd=None, env=None, input_text=None, clamp_fd=False):
    preexec = clamp_nofile if clamp_fd else None
    return subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        input=input_text,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        preexec_fn=preexec,
    )


def measure_paths(patterns):
    seen = set()
    total = 0
    files = 0
    for pat in patterns:
        matches = glob.glob(pat) if any(ch in pat for ch in "*?[") else [pat]
        for path in matches:
            if not os.path.exists(path):
                continue
            if os.path.isfile(path) and not os.path.islink(path):
                st = os.lstat(path)
                key = (st.st_dev, st.st_ino)
                if key not in seen:
                    seen.add(key)
                    total += st.st_size
                    files += 1
            elif os.path.isdir(path):
                for root, _, names in os.walk(path):
                    for name in names:
                        fp = os.path.join(root, name)
                        if os.path.islink(fp):
                            continue
                        try:
                            st = os.lstat(fp)
                        except OSError:
                            continue
                        key = (st.st_dev, st.st_ino)
                        if key not in seen:
                            seen.add(key)
                            total += st.st_size
                            files += 1
    return total, files


def find_objdump():
    for name in ("llvm-objdump", "objdump"):
        p = shutil.which(name)
        if p:
            return p, name
    return None, None


def get_text_size(bin_path, objdump_path):
    if objdump_path:
        res = run_cmd([objdump_path, "-h", bin_path])
        if res.returncode == 0:
            for line in res.stdout.splitlines():
                m = re.match(r"^\s*\d+\s+(?:\.text|__text)\s+([0-9a-fA-F]+)\b", line)
                if m:
                    return int(m.group(1), 16)
    if platform.system() == "Darwin":
        if shutil.which("size"):
            res = run_cmd(["size", "-m", bin_path])
            if res.returncode == 0:
                m = re.search(r"Section __text:\s*(\d+)", res.stdout)
                if m:
                    return int(m.group(1))
        if shutil.which("otool"):
            res = run_cmd(["otool", "-l", bin_path])
            if res.returncode == 0:
                in_text = False
                for line in res.stdout.splitlines():
                    s = line.strip()
                    if s.startswith("sectname "):
                        in_text = s.split()[-1] == "__text"
                    elif in_text and s.startswith("size "):
                        return int(s.split()[-1], 16)
    else:
        if shutil.which("size"):
            res = run_cmd(["size", "-A", bin_path])
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    m = re.match(r"^\.text\s+(\d+)\b", line.strip())
                    if m:
                        return int(m.group(1))
        if shutil.which("readelf"):
            res = run_cmd(["readelf", "-S", "-W", bin_path])
            if res.returncode == 0:
                for line in res.stdout.splitlines():
                    m = re.search(r"\.text\s+\S+\s+[0-9a-fA-F]+\s+[0-9a-fA-F]+\s+([0-9a-fA-F]+)", line)
                    if m:
                        return int(m.group(1), 16)
    return None


def is_bench_symbol(raw_sym, bench):
    sym = raw_sym.lstrip("_")
    if not sym:
        return False
    for prefix in RUNTIME_SYMBOL_PREFIXES:
        if sym.startswith(prefix):
            return False
    names = BENCH_FUNCS.get(bench, (bench, "main"))
    if sym in names:
        return True
    for n in names:
        if sym == f"kz_{n}":
            return True
        if sym.startswith("kz_") and (sym.endswith(f"_{n}") or sym.endswith(f"${n}") or sym.endswith(f"::{n}")):
            return True
        if f"{bench}::{n}" in sym:
            return True
        if f"{len(bench)}{bench}{len(n)}{n}" in sym:
            return True
    return False


def is_spill_insn(mnemonic, operands, arch):
    mn = mnemonic.lower()
    op = operands.split(";", 1)[0].split("#", 1)[0] if arch == "x86_64" else operands.split(";", 1)[0]
    op_low = op.lower()
    if arch == "arm64":
        if any(mn.startswith(p) for p in ARM64_MEM_PREFIXES):
            if re.search(r"\[sp(?:\s*[,\]])", op_low):
                return True
        return False
    if arch == "x86_64":
        if mn.startswith("lea"):
            return False
        if re.search(r"\(%rsp\b", op_low) or re.search(r"\[rsp\b", op_low):
            return True
        return False
    return False


def disassemble_text(bin_path, objdump_path):
    is_darwin = platform.system() == "Darwin"
    if objdump_path:
        attempts = (
            [[objdump_path, "-d", "--section=__text", bin_path], [objdump_path, "-d", bin_path]]
            if is_darwin
            else [[objdump_path, "-d", "-j", ".text", bin_path], [objdump_path, "-d", bin_path]]
        )
        for cmd in attempts:
            res = run_cmd(cmd)
            if res.returncode == 0 and res.stdout.strip():
                return res.stdout, "objdump"
    if is_darwin and shutil.which("otool"):
        res = run_cmd(["otool", "-tV", bin_path])
        if res.returncode == 0 and res.stdout.strip():
            return res.stdout, "otool"
    return "", None


def analyze_disassembly(bin_path, bench, arch, objdump_path):
    text, fmt = disassemble_text(bin_path, objdump_path)
    if not text:
        return {
            "text_instructions": 0,
            "text_spills": 0,
            "bench_instructions": 0,
            "spill_count": 0,
            "spill_scope": "unavailable",
            "matched_symbols": [],
            "bench_asm_lines": [],
        }
    in_text = True
    current_sym = None
    text_insns = 0
    text_spills = 0
    bench_insns = 0
    bench_spills = 0
    matched_syms = []
    matched_set = set()
    bench_asm = []
    sym_re_obj = re.compile(r"^[0-9a-fA-F]+\s+<([^>]+)>:\s*$")
    insn_re_obj = re.compile(
        r"^\s*[0-9a-fA-F]+:\s+(?:[0-9a-fA-F]{2}(?:\s+[0-9a-fA-F]{2})*|[0-9a-fA-F]{8})\s+([a-zA-Z][a-zA-Z0-9_.]*)(?:\s+(.*))?$"
    )
    sym_re_otool = re.compile(r"^([A-Za-z0-9_.$@]+):\s*$")
    insn_re_otool = re.compile(r"^[0-9a-fA-F]+\s+([a-zA-Z][a-zA-Z0-9_.]*)(?:\s+(.*))?$")
    for line in text.splitlines():
        if line.startswith("Disassembly of section "):
            sec = line[len("Disassembly of section ") :].strip().rstrip(":")
            in_text = sec in (".text", "__TEXT,__text", "__text")
            current_sym = None
            continue
        if not in_text:
            continue
        if fmt == "objdump":
            ms = sym_re_obj.match(line)
            if ms:
                current_sym = ms.group(1)
                if is_bench_symbol(current_sym, bench) and current_sym not in matched_set:
                    matched_set.add(current_sym)
                    matched_syms.append(current_sym)
                continue
            mi = insn_re_obj.match(line)
        else:
            ms = sym_re_otool.match(line)
            if ms:
                current_sym = ms.group(1)
                if is_bench_symbol(current_sym, bench) and current_sym not in matched_set:
                    matched_set.add(current_sym)
                    matched_syms.append(current_sym)
                continue
            mi = insn_re_otool.match(line)
        if not mi:
            continue
        mn = mi.group(1)
        ops = (mi.group(2) or "").strip()
        text_insns += 1
        sp = is_spill_insn(mn, ops, arch)
        if sp:
            text_spills += 1
        if current_sym and current_sym in matched_set:
            bench_insns += 1
            if sp:
                bench_spills += 1
            clean_ops = ops.split(";", 1)[0].strip()
            clean_ops = re.sub(r"\s*<[^>]+>", "", clean_ops).strip()
            bench_asm.append(f"\t{mn}\t{clean_ops}" if clean_ops else f"\t{mn}")
    if matched_syms and bench_insns > 0:
        return {
            "text_instructions": text_insns,
            "text_spills": text_spills,
            "bench_instructions": bench_insns,
            "spill_count": bench_spills,
            "spill_scope": "bench_funcs",
            "matched_symbols": matched_syms,
            "bench_asm_lines": bench_asm,
        }
    return {
        "text_instructions": text_insns,
        "text_spills": text_spills,
        "bench_instructions": text_insns,
        "spill_count": text_spills,
        "spill_scope": "text",
        "matched_symbols": [],
        "bench_asm_lines": bench_asm,
    }


def run_callgrind(cmd, cwd=None, env=None):
    with tempfile.NamedTemporaryFile(prefix="cg-", suffix=".out", delete=False) as tf:
        cg_path = tf.name
    try:
        full_cmd = ["valgrind", "--tool=callgrind", f"--callgrind-out-file={cg_path}", *cmd]
        res = run_cmd(full_cmd, cwd=cwd, env=env, clamp_fd=True)
        if res.returncode != 0:
            return None, f"valgrind exit {res.returncode}"
        if os.path.exists(cg_path):
            with open(cg_path, encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("summary:"):
                        parts = line.split()
                        if len(parts) >= 2:
                            return int(parts[1]), None
        m = re.search(r"I\s+refs:\s+([\d,]+)", res.stderr)
        if m:
            return int(m.group(1).replace(",", "")), None
        return None, "callgrind summary missing"
    finally:
        if os.path.exists(cg_path):
            os.remove(cg_path)


def run_llvm_mca(asm_lines, arch, mca_cpu):
    mca_bin = shutil.which("llvm-mca")
    if not mca_bin:
        return {"total_cycles": None, "reason": "llvm-mca unavailable"}
    if not mca_cpu and arch != "arm64":
        return {"total_cycles": None, "reason": "target not arm64"}
    if not asm_lines:
        return {"total_cycles": None, "reason": "no benchmark instructions"}
    filtered = []
    for line in asm_lines:
        parts = line.strip().split(None, 1)
        if not parts:
            continue
        mn = parts[0].lower()
        if mn in ("b", "bl", "blr", "br", "ret", "cbz", "cbnz", "tbz", "tbnz") or mn.startswith("b."):
            continue
        filtered.append(line)
    if not filtered:
        return {"total_cycles": None, "reason": "no analyzable instructions"}
    cpus = [mca_cpu] if mca_cpu else ["apple-m4", "apple-m1"]
    triple = "aarch64-apple-darwin" if arch == "arm64" else "x86_64-unknown-linux-gnu"
    payload = "\n".join(filtered) + "\n"
    for cpu in cpus:
        cmd = [
            mca_bin,
            f"-mtriple={triple}",
            f"-mcpu={cpu}",
            "-iterations=1",
            "-skip-unsupported-instructions=parse-failure",
        ]
        res = run_cmd(cmd, input_text=payload)
        if res.returncode == 0:
            mc = re.search(r"Total Cycles:\s*(\d+)", res.stdout)
            mr = re.search(r"Block RThroughput:\s*([\d.]+)", res.stdout)
            if mc:
                return {
                    "cpu": cpu,
                    "total_cycles": int(mc.group(1)),
                    "rthroughput": float(mr.group(1)) if mr else None,
                    "instructions": len(filtered),
                    "reason": None,
                }
    return {"total_cycles": None, "reason": "llvm-mca execution failed"}


def safe_geomean(values):
    nums = [v for v in values if v is not None and v > 0]
    if not nums or len(nums) != len(values):
        return None
    return round(statistics.geometric_mean(nums), 2)


def build_runtime_variant(variant, bench, out_bin, kizu_bin, kizu_direct, env):
    src_dir = ROOT / "runtime"
    if variant == "kizu-direct":
        cmd = [kizu_bin, "build", "--target", "native", "--opt", "--backend", "direct", "-o", out_bin, str(src_dir / "kizu" / f"{bench}.kizu")]
    elif variant == "kizu-llvm":
        cmd = [kizu_bin, "build", "--target", "native", "--opt"]
        if kizu_direct:
            cmd.extend(["--backend", "llvm"])
        cmd.extend(["-o", out_bin, str(src_dir / "kizu" / f"{bench}.kizu")])
    elif variant == "rust":
        cmd = ["rustc", "--edition", "2021", "-C", "opt-level=3", "-o", out_bin, str(src_dir / "rust" / f"{bench}.rs")]
    elif variant == "c-O2":
        cmd = ["clang", "-O2", "-o", out_bin, str(src_dir / "c" / f"{bench}.c"), "-lm"]
    else:
        raise ValueError(f"unknown variant: {variant}")
    res = run_cmd(cmd, env=env)
    if res.returncode != 0:
        raise RuntimeError(f"build failed for {bench} ({variant}): {res.stderr.strip() or res.stdout.strip()}")


def collect_compiler_metrics(work_dir, scale, kizu_bin, kizu_direct, env, with_rust, use_valgrind, valgrind_reason):
    m_match = re.fullmatch(r"m(\d+)", scale)
    if not m_match:
        raise ValueError(f"invalid scale '{scale}': expected e.g. m10 or m40")
    m_count = int(m_match.group(1))
    proj_dir = os.path.join(work_dir, f"proj-{scale}")
    gen_res = run_cmd([sys.executable, str(ROOT / "compile" / "gen.py"), proj_dir, str(m_count), "50"], env=env)
    if gen_res.returncode != 0:
        raise RuntimeError(f"gen.py failed: {gen_res.stderr.strip()}")
    seeds_dir = os.path.join(work_dir, "seeds")
    hello_dir = os.path.join(seeds_dir, "h")
    os.makedirs(hello_dir, exist_ok=True)
    hello_src = os.path.join(hello_dir, "h.kizu")
    with open(hello_src, "w", encoding="utf-8") as f:
        f.write("fn main() -> void {\n    print(1);\n    return;\n}\n")
    kizu_proj = os.path.join(proj_dir, "kizu")
    cache_out = {}
    callgrind_out = {
        "direct_cold": {"ir": None, "reason": valgrind_reason},
        "check": {"ir": None, "reason": valgrind_reason},
    }
    if kizu_direct:
        seed_direct = os.path.join(seeds_dir, "kc-direct")
        s_env = dict(env, KIZU_CACHE_DIR=seed_direct)
        res = run_cmd([kizu_bin, "build", "--target", "native", "--backend", "direct", "-o", os.path.join(hello_dir, "hk-d"), hello_src], env=s_env)
        if res.returncode != 0:
            raise RuntimeError(f"kizu-direct seed failed: {res.stderr.strip()}")
        seed_d_bytes, _ = measure_paths([seed_direct])
        kc_direct = os.path.join(work_dir, "kc-direct")
        shutil.copytree(seed_direct, kc_direct)
        local_cache = os.path.join(kizu_proj, ".kizu-cache")
        shutil.rmtree(local_cache, ignore_errors=True)
        b_env = dict(env, KIZU_CACHE_DIR=kc_direct)
        build_cmd = [kizu_bin, "build", "--target", "native", "--backend", "direct", "-o", "app-direct", "."]
        if use_valgrind:
            ir, err = run_callgrind(build_cmd, cwd=kizu_proj, env=b_env)
            callgrind_out["direct_cold"] = {"ir": ir, "reason": err}
            if err is not None:
                res = run_cmd(build_cmd, cwd=kizu_proj, env=b_env)
                if res.returncode != 0:
                    raise RuntimeError(f"kizu-direct cold build failed: {res.stderr.strip()}")
        else:
            res = run_cmd(build_cmd, cwd=kizu_proj, env=b_env)
            if res.returncode != 0:
                raise RuntimeError(f"kizu-direct cold build failed: {res.stderr.strip()}")
        tot, files = measure_paths([kc_direct, local_cache])
        cache_out["kizu-direct"] = {
            "total_bytes": tot,
            "seed_bytes": seed_d_bytes,
            "project_bytes": max(0, tot - seed_d_bytes),
            "files": files,
        }
    else:
        callgrind_out["direct_cold"] = {"ir": None, "reason": "direct backend unsupported"}
    seed_llvm = os.path.join(seeds_dir, "kc-llvm")
    s_env = dict(env, KIZU_CACHE_DIR=seed_llvm)
    seed_llvm_cmd = [kizu_bin, "build", "--target", "native"]
    if kizu_direct:
        seed_llvm_cmd.extend(["--backend", "llvm"])
    seed_llvm_cmd.extend(["-o", os.path.join(hello_dir, "hk-l"), hello_src])
    res = run_cmd(seed_llvm_cmd, env=s_env)
    if res.returncode != 0:
        raise RuntimeError(f"kizu-llvm seed failed: {res.stderr.strip()}")
    seed_l_bytes, _ = measure_paths([seed_llvm])
    kc_llvm = os.path.join(work_dir, "kc-llvm")
    shutil.copytree(seed_llvm, kc_llvm)
    local_cache = os.path.join(kizu_proj, ".kizu-cache")
    shutil.rmtree(local_cache, ignore_errors=True)
    b_env = dict(env, KIZU_CACHE_DIR=kc_llvm)
    llvm_cmd = [kizu_bin, "build", "--target", "native"]
    if kizu_direct:
        llvm_cmd.extend(["--backend", "llvm"])
    llvm_cmd.extend(["-o", "app-llvm", "."])
    res = run_cmd(llvm_cmd, cwd=kizu_proj, env=b_env)
    if res.returncode != 0:
        raise RuntimeError(f"kizu-llvm cold build failed: {res.stderr.strip()}")
    tot, files = measure_paths([kc_llvm, local_cache])
    cache_out["kizu-llvm"] = {
        "total_bytes": tot,
        "seed_bytes": seed_l_bytes,
        "project_bytes": max(0, tot - seed_l_bytes),
        "files": files,
    }
    if use_valgrind:
        kc_chk = os.path.join(work_dir, "kc-check")
        os.makedirs(kc_chk, exist_ok=True)
        shutil.rmtree(local_cache, ignore_errors=True)
        c_env = dict(env, KIZU_CACHE_DIR=kc_chk)
        ir, err = run_callgrind([kizu_bin, "check", "."], cwd=kizu_proj, env=c_env)
        callgrind_out["check"] = {"ir": ir, "reason": err}
    if with_rust:
        rust_proj = os.path.join(proj_dir, "rust")
        rust_target = os.path.join(rust_proj, "target")
        shutil.rmtree(rust_target, ignore_errors=True)
        res = run_cmd(["cargo", "build", "--offline"], cwd=rust_proj, env=env)
        if res.returncode != 0:
            raise RuntimeError(f"cargo build failed: {res.stderr.strip()}")
        tot, files = measure_paths([rust_target])
        cache_out["rust-debug"] = {
            "total_bytes": tot,
            "seed_bytes": 0,
            "project_bytes": tot,
            "files": files,
        }
    return {
        "scale": scale,
        "callgrind": callgrind_out,
        "cache": cache_out,
    }


def render_collect_summary(data):
    meta = data["meta"]
    lines = [
        "# Deterministic Metrics Summary",
        "",
        f"- Kizu: `{meta['kizu_version']}` (`{meta['kizu_label']}`)",
        f"- Target: `{meta['os']} {meta['arch']}`",
        f"- Scale: `{meta['scale']}`",
        f"- Valgrind: `{'enabled' if meta['tools']['valgrind'] else 'unavailable/skipped'}`",
        f"- llvm-mca: `{'enabled' if meta['tools']['llvm_mca'] else 'unavailable/skipped'}`",
        "",
        "## Runtime Static & Dynamic Metrics",
        "",
        "| Variant | Benchmark | .text (B) | Total Insns | Spills | Scope | Callgrind Ir | MCA Cycles |",
        "|---|---|---:|---:|---:|---|---:|---:|",
    ]
    for variant, vdata in data["runtime"].items():
        for bench, m in vdata["benchmarks"].items():
            tb = f"{m['text_bytes']:,}" if m["text_bytes"] is not None else "—"
            ti = f"{m['text_instructions']:,}"
            sp = f"{m['spill_count']:,}"
            ir = f"{m['callgrind_ir']:,}" if m["callgrind_ir"] is not None else "—"
            mca_c = m["mca"].get("total_cycles") if isinstance(m.get("mca"), dict) else None
            mc = f"{mca_c:,}" if mca_c is not None else "—"
            lines.append(f"| {variant} | {bench} | {tb} | {ti} | {sp} | {m['spill_scope']} | {ir} | {mc} |")
    lines.extend(
        [
            "",
            f"## Compiler Build Cache (`{data['compiler']['scale']}`)",
            "",
            "| Variant | Total (B) | Project Delta (B) | Seed (B) | Files |",
            "|---|---:|---:|---:|---:|",
        ]
    )
    for variant, c in data["compiler"]["cache"].items():
        lines.append(
            f"| {variant} | {c['total_bytes']:,} | {c['project_bytes']:,} | {c['seed_bytes']:,} | {c['files']:,} |"
        )
    cg = data["compiler"]["callgrind"]
    if any(v["ir"] is not None for v in cg.values()):
        lines.extend(
            [
                "",
                f"## Compiler Callgrind Ir (`{data['compiler']['scale']}`)",
                "",
                "| Phase | Ir |",
                "|---|---:|",
            ]
        )
        for phase, info in cg.items():
            val = f"{info['ir']:,}" if info["ir"] is not None else f"— ({info['reason']})"
            lines.append(f"| {phase} | {val} |")
    lines.append("")
    return "\n".join(lines)


def cmd_collect(args):
    kizu_bin = args.kizu_bin or os.environ.get("KIZU_OVERRIDE_BIN") or os.environ.get("KIZU") or "kizu"
    kizu_lib_dir = args.kizu_lib_dir or os.environ.get("KIZU_OVERRIDE_LIB_DIR") or os.environ.get("KIZU_LIB_DIR")
    env = dict(os.environ)
    if kizu_lib_dir:
        env["KIZU_LIB_DIR"] = kizu_lib_dir
    ver_res = run_cmd([kizu_bin, "version"], env=env)
    if ver_res.returncode != 0:
        sys.stderr.write(f"error: failed to run kizu version: {ver_res.stderr.strip()}\n")
        return 1
    kizu_version = ver_res.stdout.strip()
    help_res = run_cmd([kizu_bin], env=env)
    kizu_direct = "--backend direct" in (help_res.stdout + help_res.stderr)
    if args.benchmarks:
        benchmarks = [b.strip() for b in args.benchmarks.split(",") if b.strip()]
        for b in benchmarks:
            if b not in ALL_BENCHMARKS:
                sys.stderr.write(f"error: unknown benchmark '{b}'\n")
                return 2
    else:
        benchmarks = list(ALL_BENCHMARKS)
    variants = []
    if kizu_direct:
        variants.append("kizu-direct")
    variants.append("kizu-llvm")
    if args.with_rust:
        variants.append("rust")
    if args.with_c:
        variants.append("c-O2")
    arch = norm_arch()
    objdump_path, objdump_name = find_objdump()
    has_valgrind = shutil.which("valgrind") is not None
    if args.no_valgrind:
        use_valgrind = False
        valgrind_reason = "skipped (--no-valgrind)"
    elif not has_valgrind:
        use_valgrind = False
        valgrind_reason = "valgrind unavailable"
    else:
        use_valgrind = True
        valgrind_reason = None
    has_mca = shutil.which("llvm-mca") is not None
    runtime_data = {}
    with tempfile.TemporaryDirectory(prefix="kizu-det-") as work_dir:
        bin_dir = os.path.join(work_dir, "bin")
        os.makedirs(bin_dir, exist_ok=True)
        rt_cache = os.path.join(work_dir, "rt-cache")
        os.makedirs(rt_cache, exist_ok=True)
        rt_env = dict(env, KIZU_CACHE_DIR=rt_cache)
        for variant in variants:
            benches_out = {}
            for bench in benchmarks:
                out_bin = os.path.join(bin_dir, f"{bench}-{variant}")
                build_runtime_variant(variant, bench, out_bin, kizu_bin, kizu_direct, rt_env)
                text_bytes = get_text_size(out_bin, objdump_path)
                dis = analyze_disassembly(out_bin, bench, arch, objdump_path)
                if use_valgrind:
                    cg_ir, cg_err = run_callgrind([out_bin], env=env)
                else:
                    cg_ir, cg_err = None, valgrind_reason
                mca_info = run_llvm_mca(dis["bench_asm_lines"], arch, args.mca_cpu)
                benches_out[bench] = {
                    "text_bytes": text_bytes,
                    "text_instructions": dis["text_instructions"],
                    "text_spills": dis["text_spills"],
                    "bench_instructions": dis["bench_instructions"],
                    "spill_count": dis["spill_count"],
                    "spill_scope": dis["spill_scope"],
                    "matched_symbols": dis["matched_symbols"],
                    "callgrind_ir": cg_ir,
                    "callgrind_reason": cg_err,
                    "mca": mca_info,
                }
            text_vals = [benches_out[b]["text_bytes"] for b in benchmarks]
            spill_vals = [benches_out[b]["spill_count"] for b in benchmarks]
            ir_vals = [benches_out[b]["callgrind_ir"] for b in benchmarks]
            runtime_data[variant] = {
                "benchmarks": benches_out,
                "geomean": {
                    "text_bytes": safe_geomean(text_vals),
                    "spill_count": safe_geomean(spill_vals),
                    "spill_total": sum(spill_vals),
                    "callgrind_ir": safe_geomean(ir_vals),
                },
            }
        compiler_data = collect_compiler_metrics(
            work_dir,
            args.scale,
            kizu_bin,
            kizu_direct,
            env,
            args.with_rust,
            use_valgrind,
            valgrind_reason,
        )
    result = {
        "meta": {
            "schema_version": 1,
            "timestamp_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "os": platform.system(),
            "arch": arch,
            "kizu_version": kizu_version,
            "kizu_label": parse_kizu_label(kizu_version),
            "kizu_direct_supported": kizu_direct,
            "scale": args.scale,
            "benchmarks": benchmarks,
            "variants": variants,
            "tools": {
                "objdump": objdump_name,
                "valgrind": use_valgrind,
                "llvm_mca": has_mca and (arch == "arm64" or bool(args.mca_cpu)),
            },
        },
        "runtime": runtime_data,
        "compiler": compiler_data,
    }
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "deterministic.json"
    md_path = out_dir / "summary.md"
    json_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    md_path.write_text(render_collect_summary(result), encoding="utf-8")
    print(f"wrote {json_path} and {md_path}")
    return 0


def fmt_num(val):
    if val is None:
        return "—"
    if isinstance(val, float):
        return f"{val:,.2f}"
    return f"{val:,}"


def fmt_delta(base, cand):
    diff = cand - base
    if isinstance(diff, float):
        return f"{diff:+,.2f}"
    return f"{diff:+,}"


def compare_row(label, base, cand, fail_pct, regressions):
    if base is None or cand is None:
        return None
    if base == 0:
        if cand == 0:
            pct_str = "0.00%"
            status = "SAME"
        else:
            pct_str = "n/a"
            status = "REGRESSED" if fail_pct is not None else "WORSE"
            if fail_pct is not None:
                regressions.append(f"{label}: {base} -> {cand}")
    else:
        pct = ((cand - base) / base) * 100.0
        pct_str = f"{pct:+.2f}%"
        if cand < base:
            status = "BETTER"
        elif cand == base:
            status = "SAME"
        elif fail_pct is not None and pct > fail_pct:
            status = "REGRESSED"
            regressions.append(f"{label}: {pct:+.2f}% (> {fail_pct:.2f}%)")
        else:
            status = "WORSE"
    return f"| {label} | {fmt_num(base)} | {fmt_num(cand)} | {fmt_delta(base, cand)} | {pct_str} | {status} |"


def render_table(title, rows):
    if not rows:
        return []
    out = [
        f"## {title}",
        "",
        "| Metric | Baseline | Candidate | Delta | Δ% | Status |",
        "|---|---:|---:|---:|---:|---|",
    ]
    out.extend(rows)
    out.append("")
    return out


def cmd_compare(args):
    with open(args.baseline, encoding="utf-8") as f:
        base = json.load(f)
    with open(args.candidate, encoding="utf-8") as f:
        cand = json.load(f)
    fail_pct = args.fail_on_regression
    regressions = []
    b_meta = base.get("meta", {})
    c_meta = cand.get("meta", {})
    lines = [
        "# Deterministic A/B Comparison",
        "",
        f"- Baseline: `{b_meta.get('kizu_version', 'unknown')}` (`{b_meta.get('os', '?')} {b_meta.get('arch', '?')}`, scale `{b_meta.get('scale', '?')}`)",
        f"- Candidate: `{c_meta.get('kizu_version', 'unknown')}` (`{c_meta.get('os', '?')} {c_meta.get('arch', '?')}`, scale `{c_meta.get('scale', '?')}`)",
    ]
    if fail_pct is not None:
        lines.append(f"- Regression threshold: `> +{fail_pct:.2f}%`")
    lines.append("")
    common_variants = [v for v in base.get("runtime", {}) if v in cand.get("runtime", {})]
    for variant in common_variants:
        bv = base["runtime"][variant]
        cv = cand["runtime"][variant]
        common_benches = [b for b in bv.get("benchmarks", {}) if b in cv.get("benchmarks", {})]
        text_rows = []
        spill_rows = []
        ir_rows = []
        mca_rows = []
        for b in common_benches:
            bm = bv["benchmarks"][b]
            cm = cv["benchmarks"][b]
            r = compare_row(f"{b} .text (B)", bm.get("text_bytes"), cm.get("text_bytes"), fail_pct, regressions)
            if r:
                text_rows.append(r)
            r = compare_row(f"{b} spills", bm.get("spill_count"), cm.get("spill_count"), fail_pct, regressions)
            if r:
                spill_rows.append(r)
            r = compare_row(f"{b} Ir", bm.get("callgrind_ir"), cm.get("callgrind_ir"), fail_pct, regressions)
            if r:
                ir_rows.append(r)
            bmca = (bm.get("mca") or {}).get("total_cycles")
            cmca = (cm.get("mca") or {}).get("total_cycles")
            r = compare_row(f"{b} mca cycles", bmca, cmca, fail_pct, regressions)
            if r:
                mca_rows.append(r)
        r = compare_row("geomean .text (B)", bv.get("geomean", {}).get("text_bytes"), cv.get("geomean", {}).get("text_bytes"), fail_pct, regressions)
        if r:
            text_rows.append(r)
        r = compare_row("total spills", bv.get("geomean", {}).get("spill_total"), cv.get("geomean", {}).get("spill_total"), fail_pct, regressions)
        if r:
            spill_rows.append(r)
        r = compare_row("geomean spills", bv.get("geomean", {}).get("spill_count"), cv.get("geomean", {}).get("spill_count"), fail_pct, regressions)
        if r:
            spill_rows.append(r)
        r = compare_row("geomean Ir", bv.get("geomean", {}).get("callgrind_ir"), cv.get("geomean", {}).get("callgrind_ir"), fail_pct, regressions)
        if r:
            ir_rows.append(r)
        lines.extend(render_table(f"{variant} — .text Size", text_rows))
        lines.extend(render_table(f"{variant} — Register Spills", spill_rows))
        lines.extend(render_table(f"{variant} — Dynamic Instructions (Callgrind Ir)", ir_rows))
        lines.extend(render_table(f"{variant} — Static Cycles (llvm-mca)", mca_rows))
    bc = base.get("compiler", {})
    cc = cand.get("compiler", {})
    comp_ir_rows = []
    for phase in ("direct_cold", "check"):
        b_ir = (bc.get("callgrind", {}).get(phase) or {}).get("ir")
        c_ir = (cc.get("callgrind", {}).get(phase) or {}).get("ir")
        r = compare_row(f"compiler {phase} Ir", b_ir, c_ir, fail_pct, regressions)
        if r:
            comp_ir_rows.append(r)
    lines.extend(render_table(f"Compiler Dynamic Instructions ({bc.get('scale', '?')})", comp_ir_rows))
    cache_rows = []
    b_cache = bc.get("cache", {})
    c_cache = cc.get("cache", {})
    for variant in [v for v in b_cache if v in c_cache]:
        r = compare_row(f"{variant} cache total (B)", b_cache[variant].get("total_bytes"), c_cache[variant].get("total_bytes"), fail_pct, regressions)
        if r:
            cache_rows.append(r)
        r = compare_row(f"{variant} cache project (B)", b_cache[variant].get("project_bytes"), c_cache[variant].get("project_bytes"), fail_pct, regressions)
        if r:
            cache_rows.append(r)
    lines.extend(render_table(f"Build Cache Size ({bc.get('scale', '?')})", cache_rows))
    if regressions:
        lines.append(f"**FAILED**: {len(regressions)} regression(s) exceeded +{fail_pct:.2f}% threshold:")
        for item in regressions:
            lines.append(f"- {item}")
        lines.append("")
    sys.stdout.write("\n".join(lines))
    return 1 if regressions else 0


def main():
    parser = argparse.ArgumentParser(prog="deterministic.py")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_col = sub.add_parser("collect")
    p_col.add_argument("--out", required=True)
    p_col.add_argument("--kizu-bin", default=None)
    p_col.add_argument("--kizu-lib-dir", default=None)
    p_col.add_argument("--scale", default="m40")
    p_col.add_argument("--with-rust", action="store_true")
    p_col.add_argument("--with-c", action="store_true")
    p_col.add_argument("--benchmarks", default=None)
    p_col.add_argument("--no-valgrind", action="store_true")
    p_col.add_argument("--mca-cpu", default=None)
    p_col.set_defaults(func=cmd_collect)
    p_cmp = sub.add_parser("compare")
    p_cmp.add_argument("baseline")
    p_cmp.add_argument("candidate")
    p_cmp.add_argument("--fail-on-regression", type=float, default=None)
    p_cmp.set_defaults(func=cmd_compare)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
