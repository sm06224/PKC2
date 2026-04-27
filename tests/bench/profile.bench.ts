/**
 * PR #176 — profile bench runner.
 *
 * Two-phase boot to dodge the addInitScript / main.ts IDB-read
 * race that the first attempt hit:
 *
 *   1. Navigate to `/pkc2.html` once with `?profile=1` so the
 *      runtime/profile harness activates. The first boot lands on
 *      an empty IDB → empty container → cheap render (we discard
 *      its measures).
 *   2. `page.evaluate(...)` seeds IDB with the synthetic container.
 *      Because the seed is awaited inside the same evaluate, by
 *      the time it resolves the data is durably present.
 *   3. `page.reload()` re-runs main.ts, which now reads the seeded
 *      container. THIS boot is the one we measure for cold-boot.
 *   4. Subsequent scenarios (search / archetype / select) clear
 *      perf entries and drive their own UI gestures.
 *
 * Why URL `?profile=1` instead of an init-script global: init
 * scripts run before main.ts but the profile gate is read inside
 * each profile call, so timing is fine — but the URL flag has
 * the same effect with no script injection. Simpler.
 */

import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURE_DIR = resolve(REPO_ROOT, 'bench-fixtures');
const RESULTS_DIR = resolve(REPO_ROOT, 'bench-results');

interface BenchScale {
  readonly name: string;
  readonly fixture: string;
  readonly entries: number;
}

const SCALES: readonly BenchScale[] = [
  { name: 'c-100', fixture: 'c-100.json', entries: 100 },
  { name: 'c-500', fixture: 'c-500.json', entries: 500 },
  { name: 'c-1000', fixture: 'c-1000.json', entries: 1000 },
  { name: 'c-5000', fixture: 'c-5000.json', entries: 5000 },
];

interface ProfileEntry {
  readonly name: string;
  readonly startTime: number;
  readonly duration: number;
}

interface ScenarioResult {
  readonly scale: string;
  readonly entries: number;
  readonly scenario: string;
  readonly bootElapsedMs: number;
  readonly heapUsedMb: number | null;
  readonly measures: readonly ProfileEntry[];
  readonly capturedAt: string;
}

function loadFixture(name: string): string {
  const path = resolve(FIXTURE_DIR, name);
  if (!existsSync(path)) {
    throw new Error(
      `[bench] fixture ${name} missing — run `
      + `\`npm run bench:fixtures\` first`,
    );
  }
  return readFileSync(path, 'utf-8');
}

function writeResult(result: ScenarioResult): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const path = resolve(RESULTS_DIR, `${result.scale}-${result.scenario}.json`);
  writeFileSync(path, JSON.stringify(result, null, 2));
}

/**
 * Seed IDB with a synthetic container. The previous boot's IDB
 * connection is still open in this page, so `deleteDatabase` would
 * deadlock on `onblocked`. Instead we open the existing DB, `clear()`
 * each store inside one transaction, then write the fresh data. Schema
 * mirrors `src/adapter/platform/idb-store.ts` (db `pkc2` v2, stores
 * `containers` / `assets`, asset key = `<cid>:<asset_key>`).
 */
async function seedIDB(
  page: import('@playwright/test').Page,
  containerJson: string,
): Promise<void> {
  await page.evaluate(async (raw) => {
    interface SeededContainer {
      meta: { container_id: string };
      assets?: Record<string, string>;
    }
    const container = JSON.parse(raw) as SeededContainer;
    const cid = container.meta.container_id;
    const containerWithoutAssets = { ...container, assets: {} };
    const assetMap: Record<string, string> = container.assets ?? {};

    // Open existing DB at the live schema version. We deliberately
    // do NOT delete-then-recreate because main.ts is still holding a
    // connection — the deletion would block.
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('containers')) d.createObjectStore('containers');
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets');
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });

    // Wipe + write inside one transaction so the boot reload always
    // sees a consistent state.
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(['containers', 'assets'], 'readwrite');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      const containers = tx.objectStore('containers');
      const assets = tx.objectStore('assets');
      containers.clear();
      assets.clear();
      containers.put(containerWithoutAssets, cid);
      containers.put(cid, '__default__');
      for (const k of Object.keys(assetMap)) {
        assets.put(assetMap[k]!, `${cid}:${k}`);
      }
    });
    db.close();
  }, containerJson);
}

