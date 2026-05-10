/**
 * reform-2026-05 Phase 2 PR-2F:`:::section{role=…}` semantic / callout block。
 *
 * 仕様(01-notation-catalog.md §1.4):
 *   `:::section{role=summary|warning|note|tip|caution|important|info|danger}`
 *
 * HTML:`<section class="pkc-section-callout pkc-section-<role>" data-pkc-role="<role>">`
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@features/markdown/markdown-render';

const KNOWN_ROLES = [
  'summary', 'warning', 'note', 'tip', 'caution', 'important', 'info', 'danger',
];

describe(':::section{role=…} semantic / callout(reform Phase 2 PR-2F)', () => {
  for (const role of KNOWN_ROLES) {
    it(`role=${role} → <section class="pkc-section-callout pkc-section-${role}">`, () => {
      const html = renderMarkdown(`:::section{role=${role}}\n本文\n:::`);
      expect(html).toMatch(new RegExp(`<section[^>]*class="pkc-section-callout pkc-section-${role}"[^>]*data-pkc-role="${role}"`));
      expect(html).toContain('本文');
      expect(html).toContain('</section>');
    });
  }

  it('role 省略 → generic class(role-specific class なし)', () => {
    const html = renderMarkdown(':::section\n本文\n:::');
    expect(html).toMatch(/<section[^>]*class="pkc-section-callout"[^>]*data-pkc-role="generic"/);
  });

  it('未知 role(unknown_xyz)→ generic class、data-pkc-role は raw stamp', () => {
    const html = renderMarkdown(':::section{role=unknown_xyz}\n本文\n:::');
    expect(html).toMatch(/<section[^>]*class="pkc-section-callout"[^>]*data-pkc-role="unknown_xyz"/);
    // pkc-section-unknown_xyz class は出ない(allowlist 経由のみ)
    expect(html).not.toContain('pkc-section-unknown_xyz');
  });

  it('content の markdown が render される(nested)', () => {
    const html = renderMarkdown(':::section{role=warning}\n本文 **強調** 続き\n\n- item 1\n- item 2\n:::');
    expect(html).toContain('<strong>強調</strong>');
    expect(html).toMatch(/<ul>[\s\S]*<li>item 1<\/li>/);
  });

  it('id (`#id`) と class (`.class`) も attr で stamp', () => {
    const html = renderMarkdown(':::section{#sec-1 .important role=note}\n本文\n:::');
    expect(html).toMatch(/<section[^>]*id="sec-1"/);
    expect(html).toMatch(/class="pkc-section-callout pkc-section-note important"/);
  });

  it('追加 kv attr → data-pkc-section-* に展開', () => {
    const html = renderMarkdown(':::section{role=note level=high}\n本文\n:::');
    expect(html).toContain('data-pkc-section-level="high"');
  });

  it('閉じ ::: 無し → EOF まで content として処理', () => {
    const html = renderMarkdown(':::section{role=warning}\n本文\n本文 2');
    expect(html).toContain('本文');
  });

  it('複数 :::section が独立 block として render', () => {
    const src = ':::section{role=warning}\n警告\n:::\n\n:::section{role=info}\n情報\n:::';
    const html = renderMarkdown(src);
    expect((html.match(/<section/g) ?? []).length).toBe(2);
    expect(html).toContain('pkc-section-warning');
    expect(html).toContain('pkc-section-info');
  });

  it('fenced code 内 :::section はマーカー扱いしない', () => {
    const src = '```\n:::section{role=warning}\nthis is code\n:::\n```';
    const html = renderMarkdown(src);
    expect(html).not.toContain('<section');
    expect(html).toContain('<code');
  });

  it(':::section 内に :::quote nested(両 directive 動作)', () => {
    const src = ':::section{role=warning}\n:::quote{author=Inner}\nネスト引用\n:::\n:::';
    const html = renderMarkdown(src);
    expect(html).toContain('<section');
    expect(html).toContain('<blockquote');
    expect(html).toContain('pkc-section-warning');
    expect(html).toContain('pkc-quote-citation');
    expect(html).toContain('ネスト引用');
  });

  it('XSS:role 値が不正(`<script>` 等)→ generic fallback、危険文字列は出ない', () => {
    const html = renderMarkdown(':::section{role="<script>"}\n本文\n:::');
    // role が allowlist regex に match しない → generic fallback
    expect(html).toContain('data-pkc-role="generic"');
    // 危険な script 文字列は raw でも escape でも一切出ない
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('&lt;script&gt;');
  });
});
