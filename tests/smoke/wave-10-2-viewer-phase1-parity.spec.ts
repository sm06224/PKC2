/**
 * Wave-10-2 Phase 1 拡張が **Rendered Viewer popup** にも反映されることを
 * 確認する visual parity smoke(2026-05-07 hotfix)。
 *
 * Bug 由来:
 *   Phase 1 で追加した CSS rules(L-1 section break / L-2 highlight・em-dot /
 *   L-5 align prefix / L-7 figure caption / etc.)を `src/styles/base.css` だけ
 *   に入れていた。Viewer popup は専用の inline `<style>` block を使う独立
 *   document で base.css を取り込まない設計のため、HTML は正しく描画される
 *   が visual style が一切効かず user 側で「反映されない」と見えていた
 *   (user 報告 2026-05-07)。
 *
 *   `rendered-viewer.ts` の inline style に同等の CSS を追加して mirror。
 *
 * 検証 chain:
 *   1. main app で entry を新規 + align prefix + highlight + em-dot を含む body
 *   2. open-rendered-viewer button click → popup window 起動
 *   3. popup の DOM を Playwright page handle で取得
 *   4. <p data-pkc-align="center"> の computedAlign が "center"
 *      <mark> の background が default(透明 / 黄色)以外に解決
 *      <em.pkc-em-dot> の text-emphasis-style が "dot"(または "filled dot")
 *   5. screenshot を取って証憑として保存
 */
import { test, expect } from '@playwright/test';

test('Viewer popup: Phase 1 拡張(align / mark / em-dot)が visual に反映される', async ({ page, context }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  await page.locator('[data-pkc-field="title"]').first().fill('Viewer Phase 1 fixture');
  // reform-2026-05 PR-C 後:`<|` / `|>` 等は全部 'end' に正規化。viewer での
  // align / mark / em-dot の visual 反映を確認するため center + end の 2 段階で。
  const body = [
    '|| 中央寄せ段落',
    '|> 右寄せ(end)段落',
    '',
    'これは ==重要== な文。',
    '',
    'これは [[em:傍点]] 入り。',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // open-rendered-viewer button は <details data-pkc-region="action-bar-more">
  // 内に格納されているので、まず More 展開、その後 button click。
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');

  const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(article).toBeVisible({ timeout: 10_000 });

  const observed = await article.evaluate((root) => {
    const ps = Array.from(root.querySelectorAll('p[data-pkc-align]')) as HTMLElement[];
    const aligns = ps.map((p) => ({
      align: p.getAttribute('data-pkc-align'),
      computedAlign: getComputedStyle(p).textAlign,
    }));
    const mark = root.querySelector('mark') as HTMLElement | null;
    const markBg = mark ? getComputedStyle(mark).backgroundColor : '';
    const emDot = root.querySelector('em.pkc-em-dot') as HTMLElement | null;
    const emDotStyle = emDot
      ? (getComputedStyle(emDot).textEmphasisStyle ?? (getComputedStyle(emDot) as unknown as Record<string, string>).webkitTextEmphasisStyle ?? '')
      : '';
    return { aligns, markBg, emDotStyle };
  });

  console.log('Viewer Phase 1 observed:', JSON.stringify(observed, null, 2));

  expect(observed.aligns[0]).toEqual({ align: 'center', computedAlign: 'center' });
  // reform-2026-05 PR-C:`|>` は 'end'、Chromium は logical value 'end' のまま
  // 返す(ブラウザによっては 'right' に解決される)。
  expect(observed.aligns[1]?.align).toBe('end');
  expect(['end', 'right']).toContain(observed.aligns[1]?.computedAlign);
  // mark は #fff59d(rgb(255, 245, 157))に解決されるはず
  expect(observed.markBg).toMatch(/rgb\(255,\s*245,\s*157\)/);
  // em-dot は dot 系の text-emphasis-style
  expect(observed.emDotStyle.toLowerCase()).toContain('dot');

  await popup.screenshot({
    path: 'test-results/wave-10-2/viewer-phase1.png',
    fullPage: false,
  });
});
