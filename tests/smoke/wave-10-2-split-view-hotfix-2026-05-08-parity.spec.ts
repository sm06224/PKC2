/**
 * 2026-05-08 Split View(text-edit-preview)で `_` 空行マーカーが PUA glyph
 * 漏れする bug の regression guard。
 *
 * 経路:
 *   detail-presenter.ts は text-edit-preview を `renderMarkdown(source,
 *   { sourceLineAnchors: true })` で render する(Split View 同期スクロール
 *   用)。`tagSourceLines` が各 block <p> に `data-pkc-source-line-*` 属性
 *   を付けるため、post-process regex が `<p>SENT</p>` の bare `<p>` 期待だと
 *   match せず PUA char(U+E130 / U+E131)が HTML に残留 → ブラウザの
 *   fallback glyph(数字 box)が見える。
 *
 * Fix(同 PR で実装):
 *   `<p[^>]*>SENT</p>` で widen して attrs ありにも match させる。
 *   Section break(L-1)/ figure sentinel(L-7)/ blank-line(L-8)の 3 種
 *   全て同じ修正。
 *
 * 検証:
 *   1. text entry 新規作成 → user 入力に近い `_` + prefix 混在 fixture を fill
 *   2. preview pane(edit mode、`.pkc-text-edit-preview`)の DOM を取得
 *   3. PUA char 0、blank-line div 存在を assert
 *   4. screenshot を保存(証憑)
 */
import { test, expect } from '@playwright/test';

test('Split View preview に sentinel glyph が漏れない(2026-05-08 hotfix)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });

  await page.locator('[data-pkc-field="title"]').first().fill('Split View hotfix fixture');
  // user 報告と同様、prefix line に挟まれた `_` を含む(L-8 + L-5 + L-1 + L-7 全部
  // sourceLineAnchors path に流す)
  const body = [
    '|> 2026年5月8日 発信',
    '<| To: dest',
    '|> From: src',
    '_',
    '|| 件名',
    '_2',
    '|| 記',
    '',
    '+++ {role=section}',
    '',
    '### 経緯',
    '',
    ':::figure{#fig-1}',
    'image',
    '^^^ キャプション',
    ':::',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  // Edit mode の preview pane(`.pkc-text-edit-preview`)が見えているはず
  const preview = page.locator('.pkc-text-edit-preview').first();
  await expect(preview).toBeVisible({ timeout: 5_000 });

  // textarea fill は input event を発火しているが、preview update は 500ms
  // debounced input にも乗っているので少し待つ。先に Enter keyup で確実に
  // 強制 update を入れる(末尾改行の副作用は body 取得しないので無害)。
  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.focus();
  await ta.press('End');
  await page.waitForTimeout(700);

  const observed = await preview.evaluate((root) => {
    const innerHtml = root.innerHTML;
    return {
      hasBlankPuaOpen: innerHtml.includes('\u{E130}'),
      hasBlankPuaSep: innerHtml.includes('\u{E131}'),
      hasSectionPuaOpen: innerHtml.includes('\u{E120}'),
      hasSectionPuaSep: innerHtml.includes('\u{E121}'),
      hasFigPuaOpen: innerHtml.includes('\u{E110}'),
      blankCount: root.querySelectorAll('.pkc-blank-line').length,
      sectionBreakCount: root.querySelectorAll('hr.pkc-section-break').length,
      figureCount: root.querySelectorAll('figure.pkc-fig').length,
    };
  });

  console.log('Split View preview observed:', JSON.stringify(observed, null, 2));

  expect(observed.hasBlankPuaOpen).toBe(false);
  expect(observed.hasBlankPuaSep).toBe(false);
  expect(observed.hasSectionPuaOpen).toBe(false);
  expect(observed.hasSectionPuaSep).toBe(false);
  expect(observed.hasFigPuaOpen).toBe(false);
  expect(observed.blankCount).toBeGreaterThanOrEqual(2);
  expect(observed.sectionBreakCount).toBeGreaterThanOrEqual(1);
  expect(observed.figureCount).toBeGreaterThanOrEqual(1);

  await preview.screenshot({
    path: 'test-results/wave-10-2/split-view-hotfix-2026-05-08.png',
  });
});
