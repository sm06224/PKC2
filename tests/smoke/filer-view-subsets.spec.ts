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

test('meta pane editor lists subset kinds (explorer / contact-sheet / book-base / video-base / novel-base / audio-base / inventory)', async ({ page }) => {
  // PR-HHH (2026-05-06):filer 内 Graph subset は廃止、center pane の
  // viewMode='graph' タブが canonical。Graph の期待値を撤回し、現行 opts
  // の audio-base + inventory を新規期待に追加。
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await expect(select).toBeVisible();
  const options = await select.locator('option').allTextContents();
  expect(options.some((t) => t.startsWith('Explorer'))).toBe(true);
  expect(options.some((t) => t.startsWith('Contact sheet'))).toBe(true);
  expect(options.some((t) => t.startsWith('Book base'))).toBe(true);
  expect(options.some((t) => t.startsWith('Video base'))).toBe(true);
  expect(options.some((t) => t.startsWith('Novel base'))).toBe(true);
  expect(options.some((t) => t.startsWith('Audio base'))).toBe(true);
  expect(options.some((t) => t.startsWith('Inventory'))).toBe(true);
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

test('順序性: setting display_profile to video-base renders grid', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.selectOption('video-base');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'video-base',
  );
});

test('順序性: setting display_profile to novel-base renders grid', async ({ page }) => {
  await bootFilerWithFolder(page);
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await select.selectOption('novel-base');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'novel-base',
  );
});
