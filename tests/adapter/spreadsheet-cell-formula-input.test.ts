/**
 * @vitest-environment happy-dom
 *
 * user direction 2026-06-03「関数入力ができないのはセル入力画面での話、TSV モードに
 * 直打ちならできました」 を repro するための regression test。
 * セル DOM の input → focusout を simulate して、formula が evaluator を通って
 * 評価値で表示されることを assert する。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-06-03T00:00:00Z';

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

function cell(el: HTMLElement, r: number, c: number): HTMLElement {
  return el.querySelector<HTMLElement>(`[contenteditable][data-row="${r}"][data-col="${c}"]`)!;
}

describe('spreadsheet cell formula input(セル直接入力)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: 空 grid の cell A2 に "=A1+B1" を入力 → focusout 後に "0" 表示 + raw 保持', () => {
    const el = mountEditor('');
    // A1 (0,0) と B1 (0,1) は空(20x12 noHeader seed)。A2 = (1,0) に formula 入力。
    const c10 = cell(el, 1, 0);
    c10.focus();
    c10.textContent = '=A1+B1';
    c10.dispatchEvent(new Event('input', { bubbles: true }));
    c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    // raw が data-pkc-raw に保持される
    expect(c10.getAttribute('data-pkc-raw')).toBe('=A1+B1');
    // 表示は評価値(A1=0, B1=0 なので 0)
    expect(c10.textContent).toBe('0');
  });

  it('case 2: cell A1 と B1 に数値入力後、A2 に "=A1+B1" → A2 表示が "30"', () => {
    const el = mountEditor('');
    const c00 = cell(el, 0, 0);
    c00.focus();
    c00.textContent = '10';
    c00.dispatchEvent(new Event('input', { bubbles: true }));
    c00.dispatchEvent(new Event('focusout', { bubbles: true }));
    const c01 = cell(el, 0, 1);
    c01.focus();
    c01.textContent = '20';
    c01.dispatchEvent(new Event('input', { bubbles: true }));
    c01.dispatchEvent(new Event('focusout', { bubbles: true }));
    const c10 = cell(el, 1, 0);
    c10.focus();
    c10.textContent = '=A1+B1';
    c10.dispatchEvent(new Event('input', { bubbles: true }));
    c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(c10.textContent).toBe('30');
    expect(c10.getAttribute('data-pkc-raw')).toBe('=A1+B1');
  });

  it('case 3: formula cell に focusin → raw 表示、再 focusout → 評価値表示(toggle)', () => {
    const el = mountEditor('');
    const c00 = cell(el, 0, 0);
    c00.focus(); c00.textContent = '5'; c00.dispatchEvent(new Event('input', { bubbles: true })); c00.dispatchEvent(new Event('focusout', { bubbles: true }));
    const c10 = cell(el, 1, 0);
    c10.focus(); c10.textContent = '=A1*2'; c10.dispatchEvent(new Event('input', { bubbles: true })); c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(c10.textContent).toBe('10');
    // 再 focus(編集再開) → raw 表示
    c10.focus();
    c10.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(c10.textContent).toBe('=A1*2');
    // 編集無しで blur → 評価値に戻る
    c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(c10.textContent).toBe('10');
  });

  it('case 4: collectBody は raw formula 文字列を含んだ JSON を返す(評価値ではない)', () => {
    const el = mountEditor('');
    const c10 = cell(el, 1, 0);
    c10.focus(); c10.textContent = '=A1+B1'; c10.dispatchEvent(new Event('input', { bubbles: true })); c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    const json = spreadsheetPresenter.collectBody(el);
    const parsed = JSON.parse(json);
    expect(parsed.rows[1][0]).toBe('=A1+B1');
  });

  it('case 5: 保存 → 再 open(parse → renderEditorBody)で formula 評価値表示が維持される', () => {
    // 1 回 mount + 入力
    let el = mountEditor('');
    const c10 = cell(el, 1, 0);
    c10.focus(); c10.textContent = '=10+20'; c10.dispatchEvent(new Event('input', { bubbles: true })); c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    const body = spreadsheetPresenter.collectBody(el);
    // 別 entry として再 mount(save → load の round-trip)
    el = mountEditor(body);
    const c10b = cell(el, 1, 0);
    expect(c10b.textContent).toBe('30');
    expect(c10b.getAttribute('data-pkc-raw')).toBe('=10+20');
  });

  it('case 6: address reference =A1 単独でも値を取れる', () => {
    const el = mountEditor('');
    const c00 = cell(el, 0, 0);
    c00.focus(); c00.textContent = 'hello'; c00.dispatchEvent(new Event('input', { bubbles: true })); c00.dispatchEvent(new Event('focusout', { bubbles: true }));
    const c10 = cell(el, 1, 0);
    c10.focus(); c10.textContent = '=A1'; c10.dispatchEvent(new Event('input', { bubbles: true })); c10.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(c10.textContent).toBe('hello');
  });

  it('case 7: SUM range =SUM(A1:A3) でも cell 入力経由で評価', () => {
    const el = mountEditor('');
    for (let r = 0; r < 3; r++) {
      const c = cell(el, r, 0);
      c.focus(); c.textContent = String((r + 1) * 10); c.dispatchEvent(new Event('input', { bubbles: true })); c.dispatchEvent(new Event('focusout', { bubbles: true }));
    }
    const cTotal = cell(el, 3, 0);
    cTotal.focus(); cTotal.textContent = '=SUM(A1:A3)'; cTotal.dispatchEvent(new Event('input', { bubbles: true })); cTotal.dispatchEvent(new Event('focusout', { bubbles: true }));
    expect(cTotal.textContent).toBe('60');
  });
});
