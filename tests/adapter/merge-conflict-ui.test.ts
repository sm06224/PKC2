/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import type { AppState } from '../../src/adapter/state/app-state';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { EntryConflict, Resolution } from '../../src/core/model/merge-conflict';
import { render } from '../../src/adapter/ui/renderer';

// ── Fixtures ──────────────────────────────

function makeEntry(overrides: Partial<Entry> & { lid: string }): Entry {
  return {
    title: 'Untitled', body: '', archetype: 'text',
    created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeContainer(entries: Entry[], id = 'c-test'): Container {
  return {
    meta: { container_id: id, title: 'Test', created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z', schema_version: 1 },
    entries, relations: [], revisions: [], assets: {},
  };
}

function makeConflict(
  overrides: Partial<EntryConflict> & { imported_lid: string; host_lid: string },
): EntryConflict {
  return {
    kind: 'title-only', imported_title: 'T', host_title: 'T', archetype: 'text',
    imported_content_hash: 'aaa', host_content_hash: 'bbb',
    imported_body_preview: 'imp preview', host_body_preview: 'host preview',
    imported_created_at: '2025-01-01T00:00:00Z', imported_updated_at: '2025-01-01T00:00:00Z',
    host_created_at: '2025-01-01T00:00:00Z', host_updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

const hostContainer = makeContainer([makeEntry({ lid: 'h-1', title: 'Report' })], 'c-host');
const impContainer = makeContainer([makeEntry({ lid: 'i-1', title: 'Report' })], 'c-imp');

function baseState(overrides?: Partial<AppState>): AppState {
  return {
    phase: 'ready', container: hostContainer,
    selectedLid: null, editingLid: null, error: null, embedded: false,
    pendingOffers: [],
    importPreview: {
      container: impContainer, source: 'test.pkc2', entry_count: 1,
      title: 'Test', container_id: 'c-imp', revision_count: 0, schema_version: 1,
    },
    importMode: 'merge',
    batchImportPreview: null, batchImportResult: null,
    searchQuery: '', archetypeFilter: new Set(), tagFilter: null,
    sortKey: 'title', sortDirection: 'asc',
    exportMode: null, exportMutability: null,
    readonly: false, lightSource: false, showArchived: false,
    viewMode: 'detail' as const, calendarYear: 2026, calendarMonth: 4,
    multiSelectedLids: [], collapsedFolders: [], recentEntryRefLids: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────

describe('Merge Conflict UI Rows', () => {
  let root: HTMLElement;

  function setup() {
    root = document.createElement('div');
    root.id = 'pkc-root';
    document.body.innerHTML = '';
    document.body.appendChild(root);
  }

  it('renders conflict rows when conflicts exist', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
      makeConflict({ imported_lid: 'i-2', host_lid: 'h-2', kind: 'title-only' }),
    ];
    const resolutions: Record<string, Resolution> = { 'i-1': 'keep-current' };
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: resolutions }), root);

    const region = root.querySelector('[data-pkc-region="merge-conflicts"]');
    expect(region).not.toBeNull();
    const rows = root.querySelectorAll('.pkc-merge-conflict-row[data-pkc-conflict-id]');
    expect(rows.length).toBe(2);
  });

  it('renders C1 row with kind badge and default pre-selected', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
    ];
    const resolutions: Record<string, Resolution> = { 'i-1': 'keep-current' };
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: resolutions }), root);

    const row = root.querySelector('[data-pkc-conflict-id="i-1"]');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('data-pkc-conflict-kind')).toBe('C1');

    const selectedRadio = row!.querySelector('[data-pkc-action="set-conflict-resolution"][data-pkc-selected="true"]');
    expect(selectedRadio).not.toBeNull();
    expect(selectedRadio!.getAttribute('data-pkc-value')).toBe('keep-current');
  });

  it('renders C2 row with warning badge', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-2', host_lid: 'h-1', kind: 'title-only' }),
    ];
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: {} }), root);

    const row = root.querySelector('[data-pkc-conflict-id="i-2"]');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('data-pkc-conflict-kind')).toBe('C2');
    expect(row!.textContent).toContain('title matches');
  });

  it('renders C2-multi row with keep-current disabled', () => {
    setup();
    const conflicts = [
      makeConflict({
        imported_lid: 'i-3', host_lid: 'h-1', kind: 'title-only-multi',
        host_candidates: ['h-1', 'h-2', 'h-3'],
      }),
    ];
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: {} }), root);

    const row = root.querySelector('[data-pkc-conflict-id="i-3"]');
    expect(row!.getAttribute('data-pkc-conflict-kind')).toBe('C2-multi');

    const keepBtn = row!.querySelector('[data-pkc-value="keep-current"]');
    expect(keepBtn).not.toBeNull();
    expect(keepBtn!.hasAttribute('disabled')).toBe(true);

    const branchBtn = row!.querySelector('[data-pkc-value="duplicate-as-branch"]');
    expect(branchBtn!.hasAttribute('disabled')).toBe(false);
  });

  it('renders resolution radio with correct data attributes for dispatch', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'title-only' }),
    ];
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: {} }), root);

    const radios = root.querySelectorAll('[data-pkc-action="set-conflict-resolution"]');
    expect(radios.length).toBe(3);

    const first = radios[0]!;
    expect(first.getAttribute('data-pkc-conflict-id')).toBe('i-1');
    expect(first.getAttribute('data-pkc-value')).toBeTruthy();
  });

  it('renders bulk accept-all-host and duplicate-all buttons', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
    ];
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: { 'i-1': 'keep-current' } }), root);

    const acceptBtn = root.querySelector('[data-pkc-action="bulk-resolution"][data-pkc-value="keep-current"]');
    expect(acceptBtn).not.toBeNull();
    expect(acceptBtn!.textContent).toContain('Accept all host');

    const dupBtn = root.querySelector('[data-pkc-action="bulk-resolution"][data-pkc-value="duplicate-as-branch"]');
    expect(dupBtn).not.toBeNull();
    expect(dupBtn!.textContent).toContain('Duplicate all');
  });

  it('disables confirm when C2 conflicts are unresolved', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
      makeConflict({ imported_lid: 'i-2', host_lid: 'h-2', kind: 'title-only' }),
    ];
    const resolutions: Record<string, Resolution> = { 'i-1': 'keep-current' };
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: resolutions }), root);

    const confirmBtn = root.querySelector('[data-pkc-action="confirm-merge-import"]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.hasAttribute('disabled')).toBe(true);
  });

  it('enables confirm when all conflicts are resolved', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
      makeConflict({ imported_lid: 'i-2', host_lid: 'h-2', kind: 'title-only' }),
    ];
    const resolutions: Record<string, Resolution> = { 'i-1': 'keep-current', 'i-2': 'skip' };
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: resolutions }), root);

    const confirmBtn = root.querySelector('[data-pkc-action="confirm-merge-import"]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.hasAttribute('disabled')).toBe(false);
  });

  it('does not render conflict section when no conflicts', () => {
    setup();
    render(baseState({ mergeConflicts: undefined, mergeConflictResolutions: undefined }), root);
    const region = root.querySelector('[data-pkc-region="merge-conflicts"]');
    expect(region).toBeNull();
  });

  it('does not render conflict section in replace mode', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-1', host_lid: 'h-1', kind: 'content-equal' }),
    ];
    render(baseState({
      importMode: 'replace',
      mergeConflicts: conflicts,
      mergeConflictResolutions: { 'i-1': 'keep-current' },
    }), root);
    const region = root.querySelector('[data-pkc-region="merge-conflicts"]');
    expect(region).toBeNull();
  });

  it('renders rows in deterministic order matching conflicts array', () => {
    setup();
    const conflicts = [
      makeConflict({ imported_lid: 'i-A', host_lid: 'h-1', kind: 'content-equal' }),
      makeConflict({ imported_lid: 'i-B', host_lid: 'h-2', kind: 'title-only' }),
      makeConflict({ imported_lid: 'i-C', host_lid: 'h-3', kind: 'title-only-multi', host_candidates: ['h-3', 'h-4'] }),
    ];
    const resolutions: Record<string, Resolution> = {
      'i-A': 'keep-current', 'i-B': 'skip', 'i-C': 'duplicate-as-branch',
    };
    render(baseState({ mergeConflicts: conflicts, mergeConflictResolutions: resolutions }), root);

    const rows = root.querySelectorAll('.pkc-merge-conflict-row[data-pkc-conflict-id]');
    expect(rows.length).toBe(3);
    expect(rows[0]!.getAttribute('data-pkc-conflict-id')).toBe('i-A');
    expect(rows[1]!.getAttribute('data-pkc-conflict-id')).toBe('i-B');
    expect(rows[2]!.getAttribute('data-pkc-conflict-id')).toBe('i-C');
  });
});
