#!/usr/bin/env bash
# Times every built binary. ROUNDS rounds of RUNS runs each, with the variants
# in a different order each round, so a burst of load lands on all of them.
# Writes OUT/<program>-r<round>.json (hyperfine) and OUT/mem.txt.
set -euo pipefail
source "$(dirname "$0")/common.sh"
out=$1; bin=${2:-$ROOT/target/bin}
rounds=${ROUNDS:-3}; runs=${RUNS:-4}
mkdir -p "$out"
for p in $PROGRAMS; do
  for r in $(seq 1 $rounds); do
    order=$(for v in $(built $bin $p); do echo $v; done | python3 -c "import sys,random;l=sys.stdin.read().split();random.Random($r).shuffle(l);print(' '.join(l))")
    cmds=(); for v in $order; do cmds+=("$PIN $bin/$p-$v"); done
    hyperfine -N --style none --warmup 1 --runs $runs --export-json "$out/$p-r$r.json" "${cmds[@]}" > /dev/null
  done
  for v in $(built $bin $p); do
    rss=$( { $TIMEV $bin/$p-$v > /dev/null; } 2>&1 | awk '/maximum resident set size/ {print $1} /Maximum resident/ {print $NF*1024}')
    size=$(wc -c < $bin/$p-$v | tr -d ' ')
    echo "$p $v $rss $size" >> "$out/mem.txt"
  done
done
