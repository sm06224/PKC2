/**
 * #967 P1s2-a — asset ObjectURL registry の visual parity。
 * launcher タイルの image icon が実ブラウザで registry 経由の `blob:` URL に
 * 収束して**実際に見えている**ことを証明する(bytes ヒープ外化の実効性)。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

// 1x1 赤 PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async (pngB64: string) => {
    const now = '2026-07-23T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'objurl-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        {
          lid: 'app1', title: 'My App', archetype: 'attachment',
          body: JSON.stringify({
            name: 'a.html', mime: 'text/html', asset_key: 'k1',
            registered_as_app: true, app_icon_asset_key: 'icon1',
          }),
          created_at: now, updated_at: now,
        },
        {
          lid: 'icon-entry', title: 'Icon', archetype: 'attachment',
          body: JSON.stringify({ name: 'icon.png', mime: 'image/png', asset_key: 'icon1' }),
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
        tx.objectStore('assets').put(btoa('<h1>x</h1>'), 'objurl-parity:k1');
        tx.objectStore('assets').put(pngB64, 'objurl-parity:icon1');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, PNG_B64);
}

test('parity: launcher icon が blob: URL(registry)で描画される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html');
  await bootReady(page);
  // 初回 boot の debounce 保存(CONTAINER_LOADED trigger)が commit する
  // 前に seed すると、遅れて来た保存が __default__ を上書きして空 container
  // で再 boot する flake になる。固定 wait ではなく「初回保存の commit」を
  // 実測で待ってから seed する。
  await expect.poll(
    () =>
      page.evaluate(
        () =>
          new Promise<boolean>((res) => {
            const req = indexedDB.open('pkc2');
            req.onerror = (): void => res(false);
            req.onsuccess = (): void => {
              const db = req.result;
              try {
                const tx = db.transaction(['containers'], 'readonly');
                const get = tx.objectStore('containers').get('__default__');
                get.onsuccess = (): void => { db.close(); res(get.result != null); };
                get.onerror = (): void => { db.close(); res(false); };
              } catch {
                db.close();
                res(false);
              }
            };
          }),
      ),
    { timeout: 15_000, intervals: [200, 500] },
  ).toBe(true);
  await seed(page);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  const icon = page.locator('.pkc-launcher-tile[data-pkc-lid="app1"] .pkc-launcher-tile-icon-image');
  await expect(icon).toBeVisible({ timeout: 10_000 });

  // registry の drain → SYS_ASSET_URLS_READY 再 render で blob: に収束する
  await expect.poll(
    () => icon.getAttribute('src'),
    { timeout: 10_000, intervals: [200, 500] },
  ).toMatch(/^blob:/);

  // その座標で実際に icon が最前面に見えている
  const box = await icon.boundingBox();
  if (!box) throw new Error('icon has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('.pkc-launcher-tile[data-pkc-lid="app1"]') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);

  // 画像が実際にデコード成功している(壊れた blob なら naturalWidth=0)
  const natural = await icon.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  expect(natural).toBeGreaterThan(0);

  await page.screenshot({ path: 'test-results/asset-object-url-parity.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
