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
 * pure module: 並び順の決定と「前へ / 後ろへ」移動の差分計算のみ。
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

/**
 * `lid` のタイルをグループ内で 1 つ前 / 後ろへ動かしたときの
 * `app_order` 更新集合を返す(端で動けないときは空配列)。
 *
 * 返り値はグループ内全タイルの正規化済み order(0..n-1)。order 未設定
 * タイルが混ざっていても、この 1 回の移動でグループ全体が明示 order に
 * 揃う(以後の移動が安定する)。
 */
export function moveLauncherTile(
  tiles: readonly LauncherTileMeta[],
  lid: string,
  dir: 'prev' | 'next',
): { lid: string; order: number }[] {
  const sorted = sortLauncherTiles(tiles);
  const target = sorted.find((t) => t.lid === lid);
  if (!target) return [];
  const group = normalizeGroup(target.group);
  const members = sorted.filter((t) => normalizeGroup(t.group) === group);
  const idx = members.findIndex((t) => t.lid === lid);
  const swapWith = dir === 'prev' ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= members.length) return [];
  const reordered = [...members];
  const tmp = reordered[idx]!;
  reordered[idx] = reordered[swapWith]!;
  reordered[swapWith] = tmp;
  return reordered.map((t, i) => ({ lid: t.lid, order: i }));
}
