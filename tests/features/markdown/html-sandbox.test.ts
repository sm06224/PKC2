/**
 * reform-2026-05 Phase 2 PR-2M(2026-05-10):HTML sandbox iframe builder。
 *
 * `\`\`\`html-render` fence の content を iframe sandbox 経由で seamless 描画。
 * sandbox="allow-scripts" のみ + CSP meta + auto-resize postMessage protocol。
 */
import { describe, it, expect } from 'vitest';
import {
  buildHtmlSandboxIframe,
  HTML_SANDBOX_MAX_HEIGHT,
  HTML_SANDBOX_RESIZE_MSG_TYPE,
} from '@features/markdown/html-sandbox';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('buildHtmlSandboxIframe — sandbox iframe builder(PR-2M)', () => {
  it('iframe element に sandbox="allow-scripts" attribute(allow-same-origin なし)', () => {
    const html = buildHtmlSandboxIframe('<div>test</div>');
    expect(html).toMatch(/<iframe[^>]+sandbox="allow-scripts"/);
    expect(html).not.toContain('allow-same-origin');
  });

  it('referrerpolicy="no-referrer" 付与', () => {
    const html = buildHtmlSandboxIframe('<div>test</div>');
    expect(html).toContain('referrerpolicy="no-referrer"');
  });

  it('loading="lazy" 付与(scroll 外 iframe は遅延)', () => {
    const html = buildHtmlSandboxIframe('<div>test</div>');
    expect(html).toContain('loading="lazy"');
  });

  it('class="pkc-html-render" + data-pkc-html-render-id 付与', () => {
    const html = buildHtmlSandboxIframe('<div>test</div>');
    expect(html).toContain('class="pkc-html-render"');
    expect(html).toMatch(/data-pkc-html-render-id="pkc-html-render-[a-z0-9]+"/);
  });

  it('srcdoc に CSP meta tag を inject', () => {
    const html = buildHtmlSandboxIframe('<div>test</div>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('connect-src');
    expect(html).toContain('frame-src');
    expect(html).toContain('object-src');
    expect(html).toContain('base-uri');
  });

  it('srcdoc は HTML escape されている', () => {
    const html = buildHtmlSandboxIframe('<p>"hello"</p>');
    // srcdoc 内では " → &quot;
    expect(html).toMatch(/srcdoc="[^"]*&quot;hello&quot;/);
  });

  it('content にスクリプト含めても sandbox 隔離されている', () => {
    const html = buildHtmlSandboxIframe('<script>alert(1)</script>');
    // content はそのまま入る(sandbox で隔離されるので XSS なし)
    expect(html).toContain('srcdoc="');
    // CSP で script-src は inline only、外部 src 拒否される
    expect(html).toContain('script-src');
  });

  it('auto-resize script(postMessage protocol)が含まれる', () => {
    const html = buildHtmlSandboxIframe('<div>x</div>');
    expect(html).toContain(HTML_SANDBOX_RESIZE_MSG_TYPE);
    expect(html).toContain('postMessage');
  });

  it('iframe ID は unique(2 回呼び出して別 ID)', () => {
    const h1 = buildHtmlSandboxIframe('<a>a</a>');
    const h2 = buildHtmlSandboxIframe('<b>b</b>');
    const id1 = /data-pkc-html-render-id="([^"]+)"/.exec(h1)?.[1];
    const id2 = /data-pkc-html-render-id="([^"]+)"/.exec(h2)?.[1];
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('sourceLineAttrs が iframe attrs に転記される(split view sync)', () => {
    const html = buildHtmlSandboxIframe(
      '<div>x</div>',
      ' data-pkc-source-line="5" data-pkc-source-end="8"',
    );
    expect(html).toContain('data-pkc-source-line="5"');
    expect(html).toContain('data-pkc-source-end="8"');
  });

  it('cap height 5000px', () => {
    expect(HTML_SANDBOX_MAX_HEIGHT).toBe(5000);
    const html = buildHtmlSandboxIframe('<div>x</div>');
    expect(html).toContain(String(HTML_SANDBOX_MAX_HEIGHT));
  });

  it('initial height 0(JS で resize されるまで)', () => {
    const html = buildHtmlSandboxIframe('<div>x</div>');
    expect(html).toMatch(/style="[^"]*height:0[^"]*"/);
  });
});

describe('renderMarkdown integration — ```html-render fence(PR-2M)', () => {
  it('``` html-render が iframe に変換', () => {
    const md = '```html-render\n<h1>Hello</h1>\n<p>world</p>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<iframe');
    expect(html).toContain('class="pkc-html-render"');
    expect(html).toContain('sandbox="allow-scripts"');
    // srcdoc に content が含まれる(escape されて &lt; など)
    expect(html).toContain('srcdoc="');
  });

  it('``` html-render の content は srcdoc に escape されて含まれる', () => {
    const md = '```html-render\n<div class="a"><span>x</span></div>\n```';
    const html = renderMarkdown(md);
    // srcdoc 内では `"` → `&quot;` で escape されている
    expect(html).toMatch(/srcdoc="[^"]*&lt;div class=&quot;a&quot;&gt;/);
  });

  it('``` html-render 以外の fence は通常 code block', () => {
    const md = '```\n<h1>Hello</h1>\n```';
    const html = renderMarkdown(md);
    expect(html).not.toContain('<iframe');
    expect(html).toContain('<pre');
  });

  it('``` html-render-foo のような prefix-only は match しない', () => {
    const md = '```html-render-foo\n<h1>Hello</h1>\n```';
    const html = renderMarkdown(md);
    // \b で word boundary なので "html-render-foo" の "render-foo" 部分は別 word
    // 実際は html-render が word 単位 prefix なので fallback して code block
    expect(html).not.toContain('<iframe');
  });

  it('``` html-render は info string で発火、attrs 不要', () => {
    const md = '```html-render\n<svg><circle r="10"/></svg>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<iframe');
  });

  it('``` html(無印)= -both の省略形:iframe + トグル(codeblock-render-standard-2026-07)', () => {
    const md = '```html\n<h1>x</h1>\n```';
    const html = renderMarkdown(md);
    expect(html).toContain('<iframe');
    expect(html).toContain('data-pkc-render-mode="both"');
    expect(html).toContain('class="pkc-render-toggle-input"');
    // 隠しソース(copy 供給源 + トグルのソース面)
    expect(html).toContain('class="pkc-render-source"');
  });

  it('``` html-norender はコードブロック固定(render 経路に入らない)', () => {
    const md = '```html-norender\n<h1>x</h1>\n```';
    const html = renderMarkdown(md);
    expect(html).not.toContain('<iframe');
    expect(html).toContain('language-html');
  });
});
