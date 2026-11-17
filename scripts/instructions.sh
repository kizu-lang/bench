#!/usr/bin/env bash
# Counts the instructions each binary executes (Linux, valgrind). The count
# does not move with machine load, so it backs up the timings and catches
# regressions on shared CI runners. Writes OUT/instructions.txt.
set -uo pipefail
source "$(dirname "$0")/common.sh"
out=$1; bin=${2:-$ROOT/target/bin}
mkdir -p "$out"
# valgrind refuses to start under a huge descriptor limit (WSL2 has one).
ulimit -n 65536
for p in $PROGRAMS; do
  for v in $(built $bin $p); do
    # A binary for the host CPU (c-O3native) can use instructions valgrind does not know; it gets "-".
    log=$(valgrind --tool=cachegrind --cache-sim=no --cachegrind-out-file=/dev/null $bin/$p-$v 2>&1 >/dev/null) && ok=1 || ok=0
    n=$(echo "$log" | awk '/I *refs:/ {gsub(",","",$NF); print $NF}')
    [ $ok = 1 ] && [ -n "$n" ] || n=-
    echo "$p $v $n" | tee -a "$out/instructions.txt"
  done
done
