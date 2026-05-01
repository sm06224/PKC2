/**
 * Playwright smoke for PR #206 — preview-click → editor-caret jump.
 *
 * Vitest covers the unit-level path (synthetic textarea + synthetic
 * `<p data-pkc-source-line>`), but not the real-browser event flow
 * (`click` bubbling through action-binder, suppression flag plumbing,
 * `textarea.focus()` semantics, source-line anchors actually landing
 * on the rendered block tokens). This test exercises the full path
 * the user actually triggers when they click preview content.
 */

import { test, expect, type Page } from '@playwright/test';

async function setupSplitEditor(page: Page, source: string): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  await page.locator(
    'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
  ).first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  await expect(body).toBeVisible();
  await body.fill(source);
}

function offsetOfLineStart(source: string, line: number): number {
  return source.split('\n').slice(0, line).join('\n').length + (line === 0 ? 0 : 1);
}

test('preview click on a paragraph moves the caret to that line', async ({ page }) => {
  const SOURCE = [
    '# heading',           // 0
    '',                    // 1
    'first paragraph',     // 2
    '',                    // 3
    'second paragraph',    // 4
    '',                    // 5
    'third paragraph',     // 6
  ].join('\n');
  await setupSplitEditor(page, SOURCE);

  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  const preview = page.locator('[data-pkc-region="text-edit-preview"]');
  await expect(preview.locator('[data-pkc-source-line="4"]')).toBeVisible({ timeout: 5_000 });

  await body.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = 0;
  });

  await preview.locator('[data-pkc-source-line="4"]').click();

  const expected = offsetOfLineStart(SOURCE, 4);
  await expect.poll(
    async () => body.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(expected);
});

test('preview click on a heading moves the caret to line 0', async ({ page }) => {
  const SOURCE = '# heading\n\nbody text';
  await setupSplitEditor(page, SOURCE);

  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  const preview = page.locator('[data-pkc-region="text-edit-preview"]');
  await expect(preview.locator('[data-pkc-source-line="0"]')).toBeVisible({ timeout: 5_000 });

  await body.evaluate((el, len) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = len;
  }, SOURCE.length);

  await preview.locator('[data-pkc-source-line="0"]').click();
  await expect.poll(
    async () => body.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(0);
});

test('preview click on a list item moves the caret to that line', async ({ page }) => {
  const SOURCE = [
    'intro line',         // 0
    '',                   // 1
    '- alpha',            // 2
    '- bravo',            // 3
    '- charlie',          // 4
  ].join('\n');
  await setupSplitEditor(page, SOURCE);

  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  const preview = page.locator('[data-pkc-region="text-edit-preview"]');
  await expect(preview.locator('li[data-pkc-source-line="3"]')).toBeVisible({ timeout: 5_000 });

  await body.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = 0;
  });

  await preview.locator('li[data-pkc-source-line="3"]').click();
  const expected = offsetOfLineStart(SOURCE, 3);
  await expect.poll(
    async () => body.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(expected);
});

test('preview click on a fenced code block moves the caret to its line', async ({ page }) => {
  const SOURCE = [
    'before',             // 0
    '',                   // 1
    '```',                // 2
    'console.log(1)',     // 3
    '```',                // 4
    '',                   // 5
    'after',              // 6
  ].join('\n');
  await setupSplitEditor(page, SOURCE);

  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  const preview = page.locator('[data-pkc-region="text-edit-preview"]');
  // Fence wrapper carries data-pkc-source-line on `.pkc-md-block`.
  await expect(preview.locator('.pkc-md-block[data-pkc-source-line="2"]')).toBeVisible({
    timeout: 5_000,
  });

  await body.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = 0;
  });

  // Per-line anchors (v9): fence content lines each carry their own
  // `data-pkc-source-line` so the click lands on the actual code
  // line (3), not the fence-open marker (2).
  await preview.locator('span[data-pkc-source-line="3"]').click();
  const expected = offsetOfLineStart(SOURCE, 3);
  await expect.poll(
    async () => body.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(expected);
});

test('preview click on inline text inside a paragraph still bubbles to the anchor', async ({ page }) => {
  const SOURCE = [
    'before',                                      // 0
    '',                                            // 1
    'word **emphasis** more text and `code` here', // 2
  ].join('\n');
  await setupSplitEditor(page, SOURCE);

  const body = page.locator(
    '.pkc-text-split-editor textarea[data-pkc-field="body"]',
  );
  const preview = page.locator('[data-pkc-region="text-edit-preview"]');
  await expect(preview.locator('[data-pkc-source-line="2"]')).toBeVisible({ timeout: 5_000 });

  await body.evaluate((el) => {
    const ta = el as HTMLTextAreaElement;
    ta.selectionStart = ta.selectionEnd = 0;
  });

  // Click directly on the `<strong>` child (no anchor on it; closest
  // walks up to the `<p>`).
  await preview.locator('strong').click();
  const expected = offsetOfLineStart(SOURCE, 2);
  await expect.poll(
    async () => body.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
    { timeout: 2_000 },
  ).toBe(expected);
});
