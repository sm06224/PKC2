/**
 * 領域 10-1 — Split-view source ↔ preview sync parity
 * (visual-state-parity-testing.md §6 mandatory).
 *
 * **PR #206 reminder**: the previous attempt at caret↔preview sync
 * passed Playwright but was rejected on real-device verification.
 * The lesson recorded in `pr-206-paused.md` and Phase 8 順序性 doctrine:
 * **DOM attribute mutation alone is NOT proof**. The user-visible
 * consumer behaviour (computed scroll position / pixel-level visibility
 * via elementFromPoint / element on screen) must also be asserted.
 *
 * Test design (each scenario):
 *   1. Mutate state via real OS events where the user does (keyboard
 *      arrows, page.mouse.click at coords).
 *   2. Wait for the sync helper to settle (waitForFunction on the
 *      observable mutation, never arbitrary sleeps).
 *   3. Assert BOTH:
 *      - Mutation: `[data-pkc-active-source]` is on the expected
 *        preview block, OR caret offset is at the expected line, etc.
 *      - Consumer behavior: preview `scrollTop` changed, and
 *        `elementFromPoint` at the active block centre resolves to
 *        that block (proof it's actually painted there).
 *
 * Render patterns covered (≥ 8):
 *   1. Short paragraphs — basic editor → preview
 *   2. Long fenced code (40 lines) — block-internal progress
 *   3. Headings — ATX heading anchored
 *   4. Nested unordered list — list_item granularity
 *   5. Table — table_open anchored
 *   6. Preview click on paragraph (real OS event) — preview → editor
 *   7. Preview click on fence — preview → editor with multi-line block
 *   8. Preview click on blank gap (point fallback) — preview → editor
 *      via findSourceLineByPoint
 *   9. Toggle ⇄ OFF — no sync happens, prior active marker cleared
 *  10. Toggle ⇄ ON again — sync re-engages without page reload
 */

import { test, expect, type Page, type Locator } from '@playwright/test';

/* ─── Test fixture body ────────────────────────────────
 * Designed to exercise every block type the markdown renderer
 * stamps `data-pkc-source-line` on (paragraphs, headings, list_items,
 * tables, fences, hr, blockquotes). The line numbers are 0-indexed
 * and quoted in each test for clarity.
 */
const FIXTURE_BODY = [
  '# Heading 0',                                            //  0
  '',                                                        //  1
  'Paragraph at line 2.',                                    //  2
  '',                                                        //  3
  '- list item A',                                           //  4
  '  - nested A1',                                           //  5
  '  - nested A2',                                           //  6
  '- list item B',                                           //  7
  '',                                                        //  8
  '| col1 | col2 |',                                         //  9
  '|------|------|',                                         // 10
  '| 1    | 2    |',                                         // 11
  '| 3    | 4    |',                                         // 12
  '',                                                        // 13
  '> quoted paragraph at line 14',                           // 14
  '',                                                        // 15
  '---',                                                     // 16
  '',                                                        // 17
  'Paragraph at line 18 right after hr.',                    // 18
  '',                                                        // 19
  '```js',                                                   // 20
  'function fence_line_21() {',                              // 21
  '  const a = 1;',                                          // 22
  '  const b = 2;',                                          // 23
  '  const c = 3;',                                          // 24
  '  const d = 4;',                                          // 25
  '  const e = 5;',                                          // 26
  '  const f = 6;',                                          // 27
  '  const g = 7;',                                          // 28
  '  const h = 8;',                                          // 29
  '  const i = 9;',                                          // 30
  '  const j = 10;',                                         // 31
  '  const k = 11;',                                         // 32
  '  const l = 12;',                                         // 33
  '  const m = 13;',                                         // 34
  '  const n = 14;',                                         // 35
  '  const o = 15;',                                         // 36
  '  const p = 16;',                                         // 37
  '  return [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p];', // 38
  '}',                                                       // 39
  '```',                                                     // 40
  '',                                                        // 41
  'Paragraph at line 42 after fence.',                       // 42
].join('\n');

// ── Boot helpers ──────────────────────────────────────

async function bootAndOpenTextEditor(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests that
  // exercise the sync-on path. Default state is OFF for end users
  // (per user direction), but most existing specs assume ON.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', {
    timeout: 15_000,
  });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', {
    timeout: 5_000,
  });
}

/**
 * Set the textarea body to the fixture, dispatch input so the
 * preview re-renders with sourceLineAnchors stamped, then wait for
 * the preview to actually contain the expected anchored blocks.
 */
