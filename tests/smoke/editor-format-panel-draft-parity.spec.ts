/**
 * Smoke — 編集中に書式パネルを開いても入力テキストが消えないこと
 * (user 報告 2026-06-15「編集時の書式パネルを開くと入力していたテキストが
 * 消える」)。
 *
 * 原因(調査): 「🎨 Format」 toggle は `SYS_SYNC_CHILD_WINDOWS` を dispatch
 * し、reducer が `childWindowLids` を新配列で置くため render-scope が `'full'`
 * を返す → editor が **committed** な `entry.body` から作り直され、未コミットの
 * textarea ドラフトが消える。render-continuity が値を保存していなかったのが穴。
 *
 * 修正: `captureRenderContinuity`/`restoreRenderContinuity` が編集エディタ
 * (`[data-pkc-mode="edit"]`)内の text 欄の値 + caret を再描画跨ぎで保存する。
 *
 * happy-dom の unit(render-continuity.test.ts)は capture/restore 単体を
 * 証明するが、実際の「Format ボタン click → main の render ループ →
 * continuity 経由でテキスト保持」までは実機でしか担保できない。修正前 bundle
 * では click 後に textarea が空に戻って fail = 再現する。
 */
import { test, expect, type Page } from '@playwright/test';

async function bootAndCreateText(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  const createText = page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first();
  await expect(createText).toBeVisible();
  await createText.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
}

test('parity: 編集中に書式パネルを開いても入力テキストが残る', async ({ page }) => {
  await bootAndCreateText(page);

  const body = page.locator('textarea[data-pkc-field="body"]').first();
  await expect(body).toBeVisible();
  await body.click();
  // 未コミットの本文を実 OS キーストロークで入力(state には未同期 = DOM のみ)。
  const draft = 'draft typing that must survive';
  await page.keyboard.type(draft);
  await expect(body).toHaveValue(draft);

  // 「🎨 Format」 toggle を開く(= SYS_SYNC_CHILD_WINDOWS → full re-render)。
  const toggle = page.locator('[data-pkc-action="toggle-format-panel"]').first();
  await expect(toggle).toBeVisible();
  await toggle.click();

  // パネルが実際に開いた(click が full re-render を起こした)ことを確認。
  await expect(toggle).toHaveAttribute('data-pkc-active', 'true');

  // 修正の本丸: 再描画後も本文ドラフトが残っている(空回りで消えない)。
  const bodyAfter = page.locator('textarea[data-pkc-field="body"]').first();
  await expect(bodyAfter).toHaveValue(draft);

  // 続けて入力できること(エディタが生きていて caret も失われていない)。
  await bodyAfter.click();
  await page.keyboard.type('!');
  await expect(bodyAfter).toHaveValue(new RegExp(draft.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
