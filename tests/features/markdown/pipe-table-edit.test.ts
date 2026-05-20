import { describe, it, expect } from 'vitest';
import {
  addTableRow,
  deleteTableRow,
  addTableColumn,
  deleteTableColumn,
} from '@features/markdown/pipe-table-edit';

// 2 列 × 2 body 行の基準表。
//   line 0 `| h1 | h2 |`      offset 0-11
//   line 1 `| --- | --- |`    offset 12-25
//   line 2 `| a | b |`        offset 26-35
//   line 3 `| c | d |`        offset 36-45
const T = '| h1 | h2 |\n| --- | --- |\n| a | b |\n| c | d |';

describe('pipe-table-edit — addTableRow (spec §6.2)', () => {
  it('1. body 行 0 の下に空行を追加', () => {
    expect(addTableRow(T, 28, 'below')?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n| a | b |\n|  |  |\n| c | d |',
    );
  });
  it('2. body 行 0 の上に空行を追加', () => {
    expect(addTableRow(T, 28, 'above')?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n|  |  |\n| a | b |\n| c | d |',
    );
  });
  it('3. header 上で below → body 先頭に追加', () => {
    expect(addTableRow(T, 3, 'below')?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n|  |  |\n| a | b |\n| c | d |',
    );
  });
  it('4. 最終 body 行の下に追加', () => {
    expect(addTableRow(T, 40, 'below')?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n| a | b |\n| c | d |\n|  |  |',
    );
  });
  it('5. 表でない位置 → null', () => {
    expect(addTableRow('hello world', 3, 'below')).toBeNull();
  });
  it('6. body 0 行の表(header + sep のみ)に行追加', () => {
    expect(addTableRow('| h | h |\n| --- | --- |', 3, 'below')?.value).toBe(
      '| h | h |\n| --- | --- |\n|  |  |',
    );
  });
  it('7. 3 列の表 → 新行は 3 セル', () => {
    const t3 = '| a | b | c |\n| --- | --- | --- |\n| x | y | z |';
    expect(addTableRow(t3, 36, 'below')?.value).toBe(
      '| a | b | c |\n| --- | --- | --- |\n| x | y | z |\n|  |  |  |',
    );
  });
  it('8. caret は追加された行のセル内に来る', () => {
    const r = addTableRow(T, 28, 'below');
    expect(r).not.toBeNull();
    expect(r!.value.slice(r!.caret - 2, r!.caret)).toBe('| ');
  });
  it('9. 前後にテキストがある表でも該当表のみ編集', () => {
    const doc = `intro\n\n${T}\n\noutro`;
    const r = addTableRow(doc, doc.indexOf('| a | b |') + 2, 'below');
    expect(r?.value).toBe(
      `intro\n\n| h1 | h2 |\n| --- | --- |\n| a | b |\n|  |  |\n| c | d |\n\noutro`,
    );
  });
});

describe('pipe-table-edit — deleteTableRow (spec §6.2)', () => {
  it('10. body 行 0 を削除', () => {
    expect(deleteTableRow(T, 28)?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n| c | d |',
    );
  });
  it('11. body 行 1 を削除', () => {
    expect(deleteTableRow(T, 40)?.value).toBe(
      '| h1 | h2 |\n| --- | --- |\n| a | b |',
    );
  });
  it('12. header 上では削除不可 → null', () => {
    expect(deleteTableRow(T, 3)).toBeNull();
  });
  it('13. separator 行上では削除不可 → null', () => {
    expect(deleteTableRow(T, 15)).toBeNull();
  });
  it('14. 最後の body 行を削除 → header + separator のみ残る', () => {
    const t1 = '| h | h |\n| --- | --- |\n| a | b |';
    expect(deleteTableRow(t1, 28)?.value).toBe('| h | h |\n| --- | --- |');
  });
  it('15. 表でない位置 → null', () => {
    expect(deleteTableRow('plain text', 2)).toBeNull();
  });
});

describe('pipe-table-edit — addTableColumn (spec §6.2)', () => {
  it('16. caret 列の右に空列', () => {
    expect(addTableColumn(T, 28, 'right')?.value).toBe(
      '| h1 |  | h2 |\n| --- | --- | --- |\n| a |  | b |\n| c |  | d |',
    );
  });
  it('17. caret 列の左に空列', () => {
    expect(addTableColumn(T, 28, 'left')?.value).toBe(
      '|  | h1 | h2 |\n| --- | --- | --- |\n|  | a | b |\n|  | c | d |',
    );
  });
  it('18. 最終列の右に追加', () => {
    expect(addTableColumn(T, 32, 'right')?.value).toBe(
      '| h1 | h2 |  |\n| --- | --- | --- |\n| a | b |  |\n| c | d |  |',
    );
  });
  it('19. separator 行の新セルは ---', () => {
    expect(addTableColumn(T, 28, 'right')?.value.split('\n')[1]).toBe(
      '| --- | --- | --- |',
    );
  });
  it('20. 表でない位置 → null', () => {
    expect(addTableColumn('plain', 2, 'right')).toBeNull();
  });
});

describe('pipe-table-edit — deleteTableColumn (spec §6.2)', () => {
  it('21. caret 列 0 を削除', () => {
    expect(deleteTableColumn(T, 28)?.value).toBe(
      '| h2 |\n| --- |\n| b |\n| d |',
    );
  });
  it('22. caret 列 1 を削除', () => {
    expect(deleteTableColumn(T, 32)?.value).toBe(
      '| h1 |\n| --- |\n| a |\n| c |',
    );
  });
  it('23. 最後の 1 列は削除不可 → null', () => {
    expect(deleteTableColumn('| h |\n| --- |\n| x |', 3)).toBeNull();
  });
  it('24. 表でない位置 → null', () => {
    expect(deleteTableColumn('plain text', 2)).toBeNull();
  });
});
