/**
 * center pane の描画結果キャッシュ ── **T1(メモリ)**(C4、2026-07-28)。
 *
 * ## 何を買うか(実測が先)
 *
 * `tests/bench/center-render-repeat.mjs` で A↔B を交互に開いたところ、
 * **同じ entry へ戻っても毎回まるごと描き直していた**(再利用ゼロ、120KB の
 * 本文で ~2,000ms)。user 提起「参照のみの場合は前回のレンダリング結果を
 * 使いまわせるはず」はそのまま成立する ── 賞金はこの描き直しである。
 *
 * ## 🔴 唯一の危険は「キーの取りこぼし」
 *
 * キャッシュ自体は捨てても正しい(捨てれば描き直すだけ)。危ないのは
 * **key が不完全なとき**で、「編集したのに古い描画が出る」という
 * **例外も test failure も出ない**壊れ方をする。よって:
 *
 * - `source` は**文字列そのもの**を持って比較する。ハッシュを使わない
 *   ── 衝突が「本文が化ける」に直結する。V8 の文字列比較は長さ一致を
 *   先に見るので、120KB でも markdown の再描画に比べれば誤差
 * - 描画に効く外部入力(container id / vars / 見出し番号 / anchor 有無)は
 *   **fingerprint に畳んで**一致を見る
 * - 迷ったら**捨てる側**に倒す(miss は遅いだけ、hit の誤りは嘘を映す)
 *
 * ## 上限
 *
 * 常駐を無制限に増やさない。**描画結果の総文字数**で LRU 追い出しする
 * (`body-working-set.ts` の `BODY_CACHE_LIMIT_CHARS` と同じ作法)。
 * 4M 文字 ≒ 8MB(UTF-16)── 120KB の本文の描画結果が ~1.5M 文字なので、
 * 直近 2〜3 件の大物か、小さい entry なら数十件ぶん入る。
 */

/** 保持する描画結果の総文字数の上限。 */
const RENDER_CACHE_LIMIT_CHARS = 4_000_000;

interface CacheRecord {
  readonly source: string;
  readonly fingerprint: string;
  readonly blocks: readonly string[];
  readonly chars: number;
}

/** lid → 描画結果。**挿入順 = LRU 順**(hit したら delete → set で末尾へ)。 */
const cache = new Map<string, CacheRecord>();
let totalChars = 0;
let hits = 0;
let misses = 0;

function charsOf(blocks: readonly string[]): number {
  let n = 0;
  for (const b of blocks) n += b.length;
  return n;
}

function evictOverLimit(): void {
  if (totalChars <= RENDER_CACHE_LIMIT_CHARS) return;
  for (const [lid, rec] of cache) {
    if (totalChars <= RENDER_CACHE_LIMIT_CHARS) break;
    cache.delete(lid);
    totalChars -= rec.chars;
  }
}

/**
 * 描画結果を取り出す。無ければ `render()` を呼んで入れる。
 *
 * @param lid          entry の lid(キャッシュの席)
 * @param source       描画の入力そのもの(frontmatter strip / asset 解決の**後**)
 * @param fingerprint  出力に効く外部入力を畳んだ文字列
 */
export function cachedRenderBlocks(
  lid: string,
  source: string,
  fingerprint: string,
  render: () => string[],
): readonly string[] {
  const hit = cache.get(lid);
  if (hit && hit.source === source && hit.fingerprint === fingerprint) {
    hits += 1;
    cache.delete(lid); // 末尾へ回す = 最近使った
    cache.set(lid, hit);
    return hit.blocks;
  }
  misses += 1;
  if (hit) totalChars -= hit.chars;
  const blocks = render();
  const chars = charsOf(blocks);
  cache.delete(lid);
  cache.set(lid, { source, fingerprint, blocks, chars });
  totalChars += chars;
  evictOverLimit();
  return blocks;
}

/** 席を空ける(lid 省略で全部)。**捨てても正しい** ── 描き直すだけ。 */
export function invalidateRenderCache(lid?: string): void {
  if (lid === undefined) {
    cache.clear();
    totalChars = 0;
    return;
  }
  const rec = cache.get(lid);
  if (!rec) return;
  cache.delete(lid);
  totalChars -= rec.chars;
}

export interface RenderCacheStats {
  readonly entries: number;
  readonly chars: number;
  readonly hits: number;
  readonly misses: number;
}

/** 計器(§9 の hit 率はここから取る)。 */
export function renderCacheStats(): RenderCacheStats {
  return { entries: cache.size, chars: totalChars, hits, misses };
}

/** 計測の区間を切る(test / bench 用)。 */
export function resetRenderCacheStats(): void {
  hits = 0;
  misses = 0;
}

// devtools / bench から読む(`__pkc2StorageInfo` 等と同じ作法)。
(globalThis as unknown as Record<string, unknown>).__pkc2RenderCache = renderCacheStats;
