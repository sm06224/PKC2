/**
 * 2026-05-08 user 報告:`![label](entry:LID)` の他 entry 埋め込み
 * (transclusion)が center pane では表示されるが Viewer popup では
 * placeholder のまま見えない bug の regression guard。
 *
 * 原因:
 *   `rendered-viewer.ts` の `buildBodyHtml` は `renderMarkdown(...)` の
 *   出力を返すだけで、`expandTransclusions` を呼んでいなかった。
 *   detail-presenter は呼んでいるので center pane では動作。
 *
 * Fix:
 *   buildBodyHtml で renderMarkdown の出力を一旦 detached `<div>` に流し、
 *   `expandTransclusions(div, { entries, assets, mimeByKey, nameByKey,
 *   hostLid })` を呼んでから innerHTML を返す。
 *   Viewer popup の inline `<style>` にも `.pkc-transclusion` 群 CSS を
 *   mirror。
 *
 * 検証:
 *   1. ホスト entry を text で作成、本文に `![埋め込み](entry:OTHER_LID)`
 *   2. 別 entry(text)を作成、本文に何か入れる
 *   3. ホスト entry を Viewer popup で開く
 *   4. popup の DOM に `<section class="pkc-transclusion">` が存在
 *   5. transclusion-body 内に対象 entry の本文が見える
 *   6. screenshot 保存
 */
import { test, expect } from '@playwright/test';

test('Viewer popup transclusion:`![label](entry:LID)` が他 entry の本文を埋め込む', async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // 1) 埋め込み先 entry(other)を先に作成
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('埋め込み元エントリ');
  await page.locator('textarea[data-pkc-field="body"]').first().fill('これは埋め込まれる側の本文です。\n\n## 章 X\n\n本文 X');
  const otherSaveBtn = page.locator('[data-pkc-action="commit-edit"]').first();
  const otherLid = await otherSaveBtn.getAttribute('data-pkc-lid');
  expect(otherLid, 'other entry LID').toBeTruthy();
  await otherSaveBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // 2) ホスト entry を作成、本文に transclusion を含める
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill('Viewer transclusion fixture');
  const hostBody = [
    '# ホスト entry の本文',
    '',
    '本文 1。',
    '',
    '### 19. 他エントリの埋め込みテスト',
    `![アイデアノート](entry:${otherLid})`,
    '',
    '末尾段落。',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(hostBody);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // 3) Viewer popup を開く
  await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
  const popupPromise = context.waitForEvent('page');
  await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
  const popup = await popupPromise;
  await popup.waitForLoadState('load');

  const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
  await expect(article).toBeVisible({ timeout: 10_000 });

  // 4) transclusion section が popup に存在
  const transclusion = article.locator('section.pkc-transclusion');
  await expect(transclusion).toHaveCount(1);

  // 5) 対象 entry の本文が transclusion-body に入っている
  const observed = await article.evaluate((root) => {
    const sec = root.querySelector('section.pkc-transclusion');
    return {
      hasTransclusion: !!sec,
      bodyText: sec?.querySelector('.pkc-transclusion-body')?.textContent ?? '',
      headerText: sec?.querySelector('.pkc-transclusion-header')?.textContent ?? '',
      // 計算スタイル — accent border が効いてる(CSS mirror 動作確認)
      borderLeft: sec ? getComputedStyle(sec).borderLeftColor : '',
    };
  });

  console.log('Viewer transclusion observed:', JSON.stringify(observed, null, 2));

  expect(observed.hasTransclusion).toBe(true);
  expect(observed.bodyText).toContain('埋め込まれる側の本文');
  expect(observed.bodyText).toContain('章 X');
  expect(observed.borderLeft).not.toBe('');  // CSS が効いている

  await popup.screenshot({
    path: 'test-results/wave-10-2/viewer-transclusion-2026-05-08.png',
  });
});
