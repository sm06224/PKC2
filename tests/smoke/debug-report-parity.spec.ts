/**
 * Parity test — 🐞 Debug Report button placement.
 *
 * Per `docs/development/visual-state-parity-testing.md`: smoke tests
 * (`locator.click()`, generation-of-DOM checks) prove that bytes get
 * produced; they do NOT prove that the bytes paint where the user
 * sees them. This file is the parity layer for the 🐞 button:
 *
 *   1. The button must be **inside** the header element — not
 *      floating in a corner via `position: fixed`.
 *   2. The button must sit **immediately to the right of the ⚙
 *      shell menu** — bounding-box check that the 🐞's left edge
 *      starts after the ⚙'s right edge, with both aligned vertically.
 *   3. The pixel under the 🐞's center must resolve via
 *      `elementFromPoint` to the 🐞 itself — confirms no overlay /
 *      `z-index` issue is hiding it.
 *   4. A real-OS `page.mouse.click(x, y)` at that center opens the
 *      report in a new tab — confirms the click is reachable through
 *      whatever else may be painted at that depth.
 *
 * If any of these fail, "tests pass" is no longer a synonym for
 * "ship-ready" (CLAUDE.md "描画と生成は別物 ─ test pass = ship 禁止").
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('🐞 button paints inside the header, right of ⚙, and is OS-clickable', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-debug=*', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });

  // Locate the relevant elements.
  const header = page.locator('.pkc-header').first();
  const menuBtn = page.locator('[data-pkc-action="toggle-shell-menu"]');
  const debugBtn = page.locator('[data-pkc-region="debug-report-button"]');

  await expect(header).toBeVisible();
  await expect(menuBtn).toBeVisible();
  await expect(debugBtn).toBeVisible();

  const headerBox = await header.boundingBox();
  const menuBox = await menuBtn.boundingBox();
  const debugBox = await debugBtn.boundingBox();

  if (!headerBox || !menuBox || !debugBox) {
    throw new Error('Bounding boxes unavailable — element is invisible.');
  }

  // 1. 🐞 is inside the header (not floating bottom-right).
  expect(debugBox.y).toBeGreaterThanOrEqual(headerBox.y - 1);
  expect(debugBox.y + debugBox.height).toBeLessThanOrEqual(
    headerBox.y + headerBox.height + 1,
  );
  expect(debugBox.x).toBeGreaterThanOrEqual(headerBox.x - 1);
  expect(debugBox.x + debugBox.width).toBeLessThanOrEqual(
    headerBox.x + headerBox.width + 1,
  );

  // 2. 🐞's left edge starts at or after ⚙'s right edge — i.e. it's
  // genuinely to the right of the menu, not stacked / overlapping.
  expect(debugBox.x).toBeGreaterThanOrEqual(menuBox.x + menuBox.width - 1);

  // Vertical alignment: midpoint of 🐞 within ±2px of midpoint of ⚙.
  const menuMidY = menuBox.y + menuBox.height / 2;
  const debugMidY = debugBox.y + debugBox.height / 2;
  expect(Math.abs(menuMidY - debugMidY)).toBeLessThanOrEqual(2);

  // 3. The pixel at 🐞's center resolves to the 🐞 button via
  // elementFromPoint — no overlay / z-index occluding it.
  const centerX = debugBox.x + debugBox.width / 2;
  const centerY = debugBox.y + debugBox.height / 2;
  const topRegion = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const btn = el.closest('[data-pkc-region]');
      return btn ? btn.getAttribute('data-pkc-region') : null;
    },
    { x: centerX, y: centerY },
  );
  expect(topRegion).toBe('debug-report-button');

  // 4. Real-OS click at the resolved center triggers a JSON download.
  const downloadPromise = page.waitForEvent('download');
  await page.mouse.click(centerX, centerY);
  const download = await downloadPromise;

  // Filename must follow the human-readable pattern.
  expect(download.suggestedFilename()).toMatch(
    /^pkc2-debug-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
  );
  // Sanity check: the file carries the JSON we expect, proving the
  // click reached the right code path (not some other clickable
  // element painted at the same coordinates).
  const path = await download.path();
  if (!path) throw new Error('download.path() returned null');
  const text = await readFile(path, 'utf8');
  const parsed = JSON.parse(text);
  expect(parsed.schema).toBe(3);
  expect(parsed.flags).toContain('*');

  // 5. After the success path, no fallback overlay must be present in
  // the parent page. Specifically, the legacy modal regions/classes
  // are forbidden — they were the "main window as modal" pattern
  // PKC2 explicitly rejects.
  const overlayCount = await page
    .locator(
      '[data-pkc-region="debug-report-fallback"], .pkc-debug-report-fallback',
    )
    .count();
  expect(overlayCount).toBe(0);
});
