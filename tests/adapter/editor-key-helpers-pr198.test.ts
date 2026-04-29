/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleEditorEnter,
  handleEditorBracketOpen,
  handleEditorSkipOut,
  handleEditorTab,
  handleEditorSpaceIndent,
  tryHandleEditorKey,
  handleEditorBeforeInput,
} from '@adapter/ui/editor-key-helpers';

/**
 * PR #198 — editor textarea key helpers.
 *
 * Tests pin three orthogonal enhancements:
 *   1. Enter — indent maintenance + list continuation + escape
 *   2. Bracket open — auto-pair with cursor between
 *   3. Bracket close (or matching quote) — skip-out
 *
 * Each helper is pure DOM (no dispatcher / state coupling) so tests
 * can drive a bare `<textarea>`.
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

describe('handleEditorEnter — indent + list continuation', () => {
  it('preserves leading indent on a plain indented line', () => {
    ta.value = '    plain line';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('    plain line\n    ');
    expect(ta.selectionStart).toBe(ta.value.length);
  });

  it('continues an unordered list (- marker)', () => {
    ta.value = '- first';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('- first\n- ');
  });

  it('continues an unordered list with * marker', () => {
    ta.value = '* item';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('* item\n* ');
  });

  it('continues an ordered list and increments the number', () => {
    ta.value = '1. one';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('1. one\n2. ');
  });

  it('escapes empty list line by dropping the marker', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('');
  });

  it('escapes empty list line in the middle of a list', () => {
    ta.value = '- first\n- ';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    // The empty `- ` line collapses to no marker / no indent.
    expect(ta.value).toBe('- first\n');
  });

  it('continues a nested indented list', () => {
    ta.value = '  - nested';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('  - nested\n  - ');
  });

  it('continues a checkbox task list with empty checkbox', () => {
    ta.value = '- [x] done task';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(true);
    expect(ta.value).toBe('- [x] done task\n- [ ] ');
  });

  it('returns false for selection range (let default replace)', () => {
    ta.value = 'abcdef';
    setSelection(1, 4);
    expect(handleEditorEnter(ta)).toBe(false);
    expect(ta.value).toBe('abcdef'); // unchanged
  });

  it('returns false for a plain non-indented line (let default + later handlers run)', () => {
    // PR #198 v2: plain Enter on `foo` (no indent, no marker) yields
    // to downstream handlers (inline-calc, quote-continuation,
    // textlog-append-on-Ctrl-Enter, etc.) so they keep working.
    ta.value = 'plain foo';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(false);
    expect(ta.value).toBe('plain foo'); // unchanged, default will insert \n
  });

  it('returns false for a plain expression-like line (inline calc compat)', () => {
    ta.value = '2+3=';
    setCursor(ta.value.length);
    expect(handleEditorEnter(ta)).toBe(false);
  });
});

describe('handleEditorBracketOpen — pair completion', () => {
  it('inserts ()  with cursor between for (', () => {
    ta.value = 'foo';
    setCursor(3);
    expect(handleEditorBracketOpen(ta, '(')).toBe(true);
    expect(ta.value).toBe('foo()');
    expect(ta.selectionStart).toBe(4);
  });

  it('inserts [] with cursor between for [', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBracketOpen(ta, '[')).toBe(true);
    expect(ta.value).toBe('[]');
    expect(ta.selectionStart).toBe(1);
  });

  it('inserts {} for {', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBracketOpen(ta, '{')).toBe(true);
    expect(ta.value).toBe('{}');
    expect(ta.selectionStart).toBe(1);
  });

  it('inserts "" for " ', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBracketOpen(ta, '"')).toBe(true);
    expect(ta.value).toBe('""');
    expect(ta.selectionStart).toBe(1);
  });

  it('inserts backtick pair for `', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBracketOpen(ta, '`')).toBe(true);
    expect(ta.value).toBe('``');
    expect(ta.selectionStart).toBe(1);
  });

  it('does NOT pair when next char is a word character', () => {
    ta.value = 'foo';
    setCursor(0); // before 'f'
    expect(handleEditorBracketOpen(ta, '(')).toBe(false);
    expect(ta.value).toBe('foo');
  });

  it('does NOT pair on selection range', () => {
    ta.value = 'abcdef';
    setSelection(1, 4);
    expect(handleEditorBracketOpen(ta, '(')).toBe(false);
  });

  it('returns false for non-pairable character', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBracketOpen(ta, 'x')).toBe(false);
  });
});

describe('handleEditorSkipOut — skip when cursor before same closer', () => {
  it('moves cursor forward past )', () => {
    ta.value = '()';
    setCursor(1); // between ( and )
    expect(handleEditorSkipOut(ta, ')')).toBe(true);
    expect(ta.selectionStart).toBe(2);
    expect(ta.value).toBe('()');
  });

  it('moves cursor forward past " ', () => {
    ta.value = '""';
    setCursor(1);
    expect(handleEditorSkipOut(ta, '"')).toBe(true);
    expect(ta.selectionStart).toBe(2);
  });

  it('returns false when next char does NOT match', () => {
    ta.value = 'foo';
    setCursor(0);
    expect(handleEditorSkipOut(ta, ')')).toBe(false);
  });

  it('returns false on selection range', () => {
    ta.value = '()';
    setSelection(0, 2);
    expect(handleEditorSkipOut(ta, ')')).toBe(false);
  });
});

describe('handleEditorTab — list indent + multi-line', () => {
  it('indents an empty list slot (cursor at end of `- `)', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(true);
    expect(ta.value).toBe('  - ');
    expect(ta.selectionStart).toBe(ta.value.length);
  });

  it('indents an ordered list slot (`1. `)', () => {
    ta.value = '1. ';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(true);
    expect(ta.value).toBe('  1. ');
  });

  it('indents an empty checkbox list slot', () => {
    ta.value = '- [ ] ';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(true);
    expect(ta.value).toBe('  - [ ] ');
  });

  it('returns false for plain prose Tab (no list slot, single cursor)', () => {
    ta.value = 'plain';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(false);
  });

  it('returns false when content already follows the marker', () => {
    ta.value = '- foo';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(false);
  });

  it('Shift+Tab outdents an indented empty list slot', () => {
    ta.value = '  - ';
    setCursor(ta.value.length);
    expect(handleEditorTab(ta, true)).toBe(true);
    expect(ta.value).toBe('- ');
  });

  it('Shift+Tab on root-level empty list slot returns false', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    // Already at root indent — nothing to outdent.
    expect(handleEditorTab(ta, true)).toBe(false);
  });

  it('multi-line selection: Tab indents every line', () => {
    ta.value = 'line1\nline2\nline3';
    setSelection(0, ta.value.length);
    expect(handleEditorTab(ta, false)).toBe(true);
    expect(ta.value).toBe('  line1\n  line2\n  line3');
    // Selection covers all of the indented region.
    expect(ta.selectionStart).toBe(0);
    expect(ta.selectionEnd).toBe(ta.value.length);
  });

  it('multi-line selection: Shift+Tab outdents every line', () => {
    ta.value = '  line1\n  line2\n  line3';
    setSelection(0, ta.value.length);
    expect(handleEditorTab(ta, true)).toBe(true);
    expect(ta.value).toBe('line1\nline2\nline3');
  });

  it('multi-line Shift+Tab is idempotent on lines that have nothing to outdent', () => {
    ta.value = 'a\n  b\nc';
    setSelection(0, ta.value.length);
    expect(handleEditorTab(ta, true)).toBe(true);
    // Only `  b` had indent to remove.
    expect(ta.value).toBe('a\nb\nc');
  });

  it('single-line selection on a list slot does NOT trigger multi-line; returns false', () => {
    // start === end-without-newline AND no list slot precondition
    ta.value = 'foo bar';
    setSelection(0, 3); // single line selection
    expect(handleEditorTab(ta, false)).toBe(false);
  });
});

describe('handleEditorSpaceIndent — Space at empty list slot', () => {
  it('indents empty `- ` slot when Space is pressed', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    expect(handleEditorSpaceIndent(ta)).toBe(true);
    expect(ta.value).toBe('  - ');
  });

  it('returns false when content follows the marker (normal Space behavior)', () => {
    ta.value = '- foo';
    setCursor(ta.value.length);
    expect(handleEditorSpaceIndent(ta)).toBe(false);
  });

  it('returns false on plain prose (no list slot)', () => {
    ta.value = 'hello';
    setCursor(ta.value.length);
    expect(handleEditorSpaceIndent(ta)).toBe(false);
  });

  it('returns false on selection range', () => {
    ta.value = '- ';
    setSelection(0, 2);
    expect(handleEditorSpaceIndent(ta)).toBe(false);
  });
});

describe('handleEditorBeforeInput — bracket auto-pair / skip-out via beforeinput (iOS workaround)', () => {
  function makeBeforeInput(data: string): InputEvent {
    return new InputEvent('beforeinput', { data, inputType: 'insertText' });
  }

  it('inserts () with cursor between when typing (', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBeforeInput(ta, makeBeforeInput('('))).toBe(true);
    expect(ta.value).toBe('()');
    expect(ta.selectionStart).toBe(1);
  });

  it('inserts pair for [ ` { "', () => {
    for (const open of ['[', '`', '{', '"']) {
      ta.value = '';
      setCursor(0);
      expect(handleEditorBeforeInput(ta, makeBeforeInput(open))).toBe(true);
      expect(ta.value.length).toBe(2);
      expect(ta.selectionStart).toBe(1);
    }
  });

  it('does NOT pair when next char is a word character', () => {
    ta.value = 'foo';
    setCursor(0);
    expect(handleEditorBeforeInput(ta, makeBeforeInput('('))).toBe(false);
  });

  it('does NOT pair on selection range', () => {
    ta.value = 'abcdef';
    setSelection(1, 4);
    expect(handleEditorBeforeInput(ta, makeBeforeInput('('))).toBe(false);
  });

  it('skip-out: cursor before same closer steps cursor forward', () => {
    ta.value = '()';
    setCursor(1);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(')'))).toBe(true);
    expect(ta.value).toBe('()');
    expect(ta.selectionStart).toBe(2);
  });

  it('skip-out for symmetric quote', () => {
    ta.value = '""';
    setCursor(1);
    expect(handleEditorBeforeInput(ta, makeBeforeInput('"'))).toBe(true);
    expect(ta.value).toBe('""');
    expect(ta.selectionStart).toBe(2);
  });

  it('returns false for non-pair / non-closer single chars', () => {
    ta.value = '';
    setCursor(0);
    expect(handleEditorBeforeInput(ta, makeBeforeInput('a'))).toBe(false);
  });

  it('ignores composition / paste / non-insertText input types', () => {
    ta.value = '';
    setCursor(0);
    const e = new InputEvent('beforeinput', { data: '(', inputType: 'insertCompositionText' });
    expect(handleEditorBeforeInput(ta, e)).toBe(false);
  });

  it('ignores multi-character data (e.g. paste-by-key)', () => {
    ta.value = '';
    setCursor(0);
    const e = new InputEvent('beforeinput', { data: '((', inputType: 'insertText' });
    expect(handleEditorBeforeInput(ta, e)).toBe(false);
  });

  it('ignores null data (e.g. delete)', () => {
    ta.value = 'abc';
    setCursor(3);
    const e = new InputEvent('beforeinput', { inputType: 'deleteContentBackward' });
    expect(handleEditorBeforeInput(ta, e)).toBe(false);
  });

  it('Space at empty list slot indents (iOS soft-keyboard workaround)', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(' '))).toBe(true);
    expect(ta.value).toBe('  - ');
    expect(ta.selectionStart).toBe(ta.value.length);
  });

  it('Space at empty ordered list slot indents', () => {
    ta.value = '1. ';
    setCursor(ta.value.length);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(' '))).toBe(true);
    expect(ta.value).toBe('  1. ');
  });

  it('Space at empty checkbox list slot indents', () => {
    ta.value = '- [ ] ';
    setCursor(ta.value.length);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(' '))).toBe(true);
    expect(ta.value).toBe('  - [ ] ');
  });

  it('Space on plain prose returns false (let default insert space)', () => {
    ta.value = 'hello';
    setCursor(ta.value.length);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(' '))).toBe(false);
  });

  it('Space when content already follows the marker returns false', () => {
    ta.value = '- foo';
    setCursor(ta.value.length);
    expect(handleEditorBeforeInput(ta, makeBeforeInput(' '))).toBe(false);
  });
});

describe('tryHandleEditorKey — dispatch master', () => {
  it('routes Enter to handleEditorEnter', () => {
    ta.value = '- foo';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: 'Enter' });
    expect(tryHandleEditorKey(ta, e)).toBe(true);
    expect(ta.value).toBe('- foo\n- ');
  });

  it('does NOT route ( in keydown (bracket logic moved to beforeinput, iOS workaround)', () => {
    ta.value = '';
    setCursor(0);
    const e = new KeyboardEvent('keydown', { key: '(' });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
    expect(ta.value).toBe('');
  });

  it('does NOT route closing quote in keydown (bracket logic moved to beforeinput)', () => {
    ta.value = '""';
    setCursor(1);
    const e = new KeyboardEvent('keydown', { key: '"' });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
    expect(ta.value).toBe('""');
  });

  it('Shift+Enter is NOT consumed (let user insert literal newline)', () => {
    ta.value = '- foo';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
  });

  it('routes Tab to handleEditorTab (list slot)', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: 'Tab' });
    expect(tryHandleEditorKey(ta, e)).toBe(true);
    expect(ta.value).toBe('  - ');
  });

  it('routes Tab to handleEditorTab (multi-line)', () => {
    ta.value = 'a\nb\nc';
    setSelection(0, ta.value.length);
    const e = new KeyboardEvent('keydown', { key: 'Tab' });
    expect(tryHandleEditorKey(ta, e)).toBe(true);
    expect(ta.value).toBe('  a\n  b\n  c');
  });

  it('Tab on plain prose returns false (falls through to default \\t insert)', () => {
    ta.value = 'plain';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: 'Tab' });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
  });

  it('routes Space to handleEditorSpaceIndent at empty list slot', () => {
    ta.value = '- ';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: ' ' });
    expect(tryHandleEditorKey(ta, e)).toBe(true);
    expect(ta.value).toBe('  - ');
  });

  it('Space on plain prose returns false (let default insert space)', () => {
    ta.value = 'hello';
    setCursor(ta.value.length);
    const e = new KeyboardEvent('keydown', { key: ' ' });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
  });

  it('returns false for non-handled keys', () => {
    ta.value = '';
    setCursor(0);
    const e = new KeyboardEvent('keydown', { key: 'a' });
    expect(tryHandleEditorKey(ta, e)).toBe(false);
  });
});
