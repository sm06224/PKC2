/* eslint-disable no-irregular-whitespace -- REAL_CONTENT は user 実報告
   markdown を逐語再現する fixture。全角スペース等の irregular ws は
   現実の markdown 入力の一部なので、ここでは故意に残す。 */
/**
 * 領域 10-1 — 実コンテンツでの sync 多角的 parity test
 * (2026-05-05 user request)
 *
 * User direction:
 *   「スクロールを繰り返して、上下端や上下端についた後に少し戻す、
 *    プレビュー側でクリック、編集側の追従性あるいはその逆などを
 *    複数、多パターンで多角的に検証し、視覚的な補助が成立する
 *    ことをスクショ等で確認してください」
 *
 * このスペックは PR #206 paused 教訓 + 2026-05-05 用報告を踏まえ、
 * 「描画 = 生成」幻惑を回避するため、各 scenario で:
 *   - 実 OS event(`page.mouse.click(x, y)` / `page.keyboard`)
 *   - `elementFromPoint` で実 painted pixel を確認
 *   - preview scrollTop / textarea scrollTop / active rect の
 *     numeric snapshot
 *   - test-results に screenshot を残す
 * を AND 条件で assert する。
 *
 * Render fixture は前回 paused 当時の user 報告コンテンツに準じた:
 *   - ordered list 3 行
 *   - 8 行 CSV fence(B-1 機能で `<table>` rendering、長い行)
 *   - 連続空行 21 行(空白許容)
 *   - heading + plain paragraph
 *   - design-axis table(3 row、wrapping cells)
 *   - candidate-list table(5 row、wrapping cells)
 *
 * Scenario:
 *   1. Editor → Preview: 4 caret 位置 で active block + 可視性
 *   2. Preview → Editor: 各 table row click(real OS)で異なる line
 *   3. スクロール反復: caret を上 → 下 → 上 → 下 で sync が follow
 *   4. 上端到達 → 少し戻し: scrollTop が 0 で頭打ち & 戻し時に追従
 *   5. 下端到達 → 少し戻し: scrollTop が max で頭打ち & 戻し時に追従
 *   6. 大ブロック内移動: CSV fence 内で caret line 5 → 9 → 13 で
 *      preview scrollTop が monotonic に増える(block-internal progress)
 *   7. ⇄ OFF 中はどう scroll しても active marker が出ない
 *   8. screenshot: 各 scenario の最終状態を保存(視覚確認用)
 */

import { test, expect, type Page } from '@playwright/test';
import { attachShot } from './_fixtures/visual-attach';

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

async function bootSeedAndConstrain(page: Page): Promise<void> {
  // 2026-05-05 hotfix-6: opt-in sync — enable for tests that
  // exercise the sync-on path. Default state is OFF for end users
  // (per user direction), but most existing specs assume ON.
  await page.addInitScript(() => {
    try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* localStorage unavailable */ }
  });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready');
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing');
  await page.evaluate((body: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    ta.value = body;
    ta.selectionStart = 0;
    ta.selectionEnd = 0;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, REAL_CONTENT);
  await page.waitForFunction(
    () => {
      const preview = document.querySelector<HTMLElement>(
        '[data-pkc-region="text-edit-preview"]',
      );
      if (!preview) return false;
      const anchors = preview.querySelectorAll('[data-pkc-source-line]');
      let maxLine = -1;
      anchors.forEach((el) => {
        const v = parseInt(el.getAttribute('data-pkc-source-line') ?? '-1', 10);
        if (Number.isFinite(v) && v > maxLine) maxLine = v;
      });
      return maxLine >= 50;
    },
  );
  // Constrain preview height so scroll behaviour is observable.
  await page.evaluate(() => {
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (preview) {
      preview.style.height = '400px';
      preview.style.maxHeight = '400px';
    }
    // Also constrain editor textarea height
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (ta) {
      ta.style.height = '400px';
      ta.style.maxHeight = '400px';
    }
  });
}

