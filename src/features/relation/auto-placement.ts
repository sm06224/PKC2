/**
 * Auto-placement folder resolution for newly-created entries.
 *
 * When the user creates a todo, an attachment, or pastes an image,
 * the generated entry would otherwise land at the root of the tree —
 * scattering incidental objects next to primary notes. This helper
 * picks a sensible structural parent based on the current selection,
 * inheriting the context of whatever the user is looking at.
 *
 * Rules (in order):
 *
 *   1. `selectedLid` is `null` / unresolved → return `null` (root).
 *   2. The selected entry is itself a folder → return that folder's lid.
 *   3. The selected entry is inside a folder chain → walk up until the
 *      first `archetype === 'folder'` ancestor; return its lid.
 *   4. No folder on the ancestor chain → return `null` (root fallback).
 *
 * `null` means "no auto-placement" — the caller should not add any
 * structural relation, so the entry naturally lands at root. This
 * preserves the historical behaviour whenever the context can't
 * contribute a meaningful folder.
 *
 * Pure. No DOM. No persistence side-effects.
 *
 * See docs/development/auto-folder-placement-for-generated-entries.md.
 */

import type { Container } from '../../core/model/container';
import { getStructuralParent } from './tree';

/** Max ancestor-walk depth. Mirrors `getAncestorFolderLids` / subset build. */
const MAX_ANCESTOR_DEPTH = 32;

/**
 * Resolve the structural-parent folder lid for a new entry whose
 * "creation context" is `selectedLid`.
 *
 * Returns `null` when the context has no folder ancestor and the new
 * entry should simply sit at root.
 */
export function resolveAutoPlacementFolder(
  container: Container,
  selectedLid: string | null | undefined,
): string | null {
  if (!selectedLid) return null;
  const selected = container.entries.find((e) => e.lid === selectedLid);
  if (!selected) return null;

  // Rule 2: the selection is itself a folder.
  if (selected.archetype === 'folder') return selected.lid;

  // Rule 3: walk up to the first folder ancestor.
  let current = selected.lid;
  const visited = new Set<string>([current]);
  for (let depth = 0; depth < MAX_ANCESTOR_DEPTH; depth++) {
    const parent = getStructuralParent(container.relations, container.entries, current);
    if (!parent) break;
    if (visited.has(parent.lid)) break;
    visited.add(parent.lid);
    if (parent.archetype === 'folder') return parent.lid;
    current = parent.lid;
  }

  // Rule 4: no folder on the chain → root.
  return null;
}
