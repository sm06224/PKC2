/**
 * #938 R7 — inline dialog(native prompt/confirm 置換)の visual parity。
 * 実ブラウザの実マウスで:launcher タイル右クリック → 🏷 グループ設定 →
 * inline dialog が視認可能な位置に出現 → 実キーボード入力 + 実クリックで
 * OK → app_group が保存されグループ見出しが描画されること。
 * (native prompt は Playwright では dialog event でしか扱えない = 置換の
 *  成立自体が実ブラウザで観測可能)
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-20T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'dlg-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [{
        lid: 'app1', title: 'My App', archetype: 'attachment',
        body: JSON.stringify({ name: 'a.html', mime: 'text/html', asset_key: 'k1', registered_as_app: true }),
        created_at: now, updated_at: now,
      }],
      relations: [], revisions: [], assets: { k1: btoa('<h1>x</h1>') },
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.objectStore('assets').put(btoa('<h1>x</h1>'), 'dlg-parity:k1');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: 右クリック → 🏷 → inline dialog へ実入力 → グループ保存', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  await page.locator('.pkc-launcher-tile[data-pkc-lid="app1"]').click({ button: 'right' });
  const menu = page.locator('[data-pkc-region="context-menu"]');
  await expect(menu).toBeVisible();
  await menu.locator('[data-pkc-action="launcher-set-group"]').click();

  // inline dialog が出現し、input が elementFromPoint で実際にクリック可能
  // (= 他要素に隠れていない)ことを確認する。
  const dialog = page.locator('[data-pkc-region="inline-dialog"]');
  await expect(dialog).toBeVisible();
  const inputBox = await dialog.locator('[data-pkc-field="dialog-value"]').boundingBox();
  expect(inputBox).not.toBeNull();
  const hitTag = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.getAttribute('data-pkc-field') ?? null,
    [inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2],
  );
  expect(hitTag).toBe('dialog-value');

  // 実マウス click + 実キーボード入力 + OK click
  await page.mouse.click(inputBox!.x + inputBox!.width / 2, inputBox!.y + inputBox!.height / 2);
  await page.keyboard.type('Tools');
  await dialog.locator('[data-pkc-action="dialog-ok"]').click();
  await expect(dialog).toHaveCount(0);

  // グループ見出しが描画され、タイルが Tools グリッドに移っている
  await expect(page.locator('[data-pkc-region="launcher-group-title"]', { hasText: 'Tools' })).toBeVisible();
  await expect(
    page.locator('[data-pkc-launcher-group="Tools"] .pkc-launcher-tile[data-pkc-lid="app1"]'),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/inline-dialog-parity.png' });
});

test('parity: Escape で dialog が閉じ、変更されない', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  await page.locator('.pkc-launcher-tile[data-pkc-lid="app1"]').click({ button: 'right' });
  await page.locator('[data-pkc-region="context-menu"] [data-pkc-action="launcher-set-group"]').click();
  const dialog = page.locator('[data-pkc-region="inline-dialog"]');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-pkc-region="launcher-group-title"]')).toHaveCount(0);
});
