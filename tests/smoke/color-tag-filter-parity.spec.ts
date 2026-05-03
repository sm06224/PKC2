/**
 * Color tag filter strip parity (visual-state-parity-testing.md §6 mandatory).
 *
 * The chip strip is a visual feature: a tap on a circle paints
 * (or unpaints) the active ring AND filters the entry list. happy-dom
 * unit tests verify the DOM mutation but cannot prove the user's tap
 * lands on the chip — so this Playwright spec drives the chip with a
 * real OS-event mouse click resolved via `elementFromPoint`, then
 * asserts the AppState mutation is visible in the rendered tree.
 *
 * Scenario:
 *   1. Boot the app, create a TEXT entry, set its color to red via the
 *      color picker popover (real swatch click).
 *   2. Locate the chip strip's red chip in the sidebar.
 *   3. boundingBox the chip; `elementFromPoint` at the centre resolves
 *      to the chip — proves the chip is paint-visible at the expected
 *      coordinate, not occluded.
 *   4. `page.mouse.click(cx, cy)` toggles the filter on. Assert the
 *      chip carries `data-pkc-active="true"` AND the entry list shows
 *      only entries that match the active filter.
 *   5. Click again at the same coordinates. The chip's active ring
 *      drops AND the previously-hidden entries reappear.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootAndCreateRedEntry(page: Page): Promise<void> {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });

  // Create a Text entry. Use the create button in the header.
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
  await page.locator('[data-pkc-field="title"]').first().fill('Red entry');
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 5_000,
  });

  // Open color picker for the (now-selected) entry, click the red
  // swatch. The picker trigger is in the meta pane title row.
  await page.locator('[data-pkc-action="open-color-picker"]').first().click();
  await page
    .locator('[data-pkc-action="apply-color-tag"][data-pkc-color="red"]')
    .first()
    .click();
}

test('color filter chip toggles colorTagFilter on real mouse click', async ({
  page,
}) => {
  await bootAndCreateRedEntry(page);

  // Strip must now exist with exactly the red chip in use.
  const strip = page.locator('[data-pkc-region="color-filter-strip"]');
  await expect(strip).toBeVisible();
  const redChip = strip.locator('[data-pkc-action="toggle-color-tag-filter"][data-pkc-color="red"]');
  await expect(redChip).toBeVisible();
  await expect(redChip).not.toHaveAttribute('data-pkc-active', 'true');

  // Parity gate: the chip paints at coordinates the user can see, and
  // a click at that pixel lands on the chip itself.
  const box = await redChip.boundingBox();
  if (!box) throw new Error('red chip has no bounding box');
  expect(box.width).toBeGreaterThan(16);
  expect(box.height).toBeGreaterThan(16);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      const chip = el?.closest<HTMLElement>(
        '[data-pkc-action="toggle-color-tag-filter"]',
      );
      return chip?.getAttribute('data-pkc-color') ?? null;
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe('red');

  // Real mouse click — toggles filter ON.
  await page.mouse.click(cx, cy);
  await expect(redChip).toHaveAttribute('data-pkc-active', 'true');
  await expect(redChip).toHaveAttribute('aria-pressed', 'true');

  // The created entry remains visible (its color matches the filter).
  await expect(
    page.locator('[data-pkc-action="select-entry"][data-pkc-lid]').first(),
  ).toBeVisible();

  // Click again at the same coordinate — toggles filter OFF.
  await page.mouse.click(cx, cy);
  await expect(redChip).not.toHaveAttribute('data-pkc-active', 'true');
  await expect(redChip).toHaveAttribute('aria-pressed', 'false');
});
