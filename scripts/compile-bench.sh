#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/common.sh"
out=$1
shift
sizes=${*:-10 40 160}
work=$ROOT/target/compile
C=$ROOT/compile
S=$ROOT/scripts
seeds=$work/seeds

seed() {
  rm -rf "$seeds"
  mkdir -p "$seeds/h"
  printf 'fn main() -> void {\n    print(1);\n    return;\n}\n' > "$seeds/h/h.kizu"
  if selected kizu; then
    if [ "$KIZU_DIRECT" = 1 ]; then
      KIZU_CACHE_DIR="$seeds/kc-direct" "$KIZU" build --target native --backend direct -o "$seeds/h/hk" "$seeds/h/h.kizu" > /dev/null
      KIZU_CACHE_DIR="$seeds/kc-direct-opt" "$KIZU" build --target native --opt --backend direct -o "$seeds/h/hk" "$seeds/h/h.kizu" > /dev/null
    fi
    KIZU_CACHE_DIR="$seeds/kc-llvm" "$KIZU" build --target native $KIZU_LLVM -o "$seeds/h/hk" "$seeds/h/h.kizu" > /dev/null
    KIZU_CACHE_DIR="$seeds/kc-llvm-opt" "$KIZU" build --target native --opt $KIZU_LLVM -o "$seeds/h/hk" "$seeds/h/h.kizu" > /dev/null
  fi
  if selected go; then
    printf 'package main\nimport "fmt"\nfunc main() { fmt.Println(1) }\n' > "$seeds/h/h.go"
    (cd "$seeds/h" && GOCACHE="$seeds/gc-opt" go build -o hg h.go && GOCACHE="$seeds/gc-noopt" "$C/go-noopt.sh" -o hg h.go)
  fi
  if selected zig; then
    printf 'const std = @import("std");\npub fn main() void { std.debug.print("1\\n", .{}); }\n' > "$seeds/h/h.zig"
    (cd "$seeds/h" && ZIG_GLOBAL_CACHE_DIR="$seeds/zg-debug" ZIG_LOCAL_CACHE_DIR="$seeds/h/zl-debug" zig build-exe -O Debug h.zig -femit-bin=hz)
    (cd "$seeds/h" && ZIG_GLOBAL_CACHE_DIR="$seeds/zg-fast" ZIG_LOCAL_CACHE_DIR="$seeds/h/zl-fast" zig build-exe -O ReleaseFast h.zig -femit-bin=hz)
  fi
}
seed

seed_bytes() {
  if [ -z "$1" ] || [ ! -e "$1" ]; then
    echo 0
  else
    python3 "$S/dir-size.py" "$1"
  fi
}

