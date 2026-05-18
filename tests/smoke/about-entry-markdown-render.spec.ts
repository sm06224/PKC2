/**
 * reform-2026-05 Phase 2 PR-2Q(2026-05-10、user 直接指示):
 * About entry の Highlights / Known limitations が PKC Markdown で render される。
 *
 * dogfooding doctrine:About 自身が PKC Markdown のお披露目の場、本機能を含む
 * release notes 自身を本機能で表示する。
 */
import { test, expect } from '@playwright/test';

test('About entry の Highlights / Known limitations が markdown render', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // About entry を選択(shell-menu の About button or version section)
  // dropdown menu を開いてから select-about を click
  const shellMenuToggle = page.locator('[data-pkc-action="toggle-shell-menu"]').first();
  if (await shellMenuToggle.count() > 0) {
    await shellMenuToggle.click();
    await page.waitForTimeout(200);
  }
  const aboutBtn = page.locator('[data-pkc-action="select-about"]').first();
  await aboutBtn.click({ force: true });
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // About region 確認
  const aboutRegion = page.locator('[data-pkc-region="about-release"]').first();
  await expect(aboutRegion).toBeVisible({ timeout: 15_000 });

  // Highlights list の最初の li 内に <strong> または <em> が存在
  const highlightsList = page.locator('[data-pkc-region="about-release-highlights"]').first();
  await expect(highlightsList).toBeVisible();

  const result = await highlightsList.evaluate((ul) => {
    // 最初の li
    const li = ul.querySelector('li.pkc-about-release-item');
    if (!li) return { hasLi: false, hasStrong: false, hasCode: false, hasLiteralBoldMarker: false, sampleHTML: '' };
    // code 要素内 text は除外して literal marker を判定(code span 内の `**X**` は意図通り)
    const clone = li.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('code').forEach((c) => c.remove());
    const textOutsideCode = clone.textContent ?? '';
    return {
      hasLi: true,
      hasStrong: !!li.querySelector('strong'),
      hasCode: !!li.querySelector('code'),
      // code span 外で `**reform-2026-05` のような literal は残っていない
      hasLiteralBoldMarker: textOutsideCode.includes('**reform'),
      sampleHTML: li.innerHTML.substring(0, 300),
    };
  });

  console.log('About Highlights first li sample:', JSON.stringify(result, null, 2));

  expect(result.hasLi, 'Highlights li exists').toBe(true);
  expect(result.hasStrong, 'first highlight contains <strong>').toBe(true);
  expect(result.hasLiteralBoldMarker, 'no literal **reform marker outside code').toBe(false);

  // Known limitations も markdown render
  const limitsList = page.locator('[data-pkc-region="about-release-limitations"]').first();
  await expect(limitsList).toBeVisible();
  const limitsResult = await limitsList.evaluate((ul) => {
    const items = Array.from(ul.querySelectorAll('li.pkc-about-release-item'));
    const totalStrong = items.reduce((acc, li) => acc + (li.querySelectorAll('strong').length), 0);
    const totalCode = items.reduce((acc, li) => acc + (li.querySelectorAll('code').length), 0);
    return { itemCount: items.length, totalStrong, totalCode };
  });
  console.log('Known limitations:', JSON.stringify(limitsResult));
  expect(limitsResult.itemCount).toBeGreaterThan(0);
  expect(limitsResult.totalStrong + limitsResult.totalCode).toBeGreaterThan(0);

  await aboutRegion.screenshot({ path: 'test-results/about-markdown/about-release.png' });
});
