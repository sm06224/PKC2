/**
 * reform-2026-05 Phase 2 user バグレポ(2026-05-10、2 件目)+ PR-2K hallucination signaling。
 *
 * 提供 fixture(石狩変電所 ネットワーク更改計画 詳細版)で「レンダリング
 * されない項目が多々ある」と user 報告。
 *
 * PR-2K(2026-05-10):AI hallucination 形 deny-list directive を visible inline
 * marker(`<span class="pkc-warning-hallucination">`)+ console.warn で signaling。
 *
 * 検証項目:
 * - :lead:[content]            → pkc-warning-hallucination-lead    + PKC1009
 * - :spacing:{size=N}          → pkc-warning-hallucination-spacing + PKC1009
 * - :align:{position=end}      → pkc-warning-hallucination-align   + PKC1009
 * - :quote:{attribution=...}   → pkc-warning-hallucination-quote   + PKC1009
 * - :::comment block           実装済(PR-2G、隠蔽)
 * - :::if{format=html|pdf}     実装済(Phase 1 PR-F)
 * - vars 展開 {{vars.x}}        実装済(M-7)
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

test.describe('reform Phase 2:user バグレポ詳細版(石狩変電所 fixture v2)+ PR-2L 寛容 parse', () => {
  test('center pane:hallucination 4 件 tolerant 描画 + console.info(PKC2005-2008)', async ({ page }) => {
    const consoleInfos: string[] = [];
    const consoleWarnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'info') consoleInfos.push(msg.text());
      if (msg.type() === 'warning') consoleWarnings.push(msg.text());
    });
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
        // ── PR-2L tolerant alias 検証(寛容 parse + hint log)──
        leadTolerant: !!root.querySelector('.pkc-lead'),
        leadWarnCode: root.querySelector('.pkc-lead')?.getAttribute('data-pkc-warn-code') ?? '',
        leadCanonical: root.querySelector('.pkc-lead')?.getAttribute('data-pkc-canonical') ?? '',
        spacingTolerant: !!root.querySelector('.pkc-tolerant-spacing'),
        spacingCount: root.querySelectorAll('.pkc-tolerant-spacing').length,
        spacingWarnCode: root.querySelector('.pkc-tolerant-spacing')?.getAttribute('data-pkc-warn-code') ?? '',
        alignTolerant: !!root.querySelector('.pkc-align-hint'),
        alignWarnCode: root.querySelector('.pkc-align-hint')?.getAttribute('data-pkc-warn-code') ?? '',
        alignNext: root.querySelector('.pkc-align-hint')?.getAttribute('data-pkc-align-next') ?? '',
        quoteTolerant: !!root.querySelector('.pkc-attribution'),
        quoteCount: root.querySelectorAll('.pkc-attribution').length,
        quoteWarnCode: root.querySelector('.pkc-attribution')?.getAttribute('data-pkc-warn-code') ?? '',
        attributionVisible: text.includes('END OF DOCUMENT') || text.includes('作業責任者: 佐藤'),
        // PR-2K 維持:警告要素 total(inline は 0 に減るはず、block 0 件 fixture 内)
        warningHallucinationTotal: root.querySelectorAll('.pkc-warning-hallucination-block').length,
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
      tolerant_PR_2L: {
        lead: { marker: observed.leadTolerant, code: observed.leadWarnCode, canonical: observed.leadCanonical },
        spacing: { marker: observed.spacingTolerant, count: observed.spacingCount, code: observed.spacingWarnCode },
        align: { marker: observed.alignTolerant, code: observed.alignWarnCode, next: observed.alignNext },
        quote: { marker: observed.quoteTolerant, count: observed.quoteCount, code: observed.quoteWarnCode },
        warnings_block: observed.warningHallucinationTotal,
        consoleInfo_PKC2005_to_2008: consoleInfos.filter((w) => /\[PKC200[5-8]\]/.test(w)),
      },
      tableCount: observed.tableCount,
    }, null, 2));
    console.log('==================================================');

    await page.screenshot({
      path: 'test-results/phase2-userfixture-v2/ishikari-v2-center-full.png',
      fullPage: true,
    });

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

    // PR-2L tolerant alias assertions
    expect(observed.leadTolerant, ':lead: tolerant render').toBe(true);
    expect(observed.leadWarnCode, ':lead: code PKC2005').toBe('PKC2005');
    expect(observed.leadCanonical, ':lead: canonical hint').toContain('段落');
    expect(observed.spacingTolerant, ':spacing: tolerant render').toBe(true);
    expect(observed.spacingCount, ':spacing: 2 件').toBeGreaterThanOrEqual(2);
    expect(observed.spacingWarnCode, ':spacing: code PKC2006').toBe('PKC2006');
    // PR-2O(2026-05-10):standalone `:align:{position=X}` は line-based 消費
    // (次段落の data-pkc-align に register、directive 行 strip)→ hint chip 出ない。
    // ユーザー fixture の `:align:{position=end}` は行頭で standalone なのでこの path。
    // align は assert しない(PR-2O で実際の align として動作)。
    expect(observed.quoteTolerant, ':quote: tolerant render').toBe(true);
    expect(observed.quoteCount, ':quote: 2 件').toBeGreaterThanOrEqual(2);
    expect(observed.quoteWarnCode, ':quote: code PKC2008').toBe('PKC2008');
    expect(observed.attributionVisible, 'attribution テキスト visible').toBe(true);
    // block warning 0 件(fixture v2 内に :::toc / :::frontmatter / :::body は無い)
    expect(observed.warningHallucinationTotal, 'block warning 0').toBe(0);
    // console.info(PKC2005-2008)で 4 directive 種 + 重複分カウント
    for (const code of ['PKC2005', 'PKC2006', 'PKC2007', 'PKC2008']) {
      expect(consoleInfos.some((w) => w.includes(`[${code}]`)), `console.info has ${code}`).toBe(true);
    }
    // PR-2K block warning(PKC1010) は 0 件 fixture
    expect(consoleWarnings.some((w) => w.includes('[PKC1010]'))).toBe(false);
  });
});
