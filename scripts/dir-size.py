#!/usr/bin/env python3
import glob
import json
import os
import sys


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


def main():
    if len(sys.argv) < 2:
        sys.exit(1)
    if sys.argv[1] == "--record":
        out_json = sys.argv[2]
        out_txt = sys.argv[3]
        name = sys.argv[4]
        seed_bytes = int(sys.argv[5])
        patterns = sys.argv[6:]
        total, files = measure_paths(patterns)
        project = max(0, total - seed_bytes)
        data = {}
        if os.path.exists(out_json):
            with open(out_json, encoding="utf-8") as f:
                data = json.load(f)
        data[name] = {
            "total_bytes": total,
            "seed_bytes": seed_bytes,
            "project_bytes": project,
            "files": files,
        }
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.write("\n")
        with open(out_txt, "w", encoding="utf-8") as f:
            for k, v in data.items():
                f.write(f"{k} {v['total_bytes']} {v['project_bytes']} {v['seed_bytes']} {v['files']}\n")
        return
    total, _ = measure_paths(sys.argv[1:])
    print(total)


if __name__ == "__main__":
    main()
