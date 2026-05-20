/**
 * filer モード Saved Searches Pane parity(visual-state-parity-testing.md
 * §6 mandatory、pgc-51)。
 *
 * pgc-51 で filer sidebar が tree 同等の Saved Searches Pane(★ quick-save
 * + 保存済検索の一覧 + click で復元)を獲得した。★ ボタンと saved search
 * row はいずれも clickable な視覚 feature ── happy-dom 単体 test は reducer
 * の round-trip は証明できても、ユーザーの実タップが届くことは保証しない。
 * 本 spec は `elementFromPoint` で saved search row が paint-visible /
 * 非遮蔽であることを確認した上で `page.mouse.click(x, y)` の実 OS event で
 * 復元し、filer list の表示要素数変化(state mutation → consumer)を assert
 * する。
 *
 * シナリオ:
 *   1. filer モードで起動、text entry を 2 件(Alpha / Beta)作成。
 *   2. 検索窓に "Alpha" を実入力 → filer list が 1 件に絞り込まれる。
 *   3. ★ quick-save を実 click → 現在の検索が saved search として保存。
 *   4. 検索窓をクリア → filer list が 2 件へ復帰。
 *   5. Saved pane を開き、saved search row を boundingBox →
 *      elementFromPoint で非遮蔽確認。
 *   6. `page.mouse.click` の実 OS event で row を click → APPLY_SAVED_SEARCH
 *      → filer list が再び 1 件(Alpha)へ絞り込まれる。
 */

import { test, expect, type Page } from '@playwright/test';

async function createTextEntry(page: Page, title: string): Promise<void> {
  const shell = page.locator('#pkc-root');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('parity: filer の saved search を実 OS click で復元', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await createTextEntry(page, 'Alpha');
  await createTextEntry(page, 'Beta');

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();
  const items = sidebar.locator('.pkc-sidebar-filer-item[data-pkc-draggable]');
  await expect(items).toHaveCount(2);

  // 検索窓に "Alpha" を実入力 → filer list が 1 件へ。
  const search = sidebar.locator('.pkc-sidebar-filer-search');
  await search.fill('Alpha');
  await expect(items).toHaveCount(1);

  // ★ quick-save を実 click → saved search を作成。
  const starBtn = sidebar.locator('button[data-pkc-action="quick-save-search"]');
  await expect(starBtn).toBeVisible();
  await starBtn.click();

  // 検索窓をクリア → filer list が 2 件へ復帰。
  await search.fill('');
  await expect(items).toHaveCount(2);

  // Saved pane を開く(閉じた `<details>` は子を clip するため)。
  const savedPane = sidebar.locator('details[data-pkc-region="saved-searches"]');
  await expect(savedPane).toBeVisible();
  await savedPane.locator('summary').click();

  const savedRow = savedPane.locator('.pkc-saved-search-item').first();
  await expect(savedRow).toBeVisible();

  // Parity gate:row が見えている座標でユーザーの click が row 自身(の
  // apply-saved-search target)に届くことを elementFromPoint で確認。
  const box = await savedRow.boundingBox();
  if (!box) throw new Error('saved search row has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>(
        '[data-pkc-action="apply-saved-search"]',
      );
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click — saved search を復元 → filer list が再び 1 件(Alpha)。
  await page.mouse.click(cx, cy);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Alpha');

  await page.screenshot({
    path: 'test-results/filer-saved-searches-parity.png',
  });
});
