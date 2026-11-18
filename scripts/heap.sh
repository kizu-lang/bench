#!/usr/bin/env bash
# heap.sh KIZU_CHECKOUT OUT REV [INPUT]: what the Kizu compiler at REV holds on the heap at its peak while it builds
# INPUT (default compiler/ of REV). OUT gets time.txt, heap.massif, pages.massif and README.md (Linux).
# DROP="fn..." also shows, at every detailed snapshot, the heap without what those functions allocated.
set -euo pipefail
source "$(dirname "$0")/common.sh"
repo=$(cd "$1" && pwd); out=$2; input=${4:-}
mkdir -p "$out"; out=$(cd "$out" && pwd)
[ -z "$input" ] || input=$(cd "$input" && pwd)
ulimit -n 65536
W=$(mktemp -d); trap 'git -C "$repo" worktree prune; rm -rf "$W"' EXIT

compiler_at "$repo" "$3" "$W"
K=$ROOT/target/compilers/kizu-$rev
export KIZU_LIB_DIR=$W/src-$rev/lib/kizu
mkdir -p "$W/h"; printf 'fn main() -> void {\n    print(1);\n    return;\n}\n' > "$W/h/h.kizu"
KIZU_CACHE_DIR=$W/seed "$K" build --target native -o "$W/h/hk" "$W/h/h.kizu" > /dev/null
fresh() { rm -rf "$W/kc"; cp -R "$W/seed" "$W/kc"; }
cd "${input:-$W/src-$rev/compiler}"

fresh; KIZU_CACHE_DIR=$W/kc command time -f "max_rss_kb=%M wall_s=%e minor_faults=%R" -o "$out/time.txt" \
  "$K" build --target native -o "$W/out" . > /dev/null
for kind in heap pages; do
  extra=""; [ $kind = pages ] && extra=--pages-as-heap=yes
  fresh; KIZU_CACHE_DIR=$W/kc valgrind --tool=massif $extra --depth=40 --threshold=0.2 --peak-inaccuracy=0.2 \
    --max-snapshots=200 --massif-out-file="$out/$kind.massif" "$K" build --target native -o "$W/out" . > "$W/$kind.log" 2>&1 ||
    { cat "$W/$kind.log" >&2; exit 1; }
done

sed -i "s|$HOME|~|g; s|$W|<work>|g" "$out"/*.massif
printf 'rev %s\ninput %s\n' "$rev" "${4:-compiler/}" > "$out/input.txt"
python3 "$ROOT/scripts/heap-report.py" "$out" ${DROP:-} > "$out/README.md"
echo heap-done
