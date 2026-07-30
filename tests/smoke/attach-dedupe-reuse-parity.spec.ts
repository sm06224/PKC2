/**
 * ② ハッシュ重複排除 — 編集中ドロップでの既存 asset 再利用 parity
 * (visual-state-parity-testing.md §6)。
 *
 * 既存の attachment と同一内容のファイルを編集中に drop したとき、
 * 新規 attachment / storage を作らず既存 `asset_key` を参照する anchor
 * を挿入することを実ブラウザで検証する。
 *
 * 検証手法:IndexedDB に既知内容の attachment(asset_key=`kdup`)を
 * seed → text entry を作成して編集 → 同一内容の `.txt` を body へ drop
 * → body の anchor が `asset:kdup`(既存 key 再利用)であり、`asset:att-`
 * (新規 key)ではないことを assert する。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const DUP = 'duplicate-content-for-dedup-reuse-test';

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

test('parity: 編集中に重複ファイルを drop すると既存 asset を再利用する', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  const now = '2026-05-21T00:00:00.000Z';
  const dupB64 = Buffer.from(DUP, 'utf-8').toString('base64');
  const dupSize = Buffer.byteLength(DUP, 'utf-8');
  await seedContainer(page, {
    meta: { container_id: 'cid-60', title: 't', created_at: now, updated_at: now, schema_version: 1 },
    entries: [
      {
        lid: 'att-existing', title: 'original.txt', archetype: 'attachment',
        body: JSON.stringify({
          name: 'original.txt', mime: 'text/plain', size: dupSize, asset_key: 'kdup',
        }),
        created_at: now, updated_at: now,
      },
    ],
    relations: [], revisions: [], assets: { kdup: dupB64 },
  });
  await page.goto('/pkc2.html');
  await bootReady(page);

  // text entry を作成 → editing phase。
  const shell = page.locator('#pkc-root');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  // 既存 attachment と同一内容の .txt を body textarea へ drop。
  const body = page.locator('[data-pkc-field="body"]').first();
  await body.click();
  const dataTransfer = await page.evaluateHandle((content: string) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], 'dropped-dup.txt', { type: 'text/plain' }));
    return dt;
  }, DUP);
  const box = await body.boundingBox();
  if (!box) throw new Error('body textarea has no bounding box');
  await body.dispatchEvent('drop', {
    dataTransfer,
    clientX: box.x + 20,
    clientY: box.y + 14,
  });

  // anchor は既存 asset_key(kdup)を参照 ── 重複格納していない。
  await expect(body).toHaveValue(/asset:kdup/);
  // 新規 key(att-<timestamp>)では「ない」= 既存を再利用した証跡。
  await expect(body).not.toHaveValue(/asset:att-/);

  await page.screenshot({ path: 'test-results/attach-dedupe-reuse-parity.png' });
});
