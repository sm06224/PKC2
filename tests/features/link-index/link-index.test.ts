/**
 * C-3 v1 pure helper tests: link-index
 *
 * Contract: docs/spec/link-index-v1-behavior-contract.md §3.4
 * Categories: text outgoing / textlog outgoing / backlinks inversion /
 * broken detection / duplicate refs / self-link / empty body /
 * deterministic order / relation-independence / mixed resolved+unresolved
 */
import { describe, it, expect } from 'vitest';
import {
  buildLinkIndex,
  collectLinkRefs,
  extractRefsFromEntry,
} from '@features/link-index/link-index';
import type { ArchetypeId } from '@core/model/record';
import type { Entry } from '@core/model/record';
import type { Container } from '@core/model/container';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import { serializeTodoBody } from '@features/todo/todo-body';

function mkEntry(lid: string, archetype: ArchetypeId, body: string): Entry {
  return {
    lid,
    title: lid.toUpperCase(),
    body,
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of bounds`);
  return v;
}

describe('C-3 pure: extractRefsFromEntry', () => {
  it('text entry with entry: refs', () => {
    const entry = mkEntry('a', 'text', 'see [link](entry:b) and entry:c');
    const lids = new Set(['a', 'b', 'c']);
    const refs = extractRefsFromEntry(entry, lids);
    expect(refs).toHaveLength(2);
    expect(at(refs, 0)).toEqual({
      sourceLid: 'a',
      sourceArchetype: 'text',
      targetLid: 'b',
      resolved: true,
    });
    expect(at(refs, 1)).toEqual({
      sourceLid: 'a',
      sourceArchetype: 'text',
      targetLid: 'c',
      resolved: true,
    });
  });

  it('textlog entry scans all log texts', () => {
    const body = serializeTextlogBody({
      entries: [
        { id: 'log1', text: 'ref to entry:x', createdAt: '2026-01-01T00:00:00Z', flags: [] },
        { id: 'log2', text: 'another entry:y', createdAt: '2026-01-01T00:00:00Z', flags: [] },
      ],
    });
    const entry = mkEntry('tl', 'textlog', body);
    const lids = new Set(['tl', 'x', 'y']);
    const refs = extractRefsFromEntry(entry, lids);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.targetLid)).toEqual(['x', 'y']);
  });

  it('todo entry scans description only', () => {
    const body = serializeTodoBody({
      status: 'open',
      description: 'link to entry:abc',
    });
    const entry = mkEntry('t', 'todo', body);
    const refs = extractRefsFromEntry(entry, new Set(['t', 'abc']));
    expect(refs).toHaveLength(1);
    expect(at(refs, 0).targetLid).toBe('abc');
    expect(at(refs, 0).sourceArchetype).toBe('todo');
  });

  it('folder entry scans body as markdown', () => {
    const entry = mkEntry('f', 'folder', 'child ref entry:kid');
    const refs = extractRefsFromEntry(entry, new Set(['f', 'kid']));
    expect(refs).toHaveLength(1);
    expect(at(refs, 0).targetLid).toBe('kid');
  });

  it('non-scannable archetypes return empty', () => {
    for (const arch of ['form', 'attachment', 'generic', 'opaque'] as const) {
      const entry = mkEntry('x', arch, 'entry:something');
      const refs = extractRefsFromEntry(entry, new Set(['x', 'something']));
      expect(refs).toEqual([]);
    }
  });

  it('empty body returns empty', () => {
    const entry = mkEntry('a', 'text', '');
    const refs = extractRefsFromEntry(entry, new Set(['a']));
    expect(refs).toEqual([]);
  });

  it('unresolved target is marked resolved=false', () => {
    const entry = mkEntry('a', 'text', 'entry:missing');
    const refs = extractRefsFromEntry(entry, new Set(['a']));
    expect(refs).toHaveLength(1);
    expect(at(refs, 0).resolved).toBe(false);
  });
});

describe('C-3 pure: collectLinkRefs', () => {
  it('collects refs from all entries in container order', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text', 'entry:a'),
    ];
    const container = mkContainer(entries);
    const refs = collectLinkRefs(container);
    expect(refs).toHaveLength(2);
    expect(at(refs, 0).sourceLid).toBe('a');
    expect(at(refs, 1).sourceLid).toBe('b');
  });

  it('empty container returns empty', () => {
    const refs = collectLinkRefs(mkContainer([]));
    expect(refs).toEqual([]);
  });
});

describe('C-3 pure: buildLinkIndex', () => {
  function getOut(idx: ReturnType<typeof buildLinkIndex>, lid: string) {
    return idx.outgoingBySource.get(lid) ?? [];
  }
  function getBack(idx: ReturnType<typeof buildLinkIndex>, lid: string) {
    return idx.backlinksByTarget.get(lid) ?? [];
  }

  it('backlinks inversion: A→B produces backlink B←A', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text', ''),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    expect(getOut(idx, 'a')).toHaveLength(1);
    expect(getBack(idx, 'b')).toHaveLength(1);
    expect(at(getBack(idx, 'b'), 0).sourceLid).toBe('a');
    expect(idx.broken).toHaveLength(0);
  });

  it('broken link detection: target not in container', () => {
    const entries = [mkEntry('a', 'text', 'entry:nonexistent')];
    const idx = buildLinkIndex(mkContainer(entries));
    expect(idx.broken).toHaveLength(1);
    expect(at(idx.broken, 0).targetLid).toBe('nonexistent');
    expect(at(idx.broken, 0).resolved).toBe(false);
    expect(idx.backlinksByTarget.has('nonexistent')).toBe(false);
  });

  it('duplicate refs in same entry are deduplicated', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:b and again entry:b'),
      mkEntry('b', 'text', ''),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    expect(getOut(idx, 'a')).toHaveLength(1);
    expect(getBack(idx, 'b')).toHaveLength(1);
  });

  it('self-link appears in both outgoing and backlinks', () => {
    const entries = [mkEntry('a', 'text', 'self ref entry:a')];
    const idx = buildLinkIndex(mkContainer(entries));
    const out = getOut(idx, 'a');
    expect(out).toHaveLength(1);
    expect(at(out, 0).targetLid).toBe('a');
    expect(at(out, 0).resolved).toBe(true);
    const back = getBack(idx, 'a');
    expect(back).toHaveLength(1);
    expect(at(back, 0).sourceLid).toBe('a');
    expect(idx.broken).toHaveLength(0);
  });

  it('deterministic order follows container.entries array order', () => {
    const entries = [
      mkEntry('c', 'text', 'entry:target'),
      mkEntry('a', 'text', 'entry:target'),
      mkEntry('b', 'text', 'entry:target'),
      mkEntry('target', 'text', ''),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    const backs = getBack(idx, 'target');
    expect(backs.map((r) => r.sourceLid)).toEqual(['c', 'a', 'b']);
  });

  it('relations and revisions do not affect link index', () => {
    const ts = '2026-01-01T00:00:00Z';
    const container = mkContainer([
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text', ''),
    ]);
    container.relations = [
      { id: 'r1', from: 'a', to: 'b', kind: 'structural', created_at: ts, updated_at: ts },
    ];
    container.revisions = [
      { id: 'rev1', entry_lid: 'a', snapshot: '{}', created_at: ts },
    ];
    const idx = buildLinkIndex(container);
    expect(getOut(idx, 'a')).toHaveLength(1);
    expect(getBack(idx, 'b')).toHaveLength(1);
    expect(idx.broken).toHaveLength(0);
  });

  it('mixed resolved and unresolved refs', () => {
    const entries = [
      mkEntry('a', 'text', 'entry:b and entry:gone'),
      mkEntry('b', 'text', ''),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    const out = getOut(idx, 'a');
    expect(out).toHaveLength(2);
    expect(at(out, 0)).toMatchObject({ targetLid: 'b', resolved: true });
    expect(at(out, 1)).toMatchObject({ targetLid: 'gone', resolved: false });
    expect(getBack(idx, 'b')).toHaveLength(1);
    expect(idx.broken).toHaveLength(1);
    expect(at(idx.broken, 0).targetLid).toBe('gone');
  });

  it('multiple entries referencing same target (hub)', () => {
    const entries = [
      mkEntry('hub', 'text', ''),
      mkEntry('a', 'text', 'entry:hub'),
      mkEntry('b', 'text', '[link](entry:hub)'),
      mkEntry('c', 'folder', '![embed](entry:hub)'),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    const backs = getBack(idx, 'hub');
    expect(backs).toHaveLength(3);
    expect(backs.map((r) => r.sourceLid)).toEqual(['a', 'b', 'c']);
  });

  it('fragment refs are resolved by lid only (fragment stripped)', () => {
    const entries = [
      mkEntry('a', 'text', '[link](entry:b#log/123)'),
      mkEntry('b', 'textlog', serializeTextlogBody({ entries: [] })),
    ];
    const idx = buildLinkIndex(mkContainer(entries));
    const out = getOut(idx, 'a');
    expect(out).toHaveLength(1);
    expect(at(out, 0).targetLid).toBe('b');
    expect(at(out, 0).resolved).toBe(true);
  });

  it('malformed textlog body treated as empty', () => {
    const entry = mkEntry('bad', 'textlog', 'not json {{{');
    const idx = buildLinkIndex(mkContainer([entry]));
    expect(idx.outgoingBySource.has('bad')).toBe(false);
    expect(idx.broken).toHaveLength(0);
  });

  it('container with no refs returns empty index', () => {
    const entries = [mkEntry('a', 'text', 'just text'), mkEntry('b', 'text', 'no refs')];
    const idx = buildLinkIndex(mkContainer(entries));
    expect(idx.outgoingBySource.size).toBe(0);
    expect(idx.backlinksByTarget.size).toBe(0);
    expect(idx.broken).toHaveLength(0);
  });
});
