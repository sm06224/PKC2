/**
 * #903 — minimap visual parity(実 Chromium、real mouse click)。
 *
 * 方針(CLAUDE.md Testing):視覚を持つ feature は visual parity test 最低 1 件。
 * flag `shell.minimap_enabled=1` を URL で有効化し、長文 entry で:
 *   1. minimap が可視でバーが実描画される
 *   2. minimap の下部を **page.mouse.click(実座標)** → center scroller の
 *      scrollTop が実際に前進する(state mutation → consumer 観測点)
 *   3. viewport indicator がスクロールに追従して下がる
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 720 } });

const BODY = (() => {
  const lines: string[] = [];
  for (let i = 0; i < 50; i++) {
    lines.push(`# Chapter ${i.toString().padStart(2, '0')}`);
    lines.push(`Paragraph of chapter ${i}. `.repeat(6));
    lines.push('');
  }
  return lines.join('\n');
})();

async function bootWithLongEntry(page: Page): Promise<void> {
  await page.goto('/pkc2.html?pkc-flag=shell.minimap_enabled%3D1', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, BODY);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
}

test('minimap: bars render, real click scrolls, viewport follows (#903)', async ({ page }) => {
  await bootWithLongEntry(page);

  // 1. minimap 可視 + バー実描画
  const map = page.locator('[data-pkc-region="minimap"]');
  await expect(map).toBeVisible();
  const barCount = await map.locator('.pkc-minimap-bar').count();
  expect(barCount, 'abstract bars must be rendered').toBeGreaterThan(20);

  const before = await page.evaluate(
    () => document.querySelector<HTMLElement>('.pkc-center-content')!.scrollTop,
  );
  expect(before).toBe(0);

  // 2. minimap 下部 80% 地点を実クリック
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8);

  const after = await page.evaluate(
    () => document.querySelector<HTMLElement>('.pkc-center-content')!.scrollTop,
  );
  expect(after, 'real click on minimap must scroll the center pane').toBeGreaterThan(before + 100);

  // 3. viewport indicator が追従(top% が 0 から前進)
  const indicatorTop = await page.evaluate(() => {
    const ind = document.querySelector<HTMLElement>('.pkc-minimap-viewport')!;
    return parseFloat(ind.style.top || '0');
  });
  expect(indicatorTop).toBeGreaterThan(0);
});
