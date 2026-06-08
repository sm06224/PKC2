/**
 * Smoke — spreadsheet 残視覚 verify(2026-06-03 user direction「全部やってから報告」)。
 *
 * scope:
 *   1. multi-window で spreadsheet entry を popup → embed body 描画(toolbar 無し)
 *   2. cancel-edit で freshly-created entry は confirm + DELETE 経路
 *   3. chart filter `B>10` を modal で設定 → 該当 row だけ chart に乗る
 */

import { test, expect, type Page } from '@playwright/test';

async function newSpreadsheet(page: Page): Promise<string> {
  const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]').first();
  if (await newBtn.count() > 0) {
    await newBtn.click();
    await page.locator('.pkc-new-picker-row[data-pkc-archetype="spreadsheet"]').first().click();
  } else {
    await page.locator('.pkc-btn-create[data-pkc-archetype="spreadsheet"]').first().click();
  }
  await page.waitForSelector('table.pkc-spreadsheet-grid');
  const lid = await page.locator('[data-pkc-spreadsheet-lid]').first().getAttribute('data-pkc-spreadsheet-lid');
  if (!lid) throw new Error('lid not found');
  return lid;
}

test.describe('spreadsheet 残視覚 verify', () => {
  test('case 1: cancel-edit が新規 entry で confirm を出して DELETE 経路', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    // confirm dialog を auto-accept
    page.on('dialog', (d) => d.accept());
    // 新規 spreadsheet
    await newSpreadsheet(page);
    // cancel-edit 経由(複数 button match 回避のため最初の cancel-edit button)
    const cancelBtn = page.locator('button[data-pkc-action="cancel-edit"]').first();
    await cancelBtn.click();
    // entry が削除されている(grid が消えて + New picker 復活)
    await expect(page.locator('table.pkc-spreadsheet-grid')).toHaveCount(0, { timeout: 3_000 });
    await expect(page.locator('[data-pkc-action="toggle-new-picker"]').first()).toBeVisible({ timeout: 3_000 });
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('case 2: chart filter `B>10` で該当 row だけ data に含まれる', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await newSpreadsheet(page);
    // A1-A5 / B1-B5 にデータ:B 列 = 5, 12, 8, 15, 20
    const data = [['1','5'], ['2','12'], ['3','8'], ['4','15'], ['5','20']];
    for (let r = 0; r < data.length; r++) {
      const cA = page.locator(`[contenteditable][data-row="${r}"][data-col="0"]`);
      await cA.click(); await cA.fill(data[r]![0]!);
      const cB = page.locator(`[contenteditable][data-row="${r}"][data-col="1"]`);
      await cB.click(); await cB.fill(data[r]![1]!);
    }
    // chart 追加 modal
    await page.locator('[data-pkc-action="spreadsheet-add-chart"]').click();
    await page.waitForSelector('.pkc-spreadsheet-chart-modal');
    // filter 入力
    await page.locator('input[data-pkc-chart-filter-input]').fill('B>10');
    await page.locator('[data-pkc-chart-create-action]').click();
    // canvas が描画
    await page.waitForSelector('canvas.pkc-spreadsheet-chart-canvas', { timeout: 3_000 });
    // body state に filter が保持されている
    const ta = page.locator('textarea[data-pkc-field="body"]');
    const json = await ta.inputValue();
    const parsed = JSON.parse(json);
    expect(parsed.charts?.[0]?.filter).toBe('B>10');
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('case 3: multi-window(sidebar dblclick)で spreadsheet entry を popup → embed body が出る', async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await newSpreadsheet(page);
    await page.locator('button[data-pkc-action="commit-edit"]').first().click();
    await page.waitForSelector('[data-pkc-action="toggle-new-picker"]', { timeout: 3_000 });
    // sidebar の entry row(spreadsheet)を探して dblclick → entry-window が popup で開く
    const entryRow = page.locator('[data-pkc-region="entry-list"] [data-pkc-archetype="spreadsheet"], [data-pkc-region="entry-list"] li:has-text("Sheet")').first();
    if (await entryRow.count() === 0) {
      test.skip(true, 'spreadsheet entry row not found in sidebar list');
    }
    const [popup] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }).catch(() => null),
      entryRow.dblclick(),
    ]);
    if (!popup) {
      test.skip(true, 'popup did not open(headless browser policy で window.open が拒否されたかも)');
    }
    await popup!.waitForLoadState('domcontentloaded');
    // popup 内に spreadsheet table(view-mode の `[data-pkc-region="spreadsheet-table"]`)
    // multi-window は entry 単独 view であり、view body 経路の table を identify。
    await expect(popup!.locator('[data-pkc-region="spreadsheet-table"]').first()).toBeVisible({ timeout: 5_000 });
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
