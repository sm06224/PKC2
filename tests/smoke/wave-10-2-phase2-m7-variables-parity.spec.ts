/**
 * M-7 Variables `{{vars.x}}` の visual parity smoke(2026-05-08、wave-10-2 Phase 2)。
 *
 * 検証 chain(reform-2026-05 §6 + §8):
 *   1. frontmatter で vars を定義した entry を作成
 *   2. 本文中 `{{vars.x}}` が render 時に値で置換されることを assert
 *   3. 未定義変数 `{{vars.unknown}}` は visible warning span として残る
 *   4. 3 surface(center pane / Split View preview / Viewer popup)全部で
 *      同じ展開結果を得られることを確認
 *   5. screenshot を保存(証憑)
 */
import { test, expect } from '@playwright/test';

test('M-7 variables:`{{vars.x}}` が 3 surface で frontmatter 値に展開される', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('M-7 variables fixture');

  const body = [
    '---',
    'vars:',
    '  project: ALPHA-7',
    '  client: Acme Corp',
    '  date: 2026-05-08',
    '  env: 本番環境',
    '  impact: 一部監視画面の更新遅延',
    '---',
    '',
    '# 案件 {{vars.project}} 進捗',
    '',
    '__本通知は {{vars.client}} 様向け、提出予定 {{vars.date}}。',
    '',
    '|> 担当: {{vars.signature}}(未定義 → 警告)',
    '',
    '通常段落の中の `{{vars.project}}`(code span でも展開、trade-off)。',
    '',
    '- 対象環境: =={{vars.env}}==(highlight 内で展開、user 報告 hotfix)',
    '- 影響範囲: [[em:{{vars.impact}}]](em-dot 内で展開)',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  // 1) Split View preview(edit mode の右ペイン)で展開確認
  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.focus();
  await ta.press('End');
  await page.waitForTimeout(700);
  const preview = page.locator('.pkc-text-edit-preview').first();
  await expect(preview).toBeVisible();

  const previewText = (await preview.textContent()) ?? '';
  expect(previewText).toContain('案件 ALPHA-7 進捗');
  expect(previewText).toContain('Acme Corp');
  expect(previewText).toContain('2026-05-08');
  expect(previewText).toContain('{{vars.signature}}'); // 未定義 literal 残置
  // hotfix 2026-05-08:highlight / em-dot 内でも展開される
  expect(previewText).toContain('本番環境');
  expect(previewText).toContain('一部監視画面の更新遅延');
  await expect(preview.locator('.pkc-variable-undefined')).toHaveCount(1);
  // hotfix:Split View でも frontmatter は preview から strip
  expect(previewText).not.toContain('vars:');
  expect(previewText).not.toContain('project: ALPHA-7');
  await preview.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-variables-split-view.png',
  });

  // 2) Save → Detail view(center pane)で同じ結果か確認
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });
  const renderedText = (await rendered.textContent()) ?? '';
  expect(renderedText).toContain('ALPHA-7');
  expect(renderedText).toContain('Acme Corp');
  await expect(rendered.locator('.pkc-variable-undefined')).toHaveCount(1);
  await rendered.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-variables-detail.png',
  });

  // 3) Viewer popup
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');
  const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(article).toBeVisible({ timeout: 10_000 });
  const popupText = (await article.textContent()) ?? '';
  expect(popupText).toContain('ALPHA-7');
  expect(popupText).toContain('Acme Corp');
  await expect(article.locator('.pkc-variable-undefined')).toHaveCount(1);
  await popup.screenshot({
    path: 'test-results/wave-10-2-phase2/m7-variables-viewer.png',
  });
});
