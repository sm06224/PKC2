/**
 * Smoke — debug-via-URL-flag stage α.
 *
 * Proves the round trip the user-report protocol promises:
 *
 *   1. `?pkc-debug=*` makes the floating Report button visible
 *   2. Clicking it copies a well-formed JSON DebugReport to clipboard
 *   3. The clipboard text parses and contains the expected schema /
 *      env / app-state slices, with NO entry body or asset bytes
 *
 * `locator.click()` is fine here because this is a structural smoke,
 * not a parity test (visual-state-parity-testing.md §1). Real-OS-event
 * verification of the floating button position belongs in the parity
 * tier introduced in stage γ.
 */

import { test, expect } from '@playwright/test';

test('debug flag mounts Report button and copies report to clipboard', async ({
  context,
  page,
}) => {
  // Chromium needs explicit clipboard permissions for the smoke to
  // observe what the page wrote. The rest of the smoke suite never
  // touches clipboard so granting them at the context scope here is
  // additive and isolated.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

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

  await reportBtn.click();

  // Wait for the post-click toast that confirms the writeText succeeded.
  // The same toast region is reused by other warnings, so scope the
  // expectation to the message text the button uses.
  const toast = page.locator(
    '[data-pkc-region="toast-stack"] [data-pkc-region="toast"]',
    { hasText: 'Debug report copied to clipboard' },
  );
  await expect(toast).toBeVisible({ timeout: 4000 });

  // Now verify the clipboard payload itself — this is the part that
  // proves stage α fulfils its protocol contract end-to-end.
  const clipboardText = await page.evaluate(async () =>
    navigator.clipboard.readText(),
  );
  const report = JSON.parse(clipboardText);

  expect(report.schema).toBe(2);
  expect(typeof report.pkc.version).toBe('string');
  expect(report.pkc.version.length).toBeGreaterThan(0);
  expect(typeof report.ts).toBe('string');
  expect(report.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(typeof report.url).toBe('string');
  expect(report.url).toContain('pkc-debug=');
  expect(typeof report.ua).toBe('string');
  expect(report.viewport.w).toBeGreaterThan(0);
  expect(report.viewport.h).toBeGreaterThan(0);
  expect(typeof report.pointer.coarse).toBe('boolean');
  // Schema 2 additions (PR #211, stage β): structural defaults + ring
  // buffer. The smoke test page hits ?pkc-debug=* (no contents flag),
  // so level must be 'structural' and content must not be exposed.
  expect(report.level).toBe('structural');
  expect(report.contentsIncluded).toBe(false);
  expect(Array.isArray(report.recent)).toBe(true);
  expect(report.phase).toBe('ready');
  expect(['detail', 'calendar', 'kanban']).toContain(report.view);
  // selectedLid / editingLid may be null on a fresh boot — but they
  // must always be present as keys (null or string).
  expect(report).toHaveProperty('selectedLid');
  expect(report).toHaveProperty('editingLid');
  expect(report.flags).toContain('*');

  // Container summary, not contents — the privacy guarantee documented
  // in debug-via-url-flag-protocol.md §5.4.
  expect(report.container).not.toBeNull();
  expect(typeof report.container.entryCount).toBe('number');
  expect(typeof report.container.relationCount).toBe('number');
  expect(Array.isArray(report.container.assetKeys)).toBe(true);
  // The shape must NOT contain raw entry / body / asset data fields.
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
  // No flag → no button. Use count() rather than expect.toBeHidden()
  // because the element should not exist at all in the no-debug path.
  const reportBtn = page.locator('[data-pkc-region="debug-report-button"]');
  expect(await reportBtn.count()).toBe(0);
});
