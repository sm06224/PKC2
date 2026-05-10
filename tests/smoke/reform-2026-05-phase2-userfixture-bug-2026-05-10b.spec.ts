/**
 * reform-2026-05 Phase 2 user バグレポ(2026-05-10、2 件目)
 *
 * 提供 fixture(石狩変電所 ネットワーク更改計画 詳細版)で「レンダリング
 * されない項目が多々ある」と user 報告。
 *
 * 想定未実装 / 不整合:
 * - :lead:[content]                inline role(未実装)
 * - :spacing:{size=N}              inline directive(未実装)
 * - :align:{position=end}          inline directive(_text_ 形と乖離)
 * - :quote:{attribution=...}       inline directive(:::quote block のみ実装)
 * - :::comment block               実装済(PR-2G)
 * - :::if{format=html|pdf}         実装済(Phase 1 PR-F)
 * - vars 展開 {{vars.x}}            実装済(M-7)
 *
 * このテストは「render されないものを検出して報告する」目的。
 * 期待値は『何が render されたか / されなかったか』を全部 dump する。
 */
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = `---
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
  await page.setViewportSize({ width: 1280, height: 1400 });
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
  await page.locator('textarea[data-pkc-field="body"]').first().evaluate((el, value) => {
    const ta = el as HTMLTextAreaElement;
    ta.value = value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
  }, body);
  await page.locator('[data-pkc-action="commit-edit"]').first().click();
  await expect(shell).toHaveAttribute('data-pkc-phase', 'ready', { timeout: 5_000 });
}

test.describe('reform Phase 2:user バグレポ詳細版(石狩変電所 fixture v2)', () => {
  test('center pane:全要素を観測して dump', async ({ page }) => {
    await bootApp(page);
    await createTextEntry(page, 'ishikari fixture v2', FIXTURE);

    const rendered = page.locator('.pkc-view-body.pkc-md-rendered').first();
    await expect(rendered).toBeVisible({ timeout: 10_000 });

    // 全要素 dump
    const observed = await rendered.evaluate((root) => {
      const text = root.textContent ?? '';
      const html = root.innerHTML;
      return {
        // vars 展開
        siteExpanded: text.includes('石狩変電所'),
        phaseExpanded: text.includes('Phase-2'),
        managerExpanded: text.includes('佐藤'),
        operatorExpanded: text.includes('北系NW保守班'),
        // section callout
        sectionSummary: !!root.querySelector('section.pkc-section-summary'),
        sectionWarning: !!root.querySelector('section.pkc-section-warning'),
        // multi-line :emphasis: / :strong:
        emCount: root.querySelectorAll('em').length,
        emInWarning: !!Array.from(root.querySelectorAll('section.pkc-section-warning em'))
          .find((el) => el.textContent?.includes('切替中に瞬断')),
        strongInSummary: !!Array.from(root.querySelectorAll('section.pkc-section-summary strong'))
          .find((el) => el.textContent?.includes('運転監視側への事前周知')),
        // figure + mermaid + caption
        figureCount: root.querySelectorAll('figure.pkc-fig').length,
        figureCaption: root.querySelector('figcaption.pkc-fig-caption')?.textContent ?? '',
        figureRef: !!root.querySelector('a.pkc-fig-ref'),
        mermaidVisible: text.includes('graph TD'),
        // tables
        tableCount: root.querySelectorAll('table').length,
        // :::comment block — should be hidden
        commentVisible: text.includes('Phase-3でL3冗長化切替予定'),
        // :::if{format=html} — should be visible (we render html target)
        htmlOnlyVisible: text.includes('HTML版限定情報'),
        // :::if{format=pdf} — should be HIDDEN (html target ≠ pdf)
        pdfOnlyVisible: text.includes('PDF版限定情報'),
        // ── 未実装疑い項目 ──
        // :lead:[content] — should render as something visible (not literal)
        leadAsText: text.includes(':lead:['),
        leadAsElement: !!root.querySelector('.pkc-lead, p.pkc-lead, [data-pkc-role="lead"]'),
        // :spacing:{size=N} — should render as spacer
        spacingAsText: text.includes(':spacing:{'),
        spacingAsElement: !!root.querySelector('.pkc-spacing, [data-pkc-spacing]'),
        // :align:{position=end} — should affect next paragraph
        alignAsText: text.includes(':align:{'),
        alignAsElement: !!root.querySelector('[data-pkc-align], [style*="text-align"]'),
        // :quote:{attribution=...} — inline directive form (not :::quote block)
        quoteAsText: text.includes(':quote:{'),
        quoteAsElement: !!root.querySelector('blockquote, .pkc-quote, [data-pkc-role="quote"]'),
        attributionVisible: text.includes('END OF DOCUMENT') || text.includes('作業責任者: 佐藤'),
        // 警告要素
        warningCount: root.querySelectorAll('.pkc-warning, [data-pkc-warning]').length,
        // 全 HTML 抜粋(問題箇所周辺)
        htmlExcerpt: html.length > 5000 ? html.substring(0, 5000) + '...' : html,
      };
    });

    console.log('========== ISHIKARI FIXTURE V2 OBSERVED ==========');
    console.log(JSON.stringify({
      vars: {
        siteExpanded: observed.siteExpanded,
        phaseExpanded: observed.phaseExpanded,
        managerExpanded: observed.managerExpanded,
        operatorExpanded: observed.operatorExpanded,
      },
      sections: {
        summary: observed.sectionSummary,
        warning: observed.sectionWarning,
      },
      multiline_inline: {
        emCount: observed.emCount,
        emInWarning: observed.emInWarning,
        strongInSummary: observed.strongInSummary,
      },
      figure: {
        count: observed.figureCount,
        caption: observed.figureCaption,
        ref: observed.figureRef,
        mermaid: observed.mermaidVisible,
      },
      conditional: {
        comment_hidden: !observed.commentVisible,
        htmlOnly_visible: observed.htmlOnlyVisible,
        pdfOnly_hidden: !observed.pdfOnlyVisible,
      },
      未実装疑い: {
        lead: { 文字列残留: observed.leadAsText, element化: observed.leadAsElement },
        spacing: { 文字列残留: observed.spacingAsText, element化: observed.spacingAsElement },
        align: { 文字列残留: observed.alignAsText, element化: observed.alignAsElement },
        quote_inline: { 文字列残留: observed.quoteAsText, element化: observed.quoteAsElement, attribution_visible: observed.attributionVisible },
      },
      tableCount: observed.tableCount,
      warningCount: observed.warningCount,
    }, null, 2));
    console.log('==================================================');

    await page.screenshot({
      path: 'test-results/phase2-userfixture-v2/ishikari-v2-center-full.png',
      fullPage: true,
    });

    // 確認したい assertions(これは fail を許容、観測目的)
    // implemented features は green
    expect(observed.siteExpanded, 'vars.site が展開').toBe(true);
    expect(observed.sectionSummary, ':::section{role=summary} 描画').toBe(true);
    expect(observed.sectionWarning, ':::section{role=warning} 描画').toBe(true);
    expect(observed.emInWarning, 'multi-line :emphasis: in warning section').toBe(true);
    expect(observed.strongInSummary, 'multi-line :strong: in summary section').toBe(true);
    expect(observed.figureCount, ':::figure block 描画').toBeGreaterThanOrEqual(1);
    expect(observed.figureCaption, 'multi-line :caption: 描画').toContain('更新対象ネットワーク構成');
    expect(observed.commentVisible, ':::comment block 隠蔽').toBe(false);
    expect(observed.htmlOnlyVisible, ':::if{format=html} 表示').toBe(true);
    expect(observed.pdfOnlyVisible, ':::if{format=pdf} 隠蔽').toBe(false);
  });
});
