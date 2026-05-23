/**
 * Universal context menu parity smoke(pgc-83、MASTER.md §4.7)。
 * 実 OS right-click event で region 別 menu が出ることを確認。
 */

import { test, expect } from '@playwright/test';

test.describe('Universal context menu parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.context_menu_universal_enabled=1&pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(700);
  });

  test('right-click header opens region-aware menu', async ({ page }) => {
    // header の空白部 ── topbar region 内の create-actions 横を狙う
    const header = page.locator('.pkc-header').first();
    const box = await header.boundingBox();
    if (!box) throw new Error('header bbox missing');
    // header の中央(空白) を右クリック
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-region="context-menu"]');
    await expect(menu).toBeVisible();
    const region = await menu.getAttribute('data-pkc-context-region');
    // header または unknown(headertarget が region attr 持たない場合)
    expect(['header', 'unknown', 'center']).toContain(region ?? '');
    // dismiss
    await page.keyboard.press('Escape');
  });

  test('right-click center pane (background) opens center menu', async ({ page }) => {
    // about view が boot で center に出ている ── その中央を右クリック
    const center = page.locator('[data-pkc-region="center"]').first();
    const box = await center.boundingBox();
    if (!box) throw new Error('center bbox missing');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-region="context-menu"]');
    await expect(menu).toBeVisible();
    // create.text は center region menu に含まれる
    const createItem = menu.locator('[data-pkc-cmd-id="entry.create.text"]');
    await expect(createItem).toBeVisible();
  });

  test('flag OFF: right-click center does NOT show region menu', async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.context_menu_universal_enabled=0');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    const center = page.locator('[data-pkc-region="center"]').first();
    const box = await center.boundingBox();
    if (!box) throw new Error('center bbox missing');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    // PKC2 context-menu element が出ない(browser native は別経路)
    const menu = page.locator('[data-pkc-region="context-menu"]');
    await expect(menu).toHaveCount(0);
  });

  test('clicking menu item executes command (entry.create.text)', async ({ page }) => {
    const center = page.locator('[data-pkc-region="center"]').first();
    const box = await center.boundingBox();
    if (!box) throw new Error('center bbox');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
    await page.waitForTimeout(400);
    const menu = page.locator('[data-pkc-region="context-menu"]');
    await expect(menu).toBeVisible();
    const item = menu.locator('[data-pkc-cmd-id="entry.create.text"]').first();
    const ibox = await item.boundingBox();
    if (!ibox) throw new Error('item bbox');
    await page.mouse.click(ibox.x + ibox.width / 2, ibox.y + ibox.height / 2);
    // menu 閉じる + create-entry が dispatch されたはず ── title input が
    // visible に
    await page.waitForTimeout(400);
    await expect(menu).toBeHidden();
    const titleInput = page.locator('[data-pkc-field="title"]');
    await expect(titleInput).toBeVisible();
  });
});
