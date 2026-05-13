/**
 * @vitest-environment happy-dom
 *
 * PR-2JJ v2 hotfix(2026-05-13、PR #432 stack、user 報告):
 * 「このPKC Markdownを使って、MD取得とPKC MD取得してレンダリングが期待
 * になるか確認して、私はこれはできているとは思いません」「逆方向も順方向
 * も何度か繰り返して破壊されずに安定することを確認して」
 *
 * User 提示の現実的 fixture(石狩変電所 ネットワーク更改計画)を使い、
 * (a)quality check 10/10 pass、(b)forward / 逆方向 / 双方向の 5 反復で
 * destructive change が起きないこと、(c)主要 content(vars.site / :emphasis
 * inner / table)が rounds を経ても保存されることを fix。
 */
import { describe, it, expect } from 'vitest';
import { getAstApi } from '@adapter/public-ast-api';

const USER_FIXTURE_REAL = `---
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

:::

:::comment
internal:
Phase-3でL3冗長化切替予定
:::

---

## 作業対象

| 機器名 | 現行 | 更新後 |
|---|---|---|
| CoreSW-01 | IOS-XE 16 | IOS-XE 18 |
| FW-01 | v6.2 | v7.0 |

:::if{format=html}
HTML版限定情報
:::

:::if{format=pdf}
PDF版限定情報
:::
`;

describe('PR-2JJ v2 user fixture quality check(石狩変電所 fixture)', () => {
  const api = getAstApi();

  describe('GFM mode', () => {
    const ast = api.parseMarkdown(USER_FIXTURE_REAL);
    const gfm = api.renderMarkdown(ast, { mode: 'gfm' });

    it('{{vars.site}} → 石狩変電所 に展開される', () => {
      expect(gfm).not.toContain('{{vars.site}}');
      expect(gfm).toContain('石狩変電所');
    });

    it('{{vars.manager}} → 佐藤 に展開される', () => {
      expect(gfm).toContain('佐藤');
    });

    it(':lead: marker が消える', () => {
      expect(gfm).not.toContain(':lead:');
    });

    it(':emphasis: marker が消えて中身が残る(GFM emphasis)', () => {
      expect(gfm).not.toContain(':emphasis:');
      expect(gfm).toContain('監視系通信');
    });

    it(':strong: marker が消える', () => {
      expect(gfm).not.toContain(':strong:');
    });

    it(':spacing: marker が消える', () => {
      expect(gfm).not.toContain(':spacing:');
    });

    it(':align: marker が消える', () => {
      expect(gfm).not.toContain(':align:');
    });

    it(':::section marker が消える(中身は残る)', () => {
      expect(gfm).not.toContain(':::section');
      expect(gfm).toContain('作業概要');
    });

    it(':::comment 内容が完全削除される', () => {
      expect(gfm).not.toContain('Phase-3でL3冗長化');
      expect(gfm).not.toContain(':::comment');
    });

    it(':::figure marker が消える', () => {
      expect(gfm).not.toContain(':::figure');
    });

    it(':::if{format=pdf} 内容が削除される', () => {
      expect(gfm).not.toContain('PDF版限定情報');
    });

    it(':::if{format=html} 内容は残る', () => {
      expect(gfm).toContain('HTML版限定情報');
    });

    it('table 内容が保存される', () => {
      expect(gfm).toContain('CoreSW-01');
      expect(gfm).toContain('IOS-XE 18');
    });
  });

  describe('PKC mode', () => {
    const ast = api.canonicalize(api.parseMarkdown(USER_FIXTURE_REAL));
    const pkc = api.renderMarkdown(ast, { mode: 'pkc' });

    it('vars 展開済(GFM と同じく、:lead: の中身に site が出る)', () => {
      expect(pkc).toContain('石狩変電所');
    });

    it('canonical PKC MD として :::section が canonical 形で残る', () => {
      expect(pkc).toContain(':::');
    });

    it('主要 content が保存される', () => {
      expect(pkc).toContain('CoreSW-01');
      expect(pkc).toContain('作業概要');
    });
  });
});

describe('PR-2JJ v2 forward iteration stability(N 反復で destructive change なし)', () => {
  const api = getAstApi();

  function renderGfm(src: string): string {
    return api.renderMarkdown(api.parseMarkdown(src), { mode: 'gfm' });
  }

  function renderPkc(src: string): string {
    return api.renderMarkdown(
      api.canonicalize(api.parseMarkdown(src)),
      { mode: 'pkc' },
    );
  }

  it('GFM:5 反復で 2 回目以降は同じ output(idempotent)', () => {
    let cur = USER_FIXTURE_REAL;
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      cur = renderGfm(cur);
      outputs.push(cur);
    }
    // 1 回目は input(PKC fixture)→ GFM 変換、2 回目以降は GFM → GFM で安定するはず
    expect(outputs[1]).toBe(outputs[2]);
    expect(outputs[2]).toBe(outputs[3]);
    expect(outputs[3]).toBe(outputs[4]);
  });

  it('PKC:5 反復で 2 回目以降は同じ output(canonical idempotent)', () => {
    let cur = USER_FIXTURE_REAL;
    const outputs: string[] = [];
    for (let i = 0; i < 5; i++) {
      cur = renderPkc(cur);
      outputs.push(cur);
    }
    expect(outputs[1]).toBe(outputs[2]);
    expect(outputs[2]).toBe(outputs[3]);
    expect(outputs[3]).toBe(outputs[4]);
  });

  it('双方向(PKC ↔ GFM)5 cycle で安定(destructive change なし)', () => {
    let cur = USER_FIXTURE_REAL;
    let prevP = '';
    let prevG = '';
    for (let i = 0; i < 5; i++) {
      cur = renderPkc(cur);
      if (i >= 2) {
        // 2 cycle 目以降は前回と同じ
        expect(cur).toBe(prevP);
      }
      prevP = cur;
      cur = renderGfm(cur);
      if (i >= 2) {
        expect(cur).toBe(prevG);
      }
      prevG = cur;
    }
  });

  it('content preservation:5 反復後も主要 content が消えない', () => {
    let g = USER_FIXTURE_REAL;
    for (let i = 0; i < 5; i++) {
      g = renderGfm(g);
    }
    expect(g).toContain('石狩変電所');
    expect(g).toContain('佐藤');
    expect(g).toContain('監視系通信');
    expect(g).toContain('CoreSW-01');
    expect(g).toContain('HTML版限定情報');
    // 削除対象は削除されたまま
    expect(g).not.toContain('Phase-3でL3冗長化');
    expect(g).not.toContain('PDF版限定情報');
    expect(g).not.toContain(':::section');
    expect(g).not.toContain(':emphasis:');
  });
});
