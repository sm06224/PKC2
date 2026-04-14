import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { BatchImportPreviewInfo } from '@core/action/system-command';

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
      archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      lid: 'e2', title: 'Entry Two', body: 'Body two',
      archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z',
    },
    {
      lid: 'e3', title: 'Entry Three', body: 'Body three',
      archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer };
}

describe('AppState reducer', () => {
  // ── initializing ─────────────────────────
  it('starts in initializing phase', () => {
    const state = createInitialState();
    expect(state.phase).toBe('initializing');
    expect(state.container).toBeNull();
    expect(state.editingLid).toBeNull();
  });

  it('SYS_INIT_COMPLETE → ready + CONTAINER_LOADED event', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.phase).toBe('ready');
    expect(state.container).toBe(mockContainer);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_LOADED');
  });

  it('SYS_INIT_ERROR → error + ERROR_OCCURRED event', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SYS_INIT_ERROR', error: 'fail',
    });
    expect(state.phase).toBe('error');
    expect(events[0]).toEqual({ type: 'ERROR_OCCURRED', error: 'fail' });
  });

  it('blocks user actions during initializing', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'BEGIN_EDIT', lid: 'x',
    });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  // ── ready: selection ─────────────────────
  it('SELECT_ENTRY in ready → selectedLid + ENTRY_SELECTED event', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SELECT_ENTRY', lid: 'e1',
    });
    expect(state.selectedLid).toBe('e1');
    expect(events).toEqual([{ type: 'ENTRY_SELECTED', lid: 'e1' }]);
  });

  it('DESELECT_ENTRY in ready → null + ENTRY_DESELECTED event', () => {
    const base = { ...readyState(), selectedLid: 'e1' };
    const { state, events } = reduce(base, { type: 'DESELECT_ENTRY' });
    expect(state.selectedLid).toBeNull();
    expect(events[0]!.type).toBe('ENTRY_DESELECTED');
  });

  // ── ready: CREATE_ENTRY with mutation ────
  it('CREATE_ENTRY adds entry to container', () => {
    const { state, events } = reduce(readyState(), {
      type: 'CREATE_ENTRY', archetype: 'text', title: 'New Entry',
    });
    expect(state.container!.entries).toHaveLength(4);
    const created = state.container!.entries[3]!;
    expect(created.title).toBe('New Entry');
    expect(created.archetype).toBe('text');
    expect(created.body).toBe('');
    // Selected the new entry and entered editing
    expect(state.selectedLid).toBe(created.lid);
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe(created.lid);
    // Events emitted: ENTRY_CREATED + EDIT_BEGUN
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('ENTRY_CREATED');
    expect(events[1]!.type).toBe('EDIT_BEGUN');
  });

  it('CREATE_ENTRY does not mutate original container', () => {
    const base = readyState();
    reduce(base, { type: 'CREATE_ENTRY', archetype: 'text', title: 'New' });
    expect(base.container!.entries).toHaveLength(3);
  });

  // ── ready: DELETE_ENTRY with mutation ────
  it('DELETE_ENTRY removes entry from container', () => {
    const { state, events } = reduce(readyState(), {
      type: 'DELETE_ENTRY', lid: 'e2',
    });
    expect(state.container!.entries).toHaveLength(2);
    expect(state.container!.entries.map((e) => e.lid)).toEqual(['e1', 'e3']);
    expect(events).toEqual([{ type: 'ENTRY_DELETED', lid: 'e2' }]);
  });

  it('DELETE_ENTRY selects next entry when selected entry is deleted', () => {
    const base = { ...readyState(), selectedLid: 'e2' };
    const { state } = reduce(base, { type: 'DELETE_ENTRY', lid: 'e2' });
    // e2 was index 1, after removal remaining: e1, e3, index 1 = e3
    expect(state.selectedLid).toBe('e3');
  });

  it('DELETE_ENTRY selects previous when last entry is deleted', () => {
    const base = { ...readyState(), selectedLid: 'e3' };
    const { state } = reduce(base, { type: 'DELETE_ENTRY', lid: 'e3' });
    expect(state.selectedLid).toBe('e2');
  });

  it('DELETE_ENTRY selects null when only entry is deleted', () => {
    const singleContainer: Container = {
      ...mockContainer,
      entries: [mockContainer.entries[0]!],
    };
    const base: AppState = { ...readyState(), container: singleContainer, selectedLid: 'e1' };
    const { state } = reduce(base, { type: 'DELETE_ENTRY', lid: 'e1' });
    expect(state.selectedLid).toBeNull();
    expect(state.container!.entries).toHaveLength(0);
  });

  it('DELETE_ENTRY keeps selection when non-selected entry is deleted', () => {
    const base = { ...readyState(), selectedLid: 'e1' };
    const { state } = reduce(base, { type: 'DELETE_ENTRY', lid: 'e3' });
    expect(state.selectedLid).toBe('e1');
  });

  it('DELETE_ENTRY creates a pre-delete revision snapshot', () => {
    const { state } = reduce(readyState(), { type: 'DELETE_ENTRY', lid: 'e1' });
    // Entry is removed
    expect(state.container!.entries.find((e) => e.lid === 'e1')).toBeUndefined();
    // But a revision preserves it
    expect(state.container!.revisions).toHaveLength(1);
    const rev = state.container!.revisions[0]!;
    expect(rev.entry_lid).toBe('e1');
    const snap = JSON.parse(rev.snapshot);
    expect(snap.lid).toBe('e1');
    expect(snap.title).toBe('Entry One');
  });

  // ── ready: other actions ─────────────────
  it('BEGIN_EDIT in ready → editing phase + editingLid set', () => {
    const { state, events } = reduce(readyState(), {
      type: 'BEGIN_EDIT', lid: 'e1',
    });
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe('e1');
    expect(events).toEqual([{ type: 'EDIT_BEGUN', lid: 'e1' }]);
  });

  it('BEGIN_EXPORT in ready → exporting phase with mode and mutability', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });
    expect(state.phase).toBe('exporting');
    expect(state.exportMode).toBe('full');
    expect(state.exportMutability).toBe('editable');
  });

  it('BEGIN_EXPORT light mode stores exportMode', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EXPORT', mode: 'light', mutability: 'editable' });
    expect(state.phase).toBe('exporting');
    expect(state.exportMode).toBe('light');
  });

  it('BEGIN_EXPORT readonly stores exportMutability', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EXPORT', mode: 'full', mutability: 'readonly' });
    expect(state.phase).toBe('exporting');
    expect(state.exportMutability).toBe('readonly');
  });

  it('BEGIN_EXPORT blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'BEGIN_EXPORT', mode: 'full', mutability: 'editable' });
    expect(state.phase).toBe('ready');
  });

  it('CREATE_RELATION adds to container', () => {
    const { state, events } = reduce(readyState(), {
      type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'structural',
    });
    expect(state.container!.relations).toHaveLength(1);
    expect(state.container!.relations[0]!.from).toBe('e1');
    expect(events[0]!.type).toBe('RELATION_CREATED');
  });

  it('DELETE_RELATION removes from container', () => {
    // First add a relation
    const { state: s1 } = reduce(readyState(), {
      type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'structural',
    });
    const relId = s1.container!.relations[0]!.id;

    const { state: s2, events } = reduce(s1, {
      type: 'DELETE_RELATION', id: relId,
    });
    expect(s2.container!.relations).toHaveLength(0);
    expect(events).toEqual([{ type: 'RELATION_DELETED', id: relId }]);
  });

  // ── editing: COMMIT_EDIT with mutation ───
  it('COMMIT_EDIT updates entry in container', () => {
    const base: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
      selectedLid: 'e1',
    };
    const { state, events } = reduce(base, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Updated', body: 'New body',
    });
    expect(state.phase).toBe('ready');
    expect(state.editingLid).toBeNull();

    // Entry updated
    const entry = state.container!.entries.find((e) => e.lid === 'e1')!;
    expect(entry.title).toBe('Updated');
    expect(entry.body).toBe('New body');

    // Revision created (snapshot of previous state)
    expect(state.container!.revisions).toHaveLength(1);
    const rev = state.container!.revisions[0]!;
    expect(rev.entry_lid).toBe('e1');
    const snap = JSON.parse(rev.snapshot);
    expect(snap.title).toBe('Entry One'); // old title

    // Events
    expect(events).toEqual([
      { type: 'EDIT_COMMITTED', lid: 'e1' },
      { type: 'ENTRY_UPDATED', lid: 'e1' },
    ]);
  });

  it('COMMIT_EDIT does not mutate original container', () => {
    const base: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
    };
    reduce(base, { type: 'COMMIT_EDIT', lid: 'e1', title: 'X', body: 'Y' });
    expect(base.container!.entries[0]!.title).toBe('Entry One');
    expect(base.container!.revisions).toHaveLength(0);
  });

  it('COMMIT_EDIT with assets merges into container.assets', () => {
    const base: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
    };
    const { state } = reduce(base, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'File', body: '{}',
      assets: { 'ast-001': 'base64data' },
    });
    expect(state.container!.assets['ast-001']).toBe('base64data');
  });

  it('COMMIT_EDIT without assets does not modify container.assets', () => {
    const base: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
    };
    const { state } = reduce(base, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Text', body: 'hello',
    });
    expect(Object.keys(state.container!.assets)).toHaveLength(0);
  });

  it('CANCEL_EDIT does not modify container', () => {
    const base: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
    };
    const { state } = reduce(base, { type: 'CANCEL_EDIT' });
    expect(state.phase).toBe('ready');
    expect(state.container).toBe(base.container); // same reference
  });

  it('blocks SELECT_ENTRY during editing (no state change, no events)', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1' };
    const { state, events } = reduce(base, { type: 'SELECT_ENTRY', lid: 'other' });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  // ── exporting ────────────────────────────
  it('SYS_FINISH_EXPORT in exporting → ready + EXPORT_COMPLETED + clears export state', () => {
    const base: AppState = { ...readyState(), phase: 'exporting', exportMode: 'light', exportMutability: 'readonly' };
    const { state, events } = reduce(base, { type: 'SYS_FINISH_EXPORT' });
    expect(state.phase).toBe('ready');
    expect(state.exportMode).toBeNull();
    expect(state.exportMutability).toBeNull();
    expect(events).toEqual([{ type: 'EXPORT_COMPLETED' }]);
  });

  // ── error ────────────────────────────────
  it('SYS_INIT_COMPLETE recovers from error', () => {
    const base: AppState = { ...createInitialState(), phase: 'error', error: 'old' };
    const { state, events } = reduce(base, {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.phase).toBe('ready');
    expect(state.error).toBeNull();
    expect(events[0]!.type).toBe('CONTAINER_LOADED');
  });

  // ── embedded flag ───────────────────────
  it('createInitialState has embedded=false', () => {
    const state = createInitialState();
    expect(state.embedded).toBe(false);
  });

  it('SYS_INIT_COMPLETE sets embedded=true when provided', () => {
    const { state } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer, embedded: true,
    });
    expect(state.embedded).toBe(true);
  });

  it('SYS_INIT_COMPLETE defaults embedded to false when omitted', () => {
    const { state } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.embedded).toBe(false);
  });

  it('embedded flag persists through phase transitions', () => {
    const { state: ready } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer, embedded: true,
    });
    expect(ready.embedded).toBe(true);

    const { state: editing } = reduce(ready, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.embedded).toBe(true);

    const { state: back } = reduce(editing, { type: 'CANCEL_EDIT' });
    expect(back.embedded).toBe(true);
  });

  it('SYS_INIT_COMPLETE in error preserves embedded flag', () => {
    const base: AppState = { ...createInitialState(), phase: 'error', error: 'fail', embedded: true };
    const { state } = reduce(base, {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.embedded).toBe(true);
  });

  // ── pending offers ──────────────────────
  it('createInitialState has empty pendingOffers', () => {
    expect(createInitialState().pendingOffers).toEqual([]);
  });

  it('SYS_RECORD_OFFERED adds to pendingOffers', () => {
    const offer = {
      offer_id: 'o1', title: 'Offered', body: 'Hello',
      archetype: 'text', source_container_id: null,
      reply_to_id: 'sender', received_at: '2026-01-01T00:00:00Z',
    };
    const { state, events } = reduce(readyState(), {
      type: 'SYS_RECORD_OFFERED', offer,
    });
    expect(state.pendingOffers).toHaveLength(1);
    expect(state.pendingOffers[0]!.offer_id).toBe('o1');
    expect(events).toEqual([{ type: 'RECORD_OFFERED', offer_id: 'o1', title: 'Offered' }]);
  });

  it('SYS_RECORD_OFFERED accumulates multiple offers', () => {
    const offer1 = {
      offer_id: 'o1', title: 'A', body: 'a',
      archetype: 'text', source_container_id: null,
      reply_to_id: null, received_at: '2026-01-01T00:00:00Z',
    };
    const offer2 = {
      offer_id: 'o2', title: 'B', body: 'b',
      archetype: 'text', source_container_id: null,
      reply_to_id: null, received_at: '2026-01-01T00:00:01Z',
    };
    const { state: s1 } = reduce(readyState(), { type: 'SYS_RECORD_OFFERED', offer: offer1 });
    const { state: s2 } = reduce(s1, { type: 'SYS_RECORD_OFFERED', offer: offer2 });
    expect(s2.pendingOffers).toHaveLength(2);
  });

  it('ACCEPT_OFFER adds entry and removes from pending', () => {
    const offer = {
      offer_id: 'o1', title: 'Offered Record', body: 'Offered body',
      archetype: 'text', source_container_id: 'remote',
      reply_to_id: 'sender', received_at: '2026-01-01T00:00:00Z',
    };
    const { state: withOffer } = reduce(readyState(), {
      type: 'SYS_RECORD_OFFERED', offer,
    });
    expect(withOffer.pendingOffers).toHaveLength(1);

    const { state, events } = reduce(withOffer, {
      type: 'ACCEPT_OFFER', offer_id: 'o1',
    });
    expect(state.pendingOffers).toHaveLength(0);
    expect(state.container!.entries).toHaveLength(4); // 3 original + 1 accepted
    const newEntry = state.container!.entries[3]!;
    expect(newEntry.title).toBe('Offered Record');
    expect(newEntry.body).toBe('Offered body');
    expect(state.selectedLid).toBe(newEntry.lid);
    expect(events).toContainEqual(expect.objectContaining({ type: 'OFFER_ACCEPTED', offer_id: 'o1' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'ENTRY_CREATED' }));
  });

  it('ACCEPT_OFFER for unknown offer_id is blocked', () => {
    const { state, events } = reduce(readyState(), {
      type: 'ACCEPT_OFFER', offer_id: 'nonexistent',
    });
    expect(state.container!.entries).toHaveLength(3); // unchanged
    expect(events).toHaveLength(0);
  });

  it('DISMISS_OFFER removes from pending without mutation', () => {
    const offer = {
      offer_id: 'o1', title: 'X', body: 'Y',
      archetype: 'text', source_container_id: null,
      reply_to_id: null, received_at: '2026-01-01T00:00:00Z',
    };
    const { state: withOffer } = reduce(readyState(), {
      type: 'SYS_RECORD_OFFERED', offer,
    });

    const { state, events } = reduce(withOffer, {
      type: 'DISMISS_OFFER', offer_id: 'o1',
    });
    expect(state.pendingOffers).toHaveLength(0);
    expect(state.container!.entries).toHaveLength(3); // unchanged
    expect(events).toEqual([{ type: 'OFFER_DISMISSED', offer_id: 'o1', reply_to_id: null }]);
  });

  it('DISMISS_OFFER includes reply_to_id in event', () => {
    const offer = {
      offer_id: 'o2', title: 'X', body: 'Y',
      archetype: 'text', source_container_id: null,
      reply_to_id: 'sender-abc', received_at: '2026-01-01T00:00:00Z',
    };
    const { state: withOffer } = reduce(readyState(), {
      type: 'SYS_RECORD_OFFERED', offer,
    });
    const { events } = reduce(withOffer, {
      type: 'DISMISS_OFFER', offer_id: 'o2',
    });
    expect(events).toEqual([{ type: 'OFFER_DISMISSED', offer_id: 'o2', reply_to_id: 'sender-abc' }]);
  });

  it('DISMISS_OFFER for unknown offer_id is silent no-op', () => {
    const { events } = reduce(readyState(), {
      type: 'DISMISS_OFFER', offer_id: 'nonexistent',
    });
    expect(events).toHaveLength(0);
  });

  it('pending offers persist through phase transitions', () => {
    const offer = {
      offer_id: 'o1', title: 'X', body: 'Y',
      archetype: 'text', source_container_id: null,
      reply_to_id: null, received_at: '2026-01-01T00:00:00Z',
    };
    const { state: withOffer } = reduce(readyState(), {
      type: 'SYS_RECORD_OFFERED', offer,
    });
    // Go to editing and back
    const { state: editing } = reduce(withOffer, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.pendingOffers).toHaveLength(1);
    const { state: back } = reduce(editing, { type: 'CANCEL_EDIT' });
    expect(back.pendingOffers).toHaveLength(1);
  });
});

