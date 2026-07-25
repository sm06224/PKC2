/**
 * コードブロックその場編集(code-edit-lite-design-2026-07 §4)の visual parity。
 *
 * 実ブラウザで証明すること:
 *   P1. S1 center pane の code block を hover → ✎ が到達可能に見える
 *   P2. ✎ 実クリック → 編集ダイアログが開き、実キーボードで中身を書き換え
 *   P3. 保存 → center pane の描画が新しい内容に更新される(reload なし)
 */
import { test, expect, type Page } from '@playwright/test';
import { bootReady } from './_helpers/boot-ready';

const BODY = ['# code edit', '', '```js', 'const before = 1;', '```', '', 'tail'].join('\n');

async function createTextEntry(page: Page, body: string): Promise<void> {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('[data-pkc-field="title"]').first().fill('code edit probe');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('parity: ✎ でコードブロックをその場編集 → center pane が更新される', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html');
  await bootReady(page);
  await createTextEntry(page, BODY);

  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });
  await expect(rendered.locator('code')).toContainText('const before = 1;');

  const block = rendered.locator('.pkc-md-block[data-pkc-md-block-kind="code"]').first();
  const box = await block.boundingBox();
  if (!box) throw new Error('code block has no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20));

  // P1: ✎ が到達可能
  const editBtn = block.locator('[data-pkc-action="edit-code-block"]');
  await expect(editBtn).toBeVisible();
  const bBox = await editBtn.boundingBox();
  if (!bBox) throw new Error('edit button has no bounding box');
  const cx = bBox.x + bBox.width / 2;
  const cy = bBox.y + bBox.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) =>
      document.elementFromPoint(x, y)?.closest('[data-pkc-action="edit-code-block"]') !== null,
    { x: cx, y: cy },
  );
  expect(hit, 'edit button reachable at center').toBe(true);

  // P2: ✎ クリック → ダイアログ → 実キーボードで書き換え
  await page.mouse.click(cx, cy);
  const dialog = page.locator('[data-pkc-region="code-block-editor"]');
  await expect(dialog).toBeVisible();
  const ta = dialog.locator('.pkc-code-edit-input');
  await expect(ta).toHaveValue('const before = 1;');
  await ta.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('const after = 99;', { delay: 8 });

  await page.screenshot({ path: 'test-results/code-block-editor-open.png' });

  // P3: 保存 → center pane が更新(reload なし)
  await dialog.locator('[data-pkc-action="code-edit-commit"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(rendered.locator('code')).toContainText('const after = 99;', { timeout: 5000 });
  await expect(rendered.locator('code')).not.toContainText('const before');

  await page.screenshot({ path: 'test-results/code-block-editor-saved.png' });
  expect(errors, errors.join('\n')).toEqual([]);
});
