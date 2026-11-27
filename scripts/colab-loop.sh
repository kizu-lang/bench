#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASELINE="main"
CANDIDATE=""
KIZU_REPO="https://github.com/kizu-lang/kizu.git"
SCALE="m40"
OUT_DIR="tmp/colab-ab"
BENCHMARKS=""
NO_VALGRIND=0
WITH_RUST=0
WITH_C=0
FAIL_ON_REGRESSION=""

KUGI_VERSION="0.1.0"
KUGI_ASSET_LINUX="kugi-0.1.0-linux-x86_64.tar.gz"
KUGI_SHA256_LINUX="be5e5a997d85300e198768a0dc2999ec2d12cd4d56bda09b393b8625f9998b01"

usage() {
  cat <<'EOF'
Usage: scripts/colab-loop.sh --candidate <git-ref> [options]

Options:
  --baseline <git-ref>           Baseline ref in kizu repo (default: main)
  --candidate <git-ref>          Candidate ref in kizu repo (default: HEAD when --kizu-repo is a local repo)
  --kizu-repo <url-or-path>      Kizu git URL or local checkout (default: https://github.com/kizu-lang/kizu.git)
  --scale <m10|m40>              Compile benchmark scale (default: m40)
  --out <dir>                    Output directory (default: tmp/colab-ab)
  --benchmarks <csv>             Comma-separated benchmark subset
  --with-rust                    Include Rust baseline in deterministic metrics
  --with-c                       Include C -O2 baseline in deterministic metrics
  --no-valgrind                  Skip Valgrind Callgrind dynamic Ir collection
  --fail-on-regression <pct>     Exit non-zero if any metric regresses by more than <pct>%
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --baseline) BASELINE="$2"; shift 2 ;;
    --candidate) CANDIDATE="$2"; shift 2 ;;
    --kizu-repo) KIZU_REPO="$2"; shift 2 ;;
    --scale) SCALE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    --benchmarks) BENCHMARKS="$2"; shift 2 ;;
    --with-rust) WITH_RUST=1; shift ;;
    --with-c) WITH_C=1; shift ;;
    --no-valgrind) NO_VALGRIND=1; shift ;;
    --fail-on-regression) FAIL_ON_REGRESSION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$CANDIDATE" ]; then
  if [ -d "$KIZU_REPO/.git" ] || [ -f "$KIZU_REPO/.git" ]; then
    CANDIDATE="HEAD"
  else
    echo "error: --candidate <git-ref> is required" >&2
    usage >&2
    exit 2
  fi
fi

if [ "$(uname -s)" = "Linux" ] && command -v apt-get > /dev/null 2>&1; then
  missing=()
  command -v clang > /dev/null 2>&1 || missing+=(clang)
  command -v objdump > /dev/null 2>&1 || missing+=(binutils)
  if [ "$NO_VALGRIND" -eq 0 ]; then
    command -v valgrind > /dev/null 2>&1 || missing+=(valgrind)
  fi
  if [ "${#missing[@]}" -gt 0 ]; then
    apt_prefix=()
    if [ "$(id -u)" -ne 0 ] && command -v sudo > /dev/null 2>&1; then
      apt_prefix=(sudo)
    fi
    DEBIAN_FRONTEND=noninteractive "${apt_prefix[@]}" apt-get update -qq
    DEBIAN_FRONTEND=noninteractive "${apt_prefix[@]}" apt-get install -y -qq --no-install-recommends "${missing[@]}"
  fi
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if ! command -v kugi > /dev/null 2>&1; then
  if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
    echo "error: kugi is not in PATH and automatic install supports Linux x86_64 only" >&2
    exit 1
  fi
  archive="${WORK}/${KUGI_ASSET_LINUX}"
  url="https://github.com/soyukke/kugi/releases/download/v${KUGI_VERSION}/${KUGI_ASSET_LINUX}"
  curl -fsSL --proto '=https' --proto-redir '=https' -o "$archive" "$url"
  echo "${KUGI_SHA256_LINUX}  ${archive}" | sha256sum -c -
  mkdir -p "${WORK}/kugi-bin"
  tar -xzf "$archive" --strip-components=1 -C "${WORK}/kugi-bin"
  export PATH="${WORK}/kugi-bin:${PATH}"
