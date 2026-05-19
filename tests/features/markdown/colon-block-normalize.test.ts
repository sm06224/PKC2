/**
 * `:::` block directive 前後 blank line 正規化(2026-05-18 bug fix)。
 *
 * user 報告:「`>` の直後行に `:::section` を書き始めないと引用ブロック化しない」
 * → CommonMark blockquote lazy continuation で `:::section` opener が blockquote
 * 内に取り込まれる問題への構造的回避(`:::` 行の前後に blank line を強制挿入)。
 *
 * 詳細 background:
 * - `docs/development/bug-section-blockquote-lazy-continuation-2026-05-18.md`
 * - `src/features/markdown/colon-block-normalize.ts` の冒頭 comment
 */
import { describe, it, expect } from 'vitest';
import {
  ensureBlankAroundColonBlocks,
  ensureBlankAroundColonBlocksWithLineMap,
} from '@features/markdown/colon-block-normalize';

describe('ensureBlankAroundColonBlocks(string-only 版)', () => {
  it('blockquote + :::section の間に blank line を挿入', () => {
    const input = '> 引用テキスト\n:::section{role=note}\n内容\n:::';
    const out = ensureBlankAroundColonBlocks(input);
    // `:::section` の前と後に blank line が入る
    expect(out).toContain('> 引用テキスト\n\n:::section{role=note}\n\n内容');
  });

  it('連続 :::\\n::: closer も blank line で分離', () => {
    const input = ':::section{role=note}\n内容\n:::\n:::quote\n本文\n:::';
    const out = ensureBlankAroundColonBlocks(input);
    // 2 つ目の :::quote の前に blank line
    expect(out).toMatch(/:::\n\n:::quote/);
  });

  it('malformed `:::quote{author="No Close"` の attrs を drop', () => {
    const input = ':::quote{author="No Close"\n本文\n:::';
    const out = ensureBlankAroundColonBlocks(input);
    // attrs 部分が消えて role-only に
    expect(out).toContain(':::quote\n');
    expect(out).not.toContain('author="No Close"');
  });

  it('既存 blank line がある場合は冪等(2 回適用しても同じ)', () => {
    const input = '> 引用\n\n:::section{role=note}\n\n内容\n:::';
    const once = ensureBlankAroundColonBlocks(input);
    const twice = ensureBlankAroundColonBlocks(once);
    expect(once).toBe(twice);
  });

  it('::: 行を含まない普通の markdown は無変化', () => {
    const input = '# 見出し\n\n本文\n\n- リスト 1\n- リスト 2';
    const out = ensureBlankAroundColonBlocks(input);
    expect(out).toBe(input);
  });

  it('3+ 連続 newline は 2 に collapse', () => {
    const input = 'A\n\n\n\nB';
    const out = ensureBlankAroundColonBlocks(input);
    expect(out).toBe('A\n\nB');
  });

  it('行頭 ws(半角 space / tab / 全角 U+3000)込みの ::: も対象', () => {
    const input1 = '> q\n  :::section\n内容\n:::';
    const input2 = '> q\n\t:::section\n内容\n:::';
    const input3 = '> q\n\u3000:::section\n内容\n:::';
    expect(ensureBlankAroundColonBlocks(input1)).toMatch(/> q\n\n {2}:::section/);
    expect(ensureBlankAroundColonBlocks(input2)).toMatch(/> q\n\n\t:::section/);
    expect(ensureBlankAroundColonBlocks(input3)).toMatch(/> q\n\n\u3000:::section/);
  });
});

