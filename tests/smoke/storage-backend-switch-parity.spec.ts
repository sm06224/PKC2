/**
 * #771 PR-3 — explicit storage-backend switch UI, end-to-end.
 *
 * Proves the user-facing path: open Storage Profile → pick the OPFS
 * backend → the app persists the preference, reloads, migrates the
 * existing IDB container into OPFS, and serves it from OPFS thereafter.
 *
 * Container is seeded directly into IDB for determinism (same pattern
 * as the other storage smokes). OPFS needs a secure context; the smoke
 * server is http://127.0.0.1 (localhost = secure), so OPFS works in
 * Chromium here.
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

async function openStorageProfile(page: Page): Promise<void> {
  await page.locator('[data-pkc-action="toggle-shell-menu"]').first().click();
  await page.locator('[data-pkc-action="show-storage-profile"]').first().click();
  await expect(page.locator('[data-pkc-region="storage-backend-selector"]')).toBeVisible();
}

test('parity: Storage Profile backend switch idb→opfs reloads + migrates', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-16T00:00:00.000Z';
  const title = `UI-SWITCH-${Date.now()}`;
  await seedIdbContainer(page, {
    meta: { container_id: 'cid-switch-771', title: 'switch-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'e1', title, body: 'switch me', archetype: 'text', created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  });

  // Open the selector — default backend is IDB (active).
  await openStorageProfile(page);
  const selector = page.locator('[data-pkc-region="storage-backend-selector"]');
  await expect(selector).toHaveAttribute('data-pkc-current-backend', 'idb');

  // Switch to OPFS → the handler reloads the page.
  await page.evaluate(() => { (window as unknown as { __preReload?: boolean }).__preReload = true; });
  await page.locator('[data-pkc-action="set-storage-backend"][data-pkc-backend="opfs"]').click();
  await page.waitForFunction(() => !(window as unknown as { __preReload?: boolean }).__preReload);
  await bootReady(page);

  // After reload: seeded container migrated to OPFS + loaded from it.
  await expect(
    page.locator('[data-pkc-region="entry-list"]').getByText(title).first(),
  ).toBeVisible();
  expect(await opfsContainerFileCount(page)).toBeGreaterThan(0);

  // The selector now reflects OPFS as the active backend.
  await openStorageProfile(page);
  await expect(
    page.locator('[data-pkc-region="storage-backend-selector"]'),
  ).toHaveAttribute('data-pkc-current-backend', 'opfs');
});
