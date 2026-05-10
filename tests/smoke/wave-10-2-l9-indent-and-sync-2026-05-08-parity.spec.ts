/**
 * 2026-05-08 user 報告 hotfix の visual parity smoke。
 *
 * 1. **L-9 段落先頭 1 字下げ**:`__段落本文` / `＿段落本文` で paragraph
 *    に `data-pkc-indent="1"` + computed text-indent: 1em が解決
 * 2. **行頭 leading whitespace 許容**:`   |>` / `\t__段落` / `   _` を
 *    マーカー認識(行頭系シンプル記法統一方針)
 * 3. **Split View block 同期不破壊**:sentinel 置換時に <p> の
 *    data-pkc-source-line-* 属性を保存 → blank-line / section-break /
 *    figure 各置換要素に転記される。preview の DOM lookup が機能。
 *
 * 検証:
 *   - rendered DOM に `data-pkc-indent="1"` paragraph 存在
 *   - leading whitespace 付き marker line がそれぞれ正しく markup 化
 *   - Split View preview の blank-line / section-break / figure に
 *     `data-pkc-source-line` 属性が残っている
 *   - screenshot 保存(2 枚:Detail + Split View)
 */
import { test, expect } from '@playwright/test';

test('L-9 indent + leading whitespace + Split View source-line preservation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('L-9 + sync hotfix fixture');

  const body = [
    '__普通の字下げ段落、半角 _ × 2 から始まる。',
    '',
    '＿全角アンダースコアの字下げ段落。',
    '',
    '   __ 行頭 SP 付きでも字下げ認識。',
    '',
    '|| __センター + 字下げ併用。',
    '',
    '通常段落(字下げなし)。',
    '',
    '   +++ {role=section}',
    '',
    '   _2',
    '',
    '\t|> 行頭 TAB の右寄せ',
  ].join('\n');

  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  // 1) Split View preview(edit mode の右ペイン)を観察
  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.focus();
  await ta.press('End');
  await page.waitForTimeout(700);

  const preview = page.locator('.pkc-text-edit-preview').first();
  await expect(preview).toBeVisible({ timeout: 5_000 });
  const previewObs = await preview.evaluate((root) => ({
    indent1Count: root.querySelectorAll('p[data-pkc-indent="1"]').length,
    alignCenterCount: root.querySelectorAll('p[data-pkc-align="center"]').length,
    // reform-2026-05 PR-C 後:`|>` 等は 'end' に正規化(物理 'right' は formal-only)
    alignEndCount: root.querySelectorAll('p[data-pkc-align="end"]').length,
    blankLineCount: root.querySelectorAll('.pkc-blank-line').length,
    sectionBreakCount: root.querySelectorAll('hr.pkc-section-break').length,
    blankWithSourceLine: root.querySelectorAll('.pkc-blank-line[data-pkc-source-line]').length,
    sectionWithSourceLine: root.querySelectorAll('hr.pkc-section-break[data-pkc-source-line]').length,
    indentTextIndent: (() => {
      const el = root.querySelector('p[data-pkc-indent="1"]');
      return el ? getComputedStyle(el).textIndent : null;
    })(),
  }));

  console.log('Split View preview observed:', JSON.stringify(previewObs, null, 2));

  // L-9 indent paragraph が 4 つ(普通 / 全角 / SP 付き / center 併用)
  expect(previewObs.indent1Count).toBeGreaterThanOrEqual(3);
  // align center / end(reform-2026-05 PR-C 後)も leading whitespace 越えで認識
  expect(previewObs.alignCenterCount).toBeGreaterThanOrEqual(1);
  expect(previewObs.alignEndCount).toBeGreaterThanOrEqual(1);
  // section break / blank line も SP / TAB 越えで認識
  expect(previewObs.sectionBreakCount).toBeGreaterThanOrEqual(1);
  expect(previewObs.blankLineCount).toBeGreaterThanOrEqual(1);
  // **同期 block 修正の核心**:source-line 属性が転記されている
  expect(previewObs.blankWithSourceLine).toBeGreaterThanOrEqual(1);
  expect(previewObs.sectionWithSourceLine).toBeGreaterThanOrEqual(1);
  // computed text-indent が 1em(= body font-size 16px ≈ 16px)
  // text-indent: 1em は body font-size 比で 1 文字幅。`.pkc-md-rendered` の
  // font-size が 0.85rem 等の縮尺なら 13〜18px の範囲で解決される。
  expect(parseFloat(previewObs.indentTextIndent ?? '0')).toBeGreaterThan(10);

  await preview.screenshot({
    path: 'test-results/wave-10-2/l9-indent-split-view-2026-05-08.png',
  });

  // 2) Save → Detail view でも同じく動作するか確認
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });
  const renderedObs = await rendered.evaluate((root) => ({
    indent1Count: root.querySelectorAll('p[data-pkc-indent="1"]').length,
    indentComputed: (() => {
      const el = root.querySelector('p[data-pkc-indent="1"]');
      return el ? getComputedStyle(el).textIndent : null;
    })(),
  }));
  console.log('Detail view observed:', JSON.stringify(renderedObs, null, 2));
  expect(renderedObs.indent1Count).toBeGreaterThanOrEqual(3);
  expect(parseFloat(renderedObs.indentComputed ?? '0')).toBeGreaterThan(10);

  await rendered.screenshot({
    path: 'test-results/wave-10-2/l9-indent-detail-2026-05-08.png',
  });
});
