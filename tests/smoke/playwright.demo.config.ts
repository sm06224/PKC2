/**
 * PKC2 — 視覚デモ用 Playwright config(user 提示スクショ収集)。
 *
 * smoke の parity config とは別に、`tests/smoke/_demo/*.spec.ts` だけを
 * 実行する。testDir を _demo に絞ることで通常 smoke(tests/smoke 直下)と
 * 混ざらない。ブラウザは resolve-pw-chromium.cjs が解決した
 * `PKC_PRE_INSTALLED_CHROMIUM` を executablePath に使う(バージョンズレ耐性)。
 *
 * 実行:
 *   eval "$(node scripts/resolve-pw-chromium.cjs --export)"
 *   npx playwright test --config=tests/smoke/playwright.demo.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '_demo',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  outputDir: '../../test-results/demo-artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1280, height: 900 },
    // resolve-pw-chromium.cjs が set した実バイナリを使う(version 紐付き
    // 解決を回避)。未 set でも Playwright 既定に落ちる。
    ...(process.env.PKC_PRE_INSTALLED_CHROMIUM && {
      launchOptions: { executablePath: process.env.PKC_PRE_INSTALLED_CHROMIUM },
    }),
  },
  webServer: {
    command: 'node ../../scripts/smoke-serve.cjs',
    url: 'http://127.0.0.1:4173/pkc2.html',
    reuseExistingServer: true,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
