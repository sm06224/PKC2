/**
 * Tab strip parity smoke(pgc-85、MASTER.md §4.3)。
 * 実 OS click event で tab open/close/switch を検証。
 */

import { test, expect } from '@playwright/test';

test.describe('Tab strip parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(600);
  });

  test('open 2 entries → 2 tabs in strip', async ({ page }) => {
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('Alpha');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('Beta');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('click tab → SELECT_ENTRY (switch active)', async ({ page }) => {
    // Setup: 2 entries
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('First');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);

    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('Second');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Both tabs exist
    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    expect(await tabs.count()).toBeGreaterThanOrEqual(2);

    // Click on First tab — switching active
    const firstTab = tabs.filter({ hasText: 'First' }).first();
    await firstTab.click();
    await page.waitForTimeout(400);

    // First is now active(class match で具体的に確認)
    const firstActive = await firstTab.evaluate((el) => el.classList.contains('pkc-tab-active'));
    expect(firstActive).toBe(true);
  });

  test('click × button closes tab', async ({ page }) => {
    // create 2 entries
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('Stay');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('Close');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    const tabs = page.locator('[data-pkc-region="tab-strip"] .pkc-tab');
    const before = await tabs.count();
    expect(before).toBeGreaterThanOrEqual(2);

    // close the Close tab
    const closeTab = tabs.filter({ hasText: 'Close' }).first();
    const closeBtn = closeTab.locator('.pkc-tab-close').first();
    await closeBtn.click();
    await page.waitForTimeout(300);

    const after = await tabs.count();
    expect(after).toBe(before - 1);
  });

  test('flag OFF: tab strip not rendered', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.tabs_enabled=0');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(300);
    const strip = page.locator('[data-pkc-region="tab-strip"]');
    await expect(strip).toHaveCount(0);
  });
});
