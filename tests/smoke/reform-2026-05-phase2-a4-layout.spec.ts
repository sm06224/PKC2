/**
 * reform-2026-05 Phase 2 PR-2N(2026-05-10):document layout 組版。
 *
 * AI が生成する「A4 2 段組レポート」「letter 1 段組」等の generative 組版を
 * frontmatter `layout: a4-2col` で 1 行宣言。CSS `column-count` + `@media print`
 * + `@page size` を組み合わせて screen / print 両対応。
 *
 * 検証:
 *   - data-pkc-layout attribute 反映
 *   - column-count 適用(2col / 3col)
 *   - 用紙サイズ width(A4 = 21cm)
 *   - 見出しは段抜き、figure / table は break-inside avoid
 *   - invalid layout は warning + default 復帰
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE_A4_2COL = `---
title: A4 2 段組レポート
layout: a4-2col
---

# 報告書タイトル

本セクションは 2 段組レイアウトでレンダリングされる。

## 序論

A4 2 段組は学術論文 / 技術レポートで頻出する組版スタイル。markdown 構文だけで
これを実現するには、frontmatter で layout: a4-2col と宣言するだけで良い。

## 第 1 章 — 設計

複数段組では行長が短くなり、可読性が向上する。column-gap は 0.8cm、column-rule
で段間の divider を引く。

## 第 2 章 — 実装

CSS column-count: 2 で実現、見出し(h1 / h2)は column-span: all で段抜き
する設計。

| 項目 | 値 |
|------|-----|
| Paper | A4 |
| Columns | 2 |
| Gap | 0.8cm |

## 第 3 章 — 結論

frontmatter 1 行で AI 生成 reproductive な組版が実現する。
`;

const FIXTURE_A4_3COL = `---
title: 3 段組
layout: a4-3col
---

# 3 段組テスト

## 第 1 段

3 段組はニュースペーパー / 雑誌風レイアウトで使用。

## 第 2 段

column-count: 3、column-gap: 0.6cm、column-rule あり。
`;

const FIXTURE_INVALID = `---
title: 不正 layout
layout: a3-7col
---

# 不正 layout は default に fallback

invalid layout 値は warning + skip、default screen-first layout に戻る。
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test.describe('reform Phase 2 PR-2N:A4 / B5 / letter / legal 段組組版', () => {
  test('a4-2col:data-pkc-layout 適用 + column-count: 2 + 見出し段抜き', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'a4-2col report', FIXTURE_A4_2COL);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    // data-pkc-layout 反映
    await expect(rendered).toHaveAttribute('data-pkc-layout', 'a4-2col');

    // CSS computed values 確認
    const computed = await rendered.evaluate((el) => {
      const cs = getComputedStyle(el as HTMLElement);
      return {
        columnCount: cs.columnCount,
        columnGap: cs.columnGap,
        maxWidth: cs.maxWidth,
      };
    });
    expect(computed.columnCount).toBe('2');
    // max-width は --pkc-page-w 経由で 21cm(21 * 96/2.54 ≈ 793.7 px)
    expect(parseFloat(computed.maxWidth)).toBeGreaterThan(700);
    expect(parseFloat(computed.maxWidth)).toBeLessThan(820);

    // 見出し(h1 / h2)が column-span: all
    const h2Span = await rendered.locator('h2').first().evaluate((el) =>
      getComputedStyle(el).columnSpan,
    );
    expect(h2Span).toBe('all');

    // table が break-inside avoid
    const tableBreak = await rendered.locator('table').first().evaluate((el) =>
      getComputedStyle(el).breakInside,
    );
    expect(tableBreak).toBe('avoid');

    await page.screenshot({
      path: 'test-results/phase2-a4-layout/a4-2col-center.png',
      fullPage: true,
    });
  });

  test('a4-3col:column-count: 3', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'a4-3col', FIXTURE_A4_3COL);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toHaveAttribute('data-pkc-layout', 'a4-3col');
    const columnCount = await rendered.evaluate((el) =>
      getComputedStyle(el as HTMLElement).columnCount,
    );
    expect(columnCount).toBe('3');
  });

  test('invalid layout(a3-7col)は data-pkc-layout 付かない + default', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'invalid layout', FIXTURE_INVALID);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    // layout invalid なので data-pkc-layout 属性が無い
    const layoutAttr = await rendered.getAttribute('data-pkc-layout');
    expect(layoutAttr).toBeNull();
    // column-count は default(=`auto`)
    const columnCount = await rendered.evaluate((el) =>
      getComputedStyle(el as HTMLElement).columnCount,
    );
    expect(columnCount).toBe('auto');
  });

  test('Viewer popup:a4-2col が popup でも適用(印刷ターゲット)', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'a4-2col viewer', FIXTURE_A4_2COL);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });
    await expect(article).toHaveAttribute('data-pkc-layout', 'a4-2col');

    const columnCount = await article.evaluate((el) =>
      getComputedStyle(el as HTMLElement).columnCount,
    );
    expect(columnCount).toBe('2');

    await popup.screenshot({
      path: 'test-results/phase2-a4-layout/a4-2col-viewer.png',
      fullPage: true,
    });
  });
});
