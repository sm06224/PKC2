/**
 * M-7 follow-up(2026-05-08):embed した TEXTLOG / TEXT entry の log /
 * body 中で frontmatter が露出する bug の regression guard。
 *
 * user 報告:
 *   embed した TEXTLOG エントリで frontmatter が露出する(プレビュー表示も
 *   されていない)。
 *
 * 原因:
 *   `transclusion.ts` の `renderEmbeddedLog` / `renderEntryEmbed` が
 *   `parseFrontmatter` を呼ばず、log.bodySource / target.body の先頭に
 *   ある `---\n…\n---` 領域がそのまま markdown render されて
 *   `<hr>+text+<hr>` として可視化されていた。`extractVars` も呼ばれて
 *   いなかったため、`{{vars.x}}` が embed 内では literal で残っていた。
 *
 * Fix:
 *   transclusion 経路でも live presenter と同 contract:
 *     const rawSource = log.bodySource ?? '';
 *     const logVars = extractVars(rawSource);
 *     let source = parseFrontmatter(rawSource).body;
 *   3 surface(detail / textlog-presenter / transclusion / Viewer popup)
 *   全てで frontmatter 処理を一致させる(CLAUDE.md §9 dual-render path 規約)。
 *
 * 検証:
 *   1. TEXTLOG entry を作成、log に frontmatter + vars 入りの本文を追加
 *   2. ホスト TEXT entry を作成、本文に `![](entry:TEXTLOG_LID)` を含める
 *   3. ホスト entry の center pane embed で frontmatter が露出していない
 *   4. embed 中の `{{vars.x}}` が展開されている
 *   5. Viewer popup でも同じ結果(transclusion section が popup でも展開済)
 */
import { test, expect } from '@playwright/test';

test('Embed TEXTLOG with frontmatter:vars 展開 + frontmatter strip(center pane / Viewer popup 両方)', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // 1. Create a TEXTLOG entry that will be embedded.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="textlog"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Embed FM source log');
  const sourceSaveBtn = page.locator('[data-pkc-action="commit-edit"]').first();
  const sourceLid = await sourceSaveBtn.getAttribute('data-pkc-lid');
  expect(sourceLid, 'source TEXTLOG LID').toBeTruthy();
  await sourceSaveBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Append a log with frontmatter + vars.
  const logText = [
    '---',
    'vars:',
    '  project: BETA-9',
    '  audience: 開発チーム',
    '---',
    '',
    '# {{vars.project}} 進捗',
    '',
    '**{{vars.audience}}** 向けの本文です。',
  ].join('\n');
  const appendInput = page.locator('textarea[data-pkc-field="textlog-append-text"]').first();
  await expect(appendInput).toBeVisible({ timeout: 5_000 });
  await appendInput.fill(logText);
  await page.locator('[data-pkc-action="append-log-entry"]').first().click();
  await page.waitForTimeout(400);

  // 2. Create a host TEXT entry that embeds the TEXTLOG.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Embed FM host');
  const hostBody = ['# Host', '', `![ソース](entry:${sourceLid})`, '', '末尾。'].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(hostBody);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // 3. Verify center pane embed.
  const transclusion = page.locator('section.pkc-transclusion').first();
  await expect(transclusion).toBeVisible({ timeout: 10_000 });

  const observed = await transclusion.evaluate((sec) => {
    const log = sec.querySelector('article.pkc-textlog-log');
    const text = log?.querySelector('.pkc-textlog-text')?.textContent ?? '';
    return {
      hasLog: !!log,
      bodyText: text,
      hasUndefinedVar: !!log?.querySelector('.pkc-variable-undefined'),
    };
  });
  console.log('Center pane embed observed:', JSON.stringify(observed, null, 2));

  expect(observed.hasLog).toBe(true);
  // vars 展開されている
  expect(observed.bodyText).toContain('BETA-9 進捗');
  expect(observed.bodyText).toContain('開発チーム');
  // frontmatter 露出なし
  expect(observed.bodyText).not.toContain('vars:');
  expect(observed.bodyText).not.toContain('project: BETA-9');
  expect(observed.bodyText).not.toContain('audience: 開発チーム');
  expect(observed.bodyText).not.toContain('{{vars.project}}');
  expect(observed.bodyText).not.toContain('{{vars.audience}}');
  // 未定義 warning は出ない(全 key 定義済)
  expect(observed.hasUndefinedVar).toBe(false);

  // 4. Verify Viewer popup mirrors the center pane (3 surface parity).
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');
  const popupArticle = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(popupArticle).toBeVisible({ timeout: 10_000 });

  const popupObserved = await popupArticle.evaluate((root) => {
    const sec = root.querySelector('section.pkc-transclusion');
    const log = sec?.querySelector('article.pkc-textlog-log');
    return {
      hasTransclusion: !!sec,
      hasLog: !!log,
      bodyText: log?.querySelector('.pkc-textlog-text')?.textContent ?? '',
    };
  });
  console.log('Viewer popup embed observed:', JSON.stringify(popupObserved, null, 2));

  expect(popupObserved.hasTransclusion).toBe(true);
  expect(popupObserved.hasLog).toBe(true);
  expect(popupObserved.bodyText).toContain('BETA-9 進捗');
  expect(popupObserved.bodyText).toContain('開発チーム');
  expect(popupObserved.bodyText).not.toContain('vars:');
  expect(popupObserved.bodyText).not.toContain('{{vars.project}}');

  await page.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-embed-frontmatter-center.png',
    fullPage: true,
  });
  await popup.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-embed-frontmatter-viewer.png',
  });
});
