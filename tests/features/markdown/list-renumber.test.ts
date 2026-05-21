/**
 * 領域 8 Layer 1 / Layer 2 ── 順序リスト auto-renumber 純関数。
 *
 * `renumberOrderedLists`(全 run)と `renumberOrderedListRunAt`(caret 行を
 * 含む run のみ + caret 追従)を、平坦 / ネスト / fence / 採番モードの軸で
 * 検証する。
 */
import { describe, it, expect } from 'vitest';
import {
  renumberOrderedLists,
  renumberOrderedListRunAt,
} from '@features/markdown/list-renumber';
import { extractListNumberMode } from '@features/markdown/document-globals';

describe('領域 8:renumberOrderedLists(平坦 ── Layer 1)', () => {
  it('連番済みリストは不変(idempotent)', () => {
    expect(renumberOrderedLists('1. a\n2. b\n3. c', 'sequential')).toBe(
      '1. a\n2. b\n3. c',
    );
  });

  it('途中改行で生じた重複番号を連番へ直す', () => {
    expect(renumberOrderedLists('1. a\n2. b\n2. c\n3. d', 'sequential')).toBe(
      '1. a\n2. b\n3. c\n4. d',
    );
  });

  it('行削除で生じた番号ずれ(飛び)を連番へ直す', () => {
    expect(renumberOrderedLists('1. a\n2. b\n4. c\n5. d', 'sequential')).toBe(
      '1. a\n2. b\n3. c\n4. d',
    );
  });

  it('開始番号は run 先頭の番号を保持する(5 始まり → 5,6,7)', () => {
    expect(renumberOrderedLists('5. a\n9. b\n2. c', 'sequential')).toBe(
      '5. a\n6. b\n7. c',
    );
  });

  it('uniform モードは全項目を開始番号へ統一する(1,1,1)', () => {
    expect(renumberOrderedLists('1. a\n2. b\n3. c', 'uniform')).toBe(
      '1. a\n1. b\n1. c',
    );
  });

  it('uniform モードも開始番号を保持する(5 始まり → 5,5,5)', () => {
    expect(renumberOrderedLists('5. a\n6. b\n7. c', 'uniform')).toBe(
      '5. a\n5. b\n5. c',
    );
  });

  it('delimiter `)` を保持したまま採番する', () => {
    expect(renumberOrderedLists('1) a\n3) b\n2) c', 'sequential')).toBe(
      '1) a\n2) b\n3) c',
    );
  });

  it('marker 後の空白量を行ごとに保持する', () => {
    expect(renumberOrderedLists('1.  wide gap\n5.  next', 'sequential')).toBe(
      '1.  wide gap\n2.  next',
    );
  });

  it('CJK / 絵文字を含む中身は保持する', () => {
    expect(
      renumberOrderedLists('1. 日本語の項目\n3. 絵文字 🎉 入り', 'sequential'),
    ).toBe('1. 日本語の項目\n2. 絵文字 🎉 入り');
  });

  it('中身が数字で始まっても marker のみを採番する', () => {
    expect(
      renumberOrderedLists('1. 2024 年の記録\n5. 第 3 章', 'sequential'),
    ).toBe('1. 2024 年の記録\n2. 第 3 章');
  });

  it('順序リスト以外の行は不変、前後の段落も触らない', () => {
    expect(
      renumberOrderedLists('段落。\n1. 項目\n3. 項目\n別の段落。', 'sequential'),
    ).toBe('段落。\n1. 項目\n2. 項目\n別の段落。');
  });

  it('途中の bullet 行で run が分断され、後続は別 run になる', () => {
    expect(renumberOrderedLists('1. a\n- bullet\n5. b', 'sequential')).toBe(
      '1. a\n- bullet\n5. b',
    );
  });

  it('項目間の単一空行は同じ run として扱う(loose list)', () => {
    expect(renumberOrderedLists('1. a\n\n5. b', 'sequential')).toBe(
      '1. a\n\n2. b',
    );
  });

  it('空行 2 連続で run が分かれ、各リストが独立採番される', () => {
    expect(
      renumberOrderedLists('1. a\n2. b\n\n\n5. c\n9. d', 'sequential'),
    ).toBe('1. a\n2. b\n\n\n5. c\n6. d');
  });

  it('fenced code 内の順序リスト風の行は採番しない', () => {
    expect(renumberOrderedLists('```\n1. a\n9. b\n```', 'sequential')).toBe(
      '```\n1. a\n9. b\n```',
    );
  });

  it('fence 外のリストは採番し、fence 内は据え置く', () => {
    expect(
      renumberOrderedLists('1. real\n4. list\n\n```\n1. c\n9. c\n```', 'sequential'),
    ).toBe('1. real\n2. list\n\n```\n1. c\n9. c\n```');
  });

  it('空文字 / リストなしは不変', () => {
    expect(renumberOrderedLists('', 'sequential')).toBe('');
    expect(renumberOrderedLists('ただの本文\nもう一行', 'sequential')).toBe(
      'ただの本文\nもう一行',
    );
  });
});

