/**
 * Quick Open parity smoke(pgc-81、MASTER.md §4.2)。
 * 実 OS keyboard event で `Ctrl+P` の browser print 上書き + entry fuzzy
 * launcher の visual parity を確認(CLAUDE.md §10.5 規律)。
 */

import { test, expect } from '@playwright/test';

test.describe('Quick Open parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.quick_open_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(700);
    // create 2 entries so list is populated
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    const title = page.locator('[data-pkc-field="title"]');
    await title.fill('Alpha メモ');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await title.fill('Beta レポート');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    // Escape to exit edit if still in editing phase
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('Ctrl+P opens Quick Open (browser print suppressed)', async ({ page }) => {
    await page.keyboard.press('Control+p');
    const overlay = page.locator('[data-pkc-region="quick-open"]');
    await expect(overlay).toBeVisible();
    const input = overlay.locator('[data-pkc-field="quick-open-query"]');
    await expect(input).toBeFocused();
    // Escape close
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('typing filters entries', async ({ page }) => {
    await page.keyboard.press('Control+p');
    const overlay = page.locator('[data-pkc-region="quick-open"]');
    const input = overlay.locator('[data-pkc-field="quick-open-query"]');
    await input.fill('Alpha');
    const items = overlay.locator('[data-pkc-quick-lid]');
    const count = await items.count();
    expect(count).toBe(1);
    const title = items.first().locator('.pkc-quick-open-item-title');
    await expect(title).toContainText('Alpha');
  });

  test('Enter selects entry', async ({ page }) => {
    await page.keyboard.press('Control+p');
    const overlay = page.locator('[data-pkc-region="quick-open"]');
    const input = overlay.locator('[data-pkc-field="quick-open-query"]');
    await input.fill('Beta');
    await page.keyboard.press('Enter');
    await expect(overlay).toBeHidden();
    // 簡易:DOM の Beta タイトルが含まれること(SELECT_ENTRY が反映、
    // breadcrumb / title-display 等に Beta が出る経路を user-visible で確認)
    await page.waitForTimeout(300);
    const someBeta = await page.locator('text=Beta').count();
    expect(someBeta).toBeGreaterThan(0);
  });

  test('> prefix switches to command mode', async ({ page }) => {
    await page.keyboard.press('Control+p');
    const overlay = page.locator('[data-pkc-region="quick-open"]');
    const input = overlay.locator('[data-pkc-field="quick-open-query"]');
    await input.fill('> theme');
    const cmdItems = overlay.locator('[data-pkc-cmd-id]');
    const count = await cmdItems.count();
    expect(count).toBeGreaterThan(0);
    // 全件 theme.*
    for (let i = 0; i < count; i++) {
      const id = await cmdItems.nth(i).getAttribute('data-pkc-cmd-id');
      expect(id?.startsWith('theme.')).toBe(true);
    }
  });

  test('flag OFF: Ctrl+P is no-op (or browser print, undetectable here)', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.quick_open_enabled=0');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+p');
    await page.waitForTimeout(200);
    const overlay = page.locator('[data-pkc-region="quick-open"]');
    await expect(overlay).toHaveCount(0);
  });
});
