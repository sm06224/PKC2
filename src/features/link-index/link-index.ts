/**
 * C-3 link-index v1 pure helpers.
 *
 * Runtime-only derivation: outgoing / backlinks / broken.
 * Contract: docs/spec/link-index-v1-behavior-contract.md §2–§3.
 *
 * Features layer — no DOM, no AppState, no dispatcher.
 */

import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { ArchetypeId } from '@core/model/record';
import { extractEntryReferences } from '@features/entry-ref/extract-entry-refs';
import { parseTextlogBody } from '@features/textlog/textlog-body';
import { parseTodoBody } from '@features/todo/todo-body';

export type LinkSourceArchetype = 'text' | 'textlog' | 'folder' | 'todo';

export interface LinkRef {
  sourceLid: string;
  sourceArchetype: LinkSourceArchetype;
  targetLid: string;
  resolved: boolean;
}

export interface LinkIndex {
  outgoingBySource: ReadonlyMap<string, readonly LinkRef[]>;
  backlinksByTarget: ReadonlyMap<string, readonly LinkRef[]>;
  broken: readonly LinkRef[];
}

const SCANNABLE: ReadonlySet<ArchetypeId> = new Set<ArchetypeId>([
  'text',
  'textlog',
  'folder',
  'todo',
]);

function sourceBody(entry: Entry): string {
  if (!SCANNABLE.has(entry.archetype)) return '';
  switch (entry.archetype) {
    case 'textlog': {
      const tb = parseTextlogBody(entry.body);
      return tb.entries.map((e) => e.text).join('\n');
    }
    case 'todo': {
      const td = parseTodoBody(entry.body);
      return td.description;
    }
    default:
      return entry.body;
  }
}

export function extractRefsFromEntry(
  entry: Entry,
  existingLids: ReadonlySet<string>,
): LinkRef[] {
  const body = sourceBody(entry);
  if (!body) return [];
  const targets = extractEntryReferences(body);
  const refs: LinkRef[] = [];
  for (const targetLid of targets) {
    refs.push({
      sourceLid: entry.lid,
      sourceArchetype: entry.archetype as LinkSourceArchetype,
      targetLid,
      resolved: existingLids.has(targetLid),
    });
  }
  return refs;
}

export function collectLinkRefs(container: Container): LinkRef[] {
  const existingLids = new Set(container.entries.map((e) => e.lid));
  const all: LinkRef[] = [];
  for (const entry of container.entries) {
    const refs = extractRefsFromEntry(entry, existingLids);
    for (const r of refs) all.push(r);
  }
  return all;
}

export function buildLinkIndex(container: Container): LinkIndex {
  const refs = collectLinkRefs(container);

  const outgoingBySource = new Map<string, LinkRef[]>();
  const backlinksByTarget = new Map<string, LinkRef[]>();
  const broken: LinkRef[] = [];

  for (const ref of refs) {
    let outList = outgoingBySource.get(ref.sourceLid);
    if (!outList) {
      outList = [];
      outgoingBySource.set(ref.sourceLid, outList);
    }
    outList.push(ref);

    if (ref.resolved) {
      let inList = backlinksByTarget.get(ref.targetLid);
      if (!inList) {
        inList = [];
        backlinksByTarget.set(ref.targetLid, inList);
      }
      inList.push(ref);
    } else {
      broken.push(ref);
    }
  }

  return { outgoingBySource, backlinksByTarget, broken };
}