// ── Import confirmation ────────────────────────

describe('import confirmation', () => {
  const importContainer: Container = {
    meta: {
      container_id: 'imported-id',
      title: 'Imported',
      created_at: '2026-02-01T00:00:00Z',
      updated_at: '2026-02-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'i1', title: 'Imported Entry', body: 'content',
        archetype: 'text', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  const preview = {
    title: 'Imported',
    container_id: 'imported-id',
    entry_count: 1,
    revision_count: 0,
    schema_version: 1,
    source: 'test.html',
    container: importContainer,
  };

  it('SYS_IMPORT_PREVIEW sets importPreview on state', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SYS_IMPORT_PREVIEW', preview,
    });
    expect(state.importPreview).toBe(preview);
    expect(state.phase).toBe('ready');
    expect(events).toEqual([{ type: 'IMPORT_PREVIEWED', source: 'test.html', entry_count: 1 }]);
  });

  it('CONFIRM_IMPORT replaces container and clears preview', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_IMPORT_PREVIEW', preview,
    }).state;

    const { state, events } = reduce(withPreview, { type: 'CONFIRM_IMPORT' });
    expect(state.container).toBe(importContainer);
    expect(state.importPreview).toBeNull();
    expect(state.selectedLid).toBeNull();
    expect(state.phase).toBe('ready');
    expect(events).toEqual([{ type: 'CONTAINER_IMPORTED', container_id: 'imported-id', source: 'test.html' }]);
  });

  it('CANCEL_IMPORT clears preview and keeps current container', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_IMPORT_PREVIEW', preview,
    }).state;

    const { state, events } = reduce(withPreview, { type: 'CANCEL_IMPORT' });
    expect(state.importPreview).toBeNull();
    expect(state.container).toBe(mockContainer); // unchanged
    expect(events).toEqual([{ type: 'IMPORT_CANCELLED' }]);
  });

  it('CONFIRM_IMPORT without preview is blocked', () => {
    const { state } = reduce(readyState(), { type: 'CONFIRM_IMPORT' });
    expect(state).toEqual(readyState()); // unchanged
  });

  it('CANCEL_IMPORT without preview is a no-op (clears null to null)', () => {
    const { state, events } = reduce(readyState(), { type: 'CANCEL_IMPORT' });
    expect(state.importPreview).toBeNull();
    expect(events).toEqual([{ type: 'IMPORT_CANCELLED' }]);
  });
});

// ── Batch import preview ────────────────────────

describe('batch import preview', () => {
  const batchPreview = {
    format: 'pkc2-texts-container-bundle',
    formatLabel: 'TEXT container bundle',
    textCount: 3,
    textlogCount: 0,
    totalEntries: 3,
    compacted: false,
    missingAssetCount: 0,
    isFolderExport: false,
    sourceFolderTitle: null,
    canRestoreFolderStructure: false,
    folderCount: 0,
    source: 'test.texts.zip',
    entries: [
      { index: 0, title: 'Note A', archetype: 'text' as const },
      { index: 1, title: 'Note B', archetype: 'text' as const },
      { index: 2, title: 'Note C', archetype: 'text' as const },
    ],
    selectedIndices: [0, 1, 2],
  };

  it('SYS_BATCH_IMPORT_PREVIEW sets batchImportPreview on state', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    });
    expect(state.batchImportPreview).toBe(batchPreview);
    expect(state.phase).toBe('ready');
    expect(events).toEqual([{
      type: 'BATCH_IMPORT_PREVIEWED',
      source: 'test.texts.zip',
      totalEntries: 3,
    }]);
  });

  it('CONFIRM_BATCH_IMPORT clears batchImportPreview', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    }).state;

    const { state, events } = reduce(withPreview, { type: 'CONFIRM_BATCH_IMPORT' });
    expect(state.batchImportPreview).toBeNull();
    expect(state.container).toBe(mockContainer); // unchanged
    expect(events).toEqual([{ type: 'BATCH_IMPORT_CONFIRMED' }]);
  });

  it('CANCEL_BATCH_IMPORT clears batchImportPreview and keeps state', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    }).state;

    const { state, events } = reduce(withPreview, { type: 'CANCEL_BATCH_IMPORT' });
    expect(state.batchImportPreview).toBeNull();
    expect(state.container).toBe(mockContainer); // unchanged
    expect(events).toEqual([{ type: 'BATCH_IMPORT_CANCELLED' }]);
  });

  it('CONFIRM_BATCH_IMPORT without preview is blocked', () => {
    const { state } = reduce(readyState(), { type: 'CONFIRM_BATCH_IMPORT' });
    expect(state).toEqual(readyState()); // unchanged
  });

  it('CANCEL_BATCH_IMPORT without preview is a no-op', () => {
    const { state, events } = reduce(readyState(), { type: 'CANCEL_BATCH_IMPORT' });
    expect(state.batchImportPreview).toBeNull();
    expect(events).toEqual([{ type: 'BATCH_IMPORT_CANCELLED' }]);
  });

  it('TOGGLE_BATCH_IMPORT_ENTRY flips index in selectedIndices', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    }).state;
    expect(withPreview.batchImportPreview!.selectedIndices).toEqual([0, 1, 2]);

    // Deselect index 1
    const { state } = reduce(withPreview, { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 1 });
    expect(state.batchImportPreview!.selectedIndices).toEqual([0, 2]);

    // Re-select index 1
    const { state: state2 } = reduce(state, { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 1 });
    expect(state2.batchImportPreview!.selectedIndices).toContain(1);
  });

  it('TOGGLE_BATCH_IMPORT_ENTRY without preview is blocked', () => {
    const { state } = reduce(readyState(), { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 0 });
    expect(state).toEqual(readyState());
  });

  it('TOGGLE_ALL_BATCH_IMPORT_ENTRIES toggles all on/off', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    }).state;
    // All selected → toggle all → none selected
    const { state: allOff } = reduce(withPreview, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    expect(allOff.batchImportPreview!.selectedIndices).toEqual([]);

    // None selected → toggle all → all selected
    const { state: allOn } = reduce(allOff, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    expect(allOn.batchImportPreview!.selectedIndices).toEqual([0, 1, 2]);
  });

  it('CONFIRM_BATCH_IMPORT is blocked when selectedIndices is empty', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: batchPreview,
    }).state;
    // Deselect all
    const allOff = reduce(withPreview, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' }).state;
    expect(allOff.batchImportPreview!.selectedIndices).toEqual([]);

    // Confirm should be blocked
    const { state, events } = reduce(allOff, { type: 'CONFIRM_BATCH_IMPORT' });
    expect(state.batchImportPreview).not.toBeNull(); // still set — not cleared
    expect(events).toEqual([]); // blocked = no events
  });
});

// ── TOGGLE reclassification (selection-aware) ─────────

