/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { applySnippet } from '@adapter/ui/snippet-toolbar';

/**
 * iPhone snippet toolbar Phase 1 拡張 test(2026-05-07、wave-10-2)。
 *
 * 既存 snippet(backtick / fence / heading 等)に加え、wave-10-2 Phase 1 で
 * 追加した markdown 拡張記法に対応する snippet を test。
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

function setSelection(s: number, e: number): void {
  ta.selectionStart = s;
  ta.selectionEnd = e;
}

describe('iPhone snippet toolbar — wave-10-2 Phase 1 拡張', () => {
  describe('align-center / right / left(L-5)', () => {
    it('行頭で `align-center` → `|| ` を挿入', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'align-center');
      expect(ta.value).toBe('|| ');
      expect(ta.selectionStart).toBe(3);
    });

    it('行中で `align-center` → 改行 + `|| ` を挿入', () => {
      ta.value = '通常段落';
      setCursor(4);
      applySnippet(ta, 'align-center');
      expect(ta.value).toBe('通常段落\n|| ');
    });

    it('`align-right` → `|> ` 挿入', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'align-right');
      expect(ta.value).toBe('|> ');
    });

    it('`align-left` → `<| ` 挿入', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'align-left');
      expect(ta.value).toBe('<| ');
    });
  });

  describe('section-break(L-1)', () => {
    it('行頭で `section-break` → `+++` 行', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'section-break');
      expect(ta.value).toContain('+++\n');
    });

    it('行中で `section-break` → 改行 + `+++` + 改行', () => {
      ta.value = '段落';
      setCursor(2);
      applySnippet(ta, 'section-break');
      expect(ta.value).toContain('段落\n\n+++\n\n');
    });
  });

  describe('highlight(L-2)', () => {
    it('selection なし `highlight` → `====` で caret 中央', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'highlight');
      expect(ta.value).toBe('====');
      expect(ta.selectionStart).toBe(2);
    });

    it('selection あり `highlight` → wrap', () => {
      ta.value = '注目テキスト';
      setSelection(0, 6);
      applySnippet(ta, 'highlight');
      expect(ta.value).toBe('==注目テキスト==');
    });
  });

  describe('ruby(L-2)', () => {
    it('selection なし `ruby` → 雛形 [[ruby:漢字|かんじ]] で caret 配置', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'ruby');
      expect(ta.value).toBe('[[ruby:漢字|かんじ]]');
      expect(ta.selectionStart).toBe(7);  // caret on '漢' for quick replace
    });

    it('selection あり `ruby` → base に挿入、reading 空で caret 配置', () => {
      ta.value = '東京';
      setSelection(0, 2);
      applySnippet(ta, 'ruby');
      expect(ta.value).toBe('[[ruby:東京|]]');
    });
  });

  describe('em-dot(L-2)', () => {
    it('selection なし `em-dot` → `[[em:]]` で caret 中央', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'em-dot');
      expect(ta.value).toBe('[[em:]]');
      expect(ta.selectionStart).toBe(5);
    });

    it('selection あり `em-dot` → wrap', () => {
      ta.value = '重要';
      setSelection(0, 2);
      applySnippet(ta, 'em-dot');
      expect(ta.value).toBe('[[em:重要]]');
    });
  });

  describe('comment-inline(L-4)', () => {
    it('selection なし → `%%  %%` で caret 中央', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'comment-inline');
      expect(ta.value).toBe('%%  %%');
      expect(ta.selectionStart).toBe(3);
    });

    it('selection あり → wrap', () => {
      ta.value = 'メモ';
      setSelection(0, 2);
      applySnippet(ta, 'comment-inline');
      expect(ta.value).toBe('%% メモ %%');
    });
  });

  describe('simple-inline(L-6)', () => {
    it('selection なし → `::bold:` で caret は最初の `:` 直後', () => {
      ta.value = '';
      setCursor(0);
      applySnippet(ta, 'simple-inline');
      expect(ta.value).toBe('::bold:');
      expect(ta.selectionStart).toBe(1);
    });

    it('selection あり → `:text:bold:` で wrap', () => {
      ta.value = '太字';
      setSelection(0, 2);
      applySnippet(ta, 'simple-inline');
      expect(ta.value).toBe(':太字:bold:');
    });
  });

  describe('input event', () => {
    it('snippet 適用で input event が dispatch される', () => {
      ta.value = '';
      setCursor(0);
      let inputFired = false;
      ta.addEventListener('input', () => { inputFired = true; });
      applySnippet(ta, 'align-center');
      expect(inputFired).toBe(true);
    });
  });
});
