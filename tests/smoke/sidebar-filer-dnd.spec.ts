/**
 * filer モード sidebar の drag-and-drop — visual parity(Group A、γ-A1、
 * pgc-33)。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。CLAUDE.md §5 が
 * 明示する「ドラッグ」visual feature の実 OS event parity を担う。
 * `locator.dragTo` で実 HTML5 drag-and-drop を発火し、entry が folder
 * 階層を移動する(consumer:filer scope の再解決)ことを検証する。
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

test('parity: filer sidebar で entry を nav-up に実 OS drag → 上階層へ移動', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // folder を作成 → 続けて text を作成(create context = 選択中 folder
  // なので text は folder 直下に入る)。
  await createEntry(page, 'folder');
  await createEntry(page, 'text');

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  // folder scope に入っている(header label は folder title、Root でない)。
  const label = sidebar.locator('.pkc-sidebar-filer-label');
  await expect(label).not.toHaveText('Root');

  const textItem = sidebar.locator(
    '.pkc-sidebar-filer-item[data-pkc-archetype="text"]',
  );
  await expect(textItem).toHaveCount(1);
  const navUp = sidebar.locator('.pkc-sidebar-filer-nav-up');
  await expect(navUp).toHaveCount(1);

  // 実 OS drag:text item を nav-up(drop-target=root)に drop。
  await textItem.dragTo(navUp);

  // consumer:text が root へ移動 → selectedLid=text の scope が root に
  // 変わり、sidebar header が "Root" に遷移する。
  await expect(label).toHaveText('Root');

  await page.screenshot({
    path: 'test-results/sidebar-filer-dnd-parity.png',
  });
});
