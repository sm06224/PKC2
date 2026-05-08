/**
 * TEXTLOG での M-7 Variables 動作確認(2026-05-08 hotfix-2)。
 *
 * user 報告:TEXTLOG の log 中で `{{vars.x}}` 展開されない。
 *
 * 原因:textlog-presenter / rendered-viewer の TEXTLOG path が
 *       `extractVars` / `parseFrontmatter` を呼んでいなかった。
 *
 * Fix:per-log で frontmatter parse + vars 抽出、TEXT entry と同 contract。
 *      log の bodySource 先頭に `---` fenced frontmatter を書けば、その
 *      vars を `{{vars.x}}` で展開可能。
 *
 * 検証:
 *   1. TEXTLOG entry を作成
 *   2. 1 つの log の text に `---\nvars:\n  ...\n---\n本文` を入れる
 *   3. center pane で展開済 + frontmatter strip
 *   4. screenshot
 */
import { test, expect } from '@playwright/test';

test('TEXTLOG vars:per-log frontmatter から `{{vars.x}}` 展開、frontmatter strip', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Create a TEXTLOG entry
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="textlog"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('TEXTLOG vars fixture');

  // Save & re-enter to use the textlog append textarea (Edit / commit-edit
  // flow doesn't support inserting log entries with raw frontmatter text directly).
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  const logText = [
    '---',
    'vars:',
    '  audience: 経営層',
    '  project: ALPHA-7',
    '  summary: 一部機能で遅延が発生',
    '---',
    '',
    '# {{vars.project}} 状況報告',
    '',
    '__{{vars.audience}} 向け報告です。',
    '',
    '==={{vars.summary}}===',  // 3 = は HR ではなく heading underline、注意
    '',
    '通常段落。',
  ].join('\n');

  // Use the textlog append area to add a new log
  const appendInput = page.locator('textarea[data-pkc-field="textlog-append-text"]').first();
  await expect(appendInput).toBeVisible({ timeout: 5_000 });
  await appendInput.fill(logText);
  // + Add button
  await page.locator('[data-pkc-action="append-log-entry"]').first().click();
  await page.waitForTimeout(500);

  // Render check: log article should have expanded vars + no frontmatter visible
  const logEl = page.locator('.pkc-textlog-log .pkc-textlog-text').first();
  await expect(logEl).toBeVisible({ timeout: 5_000 });
  const text = (await logEl.textContent()) ?? '';

  console.log('TEXTLOG log render observed:', text.slice(0, 300));

  // Vars 展開されている
  expect(text).toContain('ALPHA-7 状況報告');
  expect(text).toContain('経営層 向け報告');
  // frontmatter は preview に出ない(strip 済)
  expect(text).not.toContain('vars:');
  expect(text).not.toContain('audience: 経営層');
  // pkc-variable-undefined warning は出ない(全 key 定義済)
  await expect(logEl.locator('.pkc-variable-undefined')).toHaveCount(0);

  await logEl.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-variables-textlog.png',
  });
});
