/**
 * Inspector AI tab Phase 1 — local-only abandoned entry warning(pgc-148)。
 *
 * pure features 層。`updated_at` が古く + relation 0 件 + markdown link
 * reference 0 件 の entry を "使われていない候補" として警告。
 * roadmap §2.2 A 群 4(`abandoned entry`)着地。
 *
 * Phase 1 scope:現 entry 単体の self-check のみ。container 全体の
 * abandoned 一覧は後続 PR(scope 大)。
 *
 * Spec: docs/development/inspector-ai-tab-roadmap-2026-05.md §3 Phase 1
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { buildLinkIndex } from '../link-index/link-index';

/** "古い" 判定の閾値(日)。30 日 = 体感「最近触ってない」。 */
export const ABANDONED_DAYS_THRESHOLD = 30;

export interface AbandonedWarning {
  /** Stable id for dismiss UI. */
  id: string;
  daysSinceUpdate: number;
  relationCount: number;
  linkRefCount: number;
  /** Japanese human-readable reason for Inspector hint. */
  reason: string;
}

function daysBetween(fromIso: string, nowMs: number): number {
  const t = Date.parse(fromIso);
  if (!isFinite(t)) return 0;
  return Math.max(0, Math.floor((nowMs - t) / 86_400_000));
}

/**
 * Check if `entry` is an abandoned candidate. Returns `null` when the
 * entry is still active (recent update OR relation present OR linked
 * from elsewhere). System entries (About / Settings / Flags) are
 * always excluded.
 *
 * Pure function: stable for given inputs, no IDB / network. `now` is
 * an injectable argument so tests can fix the clock without monkey
 * patching `Date.now`.
 */
export function detectAbandonedWarning(
  entry: Entry,
  container: Container,
  now: number = Date.now(),
): AbandonedWarning | null {
  // system entries(__about__ / __settings__ / __flags__)は abandoned
  // 判定対象外 ── これらは container 既定で常時 hold される framework entry。
  if (entry.archetype.startsWith('system-')) return null;

  const days = daysBetween(entry.updated_at, now);
  if (days < ABANDONED_DAYS_THRESHOLD) return null;

  const relationCount = container.relations.filter(
    (r) => r.from === entry.lid || r.to === entry.lid,
  ).length;
  if (relationCount > 0) return null;

  const index = buildLinkIndex(container);
  const outgoing = index.outgoingBySource.get(entry.lid)?.length ?? 0;
  const backlinks = index.backlinksByTarget.get(entry.lid)?.length ?? 0;
  const linkRefCount = outgoing + backlinks;
  if (linkRefCount > 0) return null;

  return {
    id: `abandoned:${entry.lid}`,
    daysSinceUpdate: days,
    relationCount,
    linkRefCount,
    reason: `${days} 日間更新なし、relation 0 件、markdown link 参照 0 件 ── archive / 削除候補`,
  };
}
