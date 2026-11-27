#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
out=$1
bin=${2:-$ROOT/target/bin}
rounds=${ROUNDS:-3}
runs=${RUNS:-4}
mkdir -p "$out"
out_abs=$(cd "$out" && pwd)
cd "$bin"
for p in $PROGRAMS; do
  for r in $(seq 1 "$rounds"); do
    order=$(for v in $(built "$bin" "$p"); do echo "$v"; done | python3 -c "import sys,random;l=sys.stdin.read().split();random.Random($r).shuffle(l);print(' '.join(l))")
    cmds=()
    for v in $order; do
      if [ -n "$PIN" ]; then
        cmds+=("$PIN ./$p-$v")
      else
        cmds+=("./$p-$v")
      fi
    done
    hyperfine -N --style none --warmup 1 --runs "$runs" --export-json "$out_abs/$p-r$r.json" "${cmds[@]}" > /dev/null
  done
  for v in $(built "$bin" "$p"); do
    rss=$({ $TIMEV "./$p-$v" > /dev/null; } 2>&1 | awk '/maximum resident set size/ {print $1} /Maximum resident/ {print $NF*1024}')
    size=$(wc -c < "./$p-$v" | tr -d ' ')
    echo "$p $v $rss $size" >> "$out_abs/mem.txt"
  done
done
