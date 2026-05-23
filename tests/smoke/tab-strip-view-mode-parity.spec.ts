/**
 * View tab(workspace-level)parity smoke(pgc-87、MASTER.md §4.3)。
 */

import { test, expect } from '@playwright/test';

test.describe('View tab parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.evaluate(() => { try { localStorage.removeItem('pkc2.tabStrip'); } catch {} });
    await page.reload();
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(500);
  });

  test('Command Palette → view-tab.open.calendar creates view tab + switches mode', async ({ page }) => {
    // Open Command Palette
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    await expect(overlay).toBeVisible();
    const input = overlay.locator('[data-pkc-field="cmd-query"]');
    await input.fill('カレンダーを tab');
    const item = overlay.locator('[data-pkc-cmd-id="view-tab.open.calendar"]').first();
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error('item bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);

    // tab strip に Calendar tab が出る
    const viewTab = page.locator('[data-pkc-region="tab-strip"] [data-pkc-action="switch-view-tab"][data-pkc-view-mode="calendar"]');
    await expect(viewTab).toBeVisible();
    await expect(viewTab).toHaveClass(/pkc-tab-active/);

    // 中央 pane が calendar view に
    const calendar = page.locator('[data-pkc-region*="calendar"]');
    expect(await calendar.count()).toBeGreaterThan(0);
  });

  test('clicking view tab switches mode and activates tab', async ({ page }) => {
    // open 2 view tabs(calendar / graph)
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('カレンダーを tab');
    await page.locator('[data-pkc-cmd-id="view-tab.open.calendar"]').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('グラフを tab');
    await page.locator('[data-pkc-cmd-id="view-tab.open.graph"]').first().click();
    await page.waitForTimeout(400);

    const graphTab = page.locator('[data-pkc-action="switch-view-tab"][data-pkc-view-mode="graph"]').first();
    await expect(graphTab).toHaveClass(/pkc-tab-active/);

    // click calendar tab
    const calTab = page.locator('[data-pkc-action="switch-view-tab"][data-pkc-view-mode="calendar"]').first();
    await calTab.click();
    await page.waitForTimeout(300);
    await expect(calTab).toHaveClass(/pkc-tab-active/);
    // graph not active anymore
    const graphActive = await graphTab.evaluate((el) => el.classList.contains('pkc-tab-active'));
    expect(graphActive).toBe(false);
  });

  test('close view tab × removes from strip', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('カレンダーを tab');
    await page.locator('[data-pkc-cmd-id="view-tab.open.calendar"]').first().click();
    await page.waitForTimeout(400);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const before = await tabs.count();
    expect(before).toBeGreaterThanOrEqual(1);

    const calTab = page.locator('[data-pkc-action="switch-view-tab"][data-pkc-view-mode="calendar"]').first();
    await calTab.locator('.pkc-tab-close').first().click();
    await page.waitForTimeout(400);

    const after = await tabs.count();
    expect(after).toBe(before - 1);
  });
});
