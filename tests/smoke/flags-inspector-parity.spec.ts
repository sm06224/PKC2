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

  // 25 Tier 0 defineFlag entries (after caret_indicator 4 flags added in hotfix-7 follow-up-4):
  //   wave 1 (7): recent.default_limit / textlog.staged_render.{initial_count,lookahead}
  //               / persistence.debounce_ms / image.{max_long_edge,optimize_threshold_bytes}
  //               / search.max_results_per_entry
  //   wave 2 (13): tag.{max_length,max_count_per_entry} / import.preview.{body_chars,log_count,log_line_chars}
  //               / card.excerpt.max_chars / storage.{warn_low_bytes,warn_critical_bytes}
  //               / touch.tap_threshold_px / textlog.placeholder.min_height_px
  //               / attachment.{warn_soft_bytes,warn_heavy_bytes,reject_hard_bytes}
  //   Phase 3a (1): theme.scale (runtime UI multiplier)
  //   hotfix-7 follow-up-4 (4): caret_indicator.{enabled, tint_pct,
  //                              border_alpha_pct, border_width_px}
  const rows = page.locator('[data-pkc-region="flag-row"]');
  await expect(rows).toHaveCount(25, { timeout: 5_000 });

  // Spot-check one key per wave 2 file to surface drift if a future
  // PR drops or renames one.
  for (const key of [
    'recent.default_limit',                     // wave 1
    'textlog.staged_render.initial_count',      // wave 1
    'persistence.debounce_ms',                  // wave 1
    'image.max_long_edge',                      // wave 1
    'tag.max_length',                           // wave 2
    'import.preview.body_chars',                // wave 2
    'card.excerpt.max_chars',                   // wave 2
    'storage.warn_low_bytes',                   // wave 2
    'touch.tap_threshold_px',                   // wave 2
    'textlog.placeholder.min_height_px',        // wave 2
    'attachment.reject_hard_bytes',             // wave 2
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

/**
 * EVERY Tier 0 flag's edit input is fully inside the inspector
 * body's visible viewport BEFORE any scroll — i.e., a real user
 * who opened the inspector can see all flags without scrolling
 * (or, when scroll is unavoidable, the body has a visible
 * scrollbar so the affordance is obvious).
 *
 * Why this matters: `expect(rows).toHaveCount(7)` (the previous
 * assertion) only checked DOM presence. Playwright's `fill()`
 * autoscrolls into view, so an "edit-the-flag" assertion ALSO
 * passes for off-screen rows. A real user, however, sees only
 * what's painted within the body's clip rect — and on macOS
 * the `auto` scrollbar is invisible at rest, so off-screen
 * rows look "missing" entirely.
 *
 * Failure mode this test reproduces (PR #239): the body had
 * `overflow-y: auto` but `min-height: auto` (flexbox default)
 * which made overflow a no-op when the body's content exceeded
 * the panel's max-height. Combined with a tall footer holding
 * Build Features, two of seven Tier 0 rows were positioned
 * below the body's clip rect and the scrollbar was hidden.
 */
test('every Tier 0 flag row is reachable inside the inspector body', async ({
  page,
}) => {
  // PR #238 origin: 2 of 7 rows were hidden below the fold without
  // an obvious scroll affordance, so the user reported "flags are
  // not appearing / not working". The fix combined `overflow-y:
  // scroll` (always-visible scrollbar) + a body height that fits
  // most rows on a default viewport.
  //
  // After PR-γ wave 2 (13 additional flags → 20 total) not every
  // row fits at first paint on 1280×720, so the assertion is no
  // longer "every row is in the body's clip rect at scrollTop=0".
  // The reachability contract instead is:
  //   1. Inspector renders ALL 20 flag rows in the DOM.
  //   2. Body has `overflow-y: scroll` (scrollbar visible at all
  //      times — the original bug was the lack of affordance).
  //   3. First flag row paints inside the body's visible rect at
  //      initial paint (so the user sees content, not a blank panel).
  //   4. Body's scrollHeight >= clientHeight (content actually
  //      overflows, otherwise the scrollbar is decorative).
  //   5. Every row reaches the body's visible rect after the body
  //      is programmatically scrolled all the way down — i.e. NO
  //      row is clipped beyond the scrollable region.
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  await expect(
    page.locator('[data-pkc-region="flags-inspector-overlay"]'),
  ).toBeVisible();

  type Snapshot = {
    bodyTop: number;
    bodyBottom: number;
    bodyClientH: number;
    bodyScrollH: number;
    bodyScrollTop: number;
    bodyScrollbarVisible: boolean;
    firstRowVisible: boolean;
    rowCount: number;
    rowsAfterScroll: Array<{
      key: string;
      reachable: boolean;
    }>;
  };
  const snap = await page.evaluate<Snapshot>(() => {
    const body = document.querySelector(
      '.pkc-flags-inspector-body',
    ) as HTMLElement;
    const cs = getComputedStyle(body);
    const initialBodyRect = body.getBoundingClientRect();
    const initialScrollTop = body.scrollTop;
    const initialScrollH = body.scrollHeight;
    const initialClientH = body.clientHeight;

    const rows = Array.from(
      document.querySelectorAll<HTMLElement>('[data-pkc-region="flag-row"]'),
    );
    const firstRowRect = rows[0]?.getBoundingClientRect();
    const firstRowVisible = firstRowRect
      ? firstRowRect.top >= initialBodyRect.top - 1
        && firstRowRect.top <= initialBodyRect.bottom
      : false;

    // Walk through every row by scrolling each into view, and verify
    // that after the scroll the row paints inside the body's visible
    // rect. This is the "reachable" check.
    const rowsAfterScroll: Snapshot['rowsAfterScroll'] = [];
    for (const r of rows) {
      r.scrollIntoView({ block: 'nearest' });
      const after = r.getBoundingClientRect();
      const bodyRectNow = body.getBoundingClientRect();
      const reachable =
        after.top >= bodyRectNow.top - 1
        && after.bottom <= bodyRectNow.bottom + 1;
      rowsAfterScroll.push({
        key: r.getAttribute('data-pkc-key') ?? '?',
        reachable,
      });
    }
    // Restore scroll for any subsequent assertion.
    body.scrollTop = 0;

    return {
      bodyTop: Math.round(initialBodyRect.top),
      bodyBottom: Math.round(initialBodyRect.bottom),
      bodyClientH: Math.round(initialClientH),
      bodyScrollH: Math.round(initialScrollH),
      bodyScrollTop: initialScrollTop,
      bodyScrollbarVisible: cs.overflowY === 'scroll',
      firstRowVisible,
      rowCount: rows.length,
      rowsAfterScroll,
    };
  });

  expect(snap.rowCount).toBe(25);

  // Body uses `overflow-y: scroll` — scrollbar is always visible.
  expect(snap.bodyScrollbarVisible).toBe(true);

  // Initial paint: not auto-scrolled.
  expect(snap.bodyScrollTop).toBe(0);

  // First row paints inside the body's visible rect — user sees content.
  expect(snap.firstRowVisible).toBe(true);

  // Content overflows → the scrollbar is functional, not decorative.
  expect(snap.bodyScrollH).toBeGreaterThanOrEqual(snap.bodyClientH);

  // Every row is reachable after scrollIntoView.
  for (const r of snap.rowsAfterScroll) {
    expect(
      r.reachable,
      `flag row "${r.key}" is not reachable after scrollIntoView`,
    ).toBe(true);
  }
});

/**
 * Real-OS-event flag edit: keyboard-driven value change on every
 * Tier 0 numeric flag updates `__flags__` entry source = container.
 * This is the inspector's primary user surface, so it must work
 * for ALL surfaced flags, not just the one I happened to test.
 */
test('every Tier 0 numeric flag edits via real keyboard input → __flags__ source flips', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);
  await expect(
    page.locator('[data-pkc-region="flags-inspector-overlay"]'),
  ).toBeVisible();

  // Discover keys from the rendered DOM so the test stays in sync
  // with whatever's registered (drift-tolerant).
  const keys: string[] = await page.evaluate(() => {
    const out: string[] = [];
    document
      .querySelectorAll(
        '[data-pkc-region="flag-row"] [data-pkc-action="set-flag-numeric"]',
      )
      .forEach((el) => {
        const k = (el as HTMLElement)
          .closest('[data-pkc-region="flag-row"]')
          ?.getAttribute('data-pkc-key');
        if (k) out.push(k);
      });
    return out;
  });
  expect(keys.length).toBeGreaterThanOrEqual(7);

  for (const key of keys) {
    const row = page.locator(
      `[data-pkc-region="flag-row"][data-pkc-key="${key}"]`,
    );
    const input = row.locator('[data-pkc-action="set-flag-numeric"]');
    // Use real keyboard input — `triple-click` + type — instead of
    // `fill()` which is a synthetic value-set that bypasses the
    // browser's input handling.
    await input.click({ clickCount: 3 });
    const currentVal = await input.inputValue();
    // Choose a new value that's GUARANTEED to differ from the current
    // value, so the SET_FLAG dispatch actually fires and the source
    // flips. Halving works for most numeric flags, but breaks down at
    // currentVal=1 (Math.floor(1/2)=0, Math.max(1,0)=1 → same as
    // current, no change). Phase 3a's `theme.scale` defaults to 1.0
    // and exposed this case. Fallback: when halving yields the same
    // value, bump by +1 instead.
    let newVal = String(Math.max(1, Math.floor(Number(currentVal) / 2)));
    if (newVal === currentVal) newVal = String(Number(currentVal) + 1);
    await page.keyboard.type(newVal);
    await page.keyboard.press('Tab'); // commit + blur so `change` fires
    await expect(row, `${key} did not flip to source=container`).toHaveAttribute(
      'data-pkc-source',
      'container',
      { timeout: 2_000 },
    );
  }
});
