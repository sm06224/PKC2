/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { highlightMatchesIn } from '@adapter/ui/search-mark';

/**
 * S-15 / A-4 Slice α (USER_REQUEST_LEDGER, 2026-04-14) — pure
 * unit coverage for the search-match DOM walker. Renderer
 * integration (`renderView` → highlightMatchesIn wiring) is pinned
 * separately in tests/adapter/search-mark-renderer.test.ts.
 *
 * Contract being pinned:
 *   - empty / whitespace-only query → noop, returns 0
 *   - case-insensitive substring match
 *   - multiple non-overlapping occurrences in a single text node
 *   - skips text inside <pre>, <script>, <style>, <noscript>
 *   - idempotent: calling again on already-marked tree adds no
 *     new <mark> wrappers
 *   - never re-parses match text as HTML (XSS safety)
 *   - preserves surrounding whitespace exactly
 */

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  return root;
}

function countMarks(root: HTMLElement): number {
  return root.querySelectorAll('mark.pkc-search-mark').length;
}

describe('highlightMatchesIn — basic behaviour', () => {
  it('returns 0 and mutates nothing for an empty query', () => {
    const root = makeRoot('<p>Hello world</p>');
    const before = root.innerHTML;
    const n = highlightMatchesIn(root, '');
    expect(n).toBe(0);
    expect(root.innerHTML).toBe(before);
  });

  it('returns 0 for a whitespace-only query', () => {
    const root = makeRoot('<p>Hello world</p>');
    const before = root.innerHTML;
    const n = highlightMatchesIn(root, '   ');
    expect(n).toBe(0);
    expect(root.innerHTML).toBe(before);
  });

  it('wraps a single case-insensitive substring match', () => {
    const root = makeRoot('<p>Hello WORLD</p>');
    const n = highlightMatchesIn(root, 'world');
    expect(n).toBe(1);
    const mark = root.querySelector('mark.pkc-search-mark');
    expect(mark).toBeTruthy();
    // The mark preserves the original casing from the source text.
    expect(mark!.textContent).toBe('WORLD');
    expect(root.querySelector('p')!.textContent).toBe('Hello WORLD');
  });

  it('wraps multiple occurrences in a single text node', () => {
    const root = makeRoot('<p>foo bar foo baz foo</p>');
    const n = highlightMatchesIn(root, 'foo');
    expect(n).toBe(3);
    expect(countMarks(root)).toBe(3);
    expect(root.querySelector('p')!.textContent).toBe('foo bar foo baz foo');
  });

  it('walks across multiple element children', () => {
    const root = makeRoot('<h1>Foo title</h1><p>Some <em>foo</em> text</p>');
    const n = highlightMatchesIn(root, 'foo');
    expect(n).toBe(2);
    expect(countMarks(root)).toBe(2);
    // Foo inside h1 is wrapped, foo inside <em> is also wrapped.
    expect(root.querySelector('h1 mark')).toBeTruthy();
    expect(root.querySelector('em mark')).toBeTruthy();
  });
});

describe('highlightMatchesIn — skip rules', () => {
  it('skips text inside <pre> (preserves B-2 syntax-highlight markup)', () => {
    const root = makeRoot(
      '<p>foo here</p><pre><code>const foo = 1;</code></pre><p>foo there</p>',
    );
    const n = highlightMatchesIn(root, 'foo');
    expect(n).toBe(2);
    // `<pre>` is intact.
    expect(root.querySelector('pre code')!.textContent).toBe('const foo = 1;');
    expect(root.querySelector('pre mark')).toBeNull();
  });

  it('skips <script> and <style> and <noscript>', () => {
    const root = makeRoot(
      '<p>visible foo</p>'
      + '<script>const foo = 1;</script>'
      + '<style>.foo { color: red; }</style>'
      + '<noscript>fallback foo</noscript>',
    );
    const n = highlightMatchesIn(root, 'foo');
    expect(n).toBe(1);
    expect(countMarks(root)).toBe(1);
    expect(root.querySelector('script')!.textContent).toBe('const foo = 1;');
  });

  it('is idempotent — re-applying does not nest <mark>s', () => {
    const root = makeRoot('<p>foo bar foo</p>');
    const n1 = highlightMatchesIn(root, 'foo');
    const n2 = highlightMatchesIn(root, 'foo');
    expect(n1).toBe(2);
    // Already-marked text is skipped; second pass adds nothing.
    expect(n2).toBe(0);
    expect(countMarks(root)).toBe(2);
    // No nested marks.
    expect(root.querySelector('mark mark')).toBeNull();
  });
});

describe('highlightMatchesIn — safety', () => {
  it('does not re-parse match text as HTML', () => {
    const root = makeRoot('<p>before &lt;img src=x onerror=alert(1)&gt; after</p>');
    // Search for the literal "<img" — the DOM has it as text content.
    const n = highlightMatchesIn(root, '<img');
    expect(n).toBe(1);
    // The original `<img>` in the source was already escaped to text;
    // the wrapping <mark> must not re-parse / re-construct it as a
    // real <img> element.
    expect(root.querySelector('img')).toBeNull();
    const mark = root.querySelector('mark.pkc-search-mark');
    expect(mark!.textContent).toBe('<img');
    // The surrounding text around the mark stays as-is (split across
    // 3 text nodes after wrapping).
    expect(root.querySelector('p')!.textContent).toBe(
      'before <img src=x onerror=alert(1)> after',
    );
  });

  it('preserves leading and trailing whitespace exactly', () => {
    const root = makeRoot('<p>  foo  bar  </p>');
    highlightMatchesIn(root, 'foo');
    expect(root.querySelector('p')!.textContent).toBe('  foo  bar  ');
  });
});
