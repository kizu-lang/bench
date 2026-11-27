#!/usr/bin/env bash
set -euo pipefail
[ -n "${REUSE:-}" ] && export ONLY=${ONLY:-kizu c-O2}
source "$(dirname "$0")/common.sh"
label=$1
checkout=${2:-}
out=$ROOT/results/$label
[ -e "$out" ] && { echo "$out exists" >&2; exit 1; }
mkdir -p "$out"
S=$ROOT/scripts
if [ -n "${REUSE:-}" ]; then
  python3 "$S/reuse.py" "$ROOT/results/$REUSE" "$out" $ONLY
fi
"$S/machine-info.sh" "$out"
"$S/build-runtime.sh"
"$S/check.sh"
"$S/run-runtime.sh" "$out/runtime"
if [ "${SKIP_VALGRIND:-0}" != 1 ] && command -v valgrind > /dev/null; then
  "$S/instructions.sh" "$out/runtime"
fi
"$S/compile-bench.sh" "$out/compile"
if [ "${SKIP_REAL_CODE:-0}" != 1 ] && [ -n "$checkout" ] && [ -d "$checkout/compiler/src" ]; then
  "$S/real-code.sh" "$checkout" "$out/real"
fi
echo "load after: $(uptime | sed 's/.*load average[s]*: //')" >> "$out/machine.txt"
python3 "$S/report.py" "$out" > "$out/README.md"
echo "wrote $out/README.md"
