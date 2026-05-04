/**
 * Flags Inspector parity (visual-state-parity-testing.md §6 mandatory).
 *
 * Closes the flags wave 機能 — validates that the inspector launches,
 * paints visibly, and toggles AppState through real OS-event clicks.
 * Two distinct launch paths because the inspector overlay can be
 * opened via either:
 *
 *   1. URL `?pkc-flag=*` boot-time auto-open
 *   2. Shell-menu「⚑ Flags」link click
 *
 * Both must work, and the × button must actually close the overlay
 * (reproduces the render-scope bug fixed in PR #233 follow-up).
 *
 * Spec: docs/spec/flags-protocol-v1-minimum-scope.md §5 / §6 / §6-bis.
 */

import { test, expect, type Page } from '@playwright/test';

async function bootReady(page: Page): Promise<void> {
  await expect(page.locator('#pkc-root')).toHaveAttribute(
    'data-pkc-phase',
    'ready',
    { timeout: 15_000 },
  );
}

test('flags inspector — URL `?pkc-flag=*` auto-opens at boot', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  // Overlay must exist + paint at the expected stack.
  const overlay = page.locator('[data-pkc-region="flags-inspector-overlay"]');
  await expect(overlay).toBeVisible();

  const panel = overlay.locator('[data-pkc-region="flags-inspector-panel"]');
  await expect(panel).toBeVisible();

  // At least the 7 PR-β-2 wave-1 defineFlag entries must appear.
  const rows = page.locator('[data-pkc-region="flag-row"]');
  await expect(rows).toHaveCount(7, { timeout: 5_000 });

  // Specific keys we shipped — surfaces drift if a future PR drops one.
  for (const key of [
    'recent.default_limit',
    'textlog.staged_render.initial_count',
    'persistence.debounce_ms',
    'image.max_long_edge',
  ]) {
    await expect(
      page.locator(`[data-pkc-region="flag-row"][data-pkc-key="${key}"]`),
    ).toBeVisible();
  }
});

test('shell-menu「⚑ Flags」link opens inspector via real OS-event click', async ({
  page,
}) => {
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await bootReady(page);

  // Open the shell menu via the ⚙ tray toggle.
  await page.locator('button[data-pkc-action="toggle-shell-menu"]').first().click();

  // Locate the「⚑ Flags」link inside the menu.
  const flagsLink = page
    .locator('button[data-pkc-action="open-flags-inspector"]')
    .first();
  await expect(flagsLink).toBeVisible();
  await expect(flagsLink).toContainText('Flags');

  // Parity gate — the link is paint-visible at the expected coords
  // and a click at the centre actually lands on the link element.
  const box = await flagsLink.boundingBox();
  if (!box) throw new Error('flags link has no bounding box');
  expect(box.width).toBeGreaterThan(20);
  expect(box.height).toBeGreaterThan(10);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const hit = await page.evaluate(
    ({ x, y }: { x: number; y: number }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest<HTMLElement>('[data-pkc-action]')?.getAttribute('data-pkc-action');
    },
    { x: cx, y: cy },
  );
  expect(hit).toBe('open-flags-inspector');

  // Real click — opens inspector + closes shell menu.
  await page.mouse.click(cx, cy);

  await expect(
    page.locator('[data-pkc-region="flags-inspector-overlay"]'),
  ).toBeVisible();
  await expect(page.locator('[data-pkc-region="flag-row"]').first()).toBeVisible();
});

test('× button closes inspector (reproduces & guards against PR #233 bug)', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  const overlay = page.locator('[data-pkc-region="flags-inspector-overlay"]');
  await expect(overlay).toBeVisible();

  const closeBtn = overlay.locator('.pkc-flags-inspector-close');
  await expect(closeBtn).toBeVisible();

  const box = await closeBtn.boundingBox();
  if (!box) throw new Error('× button has no bounding box');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.mouse.click(cx, cy);

  // Overlay must actually leave the DOM (full re-render path).
  // The earlier bug: render-scope didn't track flagsInspectorOpen, so
  // the close action mutated state but the renderer skipped removing
  // the element.
  await expect(overlay).toHaveCount(0, { timeout: 2_000 });
});

test('changing a Tier 0 flag persists to __flags__ entry', async ({ page }) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  // Pick a stable wave-1 flag and bump its value via the inspector.
  // recent.default_limit is a numeric input with range 1..100.
  const input = page.locator(
    '[data-pkc-action="set-flag-numeric"][data-pkc-key="recent.default_limit"]',
  );
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('10');

  await input.fill('25');
  await input.dispatchEvent('change');

  // After change, the source label flips from DEF → CONT (Container
  // wins because the SET_FLAG dispatch wrote to __flags__).
  const row = page.locator(
    '[data-pkc-region="flag-row"][data-pkc-key="recent.default_limit"]',
  );
  await expect(row).toHaveAttribute('data-pkc-source', 'container', {
    timeout: 2_000,
  });

  // Reset button (↺) must now be visible since the source is no
  // longer the compile-time default.
  await expect(row.locator('.pkc-flag-reset')).toBeVisible();
});
