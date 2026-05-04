/**
 * Phase 3a — `theme.scale` runtime multiplier parity test.
 *
 * Phase 8 順序性テスト doctrine (`pr-review-checklist.md` §2.11):
 * verify that the user-visible observation point (computed root
 * font-size + a sample element's computed padding) actually changes
 * when the user mutates `theme.scale` via the inspector. This locks
 * the end-to-end pipeline:
 *
 *   inspector edit → SET_FLAG dispatch → __flags__ container entry
 *     → re-render → applyThemeScale() → setProperty('--theme-scale', N)
 *     → root font-size = calc(16px * N)
 *     → all rem-based tokens (`--space-*`, `--fs-*`) re-resolve
 *     → element computed padding / font-size pixel values shift by N×
 *
 * The smoke / unit suites already cover (a) flag dispatch lands and
 * (b) `--theme-scale` ends up on <html>. This test fills the gap by
 * also asserting (c) computed pixel values on a real element move
 * by the expected ratio after the edit, with no reload.
 */
import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

test('theme.scale flag scales root font-size + element rem values', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  // ── (1) Resting state: --theme-scale resolves to 1, root font-size = 16px.
  const baseline = await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    const themeScaleVar = cs.getPropertyValue('--theme-scale').trim();
    const rootFontSize = cs.fontSize;
    // Sample a stable element that uses --space-3 (= 0.5rem). The
    // flags-inspector backdrop / panel padding are predictable.
    const panel = document.querySelector(
      '.pkc-flags-inspector-panel',
    ) as HTMLElement | null;
    const panelCs = panel ? getComputedStyle(panel) : null;
    return {
      themeScaleVar,
      rootFontSizePx: rootFontSize,
      panelPaddingTopPx: panelCs?.paddingTop ?? '?',
    };
  });
  console.log('>>> baseline:', JSON.stringify(baseline));

  expect(baseline.themeScaleVar).toMatch(/^1(\.0+)?$/);
  expect(baseline.rootFontSizePx).toBe('16px');

  // ── (2) Edit theme.scale to 1.5 via the inspector input.
  const input = page.locator(
    '[data-pkc-action="set-flag-numeric"][data-pkc-key="theme.scale"]',
  );
  await expect(input).toBeVisible();
  await input.fill('1.5');
  await input.dispatchEvent('change');

  // Source flips to container — confirms SET_FLAG dispatched.
  await expect(
    page.locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]'),
  ).toHaveAttribute('data-pkc-source', 'container', { timeout: 2_000 });

  // ── (3) Without a reload, root font-size and rem-based padding
  //         must shift by 1.5×.
  const after = await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    const themeScaleVar = cs.getPropertyValue('--theme-scale').trim();
    const rootFontSize = cs.fontSize;
    const panel = document.querySelector(
      '.pkc-flags-inspector-panel',
    ) as HTMLElement | null;
    const panelCs = panel ? getComputedStyle(panel) : null;
    return {
      themeScaleVar,
      rootFontSizePx: rootFontSize,
      panelPaddingTopPx: panelCs?.paddingTop ?? '?',
    };
  });
  console.log('>>> after edit (theme.scale = 1.5):', JSON.stringify(after));

  expect(after.themeScaleVar).toMatch(/^1\.5$/);
  // 16px * 1.5 = 24px exactly.
  expect(after.rootFontSizePx).toBe('24px');

  // The flags inspector panel padding is `var(--space-5)` = 1rem.
  // baseline: 1rem * 16px = 16px. after: 1rem * 24px = 24px.
  // The browser may render computed values with sub-pixel precision
  // when rem isn't an integer multiple of px; assert with tolerance.
  const baselinePadding = parseFloat(baseline.panelPaddingTopPx);
  const afterPadding = parseFloat(after.panelPaddingTopPx);
  expect(baselinePadding).toBeGreaterThan(0);
  expect(afterPadding / baselinePadding).toBeCloseTo(1.5, 1);

  // ── (4) Reset to 1.0 via the row's reset button — the
  //         user-visible observation should snap back.
  const resetBtn = page
    .locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]')
    .locator('.pkc-flag-reset');
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();

  await expect(
    page.locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]'),
  ).toHaveAttribute('data-pkc-source', 'default', { timeout: 2_000 });

  const reset = await page.evaluate(() => {
    return getComputedStyle(document.documentElement).fontSize;
  });
  expect(reset).toBe('16px');
});
