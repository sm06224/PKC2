/**
 * Split View parity smoke(pgc-89、MASTER.md §4.3 / §5.5)。
 */

import { test, expect } from '@playwright/test';

test.describe('Split View parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.split_view_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(500);
    // create an entry to give split view something to render
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('SplitTarget');
    const body = page.locator('[data-pkc-field="body"]');
    await body.focus();
    await page.keyboard.type('# Hello\n\nBody paragraph');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  });

  test('Command Palette → split-view.toggle opens secondary pane', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('split');
    const item = page.locator('[data-pkc-cmd-id="split-view.toggle"]').first();
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error('item bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(400);
    const splitPane = page.locator('[data-pkc-region="split-view"]');
    await expect(splitPane).toBeVisible();
    // shows the title
    await expect(splitPane.locator('.pkc-split-view-title')).toContainText('Split View');
    // body element exists(rendered content may vary by save flow)
    await expect(splitPane.locator('.pkc-split-view-body')).toBeVisible();
  });

  test('clicking × in split pane closes it', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('split');
    await page.locator('[data-pkc-cmd-id="split-view.toggle"]').first().click();
    await page.waitForTimeout(400);
    const splitPane = page.locator('[data-pkc-region="split-view"]');
    await expect(splitPane).toBeVisible();
    // close
    const close = splitPane.locator('.pkc-split-view-close').first();
    await close.click();
    await page.waitForTimeout(400);
    await expect(splitPane).toHaveCount(0);
  });

  test('flag OFF: split-view.toggle command is no-op', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.split_view_enabled=0&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    await page.click('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    await page.waitForTimeout(200);
    await page.locator('[data-pkc-field="title"]').fill('NoSplit');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+Shift+P');
    await page.locator('[data-pkc-field="cmd-query"]').fill('split');
    const item = page.locator('[data-pkc-cmd-id="split-view.toggle"]').first();
    await item.click();
    await page.waitForTimeout(400);
    const splitPane = page.locator('[data-pkc-region="split-view"]');
    await expect(splitPane).toHaveCount(0);
  });
});
