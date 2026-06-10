/**
 * Small vendored helpers — DOM construction, system-archetype check, and
 * the structural-parent / folder-ancestor walks used by the Venn overlay.
 * Ported verbatim from PKC2 (`renderer` DOM util, `core/model/record`,
 * `features/relation/tree`) to keep the extension self-contained.
 */

import type { Entry, Relation } from './types';

/** Create an element with an optional className. */
export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** System entries (`system-*`) are excluded from the graph. */
export function isSystemArchetype(archetype: string): boolean {
  return archetype.startsWith('system-');
}

/** The structural parent of `lid`, or null. */
export function getStructuralParent(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
): Entry | null {
  for (const r of relations) {
    if (r.kind === 'structural' && r.to === lid) {
      const parent = entries.find((e) => e.lid === r.from);
      if (parent) return parent;
    }
  }
  return null;
}

/** Folder ancestor lids of `lid`, nearest first. */
export function getAncestorFolderLids(
  relations: readonly Relation[],
  entries: readonly Entry[],
  lid: string,
  maxDepth = 32,
): string[] {
  const out: string[] = [];
  const visited = new Set<string>([lid]);
  let current = lid;
  for (let i = 0; i < maxDepth; i++) {
    const parent = getStructuralParent(relations, entries, current);
    if (!parent) break;
    if (visited.has(parent.lid)) break;
    visited.add(parent.lid);
    if (parent.archetype === 'folder') out.push(parent.lid);
    current = parent.lid;
  }
  return out;
}
