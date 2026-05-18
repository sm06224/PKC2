/**
 * reform-2026-05 Phase 2 PR-2J:user バグレポ fixture(石狩変電所)実機 visual parity。
 *
 * user 報告(2026-05-10):ChatGPT 生成 fixture で `:emphasis:[\n本文\n]`
 * `:strong:[\n本文\n]` `:caption:[\n本文\n]` 等の multi-line content が
 * render されない。PR-2J の修正で受理される。
 *
 * 確認 surface:center pane / Viewer popup
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `---
title: 石狩変電所 ネットワーク更改計画
vars:
  site: 石狩変電所
  manager: 佐藤
---

# {{vars.site}} ネットワーク更改計画

:::section{role=summary}

## 作業概要

:emphasis:[
本作業中、一時的に監視系通信が停止する可能性があります
]

:strong:[
運転監視側への事前周知をお願いします
]

:::

:::section{role=warning}

## 注意事項

:emphasis:[
切替中に瞬断が発生する可能性あり
]

:::

:::figure{id="topology-overview"}

\`\`\`mermaid
graph TD
  CTRL --> GW
\`\`\`

:caption:[
更新対象ネットワーク構成
]

:::

本文中では図 [@topology-overview] を参照。
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
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

test.describe('reform Phase 2 PR-2J:user バグレポ(石狩変電所 fixture)visual parity', () => {
  test('center pane:multi-line :emphasis: / :strong: / :caption: 全 render', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'ishikari fixture', FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      const text = root.textContent ?? '';
      return {
        // vars 展開
        siteExpanded: text.includes('石狩変電所'),
        // section callout 2 つ(summary / warning)
        sectionCount: root.querySelectorAll('section.pkc-section-callout').length,
        sectionWarning: !!root.querySelector('section.pkc-section-warning'),
        sectionSummary: !!root.querySelector('section.pkc-section-summary'),
        // multi-line :emphasis: が <em> として render
        emphasisCount: root.querySelectorAll('em').length,
        emphasisInWarning: !!Array.from(root.querySelectorAll('section.pkc-section-warning em'))
          .find((el) => el.textContent?.includes('切替中に瞬断')),
        // multi-line :strong: が <strong> として render
        strongInSummary: !!Array.from(root.querySelectorAll('section.pkc-section-summary strong'))
          .find((el) => el.textContent?.includes('運転監視側への事前周知')),
        // figure block
        figureCount: root.querySelectorAll('figure.pkc-fig').length,
        figureRef: !!root.querySelector('a.pkc-fig-ref'),
        // multi-line :caption: が figcaption に
        figCaptionText: root.querySelector('figcaption.pkc-fig-caption')?.textContent ?? '',
        // mermaid code
        mermaidVisible: text.includes('graph TD'),
      };
    });

    console.log('ishikari fixture observed:', JSON.stringify(observed, null, 2));

    expect(observed.siteExpanded).toBe(true);
    expect(observed.sectionCount).toBeGreaterThanOrEqual(2);
    expect(observed.sectionWarning).toBe(true);
    expect(observed.sectionSummary).toBe(true);
    expect(observed.emphasisCount).toBeGreaterThanOrEqual(2);  // :emphasis: in summary + warning
    expect(observed.emphasisInWarning).toBe(true);
    expect(observed.strongInSummary).toBe(true);
    expect(observed.figureCount).toBeGreaterThanOrEqual(1);
    expect(observed.figureRef).toBe(true);
    expect(observed.figCaptionText).toContain('更新対象ネットワーク構成');
    expect(observed.mermaidVisible).toBe(true);

    await rendered.screenshot({
      path: 'test-results/phase2-userfixture/ishikari-center.png',
    });
  });

  test('Viewer popup:同 fixture が popup でも render', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'ishikari Viewer', FIXTURE);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const observed = await article.evaluate((root) => ({
      sectionCount: root.querySelectorAll('section.pkc-section-callout').length,
      emphasisCount: root.querySelectorAll('em').length,
      strongCount: root.querySelectorAll('strong').length,
      figCount: root.querySelectorAll('figure.pkc-fig').length,
      captionText: root.querySelector('figcaption.pkc-fig-caption')?.textContent ?? '',
    }));

    expect(observed.sectionCount).toBeGreaterThanOrEqual(2);
    expect(observed.emphasisCount).toBeGreaterThanOrEqual(2);
    expect(observed.strongCount).toBeGreaterThanOrEqual(1);
    expect(observed.figCount).toBeGreaterThanOrEqual(1);
    expect(observed.captionText).toContain('更新対象ネットワーク構成');

    await popup.screenshot({
      path: 'test-results/phase2-userfixture/ishikari-viewer.png',
      fullPage: true,
    });
  });
});
