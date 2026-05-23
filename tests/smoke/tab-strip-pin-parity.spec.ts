/**
 * Tab pin parity smoke(pgc-88、MASTER.md §4.3)。
 */

import { test, expect } from '@playwright/test';

test.describe('Tab pin parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.evaluate(() => { try { localStorage.removeItem('pkc2.tabStrip'); } catch {} });
    await page.reload();
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(500);
  });

  test('Command Palette → pin active tab → 🔒 shows', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('PinMe');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Open Command Palette
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('pin');
    const item = page.locator('[data-pkc-cmd-id="tab.toggle-pin-active"]').first();
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error('item bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);

    // pinned tab should show 🔒
    const pinBtn = page.locator('[data-pkc-region="tab-strip"] .pkc-tab-pin');
    await expect(pinBtn).toBeVisible();
    await expect(pinBtn).toContainText('🔒');
  });

  test('clicking 🔒 unpins the tab (× reappears)', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('Toggle');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // pin via Palette
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('pin');
    await page.locator('[data-pkc-cmd-id="tab.toggle-pin-active"]').first().click();
    await page.waitForTimeout(400);

    const pinBtn = page.locator('[data-pkc-region="tab-strip"] .pkc-tab-pin').first();
    await pinBtn.click();
    await page.waitForTimeout(400);

    // Now unpinned → × button visible
    const close = page.locator('[data-pkc-region="tab-strip"] .pkc-tab-close');
    await expect(close).toBeVisible();
    await expect(page.locator('[data-pkc-region="tab-strip"] .pkc-tab-pin')).toHaveCount(0);
  });

  test('Ctrl+W on pinned active tab is no-op', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(150);
    await page.locator('[data-pkc-field="title"]').fill('Pinned');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // pin via Palette
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('pin');
    await page.locator('[data-pkc-cmd-id="tab.toggle-pin-active"]').first().click();
    await page.waitForTimeout(400);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const before = await tabs.count();
    expect(before).toBe(1);

    // Ctrl+W ── pinned だから no-op のはず
    await page.locator('[data-pkc-region="sidebar"]').first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+w');
    await page.waitForTimeout(400);

    const after = await tabs.count();
    expect(after).toBe(before); // 変化なし
  });
});
