/**
 * Visual verification harness — long markdown, 320×320 constrained
 * panes so editor + preview both overflow significantly. Each
 * scenario writes a screenshot under
 * `test-results/visual-check/L<n>-*.png`. **No assertions** — this
 * is a deliberate eyes-on artefact harness for reviewers.
 *
 * 2026-05-05 hotfix-6 / hotfix-7 user directions:
 *   - 「縦に大きくスクロールするマークダウンを使用しないのか?
 *      可視エリアと不可視エリアが発生しないデータでは、今回の
 *      機能はテストできていないと判断」 (this spec exists)
 *   - 「ハイライト時にオーバーレイが可視範囲に来るように自動
 *      スクロール」 (L3 / L4 / L6 / L7 cover this)
 *   - 「ブロック同期動作自体はボタン押下時に有効化してオプト
 *      イン設計に」 (L1 covers OFF state, L2-L8 cover ON)
 *   - 「プレビュー側の表とコードブロックをクリックした時に
 *      ホバーかPiPで開く動作」 (L8 — table click → no modal)
 *
 * Reading checklist for the screenshots:
 *   L1: opt-in OFF — neither pane shows highlight even after
 *       repeated wheel scroll.
 *   L2: caret on line 0 — both panes scrolled to top, both show
 *       L0 badge on the same heading.
 *   L3-L4: caret deep in doc — preview scrolled, both panes show
 *       the SAME L<n> on the active block.
 *   L5: caret moves WITHIN the same block — preview scroll does
 *       not jitter (in-view → no-op).
 *   L6: click the bottom-most block in preview — editor scrolls
 *       so the corresponding caret row is in view.
 *   L7: caret deep in fence — fence wrapper highlighted with
 *       its start-line label, both panes match.
 *   L8: table row click — wrapper gets the highlight (delegated
 *       from <tr> per CSS scope), no PiP modal opens.
 */

import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT_DIR = 'test-results/visual-check';
mkdirSync(OUT_DIR, { recursive: true });

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage: false });
}

/** 長大 markdown fixture — reproduces the kind of conversation log
 * the user has been pasting. ~120 source lines, mixed structure
 * (heading / para / table / fence / list) so block-level scroll
 * is exercised. */
