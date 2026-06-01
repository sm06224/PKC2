/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 2 grid editor(user direction 2026-05-29、
 * 「1 と 2 両方」):cell-by-cell contenteditable grid + toolbar(+ Row / +
 * Column / TSV toggle)+ Tab/Enter cell navigation。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter, __testHelpers } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-05-29T00:00:00Z';

function mkEntry(body: string): Entry {
  return {
    lid: 's1', title: 'Sheet', body,
    archetype: 'spreadsheet',
    created_at: TS, updated_at: TS,
  };
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

function dispatchInput(cell: HTMLElement): void {
  cell.dispatchEvent(new Event('input', { bubbles: true }));
}

function dispatchKeyDown(cell: HTMLElement, key: string, opts: { shift?: boolean; alt?: boolean } = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true,
    shiftKey: opts.shift ?? false, altKey: opts.alt ?? false,
  });
  cell.dispatchEvent(ev);
  return ev;
}

describe('spreadsheet Phase 2 grid editor', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderEditorBody markup', () => {
    it('case 1: grid mode default(`data-pkc-spreadsheet-mode="grid"`)', () => {
      const el = mountEditor('{"rows":[["a","b"],["1","2"]]}');
      expect(el.getAttribute('data-pkc-spreadsheet-mode')).toBe('grid');
    });

    it('case 2: toolbar に 3 button(+ 行 / + 列 / TSV ⇄ Grid)', () => {
      const el = mountEditor('');
      const buttons = el.querySelectorAll<HTMLButtonElement>('.pkc-spreadsheet-toolbar button[data-pkc-action]');
      expect(buttons.length).toBe(3);
      const actions = Array.from(buttons).map((b) => b.getAttribute('data-pkc-action'));
      expect(actions).toContain('spreadsheet-add-row');
      expect(actions).toContain('spreadsheet-add-column');
      expect(actions).toContain('spreadsheet-toggle-tsv');
    });

    it('case 3: 既存 body から grid を build、各 cell に data-row/col + contenteditable', () => {
      const el = mountEditor('{"rows":[["name","age"],["alice","30"]]}');
      expect(getCell(el, 0, 0)?.textContent).toBe('name');
      expect(getCell(el, 0, 1)?.textContent).toBe('age');
      expect(getCell(el, 1, 0)?.textContent).toBe('alice');
      expect(getCell(el, 1, 1)?.textContent).toBe('30');
      for (const r of [0, 1]) {
        for (const c of [0, 1]) {
          const cell = getCell(el, r, c);
          expect(cell?.getAttribute('contenteditable')).toBe('true');
        }
      }
    });

    it('case 4: 空 body は seed として 2 cell(1 行 × 2 列)を提示', () => {
      const el = mountEditor('');
      expect(getCell(el, 0, 0)).not.toBeNull();
      expect(getCell(el, 0, 1)).not.toBeNull();
      expect(getCell(el, 0, 2)).toBeNull();
    });

    it('case 5: hidden textarea[data-pkc-field=body] が常駐(TSV 同期先)', () => {
      const el = mountEditor('{"rows":[["a","b"]]}');
      const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
      expect(ta).not.toBeNull();
      expect(ta!.value).toBe('a\tb');
    });
  });

  describe('cell input → textarea sync', () => {
    it('case 6: cell 編集 → hidden textarea が TSV で sync される', () => {
      const el = mountEditor('{"rows":[["x","y"]]}');
      const cell = getCell(el, 0, 0)!;
      cell.textContent = 'updated';
      dispatchInput(cell);
      const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
      expect(ta.value).toBe('updated\ty');
    });

    it('case 7: 複数 cell 連続編集でも sync 維持', () => {
      const el = mountEditor('{"rows":[["a","b"],["1","2"]]}');
      const c01 = getCell(el, 0, 1)!;
      c01.textContent = 'B';
      dispatchInput(c01);
      const c11 = getCell(el, 1, 1)!;
      c11.textContent = '22';
      dispatchInput(c11);
      const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
      expect(ta.value).toBe('a\tB\n1\t22');
    });

    it('case 8: textarea の input event が dirty 経路へ bubbles', () => {
      const el = mountEditor('{"rows":[["a"]]}');
      let inputFired = false;
      el.addEventListener('input', (e) => {
        if (e.target instanceof HTMLTextAreaElement) inputFired = true;
      });
      const cell = getCell(el, 0, 0)!;
      cell.textContent = 'changed';
      dispatchInput(cell);
      expect(inputFired).toBe(true);
    });
  });

  describe('Tab / Enter cell navigation', () => {
    it('case 9: Tab で右隣 cell へ focus 移動', () => {
      const el = mountEditor('{"rows":[["a","b","c"]]}');
      const cell = getCell(el, 0, 0)!;
      cell.focus();
      const ev = dispatchKeyDown(cell, 'Tab');
      expect(ev.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(getCell(el, 0, 1));
    });

    it('case 10: Shift+Tab で左隣 cell へ focus 移動', () => {
      const el = mountEditor('{"rows":[["a","b","c"]]}');
      const cell = getCell(el, 0, 2)!;
      cell.focus();
      dispatchKeyDown(cell, 'Tab', { shift: true });
      expect(document.activeElement).toBe(getCell(el, 0, 1));
    });

    it('case 11: Enter で下行同 col へ focus 移動', () => {
      const el = mountEditor('{"rows":[["a"],["1"]]}');
      const cell = getCell(el, 0, 0)!;
      cell.focus();
      dispatchKeyDown(cell, 'Enter');
      expect(document.activeElement).toBe(getCell(el, 1, 0));
    });

    it('case 12: Shift+Enter で上行同 col', () => {
      const el = mountEditor('{"rows":[["a"],["1"]]}');
      const cell = getCell(el, 1, 0)!;
      cell.focus();
      dispatchKeyDown(cell, 'Enter', { shift: true });
      expect(document.activeElement).toBe(getCell(el, 0, 0));
    });

    it('case 13: Enter で末尾行を超えると新 row 追加 + 自動 focus', () => {
      const el = mountEditor('{"rows":[["a"]]}');
      const cell = getCell(el, 0, 0)!;
      cell.focus();
      dispatchKeyDown(cell, 'Enter');
      // 新 row(1)が作られ、(1, 0) に focus
      expect(getCell(el, 1, 0)).not.toBeNull();
      expect(document.activeElement).toBe(getCell(el, 1, 0));
    });

    it('case 14: Tab で行末を超えると次行先頭 / 末尾行末では新 row 追加', () => {
      const el = mountEditor('{"rows":[["a","b"]]}');
      const cell = getCell(el, 0, 1)!;
      cell.focus();
      dispatchKeyDown(cell, 'Tab');
      // 行末 → 次行先頭。次行が無いので新 row 追加 + (1, 0) focus
      expect(getCell(el, 1, 0)).not.toBeNull();
      expect(document.activeElement).toBe(getCell(el, 1, 0));
    });
  });

  describe('toolbar buttons', () => {
    it('case 15: + 行 button click で末尾に空 row 追加 + 先頭 cell focus', () => {
      const el = mountEditor('{"rows":[["a","b"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-row"]')!;
      btn.click();
      const newCell = getCell(el, 1, 0);
      expect(newCell).not.toBeNull();
      expect(newCell?.textContent).toBe('');
      expect(document.activeElement).toBe(newCell);
    });

    it('case 16: + 列 button click で全行に空 cell 追加', () => {
      const el = mountEditor('{"rows":[["a","b"],["1","2"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-column"]')!;
      btn.click();
      expect(getCell(el, 0, 2)?.textContent).toBe('');
      expect(getCell(el, 1, 2)?.textContent).toBe('');
      // 行 / 列の data 不変
      expect(getCell(el, 0, 0)?.textContent).toBe('a');
      expect(getCell(el, 1, 1)?.textContent).toBe('2');
    });

    it('case 17: TSV ⇄ Grid toggle で `data-pkc-spreadsheet-mode` が切替', () => {
      const el = mountEditor('{"rows":[["a"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-toggle-tsv"]')!;
      expect(el.getAttribute('data-pkc-spreadsheet-mode')).toBe('grid');
      btn.click();
      expect(el.getAttribute('data-pkc-spreadsheet-mode')).toBe('tsv');
      btn.click();
      expect(el.getAttribute('data-pkc-spreadsheet-mode')).toBe('grid');
    });

    it('case 18: TSV 編集 → Grid 戻し で grid が TSV 内容を反映', () => {
      const el = mountEditor('{"rows":[["a","b"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-toggle-tsv"]')!;
      btn.click();
      // TSV mode で textarea 編集
      const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
      ta.value = 'x\ty\nfoo\tbar';
      // Grid mode に戻し
      btn.click();
      expect(el.getAttribute('data-pkc-spreadsheet-mode')).toBe('grid');
      expect(getCell(el, 0, 0)?.textContent).toBe('x');
      expect(getCell(el, 0, 1)?.textContent).toBe('y');
      expect(getCell(el, 1, 0)?.textContent).toBe('foo');
      expect(getCell(el, 1, 1)?.textContent).toBe('bar');
    });
  });

  describe('collectBody round-trip', () => {
    it('case 19: grid → collectBody で JSON body が組み立てられる', () => {
      const el = mountEditor('{"rows":[["a","b"],["1","2"]]}');
      const cell = getCell(el, 1, 0)!;
      cell.textContent = '99';
      dispatchInput(cell);
      const json = spreadsheetPresenter.collectBody(el);
      expect(JSON.parse(json)).toEqual({ rows: [['a', 'b'], ['99', '2']] });
    });

    it('case 20: TSV mode で textarea 編集 → collectBody も TSV 経路から build', () => {
      const el = mountEditor('{"rows":[["a"]]}');
      const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-toggle-tsv"]')!;
      btn.click(); // TSV mode
      const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
      ta.value = 'h1\th2\nv1\tv2';
      const json = spreadsheetPresenter.collectBody(el);
      expect(JSON.parse(json)).toEqual({ rows: [['h1', 'h2'], ['v1', 'v2']] });
    });

    it('case 21: 編集 round-trip(render → 編集 → collectBody → 再 render)', () => {
      const el = mountEditor('{"rows":[["a"]]}');
      const cell = getCell(el, 0, 0)!;
      cell.textContent = 'rt';
      dispatchInput(cell);
      const json = spreadsheetPresenter.collectBody(el);
      // 新 entry で再 render
      const el2 = mountEditor(json);
      expect(getCell(el2, 0, 0)?.textContent).toBe('rt');
    });
  });

  describe('safety / XSS', () => {
    it('case 22: cell に script を流し込んでも textContent 経由で safe', () => {
      const el = mountEditor('{"rows":[["<script>alert(1)</script>"]]}');
      const cell = getCell(el, 0, 0)!;
      // children に <script> は無い(text node のみ)
      expect(cell.children.length).toBe(0);
      expect(cell.textContent).toBe('<script>alert(1)</script>');
    });
  });
});

describe('__testHelpers exports', () => {
  it('buildGridTable / readBodyFromGrid / addRow / addColumn / focusCell が export されている', () => {
    expect(typeof __testHelpers.buildGridTable).toBe('function');
    expect(typeof __testHelpers.readBodyFromGrid).toBe('function');
    expect(typeof __testHelpers.addRow).toBe('function');
    expect(typeof __testHelpers.addColumn).toBe('function');
    expect(typeof __testHelpers.focusCell).toBe('function');
  });
});
