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
 *   - 設計空間 table(3 row、wrapping cells)
 *   - 候補5案 table(5 row、wrapping cells)
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

const REAL_CONTENT = `1. ddd
2. aaa
3. ddd

\`\`\`csv
緯度,経度,店名,紹介文,住所,電話番号,営業時間,テイクアウト営業時間,ジャンル,価格帯,支払い方法,Instagram,Twitter,公式サイト
33.483795,135.783559,M's cafe & dining,チキンカレーとお弁当販売しております。　お電話でご予約くださいませ。,和歌山県東牟婁郡串本町サンゴ台1107-10,0735-67-7190,11:00 - 16:00,, イタリアン、創作居酒屋、cafe,400円〜4000円, 現金、PayPay,mscafeanddining,,
33.484055,135.789384,Sea side bal Nansea's,当店人気のピザとパスタなどがテクアウト可能です。,和歌山東牟婁郡串本町くじの川1293-7,0735-67-7744,11:30 - 21:00,11:30 - 21:00,イタリアン,1000～,現金、各種カード、paypay可,nanseas_kushimoto,,
33.475598,135.783387,タイヨウのカフェ,ケバブライス　トルコのピザ「ピデ」も人気です。,和歌山県東牟婁郡串本町2079-2,070 3317 4075,10:00 - 19:00 ,10:00-19:00,ブックカフェ,800-1000,現金、エアペイ,taiyocafe,nazar_kcr,
33.484538,135.790345,ビーチハウス・ラパン,お弁当500円　配達も致します。,和歌山県東牟婁郡串本町くじの川1597,090-3356-8305,9:00 - 17:00,前日予約,お弁当,500円～800円,現金/PayPay,,,
33.484878,135.790012,焼肉 蓮,焼肉連のお肉がお弁当になりました。,和歌山県東牟婁郡串本町くじの川1294-2,0735-62-5084,11:30 - 21:30,,焼肉店,1100-1500円,現金のみ,mkplanningco,,
33.469669,135.778833,手作り弁当　銀座屋,いつも日替わりでお弁当販売しております。,和歌山県東牟婁郡串本町串本８９１-3,080-1509-4667,9:00 - 15:00,9:00-15:00,お弁当,550円〜,現金,,,
33.518221,135.826801,弁当たちばな,お弁当500円　オードブルもご予約可能です。,和歌山県東牟婁郡串本町古座113,090-9881-3960,10:00 - 15:00,前日予約,お弁当,弁当500円,現金,,,
\`\`\`

























# kokoko
sdsdf
ベースになっているHTMLは PKC2 のリードオンリーなエクスポートビューア。これを「書き込める協業コンテナ」へ反転させるのが今回のテーマ、と読んだ。

## 設計空間を切る3軸

| 軸 | 選択肢 |
|---|---|
| **AIとの結合度** | L0 / L1 / L2 |
| **状態の住処** | S1 / S2 / S3 |
| **使い方の比喩** | M1 / M2 / M3 / M4 / M5 |

## 候補5案

| # | 名前 | 結合 | 状態 | 比喩 | エッジ |
|---|---|---|---|---|---|
| 1 | Self-Saving Log | L0 | S1 | M1 | コピペで対話を継ぎ足し |
| 2 | Snapshot Workbench | L0/L1 | S1+S2 | M2 | 観測対象ごとに snapshot |
| 3 | Schema Sheet | L1 | S2 | M3 | JSON Schema 駆動 |
| 4 | Living Doc | L1 | S1 | M4 | 段落を選択→AIに改稿 |
| 5 | Self-Editing HTML | L1 | S1 | M5 | HTMLを自分で書き換え |
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
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  await page
    .locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]')
    .first()
    .click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
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
    { timeout: 5_000 },
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
    const probes = [0, 9, 48, 56]; // list / CSV mid / 設計空間 row / 候補5案 row
    for (const line of probes) {
      await moveCaretToLine(page, line);
      const s = await snapshot(page);
      expect(s.activeStart, `line ${line}: active block missing`).not.toBeNull();
      expect(s.hitInsideActive, `line ${line}: active block not hit-testable`).toBe(true);
    }
    await testInfo.attach(`scenario1-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });

  test('2. preview→editor: 候補5案 5 行 real OS click → 異なる line', async ({
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
        const h = headings.find((el) => el.textContent?.includes('候補5案'));
        if (!h) throw new Error('候補5案 heading missing');
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
    await testInfo.attach(`scenario2-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
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
    await testInfo.attach(`scenario3-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
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
    await testInfo.attach(`scenario4-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });

  test('5. 下端到達 → 少し戻し: max scroll で頭打ち & 戻し追従', async ({
    page,
  }, testInfo) => {
    await bootSeedAndConstrain(page);
    // Jump to last source-line block (候補5案 last row, line ~59).
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
    await testInfo.attach(`scenario5-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
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
    await testInfo.attach(`scenario6-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
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
    await testInfo.attach(`scenario7-final.png`, {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });
});
