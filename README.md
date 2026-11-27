# bench

Kizu の compiler と、それが出すコードの速さ・build cache サイズを Rust・Go・Zig・C と比べます。
数値より先に、比べ方が公平かどうかを読めるようにしてあります。

- ダッシュボード: [https://kizu-lang.github.io/bench/](https://kizu-lang.github.io/bench/)
- Discussions: [https://github.com/kizu-lang/bench/discussions](https://github.com/kizu-lang/bench/discussions)（質問・不具合報告・アイデアはこちらへ。外部からの PR・issue は受け付けていません）
- 結果一覧: `results/<label>/README.md`

## 測るもの

| | 内容 |
|---|---|
| 実行時間 | `runtime/` の 6 本(fib、sieve、matmul、collatz、nbody、binarytrees)。5 言語で同じアルゴリズム |
| 実行命令数 | 同じ 6 本を valgrind で(Linux)。負荷で動かない指標として時間に添える |
| build 時間 | `compile/gen.py` が作る同じ形のプログラム(約 7k / 28k / 113k 行)。ゼロから、変更なし、1 関数編集後、型検査のみ |
| build cache サイズ | `m10` / `m40` / `m160` をゼロから build した後の cache・中間生成物サイズ(MB)。Kizu (`KIZU_CACHE_DIR`)、Rust (`target/`)、Go (`GOCACHE`)、Zig (`.zig-cache` + global cache)、C (`.o`) |
| 実在のコード | Kizu compiler(約 14 万行)と Go の `cmd/compile` |

## 公平にするために決めたこと

- **道具の版は `kugi.toml` + `kugi.lock` で固定。** `kizu`、`zig`、`go`、`hyperfine`、`just` を SHA-256 ごと固定する(`darwin-aarch64` / `linux-x86_64` 対応)。`clang` と `rustc` / `cargo` は host のものを使い、厳密な版を `machine.txt` に残す。
- **問題の大きさは実行時に決まる。** 各プログラムは引数の数を問題の大きさに足すので、compiler が答えを事前に計算できない。1 回の実行は 0.1〜1 秒で、起動時間は誤差になる。
- **安全検査と CPU ターゲットの差を並べる。** 汎用 CPU 向けとして `kizu-llvm`、`kizu-direct`、`rust` (`rustc --edition 2021 -C opt-level=3`)、`go`、`go-nobounds` (`-gcflags=-B`)、`zig-safe` (`ReleaseSafe -mcpu=baseline`)、`zig-fast` (`ReleaseFast -mcpu=baseline`)、`c-O2` (`clang -O2`) を並べる。host CPU 最適化は `rust-native` (`-C opt-level=3 -C target-cpu=native`) と `c-O3native` (`-O3 -march/-mcpu=native`) に明示分離する。整数の overflow は Kizu・Rust (release)・Go・C が wrap、Zig ReleaseSafe が trap。
- **メモリ確保は各言語の標準で。** binarytrees は 1 node ずつ確保する: Kizu は `mem::Box` (malloc)、Rust は `Box::new`、C は malloc/free、Zig は `c_allocator`、Go は GC。
- **負荷の偏りを避ける。** Linux では 1 コアに固定(`taskset`)し、言語の順番を round ごとに入れ替える。表は中央値で、ばらつきを併記する。
- **build の cache を揃える。** 「ゼロから」は project の cache を消し、std/runtime の cache は hello world を 1 回 build した状態から始める(Kizu の runtime、Go の std、Zig の compiler_rt、Rust は prebuilt sysroot)。Go の最適化なし比較には `-gcflags="all=-N -l"` を使う。cache サイズは全体(MB)と stdlib seed 除外分の両方を `cache.json` に記録する。
- **出力の一致を確かめる。** 全部の版が同じ行を出すことを `scripts/check.sh` が見る。
- **マシンを混ぜない。** 異なるホストや OS/アーキテクチャの結果は別々に保持し、ダッシュボード上でも同一マシン内だけで比較する。時間を測るマシンでは他の作業を止め、公表する数値は仮想化や常時負荷のない専用 Linux マシンで測る。

## 走らせる

```sh
kugi sync
just doctor
just check                                     # runtime 出力一致・comment-lint・docs/data.json 検証
just compare 2026-11-28-mymachine              # results/<label>/ に生データと README.md
just site                                      # results/ から docs/data.json を再生成
just ab <label> <rev> <rev>...                 # compiler の rev ごとの A/B(Linux)
just heap <label> <rev> [input]                # compiler の heap のピークの内訳(Linux)
just deterministic tmp/det --scale m40         # 負荷非依存の決定論指標 (.text / spill / Callgrind Ir / cache)
just deterministic-ab base.json cand.json      # 決定論指標の Markdown A/B 差分
```

Colab 等の共有 Linux x86_64 環境で `kizu` の 2 rev を決定論 A/B 比較するワンライナー:

```sh
scripts/colab-loop.sh --baseline main --candidate <rev> --scale m40
```

kizu の checkout は既定で `../kizu` を使う(`KIZU_CHECKOUT=` で上書き可能、存在しなければ `real-code` は自動でスキップ)。各 recipe は内部で `kugi exec` を呼ぶため、shell への事前 `eval` は不要。

main の compiler を測るときは `KIZU=/path/to/kizu` を渡す。kizu だけを測り直すときは `REUSE=<前の label>` を足す。測る版は `ONLY="kizu c-O2"` のように名前の頭で変えられる。

```sh
KIZU=../kizu/target/release/kizu REUSE=2026-11-17-mymachine just compare 2026-11-18-mymachine
```

## 結果

- `results/<label>/README.md`: 各 run の表と `machine.txt`
- `docs/`: GitHub Pages (`https://kizu-lang.github.io/bench/`) 向けの静的ダッシュボード(外部 CDN なし)
- 日次自動計測: `.github/workflows/bench-daily.yml` が毎日 1 回(`ubuntu-latest` `linux-x86_64` と `macos-15` `macos-arm64`)で `kizu-lang/kizu` `main` HEAD を seed から自動ビルドして計測し、`results/*-gha-*`（各ターゲット最新 30 回分を保持）と `docs/data.json` を自動更新する（`workflow_dispatch` で `kugi.toml` 固定版の計測も選択可）。専用マシンの結果とはホスト別に分離して表示する。

## License

[MIT](LICENSE)
