/**
 * filer モード sidebar の multi-select — visual parity(Group A、γ-A1、
 * pgc-36)。
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。実 OS の修飾キー
 * 付き click(`click({ modifiers: ['Control'] })`)で filer item を
 * multi-select し、一括操作バーが出現する consumer 挙動を verify する。
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

test('parity: filer sidebar で実 OS Ctrl+click multi-select → 一括操作バー', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=filer', {
    waitUntil: 'load',
  });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await createEntry(page, 'text');
  await createEntry(page, 'text');

  const sidebar = page.locator(
    '[data-pkc-region="sidebar"][data-pkc-sidebar-mode="filer"]',
  );
  await expect(sidebar).toBeVisible();

  const items = sidebar.locator('.pkc-sidebar-filer-item[data-pkc-draggable]');
  await expect(items).toHaveCount(2);

  // 実 OS の Ctrl+click で 2 件を multi-select。
  await items.nth(0).click({ modifiers: ['Control'] });
  await items.nth(1).click({ modifiers: ['Control'] });

  // consumer:一括操作バーが出現し選択数を表示。
  const bar = sidebar.locator('[data-pkc-region="multi-action-bar"]');
  await expect(bar).toBeVisible();
  await expect(bar.locator('.pkc-multi-action-info')).toHaveText('2 selected');

  // item も視覚マークされる。
  await expect(items.nth(0)).toHaveAttribute('data-pkc-multi-selected', 'true');

  await page.screenshot({
    path: 'test-results/sidebar-filer-multiselect-parity.png',
  });
});