describe('TOGGLE reclassification', () => {
  const folderPreview = {
    format: 'pkc2-folder-export-bundle',
    formatLabel: 'Folder export bundle',
    textCount: 2,
    textlogCount: 0,
    totalEntries: 2,
    compacted: false,
    missingAssetCount: 0,
    isFolderExport: true,
    sourceFolderTitle: 'Root',
    canRestoreFolderStructure: true,
    folderCount: 3,
    source: 'test.folder.zip',
    entries: [
      { index: 0, title: 'In A', archetype: 'text' as const },
      { index: 1, title: 'In B', archetype: 'text' as const },
    ],
    selectedIndices: [0, 1],
    folderMetadata: [
      { lid: 'root', title: 'Root', parentLid: null },
      { lid: 'a', title: 'A', parentLid: 'root' },
      { lid: 'b', title: 'B', parentLid: 'root' },
    ],
    entryFolderRefs: ['a', 'b'] as (string | undefined)[],
  };

  it('TOGGLE deselecting entry reduces folder count', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: folderPreview,
    }).state;
    expect(withPreview.batchImportPreview!.folderCount).toBe(3); // root + a + b

    // Deselect entry 1 (folder B) → only root + a = 2
    const { state } = reduce(withPreview, { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 1 });
    expect(state.batchImportPreview!.selectedIndices).toEqual([0]);
    expect(state.batchImportPreview!.canRestoreFolderStructure).toBe(true);
    expect(state.batchImportPreview!.folderCount).toBe(2);
  });

  it('TOGGLE deselecting all entries → flat (canRestore false)', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: folderPreview,
    }).state;

    const { state: allOff } = reduce(withPreview, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    expect(allOff.batchImportPreview!.selectedIndices).toEqual([]);
    expect(allOff.batchImportPreview!.canRestoreFolderStructure).toBe(false);
    expect(allOff.batchImportPreview!.folderCount).toBe(0);
  });

  it('TOGGLE reselecting all entries → restores original classification', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: folderPreview,
    }).state;

    // Deselect all, then reselect all
    const allOff = reduce(withPreview, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' }).state;
    const { state: allOn } = reduce(allOff, { type: 'TOGGLE_ALL_BATCH_IMPORT_ENTRIES' });
    expect(allOn.batchImportPreview!.canRestoreFolderStructure).toBe(true);
    expect(allOn.batchImportPreview!.folderCount).toBe(3);
  });

  it('malformed warning appears when offending entry is selected', () => {
    const malformedPreview = {
      ...folderPreview,
      entryFolderRefs: ['a', 'nonexistent'] as (string | undefined)[],
      // Initial state computed with all selected → malformed
      canRestoreFolderStructure: false,
      folderCount: 0,
      malformedFolderMetadata: true,
      folderGraphWarning: 'Entry references unknown folder: "nonexistent"',
    };
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: malformedPreview,
    }).state;
    expect(withPreview.batchImportPreview!.malformedFolderMetadata).toBe(true);
  });

  it('malformed warning disappears when offending entry is deselected', () => {
    const malformedPreview = {
      ...folderPreview,
      entryFolderRefs: ['a', 'nonexistent'] as (string | undefined)[],
      canRestoreFolderStructure: false,
      folderCount: 0,
      malformedFolderMetadata: true,
      folderGraphWarning: 'Entry references unknown folder: "nonexistent"',
    };
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: malformedPreview,
    }).state;

    // Deselect entry 1 (the offending one) → only valid entry 0 remains
    const { state } = reduce(withPreview, { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 1 });
    expect(state.batchImportPreview!.canRestoreFolderStructure).toBe(true);
    expect(state.batchImportPreview!.malformedFolderMetadata).toBeUndefined();
    expect(state.batchImportPreview!.folderGraphWarning).toBeUndefined();
    expect(state.batchImportPreview!.folderCount).toBe(2); // root + a
  });

  it('preview without folderMetadata keeps simple selectedIndices update', () => {
    // batchPreview without folderMetadata (the original flat preview)
    const flatPreview = {
      format: 'pkc2-texts-container-bundle',
      formatLabel: 'TEXT container bundle',
      textCount: 2,
      textlogCount: 0,
      totalEntries: 2,
      compacted: false,
      missingAssetCount: 0,
      isFolderExport: false,
      sourceFolderTitle: null,
      canRestoreFolderStructure: false,
      folderCount: 0,
      source: 'test.zip',
      entries: [
        { index: 0, title: 'A', archetype: 'text' as const },
        { index: 1, title: 'B', archetype: 'text' as const },
      ],
      selectedIndices: [0, 1],
      // No folderMetadata, no entryFolderRefs
    };
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: flatPreview,
    }).state;

    const { state } = reduce(withPreview, { type: 'TOGGLE_BATCH_IMPORT_ENTRY', index: 0 });
    expect(state.batchImportPreview!.selectedIndices).toEqual([1]);
    // Classification stays flat — no reclassification triggered
    expect(state.batchImportPreview!.canRestoreFolderStructure).toBe(false);
    expect(state.batchImportPreview!.folderCount).toBe(0);
  });
});

// ── SET_BATCH_IMPORT_TARGET_FOLDER ────────────

describe('SET_BATCH_IMPORT_TARGET_FOLDER', () => {
  const previewWithTarget = {
    format: 'pkc2-texts-container-bundle',
    formatLabel: 'TEXT container bundle',
    textCount: 1,
    textlogCount: 0,
    totalEntries: 1,
    compacted: false,
    missingAssetCount: 0,
    isFolderExport: false,
    sourceFolderTitle: null,
    canRestoreFolderStructure: false,
    folderCount: 0,
    source: 'test.zip',
    entries: [{ index: 0, title: 'Note', archetype: 'text' as const }],
    selectedIndices: [0],
  };

  it('sets targetFolderLid on preview', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: previewWithTarget,
    }).state;
    const { state } = reduce(withPreview, { type: 'SET_BATCH_IMPORT_TARGET_FOLDER', lid: 'folder-1' });
    expect(state.batchImportPreview!.targetFolderLid).toBe('folder-1');
  });

  it('can set targetFolderLid to null (root)', () => {
    const withPreview = reduce(readyState(), {
      type: 'SYS_BATCH_IMPORT_PREVIEW', preview: previewWithTarget,
    }).state;
    const { state: s1 } = reduce(withPreview, { type: 'SET_BATCH_IMPORT_TARGET_FOLDER', lid: 'folder-1' });
    const { state: s2 } = reduce(s1, { type: 'SET_BATCH_IMPORT_TARGET_FOLDER', lid: null });
    expect(s2.batchImportPreview!.targetFolderLid).toBeNull();
  });

  it('is blocked without preview', () => {
    const { state } = reduce(readyState(), { type: 'SET_BATCH_IMPORT_TARGET_FOLDER', lid: 'f1' });
    expect(state).toEqual(readyState());
  });
});

// ── SYS_APPLY_BATCH_IMPORT with target folder ────────

describe('SYS_APPLY_BATCH_IMPORT with target folder', () => {
  function readyWithFolder(): AppState {
    const container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'target-folder', title: 'Target', body: '',
          archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    return { ...createInitialState(), phase: 'ready', container };
  }

  it('flat import into target folder creates structural relations', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body-a', assets: {}, attachments: [] },
        { archetype: 'text' as const, title: 'B', body: 'body-b', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'target-folder',
    };
    const { state, events } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    // 2 entries created + 2 structural relations (one per entry → target folder)
    const relEvents = events.filter((e) => e.type === 'RELATION_CREATED');
    expect(relEvents).toHaveLength(2);
    // Both relations point from target-folder to new entries
    for (const ev of relEvents) {
      if (ev.type === 'RELATION_CREATED') {
        expect(ev.from).toBe('target-folder');
        expect(ev.kind).toBe('structural');
      }
    }
    // Structural relations exist in container
    const targetRels = state.container!.relations.filter((r) => r.from === 'target-folder');
    expect(targetRels).toHaveLength(2);
  });

  it('restore import into target folder attaches top-level folders to target', () => {
    const plan = {
      folders: [
        { originalLid: 'imp-root', title: 'Imported Root', parentOriginalLid: null },
        { originalLid: 'imp-child', title: 'Child', parentOriginalLid: 'imp-root' },
      ],
      entries: [
        { archetype: 'text' as const, title: 'Note', body: 'body', parentFolderOriginalLid: 'imp-child', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-folder-export-bundle',
      restoreStructure: true,
      targetFolderLid: 'target-folder',
    };
    const { state, events } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const relEvents = events.filter((e) => e.type === 'RELATION_CREATED');
    // Relations: target→imp-root, imp-root→imp-child, imp-child→note = 3
    expect(relEvents).toHaveLength(3);
    // First relation: target-folder → imported root folder
    const targetRels = state.container!.relations.filter((r) => r.from === 'target-folder');
    expect(targetRels).toHaveLength(1); // only top-level folder
    // Internal: imp-root → imp-child
    const internalRels = state.container!.relations.filter(
      (r) => r.from !== 'target-folder' && r.kind === 'structural',
    );
    expect(internalRels).toHaveLength(2); // imp-root→imp-child, imp-child→note
  });

  it('target folder LID not found → silently imports at root (no target relations)', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'nonexistent-folder',
    };
    const { state, events } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const relEvents = events.filter((e) => e.type === 'RELATION_CREATED');
    expect(relEvents).toHaveLength(0);
    // Entry still created
    const entryEvents = events.filter((e) => e.type === 'ENTRY_CREATED');
    expect(entryEvents).toHaveLength(1);
    expect(state.container!.relations).toHaveLength(0);
  });

  it('null targetFolderLid → root import (no target relations)', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: null,
    };
    const { state, events } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const relEvents = events.filter((e) => e.type === 'RELATION_CREATED');
    expect(relEvents).toHaveLength(0);
    expect(state.container!.relations).toHaveLength(0);
  });

  it('restore import with unparented content entry → attached to target', () => {
    const plan = {
      folders: [
        { originalLid: 'imp-root', title: 'Root', parentOriginalLid: null },
      ],
      entries: [
        { archetype: 'text' as const, title: 'Parented', body: 'b', parentFolderOriginalLid: 'imp-root', assets: {}, attachments: [] },
        { archetype: 'text' as const, title: 'Unparented', body: 'b', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-folder-export-bundle',
      restoreStructure: true,
      targetFolderLid: 'target-folder',
    };
    const { state } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    // target-folder → imp-root (top-level folder)
    // target-folder → unparented entry
    // imp-root → parented entry
    const targetRels = state.container!.relations.filter((r) => r.from === 'target-folder');
    expect(targetRels).toHaveLength(2);
  });

  it('target LID pointing to non-folder entry → silently imports at root', () => {
    // e1 is a 'text' entry, not a folder
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'e1', // exists but is text, not folder
    };
    const { state, events } = reduce(readyWithFolder(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const relEvents = events.filter((e) => e.type === 'RELATION_CREATED');
    expect(relEvents).toHaveLength(0);
    expect(state.container!.relations).toHaveLength(0);
  });
});

// ── Restore ────────────────────────

describe('restore', () => {
  it('RESTORE_ENTRY restores existing entry from revision', () => {
    // Create a revision by editing
    const { state: editing } = reduce(readyState(), { type: 'BEGIN_EDIT', lid: 'e1' });
    const { state: edited } = reduce(editing, {
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Changed', body: 'New body',
    });

    // Verify revision exists
    expect(edited.container!.revisions).toHaveLength(1);
    const revId = edited.container!.revisions[0]!.id;

    // Restore from the revision
    const { state, events } = reduce(edited, {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: revId,
    });

    const entry = state.container!.entries.find((e) => e.lid === 'e1');
    expect(entry!.title).toBe('Entry One'); // original title
    expect(entry!.body).toBe('Body one'); // original body
    expect(state.selectedLid).toBe('e1');
    expect(events).toEqual([{ type: 'ENTRY_RESTORED', lid: 'e1', revision_id: revId }]);

    // Should have 2 revisions: pre-edit + pre-restore
    expect(state.container!.revisions).toHaveLength(2);
  });

  it('RESTORE_ENTRY restores deleted entry', () => {
    // Delete e1 (creates pre-delete revision)
    const { state: deleted } = reduce(readyState(), { type: 'DELETE_ENTRY', lid: 'e1' });
    expect(deleted.container!.entries).toHaveLength(2);
    expect(deleted.container!.revisions).toHaveLength(1);
    const revId = deleted.container!.revisions[0]!.id;

    // Restore from the revision
    const { state, events } = reduce(deleted, {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: revId,
    });

    expect(state.container!.entries).toHaveLength(3);
    const entry = state.container!.entries.find((e) => e.lid === 'e1');
    expect(entry).toBeDefined();
    expect(entry!.title).toBe('Entry One');
    expect(state.selectedLid).toBe('e1');
    expect(events).toEqual([{ type: 'ENTRY_RESTORED', lid: 'e1', revision_id: revId }]);
  });

  it('RESTORE_ENTRY is blocked when no container', () => {
    const init = createInitialState();
    const ready: AppState = { ...init, phase: 'ready' };
    const { state } = reduce(ready, {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: 'nonexistent',
    });
    expect(state).toBe(ready);
  });

  it('RESTORE_ENTRY is blocked for invalid revision', () => {
    const { state } = reduce(readyState(), {
      type: 'RESTORE_ENTRY', lid: 'e1', revision_id: 'nonexistent',
    });
    expect(state).toEqual(readyState());
  });
});

// ── Search query ────────────────────────

describe('search query', () => {
  it('createInitialState has empty searchQuery', () => {
    expect(createInitialState().searchQuery).toBe('');
  });

  it('SET_SEARCH_QUERY updates searchQuery in ready phase', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SET_SEARCH_QUERY', query: 'hello',
    });
    expect(state.searchQuery).toBe('hello');
    expect(events).toHaveLength(0); // no events emitted
  });

  it('SET_SEARCH_QUERY can clear query', () => {
    const base = { ...readyState(), searchQuery: 'old' };
    const { state } = reduce(base, { type: 'SET_SEARCH_QUERY', query: '' });
    expect(state.searchQuery).toBe('');
  });

  it('SET_SEARCH_QUERY is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1' };
    const { state, events } = reduce(base, { type: 'SET_SEARCH_QUERY', query: 'x' });
    expect(state).toBe(base); // unchanged
    expect(events).toHaveLength(0);
  });

  it('searchQuery persists through phase transitions', () => {
    const withQuery = { ...readyState(), searchQuery: 'test' };
    const { state: editing } = reduce(withQuery, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.searchQuery).toBe('test');
    const { state: back } = reduce(editing, { type: 'CANCEL_EDIT' });
    expect(back.searchQuery).toBe('test');
  });
});

