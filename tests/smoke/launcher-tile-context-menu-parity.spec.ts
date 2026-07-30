/**
 * #938 R4 — launcher タイル右クリック menu の visual parity。
 * hover-only 操作の代替導線が実ブラウザの実マウス右クリックで機能すること。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-20T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'ctx-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [{
        lid: 'app1', title: 'My App', archetype: 'attachment',
        body: JSON.stringify({ name: 'a.html', mime: 'text/html', asset_key: 'k1', registered_as_app: true }),
        created_at: now, updated_at: now,
      }],
      relations: [], revisions: [], assets: { k1: btoa('<h1>x</h1>') },
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.objectStore('assets').put(btoa('<h1>x</h1>'), 'ctx-parity:k1');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: タイル右クリック → menu → ⓘ で詳細へ', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  await page.locator('.pkc-launcher-tile[data-pkc-lid="app1"]').click({ button: 'right' });
  const menu = page.locator('[data-pkc-region="context-menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-pkc-action="launcher-set-group"]')).toBeVisible();
  await menu.locator('[data-pkc-action="launcher-open-detail"]').click();
  await expect(menu).toHaveCount(0);
  // detail view で app1 が選択されている(sidebar の selected 行で観測)
  await expect(
    page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="app1"][data-pkc-selected="true"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/launcher-tile-context-menu-parity.png' });
});
