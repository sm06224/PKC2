/**
 * Smoke — debug-via-URL-flag stage α + stage β UI placement.
 *
 * Proves the round trip the user-report protocol promises:
 *
 *   1. `?pkc-debug=*` renders the 🐞 Report button next to the ⚙
 *      shell menu (stage β follow-up, 2026-05-02).
 *   2. Clicking it opens the DebugReport JSON in a new tab via a
 *      Blob URL — no clipboard permission needed; the user can
 *      Ctrl+S / ⌘+S to save.
 *   3. The new-tab page text parses as a well-formed JSON DebugReport
 *      with the expected schema / env / app-state slices and NO
 *      entry body or asset bytes leaking through structural mode.
 *
 * `locator.click()` is fine here because this is a structural smoke,
 * not a parity test (visual-state-parity-testing.md §1). Real-OS-event
 * verification of header button positioning belongs in the parity
 * tier introduced in stage γ.
 */

import { test, expect } from '@playwright/test';

test('debug flag renders 🐞 button and opens the report in a new tab', async ({
  context,
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html?pkc-debug=*', { waitUntil: 'load' });

  // Boot must complete before the button is interactable; the renderer
  // sets data-pkc-phase on #pkc-root once SYS_INIT_COMPLETE fires.
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });

  const reportBtn = page.locator('[data-pkc-region="debug-report-button"]');
  await expect(reportBtn).toBeVisible();
  await expect(reportBtn).toHaveAttribute('data-pkc-debug', 'true');

  // Capture the new tab Playwright sees when window.open fires.
  const popupPromise = context.waitForEvent('page');
  await reportBtn.click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  // The new tab's URL is a blob: URL; its document body holds the
  // pretty-printed JSON (browsers wrap it in <pre>). Read the visible
  // text and parse it back.
  const bodyText = await popup.evaluate(() => document.body.innerText);
  const report = JSON.parse(bodyText);

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
  // Schema 3 additions (PR #211 finalize): structural defaults + ring
  // buffer + errors[] + truncatedCounts. Smoke hits ?pkc-debug=* (no
  // contents flag), so level must be 'structural', no content / replay.
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

  // Container summary, not contents — the privacy guarantee documented
  // in debug-via-url-flag-protocol.md §5.4.
  expect(report.container).not.toBeNull();
  expect(typeof report.container.entryCount).toBe('number');
  expect(typeof report.container.relationCount).toBe('number');
  expect(Array.isArray(report.container.assetKeys)).toBe(true);
  // Schema 3 fingerprint additions for shape-aware reproducibility.
  expect(typeof report.container.schemaVersion).toBe('number');
  expect(typeof report.container.archetypeCounts).toBe('object');
  expect(report.container.entries).toBeUndefined();
  expect(report.container.relations).toBeUndefined();
  expect(report.container.assets).toBeUndefined();

  await popup.close();

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
