/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect } from 'vitest';
import {
  htmlPasteToMarkdown,
  isSafeHref,
} from '@adapter/ui/html-paste-to-markdown';

describe('isSafeHref', () => {
  it('accepts http / https / relative / mailto / ftp / tel URLs', () => {
    expect(isSafeHref('https://example.com')).toBe(true);
    expect(isSafeHref('http://example.com')).toBe(true);
    expect(isSafeHref('mailto:user@example.com')).toBe(true);
    expect(isSafeHref('ftp://example.com')).toBe(true);
    expect(isSafeHref('tel:+81-90-0000-0000')).toBe(true);
    expect(isSafeHref('/relative/path')).toBe(true);
    expect(isSafeHref('#fragment')).toBe(true);
    expect(isSafeHref('?q=x')).toBe(true);
  });

  it('rejects javascript: URLs regardless of casing / whitespace', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('JavaScript:alert(1)')).toBe(false);
    expect(isSafeHref('  javascript:alert(1)')).toBe(false);
    expect(isSafeHref('JAVASCRIPT:alert(1)')).toBe(false);
  });

  it('rejects vbscript: and data: URLs', () => {
    expect(isSafeHref('vbscript:msgbox')).toBe(false);
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects empty / whitespace-only href', () => {
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref('   ')).toBe(false);
  });
});

describe('htmlPasteToMarkdown', () => {
  it('returns null when the payload has no anchors', () => {
    // The whole point: if there are no anchors to preserve, defer to
    // the browser's default text/plain paste so we don't accidentally
    // reformat the user's text.
    expect(htmlPasteToMarkdown('<p>hello <b>world</b></p>')).toBeNull();
    expect(htmlPasteToMarkdown('<p>plain paragraph</p>')).toBeNull();
    expect(htmlPasteToMarkdown('')).toBeNull();
  });

  it('returns null on malformed input by design (graceful defer)', () => {
    // DOMParser silently recovers from most malformed HTML, but
    // fully garbage strings without any anchor still route through
    // the no-anchor early return.
    expect(htmlPasteToMarkdown('<<< not html >>>')).toBeNull();
  });

  it('converts a single anchor to [label](url)', () => {
    const out = htmlPasteToMarkdown('<a href="https://example.com">Example</a>');
    expect(out).toBe('[Example](https://example.com)');
  });

  it('preserves the anchor inside surrounding text', () => {
    const out = htmlPasteToMarkdown(
      'Check out <a href="https://example.com">this link</a> and more.',
    );
    expect(out).toBe('Check out [this link](https://example.com) and more.');
  });

  it('converts multiple anchors independently', () => {
    const out = htmlPasteToMarkdown(
      '<p><a href="https://a.example">A</a> — <a href="https://b.example">B</a></p>',
    );
    expect(out).toContain('[A](https://a.example)');
    expect(out).toContain('[B](https://b.example)');
  });

  it('uses the URL as the label when the anchor text is empty', () => {
    const out = htmlPasteToMarkdown('<a href="https://example.com"></a>');
    expect(out).toBe('https://example.com');
  });

  it('drops javascript: links to plain-text labels for safety', () => {
    const out = htmlPasteToMarkdown(
      'Hello <a href="javascript:alert(1)">click me</a> world',
    );
    // The label is kept as plain text; the href is discarded.
    expect(out).toBe('Hello click me world');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('](');
  });

  it('drops data: links to plain-text labels', () => {
    const out = htmlPasteToMarkdown(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    );
    expect(out).toBe('x');
    expect(out).not.toContain('data:');
  });

  it('escapes Markdown-active characters inside the label', () => {
    const out = htmlPasteToMarkdown(
      '<a href="https://example.com">[brackets] matter</a>',
    );
    expect(out).toBe('[\\[brackets\\] matter](https://example.com)');
  });

  it('percent-encodes parentheses and spaces inside the href', () => {
    const out = htmlPasteToMarkdown(
      '<a href="https://example.com/foo (bar)">label</a>',
    );
    expect(out).toBe('[label](https://example.com/foo%20%28bar%29)');
  });

  it('preserves relative / fragment hrefs', () => {
    const out = htmlPasteToMarkdown('<a href="/docs/page#section">page</a>');
    expect(out).toBe('[page](/docs/page#section)');
  });

  it('collapses excessive whitespace within a label', () => {
    const out = htmlPasteToMarkdown(
      '<a href="https://example.com">  multi\n\n  line   label  </a>',
    );
    expect(out).toBe('[multi line label](https://example.com)');
  });

  it('adds blank lines around block-level content', () => {
    const out = htmlPasteToMarkdown(
      '<div>Check out <a href="https://example.com">the docs</a></div><div>Bye!</div>',
    );
    // Exact formatting tolerated — verify semantic content + line break.
    expect(out).toContain('[the docs](https://example.com)');
    expect(out).toContain('Bye!');
    expect(out?.split('\n').length).toBeGreaterThanOrEqual(2);
  });

  it('converts <br> to a newline between fragments', () => {
    const out = htmlPasteToMarkdown(
      'line1<br>line2 <a href="https://example.com">x</a>',
    );
    expect(out).toMatch(/line1\nline2 \[x\]\(https:\/\/example\.com\)/);
  });

  it('skips <script> / <style> content', () => {
    const out = htmlPasteToMarkdown(
      '<style>a{color:red}</style>'
        + '<script>alert(1)</script>'
        + '<a href="https://example.com">ok</a>',
    );
    expect(out).toBe('[ok](https://example.com)');
  });

  it('handles a Gmail-style wrapped paste', () => {
    // Gmail wraps anchors in a sea of <div>s with inline styles. The
    // walker should flatten the wrappers but preserve the link.
    const out = htmlPasteToMarkdown(
      '<div style="font-family:Arial">Hi,</div>'
        + '<div style="font-family:Arial">See '
        + '<a href="https://example.com" style="color:#1a73e8" target="_blank">this report</a>'
        + ' before Monday.</div>'
        + '<div style="font-family:Arial"><br></div>'
        + '<div style="font-family:Arial">Best,</div>',
    );
    expect(out).toContain('[this report](https://example.com)');
    expect(out).toContain('Hi,');
    expect(out).toContain('before Monday.');
    expect(out).toContain('Best,');
  });
});
