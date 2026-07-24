/**
 * コードブロック・レンダリング標準規約(codeblock-render-standard-2026-07、
 * user 裁定 2026-07-24)の unit test。
 *
 *   無印            = -both の省略形(レンダリング + ソース切替トグル)
 *   <lang>-render   = レンダリングのみ固定(旧 ` ```html-render ` を自然吸収)
 *   <lang>-norender = コードブロックのみ固定
 *
 * registry = html / mermaid / csv / tsv / psv。フラグ制御なし。
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown, parseRenderableFence } from '../../../src/features/markdown/markdown-render';

describe('parseRenderableFence', () => {
  it('無印は mode=both', () => {
    expect(parseRenderableFence('html')).toEqual({ lang: 'html', mode: 'both', rest: '' });
    expect(parseRenderableFence('mermaid')).toEqual({ lang: 'mermaid', mode: 'both', rest: '' });
    expect(parseRenderableFence('csv')).toEqual({ lang: 'csv', mode: 'both', rest: '' });
  });

  it('-render / -norender / -both suffix を分解する', () => {
    expect(parseRenderableFence('html-render')).toEqual({ lang: 'html', mode: 'render', rest: '' });
    expect(parseRenderableFence('mermaid-norender')).toEqual({ lang: 'mermaid', mode: 'norender', rest: '' });
    expect(parseRenderableFence('tsv-both')).toEqual({ lang: 'tsv', mode: 'both', rest: '' });
  });

  it('オプション(noheader 等)は rest に温存される', () => {
    expect(parseRenderableFence('csv-render noheader')).toEqual({ lang: 'csv', mode: 'render', rest: 'noheader' });
    expect(parseRenderableFence('csv noheader')).toEqual({ lang: 'csv', mode: 'both', rest: 'noheader' });
  });

  it('registry 外の言語は null(suffix があっても)', () => {
    expect(parseRenderableFence('js')).toBeNull();
    expect(parseRenderableFence('json-both')).toBeNull();
    expect(parseRenderableFence('html-render-foo')).toBeNull();
    expect(parseRenderableFence('mermaidx')).toBeNull();
    expect(parseRenderableFence('')).toBeNull();
    expect(parseRenderableFence(null)).toBeNull();
  });

  it('大文字小文字は無視(csv 既存挙動と同じ)', () => {
    expect(parseRenderableFence('HTML')).toEqual({ lang: 'html', mode: 'both', rest: '' });
    expect(parseRenderableFence('CSV-NORENDER')).toEqual({ lang: 'csv', mode: 'norender', rest: '' });
  });
});

describe('無印(-both 省略形)の wrapper 構造', () => {
  it('html: iframe + トグル + 隠しソース', () => {
    const html = renderMarkdown('```html\n<h1>x</h1>\n```');
    expect(html).toContain('data-pkc-render-lang="html"');
    expect(html).toContain('data-pkc-render-mode="both"');
    expect(html).toContain('class="pkc-render-toggle-input"');
    expect(html).toContain('class="pkc-render-toggle"');
    expect(html).toContain('class="pkc-render-slot"');
    expect(html).toContain('<iframe');
    expect(html).toContain('class="pkc-render-source"');
    // copy ボタンも host に付く(旧 html-render は bare iframe で copy 不可だった)
    expect(html).toContain('data-pkc-action="copy-md-block"');
  });

  it('mermaid: placeholder + トグル + 隠しソース', () => {
    const html = renderMarkdown('```mermaid\nflowchart TD\n  A --> B\n```');
    expect(html).toContain('data-pkc-render-lang="mermaid"');
    expect(html).toContain('data-pkc-render-mode="both"');
    expect(html).toContain('pkc-mermaid-placeholder');
    expect(html).toContain('data-pkc-mermaid-src=');
    expect(html).toContain('class="pkc-render-toggle-input"');
  });

  it('csv: table + トグル + 隠しソース', () => {
    const html = renderMarkdown('```csv\na,b\n1,2\n```');
    expect(html).toContain('data-pkc-render-lang="csv"');
    expect(html).toContain('data-pkc-render-mode="both"');
    expect(html).toContain('<table class="pkc-md-rendered-csv">');
    expect(html).toContain('class="pkc-render-source"');
  });

  it('トグルの checkbox と label は id で紐づく', () => {
    const html = renderMarkdown('```html\n<p>a</p>\n```');
    const id = html.match(/<input type="checkbox" id="(pkc-rv-[a-z0-9]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`<label for="${id}"`);
  });
});

describe('-render(レンダリングのみ固定)', () => {
  it('html-render: 旧記法がそのまま新規約に吸収される(iframe あり・トグルなし)', () => {
    const html = renderMarkdown('```html-render\n<h1>x</h1>\n```');
    expect(html).toContain('<iframe');
    expect(html).toContain('data-pkc-render-mode="render"');
    expect(html).not.toContain('pkc-render-toggle-input');
    // 隠しソースは copy 供給源として残る
    expect(html).toContain('class="pkc-render-source"');
  });

  it('mermaid-render / csv-render noheader', () => {
    const m = renderMarkdown('```mermaid-render\nflowchart TD\n  A --> B\n```');
    expect(m).toContain('pkc-mermaid-placeholder');
    expect(m).not.toContain('pkc-render-toggle-input');
    const c = renderMarkdown('```csv-render noheader\na,b\n1,2\n```');
    expect(c).toContain('<table class="pkc-md-rendered-csv">');
    expect(c).not.toContain('<thead>');
    expect(c).not.toContain('pkc-render-toggle-input');
  });
});

describe('-norender(コードブロックのみ固定)', () => {
  it('html-norender: iframe なし、base lang の highlight class', () => {
    const html = renderMarkdown('```html-norender\n<h1>x</h1>\n```');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('pkc-render-slot');
    expect(html).toContain('language-html');
    expect(html).toContain('data-pkc-action="copy-md-block"');
  });

  it('mermaid-norender: placeholder を emit しない(hydrator 不介入の保証)', () => {
    const html = renderMarkdown('```mermaid-norender\nflowchart TD\n  A --> B\n```');
    expect(html).not.toContain('pkc-mermaid-placeholder');
    expect(html).toContain('language-mermaid');
  });

  it('csv-norender: table 化しない', () => {
    const html = renderMarkdown('```csv-norender\na,b\n1,2\n```');
    expect(html).not.toContain('<table');
    expect(html).toContain('language-csv');
  });
});

describe('fall back / 互換', () => {
  it('csv parse 失敗(空)はソース表示に fall back', () => {
    const html = renderMarkdown('```csv\n\n```');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('pkc-render-slot');
  });

  it('registry 外言語は従来の code block(wrapper なし)', () => {
    const html = renderMarkdown('```js\nconst a = 1;\n```');
    expect(html).not.toContain('data-pkc-render-mode');
    expect(html).toContain('language-js');
  });

  it('source-line attrs は wrapper に hoist される(split preview 同期)', () => {
    const html = renderMarkdown('# h\n\n```html\n<p>x</p>\n```\n', { sourceLineAnchors: true });
    const wrapper = html.match(/<div class="pkc-md-block"[^>]*data-pkc-render-lang="html"[^>]*>/)?.[0] ?? '';
    expect(wrapper).toContain('data-pkc-source-line=');
  });

  it('ソース内容は隠しソースに escape されて入る(XSS 姿勢維持)', () => {
    const html = renderMarkdown('```html\n<script>alert(1)</script>\n```');
    const source = html.match(/<pre class="pkc-render-source">([\s\S]*?)<\/pre>/)?.[1] ?? '';
    expect(source).not.toContain('<script>');
    // highlight span を剥がすと escape 済みソースが残る
    expect(source.replace(/<[^>]+>/g, '')).toContain('&lt;script&gt;');
  });
});
