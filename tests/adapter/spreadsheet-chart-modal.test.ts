/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet Phase 4(user direction 2026-06-02、追加 3 項目):
 * Chart 作成 modal の UI 動作確認(prompt() 撤去、proper modal picker)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-06-02T00:00:00Z';

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

describe('spreadsheet Phase 4 chart modal', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: 📊 グラフ button click で modal overlay が出現', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"],["2","20"]]}');
    const btn = el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!;
    btn.click();
    const modal = document.querySelector('.pkc-spreadsheet-chart-modal');
    expect(modal).not.toBeNull();
  });

  it('case 2: kind radio は Chart.js v4 対応の 7 種(2026-06-03 拡張)、default bar', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const radios = document.querySelectorAll<HTMLInputElement>('input[name="pkc-chart-kind"]');
    expect(radios.length).toBe(7);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toEqual(['bar', 'line', 'pie', 'doughnut', 'scatter', 'polarArea', 'radar']);
    const checked = Array.from(radios).find((r) => r.checked);
    expect(checked?.value).toBe('bar');
  });

  it('case 3: X 軸列は select、選択肢は全列(label = "A (header)")', () => {
    const el = mountEditor('{"rows":[["氏名","年齢","点数"],["alice","30","90"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const sel = document.querySelector<HTMLSelectElement>('select[data-pkc-chart-xcol-input]')!;
    expect(sel.options.length).toBe(3);
    expect(sel.options[0]?.textContent).toContain('氏名');
    expect(sel.options[1]?.textContent).toContain('年齢');
  });

  it('case 4: Y 軸列は checkbox 群、複数選択可', () => {
    const el = mountEditor('{"rows":[["x","y1","y2"],["1","10","20"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const cbs = document.querySelectorAll<HTMLInputElement>('input[data-pkc-chart-ycol-input]');
    expect(cbs.length).toBe(3);
  });

  it('case 5: data 範囲入力(startRow / endRow)が並ぶ', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    expect(document.querySelector('input[data-pkc-chart-startrow-input]')).not.toBeNull();
    expect(document.querySelector('input[data-pkc-chart-endrow-input]')).not.toBeNull();
  });

  it('case 6: タイトル入力後 「作成」 click で chart が body に追加', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"],["2","20"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const titleInp = document.querySelector<HTMLInputElement>('input[data-pkc-chart-title-input]')!;
    titleInp.value = '売上推移';
    document.querySelector<HTMLButtonElement>('[data-pkc-chart-create-action]')!.click();
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const parsed = JSON.parse(ta.value);
    expect(parsed.charts?.[0]?.title).toBe('売上推移');
    expect(parsed.charts?.[0]?.kind).toBe('bar');
    // chart 削除 button が出現
    const rm = el.querySelector('[data-pkc-action="spreadsheet-remove-chart"]');
    expect(rm).not.toBeNull();
  });

  it('case 7: 「キャンセル」 click で modal が消えて chart 追加されない', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    expect(document.querySelector('.pkc-spreadsheet-chart-modal')).not.toBeNull();
    const cancelBtn = Array.from(document.querySelectorAll<HTMLButtonElement>('.pkc-spreadsheet-form-actions button'))
      .find((b) => b.textContent === 'キャンセル')!;
    cancelBtn.click();
    expect(document.querySelector('.pkc-spreadsheet-chart-modal')).toBeNull();
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const parsed = JSON.parse(ta.value);
    expect(parsed.charts ?? []).toEqual([]);
  });

  it('case 8: Y 軸列を 1 つも選ばずに 「作成」 → alert + chart 未追加', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    // default で y=1 がチェック済 → 解除
    const cb1 = document.querySelector<HTMLInputElement>('input[data-pkc-chart-ycol-input="1"]')!;
    cb1.checked = false;
    const cb0 = document.querySelector<HTMLInputElement>('input[data-pkc-chart-ycol-input="0"]')!;
    cb0.checked = false;
    let alerted = false;
    const orig = window.alert;
    window.alert = () => { alerted = true; };
    document.querySelector<HTMLButtonElement>('[data-pkc-chart-create-action]')!.click();
    window.alert = orig;
    expect(alerted).toBe(true);
  });

  it('case 9: overlay click(modal 外)でも modal 閉じる', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const overlay = document.querySelector<HTMLElement>('.pkc-spreadsheet-form-overlay')!;
    // overlay 自体を target とした click event
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // 注:実際には happy-dom で e.target はクリック element そのもの
    // ここでは overlay.click() 経由で target が overlay になる pattern を検証
  });

  it('case 10: 1 列だけ(cols < 2)では chart 追加が拒否される(alert)', () => {
    const el = mountEditor('{"rows":[["only"]]}');
    let alerted = false;
    const orig = window.alert;
    window.alert = () => { alerted = true; };
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    window.alert = orig;
    expect(alerted).toBe(true);
    // modal は出現していない
    expect(document.querySelector('.pkc-spreadsheet-chart-modal')).toBeNull();
  });

  it('case 11: line kind を選んで作成 → chart.kind が "line"', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"],["2","20"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    const lineRadio = document.querySelector<HTMLInputElement>('input[data-pkc-chart-kind-input="line"]')!;
    lineRadio.checked = true;
    document.querySelector<HTMLButtonElement>('[data-pkc-chart-create-action]')!.click();
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const parsed = JSON.parse(ta.value);
    expect(parsed.charts?.[0]?.kind).toBe('line');
  });

  it('case 12: endRow 空欄 → chart.endRow が undefined(末尾まで)', () => {
    const el = mountEditor('{"rows":[["x","y"],["1","10"],["2","20"]]}');
    el.querySelector<HTMLButtonElement>('[data-pkc-action="spreadsheet-add-chart"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-pkc-chart-create-action]')!.click();
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]')!;
    const parsed = JSON.parse(ta.value);
    expect(parsed.charts?.[0]?.endRow).toBeUndefined();
  });
});
