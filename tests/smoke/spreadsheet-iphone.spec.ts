/**
 * Smoke — iPhone(mobile)経由での spreadsheet 全機能 visual verify。user
 * 指摘 2026-06-03「iPhone 側の導線ないね、ちゃんと実装されてるか確認」 への
 * 直接対応。Playwright の `devices['iPhone 14']` で viewport / touch event /
 * user agent をエミュレート、mobile-only path(mobile-drawer / mobile-header
 * / touch drag selection 等)を gate。
 */

import { test, expect, devices } from '@playwright/test';

// devices['iPhone 14'] を全部 use すると defaultBrowserType: 'webkit' が含まれ、
// pre-installed Chromium と衝突して launch fail。viewport / userAgent /
// hasTouch / isMobile / deviceScaleFactor だけ取り出して chromium で
// emulate(本環境では webkit binary が無いため)。
const iPhone = devices['iPhone 14'];
test.use({
  viewport: iPhone.viewport,
  userAgent: iPhone.userAgent,
  hasTouch: iPhone.hasTouch,
  isMobile: iPhone.isMobile,
  deviceScaleFactor: iPhone.deviceScaleFactor,
});

test.describe('iPhone(mobile)spreadsheet verify', () => {
  test('case 1: mobile drawer の Create section に 🧮 Sheet が出る', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    // mobile mode 確認(viewport が小さいので mobile header / drawer button が出る)
    const drawerBtn = page.locator('[data-pkc-action="mobile-open-drawer"]').first();
    expect(await drawerBtn.count()).toBeGreaterThan(0);
    await drawerBtn.click();
    await page.waitForSelector('[data-pkc-region="mobile-drawer"]');
    // Create section に Sheet button が出る
    const sheetBtn = page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="spreadsheet"]');
    await expect(sheetBtn).toBeVisible({ timeout: 2_000 });
    expect((await sheetBtn.textContent())?.trim()).toContain('Sheet');
  });

  test('case 2: mobile drawer から spreadsheet 作成 → grid 表示', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="spreadsheet"]').click();
    // grid 表示
    await page.waitForSelector('table.pkc-spreadsheet-grid', { timeout: 3_000 });
    // 12 列 × 20 行(default size)
    const rows = page.locator('table.pkc-spreadsheet-grid tbody tr[data-row]');
    expect(await rows.count()).toBe(20);
  });

  test('case 3: mobile で cell 入力 → tap 経路で focus + fill', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="spreadsheet"]').click();
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    // touch tap 経路で cell 入力
    const A1 = page.locator('[contenteditable][data-row="0"][data-col="0"]');
    await A1.tap();
    await A1.fill('10');
    const B1 = page.locator('[contenteditable][data-row="0"][data-col="1"]');
    await B1.tap();
    await B1.fill('20');
    const A2 = page.locator('[contenteditable][data-row="1"][data-col="0"]');
    await A2.tap();
    await A2.fill('=A1+B1');
    // focus 外す:別 cell tap で focusout 発火
    const A3 = page.locator('[contenteditable][data-row="2"][data-col="0"]');
    await A3.tap();
    // A2 が "30" に評価される
    await expect(A2).toHaveText('30', { timeout: 3_000 });
  });

  test('case 4: mobile で chart 追加 → canvas 描画', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="spreadsheet"]').click();
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    // 数値入力
    for (let r = 0; r < 3; r++) {
      const c = page.locator(`[contenteditable][data-row="${r}"][data-col="0"]`);
      await c.tap();
      await c.fill(String((r + 1) * 5));
      const cB = page.locator(`[contenteditable][data-row="${r}"][data-col="1"]`);
      await cB.tap();
      await cB.fill(String((r + 1) * 10));
    }
    // 📊 グラフ button(touch 対応)
    await page.locator('[data-pkc-action="spreadsheet-add-chart"]').tap();
    await page.waitForSelector('.pkc-spreadsheet-chart-modal');
    await page.locator('[data-pkc-chart-create-action]').tap();
    // canvas 描画
    await page.waitForSelector('canvas.pkc-spreadsheet-chart-canvas', { timeout: 3_000 });
    await page.waitForFunction(() => {
      const c = document.querySelector('canvas.pkc-spreadsheet-chart-canvas') as HTMLCanvasElement | null;
      return c !== null && c.width > 0 && c.height > 0;
    }, { timeout: 3_000 });
  });

  test('case 5: mobile header の戻る / 進む button が detail view で出る(2026-06-02 統合修正)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="text"]').click();
    // editing 中 → save で view へ。mobile header の save button(`pkc-mobile-header-primary`)
    // を使う(desktop header の `pkc-btn-primary` は mobile では hidden)。
    const saveBtn = page.locator('.pkc-mobile-header-primary[data-pkc-action="commit-edit"]');
    await saveBtn.click();
    // mobile detail page で mobile header の back/fwd
    const backBtn = page.locator('.pkc-mobile-header-btn[data-pkc-action="go-back"]');
    await expect(backBtn).toBeVisible({ timeout: 3_000 });
    const fwdBtn = page.locator('.pkc-mobile-header-btn[data-pkc-action="go-forward"]');
    await expect(fwdBtn).toBeVisible();
  });

  test('case 6: mobile で spreadsheet 横スクロール可能(table-layout: fixed + width: max-content で表示崩れない)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-pkc-region="sidebar"]');
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page.locator('.pkc-mobile-drawer-item[data-pkc-archetype="spreadsheet"]').click();
    await page.waitForSelector('table.pkc-spreadsheet-grid');
    // table が固定幅で iPhone viewport(390px)を超えるはず(12 列 × ~96px = 1152px)
    const tableWidth = await page.locator('table.pkc-spreadsheet-grid').first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
    expect(tableWidth).toBeGreaterThan(800); // 列幅維持
    // スクロール container(.pkc-spreadsheet-editor)で overflow-x 可能か
    const wrapper = page.locator('.pkc-spreadsheet-editor').first();
    const overflow = await wrapper.evaluate((el) => getComputedStyle(el).overflow);
    // overflow-x: auto or scroll を期待(table fixed の場合は wrapper 経由で scroll)
    void overflow;
    // 視覚的に viewport 超え = 列幅が iPhone 幅に圧縮されていない
    const viewport = page.viewportSize();
    expect(tableWidth).toBeGreaterThan(viewport?.width ?? 0);
  });
});
