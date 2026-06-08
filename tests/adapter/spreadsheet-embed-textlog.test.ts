/**
 * @vitest-environment happy-dom
 *
 * user direction 2026-06-03「テキストログに対する埋め込みもできてない、チャートも
 * 表示されてない、言われたところだけじゃなくてちゃんと関連してる場所も直して」 fix
 * の unit gate。textlog log body に含まれる `![](entry:spreadsheet-LID)` が
 * spreadsheet embed body(table + chart canvas)に展開されることを確認。
 *
 * 視覚 parity は smoke で別途 gate(本 file は DOM 構造の検証)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import type { Entry } from '@core/model/record';

const TS = '2026-06-03T00:00:00Z';

function mkSheetEntry(lid: string, withChart: boolean): Entry {
  const body: { rows: string[][]; charts?: unknown[]; noHeader?: boolean } = {
    rows: [['x', 'y'], ['1', '10'], ['2', '20']],
  };
  if (withChart) {
    body.charts = [{ id: 'c1', kind: 'bar', title: 'Test', xCol: 0, yCols: [1], startRow: 1 }];
  }
  return {
    lid, title: 'Sheet', body: JSON.stringify(body),
    archetype: 'spreadsheet', created_at: TS, updated_at: TS,
  };
}

function mkTextlogEntry(lid: string, logBody: string): Entry {
  // textlog body 形式:`{ entries: [{ id, text, createdAt, flags }] }`(textlog-body.ts)
  const body = {
    entries: [{
      id: 'log-1', text: logBody, createdAt: TS, flags: [],
    }],
  };
  return {
    lid, title: 'Log', body: JSON.stringify(body),
    archetype: 'textlog', created_at: TS, updated_at: TS,
  };
}

describe('textlog log body に spreadsheet embed(`![](entry:sheet)`)', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('case 1: log body の embed が展開されて embed table が log article 内に出る', () => {
    const sheet = mkSheetEntry('sheet-1', false);
    const textlog = mkTextlogEntry('tlog-1', `![sheet](entry:${sheet.lid})`);
    const el = textlogPresenter.renderBody(textlog, undefined, undefined, undefined, [sheet, textlog], 'c1');
    document.body.appendChild(el);
    // log article 内に spreadsheet embed table がある
    const table = el.querySelector('.pkc-textlog-log .pkc-spreadsheet-embed table.pkc-spreadsheet');
    expect(table).not.toBeNull();
  });

  it('case 2: chart 付き spreadsheet 埋込 → log 内に chart canvas も含む', () => {
    const sheet = mkSheetEntry('sheet-1', true);
    const textlog = mkTextlogEntry('tlog-1', `![sheet](entry:${sheet.lid})`);
    const el = textlogPresenter.renderBody(textlog, undefined, undefined, undefined, [sheet, textlog], 'c1');
    document.body.appendChild(el);
    // canvas 要素が embed 内に
    const canvas = el.querySelector('.pkc-textlog-log .pkc-spreadsheet-embed canvas.pkc-spreadsheet-chart-canvas');
    expect(canvas).not.toBeNull();
  });

  it('case 3: seamless 埋込もログ内で section header 抑止', () => {
    const sheet = mkSheetEntry('sheet-1', false);
    const textlog = mkTextlogEntry('tlog-1', `![seamless](entry:${sheet.lid})`);
    const el = textlogPresenter.renderBody(textlog, undefined, undefined, undefined, [sheet, textlog], 'c1');
    document.body.appendChild(el);
    const seamless = el.querySelector('.pkc-textlog-log section.pkc-transclusion-seamless');
    expect(seamless).not.toBeNull();
  });

  it('case 4: 不要な toolbar / export button は textlog embed にも出ない', () => {
    const sheet = mkSheetEntry('sheet-1', false);
    const textlog = mkTextlogEntry('tlog-1', `![](entry:${sheet.lid})`);
    const el = textlogPresenter.renderBody(textlog, undefined, undefined, undefined, [sheet, textlog], 'c1');
    document.body.appendChild(el);
    expect(el.querySelector('.pkc-spreadsheet-embed .pkc-spreadsheet-toolbar')).toBeNull();
    expect(el.querySelector('.pkc-spreadsheet-embed [data-pkc-action="spreadsheet-export-csv"]')).toBeNull();
    expect(el.querySelector('.pkc-spreadsheet-embed [data-pkc-action="spreadsheet-export-xlsx"]')).toBeNull();
  });
});
