/**
 * Responsive layout smoke (2026-04-26 mobile / tablet wave).
 *
 * Pins the master-detail behaviour the user requested:
 *   "スマホとタブレット向けのレイアウトを作ろう"
 *   "3pane構成を捨てて新たにデザインでしょうね"
 *   "フルHDモニターでデスクトップモードで使っている人がウィンドウ
 *    サイズを小さくした時にスマホやタブレットレイアウトになると
 *    意図しないかもしれない 使用感を損なわないように注意して"
 *
 * Coverage:
 *   1. Phone (touch + 375 px): selection drives the master-detail
 *      stack; the back-arrow is the only way back to the list.
 *   2. Tablet (touch + 768 px): sidebar + center inline; meta is
 *      a slide-over drawer toggled from the existing ◨ button.
 *   3. Desktop with narrow window (no touch + 600 px): MUST stay
 *      on the desktop 3-pane shell — verifies the `pointer:coarse`
 *      gate so a Full HD user shrinking a window is not flipped
 *      into the touch layout.
 *
 * NOT covered:
 *   - Visual styling of the slide-over drawer (covered by the
 *     header + pane regression tests in vitest).
 *   - Saved-search rename / color picker / Data… positioning at
 *     phone width (separate audits).
 */
import { test, expect } from '@playwright/test';

test.describe('responsive: phone (pointer:coarse + 375px)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('selection drives master-detail; back-arrow returns to list', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    const root = page.locator('#pkc-root');
    await root.waitFor({ state: 'visible' });

    // No selection ⇒ list view: sidebar visible, center hidden.
    await expect(root).toHaveAttribute('data-pkc-has-selection', 'false');
    const sidebarVisibleAtList = await page
      .locator('[data-pkc-region="sidebar"]')
      .evaluate((el) => window.getComputedStyle(el).display !== 'none');
    expect(sidebarVisibleAtList).toBe(true);
    const centerHiddenAtList = await page
      .locator('.pkc-center')
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(centerHiddenAtList).toBe(true);

    // Create + commit one entry — that path autoselects.
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill('Master-detail probe');
    await page.locator('[data-pkc-action="commit-edit"]').first().click();
    await expect(root).toHaveAttribute('data-pkc-has-selection', 'true');

    // Detail view: sidebar hidden, center visible.
    const sidebarHiddenAtDetail = await page
      .locator('[data-pkc-region="sidebar"]')
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(sidebarHiddenAtDetail).toBe(true);
    const centerVisibleAtDetail = await page
      .locator('.pkc-center')
      .evaluate((el) => window.getComputedStyle(el).display !== 'none');
    expect(centerVisibleAtDetail).toBe(true);

    // The back-arrow MUST be visible in detail mode (it is the
    // only way back to the list on a touch device).
    const backBtn = page.locator('[data-pkc-action="mobile-back-to-list"]');
    await expect(backBtn).toBeVisible();
    await backBtn.click();
    await expect(root).toHaveAttribute('data-pkc-has-selection', 'false');
  });
});

test.describe('responsive: tablet (pointer:coarse + 768px)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('sidebar + center inline, meta is a slide-over drawer', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/pkc2.html');
    await page.locator('#pkc-root').waitFor({ state: 'visible' });

    // The meta pane is only rendered when there is a selection,
    // so create an entry first.
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill('Tablet meta probe');
    await page.locator('[data-pkc-action="commit-edit"]').first().click();

    // Sidebar inline, center inline, meta hidden by default.
    await expect(page.locator('[data-pkc-region="sidebar"]')).toBeVisible();
    await expect(page.locator('.pkc-center')).toBeVisible();
    const metaHiddenInitially = await page
      .locator('[data-pkc-region="meta"]')
      .evaluate((el) => window.getComputedStyle(el).display === 'none');
    expect(metaHiddenInitially).toBe(true);

    // Toggle meta — it slides in as an absolute-positioned drawer.
    await page.locator('[data-pkc-action="toggle-meta"]').first().click();
    const metaOverlayed = await page
      .locator('[data-pkc-region="meta"]')
      .evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return cs.display !== 'none' && cs.position === 'absolute';
      });
    expect(metaOverlayed).toBe(true);

    // Back-arrow MUST stay hidden on tablet — it is a phone-only
    // affordance because tablet keeps the master visible.
    const backBtnHiddenOnTablet = await page
      .locator('[data-pkc-region="header"], header.pkc-header')
      .first()
      .locator('[data-pkc-action="mobile-back-to-list"]')
      .evaluate(
        (el) => (el ? window.getComputedStyle(el).display === 'none' : true),
        null,
      )
      .catch(() => true);
    expect(backBtnHiddenOnTablet).toBe(true);
  });
});

test.describe('responsive: desktop with narrow window (no touch + 600px)', () => {
  test.use({ hasTouch: false, isMobile: false });

  test('keeps the desktop 3-pane shell — no surprise flip into touch layout', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await page.goto('/pkc2.html');
    await page.locator('#pkc-root').waitFor({ state: 'visible' });

    // Sidebar inline (NOT absolute drawer).
    const sidebarLayout = await page
      .locator('[data-pkc-region="sidebar"]')
      .evaluate((el) => window.getComputedStyle(el).position);
    expect(sidebarLayout).not.toBe('absolute');

    // Create + select one entry so the meta pane mounts.
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill('Desktop narrow probe');
    await page.locator('[data-pkc-action="commit-edit"]').first().click();

    // Meta inline (NOT a drawer either) — desktop default keeps it
    // visible regardless of width because there is no touch input.
    const metaLayout = await page
      .locator('[data-pkc-region="meta"]')
      .evaluate((el) => window.getComputedStyle(el).position);
    expect(metaLayout).not.toBe('absolute');
  });
});
