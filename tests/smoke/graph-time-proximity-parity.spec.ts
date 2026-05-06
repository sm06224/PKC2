/**
 * Graph time-proximity mode parity (領域 10-6 ζ'' PR-D / G8).
 *
 * User direction(2026-05-06):
 * > Graph に時系列接近性 + 任意接近性 / region slice。
 *
 * PR-D scope は時系列接近性のみ(region slice は PR-E)。
 * Asserts the **state mutation → consumer behavior change** chain:
 *   - Switching mode to 'time-proximity' → svg's data-pkc-graph-mode
 *     attribute updates AND the time-axis labels render(consumer).
 *   - Older entry node sits at lower x than newer entry node
 *     (consumer = node group's transform attribute).
 *
 * reform-2026-05 §6 visual-state-parity-testing 準拠。
 */

import { test, expect, type Page } from '@playwright/test';

async function bootSeedAndOpenGraph(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed 3 user entries via UI(IDB-direct approach is racy on reload).
  // Each entry is created sequentially; created_at is derived from the
  // moment of creation, which still yields strictly increasing
  // timestamps within the same Playwright run — sufficient to verify
  // older-entry-has-lower-x ordering. We can't backdate here, but the
  // *ordering* contract is what matters.
  for (const title of ['Old', 'Mid', 'New']) {
    await page
      .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
      .first()
      .click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
    await page.locator('input[data-pkc-field="title"]').first().fill(title);
    await page.locator('button[data-pkc-action="commit-edit"]').first().click();
    await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
    // Spacing so created_at differs across entries (clock millisecond
    // resolution + JS task tick is usually > 1ms but assert anyway).
    await page.evaluate(() => new Promise((r) => setTimeout(r, 25)));
  }

  // Open Graph view.
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await expect(tab).toBeVisible({ timeout: 10_000 });
  const box = await tab.boundingBox();
  if (!box) throw new Error('Graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible({ timeout: 5_000 });
}

test('switching mode to time-proximity updates data-pkc-graph-mode (state mutation)', async ({ page }) => {
  await bootSeedAndOpenGraph(page);
  const select = page.locator('select.pkc-graph-mode-select');
  await select.selectOption('time-proximity');
  await expect(page.locator('[data-pkc-region="graph-view"]')).toHaveAttribute(
    'data-pkc-graph-mode',
    'time-proximity',
  );
});

test('time-proximity mode renders 3 axis labels (oldest / mid / newest)', async ({ page }) => {
  await bootSeedAndOpenGraph(page);
  await page.locator('select.pkc-graph-mode-select').selectOption('time-proximity');

  // axis labels live inside the zoom-layer (so they pan/zoom together).
  const labels = page.locator('.pkc-graph-time-axis-label');
  await expect(labels).toHaveCount(3);
  const texts = await labels.allTextContents();
  expect(texts.some((t) => t.includes('古い'))).toBe(true);
  expect(texts.some((t) => t.includes('新しい'))).toBe(true);
});

test('older entry node has lower x than newer entry node (consumer = transform attr)', async ({ page }) => {
  await bootSeedAndOpenGraph(page);
  await page.locator('select.pkc-graph-mode-select').selectOption('time-proximity');
  // Wait one frame so render settles.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 50)));

  // Map title → x. Titles "Old" / "Mid" / "New" were created in that
  // order so created_at is strictly increasing; layout must put them
  // left-to-right.
  const xByTitle = await page.evaluate(() => {
    const out: Record<string, number> = {};
    const groups = document.querySelectorAll<SVGGElement>('.pkc-filer-graph-node');
    for (const g of Array.from(groups)) {
      const labelEl = g.querySelector('.pkc-filer-graph-label');
      const title = labelEl?.textContent ?? '';
      const tr = g.getAttribute('transform') || '';
      const m = /translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(tr);
      if (m) out[title] = parseFloat(m[1]!);
    }
    return out;
  });

  expect(xByTitle['Old']).toBeDefined();
  expect(xByTitle['Mid']).toBeDefined();
  expect(xByTitle['New']).toBeDefined();
  expect(xByTitle['Old']!).toBeLessThan(xByTitle['Mid']!);
  expect(xByTitle['Mid']!).toBeLessThan(xByTitle['New']!);
});

test('time-proximity mode draws no edges (時系列軸そのものが接近性表現)', async ({ page }) => {
  await bootSeedAndOpenGraph(page);
  await page.locator('select.pkc-graph-mode-select').selectOption('time-proximity');

  const edgeCount = await page.locator('.pkc-filer-graph-edge').count();
  expect(edgeCount).toBe(0);
});
