/**
 * iPhone textarea/input zoom suppression smoke (PR #195).
 *
 * Background: iOS Safari auto-zooms when an input / textarea with
 * `font-size < 16px` receives focus, breaking 俯瞰性. PR #195 ships
 * two layers of suppression:
 *
 *   a. `<meta name="viewport" ... maximum-scale=1.0,
 *       user-scalable=no>` — blocks both auto-zoom AND user pinch.
 *   b. `@media (pointer: coarse) { textarea, input[type="text"]
 *       { font-size: 16px; } }` — belt-and-suspenders so even
 *       browsers that ignore the viewport hint don't zoom.
 *
 * 5-gate gate 5 (UX effect observed) for this PR has been a deficit
 * because Playwright's webkit project doesn't faithfully reproduce
 * iOS Safari's auto-zoom rendering pipeline (it's a desktop WebKit
 * build). What IS testable is the suppression mechanism itself:
 *
 *   1. The viewport meta tag actually carries the suppression
 *      attributes (regression guard if a future shell.html bump
 *      drops them).
 *   2. The CSS rule's computed font-size is >= 16 px on a focused
 *      textarea under (pointer: coarse) emulation — proves the
 *      belt-and-suspenders rule applies in the rendered DOM, which
 *      is the layer Safari's auto-zoom heuristic reads.
 *   3. visualViewport.scale stays at 1.0 after focus (this is the
 *      strict iOS-style assertion; passes in chromium emulation
 *      because no zoom is attempted, but pins the behavior so a
 *      future regression that DOES introduce a scale change is
 *      caught even on non-iOS engines).
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('iPhone zoom suppress (pointer:coarse + 375 px)', () => {
  test.use({ hasTouch: true, isMobile: true });

  async function bootMobile(page: Page): Promise<void> {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });
  }

  test('viewport meta carries maximum-scale=1.0 + user-scalable=no', async ({
    page,
  }) => {
    await bootMobile(page);
    const viewportContent = await page.evaluate(() => {
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[name="viewport"]',
      );
      return meta?.getAttribute('content') ?? '';
    });
    // The exact attribute order is implementation-defined; assert by
    // substring so a reordered meta still passes.
    expect(viewportContent).toMatch(/maximum-scale=1(\.0)?\b/);
    expect(viewportContent).toMatch(/user-scalable=no/);
    expect(viewportContent).toMatch(/initial-scale=1(\.0)?\b/);
    expect(viewportContent).toMatch(/width=device-width/);
  });

  test('focused textarea gets computed font-size >= 16px under pointer:coarse', async ({
    page,
  }) => {
    await bootMobile(page);
    // Sanity: the test must actually run under pointer:coarse for
    // the assertion to be meaningful. Playwright chromium's mobile
    // emulation doesn't always switch the pointer media; if it
    // doesn't, skip rather than false-pass.
    const isCoarse = await page.evaluate(
      () => window.matchMedia('(pointer: coarse)').matches,
    );
    test.skip(
      !isCoarse,
      'pointer:coarse media did not engage in this Playwright project ' +
        '(chromium mobile emulation gap, not a PKC2 regression)',
    );

    // Create a TEXT entry so the body textarea exists.
    await page
      .locator('[data-pkc-action="mobile-open-drawer"]')
      .first()
      .click();
    await page
      .locator(
        '.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]',
      )
      .click();
    const body = page.locator('textarea[data-pkc-field="body"]').first();
    await expect(body).toBeVisible();
    await body.click();
    await body.focus();

    // Computed font-size on the focused textarea must be >= 16 px.
    // Below that threshold, iOS Safari's auto-zoom kicks in even
    // when the viewport meta is set (some iOS versions ignore the
    // hint), so this rule is the actual safety net.
    const debug = await body.evaluate((el) => {
      const cs = window.getComputedStyle(el as HTMLTextAreaElement);
      return {
        fontSize: parseFloat(cs.fontSize),
        className: (el as HTMLElement).className,
        coarse: window.matchMedia('(pointer: coarse)').matches,
      };
    });
    expect(
      debug.fontSize,
      `font-size on textarea (class="${debug.className}", coarse=${debug.coarse})`,
    ).toBeGreaterThanOrEqual(16);
  });

  test('visualViewport.scale stays at 1.0 after textarea focus', async ({
    page,
  }) => {
    await bootMobile(page);
    await page
      .locator('[data-pkc-action="mobile-open-drawer"]')
      .first()
      .click();
    await page
      .locator(
        '.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]',
      )
      .click();
    const body = page.locator('textarea[data-pkc-field="body"]').first();
    await expect(body).toBeVisible();

    const before = await page.evaluate(
      () => window.visualViewport?.scale ?? 1,
    );
    await body.click();
    await body.focus();
    // Allow any zoom transition to settle.
    await page.waitForTimeout(300);
    const after = await page.evaluate(
      () => window.visualViewport?.scale ?? 1,
    );
    expect(after).toBe(before);
    expect(after).toBe(1);
  });
});
