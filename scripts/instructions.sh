#!/usr/bin/env bash
# Counts the instructions each binary executes (Linux, valgrind). The count
# does not move with machine load, so it backs up the timings and catches
# regressions on shared CI runners. Writes OUT/instructions.txt.
set -euo pipefail
source "$(dirname "$0")/common.sh"
out=$1; bin=${2:-$ROOT/target/bin}
mkdir -p "$out"
: > "$out/instructions.txt"
for p in $PROGRAMS; do
  for v in $(built $bin $p); do
    n=$(valgrind --tool=cachegrind --cache-sim=no --cachegrind-out-file=/dev/null $bin/$p-$v 2>&1 >/dev/null | awk '/I *refs:/ {gsub(",","",$NF); print $NF}')
    echo "$p $v $n" | tee -a "$out/instructions.txt"
  done
done
