/**
 * 領域 1 navigation history parity(visual-state-parity-testing.md §6
 * mandatory)。
 *
 * header の ◀ / ▶ は clickable な視覚 feature ── happy-dom 単体 test は
 * reducer の index 移動を証明できても、ユーザーの実タップが ◀ に届く
 * ことは保証しない。本 spec は `elementFromPoint` で ◀ が paint-visible
 * かつ非遮蔽であることを確認した上で `page.mouse.click(x, y)` の実 OS
 * event で GO_BACK を発火し、center pane の表示エントリ(consumer)が
 * 前のエントリへ戻ることを assert する。
 *
 * シナリオ:
 *   1. text entry を 2 件作成(AlphaEntry / BetaEntry)。
 *   2. filer sidebar で両者を click → navigation history を構築。
 *   3. ◀ を boundingBox → elementFromPoint で非遮蔽確認。
 *   4. 実 OS click で ◀ → center pane が AlphaEntry へ戻り、◀ disabled /
 *      ▶ enabled に切り替わる。
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

test('parity: 履歴ナビの ◀ を実 OS click で前のエントリへ戻る', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await createTextEntry(page, 'AlphaEntry');
  await createTextEntry(page, 'BetaEntry');

  // filer sidebar の行を click して navigation history を構築。
  // filer の row click は dblclick 検出のため SELECT_ENTRY を 250ms 遅延
  // dispatch する ── 連続 click すると前の timer が cancel されるので、
  // 各選択が center pane に反映されるまで待ってから次を click する。
  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  const center = page.locator('[data-pkc-region="center-content"]');
  await sidebar.locator('.pkc-sidebar-filer-item', { hasText: 'AlphaEntry' }).first().click();
  await expect(center).toContainText('AlphaEntry');
  await sidebar.locator('.pkc-sidebar-filer-item', { hasText: 'BetaEntry' }).first().click();
  await expect(center).toContainText('BetaEntry');

  const back = page.locator('[data-pkc-action="go-back"]');
  await expect(back).toBeEnabled();

  // Parity gate:◀ が見えている座標で click が ◀ 自身に届くことを確認。
  const box = await back.boundingBox();
  if (!box) throw new Error('go-back button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('[data-pkc-action="go-back"]');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → GO_BACK → center pane が AlphaEntry へ。
  await page.mouse.click(cx, cy);
  await expect(center).toContainText('AlphaEntry');
  await expect(center).not.toContainText('BetaEntry');
  // navIndex が 0 へ:◀ disabled / ▶ enabled。
  await expect(back).toBeDisabled();
  await expect(page.locator('[data-pkc-action="go-forward"]')).toBeEnabled();

  await page.screenshot({ path: 'test-results/history-nav-parity.png' });
});
