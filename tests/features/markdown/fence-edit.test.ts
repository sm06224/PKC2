/**
 * fence その場編集の行 splice 純関数(fence-edit.ts)contract。
 * code-edit-lite-design-2026-07 §4。
 */
import { describe, it, expect } from 'vitest';
import {
  sliceFenceAt,
  replaceFenceInner,
  frontmatterLineOffset,
} from '../../../src/features/markdown/fence-edit';

const BODY = [
  '# title',      // 0
  '',             // 1
  '```csv noheader', // 2
  'a,b',          // 3
  '1,2',          // 4
  '```',          // 5
  '',             // 6
  'after',        // 7
].join('\n');

describe('sliceFenceAt', () => {
  it('通常 fence: inner / info / hasClosing を返す', () => {
    const s = sliceFenceAt(BODY, 2, 6)!;
    expect(s.inner).toBe('a,b\n1,2');
    expect(s.info).toBe('csv noheader');
    expect(s.hasClosing).toBe(true);
  });

  it('~~~ fence も対象、EOF 未閉鎖は hasClosing=false', () => {
    const b = '~~~js\nconst a = 1;';
    const s = sliceFenceAt(b, 0, 2)!;
    expect(s.inner).toBe('const a = 1;');
    expect(s.hasClosing).toBe(false);
    expect(s.info).toBe('js');
  });

  it('開き行が fence でない / 範囲不正は null', () => {
    expect(sliceFenceAt(BODY, 0, 6)).toBeNull();
    expect(sliceFenceAt(BODY, 2, 2)).toBeNull();
    expect(sliceFenceAt(BODY, 2, 999)).toBeNull();
  });

  it('中身が空の fence', () => {
    const b = '```\n```';
    const s = sliceFenceAt(b, 0, 2)!;
    expect(s.inner).toBe('');
    expect(s.hasClosing).toBe(true);
  });
});

describe('replaceFenceInner', () => {
  it('中身だけ差し替え、前後と fence 行は不変', () => {
    const s = sliceFenceAt(BODY, 2, 6)!;
    const out = replaceFenceInner(BODY, s, 'x,y\n3,4\n5,6');
    expect(out).toBe([
      '# title', '', '```csv noheader', 'x,y', '3,4', '5,6', '```', '', 'after',
    ].join('\n'));
  });

  it('editor 由来の末尾改行 1 つは正規化(閉じ fence 前に空行を増やさない)', () => {
    const s = sliceFenceAt(BODY, 2, 6)!;
    const out = replaceFenceInner(BODY, s, 'only\n');
    expect(out).toContain('```csv noheader\nonly\n```');
  });

  it('空文字へ差し替え(中身ゼロ)', () => {
    const s = sliceFenceAt(BODY, 2, 6)!;
    const out = replaceFenceInner(BODY, s, '');
    expect(out).toContain('```csv noheader\n```');
  });

  it('EOF 未閉鎖 fence でも壊れない', () => {
    const b = '```js\nold';
    const s = sliceFenceAt(b, 0, 2)!;
    expect(replaceFenceInner(b, s, 'new1\nnew2')).toBe('```js\nnew1\nnew2');
  });
});

describe('frontmatterLineOffset', () => {
  it('frontmatter の行数を返す(strip 済みとの差分から)', () => {
    const full = '---\ntitle: x\n---\nbody line';
    const stripped = 'body line';
    expect(frontmatterLineOffset(full, stripped)).toBe(3);
  });

  it('frontmatter 無しは 0', () => {
    expect(frontmatterLineOffset('body', 'body')).toBe(0);
  });
});
