/**
 * @vitest-environment happy-dom
 *
 * #902 — table-export pure 関数群の unit test。
 */
import { describe, it, expect } from 'vitest';
import {
  extractTableRows,
  rowsToTsv,
  rowsToCsv,
  rowsToMarkdown,
} from '@features/markdown/table-export';

function makeTable(html: string): HTMLTableElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.querySelector('table')!;
}

describe('extractTableRows', () => {
  it('thead + tbody のセル text を行列で抽出する', () => {
    const t = makeTable(`<table>
      <thead><tr><th>名前</th><th>値</th></tr></thead>
      <tbody><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody>
    </table>`);
    expect(extractTableRows(t)).toEqual([['名前', '値'], ['a', '1'], ['b', '2']]);
  });

  it('table-enhancement の UI(button / data-pkc-*)は除外する', () => {
    const t = makeTable(`<table><tr>
      <th>col<button data-pkc-action="table-sort">▲</button></th>
      <th>col2<span data-pkc-region="table-filter">filter</span></th>
    </tr><tr><td>x</td><td>y</td></tr></table>`);
    expect(extractTableRows(t)).toEqual([['col', 'col2'], ['x', 'y']]);
  });

  it('空 table は []', () => {
    expect(extractTableRows(makeTable('<table></table>'))).toEqual([]);
  });
});

describe('rowsToTsv', () => {
  it('タブ区切り + セル内タブ/改行はスペースへ', () => {
    expect(rowsToTsv([['a', 'b\tc'], ['d\ne', 'f']])).toBe('a\tb c\nd e\tf');
  });
});

describe('rowsToCsv', () => {
  it('RFC4180: カンマ・引用符・改行を含むセルを quote する', () => {
    expect(rowsToCsv([['a,b', 'say "hi"'], ['plain', 'x\ny']]))
      .toBe('"a,b","say ""hi"""\r\nplain,"x\ny"');
  });
});

describe('rowsToMarkdown', () => {
  it('先頭行を header にし、| をエスケープ、列数を揃える', () => {
    expect(rowsToMarkdown([['h1', 'h|2'], ['a']]))
      .toBe('| h1 | h\\|2 |\n| --- | --- |\n| a |  |');
  });

  it('空入力は空文字', () => {
    expect(rowsToMarkdown([])).toBe('');
  });
});
