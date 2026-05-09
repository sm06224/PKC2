/**
 * 2026-05-09 user 報告:
 *
 *   「右ペインと Viewer 表示の際の TOC がアンカー文字列のままです」
 *
 *   screenshot:
 *     - 右ペイン Contents:`{{vars.title}}` が 3 行 literal で表示
 *       (rendered 値 `親` に展開されていない)
 *     - 右ペイン Properties:`vars [object Object]`
 *       (nested mapping が `[object Object]` として表示)
 *
 * 原因:
 *   1. `extractTocFromEntry`(text 経路)が `entry.body` を直接 walk して
 *      heading 行から `{{vars.title}}` を literal で抽出していた。strip
 *      + vars 展開を経由していなかった。
 *   2. `formatFrontmatterValue`(renderer.ts)が nested object に到達した
 *      ら fallthrough で `String(v)` → `[object Object]` を返していた。
 *
 * Fix:
 *   1. `extractTocFromEntry` の text / textlog 経路で `parseFrontmatter`
 *      → strip した body を `extractHeadingsFromMarkdown` に渡す + 抽出
 *      後の text を `expandVarsInTocText(text, vars)` で展開。
 *   2. `formatFrontmatterValue` で nested object を `{ k: v, … }` の
 *      compact 表現に。深さは parser の `maxDepth=4` で抑えられている。
 *
 * 検証:
 *   1. TEXT entry に `vars: { title: 親 }` + 3 個の `# {{vars.title}}`
 *      heading を持つ body を作成
 *   2. center pane に切替 → 右ペインの Contents (TOC) で 3 行とも `親` が
 *      表示されている(`{{vars.title}}` は無い)
 *   3. 右ペインの Properties で `vars` 行が `{ title: 親 }` 形式で表示
 *      されている(`[object Object]` は無い)
 *   4. Viewer popup を開く → popup 内 TOC でも 3 行とも `親` 表示
 */
import { test, expect } from '@playwright/test';

test('TOC vars expansion + Properties nested object:右ペイン / Viewer popup 両方で正しく表示', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Create TEXT entry with vars + 3 same-named headings (user's exact scenario)
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('親');

  const body = [
    '---',
    'vars:',
    '  title: 親',
    '---',
    '',
    '# {{vars.title}}',
    '',
    '# {{vars.title}}',
    '',
    '# {{vars.title}}',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // === 1) center pane の右ペイン:TOC vars 展開 ===
  // TOC in right pane should show "親" 3 times, not `{{vars.title}}`.
  const tocItems = page.locator('[data-pkc-region="toc"] .pkc-toc-link');
  await expect(tocItems).toHaveCount(3, { timeout: 10_000 });
  const tocTexts = await tocItems.evaluateAll((els) =>
    els.map((e) => e.textContent ?? ''),
  );
  console.log('TOC texts in right pane:', tocTexts);
  expect(tocTexts).toEqual(['親', '親', '親']);
  for (const text of tocTexts) {
    expect(text).not.toContain('{{vars.title}}');
  }

  // === 2) Properties section:nested object が `{ title: 親 }` 表示 ===
  const propsRegion = page.locator('[data-pkc-region="frontmatter"]');
  await expect(propsRegion).toBeVisible({ timeout: 5_000 });
  const varsValue = await propsRegion
    .locator('dd[data-pkc-frontmatter-key="vars"]')
    .textContent();
  console.log('Properties vars value:', varsValue);
  expect(varsValue, 'nested object は compact JSON-like 表記').toContain('title: 親');
  expect(varsValue, '`[object Object]` 表示は禁止').not.toContain('[object Object]');

  await page.screenshot({
    path: 'test-results/wave-10-2-phase2/yaml-toc-properties-fix-detail.png',
  });

  // === 3) Viewer popup の TOC でも同じ ===
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');

  const popupTocItems = popup.locator('.pkc-toc-list a');
  await expect(popupTocItems).toHaveCount(3, { timeout: 10_000 });
  const popupTocTexts = await popupTocItems.evaluateAll((els) =>
    els.map((e) => e.textContent ?? ''),
  );
  console.log('TOC texts in Viewer popup:', popupTocTexts);
  expect(popupTocTexts).toEqual(['親', '親', '親']);
  for (const text of popupTocTexts) {
    expect(text).not.toContain('{{vars.title}}');
  }

  await popup.screenshot({
    path: 'test-results/wave-10-2-phase2/yaml-toc-properties-fix-viewer.png',
  });
});
