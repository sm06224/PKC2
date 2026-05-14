/**
 * Markdown quote (`> …`) input assist.
 *
 * USER_REQUEST_LEDGER S-17 (B-3). Spec:
 * docs/development/markdown-extensions/markdown-quote-input-assist.md
 *
 * Features layer — pure function, no DOM access, no side effects.
 *
 * Coverage:
 *   - Slice α(2026-04-14, shipped):non-empty `> X` 行末 Enter → `\n> ` 継続
 *   - Slice β(2026-05-14, PR-V3 wave):
 *     1. 空 `> ` 行 + Enter → 引用 exit(`> ` を blank に置換 + `\n` を挿入)
 *     2. 選択範囲 + Mod+Shift+> → 選択中 line 群の `> ` prefix を bulk toggle
 *   - Slice γ(2026-05-14, PR-V3 wave):entry-window child window への同期
 *     (本 file は parent-side pure helper、child-side は entry-window.ts に
 *     inline mirror、両者で同 contract を保つ)
 *
 * Why a pure helper rather than inlining the keydown logic:
 *   - Lets us pin the line-detection / prefix-matching corner cases
 *     in vitest without a DOM
 *   - 同じ contract を entry-window child の inline mirror と合わせやすい
 *   - parent / child の両側で test を再利用できる
 */

/**
 * Action returned by the Enter helper.
 *
 * - `continue`:caller は `setRangeText(insert, caret, caret, 'end')` 相当で
 *   現在位置に `\n> ` を挿入する。
 * - `exit`:caller は `setRangeText(insert, rangeStart, rangeEnd, 'end')` 相当
 *   で **現在行の `> ` を消して** insert(通常 `\n`)に置き換える。これで
 *   blockquote が終わり、caret が新しい blank line に来る(markdown 仕様で
 *   blank line が quote の終端)。
 */
export type QuoteAssistAction =
  | { type: 'continue'; insert: string }
  | { type: 'exit'; rangeStart: number; rangeEnd: number; replacement: string };

/**
 * Enter キー時の引用補助。
 *
 * 1. 非空 `> X` 行末 → `{ type: 'continue', insert: '\n> ' }`
 * 2. 空 `> ` 行(または `>`)→ `{ type: 'exit', range, replacement: '\n' }`
 *    `[lineStart, caretPos]` を `'\n'` に置換し、引用 exit + 新 blank line。
 * 3. その他 → null(native Enter に委ねる)
 *
 * Caret は collapsed point(caller responsibility)、行末(次が `\n` or EOF)
 * であることが前提。それ以外は null。
 *
 * 単一 `>` level のみ。ネスト(`>>` 等)は本 helper 範囲外。
 */
export function computeQuoteAssistOnEnter(
  value: string,
  caretPos: number,
): QuoteAssistAction | null {
  if (caretPos < 0 || caretPos > value.length) return null;
  if (caretPos < value.length && value[caretPos] !== '\n') return null;
  const lineStart = value.lastIndexOf('\n', caretPos - 1) + 1;
  const line = value.slice(lineStart, caretPos);
  const m = /^>[ \t]?(.*)$/.exec(line);
  if (!m) return null;
  const afterPrefix = m[1] ?? '';
  if (afterPrefix === '') {
    // Slice β:空 `> ` 行 + Enter → exit blockquote。
    return {
      type: 'exit',
      rangeStart: lineStart,
      rangeEnd: caretPos,
      replacement: '\n',
    };
  }
  return { type: 'continue', insert: '\n> ' };
}

/**
 * 選択範囲に対する一括 `> ` prefix toggle(Slice β / 2)。
 *
 * 動作:
 *   - 選択中の **全行** が `> ` または `>\t` で始まる → 全行から prefix を剥がす
 *   - そうでない(1 行でも non-quote) → 全行に `> ` を付与
 *   - 空選択(caret only)は **caret 行 1 行** に対して同じ toggle を適用
 *
 * 返り値:`{ value, selStart, selEnd }` — caller は textarea.value を上書き、
 * 選択範囲を再設定する。何も変更しないケースは null。
 */
export function computeQuoteToggleOnSelection(
  value: string,
  selStart: number,
  selEnd: number,
): { value: string; selStart: number; selEnd: number } | null {
  if (selStart < 0 || selEnd < 0 || selStart > value.length || selEnd > value.length) return null;
  if (selStart > selEnd) [selStart, selEnd] = [selEnd, selStart];

  // 行範囲を line 単位に拡張:
  //   - 選択開始の line 先頭まで巻き戻し
  //   - 選択終了の **直前** が新行頭 (`\n`) なら 1 行戻す(末尾改行で 1 行多く
  //     拾わない)
  const blockStart = value.lastIndexOf('\n', selStart - 1) + 1;
  let blockEndExclusive = selEnd;
  if (selEnd > selStart && value[selEnd - 1] === '\n') {
    blockEndExclusive = selEnd - 1;
  }
  // line end:現在行の `\n` または EOF
  const nlAfter = value.indexOf('\n', blockEndExclusive);
  const blockEnd = nlAfter === -1 ? value.length : nlAfter;
  const block = value.slice(blockStart, blockEnd);
  if (block.length === 0 && selStart === selEnd) {
    // 完全空行 + caret only:`> ` を付ける(toggle add)
    const newBlock = '> ';
    const newValue = value.slice(0, blockStart) + newBlock + value.slice(blockEnd);
    return { value: newValue, selStart: blockStart, selEnd: blockStart + newBlock.length };
  }
  const lines = block.split('\n');
  const allQuoted = lines.length > 0 && lines.every((l) => /^>[ \t]?/.test(l));
  let newLines: string[];
  if (allQuoted) {
    newLines = lines.map((l) => l.replace(/^>[ \t]?/, ''));
  } else {
    newLines = lines.map((l) => (l === '' ? '>' : `> ${l}`));
  }
  const newBlock = newLines.join('\n');
  if (newBlock === block) return null;
  const newValue = value.slice(0, blockStart) + newBlock + value.slice(blockEnd);
  return {
    value: newValue,
    selStart: blockStart,
    selEnd: blockStart + newBlock.length,
  };
}
