/**
 * Fragment UI parity (領域 10-6 ζ'' Phase 3c-C / 3c-D).
 *
 * Verifies:
 *   1. Properties pane renders frontmatter `url:` as a clickable
 *      <a> element (not plain text).
 *   2. When the URL has a recognised fragment (e.g. YouTube `?t=`),
 *      a fragment badge is appended after the link with the locator
 *      label (e.g. "2:10").
 *   3. Filer card grid surfaces the same badge on book/video/novel
 *      cards.
 *
 * 2026-05-05 user direction:「プレイライトでの画面確認を怠らずに
 * 証憑残しして私にレポートしてくださいね」 — local screenshots are
 * captured under tests/smoke/_artefacts when PKC_VISUAL=1.
 */

import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const VISUAL_ENABLED = !!process.env.PKC_VISUAL && !process.env.CI;
const ART_DIR = 'test-results/visual-check';
if (VISUAL_ENABLED) mkdirSync(ART_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  if (!VISUAL_ENABLED) return;
  await page.screenshot({ path: `${ART_DIR}/${name}.png`, fullPage: false });
}

async function bootAndCreateUrlBackedText(page: Page, url: string): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Create a TEXT entry with frontmatter containing `url:` field.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  // Inject body via DOM directly so we don't depend on textarea key
  // helpers ordering with frontmatter `---`.
  const body = `---\nkind: video\nurl: ${url}\n---\n# 視聴メモ\n`;
  await page.evaluate((b) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) throw new Error('No body textarea');
    ta.value = b;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, body);
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('Properties pane renders frontmatter url as a link with fragment badge', async ({ page }) => {
  await bootAndCreateUrlBackedText(page, 'https://www.youtube.com/watch?v=abc&t=130');

  // The Properties section appears in the meta pane.
  const props = page.locator('[data-pkc-region="frontmatter"]');
  await expect(props).toBeVisible();

  const urlLink = page.locator('a.pkc-frontmatter-url');
  await expect(urlLink).toBeVisible();
  await expect(urlLink).toHaveAttribute('href', /youtube\.com.*t=130/);

  const badge = page.locator('.pkc-frontmatter-fragment-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('2:10');
  await expect(badge).toHaveAttribute('data-pkc-fragment-kind', 'time');
  await shot(page, 'fragment-properties-youtube');
});

test('Filer card grid shows fragment badge on book/video subset', async ({ page }) => {
  // Seed a folder + an URL-backed video TEXT entry under it.
  await page.goto('/pkc2.html?pkc-flag=sidebar.mode=tree', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Folder.
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="folder"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('input[data-pkc-field="title"]').first().fill('Watching');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  const folderLid: string | null = await page.evaluate(() => {
    // Sidebar tree marks folder entries with data-pkc-folder="true".
    const li = document.querySelector<HTMLElement>('li.pkc-entry-item[data-pkc-folder="true"]');
    return li?.getAttribute('data-pkc-lid') ?? null;
  });
  if (!folderLid) throw new Error('Folder lid not found in sidebar');

  // TEXT entry with kind: video frontmatter (created while folder selected).
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) throw new Error('No body textarea');
    ta.value = '---\nkind: video\nurl: https://www.youtube.com/watch?v=abc&t=200\n---\n# memo\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('input[data-pkc-field="title"]').first().fill('Note');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // Re-select the folder via sidebar list item click (folder lid).
  await page
    .locator(`li.pkc-entry-item[data-pkc-lid="${folderLid}"]`)
    .first()
    .click({ force: true });

  // Switch to filer view.
  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tBox = await filerTab.boundingBox();
  if (!tBox) throw new Error('Filer tab has no bbox');
  await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

  // Switch to video-base subset via the meta pane editor.
  const select = page.locator('select[data-pkc-action="set-display-profile"]').first();
  await expect(select).toBeVisible();
  await select.selectOption('video-base');
  await expect(page.locator('[data-pkc-region="filer-view"]')).toHaveAttribute(
    'data-pkc-subset',
    'video-base',
  );

  // The TEXT entry's card carries the fragment badge derived from
  // its frontmatter url's `?t=200` (= 3:20).
  const badge = page.locator('.pkc-filer-card-fragment-badge').first();
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText('3:20');
  await shot(page, 'fragment-filer-card-video');
});
