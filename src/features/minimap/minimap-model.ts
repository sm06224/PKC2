/**
 * #903(user 要望 2026-07-12)— ミニマップの抽象モデル。
 *
 * center pane の scroller から block 要素(見出し / コード / 表 / 画像 /
 * 引用 / リスト / 段落)を抽出し、scroll 座標系での位置・高さを持つ
 * 抽象バー列にする。**DOM 縮小クローンではなく抽象化バー描画**(VSCode 風)
 * — DOM を複製しないため大きい entry でも軽い。
 *
 * element-in → data-out(features 層 DOM 操作の既存流儀)。描画・スクロール
 * 配線は adapter/ui/minimap.ts が担う。
 */

export type MinimapBlockKind =
  | 'heading'
  | 'code'
  | 'table'
  | 'image'
  | 'quote'
  | 'list'
  | 'paragraph';

export interface MinimapBlock {
  kind: MinimapBlockKind;
  /** heading のみ 1–6。 */
  level?: number;
  /** scroller content 座標系での top(px)。 */
  top: number;
  /** 高さ(px、最低 1)。 */
  height: number;
}

export interface MinimapModel {
  blocks: MinimapBlock[];
  /** scroller.scrollHeight(バーの縮尺の分母)。 */
  contentHeight: number;
}

const BLOCK_SELECTOR = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'pre', 'table', 'img', 'blockquote', 'ul', 'ol', 'p',
  '.pkc-mermaid-rendered', '.pkc-mermaid-placeholder',
].join(', ');

function classify(el: Element): { kind: MinimapBlockKind; level?: number } {
  const tag = el.tagName.toLowerCase();
  const h = /^h([1-6])$/.exec(tag);
  if (h) return { kind: 'heading', level: Number(h[1]) };
  if (tag === 'pre' || el.classList.contains('pkc-mermaid-rendered') || el.classList.contains('pkc-mermaid-placeholder')) {
    return { kind: 'code' };
  }
  if (tag === 'table') return { kind: 'table' };
  if (tag === 'img') return { kind: 'image' };
  if (tag === 'blockquote') return { kind: 'quote' };
  if (tag === 'ul' || tag === 'ol') return { kind: 'list' };
  return { kind: 'paragraph' };
}

/**
 * scroller(overflow コンテナ)内の block 要素を抽出してモデル化する。
 * 入れ子(blockquote 内の p、pre を包む wrapper 等)は**外側だけ**採用。
 */
export function buildMinimapModel(scroller: HTMLElement): MinimapModel {
  const scrollerRect = scroller.getBoundingClientRect();
  const accepted: Element[] = [];
  for (const el of Array.from(scroller.querySelectorAll(BLOCK_SELECTOR))) {
    if (accepted.some((a) => a.contains(el))) continue; // 入れ子は外側優先
    accepted.push(el);
  }
  const blocks: MinimapBlock[] = [];
  for (const el of accepted) {
    const r = el.getBoundingClientRect();
    blocks.push({
      ...classify(el),
      top: Math.max(0, r.top - scrollerRect.top + scroller.scrollTop),
      height: Math.max(1, r.height),
    });
  }
  return {
    blocks,
    contentHeight: Math.max(1, scroller.scrollHeight),
  };
}
