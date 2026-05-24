/**
 * Inspector AI tab Phase 2 — circular reference detector(pgc-164、roadmap
 * §2.2 A 群 5)。`entry:<lid>` markdown 参照 + structural / categorical
 * relation を combined graph と見立て、current entry を含む循環(A → B
 * → A 等)を検出して提示。Inspector AI tab で「relation graph 上の閉路」
 * を可視化、user の意図しない循環を発見する動線。
 *
 * pure features 層。BFS / DFS で current entry を起点に traverse、
 * cycle 検出 + cycle 上の lid 列を返す。
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { buildLinkIndex } from '../link-index/link-index';

export interface CircularReference {
  /** Stable id for dismiss UI. */
  id: string;
  /** Cycle path lid list, starting & ending with the current entry's lid. */
  path: readonly string[];
  /** Human-readable Japanese reason. */
  reason: string;
}

/**
 * Detect a circular reference involving `entry`. Returns the first
 * cycle found(BFS from current entry)or `null` if none. Combined
 * graph = markdown `entry:` references(outgoing only)+ structural
 * relation(`from === entry.lid`)+ semantic / categorical / temporal
 * relation の outgoing edge(provenance は除外、merge 経路は循環
 * 起こさない設計のため)。
 *
 * System entries 除外。1 件目の cycle のみ提示(noise 抑制)、Inspector
 * は dismiss 可能。
 */
export function detectCircularReference(
  entry: Entry,
  container: Container,
): CircularReference | null {
  if (entry.archetype.startsWith('system-')) return null;

  // 各 entry の outgoing edges(lid set)を pre-compute
  const outgoing = buildOutgoingGraph(container);
  const start = entry.lid;
  if (!outgoing.has(start)) return null;

  // BFS で start から進み、再び start に戻る path を探す
  type Step = { lid: string; path: string[] };
  const queue: Step[] = [];
  const startEdges = outgoing.get(start) ?? new Set<string>();
  for (const next of startEdges) {
    queue.push({ lid: next, path: [start, next] });
  }
  const MAX_DEPTH = 32; // 巨大 graph での無限 traversal 防止
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.path.length > MAX_DEPTH) continue;
    if (cur.lid === start) {
      // 循環発見
      return {
        id: `circular-ref:${start}`,
        path: cur.path,
        // path.length === 2 = self-loop(a → a)、それ以外 = N-step cycle
        reason: cur.path.length === 2
          ? `自己参照ループを検出:${cur.path.join(' → ')}(自分が自分を直接参照しています)`
          : `${cur.path.length - 1} ステップの循環参照を検出:${cur.path.join(' → ')} ── relation / link を整理推奨`,
      };
    }
    const nexts = outgoing.get(cur.lid);
    if (!nexts) continue;
    for (const n of nexts) {
      // 同 path 内で既出 lid は visit 済(他 cycle 経路)── skip
      if (cur.path.includes(n) && n !== start) continue;
      queue.push({ lid: n, path: [...cur.path, n] });
    }
  }
  return null;
}

function buildOutgoingGraph(container: Container): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  // structural / semantic / categorical / temporal relations(provenance 除外)
  for (const r of container.relations) {
    if (r.kind === 'provenance') continue;
    let set = out.get(r.from);
    if (!set) {
      set = new Set();
      out.set(r.from, set);
    }
    set.add(r.to);
  }
  // markdown `entry:` references も outgoing として加える
  const index = buildLinkIndex(container);
  for (const [src, refs] of index.outgoingBySource) {
    let set = out.get(src);
    if (!set) {
      set = new Set();
      out.set(src, set);
    }
    for (const ref of refs) {
      if (ref.resolved) set.add(ref.targetLid);
    }
  }
  return out;
}
