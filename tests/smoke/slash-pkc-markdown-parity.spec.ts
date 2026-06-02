/**
 * 領域 5 — PKC-Markdown slash command の parity
 * (visual-state-parity-testing.md §6)。
 *
 * slash menu はクリック可能な popover。実ブラウザで body textarea に
 * `/highlight` を実キーボード入力 → 出現する menu item を
 * `elementFromPoint` で非遮蔽確認 → 実 OS `mouse.click` で選択し、
 * `====` が挿入されることを assert する(menu item の mousedown 経路)。
 */
import { test, expect } from '@playwright/test';

test('parity: /highlight slash command を実 OS click で挿入', async ({ page }) => {
  await page.goto('/pkc2.html');
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');

  // text entry を作成 → editing phase。
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');

  // body textarea に `/highlight` を実キーボードで入力。
  const body = page.locator('[data-pkc-field="body"]').first();
  await body.click();
  await body.pressSequentially('/highlight');

  // slash menu に highlight 項目が出る。
  const item = page.locator('[data-pkc-slash-id="highlight"]');
  await expect(item).toBeVisible();

  // Parity gate:項目が見えている座標で click が項目自身に届く。
  const box = await item.boundingBox();
  if (!box) throw new Error('slash item has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return !!el?.closest<HTMLElement>('[data-pkc-slash-id="highlight"]');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe(true);

  // 実 OS click → /highlight が ==== へ置換される。
  await page.mouse.click(cx, cy);
  await expect(body).toHaveValue('====');

  await page.screenshot({ path: 'test-results/slash-pkc-markdown-parity.png' });
});
