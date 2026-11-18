# heap

rev `3e996c29` の compiler が `compiler/` を build したとき。

| max RSS MB | heap peak MB (massif) | pages peak MB (massif --pages-as-heap) | wall s | minor faults |
|---|---|---|---|---|
| 478 | 502 | 604 | 3.01 | 292502 |

heap MB の推移(snapshot を 10 等分):

0 → 326 → 366 → 328 → 339 → 348 → 500 → 364 → 366 → 368 → 372

ピークは snapshot 118(全 193 個中)。

## ピークの内訳

| MB | phase(stack 上でいちばん外側の compiler の package) |
|---|---|
| 181.7 | `direct` |
| 153.5 | `ir` |
| 57.7 | `project` |
| 31.0 | `pool` |
| 30.6 | `?` |
| 14.0 | `parser` |
| 14.0 | `ownership` |
| 9.0 | `types` |
| 7.0 | `typ` |
| 3.0 | `ast` |

| MB | 確保した場所(runtime を除いた最初の frame) |
|---|---|
| 122.0 | `compiler__internal__pool__pool_alloc` |
| 112.9 | `compiler__internal__direct__allocate_laid_out` |
| 87.0 | `compiler__internal__ir__Module.add_instr` |
| 30.7 | `compiler__internal__project__Loader.load_package` |
| 23.1 | `in 593 places, all below massif's threshold (0.20%)` |
| 20.0 | `compiler__internal__direct__Obj.little` |
| 19.1 | `compiler__internal__direct__clone_function` |
| 18.6 | `compiler__internal__ir__EnvStore.clone_env` |
| 12.7 | `compiler__internal__direct__emit_into` |
| 8.2 | `compiler__internal__ir__Lowerer.new_block` |
| 6.0 | `compiler__internal__direct__Selector.select_const` |
| 4.6 | `compiler__internal__ir__Lowerer.lower_try_expr` |
| 4.4 | `compiler__internal__ir__new_lowerer_for_target` |
| 4.2 | `compiler__internal__ir__NameTable.intern_owned` |
| 3.8 | `compiler__internal__direct__Selector.copy_bytes` |
| 3.0 | `compiler__internal__direct__Selector.find_ranges` |
| 2.8 | `compiler__internal__ir__Lowerer.generic_bindings` |
| 2.7 | `in 114 places, all below massif's threshold (0.20%)` |

## 指定した関数を通る呼び出し

| MB | chain |
|---|---|
| 103.1 | `kizu_rt_realloc <- kizu_array_grow <- compiler__internal__direct__allocate_laid_out <- compiler__internal__direct__emit_selected <- compiler__internal__direct__emit_into <- compiler__internal__direct__emit_object` |
| 9.8 | `kizu_rt_realloc <- kizu_array_reserve <- compiler__internal__direct__allocate_laid_out <- compiler__internal__direct__emit_selected <- compiler__internal__direct__emit_into <- compiler__internal__direct__emit_object` |

## 指定した関数の確保がなかったら

| snapshot | 種類 | heap MB | 除いた後 MB | `compiler__internal__direct__allocate_laid_out` |
|---|---|---|---|---|
| 1 | detailed | 33 | 33 | 0 |
| 10 | detailed | 234 | 234 | 0 |
| 17 | detailed | 302 | 302 | 0 |
| 23 | detailed | 473 | 473 | 0 |
| 26 | detailed | 415 | 415 | 0 |
| 30 | detailed | 429 | 429 | 0 |
| 33 | detailed | 312 | 312 | 0 |
| 66 | detailed | 333 | 333 | 0 |
| 69 | detailed | 332 | 332 | 0 |
| 83 | detailed | 342 | 342 | 0 |
| 86 | detailed | 342 | 342 | 0 |
| 93 | detailed | 346 | 346 | 0 |
| 104 | detailed | 349 | 349 | 0 |
| 110 | detailed | 474 | 379 | 95 |
| 111 | detailed | 486 | 379 | 107 |
| 112 | detailed | 498 | 380 | 118 |
| 114 | detailed | 499 | 387 | 112 |
| 115 | detailed | 500 | 388 | 112 |
| 118 | peak | 502 | 389 | 113 |
| 128 | detailed | 364 | 364 | 0 |
| 138 | detailed | 365 | 365 | 0 |
| 148 | detailed | 366 | 366 | 0 |
| 158 | detailed | 366 | 366 | 0 |
| 168 | detailed | 367 | 367 | 0 |
| 178 | detailed | 368 | 368 | 0 |
| 188 | detailed | 370 | 370 | 0 |
