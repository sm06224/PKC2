/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { bindActions } from '@adapter/ui/action-binder';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { formPresenter } from '@adapter/ui/form-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

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
      lid: 'e1', title: 'First', body: 'Body1',
      archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    },
    {
      lid: 'e2', title: 'Second', body: 'Body2',
      archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention (see action-binder.test.ts for rationale) ---
const _trackedUnsubs: (() => void)[] = [];

function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  return { dispatcher, events };
}

describe('Mutation → Shell integration', () => {
  it('CREATE_ENTRY adds entry to sidebar', () => {
    const { dispatcher } = setup();

    // Before: 2 entries
    expect(root.querySelectorAll('[data-pkc-action="select-entry"]')).toHaveLength(2);

    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'text', title: 'New One' });
    // Render was triggered by state listener

    // After: 3 entries
    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(3);

    // New entry is selected
    const selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected).not.toBeNull();
  });

  it('DELETE_ENTRY removes entry from sidebar', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: 'e1' });

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2');
  });

  it('DELETE selected entry selects next and shows it', () => {
    const { dispatcher } = setup();

    // Select e1 then delete it
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: 'e1' });

    // e2 should be selected now
    const state = dispatcher.getState();
    expect(state.selectedLid).toBe('e2');

    // Detail shows e2
    const viewTitle = root.querySelector('.pkc-view-title');
    expect(viewTitle?.textContent).toBe('Second');
  });

  it('COMMIT_EDIT updates entry in sidebar and detail', () => {
    const { dispatcher } = setup();

    // Select and edit e1
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({
      type: 'COMMIT_EDIT', lid: 'e1',
      title: 'Updated Title', body: 'Updated Body',
    });

    // Sidebar shows updated title (find e1 by lid, not by position — sort may reorder)
    const e1Item = root.querySelector('.pkc-entry-item[data-pkc-lid="e1"]');
    const e1Title = e1Item!.querySelector('.pkc-entry-title');
    expect(e1Title?.textContent).toContain('Updated Title');

    // Detail shows updated content
    const viewTitle = root.querySelector('.pkc-view-title');
    expect(viewTitle?.textContent).toBe('Updated Title');
    const viewBody = root.querySelector('.pkc-view-body');
    expect(viewBody?.textContent).toBe('Updated Body');
  });

  it('CANCEL_EDIT does not change entry content', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });

    // Entry unchanged
    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.title).toBe('First');
    expect(entry.body).toBe('Body1');
  });

  it('COMMIT_EDIT creates a revision snapshot', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({
      type: 'COMMIT_EDIT', lid: 'e1',
      title: 'Changed', body: 'New',
    });

    const revisions = dispatcher.getState().container!.revisions;
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.entry_lid).toBe('e1');
    const snap = JSON.parse(revisions[0]!.snapshot);
    expect(snap.title).toBe('First'); // old value
  });

  it('full lifecycle: create → edit → save → delete', () => {
    const { dispatcher, events } = setup();

    // Create — auto-enters editing
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'todo', title: 'New TODO' });
    const createdLid = dispatcher.getState().selectedLid!;
    expect(dispatcher.getState().container!.entries).toHaveLength(3);
    expect(dispatcher.getState().phase).toBe('editing');

    // Save (already in editing from create)
    dispatcher.dispatch({
      type: 'COMMIT_EDIT', lid: createdLid,
      title: 'Buy milk', body: '2L whole milk',
    });
    const updated = dispatcher.getState().container!.entries.find(
      (e) => e.lid === createdLid,
    )!;
    expect(updated.title).toBe('Buy milk');
    expect(updated.body).toBe('2L whole milk');

    // Delete
    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: createdLid });
    expect(dispatcher.getState().container!.entries).toHaveLength(2);

    // Events trace
    const types = events.map((e) => e.type);
    expect(types).toContain('ENTRY_CREATED');
    expect(types).toContain('EDIT_COMMITTED');
    expect(types).toContain('ENTRY_UPDATED');
    expect(types).toContain('ENTRY_DELETED');
  });

  it('CREATE_RELATION shows relation in detail view', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });

    // Relation section should appear
    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).not.toBeNull();

    // Outgoing relations section with peer title
    const peer = relRegion!.querySelector('[data-pkc-action="select-entry"]');
    expect(peer).not.toBeNull();
    expect(peer!.textContent).toBe('Second');
  });

  it('relation peer click navigates to target entry', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'structural' });

    // Click the peer link (dispatches SELECT_ENTRY via action-binder)
    const peer = root.querySelector('.pkc-relation-peer') as HTMLElement;
    expect(peer).not.toBeNull();
    peer.click();

    // Should now have e2 selected
    expect(dispatcher.getState().selectedLid).toBe('e2');
    const viewTitle = root.querySelector('.pkc-view-title');
    expect(viewTitle?.textContent).toBe('Second');
  });

  it('categorical relation shows as tag chip', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'categorical' });

    const tagRegion = root.querySelector('[data-pkc-region="tags"]');
    expect(tagRegion).not.toBeNull();
    const chips = tagRegion!.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(1);
    const label = chips[0]!.querySelector('.pkc-tag-label');
    expect(label!.textContent).toBe('Second');
  });

  it('remove-tag click deletes categorical relation', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'categorical' });

    // Verify tag exists
    expect(dispatcher.getState().container!.relations).toHaveLength(1);

    // Click remove button
    const removeBtn = root.querySelector('[data-pkc-action="remove-tag"]') as HTMLElement;
    expect(removeBtn).not.toBeNull();
    removeBtn.click();

    // Relation should be gone
    expect(dispatcher.getState().container!.relations).toHaveLength(0);
    const chips = root.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(0);
  });

  // v1 relation delete UI: clicking `×` in a Relations / Backlinks row
  // confirms then dispatches DELETE_RELATION. See
  // docs/development/relation-delete-ui-v1.md.
  it('delete-relation click with confirm removes the relation from container', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });
    expect(dispatcher.getState().container!.relations).toHaveLength(1);

    // Mock the native confirm to auto-accept.
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      const deleteBtn = root.querySelector<HTMLElement>(
        '[data-pkc-region="relations"] [data-pkc-action="delete-relation"]',
      );
      expect(deleteBtn).not.toBeNull();
      expect(deleteBtn!.getAttribute('data-pkc-relation-id')).toBeTruthy();
      deleteBtn!.click();
    } finally {
      window.confirm = originalConfirm;
    }

    expect(dispatcher.getState().container!.relations).toHaveLength(0);
    // Row gone from the Outgoing relations group after re-render
    const outgoing = root.querySelector('[data-pkc-relation-direction="outgoing"]');
    expect(outgoing!.querySelector('.pkc-relation-item')).toBeNull();
  });

  it('delete-relation click is a no-op when confirm is cancelled', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });
    expect(dispatcher.getState().container!.relations).toHaveLength(1);

    const originalConfirm = window.confirm;
    window.confirm = () => false;
    try {
      const deleteBtn = root.querySelector<HTMLElement>(
        '[data-pkc-region="relations"] [data-pkc-action="delete-relation"]',
      );
      deleteBtn!.click();
    } finally {
      window.confirm = originalConfirm;
    }

    // Relation survived the cancel.
    expect(dispatcher.getState().container!.relations).toHaveLength(1);
  });

  // v1 relation kind edit UI: changing the kind <select> in a relation
  // row dispatches UPDATE_RELATION_KIND. See
  // docs/development/relation-kind-edit-v1.md.
  it('update-relation-kind change updates the relation in place', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'structural' });
    const relId = dispatcher.getState().container!.relations[0]!.id;

    const kindSel = root.querySelector<HTMLSelectElement>(
      '[data-pkc-region="relations"] select[data-pkc-action="update-relation-kind"]',
    );
    expect(kindSel).not.toBeNull();
    expect(kindSel!.value).toBe('structural');

    kindSel!.value = 'temporal';
    kindSel!.dispatchEvent(new Event('change', { bubbles: true }));

    const updated = dispatcher.getState().container!.relations.find((r) => r.id === relId)!;
    expect(updated.kind).toBe('temporal');

    // Re-render reflects the new kind in the select's value.
    const selAfter = root.querySelector<HTMLSelectElement>(
      '[data-pkc-region="relations"] select[data-pkc-action="update-relation-kind"]',
    );
    expect(selAfter!.value).toBe('temporal');
  });

  it('add-tag creates categorical relation via UI', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    // Find the tag add form and select a target
    const addForm = root.querySelector('[data-pkc-region="tag-add"]');
    expect(addForm).not.toBeNull();

    const select = addForm!.querySelector<HTMLSelectElement>('[data-pkc-field="tag-target"]');
    expect(select).not.toBeNull();
    select!.value = 'e2';

    // Click add button
    const addBtn = addForm!.querySelector('[data-pkc-action="add-tag"]') as HTMLElement;
    addBtn.click();

    // Should have created a categorical relation
    const rels = dispatcher.getState().container!.relations;
    expect(rels).toHaveLength(1);
    expect(rels[0]!.kind).toBe('categorical');
    expect(rels[0]!.from).toBe('e1');
    expect(rels[0]!.to).toBe('e2');
  });

  it('todo entry lifecycle: create → auto-edit → save', () => {
    const { dispatcher } = setup();

    registerPresenter('todo', todoPresenter);

    // Create todo entry — now auto-enters editing mode
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'todo', title: 'My Todo' });
    const lid = dispatcher.getState().selectedLid!;
    const created = dispatcher.getState().container!.entries.find((e) => e.lid === lid);
    expect(created!.archetype).toBe('todo');
    expect(dispatcher.getState().phase).toBe('editing');

    // Editor should be shown directly
    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('todo');

    // Fill in todo fields
    const statusSelect = root.querySelector<HTMLSelectElement>('[data-pkc-field="todo-status"]');
    expect(statusSelect).not.toBeNull();
    statusSelect!.value = 'done';

    const descArea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="todo-description"]');
    expect(descArea).not.toBeNull();
    descArea!.value = 'Completed task';

    // Save — action-binder should serialize todo body
    const saveBtn = root.querySelector('[data-pkc-action="commit-edit"]') as HTMLElement;
    saveBtn.click();

    // Verify saved body
    const saved = dispatcher.getState().container!.entries.find((e) => e.lid === lid)!;
    const parsed = JSON.parse(saved.body);
    expect(parsed.status).toBe('done');
    expect(parsed.description).toBe('Completed task');
  });

  it('todo quick toggle: click toggles status without entering edit mode', () => {
    const { dispatcher } = setup();

    registerPresenter('todo', todoPresenter);

    // Create todo entry — auto-enters editing, save to get to ready phase
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'todo', title: 'My Todo' });
    const lid = dispatcher.getState().selectedLid!;
    // Save immediately to return to ready phase
    dispatcher.dispatch({ type: 'COMMIT_EDIT', lid, title: 'My Todo', body: '{"status":"open","description":""}' });
    expect(dispatcher.getState().phase).toBe('ready');

    // Find the toggle button in detail view
    const toggle = root.querySelector('[data-pkc-action="toggle-todo-status"]') as HTMLElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('data-pkc-todo-status')).toBe('open');

    // Click toggle
    toggle.click();

    // Should stay in ready phase (no edit mode)
    expect(dispatcher.getState().phase).toBe('ready');

    // Entry body should now be done
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === lid)!;
    const parsed = JSON.parse(entry.body);
    expect(parsed.status).toBe('done');

    // Toggle button should now show [x]
    const updatedToggle = root.querySelector('[data-pkc-action="toggle-todo-status"]') as HTMLElement;
    expect(updatedToggle.getAttribute('data-pkc-todo-status')).toBe('done');
    expect(updatedToggle.textContent).toBe('[x]');
  });

  it('form entry lifecycle: create → auto-edit → save → re-render → re-edit', () => {
    const { dispatcher } = setup();

    registerPresenter('form', formPresenter);

    // Create form entry — auto-enters editing
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'form', title: 'My Form' });
    const lid = dispatcher.getState().selectedLid!;
    const created = dispatcher.getState().container!.entries.find((e) => e.lid === lid);
    expect(created!.archetype).toBe('form');
    expect(dispatcher.getState().phase).toBe('editing');

    // Editor should be shown directly
    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('form');

    // Fill in form fields
    const nameInput = root.querySelector<HTMLInputElement>('[data-pkc-field="form-name"]');
    expect(nameInput).not.toBeNull();
    nameInput!.value = 'Alice';

    const noteArea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="form-note"]');
    expect(noteArea).not.toBeNull();
    noteArea!.value = 'Some notes';

    const checkedInput = root.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]');
    expect(checkedInput).not.toBeNull();
    checkedInput!.checked = true;

    // Save
    const saveBtn = root.querySelector('[data-pkc-action="commit-edit"]') as HTMLElement;
    saveBtn.click();

    // Verify saved body
    const saved = dispatcher.getState().container!.entries.find((e) => e.lid === lid)!;
    const parsed = JSON.parse(saved.body);
    expect(parsed.name).toBe('Alice');
    expect(parsed.note).toBe('Some notes');
    expect(parsed.checked).toBe(true);

    // Re-render: view should show saved values
    const reRenderedView = root.querySelector('.pkc-form-view');
    expect(reRenderedView).not.toBeNull();
    const values = reRenderedView!.querySelectorAll('.pkc-form-value');
    expect(values[0]!.textContent).toBe('Alice');
    expect(values[1]!.textContent).toBe('Some notes');
    expect(values[2]!.textContent).toBe('Yes');

    // Re-edit: fields should be pre-populated
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid });
    const nameInput2 = root.querySelector<HTMLInputElement>('[data-pkc-field="form-name"]');
    expect(nameInput2!.value).toBe('Alice');
    const checkedInput2 = root.querySelector<HTMLInputElement>('[data-pkc-field="form-checked"]');
    expect(checkedInput2!.checked).toBe(true);
  });

  it('attachment entry lifecycle: create → auto-edit (populate hidden fields) → save → data in assets', () => {
    const { dispatcher } = setup();

    registerPresenter('attachment', attachmentPresenter);

    // Create attachment entry — auto-enters editing
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'My Attachment' });
    const lid = dispatcher.getState().selectedLid!;
    const created = dispatcher.getState().container!.entries.find((e) => e.lid === lid);
    expect(created!.archetype).toBe('attachment');
    expect(dispatcher.getState().phase).toBe('editing');

    // Editor should be shown directly
    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('attachment');

    // Simulate file selection by populating hidden fields
    const nameField = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-name"]');
    nameField!.value = 'readme.txt';
    const mimeField = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-mime"]');
    mimeField!.value = 'text/plain';
    const assetKeyField = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-asset-key"]');
    assetKeyField!.value = 'ast-test-001';
    const dataField = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-data"]');
    dataField!.value = 'SGVsbG8='; // "Hello"
    const sizeField = root.querySelector<HTMLInputElement>('[data-pkc-field="attachment-size"]');
    sizeField!.value = '5';

    // Save via click (action-binder extracts asset data)
    const saveBtn = root.querySelector('[data-pkc-action="commit-edit"]') as HTMLElement;
    saveBtn.click();

    // Verify saved body has metadata only (no data field)
    const saved = dispatcher.getState().container!.entries.find((e) => e.lid === lid)!;
    const parsed = JSON.parse(saved.body);
    expect(parsed.name).toBe('readme.txt');
    expect(parsed.mime).toBe('text/plain');
    expect(parsed.asset_key).toBe('ast-test-001');
    expect(parsed.size).toBe(5);
    expect(parsed.data).toBeUndefined();

    // Verify data is in container.assets
    const assets = dispatcher.getState().container!.assets;
    expect(assets['ast-test-001']).toBe('SGVsbG8=');

    // Re-render: view should show saved values
    const reRendered = root.querySelector('.pkc-attachment-view');
    expect(reRendered).not.toBeNull();
    expect(root.querySelector('.pkc-attachment-filename')!.textContent).toBe('readme.txt');
    expect(root.querySelector('.pkc-attachment-mime-badge')!.textContent).toBe('text/plain');
    expect(root.querySelector('.pkc-attachment-size-badge')!.textContent).toBe('5 B');
  });

  // v1.2: popup cleanup on phase transition out of 'editing'.
  // See docs/development/entry-autocomplete-v1.2-textlog.md §4.
  it('closes entry-ref autocomplete when editing phase ends (COMMIT_EDIT)', async () => {
    const { openEntryRefAutocomplete, isEntryRefAutocompleteOpen } =
      await import('@adapter/ui/entry-ref-autocomplete');
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    expect(dispatcher.getState().phase).toBe('editing');

    // Simulate a popup being opened during edit
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    openEntryRefAutocomplete(
      ta,
      0,
      '',
      [
        {
          lid: 'other', title: 'Other', body: '', archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      root,
    );
    expect(isEntryRefAutocompleteOpen()).toBe(true);

    dispatcher.dispatch({
      type: 'COMMIT_EDIT', lid: 'e1', title: 'First', body: 'Body1',
    });

    // Phase transitioned editing → ready; state listener must have
    // closed the popup so no stale module state dangles.
    expect(dispatcher.getState().phase).toBe('ready');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  // v1.3: end-to-end RECORD_ENTRY_REF_SELECTION wiring. Accepting a
  // candidate must update state.recentEntryRefLids so the next popup can
  // surface recent entries first.
  it('accepting a candidate records it into recentEntryRefLids', async () => {
    const { openEntryRefAutocomplete, handleEntryRefAutocompleteKeydown } =
      await import('@adapter/ui/entry-ref-autocomplete');
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:)';
    ta.selectionStart = ta.selectionEnd = 10;

    openEntryRefAutocomplete(
      ta,
      10,
      '',
      [
        {
          lid: 'target-lid', title: 'Target', body: '', archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      root,
    );
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(dispatcher.getState().recentEntryRefLids).toEqual(['target-lid']);
  });

  it('closes entry-ref autocomplete when editing is cancelled', async () => {
    const { openEntryRefAutocomplete, isEntryRefAutocompleteOpen } =
      await import('@adapter/ui/entry-ref-autocomplete');
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    openEntryRefAutocomplete(
      ta,
      0,
      '',
      [
        {
          lid: 'other', title: 'Other', body: '', archetype: 'text',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      root,
    );
    expect(isEntryRefAutocompleteOpen()).toBe(true);

    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  // v1 backlink badge click → select entry + scroll into Relations
  // region. See docs/development/backlink-badge-jump-v1.md.
  it('clicking sidebar backlink badge selects the target entry', () => {
    const { dispatcher } = setup();

    // Create a relation so e2 has an inbound count → its row gets a
    // backlink badge that we can click.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });

    // Pre-condition: e1 is selected, not e2.
    expect(dispatcher.getState().selectedLid).toBe('e1');

    const badge = root.querySelector<HTMLElement>(
      '[data-pkc-lid="e2"] .pkc-backlink-badge',
    );
    expect(badge).not.toBeNull();
    badge!.click();

    expect(dispatcher.getState().selectedLid).toBe('e2');
  });

  it('clicking backlink badge while already selected does not re-dispatch SELECT_ENTRY', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e2' });
    const beforeCount = events.filter((e) => e.type === 'ENTRY_SELECTED').length;

    const badge = root.querySelector<HTMLElement>(
      '[data-pkc-lid="e2"] .pkc-backlink-badge',
    );
    badge!.click();

    const afterCount = events.filter((e) => e.type === 'ENTRY_SELECTED').length;
    expect(afterCount).toBe(beforeCount);
    expect(dispatcher.getState().selectedLid).toBe('e2');
  });

  it('clicking backlink badge from calendar view switches back to detail', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'CREATE_RELATION', from: 'e1', to: 'e2', kind: 'semantic' });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });
    expect(dispatcher.getState().viewMode).toBe('calendar');

    const badge = root.querySelector<HTMLElement>(
      '[data-pkc-lid="e2"] .pkc-backlink-badge',
    );
    badge!.click();

    expect(dispatcher.getState().viewMode).toBe('detail');
    expect(dispatcher.getState().selectedLid).toBe('e2');
  });
});
