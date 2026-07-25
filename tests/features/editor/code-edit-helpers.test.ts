/**
 * CodeEditLite 編集支援純関数(code-edit-helpers.ts)の contract。
 * code-edit-lite-design-2026-07 §2(user 裁定 2026-07-25: タグ補完 + wrap 両方)。
 */
import { describe, it, expect } from 'vitest';
import {
  codeEnterPatch,
  codeTabPatch,
  codeBracketPatch,
  codeSkipOutPatch,
  tagCloseOnGtPatch,
  wrapSelectionWithTagPatch,
  codeEditKeyPatch,
  isMarkupLang,
} from '../../../src/features/editor/code-edit-helpers';

describe('codeEnterPatch — indent 継承 + ブロック開始 +1 段', () => {
  it('indent 継承(json)', () => {
    const v = '{\n  "a": 1,';
    const p = codeEnterPatch(v, v.length, v.length, 'json')!;
    expect(p.value).toBe('{\n  "a": 1,\n  ');
    expect(p.selStart).toBe(p.value.length);
  });

  it('{ で終わる行は +1 段', () => {
    const v = 'function f() {';
    const p = codeEnterPatch(v, v.length, v.length, 'js')!;
    expect(p.value).toBe('function f() {\n  ');
  });

  it('caret が {| } の間なら展開(中段 + 閉じを次行へ)', () => {
    const v = 'const a = {}';
    const pos = v.length - 1; // { と } の間
    const p = codeEnterPatch(v, pos, pos, 'js')!;
    expect(p.value).toBe('const a = {\n  \n}');
    expect(p.selStart).toBe('const a = {\n  '.length);
  });

  it('<tag>|</tag> の間でも展開', () => {
    const v = '<div></div>';
    const pos = '<div>'.length;
    const p = codeEnterPatch(v, pos, pos, 'html')!;
    expect(p.value).toBe('<div>\n  \n</div>');
  });

  it('yaml の `key:` は +1 段 / block scalar `key: |` も', () => {
    expect(codeEnterPatch('root:', 5, 5, 'yaml')!.value).toBe('root:\n  ');
    const v = 'text: |';
    expect(codeEnterPatch(v, v.length, v.length, 'yaml')!.value).toBe('text: |\n  ');
  });

  it('html 開きタグ行末は +1 段、自己終了 / 閉じタグ / void は継承のみ', () => {
    expect(codeEnterPatch('<section>', 9, 9, 'html')!.value).toBe('<section>\n  ');
    expect(codeEnterPatch('  <br>', 6, 6, 'html')!.value).toBe('  <br>\n  '); // void → 継承のみ
    expect(codeEnterPatch('  <img />', 9, 9, 'html')!.value).toBe('  <img />\n  ');
    expect(codeEnterPatch('  </div>', 8, 8, 'html')!.value).toBe('  </div>\n  ');
    // xml では void 概念なし → <br> も +1 段
    expect(codeEnterPatch('<br>', 4, 4, 'xml')!.value).toBe('<br>\n  ');
  });

  it('素の改行(indent なし・非ブロック)は null = ブラウザ既定', () => {
    expect(codeEnterPatch('plain text', 10, 10, 'js')).toBeNull();
  });

  it('選択ありは null', () => {
    expect(codeEnterPatch('{ }', 0, 3, 'js')).toBeNull();
  });
});

describe('codeTabPatch', () => {
  it('選択なし Tab は 2 space 挿入', () => {
    const p = codeTabPatch('ab', 1, 1, false)!;
    expect(p.value).toBe('a  b');
    expect(p.selStart).toBe(3);
  });

  it('複数行選択 Tab は各行 indent、Shift+Tab は outdent', () => {
    const v = 'a\nb\nc';
    const p = codeTabPatch(v, 0, v.length, false)!;
    expect(p.value).toBe('  a\n  b\n  c');
    const q = codeTabPatch(p.value, p.selStart, p.selEnd, true)!;
    expect(q.value).toBe(v);
  });

  it('選択なし Shift+Tab は現在行の行頭 indent を 1 unit 外す', () => {
    const v = '  const a = 1;';
    const p = codeTabPatch(v, 8, 8, true)!;
    expect(p.value).toBe('const a = 1;');
    expect(p.selStart).toBe(6);
  });

  it('選択末尾が改行直後なら下の行へ波及しない', () => {
    const v = 'a\nb\nc';
    const p = codeTabPatch(v, 0, 4, false)!; // "a\nb\n" を選択
    expect(p.value).toBe('  a\n  b\nc');
  });
});

