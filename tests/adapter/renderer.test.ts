/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, renderContextMenu, renderDetachedPanel, buildStorageProfileOverlay } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { todoPresenter } from '@adapter/ui/todo-presenter';
import { formPresenter } from '@adapter/ui/form-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('initializing');
    expect(root.textContent).toContain('initializing');
  });

  it('renders error phase with message', () => {
    const state: AppState = {
      phase: 'error', container: null,
      selectedLid: null, editingLid: null, error: 'test error', embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('error');
    expect(root.textContent).toContain('test error');
  });

  it('renders ready phase with entry list', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('renders detail view for selected entry', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(readyState, root);
    expect(root.querySelector('[data-pkc-action="create-entry"]')).not.toBeNull();

    const editingState: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(editingState, root);
    expect(root.querySelector('[data-pkc-action="create-entry"]')).toBeNull();
  });

  it('shows drop zone invitation when no entries exist', () => {
    const emptyContainer: Container = {
      ...mockContainer,
      entries: [],
    };
    const state: AppState = {
      phase: 'ready', container: emptyContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    // Drop zone replaces the old placeholder when editable
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();
    expect(root.textContent).toContain('Drop a file');
    expect(root.textContent).toContain('create an entry');
  });

  it('shows inline export buttons (Export + Light) in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const exportBtns = root.querySelectorAll('[data-pkc-action="begin-export"]');
    expect(exportBtns).toHaveLength(2);
    // Full (editable) — primary export
    expect(exportBtns[0]!.getAttribute('data-pkc-export-mode')).toBe('full');
    expect(exportBtns[0]!.getAttribute('data-pkc-export-mutability')).toBe('editable');
    expect(exportBtns[0]!.textContent).toBe('Export');
    // Light (editable)
    expect(exportBtns[1]!.getAttribute('data-pkc-export-mode')).toBe('light');
    expect(exportBtns[1]!.getAttribute('data-pkc-export-mutability')).toBe('editable');
    expect(exportBtns[1]!.textContent).toBe('Light');
  });

  it('shows exporting badge in exporting phase', () => {
    const state: AppState = {
      phase: 'exporting', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-action="begin-export"]')).toBeNull();
    expect(root.textContent).toContain('Exporting');
  });

  it('readonly mode: no edit/create/delete/export buttons, shows rehydrate', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-readonly')).toBe('true');
  });

  it('readonly mode: search/filter/sort still work', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'test', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    // Search input exists
    const searchInput = root.querySelector('[data-pkc-field="search"]');
    expect(searchInput).not.toBeNull();
    // Sort controls exist
    expect(root.querySelector('[data-pkc-region="sort-controls"]')).not.toBeNull();
  });

  it('inline export buttons are editable mutability only', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const exportBtns = root.querySelectorAll('[data-pkc-action="begin-export"]');
    expect(exportBtns).toHaveLength(2);
    const mutabilities = Array.from(exportBtns).map(b => b.getAttribute('data-pkc-export-mutability'));
    expect(mutabilities.every(m => m === 'editable')).toBe(true);
  });

  it('uses data-pkc-* attributes for all action elements', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('false');
  });

  it('sets data-pkc-embedded=true for embedded', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: true, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('true');
  });

  it('sets data-pkc-capabilities with current capabilities', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      ], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const badge = root.querySelector('[data-pkc-revision-count="2"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('r2');
  });

  it('does not show revision badge on entries without revisions', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-revision-count]')).toBeNull();
  });

  // ── Sidebar backlink count badge (relations-based only, v1) ──

  it('shows backlink count badge on entries that are targets of relations', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // e2 is the target of 2 relations → badge with count 2 on e2's row
    const e2Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e2"]');
    expect(e2Row).not.toBeNull();
    const badge = e2Row!.querySelector('.pkc-backlink-badge');
    expect(badge).not.toBeNull();
    expect(badge!.getAttribute('data-pkc-backlink-count')).toBe('2');
    expect(badge!.textContent).toBe('←2');
    expect(badge!.getAttribute('title')).toBe('2 incoming relations');

    // e1 is a source only → no badge
    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    expect(e1Row!.querySelector('.pkc-backlink-badge')).toBeNull();
  });

  it('uses singular "1 incoming relation" wording for a single inbound', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const badge = root.querySelector<HTMLElement>(
      '.pkc-entry-item[data-pkc-lid="e2"] .pkc-backlink-badge',
    );
    expect(badge!.textContent).toBe('←1');
    expect(badge!.getAttribute('title')).toBe('1 incoming relation');
  });

  it('does not show backlink badge when no relations exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('.pkc-backlink-badge')).toBeNull();
  });

  // ── v1 relations-based orphan marker ──

  it('marks entries with no relations as orphan', () => {
    // mockContainer has relations: [] — both e1 and e2 are orphans.
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    const e2Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e2"]');
    expect(e1Row!.getAttribute('data-pkc-orphan')).toBe('true');
    expect(e2Row!.getAttribute('data-pkc-orphan')).toBe('true');

    const marker = e1Row!.querySelector<HTMLElement>('.pkc-orphan-marker');
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toBe('○');
    expect(marker!.getAttribute('title')).toBe('No relations yet');
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  it('does not mark entries that participate in any relation as orphan', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // Both e1 (as from) and e2 (as to) appear in the relation → neither is orphan.
    const e1Row = root.querySelector<HTMLElement>('[data-pkc-lid="e1"]');
    const e2Row = root.querySelector<HTMLElement>('[data-pkc-lid="e2"]');
    expect(e1Row!.hasAttribute('data-pkc-orphan')).toBe(false);
    expect(e2Row!.hasAttribute('data-pkc-orphan')).toBe(false);
    expect(root.querySelector('.pkc-orphan-marker')).toBeNull();
  });

  it('marks only the disconnected entry when one of several is connected', () => {
    // Add a third entry e3 that has no relation.
    const containerMixed: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'e3', title: 'Loner', body: '', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerMixed,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('.pkc-entry-item[data-pkc-lid="e1"]')!.hasAttribute('data-pkc-orphan')).toBe(false);
    expect(root.querySelector('.pkc-entry-item[data-pkc-lid="e2"]')!.hasAttribute('data-pkc-orphan')).toBe(false);
    expect(root.querySelector('.pkc-entry-item[data-pkc-lid="e3"]')!.getAttribute('data-pkc-orphan')).toBe('true');

    const markers = root.querySelectorAll('.pkc-orphan-marker');
    expect(markers.length).toBe(1);
  });

  it('shows orphan marker in readonly context (informational only)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // Readonly doesn't suppress the marker — it's an informational signal.
    expect(root.querySelectorAll('.pkc-orphan-marker').length).toBeGreaterThan(0);
  });

  // ── S4 Unified Orphan Detection v3 — additive sidebar marker ──

  it('sets data-pkc-connectedness="fully-unconnected" and renders new marker for entries with no relations and no markdown refs', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    expect(e1Row!.getAttribute('data-pkc-connectedness')).toBe('fully-unconnected');

    const marker = e1Row!.querySelector<HTMLElement>('.pkc-unconnected-marker');
    expect(marker).not.toBeNull();
    expect(marker!.textContent).toBe('◌');
    expect(marker!.getAttribute('title')).toBe('Fully unconnected (no relations, no markdown refs)');
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  it('v1 `.pkc-orphan-marker` and v3 `.pkc-unconnected-marker` coexist on fully-unconnected rows (contract §4.5)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    // v1 marker is NOT suppressed by v3 (contract §4.5: "fully-unconnected のとき v1 marker を非表示にしない")
    expect(e1Row!.querySelector('.pkc-orphan-marker')).not.toBeNull();
    expect(e1Row!.querySelector('.pkc-unconnected-marker')).not.toBeNull();
    // v1 attribute unchanged
    expect(e1Row!.getAttribute('data-pkc-orphan')).toBe('true');
    // v3 attribute added
    expect(e1Row!.getAttribute('data-pkc-connectedness')).toBe('fully-unconnected');
  });

  it('entry with only markdown refs (no relations) → connectedness="relations-orphan", v1 marker present, NO v3 marker', () => {
    // e1 references e2 via markdown; e2 has an inbound backlink.
    const containerMd: Container = {
      ...mockContainer,
      entries: [
        { lid: 'e1', title: 'A', body: 'see entry:e2 for details', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'e2', title: 'B', body: '', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerMd,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    const e2Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e2"]');
    // Both are relations-orphan (no container.relations[]), but both have markdown edges,
    // so neither is fully-unconnected.
    expect(e1Row!.getAttribute('data-pkc-connectedness')).toBe('relations-orphan');
    expect(e2Row!.getAttribute('data-pkc-connectedness')).toBe('relations-orphan');
    // v1 marker still present (v1 authoritative for relations-orphan signal).
    expect(e1Row!.querySelector('.pkc-orphan-marker')).not.toBeNull();
    expect(e2Row!.querySelector('.pkc-orphan-marker')).not.toBeNull();
    // v3 marker NOT present — contract §4.4 only renders for fully-unconnected.
    expect(e1Row!.querySelector('.pkc-unconnected-marker')).toBeNull();
    expect(e2Row!.querySelector('.pkc-unconnected-marker')).toBeNull();
  });

  it('entry with a relation → connectedness="connected", no markers', () => {
    const containerRel: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerRel,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e1"]');
    const e2Row = root.querySelector<HTMLElement>('.pkc-entry-item[data-pkc-lid="e2"]');
    expect(e1Row!.getAttribute('data-pkc-connectedness')).toBe('connected');
    expect(e2Row!.getAttribute('data-pkc-connectedness')).toBe('connected');
    expect(root.querySelector('.pkc-orphan-marker')).toBeNull();
    expect(root.querySelector('.pkc-unconnected-marker')).toBeNull();
  });

  it('shows v3 marker in readonly context (viewing is safe, contract §4.4 has no edit semantics)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const markers = root.querySelectorAll('.pkc-unconnected-marker');
    expect(markers.length).toBeGreaterThan(0);
    // v1 markers still coexist.
    expect(root.querySelectorAll('.pkc-orphan-marker').length).toBeGreaterThan(0);
  });

  it('v3 marker tooltip avoids bare "orphan" wording (contract §4.2 / §1.2)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const marker = root.querySelector<HTMLElement>('.pkc-unconnected-marker');
    expect(marker).not.toBeNull();
    const tooltip = marker!.getAttribute('title') ?? '';
    // Must not contain the banned bare word `orphan` (contract §1.2).
    expect(tooltip).not.toMatch(/\borphan\b/i);
    expect(tooltip).not.toMatch(/\bunified\b/i);
    expect(tooltip).not.toMatch(/\bisolated\b/i);
    expect(tooltip).not.toMatch(/\bdisconnected\b/i);
    // Must contain the canonical concept phrase.
    expect(tooltip).toMatch(/fully unconnected/i);
  });

  it('does not render v3 attribute/marker when container is null (initializing phase)', () => {
    const state: AppState = {
      phase: 'initializing', container: null,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // No entries to render; marker/attribute absent by definition.
    expect(root.querySelector('[data-pkc-connectedness]')).toBeNull();
    expect(root.querySelector('.pkc-unconnected-marker')).toBeNull();
  });

  // ── v1 badge click: renders as <button> with open-backlinks action ──

  it('renders backlink badge as a <button> with open-backlinks action + aria-label', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const badge = root.querySelector<HTMLElement>(
      '[data-pkc-lid="e2"] .pkc-backlink-badge',
    );
    expect(badge).not.toBeNull();
    expect(badge!.tagName).toBe('BUTTON');
    expect(badge!.getAttribute('data-pkc-action')).toBe('open-backlinks');
    expect(badge!.getAttribute('data-pkc-lid')).toBe('e2');
    expect(badge!.getAttribute('aria-label')).toBe('Jump to 2 incoming relations');
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
      }, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="import-confirm"]')).toBeNull();
  });

  it('renders batch import preview panel when batchImportPreview is set', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-texts-container-bundle',
        formatLabel: 'TEXT container bundle',
        textCount: 3,
        textlogCount: 2,
        totalEntries: 5,
        compacted: false,
        missingAssetCount: 0,
        isFolderExport: false,
        sourceFolderTitle: null,
        canRestoreFolderStructure: false,
        folderCount: 0,
        source: 'export.texts.zip',
        entries: [
          { index: 0, title: 'Note A', archetype: 'text' },
          { index: 1, title: 'Note B', archetype: 'text' },
          { index: 2, title: 'Note C', archetype: 'text' },
          { index: 3, title: 'Log 1', archetype: 'textlog' },
          { index: 4, title: 'Log 2', archetype: 'textlog' },
        ],
        selectedIndices: [0, 1, 2, 3, 4],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    expect(panel).not.toBeNull();

    // Shows entry counts
    const summary = panel!.querySelector('[data-pkc-region="batch-import-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toContain('TEXT: 3');
    expect(summary!.textContent).toContain('TEXTLOG: 2');
    expect(summary!.textContent).toContain('5 件');

    // Shows format label
    expect(summary!.textContent).toContain('TEXT container bundle');

    // Continue and Cancel buttons
    const continueBtn = panel!.querySelector('[data-pkc-action="confirm-batch-import"]');
    expect(continueBtn).not.toBeNull();
    expect(continueBtn!.textContent).toContain('Continue');

    const cancelBtn = panel!.querySelector('[data-pkc-action="cancel-batch-import"]');
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.textContent).toContain('Cancel');
  });

  it('batch preview shows compacted info when compacted', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-texts-container-bundle',
        formatLabel: 'TEXT container bundle',
        textCount: 1,
        textlogCount: 0,
        totalEntries: 1,
        compacted: true,
        missingAssetCount: 0,
        isFolderExport: false,
        sourceFolderTitle: null,
        canRestoreFolderStructure: false,
        folderCount: 0,
        source: 'test.zip',
        entries: [{ index: 0, title: 'Note', archetype: 'text' }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    expect(panel!.textContent).toContain('Compacted');
  });

  it('batch preview shows missing asset count', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-texts-container-bundle',
        formatLabel: 'TEXT container bundle',
        textCount: 2,
        textlogCount: 0,
        totalEntries: 2,
        compacted: false,
        missingAssetCount: 3,
        isFolderExport: false,
        sourceFolderTitle: null,
        canRestoreFolderStructure: false,
        folderCount: 0,
        source: 'test.zip',
        entries: [{ index: 0, title: 'A', archetype: 'text' }, { index: 1, title: 'B', archetype: 'text' }],
        selectedIndices: [0, 1],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    expect(panel!.textContent).toContain('Missing assets');
    expect(panel!.textContent).toContain('3 件');
  });

  it('batch preview shows folder caveat for folder-export bundles', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-folder-export-bundle',
        formatLabel: 'Folder export bundle',
        textCount: 1,
        textlogCount: 1,
        totalEntries: 2,
        compacted: false,
        missingAssetCount: 0,
        isFolderExport: true,
        sourceFolderTitle: 'Project',
        canRestoreFolderStructure: false,
        folderCount: 0,
        source: 'folder-project.folder-export.zip',
        entries: [{ index: 0, title: 'Doc', archetype: 'text' }, { index: 1, title: 'Log', archetype: 'textlog' }],
        selectedIndices: [0, 1],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    const caveat = panel!.querySelector('[data-pkc-role="folder-caveat"]');
    expect(caveat).not.toBeNull();
    expect(caveat!.textContent).toContain('フォルダ構造は復元されません');
  });

  it('batch preview shows folder restore info when canRestoreFolderStructure is true', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-folder-export-bundle',
        formatLabel: 'Folder export bundle',
        textCount: 2,
        textlogCount: 0,
        totalEntries: 2,
        compacted: false,
        missingAssetCount: 0,
        isFolderExport: true,
        sourceFolderTitle: 'Project',
        canRestoreFolderStructure: true,
        folderCount: 3,
        source: 'folder-project.folder-export.zip',
        entries: [{ index: 0, title: 'Doc A', archetype: 'text' }, { index: 1, title: 'Doc B', archetype: 'text' }],
        selectedIndices: [0, 1],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    // Should NOT show the old caveat
    const caveat = panel!.querySelector('[data-pkc-role="folder-caveat"]');
    expect(caveat).toBeNull();
    // Should show folder restore info
    const restoreInfo = panel!.querySelector('[data-pkc-role="folder-restore-info"]');
    expect(restoreInfo).not.toBeNull();
    expect(restoreInfo!.textContent).toContain('3 folders');
    expect(restoreInfo!.textContent).toContain('復元されます');
  });

  it('batch preview shows malformed metadata warning when folder graph is invalid', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-folder-export-bundle',
        formatLabel: 'Folder export bundle',
        textCount: 1,
        textlogCount: 0,
        totalEntries: 1,
        compacted: false,
        missingAssetCount: 0,
        isFolderExport: true,
        sourceFolderTitle: 'Root',
        canRestoreFolderStructure: false,
        folderCount: 0,
        malformedFolderMetadata: true,
        folderGraphWarning: 'Self-parent folder: "f1"',
        source: 'bad.folder-export.zip',
        entries: [{ index: 0, title: 'Doc', archetype: 'text' }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const panel = root.querySelector('[data-pkc-region="batch-import-preview"]');
    // Should NOT show restore info or old caveat
    expect(panel!.querySelector('[data-pkc-role="folder-restore-info"]')).toBeNull();
    expect(panel!.querySelector('[data-pkc-role="folder-caveat"]')).toBeNull();
    // Should show malformed warning
    const warning = panel!.querySelector('[data-pkc-role="folder-malformed-warning"]');
    expect(warning).not.toBeNull();
    expect(warning!.textContent).toContain('フォルダ構造に問題があります');
    expect(warning!.textContent).toContain('フラットにインポート');
  });

  it('renders entry list with checkboxes in batch preview', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
          { index: 0, title: 'Note A', archetype: 'text' },
          { index: 1, title: 'Note B', archetype: 'text' },
        ],
        selectedIndices: [0, 1],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const entryList = root.querySelector('[data-pkc-region="batch-entry-list"]');
    expect(entryList).not.toBeNull();

    // Check toggle-all
    const toggleAll = entryList!.querySelector('[data-pkc-action="toggle-all-batch-import-entries"]') as HTMLInputElement;
    expect(toggleAll).not.toBeNull();
    expect(toggleAll.checked).toBe(true);

    // Check entry checkboxes
    const checkboxes = entryList!.querySelectorAll('[data-pkc-action="toggle-batch-import-entry"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);

    // Check titles and archetype badges
    expect(entryList!.textContent).toContain('Note A');
    expect(entryList!.textContent).toContain('Note B');
    expect(entryList!.textContent).toContain('TEXT');
  });

  it('checkbox checked state matches selectedIndices', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
          { index: 0, title: 'Note A', archetype: 'text' },
          { index: 1, title: 'Note B', archetype: 'text' },
        ],
        selectedIndices: [0], // only first selected
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const checkboxes = root.querySelectorAll('[data-pkc-action="toggle-batch-import-entry"]');
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);
  });

  it('Continue button is disabled when selectedIndices is empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
        entries: [{ index: 0, title: 'Note', archetype: 'text' }],
        selectedIndices: [], // none selected
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const continueBtn = root.querySelector('[data-pkc-action="confirm-batch-import"]') as HTMLButtonElement;
    expect(continueBtn).not.toBeNull();
    expect(continueBtn.disabled).toBe(true);
  });

  it('renders target folder picker with existing folders from container', () => {
    const containerWithFolders = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'f1', title: 'Project', body: '', archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'f2', title: 'Archive', body: '', archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithFolders,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
        entries: [{ index: 0, title: 'Note', archetype: 'text' }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const targetRegion = root.querySelector('[data-pkc-region="batch-import-target-folder"]');
    expect(targetRegion).not.toBeNull();
    const select = targetRegion!.querySelector('[data-pkc-action="set-batch-import-target-folder"]') as HTMLSelectElement;
    expect(select).not.toBeNull();
    // Root + 2 folders = 3 options
    expect(select.options).toHaveLength(3);
    expect(select.options[0]!.value).toBe('');
    expect(select.options[0]!.textContent).toContain('Root');
    expect(select.options[1]!.value).toBe('f1');
    expect(select.options[1]!.textContent).toContain('Project');
    expect(select.options[2]!.value).toBe('f2');
    expect(select.options[2]!.textContent).toContain('Archive');
  });

  it('target folder picker selects the current targetFolderLid', () => {
    const containerWithFolders = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'f1', title: 'Project', body: '', archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithFolders,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
        entries: [{ index: 0, title: 'Note', archetype: 'text' }],
        selectedIndices: [0],
        targetFolderLid: 'f1',
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const select = root.querySelector('[data-pkc-action="set-batch-import-target-folder"]') as HTMLSelectElement;
    expect(select.value).toBe('f1');
  });

  it('renders deep preview disclosure for TEXT entry with bodySnippet', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
        entries: [{
          index: 0, title: 'Note', archetype: 'text',
          bodySnippet: 'Hello **world**',
          bodyLength: 15,
          assetCount: 2,
        }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const details = root.querySelector('[data-pkc-role="entry-deep-preview"]') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    // Default collapsed
    expect(details.open).toBe(false);
    // Contains body snippet
    expect(details.textContent).toContain('Hello **world**');
    // Contains metadata
    expect(details.textContent).toContain('15 文字');
    expect(details.textContent).toContain('2 assets');
  });

  it('renders deep preview disclosure for TEXTLOG entry with logSnippets', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-textlogs-container-bundle',
        formatLabel: 'TEXTLOG container bundle',
        textCount: 0,
        textlogCount: 1,
        totalEntries: 1,
        compacted: false,
        missingAssetCount: 0,
        isFolderExport: false,
        sourceFolderTitle: null,
        canRestoreFolderStructure: false,
        folderCount: 0,
        source: 'test.zip',
        entries: [{
          index: 0, title: 'Daily Log', archetype: 'textlog',
          logEntryCount: 42,
          logSnippets: ['Meeting notes', 'Bug fix deployed', 'Code review'],
          assetCount: 1,
          missingAssetCount: 1,
        }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const details = root.querySelector('[data-pkc-role="entry-deep-preview"]') as HTMLDetailsElement;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.textContent).toContain('42 log entries');
    expect(details.textContent).toContain('Meeting notes');
    expect(details.textContent).toContain('Bug fix deployed');
    expect(details.textContent).toContain('Code review');
    expect(details.textContent).toContain('1 missing');
  });

  it('does not render deep preview when no preview fields are present', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
        entries: [{ index: 0, title: 'Note', archetype: 'text' }],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const details = root.querySelector('[data-pkc-role="entry-deep-preview"]');
    expect(details).toBeNull();
  });

  it('deep preview coexists with selective import checkboxes', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
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
          { index: 0, title: 'A', archetype: 'text', bodySnippet: 'snippet A', bodyLength: 100 },
          { index: 1, title: 'B', archetype: 'text', bodySnippet: 'snippet B', bodyLength: 200 },
        ],
        selectedIndices: [0],
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // Checkboxes present and correct
    const checkboxes = root.querySelectorAll('[data-pkc-action="toggle-batch-import-entry"]');
    expect(checkboxes).toHaveLength(2);
    expect((checkboxes[0] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(false);

    // Deep preview disclosures present
    const details = root.querySelectorAll('[data-pkc-role="entry-deep-preview"]');
    expect(details).toHaveLength(2);
  });

  it('does not render batch preview when batchImportPreview is null', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="batch-import-preview"]')).toBeNull();
  });

  it('renders batch import result banner with flat import to root', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [],
      batchImportResult: {
        entryCount: 3, attachmentCount: 1, folderCount: 0,
        restoreStructure: false, actualDestination: '/ (Root)',
        intendedDestination: null, fallbackToRoot: false, source: 'test.zip',
      },
      collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const banner = root.querySelector('[data-pkc-region="batch-import-result"]');
    expect(banner).not.toBeNull();
    const msg = banner!.querySelector('[data-pkc-role="import-result-message"]');
    expect(msg).not.toBeNull();
    expect(msg!.textContent).toContain('3 entries');
    expect(msg!.textContent).toContain('1 attachments');
    expect(msg!.textContent).toContain('/ (Root)');
    expect(msg!.textContent).toContain('flat import');
    // Dismiss button present
    const dismissBtn = banner!.querySelector('[data-pkc-action="dismiss-batch-import-result"]');
    expect(dismissBtn).not.toBeNull();
  });

  it('result banner shows folder destination and restore info', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [],
      batchImportResult: {
        entryCount: 5, attachmentCount: 0, folderCount: 2,
        restoreStructure: true, actualDestination: 'My Folder',
        intendedDestination: null, fallbackToRoot: false, source: 'archive.zip',
      },
      collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const msg = root.querySelector('[data-pkc-role="import-result-message"]')!;
    expect(msg.textContent).toContain('My Folder');
    expect(msg.textContent).toContain('folder structure restored');
    expect(msg.textContent).toContain('2 folders');
    expect(msg.textContent).not.toContain('flat import');
  });

  it('result banner shows fallback warning with intended folder name', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [],
      batchImportResult: {
        entryCount: 2, attachmentCount: 0, folderCount: 0,
        restoreStructure: false, actualDestination: '/ (Root)',
        intendedDestination: 'Project Alpha', fallbackToRoot: true, source: 'import.zip',
      },
      collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const msg = root.querySelector('[data-pkc-role="import-result-message"]')!;
    expect(msg.textContent).toContain('Project Alpha');
    expect(msg.textContent).toContain('was unavailable');
    expect(msg.textContent).toContain('/ (Root)');
    expect(msg.textContent).toContain('flat import');
  });

  it('does not render result banner when batchImportResult is null', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="batch-import-result"]')).toBeNull();
  });

  it('hides result banner when batchImportPreview is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: {
        format: 'pkc2-texts-container-bundle',
        formatLabel: 'TEXT container bundle',
        textCount: 1, textlogCount: 0, totalEntries: 1,
        compacted: false, missingAssetCount: 0, isFolderExport: false,
        sourceFolderTitle: null, canRestoreFolderStructure: false,
        folderCount: 0, source: 'old.zip',
        entries: [{ index: 0, title: 'A', archetype: 'text' as const, bodySnippet: '' }],
        selectedIndices: [0],
        targetFolderLid: null,
      }, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [],
      batchImportResult: {
        entryCount: 1, attachmentCount: 0, folderCount: 0,
        restoreStructure: false, actualDestination: '/ (Root)',
        intendedDestination: null, fallbackToRoot: false, source: 'old.zip',
      },
      collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    // Preview is shown, result banner is hidden
    expect(root.querySelector('[data-pkc-region="batch-import-preview"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="batch-import-result"]')).toBeNull();
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('Deleted');
    expect(section!.textContent).toContain('Deleted Entry');
    expect(section!.textContent).toContain('Text'); // archetype badge (label)

    const restoreBtn = section!.querySelector('[data-pkc-action="restore-entry"]');
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn!.getAttribute('data-pkc-lid')).toBe('deleted-lid');
    expect(restoreBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-del');
    expect(restoreBtn!.textContent).toContain('Restore');
  });

  it('shows Empty Trash button in restore candidates section', () => {
    const deletedContainer: Container = {
      ...mockContainer,
      entries: [mockContainer.entries[0]!],
      revisions: [
        { id: 'rev-del', entry_lid: 'deleted-lid', snapshot: JSON.stringify({ lid: 'deleted-lid', title: 'Del', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }), created_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: deletedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const purgeBtn = root.querySelector('[data-pkc-action="purge-trash"]');
    expect(purgeBtn).not.toBeNull();
    expect(purgeBtn!.textContent).toContain('Empty Trash');
  });

  it('hides Empty Trash button in readonly mode', () => {
    const deletedContainer: Container = {
      ...mockContainer,
      entries: [mockContainer.entries[0]!],
      revisions: [
        { id: 'rev-del', entry_lid: 'deleted-lid', snapshot: JSON.stringify({ lid: 'deleted-lid', title: 'Del', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }), created_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: deletedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-action="purge-trash"]')).toBeNull();
  });

  it('shows multi-selection action bar when multiSelectedLids is non-empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: ['e1', 'e2'], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const bar = root.querySelector('[data-pkc-region="multi-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('2 selected');
    expect(bar!.querySelector('[data-pkc-action="bulk-delete"]')).not.toBeNull();
    expect(bar!.querySelector('[data-pkc-action="clear-multi-select"]')).not.toBeNull();
  });

  it('marks multi-selected entries with data-pkc-multi-selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: ['e1', 'e2'], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const e1 = root.querySelector('.pkc-entry-item[data-pkc-lid="e1"]');
    const e2 = root.querySelector('.pkc-entry-item[data-pkc-lid="e2"]');
    expect(e1!.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(e2!.getAttribute('data-pkc-multi-selected')).toBe('true');
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const e1Item = root.querySelector('.pkc-entry-item[data-pkc-lid="e1"]');
    expect(e1Item!.getAttribute('data-pkc-has-history')).toBe('true');

    const e2Item = root.querySelector('.pkc-entry-item[data-pkc-lid="e2"]');
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section!.textContent).toContain('2026-04-01 09:15');
    expect(section!.textContent).toContain('Todo'); // archetype label
  });

  it('renders search input when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-field="search"]')).toBeNull();
  });

  it('filters entries by search query', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'One', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('shows "No matching entries" when search has no results', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'zzzzz', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.textContent).toContain('No matching entries');
    expect(root.querySelectorAll('[data-pkc-action="select-entry"]')).toHaveLength(0);
  });

  it('preserves search input value from state', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'hello', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const input = root.querySelector<HTMLInputElement>('[data-pkc-field="search"]');
    expect(input!.value).toBe('hello');
  });

  it('renders archetype filter bar when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
    expect(textBtn!.textContent).toBe('Text');
  });

  it('marks active archetype filter button', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(['todo'] as const), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const todoBtn = root.querySelector('[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="todo"]');
    expect(todoBtn!.getAttribute('data-pkc-active')).toBe('true');

    const allBtn = root.querySelector('[data-pkc-action="set-archetype-filter"][data-pkc-archetype=""]');
    expect(allBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('filters entries by archetype', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(['todo'] as const), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2');
  });

  it('shows result count when filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(['text'] as const), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('shows result count when search query is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'One', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('does not show result count when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="result-count"]')).toBeNull();
  });

  it('shows clear-filters button when search query is non-empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'test', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.textContent).toBe('×');
  });

  it('shows clear-filters button when archetype filter is set', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(['todo'] as const), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
  });

  it('does not show clear-filters button when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-action="clear-filters"]')).toBeNull();
  });

  it('renders sort controls when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'title', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'One', archetypeFilter: new Set(), tagFilter: null, sortKey: 'title', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).not.toBeNull();

    // Outgoing relations group for e1 (renamed from "outbound" in v1)
    const outgoing = relRegion!.querySelector('[data-pkc-relation-direction="outgoing"]');
    expect(outgoing).not.toBeNull();
    expect(outgoing!.querySelector('.pkc-relation-heading')!.textContent).toBe(
      'Outgoing relations (1)',
    );
  });

  it('shows relation kind via inline select in editable context (relation-kind-edit v1)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const kindSelect = root.querySelector<HTMLSelectElement>('select.pkc-relation-kind');
    expect(kindSelect).not.toBeNull();
    expect(kindSelect!.value).toBe('structural');
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
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const backlinks = root.querySelector('[data-pkc-relation-direction="backlinks"]');
    expect(backlinks).not.toBeNull();
    expect(backlinks!.querySelector('.pkc-relation-heading')!.textContent).toBe('Backlinks (1)');
    const peer = backlinks!.querySelector('[data-pkc-action="select-entry"]');
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const peer = root.querySelector('.pkc-relation-peer');
    expect(peer).not.toBeNull();
    expect(peer!.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(peer!.getAttribute('data-pkc-lid')).toBe('e2');
    expect(peer!.textContent).toBe('Entry Two');
  });

  it('always shows relation section with empty states when no relations exist (Backlinks v1)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).not.toBeNull();

    const outgoing = relRegion!.querySelector('[data-pkc-relation-direction="outgoing"]');
    expect(outgoing).not.toBeNull();
    expect(outgoing!.querySelector('.pkc-relation-heading')!.textContent).toBe(
      'Outgoing relations (0)',
    );
    expect(outgoing!.querySelector('.pkc-relation-empty')!.textContent).toBe(
      'No outgoing relations.',
    );
    expect(outgoing!.querySelector('.pkc-relation-list')).toBeNull();

    const backlinks = relRegion!.querySelector('[data-pkc-relation-direction="backlinks"]');
    expect(backlinks).not.toBeNull();
    expect(backlinks!.querySelector('.pkc-relation-heading')!.textContent).toBe('Backlinks (0)');
    expect(backlinks!.querySelector('.pkc-relation-empty')!.textContent).toBe('No backlinks.');
    expect(backlinks!.querySelector('.pkc-relation-list')).toBeNull();
  });

  it('Backlinks panel is independent of link-index backlinks section', () => {
    // v1 keeps the two backlink concepts separate: relations-based (Backlinks) and
    // markdown-reference-based (link-index-backlinks). Both should coexist in meta pane.
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const relationBacklinks = root.querySelector(
      '[data-pkc-region="relations"] [data-pkc-relation-direction="backlinks"]',
    );
    const linkIndexBacklinks = root.querySelector('[data-pkc-region="link-index-backlinks"]');
    expect(relationBacklinks).not.toBeNull();
    expect(linkIndexBacklinks).not.toBeNull();
    expect(relationBacklinks).not.toBe(linkIndexBacklinks);
  });

  // ── Unified Backlinks v1 (References umbrella, Option E) ──

  it('renders a single References umbrella region when an entry is selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const references = root.querySelectorAll('[data-pkc-region="references"]');
    expect(references.length).toBe(1);
    const heading = references[0]!.querySelector('.pkc-references-heading');
    expect(heading).not.toBeNull();
    expect(heading!.textContent).toBe('References');
  });

  it('References umbrella contains both relations and link-index sub-panels', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const references = root.querySelector('[data-pkc-region="references"]');
    expect(references).not.toBeNull();
    // Existing sub-panel region ids are preserved inside the umbrella
    // so per-panel selectors, scroll-to targets, and tests keep working.
    expect(references!.querySelector('[data-pkc-region="relations"]')).not.toBeNull();
    expect(references!.querySelector('[data-pkc-region="link-index"]')).not.toBeNull();
  });

  it('References umbrella is not rendered when no entry is selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="references"]')).toBeNull();
  });

  it('relations-based backlinks heading and link-index backlinks heading both survive inside the umbrella', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const references = root.querySelector('[data-pkc-region="references"]');
    expect(references).not.toBeNull();
    const relationsBacklinks = references!.querySelector(
      '[data-pkc-region="relations"] [data-pkc-relation-direction="backlinks"] .pkc-relation-heading',
    );
    const linkIndexBacklinksHeading = references!.querySelector(
      '[data-pkc-region="link-index-backlinks"] .pkc-link-index-heading',
    );
    expect(relationsBacklinks).not.toBeNull();
    expect(linkIndexBacklinksHeading).not.toBeNull();
    // v1 keeps both "Backlinks (N)" sub-headings — umbrella only adds
    // a containing region, it does not merge the sub-concepts.
    expect(relationsBacklinks!.textContent).toMatch(/^Backlinks \(/);
    expect(linkIndexBacklinksHeading!.textContent).toMatch(/^Backlinks \(/);
  });

  // ── References summary row v2 ──

  it('renders References summary row with all three counts below the umbrella heading', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const summary = root.querySelector('[data-pkc-region="references-summary"]');
    expect(summary).not.toBeNull();

    const relItem = summary!.querySelector('[data-pkc-summary-key="relations"]');
    const mdItem = summary!.querySelector('[data-pkc-summary-key="markdown-refs"]');
    const brItem = summary!.querySelector('[data-pkc-summary-key="broken"]');
    expect(relItem!.textContent).toBe('Relations: 0');
    expect(mdItem!.textContent).toBe('Markdown refs: 0');
    expect(brItem!.textContent).toBe('Broken: 0');
  });

  it('References summary row appears inside the umbrella and before sub-panels', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const references = root.querySelector('[data-pkc-region="references"]');
    expect(references).not.toBeNull();
    const children = Array.from(references!.children);
    const headingIdx = children.findIndex((c) => c.classList.contains('pkc-references-heading'));
    const summaryIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-region') === 'references-summary',
    );
    const relationsIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-region') === 'relations',
    );
    const linkIndexIdx = children.findIndex(
      (c) => c.getAttribute('data-pkc-region') === 'link-index',
    );
    expect(headingIdx).toBeGreaterThanOrEqual(0);
    expect(summaryIdx).toBe(headingIdx + 1);
    expect(summaryIdx).toBeLessThan(relationsIdx);
    expect(relationsIdx).toBeLessThan(linkIndexIdx);
  });

  it('References summary row counts relations (outgoing + inbound)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        { lid: 'e3', title: 'Entry Three', body: '', archetype: 'text', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      ],
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r2', from: 'e1', to: 'e3', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'r3', from: 'e3', to: 'e1', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const relItem = root.querySelector('[data-pkc-summary-key="relations"]');
    // 2 outgoing (e1→e2, e1→e3) + 1 inbound (e3→e1) = 3
    expect(relItem!.textContent).toBe('Relations: 3');
  });

  it('References summary row counts markdown refs (outgoing + backlinks) and broken separately', () => {
    const containerWithMdRefs: Container = {
      ...mockContainer,
      entries: [
        { lid: 'e1', title: 'Entry One', body: 'link to [[entry:e2]] and [[entry:missing]]', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'e2', title: 'Entry Two', body: 'refers back to [[entry:e1]]', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithMdRefs,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const mdItem = root.querySelector('[data-pkc-summary-key="markdown-refs"]');
    const brItem = root.querySelector('[data-pkc-summary-key="broken"]');
    // e1 outgoing: [[entry:e2]] (resolved) + [[entry:missing]] (broken) = 2
    // e1 backlinks: from e2 = 1
    // total markdown refs = 3
    expect(mdItem!.textContent).toBe('Markdown refs: 3');
    // broken = 1 (missing target in e1's outgoing)
    expect(brItem!.textContent).toBe('Broken: 1');
    expect(brItem!.getAttribute('data-pkc-broken')).toBe('true');
  });

  it('References summary row Broken item carries broken marker only when count > 0', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const brItem = root.querySelector('[data-pkc-summary-key="broken"]');
    expect(brItem!.textContent).toBe('Broken: 0');
    // No marker when count is 0 (keeps it visually neutral).
    expect(brItem!.getAttribute('data-pkc-broken')).toBeNull();
  });

  it('References summary row is not rendered when no entry is selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="references-summary"]')).toBeNull();
  });

  // ── References summary clickable v3 ──

  it('summary row items render as <button> with jump action and correct target (v3)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const rel = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="relations"]');
    const md = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="markdown-refs"]');
    const br = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="broken"]');

    expect(rel!.tagName).toBe('BUTTON');
    expect(md!.tagName).toBe('BUTTON');
    expect(br!.tagName).toBe('BUTTON');

    expect(rel!.getAttribute('type')).toBe('button');
    expect(rel!.getAttribute('data-pkc-action')).toBe('jump-to-references-section');
    expect(rel!.getAttribute('data-pkc-summary-target')).toBe('relations');
    expect(md!.getAttribute('data-pkc-summary-target')).toBe('link-index');
    expect(br!.getAttribute('data-pkc-summary-target')).toBe('link-index-broken');
  });

  it('summary buttons remain clickable when count is zero (still navigable to empty-state sub-panel)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const rel = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="relations"]');
    expect(rel!.disabled).toBe(false);
    expect(rel!.textContent).toBe('Relations: 0');
    expect(rel!.hasAttribute('data-pkc-action')).toBe(true);
  });

  it('summary buttons expose accessible labels that avoid forbidden wording (v3)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const rel = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="relations"]');
    const md = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="markdown-refs"]');
    const br = root.querySelector<HTMLButtonElement>('[data-pkc-summary-key="broken"]');

    for (const btn of [rel!, md!, br!]) {
      const aria = btn.getAttribute('aria-label') ?? '';
      const title = btn.getAttribute('title') ?? '';
      expect(aria).toMatch(/^Jump to /);
      expect(title).toMatch(/^Jump to /);
      // Labels must not reintroduce ambiguous backlink wording.
      expect(aria.toLowerCase()).not.toMatch(/\bunified\b/);
      expect(title.toLowerCase()).not.toMatch(/\bunified\b/);
    }
  });

  it('summary buttons render in readonly context (navigation is safe)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const buttons = root.querySelectorAll<HTMLButtonElement>(
      '[data-pkc-region="references-summary"] button[data-pkc-action="jump-to-references-section"]',
    );
    expect(buttons.length).toBe(3);
    for (const b of Array.from(buttons)) expect(b.disabled).toBe(false);
  });

  // ── Relation delete UI v1 ──

  it('renders delete button on each relation row in editable context', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const outgoing = root.querySelector('[data-pkc-relation-direction="outgoing"]');
    const btn = outgoing!.querySelector<HTMLButtonElement>('.pkc-relation-delete');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-action')).toBe('delete-relation');
    expect(btn!.getAttribute('data-pkc-relation-id')).toBe('r1');
    expect(btn!.getAttribute('title')).toBe('Delete relation');
    expect(btn!.textContent).toBe('×');
  });

  it('renders delete button on inbound relation row (Backlinks group)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const backlinks = root.querySelector('[data-pkc-relation-direction="backlinks"]');
    const btn = backlinks!.querySelector<HTMLButtonElement>('.pkc-relation-delete');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-relation-id')).toBe('r1');
  });

  it('does not render delete button in readonly context', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // Relation row still visible (so users see what exists); delete button suppressed.
    expect(root.querySelector('.pkc-relation-peer')).not.toBeNull();
    expect(root.querySelector('.pkc-relation-delete')).toBeNull();
  });

  // ── Relation kind edit UI v1 ──

  it('renders inline kind <select> on each relation row in editable context (outgoing)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'semantic', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const outgoing = root.querySelector('[data-pkc-relation-direction="outgoing"]');
    const sel = outgoing!.querySelector<HTMLSelectElement>('select.pkc-relation-kind');
    expect(sel).not.toBeNull();
    expect(sel!.getAttribute('data-pkc-action')).toBe('update-relation-kind');
    expect(sel!.getAttribute('data-pkc-relation-id')).toBe('r1');
    expect(sel!.value).toBe('semantic');
    // All 4 user-exposable kinds available
    const values = Array.from(sel!.options).map((o) => o.value).sort();
    expect(values).toEqual(['categorical', 'semantic', 'structural', 'temporal']);
  });

  it('renders inline kind <select> on inbound relation row (backlinks) with same affordance', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'categorical', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const backlinks = root.querySelector('[data-pkc-relation-direction="backlinks"]');
    const sel = backlinks!.querySelector<HTMLSelectElement>('select.pkc-relation-kind');
    expect(sel).not.toBeNull();
    expect(sel!.getAttribute('data-pkc-relation-id')).toBe('r1');
    expect(sel!.value).toBe('categorical');
  });

  it('renders read-only badge (not <select>) for provenance relations even in editable context', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'rp', from: 'e1', to: 'e2', kind: 'provenance', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('select.pkc-relation-kind')).toBeNull();
    const badge = root.querySelector('span.pkc-relation-kind');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('provenance');
  });

  it('does not render kind <select> in readonly context (badge only)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'r1', from: 'e1', to: 'e2', kind: 'temporal', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('select.pkc-relation-kind')).toBeNull();
    const badge = root.querySelector('span.pkc-relation-kind');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('temporal');
  });

  // ── Provenance metadata viewer v1 ──

  it('renders provenance metadata viewer only for provenance rows that carry metadata', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: '2026-01-01T00:00:00Z',
            source_content_hash: 'abcd1234ef567890',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const viewer = root.querySelector('[data-pkc-region="provenance-metadata"]');
    expect(viewer).not.toBeNull();
    // Collapsed by default — <details> without `open`.
    expect((viewer as HTMLDetailsElement).open).toBe(false);
    // Summary carries an accessible label.
    const summary = viewer!.querySelector('.pkc-provenance-metadata-summary');
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('aria-label')).toBe('Show provenance metadata (read-only)');
  });

  it('provenance metadata viewer lists required keys first in canonical order', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            split_mode: 'heading',
            converted_at: '2026-01-01T00:00:00Z',
            segment_count: '3',
            conversion_kind: 'text-to-textlog',
            source_content_hash: 'abcd1234ef567890',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const keys = Array.from(
      root.querySelectorAll('.pkc-provenance-metadata-key'),
    ).map((el) => (el.textContent ?? '').trim());
    // required two first, recommended third, then others alphabetical.
    expect(keys).toEqual([
      'conversion_kind',
      'converted_at',
      'source_content_hash',
      'segment_count',
      'split_mode',
    ]);
  });

  it('provenance metadata viewer shows values next to each key', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'textlog-to-text',
            converted_at: '2026-01-02T03:04:05.000Z',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const ck = root.querySelector('[data-pkc-metadata-value="conversion_kind"]');
    const ca = root.querySelector<HTMLElement>('[data-pkc-metadata-value="converted_at"]');
    // conversion_kind passes through as-is.
    expect(ck!.textContent).toBe('textlog-to-text');
    expect(ck!.hasAttribute('data-pkc-metadata-formatted')).toBe(false);
    // converted_at is pretty-printed (v1.x). Display differs from raw,
    // but raw is recoverable via `title` (hover / a11y) per contract.
    expect(ca!.textContent).not.toBe('2026-01-02T03:04:05.000Z');
    expect(ca!.getAttribute('title')).toBe('2026-01-02T03:04:05.000Z');
    expect(ca!.getAttribute('data-pkc-metadata-formatted')).toBe('true');
  });

  it('provenance metadata viewer is not rendered when metadata is missing or empty', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'rp1', from: 'e1', to: 'e2', kind: 'provenance', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'rp2', from: 'e1', to: 'e2', kind: 'provenance', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', metadata: {} },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="provenance-metadata"]')).toBeNull();
  });

  it('provenance metadata viewer is NOT rendered on non-provenance relations even when metadata is present', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'r1', from: 'e1', to: 'e2', kind: 'structural',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: { note: 'irrelevant' },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="provenance-metadata"]')).toBeNull();
  });

  it('provenance metadata viewer appears in readonly context (viewing is safe)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: { conversion_kind: 'text-to-textlog', converted_at: '2026-01-01T00:00:00Z' },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="provenance-metadata"]')).not.toBeNull();
    // Still no edit affordance on provenance rows.
    expect(root.querySelector('select.pkc-relation-kind')).toBeNull();
    expect(root.querySelector('.pkc-relation-delete')).toBeNull();
  });

  it('provenance metadata viewer filters non-string metadata values (defensive)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          // Non-string values should be silently filtered; only string keys render.
          metadata: {
            conversion_kind: 'text-to-textlog',
            bad: null as unknown as string,
            bogus: 42 as unknown as string,
            empty: '',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const keys = Array.from(
      root.querySelectorAll('.pkc-provenance-metadata-key'),
    ).map((el) => (el.textContent ?? '').trim());
    expect(keys).toEqual(['conversion_kind']);
  });

  // ── Provenance metadata pretty-print v1.x ──

  it('pretty-prints converted_at as a locale datetime while preserving raw ISO in title', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: '2026-04-16T12:34:56Z',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const ca = root.querySelector<HTMLElement>('[data-pkc-metadata-value="converted_at"]');
    // Pretty-printed display is locale-dependent; assert shape rather
    // than exact text — must differ from raw ISO AND look datetime-ish.
    expect(ca!.textContent).not.toBe('2026-04-16T12:34:56Z');
    expect((ca!.textContent ?? '').length).toBeGreaterThan(0);
    // Raw canonical value is recoverable via title / aria-label.
    expect(ca!.getAttribute('title')).toBe('2026-04-16T12:34:56Z');
    expect(ca!.getAttribute('aria-label')).toBe('converted_at: 2026-04-16T12:34:56Z');
    expect(ca!.getAttribute('data-pkc-metadata-formatted')).toBe('true');
  });

  it('falls back to raw when converted_at is unparseable (defensive)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: 'not-a-date',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const ca = root.querySelector<HTMLElement>('[data-pkc-metadata-value="converted_at"]');
    // Raw string pass-through on parse failure — no title, no marker.
    expect(ca!.textContent).toBe('not-a-date');
    expect(ca!.hasAttribute('title')).toBe(false);
    expect(ca!.hasAttribute('data-pkc-metadata-formatted')).toBe(false);
  });

  it('pretty-prints source_content_hash as first 8 chars + ellipsis when ≥ 12 chars', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            // 16-char fnv1a64 hex per docs/spec/provenance-relation-profile.md §2.2.2
            source_content_hash: 'abcd1234ef567890',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const hash = root.querySelector<HTMLElement>('[data-pkc-metadata-value="source_content_hash"]');
    expect(hash!.textContent).toBe('abcd1234…');
    expect(hash!.getAttribute('title')).toBe('abcd1234ef567890');
    expect(hash!.getAttribute('aria-label')).toBe('source_content_hash: abcd1234ef567890');
    expect(hash!.getAttribute('data-pkc-metadata-formatted')).toBe('true');
  });

  it('leaves short source_content_hash (< 12 chars) unchanged', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            source_content_hash: 'short',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const hash = root.querySelector<HTMLElement>('[data-pkc-metadata-value="source_content_hash"]');
    expect(hash!.textContent).toBe('short');
    expect(hash!.hasAttribute('title')).toBe(false);
    expect(hash!.hasAttribute('data-pkc-metadata-formatted')).toBe(false);
  });

  it('unknown metadata keys pass through unchanged (no speculative formatting)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            split_mode: 'heading',
            segment_count: '3',
            // A future key we don't know about — must render as-is.
            some_future_key: 'some-long-value-that-might-look-like-a-hash-abcd1234ef567890',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const split = root.querySelector<HTMLElement>('[data-pkc-metadata-value="split_mode"]');
    const seg = root.querySelector<HTMLElement>('[data-pkc-metadata-value="segment_count"]');
    const future = root.querySelector<HTMLElement>('[data-pkc-metadata-value="some_future_key"]');
    expect(split!.textContent).toBe('heading');
    expect(split!.hasAttribute('data-pkc-metadata-formatted')).toBe(false);
    expect(seg!.textContent).toBe('3');
    expect(future!.textContent).toBe('some-long-value-that-might-look-like-a-hash-abcd1234ef567890');
    expect(future!.hasAttribute('data-pkc-metadata-formatted')).toBe(false);
  });

  it('pretty-print preserves read-only shape (no input elements added)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: '2026-04-16T12:34:56Z',
            source_content_hash: 'abcd1234ef567890',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const viewer = root.querySelector('[data-pkc-region="provenance-metadata"]');
    expect(viewer).not.toBeNull();
    // No edit affordance added by pretty-print. The only <button> inside
    // the viewer is the copy/export action (v1 copy-export), which is
    // read-only (no metadata mutation); see provenance-metadata-copy-
    // export-v1.md. Edit-shape inputs must still be absent.
    expect(viewer!.querySelector('input')).toBeNull();
    expect(viewer!.querySelector('textarea')).toBeNull();
    expect(viewer!.querySelector('select')).toBeNull();
    // Only copy-export button allowed.
    const buttons = Array.from(viewer!.querySelectorAll('button'));
    for (const b of buttons) {
      expect(b.getAttribute('data-pkc-action')).toBe('copy-provenance-metadata');
    }
  });

  it('pretty-print is active in readonly context (viewing contract unchanged)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: '2026-04-16T12:34:56Z',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const ca = root.querySelector<HTMLElement>('[data-pkc-metadata-value="converted_at"]');
    expect(ca!.getAttribute('data-pkc-metadata-formatted')).toBe('true');
    expect(ca!.getAttribute('title')).toBe('2026-04-16T12:34:56Z');
  });

  // ── Provenance metadata copy/export v1 ──

  it('renders a single copy button inside the provenance metadata viewer', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: {
            conversion_kind: 'text-to-textlog',
            converted_at: '2026-04-16T12:34:56Z',
          },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const viewer = root.querySelector('[data-pkc-region="provenance-metadata"]');
    const btn = viewer!.querySelector<HTMLButtonElement>('.pkc-provenance-metadata-copy');
    expect(btn).not.toBeNull();
    expect(btn!.tagName).toBe('BUTTON');
    expect(btn!.getAttribute('type')).toBe('button');
    expect(btn!.getAttribute('data-pkc-action')).toBe('copy-provenance-metadata');
    expect(btn!.getAttribute('data-pkc-relation-id')).toBe('rp');
    expect(btn!.getAttribute('title')).toBe('Copy raw canonical metadata as JSON');
    expect(btn!.textContent).toBe('Copy raw');
    expect(btn!.hasAttribute('data-pkc-copy-status')).toBe(false);
  });

  it('copy button is rendered in readonly context (copy is not an edit)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rp', from: 'e1', to: 'e2', kind: 'provenance',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: { conversion_kind: 'text-to-textlog', converted_at: '2026-04-16T12:34:56Z' },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector<HTMLButtonElement>('.pkc-provenance-metadata-copy');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
  });

  it('does not render a copy button when metadata is absent/empty (viewer itself is absent)', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        { id: 'rp', from: 'e1', to: 'e2', kind: 'provenance', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('.pkc-provenance-metadata-copy')).toBeNull();
  });

  it('does not render a copy button on non-provenance relation rows', () => {
    const containerWithRels: Container = {
      ...mockContainer,
      relations: [
        {
          id: 'rs', from: 'e1', to: 'e2', kind: 'semantic',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          metadata: { note: 'should not expose copy' },
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithRels,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('.pkc-provenance-metadata-copy')).toBeNull();
  });

  it('shows relation creation form in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const chips = root.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(1); // only categorical
  });

  it('shows tag add form with available targets', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // e2 is already tagged, so no available targets (only 2 entries total)
    const addForm = root.querySelector('[data-pkc-region="tag-add"]');
    expect(addForm).toBeNull(); // no form when all tagged
  });

  it('tags section always shows even with no tags', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: 'e2', sortKey: 'title', sortDirection: 'asc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: 'e2', sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const indicator = root.querySelector('[data-pkc-region="tag-filter-indicator"]');
    expect(indicator).toBeNull();
  });

  // ── Archetype Dispatch ──────────────────

  it('detail view has data-pkc-archetype attribute', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const view = root.querySelector('[data-pkc-mode="view"]');
    expect(view).not.toBeNull();
    expect(view!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('editor has data-pkc-archetype attribute', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor).not.toBeNull();
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('detail view uses presenter for body rendering', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 't1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 't1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const noteBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    expect(noteBtn).not.toBeNull();
    expect(noteBtn!.textContent).toContain('Text');

    const todoBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="todo"]');
    expect(todoBtn).not.toBeNull();
    expect(todoBtn!.textContent).toContain('Todo');

    const logBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="textlog"]');
    expect(logBtn).not.toBeNull();
    expect(logBtn!.textContent).toContain('Log');

    // FORM creation button removed (P1-A)
    const formBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="form"]');
    expect(formBtn).toBeNull();
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
      selectedLid: 'f1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'f1', editingLid: 'f1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    // Sidebar entry titles now include archetype emoji prefix instead of separate badge
    const n1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 'n1')!;
    const n1Title = n1.querySelector('.pkc-entry-title')!;
    expect(n1Title.textContent).toContain('📝');

    const t1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 't1')!;
    const t1Title = t1.querySelector('.pkc-entry-title')!;
    expect(t1Title.textContent).toContain('☑️');

    const f1 = Array.from(items).find((el) => el.getAttribute('data-pkc-lid') === 'f1')!;
    const f1Title = f1.querySelector('.pkc-entry-title')!;
    expect(f1Title.textContent).toContain('📊');
  });

  it('detail view shows archetype label next to title', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const label = root.querySelector('.pkc-archetype-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Text');
    expect(label!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('editor shows archetype label next to title input', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const label = root.querySelector('.pkc-archetype-label');
    expect(label).not.toBeNull();
    expect(label!.textContent).toContain('Text');
    expect(label!.getAttribute('data-pkc-archetype')).toBe('text');
  });

  it('archetype filter bar uses human-readable labels', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const bar = root.querySelector('[data-pkc-region="archetype-filter"]');
    expect(bar).not.toBeNull();
    const allBtn = bar!.querySelector('[data-pkc-archetype=""]');
    expect(allBtn!.textContent).toBe('All');
    const textBtn = bar!.querySelector('[data-pkc-archetype="text"]');
    expect(textBtn!.textContent).toBe('Text');
    const todoBtn = bar!.querySelector('[data-pkc-archetype="todo"]');
    expect(todoBtn!.textContent).toBe('Todo');
    const formBtn = bar!.querySelector('[data-pkc-archetype="form"]');
    expect(formBtn!.textContent).toBe('Form');
  });

  it('header has Attachment create button', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'a1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      selectedLid: 'a1', editingLid: 'a1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor!.getAttribute('data-pkc-archetype')).toBe('attachment');
    expect(root.querySelector('[data-pkc-field="attachment-file"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-field="attachment-name"]')).not.toBeNull();
  });

  // ── Export/Import panel structure tests ──

  it('renders inline export/import panel in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel).not.toBeNull();
    // Collapsed behind <details>: export + light + "Selected as HTML" + zip + TEXTs + Mixed + Selected (ZIP) + import + textlog + text + Entry + batch
    // (Reset moved to shell menu maintenance section;
    //  `📦 Selected` and `📥 Entry` added for selected-only ZIP export /
    //  unified single-entry import — see
    //  docs/development/selected-entry-export-and-reimport.md;
    //  `📤 Selected as HTML` added for selected-entry subset HTML
    //  clone export — see docs/development/selected-entry-html-clone-export.md;
    //  Data menu reordered into Share (HTML) | Archive (ZIP) | Import
    //  groups — icon 📤 = share, 📦 = ZIP package, 📥 = import)
    const btns = panel!.querySelectorAll('button');
    expect(btns.length).toBe(12);
  });

  it('inline export panel has Export, Light, and Import buttons', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel).not.toBeNull();
    const texts = Array.from(panel!.querySelectorAll('button')).map(b => b.textContent);
    expect(texts).toContain('Export');
    expect(texts).toContain('Light');
    expect(texts).toContain('Import');
  });

  it('does not render export/import panel in readonly mode', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="export-import-panel"]')).toBeNull();
  });

  it('pane toggle buttons are present in header', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const sidebarToggle = root.querySelector('[data-pkc-action="toggle-sidebar"]');
    const metaToggle = root.querySelector('[data-pkc-action="toggle-meta"]');
    expect(sidebarToggle).not.toBeNull();
    expect(metaToggle).not.toBeNull();
  });

  it('import button is inside Import section', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const importBtn = root.querySelector('[data-pkc-action="begin-import"]');
    expect(importBtn).not.toBeNull();
    expect(importBtn!.textContent).toBe('Import');
  });
});

