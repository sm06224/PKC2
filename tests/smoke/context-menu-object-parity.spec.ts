/**
 * Object-aware context menu parity smoke(pgc-84、MASTER.md §4.7)。
 * 実 OS right-click event で link / image / heading / selection の object 別
 * menu が出ることを確認。
 */

import { test, expect } from '@playwright/test';

test.describe('Object-aware context menu parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.context_menu_universal_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(700);
    // Grant clipboard permission
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  test('right-click on heading in About view → heading object menu', async ({ page }) => {
    // About view should have h1/h2 headings(boot 時 自動表示)
    const heading = page.locator('[data-pkc-region="about-view"] h1, [data-pkc-region="about-view"] h2').first();
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    if (!box) throw new Error('heading bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-context-object="heading"]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-pkc-cmd-id="object.copy-heading-text"]')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('right-click on link → link object menu', async ({ page }) => {
    // About view にはリリースリンク等あるはず
    const link = page.locator('[data-pkc-region="about-view"] a').first();
    const count = await link.count();
    if (count === 0) {
      test.skip(true, 'no link in about view');
      return;
    }
    const box = await link.boundingBox();
    if (!box) throw new Error('link bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-context-object="link"]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-pkc-cmd-id="object.open-link"]')).toBeVisible();
    await expect(menu.locator('[data-pkc-cmd-id="object.copy-link-url"]')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('right-click on selected text → selection menu', async ({ page }) => {
    // about-view の段落テキストを programmatic に select
    await page.evaluate(() => {
      const p = document.querySelector('[data-pkc-region="about-view"] p');
      if (!p) return;
      const range = document.createRange();
      range.selectNodeContents(p);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    });
    await page.waitForTimeout(200);
    const p = page.locator('[data-pkc-region="about-view"] p').first();
    const box = await p.boundingBox();
    if (!box) throw new Error('p bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-context-object="selection"]');
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-pkc-cmd-id="object.copy-selection"]')).toBeVisible();
    await expect(menu.locator('[data-pkc-cmd-id="object.copy-as-quote"]')).toBeVisible();
  });

  test('flag OFF: right-click on link does NOT show object menu', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.context_menu_universal_enabled=0');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    const link = page.locator('[data-pkc-region="about-view"] a').first();
    const count = await link.count();
    if (count === 0) {
      test.skip(true, 'no link');
      return;
    }
    const box = await link.boundingBox();
    if (!box) return;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-context-object]');
    await expect(menu).toHaveCount(0);
  });
});
