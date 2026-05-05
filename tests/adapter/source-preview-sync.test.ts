/**
 * @vitest-environment happy-dom
 *
 * 領域 10-1 PR 1 — `source-preview-sync.ts` pure DOM helpers のテスト。
 *
 * 5 helpers 全件カバー:
 *   - caretSourceLine(textarea)
 *   - findPreviewElementForLine(preview, line)
 *   - findSourceLineForElement(el)
 *   - findSourceLineByPoint(preview, viewportY)
 *   - caretOffsetForSourceLine(text, line)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  caretSourceLine,
  findPreviewElementForLine,
  findSourceLineForElement,
  findSourceLineByPoint,
  caretOffsetForSourceLine,
} from '../../src/adapter/ui/source-preview-sync';

function makeTextarea(value: string, selectionStart: number): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  ta.selectionStart = selectionStart;
  ta.selectionEnd = selectionStart;
  return ta;
}

function makePreviewWithAnchors(
  blocks: ReadonlyArray<{ line: number; end?: number; tag?: string; text?: string }>,
): HTMLElement {
  const root = document.createElement('div');
  for (const b of blocks) {
    const el = document.createElement(b.tag ?? 'p');
    el.setAttribute('data-pkc-source-line', String(b.line));
    if (b.end !== undefined) {
      el.setAttribute('data-pkc-source-end', String(b.end));
    }
    el.textContent = b.text ?? `block@${b.line}`;
    root.appendChild(el);
  }
  return root;
}

describe('caretSourceLine', () => {
  it('caret at offset 0 → line 0', () => {
    const ta = makeTextarea('abc\ndef', 0);
    expect(caretSourceLine(ta)).toBe(0);
  });

  it('caret within first line → line 0', () => {
    const ta = makeTextarea('abc\ndef', 2);
    expect(caretSourceLine(ta)).toBe(0);
  });

  it('caret at the end of first line(before newline)→ line 0', () => {
    const ta = makeTextarea('abc\ndef', 3);
    expect(caretSourceLine(ta)).toBe(0);
  });

  it('caret right after first newline → line 1', () => {
    const ta = makeTextarea('abc\ndef', 4);
    expect(caretSourceLine(ta)).toBe(1);
  });

  it('caret at end of multi-line text → last line', () => {
    const ta = makeTextarea('a\nb\nc', 5);
    expect(caretSourceLine(ta)).toBe(2);
  });

  it('selectionStart undefined → fallback 0', () => {
    const ta = document.createElement('textarea');
    ta.value = 'abc\ndef';
    // textarea may have selectionStart === null in some envs; test
    // the fallback path explicitly.
    Object.defineProperty(ta, 'selectionStart', { value: null });
    expect(caretSourceLine(ta)).toBe(0);
  });

  it('caret beyond text length(programmatic edge case)→ counts all newlines', () => {
    const ta = makeTextarea('a\nb\nc', 100);
    // The for-loop will halt at text length (charCodeAt out of range
    // returns NaN, never 10), so the result equals the total newline
    // count = 2.
    expect(caretSourceLine(ta)).toBe(2);
  });
});

describe('findPreviewElementForLine', () => {
  it('returns the latest anchor at-or-before the target', () => {
    const preview = makePreviewWithAnchors([
      { line: 0, tag: 'p' },
      { line: 2, tag: 'p' },
      { line: 4, tag: 'p' },
    ]);
    const target = findPreviewElementForLine(preview, 3);
    expect(target?.getAttribute('data-pkc-source-line')).toBe('2');
  });

  it('exact match wins over earlier anchors', () => {
    const preview = makePreviewWithAnchors([
      { line: 0, tag: 'p' },
      { line: 2, tag: 'p' },
    ]);
    const target = findPreviewElementForLine(preview, 2);
    expect(target?.getAttribute('data-pkc-source-line')).toBe('2');
  });

  it('returns null when target is before the first anchor', () => {
    const preview = makePreviewWithAnchors([
      { line: 5, tag: 'p' },
      { line: 7, tag: 'p' },
    ]);
    expect(findPreviewElementForLine(preview, 2)).toBeNull();
  });

  it('returns null on empty preview', () => {
    const preview = document.createElement('div');
    expect(findPreviewElementForLine(preview, 0)).toBeNull();
  });

  it('skips elements with non-numeric or missing data-pkc-source-line', () => {
    const preview = document.createElement('div');
    const bad = document.createElement('p');
    bad.setAttribute('data-pkc-source-line', 'NaN');
    preview.appendChild(bad);
    const good = document.createElement('p');
    good.setAttribute('data-pkc-source-line', '3');
    preview.appendChild(good);
    const target = findPreviewElementForLine(preview, 5);
    expect(target?.getAttribute('data-pkc-source-line')).toBe('3');
  });
});

describe('findSourceLineForElement', () => {
  let preview: HTMLElement;
  beforeEach(() => {
    preview = document.createElement('div');
    preview.innerHTML =
      '<p data-pkc-source-line="2"><span class="inner">deep</span></p>';
  });

  it('returns line when element itself is anchored', () => {
    const p = preview.querySelector('p')!;
    expect(findSourceLineForElement(p)).toBe(2);
  });

  it('returns line via closest() ancestor lookup', () => {
    const span = preview.querySelector('.inner')!;
    expect(findSourceLineForElement(span)).toBe(2);
  });

  it('returns null when no anchored ancestor exists', () => {
    const root = document.createElement('div');
    const orphan = document.createElement('p');
    orphan.textContent = 'no anchor';
    root.appendChild(orphan);
    expect(findSourceLineForElement(orphan)).toBeNull();
  });

  it('returns null when anchored ancestor has non-numeric line', () => {
    const root = document.createElement('div');
    const bad = document.createElement('p');
    bad.setAttribute('data-pkc-source-line', 'wat');
    root.appendChild(bad);
    expect(findSourceLineForElement(bad)).toBeNull();
  });
});

describe('findSourceLineByPoint', () => {
  // happy-dom does not implement realistic getBoundingClientRect()
  // — every element returns DOMRect with all zeros. Stub it per
  // element to simulate a layout where blocks sit at specific Ys.
  function stubRect(el: HTMLElement, top: number): void {
    const height = 20;
    el.getBoundingClientRect = (): DOMRect =>
      ({
        top,
        bottom: top + height,
        left: 0,
        right: 100,
        width: 100,
        height,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it('returns the line of the block at-or-above the click', () => {
    const preview = document.createElement('div');
    const a = document.createElement('p');
    a.setAttribute('data-pkc-source-line', '0');
    stubRect(a, 0);
    preview.appendChild(a);
    const b = document.createElement('p');
    b.setAttribute('data-pkc-source-line', '5');
    stubRect(b, 100);
    preview.appendChild(b);
    const c = document.createElement('p');
    c.setAttribute('data-pkc-source-line', '10');
    stubRect(c, 200);
    preview.appendChild(c);
    // Click at y=150 (between b at 100 and c at 200) → b wins.
    expect(findSourceLineByPoint(preview, 150)).toBe(5);
  });

  it('falls back to the first anchor when click is above all blocks', () => {
    const preview = document.createElement('div');
    const first = document.createElement('p');
    first.setAttribute('data-pkc-source-line', '3');
    stubRect(first, 50);
    preview.appendChild(first);
    // Click at y=10 — above first block. Falls back to first
    // anchor's line.
    expect(findSourceLineByPoint(preview, 10)).toBe(3);
  });

  it('returns null on preview with no anchors', () => {
    const preview = document.createElement('div');
    expect(findSourceLineByPoint(preview, 100)).toBeNull();
  });
});

describe('caretOffsetForSourceLine', () => {
  it('line 0 always returns 0', () => {
    expect(caretOffsetForSourceLine('abc\ndef', 0)).toBe(0);
    expect(caretOffsetForSourceLine('', 0)).toBe(0);
    expect(caretOffsetForSourceLine('no newlines', 0)).toBe(0);
  });

  it('line N returns offset of first char on line N', () => {
    expect(caretOffsetForSourceLine('abc\ndef', 1)).toBe(4);
    expect(caretOffsetForSourceLine('a\nb\nc', 1)).toBe(2);
    expect(caretOffsetForSourceLine('a\nb\nc', 2)).toBe(4);
  });

  it('out-of-range line returns end-of-text', () => {
    expect(caretOffsetForSourceLine('abc\ndef', 5)).toBe(7);
    expect(caretOffsetForSourceLine('', 3)).toBe(0);
  });

  it('handles trailing newline correctly', () => {
    // text "a\n" has 2 lines: line 0 = "a", line 1 = "" (empty)
    expect(caretOffsetForSourceLine('a\n', 1)).toBe(2);
    // line 2 doesn't exist — return end
    expect(caretOffsetForSourceLine('a\n', 2)).toBe(2);
  });

  it('round-trip: caretSourceLine ∘ caretOffsetForSourceLine == identity', () => {
    const text = 'line0\nline1\nline2\nline3';
    for (let line = 0; line <= 3; line++) {
      const offset = caretOffsetForSourceLine(text, line);
      const ta = makeTextarea(text, offset);
      expect(caretSourceLine(ta)).toBe(line);
    }
  });
});
