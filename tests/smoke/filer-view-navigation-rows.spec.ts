/**
 * Filer "." / ".." navigation rows (領域 10-6 ζ'' Phase 2b follow-up).
 *
 * User direction (2026-05-05):
 *   ファイラにはカレントフォルダと1つ上の階層のフォルダ、すなわち、
 *   . / .. を表示して欲しい。rootにいる場合は .. の表示は無し
 *
 * Verifies:
 *   1. At root scope, only "." renders, ".." absent.
 *   2. Inside a nested folder, both "." and ".." render.
 *   3. Clicking ".." navigates the filer scope to the parent folder.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootFilerWithNestedFolder(page: Page): Promise<{ outer: string; inner: string }> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Outer folder.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('Outer');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Inner folder (created while outer is selected → outer becomes parent).
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('Inner');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Switch to filer (shows whichever folder is selected — Inner is selected
  // because it was the most recent commit).
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible({ timeout: 5_000 });

  const innerLid = await page
    .locator('[data-pkc-region="filer-view"]')
    .getAttribute('data-pkc-filer-scope-lid');
  if (!innerLid) throw new Error('Inner scope lid not resolved');

  // Resolve outer lid via the breadcrumb's parent segment.
  const outerLid = await page
    .locator('button[data-pkc-filer-breadcrumb="folder"]')
    .first()
    .getAttribute('data-pkc-lid');
  if (!outerLid) throw new Error('Outer lid not resolved');

  return { outer: outerLid, inner: innerLid };
}

test('inside a nested folder, both "." and ".." rows render', async ({ page }) => {
  await bootFilerWithNestedFolder(page);
  await expect(page.locator('[data-pkc-filer-nav="current"]')).toBeVisible();
  await expect(page.locator('[data-pkc-filer-nav="parent"]')).toBeVisible();
});

test('順序性: clicking ".." moves filer scope to the parent folder', async ({ page }) => {
  const { outer } = await bootFilerWithNestedFolder(page);

  const parentRow = page.locator('[data-pkc-filer-nav="parent"]');
  await expect(parentRow).toBeVisible();
  await parentRow.click();

  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-filer-scope-lid',
    outer,
    { timeout: 5_000 },
  );
});

test('at root scope, ".." is absent (only "." present)', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed only one root-level folder (no parent).
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('Root Folder');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible({ timeout: 5_000 });

  await expect(page.locator('[data-pkc-filer-nav="current"]')).toBeVisible();
  await expect(page.locator('[data-pkc-filer-nav="parent"]')).toHaveCount(0);
});
