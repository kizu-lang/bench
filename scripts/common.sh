PROGRAMS="fib sieve matmul collatz nbody binarytrees"
VARIANTS="kizu-direct kizu-llvm rust rust-native go go-nobounds zig-safe zig-fast c-O2 c-O3native"
KIZU=${KIZU:-kizu}
if [[ "$($KIZU 2>&1 || true)" == *"--backend direct"* ]]; then
  KIZU_DIRECT=1
  KIZU_LLVM="--backend llvm"
else
  KIZU_DIRECT=0
  KIZU_LLVM=""
fi
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ONLY=${ONLY:-}
selected() {
  [ -z "$ONLY" ] && return 0
  for w in $ONLY; do
    [[ $1 == $w* ]] && return 0
  done
  return 1
}
built() {
  for v in $VARIANTS; do
    [ -x "$1/$2-$v" ] && selected "$v" && echo "$v"
  done
}
NPROC=$(getconf _NPROCESSORS_ONLN)
if [ "$(uname)" = Darwin ]; then
  NATIVE=-mcpu=native
  TIMEV="/usr/bin/time -l"
  PIN=""
else
  NATIVE=-march=native
  TIMEV="time -v"
  PIN="taskset -c ${BENCH_CPU:-2}"
fi
compiler_at() {
  rev=$(git -C "$1" rev-parse --short=8 "$2^{commit}")
  local src=$3/src-$rev bin=$ROOT/target/compilers/kizu-$rev
  [ -d "$src" ] || git -C "$1" worktree add -q --detach "$src" "$rev"
  (cd "$src" && scripts/gen-selfhost-version.sh > /dev/null)
  mkdir -p "$ROOT/target/compilers"
  [ -x "$bin" ] || (cd "$src" && KIZU_CACHE_DIR=$3/build-cache $KIZU build --target native --opt $KIZU_LLVM -o "$bin" compiler > /dev/null)
}
