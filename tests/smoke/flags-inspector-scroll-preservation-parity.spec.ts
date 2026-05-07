/**
 * Flags inspector scroll preservation parity test (PR-NN, 2026-05-06).
 *
 * User 修正指示2:「Flags 画面で設定変更時の勝手 scroll 修正」
 *
 * SET_FLAG dispatch updates the `__flags__` system entry → container
 * identity changes → render-scope returns 'full' → root.innerHTML
 * wiped → new flags-inspector-body re-rendered at scrollTop=0.
 * Without continuity, the user is yanked to the top each edit.
 *
 * Phase 8 順序性 doctrine + reform-2026-05 §6 visual-state-parity:
 *   state mutation (SET_FLAG) → consumer behavior (inspector body
 *   scrollTop is preserved across the re-render).
 */

import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

test('順序性: SET_FLAG keeps flags-inspector-body scrollTop across re-render', async ({
  page,
}) => {
  await page.goto('/pkc2.html');
  await bootReady(page);

  // Open the inspector via shell-menu link.
  await page.locator('button[data-pkc-action="toggle-shell-menu"]').first().click();
  await page
    .locator('button[data-pkc-action="open-flags-inspector"]')
    .first()
    .click();

  const overlay = page.locator('[data-pkc-region="flags-inspector-overlay"]');
  await expect(overlay).toBeVisible();

  const body = overlay.locator('[data-pkc-region="flags-inspector-body"]');
  await expect(body).toBeVisible();

  const dimensions = await body.evaluate((el) => ({
    scrollHeight: (el as HTMLElement).scrollHeight,
    clientHeight: (el as HTMLElement).clientHeight,
  }));
  // Inspector body is intentionally tall (registered Tier 0 flags + Build
  // Features). If this ever shrinks below the viewport, the parity claim
  // becomes vacuous — flag the regression here.
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight + 40);

  // Scroll the body, then trigger SET_FLAG WITHOUT going through
  // `input.fill()` — fill calls focus() which auto-scrolls the input
  // into view, defeating the very preservation we're testing.
  // Dispatch the value-change synthetically via the input element's
  // `value` property + a `change` event, which is the same shape
  // action-binder reacts to.
  await body.evaluate((el) => {
    (el as HTMLElement).scrollTop = 200;
  });
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  const beforeScroll = await body.evaluate((el) => (el as HTMLElement).scrollTop);
  expect(beforeScroll).toBeGreaterThan(80);

  // Mutate the first numeric flag value via the DOM directly — no
  // focus-induced scroll. action-binder listens for `change` events
  // bubbling up to the root delegate.
  await overlay.evaluate((el) => {
    const input = el.querySelector<HTMLInputElement>(
      '[data-pkc-action="set-flag-numeric"]',
    );
    if (!input) throw new Error('numeric flag input not found');
    input.value = '11';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // Wait two rAFs so the deferred re-apply (synchronous + rAF retry
  // path in render-continuity) can run.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );

  // Re-query because the body element is replaced on full re-render.
  const afterScroll = await page
    .locator('[data-pkc-region="flags-inspector-body"]')
    .evaluate((el) => (el as HTMLElement).scrollTop);
  // Tolerance ±2px for sub-pixel snapping.
  expect(Math.abs(afterScroll - beforeScroll)).toBeLessThanOrEqual(2);
});
