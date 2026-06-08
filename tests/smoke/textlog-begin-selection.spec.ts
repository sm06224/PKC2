/**
 * user bug 報告 2026-05-27:「MW モードだけかわからんが、textlog のログ選択
 * 開始ができなくなる事象が発生してる」 への回帰防止 smoke test。
 *
 * 直接の原因はコード review からは特定できなかった(unit test 47 件全 pass、
 * action-binder + reducer + presenter 経路に変更なし)。実 browser 固有の
 * regression を catch するため、Playwright で「Begin log selection」 button
 * を実 click → checkbox 表示までを verify する。
 *
 * 既存の textlog-deeplink-parity.spec.ts と同じ pattern で seed container +
 * navigate → button click → DOM 検証。
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

const TS = '2026-05-27T00:00:00Z';

const seedTextlogContainer = {
  meta: {
    container_id: 'c-textlog-select',
    title: 'textlog selection smoke',
    created_at: TS,
    updated_at: TS,
    schema_version: 1,
  },
  entries: [
    {
      lid: 'tl1',
      title: 'Test textlog',
      body: '[2026-05-27T10:00:00Z] First log entry\n\n[2026-05-27T11:00:00Z] Second log entry\n\n[2026-05-27T12:00:00Z] Third log entry',
      archetype: 'textlog',
      created_at: TS,
      updated_at: TS,
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

test.describe('textlog log selection — begin button regression check', () => {
  test('clicking "Begin log selection" reveals checkboxes on each log(user bug 2026-05-27)', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
    await bootReady(page);
    await seedContainer(page, seedTextlogContainer);
    await page.reload();
    await bootReady(page);

    // Open the textlog entry from sidebar
    const entryRow = page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="tl1"]').first();
    await expect(entryRow).toBeVisible({ timeout: 10_000 });
    await entryRow.click();

    // Verify textlog body rendered
    const textlogView = page.locator('.pkc-textlog-view').first();
    await expect(textlogView).toBeVisible({ timeout: 10_000 });

    // Begin button visible + clickable
    const beginBtn = page.locator('[data-pkc-action="begin-textlog-selection"]').first();
    await expect(beginBtn).toBeVisible({ timeout: 5_000 });
    await expect(beginBtn).toBeEnabled();

    // Click via real OS event(elementFromPoint 経由、CLAUDE.md §「描画と生成は別物」 規律)
    await beginBtn.click();

    // Selection mode entered:checkboxes appear on each log
    const checkboxes = page.locator('input[data-pkc-field="textlog-select"]');
    await expect(checkboxes).toHaveCount(3, { timeout: 5_000 });

    // Container data-attr set
    const view = page.locator('.pkc-textlog-view[data-pkc-textlog-selecting="true"]').first();
    await expect(view).toBeVisible();

    // Cancel button replaces Begin button
    const cancelBtn = page.locator('[data-pkc-action="cancel-textlog-selection"]').first();
    await expect(cancelBtn).toBeVisible();
  });

  test('checkbox toggle updates selection count(state mutation → consumer 観測の鎖)', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree');
    await bootReady(page);
    await seedContainer(page, seedTextlogContainer);
    await page.reload();
    await bootReady(page);

    const entryRow = page.locator('[data-pkc-region="entry-list"] [data-pkc-lid="tl1"]').first();
    await expect(entryRow).toBeVisible({ timeout: 10_000 });
    await entryRow.click();

    const beginBtn = page.locator('[data-pkc-action="begin-textlog-selection"]').first();
    await expect(beginBtn).toBeVisible({ timeout: 5_000 });
    await beginBtn.click();

    const firstCheck = page.locator('input[data-pkc-field="textlog-select"]').first();
    await firstCheck.check();

    const countLabel = page.locator('[data-pkc-region="textlog-select-count"]').first();
    await expect(countLabel).toHaveText(/1 log/i, { timeout: 5_000 });
  });
});
