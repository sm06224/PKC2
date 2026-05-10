/**
 * reform-2026-05 Phase 2 PR-2B:`:strong:[]` `:emphasis:[]` `:code:[]`
 * `:strike:[]` formal inline role の commonmark 等価実装。
 *
 * 仕様:01-notation-catalog.md §1.3
 *   | 26 | bold       | `**text**`   | `:strong:[text]`    |
 *   | 27 | italic     | `*text*`     | `:emphasis:[text]`  |
 *   | 28 | strike     | `~~text~~`   | `:strike:[text]`    |
 *   | 29 | inline code| `` `code` `` | `:code:[code]`      |
 *
 * AI / serializer が IR-driven で emit する formal 形。simple 形と完全等価
 * (output HTML 同一)。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':strong: formal inline', () => {
  it(':strong:[text] → <strong>text</strong>', () => {
    const html = renderMarkdown(':strong:[太字]');
    expect(html).toMatch(/<strong>太字<\/strong>/);
  });

  it('文中で :strong:', () => {
    const html = renderMarkdown('普通の :strong:[強調] テキスト');
    expect(html).toContain('<strong>強調</strong>');
  });

  it(':strong:[**nested**] で nested bold が pair 解決される', () => {
    const html = renderMarkdown(':strong:[**ネスト bold**]');
    expect(html).toMatch(/<strong><strong>ネスト bold<\/strong><\/strong>/);
  });

  it(':strong:[a *em* b] で nested italic も pair 解決', () => {
    const html = renderMarkdown(':strong:[A *イタ* B]');
    expect(html).toMatch(/<strong>A <em>イタ<\/em> B<\/strong>/);
  });

  it(':strong:[==hl==] で nested highlight も解決', () => {
    const html = renderMarkdown(':strong:[==マーク==]');
    expect(html).toMatch(/<strong><mark>マーク<\/mark><\/strong>/);
  });

  it('simple **bold** と :strong:[formal] が独立に共存', () => {
    const html = renderMarkdown('**simple** と :strong:[formal] が共存');
    expect(html).toContain('<strong>simple</strong>');
    expect(html).toContain('<strong>formal</strong>');
  });
});

describe(':emphasis: formal inline', () => {
  it(':emphasis:[text] → <em>text</em>', () => {
    expect(renderMarkdown(':emphasis:[斜体]')).toMatch(/<em>斜体<\/em>/);
  });

  it(':emphasis:[a **bold** b] で nested bold 解決', () => {
    const html = renderMarkdown(':emphasis:[A **太字** B]');
    expect(html).toMatch(/<em>A <strong>太字<\/strong> B<\/em>/);
  });
});

describe(':code: formal inline', () => {
  it(':code:[text] → <code>text</code>(plain text)', () => {
    expect(renderMarkdown(':code:[const x = 1]')).toMatch(/<code>const x = 1<\/code>/);
  });

  it(':code:[**not bold**] は plain text(code 内は markdown 効かない)', () => {
    const html = renderMarkdown(':code:[**not bold**]');
    expect(html).toMatch(/<code>\*\*not bold\*\*<\/code>/);
    expect(html).not.toContain('<strong>');
  });
});

describe(':strike: formal inline', () => {
  it(':strike:[text] → <s>text</s>', () => {
    expect(renderMarkdown(':strike:[取消]')).toMatch(/<s>取消<\/s>/);
  });

  it(':strike:[**bold inside**] で nested bold 解決', () => {
    const html = renderMarkdown(':strike:[**取消太字**]');
    expect(html).toMatch(/<s><strong>取消太字<\/strong><\/s>/);
  });
});

describe('formal inline + 既存機能 共存', () => {
  it('混在 fixture:全 4 formal + simple equivalents が並列 render', () => {
    const html = renderMarkdown(
      ':strong:[A] :emphasis:[B] :code:[C] :strike:[D] **E** *F* `G` ~~H~~',
    );
    expect(html).toContain('<strong>A</strong>');
    expect(html).toContain('<em>B</em>');
    expect(html).toContain('<code>C</code>');
    expect(html).toContain('<s>D</s>');
    expect(html).toContain('<strong>E</strong>');
    expect(html).toContain('<em>F</em>');
    expect(html).toContain('<code>G</code>');
    expect(html).toContain('<s>H</s>');
  });

  it('未知 role は L-6 fall-through(literal 残置)', () => {
    const html = renderMarkdown(':unknown:[text]');
    expect(html).toContain(':unknown:');
  });
});

describe('XSS / edge', () => {
  it('content に <script> → escape される', () => {
    const html = renderMarkdown(':strong:[<script>alert(1)</script>]');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('content 空 → empty role tag', () => {
    const html = renderMarkdown(':strong:[]');
    expect(html).toContain('<strong></strong>');
  });

  it('閉じ ] 無し → role match せず literal 残る', () => {
    const html = renderMarkdown(':strong:[unclosed text');
    expect(html).toContain(':strong:');
  });
});
