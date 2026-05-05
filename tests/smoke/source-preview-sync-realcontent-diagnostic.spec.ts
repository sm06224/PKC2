/* eslint-disable no-irregular-whitespace -- REAL_CONTENT は user 実報告
   markdown を逐語再現する fixture。全角スペース等の irregular ws は
   現実の markdown 入力の一部なので、ここでは故意に残す。 */
/**
 * 領域 10-1 — 実ユーザーコンテンツでの sync 診断テスト
 *
 * User report (2026-05-05):
 *   「画面幅によって縦幅を変えるオブジェクトがあると、あっという間に
 *    表示ずれている」
 *
 * これは PR #206 paused の根本原因と同じ系統。my fixture は短い
 * 段落 + 40 行 fence + 簡素なネスト list + 4 行 table のみで、
 * **長い CSV fence + wrapping table cells + 連続空行** といった
 * 実コンテンツのパターンを cover していなかった。
 *
 * このスペックは **diagnostic only** — ユーザーの markdown を
 * そのまま seed して各 source line に caret を置いた時に preview
 * 側で何が起きているかを記録する。red を確認 → fix 後 green、
 * その時点で本 spec は通常 parity test に格上げ。
 */

import { test, expect, type Page } from '@playwright/test';

const REAL_CONTENT = `1. item-a
2. item-b
3. item-c

\`\`\`csv
lat,lng,name,description,address,phone,hours,takeout_hours,category,price_band,payment,instagram,twitter,site
0.000001,0.000001,Sample Place A,Sample short description for testing layout wrap behaviour. Reservation requested.,Sample Address Line 1 City Code AAA-001,000-000-0001,09:00 - 17:00 / 18:00 - 22:00 (limited reservation availability),, sample-category-a,low to mid range,cash credit pay-app,sample_ig_a,sample_tw_a,
0.000002,0.000002,Sample Place B,Sample item B description with takeout availability.  Order ahead encouraged.　,Sample Address Line 2 District B AAA-002,000-000-0002,11:30 - 21:00 (last order 30min before close),11:30 - 21:00 (last order 30min before close),sample-category-b,from 1000,cash various-cards pay-app,sample_ig_b,,
0.000003,0.000003,Sample Place C,Sample item C wrap test description.  Order options available.,Sample Address Line 3 Area C AAA-003,000-000-0003,10:00 - 19:00 ,10:00-19:00,sample-category-c,800-1000,cash card-machine,sample_ig_c,sample_tw_c,https://example.invalid/c/
0.000004,0.000004,Sample Place D,Sample short pickup description.  Day-before reservation.,Sample Address Line 4 Block D AAA-004,000-000-0004,9:00 - 17:00,day-before reservation,sample-d,500-800,cash pay-app,,,https://example.invalid/d/
0.000005,0.000005,Sample Place E,Sample item E, takeout-friendly variant.,Sample Address Line 5 Lot E AAA-005,000-000-0005,11:30 - 21:30 (last order 30min before close),,sample-e-category,1100-1500,cash only,sample_ig_e,,
0.000006,0.000006,Sample Place F,Sample item F, regular daily availability.  Open mornings.,Sample Address Line 6 Sector F AAA-006,000-000-0006 (reservation required),9:00 - 15:00,9:00-15:00,sample-f-category,from 550,cash,,,
0.000007,0.000007,Sample Place G,Sample item G, pre-order accepted.  Call ahead.,Sample Address Line 7 Zone G AAA-007,000-000-0007 (reservation required),10:00 - 15:00,day-before reservation,sample-g-category,500/3000,cash,,,
\`\`\`
























# heading-1
intro-line
Plain paragraph text used as a fixture for split-view testing. Its exact wording is irrelevant; only line position and structural shape matter.

## design-axis sample

| axis | choices |
|---|---|
| **integration-degree** | A: copy / B: api / C: tool |
| **state-location** | S1: file / S2: localstorage / S3: external |
| **usage-metaphor** | M1: journal / M2: workbench / M3: schema / M4: doc / M5: self-edit |

## candidate-list

| # | name | i | s | m | edge | risk |
|---|---|---|---|---|---|---|
| 1 | **candidate-a** | A | S1 | M1 | sample edge text for row 1 | sample risk text 1 |
| 2 | **candidate-b** | A/B | S1+S2 | M2 | sample edge text for row 2 | sample risk text 2 |
| 3 | **candidate-c** | B | S2 | M3 | sample edge text for row 3 | sample risk text 3 |
| 4 | **candidate-d** | B | S1 | M4 | sample edge text for row 4 | sample risk text 4 |
| 5 | **candidate-e** | B | S1 | M5 | sample edge text for row 5 | sample risk text 5 |
`;

