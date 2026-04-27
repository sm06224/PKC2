/**
 * PR #176 — Profile bench runner config.
 *
 * Lives next to the spec under `tests/bench/` so the smoke config
 * (`tests/smoke/`) is left alone. Reuses the same in-repo http
 * server (`scripts/smoke-serve.cjs`) — same artefact, same port.
 *
 * Reporter is `list` plus a `json` reporter that the post-process
 * step (`build/scripts/bench-summarise.ts`) walks to produce the
 * findings table. Per-scenario perf measures are written by the
 * spec itself into `bench-results/<scenario>.json` so the JSON
 * reporter only carries the test-level pass/fail.
 */
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.bench\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  // Bench scenarios at 5000 entries can run several seconds —
  // give them headroom past the smoke 30 s default.
  timeout: 180_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    video: 'off',
  },
  webServer: {
    command: 'node ../../scripts/smoke-serve.cjs',
    url: 'http://127.0.0.1:4173/pkc2.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
