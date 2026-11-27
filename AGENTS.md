# AGENTS.md

## Tooling

- Toolchain versions are pinned in `kugi.toml` + `kugi.lock` (`kizu`, `zig`, `go`, `hyperfine`, `just`). System `clang` and host `rustc` / `cargo` are used alongside `kugi`.
- Run `kugi sync` once, then run all recipes through `just` (which wraps commands in `kugi exec`).
- Do not add Nix flakes, Homebrew scripts, or unrequested GitHub Actions workflows.

## Repository Policy & Automation

- `kizu-lang/bench` is public and maintained solely by the author (`CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/config.yml`). Pull request and issue creation is restricted to collaborators natively on GitHub (`COLLABORATORS_ONLY`), and external feedback belongs in GitHub Discussions.
- `.github/workflows/bench-daily.yml` is the only workflow; it runs once daily (`17 19 * * *` UTC) on `ubuntu-latest` (`linux-x86_64`) and `macos-15` (`macos-arm64`), prunes old CI runs via `scripts/prune-ci-results.py` (keeping the latest 30 per CI target), regenerates `docs/data.json`, and publishes to `main`.
- Pin all GitHub Actions in workflows to full 40-character commit SHAs and verify downloaded release artifacts against SHA-256 before extraction.

## Code Style

- Zero code comments (`//`, `/* */`, HTML `<!-- -->`, or `#` except line-1 shebang) in all new or edited source files (`.py`, `.sh`, `.rs`, `.kizu`, `.js`, `.css`, `.html`).
- Keep documentation minimal: `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, and generated `results/*/README.md` only.
- Never commit local absolute paths, machine usernames, or secrets.

## Verification

Before committing:

1. `just check` (builds runtime binaries, verifies identical outputs across all languages, runs comment-lint, validates `docs/data.json` and `docs/app.js`).
2. `gitleaks detect --no-banner` (must report 0 leaks).