const LONG_MD = `# 領域 10-1 同期スクロール機能 — 議論ログ

## 経緯

ユーザーから 2026-05-05 に Split View 同期機能の再実装を依頼された。
過去 PR #206 で行レベル同期を試みたが N:M 問題で保留(\`pr-206-paused.md\`)。
今回は block-level 対応 + IR 別 wave という方針で着手する。

## 主な要件

| # | 要件 | 状態 |
|---|---|---|
| 1 | block 単位の対応関係明示 | 着地 |
| 2 | caret 自動スクロール(両方向) | 着地 |
| 3 | opt-in 設計 | 着地 |
| 4 | table layout 崩壊しない | 着地 |
| 5 | preview chrome 不活化 | 着地 |

## 議論抜粋

### Round 1 — 「同期スクロール」呼称撤回

> User: 「同期機能の認識が私と違うようだ。私はこれを同期スクロールとは思わない」
>
> Claude: 行レベル一致は markdown 仕様上の N:M 関係で原理的に不能、と整理。
> 「block 対応ハイライト」呼称に変更。

### Round 2 — caret auto-scroll の追加

> User: 「αで、ただしハイライト時にオーバーレイが可視範囲に来るように
> 自動スクロールしてください」
>
> Claude: \`ensureCaretVisibleInEditor\` を実装、syncPreviewToCaret から呼ぶ。
> caret が view 外なら editor を必要量だけスクロール。

### Round 3 — chrome 不活化漏れの修正

> User: 「プレビュー側の表とコードブロックをクリックした時にホバーか
> PiP で開く動作がまだ活きています。これは不活化漏れですか?」
>
> Claude: handleMediaViewerOpen / handleTableSortClick /
> handleTableFilterToggle / handleTableFilterInput の 4 handler に
> \`if (target.closest('.pkc-text-edit-preview')) return;\` gate を追加。

### Round 4 — opt-in 設計

> User: 「ブロック同期動作自体はボタン押下時に有効化してオプトイン
> 設計にして」
>
> Claude: defaultSyncEnabled を撤回、初期状態 OFF。⇄ ボタン押下で
> ON 化、localStorage に永続。

### Round 5 — minimum-amount scroll 統一

> User: 「編集側で選択した行に対応してプレビュー側をマーカーする時、
> 可視エリア外にプレビュー側が存在する場合は、プレビュー側を必要量
> スクロールして可視エリア内に持ってきて」
> 「逆にプレビュー側を選択した場合は、編集側を可視エリア内に持って
> きて欲しい」
>
> Claude: safeScrollPane を撤回、ensureRectVisible に統一。

## 技術詳細

### ensureRectVisible

\`\`\`ts
function ensureRectVisible(
  scrollContainer: HTMLElement,
  rect: { top: number; bottom: number },
  padding: number,
): void {
  const containerRect = scrollContainer.getBoundingClientRect();
  const visTop = containerRect.top + scrollContainer.clientTop;
  const visBottom = visTop + scrollContainer.clientHeight;
  const maxScroll = Math.max(
    0,
    scrollContainer.scrollHeight - scrollContainer.clientHeight,
  );
  if (rect.top < visTop + padding) {
    const delta = (visTop + padding) - rect.top;
    const next = Math.max(0, scrollContainer.scrollTop - delta);
    if (next !== scrollContainer.scrollTop) {
      markProgrammaticScroll();
      scrollContainer.scrollTop = next;
    }
    return;
  }
  if (rect.bottom > visBottom - padding) {
    const delta = rect.bottom - (visBottom - padding);
    const next = Math.min(maxScroll, scrollContainer.scrollTop + delta);
    if (next !== scrollContainer.scrollTop) {
      markProgrammaticScroll();
      scrollContainer.scrollTop = next;
    }
  }
}
\`\`\`

### blockMeasureRect

active block の inner rect を返す。pkc-md-block wrapper の場合は
inner pre / table を測る。padding 込みの outer ではなく content
edge を target にすることで、auto-scroll がユーザー目線で「正しい」
位置に来る。

\`\`\`ts
function blockMeasureRect(block: HTMLElement): DOMRect {
  if (block.classList.contains('pkc-md-block')) {
    const inner = block.querySelector<HTMLElement>('pre, table');
    if (inner) return inner.getBoundingClientRect();
  }
  return block.getBoundingClientRect();
}
\`\`\`

## 残課題

- [ ] preview badge が paragraph 1 文字目を遮蔽
- [ ] editor overlay と preview badge の L 番号がズレる(table 等で)
- [ ] table row click で preview 側 highlight 消失

## 候補リスト

| 案 | 結合 | 状態 | 比喩 |
|---|---|---|---|
| 1 | Self-Saving Log | L0 | M1 |
| 2 | Snapshot Workbench | L0/L1 | M2 |
| 3 | Schema Sheet | L1 | M3 |
| 4 | Living Doc | L1 | M4 |
| 5 | Self-Editing HTML | L1 | M5 |

## 業界事例(2026-05-05 Agent 調査)

VS Code 内蔵 Markdown Preview は markdown-it に \`pluginSourceMap\` を
入れて全 block token に \`data-line\` 属性を付与する。preview 側は
この属性を持つ DOM を「アンカー候補」として binary search、
viewport 上端の最も近い 2 element の比率内挿で line を計算する。

Joplin は「percent of line number」モデル。両 pane の scroll を
percentage 単位で結ぶ。

Codebraid Preview は Pandoc AST sourcepos を直接 \`data-pos\` 属性
として書き出し、IntersectionObserver で「現在 viewport に visible
な data-pos 要素」を検出する宣言的アプローチ。

\`\`\`bash
# 実装サイズ感(VS Code 写経の場合)
# pluginSourceMap         30 分
# getCodeLineElements     1 時間
# getElementsForSourceLine 30 分
# pkc-md-active-line CSS  30 分
# scrollIntoView 適用      1 時間
# scrollDisabledCount      1 時間
# isVisible 写経           30 分
# parity test              2 時間
# 計 7-8 時間
\`\`\`

これで 1 PR 着地サイズ。

## まとめ

PKC2 の現状方針は業界 de facto standard と一致。N:M 問題は誰も解いて
いない。block-level でいったん着地し、IR(領域 10-3)で次の wave へ。
`;

async function bootEdit(page: Page, syncOn: boolean): Promise<void> {
  if (syncOn) {
    await page.addInitScript(() => {
      try { window.localStorage.setItem('pkc2.split-sync-enabled', 'true'); } catch { /* noop */ }
    });
  } else {
    await page.addInitScript(() => {
      try { window.localStorage.removeItem('pkc2.split-sync-enabled'); } catch { /* noop */ }
    });
  }
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  await page.locator('#pkc-root[data-pkc-phase="ready"]').first().waitFor({ timeout: 15_000 });
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await page.locator('#pkc-root[data-pkc-phase="editing"]').first().waitFor({ timeout: 5_000 });
  await page.evaluate((body) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    ta.value = body;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    // Constrain heights so overflow is OBSERVABLE — both editor and
    // preview must scroll vertically. Without this, the test seeds
    // a long doc but the panes grow to fit and ensureRectVisible
    // never fires.
    ta.style.height = '320px';
    ta.style.maxHeight = '320px';
    const preview = document.querySelector<HTMLElement>(
      '[data-pkc-region="text-edit-preview"]',
    );
    if (preview) {
      preview.style.height = '320px';
      preview.style.maxHeight = '320px';
    }
  }, LONG_MD);
  await page.waitForTimeout(800); // debounced re-render
}

async function caretToLine(page: Page, line: number): Promise<void> {
  await page.evaluate((targetLine: number) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    if (!ta) return;
    let pos = 0, seen = 0;
    if (targetLine > 0) {
      for (let i = 0; i < ta.value.length; i++) {
        if (ta.value.charCodeAt(i) === 10) {
          seen++;
          if (seen === targetLine) { pos = i + 1; break; }
        }
      }
    }
    ta.focus();
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
  }, line);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(220);
}

