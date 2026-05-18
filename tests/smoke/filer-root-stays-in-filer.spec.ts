/**
 * Filer view-mode persistence on root breadcrumb click (PR-J fix).
 *
 * User report (2026-05-06):
 * > FOLDER の Detail を Filer にしたとき、パスから Root に戻ると
 * > Filer じゃなくなる、この動作は正直 no-op
 *
 * Scenario:
 *   1. Create a folder, open its detail (default).
 *   2. Click the Filer view-mode tab.
 *   3. Click the "Root" segment in the filer breadcrumb.
 *   Expected: still in filer view (data-pkc-region=filer-view present),
 *             scope = root (no current breadcrumb segment).
 */

import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Create a folder.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Sample Folder');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Switch to Filer.
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tbox = await tab.boundingBox();
  if (!tbox) throw new Error('Filer tab no boundingBox');
  await page.mouse.click(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();
}

test('clicking Root in filer breadcrumb keeps the user in filer view (root scope)', async ({
  page,
}) => {
  await setup(page);

  // We're now in filer view scoped to "Sample Folder".
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible();
  await expect(page.locator('[data-pkc-filer-breadcrumb="current"]')).toBeVisible();

  // Click the Root breadcrumb button via real OS event.
  const rootBtn = page.locator('[data-pkc-filer-breadcrumb="root"]');
  await expect(rootBtn).toBeVisible();
  const box = await rootBtn.boundingBox();
  if (!box) throw new Error('Root breadcrumb no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  // CRITICAL: filer-view must still be present (state.viewMode === 'filer').
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible({ timeout: 2_000 });
  // Scope = root → no "current" breadcrumb segment.
  await expect(page.locator('[data-pkc-filer-breadcrumb="current"]')).toHaveCount(0);
  // Filer tab still active.
  await expect(
    page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]'),
  ).toHaveAttribute('data-pkc-active', 'true');
});
