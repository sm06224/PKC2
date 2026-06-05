/**
 * ① 編集中ファイルドロップ → drop 位置 anchor の parity
 * (visual-state-parity-testing.md §6)。
 *
 * 編集中に textarea へファイルを drop したとき、anchor が「最後に
 * キャレットがあった位置」ではなく「drop した位置」に入ることを実
 * ブラウザで検証する。`textareaOffsetAtPoint` が `caretPositionFromPoint`
 * /`caretRangeFromPoint` で drop 座標を文字オフセットへ変換する。
 *
 * 検証手法:body に既知の 40 文字 1 行(0×10 / 1×10 / 2×10 / 3×10)を
 * 入力 → キャレットを先頭(0)へ移動 → 行の中ほど(2 の領域付近)へ
 * synthetic drop。drop 位置に入れば body は先頭の 0・1 群が残り、
 * キャレット 0 に入れば body は asset ref で始まる ── この差で判定。
 */
import { test, expect } from '@playwright/test';

test('parity: 編集中の file drop は drop した位置に anchor を挿入する', async ({ page }) => {
  await page.goto('/pkc2.html');
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  // body に既知の 40 文字 1 行を入力。
  const body = page.locator('[data-pkc-field="body"]').first();
  await body.click();
  await body.pressSequentially('0000000000111111111122222222223333333333');
  // キャレットを先頭(0)へ ── drop 位置と区別する。
  await body.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = 0;
    el.selectionEnd = 0;
  });

  // 行の中ほど(文字 ~25 付近)へ file を synthetic drop。
  const box = await body.boundingBox();
  if (!box) throw new Error('body textarea has no bounding box');
  const dropX = box.x + 200;
  const dropY = box.y + 14;
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['hello'], 'dropped.txt', { type: 'text/plain' }));
    return dt;
  });
  await body.dispatchEvent('drop', { dataTransfer, clientX: dropX, clientY: dropY });

  // anchor(asset ref)が挿入される。
  await expect(body).toHaveValue(/asset:/);
  // 先頭の 0×10 + 1×6 以上が anchor より前に残る = drop 位置(offset≥16)に
  // 入った。キャレット 0 に入っていれば body は asset ref で始まり失敗する。
  await expect(body).toHaveValue(/^0000000000111111/);

  await page.screenshot({ path: 'test-results/editor-drop-anchor-parity.png' });
});
