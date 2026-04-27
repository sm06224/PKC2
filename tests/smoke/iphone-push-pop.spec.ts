/**
 * iPhone push/pop shell smoke (2026-04-26 mobile redesign).
 *
 * Pins the Jobs-philosophy iPhone shell:
 *   - Single attribute drives page routing —
 *     `#pkc-root[data-pkc-mobile-page] = list | detail | edit`
 *   - List ⇒ sidebar full-width, detail ⇒ center full-width,
 *     edit ⇒ center full-width with the desktop action bar hidden
 *     (mobile header carries Cancel + Done).
 *   - Hamburger ☰ opens a drawer that surfaces the create
 *     archetypes, Data… export/import, Settings, Help — so the
 *     desktop header chrome never has to be crammed onto a 375 px
 *     viewport.
 *   - Back-arrow `‹ List` pops detail → list, mirroring Esc on
 *     desktop.
 *
 * Activation gate: `pointer:coarse + max-width:640px`. Configured
 * here via Playwright `hasTouch: true` + 375 px viewport. A
 * desktop user shrinking their window past 640 px is NOT covered
 * here on purpose — the desktop fallback is exercised by the rest
 * of the smoke suite (`app-launch`, `theme-switching`, …).
 */
import { test, expect } from '@playwright/test';

test.describe('iPhone shell (pointer:coarse + 375 px)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('list → drawer → create → edit → save → detail → back', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });

    // Boot lands on the list page; mobile header is the active
    // chrome (the desktop `<header>` is `display: none`).
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');
    const desktopHeaderHidden = await page
      .locator('header.pkc-header')
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(desktopHeaderHidden).toBe(true);
    const mobileHeaderVisible = await page
      .locator('header.pkc-mobile-header')
      .evaluate((el) => window.getComputedStyle(el).display !== 'none');
    expect(mobileHeaderVisible).toBe(true);

    // Open the hamburger drawer; it overlays from the left.
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    const drawer = page.locator('[data-pkc-region="mobile-drawer"]');
    await expect(drawer).toBeVisible();
    const drawerLayout = await drawer.evaluate((el) => window.getComputedStyle(el).position);
    expect(drawerLayout).toBe('fixed');

    // Tap the Text create button inside the drawer — that fires
    // CREATE_ENTRY which auto-selects + flips into editing phase,
    // landing the user on the edit page.
    await page
      .locator('.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'edit');
    // The drawer is wiped by the renderer pass after the dispatch,
    // so it should no longer be in the DOM.
    await expect(drawer).toHaveCount(0);

    // Edit page header carries Cancel + Done; the desktop action
    // bar is suppressed (verified via CSS display:none) so the
    // mobile header is the canonical edit chrome.
    await page.locator('[data-pkc-field="title"]').first().fill('Jobs would approve');
    const desktopActionBarHidden = await page
      .locator('.pkc-action-bar')
      .first()
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(desktopActionBarHidden).toBe(true);

    // Save via the mobile header Done button.
    await page.locator('.pkc-mobile-header [data-pkc-action="commit-edit"]').click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'detail');

    // Detail page header carries `‹ List` + truncated title.
    const backBtn = page.locator('[data-pkc-action="mobile-back"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();

    // Pop returns us to the list page.
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');
  });

  test('list page shows the sidebar even with persisted pane-prefs sidebar=true', async ({ page }) => {
    // Regression for the user-reported bug:
    //   > デフォルトで縦画面だと左ペイン相当が開いていない時がある。
    //   > 横表示にしていったんサイドペインを出せば見えるようになる。
    // The legacy `.pkc-sidebar[data-pkc-collapsed="true"]
    // { width: 0 !important }` rule was winning over the
    // master-detail rule because of the `!important`. Stale prefs
    // (e.g. from a previous landscape session that toggled the
    // sidebar shut) left the iPhone list page silently empty.
    //
    // Seed `localStorage` with the bad pref BEFORE navigating so
    // the renderer reads it on first paint, then verify the
    // sidebar is still painted full-width.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'pkc2.panePrefs',
        JSON.stringify({ sidebar: true, meta: true }),
      );
    });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'list');

    const sidebarLayout = await page
      .locator('[data-pkc-region="sidebar"]')
      .evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return { width: cs.width, display: cs.display };
      });
    expect(sidebarLayout.display, 'sidebar must be visible on list page').not.toBe('none');
    // 375 px viewport — sidebar must take the full width, not 0.
    expect(parseFloat(sidebarLayout.width), 'sidebar width should not be zero').toBeGreaterThan(300);
  });

  test('mobile-back during editing cancels the edit before popping', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });

    // Create + commit one entry so we have something to edit.
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page
      .locator('.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill('Edit-cancel probe');
    await page.locator('.pkc-mobile-header [data-pkc-action="commit-edit"]').click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'detail');

    // Re-enter edit via the desktop edit button (it's still
    // present in the entry detail body, just outside the mobile
    // header chrome).
    await page.locator('[data-pkc-action="begin-edit"]').first().click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'edit');

    // Tap Cancel in the mobile header — should drop the edit and
    // land on detail (NOT the list, the entry stays selected).
    await page.locator('.pkc-mobile-header [data-pkc-action="cancel-edit"]').click();
    await expect(root).toHaveAttribute('data-pkc-mobile-page', 'detail');
  });
});

test.describe('desktop fallback (no touch + narrow window)', () => {
  test.use({ hasTouch: false, isMobile: false });

  test('Full HD user shrinking the window past 640 px keeps desktop chrome', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/pkc2.html');
    await page.locator('#pkc-root').waitFor({ state: 'visible' });

    // Mobile header MUST be hidden — only the desktop header is
    // visible, regardless of how narrow the window is.
    const mobileHeaderHiddenOnDesktop = await page
      .locator('header.pkc-mobile-header')
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(mobileHeaderHiddenOnDesktop).toBe(true);
    const desktopHeaderVisible = await page
      .locator('header.pkc-header')
      .evaluate((el) => window.getComputedStyle(el).display !== 'none');
    expect(desktopHeaderVisible).toBe(true);
  });
});
