/**
 * Contact sheet thumb object-fit parity test (PR-KK, 2026-05-06).
 *
 * User 修正指示2:「サムネ元画像長辺合わせで引き伸ばしなし」
 *
 * Contact-sheet は写真 grid 想定 — 元画像の長辺をセル(1:1)に
 * フィットさせて letterbox を許容する contain が正しい挙動。
 * book / video / novel card grid の cover(crop して埋める)とは
 * 別の設計。
 *
 * Phase 8 順序性 doctrine + reform-2026-05 §6 visual-state-parity:
 *   computed style を実 DOM から読み、`getComputedStyle().objectFit`
 *   が 'contain' であることを assert する(class lookup でなく
 *   実 painted state)。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

/** Seed a folder with one image attachment so contact-sheet is non-trivial. */
async function seedFolderWithImage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-05-06T00:00:00.000Z';
    // Tiny 16x9 PNG (red) — different aspect from the 1:1 cell so
    // contain vs cover produce visibly different results.
    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAACGzN7XAAAAGUlEQVQYV2P8z8DwnwEJMDExMDD8Z2BgAACk7gIB1GgUyAAAAABJRU5ErkJggg==';
    const cont = {
      meta: {
        container_id: 'cs-test',
        title: 'Contact Sheet Test',
        created_at: now,
        updated_at: now,
        schema_version: 1,
      },
      entries: [
        {
          lid: 'fld',
          title: 'Photos',
          archetype: 'folder',
          body: '---\ndisplay_profile_kind: contact-sheet\n---\n',
          created_at: now,
          updated_at: now,
        },
        {
          lid: 'img1',
          title: 'pic.png',
          archetype: 'attachment',
          body: JSON.stringify({
            asset_key: 'pic1',
            mime: 'image/png',
            name: 'pic.png',
            size: 100,
          }),
          created_at: now,
          updated_at: now,
        },
      ],
      relations: [
        { id: 'r1', from: 'fld', to: 'img1', kind: 'structural' },
      ],
      revisions: [],
      assets: { pic1: tinyPngB64 },
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
        tx.oncomplete = (): void => {
          db.close();
          res();
        };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('contact-sheet thumb img has computed object-fit: contain (PR-KK)', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await seedFolderWithImage(page);
  await page.reload();
  await bootReady(page);

  // Click the seeded folder in the sidebar to scope into it.
  const folderRow = page
    .locator('[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid="fld"]')
    .first();
  await expect(folderRow).toBeVisible({ timeout: 5_000 });
  const fbox = await folderRow.boundingBox();
  if (!fbox) throw new Error('folder row missing boundingBox');
  await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);

  // Switch to filer view.
  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('filer tab missing boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

  // Grid in contact-sheet mode (folder profile sets it via display_profile_kind).
  const grid = page.locator('[data-pkc-region="filer-grid"].pkc-filer-grid-contact-sheet');
  await expect(grid).toBeVisible({ timeout: 5_000 });

  const thumbImg = grid.locator('.pkc-filer-card-thumb img').first();
  await expect(thumbImg).toBeVisible();

  // visual-state-parity: read computed style from the painted DOM.
  const objectFit = await thumbImg.evaluate(
    (el) => window.getComputedStyle(el as HTMLElement).objectFit,
  );
  expect(objectFit).toBe('contain');
});
