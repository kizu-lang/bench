#!/usr/bin/env bash
# compiler-ab.sh KIZU_CHECKOUT OUT REV...: builds the Kizu compiler at each REV and measures every one
# building the same input, compiler/ of the last REV. OUT gets times.tsv, perf.tsv, <rev>.cg, README.md.
# RUNS (default 5) timed runs per rev; MASSIF=1 also records the heap peak and where it was allocated.
set -euo pipefail
source "$(dirname "$0")/common.sh"
repo=$(cd "$1" && pwd); out=$2; shift 2
[ $# -ge 1 ] || { echo "usage: $0 KIZU_CHECKOUT OUT REV..." >&2; exit 2; }
mkdir -p "$out"; out=$(cd "$out" && pwd)
RUNS=${RUNS:-5}
ulimit -n 65536
W=$(mktemp -d); trap 'git -C "$repo" worktree prune; rm -rf "$W"' EXIT
BIN=$ROOT/target/compilers; mkdir -p "$BIN"

revs=()
for r in "$@"; do
  rev=$(git -C "$repo" rev-parse --short=8 "$r^{commit}"); revs+=("$rev")
  [ -x "$BIN/kizu-$rev" ] && continue
  git -C "$repo" worktree add -q --detach "$W/src-$rev" "$rev"
  (cd "$W/src-$rev" && scripts/gen-selfhost-version.sh > /dev/null &&
    KIZU_CACHE_DIR=$W/build-cache \
      $KIZU build --target native --opt $KIZU_LLVM -o "$BIN/kizu-$rev" compiler > /dev/null)
done

input=${revs[-1]}
[ -d "$W/src-$input" ] || git -C "$repo" worktree add -q --detach "$W/src-$input" "$input"
(cd "$W/src-$input" && scripts/gen-selfhost-version.sh > /dev/null)
cd "$W/src-$input"
export KIZU_LIB_DIR=$PWD/lib/kizu
mkdir -p "$W/h"; printf 'fn main() -> void {\n    print(1);\n    return;\n}\n' > "$W/h/h.kizu"

fresh() { rm -rf "$W/kc-$1"; cp -R "$W/seed-$1" "$W/kc-$1"; }
build() { echo "$BIN/kizu-$1 build --target native -o $W/out-$1 compiler"; }

for rev in "${revs[@]}"; do
  KIZU_CACHE_DIR=$W/seed-$rev "$BIN/kizu-$rev" build --target native -o "$W/h/hk" "$W/h/h.kizu" > /dev/null
done

printf 'rev\trun\tuser_s\tsys_s\twall_s\tmax_rss_kb\tminor_faults\n' > "$out/times.tsv"
for run in $(seq "$RUNS"); do
  for rev in "${revs[@]}"; do
    fresh "$rev"
    KIZU_CACHE_DIR=$W/kc-$rev command time -f "$rev	$run	%U	%S	%e	%M	%R" -a -o "$out/times.tsv" $PIN $(build "$rev") > /dev/null
  done
done

if command -v perf > /dev/null && perf stat -e instructions:u true 2> /dev/null; then
  printf 'rev\tcounter\tvalue\n' > "$out/perf.tsv"
  for rev in "${revs[@]}"; do
    fresh "$rev"
    KIZU_CACHE_DIR=$W/kc-$rev perf stat -x '	' -e instructions:u,cycles:u,page-faults:u,branch-misses:u,cache-misses:u -o "$W/perf" \
      $PIN $(build "$rev") > /dev/null
    awk -F'\t' -v r="$rev" '$1 ~ /^[0-9]+$/ { sub(/:u$/, "", $3); print r "\t" $3 "\t" $1 }' "$W/perf" >> "$out/perf.tsv"
  done
fi

pids=()
for rev in "${revs[@]}"; do
  (fresh "$rev"
    KIZU_CACHE_DIR=$W/kc-$rev valgrind --tool=callgrind --callgrind-out-file="$out/$rev.cg" $(build "$rev") > "$W/cg-$rev.log" 2>&1 ||
      { cat "$W/cg-$rev.log" >&2; exit 1; }
    if [ "${MASSIF:-0}" = 1 ]; then
      fresh "$rev"
      KIZU_CACHE_DIR=$W/kc-$rev valgrind --tool=massif --threshold=1 --massif-out-file="$out/$rev.massif" $(build "$rev") > "$W/ms-$rev.log" 2>&1 ||
        { cat "$W/ms-$rev.log" >&2; exit 1; }
    fi) &
  pids+=($!)
done
for pid in "${pids[@]}"; do wait "$pid"; done

printf '%s\n' "${revs[@]}" > "$out/revs.txt"
echo "input $input" > "$out/input.txt"
"$ROOT/scripts/compiler-ab-report.py" "$out" > "$out/README.md"
echo compiler-ab-done
