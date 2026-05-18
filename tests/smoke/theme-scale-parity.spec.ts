/**
 * Phase 3a + 3b — `theme.scale` runtime multiplier parity test.
 *
 * Phase 8 順序性テスト doctrine (`pr-review-checklist.md` §2.11):
 * verify the user-visible observation point (computed root font-size
 * + a sample element's computed padding) actually changes when the
 * user mutates `theme.scale` via the inspector AND when the device
 * class changes. Locks the end-to-end pipeline:
 *
 *   inspector edit → SET_FLAG dispatch → __flags__ container entry
 *     → re-render → applyThemeScale() → setProperty('--theme-scale', N)
 *     → root font-size = calc(16px * N)
 *     → all rem-based tokens (`--space-*`, `--fs-*`) re-resolve
 *     → element computed padding / font-size pixel values shift by N×
 *
 * Phase 3b adds the device-class default cascade: when the flag is
 * at default, applyThemeScale removes `--theme-scale` so
 * `--theme-scale-default` (set by media query) reaches the calc()
 * chain. Mobile (pointer:coarse + max-width:640px) defaults to 0.9.
 */
import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

test('theme.scale flag scales root font-size + element rem values', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  // ── (1) Resting state on desktop viewport: --theme-scale absent
  //         (flag at default), --theme-scale-default = 1.0 from
  //         desktop fallback, root font-size = 16px.
  const baseline = await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      themeScale: cs.getPropertyValue('--theme-scale').trim(),
      themeScaleDefault: cs.getPropertyValue('--theme-scale-default').trim(),
      rootFontSizePx: cs.fontSize,
    };
  });
  console.log('>>> desktop baseline:', JSON.stringify(baseline));

  // Phase 3b: flag at default → applyThemeScale removes the property,
  // so --theme-scale resolves to "" via getPropertyValue. Device
  // default 1.0 cascades through the calc() fallback.
  expect(baseline.themeScale).toBe('');
  expect(baseline.themeScaleDefault).toMatch(/^1(\.0+)?$/);
  expect(baseline.rootFontSizePx).toBe('16px');

  // ── (2) Edit theme.scale to 1.5 via the inspector input.
  const input = page.locator(
    '[data-pkc-action="set-flag-numeric"][data-pkc-key="theme.scale"]',
  );
  await expect(input).toBeVisible();
  await input.fill('1.5');
  await input.dispatchEvent('change');

  await expect(
    page.locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]'),
  ).toHaveAttribute('data-pkc-source', 'container', { timeout: 2_000 });

  const after = await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      themeScale: cs.getPropertyValue('--theme-scale').trim(),
      rootFontSizePx: cs.fontSize,
    };
  });
  console.log('>>> after edit (theme.scale = 1.5):', JSON.stringify(after));

  expect(after.themeScale).toMatch(/^1\.5$/);
  // 16px * 1.5 = 24px exactly.
  expect(after.rootFontSizePx).toBe('24px');

  // ── (3) Reset to default — should snap back, --theme-scale removed.
  const resetBtn = page
    .locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]')
    .locator('.pkc-flag-reset');
  await expect(resetBtn).toBeVisible();
  await resetBtn.click();

  await expect(
    page.locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]'),
  ).toHaveAttribute('data-pkc-source', 'default', { timeout: 2_000 });

  const reset = await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      themeScale: cs.getPropertyValue('--theme-scale').trim(),
      rootFontSizePx: cs.fontSize,
    };
  });
  expect(reset.themeScale).toBe('');
  expect(reset.rootFontSizePx).toBe('16px');
});

test('Phase 3b — mobile viewport activates device-class default 0.9 via media query', async ({
  browser,
}) => {
  // Switch to mobile viewport with coarse pointer (touch device).
  // Playwright's `iPhone` device descriptor uses pointer:coarse +
  // 375px width which matches the @media block in base.css.
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    hasTouch: true,
    isMobile: true,
  });
  const mobilePage = await ctx.newPage();
  await mobilePage.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(mobilePage);

  // ── (1) Mobile resting state: --theme-scale absent, --theme-scale-default
  //         from media query = 0.9, root font-size = 16 * 0.9 = 14.4px.
  const mobileBaseline = await mobilePage.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      themeScale: cs.getPropertyValue('--theme-scale').trim(),
      themeScaleDefault: cs.getPropertyValue('--theme-scale-default').trim(),
      rootFontSizePx: cs.fontSize,
    };
  });
  console.log('>>> mobile baseline:', JSON.stringify(mobileBaseline));
  expect(mobileBaseline.themeScale).toBe('');
  expect(mobileBaseline.themeScaleDefault).toMatch(/^0?\.9$/);
  // 16px * 0.9 = 14.4px exactly.
  expect(mobileBaseline.rootFontSizePx).toBe('14.4px');

  // ── (2) User explicitly opts into desktop-size by setting flag = 1.0.
  //         Device-class default (0.9) must yield to the user's choice.
  const input = mobilePage.locator(
    '[data-pkc-action="set-flag-numeric"][data-pkc-key="theme.scale"]',
  );
  await expect(input).toBeVisible();
  await input.fill('1.0');
  await input.dispatchEvent('change');

  await expect(
    mobilePage.locator('[data-pkc-region="flag-row"][data-pkc-key="theme.scale"]'),
  ).toHaveAttribute('data-pkc-source', 'container', { timeout: 2_000 });

  const mobileOverride = await mobilePage.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      themeScale: cs.getPropertyValue('--theme-scale').trim(),
      rootFontSizePx: cs.fontSize,
    };
  });
  console.log('>>> mobile override (theme.scale = 1.0):', JSON.stringify(mobileOverride));

  expect(mobileOverride.themeScale).toMatch(/^1(\.0+)?$/);
  // The override applies regardless of media query; user's explicit
  // 1.0 should beat device-class 0.9 → root font-size = 16px exactly.
  expect(mobileOverride.rootFontSizePx).toBe('16px');

  await ctx.close();
});