async function bootAndOpenTextEditor(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests that
  // exercise the sync-on path. Default state is OFF for end users
  // (per user direction), but most existing specs assume ON.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
}

async function seedRealContent(page: Page): Promise<void> {
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('body textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, REAL_CONTENT);
  // Wait for the LAST anchor (the table at the bottom) to render so
  // we know debounced re-render finished.
  await page.waitForFunction(
    () => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (!preview) return false;
      // The "## candidate-list" table starts around line 60+ of the source.
      // Check that we have anchors past line 50.
      const anchors = preview.querySelectorAll('[data-pkc-source-line]');
      let maxLine = -1;
      anchors.forEach((el) => {
        const v = parseInt(el.getAttribute('data-pkc-source-line') ?? '-1', 10);
        if (Number.isFinite(v) && v > maxLine) maxLine = v;
      });
      return maxLine >= 50;
    },
    { timeout: 5_000 },
  );
}

async function caretToLine(page: Page, line: number): Promise<void> {
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
  await page.waitForTimeout(150);
}

interface Snapshot {
  caretLine: number;
  activeStart: number | null;
  activeEnd: number | null;
  activeTagName: string | null;
  activeRectTop: number;
  activeRectHeight: number;
  previewScrollTop: number;
  previewScrollHeight: number;
  previewClientHeight: number;
  previewTop: number;
  /** Visible portion of the active block within preview's viewport */
  visiblePortion: number;
}

async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (!ta || !preview) throw new Error('editor or preview missing');
    const caretLine = (() => {
      const pos = ta.selectionStart ?? 0;
      let line = 0;
      for (let i = 0; i < pos; i++) {
        if (ta.value.charCodeAt(i) === 10) line++;
      }
      return line;
    })();
    const active = preview.querySelector<HTMLElement>('[data-pkc-active-source]');
    const previewRect = preview.getBoundingClientRect();
    if (!active) {
      return {
        caretLine,
        activeStart: null,
        activeEnd: null,
        activeTagName: null,
        activeRectTop: NaN,
        activeRectHeight: NaN,
        previewScrollTop: preview.scrollTop,
        previewScrollHeight: preview.scrollHeight,
        previewClientHeight: preview.clientHeight,
        previewTop: previewRect.top,
        visiblePortion: 0,
      };
    }
    const ar = active.getBoundingClientRect();
    const startStr = active.getAttribute('data-pkc-source-line');
    const endStr = active.getAttribute('data-pkc-source-end');
    const start = startStr !== null ? parseInt(startStr, 10) : NaN;
    const end = endStr !== null ? parseInt(endStr, 10) : start;
    const visTop = Math.max(ar.top, previewRect.top);
    const visBottom = Math.min(ar.bottom, previewRect.bottom);
    const visiblePortion = Math.max(0, visBottom - visTop) / Math.max(1, ar.height);
    return {
      caretLine,
      activeStart: Number.isFinite(start) ? start : null,
      activeEnd: Number.isFinite(end) ? end : null,
      activeTagName: active.tagName,
      activeRectTop: ar.top,
      activeRectHeight: ar.height,
      previewScrollTop: preview.scrollTop,
      previewScrollHeight: preview.scrollHeight,
      previewClientHeight: preview.clientHeight,
      previewTop: previewRect.top,
      visiblePortion,
    };
  });
}

