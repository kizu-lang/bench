#!/usr/bin/env python3
"""reuse.py BASE OUT PREFIX...: copies the result directory BASE into OUT without the variants whose
name starts with a PREFIX, so a run that measures only those variants completes it. The copied
hyperfine files are renamed <program>-base-r<n>.json so the new run's files do not overwrite them."""
import glob, json, os, shutil, sys

base, out, prefixes = sys.argv[1], sys.argv[2], sys.argv[3:]


def selected(name):
    return any(name.startswith(p) for p in prefixes)


def lines(src, dst, key):
    if os.path.exists(src):
        with open(dst, "w") as f:
            f.writelines(l for l in open(src) if l.strip() and not selected(key(l.split())))


rt, ort = f"{base}/runtime", f"{out}/runtime"
if os.path.isdir(rt):
    os.makedirs(ort, exist_ok=True)
    for f in glob.glob(f"{rt}/*.json"):
        data = json.load(open(f))
        program, rest = os.path.basename(f).split("-", 1)
        data["results"] = [r for r in data["results"]
                           if not selected(r["command"].split("/")[-1].split(f"{program}-", 1)[1])]
        if data["results"]:
            json.dump(data, open(f"{ort}/{program}-base-{rest}", "w"))
    lines(f"{rt}/mem.txt", f"{ort}/mem.txt", lambda w: w[1])
    lines(f"{rt}/instructions.txt", f"{ort}/instructions.txt", lambda w: w[1])

for size in glob.glob(f"{base}/compile/m*"):
    o = f"{out}/compile/{os.path.basename(size)}"
    os.makedirs(o, exist_ok=True)
    for f in glob.glob(f"{size}/*.json"):
        if not selected(os.path.basename(f)):
            shutil.copy(f, o)
    lines(f"{size}/rss.txt", f"{o}/rss.txt", lambda w: w[0])

real, oreal = f"{base}/real", f"{out}/real"
if os.path.isdir(real):
    os.makedirs(oreal, exist_ok=True)
    for f in glob.glob(f"{real}/*.json"):
        if not selected(os.path.basename(f)):
            shutil.copy(f, oreal)
    lines(f"{real}/lines.txt", f"{oreal}/lines.txt", lambda w: w[0].split("_")[0])

with open(f"{out}/reused.txt", "w") as f:
    f.write(f"base {os.path.basename(os.path.normpath(base))}\nmeasured {' '.join(prefixes)}\n")
