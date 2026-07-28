/**
 * #771 — OPFS storage backend, end-to-end on a real browser.
 *
 * Unit tests cover the chooser/migration logic with in-memory adapters.
 * This proves the REAL path: with `pkc2.storageBackend = 'opfs'`, boot
 * (`createConfiguredStoreFromEnv` in main.ts) actually
 *   (1) probes + selects OPFS (localhost = secure context),
 *   (2) migrates the existing IDB default container into OPFS once,
 *   (3) persists subsequent reloads from OPFS,
 * and that the bytes really land in `navigator.storage.getDirectory()`.
 *
 * The container is seeded directly into IDB (same pattern as the
 * extension smokes) so the test is deterministic — the create-entry UI
 * flow on the pkc-data-booted shell is intentionally avoided.
 *
 * OPFS needs a secure context — the smoke server is http://127.0.0.1
 * (localhost = secure), so OPFS is available in Chromium here. (From
 * file:// it is not; the app falls back to IDB — covered by the unit
 * fallback test, not reproducible in this harness.)
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedIdbContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = (cont as { meta: { container_id: string } }).meta;
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

/** Count files under the OPFS `containers` directory (proves bytes landed). */
async function opfsContainerFileCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('containers').catch(() => null);
    if (!dir) return 0;
    let n = 0;
    for await (const _ of dir.keys()) n++;
    return n;
  });
}

test('parity: storageBackend=opfs — IDB→OPFS migration + persistence', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // 1. Seed a container (with a distinctive entry) directly into IDB.
  const now = '2026-06-16T00:00:00.000Z';
  const title = `OPFS-SEED-${Date.now()}`;
  await seedIdbContainer(page, {
    meta: { container_id: 'cid-opfs-771', title: 'opfs-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'e1', title, body: 'persist me', archetype: 'text', created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  });

  // 2. Switch the backend preference to OPFS and reload → migration runs.
  await page.evaluate(() => localStorage.setItem('pkc2.storageBackend', 'opfs'));
  await page.reload();
  await bootReady(page);

  // 3. The seeded entry survived the switch (migrated IDB→OPFS, loaded from OPFS).
  await expect(
    page.locator('[data-pkc-region="entry-list"]').getByText(title).first(),
  ).toBeVisible();

  // 4. The bytes really landed in OPFS.
  expect(await opfsContainerFileCount(page)).toBeGreaterThan(0);

  // 5. Reload again — now served purely from OPFS (no migration), still there.
  await page.reload();
  await bootReady(page);
  await expect(
    page.locator('[data-pkc-region="entry-list"]').getByText(title).first(),
  ).toBeVisible();
});
