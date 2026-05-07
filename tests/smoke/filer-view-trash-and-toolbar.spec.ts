/**
 * Filer view Phase 1 PR-2 follow-up parity tests:
 * trash scope toggle + filer toolbar create-folder + breadcrumb navigation.
 *
 * Spec: docs/development/filer-view-explorer-subset-spec.md §4 + §5.
 *
 * reform-2026-05 §6 visual-state-parity: real OS click via
 * `page.mouse.click(x, y)`, `elementFromPoint` confirmation.
 * Phase 8 順序性: state mutation → consumer behavior.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootFiler(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed one TEXT entry so the view-mode toggle bar is rendered.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Switch into filer.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tabBox = await filerTab.boundingBox();
  if (!tabBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible({ timeout: 5_000 });
}

test('Filer toolbar: create folder button creates a new folder', async ({ page }) => {
  await bootFiler(page);

  // Click the folder create button in the filer toolbar.
  const createFolderBtn = page.locator(
    '[data-pkc-region="filer-toolbar"] button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]',
  );
  await expect(createFolderBtn).toBeVisible();
  const btnBox = await createFolderBtn.boundingBox();
  if (!btnBox) throw new Error('create-entry folder button has no boundingBox');
  await page.mouse.click(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2);

  // Editing phase begins for the new folder.
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
});

test('順序性: filer-scope-trash → data-pkc-filer-scope flips to trash', async ({ page }) => {
  await bootFiler(page);

  const trashBtn = page.locator('button[data-pkc-action="filer-scope-trash"]');
  await expect(trashBtn).toBeVisible();
  const tBox = await trashBtn.boundingBox();
  if (!tBox) throw new Error('trash toggle has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-filer-scope',
    'trash',
  );
  await expect(page.locator('[data-pkc-filer-breadcrumb="trash"]')).toBeVisible();

  // Empty trash on a fresh container — table is replaced by empty state.
  await expect(page.locator('[data-pkc-region="filer-empty"]')).toBeVisible();
});

test('順序性: trash → back-from-trash returns scope to auto', async ({ page }) => {
  await bootFiler(page);

  // Open trash.
  const trashBtn = page.locator('button[data-pkc-action="filer-scope-trash"]');
  const tBox = await trashBtn.boundingBox();
  if (!tBox) throw new Error('trash toggle has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-filer-scope',
    'trash',
  );

  // Click "← フォルダ" back link.
  const back = page.locator('button[data-pkc-action="filer-scope-folder"]');
  await expect(back).toBeVisible();
  const bBox = await back.boundingBox();
  if (!bBox) throw new Error('back link has no boundingBox');
  await page.mouse.click(bBox.x + bBox.width / 2, bBox.y + bBox.height / 2);

  // filerScope cleared → no data-pkc-filer-scope attribute remains.
  await expect(page.locator('[data-pkc-region="filer-view"]')).not.toHaveAttribute(
    'data-pkc-filer-scope',
    'trash',
  );
});
