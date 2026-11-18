# bench

Kizu の compiler と、それが出すコードの速さを Go・Zig・C と比べます。
数値より先に、比べ方が公平かどうかを読めるようにしてあります。

## 測るもの

| | 内容 |
|---|---|
| 実行時間 | `runtime/` の 6 本(fib、sieve、matmul、collatz、nbody、binarytrees)。4 言語で同じアルゴリズム |
| 実行命令数 | 同じ 6 本を valgrind で(Linux)。負荷で動かない指標として時間に添える |
| build 時間 | `compile/gen.py` が作る同じ形のプログラム(約 7k / 28k / 113k 行)。ゼロから、変更なし、1 関数編集後、型検査のみ |
| 実在のコード | Kizu compiler(約 14 万行)と Go の `cmd/compile` |

## 公平にするために決めたこと

- **道具の版は `flake.nix` で固定。** nixpkgs の rev を 1 つに決め、Kizu は release の archive を
  sha256 ごと固定する。clang は Kizu の llvm backend、C、`go`/`zig` の外の全部で同じもの。
- **問題の大きさは実行時に決まる。** 各プログラムは引数の数を問題の大きさに足すので、compiler が
  答えを事前に計算できない。1 回の実行は 0.3〜1 秒で、起動時間は誤差になる。
- **安全検査の差を並べる。** Kizu と Go は配列の範囲を検査する。比較のために範囲検査を切った Go
  (`-gcflags=-B`)、検査ありの Zig(ReleaseSafe)となしの Zig(ReleaseFast)、C の `-O2` と
  `-O3 -march=native` を並べる。host の CPU に合わせるのは最後の 1 つだけで、他は汎用の命令で
  build する(Zig は既定で host に合わせるので `-mcpu=baseline` を渡す)。整数の overflow は Kizu・Go・C が wrap、Zig ReleaseSafe が trap。
- **メモリ確保は各言語の標準で。** binarytrees は 1 node ずつ確保する: Kizu は `mem::Box`
  (malloc)、C は malloc/free、Zig は `c_allocator`、Go は GC。
- **負荷の偏りを避ける。** 時間は 1 コアに固定し(Linux の `taskset`)、言語の順番を round ごとに
  入れ替える。表は中央値で、ばらつきを併記する。
- **build の cache を揃える。** 「ゼロから」は project の cache を消し、std/runtime の cache は
  hello world を 1 回 build した状態から始める(Go の std、Zig の compiler_rt、Kizu の runtime)。
  Go は既定で最適化するので、最適化なしの比較には `-gcflags=all=-N -l` を使う。
- **出力の一致を確かめる。** 全部の版が同じ行を出すことを `scripts/check.sh` が見る。CI も回す。

## 走らせる

```sh
nix develop
just compare 2026-11-17-mymachine              # results/<label>/ に生データと README.md
just ab <label> <rev> <rev>...                 # compiler の rev ごとの A/B(Linux)
just heap <label> <rev> [input]                # compiler の heap のピークの内訳(Linux)
```

kizu の checkout は `../kizu` を使う。別の場所なら `KIZU_CHECKOUT=` で渡す。各 recipe は
`scripts/` の script を呼ぶだけなので、直接呼んでもよい。

main の compiler を測るときは `KIZU=/path/to/kizu` を渡す。kizu だけを測り直すときは
`REUSE=<前の label>` を足す。kizu と c-O2 の版だけを測り、他の言語はその run の値を使う
(他の道具は `flake.nix` で版が固定なので変わらない)。c-O2 は両方の run で測り、その差を
README に出す。マシンの状態が変わっていれば、そこに現れる。測る版は `ONLY="kizu c-O2"` の
ように名前の頭で変えられる。

```sh
KIZU=../kizu/target/release/kizu REUSE=2026-11-17-mymachine just compare 2026-11-18-mymachine
```

compiler の変更が何を変えたかは `scripts/compiler-ab.sh` で比べる(Linux)。各 rev の compiler を
同じ種で build し(`target/compilers/` に残る)、全部に最後の rev の `compiler/` を build させて、
user・sys・wall・最大 RSS・page fault の中央値、perf の命令数と cycles、callgrind の関数ごとの
命令数を並べる。`MASSIF=1` で heap のピークも取る。

```sh
just ab <label> <rev> <rev>...
```

1 つの rev の compiler がメモリを何に使っているかは `just heap` で見る。massif で heap のピークを
compiler の phase ごと、確保した場所ごとに分ける。入力は既定でその rev の `compiler/`。
`DROP="<関数名>..."` を渡すと、その関数を通る呼び出しと、その関数の確保がなかったときの heap を
snapshot ごとに出す。

```sh
DROP=compiler__internal__direct__allocate_laid_out just heap <label> <rev>
```

時間を測るマシンでは他の作業を止める。手元で普段使いの Mac は向かない(macOS はコアを
固定できず、負荷が高いと効率コアに回される)。公表する数値は、仮想化のない専用の Linux で
測ったものだけにする。

## 結果

`results/<label>/README.md`。各ディレクトリの `machine.txt` が CPU、OS、負荷、各道具の版を持つ。