// ── Container-wide TEXTLOG export ──

describe('Container-wide TEXTLOG export button', () => {
  const textlogContainer: Container = {
    meta: { container_id: 'cid', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Log', body: '{"entries":[]}', archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'e2', title: 'Text', body: 'hello', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [], revisions: [], assets: {},
  };

  it('shows TEXTLOGs button when container has textlog entries', () => {
    const state: AppState = {
      phase: 'ready', container: textlogContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-textlogs-container"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('TEXTLOGs');
  });

  it('hides TEXTLOGs button when container has no textlog entries', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-textlogs-container"]');
    expect(btn).toBeNull();
  });

  it('shows TEXTLOGs button in readonly mode when textlog entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: textlogContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-textlogs-container"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('TEXTLOGs');
  });
});

// ── Container-wide TEXT export ──

describe('Container-wide TEXT export button', () => {
  const textContainer: Container = {
    meta: { container_id: 'cid', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'My Doc', body: 'hello', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'e2', title: 'Log', body: '{"entries":[]}', archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [], revisions: [], assets: {},
  };

  it('shows TEXTs button when container has text entries', () => {
    const state: AppState = {
      phase: 'ready', container: textContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-texts-container"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('TEXTs');
  });

  it('hides TEXTs button when container has no text entries', () => {
    const noTextContainer: Container = {
      ...textContainer,
      entries: [textContainer.entries[1]!], // only the textlog entry
    };
    const state: AppState = {
      phase: 'ready', container: noTextContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-texts-container"]');
    expect(btn).toBeNull();
  });

  it('shows TEXTs button in readonly mode when text entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: textContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-texts-container"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('TEXTs');
  });
});

// ── Folder-scoped export ──

describe('Folder-scoped export button', () => {
  const folderWithTextChildren: Container = {
    meta: { container_id: 'cid', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'My Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 't1', title: 'Doc', body: 'hello', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [{ id: 'r1', from: 'f1', to: 't1', kind: 'structural' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
    revisions: [], assets: {},
  };

  const folderNoTextChildren: Container = {
    meta: { container_id: 'cid', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'f1', title: 'Empty Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'td1', title: 'Task', body: '{"status":"open","description":"x"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [{ id: 'r1', from: 'f1', to: 'td1', kind: 'structural' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
    revisions: [], assets: {},
  };

  it('shows Export button on folder action bar when folder has TEXT/TEXTLOG descendants', () => {
    const state: AppState = {
      phase: 'ready', container: folderWithTextChildren,
      selectedLid: 'f1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-folder"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('📦 Export');
    expect(btn!.getAttribute('title')).toContain('フォルダ配下');
  });

  it('hides Export button when folder has no TEXT/TEXTLOG descendants', () => {
    const state: AppState = {
      phase: 'ready', container: folderNoTextChildren,
      selectedLid: 'f1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-folder"]');
    expect(btn).toBeNull();
  });

  it('shows Export button in readonly mode for folder with TEXT descendants', () => {
    const state: AppState = {
      phase: 'ready', container: folderWithTextChildren,
      selectedLid: 'f1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="export-folder"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe('📦 Export');
  });
});

// ── Action Surface Consolidation ──

describe('Action surface consolidation', () => {
  const textlogContainer: Container = {
    meta: { container_id: 'cid', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'e-text', title: 'My Text', body: 'hello', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'e-log', title: 'My Log', body: '{"entries":[]}', archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [], revisions: [], assets: {},
  };

  function makeState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: textlogContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('header export/import panel is collapsed behind a <details> element', () => {
    render(makeState(), root);
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel).not.toBeNull();
    const details = panel!.querySelector('details.pkc-eip-details');
    expect(details).not.toBeNull();
    const summary = details!.querySelector('summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toBe('Data…');
  });

  it('primary action bar for TEXT has only Edit + Delete + More…', () => {
    render(makeState({ selectedLid: 'e-text' }), root);
    const bar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(bar).not.toBeNull();
    // Direct children buttons (not inside <details>) = Edit + Delete
    const directButtons = bar!.querySelectorAll(':scope > button');
    const directLabels = Array.from(directButtons).map(b => b.textContent);
    expect(directLabels).toContain('✏️ Edit');
    expect(directLabels).toContain('🗑️ Delete');
    // More… details element exists
    const more = bar!.querySelector('[data-pkc-region="action-bar-more"]');
    expect(more).not.toBeNull();
  });

  it('secondary actions for TEXT are inside More… details', () => {
    render(makeState({ selectedLid: 'e-text' }), root);
    const more = root.querySelector('[data-pkc-region="action-bar-more"]');
    expect(more).not.toBeNull();
    // Copy MD, Rich, Viewer, compact+Export are all inside
    expect(more!.querySelector('[data-pkc-action="copy-markdown-source"]')).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="copy-rich-markdown"]')).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="open-rendered-viewer"]')).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="export-text-zip"]')).not.toBeNull();
  });

  it('secondary actions for TEXTLOG are inside More… details (Slice 4-B: no Copy MD)', () => {
    // Slice 4-B of textlog-viewer-and-linkability-redesign.md removed
    // Copy MD / Copy Rendered from the TEXTLOG action bar. The rendered
    // viewer (now driven by buildTextlogDoc with Print + Download HTML
    // buttons) is the supported output surface for textlogs; CSV+ZIP
    // remains for structured export.
    render(makeState({ selectedLid: 'e-log' }), root);
    const more = root.querySelector('[data-pkc-region="action-bar-more"]');
    expect(more).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="copy-markdown-source"]')).toBeNull();
    expect(more!.querySelector('[data-pkc-action="copy-rich-markdown"]')).toBeNull();
    expect(more!.querySelector('[data-pkc-action="open-rendered-viewer"]')).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="export-textlog-csv-zip"]')).not.toBeNull();
  });

  it('readonly mode still shows More… for TEXT (copy/viewer are read-only)', () => {
    render(makeState({ selectedLid: 'e-text', readonly: true }), root);
    const bar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(bar).not.toBeNull();
    // Edit/Delete should NOT be present
    expect(bar!.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    expect(bar!.querySelector('[data-pkc-action="delete-entry"]')).toBeNull();
    // More… should still be present
    const more = bar!.querySelector('[data-pkc-region="action-bar-more"]');
    expect(more).not.toBeNull();
    expect(more!.querySelector('[data-pkc-action="copy-markdown-source"]')).not.toBeNull();
  });

  it('export/import buttons are reachable inside Data… panel', () => {
    render(makeState(), root);
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel!.querySelector('[data-pkc-action="begin-export"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="export-zip"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="begin-import"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="import-textlog-bundle"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="import-text-bundle"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="export-textlogs-container"]')).not.toBeNull();
    expect(panel!.querySelector('[data-pkc-action="export-texts-container"]')).not.toBeNull();
  });

  it('Reset button moved to shell menu maintenance section', () => {
    render(makeState(), root);
    const resetBtn = root.querySelector('[data-pkc-action="clear-local-data"]');
    expect(resetBtn).not.toBeNull();
    const maintenance = resetBtn!.closest('[data-pkc-region="shell-menu-maintenance"]');
    expect(maintenance).not.toBeNull();
    // Not inside export-import panel
    const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
    expect(panel!.querySelector('[data-pkc-action="clear-local-data"]')).toBeNull();
  });

  it('shell menu has Quick Help section', () => {
    render(makeState(), root);
    const help = root.querySelector('[data-pkc-region="shell-menu-help"]');
    expect(help).not.toBeNull();
    const items = help!.querySelectorAll('.pkc-shell-menu-help-item');
    expect(items.length).toBeGreaterThanOrEqual(6);
  });

  it('Quick Help mentions folder-export import and structure-not-restored caveat', () => {
    render(makeState(), root);
    const helpItems = root.querySelectorAll('.pkc-shell-menu-help-item');
    const importLine = Array.from(helpItems).find((li) =>
      li.textContent?.includes('インポート'),
    );
    expect(importLine).not.toBeNull();
    // Must mention Batch (the entry point for folder-export import)
    expect(importLine!.textContent).toContain('Batch');
    // Must mention folder structure auto-restore
    expect(importLine!.textContent).toContain('フォルダ構造は自動復元');
  });

  it('Batch import button tooltip mentions folder-export.zip', () => {
    render(makeState(), root);
    const batchBtn = root.querySelector('[data-pkc-action="import-batch-bundle"]');
    expect(batchBtn).not.toBeNull();
    const tooltip = batchBtn!.getAttribute('title') ?? '';
    expect(tooltip).toContain('.folder-export.zip');
  });

  it('no separate folder-import button exists (action surface not excessive)', () => {
    render(makeState(), root);
    // There should be no dedicated import-folder-bundle action
    const folderImportBtn = root.querySelector('[data-pkc-action="import-folder-bundle"]');
    expect(folderImportBtn).toBeNull();
  });

  it('context menu labels are concise and tooltips are descriptive', () => {
    const menu = renderContextMenu('lid', 0, 0, { hasParent: false, canEdit: true, archetype: 'attachment' });
    const assetRef = menu.querySelector('[data-pkc-action="copy-asset-ref"]');
    expect(assetRef).not.toBeNull();
    expect(assetRef!.textContent).toBe('📎 Asset ref');
    expect(assetRef!.getAttribute('title')).toContain('Markdown');
  });

  it('todo/folder archetypes have no More… overflow (only primary actions)', () => {
    const todoContainer: Container = {
      meta: textlogContainer.meta,
      entries: [{ lid: 'e-todo', title: 'Task', body: '{"status":"open","description":"x"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }],
      relations: [], revisions: [], assets: {},
    };
    render(makeState({ container: todoContainer, selectedLid: 'e-todo' }), root);
    const bar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.querySelector('[data-pkc-region="action-bar-more"]')).toBeNull();
  });
});

// ���─ Issue #50: Folder UX Hardening ��─

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
    pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
    tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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

  // ── Breadcrumb / Path Trail v1 (spec: docs/development/breadcrumb-path-trail-v1.md) ──

  it('shows breadcrumb with Root marker for root-level entries (§6)', () => {
    render({ ...baseState, selectedLid: 'e2' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    const rootMarker = bc!.querySelector('.pkc-breadcrumb-root');
    expect(rootMarker).not.toBeNull();
    expect(rootMarker!.textContent).toBe('Root');
    // No ancestor items for root entries.
    expect(bc!.querySelectorAll('.pkc-breadcrumb-item')).toHaveLength(0);
    const current = bc!.querySelector('.pkc-breadcrumb-current');
    expect(current!.textContent).toBe('Root Note');
    // No truncation marker at root depth.
    expect(bc!.querySelector('.pkc-breadcrumb-truncated')).toBeNull();
  });

  it('shows breadcrumb Root marker for a folder selected at root (§6)', () => {
    render({ ...baseState, selectedLid: 'f1' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    expect(bc!.querySelector('.pkc-breadcrumb-root')).not.toBeNull();
    expect(bc!.querySelector('.pkc-breadcrumb-current')!.textContent).toBe('My Folder');
  });

  it('shows … truncation marker when ancestry exceeds maxDepth (§7)', () => {
    // Build a chain of 6 folders plus a leaf — getBreadcrumb caps at 4 ancestors,
    // so 1 further ancestor remains above and must surface as `…`.
    const ts = '2026-01-01T00:00:00Z';
    const deepContainer: Container = {
      meta: {
        container_id: 'deep',
        title: 'Deep',
        created_at: ts,
        updated_at: ts,
        schema_version: 1,
      },
      entries: [
        { lid: 'g0', title: 'G0', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'g1', title: 'G1', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'g2', title: 'G2', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'g3', title: 'G3', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'g4', title: 'G4', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'leaf', title: 'Leaf', body: '', archetype: 'text', created_at: ts, updated_at: ts },
      ],
      relations: [
        { id: 'r0', from: 'g0', to: 'g1', kind: 'structural', created_at: ts, updated_at: ts },
        { id: 'r1', from: 'g1', to: 'g2', kind: 'structural', created_at: ts, updated_at: ts },
        { id: 'r2', from: 'g2', to: 'g3', kind: 'structural', created_at: ts, updated_at: ts },
        { id: 'r3', from: 'g3', to: 'g4', kind: 'structural', created_at: ts, updated_at: ts },
        { id: 'r4', from: 'g4', to: 'leaf', kind: 'structural', created_at: ts, updated_at: ts },
      ],
      revisions: [],
      assets: {},
    };
    render({ ...baseState, container: deepContainer, selectedLid: 'leaf' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    const trunc = bc!.querySelector('.pkc-breadcrumb-truncated');
    expect(trunc).not.toBeNull();
    expect(trunc!.textContent).toBe('…');
    // `…` is non-clickable (no data-pkc-action).
    expect(trunc!.getAttribute('data-pkc-action')).toBeNull();
    // 4 ancestors rendered (maxDepth); oldest in DOM is g1 (g0 truncated).
    const items = bc!.querySelectorAll('.pkc-breadcrumb-item');
    expect(items).toHaveLength(4);
    expect(items[0]!.textContent).toBe('G1');
    expect(items[3]!.textContent).toBe('G4');
  });

  it('does NOT show truncation marker when ancestry fits within maxDepth (§7)', () => {
    render({ ...baseState, selectedLid: 'e1' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    expect(bc!.querySelector('.pkc-breadcrumb-truncated')).toBeNull();
  });

  it('under multi-parent, picks the first structural parent deterministically (§8)', () => {
    const ts = '2026-01-01T00:00:00Z';
    const mpContainer: Container = {
      meta: {
        container_id: 'mp',
        title: 'MP',
        created_at: ts,
        updated_at: ts,
        schema_version: 1,
      },
      entries: [
        { lid: 'fA', title: 'Folder A', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'fB', title: 'Folder B', body: '', archetype: 'folder', created_at: ts, updated_at: ts },
        { lid: 'shared', title: 'Shared', body: '', archetype: 'text', created_at: ts, updated_at: ts },
      ],
      // fA comes first in the relations array → must win.
      relations: [
        { id: 'r1', from: 'fA', to: 'shared', kind: 'structural', created_at: ts, updated_at: ts },
        { id: 'r2', from: 'fB', to: 'shared', kind: 'structural', created_at: ts, updated_at: ts },
      ],
      revisions: [],
      assets: {},
    };
    render({ ...baseState, container: mpContainer, selectedLid: 'shared' }, root);
    const bc = root.querySelector('[data-pkc-region="breadcrumb"]');
    expect(bc).not.toBeNull();
    const items = bc!.querySelectorAll('.pkc-breadcrumb-item');
    expect(items).toHaveLength(1);
    expect(items[0]!.textContent).toBe('Folder A');
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

  // ── Folder collapse (expand/collapse chevron) ──

  it('renders a collapse toggle on folder nodes with children', () => {
    render({ ...baseState }, root);
    const folderItem = root.querySelector('[data-pkc-folder="true"]');
    expect(folderItem).not.toBeNull();
    const toggle = folderItem!.querySelector('[data-pkc-action="toggle-folder-collapse"]');
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('data-pkc-lid')).toBe('f1');
    // Default: expanded
    expect(toggle!.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not render a collapse toggle on folders without children', () => {
    const emptyFolderContainer = {
      ...folderContainer,
      entries: [
        { lid: 'f2', title: 'Empty Folder', body: '', archetype: 'folder' as const, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [],
    };
    render({ ...baseState, container: emptyFolderContainer }, root);
    const toggle = root.querySelector('[data-pkc-action="toggle-folder-collapse"]');
    expect(toggle).toBeNull();
  });

  it('hides folder children when the folder is in collapsedFolders', () => {
    render({ ...baseState, batchImportResult: null, collapsedFolders: ['f1'] }, root);
    // e1 is the only structural child of f1; it must not appear in the sidebar
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const childItem = sidebar.querySelector('[data-pkc-lid="e1"][data-pkc-action="select-entry"]');
    expect(childItem).toBeNull();
    // Folder itself is still shown
    const folderItem = sidebar.querySelector('[data-pkc-lid="f1"][data-pkc-action="select-entry"]');
    expect(folderItem).not.toBeNull();
    expect(folderItem!.getAttribute('data-pkc-folder-collapsed')).toBe('true');
    // e2 (root-level) is still shown
    const rootItem = sidebar.querySelector('[data-pkc-lid="e2"][data-pkc-action="select-entry"]');
    expect(rootItem).not.toBeNull();
  });

  it('toggle shows expanded state when folder is expanded', () => {
    render({ ...baseState, batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [] }, root);
    const toggle = root.querySelector('[data-pkc-action="toggle-folder-collapse"]');
    expect(toggle!.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggle shows collapsed state when folder is collapsed', () => {
    render({ ...baseState, batchImportResult: null, collapsedFolders: ['f1'] }, root);
    const toggle = root.querySelector('[data-pkc-action="toggle-folder-collapse"]');
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');
  });
});

// ── Issue #51: Three-Pane Layout + Fixed Action Bar ──

describe('Three-Pane Layout', () => {
  it('renders 3 pane regions when entry is selected', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="commit-edit"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="cancel-edit"]')).not.toBeNull();
  });

  it('fixed action bar exposes Copy MD / Copy Rendered / Open Viewer for TEXT entries', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="copy-markdown-source"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="copy-rich-markdown"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="open-rendered-viewer"]')).not.toBeNull();
  });

  it('Copy MD / Copy Rendered / Open Viewer buttons stay visible in readonly mode (non-mutating)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    // Mutating buttons are hidden in readonly, but copy/viewer are still there.
    expect(actionBar!.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="copy-markdown-source"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="copy-rich-markdown"]')).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="open-rendered-viewer"]')).not.toBeNull();
  });

  it('action bar exposes Export CSV+ZIP button only for textlog entries', () => {
    const containerWithTextlog: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'e3',
          title: 'My Daily Log',
          body: '{"entries":[{"id":"log-1","text":"first","createdAt":"2026-04-09T10:00:00Z","flags":[]}]}',
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    // Selecting the textlog entry: button MUST be present.
    const stateTextlog: AppState = {
      phase: 'ready', container: containerWithTextlog,
      selectedLid: 'e3', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(stateTextlog, root);
    let actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    const btn = actionBar!.querySelector('[data-pkc-action="export-textlog-csv-zip"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-lid')).toBe('e3');

    // Selecting a TEXT entry: button MUST be absent.
    const stateText: AppState = {
      ...stateTextlog,
      selectedLid: 'e1', // text archetype
    };
    render(stateText, root);
    actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="export-textlog-csv-zip"]')).toBeNull();
  });

  it('Export CSV+ZIP button stays visible in readonly mode (export does not mutate state)', () => {
    const containerWithTextlog: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'e3',
          title: 'Read-only log',
          body: '{"entries":[]}',
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTextlog,
      selectedLid: 'e3', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const actionBar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(actionBar).not.toBeNull();
    // Mutating buttons gone, export still here.
    expect(actionBar!.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    expect(actionBar!.querySelector('[data-pkc-action="export-textlog-csv-zip"]')).not.toBeNull();
  });

  it('Issue G — compact checkbox is rendered next to Export CSV+ZIP for textlog entries only', () => {
    const containerWithBoth: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'e3',
          title: 'Daily Log',
          body: '{"entries":[]}',
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    // textlog: checkbox visible, scoped to its lid, default unchecked
    const stateTextlog: AppState = {
      phase: 'ready', container: containerWithBoth,
      selectedLid: 'e3', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(stateTextlog, root);
    const cb = root.querySelector<HTMLInputElement>(
      '[data-pkc-region="action-bar"] input[data-pkc-control="textlog-export-compact"]',
    );
    expect(cb).not.toBeNull();
    expect(cb!.type).toBe('checkbox');
    expect(cb!.checked).toBe(false);
    expect(cb!.getAttribute('data-pkc-lid')).toBe('e3');

    // text entry: checkbox absent
    const stateText: AppState = { ...stateTextlog, selectedLid: 'e1' };
    render(stateText, root);
    expect(
      root.querySelector('[data-pkc-region="action-bar"] input[data-pkc-control="textlog-export-compact"]'),
    ).toBeNull();
  });

  it('Issue G — compact checkbox stays visible in readonly mode (export-only transform)', () => {
    const containerWithTextlog: Container = {
      ...mockContainer,
      entries: [
        ...mockContainer.entries,
        {
          lid: 'e3',
          title: 'RO log',
          body: '{"entries":[]}',
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    const state: AppState = {
      phase: 'ready', container: containerWithTextlog,
      selectedLid: 'e3', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(
      root.querySelector('[data-pkc-region="action-bar"] input[data-pkc-control="textlog-export-compact"]'),
    ).not.toBeNull();
  });

  it('meta pane shows tags and timestamps', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
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
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    // Sidebar entries now show archetype emoji in the title, not in separate badges
    const titles = root.querySelectorAll('.pkc-entry-title');
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      // Each title should contain an emoji prefix (at least 2 chars: emoji + space + name)
      expect(title.textContent!.length).toBeGreaterThan(2);
    }
  });
});

describe('DnD + Context Menu Foundation', () => {
  const folderContainer: Container = {
    meta: {
      container_id: 'test-id', title: 'Test',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      { lid: 'f1', title: 'Folder One', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 'note1', title: 'Note One', body: '', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 'f2', title: 'Folder Two', body: '', archetype: 'folder', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [
      { id: 'r1', from: 'f1', to: 'note1', kind: 'structural', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    revisions: [],
    assets: {},
  };

  it('tree items have draggable attribute', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const draggables = root.querySelectorAll('[data-pkc-draggable="true"]');
    expect(draggables.length).toBeGreaterThan(0);
    for (const el of draggables) {
      expect(el.getAttribute('draggable')).toBe('true');
    }
  });

  it('folder nodes have drop target attribute', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropTargets = root.querySelectorAll('[data-pkc-drop-target="true"]');
    expect(dropTargets.length).toBe(2); // f1 and f2
    for (const el of dropTargets) {
      expect(el.getAttribute('data-pkc-folder')).toBe('true');
    }
  });

  it('non-folder nodes are draggable but not drop targets', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const note1 = root.querySelector('[data-pkc-lid="note1"][data-pkc-draggable]');
    expect(note1).not.toBeNull();
    expect(note1!.getAttribute('data-pkc-drop-target')).toBeNull();
  });

  it('root drop zone is rendered when not readonly', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const rootDrop = root.querySelector('[data-pkc-drop-target="root"]');
    expect(rootDrop).not.toBeNull();
    expect(rootDrop!.textContent).toContain('root');
  });

  it('root drop zone is NOT rendered in readonly mode', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const rootDrop = root.querySelector('[data-pkc-drop-target="root"]');
    expect(rootDrop).toBeNull();
  });

  it('DnD attributes not added in flat filter mode', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: 'Note', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    // In flat mode (filter active), draggable should not be set
    const draggables = root.querySelectorAll('[data-pkc-draggable="true"]');
    expect(draggables.length).toBe(0);
  });

  it('renderContextMenu creates menu with correct items', () => {
    const menu = renderContextMenu('test-lid', 100, 200, true);
    expect(menu.getAttribute('data-pkc-region')).toBe('context-menu');
    expect(menu.getAttribute('data-pkc-lid')).toBe('test-lid');
    expect(menu.style.left).toBe('100px');
    expect(menu.style.top).toBe('200px');

    const items = menu.querySelectorAll('.pkc-context-menu-item');
    // Edit, Delete, Move to Root (shown because hasParent=true), Entry ref, Embed ref.
    expect(items.length).toBe(5);
    expect(items[0]!.textContent).toContain('Edit');
    expect(items[1]!.textContent).toContain('Delete');
    expect(items[2]!.textContent).toContain('Root');
    expect(items[3]!.textContent).toContain('Entry ref');
    expect(items[4]!.textContent).toContain('Embed ref');
  });

  it('renderContextMenu hides Move to Root when no parent', () => {
    const menu = renderContextMenu('test-lid', 0, 0, false);
    const items = menu.querySelectorAll('.pkc-context-menu-item');
    // Edit, Delete, Entry ref, Embed ref (Move to Root hidden, hasParent=false).
    expect(items.length).toBe(4);
    const texts = Array.from(items).map(i => i.textContent);
    expect(texts.some(t => t!.includes('Root'))).toBe(false);
    expect(texts.some(t => t!.includes('Entry ref'))).toBe(true);
  });

  it('context menu items have correct data-pkc-action and data-pkc-lid', () => {
    const menu = renderContextMenu('abc', 0, 0, true);
    const editItem = menu.querySelector('[data-pkc-action="begin-edit"]');
    expect(editItem).not.toBeNull();
    expect(editItem!.getAttribute('data-pkc-lid')).toBe('abc');

    const deleteItem = menu.querySelector('[data-pkc-action="delete-entry"]');
    expect(deleteItem).not.toBeNull();
    expect(deleteItem!.getAttribute('data-pkc-lid')).toBe('abc');

    const moveItem = menu.querySelector('[data-pkc-action="ctx-move-to-root"]');
    expect(moveItem).not.toBeNull();
    expect(moveItem!.getAttribute('data-pkc-lid')).toBe('abc');
  });

  it('renderContextMenu always shows "copy entry reference" regardless of archetype', () => {
    const plain = renderContextMenu('e1', 0, 0, { canEdit: true });
    expect(plain.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
    // Asset/log refs are hidden by default.
    expect(plain.querySelector('[data-pkc-action="copy-asset-ref"]')).toBeNull();
    expect(plain.querySelector('[data-pkc-action="copy-log-line-ref"]')).toBeNull();
  });

  it('renderContextMenu shows "copy asset reference" only when archetype is attachment', () => {
    const att = renderContextMenu('att1', 0, 0, { archetype: 'attachment', canEdit: true });
    expect(att.querySelector('[data-pkc-action="copy-asset-ref"]')).not.toBeNull();

    const text = renderContextMenu('e1', 0, 0, { archetype: 'text', canEdit: true });
    expect(text.querySelector('[data-pkc-action="copy-asset-ref"]')).toBeNull();
  });

  it('renderContextMenu shows "copy log line reference" only when archetype=textlog and logId provided', () => {
    const row = renderContextMenu('tl1', 0, 0, {
      archetype: 'textlog',
      logId: 'log-1',
      canEdit: true,
    });
    const logItem = row.querySelector<HTMLElement>('[data-pkc-action="copy-log-line-ref"]');
    expect(logItem).not.toBeNull();
    expect(logItem!.getAttribute('data-pkc-log-id')).toBe('log-1');
    // Menu also carries the log-id at the root so a document-level handler can pick it up.
    expect(row.getAttribute('data-pkc-log-id')).toBe('log-1');

    // textlog without logId → no log-line item (the row is not a specific row click).
    const noLogId = renderContextMenu('tl1', 0, 0, { archetype: 'textlog', canEdit: true });
    expect(noLogId.querySelector('[data-pkc-action="copy-log-line-ref"]')).toBeNull();
  });

  it('renderContextMenu hides Edit/Delete/Move when canEdit=false but keeps reference items', () => {
    const readonly = renderContextMenu('e1', 0, 0, {
      archetype: 'attachment',
      canEdit: false,
      hasParent: true,
    });
    expect(readonly.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    expect(readonly.querySelector('[data-pkc-action="delete-entry"]')).toBeNull();
    expect(readonly.querySelector('[data-pkc-action="ctx-move-to-root"]')).toBeNull();
    // Reference-copy items are still there.
    expect(readonly.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
    expect(readonly.querySelector('[data-pkc-action="copy-asset-ref"]')).not.toBeNull();
  });

  it('renderContextMenu accepts the legacy boolean hasParent argument (backward compatible)', () => {
    // The boolean overload is the old signature; it must still show the
    // mutating items and the default entry-reference item.
    const legacy = renderContextMenu('e1', 0, 0, true);
    expect(legacy.querySelector('[data-pkc-action="begin-edit"]')).not.toBeNull();
    expect(legacy.querySelector('[data-pkc-action="delete-entry"]')).not.toBeNull();
    expect(legacy.querySelector('[data-pkc-action="ctx-move-to-root"]')).not.toBeNull();
    expect(legacy.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
  });

  it('renderContextMenu shows Preview for text/textlog archetypes', () => {
    const text = renderContextMenu('e1', 0, 0, { archetype: 'text', canEdit: true });
    expect(text.querySelector('[data-pkc-action="ctx-preview"]')).not.toBeNull();

    const textlog = renderContextMenu('tl1', 0, 0, { archetype: 'textlog', canEdit: true });
    expect(textlog.querySelector('[data-pkc-action="ctx-preview"]')).not.toBeNull();

    const att = renderContextMenu('a1', 0, 0, { archetype: 'attachment', canEdit: true });
    expect(att.querySelector('[data-pkc-action="ctx-preview"]')).not.toBeNull();

    // todo archetype → no preview
    const todo = renderContextMenu('td1', 0, 0, { archetype: 'todo', canEdit: true });
    expect(todo.querySelector('[data-pkc-action="ctx-preview"]')).toBeNull();
  });

  it('renderContextMenu shows Sandbox Run only for attachment archetype', () => {
    const att = renderContextMenu('a1', 0, 0, { archetype: 'attachment', canEdit: true });
    expect(att.querySelector('[data-pkc-action="ctx-sandbox-run"]')).not.toBeNull();

    const text = renderContextMenu('e1', 0, 0, { archetype: 'text', canEdit: true });
    expect(text.querySelector('[data-pkc-action="ctx-sandbox-run"]')).toBeNull();
  });

  it('renderContextMenu always shows Copy entry embed', () => {
    const menu = renderContextMenu('e1', 0, 0, { canEdit: false });
    expect(menu.querySelector('[data-pkc-action="copy-entry-embed-ref"]')).not.toBeNull();
  });

  it('renderContextMenu shows Move to Folder sub-menu when folders provided', () => {
    const folders = [
      { lid: 'f1', title: 'Folder A' },
      { lid: 'f2', title: 'Folder B' },
    ];
    const menu = renderContextMenu('e1', 0, 0, { canEdit: true, folders });
    const folderItems = menu.querySelectorAll('[data-pkc-action="ctx-move-to-folder"]');
    expect(folderItems.length).toBe(2);
    expect(folderItems[0]!.getAttribute('data-pkc-folder-lid')).toBe('f1');
    expect(folderItems[1]!.getAttribute('data-pkc-folder-lid')).toBe('f2');
  });

  it('renderContextMenu excludes self from Move to Folder list', () => {
    const folders = [
      { lid: 'e1', title: 'Self' },
      { lid: 'f2', title: 'Other' },
    ];
    const menu = renderContextMenu('e1', 0, 0, { canEdit: true, folders });
    const folderItems = menu.querySelectorAll('[data-pkc-action="ctx-move-to-folder"]');
    expect(folderItems.length).toBe(1);
    expect(folderItems[0]!.getAttribute('data-pkc-folder-lid')).toBe('f2');
  });

  it('renderContextMenu hides Move to Folder when canEdit=false', () => {
    const folders = [{ lid: 'f1', title: 'Folder' }];
    const menu = renderContextMenu('e1', 0, 0, { canEdit: false, folders });
    expect(menu.querySelector('[data-pkc-action="ctx-move-to-folder"]')).toBeNull();
  });

  it('existing Move to Folder still works in meta pane', () => {
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: 'note1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const moveSection = root.querySelector('[data-pkc-region="move-to-folder"]');
    expect(moveSection).not.toBeNull();
    const moveBtn = moveSection!.querySelector('[data-pkc-action="move-to-folder"]');
    expect(moveBtn).not.toBeNull();
  });
});

describe('Detached View Foundation', () => {
  const textEntry = {
    lid: 'e-text', title: 'My Note', body: 'Hello world',
    archetype: 'text' as const,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };

  const imageAttEntry = {
    lid: 'e-img', title: 'Photo', body: JSON.stringify({ name: 'photo.png', mime: 'image/png', size: 1024, asset_key: 'ak1' }),
    archetype: 'attachment' as const,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };

  const pdfAttEntry = {
    lid: 'e-pdf', title: 'Doc', body: JSON.stringify({ name: 'report.pdf', mime: 'application/pdf', size: 50000, asset_key: 'ak2' }),
    archetype: 'attachment' as const,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };

  const noDataAttEntry = {
    lid: 'e-stripped', title: 'Stripped', body: JSON.stringify({ name: 'data.csv', mime: 'text/csv', size: 200, asset_key: 'ak3' }),
    archetype: 'attachment' as const,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  };

  const detachedContainer: Container = {
    meta: { container_id: 'test', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [textEntry, imageAttEntry, pdfAttEntry, noDataAttEntry],
    relations: [],
    revisions: [],
    assets: { ak1: 'iVBOR...', ak2: 'JVB...' }, // ak3 intentionally missing
  };

  it('renderDetachedPanel creates panel with correct structure for text entry', () => {
    const panel = renderDetachedPanel(textEntry, detachedContainer);
    expect(panel.getAttribute('data-pkc-region')).toBe('detached-panel');
    expect(panel.getAttribute('data-pkc-lid')).toBe('e-text');

    // Header
    const header = panel.querySelector('[data-pkc-region="detached-header"]');
    expect(header).not.toBeNull();
    expect(header!.textContent).toContain('My Note');

    // Close button
    const closeBtn = panel.querySelector('[data-pkc-action="close-detached"]');
    expect(closeBtn).not.toBeNull();

    // Content has presenter body
    const content = panel.querySelector('.pkc-detached-content');
    expect(content).not.toBeNull();
    expect(content!.textContent).toContain('Hello world');
  });

  it('renderDetachedPanel for image attachment shows preview area and download', () => {
    const panel = renderDetachedPanel(imageAttEntry, detachedContainer);
    expect(panel.getAttribute('data-pkc-lid')).toBe('e-img');

    // Should have preview area
    const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
    expect(preview).not.toBeNull();

    // Should have download button
    const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]');
    expect(dlBtn).not.toBeNull();
    expect(dlBtn!.textContent).toContain('Download');
    expect(dlBtn!.textContent).toContain('photo.png');
  });

  it('renderDetachedPanel for PDF attachment shows preview area and download', () => {
    const panel = renderDetachedPanel(pdfAttEntry, detachedContainer);

    // PDF now gets a preview area with correct type
    const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.getAttribute('data-pkc-preview-type')).toBe('pdf');

    // Still has download
    const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]');
    expect(dlBtn).not.toBeNull();
    expect(dlBtn!.textContent).toContain('report.pdf');
  });

  it('renderDetachedPanel for attachment with stripped data shows unavailable message', () => {
    const panel = renderDetachedPanel(noDataAttEntry, detachedContainer);

    // No download (data stripped)
    const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]');
    expect(dlBtn).toBeNull();

    // Shows stripped message
    expect(panel.textContent).toContain('not available');
  });

  it('renderDetachedPanel shows file info for attachments', () => {
    const panel = renderDetachedPanel(imageAttEntry, detachedContainer);
    const info = panel.querySelector('.pkc-detached-attachment-info');
    expect(info).not.toBeNull();
    expect(info!.textContent).toContain('photo.png');
    expect(info!.textContent).toContain('image/png');
  });

  it('renderDetachedPanel header shows archetype icon', () => {
    const panel = renderDetachedPanel(textEntry, detachedContainer);
    const icon = panel.querySelector('.pkc-detached-icon');
    expect(icon).not.toBeNull();
    expect(icon!.textContent).toBe('📝');
  });

  it('single-click select still works (not broken by dblclick)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.getAttribute('data-pkc-action')).toBe('select-entry');
    }
  });
});

describe('Persistent Drop Zone', () => {
  it('large drop zone shown when no entry selected and editable', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.classList.contains('pkc-drop-zone-large')).toBe(true);
    expect(dropZone!.textContent).toContain('Drop a file');
  });

  it('no drop zone in readonly mode', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: true, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).toBeNull();
  });

  it('compact drop zone shown when entry selected and not editing', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.classList.contains('pkc-drop-zone-compact')).toBe(true);
  });

  it('no drop zone during editing phase', () => {
    const state: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).toBeNull();
  });

  it('drop zone shows folder context when folder is selected', () => {
    const folderContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        ...mockContainer.entries,
        { lid: 'f1', title: 'My Folder', body: '', archetype: 'folder', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [],
      revisions: [],
      assets: {},
    };
    const state: AppState = {
      phase: 'ready', container: folderContainer,
      selectedLid: 'f1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.getAttribute('data-pkc-context-folder')).toBe('f1');
    expect(dropZone!.textContent).toContain('My Folder');
  });

  it('drop zone has no context folder attribute when at root level', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(dropZone).not.toBeNull();
    expect(dropZone!.getAttribute('data-pkc-context-folder')).toBeNull();
  });

  it('existing attachment creation flow still works', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const attachBtn = root.querySelector('[data-pkc-action="create-entry"][data-pkc-archetype="attachment"]');
    expect(attachBtn).not.toBeNull();
    expect(attachBtn!.textContent).toContain('File');
  });
});

// ── Issue #59: Todo Calendar Foundation ──

describe('Todo Calendar Foundation', () => {
  const calendarContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'No Date', body: '{"status":"open","description":"D"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 't5', title: 'Archived', body: '{"status":"done","description":"E","date":"2026-04-10","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  it('shows view mode toggle bar with Detail and Calendar buttons', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const bar = root.querySelector('[data-pkc-region="view-mode-bar"]');
    expect(bar).not.toBeNull();
    const btns = bar!.querySelectorAll('.pkc-view-mode-btn');
    expect(btns).toHaveLength(3);
    expect(btns[0]!.textContent).toBe('Detail');
    expect(btns[1]!.textContent).toBe('Calendar');
    expect(btns[2]!.textContent).toBe('Kanban');
  });

  it('marks active view mode button', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const calBtn = root.querySelector('[data-pkc-view-mode="calendar"]');
    expect(calBtn!.getAttribute('data-pkc-active')).toBe('true');
    const detailBtn = root.querySelector('[data-pkc-view-mode="detail"]');
    expect(detailBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('renders calendar view when viewMode is calendar', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const calendar = root.querySelector('[data-pkc-region="calendar-view"]');
    expect(calendar).not.toBeNull();
  });

  it('shows month and year in calendar title', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const title = root.querySelector('.pkc-calendar-title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe('April 2026');
  });

  it('shows prev/next navigation buttons', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-action="calendar-prev"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-action="calendar-next"]')).not.toBeNull();
  });

  it('shows day-of-week headers', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const dows = root.querySelectorAll('.pkc-calendar-dow');
    expect(dows).toHaveLength(7);
    expect(dows[0]!.textContent).toBe('Sun');
    expect(dows[6]!.textContent).toBe('Sat');
  });

  it('renders todo items on their date cells', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // t1 and t2 are on April 10, t5 is archived and hidden
    const todoItems = root.querySelectorAll('.pkc-calendar-todo-item');
    const lids = Array.from(todoItems).map((i) => i.getAttribute('data-pkc-lid'));
    expect(lids).toContain('t1');
    expect(lids).toContain('t2');
    expect(lids).toContain('t3');
    // t4 has no date, t5 is archived
    expect(lids).not.toContain('t4');
    expect(lids).not.toContain('t5');
  });

  it('shows archived todos when showArchived is true', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: true, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const todoItems = root.querySelectorAll('.pkc-calendar-todo-item');
    const lids = Array.from(todoItems).map((i) => i.getAttribute('data-pkc-lid'));
    expect(lids).toContain('t5');
  });

  it('marks done todos with data-pkc-todo-status', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const t2 = root.querySelector('[data-pkc-lid="t2"].pkc-calendar-todo-item');
    expect(t2).not.toBeNull();
    expect(t2!.getAttribute('data-pkc-todo-status')).toBe('done');
  });

  it('todo items have select-entry action', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const t1 = root.querySelector('[data-pkc-lid="t1"].pkc-calendar-todo-item');
    expect(t1).not.toBeNull();
    expect(t1!.getAttribute('data-pkc-action')).toBe('select-entry');
  });

  it('does not show calendar view in detail mode', () => {
    const state: AppState = {
      phase: 'ready', container: calendarContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="calendar-view"]')).toBeNull();
  });
});