// ── Archetype filter ────────────────────────

describe('archetype filter', () => {
  it('createInitialState has null archetypeFilter', () => {
    expect(createInitialState().archetypeFilter).toBeNull();
  });

  it('SET_ARCHETYPE_FILTER sets archetype in ready phase', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SET_ARCHETYPE_FILTER', archetype: 'todo',
    });
    expect(state.archetypeFilter).toBe('todo');
    expect(events).toHaveLength(0);
  });

  it('SET_ARCHETYPE_FILTER can clear to null', () => {
    const base = { ...readyState(), archetypeFilter: 'text' as const };
    const { state } = reduce(base, { type: 'SET_ARCHETYPE_FILTER', archetype: null });
    expect(state.archetypeFilter).toBeNull();
  });

  it('SET_ARCHETYPE_FILTER is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1' };
    const { state, events } = reduce(base, { type: 'SET_ARCHETYPE_FILTER', archetype: 'todo' });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('SET_ARCHETYPE_FILTER is blocked during initializing', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SET_ARCHETYPE_FILTER', archetype: 'todo',
    });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  it('SET_ARCHETYPE_FILTER is blocked during exporting', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, { type: 'SET_ARCHETYPE_FILTER', archetype: 'todo' });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('archetypeFilter persists through phase transitions', () => {
    const withFilter = { ...readyState(), archetypeFilter: 'todo' as const };
    const { state: editing } = reduce(withFilter, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.archetypeFilter).toBe('todo');
    const { state: back } = reduce(editing, { type: 'CANCEL_EDIT' });
    expect(back.archetypeFilter).toBe('todo');
  });
});

// ── Clear filters ────────────────────────

describe('clear filters', () => {
  it('CLEAR_FILTERS resets both searchQuery and archetypeFilter', () => {
    const base = { ...readyState(), searchQuery: 'hello', archetypeFilter: 'todo' as const };
    const { state, events } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state.searchQuery).toBe('');
    expect(state.archetypeFilter).toBeNull();
    expect(events).toHaveLength(0);
  });

  it('CLEAR_FILTERS is a no-op when already clear', () => {
    const { state } = reduce(readyState(), { type: 'CLEAR_FILTERS' });
    expect(state.searchQuery).toBe('');
    expect(state.archetypeFilter).toBeNull();
  });

  it('CLEAR_FILTERS is blocked during initializing', () => {
    const { state, events } = reduce(createInitialState(), { type: 'CLEAR_FILTERS' });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  it('CLEAR_FILTERS is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1', searchQuery: 'x' };
    const { state, events } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state).toBe(base);
    expect(state.searchQuery).toBe('x');
    expect(events).toHaveLength(0);
  });

  it('CLEAR_FILTERS is blocked during exporting', () => {
    const base: AppState = { ...readyState(), phase: 'exporting', searchQuery: 'x' };
    const { state, events } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('CLEAR_FILTERS does not reset sort state', () => {
    const base = {
      ...readyState(),
      searchQuery: 'hello', archetypeFilter: 'todo' as const,
      sortKey: 'title' as const, sortDirection: 'asc' as const,
    };
    const { state } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state.searchQuery).toBe('');
    expect(state.archetypeFilter).toBeNull();
    expect(state.sortKey).toBe('title');
    expect(state.sortDirection).toBe('asc');
  });
});

// ── Calendar ────────────────────────

describe('calendar', () => {
  it('createInitialState has detail viewMode and current date', () => {
    const state = createInitialState();
    expect(state.viewMode).toBe('detail');
    expect(state.calendarYear).toBe(new Date().getFullYear());
    expect(state.calendarMonth).toBe(new Date().getMonth() + 1);
  });

  it('SET_VIEW_MODE changes viewMode in ready phase', () => {
    const { state } = reduce(readyState(), { type: 'SET_VIEW_MODE', mode: 'calendar' });
    expect(state.viewMode).toBe('calendar');
  });

  it('SET_VIEW_MODE toggles back to detail', () => {
    const base = { ...readyState(), viewMode: 'calendar' as const };
    const { state } = reduce(base, { type: 'SET_VIEW_MODE', mode: 'detail' });
    expect(state.viewMode).toBe('detail');
  });

  it('SET_CALENDAR_MONTH updates year and month', () => {
    const { state } = reduce(readyState(), { type: 'SET_CALENDAR_MONTH', year: 2026, month: 12 });
    expect(state.calendarYear).toBe(2026);
    expect(state.calendarMonth).toBe(12);
  });

  it('SET_CALENDAR_MONTH allows navigating to previous year', () => {
    const { state } = reduce(readyState(), { type: 'SET_CALENDAR_MONTH', year: 2025, month: 1 });
    expect(state.calendarYear).toBe(2025);
    expect(state.calendarMonth).toBe(1);
  });
});

// ── Show Archived ────────────────────────

describe('show archived', () => {
  it('createInitialState has showArchived false', () => {
    const state = createInitialState();
    expect(state.showArchived).toBe(false);
  });

  it('TOGGLE_SHOW_ARCHIVED flips showArchived in ready phase', () => {
    const { state } = reduce(readyState(), { type: 'TOGGLE_SHOW_ARCHIVED' });
    expect(state.showArchived).toBe(true);
  });

  it('TOGGLE_SHOW_ARCHIVED toggles back to false', () => {
    const base = { ...readyState(), showArchived: true };
    const { state } = reduce(base, { type: 'TOGGLE_SHOW_ARCHIVED' });
    expect(state.showArchived).toBe(false);
  });
});

// ── Sort ────────────────────────

