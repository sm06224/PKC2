/**
 * center pane のブロック窓化 ── **DOM 側**(C3-b、2026-07-28)。
 *
 * `center-block-window.ts`(純粋計算)の相方。ここは
 *   1. ブロック HTML の配列を host へ入れ、**どの子要素がどのブロックか**を記録する
 *   2. **いま見えているブロックだけ**高さを測る
 * の 2 つだけを担当する。窓の決め方は計算側、描画の指揮は renderer 側。
 *
 * ## 🔴 ラッパ要素を足さない
 *
 * 「ブロックごとに `<div>` で包めば index が付けられる」は**採らない**。
 * PKC2 の CSS は `.pkc-md-rendered > h2 + p` のような**子孫・隣接セレクタ**を
 * 多用しており、包んだ瞬間に見た目が変わる。C3 は挙動不変で入れなければ
 * ならない(そうでないと窓化の効果と表示崩れの切り分けができなくなる)。
 *
 * 代わりに**挿入時に子ノード数を数え**、ブロック index → 子要素の範囲を
 * 覚えておく。DOM には 1 バイトも足さない。
 *
 * ## 🔴 高さは「見えているブロック」しか測らない
 *
 * `content-visibility: auto` の未表示要素は**嘘の高さを返す**
 * (サイドバーで実測 39px vs 真値 24.91px)。よって
 * `measureVisibleBlockHeights` は viewport と交差するブロックだけを返す。
 * 測れないものは**測らない** ── 推定値のままにしておくほうが、嘘を
 * 実測として持つより安全である。
 */

/**
 * ブロック index → そのブロックが生んだ**要素ノードそのもの**。
 *
 * 🔴 **子要素の index ではなく参照で持つ**(C3-c、2026-07-28 に設計変更)。
 *
 * 当初は `[start, end)` の index 範囲で持っていたが、挿入後に走る
 * `applyHeadingFold` が **top-level の子を `<details>` の中へ移動する**ため、
 * index は挿入した瞬間から嘘になる。実測(probe):
 *
 * | 本文の形 | markdown ブロック | fold 後の top-level 子 |
 * |---|---|---|
 * | `##` だけ 40 節 | 240 | 40 |
 * | 先頭に `#` が 1 個 | 241 | **1** |
 * | 見出しなし | 80 | 80 |
 * | `##`/`###` 混在 | 240 | 14 |
 *
 * 「先頭に `#` タイトルが 1 個」は**ごく普通の文書**で、そこでは fold 後の
 * top-level 子が 1 個 = 全要素の 100% になる。つまり **fold 後の階層で
 * 窓化しても何も買えない**。よって窓化の単位は markdown ブロックのままとし、
 * fold で移動されても壊れない**要素参照**で位置を持つ。
 */
export interface BlockPlacement {
  readonly elements: readonly (readonly HTMLElement[])[];
}

/**
 * ブロック HTML の配列を host へ入れ、配置を記録する。
 *
 * 1 ブロックが 0 個または複数の子要素を生むことがある(空文字列 / sentinel の
 * 展開結果など)ので、範囲で持つ。
 *
 * ⚠ `innerHTML +=` を繰り返してはいけない ── 既存 DOM の再パースが毎回走る。
 *   `insertAdjacentHTML('beforeend', ...)` は追記なので既存を作り直さない。
 */
export function fillBlocks(host: HTMLElement, blocks: readonly string[]): BlockPlacement {
  host.innerHTML = '';
  const elements: Array<readonly HTMLElement[]> = [];
  for (const block of blocks) {
    const before = host.childNodes.length;
    host.insertAdjacentHTML('beforeend', block);
    const own: HTMLElement[] = [];
    for (let i = before; i < host.childNodes.length; i += 1) {
      const node = host.childNodes[i];
      if (node instanceof HTMLElement) own.push(node);
    }
    elements.push(own);
  }
  // 🔴 **隣接テキストノードを結合する**(2026-07-28、実機の parity で発覚)。
  //
  // 1 本の `innerHTML` で入れると `"</h2>\n<p>"` の `\n` は 1 個のテキスト
  // ノードになるが、**分割して `insertAdjacentHTML` すると別々のノードとして
  // 残る**。DOM を文字列化した結果は同じでも、**ノードの個数が違う**。
  //
  // 後段の `applyHeadingFold` は「次の見出しまでの兄弟を `<details>` へ移す」
  // 型の走査をするので、ノードの切れ方が変わると**移す対象の個数が変わり**、
  // 空白が `<details>` の内と外で入れ替わる。実測では ON/OFF で innerHTML の
  // **長さは完全に同じ(35,496)なのに中身の並びが違う**という形で出た。
  //
  // `normalize()` は隣接テキストノードを 1 個に畳む ── 単一 parse と同じ形に戻る。
  host.normalize();
  return { elements };
}

