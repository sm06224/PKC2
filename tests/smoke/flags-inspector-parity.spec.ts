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
test('every Tier 0 flag row is fully inside the inspector body without scrolling', async ({
  page,
}) => {
  await page.goto('/pkc2.html?pkc-flag=*', { waitUntil: 'load' });
  await bootReady(page);

  await expect(
    page.locator('[data-pkc-region="flags-inspector-overlay"]'),
  ).toBeVisible();

  // Snapshot body visible rect + every flag row's rect from a
  // single page.evaluate so they're all measured at the same
  // time, before any Playwright auto-scroll could fire.
  type Snapshot = {
    bodyTop: number;
    bodyBottom: number;
    bodyScrollTop: number;
    bodyScrollH: number;
    bodyClientH: number;
    bodyScrollbarVisible: boolean;
    rows: Array<{
      key: string;
      headerTop: number;
      inputBottom: number;
      headerVisible: boolean;
      inputVisible: boolean;
    }>;
  };
  const snap = await page.evaluate<Snapshot>(() => {
    const body = document.querySelector(
      '.pkc-flags-inspector-body',
    ) as HTMLElement;
    const bodyRect = body.getBoundingClientRect();
    const cs = getComputedStyle(body);
    const rows: Snapshot['rows'] = [];
    document.querySelectorAll('[data-pkc-region="flag-row"]').forEach((el) => {
      const r = el as HTMLElement;
      const headerEl = r.querySelector('.pkc-flag-meta') as HTMLElement;
      const inputEl = r.querySelector(
        'input,select',
      ) as HTMLInputElement | HTMLSelectElement | null;
      const headerRect = headerEl.getBoundingClientRect();
      const inputRect = inputEl?.getBoundingClientRect();
      const inBody = (top: number, bottom: number): boolean =>
        top >= bodyRect.top - 1 && bottom <= bodyRect.bottom + 1;
      rows.push({
        key: r.getAttribute('data-pkc-key') ?? '?',
        headerTop: Math.round(headerRect.top),
        inputBottom: Math.round(inputRect?.bottom ?? -1),
        headerVisible: inBody(headerRect.top, headerRect.bottom),
        inputVisible: inputRect ? inBody(inputRect.top, inputRect.bottom) : false,
      });
    });
    return {
      bodyTop: Math.round(bodyRect.top),
      bodyBottom: Math.round(bodyRect.bottom),
      bodyScrollTop: body.scrollTop,
      bodyScrollH: body.scrollHeight,
      bodyClientH: body.clientHeight,
      // `overflow-y: scroll` reserves scrollbar space, so the
      // "scrollbar is visible" predicate is "computed style is
      // scroll" + "content overflows OR equal".
      bodyScrollbarVisible: cs.overflowY === 'scroll',
      rows,
    };
  });

  expect(snap.rows).toHaveLength(7);

  // EVERY flag row's header AND input must paint inside the body's
  // visible clip rect at initial paint, without any user scroll.
  // If this fails, the inspector is broken for a real user — they
  // would see only the rows above the fold.
  for (const r of snap.rows) {
    expect(
      r.headerVisible,
      `flag row "${r.key}" header is below the body fold ` +
        `(headerTop=${r.headerTop}, body=${snap.bodyTop}-${snap.bodyBottom})`,
    ).toBe(true);
    expect(
      r.inputVisible,
      `flag row "${r.key}" input is below the body fold ` +
        `(inputBottom=${r.inputBottom}, body=${snap.bodyTop}-${snap.bodyBottom})`,
    ).toBe(true);
  }

  // Body must be at scrollTop=0 at initial paint (no auto-scroll).
  expect(snap.bodyScrollTop).toBe(0);

  // Body uses `overflow-y: scroll` so the scrollbar is visible
  // even when content fits — gives macOS users a clear scroll
  // affordance when the panel is shorter than content (e.g.
  // future flag additions push beyond the visible area).
  expect(snap.bodyScrollbarVisible).toBe(true);
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
    const newVal = String(Math.max(1, Math.floor(Number(currentVal) / 2)));
    await page.keyboard.type(newVal);
    await page.keyboard.press('Tab'); // commit + blur so `change` fires
    await expect(row, `${key} did not flip to source=container`).toHaveAttribute(
      'data-pkc-source',
      'container',
      { timeout: 2_000 },
    );
  }
});
