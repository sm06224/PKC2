import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@adapter': resolve(__dirname, 'src/adapter'),
      '@features': resolve(__dirname, 'src/features'),
      '@runtime': resolve(__dirname, 'src/runtime'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // vitest 4 migration(2026-05-17):default は restoreMocks=false で
    // `vi.spyOn` の mock state が test 跨ぎで蓄積、`infoSpy.toHaveBeenCalled()`
    // 系 assertion が pollution で誤検知する。`restoreMocks: true` で各 test
    // 終了時に自動 restore、vitest 3 と等価な isolation を再現。
    restoreMocks: true,
    coverage: {
      // v8 instrumentation — Node-builtin, no external runtime
      // beyond `@vitest/coverage-v8` (added 2026-05-03 with the
      // adoption PR; baseline measured in
      // docs/development/test-strategy-audit-2026-05.md §1).
      provider: 'v8',
      include: ['src/**/*.ts'],
      // - tests/**/*.test.ts is excluded by `test.include`, but
      //   guard explicitly anyway in case stray files appear.
      // - src/main.ts is the boot wire-up; coverage from a Vitest
      //   run is structurally non-applicable.
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      reporter: ['text-summary', 'json-summary'],
      // Repo-wide minimum thresholds. Baseline (2026-05-03 / vitest 3) was
      // 84.95 stmt / 84.90 br / 89.72 fn / 84.95 ln.
      // **Re-baseline for vitest 4 / @vitest/coverage-v8 4**(2026-05-17):
      // vitest 4 + coverage-v8 4 の instrumentation 精度が向上、より多くの
      // code path(特に branch / function)を検出するようになり、同一 src
      // でも numerator/denominator が変化。実測値:76.95 stmt / 68.53 br /
      // 80.23 fn / 79.43 ln。policy「baseline - ~5pp」を vitest 4 値で再
      // 計算した floor を採用。test 8067 件 pass は不変、test coverage 自体
      // は劣化していない(instrumentation accuracy 改善のみ)。
      //
      // perFile is intentionally OFF: enabling it forces every
      // file (including 0%-by-design barrels like src/core/index.ts
      // and boot wiring src/adapter/index.ts) to hit the floor, so
      // the exemption list becomes large and brittle. Keeping the
      // gate at the repo level catches catastrophic regression
      // (-5 pp from baseline) without spurious failures from files
      // that unit tests structurally don't reach. Per-file rigor
      // is layered in via the parity-test methodology + R1-R7
      // regression rules (`test-strategy-audit-2026-05.md` §2).
      thresholds: {
        statements: 72,
        branches: 64,
        functions: 75,
        lines: 74,
      },
    },
  },
});
