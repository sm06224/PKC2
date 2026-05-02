/**
 * Smoke — debug-via-URL-flag stage β UI placement + download flow.
 *
 * Proves the round trip the user-report protocol promises:
 *
 *   1. `?pkc-debug=*` renders the 🐞 Report button next to the ⚙
 *      shell menu.
 *   2. Clicking it triggers a download of the JSON report — the
 *      browser's download manager picks up `pkc2-debug-<ISO-ts>.json`.
 *   3. The downloaded file parses as a well-formed schema-3
 *      DebugReport with the expected env / app-state slices and
 *      NO entry body or asset bytes leaking through structural mode.
 *
 * `locator.click()` is fine here because this is a structural smoke,
 * not a parity test. Real-OS-event verification of header button
 * positioning lives in `debug-report-parity.spec.ts`.
 */

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('debug flag renders 🐞 button and downloads the report as a JSON file', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html?pkc-debug=*', { waitUntil: 'load' });

  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });

  const reportBtn = page.locator('[data-pkc-region="debug-report-button"]');
  await expect(reportBtn).toBeVisible();
  await expect(reportBtn).toHaveAttribute('data-pkc-debug', 'true');

  // Capture the download Playwright sees when the <a download> click
  // fires. The download manager fulfils it; we read the file off
  // disk to verify the JSON contents.
  const downloadPromise = page.waitForEvent('download');
  await reportBtn.click();
  const download = await downloadPromise;

  // Filename must follow the human-readable pattern, not be a UUID.
  expect(download.suggestedFilename()).toMatch(
    /^pkc2-debug-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/,
  );

  const path = await download.path();
  if (!path) throw new Error('download.path() returned null');
  const text = await readFile(path, 'utf8');
  const report = JSON.parse(text);

  expect(report.schema).toBe(3);
  expect(typeof report.pkc.version).toBe('string');
  expect(report.pkc.version.length).toBeGreaterThan(0);
  expect(typeof report.pkc.commit).toBe('string');
  expect(typeof report.ts).toBe('string');
  expect(report.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(typeof report.url).toBe('string');
  expect(report.url).toContain('pkc-debug=');
  expect(typeof report.ua).toBe('string');
  expect(report.viewport.w).toBeGreaterThan(0);
  expect(report.viewport.h).toBeGreaterThan(0);
  expect(typeof report.pointer.coarse).toBe('boolean');
  // Schema 3 additions: structural defaults + ring buffer + errors[]
  // + truncatedCounts. Smoke hits ?pkc-debug=* (no contents flag),
  // so level must be 'structural', no content / replay.
  expect(report.level).toBe('structural');
  expect(report.contentsIncluded).toBe(false);
  expect(Array.isArray(report.recent)).toBe(true);
  expect(Array.isArray(report.errors)).toBe(true);
  expect(report.replay).toBeUndefined();
  expect(report.truncatedCounts).toMatchObject({
    recent: expect.any(Number),
    errors: expect.any(Number),
    replayDropped: false,
  });
  expect(report.phase).toBe('ready');
  expect(['detail', 'calendar', 'kanban']).toContain(report.view);
  expect(report).toHaveProperty('selectedLid');
  expect(report).toHaveProperty('editingLid');
  expect(report.flags).toContain('*');

  // Container summary, not contents — privacy guarantee documented
  // in debug-via-url-flag-protocol.md §5.4.
  expect(report.container).not.toBeNull();
  expect(typeof report.container.entryCount).toBe('number');
  expect(typeof report.container.relationCount).toBe('number');
  expect(Array.isArray(report.container.assetKeys)).toBe(true);
  expect(typeof report.container.schemaVersion).toBe('number');
  expect(typeof report.container.archetypeCounts).toBe('object');
  expect(report.container.entries).toBeUndefined();
  expect(report.container.relations).toBeUndefined();
  expect(report.container.assets).toBeUndefined();

  expect(errors, errors.join('\n')).toEqual([]);
});

test('button does not appear without the debug flag', async ({ page }) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });
  const reportBtn = page.locator('[data-pkc-region="debug-report-button"]');
  expect(await reportBtn.count()).toBe(0);
});
