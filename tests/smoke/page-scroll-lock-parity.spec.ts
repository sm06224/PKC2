/**
 * Page scroll lock — visual parity(2026-07 user 報告)。
 *
 * 報告症状:
 *   (a)「スクロールバーはスクロールするのにコンテンツがスクロールしない」
 *   (b)「全体スクロールと内部スクロールの二重化。親画面はスクロール
 *       不要にしてほしい」
 *
 * 根本原因は html/body に高さ・overflow 指定が無く、#pkc-root も
 * min-height(伸長可)だったこと。シェルが 100vh を超えると body に
 * **外側**スクロールバーが出るが、実コンテンツは内側スクローラー
 * (.pkc-center-content)にあるため外側バーでは動かない。
 *
 * 本 spec は実 browser(Playwright)で「ページは絶対にスクロールせず、
 * コンテンツは内側でスクロールする」ことを wheel 実操作で検証する。
 * vitest / happy-dom は layout を持たないため、この検証は smoke でしか
 * できない(visual-state-parity-testing.md)。
 */

import { test, expect } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

/** ページ(外側)スクロールが完全に殺されていることを検証する共通 assert。 */
async function expectPageLocked(page: import('@playwright/test').Page): Promise<void> {
  const lock = await page.evaluate(() => {
    window.scrollTo(0, 800);
    return {
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollY: window.scrollY,
      docOverflow: document.documentElement.scrollHeight - window.innerHeight,
    };
  });
  expect(lock.bodyOverflow).toBe('hidden');
  expect(lock.scrollY).toBe(0);
  // ページ自体が伸びていない(丸め誤差 1px 許容)。
  expect(lock.docOverflow).toBeLessThanOrEqual(1);
}

test('long text entry: page never scrolls, center content wheel-scrolls', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);

  // Create a text entry whose body is far taller than the viewport.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  const body = page.locator('textarea[data-pkc-field="body"]').first();
  await expect(body).toBeVisible();
  const longBody = Array.from({ length: 300 }, (_, i) => `line ${i + 1} — 長文コンテンツ`).join('\n\n');
  await body.fill(longBody);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');

  // (b) ページ(親)は一切スクロールしない。
  await expectPageLocked(page);

  // (a) 実 wheel 操作:center content の上で wheel → 中身が動く。
  const scroller = page.locator('.pkc-center-content');
  await expect(scroller).toBeVisible();
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollTop), { timeout: 3_000 })
    .toBeGreaterThan(0);

  // wheel 後もページ位置は 0 のまま(内側だけが動いた)。
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  // 内側スクローラーが実際に overflow している(コンテンツはそこにある)。
  const inner = await scroller.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(inner.scrollHeight).toBeGreaterThan(inner.clientHeight);
});

test('calendar / launcher views: internal scroll clamp, page stays locked', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);

  // View-mode tabs appear once at least one user entry exists.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(page.locator('#pkc-root')).toHaveAttribute('data-pkc-phase', 'ready');

  for (const mode of ['calendar', 'launcher'] as const) {
    const tab = page.locator(
      `[data-pkc-action="set-view-mode"][data-pkc-view-mode="${mode}"]`,
    );
    // Launcher tab may be flag-gated in some configurations — skip silently
    // if it is not offered (calendar is always present).
    if (mode === 'launcher' && (await tab.count()) === 0) continue;
    await tab.first().click();

    // The view container must be shrinkable (min-height: 0 fix): it never
    // stretches the page. Whatever its content height, the page stays locked.
    await expectPageLocked(page);

    // The view element itself is the internal scroller and is height-bounded
    // by the shell (its clientHeight cannot exceed the viewport).
    const view = page.locator(mode === 'calendar' ? '.pkc-calendar' : '.pkc-launcher-view');
    await expect(view).toBeVisible();
    const clientHeight = await view.evaluate((el) => el.clientHeight);
    const viewport = page.viewportSize()!;
    expect(clientHeight).toBeLessThanOrEqual(viewport.height);
  }
});
