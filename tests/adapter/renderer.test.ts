/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { formPresenter } from '@adapter/ui/form-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test Container',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'Body of entry one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    {
      lid: 'e2',
      title: 'Entry Two',
      body: 'Body of entry two',
      archetype: 'todo',
      created_at: '2026-01-01T00:01:00Z',
      updated_at: '2026-01-01T00:01:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => { root.remove(); };
});

describe('Renderer', () => {
  it('renders initializing phase', () => {
    const state: AppState = {
      phase: 'initializing', container: null,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('initializing');
    expect(root.textContent).toContain('initializing');
  });

  it('renders error phase with message', () => {
    const state: AppState = {
      phase: 'error', container: null,
      selectedLid: null, editingLid: null, error: 'test error', embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('error');
    expect(root.textContent).toContain('test error');
  });

  it('renders ready phase with entry list', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('ready');

    // Header shows container title
    const header = root.querySelector('.pkc-header-title');
    expect(header?.textContent).toBe('Test Container');

    // Sidebar shows entries (sorted by created_at desc: e2 before e1)
    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(2);

    // Default sort: created_at desc → e2 (newer) first
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2');
    expect(items[1]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('marks selected entry with data-pkc-selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('renders detail view for selected entry', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const detail = root.querySelector('[data-pkc-region="center"]');
    expect(detail).not.toBeNull();

    const viewTitle = detail!.querySelector('.pkc-view-title');
    expect(viewTitle?.textContent).toBe('Entry One');

    // Edit and Delete buttons present
    const editBtn = detail!.querySelector('[data-pkc-action="begin-edit"]');
    expect(editBtn).not.toBeNull();
    expect(editBtn!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('renders editor in editing phase', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor).not.toBeNull();

    const titleInput = editor!.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
    expect(titleInput?.value).toBe('Entry One');

    const bodyArea = editor!.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(bodyArea?.value).toBe('Body of entry one');

    // Save and Cancel buttons (in fixed action bar)
    const center = root.querySelector('[data-pkc-region="center"]')!;
    expect(center.querySelector('[data-pkc-action="commit-edit"]')).not.toBeNull();
    expect(center.querySelector('[data-pkc-action="cancel-edit"]')).not.toBeNull();
  });

  it('shows create button only in ready phase', () => {
    const readyState: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(readyState, root);
    expect(root.querySelector('[data-pkc-action="create-entry"]')).not.toBeNull();

    const editingState: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(editingState, root);
    expect(root.querySelector('[data-pkc-action="create-entry"]')).toBeNull();
  });

  it('shows placeholder when no entries exist', () => {
    const emptyContainer: Container = {
      ...mockContainer,
      entries: [],
    };
    const state: AppState = {
      phase: 'ready', container: emptyContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.textContent).toContain('Create an entry to begin');
  });

  it('shows export buttons with mode and mutability in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const exportBtns = root.querySelectorAll('[data-pkc-action="begin-export"]');
    expect(exportBtns).toHaveLength(4);
    // Editable Light
    expect(exportBtns[0]!.getAttribute('data-pkc-export-mode')).toBe('light');
    expect(exportBtns[0]!.getAttribute('data-pkc-export-mutability')).toBe('editable');
    expect(exportBtns[0]!.textContent).toBe('Light');
    // Editable Full
    expect(exportBtns[1]!.getAttribute('data-pkc-export-mode')).toBe('full');
    expect(exportBtns[1]!.getAttribute('data-pkc-export-mutability')).toBe('editable');
    expect(exportBtns[1]!.textContent).toBe('Full');
    // Readonly Light
    expect(exportBtns[2]!.getAttribute('data-pkc-export-mode')).toBe('light');
    expect(exportBtns[2]!.getAttribute('data-pkc-export-mutability')).toBe('readonly');
    // Readonly Full
    expect(exportBtns[3]!.getAttribute('data-pkc-export-mode')).toBe('full');
    expect(exportBtns[3]!.getAttribute('data-pkc-export-mutability')).toBe('readonly');
  });

  it('shows exporting badge in exporting phase', () => {
    const state: AppState = {
      phase: 'exporting', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-action="begin-export"]')).toBeNull();
    expect(root.textContent).toContain('Exporting');
  });

  it('readonly mode: no edit/create/delete/export buttons, shows rehydrate', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true,
    };
    render(state, root);
    // No create buttons
    expect(root.querySelector('[data-pkc-action="create-entry"]')).toBeNull();
    // No export buttons
    expect(root.querySelector('[data-pkc-action="begin-export"]')).toBeNull();
    // No edit button in detail view
    expect(root.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    // No delete button in detail view
    expect(root.querySelector('[data-pkc-action="delete-entry"]')).toBeNull();
    // No import button
    expect(root.querySelector('[data-pkc-action="begin-import"]')).toBeNull();
    // Has rehydrate button
    const rehydrateBtn = root.querySelector('[data-pkc-action="rehydrate"]');
    expect(rehydrateBtn).not.toBeNull();
    expect(rehydrateBtn!.textContent).toBe('Rehydrate to Workspace');
    // Has readonly badge
    expect(root.textContent).toContain('Readonly');
  });

  it('readonly mode: shows data-pkc-readonly=true on root', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-readonly')).toBe('true');
  });

  it('readonly mode: search/filter/sort still work', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'test', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true,
    };
    render(state, root);
    // Search input exists
    const searchInput = root.querySelector('[data-pkc-field="search"]');
    expect(searchInput).not.toBeNull();
    // Sort controls exist
    expect(root.querySelector('[data-pkc-region="sort-controls"]')).not.toBeNull();
  });

  it('readonly mode with export buttons shows all 4 mutability variants in editable mode', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const exportBtns = root.querySelectorAll('[data-pkc-action="begin-export"]');
    expect(exportBtns).toHaveLength(4);
    // Check mutability attributes
    const mutabilities = Array.from(exportBtns).map(b => b.getAttribute('data-pkc-export-mutability'));
    expect(mutabilities).toContain('editable');
    expect(mutabilities).toContain('readonly');
  });

  it('uses data-pkc-* attributes for all action elements', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    // All interactive elements use data-pkc-action
    const actionEls = root.querySelectorAll('[data-pkc-action]');
    expect(actionEls.length).toBeGreaterThan(0);

    // No action relies on class name alone
    for (const el of actionEls) {
      expect(el.getAttribute('data-pkc-action')).toBeTruthy();
    }
  });

  it('sets data-pkc-embedded=false for standalone', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('false');
  });

  it('sets data-pkc-embedded=true for embedded', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: true, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('true');
  });

  it('sets data-pkc-capabilities with current capabilities', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const caps = root.getAttribute('data-pkc-capabilities');
    expect(caps).toBeTruthy();
    expect(caps).toContain('core');
    expect(caps).toContain('export');
    expect(caps).toContain('record-offer');
  });

  it('does not show pending offers bar when empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="pending-offers"]')).toBeNull();
  });

  it('shows pending offers bar with accept/dismiss buttons', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [
        {
          offer_id: 'o1', title: 'Offered Record', body: 'content',
          archetype: 'text', source_container_id: null,
          reply_to_id: null, received_at: '2026-01-01T00:00:00Z',
        },
      ], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const bar = root.querySelector('[data-pkc-region="pending-offers"]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('1 pending offer');
    expect(bar!.textContent).toContain('Offered Record');

    const acceptBtn = bar!.querySelector('[data-pkc-action="accept-offer"]');
    expect(acceptBtn).not.toBeNull();
    expect(acceptBtn!.getAttribute('data-pkc-offer-id')).toBe('o1');

    const dismissBtn = bar!.querySelector('[data-pkc-action="dismiss-offer"]');
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn!.getAttribute('data-pkc-offer-id')).toBe('o1');
  });

  it('shows revision badge on entries with revisions', () => {
    const containerWithRevisions: Container = {
      ...mockContainer,
      revisions: [
        { id: 'rev-1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' },
        { id: 'rev-2', entry_lid: 'e1', snapshot: '{}', created_at: '2026-01-02T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRevisions,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const badge = root.querySelector('[data-pkc-revision-count="2"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('2 versions');
  });

  it('does not show revision badge on entries without revisions', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-revision-count]')).toBeNull();
  });

  it('renders import confirmation panel when importPreview is set', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: {
        title: 'Imported PKC',
        container_id: 'import-123',
        entry_count: 5,
        revision_count: 2,
        schema_version: 1,
        source: 'backup.html',
        container: mockContainer,
      }, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="import-confirm"]');
    expect(panel).not.toBeNull();

    // Warning text
    const warning = panel!.querySelector('.pkc-import-warning');
    expect(warning?.textContent).toContain('fully replace');
    expect(warning?.textContent).toContain('not a merge');

    // Summary
    const summary = panel!.querySelector('[data-pkc-region="import-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('backup.html');
    expect(summary!.textContent).toContain('Imported PKC');
    expect(summary!.textContent).toContain('5');

    // Confirm and cancel buttons
    const confirmBtn = panel!.querySelector('[data-pkc-action="confirm-import"]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.textContent).toContain('Replace');

    const cancelBtn = panel!.querySelector('[data-pkc-action="cancel-import"]');
    expect(cancelBtn).not.toBeNull();
  });

  it('does not render import panel when importPreview is null', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="import-confirm"]')).toBeNull();
  });

  it('shows revision info in detail view for entry with revisions', () => {
    const containerWithRevisions: Container = {
      ...mockContainer,
      revisions: [
        { id: 'rev-1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRevisions,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const revInfo = root.querySelector('[data-pkc-region="revision-info"]');
    expect(revInfo).not.toBeNull();
    expect(revInfo!.textContent).toContain('History');
  });

  it('shows restore button in revision info for selected entry', () => {
    const containerWithRevisions: Container = {
      ...mockContainer,
      revisions: [
        {
          id: 'rev-1', entry_lid: 'e1',
          snapshot: JSON.stringify({ lid: 'e1', title: 'Old', body: 'old body', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRevisions,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const restoreBtn = root.querySelector('[data-pkc-action="restore-entry"]');
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn!.getAttribute('data-pkc-lid')).toBe('e1');
    expect(restoreBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-1');
    expect(restoreBtn!.textContent).toContain('Revert');
  });

  it('shows restore candidates for deleted entries', () => {
    const containerWithDeletedRevisions: Container = {
      ...mockContainer,
      // e1 is in entries, but 'deleted-lid' is not — it's a deleted entry
      revisions: [
        {
          id: 'rev-del', entry_lid: 'deleted-lid',
          snapshot: JSON.stringify({ lid: 'deleted-lid', title: 'Deleted Entry', body: 'gone', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }),
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithDeletedRevisions,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('1 restorable');
    expect(section!.textContent).toContain('Deleted Entry');
    expect(section!.textContent).toContain('Note'); // archetype badge (label)

    const restoreBtn = section!.querySelector('[data-pkc-action="restore-entry"]');
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn!.getAttribute('data-pkc-lid')).toBe('deleted-lid');
    expect(restoreBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-del');
    expect(restoreBtn!.textContent).toContain('Restore deleted entry');
  });

  it('shows data-pkc-has-history on entries with revisions', () => {
    const containerWithRevisions: Container = {
      ...mockContainer,
      revisions: [
        { id: 'rev-1', entry_lid: 'e1', snapshot: '{}', created_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRevisions,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const e1Item = root.querySelector('[data-pkc-lid="e1"]');
    expect(e1Item!.getAttribute('data-pkc-has-history')).toBe('true');

    const e2Item = root.querySelector('[data-pkc-lid="e2"]');
    expect(e2Item!.hasAttribute('data-pkc-has-history')).toBe(false);
  });

  it('shows formatted timestamp and revision preview in detail view', () => {
    const containerWithRevisions: Container = {
      ...mockContainer,
      revisions: [
        {
          id: 'rev-1', entry_lid: 'e1',
          snapshot: JSON.stringify({
            lid: 'e1', title: 'Old Title', body: 'old body',
            archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          }),
          created_at: '2026-03-15T14:30:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRevisions,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const latestRegion = root.querySelector('[data-pkc-region="revision-latest"]');
    expect(latestRegion).not.toBeNull();
    expect(latestRegion!.textContent).toContain('2026-03-15 14:30');

    const preview = root.querySelector('[data-pkc-region="revision-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('Old Title');
  });

  it('shows deletion timestamp on restore candidates', () => {
    const containerWithDeletedRevisions: Container = {
      ...mockContainer,
      revisions: [
        {
          id: 'rev-del', entry_lid: 'deleted-lid',
          snapshot: JSON.stringify({
            lid: 'deleted-lid', title: 'Gone', body: '',
            archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          }),
          created_at: '2026-04-01T09:15:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithDeletedRevisions,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section!.textContent).toContain('2026-04-01 09:15');
    expect(section!.textContent).toContain('Todo'); // archetype label
  });

  it('renders search input when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const input = root.querySelector<HTMLInputElement>('[data-pkc-field="search"]');
    expect(input).not.toBeNull();
    expect(input!.type).toBe('text');
    expect(input!.value).toBe('');
  });

  it('does not render search input when no entries', () => {
    const emptyContainer: Container = { ...mockContainer, entries: [] };
    const state: AppState = {
      phase: 'ready', container: emptyContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-field="search"]')).toBeNull();
  });

  it('filters entries by search query', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('shows "No matching entries" when search has no results', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'zzzzz', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    expect(root.textContent).toContain('No matching entries');
    expect(root.querySelectorAll('[data-pkc-action="select-entry"]')).toHaveLength(0);
  });

  it('preserves search input value from state', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'hello', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const input = root.querySelector<HTMLInputElement>('[data-pkc-field="search"]');
    expect(input!.value).toBe('hello');
  });

  it('renders archetype filter bar when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const bar = root.querySelector('[data-pkc-region="archetype-filter"]');
    expect(bar).not.toBeNull();

    const allBtn = bar!.querySelector('[data-pkc-archetype=""]');
    expect(allBtn).not.toBeNull();
    expect(allBtn!.textContent).toBe('All');
    expect(allBtn!.getAttribute('data-pkc-active')).toBe('true');

    const textBtn = bar!.querySelector('[data-pkc-archetype="text"]');
    expect(textBtn).not.toBeNull();
    expect(textBtn!.textContent).toBe('Note');
  });

  it('marks active archetype filter button', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const todoBtn = root.querySelector('[data-pkc-action="set-archetype-filter"][data-pkc-archetype="todo"]');
    expect(todoBtn!.getAttribute('data-pkc-active')).toBe('true');

    const allBtn = root.querySelector('[data-pkc-action="set-archetype-filter"][data-pkc-archetype=""]');
    expect(allBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('filters entries by archetype', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2');
  });

  it('shows result count when filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'text', tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('shows result count when search query is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('does not show result count when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="result-count"]')).toBeNull();
  });

  it('shows clear-filters button when search query is non-empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'test', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.textContent).toBe('×');
  });

  it('shows clear-filters button when archetype filter is set', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
  });

  it('does not show clear-filters button when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-action="clear-filters"]')).toBeNull();
  });

  it('renders sort controls when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const sortRegion = root.querySelector('[data-pkc-region="sort-controls"]');
    expect(sortRegion).not.toBeNull();

    const keySelect = sortRegion!.querySelector<HTMLSelectElement>('[data-pkc-field="sort-key"]');
    expect(keySelect).not.toBeNull();
    expect(keySelect!.value).toBe('created_at');

    const dirSelect = sortRegion!.querySelector<HTMLSelectElement>('[data-pkc-field="sort-direction"]');
    expect(dirSelect).not.toBeNull();
    expect(dirSelect!.value).toBe('desc');
  });

  it('sort select reflects current sort state', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const sortControls = root.querySelector('[data-pkc-sort-key]');
    expect(sortControls).not.toBeNull();
    expect(sortControls!.getAttribute('data-pkc-sort-key')).toBe('title');
    expect(sortControls!.getAttribute('data-pkc-sort-direction')).toBe('asc');
  });

  it('applies sort after filter (filter → sort pipeline)', () => {
    // mockContainer has e1 (text, 00:00) and e2 (todo, 00:01)
    // Sort by title asc: e1 "Entry One" < e2 "Entry Two"
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1'); // Entry One
    expect(items[1]!.getAttribute('data-pkc-lid')).toBe('e2'); // Entry Two
  });

  it('applies sort after filter: desc reverses order', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'title', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2'); // Entry Two
    expect(items[1]!.getAttribute('data-pkc-lid')).toBe('e1'); // Entry One
  });

  it('filter narrows then sort orders the result', () => {
    // Filter to "One" → only e1. Sort does not change single item.
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, tagFilter: null, sortKey: 'title', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  // ── Relation UI ──────────────────

  it('shows relation sections when entry has relations', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).not.toBeNull();

    // Outbound group for e1
    const outbound = relRegion!.querySelector('[data-pkc-relation-direction="outbound"]');
    expect(outbound).not.toBeNull();
  });

  it('shows relation kind badge', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const kindBadge = root.querySelector('.pkc-relation-kind');
    expect(kindBadge).not.toBeNull();
    expect(kindBadge!.textContent).toBe('structural');
  });

  it('shows inbound relations for target entry', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const inbound = root.querySelector('[data-pkc-relation-direction="inbound"]');
    expect(inbound).not.toBeNull();
    const peer = inbound!.querySelector('[data-pkc-action="select-entry"]');
    expect(peer).not.toBeNull();
    expect(peer!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('relation peer link has select-entry action for navigation', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const peer = root.querySelector('.pkc-relation-peer');
    expect(peer).not.toBeNull();
    expect(peer!.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(peer!.getAttribute('data-pkc-lid')).toBe('e2');
    expect(peer!.textContent).toBe('Entry Two');
  });

  it('does not show relation section when no relations exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).toBeNull();
  });

  it('shows relation creation form in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const createForm = root.querySelector('[data-pkc-region="relation-create"]');
    expect(createForm).not.toBeNull();
    expect(createForm!.getAttribute('data-pkc-from')).toBe('e1');

    // Target select excludes current entry
    const targetSelect = createForm!.querySelector('[data-pkc-field="relation-target"]');
    expect(targetSelect).not.toBeNull();
    const options = targetSelect!.querySelectorAll('option');
    // 1 default + 1 other entry (e2)
    expect(options).toHaveLength(2);

    // Kind select
    const kindSelect = createForm!.querySelector('[data-pkc-field="relation-kind"]');
    expect(kindSelect).not.toBeNull();

    // Create button
    const createBtn = createForm!.querySelector('[data-pkc-action="create-relation"]');
    expect(createBtn).not.toBeNull();
  });

  it('does not show relation create form in editing phase', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const createForm = root.querySelector('[data-pkc-region="relation-create"]');
    expect(createForm).toBeNull();
  });

  // ── Tags UI ──────────────────

  it('shows tag chips for categorical relations', () => {
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const tagRegion = root.querySelector('[data-pkc-region="tags"]');
    expect(tagRegion).not.toBeNull();

    const chips = tagRegion!.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(1);

    const label = chips[0]!.querySelector('.pkc-tag-label');
    expect(label!.textContent).toBe('Entry Two');
  });

  it('shows remove button on tag chips in ready phase', () => {
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const removeBtn = root.querySelector('[data-pkc-action="remove-tag"]');
    expect(removeBtn).not.toBeNull();
    expect(removeBtn!.getAttribute('data-pkc-relation-id')).toBe('r1');
  });

  it('does not show non-categorical relations as tags', () => {
    const containerMixed: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerMixed,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const chips = root.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(1); // only categorical
  });

  it('shows tag add form with available targets', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const addForm = root.querySelector('[data-pkc-region="tag-add"]');
    expect(addForm).not.toBeNull();
    expect(addForm!.getAttribute('data-pkc-from')).toBe('e1');

    const select = addForm!.querySelector('[data-pkc-field="tag-target"]');
    expect(select).not.toBeNull();

    const addBtn = addForm!.querySelector('[data-pkc-action="add-tag"]');
    expect(addBtn).not.toBeNull();
  });

  it('tag add form excludes already-tagged entries', () => {
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    // e2 is already tagged, so no available targets (only 2 entries total)
    const addForm = root.querySelector('[data-pkc-region="tag-add"]');
    expect(addForm).toBeNull(); // no form when all tagged
  });

  it('tags section always shows even with no tags', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const tagRegion = root.querySelector('[data-pkc-region="tags"]');
    expect(tagRegion).not.toBeNull();
    // No chips
    const chips = tagRegion!.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(0);
  });

  // ── Tag Filter UI ──────────────────

  it('tag chip label has filter-by-tag action', () => {
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const chipLabel = root.querySelector('.pkc-tag-label');
    expect(chipLabel).not.toBeNull();
    expect(chipLabel!.getAttribute('data-pkc-action')).toBe('filter-by-tag');
    expect(chipLabel!.getAttribute('data-pkc-lid')).toBe('e2');
  });

  it('shows tag filter indicator when tag filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const indicator = root.querySelector('[data-pkc-region="tag-filter-indicator"]');
    expect(indicator).not.toBeNull();
    expect(indicator!.textContent).toContain('Entry Two');

    const clearBtn = indicator!.querySelector('[data-pkc-action="clear-tag-filter"]');
    expect(clearBtn).not.toBeNull();
  });

  it('tag filter narrows sidebar entries', () => {
    // e1 tagged with e2 (categorical), e2 not tagged
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('tag filter combines with query and sort', () => {
    // 3 entries: e1 (text), e2 (todo), e3 (text)
    // e1 and e3 tagged with e2, sort by title asc
    const threeEntries: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'e3', title: 'Entry Three', body: '', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'e3', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: threeEntries,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: 'e2', sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1'); // Entry One
    expect(items[1]!.getAttribute('data-pkc-lid')).toBe('e3'); // Entry Three
  });

  it('result count shows when tag filter is active', () => {
    const containerWithTags: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTags,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toContain('1');
    expect(count!.textContent).toContain('2');
  });

  it('no tag filter indicator when tagFilter is null', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const indicator = root.querySelector('[data-pkc-region="tag-filter-indicator"]');
    expect(indicator).toBeNull();
  });

  // ── Archetype Dispatch ──────────────────

  it('detail view has data-pkc-archetype attribute', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const view = root.querySelector('[data-pkc-mode="view"]');
    expect(view).not.toBeNull();
    expect(view!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('editor has data-pkc-archetype attribute', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor).not.toBeNull();
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('detail view uses presenter for body rendering', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    // Default text presenter renders body as <pre>
    const body = root.querySelector('.pkc-view-body');
    expect(body).not.toBeNull();
    expect(body!.tagName).toBe('PRE');
    expect(body!.textContent).toBe('Body of entry one');
  });

  it('todo archetype entry gets same data-pkc-archetype value', () => {
    // e2 is archetype: 'todo'
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const view = root.querySelector('[data-pkc-mode="view"]');
    expect(view!.getAttribute('data-pkc-archetype')).toBe('todo');
  });

  it('todo entry uses todo presenter when registered', () => {
    registerPresenter('todo', todoPresenter);

    const todoContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 't1', title: 'Buy groceries', body: '{"status":"open","description":"milk and eggs"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: todoContainer,
      selectedLid: 't1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    // Should render todo-specific view, not <pre>
    const todoView = root.querySelector('.pkc-todo-view');
    expect(todoView).not.toBeNull();

    const status = root.querySelector('.pkc-todo-status');
    expect(status).not.toBeNull();
    expect(status!.getAttribute('data-pkc-todo-status')).toBe('open');

    const desc = root.querySelector('.pkc-todo-description');
    expect(desc!.textContent).toBe('milk and eggs');
  });

  it('sidebar shows todo status badge for todo entries', () => {
    registerPresenter('todo', todoPresenter);
    const todoContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 't1', title: 'Open task', body: '{"status":"open","description":"do it"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 't2', title: 'Done task', body: '{"status":"done","description":"did it"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
        { lid: 'n1', title: 'A note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: todoContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    // t1 — open
    const t1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 't1')!;
    const openBadge = t1.querySelector('.pkc-todo-status-badge');
    expect(openBadge).not.toBeNull();
    expect(openBadge!.getAttribute('data-pkc-todo-status')).toBe('open');
    expect(openBadge!.textContent).toBe('[ ]');

    // t2 — done
    const t2 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 't2')!;
    const doneBadge = t2.querySelector('.pkc-todo-status-badge');
    expect(doneBadge!.getAttribute('data-pkc-todo-status')).toBe('done');
    expect(doneBadge!.textContent).toBe('[x]');

    // n1 — no status badge for text entries
    const n1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 'n1')!;
    expect(n1.querySelector('.pkc-todo-status-badge')).toBeNull();
  });

  it('detail view todo toggle button has correct data attributes', () => {
    registerPresenter('todo', todoPresenter);
    const todoContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 't1', title: 'Task', body: '{"status":"open","description":"desc"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: todoContainer,
      selectedLid: 't1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const toggle = root.querySelector('[data-pkc-action="toggle-todo-status"]');
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('data-pkc-lid')).toBe('t1');
    expect(toggle!.getAttribute('data-pkc-todo-status')).toBe('open');
    expect(toggle!.textContent).toBe('[ ]');
  });

  it('header has both Note and Todo create buttons', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const noteBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    expect(noteBtn).not.toBeNull();
    expect(noteBtn!.textContent).toContain('Note');

    const todoBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="todo"]');
    expect(todoBtn).not.toBeNull();
    expect(todoBtn!.textContent).toContain('Todo');

    const formBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="form"]');
    expect(formBtn).not.toBeNull();
    expect(formBtn!.textContent).toContain('Form');
  });

  it('form entry uses form presenter when registered', () => {
    registerPresenter('form', formPresenter);

    const formContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 'f1', title: 'My Form', body: '{"name":"Alice","note":"Hello","checked":true}', archetype: 'form', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: formContainer,
      selectedLid: 'f1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const formView = root.querySelector('.pkc-form-view');
    expect(formView).not.toBeNull();

    const values = formView!.querySelectorAll('.pkc-form-value');
    expect(values[0]!.textContent).toBe('Alice');
    expect(values[2]!.textContent).toBe('Yes');
  });

  it('form entry renders editor with form fields', () => {
    registerPresenter('form', formPresenter);

    const formContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 'f1', title: 'My Form', body: '{"name":"Bob","note":"test","checked":false}', archetype: 'form', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'editing', container: formContainer,
      selectedLid: 'f1', editingLid: 'f1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('form');
    expect(root.querySelector('[data-pkc-field="form-name"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-field="form-note"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-field="form-checked"]')).not.toBeNull();
  });

  // ── Archetype UX Polish (Issue #32) ─────────────────

  it('sidebar badge shows human-readable label and data-pkc-archetype', () => {
    const mixedContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 'n1', title: 'Note', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 't1', title: 'Task', body: '{}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
        { lid: 'f1', title: 'Form', body: '{}', archetype: 'form', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: mixedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    for (const item of items) {
      const badge = item.querySelector('.pkc-archetype-badge');
      expect(badge).not.toBeNull();
      expect(badge!.hasAttribute('data-pkc-archetype')).toBe(true);
    }

    const n1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 'n1')!;
    expect(n1.querySelector('.pkc-archetype-badge')!.textContent).toContain('Note');
    expect(n1.querySelector('.pkc-archetype-badge')!.getAttribute('data-pkc-archetype')).toBe('text');

    const t1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 't1')!;
    expect(t1.querySelector('.pkc-archetype-badge')!.textContent).toContain('Todo');

    const f1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 'f1')!;
    expect(f1.querySelector('.pkc-archetype-badge')!.textContent).toContain('Form');
  });

  it('detail view shows archetype label next to title', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const label = root.querySelector('.pkc-archetype-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Note');
    expect(label!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('editor shows archetype label next to title input', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const label = root.querySelector('.pkc-archetype-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Note');
    expect(label!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('archetype filter bar uses human-readable labels', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const bar = root.querySelector('[data-pkc-region="archetype-filter"]');
    expect(bar).not.toBeNull();
    const allBtn = bar!.querySelector('[data-pkc-archetype=""]');
    expect(allBtn!.textContent).toBe('All');
    const textBtn = bar!.querySelector('[data-pkc-archetype="text"]');
    expect(textBtn!.textContent).toBe('Note');
    const todoBtn = bar!.querySelector('[data-pkc-archetype="todo"]');
    expect(todoBtn!.textContent).toBe('Todo');
    const formBtn = bar!.querySelector('[data-pkc-archetype="form"]');
    expect(formBtn!.textContent).toBe('Form');
  });

  it('header has Attachment create button', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const attBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="attachment"]');
    expect(attBtn).not.toBeNull();
    expect(attBtn!.textContent).toContain('File');
  });

  it('attachment entry uses attachment presenter when registered', () => {
    registerPresenter('attachment', attachmentPresenter);

    const attContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 'a1', title: 'My File', body: '{"name":"doc.pdf","mime":"application/pdf","data":"AQID"}', archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: attContainer,
      selectedLid: 'a1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const attView = root.querySelector('.pkc-attachment-view');
    expect(attView).not.toBeNull();
    expect(root.querySelector('.pkc-attachment-filename')!.textContent).toBe('doc.pdf');
    expect(root.querySelector('.pkc-attachment-mime-badge')!.textContent).toBe('application/pdf');
  });

  it('attachment entry renders editor with file input', () => {
    registerPresenter('attachment', attachmentPresenter);

    const attContainer: Container = {
      ...mockContainer,
      entries: [
        { lid: 'a1', title: 'My File', body: '{"name":"x.bin","mime":"application/octet-stream","data":""}', archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'editing', container: attContainer,
      selectedLid: 'a1', editingLid: 'a1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('attachment');
    expect(root.querySelector('[data-pkc-field="attachment-file"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-field="attachment-name"]')).not.toBeNull();
  });

  // ── Export/Import panel structure tests ──

  it('renders export/import panel with three sections in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel).not.toBeNull();
    const sections = panel!.querySelectorAll('.pkc-eip-section');
    expect(sections).toHaveLength(3);
  });

  it('export/import panel has HTML Export, ZIP Package, and Import headings', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const headings = root.querySelectorAll('.pkc-eip-heading');
    const texts = Array.from(headings).map(h => h.textContent);
    expect(texts).toContain('HTML Export');
    expect(texts).toContain('ZIP Package');
    expect(texts).toContain('Import');
  });

  it('HTML section has editable and readonly groups with labels', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const groupLabels = root.querySelectorAll('.pkc-eip-group-label');
    const texts = Array.from(groupLabels).map(l => l.textContent);
    expect(texts).toContain('Editable');
    expect(texts).toContain('Readonly');
  });

  it('export/import panel has mode descriptions', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const descs = root.querySelectorAll('.pkc-eip-desc');
    const texts = Array.from(descs).map(d => d.textContent);
    expect(texts.some(t => t!.includes('HTML'))).toBe(true);
    expect(texts.some(t => t!.includes('backup'))).toBe(true);
    expect(texts.some(t => t!.includes('Replaces'))).toBe(true);
  });

  it('shows hints explaining Light vs Full', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const hints = root.querySelectorAll('.pkc-eip-hint');
    const texts = Array.from(hints).map(h => h.textContent);
    expect(texts.some(t => t!.includes('Text only'))).toBe(true);
    expect(texts.some(t => t!.includes('attachments'))).toBe(true);
  });

  it('shows guardrail warnings in panel when assets exist', () => {
    const containerWithAssets: Container = {
      ...mockContainer,
      assets: { 'ast-1': 'AAAA'.repeat(1000) },
    };
    const state: AppState = {
      phase: 'ready', container: containerWithAssets,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const guardrails = root.querySelectorAll('[data-pkc-region="export-guardrails"]');
    expect(guardrails.length).toBeGreaterThan(0);
  });

  it('does not render export/import panel in readonly mode', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="export-import-panel"]')).toBeNull();
  });

  it('export ZIP button is inside ZIP section', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const zipBtn = root.querySelector('[data-pkc-action="export-zip"]');
    expect(zipBtn).not.toBeNull();
    expect(zipBtn!.textContent).toBe('Export ZIP');
  });

  it('import button is inside Import section', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const importBtn = root.querySelector('[data-pkc-action="begin-import"]');
    expect(importBtn).not.toBeNull();
    expect(importBtn!.textContent).toBe('Import');
  });
});

