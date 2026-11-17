# compiler A/B

入力は rev `515c7b86` の `compiler/`。どの rev の compiler も同じ入力を build する。
時間とメモリは 5 回の中央値。命令数と関数ごとの内訳は valgrind の 1 回。

| rev | wall s | user s | sys s | max RSS MB | minor faults | instructions | cycles |
|---|---|---|---|---|---|---|---|
| `afa3e246` | 3.38 | 2.89 | 0.48 | 1277 | 501066 | 41.59G | 15.31G |
| `38feea1a` | 3.23 (-4.4%) | 2.83 (-2.1%) | 0.36 (-25.0%) | 1194 (-6.5%) | 442051 (-11.8%) | 40.87G (-1.7%) | 14.80G (-3.3%) |
| `b764bab0` | 3.17 (-1.9%) | 2.84 (+0.4%) | 0.33 (-8.3%) | 1001 (-16.1%) | 413298 (-6.5%) | 40.87G (-0.0%) | 15.39G (+4.0%) |
| `515c7b86` | 3.20 (+0.9%) | 2.83 (-0.4%) | 0.35 (+6.1%) | 902 (-9.9%) | 393600 (-4.8%) | 40.87G (-0.0%) | 15.58G (+1.2%) |

| rev | heap peak MB (massif) |
|---|---|
| `afa3e246` | 1359 |
| `38feea1a` | 1253 |
| `b764bab0` | 936 |
| `515c7b86` | 799 |

## `afa3e246` → `38feea1a`: 命令数 42.13G → 41.35G (-1.9%)

| 差 | 前 | 後 | 関数(self) |
|---|---|---|---|
| -862M | 7427M | 6565M | `compiler__internal__direct__allocate_laid_out` |
| +100M | 296M | 395M | `compiler__internal__direct__defs` |
| -69M | 1480M | 1412M | `__memcpy_avx_unaligned_erms` |
| +18M | 757M | 775M | `kizu_array_grow` |
| +10M | 712M | 722M | `kizu_rt_realloc` |
| +5M | 217M | 222M | `_int_malloc` |
| +4M | 415M | 419M | `compiler__internal__pool__pool_alloc` |
| +3M | 281M | 284M | `compiler__internal__pool__pool_free` |

## `38feea1a` → `b764bab0`: 命令数 41.35G → 41.35G (-0.0%)

| 差 | 前 | 後 | 関数(self) |
|---|---|---|---|
| +13M | 222M | 235M | `_int_malloc` |
| -8M | 1349M | 1341M | `compiler__internal__direct__emit_into` |
| -4M | 45M | 42M | `unlink_chunk.isra.0` |
| -3M | 419M | 416M | `compiler__internal__pool__pool_alloc` |
| -1M | 53M | 52M | `_int_free_merge_chunk` |
| -1M | 3M | 2M | `_int_free_maybe_trim.part.0` |
| -1M | 46M | 45M | `_int_free_create_chunk` |
| +0M | 1412M | 1412M | `__memcpy_avx_unaligned_erms` |

## `b764bab0` → `515c7b86`: 命令数 41.35G → 41.34G (-0.0%)

| 差 | 前 | 後 | 関数(self) |
|---|---|---|---|
| +12M | 0M | 12M | `compiler__native_target` |
| -12M | 12M | 0M | `compiler__set_link_inputs` |
| -3M | 42M | 39M | `unlink_chunk.isra.0` |
| -1M | 235M | 234M | `_int_malloc` |
| -1M | 45M | 44M | `_int_free_create_chunk` |
| -1M | 17M | 16M | `std__mem__starts_with` |
| -0M | 416M | 416M | `compiler__internal__pool__pool_alloc` |
| +0M | 1412M | 1412M | `__memcpy_avx_unaligned_erms` |
