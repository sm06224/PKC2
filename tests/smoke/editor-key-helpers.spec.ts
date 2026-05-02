/**
 * Smoke — editor textarea key helpers (PR #198) real-keystroke effect.
 *
 * The unit test (`tests/adapter/editor-key-helpers-pr198.test.ts`)
 * exercises the helpers as pure functions. That proves the *generation*
 * of the right textarea state, but not that real OS keystrokes actually
 * reach the helper through PKC2's keydown wiring. visual-state-parity-
 * testing.md §「test pass = ship 禁止」/ debug-privacy-philosophy.md
 * §5-4 gate 5 require the UX effect to be observed via real DOM state
 * after a real OS event tree. This file is that observation.
 *
 * Each test creates a TEXT entry, drives `page.keyboard.type` /
 * `press` against the body textarea, and asserts the textarea's
 * value + `selectionStart` after the keystroke. `page.keyboard` fires
 * a real-OS event tree (`keydown` / `keypress` / `input` / `keyup`)
 * which traverses the action-binder's editor key handler in main; the
 * helper would not fire if the binding were broken.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndCreateText(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });
  const createText = page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first();
  await expect(createText).toBeVisible();
  await createText.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
}

async function focusBody(page: Page): Promise<void> {
  const body = page.locator('textarea[data-pkc-field="body"]').first();
  await expect(body).toBeVisible();
  await body.click();
  await body.focus();
  // Initial body is empty — start with a clean slate. setValue via
  // page.keyboard.press would also work but evaluate is faster.
  await page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    ta.value = '';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function readBody(page: Page): Promise<{ value: string; caret: number }> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    return { value: ta.value, caret: ta.selectionStart ?? 0 };
  });
}

test.describe('editor-key-helpers — real keystroke effect (PR #198)', () => {
  test('bracket auto-pair: typing ( produces () with caret between', async ({
    page,
  }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type('(');
    const { value, caret } = await readBody(page);
    expect(value).toBe('()');
    expect(caret).toBe(1);
  });

  test('bracket auto-pair: every supported opener pairs', async ({ page }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    // Each opener tested independently; reset between to keep the
    // assertion focused. `'` is intentionally excluded from PAIRS.
    const cases: { open: string; expected: string }[] = [
      { open: '(', expected: '()' },
      { open: '[', expected: '[]' },
      { open: '{', expected: '{}' },
      { open: '"', expected: '""' },
      { open: '`', expected: '``' },
    ];
    for (const c of cases) {
      await page.evaluate(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) throw new Error('body textarea missing');
        ta.value = '';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
      });
      await page.keyboard.type(c.open);
      const { value, caret } = await readBody(page);
      expect(value, `opener ${c.open} should pair`).toBe(c.expected);
      expect(caret, `caret should be between the pair for ${c.open}`).toBe(1);
    }
  });

  test('apostrophe is intentionally NOT paired (English contraction support)', async ({
    page,
  }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type("don't");
    const { value, caret } = await readBody(page);
    expect(value).toBe("don't");
    expect(caret).toBe(5);
  });

  test('Enter on a hyphen list line continues the marker', async ({ page }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type('- foo');
    await page.keyboard.press('Enter');
    await page.keyboard.type('bar');
    const { value } = await readBody(page);
    expect(value).toBe('- foo\n- bar');
  });

  test('Enter on a numbered list line increments the marker', async ({ page }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type('1. first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    const { value } = await readBody(page);
    expect(value).toBe('1. first\n2. second');
  });

  test('Enter on a checkbox line carries the marker with empty checkbox', async ({
    page,
  }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    // Disable bracket auto-pair interference: type the line literally
    // by using `insertText` paste path. The `[` would otherwise auto-
    // pair to `[]` and shift positions — not the unit under test.
    await page.evaluate(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        'textarea[data-pkc-field="body"]',
      );
      if (!ta) throw new Error('body textarea missing');
      ta.value = '- [x] done';
      ta.selectionStart = ta.selectionEnd = ta.value.length;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.focus();
    });
    await page.keyboard.press('Enter');
    await page.keyboard.type('next');
    const { value } = await readBody(page);
    expect(value).toBe('- [x] done\n- [ ] next');
  });

  test('Enter on an empty list line drops the marker (natural escape)', async ({
    page,
  }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type('- ');
    await page.keyboard.press('Enter');
    const { value } = await readBody(page);
    // Empty list line is consumed entirely — line marker dropped, no
    // newline added. This is the "natural escape" pattern documented
    // in editor-key-helpers.ts §1-a.
    expect(value).toBe('');
  });

  test('skip-out: typing ) when caret is before ) advances without duplicate', async ({
    page,
  }) => {
    await bootAndCreateText(page);
    await focusBody(page);
    await page.keyboard.type('('); // produces "()" with caret at 1
    let snap = await readBody(page);
    expect(snap.value).toBe('()');
    expect(snap.caret).toBe(1);
    await page.keyboard.type(')');
    snap = await readBody(page);
    // No duplication — caret simply walks past the closer.
    expect(snap.value).toBe('()');
    expect(snap.caret).toBe(2);
  });
});
