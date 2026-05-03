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
      // Repo-wide minimum thresholds. Baseline (2026-05-03) was
      // 84.95 stmt / 84.90 br / 89.72 fn / 84.95 ln, so the floor
      // sits ~5 pp below to absorb natural churn while still
      // blocking a meaningful retreat.
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
        statements: 80,
        branches: 78,
        functions: 85,
        lines: 80,
      },
    },
  },
});
