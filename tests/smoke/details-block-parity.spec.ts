/**
 * 領域 6 — `:::details` 折りたたみブロックの parity
 * (visual-state-parity-testing.md §6)。
 *
 * `:::details` は native `<details>` を生成し、`<summary>` クリックで
 * 開閉する視覚 feature。IndexedDB に `:::details` を含む entry を seed
 * して実ブラウザで描画 → `<summary>` を `elementFromPoint` で非遮蔽
 * 確認 → 実 OS `mouse.click` で開き、畳まれていた本文(consumer)が
 * 可視化されることを assert する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seedContainer(page: Page, container: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cont) => {
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2');
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

const BODY = ':::details{summary="クリックで開く"}\n畳まれていた本文テキスト\n:::';

test('parity: :::details の summary を実 OS click で開閉する', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-61', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'det-entry', title: 'details テスト', archetype: 'text',
        body: BODY, created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  // entry を選択 → center pane が markdown を描画。
  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="det-entry"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();

  const summary = page.locator('.pkc-details-summary');
  const body = page.locator('.pkc-details > p', { hasText: '畳まれていた本文テキスト' });
  await expect(summary).toBeVisible();
  // 既定は畳んだ状態 — 本文は不可視。
  await expect(body).toBeHidden();

  // Parity gate:summary が見えている座標で click が summary 自身に届く。
  const box = await summary.boundingBox();
  if (!box) throw new Error('summary has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('.pkc-details-summary');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → <details> が開き、本文が可視化される。
  await page.mouse.click(cx, cy);
  await expect(body).toBeVisible();

  await page.screenshot({ path: 'test-results/details-block-parity.png' });
});
