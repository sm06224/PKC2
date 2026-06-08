/**
 * Keymap registry parity smoke(pgc-82、MASTER.md §4.6)。
 * 実 OS keyboard event で fresh shortcut(Alt+1 / F12 / Ctrl+K Ctrl+S)が
 * 発火することを確認(CLAUDE.md §10.5 規律)。
 */

import { test, expect } from '@playwright/test';

test.describe('Keymap registry parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.keymap_registry_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(700);
  });

  test('Alt+1 switches view-mode to detail', async ({ page }) => {
    // create an entry so view-mode tabs exist
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    // switch to calendar first, then back via Alt+1
    await page.click('[data-pkc-action="set-view-mode"][data-pkc-view-mode="calendar"]');
    await page.waitForTimeout(200);
    // Now press Alt+1
    await page.keyboard.press('Alt+1');
    await page.waitForTimeout(300);
    // detail tab should be active
    const detailTab = page.locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="detail"]');
    await expect(detailTab).toHaveAttribute('data-pkc-active', 'true');
  });

  test('F12 opens Flags Inspector', async ({ page }) => {
    await page.keyboard.press('F12');
    await page.waitForTimeout(400);
    const inspector = page.locator('.pkc-flags-inspector-overlay, [data-pkc-region="flags-inspector"]');
    await expect(inspector).toBeVisible();
  });

  test('Ctrl+K Ctrl+S chord opens shortcut help', async ({ page }) => {
    await page.keyboard.press('Control+K');
    await page.waitForTimeout(100);
    // 2nd chord
    await page.keyboard.press('Control+S');
    await page.waitForTimeout(400);
    const help = page.locator('[class*="shortcut"], [data-pkc-region*="shortcut"]');
    const count = await help.count();
    expect(count).toBeGreaterThan(0);
  });

  test('flag OFF: Alt+1 is no-op', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.keymap_registry_enabled=0&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.click('[data-pkc-action="set-view-mode"][data-pkc-view-mode="calendar"]');
    await page.waitForTimeout(200);
    await page.keyboard.press('Alt+1');
    await page.waitForTimeout(300);
    // Calendar tab should still be active(no-op confirmed)
    const detailTab = page.locator('[data-pkc-action="set-view-mode"][data-pkc-view-mode="detail"]');
    const isActive = await detailTab.getAttribute('data-pkc-active');
    expect(isActive).not.toBe('true');
  });
});
