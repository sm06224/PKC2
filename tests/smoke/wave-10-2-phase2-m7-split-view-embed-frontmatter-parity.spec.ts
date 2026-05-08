/**
 * M-7 follow-up Split View hotfix(2026-05-08):edit mode preview で
 * (a) embed `![](entry:LID)` が placeholder のまま展開されない / (b)
 * frontmatter strip 後の line index が編集側 textarea と乖離して、source-
 * preview-sync が誤った block を highlight する 2 件の bug の regression
 * guard。
 *
 * 原因:
 *   (a) `detail-presenter.ts:renderEditorBody` で初回 preview を
 *        `renderMarkdown(stripped, { sourceLineAnchors: true, vars })`
 *        まで作るが `expandTransclusions` を呼んでいなかった。
 *   (b) `parseFrontmatter(initialSource).body` で frontmatter 行を削った
 *        ぶん `data-pkc-source-line` が source(textarea)とずれていた。
 *
 * Fix:
 *   (a) renderer.ts post-creation block で `expandTransclusions(preview)`
 *        を unconditional 呼出。asset 経路 / asset 無し経路の両方で必要。
 *   (b) `renderMarkdown` に `sourceLineOffset` option を追加、frontmatter
 *        strip 行数だけ底上げした line index を stamp する。
 *
 * 検証(本 spec):
 *   1. source TEXTLOG entry を作って 1 行 log を append(`埋め込まれる側`)
 *   2. host TEXT entry を作って frontmatter + embed を含む body にする
 *   3. Split View edit mode でその host entry に入る
 *   4. preview に `section.pkc-transclusion` が 1 つ存在する(embed 展開)
 *   5. preview の `<h1>` が `data-pkc-source-line="N"`(原文 line index、
 *      frontmatter strip 分が補正されている)を持つ
 */
import { test, expect } from '@playwright/test';

test('Split View edit preview:frontmatter + embed で expandTransclusions + sourceLineOffset が効く', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // 1. source TEXTLOG entry を作る
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="textlog"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Split source log');
  const sourceSaveBtn = page.locator('[data-pkc-action="commit-edit"]').first();
  const sourceLid = await sourceSaveBtn.getAttribute('data-pkc-lid');
  expect(sourceLid, 'source LID').toBeTruthy();
  await sourceSaveBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // 1b. log を 1 行 append
  const appendInput = page.locator('textarea[data-pkc-field="textlog-append-text"]').first();
  await expect(appendInput).toBeVisible({ timeout: 5_000 });
  await appendInput.fill('埋め込まれる側の log 本文。');
  await page.locator('[data-pkc-action="append-log-entry"]').first().click();
  await page.waitForTimeout(400);

  // 2. host TEXT entry を作る、本文に frontmatter + embed
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Split host');

  // 原文(textarea)の line index 構成:
  //   line 0: ---
  //   line 1: vars:
  //   line 2:   title: 親
  //   line 3: ---
  //   line 4: (空)
  //   line 5: # {{vars.title}}
  //   line 6: (空)
  //   line 7: ![子](entry:<sourceLid>)
  //   line 8: (空)
  //   line 9: # 末尾
  // strip 後 body は line 5 から始まる → preview の `# 親` には
  // `data-pkc-source-line="5"` が stamp されているのが正しい。
  // 旧 buggy 実装ではこれが 1 になっていた(strip 分の offset が無いため)。
  const hostBody = [
    '---',
    'vars:',
    '  title: 親',
    '---',
    '',
    '# {{vars.title}}',
    '',
    `![子](entry:${sourceLid})`,
    '',
    '# 末尾',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(hostBody);
  // updateTextEditPreview は debounce 500ms。preview に embed が現れるまで待つ。
  await page.waitForFunction(
    () => {
      const preview = document.querySelector('[data-pkc-region="text-edit-preview"]');
      return preview?.querySelector('section.pkc-transclusion') !== null;
    },
    { timeout: 5_000 },
  );

  // 4. embed 展開確認 — preview に section.pkc-transclusion が 1 件
  const previewHandle = page.locator('[data-pkc-region="text-edit-preview"]').first();
  const transclusionCount = await previewHandle.locator('section.pkc-transclusion').count();
  expect(transclusionCount).toBe(1);

  // 5. line offset 確認 — `# 親` heading は textarea line 5 にあるので
  // `data-pkc-source-line="5"` が stamp される。
  const observed = await previewHandle.evaluate((preview) => {
    const headings = Array.from(preview.querySelectorAll('h1[data-pkc-source-line]')).map(
      (h) => ({
        text: h.textContent ?? '',
        line: h.getAttribute('data-pkc-source-line'),
      }),
    );
    const transclusion = preview.querySelector('section.pkc-transclusion');
    return {
      headings,
      transclusionLine: transclusion?.getAttribute('data-pkc-source-line') ?? null,
      transclusionBodyText:
        transclusion?.querySelector('.pkc-transclusion-body')?.textContent ?? '',
      // frontmatter content が preview に出ていないこと
      previewText: (preview.textContent ?? '').slice(0, 200),
    };
  });
  console.log('Split preview observed:', JSON.stringify(observed, null, 2));

  // h1 「親」(line 5)と「末尾」(line 9)の 2 個
  expect(observed.headings.length).toBeGreaterThanOrEqual(2);
  const oyaHeading = observed.headings.find((h) => h.text === '親');
  const matsuHeading = observed.headings.find((h) => h.text === '末尾');
  expect(oyaHeading, '`# 親` heading が preview に存在').toBeTruthy();
  expect(matsuHeading, '`# 末尾` heading が preview に存在').toBeTruthy();
  // line offset 適用後:`# 親` は textarea line 5、`# 末尾` は line 9
  expect(oyaHeading!.line).toBe('5');
  expect(matsuHeading!.line).toBe('9');

  // embed 内に source log の本文が見える
  expect(observed.transclusionBodyText).toContain('埋め込まれる側の log 本文');

  // frontmatter content は preview に露出していない
  expect(observed.previewText).not.toContain('vars:');
  expect(observed.previewText).not.toContain('title: 親');

  await previewHandle.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-split-view-embed-frontmatter.png',
  });
});
