/**
 * TEXTLOG staged-hydration のスクロール空回り修正の visual parity smoke
 * (user 報告 2026-06-13「スクロールバーは動くのに実際のスクロールがしない」)。
 *
 * 原因: スクロール中の placeholder→実体差し替え(高さ差分)をブラウザの
 * scroll anchoring が scrollTop 補正で打ち消し続けるため、視界が進まない。
 * 修正: アクティブスクロール中は hydration を据え置き、静定後に flush。
 *
 * 本 spec は実ブラウザで:
 *   (1) 連続 wheel スクロール中は hydration が走らない(件数固定)
 *   (2) その間 scrollTop は単調に前進する(空回りしない)
 *   (3) スクロール静定後に hydration が再開して件数が増える
 * を確認する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers', 'assets'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('assets').clear();
        const meta = (cont as { meta: { container_id: string } }).meta;
        tx.objectStore('containers').put(cont, meta.container_id);
        tx.objectStore('containers').put(meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  }, container);
}

/** 実体の高さが placeholder(160px)から大きくズレる、長さまちまちのログ群。 */
function makeLogs(count: number): { id: string; text: string; createdAt: string; flags: string[] }[] {
  return Array.from({ length: count }, (_, i) => {
    const para = `Log ${i} — スクロール空回り検証用の本文です。`.repeat(1 + (i % 7) * 4);
    return {
      id: `log-${i}`,
      text: i % 3 === 0 ? `${para}\n\n${para}` : para,
      createdAt: `2026-06-01T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
      flags: [],
    };
  });
}

test('parity: 連続スクロール中は hydration 凍結 + scrollTop 単調前進、静定後に再開', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-06-13T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-scroll', title: 'scroll-parity', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'tl1', title: 'Long Log', archetype: 'textlog', created_at: now, updated_at: now,
        body: JSON.stringify({ entries: makeLogs(80) }),
      },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.reload();
  await bootReady(page);

  await page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="tl1"]',
  ).first().click();
  const center = page.locator('.pkc-center-content').first();
  await expect(page.locator('[data-pkc-hydrated="true"]').first()).toBeVisible();

  const hydratedCount = (): Promise<number> =>
    page.locator('[data-pkc-hydrated="true"]').count();
  const scrollTop = (): Promise<number> => center.evaluate((el) => el.scrollTop);

  // 初期 eager 8 件 + lookahead 4 件の hydration が落ち着くまで待ってから
  // 基準値を取る(lookahead はスクロールと無関係に idle で走る)。
  await expect.poll(hydratedCount, { timeout: 5_000 }).toBeGreaterThanOrEqual(12);
  await page.waitForTimeout(300);
  const beforeBurst = await hydratedCount();

  // center pane 上にカーソルを置き、連続 wheel(各間隔 < 静定 160ms)。
  const box = await center.boundingBox();
  if (!box) throw new Error('center bbox missing');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const tops: number[] = [await scrollTop()];
  const countsDuring: number[] = [];
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(60); // 静定 160ms より短い = アクティブスクロール継続
    tops.push(await scrollTop());
    countsDuring.push(await hydratedCount());
  }

  // (1) スクロール中に hydration が走っていない(件数固定)。
  expect(new Set(countsDuring).size).toBe(1);
  expect(countsDuring[0]).toBe(beforeBurst);

  // (2) scrollTop は単調前進し、累計でも大きく進んでいる(空回りなし)。
  for (let i = 1; i < tops.length; i++) {
    expect(tops[i]!).toBeGreaterThanOrEqual(tops[i - 1]!);
  }
  expect(tops[tops.length - 1]! - tops[0]!).toBeGreaterThan(1500);

  // (3) 静定後に据え置き分が flush され、hydration が進む。
  await expect.poll(hydratedCount, { timeout: 5_000 }).toBeGreaterThan(beforeBurst);

  await page.screenshot({ path: 'test-results/textlog-scroll-settle.png' });
});
