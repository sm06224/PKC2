/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 3(user direction 2026-05-29):cell に CSV /
 * TSV を貼付すると grid を auto-fill する動線。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter, __testHelpers } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-05-29T00:00:00Z';
function mkEntry(body: string): Entry {
  return { lid: 's', title: 'S', body, archetype: 'spreadsheet', created_at: TS, updated_at: TS };
}

function mountEditor(body: string): HTMLElement {
  document.body.innerHTML = '';
  const el = spreadsheetPresenter.renderEditorBody(mkEntry(body));
  document.body.appendChild(el);
  return el;
}

function getCell(wrapper: HTMLElement, row: number, col: number): HTMLElement | null {
  return wrapper.querySelector<HTMLElement>(`[contenteditable][data-row="${row}"][data-col="${col}"]`);
}

/** ClipboardEvent を構築して cell に dispatch。clipboardData は happy-dom で
 *  Object.defineProperty 経由で injection が必要なので合成 helper を持つ。 */
function dispatchPaste(cell: HTMLElement, text: string): ClipboardEvent {
  const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(ev, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  cell.dispatchEvent(ev);
  return ev;
}

describe('spreadsheet Phase 3 paste auto-import', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: TSV 貼付で grid を auto-fill(focus cell から右下方向に上書き)', () => {
    const el = mountEditor('{"rows":[["","",""],["","",""]]}');
    const cell00 = getCell(el, 0, 0)!;
    cell00.focus();
    dispatchPaste(cell00, 'a\tb\n1\t2');
    expect(getCell(el, 0, 0)?.textContent).toBe('a');
    expect(getCell(el, 0, 1)?.textContent).toBe('b');
    expect(getCell(el, 1, 0)?.textContent).toBe('1');
    expect(getCell(el, 1, 1)?.textContent).toBe('2');
  });

  it('case 2: CSV 貼付(comma 区切り)でも auto-fill', () => {
    const el = mountEditor('{"rows":[["","",""]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    dispatchPaste(cell, 'h1,h2,h3\nv1,v2,v3');
    expect(getCell(el, 0, 0)?.textContent).toBe('h1');
    expect(getCell(el, 0, 1)?.textContent).toBe('h2');
    expect(getCell(el, 0, 2)?.textContent).toBe('h3');
    expect(getCell(el, 1, 0)?.textContent).toBe('v1');
  });

  it('case 3: focus cell 位置から流し込む(grid 中央への上書き)', () => {
    const el = mountEditor('{"rows":[["a","b","c"],["1","2","3"],["x","y","z"]]}');
    // (1, 1) を focus → そこから 2x2 TSV を貼付
    const cell = getCell(el, 1, 1)!;
    cell.focus();
    dispatchPaste(cell, 'X\tY\nW\tZ');
    // 上書き位置:(1,1)=X, (1,2)=Y, (2,1)=W, (2,2)=Z
    expect(getCell(el, 1, 1)?.textContent).toBe('X');
    expect(getCell(el, 1, 2)?.textContent).toBe('Y');
    expect(getCell(el, 2, 1)?.textContent).toBe('W');
    expect(getCell(el, 2, 2)?.textContent).toBe('Z');
    // 貼付外は維持
    expect(getCell(el, 0, 0)?.textContent).toBe('a');
    expect(getCell(el, 0, 2)?.textContent).toBe('c');
    expect(getCell(el, 2, 0)?.textContent).toBe('x');
  });

  it('case 4: grid 範囲を超える貼付は自動的に row / col 拡張', () => {
    const el = mountEditor('{"rows":[["a","b"]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    // 3x3 を 1x2 grid に貼付 → grid は 3x3 に拡張
    dispatchPaste(cell, 'A\tB\tC\nD\tE\tF\nG\tH\tI');
    expect(getCell(el, 2, 2)?.textContent).toBe('I');
    expect(getCell(el, 0, 0)?.textContent).toBe('A');
  });

  it('case 5: 単一値の貼付は default paste(preventDefault しない)', () => {
    const el = mountEditor('{"rows":[["a"]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    const ev = dispatchPaste(cell, 'just text');
    // detectPasteAsSpreadsheet が null を返す → e.preventDefault が呼ばれない
    expect(ev.defaultPrevented).toBe(false);
    // cell 値は変更されない(default paste は test 環境では実行されない)
    expect(getCell(el, 0, 0)?.textContent).toBe('a');
  });

  it('case 6: 改行のみ(1 列複数行)も貼付経路', () => {
    const el = mountEditor('{"rows":[[""]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    dispatchPaste(cell, 'one\ntwo\nthree');
    expect(getCell(el, 0, 0)?.textContent).toBe('one');
    expect(getCell(el, 1, 0)?.textContent).toBe('two');
    expect(getCell(el, 2, 0)?.textContent).toBe('three');
  });

  it('case 7: quote 内 comma を持つ CSV(RFC 4180)も正しく分解', () => {
    const el = mountEditor('{"rows":[["",""]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    dispatchPaste(cell, 'a,"x,y"\n1,"a,b,c"');
    expect(getCell(el, 0, 0)?.textContent).toBe('a');
    expect(getCell(el, 0, 1)?.textContent).toBe('x,y');
    expect(getCell(el, 1, 1)?.textContent).toBe('a,b,c');
  });

  it('case 8: 貼付後 hidden textarea も sync される(collectBody に反映)', () => {
    const el = mountEditor('{"rows":[["",""]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    dispatchPaste(cell, 'A\tB\nC\tD');
    const json = spreadsheetPresenter.collectBody(el);
    const body = JSON.parse(json);
    expect(body.rows).toEqual([['A', 'B'], ['C', 'D']]);
  });

  it('case 9: 貼付後 focus は流し込み範囲の右下 cell に移動', () => {
    const el = mountEditor('{"rows":[["",""]]}');
    const cell = getCell(el, 0, 0)!;
    cell.focus();
    dispatchPaste(cell, 'a\tb\nc\td');
    // 流し込み範囲 (0,0)-(1,1) の右下 = (1,1)
    expect(document.activeElement).toBe(getCell(el, 1, 1));
  });

  it('case 10: applyPasteAtCell helper を直接呼んでも同 contract', () => {
    const el = mountEditor('{"rows":[["",""]]}');
    __testHelpers.applyPasteAtCell(el, 0, 0, { rows: [['X', 'Y']] });
    expect(getCell(el, 0, 0)?.textContent).toBe('X');
    expect(getCell(el, 0, 1)?.textContent).toBe('Y');
  });
});
