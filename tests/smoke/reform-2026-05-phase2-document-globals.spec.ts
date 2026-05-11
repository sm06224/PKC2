/**
 * reform-2026-05 Phase 2 PR-2A:frontmatter document globals
 * (writing / direction / align)の visual parity smoke。
 *
 * 仕様(02-frontmatter-and-globals.md §2.3):
 *   - writing: horizontal | vertical → CSS writing-mode 適用
 *   - direction: ltr | rtl → HTML dir 属性 + CSS direction 適用
 *   - align: left|right|center|top|bottom → CSS text-align 適用
 *
 * 検証 surface:center pane / Viewer popup
 *
 * 検証 chain:
 *   1. body 入力 + frontmatter で writing/direction/align 指定
 *   2. rendered DOM root に data-pkc-writing / dir / data-pkc-doc-align 反映
 *   3. computed CSS が期待値に解決
 *   4. screenshot 取得(視覚証憑)
 */
import { test, expect, type Page } from '@playwright/test';

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

test.describe('reform-2026-05 Phase 2 PR-2A:frontmatter document globals visual parity', () => {
  test('center pane:writing=horizontal direction=rtl align=right が反映', async ({ page }) => {
    await bootApp(page);
    const body = `---
writing: horizontal
direction: rtl
align: right
---

# RTL ドキュメント

本文サンプル。Arabic / Hebrew 用の右→左 default flow。

|> 右寄せ(end は logical で direction=rtl では左になる)
`;
    await createTextEntry(page, 'RTL doc', body);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      const cs = getComputedStyle(root as HTMLElement);
      return {
        writing: root.getAttribute('data-pkc-writing'),
        dir: root.getAttribute('dir'),
        docAlign: root.getAttribute('data-pkc-doc-align'),
        computedDirection: cs.direction,
        computedTextAlign: cs.textAlign,
        computedWritingMode: cs.writingMode,
      };
    });

    console.log('horizontal/rtl/right observed:', JSON.stringify(observed, null, 2));

    expect(observed.writing).toBe('horizontal');
    expect(observed.dir).toBe('rtl');
    expect(observed.docAlign).toBe('right');
    expect(observed.computedDirection).toBe('rtl');
    expect(observed.computedTextAlign).toBe('right');

    await rendered.screenshot({
      path: 'test-results/phase2-globals/center-rtl.png',
    });
  });

  test('center pane:writing=vertical direction=rtl(伝統的縦書き)→ writing-mode: vertical-rl', async ({ page }) => {
    await bootApp(page);
    const body = `---
writing: vertical
direction: rtl
---

# 縦書き伝統

日本語 / 中国語の伝統的縦書き(右上起こし)。
`;
    await createTextEntry(page, 'vertical-rl', body);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();

    const observed = await rendered.evaluate((root) => ({
      writing: root.getAttribute('data-pkc-writing'),
      dir: root.getAttribute('dir'),
      computedWritingMode: getComputedStyle(root as HTMLElement).writingMode,
    }));

    console.log('vertical-rl observed:', JSON.stringify(observed, null, 2));

    expect(observed.writing).toBe('vertical');
    expect(observed.dir).toBe('rtl');
    // writing-mode: vertical-rl(default vertical で direction=rtl)
    expect(observed.computedWritingMode).toBe('vertical-rl');

    await rendered.screenshot({
      path: 'test-results/phase2-globals/center-vertical-rl.png',
    });
  });

  test('center pane:writing=vertical direction=ltr(蒙古文)→ vertical-lr', async ({ page }) => {
    await bootApp(page);
    const body = `---
writing: vertical
direction: ltr
---

# 縦書き左起こし

蒙古文(Mongolian)用の縦書き左起こし。
`;
    await createTextEntry(page, 'vertical-lr', body);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();

    const observed = await rendered.evaluate((root) => ({
      writing: root.getAttribute('data-pkc-writing'),
      dir: root.getAttribute('dir'),
      computedWritingMode: getComputedStyle(root as HTMLElement).writingMode,
    }));

    expect(observed.writing).toBe('vertical');
    expect(observed.dir).toBe('ltr');
    expect(observed.computedWritingMode).toBe('vertical-lr');

    await rendered.screenshot({
      path: 'test-results/phase2-globals/center-vertical-lr.png',
    });
  });

  test('center pane:align=center で computedTextAlign が center', async ({ page }) => {
    await bootApp(page);
    const body = `---
align: center
---

# 中央寄せドキュメント

全段落 default で center 寄せ。
`;
    await createTextEntry(page, 'center', body);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();

    const observed = await rendered.evaluate((root) => ({
      docAlign: root.getAttribute('data-pkc-doc-align'),
      computedTextAlign: getComputedStyle(root as HTMLElement).textAlign,
    }));

    expect(observed.docAlign).toBe('center');
    expect(observed.computedTextAlign).toBe('center');
  });

  test('center pane:frontmatter 不在 → globals 反映なし(regression)', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'no globals', '# 普通の文書\n\n本文。');

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible();

    const observed = await rendered.evaluate((root) => ({
      writing: root.getAttribute('data-pkc-writing'),
      dir: root.getAttribute('dir'),
      docAlign: root.getAttribute('data-pkc-doc-align'),
    }));

    expect(observed.writing).toBeNull();
    expect(observed.dir).toBeNull();
    expect(observed.docAlign).toBeNull();
  });

  test('Viewer popup:writing/direction/align が CSS mirror で反映', async ({ page, context }) => {
    await bootApp(page);
    const body = `---
writing: horizontal
direction: rtl
align: right
---

# RTL Viewer popup

本文。
`;
    await createTextEntry(page, 'Viewer RTL', body);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const observed = await article.evaluate((root) => {
      const cs = getComputedStyle(root as HTMLElement);
      return {
        writing: root.getAttribute('data-pkc-writing'),
        dir: root.getAttribute('dir'),
        docAlign: root.getAttribute('data-pkc-doc-align'),
        computedDirection: cs.direction,
        computedTextAlign: cs.textAlign,
      };
    });

    console.log('Viewer popup globals observed:', JSON.stringify(observed, null, 2));

    expect(observed.writing).toBe('horizontal');
    expect(observed.dir).toBe('rtl');
    expect(observed.docAlign).toBe('right');
    expect(observed.computedDirection).toBe('rtl');
    expect(observed.computedTextAlign).toBe('right');

    await popup.screenshot({
      path: 'test-results/phase2-globals/viewer-rtl.png',
      fullPage: true,
    });
  });
});
