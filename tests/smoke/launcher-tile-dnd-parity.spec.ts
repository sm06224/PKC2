/**
 * #928 改 — launcher タイル drag & drop 並び替えの visual parity
 * (visual-state-parity-testing.md)。
 *
 * 2026-07-17 user 指摘「並び替えはボタンではなくマウス操作が主」を受けた
 * DnD 実装を、実 Chromium の実マウス(mouse.down → move → up = native
 * HTML5 DnD)で検証する。観測点は「再 render 後のタイル並び」と
 * 「reload 後も並びが残る(app_order が IDB へ永続化された)」こと。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedLauncherApps(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-17T00:00:00.000Z';
    const app = (lid: string, title: string): Record<string, unknown> => ({
      lid, title, archetype: 'attachment',
      body: JSON.stringify({
        name: `${lid}.html`, mime: 'text/html', asset_key: `k-${lid}`, size: 10,
        registered_as_app: true,
      }),
      created_at: now, updated_at: now,
    });
    const cont = {
      meta: { container_id: 'dnd-launcher', title: 'launcher dnd', created_at: now, updated_at: now, schema_version: 1 },
      entries: [app('a1', 'App A'), app('a2', 'App B'), app('a3', 'App C')],
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
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

async function tileOrder(page: Page): Promise<string[]> {
  return page.$$eval('.pkc-launcher-tile', (els) =>
    els.map((el) => el.getAttribute('data-pkc-lid') ?? ''),
  );
}

test('parity: launcher タイルは実マウスの drag & drop で並び替わり永続化される', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  // boot 直後の debounced save が seed を上書きしないよう settle を待つ。
  await page.waitForTimeout(800);
  await seedLauncherApps(page);

  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);

  await expect(page.locator('.pkc-launcher-tile')).toHaveCount(3);
  expect(await tileOrder(page)).toEqual(['a1', 'a2', 'a3']);

  // a1 を a3 の右半分へ実マウスで drag(native HTML5 DnD)。
  const src = page.locator('[data-pkc-launcher-draggable][data-pkc-lid="a1"]');
  const dst = page.locator('[data-pkc-launcher-draggable][data-pkc-lid="a3"]');
  const srcBox = (await src.boundingBox())!;
  const dstBox = (await dst.boundingBox())!;
  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
  await page.mouse.down();
  // drag 認識には複数 move が要る(steps で中間座標を刻む)。
  await page.mouse.move(dstBox.x + dstBox.width * 0.9, dstBox.y + dstBox.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(async () => tileOrder(page), { timeout: 5_000 })
    .toEqual(['a2', 'a3', 'a1']);

  // 永続化 parity: debounce save を待って reload しても並びが残る。
  await page.waitForTimeout(800);
  await page.goto('/pkc2.html?app=launcher');
  await bootReady(page);
  expect(await tileOrder(page)).toEqual(['a2', 'a3', 'a1']);

  await page.screenshot({ path: 'test-results/launcher-tile-dnd-parity.png' });
});
