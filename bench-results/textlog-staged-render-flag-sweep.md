# TEXTLOG staged-render flag sweep — 2026-05-04

**Source**: `tests/bench/textlog-staged-render-flag-sweep.bench.ts`
**Flag**: `textlog.staged_render.initial_count`
**Sweep N**: 1, 4, 8, 16, 32, 64
**Sweep logs**: 50, 200, 1000
**Warmup / measured per cell**: 2 / 12
**Method**: real browser via Playwright + chromium, bundle unmodified — only the URL flag changes between runs (the value of the runtime flag mechanism: zero rebuilds). Each cell reloads the page `WARMUP + MEASURED` times; warmup samples are discarded (JIT / GC / IDB cache warm-up). Median + IQR (p25 / p75) reported because cold-cache browser timings are right-skewed and noisy — mean ± stddev would over-weight transient outliers.

## Environment

| key | value |
|---|---|
| **CPU** | Intel(R) Xeon(R) Processor @ 2.10GHz |
| **CPU cores** | 4 (logical) |
| **Memory** | 15.7 GiB |
| **Architecture** | x64 |
| **OS** | linux 6.18.5 |
| **Node.js** | v22.22.2 |
| **Browser** | chromium 141.0.7390.37 |
| **Bench timestamp** | 2026-05-04T11:27:13.481Z |

Timings are tied to this hardware / software stack. To compare a future run, re-run the bench on the same host (or note delta vs this baseline).

## Result

| logs | N (initial_count) | hydrated 1st paint | min | p25 | **median** | p75 | max | n |
|---|---|---|---|---|---|---|---|---|
| 50 | 1 | 5 | 80.3 | 81.3 | **92.6** | 95.3 | 103.7 | 12 |
| 50 | 4 | 5 | 71.9 | 74.7 | **76.7** | 78.4 | 81.1 | 12 |
| 50 | 8 | 9 | 69.8 | 81.4 | **85.9** | 86.8 | 122.7 | 12 |
| 50 | 16 | 18 | 72.4 | 76.5 | **78.9** | 88.8 | 96.4 | 12 |
| 50 | 32 | 33 | 73.8 | 80.9 | **87.8** | 93.5 | 94.6 | 12 |
| 50 | 64 | 50 | 79 | 85.9 | **92.2** | 98.7 | 107.5 | 12 |
| 200 | 1 | 5 | 112.4 | 116.9 | **119.5** | 122.4 | 127.2 | 12 |
| 200 | 4 | 6 | 112.3 | 118.1 | **124.2** | 127.7 | 137.8 | 12 |
| 200 | 8 | 10 | 110.7 | 114.6 | **117.4** | 128.5 | 148.8 | 12 |
| 200 | 16 | 17 | 111.9 | 113.5 | **119.4** | 130.4 | 136.8 | 12 |
| 200 | 32 | 34 | 112.4 | 121 | **127.7** | 134.3 | 143.3 | 12 |
| 200 | 64 | 65 | 116.3 | 122.8 | **124.3** | 133.6 | 175.9 | 12 |
| 1000 | 1 | 3 | 315.1 | 316.7 | **323.2** | 358.3 | 609.5 | 12 |
| 1000 | 4 | 4 | 291.1 | 307.8 | **320.6** | 338.9 | 369.1 | 12 |
| 1000 | 8 | 8 | 278.2 | 290.3 | **304.2** | 314.8 | 474.1 | 12 |
| 1000 | 16 | 16 | 278.4 | 298.2 | **312.6** | 328.1 | 405.9 | 12 |
| 1000 | 32 | 32 | 284.7 | 307.7 | **316.8** | 329.9 | 360.7 | 12 |
| 1000 | 64 | 65 | 295.2 | 306.9 | **318.2** | 382.3 | 394.1 | 12 |

## How to read the table

- **`hydrated 1st paint`**: the count of articles with `data-pkc-hydrated="true"` at the moment the *first* `data-pkc-hydrated="true"` is observed by `locator.waitFor`. This is **not** strictly N — by snapshot time the lookahead loop (`textlog.staged_render.lookahead`, default 4) has typically promoted a few placeholders, and the IntersectionObserver may have promoted on-screen ones too. Treat this column as a sanity gate: if it stays around N for small N and around `logCount` for large N, the flag is wired through.
- **`median (ms)`** is the headline number per cell. It is the click→first-hydrated latency in milliseconds. Lower is faster.
- **`IQR = p75 − p25`** is the spread within the 12 measured samples. Narrow IQR = stable timing; wide IQR = the cell is sensitive to GC / IDB / layout jitter.
- The relationship between N and median latency is **non-monotonic** in real browser timings — small N pays scroll-trigger / lookahead overhead, large N pays synchronous-render-on-click cost, and the sweet spot moves with `logCount`. Do **not** generalize a single run to "N=K is best"; re-run on the target device class before deciding a default.

## Mechanism validation

Each cell ran 12 × 6 N-values × 3 logCount sizes = 216 measured iterations on the **same bundle** (`dist/pkc2.html` rebuilt once before the sweep). Only `?pkc-flag=textlog.staged_render.initial_count=<N>` differed. This proves the flags mechanism works end-to-end for the PoC use-case articulated on 2026-05-03:

> 性能テストや POC、デバッグ、実行時多数パターンテスト検討のために動的変更

Future PoCs follow the same template: boot variant via URL flag, measure with `WARMUP + MEASURED` reps, record env, write a markdown table — never hard-code conclusions, always derive them from the table for the run at hand.
