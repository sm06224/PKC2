/**
 * PoC bench — TEXTLOG staged-render flag sweep.
 *
 * Demonstrates the runtime-flag mechanism (Flags Protocol v1, v2.2.0)
 * by sweeping `textlog.staged_render.initial_count` over synthetic
 * textlogs of varying size without rebuilding the bundle.
 *
 * Method (rev. 2026-05-04, after the「条件揃え不十分」review):
 *   - Sweep `initial_count` ∈ {1, 4, 8, 16, 32, 64}.
 *   - Sweep textlog size ∈ {50, 200, 1000} logs, so the flag's
 *     effect can be read across content sizes (small /default-ish/
 *     large).
 *   - Per (N, logCount) cell:
 *       * 2 warmup reloads (discarded — JIT / GC / IDB cache warm-up).
 *       * 12 measured reloads.
 *       * Each measured iteration does: page.reload → wait ready →
 *         click textlog → wait until first article shows
 *         data-pkc-hydrated="true" → record performance.now() delta.
 *   - Aggregate: median, p25, p75, min, max for `clickToFirstHydratedMs`.
 *     Median + IQR is more robust than mean ± stddev for cold-cache /
 *     GC-noisy browser timings.
 *
 * Output: `bench-results/textlog-staged-render-flag-sweep.md`
 *
 * Invocation:
 *   npm run build  # produces dist/pkc2.html
 *   npx playwright test --config=tests/bench/playwright.config.ts \
 *     tests/bench/textlog-staged-render-flag-sweep.bench.ts
 *
 * Per `docs/development/const-discipline-2026-05.md` §10 + the
 * 2026-05-03 user direction「機能全容着地後に PoC」 + the 2026-05-04
 * 「条件揃え + pass 数」review (pass=1 → pass=12 + warmup, single
 * size → 3 sizes).
 */

import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RESULTS_DIR = resolve(REPO_ROOT, 'bench-results');
const RESULTS_FILE = resolve(RESULTS_DIR, 'textlog-staged-render-flag-sweep.md');

const SWEEP_VALUES = [1, 4, 8, 16, 32, 64] as const;
const LOG_COUNTS = [50, 200, 1000] as const;
const WARMUP_REPS = 2;
const MEASURED_REPS = 12;

const TEXTLOG_LID = 'tl-poc';
const CONTAINER_ID = 'pkc-poc';

interface SweepRow {
  readonly initialCount: number;
  readonly logCount: number;
  readonly samplesMs: number[];
  readonly hydratedAfterFirstPaint: number;
  readonly totalLogsRendered: number;
}

const collected: SweepRow[] = [];
let browserMeta: { name: string; version: string } | null = null;

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
        // The IDB store keys by `__default__` → container_id pointer.
        // Without this, `loadDefault()` returns null and boot falls
        // back to the embedded pkc-data (empty container) — the
        // textlog never appears and each sweep test times out.
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => {
          db.close();
          resolveOpen();
        };
        tx.onerror = (): void => rejectOpen(tx.error);
      };
    });
  }, JSON.stringify(container));
}

