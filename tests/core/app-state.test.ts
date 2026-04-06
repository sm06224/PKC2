import { describe, it, expect } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

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
    // Selected the new entry
    expect(state.selectedLid).toBe(created.lid);
    // Event emitted
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('ENTRY_CREATED');
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

  it('BEGIN_EXPORT in ready → exporting phase', () => {
    const { state } = reduce(readyState(), { type: 'BEGIN_EXPORT' });
    expect(state.phase).toBe('exporting');
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
  it('SYS_FINISH_EXPORT in exporting → ready + EXPORT_COMPLETED', () => {
    const base: AppState = { ...readyState(), phase: 'exporting' };
    const { state, events } = reduce(base, { type: 'SYS_FINISH_EXPORT' });
    expect(state.phase).toBe('ready');
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
