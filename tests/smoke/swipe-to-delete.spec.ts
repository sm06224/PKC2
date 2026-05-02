/**
 * Swipe-to-delete on the iPhone shell (2026-04-26 user request).
 *
 *   > スマホとタブレットではエントリのスワイプ削除を有効化して
 *
 * The action-binder listens for `touchstart`/`touchmove`/`touchend`
 * on root and tracks horizontal travel against a commit threshold
 * (`SWIPE_COMMIT_PX = 80`). A long left-swipe past the threshold
 * fires `DELETE_ENTRY` directly (Mail-style "full swipe = delete";
 * the entry remains restorable from the 🗑️ Deleted pane until the
 * trash is emptied). A short swipe snaps the row back to its
 * original position with no side effects.
 *
 * Parity (2026-05-02 Phase 1B PR #2): swipe gesture is dispatched
 * via Chrome DevTools Protocol `Input.dispatchTouchEvent` so the
 * browser's real event tree fires (`touchstart` → `touchmove` ×3 →
 * `touchend` with `pointerType: 'touch'`). Earlier versions called
 * `el.dispatchEvent(new TouchEvent(...))` from inside `page.evaluate`,
 * which only synthesizes a JS-level event and bypasses anything
 * the renderer might filter at the engine boundary —
 * `visual-state-parity-testing.md` §「test pass = ship 禁止」flagged
 * that as a half-grade smoke. CDP-level touch events are the touch
 * counterpart of `page.mouse.click(x, y)`.
 */
import { test, expect, type Page } from '@playwright/test';

test.describe('swipe-to-delete (touch only)', () => {
  test.use({ hasTouch: true, isMobile: true });

  async function createOne(page: Page, title: string) {
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page
      .locator('.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill(title);
    await page.locator('.pkc-mobile-header [data-pkc-action="commit-edit"]').click();
    await page.locator('[data-pkc-action="mobile-back"]').click();
  }

  async function swipeRow(page: Page, deltaPx: number) {
    const row = page
      .locator(
        '[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-action="select-entry"]',
      )
      .first();
    const box = await row.boundingBox();
    if (!box) throw new Error('row has no bounding box');
    const startX = box.x + box.width - 20;
    const y = box.y + box.height / 2;

    // Real OS touch event tree via Chrome DevTools Protocol. This is
    // the touch equivalent of `page.mouse.click(x, y)` — events flow
    // through the same engine path the user's finger would, and any
    // upstream listener (`{ passive: false }`, capture phase, etc.)
    // sees them exactly as in production.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: startX, y, id: 1 }],
    });
    // Multi-step move so the gesture passes the 8 px lock threshold
    // and midpoint listeners observe motion.
    for (const frac of [0.3, 0.7, 1]) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: startX + Math.round(deltaPx * frac), y, id: 1 },
        ],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    await cdp.detach();
  }

  test('left swipe past commit threshold deletes the entry', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    await page.locator('#pkc-root').waitFor({ state: 'visible' });

    await createOne(page, 'Swipe-delete target');
    await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-mobile-page', 'list');

    // Far past the 80 px threshold so the commit branch fires.
    await swipeRow(page, -100);
    await page.waitForTimeout(150);

    const remainingRows = await page.locator(
      '[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-action="select-entry"]',
    ).count();
    expect(remainingRows, 'commit-threshold swipe deletes the entry').toBe(0);
  });

  test('short swipe snaps back without deleting', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pkc2.html');
    await page.locator('#pkc-root').waitFor({ state: 'visible' });

    await createOne(page, 'Snap-back target');
    const row = page.locator(
      '[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-action="select-entry"]',
    ).first();

    await swipeRow(page, -50); // below the 80 px commit threshold
    await page.waitForTimeout(150);

    const stillThere = await page.locator(
      '[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-action="select-entry"]',
    ).count();
    expect(stillThere, 'sub-threshold swipe should NOT delete').toBe(1);

    const transformAfter = await row.evaluate((el) => (el as HTMLElement).style.transform);
    expect(transformAfter, 'row snaps back to translateX(0) on release').toBe('');
  });
});
