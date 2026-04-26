/**
 * Search filter smoke — Plan 1-C (2026-04-26).
 *
 * Pin the basic Search input → sidebar entry list filter flow in real
 * Chromium. happy-dom can drive the underlying reducer, but the
 * `input → SET_SEARCH_QUERY → applyFilters → renderEntryItems` chain
 * is best validated end-to-end so we catch wiring drift (e.g. the
 * search input no longer dispatches, or the renderer no longer
 * removes the filtered-out items from the DOM list).
 *
 * Covered:
 *   1. Three TEXT entries are created with unique titles and all
 *      three appear in the sidebar `pkc-entry-item` list.
 *   2. Typing a unique substring into `[data-pkc-field="search"]`
 *      narrows the visible list to a single matching entry.
 *   3. Clearing the search restores all three entries.
 *
 * NOT covered:
 *   - IME composition / regex / multi-token / archetype-filter
 *     interactions (vitest pins them in
 *     `tests/features/search/*.test.ts`).
 *   - Saved Search application (separate spec when needed).
 *   - Search across body / tags / colors (parser pins in vitest).
 *
 * Audit: docs/development/visual-smoke-expansion-audit-2026-04-26.md §5.C
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function createTextEntry(page: Page, title: string): Promise<void> {
  const shell = page.locator('#pkc-root');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test('search input filters sidebar entry list', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Use distinctive title prefixes so the search assertions are not
  // confused by any system entries (e.g. `__about__`) that may also
  // surface in the sidebar.
  await createTextEntry(page, 'ZuluFilterAlpha');
  await createTextEntry(page, 'ZuluFilterBravo');
  await createTextEntry(page, 'OtherFixtureCharlie');

  // Scope every list assertion to the main entry list. Recent items
  // (`li.pkc-recent-item`) must not be counted because they ignore
  // the search filter.
  const entryList = page.locator('[data-pkc-region="sidebar"] li.pkc-entry-item');
  await expect(entryList).toHaveCount(3, { timeout: 5_000 });

  // (1) Filter to the unique Charlie title.
  const search = page.locator('[data-pkc-field="search"]').first();
  await search.fill('OtherFixtureCharlie');
  await expect(entryList).toHaveCount(1, { timeout: 5_000 });
  await expect(entryList.first()).toContainText('OtherFixtureCharlie');

  // (2) Clear via the input directly so we exercise the filter
  // pipeline rather than the clear-filters button (which is wired
  // through CLEAR_FILTERS — covered by vitest reducer tests).
  await search.fill('');
  await expect(entryList).toHaveCount(3, { timeout: 5_000 });

  // (3) A second filter targets a multi-match prefix to prove the
  // pipeline is not just a one-shot — `Zulu` should leave 2 entries.
  await search.fill('Zulu');
  await expect(entryList).toHaveCount(2, { timeout: 5_000 });
  for (const text of ['ZuluFilterAlpha', 'ZuluFilterBravo']) {
    await expect(entryList.filter({ hasText: text })).toHaveCount(1);
  }

  expect(errors, errors.join('\n')).toEqual([]);
});
