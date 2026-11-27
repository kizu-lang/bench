#!/usr/bin/env python3
import argparse
import os
import re
import shutil
import sys

GHA_RUN_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-gha-(.+)$")


def prune(results_dir, keep, dry_run=False):
    if keep < 1:
        raise ValueError("keep must be >= 1")
    if not os.path.isdir(results_dir):
        return {}, []
    by_target = {}
    for entry in os.listdir(results_dir):
        full = os.path.join(results_dir, entry)
        if not os.path.isdir(full) or os.path.islink(full):
            continue
        m = GHA_RUN_RE.match(entry)
        if not m:
            continue
        target = m.group(2)
        by_target.setdefault(target, []).append(entry)
    kept = {}
    removed = []
    for target, names in sorted(by_target.items()):
        ordered = sorted(names, reverse=True)
        kept[target] = ordered[:keep]
        for old in ordered[keep:]:
            full = os.path.join(results_dir, old)
            if not dry_run:
                shutil.rmtree(full)
            removed.append(old)
    return kept, removed


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    parser = argparse.ArgumentParser(description="Prune old GitHub Actions benchmark result directories.")
    parser.add_argument("--results-dir", default=os.path.join(root, "results"))
    parser.add_argument("--keep", type=int, default=30)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.keep < 1:
        sys.stderr.write("prune-ci-results: --keep must be >= 1\n")
        return 1
    kept, removed = prune(args.results_dir, args.keep, args.dry_run)
    action = "would remove" if args.dry_run else "removed"
    summary = ", ".join(f"{t}={len(v)}" for t, v in sorted(kept.items())) or "none"
    print(f"prune-ci-results: kept ({summary}), {action} {len(removed)}")
    for name in removed:
        print(f"  {action}: {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
