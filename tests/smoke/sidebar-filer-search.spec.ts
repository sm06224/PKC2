/**
 * filer モード sidebar の global 検索 — visual parity(Group A、γ-A1)。
 * pgc-46 で per-folder filter → container 全体の global search に拡張。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。実ブラウザの検索窓
 * に実入力(`fill` = focus + 実 input event)を行い、list が絞り込まれ
 * no-match 案内が出る consumer 挙動まで verify する。global 検索の
 * cross-folder 動作は `sidebar-filer-search.test.ts`(happy-dom)が被覆。
 */

import { test, expect, type Page } from '@playwright/test';

async function createEntry(page: Page, archetype: string): Promise<void> {
  const shell = page.locator('#pkc-root');
  await page
    .locator(
      `button[data-pkc-action="create-entry"][data-pkc-archetype="${archetype}"]`,
    )
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('parity: filer sidebar の検索窓に実入力 → list 絞り込み', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // root に text を 2 件作成(どちらも root level)。
  await createEntry(page, 'text');
  await createEntry(page, 'text');

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  const items = sidebar.locator('.pkc-sidebar-filer-item[data-pkc-draggable]');
  await expect(items).toHaveCount(2);

  const search = sidebar.locator('.pkc-sidebar-filer-search');
  await expect(search).toBeVisible();

  // 実入力:一致しない query → list 0 件 + no-match 案内。
  await search.fill('該当しない検索語');
  await expect(items).toHaveCount(0);
  await expect(
    sidebar.locator('[data-pkc-region="filer-sidebar-no-match"]'),
  ).toBeVisible();

  // クリア → 2 件復帰。
  await search.fill('');
  await expect(items).toHaveCount(2);

  await page.screenshot({
    path: 'test-results/sidebar-filer-search-parity.png',
  });
});
