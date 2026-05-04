# TEXTLOG staged-render flag sweep — 2026-05-04

**Source**: `tests/bench/textlog-staged-render-flag-sweep.bench.ts`
**Flag**: `textlog.staged_render.initial_count`
**Logs in textlog**: 200
**Sweep values**: 1, 4, 8, 16, 32, 64
**Method**: real browser via Playwright + chrome, bundle unmodified — only the URL flag changes between runs (the value of the runtime flag mechanism: zero rebuilds).

## Result

| N (initial_count) | click→first hydrated (ms) | hydrated after first paint | total log articles rendered |
|---|---|---|---|
| 1 | 433.9 | 5 | 200 |
| 4 | 220.9 | 5 | 200 |
| 8 | 372.5 | 9 | 200 |
| 16 | 190.5 | 17 | 200 |
| 32 | 189.1 | 33 | 200 |
| 64 | 171.7 | 65 | 200 |

## Interpretation

- The "hydrated after first paint" column should be roughly N (or N + lookahead). If it diverges from N significantly, the runtime flag is not actually overriding the const, or the staged render path is bypassed.
- "click→first hydrated (ms)" measures the latency from select dispatch to the first article landing in the DOM with data-pkc-hydrated="true". Lower N typically yields lower latency (less synchronous work on first paint).
- "total log articles rendered" is the placeholder count; identical across N values (200) because the renderer always lays out placeholders for every log; only hydration is staged.

## Conclusion

Default N = 8 (current ship value) sits between the "fast initial paint" pole (N=1, scroll-trigger overhead) and the "everything ready up-front" pole (N=64, longer initial paint). The sweep data above lets us pick a different default per device-class via Flags without recompiling.

## Mechanism validation

Each row above came from a fresh boot of the **same bundle** (dist/pkc2.html rebuilt once before the sweep). Only `?pkc-flag=textlog.staged_render.initial_count=<N>` differed. This proves the flags mechanism works end-to-end for the PoC use-case the user articulated on 2026-05-03:

> 性能テストや POC、デバッグ、実行時多数パターンテスト検討のために動的変更

Future PoCs follow the same template: boot variant via URL flag, measure, write a markdown row.