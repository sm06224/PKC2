/**
 * #956(user 重大バグ報告 2026-07-22「HTML と URL がライトエクスポート
 * 扱いになってアセットから開けない」)の調査から恒久化した regression
 * parity。実ブラウザ + 実 IndexedDB で:
 *   1. HTML app / URL タイルの asset が、差分保存(既定 ON)の保存・
 *      reload を経ても launcher から起動でき、詳細カードが Light export
 *      表示にならないこと
 *   2. フルエクスポート生成物でも同様に起動できること(asset 欠落なし)
 *   3. `?pkc-debug=assets` 診断 overlay が boot する(報告導線の生存確認)
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { bootReady } from './_helpers/boot-ready';

const APP_HTML = '<!doctype html><title>AppX</title><h1>APP CONTENT OK</h1>';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (appHtml) => {
    const now = '2026-07-22T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'roundtrip', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        {
          lid: 'app1', title: 'My HTML App', archetype: 'attachment',
          body: JSON.stringify({ name: 'app.html', mime: 'text/html', asset_key: 'k1', registered_as_app: true }),
          created_at: now, updated_at: now,
        },
        {
          lid: 'url1', title: 'My URL', archetype: 'attachment',
          body: JSON.stringify({ name: 'url.html', mime: 'text/html', asset_key: 'k2', registered_as_app: true, app_icon: '🔗', launcher_url: 'https://example.com/' }),
          created_at: now, updated_at: now,
        },
      ],
      relations: [], revisions: [], assets: {},
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
        tx.objectStore('assets').put(btoa(appHtml), 'roundtrip:k1');
        tx.objectStore('assets').put(btoa('<!doctype html><title>URL</title>ok'), 'roundtrip:k2');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, APP_HTML);
}

async function expectTileOpens(page: Page): Promise<void> {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.locator('.pkc-launcher-tile[data-pkc-lid="app1"]').click(),
  ]);
  await popup.waitForLoadState('domcontentloaded');
  await expect
    .poll(async () => popup.evaluate(() => document.body?.textContent ?? ''), { timeout: 5_000 })
    .toContain('APP CONTENT OK');
  await popup.close();
}

test('parity: IDB 運用(差分保存既定 ON)で launcher asset が起動・表示できる', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);

  // (1) launcher タイル起動
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);
  await page.waitForTimeout(500);
  await expectTileOpens(page);

  // (2) 詳細カード: Light export 表示になっていない + Open ボタンあり
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="app1"]').first().click();
  await page.waitForTimeout(600);
  const center = page.locator('[data-pkc-region="center"]');
  await expect(center).not.toContainText('Data not included');
  await expect(page.locator('[data-pkc-action="open-html-attachment"]').first()).toBeVisible();
});

test('parity: フルエクスポート生成物でも launcher asset が起動できる', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(500);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20_000 }),
    page.$eval(
      '[data-pkc-action="begin-export"][data-pkc-export-mode="full"][data-pkc-export-mutability="editable"]',
      (el) => (el as HTMLElement).click(),
    ),
  ]);
  const outPath = path.resolve(process.cwd(), 'dist/launcher-asset-roundtrip.tmp.html');
  await download.saveAs(outPath);
  try {
    // IDB を消して埋め込み(export 生成物)から boot
    await page.evaluate(async () => {
      await new Promise<void>((res) => {
        const req = indexedDB.deleteDatabase('pkc2');
        req.onsuccess = (): void => res();
        req.onerror = (): void => res();
        req.onblocked = (): void => res();
      });
    });
    await page.goto('/launcher-asset-roundtrip.tmp.html');
    await bootReady(page);
    await page.locator('[data-pkc-region="entry-list"] li[data-pkc-lid="app1"]').first().click();
    await page.waitForTimeout(800);
    await expect(page.locator('[data-pkc-region="center"]')).not.toContainText('Data not included');

    await page.goto('/launcher-asset-roundtrip.tmp.html?app=launcher');
    await bootReady(page);
    await page.waitForTimeout(500);
    await expectTileOpens(page);
    await page.screenshot({ path: 'test-results/launcher-asset-roundtrip-parity.png' });
  } finally {
    fs.rmSync(outPath, { force: true });
  }
});

test('parity: ?pkc-debug=assets 診断 overlay が表示される(報告導線)', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html?pkc-debug=assets');
  await bootReady(page);
  const overlay = page.locator('[data-pkc-region="asset-debug-overlay"]');
  await expect(overlay).toBeVisible({ timeout: 5_000 });
  await expect(overlay).toContainText('asset debug');
  await expect(overlay).toContainText('k1');
});
