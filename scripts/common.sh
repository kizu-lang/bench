PROGRAMS="fib sieve matmul collatz nbody binarytrees"
VARIANTS="kizu-direct kizu-llvm rust rust-native go go-nobounds zig-safe zig-fast c-O2 c-O3native"
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [ -n "${KIZU_OVERRIDE_BIN:-}" ]; then
  if [ ! -x "$KIZU_OVERRIDE_BIN" ]; then
    echo "KIZU_OVERRIDE_BIN is not executable: $KIZU_OVERRIDE_BIN" >&2
    exit 1
  fi
  kizu_override_dir=$(cd "$(dirname "$KIZU_OVERRIDE_BIN")" && pwd)
  kizu_override_base=$(basename "$KIZU_OVERRIDE_BIN")
  if [ "$kizu_override_base" != "kizu" ]; then
    kizu_override_shim="$ROOT/target/kizu-override-bin"
    mkdir -p "$kizu_override_shim"
    ln -sf "$kizu_override_dir/$kizu_override_base" "$kizu_override_shim/kizu"
    kizu_override_dir="$kizu_override_shim"
  fi
  case "${PATH:-}" in
    "${kizu_override_dir}"|"${kizu_override_dir}":*) ;;
    *) PATH="${kizu_override_dir}${PATH:+:${PATH}}" ;;
  esac
  export PATH
  hash -r
  KIZU="kizu"
  export KIZU
fi
if [ -n "${KIZU_OVERRIDE_LIB_DIR:-}" ]; then
  KIZU_LIB_DIR="$KIZU_OVERRIDE_LIB_DIR"
  export KIZU_LIB_DIR
fi
KIZU=${KIZU:-kizu}
if [[ "$($KIZU 2>&1 || true)" == *"--backend direct"* ]]; then
  KIZU_DIRECT=1
  KIZU_LLVM="--backend llvm"
else
  KIZU_DIRECT=0
  KIZU_LLVM=""
fi
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
  TIMEV="/usr/bin/time -v"
  if [ "${BENCH_CPU:-}" = "none" ] || ! command -v taskset > /dev/null; then
    PIN=""
  else
    default_cpu=0
    [ "$NPROC" -gt 2 ] && default_cpu=2
    PIN="taskset -c ${BENCH_CPU:-$default_cpu}"
  fi
fi
compiler_at() {
  rev=$(git -C "$1" rev-parse --short=8 "$2^{commit}")
  local src=$3/src-$rev bin=$ROOT/target/compilers/kizu-$rev
  [ -d "$src" ] || git -C "$1" worktree add -q --detach "$src" "$rev"
  (cd "$src" && scripts/gen-selfhost-version.sh > /dev/null)
  mkdir -p "$ROOT/target/compilers"
  [ -x "$bin" ] || (cd "$src" && KIZU_CACHE_DIR=$3/build-cache $KIZU build --target native --opt $KIZU_LLVM -o "$bin" compiler > /dev/null)
}
