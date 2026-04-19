/**
 * Manual navigation smoke — Phase 4 of manual-build integration.
 *
 * Proves the official manual artifact `pkc2-manual.html` boots,
 * renders a recognizable chapter, and is self-navigable — i.e. that
 * Phase 3's `__about__` injection did not break boot, and that
 * Phase 4's `.md` → `entry:manual-text-NN` link transcoding (see
 * `build/manual-builder.ts::transcodeManualLinks`) actually produces
 * clickable intra-manual navigation.
 *
 * Intentionally kept narrow. This is a smoke check, not a manual
 * E2E suite.
 *
 * Covered:
 *   1. manual HTML boots (shell phase → 'ready')
 *   2. a chapter title from `docs/manual/00_index.md` is visible
 *   3. clicking a transcoded `entry:manual-text-NN` link inside a
 *      rendered chapter body navigates to the target chapter (title
 *      in the main pane updates)
 *   4. no page errors / console errors surfaced during the run
 *
 * Intentionally NOT covered (yet):
 *   - every chapter's rendering quality
 *   - heading-anchor scroll restoration (Phase 4 v1 drops anchors)
 *   - About dialog rendering of the `__about__` entry
 *   - sidebar tree expansion / multi-view switches
 *   - screenshot / visual regression
 *   These belong in a future, broader manual E2E slice if ever
 *   needed.
 */

import { test, expect } from '@playwright/test';

test('manual boots, renders a chapter, and entry: links navigate', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2-manual.html', { waitUntil: 'load' });

  // Boot gate — shell must reach phase 'ready'. This proves the
  // pkc-data parsed (Phase 1 regression target) and that the
  // `__about__` system entry (Phase 3) did not break boot.
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Pick chapter 02 (`docs/manual/02_クイックスタート.md`, lid
  // `manual-text-02`). We address it by its stable `data-pkc-lid`
  // attribute rather than visible text, because the sidebar entry
  // renders as `${archetypeIcon} ${title}` and folder entries can
  // be nested; `data-pkc-lid` is the selector contract used by the
  // renderer / action-binder (see CLAUDE.md conventions).
  const sidebar = page.locator('[data-pkc-region="sidebar"]');
  await expect(sidebar).toBeVisible();
  const quickstartEntry = sidebar.locator('li[data-pkc-lid="manual-text-02"]');
  await expect(quickstartEntry).toBeVisible({ timeout: 10_000 });
  await quickstartEntry.click();

  // The center detail pane should now render the selected chapter.
  // Its body is a markdown-rendered `<div class="pkc-view-body">`;
  // the first `<h1>` is the chapter title "クイックスタート".
  const center = page.locator('.pkc-center-content, .pkc-center').first();
  await expect(center).toBeVisible();
  await expect(
    center.getByRole('heading', { name: 'クイックスタート', level: 1 }),
  ).toBeVisible({ timeout: 10_000 });

  // Chapter 02's body contains transcoded `entry:manual-text-NN`
  // links (see `build/manual-builder.ts::transcodeManualLinks`;
  // build-time verification produced 47 such refs across all
  // chapters). The smoke assertion: click the first one inside the
  // rendered body and confirm the center pane re-renders a
  // different chapter. This proves:
  //   (a) the .md → entry: transcoding produced a DOM link
  //   (b) `navigate-entry-ref` actually fires SELECT_ENTRY
  //   (c) the link was not a 404 GitHub-Pages relative URL
  const chapterLink = center.locator('a[href^="entry:manual-text-"]').first();
  await expect(chapterLink).toBeVisible({ timeout: 10_000 });
  const linkHref = await chapterLink.getAttribute('href');
  expect(linkHref).toMatch(/^entry:manual-text-\d{2}$/);
  await chapterLink.click();

  // After navigation the `クイックスタート` h1 must no longer be the
  // current chapter heading. We do not assert the specific target
  // chapter name because the markdown ordering inside chapter 02
  // may change; any other chapter heading is a valid success
  // signal.
  await expect(
    center.getByRole('heading', { name: 'クイックスタート', level: 1 }),
  ).toHaveCount(0, { timeout: 10_000 });

  expect(errors, errors.join('\n')).toEqual([]);
});