// ── Issue #58: Todo Archive Foundation ──

describe('Todo Archive Foundation', () => {
  const archivedContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'e1', title: 'Active Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 't1', title: 'Active Todo', body: '{"status":"open","description":"still active"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Archived Todo', body: '{"status":"done","description":"old task","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  it('hides archived todos by default (showArchived: false)', () => {
    const state: AppState = {
      phase: 'ready', container: archivedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(2); // e1 + t1, not t2
    const lids = Array.from(items).map((i) => i.getAttribute('data-pkc-lid'));
    expect(lids).not.toContain('t2');
  });

  it('shows archived todos when showArchived is true', () => {
    const state: AppState = {
      phase: 'ready', container: archivedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: true, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(3); // e1 + t1 + t2
  });

  it('shows Show Archived toggle when archived todos exist', () => {
    const state: AppState = {
      phase: 'ready', container: archivedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const toggle = root.querySelector('[data-pkc-region="show-archived-toggle"]');
    expect(toggle).not.toBeNull();
    const checkbox = toggle!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });

  it('does not show Show Archived toggle when no archived todos exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const toggle = root.querySelector('[data-pkc-region="show-archived-toggle"]');
    expect(toggle).toBeNull();
  });

  it('marks archived todo with data-pkc-todo-archived in sidebar', () => {
    const state: AppState = {
      phase: 'ready', container: archivedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: true, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const archivedItem = root.querySelector('.pkc-entry-item[data-pkc-lid="t2"]');
    expect(archivedItem).not.toBeNull();
    expect(archivedItem!.getAttribute('data-pkc-todo-archived')).toBe('true');
    const badge = archivedItem!.querySelector('.pkc-todo-archived-sidebar');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('Archived');
  });

  it('non-todo entries are not affected by archive filter', () => {
    const state: AppState = {
      phase: 'ready', container: archivedContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    // Text entry e1 should still appear
    const textEntry = root.querySelector('[data-pkc-lid="e1"]');
    expect(textEntry).not.toBeNull();
  });
});

// ── Issue #55: Interaction Consistency & Guidance Layer ──

describe('Interaction Consistency & Guidance Layer', () => {
  let root: HTMLElement;

  beforeEach(() => {
    registerPresenter('todo', todoPresenter);
    registerPresenter('form', formPresenter);
    registerPresenter('attachment', attachmentPresenter);
    root = document.createElement('div');
    root.id = 'pkc-root';
  });

  const readyState: AppState = {
    phase: 'ready', container: mockContainer,
    selectedLid: null, editingLid: null, error: null, embedded: false,
    pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
    tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
  };

  const emptyContainer: Container = {
    meta: { container_id: 'empty', title: 'Empty', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [], relations: [], revisions: [], assets: {},
  };

  it('all create buttons have title tooltips', () => {
    render(readyState, root);
    const createBtns = root.querySelectorAll('[data-pkc-action="create-entry"]');
    for (const btn of createBtns) {
      expect(btn.getAttribute('title')).toBeTruthy();
    }
  });

  it('export and import buttons have title tooltips', () => {
    render(readyState, root);
    const exportBtns = root.querySelectorAll('[data-pkc-action="begin-export"]');
    for (const btn of exportBtns) {
      expect(btn.getAttribute('title')).toBeTruthy();
    }
    const importBtn = root.querySelector('[data-pkc-action="begin-import"]');
    expect(importBtn!.getAttribute('title')).toBeTruthy();
  });

  it('action bar buttons have tooltips', () => {
    const state = { ...readyState, selectedLid: 'e1' };
    render(state, root);
    const editBtn = root.querySelector('[data-pkc-action="begin-edit"]');
    expect(editBtn!.getAttribute('title')).toBeTruthy();
    const deleteBtn = root.querySelector('[data-pkc-action="delete-entry"]');
    expect(deleteBtn!.getAttribute('title')).toBeTruthy();
  });

  it('editing action bar has save/cancel tooltips and editing status', () => {
    const state: AppState = {
      ...readyState, phase: 'editing', editingLid: 'e1', selectedLid: 'e1',
    };
    render(state, root);
    const saveBtn = root.querySelector('[data-pkc-action="commit-edit"]');
    expect(saveBtn!.getAttribute('title')).toContain('Ctrl+S');
    const cancelBtn = root.querySelector('[data-pkc-action="cancel-edit"]');
    expect(cancelBtn!.getAttribute('title')).toContain('Esc');
    // Editing status indicator
    const status = root.querySelector('.pkc-action-bar-status');
    expect(status).not.toBeNull();
    expect(status!.textContent).toContain('Editing');
  });

  it('editing action bar has data-pkc-editing attribute', () => {
    const state: AppState = {
      ...readyState, phase: 'editing', editingLid: 'e1', selectedLid: 'e1',
    };
    render(state, root);
    const bar = root.querySelector('[data-pkc-region="action-bar"]');
    expect(bar!.getAttribute('data-pkc-editing')).toBe('true');
  });

  it('clear-filters button has tooltip', () => {
    const state = { ...readyState, searchQuery: 'test' };
    render(state, root);
    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.getAttribute('title')).toBeTruthy();
  });

  it('empty state with no entries shows guidance message', () => {
    const state: AppState = { ...readyState, container: emptyContainer };
    render(state, root);
    const guidance = root.querySelector('[data-pkc-region="empty-guidance"]');
    expect(guidance).not.toBeNull();
    expect(guidance!.textContent).toContain('No entries yet');
    expect(guidance!.textContent).toContain('buttons');
  });

  it('empty state in readonly mode shows appropriate message', () => {
    const state: AppState = { ...readyState, container: emptyContainer, readonly: true };
    render(state, root);
    const guidance = root.querySelector('.pkc-empty');
    expect(guidance).not.toBeNull();
    expect(guidance!.textContent).toContain('No entries');
  });

  it('center pane shows guidance when entries exist but none selected', () => {
    render(readyState, root);
    const guidance = root.querySelector('[data-pkc-region="center-guidance"]');
    // Drop zone replaces guidance in editable mode, so check for either
    const dropZone = root.querySelector('[data-pkc-region="file-drop-zone"]');
    expect(guidance || dropZone).not.toBeNull();
  });

  it('filter results empty shows helpful message', () => {
    const state = { ...readyState, searchQuery: 'nonexistent_xyz_12345' };
    render(state, root);
    const empty = root.querySelector('.pkc-empty');
    expect(empty).not.toBeNull();
    expect(empty!.textContent).toContain('adjusting');
  });

  it('interaction hints are shown in sidebar when entries exist', () => {
    render(readyState, root);
    const hints = root.querySelector('[data-pkc-region="interaction-hints"]');
    expect(hints).not.toBeNull();
    expect(hints!.textContent).toContain('Drag');
    expect(hints!.textContent).toContain('Double-click');
    expect(hints!.textContent).toContain('Right-click');
  });

  it('interaction hints are NOT shown when no entries', () => {
    const state: AppState = { ...readyState, container: emptyContainer };
    render(state, root);
    const hints = root.querySelector('[data-pkc-region="interaction-hints"]');
    expect(hints).toBeNull();
  });

  it('pane toggle buttons have tooltips', () => {
    render(readyState, root);
    const sidebarToggle = root.querySelector('button[data-pkc-action="toggle-sidebar"]');
    expect(sidebarToggle!.getAttribute('title')).toBeTruthy();
    const metaToggle = root.querySelector('button[data-pkc-action="toggle-meta"]');
    expect(metaToggle!.getAttribute('title')).toBeTruthy();
  });

  it('tray bars have tooltips', () => {
    render(readyState, root);
    const leftTray = root.querySelector('[data-pkc-region="tray-left"]');
    expect(leftTray!.getAttribute('title')).toContain('expand');
    const rightTray = root.querySelector('[data-pkc-region="tray-right"]');
    expect(rightTray!.getAttribute('title')).toContain('expand');
  });

  it('context menu items have tooltips', () => {
    const menu = renderContextMenu('e1', 100, 200, true);
    const items = menu.querySelectorAll('.pkc-context-menu-item');
    for (const item of items) {
      expect(item.getAttribute('title')).toBeTruthy();
    }
  });

  it('terminology is consistent: all create tooltips say "entry"', () => {
    render(readyState, root);
    const createBtns = root.querySelectorAll('[data-pkc-action="create-entry"]');
    for (const btn of createBtns) {
      const tip = btn.getAttribute('title') ?? '';
      // Each tooltip should contain "entry" or "folder" (archetype name)
      expect(tip.includes('entry') || tip.includes('folder')).toBe(true);
    }
  });
});

// ── Issue #60: Todo Kanban Foundation ──

describe('Todo Kanban Foundation', () => {
  const kanbanContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"desc A","date":"2099-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"desc B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"desc C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'Archived Open', body: '{"status":"open","description":"archived","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 't5', title: 'Archived Done', body: '{"status":"done","description":"archived done","date":"2099-04-10","archived":true}', archetype: 'todo', created_at: '2026-01-01T00:05:00Z', updated_at: '2026-01-01T00:05:00Z' },
      { lid: 't6', title: 'Overdue Task', body: '{"status":"open","description":"overdue","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:06:00Z', updated_at: '2026-01-01T00:06:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function kanbanState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: kanbanContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'kanban' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('renders kanban view when viewMode is kanban', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]');
    expect(kanban).not.toBeNull();
    // Should NOT render detail or calendar
    expect(root.querySelector('[data-pkc-region="calendar-view"]')).toBeNull();
  });

  it('marks kanban button as active in view mode toggle', () => {
    render(kanbanState(), root);
    const kanbanBtn = root.querySelector('[data-pkc-view-mode="kanban"]');
    expect(kanbanBtn).not.toBeNull();
    expect(kanbanBtn!.getAttribute('data-pkc-active')).toBe('true');
    const detailBtn = root.querySelector('[data-pkc-view-mode="detail"]');
    expect(detailBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('renders both open and done columns', () => {
    render(kanbanState(), root);
    const columns = root.querySelectorAll('.pkc-kanban-column');
    expect(columns).toHaveLength(2);
    expect(columns[0]!.getAttribute('data-pkc-kanban-status')).toBe('open');
    expect(columns[1]!.getAttribute('data-pkc-kanban-status')).toBe('done');
  });

  it('excludes archived todos from kanban', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    // t4 (archived open) and t5 (archived done) should NOT appear in kanban
    expect(kanban.querySelector('[data-pkc-lid="t4"]')).toBeNull();
    expect(kanban.querySelector('[data-pkc-lid="t5"]')).toBeNull();
    // Active todos should appear
    expect(kanban.querySelector('[data-pkc-lid="t1"]')).not.toBeNull();
    expect(kanban.querySelector('[data-pkc-lid="t2"]')).not.toBeNull();
    expect(kanban.querySelector('[data-pkc-lid="t3"]')).not.toBeNull();
    expect(kanban.querySelector('[data-pkc-lid="t6"]')).not.toBeNull();
  });

  it('excludes archived todos even when showArchived is true', () => {
    render(kanbanState({ showArchived: true }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    expect(kanban.querySelector('[data-pkc-lid="t4"]')).toBeNull();
    expect(kanban.querySelector('[data-pkc-lid="t5"]')).toBeNull();
  });

  it('renders empty columns when no todos of that status exist', () => {
    const emptyContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 't1', title: 'Only Open', body: '{"status":"open","description":"x"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    render(kanbanState({ container: emptyContainer }), root);
    const columns = root.querySelectorAll('.pkc-kanban-column');
    expect(columns).toHaveLength(2);
    // Open column has 1 card
    const openCards = columns[0]!.querySelectorAll('.pkc-kanban-card');
    expect(openCards).toHaveLength(1);
    // Done column has 0 cards but still renders
    const doneCards = columns[1]!.querySelectorAll('.pkc-kanban-card');
    expect(doneCards).toHaveLength(0);
    // Done column still has header
    expect(columns[1]!.querySelector('.pkc-kanban-column-header')).not.toBeNull();
  });

  it('renders empty columns when container has no todos at all', () => {
    const noTodos: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    render(kanbanState({ container: noTodos }), root);
    const columns = root.querySelectorAll('.pkc-kanban-column');
    expect(columns).toHaveLength(2);
    expect(columns[0]!.querySelectorAll('.pkc-kanban-card')).toHaveLength(0);
    expect(columns[1]!.querySelectorAll('.pkc-kanban-card')).toHaveLength(0);
  });

  it('shows column counts in headers', () => {
    render(kanbanState(), root);
    const counts = root.querySelectorAll('.pkc-kanban-column-count');
    expect(counts).toHaveLength(2);
    // open: t1, t3, t6 (t4 is archived → excluded)
    expect(counts[0]!.textContent).toBe('3');
    // done: t2 (t5 is archived → excluded)
    expect(counts[1]!.textContent).toBe('1');
  });

  it('card click dispatches select-entry action', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]');
    expect(card).not.toBeNull();
    expect(card!.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(card!.getAttribute('data-pkc-lid')).toBe('t1');
  });

  it('marks selected card with data-pkc-selected', () => {
    render(kanbanState({ selectedLid: 't3' }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t3"]');
    expect(card!.getAttribute('data-pkc-selected')).toBe('true');
    // Other cards should not be selected
    const t1 = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]');
    expect(t1!.hasAttribute('data-pkc-selected')).toBe(false);
  });

  it('overdue todo card has overdue class on date element', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    // t6 has date 2025-01-01 and status open → overdue
    const t6Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t6"]');
    expect(t6Card).not.toBeNull();
    const dateEl = t6Card!.querySelector('.pkc-kanban-card-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(true);
  });

  it('non-overdue todo card does NOT have overdue class', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    // t1 has date 2099-04-10 and status open → not overdue (far-future date)
    const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]');
    const dateEl = t1Card!.querySelector('.pkc-kanban-card-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(false);
  });

  it('done todo does not show as overdue even with past date', () => {
    const doneWithPastDate: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'd1', title: 'Done Past', body: '{"status":"done","description":"x","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    render(kanbanState({ container: doneWithPastDate }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="d1"]');
    expect(card).not.toBeNull();
    const dateEl = card!.querySelector('.pkc-kanban-card-date');
    expect(dateEl).not.toBeNull();
    expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(false);
  });

  it('date is formatted using existing formatTodoDate helper', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]');
    const dateEl = t1Card!.querySelector('.pkc-kanban-card-date');
    expect(dateEl).not.toBeNull();
    // formatTodoDate outputs localized string, not raw YYYY-MM-DD
    expect(dateEl!.textContent).not.toBe('2026-04-10');
    expect(dateEl!.textContent!.length).toBeGreaterThan(0);
  });

  it('cards without date do not render date element', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    // t3 has no date
    const t3Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t3"]');
    expect(t3Card!.querySelector('.pkc-kanban-card-date')).toBeNull();
  });

  it('no data-pkc-todo-archived attribute on any kanban card', () => {
    render(kanbanState(), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const archivedCards = kanban.querySelectorAll('.pkc-kanban-card[data-pkc-todo-archived]');
    expect(archivedCards).toHaveLength(0);
  });
});

// ── Issue #61: Todo View Interaction Consistency ──

describe('Todo View Interaction Consistency', () => {
  const consistencyContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"desc","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"done desc"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Overdue C', body: '{"status":"open","description":"overdue","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'Archived D', body: '{"status":"open","description":"archived","archived":true,"date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
      { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function makeState(viewMode: 'detail' | 'calendar' | 'kanban', overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: consistencyContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  // ── Selection state consistency ──

  describe('selection state', () => {
    it('Kanban shows selected entry when selectedLid is set', () => {
      render(makeState('kanban', { selectedLid: 't1' }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]');
      expect(card!.getAttribute('data-pkc-selected')).toBe('true');
    });

    it('Calendar shows selected entry when selectedLid is set', () => {
      render(makeState('calendar', { selectedLid: 't1' }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('[data-pkc-lid="t1"]');
      expect(item).not.toBeNull();
      expect(item!.getAttribute('data-pkc-selected')).toBe('true');
    });

    it('sidebar shows selected entry in all view modes', () => {
      for (const mode of ['detail', 'calendar', 'kanban'] as const) {
        render(makeState(mode, { selectedLid: 't1' }), root);
        const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
        const item = sidebar.querySelector('[data-pkc-lid="t1"]');
        expect(item).not.toBeNull();
        expect(item!.getAttribute('data-pkc-selected')).toBe('true');
      }
    });

    it('selection survives view mode switch (same selectedLid)', () => {
      // Render detail with selection
      render(makeState('detail', { selectedLid: 't1' }), root);
      const sidebarDetail = root.querySelector('[data-pkc-region="sidebar"]')!;
      expect(sidebarDetail.querySelector('[data-pkc-lid="t1"][data-pkc-selected="true"]')).not.toBeNull();

      // Switch to kanban with same selectedLid
      render(makeState('kanban', { selectedLid: 't1' }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      expect(kanban.querySelector('[data-pkc-lid="t1"][data-pkc-selected="true"]')).not.toBeNull();

      // Switch to calendar with same selectedLid
      render(makeState('calendar', { selectedLid: 't1' }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      expect(cal.querySelector('[data-pkc-lid="t1"][data-pkc-selected="true"]')).not.toBeNull();
    });
  });

  // ── Click behavior consistency ──

  describe('click behavior', () => {
    it('Calendar todo items have select-entry action', () => {
      render(makeState('calendar'), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('[data-pkc-lid="t1"]');
      expect(item).not.toBeNull();
      expect(item!.getAttribute('data-pkc-action')).toBe('select-entry');
    });

    it('Kanban cards have select-entry action', () => {
      render(makeState('kanban'), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('[data-pkc-lid="t1"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute('data-pkc-action')).toBe('select-entry');
    });

    it('sidebar items have select-entry action in all view modes', () => {
      for (const mode of ['detail', 'calendar', 'kanban'] as const) {
        render(makeState(mode), root);
        const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
        const item = sidebar.querySelector('.pkc-entry-item[data-pkc-lid="t1"]');
        expect(item!.getAttribute('data-pkc-action')).toBe('select-entry');
      }
    });
  });

  // ── Overdue consistency ──

  describe('overdue display', () => {
    it('Calendar marks overdue todo items', () => {
      // t3 has date 2025-01-01 and status open → overdue
      // t3 won't show in April 2026 calendar. Use Jan 2025.
      render(makeState('calendar', { calendarYear: 2025, calendarMonth: 1 }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('[data-pkc-lid="t3"]');
      expect(item).not.toBeNull();
      expect(item!.getAttribute('data-pkc-todo-overdue')).toBe('true');
    });

    it('Calendar does NOT mark done todo as overdue', () => {
      // Use container with done + past date
      const doneOverdue: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 'd1', title: 'Done', body: '{"status":"done","description":"x","date":"2025-01-15"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
        relations: [], revisions: [], assets: {},
      };
      render(makeState('calendar', { container: doneOverdue, calendarYear: 2025, calendarMonth: 1 }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('[data-pkc-lid="d1"]');
      expect(item).not.toBeNull();
      expect(item!.hasAttribute('data-pkc-todo-overdue')).toBe(false);
    });

    it('Kanban marks overdue todo cards (same as Calendar)', () => {
      render(makeState('kanban'), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t3"]');
      expect(card).not.toBeNull();
      const dateEl = card!.querySelector('.pkc-kanban-card-date');
      expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(true);
    });
  });

  // ── Empty state consistency ──

  describe('empty state', () => {
    const emptyContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };

    it('Kanban shows empty state when no active todos exist', () => {
      render(makeState('kanban', { container: emptyContainer }), root);
      const empty = root.querySelector('[data-pkc-region="kanban-empty"]');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toContain('No active todos');
    });

    it('Kanban still shows columns even in empty state', () => {
      render(makeState('kanban', { container: emptyContainer }), root);
      const columns = root.querySelectorAll('.pkc-kanban-column');
      expect(columns).toHaveLength(2);
    });

    it('Calendar shows empty state when no dated todos this month', () => {
      render(makeState('calendar', { container: emptyContainer }), root);
      const empty = root.querySelector('[data-pkc-region="calendar-empty"]');
      expect(empty).not.toBeNull();
      expect(empty!.textContent).toContain('No dated todos');
    });

    it('Calendar does NOT show empty state when there are dated todos this month', () => {
      render(makeState('calendar'), root);
      const empty = root.querySelector('[data-pkc-region="calendar-empty"]');
      expect(empty).toBeNull();
    });

    it('Kanban does NOT show empty state when active todos exist', () => {
      render(makeState('kanban'), root);
      const empty = root.querySelector('[data-pkc-region="kanban-empty"]');
      expect(empty).toBeNull();
    });
  });

  // ── View mode toggle consistency ──

  describe('view mode toggle', () => {
    it('view mode toggle is visible in all three views', () => {
      for (const mode of ['detail', 'calendar', 'kanban'] as const) {
        render(makeState(mode), root);
        const bar = root.querySelector('[data-pkc-region="view-mode-bar"]');
        expect(bar).not.toBeNull();
      }
    });

    it('correct button is active for each view mode', () => {
      for (const mode of ['detail', 'calendar', 'kanban'] as const) {
        render(makeState(mode), root);
        const activeBtn = root.querySelector(`.pkc-view-mode-btn[data-pkc-active="true"]`);
        expect(activeBtn).not.toBeNull();
        expect(activeBtn!.getAttribute('data-pkc-view-mode')).toBe(mode);
      }
    });
  });

  // ── Non-regression: existing tests still hold ──

  describe('non-regression', () => {
    it('Detail view still works with selected entry', () => {
      render(makeState('detail', { selectedLid: 't1' }), root);
      // Detail should show the entry detail
      const detail = root.querySelector('[data-pkc-mode="view"]');
      expect(detail).not.toBeNull();
    });

    it('Calendar still renders grid', () => {
      render(makeState('calendar'), root);
      const grid = root.querySelector('.pkc-calendar-grid');
      expect(grid).not.toBeNull();
    });

    it('Kanban still renders board', () => {
      render(makeState('kanban'), root);
      const board = root.querySelector('.pkc-kanban-board');
      expect(board).not.toBeNull();
    });
  });
});

// ── Issue #62: Todo Kanban Status Move Foundation ──

describe('Todo Kanban Status Move Foundation', () => {
  const statusMoveContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"desc A","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"desc B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Open C', body: '{"status":"open","description":"desc C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function statusState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: statusMoveContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'kanban' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  // ── Action rendering ──

  describe('action rendering', () => {
    it('open card has "Done" status button', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      const btn = t1Card.querySelector('.pkc-kanban-status-btn');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('Done');
      expect(btn!.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
      expect(btn!.getAttribute('data-pkc-lid')).toBe('t1');
    });

    it('done card has "Reopen" status button', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const t2Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t2"]')!;
      const btn = t2Card.querySelector('.pkc-kanban-status-btn');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('Reopen');
      expect(btn!.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
      expect(btn!.getAttribute('data-pkc-lid')).toBe('t2');
    });

    it('readonly mode does NOT show status buttons', () => {
      render(statusState({ readonly: true }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const btns = kanban.querySelectorAll('.pkc-kanban-status-btn');
      expect(btns).toHaveLength(0);
    });
  });

  // ── Click behavior (no collision) ──

  describe('click behavior', () => {
    it('status button is nested inside card but has its own action', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      const btn = t1Card.querySelector('.pkc-kanban-status-btn')!;

      // The button is inside the card
      expect(t1Card.contains(btn)).toBe(true);

      // But the button has its own data-pkc-action (toggle-todo-status)
      // which differs from the card's data-pkc-action (select-entry)
      expect(btn.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
      expect(t1Card.getAttribute('data-pkc-action')).toBe('select-entry');

      // closest('[data-pkc-action]') from the button should return the button itself
      // not the card, preventing double-fire
      expect(btn.closest('[data-pkc-action]')).toBe(btn);
    });
  });

  // ── Update path verification ──

  describe('update path', () => {
    it('toggle-todo-status action uses QUICK_UPDATE_ENTRY (status only, other fields preserved)', () => {
      // This test verifies the action-binder contract:
      // The toggle-todo-status handler reads the entry body, flips status,
      // and dispatches QUICK_UPDATE_ENTRY with the rest preserved.
      // We verify the rendering reflects the contract by checking the
      // button attributes match the existing toggle-todo-status action pattern.
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;

      // All status buttons use the same action as the existing detail view toggle
      const btns = kanban.querySelectorAll('.pkc-kanban-status-btn');
      for (const btn of btns) {
        expect(btn.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
        expect(btn.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });
  });

  // ── Selection maintained ──

  describe('selection', () => {
    it('status button has data-pkc-lid matching the card entry', () => {
      render(statusState({ selectedLid: 't1' }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      const btn = t1Card.querySelector('.pkc-kanban-status-btn')!;

      // The button targets the same entry as the card
      expect(btn.getAttribute('data-pkc-lid')).toBe('t1');
      // Card is still marked as selected
      expect(t1Card.getAttribute('data-pkc-selected')).toBe('true');
    });
  });

  // ── Overdue relationship ──

  describe('overdue relationship', () => {
    it('open todo with past date shows overdue + status button', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      // t1 has date 2025-01-01 and status open → overdue
      const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      const dateEl = t1Card.querySelector('.pkc-kanban-card-date');
      expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(true);
      // Status button should offer to mark done
      const btn = t1Card.querySelector('.pkc-kanban-status-btn')!;
      expect(btn.textContent).toContain('Done');
    });

    it('done todo with past date does NOT show overdue', () => {
      // Create a container with done + past date todo
      const donePast: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 'd1', title: 'Done Past', body: '{"status":"done","description":"x","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
        relations: [], revisions: [], assets: {},
      };
      render(statusState({ container: donePast }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="d1"]')!;
      const dateEl = card.querySelector('.pkc-kanban-card-date');
      expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(false);
      // Button should offer to reopen
      const btn = card.querySelector('.pkc-kanban-status-btn')!;
      expect(btn.textContent).toContain('Reopen');
    });
  });

  // ── Empty state not broken ──

  describe('empty state preservation', () => {
    it('empty columns still render even with status buttons present', () => {
      // Only open todos, no done todos
      const onlyOpen: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 't1', title: 'Only Open', body: '{"status":"open","description":"x"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
        relations: [], revisions: [], assets: {},
      };
      render(statusState({ container: onlyOpen }), root);
      const columns = root.querySelectorAll('.pkc-kanban-column');
      expect(columns).toHaveLength(2);
      // Done column is empty but present
      const doneCol = columns[1]!;
      expect(doneCol.querySelectorAll('.pkc-kanban-card')).toHaveLength(0);
      expect(doneCol.querySelector('.pkc-kanban-column-header')).not.toBeNull();
    });

    it('kanban empty state shows when no todos exist (with status buttons feature)', () => {
      const noTodos: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
        relations: [], revisions: [], assets: {},
      };
      render(statusState({ container: noTodos }), root);
      const empty = root.querySelector('[data-pkc-region="kanban-empty"]');
      expect(empty).not.toBeNull();
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('card still has select-entry action for click', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      expect(card.getAttribute('data-pkc-action')).toBe('select-entry');
    });

    it('all three columns render labels correctly', () => {
      render(statusState(), root);
      const labels = root.querySelectorAll('.pkc-kanban-column-label');
      expect(labels).toHaveLength(2);
      expect(labels[0]!.textContent).toBe('Todo');
      expect(labels[1]!.textContent).toBe('Done');
    });

    it('status button count matches card count', () => {
      render(statusState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      const btns = kanban.querySelectorAll('.pkc-kanban-status-btn');
      expect(btns).toHaveLength(cards.length);
    });
  });
});

// ── Issue #63: Todo Kanban DnD Foundation ──

describe('Todo Kanban DnD Foundation', () => {
  const dndContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"desc A","date":"2025-01-01"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"desc B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Open C', body: '{"status":"open","description":"desc C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function dndState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: dndContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'kanban' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  // ── Drag source attributes ──

  describe('drag source attributes', () => {
    it('cards have draggable="true" in non-readonly mode', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.getAttribute('draggable')).toBe('true');
      }
    });

    it('cards have data-pkc-kanban-draggable attribute in non-readonly mode', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      for (const card of cards) {
        expect(card.getAttribute('data-pkc-kanban-draggable')).toBe('true');
      }
    });

    it('cards are NOT draggable in readonly mode', () => {
      render(dndState({ readonly: true }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.getAttribute('draggable')).toBeNull();
        expect(card.getAttribute('data-pkc-kanban-draggable')).toBeNull();
      }
    });
  });

  // ── Drop target attributes ──

  describe('drop target attributes', () => {
    it('open column list has data-pkc-kanban-drop-target="open"', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const openList = kanban.querySelector('[data-pkc-kanban-drop-target="open"]');
      expect(openList).not.toBeNull();
      expect(openList!.classList.contains('pkc-kanban-list')).toBe(true);
    });

    it('done column list has data-pkc-kanban-drop-target="done"', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const doneList = kanban.querySelector('[data-pkc-kanban-drop-target="done"]');
      expect(doneList).not.toBeNull();
      expect(doneList!.classList.contains('pkc-kanban-list')).toBe(true);
    });

    it('drop targets are present even in readonly mode (but cards are not draggable)', () => {
      render(dndState({ readonly: true }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const dropTargets = kanban.querySelectorAll('[data-pkc-kanban-drop-target]');
      expect(dropTargets).toHaveLength(2);
    });
  });

  // ── Card-column relationship ──

  describe('card-column relationship', () => {
    it('open cards are inside the open column drop target', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const openList = kanban.querySelector('[data-pkc-kanban-drop-target="open"]')!;
      const cards = openList.querySelectorAll('.pkc-kanban-card');
      expect(cards).toHaveLength(2); // t1 and t3
      const lids = Array.from(cards).map(c => c.getAttribute('data-pkc-lid'));
      expect(lids).toContain('t1');
      expect(lids).toContain('t3');
    });

    it('done cards are inside the done column drop target', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const doneList = kanban.querySelector('[data-pkc-kanban-drop-target="done"]')!;
      const cards = doneList.querySelectorAll('.pkc-kanban-card');
      expect(cards).toHaveLength(1); // t2
      expect(cards[0]!.getAttribute('data-pkc-lid')).toBe('t2');
    });
  });

  // ── Coexistence with select-entry ──

  describe('coexistence with existing actions', () => {
    it('draggable cards still have data-pkc-action="select-entry"', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card[data-pkc-kanban-draggable]');
      for (const card of cards) {
        expect(card.getAttribute('data-pkc-action')).toBe('select-entry');
      }
    });

    it('status buttons are still present alongside draggable attribute', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      for (const card of cards) {
        const btn = card.querySelector('.pkc-kanban-status-btn');
        expect(btn).not.toBeNull();
        expect(btn!.getAttribute('data-pkc-action')).toBe('toggle-todo-status');
      }
    });
  });

  // ── Selection and overdue preserved ──

  describe('selection preserved with DnD attributes', () => {
    it('selected card has both data-pkc-selected and draggable', () => {
      render(dndState({ selectedLid: 't1' }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      expect(card.getAttribute('data-pkc-selected')).toBe('true');
      expect(card.getAttribute('draggable')).toBe('true');
    });

    it('overdue styling still applies on draggable cards', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      // t1 is open with date 2025-01-01 (past) → overdue
      const t1Card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t1"]')!;
      const dateEl = t1Card.querySelector('.pkc-kanban-card-date');
      expect(dateEl).not.toBeNull();
      expect(dateEl!.classList.contains('pkc-todo-date-overdue')).toBe(true);
    });
  });

  // ── Empty state ──

  describe('empty state', () => {
    it('empty kanban board still has both drop targets', () => {
      const noTodos: Container = {
        meta: mockContainer.meta,
        entries: [],
        relations: [],
        revisions: [],
        assets: {},
      };
      render(dndState({ container: noTodos }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const dropTargets = kanban.querySelectorAll('[data-pkc-kanban-drop-target]');
      expect(dropTargets).toHaveLength(2);
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('sidebar entries do NOT have kanban draggable attributes', () => {
      render(dndState(), root);
      const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
      const kanbanDraggables = sidebar.querySelectorAll('[data-pkc-kanban-draggable]');
      expect(kanbanDraggables).toHaveLength(0);
    });

    it('view mode toggle still renders three buttons', () => {
      render(dndState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="set-view-mode"]');
      expect(btns).toHaveLength(3);
    });

    it('kanban column count badge still accurate', () => {
      render(dndState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const badges = kanban.querySelectorAll('.pkc-kanban-column-count');
      expect(badges[0]!.textContent).toBe('2'); // open: t1, t3
      expect(badges[1]!.textContent).toBe('1'); // done: t2
    });
  });
});

// ── Issue #64: Todo Calendar Date Move Foundation ──

describe('Todo Calendar Date Move Foundation', () => {
  const calDndContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
      { lid: 't4', title: 'No Date', body: '{"status":"open","description":"D"}', archetype: 'todo', created_at: '2026-01-01T00:04:00Z', updated_at: '2026-01-01T00:04:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function calDndState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: calDndContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  // ── Drag source attributes ──

  describe('drag source attributes', () => {
    it('calendar todo items have draggable="true" in non-readonly mode', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.getAttribute('draggable')).toBe('true');
      }
    });

    it('calendar todo items have data-pkc-calendar-draggable attribute', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item');
      for (const item of items) {
        expect(item.getAttribute('data-pkc-calendar-draggable')).toBe('true');
      }
    });

    it('calendar todo items are NOT draggable in readonly mode', () => {
      render(calDndState({ readonly: true }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.getAttribute('draggable')).toBeNull();
        expect(item.getAttribute('data-pkc-calendar-draggable')).toBeNull();
      }
    });
  });

  // ── Drop target attributes ──

  describe('drop target attributes', () => {
    it('day cells have data-pkc-calendar-drop-target attribute', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const dropTargets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      // April 2026 has 30 days
      expect(dropTargets.length).toBe(30);
    });

    it('day cells have data-pkc-date with YYYY-MM-DD format', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const dropTargets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      const firstDate = dropTargets[0]!.getAttribute('data-pkc-date');
      expect(firstDate).toBe('2026-04-01');
      const lastDate = dropTargets[dropTargets.length - 1]!.getAttribute('data-pkc-date');
      expect(lastDate).toBe('2026-04-30');
    });

    it('empty cells (outside month) do NOT have drop target', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const emptyCells = cal.querySelectorAll('.pkc-calendar-cell-empty');
      for (const cell of emptyCells) {
        expect(cell.hasAttribute('data-pkc-calendar-drop-target')).toBe(false);
      }
    });

    it('drop targets are present even in readonly mode', () => {
      render(calDndState({ readonly: true }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const dropTargets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      expect(dropTargets.length).toBe(30);
    });
  });

  // ── Item-cell relationship ──

  describe('item-cell relationship', () => {
    it('todo items are inside the correct date cell', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const cell10 = cal.querySelector('[data-pkc-date="2026-04-10"]')!;
      const items = cell10.querySelectorAll('.pkc-calendar-todo-item');
      expect(items).toHaveLength(2); // t1 and t2
      const lids = Array.from(items).map(i => i.getAttribute('data-pkc-lid'));
      expect(lids).toContain('t1');
      expect(lids).toContain('t2');
    });

    it('cell with no todos has no items but still has drop target', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const cell01 = cal.querySelector('[data-pkc-date="2026-04-01"]')!;
      const items = cell01.querySelectorAll('.pkc-calendar-todo-item');
      expect(items).toHaveLength(0);
      expect(cell01.hasAttribute('data-pkc-calendar-drop-target')).toBe(true);
    });
  });

  // ── Coexistence with existing actions ──

  describe('coexistence with existing actions', () => {
    it('draggable items still have data-pkc-action="select-entry"', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item[data-pkc-calendar-draggable]');
      for (const item of items) {
        expect(item.getAttribute('data-pkc-action')).toBe('select-entry');
      }
    });

    it('draggable items still have data-pkc-lid', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item[data-pkc-calendar-draggable]');
      for (const item of items) {
        expect(item.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });
  });

  // ── Selection and overdue preserved ──

  describe('selection preserved with DnD attributes', () => {
    it('selected item has both data-pkc-selected and draggable', () => {
      render(calDndState({ selectedLid: 't1' }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('.pkc-calendar-todo-item[data-pkc-lid="t1"]')!;
      expect(item.getAttribute('data-pkc-selected')).toBe('true');
      expect(item.getAttribute('draggable')).toBe('true');
    });

    it('overdue attribute still applies on draggable items', () => {
      // t1 is open with date 2026-04-10 — not overdue (future from today 2026-04-08)
      // To test overdue, use a past-date todo
      const pastContainer: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 'p1', title: 'Past', body: '{"status":"open","description":"P","date":"2026-04-01"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
        ],
        relations: [], revisions: [], assets: {},
      };
      render(calDndState({ container: pastContainer }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('.pkc-calendar-todo-item[data-pkc-lid="p1"]')!;
      expect(item.getAttribute('data-pkc-todo-overdue')).toBe('true');
      expect(item.getAttribute('draggable')).toBe('true');
    });
  });

  // ── Empty state ──

  describe('empty state', () => {
    it('empty calendar still has drop targets on day cells', () => {
      const noTodos: Container = {
        meta: mockContainer.meta,
        entries: [],
        relations: [], revisions: [], assets: {},
      };
      render(calDndState({ container: noTodos }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const dropTargets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      expect(dropTargets.length).toBe(30); // April has 30 days
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('kanban cards do NOT have calendar draggable attributes', () => {
      render(calDndState({ viewMode: 'kanban' }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const calDraggables = kanban.querySelectorAll('[data-pkc-calendar-draggable]');
      expect(calDraggables).toHaveLength(0);
    });

    it('sidebar entries do NOT have calendar draggable attributes', () => {
      render(calDndState(), root);
      const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
      const calDraggables = sidebar.querySelectorAll('[data-pkc-calendar-draggable]');
      expect(calDraggables).toHaveLength(0);
    });

    it('view mode toggle still renders three buttons', () => {
      render(calDndState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="set-view-mode"]');
      expect(btns).toHaveLength(3);
    });

    it('calendar navigation buttons still present', () => {
      render(calDndState(), root);
      expect(root.querySelector('[data-pkc-action="calendar-prev"]')).not.toBeNull();
      expect(root.querySelector('[data-pkc-action="calendar-next"]')).not.toBeNull();
    });

    it('today marker still present on today cell', () => {
      render(calDndState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const todayCell = cal.querySelector('[data-pkc-calendar-today="true"]');
      expect(todayCell).not.toBeNull();
      // Verify the today cell has a date attribute matching today
      const todayStr = new Date().toISOString().slice(0, 10);
      expect(todayCell!.getAttribute('data-pkc-date')).toBe(todayStr);
    });
  });
});

// ── Issue #66: Todo Kanban → Calendar Cross-View DnD Foundation ──

describe('Todo Kanban → Calendar Cross-View DnD Foundation', () => {
  const crossViewContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Open NoDate', body: '{"status":"open","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function kanbanState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: crossViewContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'kanban' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function calendarState(overrides?: Partial<AppState>): AppState {
    return kanbanState({ viewMode: 'calendar' as const, ...overrides });
  }

  // ── View switch attributes ──

  describe('view switch attributes', () => {
    it('non-active view mode buttons have data-pkc-view-switch', () => {
      render(kanbanState(), root);
      const bar = root.querySelector('[data-pkc-region="view-mode-bar"]')!;
      const btns = bar.querySelectorAll('[data-pkc-view-switch]');
      // Kanban is active → Detail and Calendar should have view-switch
      expect(btns).toHaveLength(2);
      const modes = Array.from(btns).map(b => b.getAttribute('data-pkc-view-switch'));
      expect(modes).toContain('detail');
      expect(modes).toContain('calendar');
    });

    it('active view mode button does NOT have data-pkc-view-switch', () => {
      render(kanbanState(), root);
      const activeBtn = root.querySelector('[data-pkc-active="true"]')!;
      expect(activeBtn.hasAttribute('data-pkc-view-switch')).toBe(false);
    });

    it('calendar mode: Calendar button is active, Kanban has view-switch', () => {
      render(calendarState(), root);
      const calBtn = root.querySelector('[data-pkc-view-mode="calendar"]')!;
      expect(calBtn.getAttribute('data-pkc-active')).toBe('true');
      expect(calBtn.hasAttribute('data-pkc-view-switch')).toBe(false);

      const kanbanBtn = root.querySelector('[data-pkc-view-mode="kanban"]')!;
      expect(kanbanBtn.getAttribute('data-pkc-view-switch')).toBe('kanban');
    });
  });

  // ── Cross-view drop target compatibility ──

  describe('cross-view drop target compatibility', () => {
    it('Calendar day cells still have drop target attributes when switching from kanban', () => {
      // Simulate: user was in Kanban, now views Calendar
      render(calendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const dropTargets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      expect(dropTargets.length).toBe(30); // April 2026
    });

    it('Calendar day cells have data-pkc-date for cross-view lid resolution', () => {
      render(calendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const cell15 = cal.querySelector('[data-pkc-date="2026-04-15"]');
      expect(cell15).not.toBeNull();
      expect(cell15!.hasAttribute('data-pkc-calendar-drop-target')).toBe(true);
    });

    it('Kanban cards have draggable + data-pkc-kanban-draggable + lid', () => {
      render(kanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card[data-pkc-kanban-draggable]');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.getAttribute('draggable')).toBe('true');
        expect(card.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });
  });

  // ── Date-less todos in Kanban ──

  describe('date-less todos as cross-view source', () => {
    it('date-less todo appears in Kanban as draggable card', () => {
      render(kanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('.pkc-kanban-card[data-pkc-lid="t3"]');
      expect(card).not.toBeNull();
      expect(card!.getAttribute('draggable')).toBe('true');
    });

    it('date-less todo does NOT appear in Calendar', () => {
      render(calendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('[data-pkc-lid="t3"]');
      expect(item).toBeNull();
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('Kanban internal DnD: cards still have kanban-draggable', () => {
      render(kanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('[data-pkc-kanban-draggable]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('Kanban internal DnD: columns still have kanban-drop-target', () => {
      render(kanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const openList = kanban.querySelector('[data-pkc-kanban-drop-target="open"]');
      const doneList = kanban.querySelector('[data-pkc-kanban-drop-target="done"]');
      expect(openList).not.toBeNull();
      expect(doneList).not.toBeNull();
    });

    it('Calendar internal DnD: items still have calendar-draggable', () => {
      render(calendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('[data-pkc-calendar-draggable]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('Kanban status move buttons still present', () => {
      render(kanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const btns = kanban.querySelectorAll('[data-pkc-action="toggle-todo-status"]');
      expect(btns.length).toBeGreaterThan(0);
    });

    it('Calendar click selection still works (select-entry on items)', () => {
      render(calendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('.pkc-calendar-todo-item[data-pkc-lid="t1"]');
      expect(item).not.toBeNull();
      expect(item!.getAttribute('data-pkc-action')).toBe('select-entry');
    });

    it('view mode toggle still renders three buttons', () => {
      render(kanbanState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="set-view-mode"]');
      expect(btns).toHaveLength(3);
    });

    it('readonly mode: no draggable on Kanban cards, no view-switch risk', () => {
      render(kanbanState({ readonly: true }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('.pkc-kanban-card');
      for (const card of cards) {
        expect(card.getAttribute('draggable')).toBeNull();
      }
    });
  });
});

// ── Issue #67: DnD Cleanup & Cancellation Robustness ──

describe('DnD Cleanup & Cancellation Robustness', () => {
  const cleanupContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"B"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function cleanupKanbanState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: cleanupContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'kanban' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function cleanupCalendarState(overrides?: Partial<AppState>): AppState {
    return cleanupKanbanState({ viewMode: 'calendar' as const, ...overrides });
  }

  // ── Fresh render has no drag state ──

  describe('fresh render: no drag artifacts', () => {
    it('kanban: no data-pkc-dragging on fresh render', () => {
      render(cleanupKanbanState(), root);
      const dragging = root.querySelectorAll('[data-pkc-dragging]');
      expect(dragging).toHaveLength(0);
    });

    it('kanban: no data-pkc-drag-over on fresh render', () => {
      render(cleanupKanbanState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });

    it('calendar: no data-pkc-dragging on fresh render', () => {
      render(cleanupCalendarState(), root);
      const dragging = root.querySelectorAll('[data-pkc-dragging]');
      expect(dragging).toHaveLength(0);
    });

    it('calendar: no data-pkc-drag-over on fresh render', () => {
      render(cleanupCalendarState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });
  });

  // ── Re-render clears stale visual state ──

  describe('re-render clears stale visual state', () => {
    it('kanban: drag-over attribute removed after re-render', () => {
      render(cleanupKanbanState(), root);
      // Simulate stale drag-over on a kanban list
      const list = root.querySelector('[data-pkc-kanban-drop-target]')!;
      list.setAttribute('data-pkc-drag-over', 'true');
      expect(list.getAttribute('data-pkc-drag-over')).toBe('true');
      // Re-render replaces DOM, stale attribute is gone
      render(cleanupKanbanState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });

    it('calendar: drag-over attribute removed after re-render', () => {
      render(cleanupCalendarState(), root);
      const cell = root.querySelector('[data-pkc-calendar-drop-target]')!;
      cell.setAttribute('data-pkc-drag-over', 'true');
      // Re-render replaces DOM
      render(cleanupCalendarState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });

    it('view mode button: drag-over attribute removed after re-render', () => {
      render(cleanupKanbanState(), root);
      const btn = root.querySelector('[data-pkc-view-switch]')!;
      btn.setAttribute('data-pkc-drag-over', 'true');
      // Re-render replaces DOM
      render(cleanupKanbanState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-view-switch][data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });
  });

  // ── View switch replaces stale DOM ──

  describe('view switch replaces stale drag DOM', () => {
    it('switching from kanban to calendar removes kanban drag-over', () => {
      render(cleanupKanbanState(), root);
      const list = root.querySelector('[data-pkc-kanban-drop-target]')!;
      list.setAttribute('data-pkc-drag-over', 'true');
      // Switch to calendar
      render(cleanupCalendarState(), root);
      // Old kanban DOM is gone, no drag-over remains
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });

    it('switching from calendar to kanban removes calendar drag-over', () => {
      render(cleanupCalendarState(), root);
      const cell = root.querySelector('[data-pkc-calendar-drop-target]')!;
      cell.setAttribute('data-pkc-drag-over', 'true');
      // Switch to kanban
      render(cleanupKanbanState(), root);
      const dragOver = root.querySelectorAll('[data-pkc-drag-over]');
      expect(dragOver).toHaveLength(0);
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('kanban cards still draggable', () => {
      render(cleanupKanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('[data-pkc-kanban-draggable]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('calendar items still draggable', () => {
      render(cleanupCalendarState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('[data-pkc-calendar-draggable]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('kanban status buttons still present', () => {
      render(cleanupKanbanState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="toggle-todo-status"]');
      expect(btns.length).toBeGreaterThan(0);
    });

    it('view switch attributes still on non-active tabs', () => {
      render(cleanupKanbanState(), root);
      const switchBtns = root.querySelectorAll('[data-pkc-view-switch]');
      expect(switchBtns).toHaveLength(2);
    });

    it('click selection still works (select-entry present)', () => {
      render(cleanupKanbanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const card = kanban.querySelector('[data-pkc-action="select-entry"]');
      expect(card).not.toBeNull();
    });
  });
});

// ── Issue #68: Calendar → Kanban Cross-View DnD Foundation ──

describe('Todo Calendar → Kanban Cross-View DnD Foundation', () => {
  const cal2kanContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"B","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Open NoDate', body: '{"status":"open","description":"C"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function calState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: cal2kanContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'calendar' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function kanState(overrides?: Partial<AppState>): AppState {
    return calState({ viewMode: 'kanban' as const, ...overrides });
  }

  // ── Cross-view source/target compatibility ──

  describe('cross-view source/target compatibility', () => {
    it('Calendar items are draggable with lid for cross-view', () => {
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item[data-pkc-calendar-draggable]');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.getAttribute('draggable')).toBe('true');
        expect(item.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });

    it('Kanban columns have drop-target with status value', () => {
      render(kanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const openList = kanban.querySelector('[data-pkc-kanban-drop-target="open"]');
      const doneList = kanban.querySelector('[data-pkc-kanban-drop-target="done"]');
      expect(openList).not.toBeNull();
      expect(doneList).not.toBeNull();
    });

    it('view-switch button for Kanban is present when in Calendar', () => {
      render(calState(), root);
      const kanbanSwitch = root.querySelector('[data-pkc-view-switch="kanban"]');
      expect(kanbanSwitch).not.toBeNull();
    });

    it('view-switch button for Calendar is present when in Kanban', () => {
      render(kanState(), root);
      const calSwitch = root.querySelector('[data-pkc-view-switch="calendar"]');
      expect(calSwitch).not.toBeNull();
    });
  });

  // ── Bidirectional bridge symmetry ──

  describe('bidirectional bridge symmetry', () => {
    it('Calendar items have same lid format as Kanban cards', () => {
      // Verify same entry appears in both views with same lid
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const calItem = cal.querySelector('[data-pkc-lid="t1"]');
      expect(calItem).not.toBeNull();

      render(kanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const kanCard = kanban.querySelector('[data-pkc-lid="t1"]');
      expect(kanCard).not.toBeNull();
    });

    it('dated Todo in Calendar has status that matches Kanban column', () => {
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const t2Item = cal.querySelector('[data-pkc-lid="t2"]');
      expect(t2Item).not.toBeNull();
      expect(t2Item!.getAttribute('data-pkc-todo-status')).toBe('done');

      render(kanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const doneList = kanban.querySelector('[data-pkc-kanban-drop-target="done"]')!;
      const t2Card = doneList.querySelector('[data-pkc-lid="t2"]');
      expect(t2Card).not.toBeNull();
    });
  });

  // ── Non-regression ──

  describe('non-regression', () => {
    it('Kanban internal DnD: cards still have kanban-draggable', () => {
      render(kanState(), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('[data-pkc-kanban-draggable]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('Calendar internal DnD: items still have calendar-draggable', () => {
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('[data-pkc-calendar-draggable]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('Kanban → Calendar bridge: Calendar drop targets still present', () => {
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const targets = cal.querySelectorAll('[data-pkc-calendar-drop-target]');
      expect(targets.length).toBe(30);
    });

    it('Kanban status move buttons still present', () => {
      render(kanState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="toggle-todo-status"]');
      expect(btns.length).toBeGreaterThan(0);
    });

    it('Calendar click selection preserved (select-entry on items)', () => {
      render(calState(), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const item = cal.querySelector('.pkc-calendar-todo-item[data-pkc-lid="t1"]');
      expect(item!.getAttribute('data-pkc-action')).toBe('select-entry');
    });

    it('view mode toggle renders three buttons', () => {
      render(kanState(), root);
      const btns = root.querySelectorAll('[data-pkc-action="set-view-mode"]');
      expect(btns).toHaveLength(3);
    });

    it('readonly: no draggable Calendar items', () => {
      render(calState({ readonly: true }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('.pkc-calendar-todo-item');
      for (const item of items) {
        expect(item.getAttribute('draggable')).toBeNull();
      }
    });
  });
});

// ── Calendar/Kanban Multi-Select Phase 1: Visual Feedback ──

describe('Calendar/Kanban Multi-Select Visual Feedback', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  const msContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Task A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Task B', body: '{"status":"done","description":"B","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
      { lid: 't3', title: 'Task C', body: '{"status":"open","description":"C","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:03:00Z', updated_at: '2026-01-01T00:03:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  function msState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: msContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  // ── Calendar visual feedback ──

  it('Calendar: marks multi-selected items with data-pkc-multi-selected', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1', 't3'] }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t1 = cal.querySelector('[data-pkc-lid="t1"]');
    const t2 = cal.querySelector('[data-pkc-lid="t2"]');
    const t3 = cal.querySelector('[data-pkc-lid="t3"]');
    expect(t1!.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(t2!.hasAttribute('data-pkc-multi-selected')).toBe(false);
    expect(t3!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('Calendar: multi-selected coexists with single selected', () => {
    render(msState({ viewMode: 'calendar', selectedLid: 't1', multiSelectedLids: ['t1', 't2'] }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t1 = cal.querySelector('[data-pkc-lid="t1"]');
    expect(t1!.getAttribute('data-pkc-selected')).toBe('true');
    expect(t1!.getAttribute('data-pkc-multi-selected')).toBe('true');
    const t2 = cal.querySelector('[data-pkc-lid="t2"]');
    expect(t2!.hasAttribute('data-pkc-selected')).toBe(false);
    expect(t2!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('Calendar: no multi-selected attributes when multiSelectedLids is empty', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: [] }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const items = cal.querySelectorAll('[data-pkc-multi-selected]');
    expect(items).toHaveLength(0);
  });

  // ── Kanban visual feedback ──

  it('Kanban: marks multi-selected cards with data-pkc-multi-selected', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t1', 't3'] }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t1 = kanban.querySelector('[data-pkc-lid="t1"]');
    const t2 = kanban.querySelector('[data-pkc-lid="t2"]');
    const t3 = kanban.querySelector('[data-pkc-lid="t3"]');
    expect(t1!.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(t2!.hasAttribute('data-pkc-multi-selected')).toBe(false);
    expect(t3!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('Kanban: multi-selected coexists with single selected', () => {
    render(msState({ viewMode: 'kanban', selectedLid: 't2', multiSelectedLids: ['t1', 't2'] }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t2 = kanban.querySelector('[data-pkc-lid="t2"]');
    expect(t2!.getAttribute('data-pkc-selected')).toBe('true');
    expect(t2!.getAttribute('data-pkc-multi-selected')).toBe('true');
    const t1 = kanban.querySelector('[data-pkc-lid="t1"]');
    expect(t1!.hasAttribute('data-pkc-selected')).toBe(false);
    expect(t1!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('Kanban: no multi-selected attributes when multiSelectedLids is empty', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: [] }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const items = kanban.querySelectorAll('[data-pkc-multi-selected]');
    expect(items).toHaveLength(0);
  });

  // ── Sidebar consistency ──

  it('Sidebar: multi-selected attribute is consistent with Calendar view', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1', 't3'] }), root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const sidebarT1 = sidebar.querySelector('.pkc-entry-item[data-pkc-lid="t1"]');
    const sidebarT3 = sidebar.querySelector('.pkc-entry-item[data-pkc-lid="t3"]');
    expect(sidebarT1!.getAttribute('data-pkc-multi-selected')).toBe('true');
    expect(sidebarT3!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  // ── Multi-action bar coherence ──

  it('multi-action bar shows in sidebar when viewMode is calendar and multiSelectedLids is non-empty', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1', 't2'] }), root);
    const bar = root.querySelector('[data-pkc-region="multi-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('2 selected');
  });

  it('multi-action bar shows in sidebar when viewMode is kanban and multiSelectedLids is non-empty', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t1'] }), root);
    const bar = root.querySelector('[data-pkc-region="multi-action-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.textContent).toContain('1 selected');
  });

  it('multi-action bar hidden in readonly even with multiSelectedLids', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t1'], readonly: true }), root);
    const bar = root.querySelector('[data-pkc-region="multi-action-bar"]');
    expect(bar).toBeNull();
  });

  // ── Bulk status select in multi-action bar ──

  it('multi-action bar shows bulk status select when todos are selected', () => {
    render(msState({ multiSelectedLids: ['t1', 't2'] }), root);
    const statusSelect = root.querySelector('[data-pkc-action="bulk-set-status"]');
    expect(statusSelect).not.toBeNull();
    const options = statusSelect!.querySelectorAll('option');
    expect(options).toHaveLength(3); // placeholder + Open + Done
  });

  it('multi-action bar hides bulk status select when no todos in selection', () => {
    // Create a container with only non-todo entries selected
    const noTodoContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'n2', title: 'Note 2', body: 'text2', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    render(msState({ container: noTodoContainer, multiSelectedLids: ['n1', 'n2'] }), root);
    const statusSelect = root.querySelector('[data-pkc-action="bulk-set-status"]');
    expect(statusSelect).toBeNull();
  });

  it('bulk status select shows in calendar view', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1', 't3'] }), root);
    const statusSelect = root.querySelector('[data-pkc-action="bulk-set-status"]');
    expect(statusSelect).not.toBeNull();
  });

  // ── Bulk date input in multi-action bar ──

  it('multi-action bar shows date input when todos are selected', () => {
    render(msState({ multiSelectedLids: ['t1', 't2'] }), root);
    const dateInput = root.querySelector('[data-pkc-action="bulk-set-date"]');
    expect(dateInput).not.toBeNull();
    expect((dateInput as HTMLInputElement).type).toBe('date');
  });

  it('multi-action bar shows clear-date button when todos are selected', () => {
    render(msState({ multiSelectedLids: ['t1'] }), root);
    const clearDate = root.querySelector('[data-pkc-action="bulk-clear-date"]');
    expect(clearDate).not.toBeNull();
  });

  it('date input hidden when no todos in selection', () => {
    const noTodoContainer: Container = {
      meta: mockContainer.meta,
      entries: [
        { lid: 'n1', title: 'Note', body: 'text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { lid: 'n2', title: 'Note 2', body: 'text2', archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      ],
      relations: [], revisions: [], assets: {},
    };
    render(msState({ container: noTodoContainer, multiSelectedLids: ['n1', 'n2'] }), root);
    expect(root.querySelector('[data-pkc-action="bulk-set-date"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="bulk-clear-date"]')).toBeNull();
  });

  it('date input shows in kanban view', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t1', 't2'] }), root);
    expect(root.querySelector('[data-pkc-action="bulk-set-date"]')).not.toBeNull();
  });

  // ── Ghost selection resolution (view switch) ──

  it('multi-selected survives view switch from detail to calendar', () => {
    // Render in detail mode with multi-select
    render(msState({ viewMode: 'detail', multiSelectedLids: ['t1', 't2'] }), root);
    const sidebarDetail = root.querySelector('[data-pkc-region="sidebar"]')!;
    expect(sidebarDetail.querySelectorAll('[data-pkc-multi-selected]')).toHaveLength(2);

    // Re-render in calendar mode with same state
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1', 't2'] }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const multiItems = cal.querySelectorAll('[data-pkc-multi-selected]');
    expect(multiItems).toHaveLength(2);
    // Sidebar also retains
    const sidebarCal = root.querySelector('[data-pkc-region="sidebar"]')!;
    expect(sidebarCal.querySelectorAll('[data-pkc-multi-selected]')).toHaveLength(2);
  });

  it('multi-selected survives view switch from detail to kanban', () => {
    render(msState({ viewMode: 'detail', multiSelectedLids: ['t2', 't3'] }), root);
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t2', 't3'] }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const multiCards = kanban.querySelectorAll('[data-pkc-multi-selected]');
    expect(multiCards).toHaveLength(2);
  });

  // ── Single selection regression ──

  it('Calendar: single selection still works without multi-select', () => {
    render(msState({ viewMode: 'calendar', selectedLid: 't2', multiSelectedLids: [] }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t2 = cal.querySelector('[data-pkc-lid="t2"]');
    expect(t2!.getAttribute('data-pkc-selected')).toBe('true');
    expect(t2!.hasAttribute('data-pkc-multi-selected')).toBe(false);
  });

  it('Kanban: single selection still works without multi-select', () => {
    render(msState({ viewMode: 'kanban', selectedLid: 't1', multiSelectedLids: [] }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t1 = kanban.querySelector('[data-pkc-lid="t1"]');
    expect(t1!.getAttribute('data-pkc-selected')).toBe('true');
    expect(t1!.hasAttribute('data-pkc-multi-selected')).toBe(false);
  });

  // ── Readonly visual feedback ──

  it('Calendar: multi-selected visual shows in readonly mode', () => {
    render(msState({ viewMode: 'calendar', multiSelectedLids: ['t1'], readonly: true }), root);
    const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
    const t1 = cal.querySelector('[data-pkc-lid="t1"]');
    expect(t1!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });

  it('Kanban: multi-selected visual shows in readonly mode', () => {
    render(msState({ viewMode: 'kanban', multiSelectedLids: ['t3'], readonly: true }), root);
    const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
    const t3 = kanban.querySelector('[data-pkc-lid="t3"]');
    expect(t3!.getAttribute('data-pkc-multi-selected')).toBe('true');
  });
});

// ── Issue #69: Critical UX Regression Recovery ──

describe('Critical UX Regression Recovery (Issue #69)', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    registerPresenter('todo', todoPresenter);
    registerPresenter('form', formPresenter);
    registerPresenter('attachment', attachmentPresenter);
  });

  function baseState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  const todoContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      { lid: 't1', title: 'Open A', body: '{"status":"open","description":"A","date":"2026-04-10"}', archetype: 'todo', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z' },
      { lid: 't2', title: 'Done B', body: '{"status":"done","description":"B","date":"2026-04-15"}', archetype: 'todo', created_at: '2026-01-01T00:02:00Z', updated_at: '2026-01-01T00:02:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  describe('Export / Import / Build UI (P0-B)', () => {
    it('renders Export button in ready state', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="begin-export"][data-pkc-export-mode="full"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Export');
    });

    it('renders Light export button in ready state', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="begin-export"][data-pkc-export-mode="light"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Light');
    });

    it('renders ZIP export button in ready state', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="export-zip"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('ZIP');
    });

    it('renders Import button in ready state', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="begin-import"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toBe('Import');
    });

    it('hides export/import buttons in readonly mode', () => {
      render(baseState({ readonly: true }), root);
      const panel = root.querySelector('[data-pkc-region="export-import-panel"]');
      expect(panel).toBeNull();
    });

    it('shows Exporting badge during export phase', () => {
      const state: AppState = {
        ...baseState(),
        phase: 'exporting',
        exportMode: 'full',
        exportMutability: 'editable',
      };
      render(state, root);
      const badge = root.querySelector('.pkc-export-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('Exporting…');
    });

    it('ZIP button has correct title attribute', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="export-zip"]') as HTMLElement;
      expect(btn.getAttribute('title')).toContain('.pkc2.zip');
    });
  });

  describe('CLEAR button safety', () => {
    it('renders Reset button with danger class in shell menu maintenance', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="clear-local-data"]');
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('Reset');
      expect(btn!.className).toContain('pkc-btn-danger');
      // Should be inside shell menu maintenance section
      const maintenance = btn!.closest('[data-pkc-region="shell-menu-maintenance"]');
      expect(maintenance).not.toBeNull();
    });

    it('has descriptive title attribute', () => {
      render(baseState(), root);
      const btn = root.querySelector('[data-pkc-action="clear-local-data"]') as HTMLElement;
      expect(btn.getAttribute('title')).toContain('IndexedDB');
    });

    it('is not rendered in readonly mode', () => {
      render(baseState({ readonly: true }), root);
      const btn = root.querySelector('[data-pkc-action="clear-local-data"]');
      expect(btn).toBeNull();
    });
  });

  describe('Double-click Target Attributes (P0-A)', () => {
    it('sidebar entry items have select-entry action and lid', () => {
      render(baseState(), root);
      const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
      const items = sidebar.querySelectorAll('[data-pkc-action="select-entry"]');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });

    it('kanban cards have select-entry action and lid', () => {
      render(baseState({ viewMode: 'kanban', container: todoContainer }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('[data-pkc-action="select-entry"]');
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        expect(card.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });

    it('calendar items have select-entry action and lid', () => {
      render(baseState({ viewMode: 'calendar', container: todoContainer }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('[data-pkc-action="select-entry"]');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.getAttribute('data-pkc-lid')).toBeTruthy();
      }
    });
  });

  describe('Attachment Download (P0-C)', () => {
    const attachmentContainer: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'Test File',
          body: JSON.stringify({ name: 'test.pdf', mime: 'application/pdf', size: 1024, asset_key: 'ast-001' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-001': 'dGVzdA==' },
    };

    it('detached panel shows download button for attachment with data', () => {
      const entry = attachmentContainer.entries[0]!;
      const panel = renderDetachedPanel(entry, attachmentContainer);
      const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]');
      expect(dlBtn).not.toBeNull();
      expect(dlBtn!.textContent).toContain('Download');
    });

    it('detached panel hides download when data stripped', () => {
      const stripped: Container = { ...attachmentContainer, assets: {} };
      const entry = stripped.entries[0]!;
      const panel = renderDetachedPanel(entry, stripped);
      const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]');
      expect(dlBtn).toBeNull();
      const notice = panel.querySelector('.pkc-attachment-stripped');
      expect(notice).not.toBeNull();
    });

    it('download button carries data-pkc-lid attribute', () => {
      const entry = attachmentContainer.entries[0]!;
      const panel = renderDetachedPanel(entry, attachmentContainer);
      const dlBtn = panel.querySelector('[data-pkc-action="download-attachment"]') as HTMLElement;
      expect(dlBtn.getAttribute('data-pkc-lid')).toBe('att1');
    });
  });

  describe('Markdown Rendering in Text Presenter (P1-D)', () => {
    it('renders plain text body without markdown as pre element', () => {
      render(baseState({ selectedLid: 'e1', viewMode: 'detail' }), root);
      const body = root.querySelector('.pkc-view-body');
      expect(body).not.toBeNull();
      expect(body!.tagName).toBe('PRE');
    });

    it('renders markdown body as div with pkc-md-rendered class', () => {
      const mdContainer: Container = {
        ...mockContainer,
        entries: [
          {
            lid: 'md1',
            title: 'Markdown Entry',
            body: '# Hello\n\nThis is **bold** text.',
            archetype: 'text',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      };
      render(baseState({ container: mdContainer, selectedLid: 'md1', viewMode: 'detail' }), root);
      const body = root.querySelector('.pkc-md-rendered');
      expect(body).not.toBeNull();
      expect(body!.tagName).toBe('DIV');
      expect(body!.innerHTML).toContain('<h1');
      expect(body!.innerHTML).toContain('<strong>bold</strong>');
    });

    it('plain text fallback still works', () => {
      render(baseState({ selectedLid: 'e1', viewMode: 'detail' }), root);
      const body = root.querySelector('.pkc-view-body');
      expect(body!.textContent).toContain('Body of entry one');
    });

    it('empty body shows (empty) text', () => {
      const emptyBody: Container = {
        ...mockContainer,
        entries: [
          { lid: 'e0', title: 'Empty', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
      };
      render(baseState({ container: emptyBody, selectedLid: 'e0', viewMode: 'detail' }), root);
      const body = root.querySelector('.pkc-view-body');
      expect(body!.textContent).toContain('(empty)');
      expect(body!.tagName).toBe('PRE');
    });
  });

  describe('Attachment Preview Types', () => {
    function makeAttContainer(mime: string, assetKey: string): Container {
      return {
        ...mockContainer,
        entries: [
          {
            lid: 'att-preview',
            title: 'Preview File',
            body: JSON.stringify({ name: 'file.ext', mime, size: 1024, asset_key: assetKey }),
            archetype: 'attachment',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        assets: { [assetKey]: 'dGVzdA==' },
      };
    }

    it('image attachment gets preview with type=image', () => {
      const c = makeAttContainer('image/png', 'ast-img');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).not.toBeNull();
      expect(preview!.getAttribute('data-pkc-preview-type')).toBe('image');
    });

    it('PDF attachment gets preview with type=pdf', () => {
      const c = makeAttContainer('application/pdf', 'ast-pdf');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).not.toBeNull();
      expect(preview!.getAttribute('data-pkc-preview-type')).toBe('pdf');
    });

    it('video attachment gets preview with type=video', () => {
      const c = makeAttContainer('video/mp4', 'ast-vid');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).not.toBeNull();
      expect(preview!.getAttribute('data-pkc-preview-type')).toBe('video');
    });

    it('audio attachment gets preview with type=audio', () => {
      const c = makeAttContainer('audio/mpeg', 'ast-aud');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).not.toBeNull();
      expect(preview!.getAttribute('data-pkc-preview-type')).toBe('audio');
    });

    it('HTML attachment gets preview with type=html', () => {
      const c = makeAttContainer('text/html', 'ast-htm');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).not.toBeNull();
      expect(preview!.getAttribute('data-pkc-preview-type')).toBe('html');
    });

    it('unknown MIME gets no preview area', () => {
      const c = makeAttContainer('application/octet-stream', 'ast-bin');
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).toBeNull();
    });

    it('stripped attachment gets no preview regardless of type', () => {
      const c: Container = {
        ...mockContainer,
        entries: [
          {
            lid: 'att-strip',
            title: 'Stripped',
            body: JSON.stringify({ name: 'image.png', mime: 'image/png', size: 1024, asset_key: 'ast-strip' }),
            archetype: 'attachment',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
        assets: {},
      };
      const panel = renderDetachedPanel(c.entries[0]!, c);
      const preview = panel.querySelector('[data-pkc-region="detached-attachment-preview"]');
      expect(preview).toBeNull();
    });
  });

  describe('Non-regression', () => {
    it('DnD attributes still present on kanban cards', () => {
      render(baseState({ viewMode: 'kanban', container: todoContainer }), root);
      const kanban = root.querySelector('[data-pkc-region="kanban-view"]')!;
      const cards = kanban.querySelectorAll('[data-pkc-kanban-draggable="true"]');
      expect(cards.length).toBeGreaterThan(0);
    });

    it('DnD attributes still present on calendar items', () => {
      render(baseState({ viewMode: 'calendar', container: todoContainer }), root);
      const cal = root.querySelector('[data-pkc-region="calendar-view"]')!;
      const items = cal.querySelectorAll('[data-pkc-calendar-draggable="true"]');
      expect(items.length).toBeGreaterThan(0);
    });

    it('view switch buttons still present on non-detail views', () => {
      render(baseState({ viewMode: 'kanban', container: todoContainer }), root);
      const switchBtns = root.querySelectorAll('[data-pkc-view-switch]');
      expect(switchBtns.length).toBe(2);
    });
  });
});

// ── Sandbox Control UI ──

describe('Sandbox Control UI in Meta Pane', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    registerPresenter('attachment', attachmentPresenter);
  });

  function baseState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: null,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function htmlAttachmentContainer(sandboxAllow?: string[]): Container {
    const body: Record<string, unknown> = { name: 'app.html', mime: 'text/html', asset_key: 'ast-1', size: 200 };
    if (sandboxAllow) body.sandbox_allow = sandboxAllow;
    return {
      meta: { container_id: 'test-html', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
      entries: [{
        lid: 'html1', title: 'HTML File', body: JSON.stringify(body),
        archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [],
      revisions: [],
      assets: { 'ast-1': 'PCFET0NUWVBFIGh0bWw+' },
    };
  }

  function textAttachmentContainer(): Container {
    return {
      meta: { container_id: 'test-txt', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
      entries: [{
        lid: 'txt1', title: 'Text File', body: JSON.stringify({ name: 'readme.txt', mime: 'text/plain', asset_key: 'ast-2' }),
        archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [],
      revisions: [],
      assets: { 'ast-2': 'dGVzdA==' },
    };
  }

  it('renders sandbox control section for HTML attachment', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const section = root.querySelector('[data-pkc-region="sandbox-control"]');
    expect(section).not.toBeNull();
  });

  it('renders 10 sandbox checkboxes', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const checkboxes = root.querySelectorAll('[data-pkc-action="toggle-sandbox-attr"]');
    expect(checkboxes.length).toBe(10);
  });

  it('checkboxes reflect sandbox_allow state', () => {
    const c = htmlAttachmentContainer(['allow-scripts', 'allow-forms']);
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const scripts = root.querySelector<HTMLInputElement>('[data-pkc-sandbox-attr="allow-scripts"]');
    const forms = root.querySelector<HTMLInputElement>('[data-pkc-sandbox-attr="allow-forms"]');
    const popups = root.querySelector<HTMLInputElement>('[data-pkc-sandbox-attr="allow-popups"]');
    expect(scripts?.checked).toBe(true);
    expect(forms?.checked).toBe(true);
    expect(popups?.checked).toBe(false);
  });

  it('checkboxes are disabled in readonly mode', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1', readonly: true }), root);
    const checkboxes = root.querySelectorAll<HTMLInputElement>('[data-pkc-action="toggle-sandbox-attr"]');
    for (const cb of checkboxes) {
      expect(cb.disabled).toBe(true);
    }
  });

  it('does NOT render sandbox control for non-HTML attachment', () => {
    const c = textAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'txt1' }), root);
    const section = root.querySelector('[data-pkc-region="sandbox-control"]');
    expect(section).toBeNull();
  });

  it('sandbox heading says "Sandbox Policy"', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const heading = root.querySelector('.pkc-sandbox-heading');
    expect(heading?.textContent).toBe('Sandbox Policy');
  });

  it('each checkbox has correct data-pkc-lid and data-pkc-sandbox-attr', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const checkboxes = root.querySelectorAll<HTMLInputElement>('[data-pkc-action="toggle-sandbox-attr"]');
    for (const cb of checkboxes) {
      expect(cb.getAttribute('data-pkc-lid')).toBe('html1');
      expect(cb.getAttribute('data-pkc-sandbox-attr')).toBeTruthy();
    }
  });

  it('renders sandbox control section for SVG attachment', () => {
    const svgContainer: Container = {
      meta: { container_id: 'test-svg', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
      entries: [{
        lid: 'svg1', title: 'SVG File', body: JSON.stringify({ name: 'icon.svg', mime: 'image/svg+xml', asset_key: 'ast-svg', size: 100 }),
        archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [],
      revisions: [],
      assets: { 'ast-svg': 'PHN2Zz48L3N2Zz4=' },
    };
    render(baseState({ container: svgContainer, selectedLid: 'svg1' }), root);
    const section = root.querySelector('[data-pkc-region="sandbox-control"]');
    expect(section).not.toBeNull();
    const checkboxes = root.querySelectorAll('[data-pkc-action="toggle-sandbox-attr"]');
    expect(checkboxes.length).toBe(10);
  });

  it('renders description text for each sandbox attribute', () => {
    const c = htmlAttachmentContainer();
    render(baseState({ container: c, selectedLid: 'html1' }), root);
    const descs = root.querySelectorAll('.pkc-sandbox-desc');
    expect(descs.length).toBe(10);
    // Verify at least one description is populated
    const scriptDesc = Array.from(descs).find((d) => d.textContent?.includes('JavaScript'));
    expect(scriptDesc).not.toBeNull();
  });
});

// ── Light mode badge + edit restriction UI ──

describe('Light mode badge', () => {
  function lightState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: true, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('shows Light badge when lightSource is true', () => {
    render(lightState(), root);
    const badge = root.querySelector('[data-pkc-region="light-badge"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe('Light');
  });

  it('does not show Light badge when lightSource is false', () => {
    render(lightState({ lightSource: false }), root);
    const badge = root.querySelector('[data-pkc-region="light-badge"]');
    expect(badge).toBeNull();
  });

  it('does not show Light badge in readonly mode (readonly badge takes priority)', () => {
    render(lightState({ readonly: true }), root);
    // Both badges can coexist; readonly badge should also be present
    const roBadge = root.querySelector('[data-pkc-region="readonly-badge"]');
    const lightBadge = root.querySelector('[data-pkc-region="light-badge"]');
    expect(roBadge).not.toBeNull();
    // Light badge is still shown even in readonly
    expect(lightBadge).not.toBeNull();
  });
});

describe('Light mode attachment create restriction', () => {
  function lightState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: true, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('disables attachment create button in Light mode', () => {
    render(lightState(), root);
    const attachBtn = root.querySelector<HTMLButtonElement>('[data-pkc-action="create-entry"][data-pkc-archetype="attachment"]');
    expect(attachBtn).not.toBeNull();
    expect(attachBtn!.disabled).toBe(true);
    expect(attachBtn!.getAttribute('data-pkc-light-disabled')).toBe('true');
  });

  it('does not disable other create buttons in Light mode', () => {
    render(lightState(), root);
    const textBtn = root.querySelector<HTMLButtonElement>('[data-pkc-action="create-entry"][data-pkc-archetype="text"]');
    const todoBtn = root.querySelector<HTMLButtonElement>('[data-pkc-action="create-entry"][data-pkc-archetype="todo"]');
    expect(textBtn!.disabled).toBe(false);
    expect(todoBtn!.disabled).toBe(false);
  });

  it('does not disable attachment create when lightSource is false', () => {
    render(lightState({ lightSource: false }), root);
    const attachBtn = root.querySelector<HTMLButtonElement>('[data-pkc-action="create-entry"][data-pkc-archetype="attachment"]');
    expect(attachBtn).not.toBeNull();
    expect(attachBtn!.disabled).toBe(false);
  });
});

describe('Light mode detail pane notice', () => {
  function lightState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: attachmentContainer,
      selectedLid: 'att1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: true, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  const attachmentContainer: Container = {
    meta: mockContainer.meta,
    entries: [
      {
        lid: 'att1', title: 'My File',
        body: JSON.stringify({ name: 'report.pdf', mime: 'application/pdf', size: 1024, asset_key: 'a1' }),
        archetype: 'attachment', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      },
      {
        lid: 'txt1', title: 'A Note',
        body: 'hello',
        archetype: 'text', created_at: '2026-01-01T00:01:00Z', updated_at: '2026-01-01T00:01:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  it('shows Light notice for attachment entry in Light mode', () => {
    render(lightState(), root);
    const notice = root.querySelector('[data-pkc-region="light-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Light export');
  });

  it('does not show Light notice for text entry in Light mode', () => {
    render(lightState({ selectedLid: 'txt1' }), root);
    const notice = root.querySelector('[data-pkc-region="light-notice"]');
    expect(notice).toBeNull();
  });

  it('does not show Light notice when lightSource is false', () => {
    render(lightState({ lightSource: false }), root);
    const notice = root.querySelector('[data-pkc-region="light-notice"]');
    expect(notice).toBeNull();
  });

  it('shows Light edit warning when editing attachment in Light mode', () => {
    render(lightState({ phase: 'editing', editingLid: 'att1' }), root);
    const notice = root.querySelector('[data-pkc-region="light-edit-notice"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain('Light mode');
  });
});

// ── Pane resize: data-pkc-* selector compliance ──

describe('Pane resize DOM selectors', () => {
  it('sidebar has data-pkc-region="sidebar" for resize targeting', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]');
    expect(sidebar).not.toBeNull();
    expect(sidebar!.tagName.toLowerCase()).toBe('aside');
  });

  it('meta pane has data-pkc-region="meta" for resize targeting', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const meta = root.querySelector('[data-pkc-region="meta"]');
    expect(meta).not.toBeNull();
    expect(meta!.tagName.toLowerCase()).toBe('aside');
  });

  it('resize handles have data-pkc-resize attributes', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const leftHandle = root.querySelector('[data-pkc-resize="left"]');
    const rightHandle = root.querySelector('[data-pkc-resize="right"]');
    expect(leftHandle).not.toBeNull();
    expect(rightHandle).not.toBeNull();
  });

  it('tray bars have data-pkc-region attributes', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-region="tray-left"]')).not.toBeNull();
    expect(root.querySelector('[data-pkc-region="tray-right"]')).not.toBeNull();
  });
});

describe('Shell Menu & Help Foundation (P2)', () => {
  const mockContainer: Container = {
    meta: { container_id: 'test-id', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
    entries: [
      { lid: 'e1', title: 'Entry', body: '', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  it('renders shell menu button in header', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const menuBtn = root.querySelector('[data-pkc-action="toggle-shell-menu"]');
    expect(menuBtn).not.toBeNull();
    expect(menuBtn!.textContent).toBe('⚙');
  });

  it('renders shell menu panel (hidden by default)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const menu = root.querySelector('[data-pkc-region="shell-menu"]');
    expect(menu).not.toBeNull();
    expect((menu as HTMLElement).style.display).toBe('none');
    // Overlay/card dialog structure
    expect(menu!.classList.contains('pkc-shell-menu-overlay')).toBe(true);
    expect(menu!.querySelector('.pkc-shell-menu-card')).not.toBeNull();
    // Three explicit theme buttons (light / dark / system)
    const themeBtns = menu!.querySelectorAll('[data-pkc-action="set-theme"]');
    expect(themeBtns.length).toBe(3);
    const modes = Array.from(themeBtns).map((b) => b.getAttribute('data-pkc-theme-mode'));
    expect(modes).toEqual(['light', 'dark', 'system']);
    // Shortcut button and close button
    expect(menu!.querySelector('[data-pkc-action="show-shortcut-help"]')).not.toBeNull();
    expect(menu!.querySelector('[data-pkc-action="close-shell-menu"]')).not.toBeNull();
    // Has version info
    expect(menu!.textContent).toContain('PKC2');
  });

  it('renders shortcut help overlay (hidden by default)', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);
    const overlay = root.querySelector('[data-pkc-region="shortcut-help"]');
    expect(overlay).not.toBeNull();
    expect((overlay as HTMLElement).style.display).toBe('none');
    // Contains shortcut descriptions
    expect(overlay!.textContent).toContain('Ctrl+N');
    expect(overlay!.textContent).toContain('Ctrl+S');
    expect(overlay!.textContent).toContain('Escape');
    expect(overlay!.textContent).toContain('multi-select');
    expect(overlay!.textContent).toContain('Range select');
    // Help-overlay toggle is now Ctrl+? / ⌘+? (bare `?` was removed so
    // it stops hijacking ordinary text input). See
    // `action-binder-keyboard.test.ts › Shortcut help overlay` for the
    // keydown behavior; here we just pin the visible label.
    expect(overlay!.textContent).toContain('Ctrl+? / ⌘+?');
    expect(overlay!.textContent).toContain('Close (Esc / Ctrl+?)');
    // Contains date/time shortcut group and entries
    expect(overlay!.textContent).toContain('Date/Time (edit mode)');
    expect(overlay!.textContent).toContain('Ctrl+;');
    expect(overlay!.textContent).toContain('Ctrl+:');
    expect(overlay!.textContent).toContain('Ctrl+D');
    expect(overlay!.textContent).toContain('ISO 8601');
    // Has group separator elements (Panes + Date/Time + Slash Commands)
    const groups = overlay!.querySelectorAll('.pkc-shortcut-group');
    expect(groups.length).toBe(3);
    // Contains slash command section
    expect(overlay!.textContent).toContain('Slash Commands');
    expect(overlay!.textContent).toContain('input assist menu');
    // Has close button
    expect(overlay!.querySelector('[data-pkc-action="close-shortcut-help"]')).not.toBeNull();
  });
});

describe('Shell Menu Data Maintenance (orphan asset cleanup UI)', () => {
  // These tests pin the shell-menu rendering of the orphan asset
  // maintenance section. The underlying scan is already tested in
  // `tests/features/asset/asset-scan.test.ts` — here we only check
  // that the renderer surfaces the count, list, and button
  // correctly and that the disabled / hidden rules hold.

  const baseState = (container: Container | null, overrides: Partial<AppState> = {}): AppState => ({
    phase: 'ready',
    container,
    selectedLid: null,
    editingLid: null,
    error: null,
    embedded: false,
    pendingOffers: [],
    importPreview: null,
    batchImportPreview: null,
    searchQuery: '',
    archetypeFilter: new Set(),
    tagFilter: null,
    sortKey: 'created_at',
    sortDirection: 'desc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    showArchived: false,
    viewMode: 'detail' as const,
    calendarYear: 2026,
    calendarMonth: 4,
    multiSelectedLids: [],
    batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    ...overrides,
  });

  function makeContainer(partial: Partial<Container> = {}): Container {
    return {
      meta: {
        container_id: 'c-1', title: 'Test',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
      ...partial,
    };
  }

  function attachmentEntry(lid: string, key: string): Entry {
    return {
      lid,
      title: `${key}.png`,
      body: JSON.stringify({ name: `${key}.png`, mime: 'image/png', size: 4, asset_key: key }),
      archetype: 'attachment',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  }

  it('shows maintenance section with 0/0 summary when container.assets is empty', () => {
    const state = baseState(makeContainer({ assets: {} }));
    render(state, root);
    const section = root.querySelector('[data-pkc-region="shell-menu-maintenance"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('Data Maintenance');
    const summary = section!.querySelector('[data-pkc-region="orphan-asset-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('data-pkc-orphan-count')).toBe('0');
    expect(summary!.getAttribute('data-pkc-asset-total')).toBe('0');
    expect(summary!.textContent).toContain('0 / 0');
  });

  it('shows the accurate orphan/total counts when some assets are orphan', () => {
    const container = makeContainer({
      entries: [attachmentEntry('a1', 'ast-keep')],
      assets: { 'ast-keep': 'KK', 'ast-drop': 'DD', 'ast-also': 'XX' },
    });
    const state = baseState(container);
    render(state, root);
    const summary = root.querySelector('[data-pkc-region="orphan-asset-summary"]');
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('data-pkc-orphan-count')).toBe('2');
    expect(summary!.getAttribute('data-pkc-asset-total')).toBe('3');
    expect(summary!.textContent).toContain('2 / 3');
  });

  it('renders a preview list of representative orphan keys when > 0 orphans', () => {
    const container = makeContainer({
      entries: [],
      assets: { 'ast-a': 'A', 'ast-b': 'B', 'ast-c': 'C' },
    });
    const state = baseState(container);
    render(state, root);
    const preview = root.querySelector('[data-pkc-region="orphan-asset-preview"]');
    expect(preview).not.toBeNull();
    const items = preview!.querySelectorAll('.pkc-shell-menu-maintenance-item');
    expect(items.length).toBe(3);
    const texts = Array.from(items).map((el) => el.textContent);
    expect(texts).toContain('ast-a');
    expect(texts).toContain('ast-b');
    expect(texts).toContain('ast-c');
  });

  it('caps the preview at 3 and shows a "+N more" hint for the remainder', () => {
    const assets: Record<string, string> = {};
    for (let i = 0; i < 7; i++) assets[`ast-${i}`] = 'X';
    const state = baseState(makeContainer({ entries: [], assets }));
    render(state, root);
    const preview = root.querySelector('[data-pkc-region="orphan-asset-preview"]');
    expect(preview).not.toBeNull();
    expect(preview!.querySelectorAll('.pkc-shell-menu-maintenance-item').length).toBe(3);
    const more = preview!.querySelector('.pkc-shell-menu-maintenance-more');
    expect(more).not.toBeNull();
    expect(more!.textContent).toContain('+4 more');
  });

  it('renders cleanup button disabled with "No orphans" text when count is 0', () => {
    const container = makeContainer({
      entries: [attachmentEntry('a1', 'ast-keep')],
      assets: { 'ast-keep': 'KK' },
    });
    const state = baseState(container);
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="purge-orphan-assets"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-disabled')).toBe('true');
    expect(btn!.hasAttribute('disabled')).toBe(true);
    expect(btn!.textContent).toContain('No orphans');
    // No preview list when count is 0.
    expect(root.querySelector('[data-pkc-region="orphan-asset-preview"]')).toBeNull();
  });

  it('renders cleanup button enabled with the orphan count when > 0', () => {
    const container = makeContainer({
      entries: [],
      assets: { 'ast-a': 'A', 'ast-b': 'B' },
    });
    const state = baseState(container);
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="purge-orphan-assets"]');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-disabled')).toBeNull();
    expect(btn!.hasAttribute('disabled')).toBe(false);
    expect(btn!.textContent).toContain('2');
    expect(btn!.textContent).toContain('orphan assets');
  });

  it('renders singular label "1 orphan asset" (not plural) when count is 1', () => {
    const container = makeContainer({ entries: [], assets: { 'ast-solo': 'S' } });
    const state = baseState(container);
    render(state, root);
    const btn = root.querySelector('[data-pkc-action="purge-orphan-assets"]');
    expect(btn!.textContent).toContain('1 orphan asset');
    // Must not accidentally pluralise.
    expect(btn!.textContent).not.toContain('1 orphan assets');
  });

  it('includes an irreversibility note on the maintenance section', () => {
    const container = makeContainer({ entries: [], assets: { 'ast-x': 'X' } });
    const state = baseState(container);
    render(state, root);
    const section = root.querySelector('[data-pkc-region="shell-menu-maintenance"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('Cannot be undone');
  });

  it('hides the maintenance section entirely in readonly mode', () => {
    const container = makeContainer({ entries: [], assets: { 'ast-x': 'X' } });
    const state = baseState(container, { readonly: true });
    render(state, root);
    expect(root.querySelector('[data-pkc-region="shell-menu-maintenance"]')).toBeNull();
    expect(root.querySelector('[data-pkc-action="purge-orphan-assets"]')).toBeNull();
  });

  it('counts textlog per-log markdown references when computing orphans', () => {
    // Regression pin: the renderer must use the same reference scan
    // as the reducer. If this drifts, users will see "orphan" assets
    // that would then be blocked by the reducer — confusing UX.
    const textlogBody = JSON.stringify({
      entries: [
        { id: 'log-1', text: 'see ![pic](asset:ast-log1)', createdAt: '2026-01-01T00:00:00Z', flags: [] },
      ],
    });
    const container = makeContainer({
      entries: [
        {
          lid: 'tl1', title: 'Log', body: textlogBody, archetype: 'textlog',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'ast-log1': 'KK', 'ast-orphan': 'OO' },
    });
    const state = baseState(container);
    render(state, root);
    const summary = root.querySelector('[data-pkc-region="orphan-asset-summary"]');
    expect(summary!.getAttribute('data-pkc-orphan-count')).toBe('1');
    expect(summary!.getAttribute('data-pkc-asset-total')).toBe('2');
  });
});

// ── Task completion badge ──

describe('Task completion badge', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.appendChild(root);
    registerPresenter('todo', todoPresenter);
    registerPresenter('form', formPresenter);
    registerPresenter('attachment', attachmentPresenter);
  });

  function baseState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function containerWith(entries: Entry[]): Container {
    return { meta: mockContainer.meta, entries, relations: [], revisions: [], assets: {} };
  }

  describe('sidebar badge', () => {
    it('shows task badge for TEXT entry with tasks', () => {
      const container = containerWith([
        { lid: 'tx1', title: 'Tasks', body: '- [ ] A\n- [x] B\n- [ ] C', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const badge = root.querySelector('[data-pkc-lid="tx1"] .pkc-task-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('1/3');
    });

    it('does not show task badge when no tasks exist', () => {
      const container = containerWith([
        { lid: 'tx2', title: 'No tasks', body: '# Hello', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const badge = root.querySelector('[data-pkc-lid="tx2"] .pkc-task-badge');
      expect(badge).toBeNull();
    });

    it('sets data-pkc-task-complete on li when all tasks are done', () => {
      const container = containerWith([
        { lid: 'tx3', title: 'All Done', body: '- [x] A\n- [x] B', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const li = root.querySelector('.pkc-entry-item[data-pkc-lid="tx3"]');
      expect(li!.getAttribute('data-pkc-task-complete')).toBe('true');
      const badge = li!.querySelector('.pkc-task-badge');
      expect(badge!.textContent).toBe('2/2');
    });

    it('does not set data-pkc-task-complete when tasks are partial', () => {
      const container = containerWith([
        { lid: 'tx4', title: 'Partial', body: '- [x] A\n- [ ] B', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const li = root.querySelector('[data-pkc-lid="tx4"]');
      expect(li!.getAttribute('data-pkc-task-complete')).toBeNull();
    });

    it('shows task badge for TEXTLOG entry with tasks across log entries', () => {
      const body = JSON.stringify({
        entries: [
          { id: 'lg1', text: '- [ ] X\n- [x] Y', createdAt: '2026-01-01T00:00:00Z', flags: [] },
          { id: 'lg2', text: '- [x] Z', createdAt: '2026-01-02T00:00:00Z', flags: [] },
        ],
      });
      const container = containerWith([
        { lid: 'tl1', title: 'Log', body, archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const badge = root.querySelector('[data-pkc-lid="tl1"] .pkc-task-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('2/3');
    });

    it('does not show task badge for todo archetype', () => {
      const container = containerWith([
        { lid: 'td1', title: 'Todo', body: '{"status":"open","description":"task"}', archetype: 'todo', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container }), root);
      const badge = root.querySelector('[data-pkc-lid="td1"] .pkc-task-badge');
      expect(badge).toBeNull();
    });

    it('coexists with revision badge', () => {
      const container: Container = {
        meta: mockContainer.meta,
        entries: [
          { lid: 'tx5', title: 'With History', body: '- [x] Done', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        ],
        relations: [],
        revisions: [
          { id: 'rev1', entry_lid: 'tx5', snapshot: '{}', created_at: '2026-01-01T01:00:00Z' },
        ],
        assets: {},
      };
      render(baseState({ container }), root);
      const li = root.querySelector('.pkc-entry-item[data-pkc-lid="tx5"]');
      expect(li!.querySelector('.pkc-task-badge')).not.toBeNull();
      expect(li!.querySelector('.pkc-revision-badge')).not.toBeNull();
    });
  });

  describe('detail pane badge', () => {
    it('shows task badge in detail pane title row for TEXT entry', () => {
      const container = containerWith([
        { lid: 'tx6', title: 'Detail', body: '- [ ] A\n- [x] B', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container, selectedLid: 'tx6' }), root);
      const titleRow = root.querySelector('.pkc-view-title-row');
      const badge = titleRow?.querySelector('.pkc-task-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('1/2');
    });

    it('does not show task badge in detail pane for entry without tasks', () => {
      const container = containerWith([
        { lid: 'tx7', title: 'No tasks', body: 'Plain text', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container, selectedLid: 'tx7' }), root);
      const titleRow = root.querySelector('.pkc-view-title-row');
      const badge = titleRow?.querySelector('.pkc-task-badge');
      expect(badge).toBeNull();
    });

    it('shows task badge in detail pane for TEXTLOG entry', () => {
      const body = JSON.stringify({
        entries: [
          { id: 'lg1', text: '- [x] Done\n- [ ] Pending', createdAt: '2026-01-01T00:00:00Z', flags: [] },
        ],
      });
      const container = containerWith([
        { lid: 'tl2', title: 'Log Detail', body, archetype: 'textlog', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container, selectedLid: 'tl2' }), root);
      const titleRow = root.querySelector('.pkc-view-title-row');
      const badge = titleRow?.querySelector('.pkc-task-badge');
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toBe('1/2');
    });

    it('sets data-pkc-task-complete on badge when all tasks are done', () => {
      const container = containerWith([
        { lid: 'tx8', title: 'All Done', body: '- [x] A\n- [x] B', archetype: 'text', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ]);
      render(baseState({ container, selectedLid: 'tx8' }), root);
      const badge = root.querySelector('.pkc-view-title-row .pkc-task-badge');
      expect(badge!.getAttribute('data-pkc-task-complete')).toBe('true');
    });
  });
});

describe('Table of Contents (A-3, right pane)', () => {
  beforeEach(() => {
    registerPresenter('todo', todoPresenter);
    registerPresenter('form', formPresenter);
    registerPresenter('attachment', attachmentPresenter);
  });

  function baseState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false,
      pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(),
      tagFilter: null, sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  function containerWith(entries: Entry[]): Container {
    return { meta: mockContainer.meta, entries, relations: [], revisions: [], assets: {} };
  }

  it('TEXT: meta pane shows TOC with one item per h1–h3', () => {
    const container = containerWith([
      {
        lid: 'tx-toc',
        title: 'With TOC',
        body: '# Introduction\n\n## Details\n\n### Notes',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tx-toc' }), root);
    const toc = root.querySelector('[data-pkc-region="toc"]');
    expect(toc).not.toBeNull();
    const items = toc!.querySelectorAll('[data-pkc-action="toc-jump"]');
    expect(items.length).toBe(3);
    expect(items[0]!.getAttribute('data-pkc-toc-slug')).toBe('introduction');
    expect(items[1]!.getAttribute('data-pkc-toc-slug')).toBe('details');
    expect(items[2]!.getAttribute('data-pkc-toc-slug')).toBe('notes');
  });

  it('TEXT: TOC item carries data-pkc-toc-level for indent styling', () => {
    const container = containerWith([
      {
        lid: 'tx-lv',
        title: 'Levels',
        body: '# A\n\n## B\n\n### C',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tx-lv' }), root);
    const items = root.querySelectorAll('[data-pkc-region="toc"] .pkc-toc-item');
    expect(items[0]!.getAttribute('data-pkc-toc-level')).toBe('1');
    expect(items[1]!.getAttribute('data-pkc-toc-level')).toBe('2');
    expect(items[2]!.getAttribute('data-pkc-toc-level')).toBe('3');
  });

  it('TEXT without headings produces no TOC section', () => {
    const container = containerWith([
      {
        lid: 'tx-none',
        title: 'No Headings',
        body: 'just a paragraph, no headings here',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tx-none' }), root);
    expect(root.querySelector('[data-pkc-region="toc"]')).toBeNull();
  });

  it('TEXTLOG: TOC emits day → log → heading nodes in desc order', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-a', text: '# Morning notes', createdAt: '2026-04-09T10:00:00Z', flags: [] },
        { id: 'log-b', text: '## Afternoon section', createdAt: '2026-04-09T14:00:00Z', flags: [] },
      ],
    });
    const container = containerWith([
      {
        lid: 'tl-1',
        title: 'Log',
        body,
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T14:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tl-1' }), root);
    const items = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="toc"] [data-pkc-action="toc-jump"]',
    );
    // day + (log + heading) × 2 = 5 rows.
    expect(items.length).toBe(5);
    // First row is the day node with a targetId pointing at the
    // day section in the viewer.
    const li0 = items[0]!.parentElement!;
    expect(li0.getAttribute('data-pkc-toc-kind')).toBe('day');
    expect(items[0]!.getAttribute('data-pkc-toc-target-id')).toMatch(/^day-\d{4}-\d{2}-\d{2}$/);
    // Desc: newer log (log-b) first, then its heading.
    const li1 = items[1]!.parentElement!;
    expect(li1.getAttribute('data-pkc-toc-kind')).toBe('log');
    expect(items[1]!.getAttribute('data-pkc-log-id')).toBe('log-b');
    expect(items[1]!.getAttribute('data-pkc-toc-target-id')).toBe('log-log-b');
    const li2 = items[2]!.parentElement!;
    expect(li2.getAttribute('data-pkc-toc-kind')).toBe('heading');
    expect(items[2]!.getAttribute('data-pkc-log-id')).toBe('log-b');
    expect(items[2]!.getAttribute('data-pkc-toc-slug')).toBe('afternoon-section');
    // Then log-a + its heading.
    expect(items[3]!.getAttribute('data-pkc-log-id')).toBe('log-a');
    expect(items[3]!.getAttribute('data-pkc-toc-target-id')).toBe('log-log-a');
    expect(items[4]!.getAttribute('data-pkc-toc-slug')).toBe('morning-notes');
  });

  it('TEXTLOG: empty body produces no TOC section', () => {
    const container = containerWith([
      {
        lid: 'tl-empty',
        title: 'Empty Log',
        body: JSON.stringify({ entries: [] }),
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tl-empty' }), root);
    expect(root.querySelector('[data-pkc-region="toc"]')).toBeNull();
  });

  it('TEXTLOG: logs with no markdown headings still produce day + log rows', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-plain', text: 'no headings here', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const container = containerWith([
      {
        lid: 'tl-plain',
        title: 'Plain Log',
        body,
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T10:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tl-plain' }), root);
    const items = root.querySelectorAll<HTMLElement>(
      '[data-pkc-region="toc"] .pkc-toc-item',
    );
    expect(items.length).toBe(2);
    expect(items[0]!.getAttribute('data-pkc-toc-kind')).toBe('day');
    expect(items[1]!.getAttribute('data-pkc-toc-kind')).toBe('log');
  });

  it('TEXTLOG: undated logs produce a day-undated target id', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-bad', text: 'broken', createdAt: 'not-a-date', flags: [] },
      ],
    });
    const container = containerWith([
      {
        lid: 'tl-undated',
        title: 'Undated',
        body,
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tl-undated' }), root);
    const dayBtn = root.querySelector<HTMLElement>(
      '[data-pkc-region="toc"] [data-pkc-toc-target-id="day-undated"]',
    );
    expect(dayBtn).not.toBeNull();
    expect(dayBtn!.textContent).toBe('Undated');
  });

  it('TEXTLOG: TOC sets data-pkc-toc-archetype so CSS can scope per-kind chrome', () => {
    const body = JSON.stringify({
      entries: [
        { id: 'log-a', text: 'hello', createdAt: '2026-04-09T10:00:00Z', flags: [] },
      ],
    });
    const container = containerWith([
      {
        lid: 'tl-arche',
        title: 'Log',
        body,
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T10:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tl-arche' }), root);
    const toc = root.querySelector<HTMLElement>('[data-pkc-region="toc"]');
    expect(toc!.getAttribute('data-pkc-toc-archetype')).toBe('textlog');
  });

  it('non-TEXT/TEXTLOG archetypes never get a TOC section', () => {
    const container = containerWith([
      {
        lid: 'td-1',
        title: 'Todo',
        body: JSON.stringify({ status: 'open', description: '# fake heading' }),
        archetype: 'todo',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'td-1' }), root);
    expect(root.querySelector('[data-pkc-region="toc"]')).toBeNull();
  });

  it('rendered TEXT body exposes heading ids that match the TOC slugs', () => {
    // Ensures TOC click targets actually exist in the rendered DOM.
    const container = containerWith([
      {
        lid: 'tx-ids',
        title: 'Ids',
        body: '# Introduction\n\n## Details',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ]);
    render(baseState({ container, selectedLid: 'tx-ids' }), root);
    const body = root.querySelector('.pkc-view-body');
    expect(body).not.toBeNull();
    expect(body!.querySelector('#introduction')).not.toBeNull();
    expect(body!.querySelector('#details')).not.toBeNull();
  });
});

describe('Storage Profile dialog (renderer)', () => {
  const baseProfileState = (
    container: Container | null,
    overrides: Partial<AppState> = {},
  ): AppState => ({
    phase: 'ready',
    container,
    selectedLid: null,
    editingLid: null,
    error: null,
    embedded: false,
    pendingOffers: [],
    importPreview: null,
    batchImportPreview: null,
    searchQuery: '',
    archetypeFilter: new Set(),
    tagFilter: null,
    sortKey: 'created_at',
    sortDirection: 'desc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    showArchived: false,
    viewMode: 'detail' as const,
    calendarYear: 2026,
    calendarMonth: 4,
    multiSelectedLids: [],
    batchImportResult: null,
    collapsedFolders: [], recentEntryRefLids: [],
    ...overrides,
  });

  const T0 = '2026-01-01T00:00:00Z';

  function makeProfileContainer(partial: Partial<Container> = {}): Container {
    return {
      meta: {
        container_id: 'c-profile',
        title: 'Profile',
        created_at: T0,
        updated_at: T0,
        schema_version: 1,
      },
      entries: [],
      relations: [],
      revisions: [],
      assets: {},
      ...partial,
    };
  }

  function attachmentEntryWithKey(lid: string, key: string, title: string): Entry {
    return {
      lid,
      title,
      body: JSON.stringify({
        name: `${key}.bin`,
        mime: 'application/octet-stream',
        asset_key: key,
      }),
      archetype: 'attachment',
      created_at: T0,
      updated_at: T0,
    };
  }

  function base64Of(bytes: number): string {
    const quads = Math.ceil(bytes / 3);
    return 'A'.repeat(quads * 4 - 2) + '==';
  }

  // The overlay is not mounted per-render (mounted on demand by
  // action-binder at click time) to keep the hot render path cheap.
  // The tests below therefore exercise `buildStorageProfileOverlay`
  // directly for content assertions, and `render()` only for the
  // launch button contract in the shell menu.

  it('does not mount the overlay into the shell on every render', () => {
    render(baseProfileState(makeProfileContainer()), root);
    // Overlay is absent until the user clicks the launcher — this
    // pins the per-render cost guarantee.
    expect(
      root.querySelector('[data-pkc-region="storage-profile"]'),
    ).toBeNull();
  });

  it('exposes a "Storage Profile" launch button in the shell menu Data Maintenance section', () => {
    render(baseProfileState(makeProfileContainer()), root);
    const section = root.querySelector('[data-pkc-region="shell-menu-maintenance"]');
    expect(section).not.toBeNull();
    const btn = section!.querySelector('[data-pkc-action="show-storage-profile"]');
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toContain('Storage Profile');
  });

  it('launch button is hidden in readonly mode (section itself is gated)', () => {
    render(baseProfileState(makeProfileContainer(), { readonly: true }), root);
    expect(
      root.querySelector('[data-pkc-region="shell-menu-maintenance"]'),
    ).toBeNull();
    expect(
      root.querySelector('[data-pkc-action="show-storage-profile"]'),
    ).toBeNull();
  });

  it('buildStorageProfileOverlay emits the hedged estimate note and a close button', () => {
    const overlay = buildStorageProfileOverlay(makeProfileContainer());
    expect(overlay.getAttribute('data-pkc-region')).toBe('storage-profile');
    expect(overlay.classList.contains('pkc-storage-profile-overlay')).toBe(true);
    expect(overlay.querySelector('.pkc-storage-profile-card')).not.toBeNull();
    expect(overlay.textContent!.toLowerCase()).toContain('estimate');
    expect(
      overlay.querySelector('[data-pkc-action="close-storage-profile"]'),
    ).not.toBeNull();
  });

  it('summary surfaces total asset count and total size', () => {
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [attachmentEntryWithKey('e1', 'k1', 'Alpha')],
        assets: { k1: base64Of(1500) },
      }),
    );
    const summary = overlay.querySelector(
      '[data-pkc-region="storage-profile-summary"]',
    );
    expect(summary).not.toBeNull();
    expect(summary!.getAttribute('data-pkc-asset-count')).toBe('1');
    expect(Number(summary!.getAttribute('data-pkc-total-bytes'))).toBeGreaterThan(
      1000,
    );
    expect(summary!.textContent).toContain('Alpha');
  });

  it('renders one row per byte-carrying entry in the top list', () => {
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [
          attachmentEntryWithKey('e1', 'k1', 'Small'),
          attachmentEntryWithKey('e2', 'k2', 'Big'),
        ],
        assets: {
          k1: base64Of(300),
          k2: base64Of(8000),
        },
      }),
    );
    const rows = overlay.querySelectorAll('[data-pkc-region="storage-profile-row"]');
    expect(rows.length).toBe(2);
    // Biggest first — sort order is preserved in the rendered DOM.
    expect(rows[0]!.textContent).toContain('Big');
    expect(rows[1]!.textContent).toContain('Small');
  });

  it('row carries the entry lid, archetype, and raw byte count as attributes', () => {
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [attachmentEntryWithKey('e-unique', 'k-unique', 'Lone')],
        assets: { 'k-unique': base64Of(500) },
      }),
    );
    const row = overlay.querySelector<HTMLElement>(
      '[data-pkc-region="storage-profile-row"]',
    );
    expect(row).not.toBeNull();
    expect(row!.getAttribute('data-pkc-lid')).toBe('e-unique');
    expect(row!.getAttribute('data-pkc-archetype')).toBe('attachment');
    expect(Number(row!.getAttribute('data-pkc-subtree-bytes'))).toBeGreaterThan(0);
  });

  it('empty container renders zero-total summary and an empty-list note', () => {
    const overlay = buildStorageProfileOverlay(makeProfileContainer());
    const summary = overlay.querySelector(
      '[data-pkc-region="storage-profile-summary"]',
    );
    expect(summary!.getAttribute('data-pkc-asset-count')).toBe('0');
    expect(summary!.getAttribute('data-pkc-total-bytes')).toBe('0');
    const topSection = overlay.querySelector(
      '[data-pkc-region="storage-profile-top"]',
    );
    expect(topSection!.textContent!.toLowerCase()).toContain('no entries');
  });

  it('renders a neutral "no container" note when container is null', () => {
    const overlay = buildStorageProfileOverlay(null);
    expect(overlay.textContent).toContain('No container');
    // No summary or rows regions are rendered in this branch.
    expect(
      overlay.querySelector('[data-pkc-region="storage-profile-summary"]'),
    ).toBeNull();
    expect(
      overlay.querySelector('[data-pkc-region="storage-profile-top"]'),
    ).toBeNull();
  });

  it('flags orphan bytes in the summary when assets are present but unreferenced', () => {
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [],
        assets: { 'ast-floating': base64Of(200) },
      }),
    );
    const summary = overlay.querySelector(
      '[data-pkc-region="storage-profile-summary"]',
    );
    expect(summary!.textContent!.toLowerCase()).toContain('orphan');
  });

  it('mounts the Export CSV button in the actions row when rows are present', () => {
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [attachmentEntryWithKey('e1', 'k1', 'Alpha')],
        assets: { k1: base64Of(1500) },
      }),
    );
    const exportBtn = overlay.querySelector(
      '[data-pkc-action="export-storage-profile-csv"]',
    );
    expect(exportBtn).not.toBeNull();
    // Button sits alongside the close button in a shared actions row so
    // layout and focus order stay predictable.
    const actions = overlay.querySelector('.pkc-storage-profile-actions');
    expect(actions).not.toBeNull();
    expect(
      actions!.querySelector('[data-pkc-action="export-storage-profile-csv"]'),
    ).not.toBeNull();
    expect(
      actions!.querySelector('[data-pkc-action="close-storage-profile"]'),
    ).not.toBeNull();
  });

  it('omits the Export CSV button when the profile has zero byte-contributing rows', () => {
    // Orphan-only container: assets exist but no entry owns them, so
    // `profile.rows.length === 0`. Nothing to export → no button.
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [],
        assets: { 'ast-floating': base64Of(200) },
      }),
    );
    expect(
      overlay.querySelector('[data-pkc-action="export-storage-profile-csv"]'),
    ).toBeNull();
    // Close button must still be mounted so the user can dismiss.
    expect(
      overlay.querySelector('[data-pkc-action="close-storage-profile"]'),
    ).not.toBeNull();
  });

  it('omits the Export CSV button in the no-container shell (launch button is already gated)', () => {
    const overlay = buildStorageProfileOverlay(null);
    expect(
      overlay.querySelector('[data-pkc-action="export-storage-profile-csv"]'),
    ).toBeNull();
  });

  it('each row mounts a focusable select trigger with data-pkc-action and data-pkc-lid', () => {
    // The row is a <button> so Enter/Space work natively without a
    // bespoke keydown handler. `closest('[data-pkc-action]')` in the
    // binder resolves to this button from any inner span.
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [attachmentEntryWithKey('e-hot', 'k-hot', 'Hot')],
        assets: { 'k-hot': base64Of(1000) },
      }),
    );
    const row = overlay.querySelector<HTMLElement>(
      '[data-pkc-region="storage-profile-row"]',
    );
    expect(row).not.toBeNull();
    const trigger = row!.querySelector<HTMLButtonElement>(
      'button[data-pkc-action="select-from-storage-profile"]',
    );
    expect(trigger).not.toBeNull();
    expect(trigger!.tagName).toBe('BUTTON');
    expect(trigger!.getAttribute('data-pkc-lid')).toBe('e-hot');
    // Rendered text (icon / title / size / detail) lives inside the
    // button so the entire row surface is the click target.
    expect(trigger!.textContent).toContain('Hot');
  });

  it('does not mount a select trigger on the summary or orphan areas', () => {
    // Only row elements carry a `select-from-storage-profile` action.
    // Summary and orphan bands have no owner entry to jump to.
    const overlay = buildStorageProfileOverlay(
      makeProfileContainer({
        entries: [attachmentEntryWithKey('e1', 'k1', 'Alpha')],
        assets: {
          k1: base64Of(500),
          'k-floating': base64Of(200),
        },
      }),
    );
    const summary = overlay.querySelector<HTMLElement>(
      '[data-pkc-region="storage-profile-summary"]',
    );
    expect(summary).not.toBeNull();
    expect(
      summary!.querySelector('[data-pkc-action="select-from-storage-profile"]'),
    ).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────
// Sidebar scroll-into-view on SELECT_ENTRY
// ─────────────────────────────────────────────────────────────
// Pairs with the ancestor auto-expand in the SELECT_ENTRY reducer.
// After the tree layout is rebuilt, `render` looks up the selected
// sidebar entry and calls `scrollIntoView({ block: 'nearest' })` so
// jumps from Storage Profile / entry-ref / calendar / kanban don't
// leave the target off-screen.

describe('Sidebar scroll-into-view', () => {
  function scrollState(selectedLid: string | null): AppState {
    return {
      phase: 'ready', container: mockContainer,
      selectedLid,
      editingLid: null, error: null, embedded: false, pendingOffers: [],
      importPreview: null, batchImportPreview: null, searchQuery: '',
      archetypeFilter: new Set(), tagFilter: null,
      sortKey: 'created_at', sortDirection: 'desc',
      exportMode: null, exportMutability: null,
      readonly: false, lightSource: false, showArchived: false,
      viewMode: 'detail' as const,
      calendarYear: 2026, calendarMonth: 4,
      multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
  }

  it('calls scrollIntoView({ block: "nearest" }) on the selected sidebar node', () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      render(scrollState('e1'), root);
      // Spy catches all HTMLElement.scrollIntoView calls; at least one
      // call must be the sidebar entry with the documented options.
      const sidebarCalls = scrollSpy.mock.calls.filter(([opts]) => {
        return opts && typeof opts === 'object'
          && (opts as ScrollIntoViewOptions).block === 'nearest';
      });
      expect(sidebarCalls.length).toBeGreaterThanOrEqual(1);
      // The `this` binding of the call must be the selected entry <li>.
      const callIndex = scrollSpy.mock.calls.findIndex(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      );
      const targetEl = scrollSpy.mock.instances[callIndex] as unknown as HTMLElement;
      expect(targetEl.getAttribute('data-pkc-lid')).toBe('e1');
      expect(targetEl.getAttribute('data-pkc-selected')).toBe('true');
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it('does NOT call scrollIntoView when no entry is selected', () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      render(scrollState(null), root);
      const nearestCalls = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      );
      expect(nearestCalls.length).toBe(0);
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it('does NOT call scrollIntoView when the sidebar has no selected node', () => {
    // Selected lid references a phantom entry that does not exist in
    // the container — the sidebar therefore has no matching DOM node.
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      render(scrollState('ghost-lid'), root);
      const nearestCalls = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      );
      expect(nearestCalls.length).toBe(0);
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it('does NOT re-scroll on back-to-back renders with the same selectedLid', () => {
    // Prevents jitter when SORT_BY / TOGGLE_SHOW_ARCHIVED / folder
    // collapse or any other non-selection change triggers a re-render.
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      render(scrollState('e1'), root);
      const firstCount = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      ).length;
      render(scrollState('e1'), root);
      const secondCount = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      ).length;
      expect(secondCount).toBe(firstCount);
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it('re-scrolls when the selection actually moves between renders', () => {
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      render(scrollState('e1'), root);
      const afterFirst = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      ).length;
      render(scrollState('e2'), root);
      const afterSecond = scrollSpy.mock.calls.filter(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      ).length;
      expect(afterSecond).toBe(afterFirst + 1);
    } finally {
      scrollSpy.mockRestore();
    }
  });

  it('does NOT scroll the sidebar for a kanban-card-only selection in center pane', () => {
    // The kanban card also carries `data-pkc-selected="true"` but
    // lives in `[data-pkc-region="kanban-view"]`, not the sidebar.
    // The selector is sidebar-scoped so such selections should not
    // trigger scrolling — unless the same lid also appears as a tree
    // entry, which is the normal case.  In that case it IS scrolled
    // (tree visibility wins) — this test pins only the selector scope.
    const scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined);
    try {
      // Select e1; it exists in the tree so it DOES scroll — but
      // assert via the targeted element's region ancestor, not just
      // any selected-marked node.
      render(scrollState('e1'), root);
      const callIndex = scrollSpy.mock.calls.findIndex(([opts]) =>
        opts && (opts as ScrollIntoViewOptions).block === 'nearest',
      );
      const targetEl = scrollSpy.mock.instances[callIndex] as unknown as HTMLElement;
      // Ancestor must be the sidebar — the scroll is strictly tree-scoped.
      expect(targetEl.closest('[data-pkc-region="sidebar"]')).not.toBeNull();
    } finally {
      scrollSpy.mockRestore();
    }
  });
});

// ── FI-08.x: editor textarea stays plain / read mode autolinks (T-FBC-12, T-FBC-13) ──
// See docs/spec/addressbar-paste-fallback-v1-behavior-contract.md §7-5
describe('FI-08.x — editor textarea and read-mode autolink (T-FBC-12, T-FBC-13)', () => {
  const urlContainer: Container = {
    meta: {
      container_id: 'urltest',
      title: 'URL Test',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      schema_version: 1,
    },
    entries: [
      {
        lid: 'u1',
        title: 'URL only entry',
        body: 'https://example.com',
        archetype: 'text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };

  // T-FBC-12: edit mode textarea.value stays plain URL (I-FBC7)
  it('T-FBC-12: edit mode textarea[data-pkc-field="body"].value stays plain URL (no <a>)', () => {
    const state: AppState = {
      phase: 'editing', container: urlContainer,
      selectedLid: 'u1', editingLid: 'u1', error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const bodyArea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(bodyArea).not.toBeNull();
    expect(bodyArea!.value).toBe('https://example.com');
    // textarea.value MUST be the raw string, never HTML-ified
    expect(bodyArea!.value).not.toContain('<a');
    expect(bodyArea!.value).not.toContain('href=');
  });

  // T-FBC-13: read mode detail view renders bare URL as <a>
  it('T-FBC-13: read mode detail view renders bare URL as <a href>', () => {
    const state: AppState = {
      phase: 'ready', container: urlContainer,
      selectedLid: 'u1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
    };
    render(state, root);

    const view = root.querySelector('[data-pkc-mode="view"]');
    expect(view).not.toBeNull();

    // The body surface must contain a clickable <a> for the URL
    const anchor = view!.querySelector('a[href="https://example.com"]');
    expect(anchor).not.toBeNull();
    expect(anchor!.getAttribute('target')).toBe('_blank');
    expect(anchor!.getAttribute('rel')).toBe('noopener noreferrer');
  });
});

// ── Recent Entries Pane v1 ──
// Spec: docs/development/recent-entries-pane-v1.md
describe('Recent Entries Pane v1', () => {
  function mkEntry(
    lid: string,
    archetype: Entry['archetype'],
    updated_at: string,
    created_at: string = updated_at,
    title: string = lid,
  ): Entry {
    return { lid, title, body: '', archetype, created_at, updated_at };
  }

  function makeContainer(entries: Entry[]): Container {
    return {
      meta: {
        container_id: 'recent-test',
        title: 'Recent Test',
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

  function makeState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: makeContainer([]),
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('renders the pane inside sidebar when user entries exist', () => {
    const container = makeContainer([
      mkEntry('a', 'text', '2026-04-20T00:00:00Z'),
    ]);
    render(makeState({ container }), root);

    const pane = root.querySelector('[data-pkc-region="recent-entries"]');
    expect(pane).not.toBeNull();
    expect(pane!.closest('[data-pkc-region="sidebar"]')).not.toBeNull();
    expect(pane!.tagName.toLowerCase()).toBe('details');
    expect((pane as HTMLDetailsElement).open).toBe(true);
  });

  it('omits the pane when container has no user entries', () => {
    render(makeState({ container: makeContainer([]) }), root);
    expect(root.querySelector('[data-pkc-region="recent-entries"]')).toBeNull();
  });

  it('omits the pane when container has only system-* entries', () => {
    const container = makeContainer([
      mkEntry('sys1', 'system-about', '2026-04-20T00:00:00Z'),
      mkEntry('sys2', 'system-settings', '2026-04-21T00:00:00Z'),
    ]);
    render(makeState({ container }), root);
    expect(root.querySelector('[data-pkc-region="recent-entries"]')).toBeNull();
  });

  it('omits the pane when state.container is null', () => {
    render(makeState({ container: null }), root);
    expect(root.querySelector('[data-pkc-region="recent-entries"]')).toBeNull();
  });

  it('orders items by updated_at desc', () => {
    const container = makeContainer([
      mkEntry('old', 'text', '2026-01-01T00:00:00Z'),
      mkEntry('new', 'text', '2026-04-20T00:00:00Z'),
      mkEntry('mid', 'text', '2026-02-15T00:00:00Z'),
    ]);
    render(makeState({ container }), root);

    const items = root.querySelectorAll('[data-pkc-action="select-recent-entry"]');
    expect(items).toHaveLength(3);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('new');
    expect(items[1]!.getAttribute('data-pkc-lid')).toBe('mid');
    expect(items[2]!.getAttribute('data-pkc-lid')).toBe('old');
  });

  it('caps the pane at 10 items and shows "Recent (N)" in summary', () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      mkEntry(`e${String(i).padStart(2, '0')}`, 'text', `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    );
    render(makeState({ container: makeContainer(entries) }), root);

    const items = root.querySelectorAll('[data-pkc-action="select-recent-entry"]');
    expect(items).toHaveLength(10);

    const summary = root.querySelector('[data-pkc-region="recent-entries"] summary');
    expect(summary?.textContent).toBe('Recent (10)');
  });

  it('marks the selected lid in the pane with data-pkc-selected', () => {
    const container = makeContainer([
      mkEntry('a', 'text', '2026-04-20T00:00:00Z'),
      mkEntry('b', 'text', '2026-04-21T00:00:00Z'),
    ]);
    render(makeState({ container, selectedLid: 'a' }), root);

    const pane = root.querySelector('[data-pkc-region="recent-entries"]')!;
    const selected = pane.querySelector('[data-pkc-selected="true"]');
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute('data-pkc-lid')).toBe('a');

    const nonSelected = pane.querySelector('[data-pkc-lid="b"]');
    expect(nonSelected!.hasAttribute('data-pkc-selected')).toBe(false);
  });

  it('excludes system-* entries even when mixed with user entries', () => {
    const container = makeContainer([
      mkEntry('sys', 'system-about', '2026-04-21T00:00:00Z'),
      mkEntry('usr', 'text', '2026-04-20T00:00:00Z'),
    ]);
    render(makeState({ container }), root);

    const items = root.querySelectorAll('[data-pkc-action="select-recent-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('usr');
  });

  it('renders title, with "(untitled)" fallback when empty', () => {
    const container = makeContainer([
      mkEntry('a', 'text', '2026-04-20T00:00:00Z', '2026-04-20T00:00:00Z', 'Titled'),
      mkEntry('b', 'text', '2026-04-21T00:00:00Z', '2026-04-21T00:00:00Z', ''),
    ]);
    render(makeState({ container }), root);

    const items = Array.from(root.querySelectorAll<HTMLElement>(
      '[data-pkc-action="select-recent-entry"] .pkc-recent-title',
    ));
    expect(items.map((el) => el.textContent)).toEqual(['(untitled)', 'Titled']);
  });

  it('pane is placed between sort controls and archive toggle in sidebar', () => {
    const container = makeContainer([
      mkEntry('t', 'todo', '2026-04-20T00:00:00Z', '2026-04-20T00:00:00Z', 'T'),
    ]);
    // Inject an archived todo so the archive toggle renders too.
    container.entries.push({
      lid: 'arch',
      title: 'Archived',
      body: JSON.stringify({ status: 'done', description: '', archived: true }),
      archetype: 'todo',
      created_at: '2026-04-19T00:00:00Z',
      updated_at: '2026-04-19T00:00:00Z',
    });
    render(makeState({ container }), root);

    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const children = Array.from(sidebar.children);
    const sortIdx = children.findIndex((c) => c.getAttribute('data-pkc-region') === 'sort-controls');
    const paneIdx = children.findIndex((c) => c.getAttribute('data-pkc-region') === 'recent-entries');
    const toggleIdx = children.findIndex((c) => c.getAttribute('data-pkc-region') === 'show-archived-toggle');

    expect(sortIdx).toBeGreaterThanOrEqual(0);
    expect(paneIdx).toBeGreaterThan(sortIdx);
    expect(toggleIdx).toBeGreaterThan(paneIdx);
  });

  it('uses a dedicated action name distinct from select-entry', () => {
    const container = makeContainer([
      mkEntry('a', 'text', '2026-04-20T00:00:00Z'),
    ]);
    render(makeState({ container }), root);

    const pane = root.querySelector('[data-pkc-region="recent-entries"]')!;
    // No `select-entry` inside the pane (avoids sidebar keyboard-nav
    // clashes per spec §4.2 / §6).
    expect(pane.querySelector('[data-pkc-action="select-entry"]')).toBeNull();
    expect(pane.querySelector('[data-pkc-action="select-recent-entry"]')).not.toBeNull();
  });
});

// ── Saved Searches Pane v1 ──
// Spec: docs/development/saved-searches-v1.md
describe('Saved Searches Pane v1', () => {
  function mkEntry(
    lid: string,
    archetype: Entry['archetype'] = 'text',
    title: string = lid,
  ): Entry {
    return {
      lid,
      title,
      body: '',
      archetype,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
  }

  function mkSaved(id: string, name: string = `Saved ${id}`) {
    return {
      id,
      name,
      created_at: '2026-04-21T00:00:00Z',
      updated_at: '2026-04-21T00:00:00Z',
      search_query: '',
      archetype_filter: [] as Entry['archetype'][],
      tag_filter: null,
      sort_key: 'created_at' as const,
      sort_direction: 'desc' as const,
      show_archived: false,
    };
  }

  function makeContainer(
    entries: Entry[],
    saved?: ReturnType<typeof mkSaved>[],
  ): Container {
    return {
      meta: {
        container_id: 'ss-test',
        title: 'Saved Searches Test',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
        ...(saved ? { saved_searches: saved } : {}),
      },
      entries,
      relations: [],
      revisions: [],
      assets: {},
    };
  }

  function makeState(overrides?: Partial<AppState>): AppState {
    return {
      phase: 'ready', container: makeContainer([]),
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, batchImportPreview: null, searchQuery: '', archetypeFilter: new Set(), tagFilter: null, sortKey: 'created_at', sortDirection: 'desc', exportMode: null, exportMutability: null, readonly: false, lightSource: false, showArchived: false, viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4, multiSelectedLids: [], batchImportResult: null, collapsedFolders: [], recentEntryRefLids: [],
      ...overrides,
    };
  }

  it('renders the Save button in the search row when entries exist and not readonly', () => {
    const container = makeContainer([mkEntry('a')]);
    render(makeState({ container }), root);
    const btn = root.querySelector('[data-pkc-action="save-search"]');
    expect(btn).not.toBeNull();
    expect(btn!.closest('.pkc-search-row')).not.toBeNull();
  });

  it('hides the Save button in readonly mode', () => {
    const container = makeContainer([mkEntry('a')]);
    render(makeState({ container, readonly: true }), root);
    expect(root.querySelector('[data-pkc-action="save-search"]')).toBeNull();
  });

  it('hides the Save button while an import preview is active', () => {
    const container = makeContainer([mkEntry('a')]);
    render(
      makeState({
        container,
        importPreview: {
          title: 'Incoming',
          container_id: 'c2',
          entry_count: 0,
          revision_count: 0,
          schema_version: 1,
          source: 'x.json',
          container: makeContainer([]),
        },
      }),
      root,
    );
    expect(root.querySelector('[data-pkc-action="save-search"]')).toBeNull();
  });

  it('does not render the pane when saved_searches is empty / undefined', () => {
    const container = makeContainer([mkEntry('a')]);
    render(makeState({ container }), root);
    expect(root.querySelector('[data-pkc-region="saved-searches"]')).toBeNull();
  });

  it('renders one <li> per saved search with label and delete button', () => {
    const container = makeContainer(
      [mkEntry('a')],
      [mkSaved('s1', 'First'), mkSaved('s2', 'Second')],
    );
    render(makeState({ container }), root);
    const pane = root.querySelector('[data-pkc-region="saved-searches"]');
    expect(pane).not.toBeNull();
    const items = pane!.querySelectorAll('[data-pkc-action="apply-saved-search"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.getAttribute('data-pkc-saved-id')).toBe('s1');
    expect(items[0]!.querySelector('.pkc-saved-search-label')!.textContent).toBe('First');
    expect(items[0]!.querySelector('[data-pkc-action="delete-saved-search"]')).not.toBeNull();
    expect(items[1]!.getAttribute('data-pkc-saved-id')).toBe('s2');
  });

  it('renders the pane inside the sidebar, between sort controls and recent entries pane', () => {
    const container = makeContainer(
      [
        mkEntry('a'),
        { ...mkEntry('b'), updated_at: '2026-04-21T00:00:00Z' },
      ],
      [mkSaved('s1')],
    );
    render(makeState({ container }), root);
    const sidebar = root.querySelector('[data-pkc-region="sidebar"]')!;
    const savedPane = sidebar.querySelector('[data-pkc-region="saved-searches"]');
    const recentPane = sidebar.querySelector('[data-pkc-region="recent-entries"]');
    expect(savedPane).not.toBeNull();
    expect(recentPane).not.toBeNull();
    // DOM order: saved-searches comes before recent-entries.
    expect(
      savedPane!.compareDocumentPosition(recentPane!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('omits delete buttons when readonly but still renders apply buttons', () => {
    const container = makeContainer([mkEntry('a')], [mkSaved('s1', 'Read')]);
    render(makeState({ container, readonly: true }), root);
    const pane = root.querySelector('[data-pkc-region="saved-searches"]');
    expect(pane).not.toBeNull();
    expect(pane!.querySelector('[data-pkc-action="apply-saved-search"]')).not.toBeNull();
    expect(pane!.querySelector('[data-pkc-action="delete-saved-search"]')).toBeNull();
  });

  it('hides the pane entirely while an import preview is active', () => {
    const container = makeContainer([mkEntry('a')], [mkSaved('s1')]);
    render(
      makeState({
        container,
        importPreview: {
          title: 'Incoming',
          container_id: 'c2',
          entry_count: 0,
          revision_count: 0,
          schema_version: 1,
          source: 'x.json',
          container: makeContainer([]),
        },
      }),
      root,
    );
    expect(root.querySelector('[data-pkc-region="saved-searches"]')).toBeNull();
  });
});
