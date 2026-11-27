#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/common.sh"
bin=${1:-$ROOT/target/bin}
bad=0
for p in $PROGRAMS; do
  want=$("$bin/$p-c-O2")
  for v in $(built "$bin" "$p"); do
    got=$("$bin/$p-$v" 2>&1)
    if [ "$got" != "$want" ]; then
      echo "$p $v: got '$got', want '$want'" >&2
      bad=1
    fi
  done
  echo "$p: $want"
done
exit $bad
