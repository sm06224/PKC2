/**
 * Smoke baseline — Tier 3-2.
 *
 * Proves the core "app boots and accepts user input" loop survives
 * every bundle / release build. Stays narrow on purpose; broader E2E
 * (C-3 in TIER3_PRIORITIZATION.md) is explicitly deferred.
 *
 * Scenario:
 *   1. Load dist/pkc2.html (served over http so IndexedDB works)
 *   2. Wait until the shell renders (sidebar region present)
 *   3. Click the "Text" create-entry button in the header
 *   4. Confirm the app transitioned into `editing` phase with a new
 *      entry, by checking the data-pkc-phase marker on the shell
 *      and that an entry title input exists
 *
 * Why not also exercise export / merge import / etc.? Those are
 * rich flows with their own ownership (Tier 3-1 has unit + integration
 * coverage for merge; export already has round-trip tests in vitest).
 * The smoke here is specifically the "nothing exploded at boot" gate.
 */

import { test, expect } from '@playwright/test';

test('boots and transitions into editing on Text create', async ({ page }) => {
  // Capture unexpected errors — any console.error or unhandled page
  // exception during boot should fail the smoke test rather than
  // hide behind a green check.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html', { waitUntil: 'load' });

  // The renderer writes data-pkc-phase onto #pkc-root (the single
  // DOM mount point declared in src/runtime/contract.ts SLOT.ROOT).
  // Wait for the phase to leave 'initializing'; that proves the
  // IDB bootstrap completed — the reducer never exits initializing
  // without a SYS_INIT_COMPLETE action.
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Click the "Text" create-entry button in the header.
  const createText = page.locator(
    'button[data-pkc-action="create-entry"][data-pkc-archetype="text"]',
  ).first();
  await expect(createText).toBeVisible();
  await createText.click();

  // After CREATE_ENTRY the reducer moves into the editing phase and
  // an entry editor renders with a title input.
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  const titleInput = page.locator('[data-pkc-field="title"]').first();
  await expect(titleInput).toBeVisible();

  // No uncaught errors should have surfaced during boot / create.
  expect(errors, errors.join('\n')).toEqual([]);
});
