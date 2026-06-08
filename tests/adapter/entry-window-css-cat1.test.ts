/**
 * @vitest-environment happy-dom
 *
 * S4 entry-window critical PKC dialect CSS mirror Phase 1 test
 * (pgc-93、audit pgc-77 Gap-13 cat-1)。
 *
 * `buildWindowHtml` の inline `<style>` block に :::section / :::details /
 * :::figure / :::quote 関連 CSS rule が含まれているか verify。
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('S4 inline CSS mirror: section / details / figure / quote', () => {
  let html = '';

  beforeAll(async () => {
    // entry-window モジュールの buildWindowHtml を呼んで生成 HTML を採取
    const mod = await import('../../src/adapter/ui/entry-window');
    // openEntryWindow の build path を直接呼ばないため、export している
    // 関数は無いが、エクスポートを通じて build を試みる。
    // 簡易には rendered-viewer に inline mirror があるか直接確認する形
    // を取りたいが、entry-window は inline html を build する関数
    // (buildWindowHtml)が export されていない。
    //
    // 代替策:pkcRenderEntryPreview を window に expose する副作用が
    // 走るので、その副作用で構成された window から本物の inline CSS
    // を含む HTML をエミュレートする ── ただし buildWindowHtml は
    // export されていないので、本 unit では一時的に test 用 export を
    // 使う代わりに module の source HTML を直接 import で読まない方針。
    //
    // 現実的な test:`src/adapter/ui/entry-window.ts` の source file
    // を fs.readFileSync で読み、対応する CSS rule 文字列が含まれて
    // いるかを確認する(string-grep style)。
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.resolve(__dirname, '../../src/adapter/ui/entry-window.ts');
    html = await fs.readFile(file, 'utf8');
    // 副作用回避(import 既に終了済)
    void mod;
  });

  it('contains pkc-section-callout base rule', () => {
    expect(html).toContain('.pkc-section-callout');
    expect(html).toContain('padding: 0.5rem 0.75rem');
  });

  it('contains all 8 role variants', () => {
    for (const role of ['summary', 'info', 'note', 'tip', 'important', 'warning', 'caution', 'danger']) {
      expect(html).toContain(`.pkc-section-${role}`);
    }
  });

  it('contains section-break with role variants', () => {
    expect(html).toContain('.pkc-section-break');
    expect(html).toContain('data-pkc-role="cover"');
    expect(html).toContain('data-pkc-role="body"');
  });

  it('contains pkc-details + pkc-details-summary rules', () => {
    expect(html).toContain('.pkc-details ');
    expect(html).toContain('summary.pkc-details-summary');
  });

  it('contains pkc-fig / pkc-fig-caption / pkc-fig-ref rules', () => {
    expect(html).toContain('.pkc-fig ');
    expect(html).toContain('.pkc-fig-caption');
    expect(html).toContain('.pkc-fig-ref');
  });

  it('contains pkc-quote-citation + author/year pseudo', () => {
    expect(html).toContain('blockquote.pkc-quote-citation');
    expect(html).toContain('data-pkc-quote-author');
    expect(html).toContain('data-pkc-quote-year');
  });
});

