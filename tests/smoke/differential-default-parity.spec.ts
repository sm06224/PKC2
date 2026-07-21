/**
 * R6(#938)── `persistence.differential_save` 既定 ON の visual parity。
 * 実ブラウザ + 実 IndexedDB で: 既定 flag のまま entry 作成 → 実 IDB に
 * split 形式(`__pkc_split__` marker + `__entry__:` record)で保存されて
 * いること → reload 後にデータが完全に読めること(使用中ユーザーの
 * 実環境そのままの経路)を確認する。
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('parity: 既定 ON で実 IDB に split 保存され、reload 後も完全に読める', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/pkc2.html');
  await bootReady(page);
  const shell = page.locator('#pkc-root');

  // flag 指定なし(= 既定)で entry を 2 件作成
  for (const title of ['DiffProbe One', 'DiffProbe Two']) {
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
    await page.locator('[data-pkc-field="title"]').first().fill(title);
    await page.locator('textarea[data-pkc-field="body"]').first().fill(`body of ${title}`);
    await page.locator('[data-pkc-action="commit-edit"]').first().click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  }
  // debounce(既定 300ms)を確実に越えて自動保存を待つ
  await page.waitForTimeout(1200);

  // 実 IndexedDB を直接観測: core record に __pkc_split__、__entry__: record あり
  const storageShape = await page.evaluate(async () => {
    return new Promise<{ split: boolean; entryRecords: number }>((res, rej) => {
      const req = indexedDB.open('pkc2', 2);
      req.onerror = (): void => rej(req.error);
      req.onsuccess = (): void => {
        const db = req.result;
        const tx = db.transaction(['containers'], 'readonly');
        const st = tx.objectStore('containers');
        const all: { key: IDBValidKey; value: unknown }[] = [];
        const cur = st.openCursor();
        cur.onsuccess = (): void => {
          const c = cur.result;
          if (c) {
            all.push({ key: c.key, value: c.value });
            c.continue();
          } else {
            db.close();
            const split = all.some(
              (r) => typeof r.value === 'object' && r.value !== null
                && '__pkc_split__' in (r.value as Record<string, unknown>),
            );
            const entryRecords = all.filter((r) => String(r.key).startsWith('__entry__:')).length;
            res({ split, entryRecords });
          }
        };
        cur.onerror = (): void => rej(cur.error);
      };
    });
  });
  expect(storageShape.split).toBe(true);
  expect(storageShape.entryRecords).toBeGreaterThanOrEqual(2);

  // reload → split 形式から完全に復元される(使用中ユーザーの再訪経路)
  await page.goto('/pkc2.html');
  await bootReady(page);
  const rows = page.locator('[data-pkc-region="entry-list"] li.pkc-entry-item');
  await expect(rows).toHaveCount(2);
  await rows.filter({ hasText: 'DiffProbe One' }).first().click();
  await expect(page.locator('[data-pkc-region="center"]')).toContainText('body of DiffProbe One');

  await page.screenshot({ path: 'test-results/differential-default-parity.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
