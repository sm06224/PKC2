/**
 * Filer 親フォルダ navigation via breadcrumb (領域 10-6 ζ'' Phase 2b
 * follow-up, post-PR-EE).
 *
 * History:
 *   - 2026-05-05: shipped `.` (current) and `..` (parent) navigation
 *     rows inside the filer table.
 *   - 2026-05-06 PR-EE: rows removed — user direction「結果的に不要
 *     となったため削除、パス表示からのパンクズ動作で代替」. The
 *     equivalent navigation now lives on the breadcrumb header
 *     (`data-pkc-filer-breadcrumb="folder"` for ancestor segments,
 *     `="root"` for root, `="current"` for the active folder name).
 *
 * This file post-PR-EE asserts the breadcrumb-based replacement.
 * The "no nav rows present" assertion (the removal itself) lives
 * in `filer-view-explorer-parity.spec.ts`.
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

  // Resolve outer lid via the breadcrumb's ancestor folder segment.
  const outerLid = await page
    .locator('button[data-pkc-filer-breadcrumb="folder"]')
    .first()
    .getAttribute('data-pkc-lid');
  if (!outerLid) throw new Error('Outer lid not resolved');

  return { outer: outerLid, inner: innerLid };
}

test('inside a nested folder, breadcrumb shows Root → ancestor → current', async ({ page }) => {
  await bootFilerWithNestedFolder(page);
  await expect(page.locator('[data-pkc-filer-breadcrumb="root"]')).toBeVisible();
  await expect(
    page.locator('[data-pkc-filer-breadcrumb="folder"]').first(),
  ).toBeVisible();
  await expect(page.locator('[data-pkc-filer-breadcrumb="current"]')).toBeVisible();
});

test('順序性: clicking the parent breadcrumb segment moves filer scope to the parent folder', async ({
  page,
}) => {
  const { outer } = await bootFilerWithNestedFolder(page);

  const parentSeg = page.locator('button[data-pkc-filer-breadcrumb="folder"]').first();
  await expect(parentSeg).toBeVisible();
  const segBox = await parentSeg.boundingBox();
  if (!segBox) throw new Error('Parent breadcrumb segment has no boundingBox');
  await page.mouse.click(segBox.x + segBox.width / 2, segBox.y + segBox.height / 2);

  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-filer-scope-lid',
    outer,
    { timeout: 5_000 },
  );
});

test('at root scope, breadcrumb has only the Root segment (no ancestor folder buttons)', async ({
  page,
}) => {
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

  await expect(page.locator('[data-pkc-filer-breadcrumb="root"]')).toBeVisible();
  await expect(page.locator('[data-pkc-filer-breadcrumb="current"]')).toBeVisible();
  // Top-level folder → no ancestor folder segments between root and current.
  await expect(page.locator('button[data-pkc-filer-breadcrumb="folder"]')).toHaveCount(0);
});
