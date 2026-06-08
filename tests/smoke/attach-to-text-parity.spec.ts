/**
 * 領域 3 — 添付 → TEXT 変換の parity(visual-state-parity-testing.md §6)。
 *
 * 「📄 TEXT に変換」は clickable な視覚 feature。happy-dom 単体 test は
 * decode + CREATE_ENTRY の正しさを証明できても、ユーザーの実タップが
 * ボタンに届くことは保証しない。本 spec は IndexedDB に `.md` 添付を
 * seed して実ブラウザで起動し、`elementFromPoint` でボタンが非遮蔽で
 * あることを確認した上で `page.mouse.click(x, y)` の実 OS event で変換を
 * 発火、編集画面(consumer)に復号済み内容が出ることを assert する。
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

const MD_CONTENT = '# 変換テスト\n\nこの内容が新しい TEXT エントリの body になる。\n';

test('parity: 添付の「TEXT に変換」を実 OS click で TEXT エントリ化', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  const md64 = Buffer.from(MD_CONTENT, 'utf-8').toString('base64');
  await seedContainer(page, {
    meta: { container_id: 'cid-56', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'att-md', title: 'notes.md', archetype: 'attachment',
        body: JSON.stringify({ name: 'notes.md', mime: 'text/markdown', asset_key: 'k1' }),
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: { k1: md64 },
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  // 添付エントリを選択 → attachment detail が描画される。
  const attEntry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="att-md"]',
  ).first();
  await expect(attEntry).toBeVisible();
  await attEntry.click();

  const convertBtn = page.locator('[data-pkc-action="convert-attachment-to-text"]');
  await expect(convertBtn).toBeVisible();

  // Parity gate:ボタンが見えている座標で click がボタン自身に届く。
  const box = await convertBtn.boundingBox();
  if (!box) throw new Error('convert button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('[data-pkc-action="convert-attachment-to-text"]');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → CREATE_ENTRY → 新 TEXT エントリ(editing phase へ)。
  await page.mouse.click(cx, cy);
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  // 編集画面の body field に復号済み内容(consumer 観測点)。
  const bodyField = page.locator('[data-pkc-field="body"]').first();
  await expect(bodyField).toHaveValue(/変換テスト/);

  await page.screenshot({ path: 'test-results/attach-to-text-parity.png' });
});