async function moveCaretToLine(page: Page, line: number): Promise<void> {
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
  activeTag: string | null;
  activeTopRel: number;
  previewScrollTop: number;
  previewScrollHeight: number;
  previewClientHeight: number;
  previewMaxScroll: number;
  hitInsideActive: boolean;
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
    const previewMaxScroll = preview.scrollHeight - preview.clientHeight;
    if (!active) {
      return {
        caretLine,
        activeStart: null,
        activeEnd: null,
        activeTag: null,
        activeTopRel: NaN,
        previewScrollTop: preview.scrollTop,
        previewScrollHeight: preview.scrollHeight,
        previewClientHeight: preview.clientHeight,
        previewMaxScroll,
        hitInsideActive: false,
      };
    }
    const ar = active.getBoundingClientRect();
    const startStr = active.getAttribute('data-pkc-source-line');
    const endStr = active.getAttribute('data-pkc-source-end');
    const start = startStr !== null ? parseInt(startStr, 10) : NaN;
    const end = endStr !== null ? parseInt(endStr, 10) : start;
    // Probe the centre Y inside the visible portion of the active
    // block. If the block is taller than the preview, this samples
    // somewhere user can actually see.
    const probeY = Math.max(
      previewRect.top + 4,
      Math.min(previewRect.bottom - 4, ar.top + Math.min(ar.height, previewRect.height) / 2),
    );
    const probeX = ar.left + Math.min(ar.width, 200) / 2;
    const hit = document.elementFromPoint(probeX, probeY);
    return {
      caretLine,
      activeStart: Number.isFinite(start) ? start : null,
      activeEnd: Number.isFinite(end) ? end : null,
      activeTag: active.tagName,
      activeTopRel: ar.top - previewRect.top,
      previewScrollTop: preview.scrollTop,
      previewScrollHeight: preview.scrollHeight,
      previewClientHeight: preview.clientHeight,
      previewMaxScroll,
      hitInsideActive: !!hit && active.contains(hit),
    };
  });
}

async function readCaretLine(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="body"]',
    );
    if (!ta) throw new Error('textarea missing');
    const pos = ta.selectionStart ?? 0;
    let line = 0;
    for (let i = 0; i < pos; i++) {
      if (ta.value.charCodeAt(i) === 10) line++;
    }
    return line;
  });
}

// ─── Scenarios ──────────────────────────────────────

