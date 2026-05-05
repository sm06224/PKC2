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

const REAL_CONTENT = `1. ddd
2. aaa
3. ddd

\`\`\`csv
緯度,経度,店名,紹介文,住所,電話番号,営業時間,テイクアウト営業時間,ジャンル,価格帯,支払い方法,Instagram,Twitter,公式サイト
33.483795,135.783559,M's cafe & dining,チキンカレーとお弁当販売しております。　お電話でご予約くださいませ。,和歌山県東牟婁郡串本町サンゴ台1107-10,0735-67-7190,11:00 - 16:00  /  11:00 - 14:00 / 18:30 - (現在はコロナ収束まで予約のみの営業),, イタリアン、創作居酒屋、cafe,"昼 400円〜1,200円  夜 1,000円〜4,000円", 現金、クレジットカード、PayPay,mscafeanddining,,
33.484055,135.789384,Sea side bal Nansea's,当店人気のピザとパスタなどがテクアウト可能です。是非おこしくださいませ。　,和歌山東牟婁郡串本町くじの川1293-7,0735-67-7744,11:30 - 14:00 / 17:00 - 21:00 (ラストオーダーは30分前まで),11:30 - 14:00 / 17:00 - 21:00 (ラストオーダーは30分前まで),イタリアン,1000～,現金、各種カード、paypay可,nanseas_kushimoto,,
33.475598,135.783387,タイヨウのカフェ,ケバブライス　トルコのピザ「ピデ」も人気です。　オードブルもご予約可能です。,和歌山県東牟婁郡串本町2079-2,070 3317 4075,10:00 - 19:00 ,10:00-19:00,ブックカフェ,800-1000,現金、エアペイ取扱い各種,taiyocafe,nazar_kcr,http://kcrjp.com/taiyocafe/
33.484538,135.790345,ビーチハウス・ラパン,お弁当500円　配達も致します。　前日までにご予約くださいませ。,和歌山県東牟婁郡串本町くじの川1597,090-3356-8305,9:00 - 17:00,前日予約　,お弁当,500円～800円,現金/PayPay,,,http://cafe-lapin-2014.sakura.ne.jp/
33.484878,135.790012,焼肉 蓮,焼肉連のお肉がお弁当になりました。　,和歌山県東牟婁郡串本町くじの川1294-2,0735-62-5084,11:30 - 14:00 17:00 - 21:30 （ラストオーダーは30分前まで）,,焼肉店,昼1100円〜1500円,現金のみ,mkplanningco,,
33.469669,135.778833,手作り弁当　銀座屋,いつも日替わりでお弁当販売しております。　朝から,和歌山県東牟婁郡串本町串本８９１-3,080-1509-4667　（要予約）,9:00 - 15:00,9:00-15:00,お弁当　お惣菜,550円～,現金,,,
33.518221,135.826801,弁当たちばな,お弁当500円　オードブルもご予約可能です。　お電話で予約してくださいね。,和歌山県東牟婁郡串本町古座113,090-9881-3960　（要予約）,10:00 - 15:00,前日予約,お弁当　オードブル,弁当500円　　オードブル3000円～,現金,,,
\`\`\`

























# kokoko
sdsdf
ベースになっているHTMLは PKC2 のリードオンリーなエクスポートビューア。これを **「書き込める協業コンテナ」へ反転させる** のが今回のテーマ、と読んだ。自由発想で空間を広げてから推し案を主張する。

## 設計空間を切る3軸

| 軸 | 選択肢 |
|---|---|
| **AIとの結合度** | L0: コピペ往復 / L1: API直叩き(artifact内 \`window.claude\` 等)/ L2: MCP・Tool連携 |
| **状態の住処** | S1: HTMLファイル自身に内蔵(Save Asで自己更新)/ S2: localStorage・IndexedDB / S3: 外部JSONをimport/export |
| **使い方の比喩** | M1: ジャーナル(時系列追記)/ M2: ワークベンチ(対象別snapshot)/ M3: スキーマシート(JSON Schema駆動フォーム)/ M4: 協業ドキュメント(本文+AI注釈)/ M5: 自己改変HTML(AIがHTML自体を書き換え) |

## 候補5案

| # | 名前 | 結合 | 状態 | 比喩 | エッジ | リスク |
|---|---|---|---|---|---|---|
| 1 | **Self-Saving Log** | L0 | S1 | M1 | このエクスポートの「動く版」。コピペで対話を継ぎ足し、Save Asで自分を更新 | PKC本体と機能被り |
| 2 | **Snapshot Workbench** | L0/L1 | S1+S2 | M2 | Stock-Extension案の単一HTML版。観測対象ごとにsnapshot生成→AI応答パース→履歴蓄積 | スキーマ設計が重い |
| 3 | **Schema Sheet** | L1 | S2 | M3 | JSON Schema駆動の構造化フォーム。AI出力を必ずschemaに矯正 | API前提でオフライン弱い |
| 4 | **Living Doc** | L1 | S1 | M4 | 段落を選択→「AIに改稿/批評/補足」→注釈orリビジョンとして本文に書き戻し | 衝突解決UIが厄介 |
| 5 | **Self-Editing HTML** | L1 | S1 | M5 | AIに「このHTMLにこういうセクション追加して」と指示、diffを取り込んで自分自身を書き換える | 構文壊れリスク、git diffが暴れる |
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
      // The "## 候補5案" table starts around line 60+ of the source.
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
    //   - line 36+ : 見出し / paragraph / 候補5案 table
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
      34,   // # kokoko
      37,   // ## 設計空間を切る3軸
      40,   // table row in 設計空間 table
      45,   // empty line before 候補5案
      48,   // 候補5案 table row 1
      51,   // 候補5案 table row 4
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

  test('診断: 候補5案 table の各行を click → caret jump が行ごとに違うべき', async ({
    page,
  }) => {
    await bootAndOpenTextEditor(page);
    await seedRealContent(page);

    // The "候補5案" table has 5 data rows. Click each row's center
    // and read where the caret landed. EXPECTATION: each row click
    // jumps to a DIFFERENT source line. CURRENT BUG (predicted):
    // all clicks land on table_open's source line because tr_open
    // is not in SOURCE_LINE_TOKEN_TYPES — so the closest anchored
    // ancestor is the table wrapper, not the row.
    // CSV fence(B-1 機能)も `<table>` として render されるので、
    // preview 内 `table` の DOM 順は CSV / 設計空間 / 候補5案 の 3 個。
    // `## 候補5案` heading を起点に、その後ろにある最初の table の
    // tbody tr の数を確認。
    const rowCount = await page.evaluate(() => {
      const headings = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-pkc-region="text-edit-preview"] h2',
        ),
      );
      const heading = headings.find((h) => h.textContent?.includes('候補5案'));
      if (!heading) throw new Error('候補5案 heading not found');
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
      if (!table) throw new Error('table after 候補5案 heading not found');
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
        const heading = headings.find((h) => h.textContent?.includes('候補5案'));
        if (!heading) throw new Error('候補5案 heading not found');
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
        if (!table) throw new Error('table after 候補5案 heading not found');
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
    console.log('=== 候補5案 table row click → caret line ===');
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
