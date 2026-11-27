#!/usr/bin/env bash
set -uo pipefail
source "$(dirname "$0")/common.sh"
out=$1
mkdir -p "$out"
{
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "os: $(uname -srm)"
  if [ "$(uname)" = Darwin ]; then
    echo "cpu: $(sysctl -n machdep.cpu.brand_string)"
  else
    cpu_model=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ //' || true)
    echo "cpu: ${cpu_model:-$(uname -m)}"
    if grep -qi microsoft /proc/version 2>/dev/null; then
      echo "virtualized: WSL2"
    fi
  fi
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "runner: GitHub Actions"
  fi
  echo "cores: $NPROC"
  echo "load: $(uptime | sed 's/.*load average[s]*: //')"
  echo "kizu: $($KIZU version)"
  echo "rust: $(rustc --version 2>/dev/null || echo none)"
  echo "cargo: $(cargo --version 2>/dev/null || echo none)"
  echo "go: $(go version)"
  echo "zig: $(zig version)"
  echo "clang: $(clang --version | head -1)"
  echo "pin: ${PIN:-none}"
} > "$out/machine.txt"
cat "$out/machine.txt"
