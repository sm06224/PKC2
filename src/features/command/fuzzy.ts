/**
 * Command Palette — fuzzy ranking algorithm(pure)。
 *
 * VSCode の Command Palette / Quick Open は **subsequence + bonus** で
 * ranking する。本実装も同じ思想で:
 *
 * - 入力 query の各 char が target 文字列に **subsequence として現れる** 必要
 * - 連続 match に bonus、word boundary 直後の match に bonus
 * - 大文字小文字を区別しない(query は lowercase 化、target も lowercase で比較)
 * - 日本語(CJK)は **Hiragana / Katakana / Kanji 全部同等扱い**(NFKC 正規化
 *   は MVP 範囲外、必要時 future 拡張)
 *
 * Score 範囲 ── 0(no match)〜 100+(perfect match の上限なし)。
 *
 * pure ── browser API 非依存(invariant I4)。
 */

import type { CommandMeta } from './types';

export interface RankedCommand {
  readonly meta: CommandMeta;
  readonly score: number;
  /** match した位置の index 列(highlight 描画に使う、target ごとに別)。 */
  readonly matchedIndices: {
    readonly titleJa: readonly number[];
    readonly titleEn: readonly number[];
    readonly id: readonly number[];
  };
}

/**
 * 単一 target に対する fuzzy match。
 * @returns score >= 0 + matched indices。match しなければ score=0。
 */
export function fuzzyMatchSingle(query: string, target: string): {
  score: number;
  matched: number[];
} {
  if (!query) return { score: 1, matched: [] };
  if (!target) return { score: 0, matched: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  const matched: number[] = [];
  let qi = 0;
  let score = 0;
  // 連続性カウント:**直前の match との target 上の距離が 1** のみ
  // 「連続」 扱い。途中に非 match 文字が挟まれば consec=1 にリセット。
  // これにより "view-x" のような tight 一致が "v-i-e-w" のような scattered
  // よりも明確に高得点になる(VSCode / fzf 流)。
  let consec = 0;
  let prevMatchedTi = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      matched.push(ti);
      qi++;
      if (ti === prevMatchedTi + 1) {
        consec++;
        // tight 連続 ── 強い bonus(consec 二乗的に)
        score += 10 + consec * 8;
      } else {
        consec = 1;
        score += 10;
        // gap 直後の word boundary bonus(reduced)
        if (ti === 0) {
          score += 15;
        } else {
          const prev = t[ti - 1]!;
          const curr = t[ti]!;
          if (/[.\s\-_/]/.test(prev)) {
            score += 8;
          } else if (isWordBoundary(prev, curr)) {
            score += 5;
          }
        }
      }
      prevMatchedTi = ti;
    }
  }

  // 全 query char が match しなければ no-match
  if (qi < q.length) return { score: 0, matched: [] };

  // length penalty(短い target ほど高 score)
  const lengthPenalty = Math.min(20, (t.length - q.length) * 0.5);
  score = Math.max(1, score - lengthPenalty);
  return { score, matched };
}

/**
 * 文字種境界(下↑→ALL CAPS / kanji→hiragana 等)。
 */
function isWordBoundary(prev: string, curr: string): boolean {
  const isLowerOrCJK = (c: string) => /[a-zぁ-んァ-ヴ一-龯]/.test(c);
  const isUpper = (c: string) => /[A-Z]/.test(c);
  const isDigit = (c: string) => /[0-9]/.test(c);
  if (isLowerOrCJK(prev) && isUpper(curr)) return true;
  if (!isDigit(prev) && isDigit(curr)) return true;
  if (isDigit(prev) && !isDigit(curr)) return true;
  return false;
}

/**
 * Command 一覧を query で fuzzy rank。
 *
 * 各 command の score = max(titleJa / titleEn / id の単独 score)
 * 同 score の場合は category alphabet 順 → id alphabet 順で stable sort。
 * query が空なら全件を category → id 順で返す(全 score = 1)。
 */
export function rankCommands(
  query: string,
  commands: readonly CommandMeta[],
): RankedCommand[] {
  if (!query) {
    return [...commands]
      .sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return a.id.localeCompare(b.id);
      })
      .map((meta) => ({
        meta,
        score: 1,
        matchedIndices: { titleJa: [], titleEn: [], id: [] },
      }));
  }

  const out: RankedCommand[] = [];
  for (const meta of commands) {
    const ja = fuzzyMatchSingle(query, meta.titleJa);
    const en = fuzzyMatchSingle(query, meta.titleEn);
    const id = fuzzyMatchSingle(query, meta.id);
    const score = Math.max(ja.score, en.score, id.score);
    if (score <= 0) continue;
    out.push({
      meta,
      score,
      matchedIndices: {
        titleJa: ja.matched,
        titleEn: en.matched,
        id: id.matched,
      },
    });
  }

  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.meta.category !== b.meta.category) {
      return a.meta.category.localeCompare(b.meta.category);
    }
    return a.meta.id.localeCompare(b.meta.id);
  });

  return out;
}
