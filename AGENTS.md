# AGENTS.md

## Tooling

- Toolchain versions are pinned in `kugi.toml` + `kugi.lock` (`kizu`, `zig`, `go`, `hyperfine`, `just`). System `clang` and host `rustc` / `cargo` are used alongside `kugi`.
- Run `kugi sync` once, then run all recipes through `just` (which wraps commands in `kugi exec`).
- Do not add Nix flakes, Homebrew scripts, or GitHub Actions workflows.

## Code Style

- Zero code comments (`//`, `/* */`, HTML `<!-- -->`, or `#` except line-1 shebang) in all new or edited source files (`.py`, `.sh`, `.rs`, `.kizu`, `.js`, `.css`, `.html`).
- Keep documentation minimal: `README.md`, `AGENTS.md`, and generated `results/*/README.md` only.
- Never commit local absolute paths, machine usernames, or secrets.

## Verification

Before committing:

1. `just check` (builds runtime binaries, verifies identical outputs across all languages, runs comment-lint, validates `docs/data.json` and `docs/app.js`).
2. `gitleaks detect --no-banner` (must report 0 leaks).
