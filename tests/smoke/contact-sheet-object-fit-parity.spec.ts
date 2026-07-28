/**
 * Filer thumb object-fit parity test (PR-KK + PR-SS, 2026-05-06).
 *
 * User 修正指示2:「サムネ元画像長辺合わせで引き伸ばしなし」
 * User 修正指示4 alignment(2026-05-06):「全 grid」へ scope 拡張。
 *
 * 旧 PR-KK は contact-sheet のみ contain だったが、user 補足で全
 * grid 統一が指示されたため PR-SS で `.pkc-filer-card-thumb img` の
 * baseline 自体を contain に変更。本テストはその全 grid 共通化の
 * 順序性 parity:contact-sheet と同様、book/novel/video の card
 * grid でも `getComputedStyle().objectFit === 'contain'` を assert。
 *
 * Phase 8 順序性 doctrine + reform-2026-05 §6 visual-state-parity:
 *   computed style を実 DOM から読み、`getComputedStyle().objectFit`
 *   が 'contain' であることを assert する(class lookup でなく
 *   実 painted state)。
 */

import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

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
      const req = indexedDB.open('pkc2');
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

/**
 * PR-SS: book-base grid でも thumb img が contain。
 * folder の display_profile_kind を `book-base` で seed して、
 * card grid (`.pkc-filer-grid-book-base`) で同じ contain を assert。
 */
async function seedFolderWithBookProfile(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-05-06T00:00:00.000Z';
    const tinyPngB64 =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAJCAIAAACGzN7XAAAAGUlEQVQYV2P8z8DwnwEJMDExMDD8Z2BgAACk7gIB1GgUyAAAAABJRU5ErkJggg==';
    const cont = {
      meta: {
        container_id: 'book-test',
        title: 'Book Grid Test',
        created_at: now,
        updated_at: now,
        schema_version: 1,
      },
      entries: [
        {
          lid: 'fld',
          title: 'Books',
          archetype: 'folder',
          body: '---\ndisplay_profile_kind: book-base\n---\n',
          created_at: now,
          updated_at: now,
        },
        {
          lid: 'book1',
          title: 'Sample Book',
          archetype: 'text',
          body: '---\nkind: book\nthumbnail: data:image/png;base64,' + tinyPngB64 + '\n---\n# Sample',
          created_at: now,
          updated_at: now,
        },
      ],
      relations: [
        { id: 'r1', from: 'fld', to: 'book1', kind: 'structural',
          created_at: now, updated_at: now },
      ],
      revisions: [],
      assets: {},
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
        tx.oncomplete = (): void => {
          db.close();
          res();
        };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('book-base grid thumb img has computed object-fit: contain (PR-SS)', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedFolderWithBookProfile(page);
  await page.reload();
  await bootReady(page);

  const folderRow = page
    .locator('[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid="fld"]')
    .first();
  await expect(folderRow).toBeVisible();
  const fbox = await folderRow.boundingBox();
  if (!fbox) throw new Error('folder row missing boundingBox');
  await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);

  const filerTab = page.locator(
    'button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]',
  );
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('filer tab missing boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

  const grid = page.locator('[data-pkc-region="filer-grid"].pkc-filer-grid-book-base');
  await expect(grid).toBeVisible();

  const thumbImg = grid.locator('.pkc-filer-card-thumb img').first();
  await expect(thumbImg).toBeVisible();
  const objectFit = await thumbImg.evaluate(
    (el) => window.getComputedStyle(el as HTMLElement).objectFit,
  );
  expect(objectFit).toBe('contain');
});

test('contact-sheet thumb img has computed object-fit: contain (PR-KK)', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
  await bootReady(page);
  await seedFolderWithImage(page);
  await page.reload();
  await bootReady(page);

  // Click the seeded folder in the sidebar to scope into it.
  const folderRow = page
    .locator('[data-pkc-region="entry-list"] li.pkc-entry-item[data-pkc-lid="fld"]')
    .first();
  await expect(folderRow).toBeVisible();
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
  await expect(grid).toBeVisible();

  const thumbImg = grid.locator('.pkc-filer-card-thumb img').first();
  await expect(thumbImg).toBeVisible();

  // visual-state-parity: read computed style from the painted DOM.
  const objectFit = await thumbImg.evaluate(
    (el) => window.getComputedStyle(el as HTMLElement).objectFit,
  );
  expect(objectFit).toBe('contain');
});
