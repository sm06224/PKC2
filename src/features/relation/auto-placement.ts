/**
 * Auto-placement folder resolution for newly-created entries.
 *
 * When the user creates a todo, an attachment, or pastes an image,
 * the generated entry would otherwise land at the root of the tree —
 * scattering incidental objects next to primary notes. This module
 * picks a sensible structural parent based on the current selection
 * and, for archetypes that benefit from it, routes the entry into a
 * named subfolder inside that context (e.g. `TODOS`, `ASSETS`).
 *
 * Context-folder rules (`resolveAutoPlacementFolder`, in order):
 *
 *   1. `selectedLid` is `null` / unresolved → return `null` (root).
 *   2. The selected entry is itself a folder → return that folder's lid.
 *   3. The selected entry is inside a folder chain → walk up until the
 *      first `archetype === 'folder'` ancestor; return its lid.
 *   4. No folder on the ancestor chain → return `null` (root fallback).
 *
 * Subfolder rules (`findSubfolder` / `ARCHETYPE_SUBFOLDER_NAMES`):
 *
 *   - Each auto-placed archetype maps to a fixed subfolder title
 *     (`todo → TODOS`, `attachment → ASSETS`).
 *   - `findSubfolder` returns the first existing child folder of the
 *     context whose title exactly matches the target name. When none
 *     exists, the reducer lazily creates one in the same reduction so
 *     placement stays atomic (see app-state.ts).
 *   - When the context folder itself already has the target title,
 *     the reducer skips the subfolder layer to avoid nesting like
 *     `TODOS/TODOS`.
 *   - When no context folder is resolved (rule 4 above), no subfolder
 *     is created — the entry lands at root.
 *
 * Pure. No DOM. No persistence side-effects.
 *
 * See docs/development/auto-folder-placement-for-generated-entries.md.
 */

import type { Container } from '../../core/model/container';
import type { ArchetypeId } from '../../core/model/record';
import { getStructuralParent } from './tree';

/** Max ancestor-walk depth. Mirrors `getAncestorFolderLids` / subset build. */
const MAX_ANCESTOR_DEPTH = 32;

/**
 * Fixed subfolder titles per auto-placed archetype.
 *
 * Only archetypes present here get a subfolder layer; other archetypes
 * (including `folder` itself) are placed directly in the context
 * folder. The values are intentionally ALL-CAPS so they sort together
 * and are easy to spot in the sidebar.
 */
export const ARCHETYPE_SUBFOLDER_NAMES: Readonly<Partial<Record<ArchetypeId, string>>> = {
  todo: 'TODOS',
  attachment: 'ASSETS',
};

/**
 * Lookup the subfolder title for an archetype, or `null` if the
 * archetype has no subfolder policy.
 */
export function getSubfolderNameForArchetype(archetype: ArchetypeId): string | null {
  return ARCHETYPE_SUBFOLDER_NAMES[archetype] ?? null;
}

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

/**
 * Find an existing child folder of `parentFolderLid` whose title
 * matches `subfolderTitle` exactly. Returns the child's lid, or `null`
 * if none exists.
 *
 * "Child" means connected via a structural relation
 * `parentFolderLid → child`. Multiple matches return the first one
 * encountered in relation order — the caller treats that as the
 * canonical subfolder for the context.
 */
export function findSubfolder(
  container: Container,
  parentFolderLid: string,
  subfolderTitle: string,
): string | null {
  const entryMap = new Map(container.entries.map((e) => [e.lid, e]));
  for (const rel of container.relations) {
    if (rel.kind !== 'structural') continue;
    if (rel.from !== parentFolderLid) continue;
    const child = entryMap.get(rel.to);
    if (!child) continue;
    if (child.archetype !== 'folder') continue;
    if (child.title === subfolderTitle) return child.lid;
  }
  return null;
}