describe('codeBracketPatch / codeSkipOutPatch', () => {
  it('開き括弧で対挿入 + caret は間', () => {
    const p = codeBracketPatch('a', 1, 1, '(')!;
    expect(p.value).toBe('a()');
    expect(p.selStart).toBe(2);
  });

  it("code では `'` も対にする(js 文字列)", () => {
    const p = codeBracketPatch('x = ', 4, 4, "'")!;
    expect(p.value).toBe("x = ''");
  });

  it('選択ありは対で包む', () => {
    const p = codeBracketPatch('hello', 0, 5, '"')!;
    expect(p.value).toBe('"hello"');
    expect(p.selStart).toBe(1);
    expect(p.selEnd).toBe(6);
  });

  it('直後が単語文字なら pair しない / 対称 quote 連打は pair しない', () => {
    expect(codeBracketPatch('word', 0, 0, '(')).toBeNull();
    expect(codeBracketPatch("'", 1, 1, "'")).toBeNull();
  });

  it('skip-out: 直後に同じ closer があれば caret 前進のみ', () => {
    const p = codeSkipOutPatch('()', 1, 1, ')')!;
    expect(p.value).toBe('()');
    expect(p.selStart).toBe(2);
  });
});

describe('tagCloseOnGtPatch — `>` で閉じタグ自動補完', () => {
  it('<div → > 入力で ></div> 挿入、caret はタグの間', () => {
    const v = '<div class="a"';
    const p = tagCloseOnGtPatch(v, v.length, v.length, 'html')!;
    expect(p.value).toBe('<div class="a"></div>');
    expect(p.selStart).toBe(v.length + 1);
  });

  it('閉じタグ / 自己終了 / コメント / DOCTYPE では発火しない', () => {
    expect(tagCloseOnGtPatch('</div', 5, 5, 'html')).toBeNull();
    expect(tagCloseOnGtPatch('<br/', 4, 4, 'html')).toBeNull();
    expect(tagCloseOnGtPatch('<!-- x --', 9, 9, 'html')).toBeNull();
    expect(tagCloseOnGtPatch('<!DOCTYPE html', 14, 14, 'html')).toBeNull();
  });

  it('html の void 要素は補完しない / xml では補完する', () => {
    expect(tagCloseOnGtPatch('<br', 3, 3, 'html')).toBeNull();
    const p = tagCloseOnGtPatch('<br', 3, 3, 'xml')!;
    expect(p.value).toBe('<br></br>');
  });

  it('markup 言語以外では発火しない(js の比較演算子)', () => {
    expect(tagCloseOnGtPatch('if (a <b', 8, 8, 'js')).toBeNull();
  });

  it('直近の < が既に閉じていれば発火しない', () => {
    expect(tagCloseOnGtPatch('<div> a ', 8, 8, 'html')).toBeNull();
  });
});

describe('wrapSelectionWithTagPatch', () => {
  it('選択範囲をタグで包み、選択は全体に広がる', () => {
    const p = wrapSelectionWithTagPatch('hello world', 0, 5, 'strong')!;
    expect(p.value).toBe('<strong>hello</strong> world');
    expect(p.selEnd).toBe('<strong>hello</strong>'.length);
  });

  it('空選択は空タグ挿入 + caret は間', () => {
    const p = wrapSelectionWithTagPatch('', 0, 0, 'div')!;
    expect(p.value).toBe('<div></div>');
    expect(p.selStart).toBe('<div>'.length);
  });

  it('不正なタグ名は null', () => {
    expect(wrapSelectionWithTagPatch('x', 0, 1, '1bad')).toBeNull();
    expect(wrapSelectionWithTagPatch('x', 0, 1, '')).toBeNull();
    expect(wrapSelectionWithTagPatch('x', 0, 1, 'a b')).toBeNull();
  });
});

describe('codeEditKeyPatch dispatch / isMarkupLang', () => {
  it('Tab / Enter / > / bracket / closer を振り分ける', () => {
    expect(codeEditKeyPatch('ab', 1, 1, 'Tab', false, 'js')!.value).toBe('a  b');
    expect(codeEditKeyPatch('{', 1, 1, 'Enter', false, 'js')!.value).toBe('{\n  ');
    expect(codeEditKeyPatch('<a', 2, 2, '>', false, 'xml')!.value).toBe('<a></a>');
    expect(codeEditKeyPatch('', 0, 0, '(', false, 'js')!.value).toBe('()');
    expect(codeEditKeyPatch('()', 1, 1, ')', false, 'js')!.selStart).toBe(2);
  });

  it('markup 以外の > はブラウザ既定(null)', () => {
    expect(codeEditKeyPatch('a ', 2, 2, '>', false, 'js')).toBeNull();
  });

  it('isMarkupLang', () => {
    expect(isMarkupLang('html')).toBe(true);
    expect(isMarkupLang('XML')).toBe(true);
    expect(isMarkupLang('svg')).toBe(true);
    expect(isMarkupLang('js')).toBe(false);
  });
});
