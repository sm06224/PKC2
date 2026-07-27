/**
 * 可視行順序の正本(L3-S2、2026-07-27)。
 *
 * ## なぜ要るか
 *
 * サイドバーの「今画面に並んでいる順」を、これまで**DOM を querySelectorAll して
 * 導出**していた(Shift+click 範囲選択・↑↓ キーボードナビ)。この形は
 * 仮想化(窓化)と両立しない ── 窓の外の行は DOM に存在しないので、
 *
 *   - Shift+click: anchor が窓外だと `indexOf` が -1 → `blocked()` で
 *     **選択が丸ごと無反応**(例外も出ない)
 *   - ↑↓ ナビ: 窓の端で `currentIdx >= lids.length - 1` が真になり、
 *     **リストの末尾でもないのに無言停止**
 *
 * どちらも **例外も test failure も出ない型の壊れ方**をする。
 * そこで「描画側が並べた順」を記録し、消費側はそれを読む。
 *
 * ## 単独で価値がある(仮想化を断念しても残る)
 *
 * イベントのたびに走っていた O(N) の `querySelectorAll` + `getAttribute` が
 * 消える。5,000 行なら 1 キーストロークごとに 5,000 要素の走査だった。
 *
 * ## 設計の要点
 *
 * - **キーは UL ノード**(module 変数ではなく `WeakMap<UL, string[]>`)。
 *   `canReuseEntryList` で UL ごと使い回す経路があり、module 変数だと
 *   「使い回した UL に古い順序」というズレが起きる。UL に紐づけておけば
 *   使い回しでも引っ越しでも正しいものが付いてくる
 * - **DOM fallback を必ず持つ**。記録が無い場面(filer view の別 UL、
 *   古い DOM、test の手組み DOM)では従来どおり DOM から導出する ──
 *   S2 は**挙動不変**の前工事であり、ここで挙動を変えない
 * - WeakMap なので UL が捨てられれば記録も消える(登録解除が要らない)
 */

/** UL ノード → その UL に並べた entry 行の lid(描画順)。 */
const orders = new WeakMap<Element, readonly string[]>();

/** entry 行リストの UL を指す selector(記録・探索で共通)。 */
export const ENTRY_LIST_SELECTOR = 'ul[data-pkc-region="entry-list"]';

/**
 * 描画側が「この UL にこの順で並べた」を記録する。
 *
 * あわせて `data-pkc-row-count` を付ける(L3-S1)。ベンチ / smoke の同期点を
 * 「DOM の行数を数えて待つ」から外すための**論理**行数で、窓化した後も
 * 「本当は何行あるか」を示す ── 窓化すると DOM の `li` の数は論理行数と
 * 一致しなくなるので、行数を数える計器は全部これに移す。
 */
export function recordVisibleOrder(list: Element, lids: readonly string[]): void {
  orders.set(list, lids);
  list.setAttribute('data-pkc-row-count', String(lids.length));
}

/** 記録された順序(無ければ null)。 */
export function getRecordedVisibleOrder(list: Element | null | undefined): readonly string[] | null {
  if (!list) return null;
  return orders.get(list) ?? null;
}

/**
 * scope(通常は `[data-pkc-region="sidebar"]`)における可視行順序を返す。
 *
 * 記録があればそれを、無ければ `domSelector` で DOM から導出する。
 * `domSelector` は**呼び元ごとに従来と同じもの**を渡すこと ── 消費側で
 * 選択集合の定義が微妙に違う(`li.pkc-entry-item` と
 * `[data-pkc-action="select-entry"]`)ため、fallback の集合を勝手に
 * 揃えると挙動が変わる。
 */
export function resolveVisibleOrder(scope: Element | null | undefined, domSelector: string): string[] {
  if (!scope) return [];
  const list = scope.querySelector(ENTRY_LIST_SELECTOR);
  const recorded = getRecordedVisibleOrder(list);
  if (recorded) return [...recorded];
  return Array.from(scope.querySelectorAll<HTMLElement>(domSelector))
    .map((el) => el.getAttribute('data-pkc-lid'))
    .filter((v): v is string => typeof v === 'string');
}

/** test / 計器用: 記録を消して DOM fallback 経路を強制する。 */
export function __forgetVisibleOrderForTest(list: Element | null | undefined): void {
  if (list) orders.delete(list);
}