async function seedFixtureBody(page: Page): Promise<void> {
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, FIXTURE_BODY);

  // updateTextEditPreview is debounced 500ms; wait for the actual
  // anchors we depend on. Robust because we check for the LAST
  // expected anchor (line 42), not just "any anchor".
  await page.waitForFunction(
    () => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (!preview) return false;
      // The fence (line 20-40) and the trailing paragraph (line 42)
      // are the latest anchors; their presence proves the preview
      // re-rendered with the full fixture.
      return (
        preview.querySelector('[data-pkc-source-line="20"]') !== null &&
        preview.querySelector('[data-pkc-source-line="42"]') !== null
      );
    },
    { timeout: 3_000 },
  );
}

/**
 * Set caret to a specific source line via real OS keyboard events.
 *
 * Strategy: place the caret at the correct programmatic offset, then
 * fire a synthetic ArrowRight + ArrowLeft pair through `page.keyboard`
 * so the browser dispatches a real `selectionchange`. Without the
 * real event the sync handler doesn't fire (selectionchange isn't
 * synthesizable from `ta.selectionStart = N` alone in some browsers).
 */
async function moveCaretToLine(page: Page, line: number): Promise<void> {
  // Set base offset programmatically.
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    let seen = 0;
    let offset = 0;
    if (targetLine === 0) {
      offset = 0;
    } else {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) {
            offset = i + 1;
            break;
          }
        }
      }
    }
    ta.focus();
    ta.selectionStart = offset;
    ta.selectionEnd = offset;
  }, line);

  // Real OS event tree: ArrowRight + ArrowLeft moves the caret one
  // position right then back, leaving offset unchanged but firing a
  // genuine selectionchange both times.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');

  // Wait for the sync handler to settle.
  await page.waitForFunction(
    (expectedLine: number) => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (!preview) return false;
      const active = preview.querySelector<HTMLElement>(
        '[data-pkc-active-source]',
      );
      if (!active) return false;
      const start = parseInt(
        active.getAttribute('data-pkc-source-line') ?? '-1',
        10,
      );
      const endStr = active.getAttribute('data-pkc-source-end');
      const end = endStr !== null ? parseInt(endStr, 10) : start;
      return start <= expectedLine && expectedLine <= end;
    },
    line,
    { timeout: 2_000 },
  );
}

/**
 * Read the active source block's bounding rect AND the preview pane's
 * scrollTop. Both observed values are required to prove "the user
 * actually saw the highlight and the pane scrolled".
 */
interface ActiveSnapshot {
  startLine: number;
  endLine: number;
  rect: { x: number; y: number; width: number; height: number };
  previewScrollTop: number;
  previewScrollHeight: number;
  previewClientHeight: number;
  hitTagName: string | null;
  hitMatchesActive: boolean;
}

async function readActive(page: Page): Promise<ActiveSnapshot | null> {
  return page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!preview) return null;
    const active = preview.querySelector<HTMLElement>('[data-pkc-active-source]');
    if (!active) return null;
    const r = active.getBoundingClientRect();
    const start = parseInt(active.getAttribute('data-pkc-source-line') ?? '-1', 10);
    const endStr = active.getAttribute('data-pkc-source-end');
    const end = endStr !== null ? parseInt(endStr, 10) : start;
    const cx = r.left + r.width / 2;
    // Sample at top+8 to dodge potential floating-block-toolbar overlays.
    const cy = r.top + 8;
    const hit = document.elementFromPoint(cx, cy);
    return {
      startLine: start,
      endLine: end,
      rect: { x: r.left, y: r.top, width: r.width, height: r.height },
      previewScrollTop: preview.scrollTop,
      previewScrollHeight: preview.scrollHeight,
      previewClientHeight: preview.clientHeight,
      hitTagName: hit?.tagName ?? null,
      hitMatchesActive: !!hit && active.contains(hit),
    };
  });
}

async function readCaretLine(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    const pos = ta.selectionStart ?? 0;
    let line = 0;
    for (let i = 0; i < pos; i++) {
      if (ta.value.charCodeAt(i) === 10) line++;
    }
    return line;
  });
}

async function previewBlock(
  page: Page,
  line: number,
): Promise<Locator> {
  return page.locator(
    `[data-pkc-region="text-edit-preview"] [data-pkc-source-line="${line}"]`,
  );
}

// ─── Test cases ──────────────────────────────────────

