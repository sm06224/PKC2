/**
 * reform-2026-05 Phase 2 PR-2M(2026-05-10):HTML sandbox iframe render。
 *
 * AI(ChatGPT 等)が「複雑 layout / SVG / interactive widget は HTML 生成の方が
 * 優れた renderning を持つ」と主張するケース(2026-05-10 user 報告:A4 2 段組
 * レポート style 含む)に対し、` ```html-render` fence で iframe sandbox 経由
 * の seamless 描画を提供する。
 *
 * セキュリティ規約:
 *   - sandbox="allow-scripts" のみ(allow-same-origin なし)
 *   - CSP meta inject、connect-src 'none'、frame-src 'none'
 *   - postMessage で auto-resize、cap 5000px
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `# HTML sandbox demo

普通の段落(markdown render)。

\`\`\`html-render
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding: 1rem; background: #f0f9ff; border: 1px solid #93c5fd; border-radius: 4px;">
  <article>
    <h2 style="margin-top: 0;">左カラム</h2>
    <p>HTML 生成によるレイアウトテスト。</p>
  </article>
  <article>
    <h2 style="margin-top: 0;">右カラム</h2>
    <p>2 column grid が iframe で render される。</p>
  </article>
</div>
\`\`\`

下の段落。

\`\`\`html-render
<svg viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="40" fill="#3b82f6" />
  <text x="50" y="55" text-anchor="middle" fill="white" font-size="14">SVG</text>
</svg>
\`\`\`

suffix \`-norender\` は code として render される(標準規約
codeblock-render-standard-2026-07:無印 html は -both = レンダリングになった):

\`\`\`html-norender
<h1>これは code block</h1>
\`\`\`
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
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

test.describe('reform Phase 2 PR-2M:html-render fence iframe sandbox', () => {
  test('center pane:html-render fence が iframe sandbox + auto-resize', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'html sandbox demo', FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    // iframe が 2 件 render される(grid + svg)
    const iframes = rendered.locator('iframe.pkc-html-render');
    await expect(iframes).toHaveCount(2, { timeout: 10_000 });

    // sandbox="allow-scripts" のみ(allow-same-origin なし)
    for (let i = 0; i < 2; i++) {
      const iframe = iframes.nth(i);
      const sandbox = await iframe.getAttribute('sandbox');
      expect(sandbox).toBe('allow-scripts');
      const referrerpolicy = await iframe.getAttribute('referrerpolicy');
      expect(referrerpolicy).toBe('no-referrer');
    }

    // ```html-norender は iframe にならず code のまま(標準規約)
    const codeBlocks = rendered.locator('pre code, code.language-html');
    expect(await codeBlocks.count()).toBeGreaterThanOrEqual(1);

    // auto-resize:iframe の height が 0 でなく postMessage で値設定される
    // 500ms 待って iframe 内 ResizeObserver + setTimeout post の time を確保
    await page.waitForTimeout(800);

    const heights = await iframes.evaluateAll((els) =>
      els.map((el) => (el as HTMLIFrameElement).style.height),
    );
    // 両 iframe ともに height が auto-resize されている(0px 以外)
    for (const h of heights) {
      const px = parseInt(h.replace('px', ''), 10);
      expect(px, `iframe height: ${h}`).toBeGreaterThan(20);
      expect(px, `iframe height cap 5000`).toBeLessThanOrEqual(5000);
    }

    await rendered.screenshot({
      path: 'test-results/phase2-html-sandbox/html-render-center.png',
    });
  });

  test('Viewer popup:html-render fence が popup でも iframe + auto-resize', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'html sandbox viewer', FIXTURE);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    const iframes = article.locator('iframe.pkc-html-render');
    await expect(iframes).toHaveCount(2, { timeout: 10_000 });

    // Viewer popup でも auto-resize 動作
    await popup.waitForTimeout(800);
    const heights = await iframes.evaluateAll((els) =>
      els.map((el) => (el as HTMLIFrameElement).style.height),
    );
    for (const h of heights) {
      const px = parseInt(h.replace('px', ''), 10);
      expect(px, `viewer iframe height: ${h}`).toBeGreaterThan(20);
    }

    await popup.screenshot({
      path: 'test-results/phase2-html-sandbox/html-render-viewer.png',
      fullPage: true,
    });
  });
});