describe('sort', () => {
  it('createInitialState has default sort (title asc)', () => {
    const state = createInitialState();
    expect(state.sortKey).toBe('title');
    expect(state.sortDirection).toBe('asc');
  });

  it('SET_SORT updates sort key and direction in ready phase', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SET_SORT', key: 'title', direction: 'asc',
    });
    expect(state.sortKey).toBe('title');
    expect(state.sortDirection).toBe('asc');
    expect(events).toHaveLength(0);
  });

  it('SET_SORT can change direction only', () => {
    const { state } = reduce(readyState(), {
      type: 'SET_SORT', key: 'created_at', direction: 'asc',
    });
    expect(state.sortKey).toBe('created_at');
    expect(state.sortDirection).toBe('asc');
  });

  it('SET_SORT is blocked during initializing', () => {
    const { state, events } = reduce(createInitialState(), {
      type: 'SET_SORT', key: 'title', direction: 'asc',
    });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  it('SET_SORT is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1' };
    const { state, events } = reduce(base, {
      type: 'SET_SORT', key: 'title', direction: 'asc',
    });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('SET_SORT is blocked during exporting', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, {
      type: 'SET_SORT', key: 'title', direction: 'asc',
    });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('sort state persists through phase transitions', () => {
    const withSort = { ...readyState(), sortKey: 'title' as const, sortDirection: 'asc' as const };
    const { state: editing } = reduce(withSort, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(editing.sortKey).toBe('title');
    expect(editing.sortDirection).toBe('asc');
    const { state: back } = reduce(editing, { type: 'CANCEL_EDIT' });
    expect(back.sortKey).toBe('title');
    expect(back.sortDirection).toBe('asc');
  });

  // ── CREATE_RELATION phase blocks ──

  it('CREATE_RELATION is blocked during initializing', () => {
    const base: AppState = { ...readyState(), phase: 'initializing' };
    const { state, events } = reduce(base, {
      type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic',
    });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  it('CREATE_RELATION is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1', selectedLid: 'e1' };
    const { state, events } = reduce(base, {
      type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic',
    });
    expect(state.container!.relations).toHaveLength(0);
    expect(events).toHaveLength(0);
  });

  it('CREATE_RELATION is blocked during exporting', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, {
      type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic',
    });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  // ── SET_TAG_FILTER ──

  it('SET_TAG_FILTER sets tagFilter in ready phase', () => {
    const { state, events } = reduce(readyState(), {
      type: 'SET_TAG_FILTER', tagLid: 'e2',
    });
    expect(state.tagFilter).toBe('e2');
    expect(events).toHaveLength(0);
  });

  it('SET_TAG_FILTER with null clears tag filter', () => {
    const base = { ...readyState(), tagFilter: 'e2' };
    const { state } = reduce(base, { type: 'SET_TAG_FILTER', tagLid: null });
    expect(state.tagFilter).toBeNull();
  });

  it('SET_TAG_FILTER is blocked during initializing', () => {
    const base: AppState = { ...readyState(), phase: 'initializing' };
    const { state, events } = reduce(base, { type: 'SET_TAG_FILTER', tagLid: 'e1' });
    expect(state.phase).toBe('initializing');
    expect(events).toHaveLength(0);
  });

  it('SET_TAG_FILTER is blocked during editing', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1', selectedLid: 'e1' };
    const { state, events } = reduce(base, { type: 'SET_TAG_FILTER', tagLid: 'e2' });
    expect(state.tagFilter).toBeNull();
    expect(events).toHaveLength(0);
  });

  it('SET_TAG_FILTER is blocked during exporting', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, { type: 'SET_TAG_FILTER', tagLid: 'e1' });
    expect(state).toBe(base);
    expect(events).toHaveLength(0);
  });

  it('CLEAR_FILTERS also clears tagFilter', () => {
    const base = { ...readyState(), searchQuery: 'test', archetypeFilter: 'text' as const, tagFilter: 'e2' };
    const { state } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state.searchQuery).toBe('');
    expect(state.archetypeFilter).toBeNull();
    expect(state.tagFilter).toBeNull();
  });

  it('CLEAR_FILTERS preserves sort when clearing tag filter', () => {
    const base = { ...readyState(), tagFilter: 'e2', sortKey: 'title' as const, sortDirection: 'asc' as const };
    const { state } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state.tagFilter).toBeNull();
    expect(state.sortKey).toBe('title');
    expect(state.sortDirection).toBe('asc');
  });

  it('default tagFilter is null', () => {
    const state = readyState();
    expect(state.tagFilter).toBeNull();
  });

  // ── QUICK_UPDATE_ENTRY ─────────────────────────
  // Contract: body-only update in ready phase, title preserved, snapshot created.
  // Intended for small immediate operations (e.g., todo status toggle).
  // NOT for title changes, archetype changes, or bulk updates.

  it('QUICK_UPDATE_ENTRY updates body without phase change', () => {
    const base = readyState();
    const { state, events } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'new body',
    });
    expect(state.phase).toBe('ready');
    const entry = state.container!.entries.find((e) => e.lid === 'e1');
    expect(entry!.body).toBe('new body');
    expect(entry!.title).toBe('Entry One');
    expect(events).toContainEqual({ type: 'ENTRY_UPDATED', lid: 'e1' });
  });

  it('QUICK_UPDATE_ENTRY preserves title exactly (contract)', () => {
    const base = readyState();
    const originalTitle = base.container!.entries.find((e) => e.lid === 'e1')!.title;
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'different body',
    });
    const entry = state.container!.entries.find((e) => e.lid === 'e1')!;
    expect(entry.title).toBe(originalTitle);
    expect(entry.body).toBe('different body');
  });

  it('QUICK_UPDATE_ENTRY updates updated_at timestamp', () => {
    const base = readyState();
    const originalUpdatedAt = base.container!.entries.find((e) => e.lid === 'e1')!.updated_at;
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'updated',
    });
    const entry = state.container!.entries.find((e) => e.lid === 'e1')!;
    expect(entry.updated_at).not.toBe(originalUpdatedAt);
  });

  it('QUICK_UPDATE_ENTRY creates a revision snapshot', () => {
    const base = readyState();
    expect(base.container!.revisions).toHaveLength(0);
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'updated',
    });
    expect(state.container!.revisions.length).toBeGreaterThan(0);
  });

  it('QUICK_UPDATE_ENTRY does not change selectedLid', () => {
    const base: AppState = { ...readyState(), selectedLid: 'e2' };
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x',
    });
    expect(state.selectedLid).toBe('e2');
  });

  it('QUICK_UPDATE_ENTRY blocks for unknown lid', () => {
    const base = readyState();
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'nonexistent', body: 'x',
    });
    expect(state).toBe(base);
  });

  it('QUICK_UPDATE_ENTRY blocked in editing phase', () => {
    const base: AppState = { ...readyState(), phase: 'editing', editingLid: 'e1' };
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x',
    });
    expect(state).toBe(base);
  });

  it('QUICK_UPDATE_ENTRY blocked in exporting phase', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x',
    });
    expect(state).toBe(base);
  });

  it('QUICK_UPDATE_ENTRY blocked in initializing phase', () => {
    const base = createInitialState();
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x',
    });
    expect(state).toBe(base);
  });

  it('QUICK_UPDATE_ENTRY blocked when container is null', () => {
    const base: AppState = { ...readyState(), container: null };
    const { state } = reduce(base, {
      type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'x',
    });
    expect(state).toBe(base);
  });

  // ── readonly mode ──────────────────────
  it('SYS_INIT_COMPLETE sets readonly flag', () => {
    const { state } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer, readonly: true,
    });
    expect(state.readonly).toBe(true);
  });

  it('SYS_INIT_COMPLETE defaults readonly to false', () => {
    const { state } = reduce(createInitialState(), {
      type: 'SYS_INIT_COMPLETE', container: mockContainer,
    });
    expect(state.readonly).toBe(false);
  });

  it('BEGIN_EDIT blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.phase).toBe('ready');
    expect(state.editingLid).toBeNull();
  });

  it('CREATE_ENTRY blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'CREATE_ENTRY', archetype: 'text', title: 'T' });
    expect(state.container!.entries).toHaveLength(3);
  });

  it('DELETE_ENTRY blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'DELETE_ENTRY', lid: 'e1' });
    expect(state.container!.entries).toHaveLength(3);
  });

  it('QUICK_UPDATE_ENTRY blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'QUICK_UPDATE_ENTRY', lid: 'e1', body: 'new' });
    expect(state.container!.entries[0]!.body).toBe('Body one');
  });

  it('CREATE_RELATION blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'structural' });
    expect(state.container!.relations).toHaveLength(0);
  });

  it('DELETE_RELATION blocked in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'DELETE_RELATION', id: 'r1' });
    expect(state).toBe(ro);
  });

  it('SELECT_ENTRY allowed in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'SELECT_ENTRY', lid: 'e1' });
    expect(state.selectedLid).toBe('e1');
  });

  it('SET_SEARCH_QUERY allowed in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'SET_SEARCH_QUERY', query: 'test' });
    expect(state.searchQuery).toBe('test');
  });

  it('SET_SORT allowed in readonly mode', () => {
    const ro = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'SET_SORT', key: 'title', direction: 'asc' });
    expect(state.sortKey).toBe('title');
  });

  // ── rehydrate ──────────────────────────
  it('REHYDRATE in readonly mode → creates new cid and clears readonly', () => {
    const ro: AppState = { ...readyState(), readonly: true };
    const { state, events } = reduce(ro, { type: 'REHYDRATE' });
    expect(state.readonly).toBe(false);
    expect(state.container!.meta.container_id).not.toBe('test-id');
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_REHYDRATED');
  });

  it('REHYDRATE blocked when not readonly', () => {
    const base = readyState();
    const { state } = reduce(base, { type: 'REHYDRATE' });
    expect(state).toBe(base);
  });

  it('REHYDRATE preserves entries and relations', () => {
    const ro: AppState = { ...readyState(), readonly: true };
    const { state } = reduce(ro, { type: 'REHYDRATE' });
    expect(state.container!.entries).toHaveLength(3);
    expect(state.container!.meta.title).toBe('Test');
  });

  // ── editing forces viewMode to detail ──
  it('BEGIN_EDIT switches viewMode to detail when in calendar', () => {
    const cal: AppState = { ...readyState(), viewMode: 'calendar' };
    const { state } = reduce(cal, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.phase).toBe('editing');
    expect(state.viewMode).toBe('detail');
  });

  it('BEGIN_EDIT switches viewMode to detail when in kanban', () => {
    const kanban: AppState = { ...readyState(), viewMode: 'kanban' };
    const { state } = reduce(kanban, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.phase).toBe('editing');
    expect(state.viewMode).toBe('detail');
  });

  it('CREATE_ENTRY switches viewMode to detail when in calendar', () => {
    const cal: AppState = { ...readyState(), viewMode: 'calendar' };
    const { state } = reduce(cal, { type: 'CREATE_ENTRY', archetype: 'text', title: 'New' });
    expect(state.phase).toBe('editing');
    expect(state.viewMode).toBe('detail');
  });

  it('CREATE_ENTRY switches viewMode to detail when in kanban', () => {
    const kanban: AppState = { ...readyState(), viewMode: 'kanban' };
    const { state } = reduce(kanban, { type: 'CREATE_ENTRY', archetype: 'folder', title: 'F' });
    expect(state.phase).toBe('editing');
    expect(state.viewMode).toBe('detail');
  });

  it('BEGIN_EDIT keeps viewMode detail if already detail', () => {
    const detail: AppState = { ...readyState(), viewMode: 'detail' };
    const { state } = reduce(detail, { type: 'BEGIN_EDIT', lid: 'e1' });
    expect(state.viewMode).toBe('detail');
  });

  // ── SELECT_ENTRY auto-expand ancestors ───────────────
  //
  // When an entry is selected from outside the tree (Storage Profile
  // jump, entry-ref click, calendar / kanban tap), its ancestor
  // folders may still be collapsed — the selected entry would be
  // invisible in the sidebar.  SELECT_ENTRY therefore removes any
  // ancestor folder lids from `collapsedFolders` so the selection is
  // always rendered.

  function containerWithFolderTree(): Container {
    // root(folder) → mid(folder) → leaf(text)
    return {
      meta: {
        container_id: 'tree', title: 'Tree',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [
        {
          lid: 'root', title: 'Root', body: '',
          archetype: 'folder',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
        {
          lid: 'mid', title: 'Mid', body: '',
          archetype: 'folder',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
        {
          lid: 'leaf', title: 'Leaf', body: '',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [
        {
          id: 'r1', kind: 'structural', from: 'root', to: 'mid',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'r2', kind: 'structural', from: 'mid', to: 'leaf',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      revisions: [],
      assets: {},
    };
  }

  it('SELECT_ENTRY expands ancestor folders that were collapsed', () => {
    const container = containerWithFolderTree();
    const before: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container,
      collapsedFolders: ['root', 'mid'],
    };
    const { state } = reduce(before, { type: 'SELECT_ENTRY', lid: 'leaf' });
    expect(state.selectedLid).toBe('leaf');
    // Both ancestor folders are now expanded so `leaf` is visible.
    expect(state.collapsedFolders).toEqual([]);
  });

  it('SELECT_ENTRY preserves unrelated collapsed folders', () => {
    // Two disjoint subtrees share `collapsedFolders`; selecting in
    // one must not reset the user's explicit collapse of the other.
    const container: Container = {
      ...containerWithFolderTree(),
      entries: [
        ...containerWithFolderTree().entries,
        {
          lid: 'other', title: 'Other', body: '',
          archetype: 'folder',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const before: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container,
      collapsedFolders: ['root', 'mid', 'other'],
    };
    const { state } = reduce(before, { type: 'SELECT_ENTRY', lid: 'leaf' });
    expect(state.collapsedFolders).toEqual(['other']);
  });

  it('SELECT_ENTRY is a no-op on collapsedFolders when no ancestor was collapsed', () => {
    const container = containerWithFolderTree();
    const before: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container,
      collapsedFolders: ['unrelated'],
    };
    const { state } = reduce(before, { type: 'SELECT_ENTRY', lid: 'leaf' });
    // Reference-equal when nothing matched — downstream listeners
    // can use `===` to skip work.
    expect(state.collapsedFolders).toBe(before.collapsedFolders);
  });

  it('SELECT_ENTRY with no container does not attempt tree walking', () => {
    const before: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container: null,
      collapsedFolders: ['root'],
    };
    const { state } = reduce(before, { type: 'SELECT_ENTRY', lid: 'leaf' });
    // container is null so the walk is skipped entirely.
    expect(state.collapsedFolders).toBe(before.collapsedFolders);
    expect(state.selectedLid).toBe('leaf');
  });

  it('SELECT_ENTRY on a root entry leaves collapsedFolders untouched', () => {
    const container = containerWithFolderTree();
    const before: AppState = {
      ...createInitialState(),
      phase: 'ready',
      container,
      collapsedFolders: ['root', 'mid'],
    };
    // `root` itself has no parent so no ancestor expansion happens.
    const { state } = reduce(before, { type: 'SELECT_ENTRY', lid: 'root' });
    expect(state.collapsedFolders).toBe(before.collapsedFolders);
  });

  // ── Multi-select ──────────────────────────

  it('SELECT_ENTRY clears multiSelectedLids', () => {
    const ms: AppState = { ...readyState(), selectedLid: 'e1', multiSelectedLids: ['e1', 'e2'] };
    const { state } = reduce(ms, { type: 'SELECT_ENTRY', lid: 'e2' });
    expect(state.selectedLid).toBe('e2');
    expect(state.multiSelectedLids).toEqual([]);
  });

  it('TOGGLE_MULTI_SELECT adds lid and includes anchor', () => {
    const s: AppState = { ...readyState(), selectedLid: 'e1', multiSelectedLids: [] };
    const { state } = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    expect(state.selectedLid).toBe('e2');
    expect(state.multiSelectedLids).toContain('e1');
    expect(state.multiSelectedLids).toContain('e2');
  });

  it('TOGGLE_MULTI_SELECT removes lid when already selected', () => {
    const s: AppState = { ...readyState(), selectedLid: 'e1', multiSelectedLids: ['e1', 'e2'] };
    const { state } = reduce(s, { type: 'TOGGLE_MULTI_SELECT', lid: 'e2' });
    expect(state.multiSelectedLids).not.toContain('e2');
    expect(state.multiSelectedLids).toContain('e1');
  });

  it('SELECT_RANGE selects contiguous range', () => {
    const s: AppState = { ...readyState(), selectedLid: 'e1', multiSelectedLids: [] };
    const { state } = reduce(s, { type: 'SELECT_RANGE', lid: 'e3' });
    expect(state.multiSelectedLids).toEqual(['e1', 'e2', 'e3']);
    expect(state.selectedLid).toBe('e3');
  });

  it('CLEAR_MULTI_SELECT empties multiSelectedLids', () => {
    const s: AppState = { ...readyState(), multiSelectedLids: ['e1', 'e2'] };
    const { state } = reduce(s, { type: 'CLEAR_MULTI_SELECT' });
    expect(state.multiSelectedLids).toEqual([]);
  });

  it('BULK_DELETE removes all selected entries', () => {
    const s: AppState = { ...readyState(), selectedLid: 'e1', multiSelectedLids: ['e1', 'e2'] };
    const { state, events } = reduce(s, { type: 'BULK_DELETE' });
    expect(state.container!.entries.map(e => e.lid)).toEqual(['e3']);
    expect(state.selectedLid).toBeNull();
    expect(state.multiSelectedLids).toEqual([]);
    expect(events[0]!.type).toBe('BULK_DELETED');
  });

  it('BULK_MOVE_TO_FOLDER creates structural relations', () => {
    // Add a folder
    const withFolder: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'f1', title: 'Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: withFolder, selectedLid: 'e1', multiSelectedLids: ['e1', 'e2'] };
    const { state } = reduce(s, { type: 'BULK_MOVE_TO_FOLDER', folderLid: 'f1' });
    const structRels = state.container!.relations.filter(r => r.kind === 'structural');
    expect(structRels).toHaveLength(2);
    expect(structRels.map(r => r.to).sort()).toEqual(['e1', 'e2']);
    expect(structRels.every(r => r.from === 'f1')).toBe(true);
    expect(state.multiSelectedLids).toEqual([]);
  });

  it('BULK_MOVE_TO_ROOT removes structural relations', () => {
    const withRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'f1', to: 'e2', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: withRels, selectedLid: 'e1', multiSelectedLids: ['e1', 'e2'] };
    const { state } = reduce(s, { type: 'BULK_MOVE_TO_ROOT' });
    expect(state.container!.relations).toHaveLength(0);
    expect(state.multiSelectedLids).toEqual([]);
  });

  // ── Purge Trash ───────────────────────────

  it('PURGE_TRASH removes revisions for deleted entries', () => {
    const withDeleted: Container = {
      ...mockContainer,
      entries: [mockContainer.entries[0]!], // only e1 remains
      revisions: [
        { id: 'rev-1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' },
        { id: 'rev-2', entry_lid: 'e2', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' }, // deleted
        { id: 'rev-3', entry_lid: 'e3', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' }, // deleted
      ],
    };
    const s: AppState = { ...readyState(), container: withDeleted };
    const { state, events } = reduce(s, { type: 'PURGE_TRASH' });
    expect(state.container!.revisions).toHaveLength(1);
    expect(state.container!.revisions[0]!.entry_lid).toBe('e1');
    expect(events[0]!.type).toBe('TRASH_PURGED');
  });

  it('PURGE_TRASH is blocked when no deleted entries', () => {
    const s = readyState();
    const { state } = reduce(s, { type: 'PURGE_TRASH' });
    expect(state).toBe(s); // no change
  });

  // ── Purge Orphan Assets ───────────────────
  //
  // These tests pin the reducer contract for the manual orphan
  // asset cleanup path. The feature-layer foundation is already
  // tested in `tests/features/asset/asset-scan.test.ts`; these
  // tests focus on the dispatcher / reducer / event emission
  // integration and the "no auto-GC" guarantee.

  it('PURGE_ORPHAN_ASSETS removes unreferenced assets and emits ORPHAN_ASSETS_PURGED', () => {
    // Mixed container: one attachment entry points at `ast-keep`,
    // a second asset `ast-drop` has no referencer.
    const attachmentBody = JSON.stringify({
      name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-keep',
    });
    const withOrphans: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'a1', title: 'keep.png', body: attachmentBody, archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-keep': 'AAAA', 'ast-drop': 'BBBB', 'ast-also-drop': 'CCCC' },
    };
    const s: AppState = { ...readyState(), container: withOrphans };
    const { state, events } = reduce(s, { type: 'PURGE_ORPHAN_ASSETS' });
    // Referenced asset survives, orphans removed.
    expect(state.container!.assets['ast-keep']).toBe('AAAA');
    expect(state.container!.assets['ast-drop']).toBeUndefined();
    expect(state.container!.assets['ast-also-drop']).toBeUndefined();
    expect(Object.keys(state.container!.assets).length).toBe(1);
    // Event carries the accurate purged count.
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: 'ORPHAN_ASSETS_PURGED', count: 2 });
    // The assets identity flipped — Preview/View wiring requires this.
    expect(state.container!.assets).not.toBe(withOrphans.assets);
    // Everything else is reused by reference (shallow immutable update).
    expect(state.container!.entries).toBe(withOrphans.entries);
    expect(state.container!.relations).toBe(withOrphans.relations);
    expect(state.container!.revisions).toBe(withOrphans.revisions);
    expect(state.container!.meta).toBe(withOrphans.meta);
  });

  it('PURGE_ORPHAN_ASSETS is a no-op (blocked) when there are no orphans', () => {
    // Every asset is referenced, so nothing to prune. The reducer
    // must return the SAME state reference and emit no events so
    // the event log does not get polluted by idle cleanup clicks.
    const attachmentBody = JSON.stringify({
      name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-1',
    });
    const clean: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'a1', title: 'keep.png', body: attachmentBody, archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-1': 'DATA' },
    };
    const s: AppState = { ...readyState(), container: clean };
    const { state, events } = reduce(s, { type: 'PURGE_ORPHAN_ASSETS' });
    expect(state).toBe(s);
    expect(events).toHaveLength(0);
  });

  it('PURGE_ORPHAN_ASSETS is blocked when container.assets is empty', () => {
    // Empty assets map means there is nothing to scan, nothing to
    // prune, and nothing to report — must be a no-op no matter
    // what entries are present.
    const s = readyState();
    const { state, events } = reduce(s, { type: 'PURGE_ORPHAN_ASSETS' });
    expect(state).toBe(s);
    expect(events).toHaveLength(0);
  });

  it('PURGE_ORPHAN_ASSETS is blocked in readonly mode', () => {
    // Readonly artifact view must never mutate the container — the
    // cleanup button is already hidden in the renderer for this
    // state (see the shell menu tests) but the reducer enforces
    // the guarantee too, so even a spoofed dispatch is safe.
    const withOrphans: Container = {
      ...mockContainer,
      assets: { 'ast-drop': 'BBBB' },
    };
    const s: AppState = { ...readyState(), container: withOrphans, readonly: true };
    const { state, events } = reduce(s, { type: 'PURGE_ORPHAN_ASSETS' });
    expect(state).toBe(s);
    expect(state.container!.assets['ast-drop']).toBe('BBBB');
    expect(events).toHaveLength(0);
  });

  it('PURGE_ORPHAN_ASSETS preserves selection and phase (pure maintenance)', () => {
    // Cleanup must NOT change selectedLid, editingLid, viewMode, or
    // phase — it is a maintenance operation, not a content edit.
    const withOrphans: Container = {
      ...mockContainer,
      assets: { 'ast-drop': 'BBBB' },
    };
    const s: AppState = {
      ...readyState(),
      container: withOrphans,
      selectedLid: 'e1',
      viewMode: 'kanban',
    };
    const { state } = reduce(s, { type: 'PURGE_ORPHAN_ASSETS' });
    expect(state.phase).toBe('ready');
    expect(state.selectedLid).toBe('e1');
    expect(state.editingLid).toBeNull();
    expect(state.viewMode).toBe('kanban');
  });

  it('DELETE_ENTRY does NOT auto-purge orphan assets (foundation-only)', () => {
    // Regression pin for the "no auto-GC" guarantee. Deleting an
    // attachment entry must leave its asset in `container.assets`
    // — the manual cleanup button is the only code path that
    // removes orphans today. This test will fail loudly if a
    // future commit adds auto-GC to the reducer.
    const attachmentBody = JSON.stringify({
      name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-bound',
    });
    const withAttachment: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'a1', title: 'keep.png', body: attachmentBody, archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-bound': 'ZZZZ' },
    };
    const s: AppState = { ...readyState(), container: withAttachment };
    const { state } = reduce(s, { type: 'DELETE_ENTRY', lid: 'a1' });
    // Entry gone, but the asset is still there — will become an
    // orphan candidate on the next manual scan.
    expect(state.container!.entries.find((e) => e.lid === 'a1')).toBeUndefined();
    expect(state.container!.assets['ast-bound']).toBe('ZZZZ');
  });

  // ── Tier 2-1: auto-GC on container-replacement paths ──────
  //
  // The one-and-only reducer paths that auto-invoke
  // `removeOrphanAssets` are the container-replacement paths:
  // SYS_IMPORT_COMPLETE (both reduceReady and reduceError) and
  // CONFIRM_IMPORT. Every other reducer path continues to leave
  // orphan cleanup to the manual `PURGE_ORPHAN_ASSETS` button —
  // see `docs/development/orphan-asset-auto-gc.md`.
  //
  // These tests pin:
  //   (a) auto-purge fires when imports contain orphans
  //   (b) auto-purge is a true no-op (identity preserved) when
  //       the imported container has zero orphans
  //   (c) the purge count reaches the domain event listeners
  //   (d) regression guards for the non-auto paths

  const importedWithOrphans: Container = {
    meta: {
      container_id: 'imported', title: 'Imported',
      created_at: '2026-04-14T00:00:00Z',
      updated_at: '2026-04-14T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'i1', title: 'keep.png',
        body: JSON.stringify({
          name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-keep',
        }),
        archetype: 'attachment',
        created_at: '2026-04-14T00:00:00Z',
        updated_at: '2026-04-14T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: { 'ast-keep': 'AAAA', 'ast-orphan-1': 'BBBB', 'ast-orphan-2': 'CCCC' },
  };

  it('SYS_IMPORT_COMPLETE auto-purges orphan assets from the imported container', () => {
    const s: AppState = readyState();
    const { state, events } = reduce(s, {
      type: 'SYS_IMPORT_COMPLETE',
      container: importedWithOrphans,
      source: 'ext.html',
    });
    // Referenced asset survives; both orphans are dropped.
    expect(state.container!.assets['ast-keep']).toBe('AAAA');
    expect(state.container!.assets['ast-orphan-1']).toBeUndefined();
    expect(state.container!.assets['ast-orphan-2']).toBeUndefined();
    expect(Object.keys(state.container!.assets).length).toBe(1);
    // Both CONTAINER_IMPORTED and ORPHAN_ASSETS_PURGED fire.
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'CONTAINER_IMPORTED', container_id: 'imported', source: 'ext.html',
    });
    expect(events[1]).toEqual({ type: 'ORPHAN_ASSETS_PURGED', count: 2 });
    // The container identity flipped (new assets map).
    expect(state.container).not.toBe(importedWithOrphans);
  });

  it('SYS_IMPORT_COMPLETE is identity-preserving when the imported container has no orphans', () => {
    const clean: Container = {
      ...importedWithOrphans,
      assets: { 'ast-keep': 'AAAA' },
    };
    const s: AppState = readyState();
    const { state, events } = reduce(s, {
      type: 'SYS_IMPORT_COMPLETE', container: clean, source: 'clean.html',
    });
    // No orphans → container reference preserved (removeOrphanAssets
    // returns the same reference).
    expect(state.container).toBe(clean);
    // No ORPHAN_ASSETS_PURGED event; only CONTAINER_IMPORTED.
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_IMPORTED');
  });

  function makeImportPreview(container: Container, source: string) {
    return {
      title: container.meta.title,
      container_id: container.meta.container_id,
      entry_count: container.entries.length,
      revision_count: container.revisions.length,
      schema_version: container.meta.schema_version,
      source,
      container,
    };
  }

  it('CONFIRM_IMPORT auto-purges orphan assets from the preview container', () => {
    const withPreview: AppState = {
      ...readyState(),
      importPreview: makeImportPreview(importedWithOrphans, 'ext.zip'),
    };
    const { state, events } = reduce(withPreview, { type: 'CONFIRM_IMPORT' });
    expect(state.importPreview).toBeNull();
    expect(Object.keys(state.container!.assets).length).toBe(1);
    expect(state.container!.assets['ast-keep']).toBe('AAAA');
    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe('CONTAINER_IMPORTED');
    expect(events[1]).toEqual({ type: 'ORPHAN_ASSETS_PURGED', count: 2 });
  });

  it('CONFIRM_IMPORT is identity-preserving when the preview container has no orphans', () => {
    const clean: Container = {
      ...importedWithOrphans,
      assets: { 'ast-keep': 'AAAA' },
    };
    const withPreview: AppState = {
      ...readyState(),
      importPreview: makeImportPreview(clean, 'clean.zip'),
    };
    const { state, events } = reduce(withPreview, { type: 'CONFIRM_IMPORT' });
    expect(state.container).toBe(clean);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('CONTAINER_IMPORTED');
  });

  it('SYS_IMPORT_COMPLETE from error phase also auto-purges orphan assets', () => {
    // reduceError has its own SYS_IMPORT_COMPLETE handler (recovery
    // path). Make sure the same auto-GC behaviour applies.
    const errorState: AppState = {
      ...createInitialState(), phase: 'error', error: 'boom',
    };
    const { state, events } = reduce(errorState, {
      type: 'SYS_IMPORT_COMPLETE',
      container: importedWithOrphans,
      source: 'recovery.html',
    });
    expect(state.phase).toBe('ready');
    expect(state.container!.assets['ast-keep']).toBe('AAAA');
    expect(state.container!.assets['ast-orphan-1']).toBeUndefined();
    expect(events).toHaveLength(2);
    expect(events[1]).toEqual({ type: 'ORPHAN_ASSETS_PURGED', count: 2 });
  });

  it('COMMIT_EDIT does NOT auto-purge orphan assets (foundation-only)', () => {
    // Regression pin. Removing an `asset:` markdown reference by
    // editing a text body must NOT auto-purge the asset — a later
    // RESTORE_ENTRY from the revision snapshot could still want to
    // render it. Manual purge is the only cleanup path for edits.
    const withRef: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 't1', title: 'Text', body: 'Before ![](asset:ast-bound) after',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-bound': 'ZZZZ' },
    };
    // Enter edit mode
    const editing = reduce(
      { ...readyState(), container: withRef },
      { type: 'BEGIN_EDIT', lid: 't1' },
    ).state;
    // Commit with the asset reference removed
    const { state } = reduce(editing, {
      type: 'COMMIT_EDIT', lid: 't1', title: 'Text', body: 'Now with no asset',
    });
    // Asset is still present — cleanup deferred to the manual button.
    expect(state.container!.assets['ast-bound']).toBe('ZZZZ');
  });

  it('QUICK_UPDATE_ENTRY does NOT auto-purge orphan assets (foundation-only)', () => {
    const withRef: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 't1', title: 'Text', body: '![](asset:ast-bound)',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-bound': 'ZZZZ' },
    };
    const { state } = reduce(
      { ...readyState(), container: withRef },
      { type: 'QUICK_UPDATE_ENTRY', lid: 't1', body: 'no asset anymore' },
    );
    expect(state.container!.assets['ast-bound']).toBe('ZZZZ');
  });

  it('BULK_DELETE does NOT auto-purge orphan assets (foundation-only)', () => {
    const withAttachments: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'a1', title: 'a.png',
          body: JSON.stringify({
            name: 'a.png', mime: 'image/png', size: 1, asset_key: 'ast-a',
          }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
        {
          lid: 'a2', title: 'b.png',
          body: JSON.stringify({
            name: 'b.png', mime: 'image/png', size: 1, asset_key: 'ast-b',
          }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-a': 'AA', 'ast-b': 'BB' },
    };
    const { state } = reduce(
      { ...readyState(), container: withAttachments, multiSelectedLids: ['a1', 'a2'] },
      { type: 'BULK_DELETE' },
    );
    // Both attachments gone, but both assets remain.
    expect(state.container!.entries.length).toBe(0);
    expect(state.container!.assets['ast-a']).toBe('AA');
    expect(state.container!.assets['ast-b']).toBe('BB');
  });

  // ── Folder Collapse ───────────────────────

  it('initial state has empty collapsedFolders', () => {
    const state = createInitialState();
    expect(state.collapsedFolders).toEqual([]);
  });

  it('TOGGLE_FOLDER_COLLAPSE adds lid when not collapsed', () => {
    const { state } = reduce(readyState(), { type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    expect(state.collapsedFolders).toEqual(['f1']);
  });

  it('TOGGLE_FOLDER_COLLAPSE removes lid when already collapsed', () => {
    const s: AppState = { ...readyState(), collapsedFolders: ['f1', 'f2'] };
    const { state } = reduce(s, { type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    expect(state.collapsedFolders).toEqual(['f2']);
  });

  it('TOGGLE_FOLDER_COLLAPSE does not change container or selection', () => {
    const s: AppState = { ...readyState(), selectedLid: 'e1' };
    const { state } = reduce(s, { type: 'TOGGLE_FOLDER_COLLAPSE', lid: 'f1' });
    expect(state.container).toBe(s.container);
    expect(state.selectedLid).toBe('e1');
  });
});

// ── PASTE_ATTACHMENT ────────────────────────
//
// Auto-folder-placement (archetype subfolder pass):
//   - the attachment inherits the context folder of the pasting entry
//   - inside that context folder, an `ASSETS` subfolder is created or
//     reused; the attachment is placed there
//   - if the context folder itself is titled `ASSETS`, the subfolder
//     layer is skipped (no nested ASSETS/ASSETS)
//   - if the context is at root, the attachment lands at root too —
//     no root-level ASSETS is ever auto-created
// See docs/development/auto-folder-placement-for-generated-entries.md.

describe('PASTE_ATTACHMENT', () => {
  const pasteAction = {
    type: 'PASTE_ATTACHMENT' as const,
    name: 'screenshot.png',
    mime: 'image/png',
    size: 1234,
    assetKey: 'att-test-001',
    assetData: 'base64data',
    contextLid: 'e1',
  };

  function findAttachment(state: AppState) {
    return state.container!.entries.find(
      (e) => e.title === 'screenshot.png' && e.archetype === 'attachment',
    );
  }

  it('creates attachment entry and merges asset without changing phase', () => {
    const s = readyState();
    const { state } = reduce(s, pasteAction);
    expect(state.phase).toBe('ready');
    expect(state.editingLid).toBeNull();
    expect(state.selectedLid).toBe(s.selectedLid);
    expect(state.container!.assets['att-test-001']).toBe('base64data');
    const att = findAttachment(state);
    expect(att).not.toBeUndefined();
    expect(JSON.parse(att!.body).asset_key).toBe('att-test-001');
  });

  it('places the attachment at root when the paste context is at root', () => {
    const s = readyState();
    const { state } = reduce(s, pasteAction);
    const att = findAttachment(state);
    const hasParent = state.container!.relations.some(
      (r) => r.kind === 'structural' && r.to === att!.lid,
    );
    expect(hasParent).toBe(false);
    // No root-level ASSETS auto-create when the context is root.
    const newAssetsAtRoot = state.container!.entries.filter(
      (e) => e.title === 'ASSETS' && e.archetype === 'folder',
    );
    expect(newAssetsAtRoot.length).toBe(0);
  });

  it('ignores a pre-existing ASSETS folder at root (no longer special-cased)', () => {
    const containerWithFolder: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'af1', title: 'ASSETS', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: containerWithFolder };
    const { state } = reduce(s, pasteAction);
    // Existing data untouched.
    const assetsFolders = state.container!.entries.filter(
      (e) => e.title === 'ASSETS' && e.archetype === 'folder',
    );
    expect(assetsFolders.length).toBe(1);
    // The new attachment was NOT routed into it — context was root, so
    // no auto-placement.
    const att = findAttachment(state);
    const intoAssets = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === 'af1' && r.to === att!.lid,
    );
    expect(intoAssets).toBeUndefined();
  });

  it('creates an ASSETS subfolder inside the context folder and places the attachment there', () => {
    const containerInFolder: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'parent-f', title: 'Project', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'parent-f', to: 'e1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: containerInFolder };
    const { state } = reduce(s, pasteAction);
    // An ASSETS folder was lazily created under `parent-f`.
    const assets = state.container!.entries.find(
      (e) => e.title === 'ASSETS' && e.archetype === 'folder',
    );
    expect(assets).not.toBeUndefined();
    const parentLinksAssets = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === 'parent-f' && r.to === assets!.lid,
    );
    expect(parentLinksAssets).not.toBeUndefined();
    // The attachment is inside the newly created ASSETS.
    const att = findAttachment(state);
    const rel = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === assets!.lid && r.to === att!.lid,
    );
    expect(rel).not.toBeUndefined();
  });

  it('reuses an existing ASSETS subfolder rather than creating a duplicate', () => {
    const containerWithAssets: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'parent-f', title: 'Project', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'existing-assets', title: 'ASSETS', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'parent-f', to: 'e1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'parent-f', to: 'existing-assets', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: containerWithAssets };
    const { state } = reduce(s, pasteAction);
    // No new ASSETS folder — the existing one was reused.
    const assetsUnderParent = state.container!.relations.filter(
      (r) =>
        r.kind === 'structural' &&
        r.from === 'parent-f' &&
        state.container!.entries.find(
          (e) => e.lid === r.to && e.title === 'ASSETS' && e.archetype === 'folder',
        ),
    );
    expect(assetsUnderParent.length).toBe(1);
    // Attachment lives in the existing ASSETS.
    const att = findAttachment(state);
    const rel = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === 'existing-assets' && r.to === att!.lid,
    );
    expect(rel).not.toBeUndefined();
  });

  it('places the attachment directly in the selected folder when the context IS a folder', () => {
    const containerWithFolder: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'fld', title: 'Project', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: containerWithFolder };
    const { state } = reduce(s, { ...pasteAction, contextLid: 'fld' });
    // Context is `fld` itself (a folder). ASSETS subfolder is created
    // inside it and the attachment placed there.
    const assets = state.container!.entries.find(
      (e) => e.title === 'ASSETS' && e.archetype === 'folder',
    );
    expect(assets).not.toBeUndefined();
    const assetsUnderFld = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === 'fld' && r.to === assets!.lid,
    );
    expect(assetsUnderFld).not.toBeUndefined();
    const att = findAttachment(state);
    const attRel = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === assets!.lid && r.to === att!.lid,
    );
    expect(attRel).not.toBeUndefined();
  });

  it('skips the ASSETS subfolder layer when the context folder is already titled ASSETS', () => {
    const containerInAssets: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'assets-fld', title: 'ASSETS', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const s: AppState = { ...readyState(), container: containerInAssets };
    const { state } = reduce(s, { ...pasteAction, contextLid: 'assets-fld' });
    // No nested ASSETS/ASSETS.
    const assetsFolders = state.container!.entries.filter(
      (e) => e.title === 'ASSETS' && e.archetype === 'folder',
    );
    expect(assetsFolders.length).toBe(1);
    const att = findAttachment(state);
    const rel = state.container!.relations.find(
      (r) => r.kind === 'structural' && r.from === 'assets-fld' && r.to === att!.lid,
    );
    expect(rel).not.toBeUndefined();
  });

  it('works during editing phase without disrupting edit state', () => {
    const s: AppState = {
      ...readyState(),
      phase: 'editing',
      editingLid: 'e1',
      selectedLid: 'e1',
    };
    const { state } = reduce(s, pasteAction);
    expect(state.phase).toBe('editing');
    expect(state.editingLid).toBe('e1');
    expect(state.selectedLid).toBe('e1');
    expect(state.container!.assets['att-test-001']).toBe('base64data');
  });

  it('emits events matching placement: 1 ENTRY_CREATED at root, 2 + 2 when subfolder is lazily created', () => {
    // Root context → just the attachment.
    const sRoot = readyState();
    const { events: rootEvents } = reduce(sRoot, pasteAction);
    expect(rootEvents.filter((e) => e.type === 'ENTRY_CREATED').length).toBe(1);
    expect(rootEvents.filter((e) => e.type === 'RELATION_CREATED').length).toBe(0);

    // Inside-a-folder context with no ASSETS yet → ASSETS folder +
    // attachment (2 ENTRY_CREATED), plus 2 RELATION_CREATED
    // (parent→ASSETS, ASSETS→attachment).
    const containerInFolder: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'parent-f', title: 'Project', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'parent-f', to: 'e1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const sFolder: AppState = { ...readyState(), container: containerInFolder };
    const { events: folderEvents } = reduce(sFolder, pasteAction);
    expect(folderEvents.filter((e) => e.type === 'ENTRY_CREATED').length).toBe(2);
    expect(folderEvents.filter((e) => e.type === 'RELATION_CREATED').length).toBe(2);
  });

  it('is blocked when readonly', () => {
    const s: AppState = { ...readyState(), readonly: true };
    const { state } = reduce(s, pasteAction);
    expect(state.container!.assets['att-test-001']).toBeUndefined();
  });
});

