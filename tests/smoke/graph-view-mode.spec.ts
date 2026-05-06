/**
 * Graph view-mode parity (領域 10-6 ζ'' Phase 4 follow-up 4).
 *
 * User direction(2026-05-05):
 *   グラフ表示にカラータグやタググループ、フォルダ階層のグラフを
 *   追加して。グラフはファイラーとは異なるセンターペインタブに
 *   切り出してください。これはエントリ単位でも欲しい機能なので、
 *   どこからでも開けるようにして欲しい。
 *
 * Verifies:
 *   1. View-mode toggle has 5 buttons (Detail / Calendar / Kanban /
 *      Filer / Graph).
 *   2. Clicking the Graph tab via real OS click flips viewMode and
 *      paints `[data-pkc-region="graph-view"]`.
 *   3. graph-mode toolbar renders with the 5 mode selector options
 *      (relations / color-tags / tag-groups / folder-hierarchy /
 *      time-proximity — last added in PR-D G8).
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndSeed(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Seed at least one entry so the view-mode toggle bar is rendered.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test('view-mode toggle exposes 5 tabs including Graph', async ({ page }) => {
  await bootAndSeed(page);
  const bar = page.locator('[data-pkc-region="view-mode-bar"]');
  await expect(bar).toBeVisible();
  const buttons = bar.locator('button[data-pkc-action="set-view-mode"]');
  await expect(buttons).toHaveCount(5);
  const labels = await buttons.allTextContents();
  expect(labels).toContain('Detail');
  expect(labels).toContain('Calendar');
  expect(labels).toContain('Kanban');
  expect(labels).toContain('Filer');
  expect(labels).toContain('Graph');
});

test('順序性: Graph tab click → viewMode=graph + graph-view region paints', async ({ page }) => {
  await bootAndSeed(page);
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  await expect(tab).toBeVisible();
  const box = await tab.boundingBox();
  if (!box) throw new Error('Graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible({ timeout: 5_000 });
  await expect(tab).toHaveAttribute('data-pkc-active', 'true');
});

test('graph mode selector lists 5 options (relations / color-tags / tag-groups / folder-hierarchy / time-proximity)', async ({ page }) => {
  await bootAndSeed(page);
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  const box = await tab.boundingBox();
  if (!box) throw new Error('Graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible({ timeout: 5_000 });

  const select = page.locator('select.pkc-graph-mode-select');
  await expect(select).toBeVisible();
  const options = await select.locator('option').allTextContents();
  expect(options.some((t) => t.startsWith('Relations'))).toBe(true);
  expect(options.some((t) => t.startsWith('Color tags'))).toBe(true);
  expect(options.some((t) => t.startsWith('Tag groups'))).toBe(true);
  expect(options.some((t) => t.startsWith('Folder hierarchy'))).toBe(true);
  expect(options.some((t) => t.startsWith('Time proximity'))).toBe(true);
});

test('順序性: switching graph-mode updates data-pkc-graph-mode attribute', async ({ page }) => {
  await bootAndSeed(page);
  const tab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="graph"]');
  const box = await tab.boundingBox();
  if (!box) throw new Error('Graph tab has no boundingBox');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('[data-pkc-region="graph-view"]')).toBeVisible({ timeout: 5_000 });

  const select = page.locator('select.pkc-graph-mode-select');
  await select.selectOption('color-tags');
  await expect(page.locator('[data-pkc-region="graph-view"]')).toHaveAttribute(
    'data-pkc-graph-mode',
    'color-tags',
  );

  await select.selectOption('folder-hierarchy');
  await expect(page.locator('[data-pkc-region="graph-view"]')).toHaveAttribute(
    'data-pkc-graph-mode',
    'folder-hierarchy',
  );
});
