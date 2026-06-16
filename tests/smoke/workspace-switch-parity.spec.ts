/**
 * #773 PR-WS-B2 — workspace switcher, end-to-end.
 *
 * Seeds a container, lets boot wrap it in a "Default" workspace, then
 * drives the Storage Profile "Workspaces" section: creates a new
 * workspace (with its own blank container), verifies container
 * isolation between workspaces, and switches back.
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedIdbContainer(page: Page, title: string): Promise<void> {
  await page.evaluate(async (entryTitle) => {
    const now = '2026-06-16T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'cid-default-ws', title: 'ws-parity', created_at: now, updated_at: now, schema_version: 1 },
      entries: [{ lid: 'e1', title: entryTitle, body: 'b', archetype: 'text', created_at: now, updated_at: now }],
      relations: [], revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, 'cid-default-ws');
        tx.objectStore('containers').put('cid-default-ws', '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, title);
}

async function openStorageProfile(page: Page): Promise<void> {
  await page.locator('[data-pkc-action="toggle-shell-menu"]').first().click();
  await page.locator('[data-pkc-action="show-storage-profile"]').first().click();
  await expect(page.locator('[data-pkc-region="workspace-switcher"]')).toBeVisible();
}

async function reloadVia(page: Page, action: () => Promise<void>): Promise<void> {
  await page.evaluate(() => { (window as unknown as { __preReload?: boolean }).__preReload = true; });
  await action();
  await page.waitForFunction(() => !(window as unknown as { __preReload?: boolean }).__preReload);
  await bootReady(page);
}

test('parity: workspace switcher creates, isolates containers, and switches', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedIdbContainer(page, 'DEFAULT-DOC');
  await page.reload();
  await bootReady(page);

  // boot wrapped the seeded container into a single "Default" workspace.
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('DEFAULT-DOC').first()).toBeVisible();
  await openStorageProfile(page);
  const ws = page.locator('[data-pkc-region="workspace-switcher"]');
  await expect(ws.locator('.pkc-workspace-switcher-row')).toHaveCount(1);
  await expect(ws.locator('.pkc-workspace-switcher-row[data-pkc-active]')).toBeVisible();

  // Create a new "Work" workspace (prompt → name) with its own blank container.
  await reloadVia(page, async () => {
    page.once('dialog', (d) => { void d.accept('Work'); });
    await page.locator('[data-pkc-action="new-workspace"]').click();
  });

  // Active workspace is now Work; its (blank) container does NOT show DEFAULT-DOC.
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('DEFAULT-DOC')).toHaveCount(0);
  await openStorageProfile(page);
  await expect(ws.locator('.pkc-workspace-switcher-row')).toHaveCount(2);
  await expect(ws.locator('.pkc-workspace-switcher-row[data-pkc-active]')).toContainText('Work');

  // Switch back to the Default workspace → its container (DEFAULT-DOC) returns.
  await reloadVia(page, () =>
    page.locator('[data-pkc-region="workspace-switcher"] [data-pkc-action="switch-workspace"]').first().click(),
  );
  await expect(page.locator('[data-pkc-region="entry-list"]').getByText('DEFAULT-DOC').first()).toBeVisible();
});
