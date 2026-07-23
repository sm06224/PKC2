/**
 * #967 P1s2-c — 4MB 閾値撤去の visual parity(doc §4 DoD)。
 * 旧 4MB 閾値超(6MB)の media asset が「大きなファイル(開く / DL 時に
 * 読み込み)」の deferred 案内ではなく、registry の `blob:` URL で実際に
 * preview 表示されることを実ブラウザで証明する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-23T00:00:00.000Z';
    // 6MB のバイナリ(旧 AUTO_HYDRATE_MAX_BYTES = 4MB を超える)
    const bytes = new Uint8Array(6 * 1024 * 1024);
    crypto.getRandomValues(bytes.subarray(0, 65536)); // 先頭だけ乱数で十分
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const b64 = btoa(bin);
    const cont = {
      meta: { container_id: 'bigasset-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [{
        lid: 'vid1', title: 'Big Recording', archetype: 'attachment',
        body: JSON.stringify({ name: 'rec.webm', mime: 'video/webm', asset_key: 'kv1', size: bytes.length }),
        created_at: now, updated_at: now,
      }],
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
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.objectStore('assets').put(b64, 'bigasset-parity:kv1');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: 4MB 超 asset が deferred ではなく blob: preview で表示される', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  // 初回 boot の debounce 保存 commit を待ってから seed(seed race 対策)
  await expect.poll(
    () =>
      page.evaluate(
        () =>
          new Promise<boolean>((res) => {
            const req = indexedDB.open('pkc2', 2);
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
  await page.goto('/pkc2.html');
  await bootReady(page);

  // entry を選択(sidebar 行 click)
  await page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="vid1"]').first().click();

  // deferred 案内(撤去済み)が出ないこと
  await expect(page.locator('[data-pkc-region="attachment-deferred"]')).toHaveCount(0);

  // registry の URL 供給で video preview が blob: src で現れる
  const source = page.locator('.pkc-attachment-video-preview source');
  await expect(source).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(
    () => source.getAttribute('src'),
    { timeout: 10_000, intervals: [200, 500] },
  ).toMatch(/^blob:/);

  await page.screenshot({ path: 'test-results/large-asset-preview-parity.png' });
});