// ── Issue #50: Folder UX Hardening ──

describe('Folder UX Hardening', () => {
  const folderContainer: Container = {
    meta: {
      container_id: 'test-id', title: 'Test', created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z', schema_version: 1,
    },
    entries: [
      { lid: 'f1', title: 'My Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'e1', title: 'Note in Folder', body: 'content', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'e2', title: 'Root Note', body: 'root content', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'e1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  const baseState: AppState = {
    phase: 'ready', container: folderContainer,
    selectedLid: null, editingLid: null, error: null, embedded: false,
    pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
    tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    exportMode: null, exportMutability: null, readonly: false,
  };

  it('shows tree with folder and child in sidebar', () => {
    render({ ...baseState }, root);
    const items = root.querySelectorAll('.pkc-entry-item');
    // Tree mode: f1, e1 (child of f1), e2 (root)
    expect(items.length).toBeGreaterThanOrEqual(3);
    // Folder should have data-pkc-folder attribute
    const folderItem = root.querySelector('[data-pkc-folder="true"]');
    expect(folderItem).not.toBeNull();
  });

  it('shows child count on folder node in tree', () => {
    render({ ...baseState }, root);
    const folderCount = root.querySelector('.pkc-folder-count');
    expect(folderCount).not.toBeNull();
    expect(folderCount!.textContent).toBe('(1)');
  });

  it('shows context folder indicator when folder is selected', () => {
    render({ ...baseState, selectedLid: 'f1' }, root);
    const ctx = root.querySelector('[data-pkc-region="create-context"]');
    expect(ctx).not.toBeNull();
    expect(ctx!.textContent).toContain('My Folder');
  });

  it('shows context folder when child of folder is selected', () => {
    render({ ...baseState, selectedLid: 'e1' }, root);
    const ctx = root.querySelector('[data-pkc-region="create-context"]');
    expect(ctx).not.toBeNull();
    expect(ctx!.textContent).toContain('My Folder');
  });

  it('does not show context folder when root entry is selected', () => {
    render({ ...baseState, selectedLid: 'e2' }, root);
    const ctx = root.querySelector('[data-pkc-region="create-context"]');
    expect(ctx).toBeNull();
  });

  it('create buttons have data-pkc-context-folder when folder is selected', () => {
    render({ ...baseState, selectedLid: 'f1' }, root);
    const createBtns = root.querySelectorAll('[data-pkc-action="create-entry"]');
    expect(createBtns.length).toBeGreaterThan(0);
    for (const btn of createBtns) {
      expect(btn.getAttribute('data-pkc-context-folder')).toBe('f1');
    }
  });

  it('shows breadcrumb with current entry name for child entries', () => {
    render({ ...baseState, selectedLid: 'e1' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    // Should show "My Folder > Note in Folder"
    const items = bc!.querySelectorAll('.pkc-breadcrumb-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toBe('My Folder');
    const current = bc!.querySelector('.pkc-breadcrumb-current');
    expect(current).not.toBeNull();
    expect(current!.textContent).toBe('Note in Folder');
  });

  it('shows folder contents section when folder is selected', () => {
    render({ ...baseState, selectedLid: 'f1' }, root);
    const contents = root.querySelector('[data-pkc-region="folder-contents"]');
    expect(contents).not.toBeNull();
    const contentItems = contents!.querySelectorAll('.pkc-folder-contents-item');
    expect(contentItems).toHaveLength(1);
    expect(contentItems[0]!.textContent).toContain('Note in Folder');
  });

  it('shows empty message for empty folder', () => {
    const emptyFolderContainer = {
      ...folderContainer,
      entries: [
        { lid: 'f2', title: 'Empty Folder', body: '', archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [],
    };
    render({ ...baseState, container: emptyFolderContainer, selectedLid: 'f2' }, root);
    const contents = root.querySelector('[data-pkc-region="folder-contents"]');
    expect(contents).not.toBeNull();
    const emptyMsg = contents!.querySelector('.pkc-folder-contents-empty');
    expect(emptyMsg).not.toBeNull();
    expect(emptyMsg!.textContent).toContain('empty');
  });

  it('shows current parent in move-to-folder section', () => {
    render({ ...baseState, selectedLid: 'e1' }, root);
    const moveSection = root.querySelector('[data-pkc-region="move-to-folder"]');
    expect(moveSection).not.toBeNull();
    const currentLoc = moveSection!.querySelector('.pkc-move-current');
    expect(currentLoc).not.toBeNull();
    expect(currentLoc!.textContent).toContain('My Folder');
  });

  it('move select shows "Move to root level" option when entry has parent', () => {
    render({ ...baseState, selectedLid: 'e1' }, root);
    const select = root.querySelector('[data-pkc-field="move-target"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const firstOpt = select.options[0];
    expect(firstOpt!.textContent).toContain('Root level');
  });
});

// ── Issue #51: Three-Pane Layout + Fixed Action Bar ──

describe('Three-Pane Layout', () => {
  it('renders 3 pane regions when entry is selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="sidebar"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="center"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="meta"]')).not.toBeNull();
  });

  it('meta pane not rendered when no entry selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="sidebar"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="center"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="meta"]')).toBeNull();
  });

  it('fixed action bar shows Edit/Delete in view mode', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="begin-edit"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="delete-entry"]')).not.toBeNull();
  });

  it('fixed action bar shows Save/Cancel in edit mode', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="commit-edit"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="cancel-edit"]')).not.toBeNull();
  });

  it('meta pane shows tags and timestamps', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const meta = root.querySelector('[data-pkc-region="meta"]');
    expect(meta).not.toBeNull();
    expect(meta!.querySelector('[data-pkc-region="tags"]')).not.toBeNull();
    expect(meta!.textContent).toContain('Created');
  });

  it('create buttons have tooltip titles', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const createBtns = root.querySelectorAll('[data-pkc-action="create-entry"]');
    for (const btn of createBtns) {
      expect(btn.getAttribute('title')).not.toBeNull();
    }
  });

  it('archetype icons in sidebar badges', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null,
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false,
    };
    render(state, root);
    const badges = root.querySelectorAll('.pkc-archetype-badge');
    expect(badges.length).toBeGreaterThan(0);
    for (const badge of badges) {
      expect(badge.textContent!.length).toBeGreaterThan(2);
    }
  });
});