function pct(samples: number[], p: number): number {
  if (samples.length === 0) return NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  // Linear interpolation between closest ranks (R-7).
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function fmt(n: number): string {
  return Math.round(n * 10) / 10 + '';
}

test('capture-environment', async ({ browser }) => {
  // Browser version comes from the live Playwright instance — single
  // source of truth, no version-string parsing of the binary path.
  browserMeta = {
    name: browser.browserType().name(),
    version: browser.version(),
  };
});

for (const logCount of LOG_COUNTS) {
  for (const N of SWEEP_VALUES) {
    test(`sweep N=${N} logs=${logCount}`, async ({ page }) => {
      // Initial boot: lands on empty IDB (we discard).
      await page.goto(
        `/pkc2.html?profile=1&pkc-flag=textlog.staged_render.initial_count=${N}`,
        { waitUntil: 'load' },
      );
      await expect(page.locator('#pkc-root')).toHaveAttribute(
        'data-pkc-phase',
        'ready',
        { timeout: 15_000 },
      );

      // Seed once; subsequent reloads re-read from IDB (no re-seed
      // needed because the container is unchanged across reps).
      await seedIDB(page, buildContainer(logCount));

      const samples: number[] = [];
      let hydratedSnapshot = 0;
      let totalSnapshot = 0;

      const totalReps = WARMUP_REPS + MEASURED_REPS;
      for (let rep = 0; rep < totalReps; rep++) {
        // Reload to get a fresh `selectedLid = null` + fresh DOM.
        await page.reload({ waitUntil: 'load' });
        await expect(page.locator('#pkc-root')).toHaveAttribute(
          'data-pkc-phase',
          'ready',
          { timeout: 15_000 },
        );

        // Measure click → first-hydrated.
        const t0 = await page.evaluate(() => performance.now());
        await page
          .locator(`[data-pkc-action="select-entry"][data-pkc-lid="${TEXTLOG_LID}"]`)
          .click();
        await page
          .locator('[data-pkc-hydrated="true"]')
          .first()
          .waitFor({ state: 'attached', timeout: 8_000 });
        const t1 = await page.evaluate(() => performance.now());

        if (rep >= WARMUP_REPS) {
          samples.push(Math.round((t1 - t0) * 1000) / 1000);
        }

        // Capture hydration snapshot from the first measured rep.
        if (rep === WARMUP_REPS) {
          const snap = await page.evaluate(() => {
            const all = document.querySelectorAll('article.pkc-textlog-log');
            const hydrated = document.querySelectorAll(
              'article.pkc-textlog-log[data-pkc-hydrated="true"]',
            );
            return { total: all.length, hydrated: hydrated.length };
          });
          hydratedSnapshot = snap.hydrated;
          totalSnapshot = snap.total;
        }
      }

      collected.push({
        initialCount: N,
        logCount,
        samplesMs: samples,
        hydratedAfterFirstPaint: hydratedSnapshot,
        totalLogsRendered: totalSnapshot,
      });
    });
  }
}

test.afterAll(() => {
  if (collected.length === 0) return;
  collected.sort((a, b) =>
    a.logCount !== b.logCount
      ? a.logCount - b.logCount
      : a.initialCount - b.initialCount,
  );
  mkdirSync(RESULTS_DIR, { recursive: true });

  // ── Environment capture ─────────────────────────────────────────
  // Bench timings are device-bound; record the host so future runs
  // can be compared against the same baseline (or annotate divergence).
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model?.trim() ?? 'unknown';
  const cpuCount = cpus.length;
  // `os.cpus()[0].speed` is unreliable in container / sandbox runtimes
  // (often 0 under docker / WSL / cgroup-throttled hosts). Show only
  // when nonzero — the model string already encodes the nominal speed
  // for most server-class chips ("Xeon @ 2.10GHz") so dropping it does
  // not lose information.
  const cpuSpeedMHz = cpus[0]?.speed ?? 0;
  const cpuSpeedNote =
    cpuSpeedMHz > 0 ? `, nominal ${cpuSpeedMHz} MHz` : '';
  const totalMemGiB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const nodeVersion = process.version;
  const browserName = browserMeta?.name ?? 'unknown';
  const browserVersion = browserMeta?.version ?? 'unknown';

  const lines: string[] = [
    `# TEXTLOG staged-render flag sweep — ${new Date().toISOString().slice(0, 10)}`,
    '',
    '**Source**: `tests/bench/textlog-staged-render-flag-sweep.bench.ts`',
    '**Flag**: `textlog.staged_render.initial_count`',
    `**Sweep N**: ${SWEEP_VALUES.join(', ')}`,
    `**Sweep logs**: ${LOG_COUNTS.join(', ')}`,
    `**Warmup / measured per cell**: ${WARMUP_REPS} / ${MEASURED_REPS}`,
    '**Method**: real browser via Playwright + chromium, bundle unmodified — only the URL flag changes between runs (the value of the runtime flag mechanism: zero rebuilds). Each cell reloads the page `WARMUP + MEASURED` times; warmup samples are discarded (JIT / GC / IDB cache warm-up). Median + IQR (p25 / p75) reported because cold-cache browser timings are right-skewed and noisy — mean ± stddev would over-weight transient outliers.',
    '',
    '## Environment',
    '',
    '| key | value |',
    '|---|---|',
    `| **CPU** | ${cpuModel} |`,
    `| **CPU cores** | ${cpuCount} (logical)${cpuSpeedNote} |`,
    `| **Memory** | ${totalMemGiB} GiB |`,
    `| **Architecture** | ${arch} |`,
    `| **OS** | ${platform} ${release} |`,
    `| **Node.js** | ${nodeVersion} |`,
    `| **Browser** | ${browserName} ${browserVersion} |`,
    `| **Bench timestamp** | ${new Date().toISOString()} |`,
    '',
    'Timings are tied to this hardware / software stack. To compare a future run, re-run the bench on the same host (or note delta vs this baseline).',
    '',
    '## Result',
    '',
    '| logs | N (initial_count) | hydrated 1st paint | min | p25 | **median** | p75 | max | n |',
    '|---|---|---|---|---|---|---|---|---|',
  ];

  for (const r of collected) {
    const min = Math.min(...r.samplesMs);
    const max = Math.max(...r.samplesMs);
    const p25 = pct(r.samplesMs, 25);
    const p50 = pct(r.samplesMs, 50);
    const p75 = pct(r.samplesMs, 75);
    lines.push(
      `| ${r.logCount} | ${r.initialCount} | ${r.hydratedAfterFirstPaint} | ${fmt(min)} | ${fmt(p25)} | **${fmt(p50)}** | ${fmt(p75)} | ${fmt(max)} | ${r.samplesMs.length} |`,
    );
  }

  lines.push(
    '',
    '## How to read the table',
    '',
    '- **`hydrated 1st paint`**: the count of articles with `data-pkc-hydrated="true"` at the moment the *first* `data-pkc-hydrated="true"` is observed by `locator.waitFor`. This is **not** strictly N — by snapshot time the lookahead loop (`textlog.staged_render.lookahead`, default 4) has typically promoted a few placeholders, and the IntersectionObserver may have promoted on-screen ones too. Treat this column as a sanity gate: if it stays around N for small N and around `logCount` for large N, the flag is wired through.',
    '- **`median (ms)`** is the headline number per cell. It is the click→first-hydrated latency in milliseconds. Lower is faster.',
    '- **`IQR = p75 − p25`** is the spread within the 12 measured samples. Narrow IQR = stable timing; wide IQR = the cell is sensitive to GC / IDB / layout jitter.',
    '- The relationship between N and median latency is **non-monotonic** in real browser timings — small N pays scroll-trigger / lookahead overhead, large N pays synchronous-render-on-click cost, and the sweet spot moves with `logCount`. Do **not** generalize a single run to "N=K is best"; re-run on the target device class before deciding a default.',
    '',
    '## Mechanism validation',
    '',
    `Each cell ran ${MEASURED_REPS} × ${SWEEP_VALUES.length} N-values × ${LOG_COUNTS.length} logCount sizes = ${MEASURED_REPS * SWEEP_VALUES.length * LOG_COUNTS.length} measured iterations on the **same bundle** (\`dist/pkc2.html\` rebuilt once before the sweep). Only \`?pkc-flag=textlog.staged_render.initial_count=<N>\` differed. This proves the flags mechanism works end-to-end for the PoC use-case articulated on 2026-05-03:`,
    '',
    '> 性能テストや POC、デバッグ、実行時多数パターンテスト検討のために動的変更',
    '',
    'Future PoCs follow the same template: boot variant via URL flag, measure with `WARMUP + MEASURED` reps, record env, write a markdown table — never hard-code conclusions, always derive them from the table for the run at hand.',
  );

  const content = lines.join('\n');
  writeFileSync(RESULTS_FILE, content + '\n');
  console.log(`[bench] wrote ${RESULTS_FILE}`);
});
