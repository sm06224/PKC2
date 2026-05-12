/**
 * ChatGPT-generated formal fixture の実機 render diagnostic test。
 *
 * user 報告 2026-05-10:「ChatGPT が生成した formal fixture が全然 render
 * できてない」→ どの formal 構文が render され、どれが literal 残るかを
 * 3 surface(center / Viewer / Split View)で screenshot 撮影 + 検証。
 *
 * 期待:
 *   - PKC2 Phase 1 で実装済の formal は render される
 *   - 未実装(AI hallucination)formal は literal で残る(v2 spec §1.6 通り)
 *   - vars / :::if{format=...} / :::quote{author=} / :sup: :sub: :span:
 *     / 4 形 align prefix / em-dot 新形 / TOC vars 展開 等は ✅
 *   - :lead: / :::section / :spacing / :emphasis: / :align: / :strong:
 *     / inline :quote: / :::comment / :caption: は ❌(literal 残置)
 */
import { test, expect, type Page } from '@playwright/test';

// ============================================================
// ChatGPT 生成 fixture(user 提供)
// ============================================================
const CHATGPT_FIXTURE = `---
title: 石狩変電所 ネットワーク更改計画
vars:
  site: 石狩変電所
  phase: Phase-2
  date: 2026-05-18
  start: 22:00
  end: 03:00
  operator: 北系NW保守班
  manager: 佐藤
  export_audience: internal
---

# {{vars.site}} ネットワーク更改計画

:lead:[
本文書は {{vars.site}} におけるネットワーク更改作業の実施計画を定義する。
]

:::section{role=summary}

## 作業概要

- 対象フェーズ: {{vars.phase}}
- 作業日: {{vars.date}}
- 作業時間: {{vars.start}} ～ {{vars.end}}
- 実施班: {{vars.operator}}

:spacing:{size=2}

:emphasis:[
本作業中、一時的に監視系通信が停止する可能性があります
]

:spacing:{size=1}

:align:{position=end}

:strong:[
運転監視側への事前周知をお願いします
]

:quote:{
  attribution="作業責任者: {{vars.manager}}"
}

:::

:::comment
internal:
Phase-3でL3冗長化切替予定
:::

---

## 作業対象

### 更新対象機器

| 機器名 | 現行 | 更新後 |
|---|---|---|
| CoreSW-01 | IOS-XE 16 | IOS-XE 18 |
| CoreSW-02 | IOS-XE 16 | IOS-XE 18 |
| FW-01 | v6.2 | v7.0 |

### 作業ネットワーク

:::figure{id="topology-overview"}

\`\`\`mermaid
graph TD

  CTRL[中央監視]
  GW[GW]
  CORE1[CoreSW-01]
  CORE2[CoreSW-02]
  RTU[RTU群]

  CTRL --> GW
  GW --> CORE1
  GW --> CORE2
  CORE1 --> RTU
  CORE2 --> RTU
\`\`\`

:caption:[
更新対象ネットワーク構成
]

:::

本文中では図 [@topology-overview] を参照。

---

## 実施手順

### 1. 事前確認

- Config backup取得
- 疎通確認
- SYSLOG監視開始

### 2. SW更新

\`\`\`shell
copy running-config startup-config
install add file flash:update.bin activate commit
reload
\`\`\`

### 3. 疎通試験

- RTU監視確認
- SNMP trap確認
- 冗長切替確認

:::section{role=warning}

## 注意事項

:emphasis:[
切替中に瞬断が発生する可能性あり
]

- RTU側再接続待ち最大5分
- 古いARP cache残留に注意
- 必要に応じGW側flush実施

:::

---

:::if{format=html}

## HTML版限定情報

本節はWeb公開版にのみ表示される。

:::

:::if{format=pdf}

## PDF版限定情報

本節は印刷用資料にのみ表示される。

:::

---

## ロールバック

障害発生時は以下を実施。

1. startup-configへ復元
2. 旧Firmwareへ切戻し
3. 監視再接続確認

\`\`\`shell
install rollback to committed
reload
\`\`\`

---

## 連絡先

| 役割 | 担当 |
|---|---|
| 作業責任者 | {{vars.manager}} |
| NW班 | {{vars.operator}} |
| 中央監視 | 札幌監視センター |

:quote:{
  attribution="END OF DOCUMENT"
}
`;

