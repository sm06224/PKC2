/**
 * C2(2026-07-28):本文をトップレベルブロックの配列として描けることを pin する。
 *
 * ## この pin が守る唯一の契約
 *
 * ```
 * renderMarkdownBlocks(text, opts).join('') === renderMarkdown(text, opts)
 * ```
 *
 * C2 は**挙動不変の前工事**である。窓化(C3)もキャッシュ(C4)もこの等式に
 * 乗るので、ここが崩れたら**上に積んだもの全部が信用できなくなる**。
 * 逆に言えば、C3/C4 を断念してもこの等式が守られている限り害は無い
 * (L3-S2「可視行順序の正本を DOM から剥がす」と同じ性格の前工事)。
 *
 * ## corpus の選び方
 *
 * 目印は token 列に差し込み、**後処理(sentinel 展開)の後**に切る。
 * 後処理には**範囲を跨いで包むもの**があるので、そこが壊れないかが要点。
 * PKC 固有の block directive を優先して並べてある。
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownBlocks } from '@features/markdown/markdown-render';

/** 実データに寄せた corpus。壊れやすい構文を優先。 */
const CORPUS: ReadonlyArray<readonly [string, string]> = [
  ['空', ''],
  ['段落 1 つ', 'これは段落です。'],
  ['段落 2 つ', '一つ目。\n\n二つ目。'],
  ['見出し + 段落', '# 見出し\n\n本文 **強調** と `code`。'],
  ['リスト', '- a\n- b\n  - b-1\n- c'],
  ['番号リスト', '1. one\n2. two\n3. three'],
  ['表', '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |'],
  ['コードフェンス', '```js\nconst x = 1;\nfunction f() { return x; }\n```'],
  ['引用', '> 引用文。\n> 続き。'],
  ['水平線', 'a\n\n---\n\nb'],
  ['リンクと画像', '[link](https://example.com)\n\n![alt](asset:k1)'],
  ['混在(長め)', [
    '# タイトル', '',
    '導入の段落。**強調**と`code`と[リンク](https://example.com)。', '',
    '## 節', '',
    '| 列 A | 列 B |', '|---|---|', '| 1 | 2 |', '',
    '```ts', 'const a: number = 1;', '```', '',
    '- 箇条 1', '- 箇条 2', '',
    '> 引用', '',
    '締めの段落。',
  ].join('\n')],
  // ── PKC 固有の block directive(後処理で sentinel 展開されるもの)
  ['details', ':::details{summary="ひらく"}\n中身の段落。\n:::'],
  ['section', ':::section{title="節"}\n節の中身。\n:::'],
  ['quote 引用元つき', ':::quote{author="誰か"}\n引用の中身。\n:::'],
  ['format block', ':::if{format=html}\n**強調**を含む。\n:::'],
  ['directive の前後に段落', '前の段落。\n\n:::details{summary="s"}\n中。\n:::\n\n後の段落。'],
  ['見出し番号つき', '# 一\n\n## 一-一\n\n本文。'],
  ['連続する表とコード', '| A |\n|---|\n| 1 |\n\n```\nx\n```\n\n| B |\n|---|\n| 2 |'],
];

describe('C2: トップレベルブロックの配列(挙動不変の前工事)', () => {
  for (const [label, text] of CORPUS) {
    it(`${label}: join すると従来の出力に戻る`, () => {
      const joined = renderMarkdownBlocks(text).join('');
      expect(joined, `${label} で出力が変わった ── C2 は挙動不変でなければならない`)
        .toBe(renderMarkdown(text));
    });
  }

  it('sourceLineAnchors を併用しても join すると戻る', () => {
    const text = '# 見出し\n\n段落。\n\n| A |\n|---|\n| 1 |';
    const joined = renderMarkdownBlocks(text, { sourceLineAnchors: true }).join('');
    expect(joined).toBe(renderMarkdown(text, { sourceLineAnchors: true }));
  });

  it('目印は出力に残らない', () => {
    const text = '# 見出し\n\n段落。';
    for (const b of renderMarkdownBlocks(text)) {
      expect(b, '目印がブロックの中に残っている').not.toContain('pkc-blk');
    }
    expect(renderMarkdown(text), '既定の出力に目印が漏れている').not.toContain('pkc-blk');
  });

  it('🔴 既定では 1 バイトも変わらない(opt-in であることの担保)', () => {
    // blockBoundaries を渡さない限り、token 列に触る経路にも入らない。
    const text = '# 見出し\n\n段落 **強調**。\n\n| A |\n|---|\n| 1 |';
    expect(renderMarkdown(text)).toBe(renderMarkdown(text, {}));
    expect(renderMarkdown(text)).not.toContain('pkc-blk');
  });

  it('実際に複数のブロックへ割れている(切れていないと窓化の意味が無い)', () => {
    const text = '# 見出し\n\n段落 1。\n\n段落 2。\n\n- a\n- b\n\n```\ncode\n```';
    const blocks = renderMarkdownBlocks(text);
    expect(blocks.length, `割れていない(${blocks.length} 個)`).toBeGreaterThanOrEqual(5);
  });

  it('大きな本文でもブロック数が本文量に比例して増える', () => {
    const unit = '## 見出し\n\n段落。\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n';
    const small = renderMarkdownBlocks(unit.repeat(5)).length;
    const large = renderMarkdownBlocks(unit.repeat(20)).length;
    expect(large, 'ブロック数が増えていない').toBeGreaterThan(small * 2);
  });
});
