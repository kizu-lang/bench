#!/usr/bin/env bash
# real-code.sh KIZU_CHECKOUT OUT: builds real code. Kizu: compiler/ of a kizu checkout. Go: cmd/compile from GOROOT.
set -euo pipefail
source "$(dirname "$0")/common.sh"
repo=$1; out=$2; mkdir -p $out
W=$(mktemp -d)
K=$KIZU
hf() { hyperfine -N --style none --export-json "$out/$1.json" "${@:2}" > /dev/null; }
# line counts (non-blank), excluding tests
if selected kizu; then
  kl=$(find $repo/compiler/src -name '*.kizu' ! -name '*_test.kizu' -print0 | xargs -0 cat | grep -cv '^\s*$')
  echo "kizu_compiler_lines $kl" >> $out/lines.txt
  mkdir -p $W/h; printf 'fn main() -> void {\n    print(1);\n    return;\n}\n' > $W/h/h.kizu
  for f in "" "--opt $KIZU_LLVM"; do KIZU_CACHE_DIR=$W/kseed $K build --target native $f -o $W/h/hk $W/h/h.kizu > /dev/null; done
  cd $repo
  hf kizu-check --warmup 1 --runs 5 "$K check compiler"
  hf kizu-default-cold --warmup 1 --runs 5 \
    --prepare "bash -c 'rm -rf $W/kc && cp -R $W/kseed $W/kc'" "env KIZU_CACHE_DIR=$W/kc $K build --target native -o $W/kz compiler"
  hf kizu-llvm-opt-cold --warmup 0 --runs 3 \
    --prepare "bash -c 'rm -rf $W/kc && cp -R $W/kseed $W/kc'" "env KIZU_CACHE_DIR=$W/kc $K build --target native --opt $KIZU_LLVM -o $W/kz compiler"
fi
if selected go; then
  gopkgs=$(go list -deps -f '{{if not .Standard}}{{.Dir}}{{end}}{{if .Standard}}{{if eq (printf "%.4s" .ImportPath) "cmd/"}}{{.Dir}}{{end}}{{end}}' cmd/compile | sort -u)
  gl=$(for d in $gopkgs; do go list -f '{{range .GoFiles}}{{$.Dir}}/{{.}} {{end}}' $d; done | xargs cat | grep -cv '^\s*$')
  echo "go_cmd_compile_lines $gl" >> $out/lines.txt
  GOCACHE=$W/gseed go build std
  hf go-cold --warmup 1 --runs 5 \
    --prepare "bash -c 'rm -rf $W/gc && cp -R $W/gseed $W/gc'" "env GOCACHE=$W/gc go build -o $W/gz cmd/compile"
  hf go-cold-1cpu --warmup 1 --runs 5 \
    --prepare "bash -c 'rm -rf $W/gc && cp -R $W/gseed $W/gc'" "env GOCACHE=$W/gc GOMAXPROCS=1 go build -p 1 -o $W/gz cmd/compile"
fi
rm -rf $W
echo real-done
