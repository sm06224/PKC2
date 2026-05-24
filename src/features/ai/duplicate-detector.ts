/**
 * Inspector AI tab Phase 2 — local-only duplicate entry detector(pgc-153)。
 *
 * pure features 層。current entry と container 内他 entry の title +
 * body の **bigram Jaccard similarity** で「似た entry」 候補を上位 N 件
 * 返す。LLM 接続なし、計算は端末内完結。roadmap §2.2 A 群 2 / §3 Phase 2
 * 1 件目着地。
 *
 * 計算量:O(N) per call(N = entries.length)。Inspector AI tab は entry
 * 切替時のみ呼ばれるため、container 数千件規模でも体感問題なし。
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';

export interface DuplicateMatch {
  /** Stable id for dismiss UI. */
  id: string;
  /** Target entry being suggested as duplicate. */
  lid: string;
  title: string;
  similarity: number;
  /** Human-readable Japanese reason. */
  reason: string;
}

/** 類似度の最低閾値。bigram Jaccard 0.5 以上 = 「明らかに似ている」 体感。 */
export const DUPLICATE_THRESHOLD = 0.5;

/** 候補の最大件数。多すぎると inspector の縦が伸びるので 3 まで。 */
export const DUPLICATE_MAX_RESULTS = 3;

/**
 * Detect duplicate candidates for `entry` within `container`. Returns
 * up to `DUPLICATE_MAX_RESULTS` sorted by similarity desc.
 *
 * `entry` itself + system entries(`system-*`)+ opaque archetype は
 * 候補から除外。空 title かつ空 body の entry は similarity 計算が
 * 無意味なので skip。
 */
export function detectDuplicates(
  entry: Entry,
  container: Container,
): DuplicateMatch[] {
  if (entry.archetype.startsWith('system-')) return [];
  const selfText = combineText(entry);
  if (selfText === '') return [];
  const selfGrams = bigrams(selfText);
  if (selfGrams.size === 0) return [];

  const candidates: DuplicateMatch[] = [];
  for (const other of container.entries) {
    if (other.lid === entry.lid) continue;
    if (other.archetype.startsWith('system-')) continue;
    if (other.archetype === 'opaque') continue;
    const otherText = combineText(other);
    if (otherText === '') continue;
    const otherGrams = bigrams(otherText);
    if (otherGrams.size === 0) continue;
    const sim = jaccard(selfGrams, otherGrams);
    if (sim < DUPLICATE_THRESHOLD) continue;
    candidates.push({
      id: `duplicate:${entry.lid}:${other.lid}`,
      lid: other.lid,
      title: other.title || '(無題)',
      similarity: sim,
      reason: `${Math.round(sim * 100)}% 一致(title + body の bigram Jaccard 類似度)── 統合 / 削除候補`,
    });
  }

  candidates.sort((a, b) => b.similarity - a.similarity);
  return candidates.slice(0, DUPLICATE_MAX_RESULTS);
}

function combineText(entry: Entry): string {
  // todo / textlog / form は body が JSON のため raw 比較がノイジー、
  // title だけで比較する方が誤検出が少ない。text / folder / generic は
  // body も含めて比較。
  const arch = entry.archetype;
  const useBody = arch === 'text' || arch === 'folder' || arch === 'generic';
  const parts: string[] = [];
  if (entry.title) parts.push(entry.title);
  if (useBody && entry.body) parts.push(entry.body);
  return parts.join(' ').trim().toLowerCase();
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  // 英語 word 区切り + CJK char 区切り、両方を 2-gram に変換。
  // 短い text の見落としを防ぐため、char-level bigram で統一。
  if (text.length < 2) {
    if (text.length === 1) out.add(text);
    return out;
  }
  for (let i = 0; i < text.length - 1; i++) {
    out.add(text.slice(i, i + 2));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  // smaller side を iter で cost 最小化
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const g of small) {
    if (large.has(g)) intersect++;
  }
  const union = a.size + b.size - intersect;
  return union === 0 ? 0 : intersect / union;
}