// ── SYS_APPLY_BATCH_IMPORT (atomic batch import) ──────

describe('SYS_APPLY_BATCH_IMPORT', () => {
  it('creates entries atomically from a flat plan', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body-a', assets: {}, attachments: [] },
        { archetype: 'textlog' as const, title: 'B', body: 'body-b', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const before = readyState();
    const entryCountBefore = before.container!.entries.length;
    const { state, events } = reduce(before, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    expect(state.container!.entries.length).toBe(entryCountBefore + 2);
    const created = events.filter((e) => e.type === 'ENTRY_CREATED');
    expect(created).toHaveLength(2);
  });

  it('creates folders and structural relations for restore plan', () => {
    const plan = {
      folders: [
        { originalLid: 'f-root', title: 'Root', parentOriginalLid: null },
        { originalLid: 'f-sub', title: 'Sub', parentOriginalLid: 'f-root' },
      ],
      entries: [
        { archetype: 'text' as const, title: 'Note', body: 'hello', parentFolderOriginalLid: 'f-sub', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-folder-export-bundle',
      restoreStructure: true,
    };
    const before = readyState();
    const { state, events } = reduce(before, { type: 'SYS_APPLY_BATCH_IMPORT', plan });

    // 2 folders + 1 content entry created
    const created = events.filter((e) => e.type === 'ENTRY_CREATED');
    expect(created).toHaveLength(3);
    const folderCreated = created.filter((e) => 'archetype' in e && e.archetype === 'folder');
    expect(folderCreated).toHaveLength(2);

    // Structural relations: f-root→f-sub, f-sub→Note
    const rels = events.filter((e) => e.type === 'RELATION_CREATED');
    expect(rels).toHaveLength(2);

    // Container has new entries
    const entryTitles = state.container!.entries.map((e) => e.title);
    expect(entryTitles).toContain('Root');
    expect(entryTitles).toContain('Sub');
    expect(entryTitles).toContain('Note');
  });

  it('merges assets from plan entries', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: { 'k1': 'data1' }, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const { state } = reduce(readyState(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    expect(state.container!.assets['k1']).toBe('data1');
  });

  it('creates attachment entries from plan', () => {
    const plan = {
      folders: [],
      entries: [
        {
          archetype: 'text' as const,
          title: 'WithAtt',
          body: 'body',
          assets: {},
          attachments: [{
            name: 'pic.png',
            body: '{"name":"pic.png","mime":"image/png","size":100,"asset_key":"att-k1"}',
            assetKey: 'att-k1',
            assetData: 'base64pic',
          }],
        },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const { state, events } = reduce(readyState(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const created = events.filter((e) => e.type === 'ENTRY_CREATED');
    // 1 attachment + 1 content entry
    expect(created).toHaveLength(2);
    const attCreated = created.filter((e) => 'archetype' in e && e.archetype === 'attachment');
    expect(attCreated).toHaveLength(1);
    // Asset data merged
    expect(state.container!.assets['att-k1']).toBe('base64pic');
  });

  it('is blocked when readonly', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const s: AppState = { ...readyState(), readonly: true };
    const entryCountBefore = s.container!.entries.length;
    const { state } = reduce(s, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    expect(state.container!.entries.length).toBe(entryCountBefore);
  });

  it('is blocked when container is null', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const s: AppState = { ...createInitialState(), phase: 'ready' };
    const { state } = reduce(s, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    expect(state.container).toBeNull();
  });

  it('does not mutate state on empty plan', () => {
    const plan = {
      folders: [],
      entries: [],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const before = readyState();
    const { state, events } = reduce(before, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    expect(state.container!.entries.length).toBe(before.container!.entries.length);
    // Even an empty plan emits BATCH_IMPORT_APPLIED with a zero-count summary
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('BATCH_IMPORT_APPLIED');
  });
});

// ── Batch import result summary (Issue F) ─────────────

describe('SYS_APPLY_BATCH_IMPORT result summary', () => {
  it('flat plan to root produces correct summary', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'A', body: 'body-a', assets: {}, attachments: [] },
        { archetype: 'text' as const, title: 'B', body: 'body-b', assets: {}, attachments: [] },
      ],
      source: 'test.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
    };
    const { state, events } = reduce(readyState(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });

    // batchImportResult stored in state
    expect(state.batchImportResult).not.toBeNull();
    const r = state.batchImportResult!;
    expect(r.entryCount).toBe(2);
    expect(r.attachmentCount).toBe(0);
    expect(r.folderCount).toBe(0);
    expect(r.restoreStructure).toBe(false);
    expect(r.actualDestination).toBe('/ (Root)');
    expect(r.intendedDestination).toBeNull();
    expect(r.fallbackToRoot).toBe(false);
    expect(r.source).toBe('test.zip');

    // BATCH_IMPORT_APPLIED event carries same summary
    const applied = events.find((e) => e.type === 'BATCH_IMPORT_APPLIED');
    expect(applied).toBeDefined();
    if (applied && applied.type === 'BATCH_IMPORT_APPLIED') {
      expect(applied.summary).toEqual(r);
    }
  });

  it('restore plan counts folders and attachments', () => {
    const plan = {
      folders: [
        { originalLid: 'f1', title: 'Folder1', parentOriginalLid: null },
      ],
      entries: [
        {
          archetype: 'text' as const, title: 'Note', body: 'body', parentFolderOriginalLid: 'f1',
          assets: {},
          attachments: [{
            name: 'pic.png',
            body: '{"name":"pic.png","mime":"image/png","size":100,"asset_key":"k1"}',
            assetKey: 'k1',
            assetData: 'base64data',
          }],
        },
      ],
      source: 'archive.zip',
      format: 'pkc2-folder-export-bundle',
      restoreStructure: true,
    };
    const { state } = reduce(readyState(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const r = state.batchImportResult!;
    expect(r.entryCount).toBe(1);
    expect(r.attachmentCount).toBe(1);
    expect(r.folderCount).toBe(1);
    expect(r.restoreStructure).toBe(true);
    expect(r.actualDestination).toBe('/ (Root)');
    expect(r.intendedDestination).toBeNull();
    expect(r.source).toBe('archive.zip');
  });

  it('target folder destination shows folder title', () => {
    const container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'dest-f', title: 'My Folder', body: '',
          archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const before: AppState = { ...createInitialState(), phase: 'ready', container };
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'X', body: '', assets: {}, attachments: [] },
      ],
      source: 'import.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'dest-f',
    };
    const { state } = reduce(before, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const r = state.batchImportResult!;
    expect(r.actualDestination).toBe('My Folder');
    expect(r.intendedDestination).toBeNull();
    expect(r.fallbackToRoot).toBe(false);
  });

  it('missing target folder triggers fallback with intended destination', () => {
    // Create a container with an entry that has the target LID but is NOT a folder
    const container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'text-not-folder', title: 'Not A Folder', body: '',
          archetype: 'text' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const before: AppState = { ...createInitialState(), phase: 'ready', container };
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'X', body: '', assets: {}, attachments: [] },
      ],
      source: 'import.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'text-not-folder',
    };
    const { state } = reduce(before, { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const r = state.batchImportResult!;
    expect(r.actualDestination).toBe('/ (Root)');
    expect(r.intendedDestination).toBe('Not A Folder');
    expect(r.fallbackToRoot).toBe(true);
  });

  it('fallback with completely nonexistent LID sets intendedDestination to null', () => {
    const plan = {
      folders: [],
      entries: [
        { archetype: 'text' as const, title: 'X', body: '', assets: {}, attachments: [] },
      ],
      source: 'import.zip',
      format: 'pkc2-texts-container-bundle',
      restoreStructure: false,
      targetFolderLid: 'nonexistent-folder',
    };
    const { state } = reduce(readyState(), { type: 'SYS_APPLY_BATCH_IMPORT', plan });
    const r = state.batchImportResult!;
    expect(r.actualDestination).toBe('/ (Root)');
    expect(r.intendedDestination).toBeNull();
    expect(r.fallbackToRoot).toBe(true);
  });

  it('SYS_BATCH_IMPORT_PREVIEW clears previous result', () => {
    const before: AppState = {
      ...readyState(),
      batchImportResult: {
        entryCount: 3, attachmentCount: 0, folderCount: 0,
        restoreStructure: false, actualDestination: '/ (Root)',
        intendedDestination: null, fallbackToRoot: false, source: 'old.zip',
      },
    };
    const preview: BatchImportPreviewInfo = {
      format: 'pkc2-texts-container-bundle',
      formatLabel: 'TEXT container bundle',
      textCount: 1,
      textlogCount: 0,
      totalEntries: 1,
      compacted: false,
      missingAssetCount: 0,
      isFolderExport: false,
      sourceFolderTitle: null,
      canRestoreFolderStructure: false,
      source: 'new.zip',
      entries: [],
      selectedIndices: [],
      targetFolderLid: null,
      folderRestoreMode: 'flat' as const,
      restoredFolderCount: 0,
      flatReason: null,
      rawData: null,
    } as unknown as BatchImportPreviewInfo;
    const { state } = reduce(before, { type: 'SYS_BATCH_IMPORT_PREVIEW', preview });
    expect(state.batchImportResult).toBeNull();
  });
});

// ── DISMISS_BATCH_IMPORT_RESULT ───────────────────────

describe('DISMISS_BATCH_IMPORT_RESULT', () => {
  it('clears batchImportResult', () => {
    const before: AppState = {
      ...readyState(),
      batchImportResult: {
        entryCount: 5, attachmentCount: 2, folderCount: 1,
        restoreStructure: true, actualDestination: 'My Folder',
        intendedDestination: null, fallbackToRoot: false, source: 'test.zip',
      },
    };
    const { state, events } = reduce(before, { type: 'DISMISS_BATCH_IMPORT_RESULT' });
    expect(state.batchImportResult).toBeNull();
    expect(events).toHaveLength(0);
  });

  it('is a no-op when result is already null', () => {
    const before = readyState();
    expect(before.batchImportResult).toBeNull();
    const { state } = reduce(before, { type: 'DISMISS_BATCH_IMPORT_RESULT' });
    expect(state.batchImportResult).toBeNull();
  });
});
