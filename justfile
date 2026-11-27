set shell := ["bash", "-euo", "pipefail", "-c"]

kizu := env("KIZU_CHECKOUT", "../kizu")

default:
    @just --list

sync:
    @kugi sync

doctor:
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- env KUGI_ACTIVE=1 just doctor; else source scripts/common.sh; echo "kugi: $(kugi version)"; echo "kizu: $($KIZU version)"; echo "rust: $(rustc --version 2>/dev/null || echo missing)"; echo "cargo: $(cargo --version 2>/dev/null || echo missing)"; echo "go: $(go version)"; echo "zig: $(zig version)"; echo "clang: $(clang --version | head -1)"; echo "hyperfine: $(hyperfine --version)"; echo "just: $(just --version)"; fi

check:
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- env KUGI_ACTIVE=1 just check; else scripts/build-runtime.sh && scripts/check.sh && python3 scripts/comment-lint && python3 scripts/build-site-data.py --check; if command -v node > /dev/null && [ -f docs/app.js ]; then node --check docs/app.js; fi; fi

comment-lint:
    @python3 scripts/comment-lint

site:
    @python3 scripts/build-site-data.py

deterministic out="tmp/det" *args="":
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- python3 scripts/deterministic.py collect --out {{out}} {{args}}; else python3 scripts/deterministic.py collect --out {{out}} {{args}}; fi

deterministic-ab base cand *args="":
    @python3 scripts/deterministic.py compare {{base}} {{cand}} {{args}}

compare label:
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- env KUGI_ACTIVE=1 just compare {{label}}; else scripts/all.sh {{label}} {{kizu}}; fi

ab label +revs:
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- env KUGI_ACTIVE=1 just ab {{label}} {{revs}}; else MASSIF=1 scripts/compiler-ab.sh {{kizu}} results/{{label}} {{revs}}; fi

heap label rev input="":
    @if [[ -z "${KUGI_ACTIVE:-}" ]]; then exec kugi exec -- env KUGI_ACTIVE=1 just heap {{label}} {{rev}} {{input}}; else scripts/heap.sh {{kizu}} results/{{label}} {{rev}} {{input}}; fi

clean:
    @rm -rf target
