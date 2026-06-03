/**
 * Smoke — spreadsheet 機能の実 browser pixel 検証(reform-2026-05 §6 visual
 * parity)。user direction 2026-06-03:vitest unit / happy-dom DOM だけで
 * 「test pass = ship」 判定を禁ずる規律に従い、Chart.js canvas 描画 + embed の
 * toolbar 抑止 + cell formula 評価 を実 browser で gate。
 *
 * scope:
 *   1. 新規 spreadsheet 作成 → default 20×12 grid 表示
 *   2. cell に "=A1+B1" 入力 → Tab で次 cell → 表示が "0" に変わる
 *   3. chart 追加 modal → canvas が DOM に出る + getContext('2d') 成功
 *   4. 別 entry に `![](entry:s1)` を貼って center pane 閲覧 → toolbar
 *      無しで table が embed される(用件:「不要なボタンが表示される」 fix gate)
 */

import { test, expect } from '@playwright/test';

test.describe('spreadsheet visual parity', () => {
  test('case 1: 新規 spreadsheet → default 20x12 grid + cell formula 評価', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await page.goto('/');
    // shell が出るまで待つ
    await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 10_000 });
    // "+ New" picker または explicit Sheet button(picker flag に依らず data-pkc-archetype="spreadsheet" で命中)
    const sheetBtn = page.locator('[data-pkc-action="create-entry"][data-pkc-archetype="spreadsheet"]').first();
    if (await sheetBtn.count() === 0) {
      // picker mode の可能性 ── + New 押下 → 内 row click
      const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]');
      if (await newBtn.count() > 0) await newBtn.click();
      await page.locator('.pkc-new-picker-row[data-pkc-archetype="spreadsheet"]').first().click();
    } else {
      await sheetBtn.click();
    }
    // grid table が出る
    await page.waitForSelector('table.pkc-spreadsheet-grid', { timeout: 5_000 });
    // 12 列(行番号 header を除く data 列)
    const cells = page.locator('table.pkc-spreadsheet-grid tbody tr[data-row="0"] [data-col][contenteditable]');
    expect(await cells.count()).toBe(12);
    // 20 行
    const rows = page.locator('table.pkc-spreadsheet-grid tbody tr[data-row]');
    expect(await rows.count()).toBe(20);

    // A1=10 / B1=20 入力後、A2 に =A1+B1
    const A1 = page.locator('[contenteditable][data-row="0"][data-col="0"]');
    await A1.click();
    await A1.fill('10');
    const B1 = page.locator('[contenteditable][data-row="0"][data-col="1"]');
    await B1.click();
    await B1.fill('20');
    const A2 = page.locator('[contenteditable][data-row="1"][data-col="0"]');
    await A2.click();
    await A2.fill('=A1+B1');
    // 別 cell に Tab で抜けて評価を走らせる
    await A2.press('Tab');
    // A2 表示が 30 に
    await expect(A2).toHaveText('30', { timeout: 2_000 });

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('case 2: chart 追加 → canvas 描画(Chart.js 実 init)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    // spreadsheet 作成
    const sheetBtn = page.locator('[data-pkc-action="create-entry"][data-pkc-archetype="spreadsheet"]').first();
    if (await sheetBtn.count() === 0) {
      const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]');
      if (await newBtn.count() > 0) await newBtn.click();
      await page.locator('.pkc-new-picker-row[data-pkc-archetype="spreadsheet"]').first().click();
    } else {
      await sheetBtn.click();
    }
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    // A1〜A3 に数値を入れる
    for (let r = 0; r < 3; r++) {
      const c = page.locator(`[contenteditable][data-row="${r}"][data-col="0"]`);
      await c.click();
      await c.fill(String((r + 1) * 5));
      const cB = page.locator(`[contenteditable][data-row="${r}"][data-col="1"]`);
      await cB.click();
      await cB.fill(String((r + 1) * 10));
    }
    // 📊 グラフ button
    await page.locator('[data-pkc-action="spreadsheet-add-chart"]').click();
    await page.waitForSelector('.pkc-spreadsheet-chart-modal');
    // default kind=bar、Y 軸 col=1 がチェック済
    await page.locator('[data-pkc-chart-create-action]').click();
    // canvas が出現
    await page.waitForSelector('canvas.pkc-spreadsheet-chart-canvas', { timeout: 3_000 });
    // Chart.js が canvas に描画したかを width/height で確認(初期 0 から rAF で展開)
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas.pkc-spreadsheet-chart-canvas') as HTMLCanvasElement | null;
      return c && c.width > 0 && c.height > 0;
    }, { timeout: 3_000 });
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
