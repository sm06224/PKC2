/**
 * #935 — launcher「未登録の HTML 添付」section の visual parity。
 * 実マウスで 📌(1-click 登録)を押し、タイルが通常 grid へ移り、
 * reload 後も登録が残る(保存的 patch で IDB へ永続化)ことを検証。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-20T00:00:00.000Z';
    const html = btoa('<h1>x</h1>');
    const att = (lid: string, title: string, body: Record<string, unknown>): Record<string, unknown> => ({
      lid, title, archetype: 'attachment', body: JSON.stringify(body), created_at: now, updated_at: now,
    });
    const cont = {
      meta: { container_id: 'unreg-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        att('reg', 'Registered', { name: 'r.html', mime: 'text/html', asset_key: 'k-r', registered_as_app: true }),
        att('unreg', 'Plain HTML', { name: 'u.html', mime: 'text/html', asset_key: 'k-u', custom_field: 'keep' }),
      ],
      relations: [], revisions: [], assets: { 'k-r': html, 'k-u': html },
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
        tx.objectStore('assets').put(html, 'unreg-parity:k-r');
        tx.objectStore('assets').put(html, 'unreg-parity:k-u');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: 未登録 HTML がランチャーに並び、📌 で登録して reload 後も残る', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  // 未登録 section にタイルが見えている
  const sec = page.locator('[data-pkc-region="launcher-grid-unregistered"]');
  await expect(sec.locator('.pkc-launcher-tile[data-pkc-lid="unreg"]')).toBeVisible();

  // hover で 📌 が現れ、実マウスで click
  const wrap = sec.locator('.pkc-launcher-tile-wrap');
  await wrap.hover();
  const pin = page.locator('[data-pkc-action="launcher-register-tile"][data-pkc-lid="unreg"]');
  await expect(pin).toBeVisible();
  await pin.click();

  // 通常 grid へ移り、未登録 section は消える
  await expect(page.locator('[data-pkc-region="launcher-grid"] .pkc-launcher-tile[data-pkc-lid="unreg"]')).toBeVisible();
  await expect(page.locator('[data-pkc-region="launcher-grid-unregistered"]')).toHaveCount(0);

  // debounce save を待って reload → 登録が残る(永続化 parity)
  await page.waitForTimeout(800);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);
  await expect(page.locator('[data-pkc-region="launcher-grid"] .pkc-launcher-tile[data-pkc-lid="unreg"]')).toBeVisible();
  await expect(page.locator('[data-pkc-region="launcher-grid-unregistered"]')).toHaveCount(0);

  await page.screenshot({ path: 'test-results/launcher-unregistered-parity.png' });
});
