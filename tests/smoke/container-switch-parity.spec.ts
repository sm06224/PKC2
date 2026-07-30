/**
 * #771/#773 MVP — same-origin container switcher, end-to-end.
 *
 * Seeds TWO containers into IDB, then drives the Storage Profile
 * "Containers" section: lists both, switches the active one (reload),
 * and creates a new blank container (reload). Verifies the active
 * container's entries follow the switch.
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedTwoContainers(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-06-16T00:00:00.000Z';
    const mk = (id: string, title: string, entryTitle: string) => ({
      meta: { container_id: id, title, created_at: now, updated_at: now, schema_version: 1 },
      entries: [{ lid: 'e1', title: entryTitle, body: 'b', archetype: 'text', created_at: now, updated_at: now }],
      relations: [], revisions: [], assets: {},
    });
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        const cs = tx.objectStore('containers');
        cs.clear();
        tx.objectStore('assets').clear();
        cs.put(mk('cid-alpha', 'Alpha', 'ALPHA-ENTRY'), 'cid-alpha');
        cs.put(mk('cid-beta', 'Beta', 'BETA-ENTRY'), 'cid-beta');
        cs.put('cid-alpha', '__default__'); // Alpha active
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

async function openStorageProfile(page: Page): Promise<void> {
  await page.locator('[data-pkc-action="toggle-shell-menu"]').first().click();
  await page.locator('[data-pkc-action="show-storage-profile"]').first().click();
  await expect(page.locator('[data-pkc-region="container-switcher"]')).toBeVisible();
}

async function reloadVia(page: Page, action: () => Promise<void>): Promise<void> {
  await page.evaluate(() => { (window as unknown as { __preReload?: boolean }).__preReload = true; });
  await action();
  await page.waitForFunction(() => !(window as unknown as { __preReload?: boolean }).__preReload);
  await bootReady(page);
}

test('parity: container switcher lists, switches, and creates', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedTwoContainers(page);
  await page.reload();
  await bootReady(page);

  // Active = Alpha; its entry shows.
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('ALPHA-ENTRY').first()).toBeVisible();

  // Switcher lists both; Alpha is active.
  await openStorageProfile(page);
  const switcher = page.locator('[data-pkc-region="container-switcher"]');
  await expect(switcher).toHaveAttribute('data-pkc-active-container', 'cid-alpha');
  await expect(switcher.locator('.pkc-container-switcher-row[data-pkc-cid="cid-alpha"]')).toBeVisible();
  await expect(switcher.locator('.pkc-container-switcher-row[data-pkc-cid="cid-beta"]')).toBeVisible();

  // Switch to Beta → reload → Beta's entry shows.
  await reloadVia(page, () =>
    page.locator('[data-pkc-action="switch-container"][data-pkc-cid="cid-beta"]').click(),
  );
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('BETA-ENTRY').first()).toBeVisible();
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('ALPHA-ENTRY')).toHaveCount(0);

  // Create a new (blank) container → reload → switcher now lists 3 rows.
  await openStorageProfile(page);
  await expect(switcher).toHaveAttribute('data-pkc-active-container', 'cid-beta');
  await reloadVia(page, () => page.locator('[data-pkc-action="new-container"]').click());
  await openStorageProfile(page);
  await expect(switcher.locator('.pkc-container-switcher-row')).toHaveCount(3);
});

test('parity: container switcher deletes a non-active container', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedTwoContainers(page); // Alpha (active) + Beta
  await page.reload();
  await bootReady(page);

  await openStorageProfile(page);
  const switcher = page.locator('[data-pkc-region="container-switcher"]');
  await expect(switcher.locator('.pkc-container-switcher-row')).toHaveCount(2);

  // delete-container fires a confirm() — auto-accept it.
  page.on('dialog', (d) => { void d.accept(); });
  await reloadVia(page, () =>
    page.locator('[data-pkc-action="delete-container"][data-pkc-cid="cid-beta"]').click(),
  );

  // Beta is gone; Alpha (active) remains.
  await openStorageProfile(page);
  await expect(switcher.locator('.pkc-container-switcher-row')).toHaveCount(1);
  await expect(switcher.locator('.pkc-container-switcher-row[data-pkc-cid="cid-alpha"]')).toBeVisible();
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('ALPHA-ENTRY').first()).toBeVisible();
});
