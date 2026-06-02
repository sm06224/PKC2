/**
 * @vitest-environment happy-dom
 *
 * ① 編集中ファイルドロップ → drop 位置 anchor。
 *
 * `textareaOffsetAtPoint` は drop 座標を textarea value の文字オフセット
 * へ変換する。`caretPositionFromPoint`(Firefox)/ `caretRangeFromPoint`
 * (Chrome / Safari)が当該 textarea を node として返したときのみ採用し、
 * 別 node / API 非対応のときは `null`(呼び出し側は selectionStart へ
 * fallback)。drop 座標 → オフセットの実挙動は実ブラウザ smoke で検証。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { textareaOffsetAtPoint } from '@adapter/ui/action-binder';

function makeTextarea(value: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = value;
  document.body.appendChild(ta);
  return ta;
}

interface MutableDoc {
  caretPositionFromPoint?: unknown;
  caretRangeFromPoint?: unknown;
}

afterEach(() => {
  delete (document as unknown as MutableDoc).caretPositionFromPoint;
  delete (document as unknown as MutableDoc).caretRangeFromPoint;
  document.body.innerHTML = '';
});

describe('① textareaOffsetAtPoint', () => {
  it('caretPositionFromPoint が当該 textarea を返せば offset を採用する', () => {
    const ta = makeTextarea('0123456789');
    (document as unknown as MutableDoc).caretPositionFromPoint = () => ({
      offsetNode: ta, offset: 5,
    });
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBe(5);
  });

  it('offset が value 長を超えるときは value 長へ clamp する', () => {
    const ta = makeTextarea('0123456789');
    (document as unknown as MutableDoc).caretPositionFromPoint = () => ({
      offsetNode: ta, offset: 999,
    });
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBe(10);
  });

  it('負の offset は 0 へ clamp する', () => {
    const ta = makeTextarea('0123456789');
    (document as unknown as MutableDoc).caretPositionFromPoint = () => ({
      offsetNode: ta, offset: -3,
    });
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBe(0);
  });

  it('別 node を返したときは null(誤った位置を採らない)', () => {
    const ta = makeTextarea('0123456789');
    const other = document.createElement('div');
    (document as unknown as MutableDoc).caretPositionFromPoint = () => ({
      offsetNode: other, offset: 5,
    });
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBeNull();
  });

  it('caretPositionFromPoint が null なら caretRangeFromPoint へ fallback する', () => {
    const ta = makeTextarea('0123456789');
    (document as unknown as MutableDoc).caretPositionFromPoint = () => null;
    (document as unknown as MutableDoc).caretRangeFromPoint = () => ({
      startContainer: ta, startOffset: 7,
    });
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBe(7);
  });

  it('どちらの API も無いときは null(呼び出し側が selectionStart へ fallback)', () => {
    const ta = makeTextarea('0123456789');
    expect(textareaOffsetAtPoint(ta, 10, 10)).toBeNull();
  });
});
