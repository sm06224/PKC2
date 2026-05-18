/**
 * L-6 size token + L-8 空行マーカーの visual parity test
 * (2026-05-07 wave-10-2 Phase 1 追加)。
 *
 * 検証 chain:
 *   1. L-6: `:文字:lg:` / `:文字:120%:` / `:文字:2.5em:` で span 出力
 *      computed font-size が parent の font-size 比で意図通り解決
 *   2. L-8: `_` / `_3` で `<div class="pkc-blank-line" data-pkc-blank-count="N">`
 *      computed height が 1em × N に解決
 *   3. screenshot を保存(証憑)
 */
import { test, expect } from '@playwright/test';

test('L-6 size token + L-8 blank-line:render → CSS apply → bounding rect 一致', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  await page.locator('[data-pkc-field="title"]').first().fill('L-6 size + L-8 blank fixture');
  const body = [
    '段落 0(default)。',
    '',
    'ここは :大きな:lg: と :2倍:2xl: と :120%:120%: と :小さい:sm: の混在。',
    '',
    '_3',
    '',
    '段落 1(3 行ぶん下)。',
    '',
    '_',
    '',
    '段落 2(さらに 1 行ぶん下)。',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  const observed = await rendered.evaluate((root) => {
    const sizeSpans = Array.from(root.querySelectorAll('span.pkc-inline-mark')) as HTMLElement[];
    const sizes = sizeSpans.map((s) => ({
      text: s.textContent ?? '',
      fontSize: getComputedStyle(s).fontSize,
      inlineStyle: s.getAttribute('style') ?? '',
    }));
    const blanks = Array.from(root.querySelectorAll('.pkc-blank-line')) as HTMLElement[];
    const blankRects = blanks.map((b) => ({
      count: b.getAttribute('data-pkc-blank-count'),
      height: b.getBoundingClientRect().height,
    }));
    return { sizes, blankRects };
  });

  console.log('L-6/L-8 observed:', JSON.stringify(observed, null, 2));

  // L-6 size assertions
  const lg = observed.sizes.find((s) => s.text === '大きな');
  const xl2 = observed.sizes.find((s) => s.text === '2倍');
  const pct = observed.sizes.find((s) => s.text === '120%');
  const sm = observed.sizes.find((s) => s.text === '小さい');
  expect(lg?.inlineStyle).toContain('font-size: 1.25em');
  expect(xl2?.inlineStyle).toContain('font-size: 1.875em');
  expect(pct?.inlineStyle).toContain('font-size: 120%');
  expect(sm?.inlineStyle).toContain('font-size: 0.875em');
  // computed font-size の数値関係 ── lg > base > sm の順序が崩れない
  const lgPx = parseFloat(lg!.fontSize);
  const xl2Px = parseFloat(xl2!.fontSize);
  const pctPx = parseFloat(pct!.fontSize);
  const smPx = parseFloat(sm!.fontSize);
  expect(xl2Px).toBeGreaterThan(lgPx);
  expect(lgPx).toBeGreaterThan(pctPx);  // 1.25em > 1.20 (= 120%) when same parent
  expect(pctPx).toBeGreaterThan(smPx);

  // L-8 blank-line assertions
  expect(observed.blankRects.length).toBe(2);
  const blank3 = observed.blankRects.find((b) => b.count === '3');
  const blank1 = observed.blankRects.find((b) => b.count === '1');
  expect(blank3).toBeDefined();
  expect(blank1).toBeDefined();
  // count=3 は count=1 の約 3 倍の高さ(余白なので line-height 等の影響あり、tolerance 緩め)
  expect(blank3!.height).toBeGreaterThan(blank1!.height * 2.5);

  await rendered.screenshot({
    path: 'test-results/wave-10-2/L-6-size-L-8-blank.png',
  });

  // Viewer popup でも同じ CSS が効くか mirror 確認(reform-2026-05 §6 + 2026-05-07
  // hotfix で base.css を増やしたら Viewer の inline style にも mirror する規約)。
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = page.context().waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');
  const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(article).toBeVisible({ timeout: 10_000 });
  const popupObs = await article.evaluate((root) => {
    const lg = root.querySelector('span.pkc-inline-mark[style*="1.25em"]') as HTMLElement | null;
    const blank3 = root.querySelector('.pkc-blank-line[data-pkc-blank-count="3"]') as HTMLElement | null;
    return {
      lgFontSize: lg ? getComputedStyle(lg).fontSize : null,
      blank3Height: blank3 ? blank3.getBoundingClientRect().height : null,
    };
  });
  console.log('Viewer popup observed:', JSON.stringify(popupObs, null, 2));
  expect(popupObs.lgFontSize).not.toBeNull();
  expect(parseFloat(popupObs.lgFontSize!)).toBeGreaterThan(13);  // > body default
  expect(popupObs.blank3Height).not.toBeNull();
  expect(popupObs.blank3Height!).toBeGreaterThan(20);  // 1em × 3 取れている

  await popup.screenshot({
    path: 'test-results/wave-10-2/L-6-size-L-8-blank-viewer.png',
    fullPage: false,
  });

  expect(errors, errors.join('\n')).toEqual([]);
});
