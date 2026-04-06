/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('initializing');
    expect(root.textContent).toContain('initializing');
  });

  it('renders error phase with message', () => {
    const state: AppState = {
      phase: 'error', container: null,
      selectedLid: null, editingLid: null, error: 'test error', embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-phase')).toBe('error');
    expect(root.textContent).toContain('test error');
  });

  it('renders ready phase with entry list', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected).not.toBeNull();
    expect(selected!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('renders detail view for selected entry', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const detail = root.querySelector('[data-pkc-region="detail"]');
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
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor).not.toBeNull();

    const titleInput = editor!.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
    expect(titleInput?.value).toBe('Entry One');

    const bodyArea = editor!.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(bodyArea?.value).toBe('Body of entry one');

    // Save and Cancel buttons
    expect(editor!.querySelector('[data-pkc-action="commit-edit"]')).not.toBeNull();
    expect(editor!.querySelector('[data-pkc-action="cancel-edit"]')).not.toBeNull();
  });

  it('shows create button only in ready phase', () => {
    const readyState: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(readyState, root);
    expect(root.querySelector('[data-pkc-action="create-entry"]')).not.toBeNull();

    const editingState: AppState = {
      phase: 'editing', container: mockContainer,
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.textContent).toContain('Create an entry to begin');
  });

  it('shows export button in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    const exportBtn = root.querySelector('[data-pkc-action="begin-export"]');
    expect(exportBtn).not.toBeNull();
    expect(exportBtn!.textContent).toBe('Export');
  });

  it('shows exporting badge in exporting phase', () => {
    const state: AppState = {
      phase: 'exporting', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.querySelector('[data-pkc-action="begin-export"]')).toBeNull();
    expect(root.textContent).toContain('Exporting');
  });

  it('uses data-pkc-* attributes for all action elements', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('false');
  });

  it('sets data-pkc-embedded=true for embedded', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: true, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);
    expect(root.getAttribute('data-pkc-embedded')).toBe('true');
  });

  it('sets data-pkc-capabilities with current capabilities', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      ], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const badge = root.querySelector('[data-pkc-revision-count="2"]');
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toContain('2 versions');
  });

  it('does not show revision badge on entries without revisions', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      }, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const revInfo = root.querySelector('[data-pkc-region="revision-info"]');
    expect(revInfo).not.toBeNull();
    expect(revInfo!.textContent).toContain('1 previous version');
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const restoreBtn = root.querySelector('[data-pkc-action="restore-entry"]');
    expect(restoreBtn).not.toBeNull();
    expect(restoreBtn!.getAttribute('data-pkc-lid')).toBe('e1');
    expect(restoreBtn!.getAttribute('data-pkc-revision-id')).toBe('rev-1');
    expect(restoreBtn!.textContent).toContain('Revert to previous version');
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain('1 restorable');
    expect(section!.textContent).toContain('Deleted Entry');
    expect(section!.textContent).toContain('text'); // archetype badge

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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const section = root.querySelector('[data-pkc-region="restore-candidates"]');
    expect(section!.textContent).toContain('2026-04-01 09:15');
    expect(section!.textContent).toContain('todo'); // archetype
  });

  it('renders search input when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-field="search"]')).toBeNull();
  });

  it('filters entries by search query', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e1');
  });

  it('shows "No matching entries" when search has no results', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'zzzzz', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    expect(root.textContent).toContain('No matching entries');
    expect(root.querySelectorAll('[data-pkc-action="select-entry"]')).toHaveLength(0);
  });

  it('preserves search input value from state', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'hello', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const input = root.querySelector<HTMLInputElement>('[data-pkc-field="search"]');
    expect(input!.value).toBe('hello');
  });

  it('renders archetype filter bar when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
    expect(textBtn!.textContent).toBe('text');
  });

  it('marks active archetype filter button', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const todoBtn = root.querySelector('[data-pkc-archetype="todo"]');
    expect(todoBtn!.getAttribute('data-pkc-active')).toBe('true');

    const allBtn = root.querySelector('[data-pkc-archetype=""]');
    expect(allBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('filters entries by archetype', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const items = root.querySelectorAll('[data-pkc-action="select-entry"]');
    expect(items).toHaveLength(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('e2');
  });

  it('shows result count when filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'text', sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('shows result count when search query is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const count = root.querySelector('[data-pkc-region="result-count"]');
    expect(count).not.toBeNull();
    expect(count!.textContent).toBe('1 / 2 entries');
  });

  it('does not show result count when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-region="result-count"]')).toBeNull();
  });

  it('shows clear-filters button when search query is non-empty', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'test', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.textContent).toBe('×');
  });

  it('shows clear-filters button when archetype filter is set', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: 'todo', sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const clearBtn = root.querySelector('[data-pkc-action="clear-filters"]');
    expect(clearBtn).not.toBeNull();
  });

  it('does not show clear-filters button when no filter is active', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    expect(root.querySelector('[data-pkc-action="clear-filters"]')).toBeNull();
  });

  it('renders sort controls when entries exist', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'title', sortDirection: 'asc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'title', sortDirection: 'asc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'title', sortDirection: 'desc',
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
      selectedLid: null, editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: 'One', archetypeFilter: null, sortKey: 'title', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e2', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const relRegion = root.querySelector('[data-pkc-region="relations"]');
    expect(relRegion).toBeNull();
  });

  it('shows relation creation form in ready phase', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: 'e1', error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const chips = root.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(1); // only categorical
  });

  it('shows tag add form with available targets', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
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
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    // e2 is already tagged, so no available targets (only 2 entries total)
    const addForm = root.querySelector('[data-pkc-region="tag-add"]');
    expect(addForm).toBeNull(); // no form when all tagged
  });

  it('tags section always shows even with no tags', () => {
    const state: AppState = {
      phase: 'ready', container: mockContainer,
      selectedLid: 'e1', editingLid: null, error: null, embedded: false, pendingOffers: [], importPreview: null, searchQuery: '', archetypeFilter: null, sortKey: 'created_at', sortDirection: 'desc',
    };
    render(state, root);

    const tagRegion = root.querySelector('[data-pkc-region="tags"]');
    expect(tagRegion).not.toBeNull();
    // No chips
    const chips = tagRegion!.querySelectorAll('.pkc-tag-chip');
    expect(chips).toHaveLength(0);
  });
});
