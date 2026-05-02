/**
 * iPhone push/pop parity — real-OS touch event verification.
 *
 * Companion to `iphone-push-pop.spec.ts` (programmatic
 * `locator.click()` smoke). PR #173 introduced a viewport-driven
 * mobile shell whose primary controls — mobile-back arrow,
 * hamburger drawer, drawer create archetype buttons — are visual,
 * coordinate-dependent affordances. `visual-state-parity-testing.md`
 * §「test pass = ship 禁止」requires real-OS event proof for such
 * controls; the existing smoke uses `locator.click()` which routes
 * around the OS event tree.
 *
 * This file provides parity proof: bounding-box assertion that the
 * control paints inside the mobile header / drawer, `elementFromPoint`
 * to confirm no overlay occludes it, and `page.touchscreen.tap(x, y)`
 * (real OS pointer/touch event tree) to drive the action.
 */

import { test, expect, type Page } from '@playwright/test';

test.describe('iPhone shell parity (pointer:coarse + 375 px)', () => {
  test.use({ hasTouch: true, isMobile: true });

  async function bootList(page: Page): Promise<void> {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');
  }

  async function regionAtCenter(
    page: Page,
    cx: number,
    cy: number,
  ): Promise<{ region: string | null; action: string | null }> {
    return page.evaluate(({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { region: null, action: null };
      const regionEl =
        el.closest<HTMLElement>('[data-pkc-region]') ??
        el.closest<HTMLElement>('header.pkc-mobile-header');
      const actionEl = el.closest<HTMLElement>('[data-pkc-action]');
      return {
        region: regionEl?.getAttribute('data-pkc-region') ?? null,
        action: actionEl?.getAttribute('data-pkc-action') ?? null,
      };
    }, { x: cx, y: cy });
  }

  test('hamburger ☰: paints in mobile header, real touch tap opens drawer', async ({
    page,
  }) => {
    await bootList(page);
    const root = page.locator('#pkc-root');

    const mobileHeader = page.locator('header.pkc-mobile-header');
    const hamburger = page
      .locator('[data-pkc-action="mobile-open-drawer"]')
      .first();

    await expect(mobileHeader).toBeVisible();
    await expect(hamburger).toBeVisible();

    const headerBox = await mobileHeader.boundingBox();
    const btnBox = await hamburger.boundingBox();
    if (!headerBox || !btnBox) throw new Error('boundingBox unavailable');

    // 1. The hamburger paints inside the mobile header — not floating
    // somewhere on the page.
    expect(btnBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
    expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(
      headerBox.y + headerBox.height + 1,
    );

    // 2. Pixel under the button center resolves to the button itself.
    const cx = btnBox.x + btnBox.width / 2;
    const cy = btnBox.y + btnBox.height / 2;
    const hit = await regionAtCenter(page, cx, cy);
    expect(hit.action).toBe('mobile-open-drawer');

    // 3. Real OS touch tap opens the drawer.
    await page.touchscreen.tap(cx, cy);
    const drawer = page.locator('[data-pkc-region="mobile-drawer"]');
    await expect(drawer).toBeVisible();

    // 4. Closing the drawer should leave the user on the list page —
    // no zombie state. We verify by tapping outside the drawer (the
    // dim backdrop covers the rest of the viewport).
    const drawerBox = await drawer.boundingBox();
    if (!drawerBox) throw new Error('drawer has no bounding box');
    // Tap clearly outside drawer content (right side of viewport).
    const outsideX = Math.min(370, drawerBox.x + drawerBox.width + 30);
    const outsideY = 400;
    await page.touchscreen.tap(outsideX, outsideY);
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');
  });

  test('mobile-back: paints, OS-clickable, pops detail → list', async ({
    page,
  }) => {
    await bootList(page);
    const root = page.locator('#pkc-root');

    // Get to detail page: open drawer → tap Text create → fill title
    // → Done. We use programmatic locator.click here because the
    // setup path is *not* the parity unit under test; the parity
    // assertion focuses on the back-arrow tap.
    await page
      .locator('[data-pkc-action="mobile-open-drawer"]')
      .first()
      .click();
    await page
      .locator(
        '.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]',
      )
      .click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'edit');
    await page.locator('[data-pkc-field="title"]').first().fill('Back probe');
    await page.locator('.pkc-mobile-header [data-pkc-action="commit-edit"]').click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'detail');

    // Now the parity assertion on the back arrow.
    const mobileHeader = page.locator('header.pkc-mobile-header');
    const backBtn = page.locator('[data-pkc-action="mobile-back"]');
    await expect(backBtn).toBeVisible();

    const headerBox = await mobileHeader.boundingBox();
    const btnBox = await backBtn.boundingBox();
    if (!headerBox || !btnBox) throw new Error('boundingBox unavailable');

    // Inside the mobile header strip.
    expect(btnBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
    expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(
      headerBox.y + headerBox.height + 1,
    );

    const cx = btnBox.x + btnBox.width / 2;
    const cy = btnBox.y + btnBox.height / 2;
    const hit = await regionAtCenter(page, cx, cy);
    expect(hit.action).toBe('mobile-back');

    // Real OS tap pops detail → list. The action-binder handles
    // mobile-back via DESELECT_ENTRY; that's the state observation.
    await page.touchscreen.tap(cx, cy);
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');
  });
});
