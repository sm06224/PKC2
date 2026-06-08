/**
 * filer モード Recent Entries Pane parity(visual-state-parity-testing.md
 * §6 mandatory、pgc-50)。
 *
 * pgc-50 で filer sidebar が tree 同等の Recent Entries Pane を獲得した。
 * pane は `<details>` 折りたたみ + clickable な recent item を持つ視覚
 * feature ── happy-dom 単体 test は DOM mutation の正しさは証明できても、
 * ユーザーの実タップが summary / item へ届くことは保証しない。本 spec は
 * `elementFromPoint` で recent item が paint-visible / 非遮蔽であることを
 * 確認した上で `page.mouse.click(x, y)` の実 OS event で選択し、selectedLid
 * の変化(state mutation → consumer の選択 marker)を assert する。
 *
 * シナリオ:
 *   1. filer モードで起動、text entry を 2 件(Alpha / Beta)作成。
 *      text entry は root scope に留まるため filer は root のまま。
 *   2. recent pane(default 折りたたみ)の summary を実 click で開く。
 *   3. Alpha の recent item を boundingBox → elementFromPoint で非遮蔽確認。
 *   4. `page.mouse.click` の実 OS event で Alpha を選択 → recent item に
 *      data-pkc-selected="true" が付く。
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

test('parity: filer recent pane の item を実 OS click で選択', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await createTextEntry(page, 'Alpha');
  await createTextEntry(page, 'Beta');

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  // recent pane は default 折りたたみ。summary を実 click で開く
  // (閉じた `<details>` は子を clip し boundingBox が失敗する)。
  const recentPane = sidebar.locator('details[data-pkc-region="recent-entries"]');
  await expect(recentPane).toBeVisible();
  const summary = recentPane.locator('summary[data-pkc-action="toggle-recent-pane"]');
  await summary.click();

  // Alpha の recent item を取得。
  const alphaItem = recentPane
    .locator('.pkc-recent-item[data-pkc-lid]')
    .filter({ hasText: 'Alpha' });
  await expect(alphaItem).toHaveCount(1);
  await expect(alphaItem).not.toHaveAttribute('data-pkc-selected', 'true');

  // Parity gate:item が見えている座標でユーザーの click が item 自身に
  // 届く(他要素に遮蔽されていない)ことを elementFromPoint で確認。
  const box = await alphaItem.boundingBox();
  if (!box) throw new Error('Alpha recent item has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>(
        '.pkc-recent-item[data-pkc-action="select-recent-entry"]',
      );
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click — Alpha を選択。recent item に選択 marker が付く。
  await page.mouse.click(cx, cy);
  await expect(alphaItem).toHaveAttribute('data-pkc-selected', 'true');

  await page.screenshot({
    path: 'test-results/filer-recent-pane-parity.png',
  });
});
