/**
 * @vitest-environment happy-dom
 *
 * 領域 10-4 spreadsheet archetype Phase 1(2026-05-28、user direction #4):
 * adapter/ui/spreadsheet-presenter.ts の DetailPresenter 動作を verify。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-05-28T00:00:00Z';

function mkEntry(body: string): Entry {
  return {
    lid: 's1',
    title: 'Sheet',
    body,
    archetype: 'spreadsheet',
    created_at: TS,
    updated_at: TS,
  };
}

describe('spreadsheetPresenter.renderBody', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: 通常 body は <table> + <thead>(1 行目)+ <tbody>(残)を生成', () => {
    const entry = mkEntry('{"rows":[["name","age"],["alice","30"],["bob","25"]]}');
    const el = spreadsheetPresenter.renderBody(entry);
    const table = el.querySelector('table.pkc-spreadsheet');
    expect(table).not.toBeNull();
    const ths = table!.querySelectorAll('thead th');
    expect(ths.length).toBe(2);
    expect(ths[0]?.textContent).toBe('name');
    expect(ths[1]?.textContent).toBe('age');
    const trs = table!.querySelectorAll('tbody tr');
    expect(trs.length).toBe(2);
    expect(trs[0]?.querySelectorAll('td')[0]?.textContent).toBe('alice');
    expect(trs[1]?.querySelectorAll('td')[1]?.textContent).toBe('25');
  });

  it('case 2: 空 body は placeholder caption を表示', () => {
    const entry = mkEntry('');
    const el = spreadsheetPresenter.renderBody(entry);
    const caption = el.querySelector('.pkc-spreadsheet-empty');
    expect(caption).not.toBeNull();
    expect(caption?.textContent).toContain('空');
  });

  it('case 3: ragged row は最大列数で正規化(短い行は空 td 補完)', () => {
    const entry = mkEntry('{"rows":[["a","b","c"],["1","2"]]}');
    const el = spreadsheetPresenter.renderBody(entry);
    const tds = el.querySelectorAll('tbody tr td');
    expect(tds.length).toBe(3); // 1 行目 header、2 行目 ragged だが 3 cell に padding
    expect(tds[0]?.textContent).toBe('1');
    expect(tds[1]?.textContent).toBe('2');
    expect(tds[2]?.textContent).toBe(''); // padding
  });

  it('case 4: textContent 経由なので HTML escape は自動(XSS safe)', () => {
    const entry = mkEntry('{"rows":[["<script>alert(1)</script>"]]}');
    const el = spreadsheetPresenter.renderBody(entry);
    const th = el.querySelector('thead th');
    // 子 element は <script> ではなく text node のみ
    expect(th?.children.length).toBe(0);
    expect(th?.textContent).toBe('<script>alert(1)</script>');
  });

  it('case 5: 不正 JSON でも throw せず空 placeholder', () => {
    const entry = mkEntry('not-json');
    expect(() => spreadsheetPresenter.renderBody(entry)).not.toThrow();
    const el = spreadsheetPresenter.renderBody(entry);
    expect(el.querySelector('.pkc-spreadsheet-empty')).not.toBeNull();
  });

  it('case 6: data-pkc-region="spreadsheet-table" を付与', () => {
    const entry = mkEntry('{"rows":[["a"]]}');
    const el = spreadsheetPresenter.renderBody(entry);
    const table = el.querySelector('[data-pkc-region="spreadsheet-table"]');
    expect(table).not.toBeNull();
  });
});

describe('spreadsheetPresenter.renderEditorBody', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: textarea[data-pkc-field=body] が emit され、TSV value が入る', () => {
    const entry = mkEntry('{"rows":[["a","b"],["1","2"]]}');
    const el = spreadsheetPresenter.renderEditorBody(entry);
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(ta).not.toBeNull();
    expect(ta!.value).toBe('a\tb\n1\t2');
  });

  it('case 2: Phase 2 grid editor の toolbar が表示される(編集 hint <p> は Phase 2 で toolbar に置換)', () => {
    const entry = mkEntry('');
    const el = spreadsheetPresenter.renderEditorBody(entry);
    const toolbar = el.querySelector('.pkc-spreadsheet-toolbar');
    expect(toolbar).not.toBeNull();
    expect(el.querySelector('[data-pkc-action="spreadsheet-toggle-tsv"]')).not.toBeNull();
  });

  it('case 3: 空 body は Phase 2 で seed として 2 空 cell(1 行 × 2 列)を提示', () => {
    const entry = mkEntry('');
    const el = spreadsheetPresenter.renderEditorBody(entry);
    const ta = el.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    // 2 cell seed → TSV `\t`(空文字列 × 2 を tab で join)
    expect(ta?.value).toBe('\t');
  });
});

describe('spreadsheetPresenter.collectBody', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: textarea TSV から JSON body を組み立て', () => {
    const root = document.createElement('div');
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    ta.value = 'a\tb\n1\t2';
    root.appendChild(ta);
    const body = spreadsheetPresenter.collectBody(root);
    expect(JSON.parse(body)).toEqual({ rows: [['a', 'b'], ['1', '2']] });
  });

  it('case 2: textarea 無し → 空 body', () => {
    const root = document.createElement('div');
    const body = spreadsheetPresenter.collectBody(root);
    expect(JSON.parse(body)).toEqual({ rows: [] });
  });

  it('case 3: 編集 round-trip(renderEditor → collectBody)', () => {
    const entry = mkEntry('{"rows":[["x","y"],["10","20"]]}');
    const editorEl = spreadsheetPresenter.renderEditorBody(entry);
    document.body.appendChild(editorEl);
    const collected = spreadsheetPresenter.collectBody(editorEl);
    expect(JSON.parse(collected)).toEqual({ rows: [['x', 'y'], ['10', '20']] });
  });
});
