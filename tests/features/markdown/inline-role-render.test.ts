/**
 * reform-2026-05 PR-E:`:role:[content]{attrs}` formal inline role の integration test。
 *
 * 仕様(`docs/development/notation-redesign-2026-05/01-notation-catalog.md` §1.3):
 *   - `:sup:[content]`            → `<sup>content</sup>`
 *   - `:sub:[content]`            → `<sub>content</sub>`
 *   - `:span:[content]{attrs}`    → `<span attrs>content</span>`
 *   - 未知 role / `[` `{` どちらも無し → L-6 simple-inline へ fall-through
 *   - XSS:style / on* は silent skip
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':role:[content] formal inline role', () => {
  it(':sup:[2] → <sup>2</sup>', () => {
    const html = renderMarkdown('x:sup:[2] + y');
    expect(html).toContain('<sup>2</sup>');
  });

  it(':sub:[n] → <sub>n</sub>', () => {
    const html = renderMarkdown('a:sub:[n] = b');
    expect(html).toContain('<sub>n</sub>');
  });

  it(':span:[hi]{class=warn} → <span class="warn">hi</span>', () => {
    const html = renderMarkdown(':span:[hi]{class=warn}');
    expect(html).toMatch(/<span[^>]*class="warn"[^>]*>hi<\/span>/);
  });

  it(':span:[hi]{.warn .important} → <span class="warn important">hi</span>', () => {
    const html = renderMarkdown(':span:[hi]{.warn .important}');
    expect(html).toMatch(/<span[^>]*class="warn important"[^>]*>hi<\/span>/);
  });

  it(':span:[hi]{#section-1} → <span id="section-1">hi</span>', () => {
    const html = renderMarkdown(':span:[hi]{#section-1}');
    expect(html).toMatch(/<span[^>]*id="section-1"[^>]*>hi<\/span>/);
  });

  it(':span:[hi]{data-key=val} → data-* attr 透過', () => {
    const html = renderMarkdown(':span:[hi]{data-key=val}');
    expect(html).toMatch(/<span[^>]*data-key="val"[^>]*>hi<\/span>/);
  });

  it(':span:[hi]{title="my title"} → title attr 受理', () => {
    const html = renderMarkdown(':span:[hi]{title="my title"}');
    expect(html).toMatch(/<span[^>]*title="my title"[^>]*>hi<\/span>/);
  });

  it('XSS: :span:[hi]{onclick=alert(1)} → onclick は silent skip', () => {
    const html = renderMarkdown(':span:[hi]{onclick=alert(1)}');
    expect(html).not.toContain('onclick');
  });

  it('XSS: :span:[hi]{style="background:red"} → style は silent skip(allowlist 外)', () => {
    const html = renderMarkdown(':span:[hi]{style="background:red"}');
    expect(html).not.toContain('style="background:red"');
  });

  it('XSS escape: content 内の < > & は escape される', () => {
    const html = renderMarkdown(':span:[<script>alert(1)</script>]');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('XSS escape: data-* value も escape される', () => {
    const html = renderMarkdown(':span:[hi]{data-x="<bad>"}');
    expect(html).toContain('data-x="&lt;bad&gt;"');
  });

  it('未知 role(:bogus:[x])は L-6 fall-through(かつ L-6 vocab 外で literal 残る)', () => {
    const html = renderMarkdown(':bogus:[x]');
    // 未知 role なので <bogus> や <span class="pkc-inline-mark"> にはならず literal で残る
    expect(html).not.toContain('<bogus>');
    expect(html).toContain(':bogus:');
  });

  it('L-6 形(:bold:red:)は L-6 simple-inline として動作(影響なし)', () => {
    const html = renderMarkdown(':text:bold,red:');
    // L-6 が動作 → <span class="pkc-inline-mark" style="...">text</span>
    expect(html).toMatch(/<span[^>]*pkc-inline-mark/);
    expect(html).toContain('font-weight: bold');
    expect(html).toContain('color: red');
  });

  it('文中に複数 role が混在 → 各々独立に展開', () => {
    const html = renderMarkdown('a:sup:[1]b:sub:[2]c');
    expect(html).toContain('<sup>1</sup>');
    expect(html).toContain('<sub>2</sub>');
  });

  it(':span:[]{class=foo} 空 content も受理', () => {
    const html = renderMarkdown(':span:[]{class=foo}');
    expect(html).toMatch(/<span[^>]*class="foo"[^>]*><\/span>/);
  });

  it('閉じ ] 無し → role match せず literal text として残る', () => {
    const html = renderMarkdown(':sup:[unclosed text');
    expect(html).toContain(':sup:');
  });

  it(':sup: だけ(content も attrs も無し)→ L-6 fall-through(L-6 でも match せず literal)', () => {
    const html = renderMarkdown(':sup:');
    expect(html).toContain(':sup:');
  });

  it('fenced code block 内 :sup:[x] はマーカー扱いしない', () => {
    const src = '```\n:sup:[2]\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('<sup>2</sup>');
    expect(html).toContain(':sup:[2]');
  });

  it('inline code(`:sup:[x]`)内はマーカー扱いしない', () => {
    const html = renderMarkdown('`:sup:[x]`');
    expect(html).not.toContain('<sup>');
    expect(html).toContain(':sup:[x]');
  });
});
