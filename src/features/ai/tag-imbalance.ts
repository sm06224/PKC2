/**
 * Inspector AI tab Phase 2 — tag imbalance suggester(pgc-165、roadmap
 * §2.2 A 群 7、Phase 2 完了)。container 全体の tag 使用統計と
 * current entry の tag を比較、tag 不均衡(0 件 vs container 平均
 * 1+ 件、または container 内 popular tag 未使用)を Inspector に
 * 提示。frontmatter suggester(pgc-147)の tag 提案を補完する
 * container-wide perspective。
 *
 * pure features 層。current entry が text / folder / generic archetype
 * のみ lint 対象。
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { parseFrontmatter } from '../markdown/frontmatter';

export interface TagImbalanceSuggestion {
  /** Stable id for dismiss UI. */
  id: string;
  /** Container 内で頻出している tag 上位 3 件(current entry に既に含まれるものは除外)。 */
  popularTags: readonly string[];
  /** Japanese human-readable reason. */
  reason: string;
}

/** container 全体で何 entry 中何 entry が tag を持っているかの最低割合。
 *  これ未満(50%)なら tag 文化が無い container と判断、suggestion 出さない。 */
const TAG_CULTURE_THRESHOLD = 0.5;
/** popular tag として提示する上限件数。 */
const POPULAR_TAG_LIMIT = 3;

export function detectTagImbalance(
  entry: Entry,
  container: Container,
): TagImbalanceSuggestion | null {
  if (entry.archetype.startsWith('system-')) return null;
  const lintable
    = entry.archetype === 'text'
      || entry.archetype === 'folder'
      || entry.archetype === 'generic';
  if (!lintable) return null;

  // current entry の tag(frontmatter `tags:` + entry.tags 両方 union)
  const currentTags = collectEntryTags(entry);
  if (currentTags.size > 0) return null; // 既に tag あり → 不均衡なし

  // container 内 user entry のうち tag 持ち の割合 + popular tag を集計
  const userEntries = container.entries.filter((e) => !e.archetype.startsWith('system-'));
  if (userEntries.length < 4) return null; // 短すぎる container(統計弱い)

  const taggedCount = userEntries.filter((e) => collectEntryTags(e).size > 0).length;
  const taggedRatio = taggedCount / userEntries.length;
  if (taggedRatio < TAG_CULTURE_THRESHOLD) return null; // tag 文化なし

  // popular tag counts
  const counts = new Map<string, number>();
  for (const e of userEntries) {
    for (const t of collectEntryTags(e)) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  const popular = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_TAG_LIMIT)
    .map(([tag]) => tag);
  if (popular.length === 0) return null;

  return {
    id: `tag-imbalance:${entry.lid}`,
    popularTags: popular,
    reason: `container では ${Math.round(taggedRatio * 100)}% の entry が tag を持っていますが、この entry は tag 0 件です。popular tag:#${popular.join(' #')} ── 候補 frontmatter suggester(🧠)で apply 可能`,
  };
}

function collectEntryTags(entry: Entry): Set<string> {
  const out = new Set<string>();
  // entry.tags(top-level field)
  if (Array.isArray(entry.tags)) {
    for (const t of entry.tags) {
      if (typeof t === 'string' && t.trim() !== '') out.add(t.trim());
    }
  }
  // frontmatter tags
  try {
    const fm = parseFrontmatter(entry.body ?? '');
    const raw = (fm.meta as Record<string, unknown>).tags;
    if (Array.isArray(raw)) {
      for (const t of raw) {
        if (typeof t === 'string' && t.trim() !== '') out.add(t.trim());
      }
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      out.add(raw.trim());
    }
  } catch {
    // frontmatter parse failure は無視(tag 0 件として扱う)
  }
  return out;
}