/**
 * 指定ブロックが生んだ要素のうち、**まだ DOM に繋がっているもの**を返す。
 *
 * `applyHeadingFold` は要素を `<details>` の中へ**移動**するだけなので
 * 参照は生き続ける。一方 `expandTransclusions` などは placeholder を
 * **置換**することがあるので、外れた参照は捨てる(高さを測れない)。
 */
export function elementsOfBlock(
  host: HTMLElement,
  placement: BlockPlacement,
  index: number,
): HTMLElement[] {
  const own = placement.elements[index];
  if (!own) return [];
  return own.filter((el) => host.contains(el));
}

/**
 * **いま viewport に入っているブロックだけ**の高さを測る。
 *
 * @param host      ブロックを入れた要素
 * @param scroller  スクロールする祖先(viewport を決める要素)
 * @returns ブロック index → 高さ(px)。**測れなかったものは含めない**
 */
export function measureVisibleBlockHeights(
  host: HTMLElement,
  scroller: HTMLElement,
  placement: BlockPlacement,
): Map<number, number> {
  const out = new Map<number, number>();
  const view = scroller.getBoundingClientRect();
  // viewport の高さが 0(display:none 直後など)では何も測れない。
  if (!(view.height > 0)) return out;

  for (let i = 0; i < placement.elements.length; i += 1) {
    const elements = elementsOfBlock(host, placement, i);
    if (elements.length === 0) continue;
    const first = elements[0]!.getBoundingClientRect();
    const last = elements[elements.length - 1]!.getBoundingClientRect();
    // viewport と交差しているものだけ ── 交差していない要素の rect は
    // `content-visibility: auto` 下で嘘をつく。
    const intersects = last.bottom >= view.top && first.top <= view.bottom;
    if (!intersects) continue;
    const height = last.bottom - first.top;
    if (height > 0) out.set(i, height);
  }
  return out;
}

/** spacer は本文の直接の子として置く(`div`。ブロックと同じ階層)。 */
function makeBlockSpacer(doc: Document, position: 'top' | 'bottom'): HTMLElement {
  const el = doc.createElement('div');
  el.className = 'pkc-md-block-spacer';
  el.setAttribute('data-pkc-block-spacer', position);
  el.setAttribute('aria-hidden', 'true');
  el.style.padding = '0';
  el.style.margin = '0';
  el.style.border = '0';
  el.style.pointerEvents = 'none';
  return el;
}

/**
 * 窓の外のブロックぶんの高さを spacer で埋める。
 *
 * scrollbar の長さと scrollTop の意味を「全ブロックあるとき」と同じに保つのが目的。
 * これが無いと、窓を描き替えるたびに scroll 位置が飛ぶ。
 *
 * 🔴 **必ず `applyHeadingFold` の後に呼ぶ**(C3-c)。fold は「見出し以外の
 * top-level 子」を直前の `<details>` の中へ移すので、**先に置いた spacer は
 * セクションの内側へ吸い込まれる**。そうなると spacer が畳んだ時に消え、
 * scroll 範囲が突然縮む(しかも例外は出ない)。
 *
 * ⚠ spacer だけでは再描画中の一瞬の高さ崩れは防げない ── `fillBlocks` が
 * 中身を一度空にするため。そこは host の `min-height`(= 全ブロックの推定
 * 総高)で押さえる。`applyBlockMinHeight` を参照。
 */
export function applyBlockSpacers(
  host: HTMLElement,
  topPx: number,
  bottomPx: number,
): void {
  const doc = host.ownerDocument;
  let top = host.firstElementChild as HTMLElement | null;
  if (!top || top.getAttribute('data-pkc-block-spacer') !== 'top') {
    top = makeBlockSpacer(doc, 'top');
    host.insertBefore(top, host.firstChild);
  }
  top.style.height = `${Math.max(0, topPx)}px`;

  let bottom = host.lastElementChild as HTMLElement | null;
  if (!bottom || bottom.getAttribute('data-pkc-block-spacer') !== 'bottom') {
    bottom = makeBlockSpacer(doc, 'bottom');
    host.appendChild(bottom);
  }
  bottom.style.height = `${Math.max(0, bottomPx)}px`;
}

/**
 * 再描画中に scroll 範囲が潰れないよう、host に**推定総高の床**を敷く。
 *
 * サイドバー窓化(L3-S5)では「spacer を先に伸ばしてから行を入れ替える」で
 * 足りた。本文では足りない ── `fillBlocks` が `innerHTML = ''` で **spacer ごと**
 * 消すためで、その一瞬に内容高が 0 になり、browser が `scrollTop` を
 * max(=0) へクランプする。実害は「スクロールすると先頭へ飛ぶ」。
 *
 * inline style の `min-height` は `innerHTML` の書き換えでは消えないので、
 * 窓化している間ずっと床として効き続ける。窓化をやめるときは空文字で外す。
 */
export function applyBlockMinHeight(host: HTMLElement, totalPx: number | null): void {
  host.style.minHeight = totalPx === null ? '' : `${Math.max(0, Math.round(totalPx))}px`;
}
