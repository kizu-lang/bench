# Sourced by the other scripts.
PROGRAMS="fib sieve matmul collatz nbody binarytrees"
VARIANTS="kizu-direct kizu-llvm go go-nobounds zig-safe zig-fast c-O2 c-O3native"
KIZU=${KIZU:-kizu}
# Releases before the direct backend take no --backend; they build with LLVM only.
if [[ "$($KIZU 2>&1 || true)" == *"--backend direct"* ]]; then
  KIZU_DIRECT=1; KIZU_LLVM="--backend llvm"
else
  KIZU_DIRECT=0; KIZU_LLVM=""
fi
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
built() { # BIN PROGRAM: the variants of PROGRAM that exist in BIN
  for v in $VARIANTS; do [ -x "$1/$2-$v" ] && echo $v; done
}
NPROC=$(getconf _NPROCESSORS_ONLN)
if [ "$(uname)" = Darwin ]; then
  NATIVE=-mcpu=native
  TIMEV="/usr/bin/time -l"
  PIN=""
else
  NATIVE=-march=native
  TIMEV="time -v"
  # One core for every timed run; BENCH_CPU picks which.
  PIN="taskset -c ${BENCH_CPU:-2}"
fi
