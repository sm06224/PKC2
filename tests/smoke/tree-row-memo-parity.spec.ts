/**
 * #938 R9 — tree 行 memo の visual parity。
 * memo で reuse される行が実ブラウザで生きた DOM のままであること:
 * folder toggle を実マウスでクリック → 子が消え chevron が ▶ に変わり、
 * もう一度クリックで戻る(collapse param 変化 → 当該行 rebuild、他行
 * reuse という memo 経路を実際に通る)。
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

async function seed(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const now = '2026-07-20T00:00:00.000Z';
    const cont = {
      meta: { container_id: 'treememo', title: 't', created_at: now, updated_at: now, schema_version: 1 },
      entries: [
        {
          lid: '__flags__', title: 'Flags', archetype: 'system-flags',
          body: JSON.stringify({ format: 'pkc2-system-flags', version: 1, values: { 'sidebar.mode': 'tree' } }),
          created_at: now, updated_at: now,
        },
        { lid: 'f1', title: 'Folder A', archetype: 'folder', body: '', created_at: now, updated_at: now },
        { lid: 'c1', title: 'Child 1', archetype: 'text', body: 'x', created_at: now, updated_at: now },
        { lid: 'c2', title: 'Child 2', archetype: 'text', body: 'x', created_at: now, updated_at: now },
        { lid: 'r1', title: 'Root note', archetype: 'text', body: 'x', created_at: now, updated_at: now },
      ],
      relations: [
        { id: 'rl1', kind: 'structural', from: 'f1', to: 'c1', created_at: now, updated_at: now },
        { id: 'rl2', kind: 'structural', from: 'f1', to: 'c2', created_at: now, updated_at: now },
      ],
      revisions: [], assets: {},
    };
    await new Promise<void>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readwrite');
        tx.objectStore('containers').clear();
        tx.objectStore('containers').put(cont, cont.meta.container_id);
        tx.objectStore('containers').put(cont.meta.container_id, '__default__');
        tx.oncomplete = (): void => { db.close(); res(); };
        tx.onerror = (): void => rej(tx.error);
      };
    });
  });
}

test('parity: tree folder toggle が memo 経路で開閉できる', async ({ page }) => {
  await page.goto('/pkc2.html');
  await bootReady(page);
  await page.waitForTimeout(800);
  await seed(page);
  await page.goto('/pkc2.html');
  await bootReady(page);

  const list = page.locator('[data-pkc-region="entry-list"]');
  const childRow = list.locator('li.pkc-entry-item[data-pkc-lid="c1"]');
  await expect(childRow).toBeVisible();

  // toggle が elementFromPoint で到達可能(隠れていない)
  const toggle = list.locator('.pkc-folder-toggle[data-pkc-lid="f1"]');
  await expect(toggle).toHaveText('▼');
  const box = await toggle.boundingBox();
  if (!box) throw new Error('folder toggle has no bounding box');
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('.pkc-folder-toggle') !== null,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(true);

  // 実マウスで collapse → 子が消え chevron ▶
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(childRow).toHaveCount(0);
  await expect(list.locator('.pkc-folder-toggle[data-pkc-lid="f1"]')).toHaveText('▶');
  // 兄弟の root 行は memo reuse でも表示・生存
  await expect(list.locator('li.pkc-entry-item[data-pkc-lid="r1"]')).toBeVisible();

  // もう一度クリックで expand → 子が戻る(memo reuse された行も再表示)
  await list.locator('.pkc-folder-toggle[data-pkc-lid="f1"]').click();
  await expect(list.locator('li.pkc-entry-item[data-pkc-lid="c1"]')).toBeVisible();
  await expect(list.locator('.pkc-folder-toggle[data-pkc-lid="f1"]')).toHaveText('▼');
  await page.screenshot({ path: 'test-results/tree-row-memo-parity.png' });
});
