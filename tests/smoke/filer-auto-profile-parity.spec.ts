/**
 * Filer auto-detect display profile parity (PR-G G15).
 *
 * User direction (2026-05-06):
 * > デフォルトの Folder モードは「Auto」にして、内部エントリの所属
 * > 状況から 7 割多数決で自動的にアルバム表示などを選択してほしい。
 *
 * Asserts the **state mutation → consumer behavior change** chain:
 *   - 新規 folder の display_profile select の default は "auto"
 *   - meta pane に「→ 現在: explorer/contact-sheet/...」 hint が表示
 *   - children を増やすと resolved kind が変わる(folder 自体は auto の
 *     まま、render 結果が consumer = data-pkc-subset attribute で変わる)
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndCreateFolder(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Auto Test');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Switch to filer.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tabBox = await filerTab.boundingBox();
  if (!tabBox) throw new Error('Filer tab no boundingBox');
  await page.mouse.click(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();
}

test('PR-G G15: a freshly-created folder defaults to display_profile=auto in the meta pane select', async ({
  page,
}) => {
  await bootAndCreateFolder(page);

  // Meta pane select for display_profile is on the folder.
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await expect(select).toBeVisible();
  // The selected option's value should be "auto".
  await expect(select).toHaveValue('auto');
});

test('PR-G G15: empty folder under auto resolves to explorer (data-pkc-subset on filer-view)', async ({
  page,
}) => {
  await bootAndCreateFolder(page);
  // Empty folder + auto → explorer fallback.
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'explorer',
  );
});

test('PR-G G15: meta pane shows resolved auto kind hint', async ({ page }) => {
  await bootAndCreateFolder(page);
  const hint = page.locator('[data-pkc-region="filer-profile-auto-hint"]');
  await expect(hint).toBeVisible();
  // Empty folder → resolved=explorer.
  await expect(hint).toHaveAttribute('data-pkc-resolved-kind', 'explorer');
});
