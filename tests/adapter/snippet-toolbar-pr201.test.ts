/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderSnippetToolbar,
  applySnippet,
} from '@adapter/ui/snippet-toolbar';

/**
 * PR #201 — iPhone / iPad snippet toolbar.
 *
 * Tests pin two surfaces:
 *   1. `renderSnippetToolbar()` — DOM shape (region marker, buttons,
 *      a11y attrs, hidden by default).
 *   2. `applySnippet(ta, kind)` — text insertion + caret placement
 *      for each snippet kind, including selection wrap behaviour.
 */

let ta: HTMLTextAreaElement;

beforeEach(() => {
  ta = document.createElement('textarea');
  document.body.appendChild(ta);
});

function setCursor(at: number): void {
  ta.selectionStart = at;
  ta.selectionEnd = at;
}

function setSelection(start: number, end: number): void {
  ta.selectionStart = start;
  ta.selectionEnd = end;
}

describe('renderSnippetToolbar — DOM shape', () => {
  it('renders a region marked container, hidden by default', () => {
    const el = renderSnippetToolbar();
    expect(el.getAttribute('data-pkc-region')).toBe('snippet-toolbar');
    expect(el.hidden).toBe(true);
    expect(el.getAttribute('role')).toBe('toolbar');
    expect(el.getAttribute('aria-label')).toBeTruthy();
  });

  it('emits one button per snippet kind', () => {
    const el = renderSnippetToolbar();
    const btns = el.querySelectorAll('[data-pkc-snippet]');
    // backtick / fence / paren / bracket / brace / angle / dash / quote / heading
    expect(btns.length).toBe(9);
  });

  it('each button has type=button to avoid form submission', () => {
    const el = renderSnippetToolbar();
    const btns = el.querySelectorAll<HTMLButtonElement>('[data-pkc-snippet]');
    for (const b of btns) {
      expect(b.type).toBe('button');
    }
  });

  it('each button has a title and aria-label for a11y', () => {
    const el = renderSnippetToolbar();
    const btns = el.querySelectorAll<HTMLElement>('[data-pkc-snippet]');
    for (const b of btns) {
      expect(b.getAttribute('title')).toBeTruthy();
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('applySnippet — backtick', () => {
  it('inserts a single backtick at cursor and advances caret', () => {
    ta.value = 'foo';
    setCursor(3);
    applySnippet(ta, 'backtick');
    expect(ta.value).toBe('foo`');
    expect(ta.selectionStart).toBe(4);
  });

  it('wraps selection with backticks for inline code', () => {
    ta.value = 'foo bar baz';
    setSelection(4, 7); // "bar"
    applySnippet(ta, 'backtick');
    expect(ta.value).toBe('foo `bar` baz');
    // Caret lands after the closing backtick
    expect(ta.selectionStart).toBe(9);
  });
});

describe('applySnippet — pair (paren / bracket / brace / angle)', () => {
  it('paren inserts ()  with cursor between', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'paren');
    expect(ta.value).toBe('()');
    expect(ta.selectionStart).toBe(1);
  });

  it('bracket inserts []', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'bracket');
    expect(ta.value).toBe('[]');
    expect(ta.selectionStart).toBe(1);
  });

  it('brace inserts {}', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'brace');
    expect(ta.value).toBe('{}');
    expect(ta.selectionStart).toBe(1);
  });

  it('angle inserts <>', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'angle');
    expect(ta.value).toBe('<>');
    expect(ta.selectionStart).toBe(1);
  });

  it('paren wraps a selection with caret after the closer', () => {
    ta.value = 'hello world';
    setSelection(6, 11); // "world"
    applySnippet(ta, 'paren');
    expect(ta.value).toBe('hello (world)');
    expect(ta.selectionStart).toBe(13);
  });
});

describe('applySnippet — fence (code block)', () => {
  it('on an empty line inserts ```\\n\\n``` with cursor on the middle line', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'fence');
    expect(ta.value).toBe('```\n\n```\n');
    // Cursor sits after "```\n" (pos 4) on the empty middle line
    expect(ta.selectionStart).toBe(4);
  });

  it('mid-line prepends a newline before the opening fence', () => {
    ta.value = 'foo';
    setCursor(3);
    applySnippet(ta, 'fence');
    expect(ta.value).toBe('foo\n```\n\n```\n');
    // After "foo\n```\n" → pos 8
    expect(ta.selectionStart).toBe(8);
  });

  it('wraps a selection in a fence and lands caret right after opening ```', () => {
    ta.value = 'console.log(1)';
    setSelection(0, ta.value.length);
    applySnippet(ta, 'fence');
    expect(ta.value).toBe('```\nconsole.log(1)\n```\n');
    // Caret lands after the opening "```" so user can type a lang tag
    expect(ta.selectionStart).toBe(3);
  });
});

describe('applySnippet — line-prefix snippets (dash / quote / heading)', () => {
  it('dash on an empty line inserts "- "', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'dash');
    expect(ta.value).toBe('- ');
    expect(ta.selectionStart).toBe(2);
  });

  it('dash mid-content inserts a bare dash (no space)', () => {
    ta.value = 'foo';
    setCursor(3);
    applySnippet(ta, 'dash');
    expect(ta.value).toBe('foo-');
    expect(ta.selectionStart).toBe(4);
  });

  it('quote at start of line inserts "> "', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'quote');
    expect(ta.value).toBe('> ');
    expect(ta.selectionStart).toBe(2);
  });

  it('heading at start of line inserts "# "', () => {
    ta.value = '';
    setCursor(0);
    applySnippet(ta, 'heading');
    expect(ta.value).toBe('# ');
    expect(ta.selectionStart).toBe(2);
  });

  it('heading after a newline still counts as line start', () => {
    ta.value = 'previous\n';
    setCursor(ta.value.length);
    applySnippet(ta, 'heading');
    expect(ta.value).toBe('previous\n# ');
    expect(ta.selectionStart).toBe(11);
  });

  it('whitespace-only line is treated as line start', () => {
    ta.value = '  ';
    setCursor(2);
    applySnippet(ta, 'dash');
    // Already at "line start" because preceding chars are whitespace
    expect(ta.value).toBe('  - ');
    expect(ta.selectionStart).toBe(4);
  });
});

describe('applySnippet — input event dispatch', () => {
  it('dispatches an `input` event after applying the snippet', () => {
    ta.value = '';
    setCursor(0);
    let fired = false;
    ta.addEventListener('input', () => {
      fired = true;
    });
    applySnippet(ta, 'paren');
    expect(fired).toBe(true);
  });
});
