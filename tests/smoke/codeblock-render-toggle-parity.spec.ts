/**
 * コードブロック・レンダリング標準規約(codeblock-render-standard-2026-07)の
 * visual parity。
 *
 * 実ブラウザで証明すること:
 *   P1. 無印 \`\`\`html fence が center pane でレンダリング(iframe)+ CSS-only
 *       トグルの実クリックで ソース面 ⇄ レンダリング面 が切り替わる
 *   P2. mermaid fence がフラグなしで(既定で)SVG に hydrate される
 *   P3. Viewer popup(action-binder の無い独立 document)でもトグルが機能する
 *       ── CSS-only 方式の存在理由そのもの
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `# render standard demo

\`\`\`html
<div style="height:80px;background:#eef">html both probe</div>
\`\`\`

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
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

/** wrapper 内のトグル label を実マウスでクリック(hover で opacity reveal 後)。 */
async function clickToggle(page: Page, wrapper: ReturnType<Page['locator']>): Promise<void> {
  const box = await wrapper.boundingBox();
  if (!box) throw new Error('wrapper has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 40));
  const label = wrapper.locator('label.pkc-render-toggle');
  const lBox = await label.boundingBox();
  if (!lBox) throw new Error('toggle label has no bounding box');
  const cx = lBox.x + lBox.width / 2;
  const cy = lBox.y + lBox.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('label.pkc-render-toggle') !== null,
    { x: cx, y: cy },
  );
  expect(hit, 'toggle label reachable at its center point').toBe(true);
  await page.mouse.click(cx, cy);
}

test('parity: 無印 html = レンダリング + トグル実クリックで ソース ⇄ render(center pane)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await bootApp(page);
  await createTextEntry(page, 'render standard probe', FIXTURE);

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });

  const wrapper = rendered.locator('[data-pkc-render-lang="html"][data-pkc-render-mode="both"]').first();
  await expect(wrapper).toHaveCount(1);
  const iframe = wrapper.locator('iframe.pkc-html-render');
  await expect(iframe).toBeVisible();
  const source = wrapper.locator('pre.pkc-render-source');
  await expect(source).toBeHidden();

  // トグル(1 回目)→ ソース面
  await clickToggle(page, wrapper);
  await expect(source).toBeVisible();
  await expect(iframe).toBeHidden();
  // ソース面には language-html の highlight code が見えている
  await expect(source.locator('code.language-html')).toBeVisible();

  await page.screenshot({ path: 'test-results/codeblock-render-toggle-source.png' });

  // トグル(2 回目)→ レンダリング面へ戻る
  await clickToggle(page, wrapper);
  await expect(iframe).toBeVisible();
  await expect(source).toBeHidden();

  // P2: mermaid はフラグなしで既定 hydrate(実 mermaid.js render)
  const mermaidWrapper = rendered.locator('[data-pkc-render-lang="mermaid"]').first();
  await expect(mermaidWrapper.locator('.pkc-mermaid-rendered svg')).toBeVisible({ timeout: 15_000 });
  // hydrate 完了で ready attr → mermaid のトグルも出現(hover で可視化して確認)
  await expect(mermaidWrapper).toHaveAttribute('data-pkc-render-ready', '');

  await page.screenshot({ path: 'test-results/codeblock-render-toggle-rendered.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('parity: Viewer popup(独立 document)でもトグルが機能する(CSS-only 方式の証明)', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror(main): ${e.message}`));

  await bootApp(page);
  await createTextEntry(page, 'render standard popup probe', FIXTURE);

  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  popup.on('pageerror', (e) => errors.push(`pageerror(popup): ${e.message}`));
  await popup.waitForLoadState('load');

  const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(article).toBeVisible({ timeout: 10_000 });

  const wrapper = article.locator('[data-pkc-render-lang="html"][data-pkc-render-mode="both"]').first();
  const iframe = wrapper.locator('iframe.pkc-html-render');
  await expect(iframe).toBeVisible();
  const source = wrapper.locator('pre.pkc-render-source');
  await expect(source).toBeHidden();

  // popup には action-binder が無い ── それでも label 実クリックで切り替わる
  const label = wrapper.locator('label.pkc-render-toggle');
  const lBox = await label.boundingBox();
  if (!lBox) throw new Error('popup toggle label has no bounding box');
  await popup.mouse.click(lBox.x + lBox.width / 2, lBox.y + lBox.height / 2);
  await expect(source).toBeVisible();
  await expect(iframe).toBeHidden();

  await popup.screenshot({ path: 'test-results/codeblock-render-toggle-popup.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
