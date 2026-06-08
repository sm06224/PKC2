/**
 * γ-A5-5:行レベル LCS diff(multi-window-vscode-extension-spec §5)。
 * `diffRows` の same / del / add 判定と `hasDiff` を検証する。
 */
import { describe, it, expect } from 'vitest';
import { diffRows, hasDiff } from '@features/diff/line-diff';

describe('γ-A5-5:diffRows', () => {
  it('同一テキストは全行 same', () => {
    const rows = diffRows('a\nb\nc', 'a\nb\nc');
    expect(rows.map((r) => r.op)).toEqual(['same', 'same', 'same']);
    expect(rows[0]).toEqual({ op: 'same', left: 'a', right: 'a' });
  });

  it('1 行変更は del + add になる', () => {
    const rows = diffRows('a\nb\nc', 'a\nB\nc');
    expect(rows.map((r) => r.op)).toEqual(['same', 'del', 'add', 'same']);
    expect(rows[1]).toEqual({ op: 'del', left: 'b', right: null });
    expect(rows[2]).toEqual({ op: 'add', left: null, right: 'B' });
  });

  it('行追加は add のみ', () => {
    const rows = diffRows('a\nc', 'a\nb\nc');
    expect(rows.map((r) => r.op)).toEqual(['same', 'add', 'same']);
    expect(rows[1]!.right).toBe('b');
  });

  it('行削除は del のみ', () => {
    const rows = diffRows('a\nb\nc', 'a\nc');
    expect(rows.map((r) => r.op)).toEqual(['same', 'del', 'same']);
    expect(rows[1]!.left).toBe('b');
  });

  it('末尾追記', () => {
    const rows = diffRows('a', 'a\nb\nc');
    expect(rows.map((r) => r.op)).toEqual(['same', 'add', 'add']);
  });

  it('先頭追加', () => {
    const rows = diffRows('b\nc', 'a\nb\nc');
    expect(rows.map((r) => r.op)).toEqual(['add', 'same', 'same']);
  });

  it('全置換(共通行なし)', () => {
    const rows = diffRows('x\ny', 'p\nq');
    expect(rows.filter((r) => r.op === 'del')).toHaveLength(2);
    expect(rows.filter((r) => r.op === 'add')).toHaveLength(2);
  });

  it('空 → テキスト', () => {
    const rows = diffRows('', 'hello');
    expect(rows.some((r) => r.op === 'add' && r.right === 'hello')).toBe(true);
  });

  it('CJK / 絵文字を含む行を正しく扱う', () => {
    const rows = diffRows('日本語\n旧', '日本語\n新 🎉');
    expect(rows.map((r) => r.op)).toEqual(['same', 'del', 'add']);
    expect(rows[2]!.right).toBe('新 🎉');
  });

  it('left / right の null 規約(del は right=null、add は left=null)', () => {
    const rows = diffRows('only-old', 'only-new');
    const del = rows.find((r) => r.op === 'del')!;
    const add = rows.find((r) => r.op === 'add')!;
    expect(del.right).toBeNull();
    expect(add.left).toBeNull();
  });

  it('巨大入力は安全弁で全 del + 全 add に落ちる', () => {
    const big = Array.from({ length: 4000 }, (_, i) => `L${i}`).join('\n');
    const rows = diffRows(big, big);
    // 安全弁発動 ── same は生成されず del+add のみ。
    expect(rows.every((r) => r.op !== 'same')).toBe(true);
    expect(rows).toHaveLength(8000);
  });

  it('hasDiff:変更ありで true、同一で false', () => {
    expect(hasDiff(diffRows('a\nb', 'a\nB'))).toBe(true);
    expect(hasDiff(diffRows('a\nb', 'a\nb'))).toBe(false);
  });
});