describe('ensureBlankAroundColonBlocksWithLineMap(LineMap thread 版)', () => {
  function identityMap(text: string): number[] {
    const n = text.split('\n').length;
    return Array.from({ length: n }, (_, i) => i);
  }

  it('blockquote + :::section の正規化 + lineMap thread', () => {
    const input = '> 引用テキスト\n:::section{role=note}\n内容\n:::';
    const { transformed, lineMap } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      identityMap(input),
    );
    const outLines = transformed.split('\n');
    // 行が増えた(blank line 2 個挿入された)
    expect(outLines.length).toBeGreaterThan(input.split('\n').length);
    // lineMap は出力 line 数と同じ長さ
    expect(lineMap.length).toBe(outLines.length);
    // 各 line の lineMap 値は input idx を指す(挿入 blank は直前 / 次の input idx を持つ)
    for (let i = 0; i < lineMap.length; i++) {
      expect(lineMap[i]).toBeGreaterThanOrEqual(0);
      expect(lineMap[i]!).toBeLessThan(input.split('\n').length);
    }
  });

  it('挿入 blank line の lineMap は近傍の input line を指す(Split View fallback 対応)', () => {
    const input = '> q\n:::section\n内容\n:::';
    const { transformed, lineMap } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      identityMap(input),
    );
    const outLines = transformed.split('\n');
    // 挿入された blank line の lineMap 値は次の `:::section` line の input idx (= 1)
    const blankIdx = outLines.findIndex((line, i) => i > 0 && line.trim() === '');
    expect(blankIdx).toBeGreaterThan(0);
    // 挿入 blank の lineMap[blankIdx] は 1(`:::section` の input idx)を指す
    expect(lineMap[blankIdx]).toBe(1);
  });

  it('malformed `:::role{...` の attrs drop で lineMap 不変(line 数は変わるが)', () => {
    const input = ':::quote{author="X"\n本文\n:::';
    const { transformed } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      identityMap(input),
    );
    expect(transformed).toContain(':::quote');
    expect(transformed).not.toContain('author="X"');
  });

  it('::: 行を含まない場合は input と output が同じ', () => {
    const input = '# 見出し\n\n本文\n\n- list';
    const { transformed, lineMap } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      identityMap(input),
    );
    expect(transformed).toBe(input);
    expect(lineMap).toEqual(identityMap(input));
  });

  it('複数連続 blank はそのまま保持(LineMap thread 版は他 preprocessor の line index を壊さないため collapse しない)', () => {
    const input = 'A\n\n\n\nB';
    const { transformed, lineMap } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      identityMap(input),
    );
    // collapse しない(:::行なし時は完全無変化)
    expect(transformed).toBe(input);
    expect(lineMap).toEqual(identityMap(input));
  });

  it('lineMapIn が partial(input より短い)時も crash しない', () => {
    const input = '> q\n:::section\n内容\n:::';
    // 故意に短い lineMap を渡す(本来 4 要素必要)
    const partial = [0, 1]; // 2 要素のみ
    const { transformed, lineMap } = ensureBlankAroundColonBlocksWithLineMap(
      input,
      partial,
    );
    expect(transformed).toContain(':::section');
    // 短い lineMap 部分は fallback で input idx 自体を使う(?? i)
    expect(lineMap.length).toBe(transformed.split('\n').length);
  });
});

describe('user 報告 bug 再現:`>` 直後 :::section', () => {
  it('修正後:blockquote と :::section が分離される', () => {
    const userInput = '> 引用テキスト\n:::section{role=note}\nsection 内容\n:::';
    const out = ensureBlankAroundColonBlocks(userInput);
    // `>` 行と `:::section` の間に blank line(blockquote lazy continuation を切る)
    expect(out).toMatch(/> 引用テキスト\n\n:::section/);
    // `:::section{...}` opener と content の間に blank line
    expect(out).toMatch(/:::section\{role=note\}\n\nsection 内容/);
    // closer もも blank line で分離(markdown-it パース安定化のため、closer も
    // independent block 化する)
    expect(out).toMatch(/section 内容\n\n:::/);
  });

  it('回避策(user が手動で blank 入れた)パターンを正規化(closer 前 blank も挿入)', () => {
    const workaround = '> 引用テキスト\n\n:::section{role=note}\n\nsection 内容\n:::';
    const out = ensureBlankAroundColonBlocks(workaround);
    // user が手動 blank を入れた opener 系は既に分離済、closer 前にも blank
    // 自動挿入される(全 `:::` 行に対する一律規律)。
    expect(out).toMatch(/section 内容\n\n:::/);
    // 2 回目以降の適用は完全冪等
    const twice = ensureBlankAroundColonBlocks(out);
    expect(twice).toBe(out);
  });
});
