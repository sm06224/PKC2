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
    setupFiles: ['tests/setup-globals.ts'],
    // vitest 4 bump 時に restoreMocks/clearMocks の default 動作が変わったため、
    // 旧 3.x の挙動(beforeEach で spyOn() を再 set すると古い記録が残る)を
    // 復帰するため明示。`vi.spyOn().mockImplementation()` で実装上書きしている
    // テストが、テスト間で per-spy call history を共有しないよう clearMocks ON。
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
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
      // Repo-wide minimum thresholds.
      //
      // 2026-06-06 recalibration (vitest 4 bump, #777/#778): the
      // coverage-v8 measurement basis changed between vitest 3 and 4
      // (same tests / same product code, branch coverage dropped
      // 84.9% → 68.5%). This is a measurement-basis shift, not a real
      // coverage regression — all 8083 tests still pass. Thresholds
      // are re-floored to ~2 pp below the vitest 4 actuals
      // (76.9 stmt / 68.5 br / 80.1 fn / 79.4 ln) so the gate keeps
      // blocking genuine regression on the new basis.
      // (Pre-bump baseline was 84.95 / 84.90 / 89.72 / 84.95.)
      //
      // perFile is intentionally OFF: enabling it forces every
      // file (including 0%-by-design barrels like src/core/index.ts
      // and boot wiring src/adapter/index.ts) to hit the floor, so
      // the exemption list becomes large and brittle. Keeping the
      // gate at the repo level catches catastrophic regression
      // without spurious failures from files that unit tests
      // structurally don't reach. Per-file rigor is layered in via
      // the parity-test methodology + R1-R7 regression rules
      // (`test-strategy-audit-2026-05.md` §2).
      thresholds: {
        statements: 75,
        branches: 66,
        functions: 78,
        lines: 77,
      },
    },
  },
});
