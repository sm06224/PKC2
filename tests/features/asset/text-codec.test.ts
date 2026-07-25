/**
 * text ⇄ base64 codec(text-codec.ts)contract。
 * code-edit-lite-design-2026-07 §5(散在パターンの集約先)。
 */
import { describe, it, expect } from 'vitest';
import { textToBase64, base64ToText, utf8ByteLength } from '../../../src/features/asset/text-codec';

describe('textToBase64 / base64ToText 往復', () => {
  it('ASCII', () => {
    const b64 = textToBase64('hello');
    expect(b64).toBe('aGVsbG8=');
    expect(base64ToText(b64)).toBe('hello');
  });

  it('UTF-8(日本語 / 絵文字)を壊さない', () => {
    for (const s of ['日本語のテキスト', '絵文字😀🎉', '混在 mixed 文字列']) {
      expect(base64ToText(textToBase64(s))).toBe(s);
    }
  });

  it('Latin-1 外(btoa 直渡しなら例外になる文字)も往復する', () => {
    const s = '「あ」→ é ñ ü';
    expect(base64ToText(textToBase64(s))).toBe(s);
  });

  it('改行・タブ・制御文字を保持', () => {
    const s = 'a\n\tb\r\nc';
    expect(base64ToText(textToBase64(s))).toBe(s);
  });
});

describe('base64ToText の異常系', () => {
  it('空文字 / 不正 base64 は null', () => {
    expect(base64ToText('')).toBeNull();
    expect(base64ToText('!!!not base64!!!')).toBeNull();
  });
});

describe('utf8ByteLength', () => {
  it('マルチバイトはバイト数で数える', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('あ')).toBe(3); // U+3042 = 3 bytes
    expect(utf8ByteLength('😀')).toBe(4);
  });
});
