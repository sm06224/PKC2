/**
 * Card widget chrome smoke — Plan 1-A (2026-04-26).
 *
 * Pin the visible widget states the Card hydrator (Slice 5.0 + 5.1)
 * emits for `@[card](<target>)` placeholders, in real Chromium.
 * happy-dom cannot evaluate `text-overflow: ellipsis` firing or
 * layout-driven widget chrome, which is why this lives in smoke and
 * not vitest.
 *
 * Covered (3 user-reachable states):
 *   1. ok                — self-referencing entry, has aria-label with
 *      title, owns a `.pkc-card-widget-excerpt` slot, ellipsis CSS
 *      computed AND actually overflowing (Slice 5.1 visible contract).
 *   2. missing            — `entry:nonexistent`, aria-disabled + tabindex.
 *   3. cross-container    — `pkc://other-cid/entry/x`, aria-disabled + tabindex.
 *
 * NOT covered:
 *   - `malformed` state — the hydrator's defence-in-depth branch is not
 *     reachable through markdown user input because the markdown
 *     emitter (`parseCardPresentation` → `isValidCardTarget`) already
 *     rejects ill-formed targets before any placeholder is produced.
 *     vitest pins the defence-in-depth branch via a hand-crafted DOM.
 *   - card click navigation (Slice 4 unit tests already pin it)
 *   - excerpt builder algorithmic edge cases (vitest pins 35 cases)
 *   - keyboard activation / focus order
 *   - hover / popover variants (Slice 6+, not implemented yet)
 *
 * Audit: docs/development/visual-smoke-expansion-audit-2026-04-26.md §5.A
 *        (audit listed 4 states; the malformed line is documented above
 *        as not reachable from the markdown pipeline.)
 */
import { test, expect } from '@playwright/test';

test('card widget hydrates 3 reachable states with correct chrome and a11y', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });

  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });

  // Create a new TEXT entry and grab its lid from the Save button —
  // commit-edit's data-pkc-lid is the canonical surface for the
  // currently-edited entry (renderer.ts:3142).
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  const saveBtn = page.locator('[data-pkc-action="commit-edit"]').first();
  const selfLid = await saveBtn.getAttribute('data-pkc-lid');
  expect(selfLid, 'commit-edit must expose the new entry lid').toBeTruthy();

  // Title doubles as the ok-card aria-label substring assertion.
  const TITLE = 'Card widget smoke fixture';
  await page.locator('[data-pkc-field="title"]').first().fill(TITLE);

  // Body: a long plain-text prefix (so the ok-card excerpt slot has
  // enough source to actually overflow CSS-side), followed by the
  // three card markers. hasMarkdownSyntax() matches `[..](..)` so this
  // body routes through renderMarkdown → hydrateCardPlaceholders.
  const longPrefix =
    'This is a deliberately long plain text prefix designed to overflow the card widget excerpt slot so that text-overflow ellipsis fires in production Chromium. It must exceed the slot width by a wide margin to make the assertion robust.';
  const body = [
    longPrefix,
    '',
    `@[card](entry:${selfLid})`,
    '@[card](entry:nonexistent-lid-xyz)',
    '@[card](pkc://other-cid/entry/x)',
  ].join('\n');
  await page.locator('textarea[data-pkc-field="body"]').first().fill(body);

  await saveBtn.click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });

  // Rendered body holds the hydrated widgets. Scope all locators
  // here so we cannot accidentally pick up unrelated DOM (e.g. a
  // sidebar entry that happens to share a class name).
  const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
  await expect(rendered).toBeVisible({ timeout: 10_000 });
  await expect(rendered.locator('.pkc-card-widget')).toHaveCount(3);

  // (1) ok — self-referencing card carries the entry title in
  // aria-label (Slice 5.0 contract: `Card · <archetype> · <title>` and
  // optionally `· <excerpt>` when present).
  const okCard = rendered.locator('.pkc-card-widget[data-pkc-card-status="ok"]');
  await expect(okCard).toHaveCount(1);
  await expect(okCard).toHaveAttribute('aria-label', new RegExp(TITLE));
  await expect(okCard).not.toHaveAttribute('aria-disabled', 'true');

  // Excerpt slot present and CSS ellipsis actually firing.
  const excerpt = okCard.locator('.pkc-card-widget-excerpt');
  await expect(excerpt).toHaveCount(1);
  const ellipsisState = await excerpt.evaluate((el) => {
    const cs = getComputedStyle(el);
    return {
      textOverflow: cs.textOverflow,
      overflow: cs.overflow,
      whiteSpace: cs.whiteSpace,
      isOverflowing: el.scrollWidth > el.clientWidth,
    };
  });
  expect(ellipsisState.textOverflow).toBe('ellipsis');
  expect(ellipsisState.overflow).toBe('hidden');
  expect(ellipsisState.whiteSpace).toBe('nowrap');
  expect(ellipsisState.isOverflowing, 'excerpt should overflow with the long prefix').toBe(true);

  // (2)-(3) disabled states — same a11y mirror per hydrator contract.
  for (const status of ['missing', 'cross-container'] as const) {
    const card = rendered.locator(`.pkc-card-widget[data-pkc-card-status="${status}"]`);
    await expect(card, `${status} card present`).toHaveCount(1);
    await expect(card).toHaveAttribute('aria-disabled', 'true');
    await expect(card).toHaveAttribute('tabindex', '-1');
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

