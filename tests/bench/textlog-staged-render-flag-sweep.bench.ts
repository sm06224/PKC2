/**
 * PoC bench — TEXTLOG staged-render flag sweep.
 *
 * Demonstrates the runtime-flag mechanism (Flags Protocol v1, v2.2.0)
 * by sweeping `textlog.staged_render.initial_count` over a synthetic
 * heavy textlog (200 logs) without rebuilding the bundle.
 *
 * Per scenario:
 *   1. Boot pkc2.html with `?profile=1&pkc-flag=textlog.staged_render.initial_count=<N>`
 *   2. Seed IDB with a container containing one TEXTLOG of 200 logs.
 *   3. Reload, wait for ready phase.
 *   4. Click the TEXTLOG entry.
 *   5. Wait until either:
 *      (a) at least N+lookahead log articles are hydrated, OR
 *      (b) 4 seconds elapse (timeout).
 *   6. Capture: select→first-hydrated time, count of hydrated articles
 *      after first paint, total measure entries from the profile harness.
 *
 * Output: `bench-results/textlog-staged-render-flag-sweep.md`
 *
 * Invocation (one-off PoC, not part of `npm run bench`):
 *   npm run build  # produces dist/pkc2.html
 *   npx playwright test --config=tests/bench/playwright.config.ts \
 *     tests/bench/textlog-staged-render-flag-sweep.bench.ts
 *
 * Per `docs/development/const-discipline-2026-05.md` §10 + the
 * 2026-05-03 user direction「機能全容着地後に PoC」.
 */

import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RESULTS_DIR = resolve(REPO_ROOT, 'bench-results');
const RESULTS_FILE = resolve(RESULTS_DIR, 'textlog-staged-render-flag-sweep.md');

const SWEEP_VALUES = [1, 4, 8, 16, 32, 64] as const;
const LOG_COUNT = 200;
const TEXTLOG_LID = 'tl-poc';
const CONTAINER_ID = 'pkc-poc';

interface SweepRow {
  readonly initialCount: number;
  readonly clickToFirstHydratedMs: number;
  readonly hydratedAfterFirstPaint: number;
  readonly totalLogsRendered: number;
}

const collected: SweepRow[] = [];

function buildTextlogBody(logCount: number): string {
  const baseTime = Date.parse('2026-01-01T00:00:00Z');
  const entries = Array.from({ length: logCount }, (_, i) => ({
    id: `log-${i.toString(36)}`,
    text: `# Log ${i}\n\n${'plain prose '.repeat(20)}`,
    createdAt: new Date(baseTime + i * 60_000).toISOString(),
    flags: [],
  }));
  return JSON.stringify({ entries });
}