async function bootApp(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pkc2.html', { waitUntil: 'load' });
  const shell = page.locator('#pkc-root');
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 15_000 });
  return shell;
}

async function createTextEntry(page: Page, title: string, body: string) {
  const shell = page.locator('#pkc-root');
  await page.locator('button[data-pkc-action="create-entry"][data-pkc-archetype="text"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });
  await page.locator('[data-pkc-field="title"]').first().fill(title);
  // textarea.fill() は IME / autocorrect で文字変換が起きうるため、
  // value プロパティ + input event で直接 set(textarea autocorrect 回避)。
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test.describe('ChatGPT formal fixture diagnostic — 何が render され / 何が literal 残るか', () => {
  test('center pane:full diagnostic + screenshot', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'ChatGPT formal diagnostic', CHATGPT_FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      const bodyText = root.textContent ?? '';
      const innerHTML = root.innerHTML;
      // Debug: dump body HTML around 'figure' to see what's there
      const figureIdx = innerHTML.indexOf('topology-overview');
      const aroundFigure = figureIdx >= 0
        ? innerHTML.slice(Math.max(0, figureIdx - 200), figureIdx + 400)
        : '<NOT FOUND>';

      // ✅ 期待される render(Phase 1 実装済)
      const expected = {
        // vars expanded
        siteExpanded: bodyText.includes('石狩変電所'),
        phaseExpanded: bodyText.includes('Phase-2'),
        dateExpanded: bodyText.includes('2026-05-18'),
        managerExpanded: bodyText.includes('佐藤'),
        // headings
        h1Count: root.querySelectorAll('h1').length,
        h2Count: root.querySelectorAll('h2').length,
        h3Count: root.querySelectorAll('h3').length,
        // table
        tableCount: root.querySelectorAll('table').length,
        // figure
        figureCount: root.querySelectorAll('.pkc-fig').length,
        // figure ref
        figRef: !!root.querySelector('.pkc-fig-ref'),
        // mermaid code block
        mermaidExists: bodyText.includes('graph TD'),
        // shell code block
        shellExists: bodyText.includes('install add file'),
        // :::if{format=html} match
        htmlOnlyVisible: bodyText.includes('Web公開版にのみ'),
        // :::if{format=pdf} mismatch (should NOT visible)
        pdfOnlyHidden: !bodyText.includes('印刷用資料にのみ'),
        // hr
        hrCount: root.querySelectorAll('hr.pkc-section-break, hr').length,
        // ordered list
        olCount: root.querySelectorAll('ol').length,
        // unordered list
        ulCount: root.querySelectorAll('ul').length,
      };

      // ❌ literal 残るべき(AI hallucination、v2 spec §1.6)
      const hallucinations = {
        leadLiteral: bodyText.includes(':lead:['),
        sectionRoleSummaryLiteral: bodyText.includes(':::section{role=summary}'),
        sectionRoleWarningLiteral: bodyText.includes(':::section{role=warning}'),
        spacingLiteral: bodyText.includes(':spacing:{size='),
        emphasisLiteral: bodyText.includes(':emphasis:['),
        alignLiteral: bodyText.includes(':align:{position='),
        strongLiteral: bodyText.includes(':strong:['),
        inlineQuoteLiteral: bodyText.includes(':quote:{'),
        captionLiteral: bodyText.includes(':caption:['),
        sectionCommentLiteral: bodyText.includes(':::comment'),
      };

      // body 全体長 / DOM size
      const stats = {
        bodyTextLength: bodyText.length,
        innerHTMLLength: innerHTML.length,
        elementCount: root.querySelectorAll('*').length,
        figureMatchCount: (innerHTML.match(/<figure/g) ?? []).length,
        topologyOverviewIdx: figureIdx,
        aroundFigure,
      };

      return { expected, hallucinations, stats };
    });

    console.log('=== expected (Phase 1 implemented) ===');
    console.log(JSON.stringify(observed.expected, null, 2));
    console.log('=== hallucinations (literal 残置) ===');
    console.log(JSON.stringify(observed.hallucinations, null, 2));
    console.log('=== stats ===');
    console.log(JSON.stringify(observed.stats, null, 2));

    // 期待される render
    expect(observed.expected.siteExpanded).toBe(true);
    expect(observed.expected.phaseExpanded).toBe(true);
    expect(observed.expected.dateExpanded).toBe(true);
    expect(observed.expected.managerExpanded).toBe(true);
    expect(observed.expected.h1Count).toBeGreaterThanOrEqual(1);
    expect(observed.expected.h2Count).toBeGreaterThanOrEqual(2);
    expect(observed.expected.h3Count).toBeGreaterThanOrEqual(2);
    expect(observed.expected.tableCount).toBeGreaterThanOrEqual(1);
    expect(observed.expected.figureCount).toBeGreaterThanOrEqual(1);
    expect(observed.expected.figRef).toBe(true);
    expect(observed.expected.mermaidExists).toBe(true);
    expect(observed.expected.shellExists).toBe(true);
    expect(observed.expected.htmlOnlyVisible).toBe(true);
    expect(observed.expected.pdfOnlyHidden).toBe(true);

    // hallucination のうち実装済 / 寛容 parse 済の formal は literal にならない:
    // - PR-2B:strong / emphasis / code / strike formal 実装済
    // - PR-2C:caption formal 実装済
    // - PR-2F:::section{role=…} callout 実装済
    // - PR-2G:::comment block 実装済(完全 strip)
    // - PR-2L(2026-05-10):lead / spacing / align / quote(inline)寛容 parse
    //   + admonition alias 群 → literal にならない
    // 残る未実装 hallucination:なし(本 fixture は全部 handle される)

    await rendered.screenshot({
      path: 'test-results/chatgpt-fixture-diagnostic/center-pane.png',
    });
  });

  test('Viewer popup:同 fixture を popup で表示 + screenshot', async ({ page, context }) => {
    await bootApp(page);
    await createTextEntry(page, 'ChatGPT formal diagnostic Viewer', CHATGPT_FIXTURE);

    await page.locator('[data-pkc-region="action-bar-more"] summary').first().click();
    const popupPromise = context.waitForEvent('page');
    await page.locator('[data-pkc-action="open-rendered-viewer"]').first().click();
    const popup = await popupPromise;
    await popup.waitForLoadState('load');

    const article = popup.locator('article.pkc-viewer-body.pkc-md-rendered');
    await expect(article).toBeVisible({ timeout: 10_000 });

    await popup.screenshot({
      path: 'test-results/chatgpt-fixture-diagnostic/viewer-popup-full.png',
    });

    // TOC で vars 展開を確認
    const tocText = await popup.locator('aside, .pkc-toc-list, [data-pkc-toc]').first().evaluate((el) => el.textContent ?? '').catch(() => '');
    console.log('Viewer TOC:', tocText);
  });

  test('Split View preview:edit mode で同 fixture preview', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'ChatGPT formal diagnostic Split', CHATGPT_FIXTURE);
    await page.locator('[data-pkc-action="begin-edit"]').first().click();
    const shell = page.locator('#pkc-root');
    await expect(shell).toHaveAttribute('data-pkc-phase', 'editing', { timeout: 5_000 });

    const wrapper = page.locator('.pkc-text-split-editor').first();
    await expect(wrapper).toBeVisible({ timeout: 5_000 });
    const preview = wrapper.locator('.pkc-text-edit-preview.pkc-md-rendered').first();
    await expect(preview).toBeVisible({ timeout: 5_000 });

    await preview.screenshot({
      path: 'test-results/chatgpt-fixture-diagnostic/split-view-preview.png',
    });
  });

  // ============================================================
  // simple-form fixture(同内容、ChatGPT/Gemini が simple 形に変換)
  // ============================================================
  test('center pane:simple-form fixture(同内容)が render される', async ({ page }) => {
    const SIMPLE_FIXTURE = `---
title: 石狩変電所 ネットワーク更改計画
vars:
  site: 石狩変電所
  phase: Phase-2
  date: 2026-05-18
  start: 22:00
  end: 03:00
  operator: 北系NW保守班
  manager: 佐藤
---

# {{vars.site}} ネットワーク更改計画

__ 本文書は {{vars.site}} におけるネットワーク更改作業の実施計画を定義する。

+++ {role=summary}

## 作業概要

- 対象フェーズ: {{vars.phase}}
- 作業日: {{vars.date}}
- 作業時間: {{vars.start}} ～ {{vars.end}}
- 実施班: {{vars.operator}}

_2

^^本作業中、一時的に監視系通信が停止する可能性があります^^

_1

|| :運転監視側への事前周知をお願いします:bold:

|> 作業責任者: {{vars.manager}}

%%% internal:
Phase-3でL3冗長化切替予定
%%%

---

## 作業対象

### 更新対象機器

| 機器名 | 現行 | 更新後 |
|---|---|---|
| CoreSW-01 | IOS-XE 16 | IOS-XE 18 |
| CoreSW-02 | IOS-XE 16 | IOS-XE 18 |

### 作業ネットワーク

:::figure{#topology-overview}

\`\`\`mermaid
graph TD
  CTRL[中央監視]
  GW[GW]
  CTRL --> GW
\`\`\`

^^^ 更新対象ネットワーク構成

:::

本文中では図 [@topology-overview] を参照。

---

+++ {role=warning}

## 注意事項

^^切替中に瞬断が発生する可能性あり^^

- RTU側再接続待ち最大5分
- 古いARP cache残留に注意

---

:::if{format=html}

## HTML版限定情報

本節はWeb公開版にのみ表示される。

:::

:::if{format=pdf}

## PDF版限定情報

本節は印刷用資料にのみ表示される。

:::

---

|> END OF DOCUMENT
`;

    await bootApp(page);
    await createTextEntry(page, 'simple form diagnostic', SIMPLE_FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    const observed = await rendered.evaluate((root) => {
      const bodyText = root.textContent ?? '';
      return {
        // L-1 section break
        sectionBreaks: root.querySelectorAll('hr.pkc-section-break').length,
        sectionBreakRoles: Array.from(root.querySelectorAll('hr.pkc-section-break')).map((h) => h.getAttribute('data-pkc-role')),
        // L-2 em-dot 新形 (^^...^^)
        emDots: root.querySelectorAll('em.pkc-em-dot').length,
        // L-5 align(end + center)
        alignEnd: root.querySelectorAll('p[data-pkc-align="end"]').length,
        alignCenter: root.querySelectorAll('p[data-pkc-align="center"]').length,
        // L-6 simple inline
        simpleInline: root.querySelectorAll('span.pkc-inline-mark').length,
        // L-7 figure (Pandoc hash form)
        figures: root.querySelectorAll('.pkc-fig').length,
        figRefs: root.querySelectorAll('.pkc-fig-ref').length,
        // L-8 blank-line marker
        blankLines: root.querySelectorAll('.pkc-blank-line').length,
        // L-9 indent
        indents: root.querySelectorAll('p[data-pkc-indent="1"]').length,
        // M-7 vars expanded
        varsExpanded: bodyText.includes('石狩変電所') && bodyText.includes('佐藤'),
        // tables
        tables: root.querySelectorAll('table').length,
        // headings
        h2: root.querySelectorAll('h2').length,
        // :::if{format=html} works
        htmlOnlyVisible: bodyText.includes('Web公開版にのみ'),
        // :::if{format=pdf} stripped
        pdfOnlyHidden: !bodyText.includes('印刷用資料にのみ'),
        // mermaid code visible
        mermaidVisible: bodyText.includes('graph TD'),
      };
    });

    console.log('=== simple form fixture observed ===');
    console.log(JSON.stringify(observed, null, 2));

    expect(observed.sectionBreaks).toBeGreaterThanOrEqual(2);
    expect(observed.sectionBreakRoles).toContain('summary');
    expect(observed.sectionBreakRoles).toContain('warning');
    expect(observed.emDots).toBeGreaterThanOrEqual(2);
    expect(observed.alignEnd).toBeGreaterThanOrEqual(2);
    expect(observed.alignCenter).toBeGreaterThanOrEqual(1);
    expect(observed.simpleInline).toBeGreaterThanOrEqual(1);
    expect(observed.figures).toBeGreaterThanOrEqual(1);
    expect(observed.figRefs).toBeGreaterThanOrEqual(1);
    expect(observed.blankLines).toBeGreaterThanOrEqual(2);
    expect(observed.indents).toBeGreaterThanOrEqual(1);
    expect(observed.varsExpanded).toBe(true);
    expect(observed.tables).toBeGreaterThanOrEqual(1);
    expect(observed.h2).toBeGreaterThanOrEqual(2);
    expect(observed.htmlOnlyVisible).toBe(true);
    expect(observed.pdfOnlyHidden).toBe(true);
    expect(observed.mermaidVisible).toBe(true);

    await rendered.screenshot({
      path: 'test-results/chatgpt-fixture-diagnostic/simple-center-pane.png',
    });
  });
});
