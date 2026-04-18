import { describe, it, expect } from 'vitest';
import type { Container } from '../../../src/core/model/container';
import type { Entry } from '../../../src/core/model/record';
import type { MergePlan, MergeCounts } from '../../../src/features/import/merge-planner';
import {
  normalizeTitle,
  bodyPreview,
  contentHash,
  detectEntryConflicts,
  applyConflictResolutions,
} from '../../../src/features/import/conflict-detect';
import type { Resolution, EntryConflict } from '../../../src/features/import/conflict-detect';

// ── Helpers ──────────────────────────────

function makeEntry(overrides: Partial<Entry> & { lid: string }): Entry {
  return {
    title: 'Untitled',
    body: '',
    archetype: 'text',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContainer(
  entries: Entry[],
  overrides?: Partial<Container>,
): Container {
  return {
    meta: {
      container_id: 'c-test',
      title: 'Test Container',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
    ...overrides,
  };
}

function makePlan(lidPairs: [string, string][]): MergePlan {
  const counts: MergeCounts = {
    addedEntries: lidPairs.length,
    renamedLids: 0,
    addedAssets: 0,
    dedupedAssets: 0,
    rehashedAssets: 0,
    addedRelations: 0,
    droppedRelations: 0,
    droppedRevisions: 0,
  };
  return {
    lidRemap: new Map(lidPairs),
    assetRemap: new Map(),
    counts,
  };
}

// ── normalizeTitle ──────────────────────────────

describe('normalizeTitle', () => {
  it('applies NFC, trims, and collapses whitespace', () => {
    expect(normalizeTitle('  Hello   World  ')).toBe('Hello World');
    expect(normalizeTitle('\tA\n\nB\t')).toBe('A B');
  });

  it('preserves case distinction', () => {
    expect(normalizeTitle('ABC')).not.toBe(normalizeTitle('abc'));
  });
});

// ── bodyPreview ──────────────────────────────

describe('bodyPreview', () => {
  it('replaces newlines with visible ↵', () => {
    expect(bodyPreview('line1\nline2')).toBe('line1↵line2');
  });

  it('does not add ellipsis when under 200 code points', () => {
    const short = 'a'.repeat(199);
    expect(bodyPreview(short)).toBe(short);
    expect(bodyPreview(short).endsWith('...')).toBe(false);
  });

  it('adds ellipsis at exactly 200 code points', () => {
    const exact = 'b'.repeat(200);
    expect(bodyPreview(exact)).toBe(exact);
  });

  it('truncates and adds ellipsis beyond 200 code points', () => {
    const long = 'c'.repeat(250);
    const result = bodyPreview(long);
    expect(result).toBe('c'.repeat(200) + '...');
  });

  it('counts unicode code points, not UTF-16 units', () => {
    const emoji = '🎉'.repeat(201);
    const result = bodyPreview(emoji);
    expect([...result.replace('...', '')].length).toBe(200);
    expect(result.endsWith('...')).toBe(true);
  });
});

// ── contentHash ──────────────────────────────

describe('contentHash', () => {
  it('excludes title from hash (same body+archetype = same hash regardless of title)', () => {
    const h1 = contentHash('body text', 'text');
    const h2 = contentHash('body text', 'text');
    expect(h1).toBe(h2);
  });

  it('differs when body differs', () => {
    const h1 = contentHash('body A', 'text');
    const h2 = contentHash('body B', 'text');
    expect(h1).not.toBe(h2);
  });

  it('differs when archetype differs', () => {
    const h1 = contentHash('same body', 'text');
    const h2 = contentHash('same body', 'textlog');
    expect(h1).not.toBe(h2);
  });
});

// ── detectEntryConflicts ──────────────────────────────

describe('detectEntryConflicts', () => {
  it('detects C1 (content-equal) when archetype + title + body match', () => {
    const host = makeContainer([
      makeEntry({ lid: 'h-1', title: 'Report', body: '# content', archetype: 'text' }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'Report', body: '# content', archetype: 'text' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe('content-equal');
    expect(conflicts[0]!.host_lid).toBe('h-1');
    expect(conflicts[0]!.imported_lid).toBe('i-1');
  });

  it('detects C2 (title-only) when title matches but body differs', () => {
    const host = makeContainer([
      makeEntry({ lid: 'h-1', title: 'Plan', body: 'draft v1', archetype: 'text' }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'Plan', body: 'revised v2', archetype: 'text' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe('title-only');
  });

  it('detects C2-multi (title-only-multi) when multiple host candidates exist', () => {
    const host = makeContainer([
      makeEntry({
        lid: 'h-1', title: 'Log', body: 'a', archetype: 'textlog',
        updated_at: '2025-04-10T00:00:00Z',
      }),
      makeEntry({
        lid: 'h-2', title: 'Log', body: 'b', archetype: 'textlog',
        updated_at: '2025-04-12T00:00:00Z',
      }),
      makeEntry({
        lid: 'h-3', title: 'Log', body: 'c', archetype: 'textlog',
        updated_at: '2025-04-11T00:00:00Z',
      }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'Log', body: 'new', archetype: 'textlog' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.kind).toBe('title-only-multi');
    expect(conflicts[0]!.host_candidates).toEqual(['h-1', 'h-2', 'h-3']);
  });

  it('returns empty for C3 (no conflict) when title or archetype differ', () => {
    const host = makeContainer([
      makeEntry({ lid: 'h-1', title: 'Report', body: 'x', archetype: 'text' }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'Different', body: 'x', archetype: 'text' }),
      makeEntry({ lid: 'i-2', title: 'Report', body: 'x', archetype: 'todo' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts).toHaveLength(0);
  });

  it('selects representative host by latest updatedAt', () => {
    const host = makeContainer([
      makeEntry({
        lid: 'h-old', title: 'X', body: 'a', archetype: 'text',
        updated_at: '2025-01-01T00:00:00Z',
      }),
      makeEntry({
        lid: 'h-new', title: 'X', body: 'b', archetype: 'text',
        updated_at: '2025-06-01T00:00:00Z',
      }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'X', body: 'c', archetype: 'text' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts[0]!.host_lid).toBe('h-new');
  });

  it('tie-breaks representative by array index ascending', () => {
    const host = makeContainer([
      makeEntry({
        lid: 'h-first', title: 'Y', body: 'a', archetype: 'text',
        updated_at: '2025-06-01T00:00:00Z',
      }),
      makeEntry({
        lid: 'h-second', title: 'Y', body: 'b', archetype: 'text',
        updated_at: '2025-06-01T00:00:00Z',
      }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'Y', body: 'c', archetype: 'text' }),
    ]);
    const conflicts = detectEntryConflicts(host, imported);
    expect(conflicts[0]!.host_lid).toBe('h-first');
  });

  it('is deterministic: same inputs always produce same output', () => {
    const host = makeContainer([
      makeEntry({ lid: 'h-1', title: 'A', body: 'x', archetype: 'text' }),
      makeEntry({ lid: 'h-2', title: 'A', body: 'y', archetype: 'text' }),
    ]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'A', body: 'z', archetype: 'text' }),
    ]);
    const run1 = detectEntryConflicts(host, imported);
    const run2 = detectEntryConflicts(host, imported);
    expect(run1).toEqual(run2);
  });

  it('does not modify host entries', () => {
    const hostEntry = makeEntry({ lid: 'h-1', title: 'T', body: 'b', archetype: 'text' });
    const snapshot = { ...hostEntry };
    const host = makeContainer([hostEntry]);
    const imported = makeContainer([
      makeEntry({ lid: 'i-1', title: 'T', body: 'b', archetype: 'text' }),
    ]);
    detectEntryConflicts(host, imported);
    expect(hostEntry).toEqual(snapshot);
  });
});

// ── applyConflictResolutions ──────────────────────────────

describe('applyConflictResolutions', () => {
  const NOW = '2026-04-17T00:00:00Z';

  function makeConflict(
    overrides: Partial<EntryConflict> & { imported_lid: string; host_lid: string },
  ): EntryConflict {
    return {
      kind: 'title-only',
      imported_title: 'T',
      host_title: 'T',
      archetype: 'text',
      imported_content_hash: 'aaa',
      host_content_hash: 'bbb',
      imported_body_preview: 'prev',
      host_body_preview: 'prev',
      imported_created_at: '2025-01-01T00:00:00Z',
      imported_updated_at: '2025-01-01T00:00:00Z',
      host_created_at: '2025-01-01T00:00:00Z',
      host_updated_at: '2025-01-01T00:00:00Z',
      ...overrides,
    };
  }

  it('keep-current filters imported entry from plan', () => {
    const plan = makePlan([['imp-1', 'm-1'], ['imp-2', 'm-2']]);
    const conflicts = [makeConflict({ imported_lid: 'imp-1', host_lid: 'h-1' })];
    const resolutions: Record<string, Resolution> = { 'imp-1': 'keep-current' };

    const result = applyConflictResolutions(plan, resolutions, conflicts, NOW);
    expect(result.plan.lidRemap.has('imp-1')).toBe(false);
    expect(result.plan.lidRemap.has('imp-2')).toBe(true);
    expect(result.plan.counts.addedEntries).toBe(1);
    expect(result.suppressedByKeepCurrent).toEqual(['imp-1']);
  });

  it('skip filters imported entry from plan', () => {
    const plan = makePlan([['imp-1', 'm-1'], ['imp-2', 'm-2']]);
    const conflicts = [makeConflict({ imported_lid: 'imp-1', host_lid: 'h-1' })];
    const resolutions: Record<string, Resolution> = { 'imp-1': 'skip' };

    const result = applyConflictResolutions(plan, resolutions, conflicts, NOW);
    expect(result.plan.lidRemap.has('imp-1')).toBe(false);
    expect(result.plan.lidRemap.has('imp-2')).toBe(true);
    expect(result.plan.counts.addedEntries).toBe(1);
    expect(result.suppressedBySkip).toEqual(['imp-1']);
  });

  it('keep-current and skip yield identical filtered plans', () => {
    const plan1 = makePlan([['imp-1', 'm-1'], ['imp-2', 'm-2']]);
    const plan2 = makePlan([['imp-1', 'm-1'], ['imp-2', 'm-2']]);
    const conflicts = [makeConflict({ imported_lid: 'imp-1', host_lid: 'h-1' })];

    const keepResult = applyConflictResolutions(
      plan1, { 'imp-1': 'keep-current' }, conflicts, NOW,
    );
    const skipResult = applyConflictResolutions(
      plan2, { 'imp-1': 'skip' }, conflicts, NOW,
    );

    expect([...keepResult.plan.lidRemap.entries()]).toEqual(
      [...skipResult.plan.lidRemap.entries()],
    );
    expect(keepResult.plan.counts.addedEntries).toBe(
      skipResult.plan.counts.addedEntries,
    );
  });

  it('duplicate-as-branch adds provenance with fixed direction from=imported to=host', () => {
    const plan = makePlan([['imp-1', 'm-1']]);
    const conflicts = [
      makeConflict({ imported_lid: 'imp-1', host_lid: 'h-1', kind: 'content-equal' }),
    ];
    const resolutions: Record<string, Resolution> = { 'imp-1': 'duplicate-as-branch' };

    const result = applyConflictResolutions(plan, resolutions, conflicts, NOW);
    expect(result.plan.lidRemap.has('imp-1')).toBe(true);
    expect(result.provenanceData).toHaveLength(1);
    expect(result.provenanceData[0]!.from_lid).toBe('m-1');
    expect(result.provenanceData[0]!.to_lid).toBe('h-1');
    expect(result.provenanceData[0]!.metadata.kind).toBe('merge-duplicate');
    expect(result.provenanceData[0]!.metadata.match_kind).toBe('content-equal');
    expect(result.provenanceData[0]!.metadata.detected_at).toBe(NOW);
  });

  it('duplicate-as-branch includes host_candidates for multi-host', () => {
    const plan = makePlan([['imp-1', 'm-1']]);
    const conflicts = [
      makeConflict({
        imported_lid: 'imp-1',
        host_lid: 'h-2',
        kind: 'title-only-multi',
        host_candidates: ['h-1', 'h-2', 'h-3'],
      }),
    ];
    const resolutions: Record<string, Resolution> = { 'imp-1': 'duplicate-as-branch' };

    const result = applyConflictResolutions(plan, resolutions, conflicts, NOW);
    expect(result.provenanceData[0]!.metadata.host_candidates).toEqual(
      ['h-1', 'h-2', 'h-3'],
    );
  });
});
