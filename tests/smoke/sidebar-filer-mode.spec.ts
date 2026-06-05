/**
 * filer モード sidebar — visual parity(Group A、Phase γ-A1)。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。`sidebar.mode=filer`
 * で左ペインを filer-explorer 化した状態で、実 OS event(page.mouse.click
 * + boundingBox)で sidebar item を選択し、active marker が遷移することを
 * 検証する。生成だけでなく user が実際に click する描画要素まで chain を
 * verify する。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootFilerSidebar(page: Page, entryCount: number): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  for (let i = 0; i < entryCount; i++) {
    await page
      .locator(
        'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
      )
      .first()
      .click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
    await page.locator('button[data-pkc-action="commit-edit"]').first().click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  }
}

test('parity: filer モード sidebar の item を実 OS click で選択遷移', async ({
  page,
}) => {
  await bootFilerSidebar(page, 2);

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  const items = sidebar.locator('.pkc-sidebar-filer-item[data-pkc-lid]');
  await expect(items).toHaveCount(2);

  // 現在 active でない item を 1 つ選ぶ(click で確実に遷移が起きる)。
  const count = await items.count();
  let targetIdx = -1;
  for (let i = 0; i < count; i++) {
    if ((await items.nth(i).getAttribute('data-pkc-active')) !== 'true') {
      targetIdx = i;
      break;
    }
  }
  expect(targetIdx).toBeGreaterThanOrEqual(0);
  const targetLid = await items.nth(targetIdx).getAttribute('data-pkc-lid');
  if (!targetLid) throw new Error('filer item missing data-pkc-lid');

  // 実 OS click(座標指定)。
  const box = await items.nth(targetIdx).boundingBox();
  if (!box) throw new Error('filer item has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // sidebar click は 250ms の dblclick window 分 debounce される。
  // toHaveAttribute は auto-retry で debounce 満了まで待つ。
  await expect(
    sidebar.locator(`.pkc-sidebar-filer-item[data-pkc-lid="${targetLid}"]`),
  ).toHaveAttribute('data-pkc-active', 'true');

  await page.screenshot({
    path: 'test-results/sidebar-filer-mode-parity.png',
  });
});
