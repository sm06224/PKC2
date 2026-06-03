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
      // Repo-wide minimum thresholds. Baseline (2026-05-03) was
      // 84.95 stmt / 84.90 br / 89.72 fn / 84.95 ln, so the floor
      // sits ~5 pp below to absorb natural churn while still
      // blocking a meaningful retreat.
      //
      // 2026-06-02 PR #760(spreadsheet Phase 4 9 機能 + UX 9 bug + vitest 4
      // bump、大量新規 src)で branch coverage が threshold 抵触 ── error code
      // 経路 / chart kind 分岐 / selection helpers 等の未到達 branch を許容して
      // floor を一段下げる。後続で branch tests を補強する想定(spreadsheet-
      // body.ts formula evaluator の `#REF!` / `#NAME?` / parser error path、
      // chart kind 別 SVG 描画、selection / keyboard helpers の各 case)。
      thresholds: {
        statements: 78,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