test.describe('実ユーザーコンテンツの sync 診断(red→green)', () => {

  test('診断: 各重要 source line で active block / scroll を記録', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedRealContent(page);

    // 各 source line で snapshot を取り、後で目視できるよう console に
    // 記録する。発見 hypothesis(後で assert に変換):
    //   - line 1   : ordered list item
    //   - line 5-12: long CSV fence(rendered height >> source height)
    //   - line 14-32 : 連続空行(no content, empty line paragraphs?)
    //   - line 36+ : 見出し / paragraph / candidate-list table
    const probeLines = [
      0,    // first list item
      1,    // second list item
      4,    // empty line just before fence
      5,    // fence opening ```
      8,    // CSV row 3 (deep inside long lines)
      11,   // CSV row 6
      13,   // closing ```
      14,   // empty line
      32,   // deep in empty line stretch
      34,   // # heading-1
      37,   // ## design-axisを切る3軸
      40,   // table row in design-axis table
      45,   // empty line before candidate-list
      48,   // candidate-list table row 1
      51,   // candidate-list table row 4
    ];

    const captured: Array<{ line: number; snap: Snapshot }> = [];
    for (const line of probeLines) {
      await caretToLine(page, line);
      const snap = await snapshot(page);
      captured.push({ line, snap });
    }

    // Print to test output for diagnosis.
    /* eslint-disable no-console */
    console.log('=== 実コンテンツ sync 診断 ===');
    for (const { line, snap } of captured) {
      console.log(
        `caret=${line} active=[${snap.activeStart}..${snap.activeEnd}] tag=${snap.activeTagName} rectTop=${snap.activeRectTop.toFixed(0)} rectH=${snap.activeRectHeight.toFixed(0)} scrollTop=${snap.previewScrollTop.toFixed(0)} previewClientH=${snap.previewClientHeight} visible=${(snap.visiblePortion * 100).toFixed(0)}%`,
      );
    }
    /* eslint-enable no-console */

    // Hard guards — if these break, the bug we want to fix manifests.
    // Each caret line should have an active block whose source range
    // INCLUDES that line.
    for (const { line, snap } of captured) {
      expect(
        snap.activeStart,
        `caret line ${line}: no active block — anchor missing or sync failed`,
      ).not.toBeNull();
      const start = snap.activeStart!;
      const end = snap.activeEnd ?? start;
      // Either the line is within the block range, OR (for blank
      // line stretches) the closest anchored block is at or before
      // the caret line. Both are acceptable — strict equality is too
      // tight for blank lines.
      expect(
        start <= line,
        `caret line ${line}: active block starts at ${start} (after caret)`,
      ).toBe(true);
      // The block's range must not be in the past — end >= start
      expect(end).toBeGreaterThanOrEqual(start);
      // ★ KEY ASSERT: the active block must be at least PARTIALLY
      // visible in the preview viewport. PR #206 trap was that the
      // active marker was set on a block far off-screen.
      expect(
        snap.visiblePortion,
        `caret line ${line}: active block [${start}..${end}] only ${(snap.visiblePortion * 100).toFixed(0)}% visible — user can't see where they are`,
      ).toBeGreaterThan(0);
    }
  });

  test('診断: candidate-list table の各行を click → caret jump が行ごとに違うべき', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedRealContent(page);

    // The "candidate-list" table has 5 data rows. Click each row's center
    // and read where the caret landed. EXPECTATION: each row click
    // jumps to a DIFFERENT source line. CURRENT BUG (predicted):
    // all clicks land on table_open's source line because tr_open
    // is not in SOURCE_LINE_TOKEN_TYPES — so the closest anchored
    // ancestor is the table wrapper, not the row.
    // CSV fence(B-1 機能)も `<table>` として render されるので、
    // preview 内 `table` の DOM 順は CSV / design-axis / candidate-list の 3 個。
    // `## candidate-list` heading を起点に、その後ろにある最初の table の
    // tbody tr の数を確認。
    const rowCount = await page.evaluate(() => {
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-pkc-region="text-edit-preview"] h2',
        ),
      );
      const heading = headings.find((h) => h.textContent?.includes('candidate-list'));
      if (!heading) throw new Error('candidate-list heading not found');
      let cursor: Element | null = heading;
      let table: HTMLTableElement | null = null;
      while (cursor) {
        cursor = cursor.nextElementSibling;
        if (!cursor) break;
        const inner =
          cursor.tagName === 'TABLE'
            ? (cursor as HTMLTableElement)
            : cursor.querySelector?.('table') ?? null;
        if (inner) {
          table = inner;
          break;
        }
      }
      if (!table) throw new Error('table after candidate-list heading not found');
      const rows = table.querySelectorAll<HTMLTableRowElement>('tbody tr');
      return rows.length;
    });

    expect(rowCount).toBe(5);

    // Constrain preview height first so scrolling brings rows into
    // the preview viewport (not the page viewport — preview is the
    // overflow container). Then for each row index, scroll preview
    // and click using fresh coordinates.
    await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (preview) {
        preview.style.height = '500px';
        preview.style.maxHeight = '500px';
      }
    });

    const captured: number[] = [];
    for (let i = 0; i < rowCount; i++) {
      const center = await page.evaluate((rowIdx: number) => {
        const headings = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-pkc-region="text-edit-preview"] h2',
          ),
        );
        const heading = headings.find((h) => h.textContent?.includes('candidate-list'));
        if (!heading) throw new Error('candidate-list heading not found');
        let cursor: Element | null = heading;
        let table: HTMLTableElement | null = null;
        while (cursor) {
          cursor = cursor.nextElementSibling;
          if (!cursor) break;
          const inner =
            cursor.tagName === 'TABLE'
              ? (cursor as HTMLTableElement)
              : cursor.querySelector?.('table') ?? null;
          if (inner) { table = inner; break; }
        }
        if (!table) throw new Error('table after candidate-list heading not found');
        const rows = Array.from(
          table.querySelectorAll<HTMLTableRowElement>('tbody tr'),
        );
        const row = rows[rowIdx]!;
        row.scrollIntoView({ block: 'center' });
        const r = row.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, i);
      await page.waitForTimeout(50);
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(150);
      const caretLine = await page.evaluate(() => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) return -1;
        const pos = ta.selectionStart ?? 0;
        let line = 0;
        for (let i = 0; i < pos; i++) {
          if (ta.value.charCodeAt(i) === 10) line++;
        }
        return line;
      });
      captured.push(caretLine);
    }

    /* eslint-disable no-console */
    console.log('=== candidate-list table row click → caret line ===');
    for (let i = 0; i < captured.length; i++) {
      console.log(`row ${i + 1} → caret line ${captured[i]}`);
    }
    /* eslint-enable no-console */

    // 5 rows = 5 distinct lines expected.
    const distinct = new Set(captured);
    expect(
      distinct.size,
      `table row clicks should jump to distinct source lines, got ${distinct.size} distinct (${captured.join(', ')})`,
    ).toBe(5);
  });

  test('診断: 長い CSV fence の中段 caret → preview の可視部に caret 行が乗っている', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedRealContent(page);
    // Constrain preview height so block-internal progress is observable.
    await page.evaluate(() => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (preview) {
        preview.style.height = '300px';
        preview.style.maxHeight = '300px';
      }
    });

    // CSV fence spans source lines 5..13 (8 rows + 2 markers ≈).
    // Place caret in the middle (line 9, ~CSV row 5).
    await caretToLine(page, 9);
    await page.waitForTimeout(200);

    const snap = await snapshot(page);
    /* eslint-disable no-console */
    console.log('=== CSV fence mid-caret ===');
    console.log(
      `caret=9 active=[${snap.activeStart}..${snap.activeEnd}] rectTop=${snap.activeRectTop.toFixed(0)} rectH=${snap.activeRectHeight.toFixed(0)} previewTop=${snap.previewTop.toFixed(0)} previewClientH=${snap.previewClientHeight} scrollTop=${snap.previewScrollTop.toFixed(0)}`,
    );
    /* eslint-enable no-console */

    // 2026-05-05 hotfix-5/6 reset: line-level "caret-row centre"
    // interpolation was retired. The new contract is block-level
    // only — the active fence is the block containing the caret,
    // and `ensureRectVisible` keeps the block at least partially
    // in view by minimum-amount scroll. We assert that and stop
    // making line-level claims.
    expect(snap.activeStart).toBe(4);
    expect(snap.visiblePortion).toBeGreaterThan(0);
  });
});
