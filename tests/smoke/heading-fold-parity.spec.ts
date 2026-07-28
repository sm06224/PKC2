/**
 * 領域 6 — 見出し折りたたみの parity(visual-state-parity §6)。
 *
 * `applyHeadingFold` は render 済み見出しを native `<details>` へ再構成
 * する。`<summary>`(見出し)クリックで section が畳める視覚 feature。
 * IndexedDB に見出し + 本文を持つ entry を seed → 実ブラウザで描画 →
 * `<summary>` を `elementFromPoint` で非遮蔽確認 → 実 OS `mouse.click`
 * で section が畳まれ、本文(consumer)が不可視になることを assert する。
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

test('parity: 見出しを実 OS click で折りたたむ', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  await seedContainer(page, {
    meta: { container_id: 'cid-63', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'hf-entry', title: 'fold テスト', archetype: 'text',
        body: '# 折りたたみ見出し\n\n見出し配下の本文テキスト',
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: {},
  });
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);

  const entry = page.locator(
    '[data-pkc-region="entry-list"] [data-pkc-action="select-entry"][data-pkc-lid="hf-entry"]',
  ).first();
  await expect(entry).toBeVisible();
  await entry.click();

  const summary = page.locator('.pkc-heading-fold-summary');
  const body = page.locator('.pkc-heading-fold > p', { hasText: '見出し配下の本文テキスト' });
  await expect(summary).toBeVisible();
  // 既定は展開 ── 本文は可視。
  await expect(body).toBeVisible();

  // Parity gate:summary(見出し)が見えている座標で click が届く。
  const box = await summary.boundingBox();
  if (!box) throw new Error('heading-fold summary has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('.pkc-heading-fold-summary');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → section が畳まれ本文が不可視に。
  await page.mouse.click(cx, cy);
  await expect(body).toBeHidden();

  await page.screenshot({ path: 'test-results/heading-fold-parity.png' });
});
