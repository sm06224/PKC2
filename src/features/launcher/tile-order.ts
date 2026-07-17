/**
 * launcher タイルのグループ化・並び替え(#928、user 要望 2026-07-17)。
 *
 * 「ランチャーをグループ化したり、並び替える機能が欲しい」
 *
 * 永続化は AttachmentBody の additive field:
 *   - `app_group?: string` … グループ名(未設定 = 既定グループ)
 *   - `app_order?: number` … グループ内の並び順(未設定 = 登録順の末尾)
 * container 内に持つため export でそのまま持ち出せる。
 *
 * pure module: 並び順の決定と drag & drop の落下差分計算のみ。
 * dispatch / DOM は adapter 側。
 */

export interface LauncherTileMeta {
  lid: string;
  group?: string | undefined;
  order?: number | undefined;
  /** 登録順(container.entries の出現順)。order 未設定時の安定 tiebreak。 */
  seq: number;
}

/** グループ名の正規化(空白のみ = 未設定)。 */
export function normalizeGroup(group: string | undefined): string {
  return (group ?? '').trim();
}

/**
 * 表示順に整列する。グループは「未設定グループが先頭、以降は名前昇順」。
 * グループ内は `order` 昇順(未設定は末尾)、同値・未設定同士は登録順。
 */
export function sortLauncherTiles<T extends LauncherTileMeta>(tiles: readonly T[]): T[] {
  return [...tiles].sort((a, b) => {
    const ga = normalizeGroup(a.group);
    const gb = normalizeGroup(b.group);
    if (ga !== gb) {
      if (ga === '') return -1;
      if (gb === '') return 1;
      return ga.localeCompare(gb);
    }
    const oa = a.order ?? Number.POSITIVE_INFINITY;
    const ob = b.order ?? Number.POSITIVE_INFINITY;
    if (oa !== ob) return oa - ob;
    return a.seq - b.seq;
  });
}

/** drag & drop の落下先。tile 上 = その前後へ挿入、group 上 = 末尾へ追加。 */
export type LauncherDropTarget =
  | { kind: 'tile'; lid: string; place: 'before' | 'after' }
  | { kind: 'group'; group: string };

/**
 * `draggedLid` のタイルを drop したときの永続化差分を返す
 * (2026-07-17 user 指摘で ◀▶ ボタン方式から drag & drop 主体へ刷新)。
 *
 * - tile 上へ drop → その tile の前 / 後ろへ挿入(tile のグループへ移動)
 * - group(grid 余白)へ drop → そのグループ末尾へ追加
 *
 * 返り値は挿入先グループ全タイルの正規化済み order(0..n-1)。dragged が
 * 別グループから来た場合はその update だけ `group` を持つ('' = グループ
 * 解除)。並びが変わらない drop(自分自身の直前後など)は空配列。
 */
export function dropLauncherTile(
  tiles: readonly LauncherTileMeta[],
  draggedLid: string,
  target: LauncherDropTarget,
): { lid: string; order: number; group?: string }[] {
  const sorted = sortLauncherTiles(tiles);
  const dragged = sorted.find((t) => t.lid === draggedLid);
  if (!dragged) return [];
  if (target.kind === 'tile' && target.lid === draggedLid) return [];

  let destGroup: string;
  if (target.kind === 'tile') {
    const targetTile = sorted.find((t) => t.lid === target.lid);
    if (!targetTile) return [];
    destGroup = normalizeGroup(targetTile.group);
  } else {
    destGroup = normalizeGroup(target.group);
  }

  const sourceGroup = normalizeGroup(dragged.group);
  const members = sorted.filter(
    (t) => normalizeGroup(t.group) === destGroup && t.lid !== draggedLid,
  );
  let insertAt: number;
  if (target.kind === 'tile') {
    const idx = members.findIndex((t) => t.lid === target.lid);
    if (idx < 0) return [];
    insertAt = target.place === 'before' ? idx : idx + 1;
  } else {
    insertAt = members.length;
  }

  const newList = [...members];
  newList.splice(insertAt, 0, dragged);

  // 同一グループ内で並びが変わらない drop は no-op。
  if (sourceGroup === destGroup) {
    const current = sorted.filter((t) => normalizeGroup(t.group) === destGroup);
    if (current.every((t, i) => t.lid === newList[i]?.lid)) return [];
  }

  return newList.map((t, i) =>
    t.lid === draggedLid && sourceGroup !== destGroup
      ? { lid: t.lid, order: i, group: destGroup }
      : { lid: t.lid, order: i },
  );
}
