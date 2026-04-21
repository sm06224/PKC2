/**
 * Unified Orphan Detection v3 — S3 pure helper.
 *
 * Canonical spec: `docs/development/unified-orphan-detection-v3-contract.md`
 * Draft parent:   `docs/development/unified-orphan-detection-v3-draft.md`
 *
 * Features-layer pure computation. No DOM, no AppState, no persistence.
 * Callers recompute per render pass (see contract §5.5).
 *
 * Three derived sets per container:
 * - relationsConnected  — user entries with at least one non-self-loop,
 *                          non-dangling relation edge (contract §2.1 / §3.3 / §3.7)
 * - markdownConnected   — user entries whose archetype is markdown-
 *                          evaluated AND that have at least one resolved
 *                          outgoing ref OR at least one inbound markdown
 *                          backlink (contract §2.1 / §3.2 / §3.5)
 * - fullyUnconnected    — user entries in neither of the above sets
 *                          (contract §2.1 subset relationship)
 *
 * v1 continuity: this module does NOT modify the v1 `buildConnectedLidSet`,
 * `buildInboundCountMap`, or `buildLinkIndex` helpers. See contract §2.3 /
 * §5.9 / §1.4.
 */

import type { Container } from '../../core/model/container';
import type { ArchetypeId } from '../../core/model/record';
import { isUserEntry } from '../../core/model/record';
import { buildLinkIndex } from '../link-index/link-index';

export interface ConnectednessSets {
  readonly relationsConnected: ReadonlySet<string>;
  readonly markdownConnected: ReadonlySet<string>;
  readonly fullyUnconnected: ReadonlySet<string>;
}

/**
 * Archetypes whose body participates in markdown-reference evaluation
 * (contract §3.5). Kept as a closed set so additions require an explicit
 * contract revision.
 */
const MARKDOWN_EVALUATED: ReadonlySet<ArchetypeId> = new Set<ArchetypeId>([
  'text',
  'textlog',
  'folder',
  'todo',
]);

export function buildConnectednessSets(container: Container): ConnectednessSets {
  // Contract §3.9: evaluation scope = user entries only. System entries
  // (system-about / system-settings / any future system-*) are excluded
  // from all three output sets.
  const userEntries = container.entries.filter(isUserEntry);
  const userLids = new Set<string>();
  for (const e of userEntries) userLids.add(e.lid);

  // relationsConnected: contract §2.1 with §3.3 (no self-loop) and
  // §3.7 (no dangling) exclusions applied. v1 `buildConnectedLidSet`
  // does NOT apply these exclusions — intentional divergence per §3.3.
  const relationsConnected = new Set<string>();
  for (const r of container.relations) {
    if (r.from === r.to) continue;
    if (!userLids.has(r.from)) continue;
    if (!userLids.has(r.to)) continue;
    relationsConnected.add(r.from);
    relationsConnected.add(r.to);
  }

  // markdownConnected: contract §2.1 with §3.2 (broken excluded via
  // `ref.resolved` filter) and §3.5 (archetype gate). Non-markdown-
  // evaluated archetypes are never added — their fullyUnconnected
  // reduces to ¬relationsConnected, matching the contract.
  const linkIndex = buildLinkIndex(container);
  const markdownConnected = new Set<string>();
  for (const e of userEntries) {
    if (!MARKDOWN_EVALUATED.has(e.archetype)) continue;
    const outgoing = linkIndex.outgoingBySource.get(e.lid) ?? [];
    let hasResolvedOutgoing = false;
    for (const ref of outgoing) {
      if (ref.resolved) {
        hasResolvedOutgoing = true;
        break;
      }
    }
    const backlinks = linkIndex.backlinksByTarget.get(e.lid) ?? [];
    if (hasResolvedOutgoing || backlinks.length > 0) {
      markdownConnected.add(e.lid);
    }
  }

  // fullyUnconnected: contract §2.1. Subset relationship
  // (fullyUnconnected ⊆ relationsOrphan) holds by construction because
  // the only way to enter this set requires ¬relationsConnected.
  const fullyUnconnected = new Set<string>();
  for (const e of userEntries) {
    if (!relationsConnected.has(e.lid) && !markdownConnected.has(e.lid)) {
      fullyUnconnected.add(e.lid);
    }
  }

  return { relationsConnected, markdownConnected, fullyUnconnected };
}
