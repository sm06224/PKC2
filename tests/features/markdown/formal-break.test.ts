/**
 * reform-2026-05 Phase 2 PR-2H:`:::break{kind=… role=…}` formal block。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   - `:::break`                       → +++ 等価(default kind=page、role=auto)
 *   - `:::break{kind=page}`            → +++
 *   - `:::break{kind=page role=cover}` → +++ {role=cover}
 *   - `:::break{kind=rule}`            → --- (commonmark hr)
 *
 * AI / serializer が IR-driven で emit する formal 形を spec 完全網羅。
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

describe(':::break{kind=… role=…} formal block(reform Phase 2 PR-2H)', () => {
  it('既存 +++ simple(role=auto)は引き続き動作', () => {
    const html = renderMarkdown('本文 1\n\n+++\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*class="pkc-section-break"[^>]*data-pkc-role="auto"/);
  });

  it('既存 +++ {role=cover} simple は引き続き動作', () => {
    const html = renderMarkdown('本文 1\n\n+++ {role=cover}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*data-pkc-role="cover"/);
  });

  it(':::break(no attrs)→ +++ default 等価(role=auto)', () => {
    const html = renderMarkdown('本文 1\n\n:::break\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*class="pkc-section-break"[^>]*data-pkc-role="auto"/);
  });

  it(':::break{kind=page} → +++ 等価', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=page}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*class="pkc-section-break"[^>]*data-pkc-role="auto"/);
  });

  it(':::break{kind=page role=cover} → +++ {role=cover} 等価', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=page role=cover}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*data-pkc-role="cover"/);
  });

  it(':::break{kind=page role=section} → role=section', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=page role=section}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*data-pkc-role="section"/);
  });

  it(':::break{kind=rule} → commonmark plain <hr>(セクション break ではない)', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=rule}\n\n本文 2');
    // plain hr(class なし)
    expect(html).toMatch(/<hr\s*\/?>/);
    expect(html).not.toMatch(/<hr[^>]*class="pkc-section-break"/);
  });

  it('quoted role(role="cover")も受理', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=page role="cover"}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*data-pkc-role="cover"/);
  });

  it('fenced code 内 :::break はマーカー扱いしない', () => {
    const src = '```\n:::break{kind=rule}\nin code\n```';
    const html = renderMarkdown(src);
    expect(html).not.toMatch(/<hr[^>]*pkc-section-break/);
    expect(html).toContain('<code');
    expect(html).toContain(':::break');
  });

  it('複数 :::break 並列', () => {
    const src = '本文 A\n\n:::break\n\n本文 B\n\n:::break{kind=page role=cover}\n\n本文 C';
    const html = renderMarkdown(src);
    const matches = html.match(/<hr[^>]*pkc-section-break/g);
    expect(matches?.length ?? 0).toBe(2);
  });

  it(':::break と +++ 混在で両方動作', () => {
    const src = '本文 A\n\n+++ {role=section}\n\n本文 B\n\n:::break{kind=page role=cover}\n\n本文 C';
    const html = renderMarkdown(src);
    expect(html).toMatch(/<hr[^>]*data-pkc-role="section"/);
    expect(html).toMatch(/<hr[^>]*data-pkc-role="cover"/);
  });

  it('行頭 leading whitespace 許容', () => {
    const html = renderMarkdown('本文 1\n\n   :::break\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*pkc-section-break/);
  });

  it('未知 kind(:::break{kind=blah})は kind=page default 扱い(rule 以外は page)', () => {
    const html = renderMarkdown('本文 1\n\n:::break{kind=blah}\n\n本文 2');
    expect(html).toMatch(/<hr[^>]*pkc-section-break/);
  });
});
