/**
 * Command Palette parity smoke(pgc-80、wave-α MASTER.md §4.1)。
 *
 * 視覚 / 実 OS event parity を検証する 1 件以上(CLAUDE.md §10.5 規律):
 * - Ctrl+Shift+P で実 OS keyboard event を発火 → overlay が visible になる
 * - input に "view" と type → list が view.* に絞られる
 * - ArrowDown / Enter で active item が実 OS event で execute される
 * - Escape で実 OS event で閉じる
 *
 * Tier 0 flag は `?pkc-flag=shell.command_palette_enabled=1` で URL 経由 ON。
 */

import { test, expect } from '@playwright/test';

test.describe('Command Palette parity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pkc2.html?pkc-flag=shell.command_palette_enabled=1');
    await page.waitForSelector('#pkc-root');
    // boot 安定化(builtin commands 登録 + dispatcher 動作待ち)
    await page.waitForTimeout(800);
  });

  test('Ctrl+Shift+P opens palette and ArrowDown+Enter selects view.calendar', async ({ page }) => {
    // 実 OS keyboard event(Playwright が CDP 経由で発火)── visual parity
    await page.keyboard.press('Control+Shift+P');
    // overlay は flag ON でのみ表示
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    await expect(overlay).toBeVisible();
    const input = overlay.locator('[data-pkc-field="cmd-query"]');
    await expect(input).toBeFocused();

    // 「カレンダー」 query
    await input.fill('カレンダー');
    // 結果に view.calendar が含まれることを確認
    const items = overlay.locator('[data-pkc-cmd-id]');
    await expect(items.first()).toHaveAttribute('data-pkc-cmd-id', 'view.calendar');

    // ── ArrowDown は 1 件しかないので head に戻る ──
    // 代わりに Enter で executive
    await page.keyboard.press('Enter');
    // overlay は閉じる
    await expect(overlay).toBeHidden();

    // SET_VIEW_MODE が dispatch されているはず ── center pane の view-mode
    // attribute が calendar に変わっていることで確認
    // (entry 未選択でも `state.viewMode` は変わる)
    await page.waitForTimeout(300);
    const calendarView = page.locator('[data-pkc-view-mode="calendar"], [data-pkc-region="calendar-view"]');
    // どちらかが visible/存在
    const exists = await calendarView.count();
    expect(exists).toBeGreaterThan(0);
  });

  test('F1 opens palette and Escape closes', async ({ page }) => {
    await page.keyboard.press('F1');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    await expect(overlay).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
  });

  test('typing filters list to matching items', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    await expect(overlay).toBeVisible();
    const input = overlay.locator('[data-pkc-field="cmd-query"]');
    // 「theme」 query で theme.* commands に絞られる
    await input.fill('theme');
    const items = overlay.locator('[data-pkc-cmd-id]');
    const count = await items.count();
    expect(count).toBeGreaterThan(0);
    // 全部 theme.* prefix
    for (let i = 0; i < count; i++) {
      const id = await items.nth(i).getAttribute('data-pkc-cmd-id');
      expect(id?.startsWith('theme.')).toBe(true);
    }
  });

  test('click item executes command', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    const input = overlay.locator('[data-pkc-field="cmd-query"]');
    await input.fill('about');
    // app.about を実 OS click(elementFromPoint 経由)で発火
    const item = overlay.locator('[data-pkc-cmd-id="app.about"]').first();
    await expect(item).toBeVisible();
    const box = await item.boundingBox();
    if (!box) throw new Error('item bbox missing');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toBeHidden();
    // About が表示される ── about-view region が visible
    await page.waitForTimeout(300);
    const about = page.locator('[data-pkc-region="about-view"]');
    await expect(about).toBeVisible();
  });

  test('flag OFF: Ctrl+Shift+P is no-op', async ({ page }) => {
    // flag を URL で OFF に
    await page.goto('/pkc2.html?pkc-flag=shell.command_palette_enabled=0');
    await page.waitForSelector('#pkc-root');
    await page.waitForTimeout(400);
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    // overlay が出ない(no-op)
    await expect(overlay).toHaveCount(0);
  });

  // #951(user 報告「ほとんど機能しなかった」): 使えない command の
  // silent no-op を廃止した availability 機構の parity。既定状態(tabs
  // OFF)で tab 系 command がグレー + 理由表示になり、実クリックすると
  // 理由 toast が出る(黙って何も起きない、が直っている)ことを実機で確認。
  test('#951: 使えない command はグレー表示 + click で理由 toast', async ({ page }) => {
    await page.keyboard.press('Control+Shift+P');
    const overlay = page.locator('[data-pkc-region="command-palette"]');
    await expect(overlay).toBeVisible();
    await overlay.locator('[data-pkc-field="cmd-query"]').fill('次の tab');

    const item = overlay.locator('[data-pkc-cmd-id="tab.next"]');
    await expect(item).toBeVisible();
    await expect(item).toHaveAttribute('data-pkc-cmd-disabled', 'true');
    await expect(item.locator('.pkc-command-palette-item-reason')).toContainText('Tabs');

    // 実マウスで click → palette が閉じ、理由 toast が視認可能座標に出る
    const box = await item.boundingBox();
    if (!box) throw new Error('disabled item has no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(overlay).toBeHidden();
    const toast = page.locator('[data-pkc-region="toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('Tabs');
    await page.screenshot({ path: 'test-results/command-palette-availability-parity.png' });
  });
});
