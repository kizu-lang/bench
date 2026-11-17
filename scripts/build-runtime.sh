#!/usr/bin/env bash
# Builds every program in every variant into BIN (default target/bin).
set -uo pipefail
source "$(dirname "$0")/common.sh"
bin=${1:-$ROOT/target/bin}
mkdir -p "$bin"
src=$ROOT/runtime
failed=0
for p in $PROGRAMS; do
  b() { "$@" > /dev/null || { echo "build failed: ${*: -1}" >&2; failed=1; }; }
  if [ $KIZU_DIRECT = 1 ]; then
    b $KIZU build --target native --opt --backend direct -o $bin/$p-kizu-direct $src/kizu/$p.kizu
  fi
  b $KIZU build --target native --opt $KIZU_LLVM -o $bin/$p-kizu-llvm $src/kizu/$p.kizu
  b go build -o $bin/$p-go $src/go/$p.go
  b go build -gcflags=-B -o $bin/$p-go-nobounds $src/go/$p.go
  b zig build-exe -O ReleaseSafe -mcpu=baseline -lc $src/zig/$p.zig -femit-bin=$bin/$p-zig-safe
  b zig build-exe -O ReleaseFast -mcpu=baseline -lc $src/zig/$p.zig -femit-bin=$bin/$p-zig-fast
  b clang -O2 -o $bin/$p-c-O2 $src/c/$p.c -lm
  b clang -O3 $NATIVE -o $bin/$p-c-O3native $src/c/$p.c -lm
done
[ $KIZU_DIRECT = 1 ] || echo "$($KIZU version) has no direct backend: kizu-direct skipped" >&2
rm -f $bin/*.kizu-build.json $bin/*.o
exit $failed