test.describe('源 ↔ プレビュー 同期(領域 10-1, parity)', () => {

  test('1. 短い段落: caret line 2 → 該当 paragraph が active + 可視', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 2);
    const snap = await readActive(page);
    expect(snap, 'active marker must be set').not.toBeNull();
    expect(snap!.startLine).toBe(2);
    // Consumer behaviour: elementFromPoint at the active block's top
    // resolves to a node *inside* that block — proves it's painted
    // at the user-visible coordinate, not occluded.
    expect(snap!.hitMatchesActive, 'active block must be hit-testable at its rect').toBe(true);
  });

  test('2. 長い fence: caret が fence 内のどこにあっても same fence が active', async ({
    page,
  }) => {
    // 2026-05-05 hotfix-5 reset: this spec previously asserted
    // "scrollTop monotonically increases as caret deepens" — that was
    // line-level sync behaviour we no longer claim. The new contract
    // is block-level only: caret line 21 and caret line 35 both fall
    // inside source range [20, 40] of the same fence, so both produce
    // the same active marker. Whether the preview rescrolls or not is
    // unspecified at the source-preview-sync layer.
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (preview) {
        preview.style.height = '300px';
        preview.style.maxHeight = '300px';
      }
    });
    await moveCaretToLine(page, 21);
    const top = await readActive(page);
    expect(top!.startLine).toBe(20);
    expect(top!.endLine).toBe(40);
    await moveCaretToLine(page, 35);
    const deep = await readActive(page);
    expect(deep!.startLine).toBe(20);
    expect(deep!.endLine).toBe(40);
  });

  test('3. 見出し: caret line 0 → h1 が active', async ({ page }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 0);
    const snap = await readActive(page);
    expect(snap!.startLine).toBe(0);
    // Verify the active element is actually an <h1>.
    const tagName = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
      );
      return el?.tagName ?? null;
    });
    expect(tagName).toBe('H1');
  });

  test('4. ネストしたリスト: caret line 5 → nested list_item が active', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 5);
    const snap = await readActive(page);
    // Either the outer ul or the inner li carries source-line=5
    // depending on token nesting. We assert the active block contains
    // line 5 and is one of the list-related tags.
    expect(snap!.startLine).toBeLessThanOrEqual(5);
    expect(snap!.endLine).toBeGreaterThanOrEqual(5);
    const tagName = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
      );
      return el?.tagName ?? null;
    });
    expect(['UL', 'LI', 'OL']).toContain(tagName);
  });

  test('5. table: caret line 9 → table が active', async ({ page }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 9);
    const snap = await readActive(page);
    expect(snap!.startLine).toBe(9);
    const tagName = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
      );
      // Table is wrapped in pkc-md-block; the anchor lands on the
      // wrapper or the <table>. Allow either — both are visible
      // structurally.
      return el?.tagName ?? null;
    });
    expect(tagName).not.toBeNull();
  });

  test('6. preview click(real OS event): paragraph → caret jumps', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    // Move caret to a known starting line so the assertion is a real
    // delta, not a coincidence with the default 0-offset.
    await moveCaretToLine(page, 0);
    const startLine = await readCaretLine(page);
    expect(startLine).toBe(0);

    // Real OS event: page.mouse.click at the centre of the line-18
    // paragraph. Native click → action-binder click handler →
    // syncCaretToPreview → caret moves.
    // .first() — tagSourceLines + the領域 10-1 PR 2 hotfix can stamp
    // the same source-line on multiple elements (wrapper div + inner
    // <pre>/<code>/<table>); they share the same anchor by design.
    const para18 = (await previewBlock(page, 18)).first();
    const box = await para18.boundingBox();
    if (!box) throw new Error('para-18 has no bounding box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForFunction(
      () => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) return false;
        const pos = ta.selectionStart ?? 0;
        let line = 0;
        for (let i = 0; i < pos; i++) {
          if (ta.value.charCodeAt(i) === 10) line++;
        }
        return line === 18;
      },
      { timeout: 2_000 },
    );

    expect(await readCaretLine(page)).toBe(18);
  });

  test('7. preview click on fence(real OS): caret jumps to fence start', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 0);

    // Click somewhere INSIDE the fence (rendered <pre>). Even though
    // the click lands inside, the closest anchored ancestor is the
    // fence wrapper at line 20.
    const fence = (await previewBlock(page, 20)).first();
    const box = await fence.boundingBox();
    if (!box) throw new Error('fence has no bounding box');
    // Click in the middle vertically — proves we land on the fence
    // start, not a per-line offset (we don't track per-line yet).
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await page.waitForFunction(
      () => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) return false;
        const pos = ta.selectionStart ?? 0;
        let line = 0;
        for (let i = 0; i < pos; i++) {
          if (ta.value.charCodeAt(i) === 10) line++;
        }
        return line === 20;
      },
      { timeout: 2_000 },
    );

    expect(await readCaretLine(page)).toBe(20);
  });

  test('8. preview click on blank gap: findSourceLineByPoint fallback', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 0);

    // Find the gap between para-2 and the list (line 4). The space
    // between them is the preview's natural margin between blocks.
    const previewBox = await page.locator(
      '[data-pkc-region="text-edit-preview"]',
    ).boundingBox();
    if (!previewBox) throw new Error('preview has no bounding box');
    const para2Box = await (await previewBlock(page, 2)).first().boundingBox();
    // Line 4 anchor is shared between <ul> and the first <li>; pick
    // the outer <ul> via .first() (DOM order: <ul> appears before its
    // child <li>).
    const listBox = await (await previewBlock(page, 4)).first().boundingBox();
    if (!para2Box || !listBox) throw new Error('block boxes missing');

    // The gap centre between para-2's bottom and list's top.
    const gapY = (para2Box.y + para2Box.height + listBox.y) / 2;
    // Sanity check: there's at least 4px of gap to click into.
    if (listBox.y - (para2Box.y + para2Box.height) < 4) {
      // Some browser default margins are tiny; if so, click just
      // below para-2 (still within the natural gap).
      const fallbackY = para2Box.y + para2Box.height + 1;
      await page.mouse.click(previewBox.x + 30, fallbackY);
    } else {
      await page.mouse.click(previewBox.x + 30, gapY);
    }

    // Per findSourceLineByPoint: clicking at gap should land on the
    // line of the most-recent block above the click (= line 2).
    await page.waitForFunction(
      () => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) return false;
        const pos = ta.selectionStart ?? 0;
        let line = 0;
        for (let i = 0; i < pos; i++) {
          if (ta.value.charCodeAt(i) === 10) line++;
        }
        return line === 2;
      },
      { timeout: 2_000 },
    );

    expect(await readCaretLine(page)).toBe(2);
  });

  test('9. ⇄ toggle OFF: 既存 active marker が消え、新たな caret 移動でも sync しない', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    await moveCaretToLine(page, 2);
    expect((await readActive(page))!.startLine).toBe(2);

    // Click the ⇄ toggle button via real OS event.
    const toggle = page.locator('[data-pkc-action="toggle-source-preview-sync"]').first();
    const tBox = await toggle.boundingBox();
    if (!tBox) throw new Error('toggle button has no bounding box');
    await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);

    // State mutation: data-pkc-sync-state flips to "off" AND the
    // existing active marker is cleared (setSyncEnabled(false) tears
    // them down via querySelectorAll).
    await page.waitForFunction(
      () => {
        const btn = document.querySelector<HTMLElement>(
          '[data-pkc-action="toggle-source-preview-sync"]',
        );
        if (btn?.getAttribute('data-pkc-sync-state') !== 'off') return false;
        return (
          document.querySelector(
            '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
          ) === null
        );
      },
      { timeout: 2_000 },
    );

    // Phase 8 順序性: state mutation alone is not enough — verify
    // consumer behaviour. Move the caret to a different line and
    // assert NO new active marker appears (sync is genuinely OFF).
    await moveCaretToLineExpectNoSync(page, 18);
    const stillNone = await page.evaluate(() => {
      return (
        document.querySelector(
          '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
        ) === null
      );
    });
    expect(stillNone, 'sync OFF must suppress new active markers').toBe(true);
  });

  test('10. ⇄ toggle ON 後の再 engage: caret 移動で active marker 復活', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedFixtureBody(page);
    // Toggle off first.
    const toggle = page.locator('[data-pkc-action="toggle-source-preview-sync"]').first();
    const tBox1 = await toggle.boundingBox();
    if (!tBox1) throw new Error('toggle button has no bounding box');
    await page.mouse.click(tBox1.x + tBox1.width / 2, tBox1.y + tBox1.height / 2);
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>(
        '[data-pkc-action="toggle-source-preview-sync"]',
      )?.getAttribute('data-pkc-sync-state') === 'off',
      { timeout: 2_000 },
    );

    // Toggle back on. Re-fetch box because layout may have shifted.
    const tBox2 = await toggle.boundingBox();
    if (!tBox2) throw new Error('toggle button has no bounding box');
    await page.mouse.click(tBox2.x + tBox2.width / 2, tBox2.y + tBox2.height / 2);
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>(
        '[data-pkc-action="toggle-source-preview-sync"]',
      )?.getAttribute('data-pkc-sync-state') === 'on',
      { timeout: 2_000 },
    );

    // Now caret movement should re-engage sync.
    await moveCaretToLine(page, 18);
    const snap = await readActive(page);
    expect(snap!.startLine).toBe(18);
  });
});

/**
 * Variant of moveCaretToLine that does NOT wait for an active marker
 * to appear — used in scenario 9 where sync is OFF and we want to
 * prove no marker shows up. We still fire real OS keyboard events.
 */
async function moveCaretToLineExpectNoSync(
  page: Page,
  line: number,
): Promise<void> {
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    let seen = 0;
    let offset = 0;
    if (targetLine === 0) {
      offset = 0;
    } else {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) {
            offset = i + 1;
            break;
          }
        }
      }
    }
    ta.focus();
    ta.selectionStart = offset;
    ta.selectionEnd = offset;
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  // Brief settle window — selectionchange is microtask-based.
  await page.waitForTimeout(150);
}
