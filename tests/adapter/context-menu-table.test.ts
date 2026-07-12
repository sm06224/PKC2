/**
 * @vitest-environment happy-dom
 *
 * #902 — 表の右クリック context menu(コピー / エクスポート)の wiring test。
 * detection(md-rendered scope 限定 / 優先順位)と、menu item click →
 * clipboard に実変換結果が渡る consumer 観測点までを確認する。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectObjectContext,
  renderObjectContextMenu,
} from '../../src/adapter/ui/context-menu-object';

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '';
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
    writable: true,
  });
});

function mountMdTable(): { td: HTMLElement; table: HTMLTableElement } {
  const wrap = document.createElement('div');
  wrap.className = 'pkc-md-rendered';
  wrap.innerHTML = `<table>
    <thead><tr><th>名前</th><th>値</th></tr></thead>
    <tbody><tr><td id="cell">a,x</td><td>1</td></tr></tbody>
  </table>`;
  document.body.appendChild(wrap);
  return { td: document.getElementById('cell')!, table: wrap.querySelector('table')! };
}

describe('#902 table context menu', () => {
  it('md-rendered 内の td → kind=table を検出(target は table 要素)', () => {
    const { td, table } = mountMdTable();
    const ctx = detectObjectContext(td, null);
    expect(ctx?.kind).toBe('table');
    expect(ctx?.target).toBe(table);
  });

  it('md-rendered 外の table は検出しない(spreadsheet 等の UI table 保護)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<table><tr><td id="out">x</td></tr></table>';
    document.body.appendChild(div);
    expect(detectObjectContext(document.getElementById('out')!, null)).toBeNull();
  });

  it('セル内 link は link 分岐が先に勝つ', () => {
    const wrap = document.createElement('div');
    wrap.className = 'pkc-md-rendered';
    wrap.innerHTML = '<table><tr><td><a href="https://x" id="ln">L</a></td></tr></table>';
    document.body.appendChild(wrap);
    expect(detectObjectContext(document.getElementById('ln')!, null)?.kind).toBe('link');
  });

  it('menu にコピー 3 種 + ダウンロード 2 種が並ぶ', () => {
    const { td } = mountMdTable();
    const ctx = detectObjectContext(td, null)!;
    const menu = renderObjectContextMenu(ctx, 0, 0);
    const ids = Array.from(menu.querySelectorAll('[data-pkc-cmd-id]')).map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toEqual([
      'object.copy-table-tsv',
      'object.copy-table-csv',
      'object.copy-table-markdown',
      'object.download-table-csv',
      'object.download-table-tsv',
    ]);
    expect(menu.getAttribute('data-pkc-context-object')).toBe('table');
  });

  it('TSV コピー click → clipboard に実データの TSV が渡る(consumer 観測点)', () => {
    const { td } = mountMdTable();
    const menu = renderObjectContextMenu(detectObjectContext(td, null)!, 0, 0);
    document.body.appendChild(menu);
    (menu.querySelector('[data-pkc-cmd-id="object.copy-table-tsv"]') as HTMLButtonElement).click();
    expect(writeText).toHaveBeenCalledWith('名前\t値\na,x\t1');
  });

  it('CSV コピー click → RFC4180 quote 済み CSV が渡る', () => {
    const { td } = mountMdTable();
    const menu = renderObjectContextMenu(detectObjectContext(td, null)!, 0, 0);
    document.body.appendChild(menu);
    (menu.querySelector('[data-pkc-cmd-id="object.copy-table-csv"]') as HTMLButtonElement).click();
    expect(writeText).toHaveBeenCalledWith('名前,値\r\n"a,x",1');
  });

  it('Markdown コピー click → markdown table が渡る', () => {
    const { td } = mountMdTable();
    const menu = renderObjectContextMenu(detectObjectContext(td, null)!, 0, 0);
    document.body.appendChild(menu);
    (menu.querySelector('[data-pkc-cmd-id="object.copy-table-markdown"]') as HTMLButtonElement).click();
    expect(writeText).toHaveBeenCalledWith('| 名前 | 値 |\n| --- | --- |\n| a,x | 1 |');
  });
});