async function readScroll(page: Page): Promise<{ ed: number; pv: number; edMax: number; pvMax: number }> {
  return page.evaluate(() => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    return {
      ed: ta?.scrollTop ?? -1,
      pv: pv?.scrollTop ?? -1,
      edMax: (ta?.scrollHeight ?? 0) - (ta?.clientHeight ?? 0),
      pvMax: (pv?.scrollHeight ?? 0) - (pv?.clientHeight ?? 0),
    };
  });
}

test.describe.configure({ mode: 'serial' });

test('L1 long-md: opt-in OFF — どのくらい scroll しても overlay 出ない', async ({ page }) => {
  await bootEdit(page, false);
  // Scroll editor down using real wheel events. Caret hasn't moved
  // (still at 0). Overlay must stay hidden because sync is OFF.
  const ta = page.locator('textarea[data-pkc-field="body"]').first();
  await ta.click();
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 80);
    await page.waitForTimeout(50);
  }
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L1 OFF after wheels: ed=', sc.ed, '/ max', sc.edMax, ' pv=', sc.pv);
  await shot(page, 'L1-opt-in-OFF-after-scroll');
});

test('L2 long-md: ⇄ ON 後 caret line 0 — preview は top に居る', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 0);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L2 caret 0: ed=', sc.ed, ' pv=', sc.pv, '/ max', sc.pvMax);
  await shot(page, 'L2-line-0-both-top');
});

test('L3 long-md: caret line 50 — preview が大きく down scroll', async ({ page }) => {
  await bootEdit(page, true);
  // First go to top
  await caretToLine(page, 0);
  const before = await readScroll(page);
  // Then jump to a deep block (line 50 is somewhere in the middle)
  await caretToLine(page, 50);
  const after = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L3 caret 0→50: ed', before.ed, '→', after.ed, '  pv', before.pv, '→', after.pv, '/ max', after.pvMax);
  await shot(page, 'L3-line-50-preview-scrolled-down');
});

test('L4 long-md: caret line 100 — preview ほぼ最下端まで scroll', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 100);
  const sc = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L4 caret 100: ed=', sc.ed, '/', sc.edMax, '  pv=', sc.pv, '/', sc.pvMax);
  await shot(page, 'L4-line-100-near-bottom');
});

test('L5 long-md: caret line 50 → line 51(同 block 内) — preview は再 scroll しない', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 50);
  const a = await readScroll(page);
  await shot(page, 'L5a-line-50');
  await caretToLine(page, 51);
  const b = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L5 caret 50→51: pv', a.pv, '→', b.pv, ' (should be unchanged or near)');
  await shot(page, 'L5b-line-51-preview-unchanged');
});

test('L6 long-md: preview の最下方 block を click → editor が大きく down scroll', async ({ page }) => {
  await bootEdit(page, true);
  // Caret at 0 first
  await caretToLine(page, 0);
  const before = await readScroll(page);
  // Click a block far down in preview
  const center = await page.evaluate(() => {
    const pv = document.querySelector<HTMLElement>('[data-pkc-region="text-edit-preview"]');
    if (!pv) return null;
    // Pick the LAST anchored block in DOM order = bottom of doc
    const all = pv.querySelectorAll<HTMLElement>('[data-pkc-source-line]');
    if (all.length === 0) return null;
    const last = all[all.length - 1]!;
    last.scrollIntoView({ block: 'center' });
    const r = last.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!center) return;
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  const after = await readScroll(page);
  // eslint-disable-next-line no-console
  console.log('L6 click last-block: ed', before.ed, '→', after.ed, '/', after.edMax);
  await shot(page, 'L6-click-bottom-editor-scrolled');
});

test('L7 long-md: caret in long fence (line 80) — fence wrapper が active に', async ({ page }) => {
  await bootEdit(page, true);
  await caretToLine(page, 80);
  await shot(page, 'L7-caret-in-fence');
});

test('L8 long-md: preview の table row を click — chrome 開かず caret jump', async ({ page }) => {
  await bootEdit(page, true);
  // Click a data row in the candidates table (line ~108-112)
  const center = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-pkc-region="text-edit-preview"] h2'
    ));
    const h = headings.find((el) => el.textContent?.includes('候補リスト'));
    if (!h) return null;
    let cur: Element | null = h;
    while (cur) {
      cur = cur.nextElementSibling;
      if (!cur) break;
      const t = cur.tagName === 'TABLE' ? cur as HTMLTableElement : cur.querySelector?.('table') ?? null;
      if (t) {
        const rows = t.querySelectorAll<HTMLTableRowElement>('tbody tr');
        const row = rows[2]; // 3rd row
        if (!row) return null;
        row.scrollIntoView({ block: 'center' });
        const r = row.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  });
  if (!center) return;
  await page.mouse.click(center.x, center.y);
  await page.waitForTimeout(300);
  const modalOpen = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>('[data-pkc-region="media-viewer-backdrop"]');
    return !!b && b.hidden === false;
  });
  // eslint-disable-next-line no-console
  console.log('L8 table row click: modalOpen=', modalOpen);
  await shot(page, 'L8-table-row-clicked-no-modal');
});