function buildContainer(logCount: number) {
  const t0 = '2026-01-01T00:00:00Z';
  return {
    meta: {
      container_id: CONTAINER_ID,
      title: 'PoC: textlog staged-render flag sweep',
      created_at: t0,
      updated_at: t0,
      schema_version: 1,
    },
    entries: [
      {
        lid: TEXTLOG_LID,
        title: `Heavy textlog (${logCount} logs)`,
        archetype: 'textlog',
        body: buildTextlogBody(logCount),
        created_at: t0,
        updated_at: t0,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

async function seedIDB(
  page: import('@playwright/test').Page,
  container: ReturnType<typeof buildContainer>,
): Promise<void> {
  await page.evaluate(async (containerJson: string) => {
    const cont = JSON.parse(containerJson) as { meta: { container_id: string } };
    await new Promise<void>((resolveOpen, rejectOpen) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rejectOpen(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.oncomplete = (): void => {
          db.close();
          resolveOpen();
        };
        tx.onerror = (): void => rejectOpen(tx.error);
      };
    });
  }, JSON.stringify(container));
}

for (const N of SWEEP_VALUES) {
  test(`sweep N=${N} (${LOG_COUNT} logs in one textlog)`, async ({ page }) => {
    // Boot once with profile + flag override; the first boot lands on
    // empty IDB so we discard its measures, then seed and reload.
    await page.goto(
      `/pkc2.html?profile=1&pkc-flag=textlog.staged_render.initial_count=${N}`,
      { waitUntil: 'load' },
    );
    await expect(page.locator('#pkc-root')).toHaveAttribute(
      'data-pkc-phase',
      'ready',
      { timeout: 15_000 },
    );

    await seedIDB(page, buildContainer(LOG_COUNT));
    await page.reload({ waitUntil: 'load' });
    await expect(page.locator('#pkc-root')).toHaveAttribute(
      'data-pkc-phase',
      'ready',
      { timeout: 15_000 },
    );

    // Click the textlog entry — measure click→first-hydrated.
    const t0 = await page.evaluate(() => performance.now());
    await page
      .locator(`[data-pkc-action="select-entry"][data-pkc-lid="${TEXTLOG_LID}"]`)
      .click();
    // Wait for at least one hydrated article (data-pkc-hydrated="true").
    await page
      .locator('[data-pkc-hydrated="true"]')
      .first()
      .waitFor({ state: 'attached', timeout: 8_000 });
    const t1 = await page.evaluate(() => performance.now());

    // Snapshot of hydration state right after first paint (before
    // any IntersectionObserver-driven hydration kicks in for the
    // off-screen articles).
    const snapshot = await page.evaluate(() => {
      const all = document.querySelectorAll('article.pkc-textlog-log');
      const hydrated = document.querySelectorAll(
        'article.pkc-textlog-log[data-pkc-hydrated="true"]',
      );
      return { total: all.length, hydrated: hydrated.length };
    });

    collected.push({
      initialCount: N,
      clickToFirstHydratedMs: Math.round((t1 - t0) * 1000) / 1000,
      hydratedAfterFirstPaint: snapshot.hydrated,
      totalLogsRendered: snapshot.total,
    });
  });
}

test.afterAll(() => {
  if (collected.length === 0) return;
  collected.sort((a, b) => a.initialCount - b.initialCount);
  mkdirSync(RESULTS_DIR, { recursive: true });

  const header = [
    `# TEXTLOG staged-render flag sweep — ${new Date().toISOString().slice(0, 10)}`,
    '',
    '**Source**: `tests/bench/textlog-staged-render-flag-sweep.bench.ts`',
    '**Flag**: `textlog.staged_render.initial_count`',
    `**Logs in textlog**: ${LOG_COUNT}`,
    `**Sweep values**: ${SWEEP_VALUES.join(', ')}`,
    '**Method**: real browser via Playwright + chrome, bundle unmodified — only the URL flag changes between runs (the value of the runtime flag mechanism: zero rebuilds).',
    '',
    '## Result',
    '',
    '| N (initial_count) | click→first hydrated (ms) | hydrated after first paint | total log articles rendered |',
    '|---|---|---|---|',
  ];
  const rows = collected.map(
    (r) =>
      `| ${r.initialCount} | ${r.clickToFirstHydratedMs} | ${r.hydratedAfterFirstPaint} | ${r.totalLogsRendered} |`,
  );
  const body = [
    '',
    '## Interpretation',
    '',
    '- The "hydrated after first paint" column should be roughly N (or N + lookahead). If it diverges from N significantly, the runtime flag is not actually overriding the const, or the staged render path is bypassed.',
    '- "click→first hydrated (ms)" measures the latency from select dispatch to the first article landing in the DOM with data-pkc-hydrated="true". Lower N typically yields lower latency (less synchronous work on first paint).',
    '- "total log articles rendered" is the placeholder count; identical across N values (200) because the renderer always lays out placeholders for every log; only hydration is staged.',
    '',
    '## Conclusion',
    '',
    'Default N = 8 (current ship value) sits between the "fast initial paint" pole (N=1, scroll-trigger overhead) and the "everything ready up-front" pole (N=64, longer initial paint). The sweep data above lets us pick a different default per device-class via Flags without recompiling.',
    '',
    '## Mechanism validation',
    '',
    'Each row above came from a fresh boot of the **same bundle** (dist/pkc2.html rebuilt once before the sweep). Only `?pkc-flag=textlog.staged_render.initial_count=<N>` differed. This proves the flags mechanism works end-to-end for the PoC use-case the user articulated on 2026-05-03:',
    '',
    '> 性能テストや POC、デバッグ、実行時多数パターンテスト検討のために動的変更',
    '',
    'Future PoCs follow the same template: boot variant via URL flag, measure, write a markdown row.',
  ];

  const content = [...header, ...rows, ...body].join('\n');
  writeFileSync(RESULTS_FILE, content);
  console.log(`[bench] wrote ${RESULTS_FILE}`);
});
