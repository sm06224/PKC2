import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { BatchImportPreviewInfo, ImportPreviewRef } from '@core/action/system-command';

/**
 * C-1 revision-branch-restore v1 — reducer/state slice tests.
 *
 * Contract: `docs/spec/revision-branch-restore-v1-behavior-contract.md`
 *   - §1.3  operation
 *   - §5    state interaction (selectedLid = newLid)
 *   - §6.1  gate conditions
 *   - §8    error paths (no-op keeps state identity)
 */

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1', title: 'Entry One', body: 'Body one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer };
}

/**
 * Build a state with entry `e1` holding exactly one revision captured
 * pre-edit, so `BRANCH_RESTORE_REVISION` has something to branch from.
 */
function stateWithRevision(): { state: AppState; revisionId: string } {
  const { state: editing } = reduce(readyState(), { type: 'BEGIN_EDIT', lid: 'e1' });
  const { state: edited } = reduce(editing, {
    type: 'COMMIT_EDIT', lid: 'e1', title: 'Edited', body: 'Edited body',
  });
  expect(edited.container!.revisions).toHaveLength(1);
  const revisionId = edited.container!.revisions[0]!.id;
  return { state: edited, revisionId };
}

describe('BRANCH_RESTORE_REVISION reducer', () => {
  it('1. success path: appends a new entry + provenance relation, container advances', () => {
    const { state: base, revisionId } = stateWithRevision();
    const { state, events } = reduce(base, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });

    expect(state).not.toBe(base);
    expect(state.container).not.toBe(base.container);
    expect(state.container!.entries).toHaveLength(2);
    expect(state.container!.relations).toHaveLength(1);

    const rel = state.container!.relations[0]!;
    expect(rel.kind).toBe('provenance');
    expect(rel.from).toBe('e1');

    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('ENTRY_BRANCHED_FROM_REVISION');
  });

  it('2. success path: selectedLid is set to the newly generated lid', () => {
    const { state: base, revisionId } = stateWithRevision();
    const { state } = reduce(base, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });

    expect(state.selectedLid).toBeTruthy();
    expect(state.selectedLid).not.toBe('e1');
    const branched = state.container!.entries.find((e) => e.lid === state.selectedLid);
    expect(branched).toBeDefined();
    // Snapshot content = pre-edit state
    expect(branched!.title).toBe('Entry One');
    expect(branched!.body).toBe('Body one');
  });

  it('3. readonly gate: action is blocked and state identity is preserved', () => {
    const { state: base, revisionId } = stateWithRevision();
    const guarded: AppState = { ...base, readonly: true };
    const { state, events } = reduce(guarded, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(state).toBe(guarded);
    expect(events).toHaveLength(0);
  });

  it('4. historical / viewOnlySource gate: blocked with state identity preserved', () => {
    const { state: base, revisionId } = stateWithRevision();
    const guarded: AppState = { ...base, viewOnlySource: true };
    const { state, events } = reduce(guarded, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(state).toBe(guarded);
    expect(events).toHaveLength(0);
  });

  it('5. importPreview gate: blocked while a preview is staged', () => {
    const { state: base, revisionId } = stateWithRevision();
    const preview: ImportPreviewRef = {
      title: 'Imported',
      container_id: 'imp-1',
      entry_count: 1,
      revision_count: 0,
      schema_version: 1,
      source: 'file.pkc',
      container: mockContainer,
    };
    const guarded: AppState = { ...base, importPreview: preview };
    const { state, events } = reduce(guarded, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(state).toBe(guarded);
    expect(events).toHaveLength(0);
  });

  it('6. batchImportPreview gate: blocked while a batch preview is staged', () => {
    const { state: base, revisionId } = stateWithRevision();
    const batchPreview: BatchImportPreviewInfo = {
      format: 'pkc2-texts-container-bundle',
      formatLabel: 'TEXT container bundle',
      textCount: 0,
      textlogCount: 0,
      totalEntries: 0,
      compacted: false,
      missingAssetCount: 0,
      isFolderExport: false,
      sourceFolderTitle: null,
      canRestoreFolderStructure: false,
      folderCount: 0,
      source: 'export.zip',
      entries: [],
      selectedIndices: [],
    };
    const guarded: AppState = { ...base, batchImportPreview: batchPreview };
    const { state, events } = reduce(guarded, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(state).toBe(guarded);
    expect(events).toHaveLength(0);
  });

  it('7. invalid phase (editing): blocked via the editing-phase reducer', () => {
    const { state: base, revisionId } = stateWithRevision();
    const { state: editing } = reduce(base, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.phase).toBe('editing');
    const { state, events } = reduce(editing, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(state).toBe(editing);
    expect(events).toHaveLength(0);
  });

  it('8. no-op keeps state identity: unknown revisionId', () => {
    const base = stateWithRevision().state;
    const { state, events } = reduce(base, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId: 'nonexistent',
    });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('9. emits ENTRY_BRANCHED_FROM_REVISION with sourceLid / newLid / revision_id', () => {
    const { state: base, revisionId } = stateWithRevision();
    const { state, events } = reduce(base, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    expect(ev).toEqual({
      type: 'ENTRY_BRANCHED_FROM_REVISION',
      sourceLid: 'e1',
      newLid: state.selectedLid,
      revision_id: revisionId,
    });
  });

  it('10. source entry + revision chain are unchanged (cross-entry non-interference)', () => {
    const { state: base, revisionId } = stateWithRevision();
    const sourceBefore = base.container!.entries.find((e) => e.lid === 'e1')!;
    const revsBefore = base.container!.revisions;

    const { state } = reduce(base, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId,
    });

    // Source entry identical (title/body/timestamps preserved)
    const sourceAfter = state.container!.entries.find((e) => e.lid === 'e1')!;
    expect(sourceAfter).toEqual(sourceBefore);

    // Revision chain unchanged: same length, same identities, no new
    // revisions tagged to the branch entry.
    expect(state.container!.revisions).toBe(revsBefore);
    expect(state.container!.revisions).toHaveLength(1);
    const branchRevs = state.container!.revisions.filter(
      (r) => r.entry_lid === state.selectedLid,
    );
    expect(branchRevs).toHaveLength(0);
  });

  it('11. no-container gate: blocked when container is null', () => {
    const init = createInitialState();
    const ready: AppState = { ...init, phase: 'ready' };
    const { state, events } = reduce(ready, {
      type: 'BRANCH_RESTORE_REVISION', entryLid: 'e1', revisionId: 'any',
    });
    expect(state).toBe(ready);
    expect(events).toHaveLength(0);
  });

  it('12. RESTORE_ENTRY regression: branching must not disturb in-place restore', () => {
    const { state: base, revisionId } = stateWithRevision();
    const { state: restored, events } = reduce(base, {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: revisionId,
    });
    // RESTORE_ENTRY still rewinds e1 and emits ENTRY_RESTORED
    const entry = restored.container!.entries.find((e) => e.lid === 'e1')!;
    expect(entry.title).toBe('Entry One');
    expect(entry.body).toBe('Body one');
    expect(restored.selectedLid).toBe('e1');
    expect(events).toEqual([{ type: 'ENTRY_RESTORED', lid: 'e1', revision_id: revisionId }]);
  });
});