describe('領域 8:renumberOrderedLists(ネスト ── Layer 2 indent-aware)', () => {
  it('深い indent をまたいで上位 run が連続する(1. … nested … 2.)', () => {
    expect(
      renumberOrderedLists('1. a\n   1. x\n   5. y\n3. b', 'sequential'),
    ).toBe('1. a\n   1. x\n   2. y\n2. b');
  });

  it('深い indent は独立カウンタで採番される(開始番号も独立保持)', () => {
    expect(
      renumberOrderedLists(
        '1. a\n  3. x\n    1. p\n    4. q\n  9. y\n2. b',
        'sequential',
      ),
    ).toBe('1. a\n  3. x\n    1. p\n    2. q\n  4. y\n2. b');
  });

  it('継続テキスト行(深い indent の非リスト)は run を分断しない', () => {
    expect(
      renumberOrderedLists('1. a\n   続きの本文\n3. b', 'sequential'),
    ).toBe('1. a\n   続きの本文\n2. b');
  });
});

describe('領域 8:renumberOrderedListRunAt(caret 行の run のみ)', () => {
  it('caret を含む run だけ採番し、別リストは触らない', () => {
    const r = renumberOrderedListRunAt(
      '1. a\n5. b\n\n\n1. x\n9. y',
      2,
      'sequential',
    );
    expect(r).toEqual({ text: '1. a\n2. b\n\n\n1. x\n9. y', caret: 2 });
  });

  it('marker 桁増(9 → 10)に追従して caret を後ろへずらす', () => {
    const r = renumberOrderedListRunAt('9. a\n9. b', 9, 'sequential');
    expect(r).toEqual({ text: '9. a\n10. b', caret: 10 });
  });

  it('caret が順序リスト上に無ければ無変更で返す', () => {
    const r = renumberOrderedListRunAt('ただの本文', 3, 'sequential');
    expect(r).toEqual({ text: 'ただの本文', caret: 3 });
  });

  it('uniform モードを run-at 経路でも適用する', () => {
    const r = renumberOrderedListRunAt('1. a\n2. b\n3. c', 0, 'uniform');
    expect(r).toEqual({ text: '1. a\n1. b\n1. c', caret: 0 });
  });
});

describe('領域 8:extractListNumberMode(frontmatter list-number)', () => {
  it('list-number: uniform → uniform', () => {
    expect(extractListNumberMode('---\nlist-number: uniform\n---\n1. a')).toBe(
      'uniform',
    );
  });

  it('list-number: sequential → sequential', () => {
    expect(
      extractListNumberMode('---\nlist-number: sequential\n---\n1. a'),
    ).toBe('sequential');
  });

  it('frontmatter なし → sequential(既定)', () => {
    expect(extractListNumberMode('1. a\n2. b')).toBe('sequential');
  });

  it('frontmatter に list-number なし → sequential', () => {
    expect(extractListNumberMode('---\ntitle: T\n---\n1. a')).toBe('sequential');
  });

  it('無効値 → sequential(既定へ fallback)', () => {
    expect(extractListNumberMode('---\nlist-number: chaos\n---\n1. a')).toBe(
      'sequential',
    );
  });
});
