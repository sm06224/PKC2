/**
 * 行レベル LCS diff(γ-A5-5、multi-window-vscode-extension-spec §5)。
 *
 * dual-edit 競合 overlay の 2-pane diff 表示が使う純関数。old / new の
 * 2 つの文字列を行単位で比較し、side-by-side 表示用の行配列を返す。
 *
 * features 層の純関数 ── DOM / canvas に非依存。diff の **計算**だけを
 * 担い、**描画**は consumer の責務(spec §11.3:データ経路 ── canvas 化
 * 後も diff 純関数はそのまま再利用でき、描画だけ差し替わる)。
 */

export type DiffRowOp = 'same' | 'del' | 'add';

export interface DiffRow {
  op: DiffRowOp;
  /** old(現 container)側の行。`add` のとき null。 */
  left: string | null;
  /** new(自分の draft)側の行。`del` のとき null。 */
  right: string | null;
}

/** LCS が高コストになる巨大入力の安全弁(行数合計の上限)。 */
const LCS_LINE_BUDGET = 6000;

/**
 * old / new を行単位で diff し、2-pane 表示用の行配列を返す。
 * `same` は両側に同じ行、`del` は左のみ、`add` は右のみ。
 */
export function diffRows(oldText: string, newText: string): DiffRow[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');

  // 安全弁:巨大入力では LCS(O(n*m))を諦め「全削除 + 全追加」へ落とす。
  if (a.length + b.length > LCS_LINE_BUDGET) {
    return [
      ...a.map((l): DiffRow => ({ op: 'del', left: l, right: null })),
      ...b.map((l): DiffRow => ({ op: 'add', left: null, right: l })),
    ];
  }

  const n = a.length;
  const m = b.length;
  // dp[i][j] = a[i..] と b[j..] の LCS 長(後ろ向き DP)。
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ op: 'same', left: a[i]!, right: b[j]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      rows.push({ op: 'del', left: a[i]!, right: null });
      i++;
    } else {
      rows.push({ op: 'add', left: null, right: b[j]! });
      j++;
    }
  }
  while (i < n) {
    rows.push({ op: 'del', left: a[i]!, right: null });
    i++;
  }
  while (j < m) {
    rows.push({ op: 'add', left: null, right: b[j]! });
    j++;
  }
  return rows;
}

/** diff に実際の変更(`del` / `add`)が 1 つでもあれば true。 */
export function hasDiff(rows: readonly DiffRow[]): boolean {
  return rows.some((r) => r.op !== 'same');
}
