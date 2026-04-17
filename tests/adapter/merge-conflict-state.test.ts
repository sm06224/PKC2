import { describe, it, expect } from 'vitest';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { EntryConflict, Resolution } from '../../src/core/model/merge-conflict';
import type { ImportPreviewRef } from '../../src/core/action/system-command';
import { reduce, createInitialState } from '../../src/adapter/state/app-state';
import type { AppState } from '../../src/adapter/state/app-state';

// ── Fixtures ──────────────────────────────

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

function makeContainer(entries: Entry[], id = 'c-test'): Container {
  return {
    meta: {
      container_id: id,
      title: 'Test',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

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

const NOW = '2026-04-17T00:00:00Z';

function readyStateWithMergePreview(
  host: Container,
  imported: Container,
): AppState {
  const preview: ImportPreviewRef = {
    container: imported,
    source: 'test.pkc2',
    entry_count: imported.entries.length,
  };
  const init = createInitialState();
  const { state: s1 } = reduce(
    { ...init, phase: 'ready', container: host },
    { type: 'SYS_IMPORT_PREVIEW', preview },
  );
  const { state: s2 } = reduce(s1, { type: 'SET_IMPORT_MODE', mode: 'merge' });
  return s2;
}

// ── Tests ──────────────────────────────

describe('Merge Conflict State', () => {
  const hostEntry = makeEntry({ lid: 'h-1', title: 'Report', body: 'host body' });
  const host = makeContainer([hostEntry], 'c-host');

  const impEntryC1 = makeEntry({ lid: 'i-1', title: 'Report', body: 'host body' });
  const impEntryC2 = makeEntry({ lid: 'i-2', title: 'Plan', body: 'different' });
  const imported = makeContainer([impEntryC1, impEntryC2], 'c-imp');

  describe('SET_MERGE_CONFLICTS', () => {
    it('stores conflicts and initializes C1 defaults', () => {
      const state = readyStateWithMergePreview(host, imported);
      const conflicts: EntryConflict[] = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
        makeConflict({ imported_lid: 'i-2', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: next } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      expect(next.mergeConflicts).toHaveLength(2);
      expect(next.mergeConflictResolutions).toEqual({
        'i-1': 'keep-current',
      });
    });

    it('is blocked when importMode is not merge', () => {
      const init = createInitialState();
      const preview: ImportPreviewRef = {
        container: imported, source: 'test.pkc2', entry_count: 2,
      };
      const { state: s1 } = reduce(
        { ...init, phase: 'ready', container: host },
        { type: 'SYS_IMPORT_PREVIEW', preview },
      );
      // importMode is 'replace' (default)
      const { state: next } = reduce(s1, {
        type: 'SET_MERGE_CONFLICTS',
        conflicts: [makeConflict({ imported_lid: 'i-1', host_lid: 'h-1' })],
      });
      expect(next.mergeConflicts).toBeUndefined();
    });
  });

  describe('SET_CONFLICT_RESOLUTION', () => {
    it('updates a single resolution', () => {
      const state = readyStateWithMergePreview(host, imported);
      const conflicts = [
        makeConflict({ imported_lid: 'i-2', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'SET_CONFLICT_RESOLUTION',
        importedLid: 'i-2',
        resolution: 'duplicate-as-branch',
      });
      expect(s2.mergeConflictResolutions!['i-2']).toBe('duplicate-as-branch');
    });
  });

  describe('BULK_SET_CONFLICT_RESOLUTION', () => {
    it('sets all conflicts to the given resolution', () => {
      const state = readyStateWithMergePreview(host, imported);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
        makeConflict({ imported_lid: 'i-2', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'BULK_SET_CONFLICT_RESOLUTION',
        resolution: 'duplicate-as-branch',
      });
      expect(s2.mergeConflictResolutions).toEqual({
        'i-1': 'duplicate-as-branch',
        'i-2': 'duplicate-as-branch',
      });
    });

    it('skips multi-host for keep-current (I-MergeUI7)', () => {
      const state = readyStateWithMergePreview(host, imported);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
        makeConflict({
          imported_lid: 'i-2', host_lid: 'h-1', kind: 'title-only-multi',
          host_candidates: ['h-1', 'h-2'],
        }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'BULK_SET_CONFLICT_RESOLUTION',
        resolution: 'keep-current',
      });
      expect(s2.mergeConflictResolutions!['i-1']).toBe('keep-current');
      expect(s2.mergeConflictResolutions!['i-2']).toBeUndefined();
    });
  });

  describe('CONFIRM_MERGE_IMPORT with conflicts', () => {
    it('keep-current filters out the imported entry', () => {
      const impEntry = makeEntry({ lid: 'i-1', title: 'Report', body: 'host body' });
      const imp = makeContainer([impEntry], 'c-imp');
      const state = readyStateWithMergePreview(host, imp);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'SET_CONFLICT_RESOLUTION', importedLid: 'i-1', resolution: 'keep-current',
      });
      const { state: result, events } = reduce(s2, {
        type: 'CONFIRM_MERGE_IMPORT', now: NOW,
      });

      expect(result.container!.entries).toHaveLength(1);
      expect(result.container!.entries[0]!.lid).toBe('h-1');
      const merged = events.find((e) => e.type === 'CONTAINER_MERGED');
      expect(merged).toBeDefined();
      if (merged && merged.type === 'CONTAINER_MERGED') {
        expect(merged.suppressed_by_keep_current).toContain('i-1');
        expect(merged.added_entries).toBe(0);
      }
    });

    it('skip filters out the imported entry', () => {
      const impEntry = makeEntry({ lid: 'i-1', title: 'Report', body: 'different' });
      const imp = makeContainer([impEntry], 'c-imp');
      const state = readyStateWithMergePreview(host, imp);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'SET_CONFLICT_RESOLUTION', importedLid: 'i-1', resolution: 'skip',
      });
      const { state: result, events } = reduce(s2, {
        type: 'CONFIRM_MERGE_IMPORT', now: NOW,
      });

      expect(result.container!.entries).toHaveLength(1);
      const merged = events.find((e) => e.type === 'CONTAINER_MERGED');
      if (merged && merged.type === 'CONTAINER_MERGED') {
        expect(merged.suppressed_by_skip).toContain('i-1');
      }
    });

    it('duplicate-as-branch keeps entry and adds provenance relation', () => {
      const impEntry = makeEntry({ lid: 'i-1', title: 'Report', body: 'different' });
      const imp = makeContainer([impEntry], 'c-imp');
      const state = readyStateWithMergePreview(host, imp);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'SET_CONFLICT_RESOLUTION', importedLid: 'i-1', resolution: 'duplicate-as-branch',
      });
      const { state: result } = reduce(s2, {
        type: 'CONFIRM_MERGE_IMPORT', now: NOW,
      });

      expect(result.container!.entries).toHaveLength(2);
      expect(result.container!.entries[0]!.lid).toBe('h-1');
      const provRel = result.container!.relations.find((r) => r.kind === 'provenance');
      expect(provRel).toBeDefined();
      expect(provRel!.to).toBe('h-1');
      expect(provRel!.metadata).toBeDefined();
      expect((provRel!.metadata as Record<string, unknown>).kind).toBe('merge-duplicate');
    });

    it('host entries remain unchanged after confirm', () => {
      const impEntry = makeEntry({ lid: 'i-1', title: 'Report', body: 'diff' });
      const imp = makeContainer([impEntry], 'c-imp');
      const state = readyStateWithMergePreview(host, imp);
      const conflicts = [
        makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'title-only' }),
      ];
      const { state: s1 } = reduce(state, { type: 'SET_MERGE_CONFLICTS', conflicts });
      const { state: s2 } = reduce(s1, {
        type: 'SET_CONFLICT_RESOLUTION', importedLid: 'i-1', resolution: 'duplicate-as-branch',
      });
      const { state: result } = reduce(s2, {
        type: 'CONFIRM_MERGE_IMPORT', now: NOW,
      });

      const hostInResult = result.container!.entries.find((e) => e.lid === 'h-1');
      expect(hostInResult).toBeDefined();
      expect(hostInResult!.title).toBe('Report');
      expect(hostInResult!.body).toBe('host body');
    });

    it('confirm without conflicts works as before (no filtering)', () => {
      const impEntry = makeEntry({ lid: 'i-new', title: 'New', body: 'new body' });
      const imp = makeContainer([impEntry], 'c-imp');
      const state = readyStateWithMergePreview(host, imp);
      // No SET_MERGE_CONFLICTS dispatched
      const { state: result, events } = reduce(state, {
        type: 'CONFIRM_MERGE_IMPORT', now: NOW,
      });

      expect(result.container!.entries).toHaveLength(2);
      const merged = events.find((e) => e.type === 'CONTAINER_MERGED');
      if (merged && merged.type === 'CONTAINER_MERGED') {
        expect(merged.suppressed_by_keep_current).toEqual([]);
        expect(merged.suppressed_by_skip).toEqual([]);
      }
    });
  });

  describe('State reset', () => {
    it('CANCEL_IMPORT clears conflict state', () => {
      const state = readyStateWithMergePreview(host, imported);
      const { state: s1 } = reduce(state, {
        type: 'SET_MERGE_CONFLICTS',
        conflicts: [makeConflict({ imported_lid: 'i-1', host_lid: 'h-1' })],
      });
      expect(s1.mergeConflicts).toBeDefined();
      const { state: s2 } = reduce(s1, { type: 'CANCEL_IMPORT' });
      expect(s2.mergeConflicts).toBeUndefined();
      expect(s2.mergeConflictResolutions).toBeUndefined();
    });

    it('SYS_IMPORT_PREVIEW (re-preview) clears conflict state', () => {
      const state = readyStateWithMergePreview(host, imported);
      const { state: s1 } = reduce(state, {
        type: 'SET_MERGE_CONFLICTS',
        conflicts: [makeConflict({ imported_lid: 'i-1', host_lid: 'h-1' })],
      });
      const newPreview: ImportPreviewRef = {
        container: imported, source: 'new.pkc2', entry_count: 2,
      };
      const { state: s2 } = reduce(s1, { type: 'SYS_IMPORT_PREVIEW', preview: newPreview });
      expect(s2.mergeConflicts).toBeUndefined();
      expect(s2.mergeConflictResolutions).toBeUndefined();
    });

    it('SET_IMPORT_MODE to replace clears conflict state', () => {
      const state = readyStateWithMergePreview(host, imported);
      const { state: s1 } = reduce(state, {
        type: 'SET_MERGE_CONFLICTS',
        conflicts: [makeConflict({ imported_lid: 'i-1', host_lid: 'h-1' })],
      });
      const { state: s2 } = reduce(s1, { type: 'SET_IMPORT_MODE', mode: 'replace' });
      expect(s2.mergeConflicts).toBeUndefined();
      expect(s2.mergeConflictResolutions).toBeUndefined();
    });
  });
});
