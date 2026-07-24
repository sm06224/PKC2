/** @vitest-environment happy-dom */
/**
 * `findMdBlockCopySource` — コピー ⧉ が「今見えている面」を拾うことの回帰テスト。
 *
 * 背景(2026-07-24):標準規約 PR(#996)で renderable fence の DOM が
 * `.pkc-render-slot`(レンダリング面)+ 隠し `pre.pkc-render-source` の 2 面
 * 構成になった結果、旧選択子 `:scope > pre, :scope > table` が csv 系の描画
 * table を取り逃がし、隠しソースをコピーしていた(Excel / Word 貼付が
 * 表 → 生 CSV テキストに劣化)。本 test はその回帰を pin する。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';
import { findMdBlockCopySource, stripTableChromeForCopy } from '@adapter/ui/action-binder';
import { enhanceTable } from '@adapter/ui/table-interactive';

function blockFor(md: string): HTMLElement {
  document.body.innerHTML = renderMarkdown(md);
  const block = document.querySelector<HTMLElement>('.pkc-md-block');
  if (!block) throw new Error('no .pkc-md-block emitted');
  return block;
}

function pick(md: string): { tag: string; className: string } {
  const el = findMdBlockCopySource(blockFor(md));
  if (!el) throw new Error('no copy source found');
  return { tag: el.tagName.toLowerCase(), className: el.className };
}

describe('csv / tsv / psv — レンダリング面は描画 table を拾う(#996 回帰の pin)', () => {
  it('```csv(無印 = both)は slot 内の table', () => {
    expect(pick('```csv\nname,qty\napple,3\n```')).toEqual({
      tag: 'table',
      className: 'pkc-md-rendered-csv',
    });
  });

  it('```csv-render(固定)でも table', () => {
    expect(pick('```csv-render\nname,qty\napple,3\n```').tag).toBe('table');
  });

  it('```tsv / ```psv も同様', () => {
    expect(pick('```tsv\na\tb\n1\t2\n```').tag).toBe('table');
    expect(pick('```psv\na|b\n1|2\n```').tag).toBe('table');
  });

  it('拾った table から TSV が取れる(スプレッドシート貼付の実益)', () => {
    const el = findMdBlockCopySource(blockFor('```csv\nname,qty\napple,3\n```'))!;
    const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td'))
        .map((c) => (c.textContent ?? '').trim())
        .join('\t'),
    );
    expect(rows).toEqual(['name\tqty', 'apple\t3']);
  });
});

describe('html / mermaid — 描画面に copy できる要素が無いのでソースへ落ちる', () => {
  it('```html は隠しソース(iframe はコピー対象にならない)', () => {
    expect(pick('```html\n<h1>x</h1>\n```')).toEqual({
      tag: 'pre',
      className: 'pkc-render-source',
    });
  });

  it('```mermaid も隠しソース(placeholder 内の pre は直下ではない)', () => {
    expect(pick('```mermaid\nflowchart TD\n  A --> B\n```')).toEqual({
      tag: 'pre',
      className: 'pkc-render-source',
    });
  });
});

describe('ソース面表示中(トグル ON)は見えているソースをコピー', () => {
  it('csv-both のトグルを ON にすると table ではなくソース pre', () => {
    const block = blockFor('```csv\nname,qty\napple,3\n```');
    const toggle = block.querySelector<HTMLInputElement>(':scope > .pkc-render-toggle-input');
    expect(toggle).not.toBeNull();
    toggle!.checked = true;
    const el = findMdBlockCopySource(block)!;
    expect(el.tagName.toLowerCase()).toBe('pre');
    expect(el.className).toBe('pkc-render-source');
    expect(el.textContent).toContain('apple,3');
  });
});

describe('stripTableChromeForCopy — 貼り付け先に UI 装飾を混ぜない', () => {
  /** table-interactive が注入する行番号列 / 並べ替え・絞り込みボタンを再現。 */
  function enhancedTableBlock(md: string): HTMLElement {
    const block = blockFor(md);
    const table = block.querySelector('table');
    if (!table) throw new Error('no table');
    enhanceTable(table as HTMLTableElement);
    return block;
  }

  function tsv(el: HTMLElement): string[] {
    return Array.from(el.querySelectorAll('tr')).map((tr) =>
      Array.from(tr.querySelectorAll('th, td'))
        .map((c) => (c.textContent ?? '').replace(/[\t\r\n]+/g, ' ').trim())
        .join('\t'),
    );
  }

  it('装飾つき markdown 表: 行番号 # と ↕ ⌕ が copy から落ちる', () => {
    const block = enhancedTableBlock('| name | qty |\n|---|---|\n| apple | 3 |');
    const raw = findMdBlockCopySource(block)!;
    // 装飾前提の確認(この test 自体が実 DOM を再現できていることの担保)
    expect(tsv(raw)[0]).toContain('#');
    expect(tsv(raw)[0]).toMatch(/[↕⌕]/);

    const cleaned = stripTableChromeForCopy(raw);
    expect(tsv(cleaned)).toEqual(['name\tqty', 'apple\t3']);
    expect(cleaned.outerHTML).not.toContain('pkc-md-table-rownum');
    expect(cleaned.outerHTML).not.toContain('pkc-md-table-sort');
  });

  it('csv fence の表でも同じ(装飾は .pkc-md-rendered table 全体に効く)', () => {
    const block = enhancedTableBlock('```csv\nname,qty\napple,3\n```');
    const cleaned = stripTableChromeForCopy(findMdBlockCopySource(block)!);
    expect(tsv(cleaned)).toEqual(['name\tqty', 'apple\t3']);
  });

  it('表示中の DOM は壊さない(clone 経由)', () => {
    const block = enhancedTableBlock('| a |\n|---|\n| 1 |');
    const raw = findMdBlockCopySource(block)!;
    stripTableChromeForCopy(raw);
    expect(raw.querySelector('.pkc-md-table-rownum')).not.toBeNull();
    expect(raw.querySelector('.pkc-md-table-sort')).not.toBeNull();
  });

  it('装飾が無い表 / pre はそのまま同一参照を返す(無駄な clone をしない)', () => {
    const plainTable = findMdBlockCopySource(blockFor('| a |\n|---|\n| 1 |'))!;
    expect(stripTableChromeForCopy(plainTable)).toBe(plainTable);
    const pre = findMdBlockCopySource(blockFor('```\nhello\n```'))!;
    expect(stripTableChromeForCopy(pre)).toBe(pre);
  });
});

describe('従来形状は不変(回帰防止)', () => {
  it('通常 fence は直下 pre', () => {
    expect(pick('```\nhello\n```').tag).toBe('pre');
  });

  it('```-norender も直下 pre(slot 無し)', () => {
    const block = blockFor('```csv-norender\na,b\n1,2\n```');
    expect(block.querySelector('.pkc-render-slot')).toBeNull();
    expect(findMdBlockCopySource(block)!.tagName.toLowerCase()).toBe('pre');
  });

  it('markdown table は直下 table', () => {
    expect(pick('| a | b |\n|---|---|\n| 1 | 2 |').tag).toBe('table');
  });
});