fi

cd "$ROOT"
kugi sync

mirror="${WORK}/kizu-mirror"
if [ -d "$KIZU_REPO" ]; then
  git clone --quiet "$KIZU_REPO" "$mirror"
else
  git clone --quiet --filter=blob:none "$KIZU_REPO" "$mirror"
fi

fetch_ref() {
  local ref=$1
  if git -C "$mirror" rev-parse --verify --quiet "${ref}^{commit}" > /dev/null; then
    git -C "$mirror" rev-parse --verify "${ref}^{commit}"
    return 0
  fi
  if git -C "$mirror" rev-parse --verify --quiet "origin/${ref}^{commit}" > /dev/null; then
    git -C "$mirror" rev-parse --verify "origin/${ref}^{commit}"
    return 0
  fi
  git -C "$mirror" fetch --quiet origin "$ref"
  git -C "$mirror" rev-parse --verify "FETCH_HEAD^{commit}"
}

build_ref() {
  local label=$1 ref=$2
  local commit src prefix seed_cache
  commit="$(fetch_ref "$ref")"
  src="${WORK}/src-${label}"
  prefix="${WORK}/install-${label}"
  seed_cache="${WORK}/seed-cache-${label}"
  git clone --quiet --no-checkout "$mirror" "$src"
  git -C "$src" checkout --quiet --detach "$commit"
  mkdir -p "${prefix}/bin" "${prefix}/lib"
  kugi exec -- bash -euo pipefail -c '
    cd "$1"
    scripts/gen-selfhost-version.sh
    KIZU_LIB_DIR="" KIZU_CACHE_DIR="$2" kizu build --target native --opt --backend llvm -o "$3" compiler
  ' _ "$src" "$seed_cache" "${prefix}/bin/kizu"
  cp -R "${src}/lib/kizu" "${prefix}/lib/kizu"
  rm -rf "$src" "$seed_cache"
  echo "[${label}] built $(KIZU_LIB_DIR="${prefix}/lib/kizu" "${prefix}/bin/kizu" version)"
}

build_ref baseline "$BASELINE"
build_ref candidate "$CANDIDATE"

mkdir -p "$OUT_DIR"
OUT_ABS="$(cd "$OUT_DIR" && pwd)"

extra_args=(--scale "$SCALE")
if [ -n "$BENCHMARKS" ]; then
  extra_args+=(--benchmarks "$BENCHMARKS")
fi
if [ "$NO_VALGRIND" -eq 1 ]; then
  extra_args+=(--no-valgrind)
fi
if [ "$WITH_RUST" -eq 1 ]; then
  extra_args+=(--with-rust)
fi
if [ "$WITH_C" -eq 1 ]; then
  extra_args+=(--with-c)
fi

kugi exec -- python3 scripts/deterministic.py collect \
  --out "${OUT_ABS}/baseline" \
  --kizu-bin "${WORK}/install-baseline/bin/kizu" \
  --kizu-lib-dir "${WORK}/install-baseline/lib/kizu" \
  "${extra_args[@]}"

kugi exec -- python3 scripts/deterministic.py collect \
  --out "${OUT_ABS}/candidate" \
  --kizu-bin "${WORK}/install-candidate/bin/kizu" \
  --kizu-lib-dir "${WORK}/install-candidate/lib/kizu" \
  "${extra_args[@]}"

cmp_args=()
if [ -n "$FAIL_ON_REGRESSION" ]; then
  cmp_args+=(--fail-on-regression "$FAIL_ON_REGRESSION")
fi

status=0
python3 scripts/deterministic.py compare \
  "${OUT_ABS}/baseline/deterministic.json" \
  "${OUT_ABS}/candidate/deterministic.json" \
  "${cmp_args[@]}" | tee "${OUT_ABS}/comparison.md" || status=$?

exit "$status"
