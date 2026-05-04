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
| **Bench timestamp** | 2026-05-04T11:55:50.172Z |

Timings are tied to this hardware / software stack. To compare a future run, re-run the bench on the same host (or note delta vs this baseline).

## Result

| logs | N (initial_count) | hydrated 1st paint | min | p25 | **median** | p75 | max | n |
|---|---|---|---|---|---|---|---|---|
| 50 | 1 | 5 | 73.2 | 75.2 | **80.7** | 84 | 91.5 | 12 |
| 50 | 4 | 5 | 76 | 80.2 | **82.3** | 84.9 | 133.7 | 12 |
| 50 | 8 | 10 | 69.7 | 74.7 | **82.4** | 86.4 | 92 | 12 |
| 50 | 16 | 17 | 69 | 73.2 | **81.4** | 83.4 | 93.1 | 12 |
| 50 | 32 | 34 | 75.2 | 78.5 | **81.5** | 85.8 | 93.5 | 12 |
| 50 | 64 | 50 | 74.3 | 77.6 | **79.9** | 83.1 | 92.1 | 12 |
| 200 | 1 | 5 | 111.6 | 114.1 | **123.2** | 132.1 | 144.1 | 12 |
| 200 | 4 | 6 | 104.3 | 110.5 | **116.2** | 122.6 | 145.2 | 12 |
| 200 | 8 | 10 | 111.4 | 113.3 | **117.3** | 126.2 | 127.6 | 12 |
| 200 | 16 | 18 | 114 | 121.7 | **124.1** | 126.5 | 144.8 | 12 |
| 200 | 32 | 33 | 109.7 | 121.2 | **131** | 135.4 | 175 | 12 |
| 200 | 64 | 65 | 118.8 | 121 | **123.9** | 130.4 | 133.3 | 12 |
| 1000 | 1 | 3 | 304.6 | 317.7 | **336.7** | 346.5 | 373 | 12 |
| 1000 | 4 | 4 | 279.6 | 298 | **310.4** | 318.2 | 487.2 | 12 |
| 1000 | 8 | 8 | 289.3 | 303.1 | **312.4** | 333.2 | 423.2 | 12 |
| 1000 | 16 | 17 | 282.4 | 313.7 | **316** | 342.4 | 391.5 | 12 |
| 1000 | 32 | 32 | 300 | 303.4 | **312.9** | 323.3 | 352.5 | 12 |
| 1000 | 64 | 64 | 300.9 | 313.6 | **330** | 363.5 | 423.5 | 12 |

## How to read the table

- **`hydrated 1st paint`**: the count of articles with `data-pkc-hydrated="true"` at the moment the *first* `data-pkc-hydrated="true"` is observed by `locator.waitFor`. This is **not** strictly N — by snapshot time the lookahead loop (`textlog.staged_render.lookahead`, default 4) has typically promoted a few placeholders, and the IntersectionObserver may have promoted on-screen ones too. Treat this column as a sanity gate: if it stays around N for small N and around `logCount` for large N, the flag is wired through.
- **`median (ms)`** is the headline number per cell. It is the click→first-hydrated latency in milliseconds. Lower is faster.
- **`IQR = p75 − p25`** is the spread within the 12 measured samples. Narrow IQR = stable timing; wide IQR = the cell is sensitive to GC / IDB / layout jitter.
- The relationship between N and median latency is **non-monotonic** in real browser timings — small N pays scroll-trigger / lookahead overhead, large N pays synchronous-render-on-click cost, and the sweet spot moves with `logCount`. Do **not** generalize a single run to "N=K is best"; re-run on the target device class before deciding a default.

## Mechanism validation

Each cell ran 12 × 6 N-values × 3 logCount sizes = 216 measured iterations on the **same bundle** (`dist/pkc2.html` rebuilt once before the sweep). Only `?pkc-flag=textlog.staged_render.initial_count=<N>` differed. This proves the flags mechanism works end-to-end for the PoC use-case articulated on 2026-05-03:

> 性能テストや POC、デバッグ、実行時多数パターンテスト検討のために動的変更

Future PoCs follow the same template: boot variant via URL flag, measure with `WARMUP + MEASURED` reps, record env, write a markdown table — never hard-code conclusions, always derive them from the table for the run at hand.
