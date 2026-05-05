/**
 * Filer view subset profile parity (領域 10-6 ζ'' Phase 3a).
 *
 * Verifies:
 *   1. meta pane editor lists 4 kinds (explorer / contact-sheet /
 *      book-base / youtube-base).
 *   2. Selecting `contact-sheet` flips data-pkc-subset and renders
 *      a card grid.
 *   3. Selecting `book-base` flips data-pkc-subset and renders a
 *      card grid.
 *
 * reform-2026-05 §6 visual-state-parity + Phase 8 順序性.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootFilerWithFolder(page: Page): Promise<string> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed a folder; commit so it lands and selectedLid points at it.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('Sample Folder');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Switch into filer.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
  await expect(page.locator('[data-pkc-region="filer-view"]')).toBeVisible({ timeout: 5_000 });

  const folderLid = await page.locator('[data-pkc-region="filer-view"]').getAttribute('data-pkc-filer-scope-lid');
  if (!folderLid) throw new Error('Filer scope lid not resolved');
  return folderLid;
}

test('meta pane editor lists 4 subset kinds', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await expect(select).toBeVisible();
  const options = await select.locator('option').allTextContents();
  expect(options).toContain('Explorer (table)');
  expect(options).toContain('Contact sheet (album)');
  expect(options).toContain('Book base');
  expect(options).toContain('YouTube base');
});

test('順序性: setting display_profile to contact-sheet renders grid', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.selectOption('contact-sheet');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'contact-sheet',
  );
});

test('順序性: setting display_profile to book-base renders grid', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.selectOption('book-base');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'book-base',
  );
});

test('順序性: setting display_profile to youtube-base renders grid', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.selectOption('youtube-base');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'youtube-base',
  );
});
