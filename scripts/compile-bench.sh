#!/usr/bin/env bash
# compile-bench.sh OUT [MODULES...]: build times of generated programs of
# 50 functions per module (default 10 40 160 modules, about 7k / 28k / 113k
# lines). For each toolchain: cold (project caches empty, the toolchain's own
# std/runtime cache warm), no-op rebuild, and rebuild after editing one
# function. Writes OUT/m<modules>/<name>-<scenario>.json and rss.txt.
set -euo pipefail
source "$(dirname "$0")/common.sh"
out=$1; shift
sizes=${*:-10 40 160}
work=$ROOT/target/compile
C=$ROOT/compile
seeds=$work/seeds

seed() {
  rm -rf $seeds; mkdir -p $seeds/h
  printf 'fn main() -> void {\n    print(1);\n    return;\n}\n' > $seeds/h/h.kizu
  for flags in "" "$KIZU_LLVM" "--opt" "--opt $KIZU_LLVM"; do
    KIZU_CACHE_DIR=$seeds/kc $KIZU build --target native $flags -o $seeds/h/hk $seeds/h/h.kizu > /dev/null
  done
  printf 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }\n' > $seeds/h/h.go
  (cd $seeds/h && GOCACHE=$seeds/gc go build -o hg h.go && GOCACHE=$seeds/gc $C/go-noopt.sh -o hg h.go)
  printf 'const std = @import("std");\npub fn main() void { std.debug.print("1\\n", .{}); }\n' > $seeds/h/h.zig
  for m in Debug ReleaseFast; do
    (cd $seeds/h && ZIG_GLOBAL_CACHE_DIR=$seeds/zg ZIG_LOCAL_CACHE_DIR=$seeds/h/zl zig build-exe -O $m h.zig -femit-bin=hz)
  done
}
[ -d $seeds/kc ] || seed

for m in $sizes; do
  P=$work/m$m R=$out/m$m
  mkdir -p $R
  [ -d $P ] || python3 $C/gen.py $P $m 50
  export KIZU_CACHE_DIR=$P/kc GOCACHE=$P/gc ZIG_GLOBAL_CACHE_DIR=$P/zg ZIG_LOCAL_CACHE_DIR=$P/zl GOFLAGS=-buildvcs=false
  touch $R/rss.txt
  hf() { hyperfine -N --style none --warmup 1 --runs ${RUNS:-5} --export-json "$R/$1.json" "${@:2}" > /dev/null; }
  set_of() { # name dir command seed edit-file
    local l=$1 d=$2 cmd=$3 sd=$4 f=$5
    cd $d
    hf $l-cold --prepare "$sd" "$cmd"
    hf $l-noop "$cmd"
    hf $l-edit --prepare "python3 $C/bump.py $f" "$cmd"
    eval "$sd"
    $TIMEV $cmd 2>&1 >/dev/null | awk -v n=$l '/maximum resident set size/ {print n, $1} /Maximum resident/ {print n, $NF*1024}' >> $R/rss.txt || true
  }
  sk="bash -c 'rm -rf $P/kc && cp -R $seeds/kc $P/kc'"
  sg="bash -c 'rm -rf $P/gc && cp -R $seeds/gc $P/gc'"
  sz="bash -c 'rm -rf $P/zg $P/zl && cp -R $seeds/zg $P/zg'"
  sc="bash -c 'rm -f $P/c/*.o $P/c/app'"
  mk="make -s -j$NPROC CC=clang"
  if [ $KIZU_DIRECT = 1 ]; then
    set_of kizu-direct     $P/kizu "$KIZU build --target native --backend direct -o app ." "$sk" src/m0/m0.kizu
    set_of kizu-direct-opt $P/kizu "$KIZU build --target native --opt --backend direct -o app ." "$sk" src/m0/m0.kizu
  fi
  set_of kizu-llvm       $P/kizu "$KIZU build --target native $KIZU_LLVM -o app ." "$sk" src/m0/m0.kizu
  set_of kizu-llvm-opt   $P/kizu "$KIZU build --target native --opt $KIZU_LLVM -o app ." "$sk" src/m0/m0.kizu
  set_of go              $P/go "go build -o app ." "$sg" m0/m0.go
  set_of go-noopt        $P/go "$C/go-noopt.sh -o app ." "$sg" m0/m0.go
  set_of zig-debug       $P/zig "zig build-exe main.zig -femit-bin=app" "$sz" m0.zig
  set_of zig-fast        $P/zig "zig build-exe -O ReleaseFast main.zig -femit-bin=app" "$sz" m0.zig
  set_of c-O0            $P/c "$mk CFLAGS=-O0" "$sc" m0.c
  set_of c-O2            $P/c "$mk CFLAGS=-O2" "$sc" m0.c
  cd $P/kizu && hf kizu-check "$KIZU check ."
  cd $P/go   && hf go-vet "go vet ./..."
  cd $P/zig  && hf zig-check "zig build-exe main.zig -fno-emit-bin"
  cd $P/c    && hf c-check "bash -c 'ls *.c | xargs -P$NPROC -n8 clang -fsyntax-only'"
done
