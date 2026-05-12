/**
 * user バグレポ調査(2026-05-10):`:::if{format=html}` 内 `**X**` が太字にならない
 *
 * fixture(user 提供):
 *   :::if{format=html}
 *   __※ 換算式:120,000 × 1.6 + 6,853 × 1 = 192,000 + 6,853 = **{{vars.sky_coins_after}}**
 *   :::
 *
 * frontmatter vars 付きで実機(Playwright)visual 確認、computed font-weight
 * を assert する。
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE_WITH_FRONTMATTER = `---
title: Sky coins 換算
vars:
  sky_coins_before: 120,000
  sky_coins_after: 198,853
---

# 換算結果

:::if{format=html}
__※ 換算式:120,000 × 1.6 + 6,853 × 1 = 192,000 + 6,853 = **{{vars.sky_coins_after}}**
:::

通常 paragraph **これは bold**

:::if{format=html}
**{{vars.sky_coins_before}} → {{vars.sky_coins_after}}**
:::
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test.describe('user バグレポ調査:`**X**` in `:::if{format=html}` block', () => {
  test('center pane:bold 計算 font-weight 確認 + DOM <strong> 確認', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'sky coins bold', FIXTURE_WITH_FRONTMATTER);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    // DOM 内の <strong> 要素を全部取得
    const strongInfo = await rendered.evaluate((root) => {
      const strongs = Array.from(root.querySelectorAll('strong'));
      return strongs.map((s) => ({
        text: s.textContent ?? '',
        fontWeight: getComputedStyle(s).fontWeight,
        parent: s.parentElement?.tagName ?? '',
        parentClass: s.parentElement?.className ?? '',
        // visible / hidden 判定
        offsetParent: s.offsetParent !== null,
        boundingRect: s.getBoundingClientRect().width,
      }));
    });

    console.log('=== <strong> elements ===');
    console.log(JSON.stringify(strongInfo, null, 2));

    // 全 <strong> 要素は font-weight: 700(or "bold" として 700 相当)
    expect(strongInfo.length).toBeGreaterThanOrEqual(3);
    for (const s of strongInfo) {
      // browser computed weight は数字または "bold"
      const w = s.fontWeight;
      const numeric = parseInt(w, 10);
      expect(numeric >= 600 || w === 'bold', `font-weight: ${w} for "${s.text}"`).toBe(true);
    }

    // vars expanded
    const text = await rendered.textContent();
    expect(text).toContain('198,853');
    expect(text).toContain('120,000');

    // :::if{format=html} content visible
    expect(text).toContain('換算式');

    await rendered.screenshot({
      path: 'test-results/phase2-bold-in-if/bold-in-if-center.png',
    });
  });

  test('Viewer popup:bold 同様確認', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'sky coins viewer', FIXTURE_WITH_FRONTMATTER);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const strongInfo = await article.evaluate((root) => {
      const strongs = Array.from(root.querySelectorAll('strong'));
      return strongs.map((s) => ({
        text: s.textContent ?? '',
        fontWeight: getComputedStyle(s).fontWeight,
      }));
    });
    console.log('=== Viewer popup <strong> elements ===');
    console.log(JSON.stringify(strongInfo, null, 2));

    expect(strongInfo.length).toBeGreaterThanOrEqual(3);
    for (const s of strongInfo) {
      const numeric = parseInt(s.fontWeight, 10);
      expect(numeric >= 600 || s.fontWeight === 'bold').toBe(true);
    }

    await popup.screenshot({
      path: 'test-results/phase2-bold-in-if/bold-in-if-viewer.png',
      fullPage: true,
    });
  });
});