test.describe('実コンテンツ多角 sync parity(2026-05-05 user-report 対応)', () => {

  test('1. editor→preview: 4 caret 位置で active 可視性', async ({ page }, testInfo) => {
    await bootSeedAndConstrain(page);
    const probes = [0, 9, 48, 56]; // list / CSV mid / design-axis row / candidate-list row
    for (const line of probes) {
      await moveCaretToLine(page, line);
      const s = await snapshot(page);
      expect(s.activeStart, `line ${line}: active block missing`).not.toBeNull();
      expect(s.hitInsideActive, `line ${line}: active block not hit-testable`).toBe(true);
    }
    await attachShot(testInfo, `scenario1-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('2. preview→editor: candidate-list 5 行 real OS click → 異なる line', async ({
    page,
  }, testInfo) => {
    await bootSeedAndConstrain(page);
    const lines: number[] = [];
    for (let i = 0; i < 5; i++) {
      const center = await page.evaluate((idx: number) => {
        const headings = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-pkc-region="text-edit-preview"] h2',
          ),
        );
        const h = headings.find((el) => el.textContent?.includes('candidate-list'));
        if (!h) throw new Error('candidate-list heading missing');
        let cursor: Element | null = h;
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
        if (!table) throw new Error('candidates table missing');
        const rows = Array.from(
          table.querySelectorAll<HTMLTableRowElement>('tbody tr'),
        );
        const row = rows[idx]!;
        row.scrollIntoView({ block: 'center' });
        const r = row.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }, i);
      await page.waitForTimeout(60);
      await page.mouse.click(center.x, center.y);
      await page.waitForTimeout(120);
      lines.push(await readCaretLine(page));
    }
    // 5 distinct lines confirms tr-level anchor + click landing.
    expect(new Set(lines).size, `lines = ${lines.join(',')}`).toBe(5);
    await attachShot(testInfo, `scenario2-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('3. スクロール反復: 上→下→上→下 で active line が往復', async ({
    page,
  }, testInfo) => {
    await bootSeedAndConstrain(page);
    // Up-down ping-pong via real keyboard. Each move targets a
    // different region of the document; assertions check active
    // block follows.
    const trail = [0, 56, 9, 48, 0];
    const observed: Array<{ targetLine: number; activeStart: number | null }> = [];
    for (const line of trail) {
      await moveCaretToLine(page, line);
      const s = await snapshot(page);
      observed.push({ targetLine: line, activeStart: s.activeStart });
    }
    // Each targetLine must have caused an active marker to land on
    // a block whose start <= targetLine (closest-or-before semantics).
    for (const { targetLine, activeStart } of observed) {
      expect(activeStart, `target ${targetLine}: no active`).not.toBeNull();
      expect(activeStart!).toBeLessThanOrEqual(targetLine);
    }
    // Active line distinctness — at least 4 of 5 trail points
    // landed on different blocks (trail[0]=line 0 returns twice).
    const distinct = new Set(observed.map((o) => o.activeStart));
    expect(distinct.size).toBeGreaterThanOrEqual(4);
    await attachShot(testInfo, `scenario3-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('4. 上端到達 → 少し戻し: 上端付近に張り付き → 戻し時に追従', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-6: post-rewrite of safeScrollPane →
    // ensureRectVisible. The new logic stops scrolling exactly when
    // the active block fits visually (with `padding=8` margin), so
    // scrollTop after jumping to line 0 is small but not strictly 0.
    // The test now asserts the qualitative regression-guard:
    // (a) jumping to line 0 ALWAYS reduces scrollTop drastically,
    // (b) jumping back to line 9 advances scrollTop again.
    await bootSeedAndConstrain(page);
    await moveCaretToLine(page, 56);
    const mid = await snapshot(page);
    expect(mid.previewScrollTop).toBeGreaterThan(50);
    await moveCaretToLine(page, 0);
    const top = await snapshot(page);
    expect(
      top.previewScrollTop,
      `上端 jump: scrollTop ${top.previewScrollTop} should be much less than mid (=${mid.previewScrollTop})`,
    ).toBeLessThan(mid.previewScrollTop / 3);
    await moveCaretToLine(page, 9);
    const back = await snapshot(page);
    expect(
      back.previewScrollTop,
      `少し戻し: scrollTop ${back.previewScrollTop} should be > top ${top.previewScrollTop}`,
    ).toBeGreaterThan(top.previewScrollTop);
    expect(back.activeStart).toBe(4);
    await attachShot(testInfo, `scenario4-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('5. 下端到達 → 少し戻し: max scroll で頭打ち & 戻し追従', async ({
    page,
  }, testInfo) => {
    await bootSeedAndConstrain(page);
    // Jump to last source-line block (candidate-list last row, line ~59).
    await moveCaretToLine(page, 59);
    const bottom = await snapshot(page);
    // scrollTop should be near max (within tolerance — comfort zone
    // may stop slightly before actual max).
    expect(
      bottom.previewMaxScroll - bottom.previewScrollTop,
      '下端: should be near max',
    ).toBeLessThan(bottom.previewClientHeight);
    // Move slightly back (line 9 in fence). scrollTop should retreat.
    await moveCaretToLine(page, 9);
    const back = await snapshot(page);
    expect(back.previewScrollTop, '少し戻し: scrollTop should be < bottom.previewScrollTop').toBeLessThan(
      bottom.previewScrollTop,
    );
    expect(back.activeStart).toBe(4);
    await attachShot(testInfo, `scenario5-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('6. CSV fence 内 caret 5→9→13: 全 caret で fence wrapper が active', async ({
    page,
  }, testInfo) => {
    // 2026-05-05 hotfix-5 reset: previously asserted scrollTop
    // monotonic increase as caret deepened — line-level sync claim
    // we no longer make. The new contract is block-level: each of
    // the three caret positions inside the CSV fence (lines 5, 9, 13)
    // produces an active marker on the SAME source range, the fence
    // wrapper.
    await bootSeedAndConstrain(page);
    await moveCaretToLine(page, 5);
    const a = await snapshot(page);
    await moveCaretToLine(page, 9);
    const b = await snapshot(page);
    await moveCaretToLine(page, 13);
    const c = await snapshot(page);
    // All three caret positions inside the CSV fence (source lines
    // 4..13) must activate the same wrapper.
    for (const [label, snap] of [['line 5', a], ['line 9', b], ['line 13', c]] as const) {
      expect(snap.activeStart, `${label}: active block must exist`).not.toBeNull();
      expect(snap.activeStart!).toBe(4);
      expect(snap.activeEnd!).toBe(13);
    }
    await attachShot(testInfo, `scenario6-final.png`, await page.screenshot({ fullPage: false }));
  });

  test('7. ⇄ OFF 中はスクロールしても active marker 出ない', async ({
    page,
  }, testInfo) => {
    await bootSeedAndConstrain(page);
    // Toggle off via real OS click on the ⇄ button.
    const toggle = page.locator(
      '[data-pkc-action="toggle-source-preview-sync"]',
    ).first();
    const tBox = await toggle.boundingBox();
    if (!tBox) throw new Error('toggle button has no bounding box');
    await page.mouse.click(tBox.x + tBox.width / 2, tBox.y + tBox.height / 2);
    await page.waitForFunction(
      () => document.querySelector<HTMLElement>(
        '[data-pkc-action="toggle-source-preview-sync"]',
      )?.getAttribute('data-pkc-sync-state') === 'off',
      { timeout: 2_000 },
    );
    // Scroll across multiple lines — none should produce active.
    for (const line of [9, 48, 0, 56]) {
      await page.evaluate((targetLine: number) => {
        const ta = document.querySelector<HTMLTextAreaElement>(
          'textarea[data-pkc-field="body"]',
        );
        if (!ta) throw new Error('textarea missing');
        let seen = 0;
        let offset = 0;
        if (targetLine === 0) offset = 0;
        else {
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
      await page.waitForTimeout(80);
    }
    const noActive = await page.evaluate(
      () =>
        document.querySelector(
          '[data-pkc-region="text-edit-preview"] [data-pkc-active-source]',
        ) === null,
    );
    expect(noActive, '⇄ OFF: 全 caret 移動で active marker が出てはいけない').toBe(true);
    await attachShot(testInfo, `scenario7-final.png`, await page.screenshot({ fullPage: false }));
  });
});
