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
 */
import { test, expect } from '@playwright/test';

test.describe('swipe-to-delete (touch only)', () => {
  test.use({ hasTouch: true, isMobile: true });

  async function createOne(page: import('@playwright/test').Page, title: string) {
    await page.locator('[data-pkc-action="mobile-open-drawer"]').first().click();
    await page
      .locator('.pkc-mobile-drawer [data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .click();
    await page.locator('[data-pkc-field="title"]').first().fill(title);
    await page.locator('.pkc-mobile-header [data-pkc-action="commit-edit"]').click();
    await page.locator('[data-pkc-action="mobile-back"]').click();
  }

  async function swipeRow(
    page: import('@playwright/test').Page,
    deltaPx: number,
  ) {
    const row = page.locator(
      '[data-pkc-region="sidebar"] li.pkc-entry-item[data-pkc-action="select-entry"]',
    ).first();
    const box = await row.boundingBox();
    if (!box) throw new Error('row has no bounding box');
    const startX = box.x + box.width - 20;
    const y = box.y + box.height / 2;

    await page.evaluate(({ x1, dx, cy }) => {
      const el = document.elementFromPoint(x1, cy) as HTMLElement | null;
      if (!el) throw new Error('no element at swipe origin');
      const fire = (type: string, cx: number, cyy: number) => {
        const touch = new Touch({
          identifier: 1,
          target: el,
          clientX: cx,
          clientY: cyy,
        });
        const ev = new TouchEvent(type, {
          cancelable: true,
          bubbles: true,
          touches: type === 'touchend' ? [] : [touch],
          targetTouches: type === 'touchend' ? [] : [touch],
          changedTouches: [touch],
        });
        el.dispatchEvent(ev);
      };
      fire('touchstart', x1, cy);
      // Multi-step move so the gesture passes the 8 px lock threshold
      // and any midpoint listeners observe motion.
      fire('touchmove', x1 + Math.round(dx * 0.3), cy);
      fire('touchmove', x1 + Math.round(dx * 0.7), cy);
      fire('touchmove', x1 + dx, cy);
      fire('touchend', x1 + dx, cy);
    }, { x1: startX, dx: deltaPx, cy: y });
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