for m in $sizes; do
  P=$work/m$m
  R=$out/m$m
  mkdir -p "$R"
  R_abs=$(cd "$R" && pwd)
  [ -d "$P/rust" ] || python3 "$C/gen.py" "$P" "$m" 50
  export KIZU_CACHE_DIR="$P/kc"
  export GOCACHE="$P/gc"
  export ZIG_GLOBAL_CACHE_DIR="$P/zg"
  export ZIG_LOCAL_CACHE_DIR="$P/zl"
  export GOFLAGS=-buildvcs=false
  touch "$R_abs/rss.txt"
  hf() {
    selected "$1" || return 0
    hyperfine -N --style none --warmup 1 --runs "${RUNS:-5}" --export-json "$R_abs/$1.json" "${@:2}" > /dev/null
  }
  set_of() {
    local l=$1 d=$2 cmd=$3 sd=$4 f=$5 seed_dir=$6
    shift 6
    selected "$l" || return 0
    cd "$d"
    hf "$l-cold" --prepare "$sd" "$cmd"
    hf "$l-noop" "$cmd"
    hf "$l-edit" --prepare "python3 $C/bump.py $f" "$cmd"
    eval "$sd"
    $TIMEV $cmd 2>&1 > /dev/null | awk -v n="$l" '/maximum resident set size/ {print n, $1} /Maximum resident/ {print n, $NF*1024}' >> "$R_abs/rss.txt" || true
    local sb
    sb=$(seed_bytes "$seed_dir")
    python3 "$S/dir-size.py" --record "$R_abs/cache.json" "$R_abs/cache.txt" "$l" "$sb" "$@"
  }
  sk_d="bash -c 'rm -rf $P/kc $P/kizu/.kizu-cache && cp -R $seeds/kc-direct $P/kc'"
  sk_do="bash -c 'rm -rf $P/kc $P/kizu/.kizu-cache && cp -R $seeds/kc-direct-opt $P/kc'"
  sk_l="bash -c 'rm -rf $P/kc $P/kizu/.kizu-cache && cp -R $seeds/kc-llvm $P/kc'"
  sk_lo="bash -c 'rm -rf $P/kc $P/kizu/.kizu-cache && cp -R $seeds/kc-llvm-opt $P/kc'"
  sr="bash -c 'rm -rf $P/rust/target'"
  sg_o="bash -c 'rm -rf $P/gc && cp -R $seeds/gc-opt $P/gc'"
  sg_n="bash -c 'rm -rf $P/gc && cp -R $seeds/gc-noopt $P/gc'"
  sz_d="bash -c 'rm -rf $P/zg $P/zl && cp -R $seeds/zg-debug $P/zg'"
  sz_f="bash -c 'rm -rf $P/zg $P/zl && cp -R $seeds/zg-fast $P/zg'"
  sc="bash -c 'rm -f $P/c/*.o $P/c/app'"
  mk="make -s -j$NPROC CC=clang"
  if [ "$KIZU_DIRECT" = 1 ]; then
    set_of kizu-direct     "$P/kizu" "$KIZU build --target native --backend direct -o app ." "$sk_d" src/m0/m0.kizu "$seeds/kc-direct" "$P/kc" "$P/kizu/.kizu-cache"
    set_of kizu-direct-opt "$P/kizu" "$KIZU build --target native --opt --backend direct -o app ." "$sk_do" src/m0/m0.kizu "$seeds/kc-direct-opt" "$P/kc" "$P/kizu/.kizu-cache"
  fi
  set_of kizu-llvm     "$P/kizu" "$KIZU build --target native $KIZU_LLVM -o app ." "$sk_l" src/m0/m0.kizu "$seeds/kc-llvm" "$P/kc" "$P/kizu/.kizu-cache"
  set_of kizu-llvm-opt "$P/kizu" "$KIZU build --target native --opt $KIZU_LLVM -o app ." "$sk_lo" src/m0/m0.kizu "$seeds/kc-llvm-opt" "$P/kc" "$P/kizu/.kizu-cache"
  set_of rust-debug    "$P/rust" "cargo build --offline" "$sr" src/m0.rs "" "$P/rust/target"
  set_of rust-release  "$P/rust" "cargo build --release --offline" "$sr" src/m0.rs "" "$P/rust/target"
  set_of go            "$P/go" "go build -o app ." "$sg_o" m0/m0.go "$seeds/gc-opt" "$P/gc"
  set_of go-noopt      "$P/go" "../../../../compile/go-noopt.sh -o app ." "$sg_n" m0/m0.go "$seeds/gc-noopt" "$P/gc"
  set_of zig-debug     "$P/zig" "zig build-exe main.zig -femit-bin=app" "$sz_d" m0.zig "$seeds/zg-debug" "$P/zl" "$P/zg"
  set_of zig-fast      "$P/zig" "zig build-exe -O ReleaseFast main.zig -femit-bin=app" "$sz_f" m0.zig "$seeds/zg-fast" "$P/zl" "$P/zg"
  set_of c-O0          "$P/c" "$mk CFLAGS=-O0" "$sc" m0.c "" "$P/c/*.o"
  set_of c-O2          "$P/c" "$mk CFLAGS=-O2" "$sc" m0.c "" "$P/c/*.o"
  cd "$P/kizu" && hf kizu-check "$KIZU check ."
  cd "$P/rust" && hf rust-check --prepare "$sr" "cargo check --offline"
  cd "$P/go"   && hf go-vet "go vet ./..."
  cd "$P/zig"  && hf zig-check "zig build-exe main.zig -fno-emit-bin"
  cd "$P/c"    && hf c-check "bash -c 'ls *.c | xargs -P$NPROC -n8 clang -fsyntax-only'"
done
