/**
 * @vitest-environment happy-dom
 *
 * user direction 2026-06-03「埋め込みの挙動が中途半端」 を受けた embed body の
 * regression gate:
 *   - 不要なボタン(toolbar / export)が embed view に出ない
 *   - chart canvas は embed でも出る(Chart.js init は rAF 経由で defer)
 *   - data-pkc-region で chart 領域が識別できる
 *   - transclusion 経路で center pane の text body が spreadsheet を展開する
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderSpreadsheetEmbedBody, spreadsheetPresenter } from '@adapter/ui/spreadsheet-presenter';
import { expandTransclusions } from '@adapter/ui/transclusion';
import type { Entry } from '@core/model/record';

const TS = '2026-06-03T00:00:00Z';

function mkEntry(lid: string, body: string, archetype: 'spreadsheet' | 'text' = 'spreadsheet'): Entry {
  return { lid, title: 'Test', body, archetype, created_at: TS, updated_at: TS };
}

describe('spreadsheet embed body(toolbar 除外 + chart 描画)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('case 1: embed body は table を含む、ただし toolbar / export button は含まない', () => {
    const entry = mkEntry('s1', '{"rows":[["a","b"],["1","2"]]}');
    const el = renderSpreadsheetEmbedBody(entry);
    expect(el.querySelector('table.pkc-spreadsheet')).not.toBeNull();
    // 不要 toolbar 排除
    expect(el.querySelector('.pkc-spreadsheet-toolbar')).toBeNull();
    expect(el.querySelector('[data-pkc-action="spreadsheet-export-csv"]')).toBeNull();
    expect(el.querySelector('[data-pkc-action="spreadsheet-export-xlsx"]')).toBeNull();
    expect(el.querySelector('[data-pkc-action="spreadsheet-copy-embed"]')).toBeNull();
  });

  it('case 2: chart metadata がある entry → embed body にも chart canvas が出る', () => {
    const body = JSON.stringify({
      rows: [['x', 'y'], ['1', '10'], ['2', '20']],
      charts: [{ id: 'c1', kind: 'bar', title: '埋込 chart', xCol: 0, yCols: [1], startRow: 1 }],
    });
    const el = renderSpreadsheetEmbedBody(mkEntry('s1', body));
    expect(el.querySelector('[data-pkc-region="spreadsheet-charts"]')).not.toBeNull();
    expect(el.querySelector('canvas.pkc-spreadsheet-chart-canvas')).not.toBeNull();
    expect(el.querySelector('figcaption')?.textContent).toBe('埋込 chart');
  });

  it('case 3: data-pkc-spreadsheet-lid が embed wrapper に付く(navigate-back 用)', () => {
    const el = renderSpreadsheetEmbedBody(mkEntry('s1', '{"rows":[["a"]]}'));
    expect(el.getAttribute('data-pkc-spreadsheet-lid')).toBe('s1');
  });

  it('case 4: embed charts container は pkc-spreadsheet-charts-embed class で identify', () => {
    const body = JSON.stringify({
      rows: [['x', 'y'], ['1', '10']],
      charts: [{ id: 'c1', kind: 'pie', title: '', xCol: 0, yCols: [1], startRow: 1 }],
    });
    const el = renderSpreadsheetEmbedBody(mkEntry('s1', body));
    expect(el.querySelector('.pkc-spreadsheet-charts-embed')).not.toBeNull();
  });

  it('case 5: expandTransclusions 経由で text body 内の `![](entry:s1)` が embed 展開される', () => {
    // text entry の body に `![](entry:s1)` という markdown image を含む。
    // markdown-render が <div class="pkc-transclusion-placeholder" data-pkc-embed-ref="entry:s1"> を吐く想定。
    // 実 markdown rendering は別 path なので、ここでは placeholder を直接組み立てて
    // expandTransclusions が spreadsheet を展開することを gate。
    document.body.innerHTML = '<div id="container"><div class="pkc-transclusion-placeholder" data-pkc-embed-ref="entry:s1" data-pkc-embed-alt=""></div></div>';
    const root = document.querySelector<HTMLElement>('#container')!;
    expandTransclusions(root, {
      entries: [mkEntry('s1', '{"rows":[["x","y"],["1","2"]]}')],
      hostLid: 'host',
    });
    // placeholder は section に置換される
    expect(root.querySelector('.pkc-transclusion-placeholder')).toBeNull();
    const section = root.querySelector('section[data-pkc-embed-archetype="spreadsheet"], section.pkc-transclusion');
    expect(section).not.toBeNull();
    // section 内に spreadsheet table が含まれる
    expect(root.querySelector('table.pkc-spreadsheet')).not.toBeNull();
    // section 内に toolbar が含まれない
    expect(root.querySelector('.pkc-spreadsheet-toolbar')).toBeNull();
  });

  it('case 6: full renderBody(view mode)は引き続き toolbar を出す ── embed と分離されている', () => {
    const entry = mkEntry('s1', '{"rows":[["a"]]}');
    const fullView = spreadsheetPresenter.renderBody(entry);
    // view mode toolbar(export / 埋込)は存在
    expect(fullView.querySelector('[data-pkc-action="spreadsheet-export-csv"]')).not.toBeNull();
    expect(fullView.querySelector('[data-pkc-action="spreadsheet-copy-embed"]')).not.toBeNull();
  });
});
