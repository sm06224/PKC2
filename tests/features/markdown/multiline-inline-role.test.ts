/**
 * reform-2026-05 Phase 2 PR-2J:multi-line `[content]` 受理 + multi-line :caption:。
 *
 * user バグレポ 2026-05-10:ChatGPT 等 AI が以下のような複数行 inline role を
 * 多用するが、parser が newline で reject していた:
 *
 *   :emphasis:[
 *   本作業中、一時的に監視系通信が停止する可能性があります
 *   ]
 *
 * 修正:scanBracketBalanced で blank line(\n\n)以外は受理、content は trim。
 * `:caption:` も同様、multi-line `:caption:[\n…\n]` を `:::figure` 内で受理。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe('multi-line inline role content(reform Phase 2 PR-2J)', () => {
  it(':emphasis:[\\n本文\\n] が multi-line で <em> render', () => {
    const html = renderMarkdown(':emphasis:[\n本文\n]');
    expect(html).toMatch(/<em>本文<\/em>/);
  });

  it(':strong:[\\n本文\\n] が multi-line で <strong> render', () => {
    const html = renderMarkdown(':strong:[\n運転監視側への事前周知をお願いします\n]');
    expect(html).toMatch(/<strong>運転監視側への事前周知をお願いします<\/strong>/);
  });

  it(':code:[\\n…\\n] も multi-line(plain text)', () => {
    const html = renderMarkdown(':code:[\nconst x = 1;\n]');
    // code は trim してから plain text(commonmark inline code 仕様)
    expect(html).toMatch(/<code>const x = 1;<\/code>/);
  });

  it(':strike:[\\n…\\n] も multi-line', () => {
    const html = renderMarkdown(':strike:[\n取消テキスト\n]');
    expect(html).toMatch(/<s>取消テキスト<\/s>/);
  });

  it(':sup:[\\n2\\n] / :sub:[\\nn\\n] も multi-line', () => {
    expect(renderMarkdown(':sup:[\n2\n]')).toMatch(/<sup>2<\/sup>/);
    expect(renderMarkdown(':sub:[\nn\n]')).toMatch(/<sub>n<\/sub>/);
  });

  it(':span:[\\n本文\\n]{class=warn} も multi-line', () => {
    const html = renderMarkdown(':span:[\n警告\n]{class=warn}');
    expect(html).toMatch(/<span class="warn">警告<\/span>/);
  });

  it('blank line(\\n\\n)を含む content は reject(paragraph 境界)', () => {
    const html = renderMarkdown(':emphasis:[\n本文 1\n\n本文 2\n]');
    // role match せず literal で残る(blank line で reject)
    expect(html).not.toContain('<em>');
    expect(html).toContain(':emphasis:[');
  });

  it('単行 :emphasis:[本文] は引き続き動作(regression)', () => {
    expect(renderMarkdown(':emphasis:[本文]')).toMatch(/<em>本文<\/em>/);
  });

  it(':::section{role=warning} 内の :emphasis:[\\n…\\n]', () => {
    const src = ':::section{role=warning}\n:emphasis:[\n切替中に瞬断が発生する可能性あり\n]\n:::';
    const html = renderMarkdown(src);
    expect(html).toContain('pkc-section-warning');
    expect(html).toMatch(/<em>切替中に瞬断が発生する可能性あり<\/em>/);
  });

  it('content 内 leading / trailing whitespace を trim', () => {
    const html = renderMarkdown(':strong:[   spaces   ]');
    expect(html).toMatch(/<strong>spaces<\/strong>/);
  });
});

describe('multi-line :caption:[…] in :::figure(reform Phase 2 PR-2J)', () => {
  it('multi-line :caption:[\\n本文\\n] が figure caption に', () => {
    const src =
      ':::figure{id="fig1"}\n' +
      '![](image.png)\n' +
      ':caption:[\n更新対象ネットワーク構成\n]\n' +
      ':::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 更新対象ネットワーク構成<\/figcaption>/);
  });

  it('multi-line caption + mermaid code block 共存', () => {
    const src =
      ':::figure{id="fig1"}\n' +
      '```mermaid\n' +
      'graph TD\n' +
      '  A --> B\n' +
      '```\n' +
      ':caption:[\n更新対象ネットワーク構成\n]\n' +
      ':::';
    const html = renderMarkdown(src);
    expect(html).toContain('<figure');
    expect(html).toMatch(/<figcaption[^>]*>図 1: 更新対象ネットワーク構成<\/figcaption>/);
    expect(html).toContain('graph TD');
  });

  it('multi-line :caption: で content が複数行 join される', () => {
    const src =
      ':::figure{id="fig1"}\n' +
      '![](image.png)\n' +
      ':caption:[\n  caption 1 行目\n  caption 2 行目\n]\n' +
      ':::';
    const html = renderMarkdown(src);
    // 複数行 caption は space で join される
    expect(html).toMatch(/<figcaption[^>]*>図 1: caption 1 行目 caption 2 行目<\/figcaption>/);
  });

  it('単行 :caption:[本文] 既存(regression)', () => {
    const src = ':::figure{#fig1}\n![](x)\n:caption:[既存単行]\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 既存単行<\/figcaption>/);
  });

  it('既存 ^^^ caption も regression なし', () => {
    const src = ':::figure{#fig1}\n![](x)\n^^^ 既存 ^^^ marker\n:::';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<figcaption[^>]*>図 1: 既存 \^\^\^ marker<\/figcaption>/);
  });
});
