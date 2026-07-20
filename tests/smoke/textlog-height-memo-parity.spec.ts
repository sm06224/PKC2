/**
 * #938 R3 — textlog placeholder 実高さ memo の visual parity。
 *
 * 実 Chromium で: 大きな textlog をスクロールして hydrate → 再 render
 * (★ flag toggle = QUICK_UPDATE → full render)しても、
 *   (a) hydrate 済み log の placeholder が実測高さ(data-pkc-height-memo)で
 *       場所を確保し、
 *   (b) scrollHeight(総高さ)が維持される(従来は固定 160px に戻って
 *       総高さが崩れ、つまみが跳ねる)
 * ことを検証する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedTextlog(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-20T00:00:00.000Z';
    // 長短混在の 40 logs(実高さが 160px 固定と乖離するように)。
    const logs = Array.from({ length: 40 }, (_, i) => ({
      id: `log-${i}`,
      text: i % 3 === 0
        ? `# 見出し ${i}\n\n${('長い本文の段落です。'.repeat(20) + '\n\n').repeat(6)}- item\n- item\n- item`
        : `短い log ${i}`,
      createdAt: `2026-07-19T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      flags: [],
    }));
    const cont = {
      meta: { container_id: 'hm-parity', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [{
        lid: 'tl1', title: 'Big Log', archetype: 'textlog',
        body: JSON.stringify({ entries: logs }),
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
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: 再 render 後も hydrate 済み log の高さが memo で維持される', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seedTextlog(page);
  await page.goto('/pkc2.html');
  await bootReady(page);

  await page.locator('[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="tl1"]').click();
  await expect(page.locator('.pkc-textlog-log').first()).toBeVisible();

  // 下までスクロールして hydrate を進める(settle 160ms を挟みながら)。
  const scroller = page.locator('.pkc-center-content');
  for (let i = 0; i < 8; i++) {
    await scroller.evaluate((el) => { el.scrollTop += 1200; });
    await page.waitForTimeout(260); // settle → flush
  }
  const hydratedCount = await page.locator('[data-pkc-hydrated="true"]').count();
  expect(hydratedCount).toBeGreaterThan(10);

  const before = await scroller.evaluate((el) => ({ h: el.scrollHeight, top: el.scrollTop }));

  // 再 render を誘発: 先頭 log の ★ flag toggle(QUICK_UPDATE → full render)。
  // Playwright の click は対象を auto-scroll してしまうため、scroll 位置を
  // 動かさない JS dispatch で click する(検証対象は render 後のジオメトリ)。
  await page.$eval('.pkc-textlog-flag-btn', (el) => (el as HTMLElement).click());
  await page.waitForTimeout(120);

  // (a) memo 付き placeholder が存在し、値は実測(160 固定でない)を含む
  const memoVals = await page.$$eval('[data-pkc-height-memo]', (els) =>
    els.map((el) => Number(el.getAttribute('data-pkc-height-memo'))),
  );
  expect(memoVals.length).toBeGreaterThan(5);
  expect(memoVals.some((v) => v > 250)).toBe(true); // 長い log の実測が乗っている
  expect(memoVals.some((v) => v < 160)).toBe(true); // 短い log は 160 未満で確保

  // (b) 総高さが維持される(従来は 160px 固定に戻って大きく縮む)
  const after = await scroller.evaluate((el) => ({ h: el.scrollHeight, top: el.scrollTop }));
  expect(Math.abs(after.h - before.h) / before.h).toBeLessThan(0.05);
  // scroll 位置も維持(render-continuity + 安定ジオメトリ)
  expect(Math.abs(after.top - before.top)).toBeLessThan(40);

  await page.screenshot({ path: 'test-results/textlog-height-memo-parity.png' });
});
