/**
 * #771 PR-4 — FSA (local folder) backend, end-to-end.
 *
 * Playwright can't drive the native directory picker, so we override
 * `window.showDirectoryPicker` to return a real `FileSystemDirectoryHandle`
 * sourced from OPFS (`getDirectory().getDirectoryHandle('fsa-folder')`).
 * That exercises the *actual* FSA code path — pick → persist handle →
 * reload → reconnect → migrate → serve — against genuine File System
 * Access handle semantics, just with the folder backed by OPFS instead
 * of a native directory.
 *
 * Verifies the user-facing flow: Storage Profile → "Local folder" →
 * the container migrates into the picked folder and persists across a
 * reload, with the selector reflecting the FSA backend.
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

/** Files under the picked folder's `containers` dir (OPFS-backed here). */
async function folderContainerFileCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const folder = await root.getDirectoryHandle('fsa-folder').catch(() => null);
    if (!folder) return 0;
    const dir = await folder.getDirectoryHandle('containers').catch(() => null);
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

test('parity: Storage Profile "Local folder" (FSA) picks + migrates + persists', async ({ page }) => {
  // Override the native picker BEFORE any load; applies across reloads.
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('fsa-folder', { create: true });
      };
  });

  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-16T00:00:00.000Z';
  const title = `FSA-SWITCH-${Date.now()}`;
  await seedIdbContainer(page, {
    meta: { container_id: 'cid-fsa-771', title: 'fsa-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [{ lid: 'e1', title, body: 'to a folder', archetype: 'text', created_at: now, updated_at: now }],
    relations: [], revisions: [], assets: {},
  });

  // Pick the local folder → handler persists the handle, sets pref, reloads.
  await openStorageProfile(page);
  await page.evaluate(() => { (window as unknown as { __preReload?: boolean }).__preReload = true; });
  await page.locator('[data-pkc-action="pick-storage-folder"][data-pkc-backend="fsa"]').click();
  await page.waitForFunction(() => !(window as unknown as { __preReload?: boolean }).__preReload);
  await bootReady(page);

  // After reload: seeded container migrated into the picked folder + loaded from it.
  await expect(
    page.locator('[data-pkc-region="entry-list"]').getByText(title).first(),
  ).toBeVisible();
  expect(await folderContainerFileCount(page)).toBeGreaterThan(0);

  // Selector reflects the FSA backend.
  await openStorageProfile(page);
  await expect(
    page.locator('[data-pkc-region="storage-backend-selector"]'),
  ).toHaveAttribute('data-pkc-current-backend', 'fsa');
});
