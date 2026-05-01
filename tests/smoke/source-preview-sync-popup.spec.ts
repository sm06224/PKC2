/**
 * Playwright smoke for PR #206 v17 — popup-window split editor's
 * preview-click → editor-caret jump.
 *
 * The double-click-to-open child window is a separate document with
 * its own inline `<script>` (see `src/adapter/ui/entry-window.ts`).
 * Until v17 it had no caret-sync wired up, which is what the user
 * was actually hitting when they reported "プレビューをクリック
 * してもエディター側がジャンプしない". This test exercises that
 * popup path end-to-end so a regression there can't slip through.
 */

import { test, expect } from '@playwright/test';

test('popup window: preview click jumps the textarea caret to the matching line', async ({ page, context }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Create a text entry, give it minimal content, and save — that
  // produces a sidebar row we can double-click into a popup. The
  // popup opens in edit mode for `text` archetype.
  await page.locator(
    'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
  ).first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('input[data-pkc-field="title"]').first().fill('popup test entry');
  // Body must be non-empty for the saved entry to be useful in the
  // popup; the popup's split editor reads the persisted body when it
  // opens.
  await page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  ).fill('seed line\n');
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Find the just-saved entry in the main entry list (the recent
  // tray and entry-tree both have `data-pkc-lid` but only the main
  // list's `<li>` carries `data-pkc-action="select-entry"`).
  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  await expect(sidebar).toBeVisible();
  const entry = sidebar.locator('li[data-pkc-action="select-entry"]', {
    hasText: 'popup test entry',
  }).first();
  await expect(entry).toBeVisible({ timeout: 10_000 });

  // Double-click → opens a popup window. Playwright's context emits a
  // `page` event when window.open() lands.
  const popupPromise = context.waitForEvent('page');
  await entry.dblclick();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  // The popup opens in edit mode for editable archetypes (text). Wait
  // for the split-editor preview's anchored DOM to settle.
  const popupBody = popup.locator('textarea#body-edit');
  await expect(popupBody).toBeVisible({ timeout: 10_000 });
  // Replace the body with a known multi-block source so we control
  // the line offsets and avoid relying on the manual chapter's
  // current text.
  const SOURCE = [
    '# heading',           // 0
    '',                    // 1
    'first paragraph',     // 2
    '',                    // 3
    'second paragraph',    // 4
    '',                    // 5
    'third paragraph',     // 6
  ].join('\n');
  await popupBody.fill(SOURCE);

  const popupPreview = popup.locator('#body-preview');
  // input listener has a 100 ms debounce; wait for the anchor to
  // appear.
  await expect(popupPreview.locator('[data-pkc-source-line="4"]')).toBeVisible({
    timeout: 5_000,
  });

  // Reset the caret to 0 so a successful jump is observable.
  await popupBody.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = 0;
  });

  await popupPreview.locator('[data-pkc-source-line="4"]').click();

  const expected = SOURCE.split('\n').slice(0, 4).join('\n').length + 1;
  await expect.poll(
    async () => popupBody.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(expected);
});
