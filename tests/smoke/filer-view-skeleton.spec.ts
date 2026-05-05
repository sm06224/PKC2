/**
 * Filer view skeleton parity — Phase 1 PR-1.
 *
 * Spec: docs/development/filer-view-explorer-subset-spec.md §6.3
 *
 * Phase 1 PR-1 lands the view-mode tab + filer-view region placeholder.
 * Scope of this test (matches PR-1 only — full table render parity is
 * deferred to PR-2):
 *
 *   1. Boot pkc2.html, ready phase.
 *   2. Click the "Filer" tab via real `page.mouse.click(x, y)` —
 *      reform-2026-05 §6 visual-state-parity (no programmatic
 *      `locator.click()` shortcut).
 *   3. Assert `data-pkc-region="filer-view"` is present + visible.
 *   4. Assert `[data-pkc-active="true"]` moved to the filer button
 *      (state mutation → consumer behavior change, Phase 8 順序性).
 *   5. boundingBox + `elementFromPoint` confirms the filer region is
 *      actually painted at its viewport coordinate, not occluded.
 *
 * Full table-render / row-click / display_profile editor parity
 * lands with PR-2.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Seed one TEXT entry so the view-mode toggle bar (gated by
 * userEntries.length > 0) is rendered.
 */
async function bootAndSeedOneText(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('button[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test('Filer tab click switches viewMode and paints filer-view region', async ({ page }) => {
  await bootAndSeedOneText(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  await expect(filerTab).toBeVisible();

  // Real OS click via page.mouse.click(x, y) on the tab's center.
  const tabBox = await filerTab.boundingBox();
  if (!tabBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);

  // Filer region appears.
  const filerRegion = page.locator('[data-pkc-region="filer-view"]');
  await expect(filerRegion).toBeVisible({ timeout: 5_000 });

  // Phase 1 PR-1 placeholder is present.
  const placeholder = page.locator('[data-pkc-region="filer-placeholder"]');
  await expect(placeholder).toBeVisible();

  // Active tab moved to filer.
  await expect(filerTab).toHaveAttribute('data-pkc-active', 'true');

  // Pixel parity: elementFromPoint at filer region center resolves
  // inside the filer region (not occluded by another layer).
  const regionBox = await filerRegion.boundingBox();
  if (!regionBox) throw new Error('Filer region has no boundingBox');
  const cx = regionBox.x + regionBox.width / 2;
  const cy = regionBox.y + regionBox.height / 2;
  const isInside = await page.evaluate(
    ([x, y]) => {
      const target = document.elementFromPoint(x, y);
      if (!target) return false;
      return !!target.closest('[data-pkc-region="filer-view"]');
    },
    [cx, cy],
  );
  expect(isInside).toBe(true);
});

test('default subset is explorer when folder has no display_profile', async ({ page }) => {
  await bootAndSeedOneText(page);

  const filerTab = page.locator('button[data-pkc-action="set-view-mode"][data-pkc-view-mode="filer"]');
  const tabBox = await filerTab.boundingBox();
  if (!tabBox) throw new Error('Filer tab has no boundingBox');
  await page.mouse.click(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);

  const filerRegion = page.locator('[data-pkc-region="filer-view"]');
  await expect(filerRegion).toBeVisible({ timeout: 5_000 });
  await expect(filerRegion).toHaveAttribute('data-pkc-subset', 'explorer');
});
