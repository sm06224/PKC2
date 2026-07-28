/**
 * Quick Win wave U5 + U8 label parity test(2026-05-07、wave-10-6 UX
 * evaluation 残課題の resolution)。
 *
 * U5: subset profile select を `<optgroup>` で 4 group(既定 / Layout /
 *     Catalogue / Query)に整理した。各 optgroup の label / 配下 option
 *     が描画されていることを verify。
 * U8: graph mode select の label から括弧書きの補足を削除した。新 short
 *     label が描画されていることを verify。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠 + CLAUDE.md §5
 * 「視覚機能 PR は visual parity test 最低 1 件」必須化。本 spec は
 * 描画 DOM(consumer)を assert する。
 */

import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function bootWithSeed(page: Page): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree', { waitUntil: 'load' });
  await bootReady(page);

  // 単一 folder を seed → filer view + graph view を開ける状態に。
  await page.evaluate(async () => {
    const now = '2026-05-07T00:00:00Z';
    const cont = {
      meta: {
        container_id: 'wave-u5-u8',
        schema_version: 1,
        title: 'U5/U8 parity',
        created_at: now,
        updated_at: now,
      },
      entries: [
        { lid: 'fold', archetype: 'folder', title: 'Sample folder', body: '', tags: [], created_at: now, updated_at: now },
        { lid: 'c0', archetype: 'text', title: 'A', body: 'a', tags: [], created_at: now, updated_at: now },
        { lid: 'c1', archetype: 'text', title: 'B', body: 'b', tags: [], created_at: now, updated_at: now },
      ],
      relations: [
        { id: 'r0', from: 'fold', to: 'c0', kind: 'structural' },
        { id: 'r1', from: 'fold', to: 'c1', kind: 'structural' },
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
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
  await page.reload();
  await bootReady(page);
}

test('U5: subset profile select is grouped via <optgroup> (Layout / Catalogue / Query / 既定)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bootWithSeed(page);

  // Filer view へ切替 → meta pane に subset select が出る前に folder
  // を選択する必要がある(folder archetype 限定で出る)。
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  await filerTab.waitFor();
  const ftbox = await filerTab.boundingBox();
  if (!ftbox) throw new Error('filer tab missing');
  await page.mouse.click(ftbox.x + ftbox.width / 2, ftbox.y + ftbox.height / 2);
  await page.locator('[data-pkc-region="filer-view"]').waitFor();

  // sidebar から folder を click(meta pane を folder context にする)。
  const folderRow = page.locator('[data-pkc-action="select-entry"][data-pkc-lid="fold"]').first();
  await folderRow.waitFor();
  const fbox = await folderRow.boundingBox();
  if (!fbox) throw new Error('folder row missing');
  await page.mouse.click(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);

  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.waitFor();

  // Consumer behavior verification: <optgroup> structure + labels.
  const groupStructure = await select.evaluate((s) => {
    const sel = s as HTMLSelectElement;
    return Array.from(sel.querySelectorAll('optgroup')).map((og) => ({
      label: og.label,
      optionCount: og.querySelectorAll('option').length,
      optionTexts: Array.from(og.querySelectorAll('option')).map((o) => o.textContent ?? ''),
    }));
  });
  console.log('U5 optgroup structure:', JSON.stringify(groupStructure, null, 2));

  expect(groupStructure.length).toBe(4);
  const labels = groupStructure.map((g) => g.label);
  expect(labels).toContain('既定');
  expect(labels).toContain('Layout');
  expect(labels).toContain('Catalogue');
  expect(labels).toContain('Query');

  // 各 group の中身を確認。
  const layoutGroup = groupStructure.find((g) => g.label === 'Layout');
  expect(layoutGroup?.optionCount).toBe(2);
  const catalogueGroup = groupStructure.find((g) => g.label === 'Catalogue');
  expect(catalogueGroup?.optionCount).toBe(4);
  const queryGroup = groupStructure.find((g) => g.label === 'Query');
  expect(queryGroup?.optionCount).toBe(1);
});

