/**
 * PKC2 — Playwright smoke baseline (Tier 3-2).
 *
 * Scope: **one** smoke test proving the single-HTML artifact
 * (dist/pkc2.html) boots, accepts user input, and persists into
 * IndexedDB via the normal reducer path. Broader E2E (multi-select,
 * kanban, import/export) is intentionally deferred (TIER3_PRIORITIZATION.md
 * — C-3 lives in Tier 3-3 or later).
 *
 * Decisions (Tier 3-2):
 *   - testDir: `tests/smoke/` so the smoke tree does NOT collide
 *     with the vitest suites under `tests/core/` / `tests/features/`
 *     / `tests/adapter/` (vitest auto-excludes `tests/smoke/*.spec.ts`).
 *   - Browser: chromium only. Single-HTML is the deliverable;
 *     cross-browser will be revisited when an actual cross-browser
 *     bug surfaces.
 *   - URL: served via a static http server started by webServer
 *     (http://127.0.0.1:4173/pkc2.html). file:// was considered but
 *     some Chromium builds block IndexedDB on file://; http
 *     guarantees consistent behaviour.
 *   - Retries: 1 on CI, 0 locally. Baseline flakiness should be
 *     diagnosed, not retried away, but one transient webServer-ready
 *     retry guards against cold-start races.
 *   - Reporter: list. No HTML report artifact to keep CI slim.
 */

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list']],
  timeout: 30_000,

  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    // Serve the built single-HTML via Node's built-in http module.
    // Tried `npx http-server dist -p 4173` but observed 404 on
    // Playwright's readiness probe — http-server's port hand-off
    // seems to race with Playwright's port check when both are on
    // 127.0.0.1. A tiny in-repo server (scripts/smoke-serve.cjs)
    // is deterministic: starts synchronously, listens, then replies
    // with the file content.
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