async function dumpProfile(page: import('@playwright/test').Page): Promise<{
  measures: ProfileEntry[];
  bootElapsedMs: number;
  heapUsedMb: number | null;
}> {
  return await page.evaluate(() => {
    const measures = performance.getEntriesByType('measure').map((e) => ({
      name: e.name,
      startTime: e.startTime,
      duration: e.duration,
    }));
    const enterMark = performance.getEntriesByName('boot:enter', 'mark')[0];
    const exitMark = performance.getEntriesByName('boot:exit', 'mark')[0];
    const bootElapsedMs = enterMark && exitMark ? exitMark.startTime - enterMark.startTime : -1;
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const heapUsedMb = m ? +(m.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null;
    return { measures, bootElapsedMs, heapUsedMb };
  });
}

async function clearPerf(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });
}

async function waitForBoot(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 60_000 });
  await page.waitForFunction(
    () => performance.getEntriesByName('boot:exit', 'mark').length > 0,
    { timeout: 60_000 },
  );
}

/**
 * Two-phase setup: empty boot (cheap), seed IDB, reload, wait for
 * populated boot. Returns AFTER the populated boot finishes so each
 * scenario starts from a clean settled state.
 */
async function setupScenario(
  page: import('@playwright/test').Page,
  scale: BenchScale,
): Promise<void> {
  await page.goto('/pkc2.html?profile=1');
  await waitForBoot(page);
  await seedIDB(page, loadFixture(scale.fixture));
  await page.reload();
  await waitForBoot(page);
}

for (const scale of SCALES) {
  test.describe(`profile bench — ${scale.name} (${scale.entries} entries)`, () => {
    test('cold boot: load fixture from IDB → first render', async ({ page }) => {
      await page.goto('/pkc2.html?profile=1');
      await waitForBoot(page);
      await seedIDB(page, loadFixture(scale.fixture));
      // Discard the empty-boot perf entries — only the next reload
      // matters as the cold-boot measurement.
      await clearPerf(page);
      await page.reload();
      await waitForBoot(page);
      const dump = await dumpProfile(page);
      expect(dump.bootElapsedMs).toBeGreaterThan(0);
      writeResult({
        scale: scale.name,
        entries: scale.entries,
        scenario: 'cold-boot',
        ...dump,
        capturedAt: new Date().toISOString(),
      });
    });

    test('search keystroke: type "meet" into sidebar search', async ({ page }) => {
      await setupScenario(page, scale);
      await clearPerf(page);
      const search = page.locator('[data-pkc-field="search"]').first();
      await search.click();
      for (const ch of 'meet') {
        await search.press(ch);
      }
      await page.waitForTimeout(50);
      const dump = await dumpProfile(page);
      writeResult({
        scale: scale.name,
        entries: scale.entries,
        scenario: 'search-keystroke',
        ...dump,
        capturedAt: new Date().toISOString(),
      });
    });

    test('archetype filter toggle: click attachment chip', async ({ page }) => {
      await setupScenario(page, scale);
      await clearPerf(page);
      const chip = page
        .locator('[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="attachment"]')
        .first();
      if (await chip.count()) {
        await chip.click();
        await page.waitForTimeout(50);
      }
      const dump = await dumpProfile(page);
      writeResult({
        scale: scale.name,
        entries: scale.entries,
        scenario: 'archetype-toggle',
        ...dump,
        capturedAt: new Date().toISOString(),
      });
    });

    test('select entry: click a sidebar row', async ({ page }) => {
      await setupScenario(page, scale);
      await clearPerf(page);
      const firstRow = page
        .locator('.pkc-entry-list li.pkc-entry-item[data-pkc-lid]')
        .first();
      if (await firstRow.count()) {
        await firstRow.click();
        await page.waitForTimeout(50);
      }
      const dump = await dumpProfile(page);
      writeResult({
        scale: scale.name,
        entries: scale.entries,
        scenario: 'select-entry',
        ...dump,
        capturedAt: new Date().toISOString(),
      });
    });
  });
}
