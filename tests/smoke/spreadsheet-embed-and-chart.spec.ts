/**
 * Smoke — spreadsheet 機能の実 browser pixel 検証(reform-2026-05 §6 visual
 * parity)。user direction 2026-06-03:vitest unit / happy-dom DOM だけで
 * 「test pass = ship」 判定を禁ずる規律に従い、Chart.js canvas 描画 + embed の
 * toolbar 抑止 + cell formula 評価 を実 browser で gate。
 */

import { test, expect, type Page } from '@playwright/test';

async function createNewSpreadsheet(page: Page): Promise<void> {
  // picker mode default ON → `+ New` popover を開いて Sheet row click。
  // OFF の場合は explicit button が直接見える。
  const newBtn = page.locator('[data-pkc-action="toggle-new-picker"]').first();
  if (await newBtn.count() > 0) {
    await newBtn.click();
    await page.locator('.pkc-new-picker-row[data-pkc-archetype="spreadsheet"]').first().click();
  } else {
    await page.locator('.pkc-btn-create[data-pkc-archetype="spreadsheet"]').first().click();
  }
}

test.describe('spreadsheet visual parity', () => {
  test('case 1: 新規 spreadsheet → default 20x12 grid + cell formula 評価', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    });
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]', { timeout: 10_000 });
    await createNewSpreadsheet(page);
    await page.waitForSelector('table.pkc-spreadsheet-grid', { timeout: 5_000 });
    // 12 列 × 20 行
    const cellsRow0 = page.locator('table.pkc-spreadsheet-grid tbody tr[data-row="0"] [data-col][contenteditable]');
    expect(await cellsRow0.count()).toBe(12);
    const rows = page.locator('table.pkc-spreadsheet-grid tbody tr[data-row]');
    expect(await rows.count()).toBe(20);

    // A1=10 / B1=20 入力後、A2 に =A1+B1
    const A1 = page.locator('[contenteditable][data-row="0"][data-col="0"]');
    await A1.click(); await A1.fill('10');
    const B1 = page.locator('[contenteditable][data-row="0"][data-col="1"]');
    await B1.click(); await B1.fill('20');
    const A2 = page.locator('[contenteditable][data-row="1"][data-col="0"]');
    await A2.click(); await A2.fill('=A1+B1');
    await A2.press('Tab');
    await expect(A2).toHaveText('30', { timeout: 2_000 });

    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('case 2: chart 追加 modal → canvas 描画(Chart.js 実 init)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await createNewSpreadsheet(page);
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    // A1〜A3 / B1〜B3 に数値
    for (let r = 0; r < 3; r++) {
      const cA = page.locator(`[contenteditable][data-row="${r}"][data-col="0"]`);
      await cA.click(); await cA.fill(String((r + 1) * 5));
      const cB = page.locator(`[contenteditable][data-row="${r}"][data-col="1"]`);
      await cB.click(); await cB.fill(String((r + 1) * 10));
    }
    await page.locator('[data-pkc-action="spreadsheet-add-chart"]').click();
    await page.waitForSelector('.pkc-spreadsheet-chart-modal');
    await page.locator('[data-pkc-chart-create-action]').click();
    await page.waitForSelector('canvas.pkc-spreadsheet-chart-canvas', { timeout: 3_000 });
    // Chart.js が canvas に実描画したか:width/height > 0
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas.pkc-spreadsheet-chart-canvas') as HTMLCanvasElement | null;
      return c !== null && c.width > 0 && c.height > 0;
    }, { timeout: 3_000 });
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('case 3: 不要な export button が embed view(transclusion)に出ない', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    // PKC2 内部 helper(window.expandTransclusions は internal、access が無い場合は
    // skip)で直接 transclusion を起動し embed 結果の DOM 構造を測定。
    // 1) spreadsheet を 1 件作成して save → lid 取得(save しないと editing phase
    // のままで CREATE_ENTRY が blocked + 「+ New」 button も hidden)
    await createNewSpreadsheet(page);
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    const lid = await page.locator('[data-pkc-spreadsheet-lid]').first().getAttribute('data-pkc-spreadsheet-lid');
    expect(lid).toBeTruthy();
    // header commit-edit button で spreadsheet 編集を確定 → view mode へ
    await page.locator('button[data-pkc-action="commit-edit"]').first().click();
    // view mode で「+ New」 button が再出現するのを wait
    await page.waitForSelector('[data-pkc-action="toggle-new-picker"], .pkc-btn-create[data-pkc-archetype="text"]', { timeout: 3_000 });
    // 2) 別 entry を作って markdown body に `![](entry:LID)` を入れて commit
    const newBtn2 = page.locator('[data-pkc-action="toggle-new-picker"]').first();
    if (await newBtn2.count() > 0) {
      await newBtn2.click();
      await page.locator('.pkc-new-picker-row[data-pkc-archetype="text"]').first().click();
    } else {
      await page.locator('.pkc-btn-create[data-pkc-archetype="text"]').first().click();
    }
    const textBody = page.locator('textarea[data-pkc-field="body"]').first();
    await textBody.waitFor({ timeout: 3_000 });
    await textBody.fill(`![](entry:${lid})`);
    // header commit-edit ボタン押下(複数 button マッチ回避のため id 指定)
    const saveBtn = page.locator('button[data-pkc-action="commit-edit"]').first();
    await saveBtn.click({ trial: false }).catch(() => undefined);
    // 3) view mode に戻るまで wait + embed body の存在 / toolbar 排除を測る
    // commit 後 detail-presenter が markdown 経由で transclusion を展開する
    await expect(page.locator('.pkc-spreadsheet-embed table.pkc-spreadsheet')).toBeVisible({ timeout: 5_000 });
    const embedToolbar = page.locator('.pkc-spreadsheet-embed .pkc-spreadsheet-toolbar');
    expect(await embedToolbar.count()).toBe(0);
    const embedExport = page.locator('.pkc-spreadsheet-embed [data-pkc-action="spreadsheet-export-csv"]');
    expect(await embedExport.count()).toBe(0);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
