/**
 * @vitest-environment happy-dom
 *
 * spreadsheet の「読み取れない body」を無言で空シートに置き換えない。
 *
 * 背景(視覚監査 2026-07-25、docs/development/visual-audit-2026-07-25.md §2 A5):
 * `parseSpreadsheetBody` は「空文字」「不正 JSON」「object でない」
 * 「rows が配列でない」を全部 `{ rows: [] }` に潰していた。画面上は
 * **意図的に空のシートと完全に同じ**に見えるので、user は壊れていることに
 * 気づけない。そのまま 1 セル編集して保存すると `renderEditorBody` が seed した
 * 20x12 の空グリッドが `collectBody` から返り、**元 body を空で上書き**する。
 * 復旧できたかもしれないデータがそこで失われる。
 *
 * 本 test が固定する契約:
 *   1. 壊れた body は編集画面で **元 raw のまま collectBody から返る**(no-op 保存)
 *   2. 「空のシートで作り直す」を押した後だけ grid 由来の新 body になる
 *   3. 正常系(空 body を含む)には一切の副作用が無い
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import { createDispatcher } from '@adapter/state/dispatcher';
import type { Entry } from '@core/model/record';
import type { Container } from '@core/model/container';

const TS = '2026-01-01T00:00:00Z';

function mkEntry(body: string): Entry {
  return { lid: 'sheet1', title: 'シート', body, archetype: 'spreadsheet', created_at: TS, updated_at: TS };
}

/** renderEditorBody の結果を document に載せて collectBody に渡す。 */
function editThenCollect(body: string, beforeCollect?: (w: HTMLElement) => void): string {
  const el = spreadsheetPresenter.renderEditorBody!(mkEntry(body));
  document.body.appendChild(el);
  beforeCollect?.(el);
  return spreadsheetPresenter.collectBody!(el);
}

describe('A5 spreadsheet: 読み取れない body を空シートで上書きしない', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('不正 JSON の body は編集 → 保存で元 raw のまま返る(破壊しない)', () => {
    const broken = '{ "cells": { "A1": "x" } }'; // rows が無い = 読めない
    const out = editThenCollect(broken);
    expect(out, '壊れた body が空グリッドで上書きされている').toBe(broken);
  });

  it('JSON ですらない body も元 raw のまま返る', () => {
    const broken = 'これは JSON ではありません';
    expect(editThenCollect(broken)).toBe(broken);
  });

  it('編集画面に「読み取れませんでした」警告が出る(空シートと区別できる)', () => {
    const el = spreadsheetPresenter.renderEditorBody!(mkEntry('not json'));
    document.body.appendChild(el);
    const warn = el.querySelector('[data-pkc-region="spreadsheet-parse-warning"]');
    expect(warn, '壊れていることが画面に出ていない').not.toBeNull();
    expect(warn?.textContent ?? '').toContain('空のシートではありません');
    // 元データが保持されることを user に伝える
    expect(warn?.textContent ?? '').toContain('失われません');
  });

  it('閲覧画面にも警告が出る(表は従来どおり描画される)', () => {
    const el = spreadsheetPresenter.renderBody(mkEntry('{"rows":"oops"}'));
    document.body.appendChild(el);
    expect(el.querySelector('[data-pkc-region="spreadsheet-parse-warning"]')).not.toBeNull();
    // 既存挙動(空グリッドは出す)は維持 ── 表を消すと別の退行になる
    expect(el.querySelector('table')).not.toBeNull();
  });

  it('「空のシートで作り直す」を押した後だけ grid 由来の新 body になる', () => {
    const broken = '{ "cells": {} }';
    const out = editThenCollect(broken, (el) => {
      const btn = el.querySelector<HTMLElement>('[data-pkc-action="spreadsheet-discard-broken-body"]');
      expect(btn, '破棄の導線が無い(保存されない体験だけが残る)').not.toBeNull();
      btn!.click();
    });
    expect(out).not.toBe(broken);
    const parsed = JSON.parse(out) as { rows: string[][] };
    expect(Array.isArray(parsed.rows)).toBe(true);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it('正常な body には副作用が無い(退避属性も警告も付かない)', () => {
    const good = '{"rows":[["a","b"],["c","d"]]}';
    const el = spreadsheetPresenter.renderEditorBody!(mkEntry(good));
    document.body.appendChild(el);
    expect(el.getAttribute('data-pkc-spreadsheet-original-body')).toBeNull();
    expect(el.getAttribute('data-pkc-spreadsheet-parse-error')).toBeNull();
    expect(el.querySelector('[data-pkc-region="spreadsheet-parse-warning"]')).toBeNull();
    const out = spreadsheetPresenter.collectBody!(el);
    expect(JSON.parse(out)).toEqual({ rows: [['a', 'b'], ['c', 'd']] });
  });

  it('空 body は「正常」── 従来どおり seed grid で編集できる(警告なし)', () => {
    const el = spreadsheetPresenter.renderEditorBody!(mkEntry(''));
    document.body.appendChild(el);
    expect(el.querySelector('[data-pkc-region="spreadsheet-parse-warning"]')).toBeNull();
    expect(el.getAttribute('data-pkc-spreadsheet-original-body')).toBeNull();
    const out = spreadsheetPresenter.collectBody!(el);
    const parsed = JSON.parse(out) as { rows: string[][] };
    expect(parsed.rows.length, '空 body の seed 挙動が変わっている').toBeGreaterThan(0);
  });

  it('end-to-end:BEGIN_EDIT → collectBody → COMMIT_EDIT で container の body が壊れない', () => {
    // 実際の保存経路まで通して「データが残る」ことを確かめる。
    // presenter 単体の assertion だけだと reducer 側で潰れる可能性を排除できない。
    const broken = '{ "cells": { "A1": "壊れていない元データ" } }';
    const c: Container = {
      meta: { container_id: 't', title: 'T', created_at: TS, updated_at: TS, schema_version: 1 },
      entries: [mkEntry(broken)],
      relations: [], revisions: [], assets: {},
    };
    const d = createDispatcher();
    d.dispatch({ type: 'SYS_INIT_COMPLETE', container: c });
    d.dispatch({ type: 'SELECT_ENTRY', lid: 'sheet1' });
    d.dispatch({ type: 'BEGIN_EDIT', lid: 'sheet1' });

    const el = spreadsheetPresenter.renderEditorBody!(mkEntry(broken));
    document.body.appendChild(el);
    const collected = spreadsheetPresenter.collectBody!(el);
    d.dispatch({ type: 'COMMIT_EDIT', lid: 'sheet1', title: 'シート', body: collected });

    const saved = d.getState().container!.entries.find((e) => e.lid === 'sheet1')!;
    expect(saved.body, '保存で元データが空シートに置き換わっている').toBe(broken);
  });

  it('editor DOM が差し替わって textarea も grid も無い場合でも空で上書きしない', () => {
    const broken = '{"nope":1}';
    const el = spreadsheetPresenter.renderEditorBody!(mkEntry(broken));
    document.body.appendChild(el);
    // grid / textarea を消し、破棄も明示していない状態
    el.querySelectorAll('table, textarea').forEach((n) => n.remove());
    el.setAttribute('data-pkc-spreadsheet-recover', 'discard'); // 明示破棄でも…
    el.setAttribute('data-pkc-spreadsheet-mode', 'tsv');
    const out = spreadsheetPresenter.collectBody!(el);
    // …DOM が無いなら退避 raw に戻る(空 body を書き込まない)
    expect(out).toBe(broken);
  });
});
