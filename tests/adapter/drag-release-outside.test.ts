/** @vitest-environment happy-dom */
/**
 * drag をウィンドウ外で離したときの後始末(B12、2026-07-28)。
 *
 * 🔴 見つけた形: サイドバー幅 / 分割幅 / 列幅 / 行高 / パネル移動の drag は
 * どれも `mousedown` で `document` に mousemove+mouseup を張り、`mouseup` で
 * 外す。**対称ではあるが、`mouseup` はウィンドウの外で離すと届かない**。
 * 届かないと drag 状態が残り、
 *   - **ボタンを押していないのにリサイズが続く**(操作の実害)
 *   - listener と closure(ペイン参照)が残り続ける(常駐の実害)
 * の両方が起きる。しかも「たまにしか起きない」ので報告されにくい。
 *
 * 対処は `MouseEvent.buttons === 0`(今どのボタンも押されていない)を
 * drag 終了として扱うこと。ここではその契約を pin する。
 *
 * ⚠ happy-dom は実際のウィンドウ外 mouseup を再現できないので、
 *   **buttons=0 の mousemove が来た**という同値の状況で検証する。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ⚠ marker は **定義の形**で書く。関数名だけだと
// `addEventListener('mousemove', handleResizeMouseMove)` の引数にも当たり、
// 「ガードが無い」と誤検出する(2026-07-28 に踏んだ)。
const SOURCES = [
  ['サイドバー幅', 'src/adapter/ui/action-binder.ts', 'function handleResizeMouseMove('],
  ['分割幅', 'src/adapter/ui/action-binder.ts', 'function handleSplitResizeMouseMove('],
  ['filer 列幅', 'src/adapter/ui/action-binder.ts', 'function handleFilerColResizeMouseMove('],
  ['spreadsheet 列幅/行高', 'src/adapter/ui/spreadsheet-presenter.ts', 'const onMove = (e: MouseEvent)'],
  ['パネル移動', 'src/adapter/ui/renderer.ts', 'function onMouseMove(e: MouseEvent)'],
] as const;

/**
 * 関数の先頭から数十行を切り出す(先頭で終了判定しているかを見る)。
 * ⚠ 行数を絞りすぎると**コメントで埋まって**判定行に届かない
 * (2026-07-28: 8 行では説明コメントだけで尽きた)。
 */
function head(src: string, marker: string, lines = 20): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf(marker, from);
    if (i < 0) break;
    out.push(src.slice(i).split('\n').slice(0, lines).join('\n'));
    from = i + marker.length;
  }
  return out;
}

describe('drag をウィンドウ外で離したときの後始末(B12)', () => {
  for (const [label, file, marker] of SOURCES) {
    it(`${label}: mousemove の冒頭で buttons===0 を終了として扱う`, () => {
      const src = readFileSync(resolve(__dirname, '../../', file), 'utf8');
      const blocks = head(src, marker);
      expect(blocks.length, `${marker} が見つからない`).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b, `${label} に buttons===0 の終了判定が無い:\n${b}`).toMatch(/e\.buttons === 0/);
      }
    });
  }
});
