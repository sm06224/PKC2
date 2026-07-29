/** @vitest-environment happy-dom */
/**
 * C3-b(2026-07-28):**ブロック配列で DOM を組んでも単一 parse と同じ DOM に
 * なる**ことを pin する。
 *
 * ## この test が実際に捕まえたもの
 *
 * 文字列の等式(`join('') === renderMarkdown(...)`)は成立していたのに、
 * **DOM は違っていた**:
 *
 *   正: <details><summary>s</summary><p>中身</p></details>
 *   誤: <details><summary>s</summary></details><p>中身</p>
 *
 * `:::details` のような directive は **HTML が複数の markdown ブロックに
 * またがる**。目印がその途中に入るので、分割して `insertAdjacentHTML` すると
 * **パーサが閉じていない要素を勝手に閉じ**、中身が外へ出る。
 *
 * ⚠ **文字列で等しくても DOM で等しいとは限らない。** C2 の pin
 * (`markdown-block-boundaries.test.ts`)は文字列しか見ていないので、
 * この test が無いと実機でだけ壊れる ── CLAUDE.md の
 * 「描画と状態は別物」と同じ型の罠である。
 */
import { describe, expect, it } from 'vitest';
import { renderMarkdown, renderMarkdownBlocks } from '@features/markdown/markdown-render';
import { fillBlocks } from '@adapter/ui/center-block-dom';

/** 分割で壊れやすい構文(範囲を跨いで包む directive)を優先した corpus。 */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ['details', ':::details{summary="s"}\n中身。\n:::'],
  ['section', ':::section{title="節"}\n節の中身。\n:::'],
  ['quote', ':::quote{author="誰か"}\n引用。\n:::'],
  ['format block', ':::if{format=html}\n**強調**。\n:::'],
  ['details の前後に段落', '前。\n\n:::details{summary="s"}\n中身。\n:::\n\n後。'],
  ['details が連続', ':::details{summary="a"}\nA。\n:::\n\n:::details{summary="b"}\nB。\n:::'],
  ['見出し + 表 + コード', '## 見出し\n\n| A |\n|---|\n| 1 |\n\n```js\nconst x=1;\n```'],
  ['リストと引用', '- a\n- b\n\n> quote\n\n段落。'],
];

/** 実機 smoke と同じ本文(12 単位・全構文入り)。 */
function heavyBody(): string {
  const unit = [
    '## 見出し ${i}', '', '段落 **強調**。', '',
    '| A | B |', '|---|---|', '| 1 | 2 |', '',
    '```js', 'const x=${i};', '```', '',
    '- a', '- b', '', '> quote', '',
    ':::details{summary="s${i}"}', '中身。', ':::', '',
  ].join('\n');
  let out = '';
  for (let i = 0; i < 12; i += 1) out += unit.replace(/\$\{i\}/g, String(i));
  return out;
}

describe('C3-b: ブロック配列で組んだ DOM が単一 parse と一致する', () => {
  for (const [label, text] of CASES) {
    it(`${label}`, () => {
      const opts = { sourceLineAnchors: true } as const;
      const a = document.createElement('div');
      fillBlocks(a, renderMarkdownBlocks(text, opts));
      const b = document.createElement('div');
      b.innerHTML = renderMarkdown(text, opts);
      expect(a.innerHTML, `${label} で DOM が変わった`).toBe(b.innerHTML);
    });
  }

  it('実機 smoke と同じ重い本文でも一致する', () => {
    const opts = { sourceLineAnchors: true } as const;
    const body = heavyBody();
    const a = document.createElement('div');
    fillBlocks(a, renderMarkdownBlocks(body, opts));
    const b = document.createElement('div');
    b.innerHTML = renderMarkdown(body, opts);
    expect(a.innerHTML).toBe(b.innerHTML);
  });

  it('分割点は「閉じている位置」だけ ── 各ブロック単体でもタグが閉じている', () => {
    const blocks = renderMarkdownBlocks(heavyBody(), { sourceLineAnchors: true });
    expect(blocks.length, '1 個も割れていない').toBeGreaterThan(10);
    for (const [i, block] of blocks.entries()) {
      const probe = document.createElement('div');
      probe.innerHTML = block;
      // パーサが補完しなければ、入れて出しても同じ文字列に戻る
      expect(probe.innerHTML, `ブロック ${i} が閉じていない(パーサに補完された)`).toBe(block);
    }
  });
});
