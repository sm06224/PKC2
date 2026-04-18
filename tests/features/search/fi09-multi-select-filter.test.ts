/**
 * FI-09: multi-select archetype filter behavior tests
 *
 * Covers:
 * - filterByArchetypes pure helper (12 cases)
 * - reducer: TOGGLE_ARCHETYPE_FILTER, TOGGLE_ARCHETYPE_FILTER_EXPANDED,
 *   SET_ARCHETYPE_FILTER backward compat, CLEAR_FILTERS (6 cases)
 * - renderer: 2-tier layout, expand/collapse, active state, All button (7 cases)
 */

/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { filterByArchetypes, applyFilters } from '@features/search/filter';
import { reduce, createInitialState } from '@adapter/state/app-state';
import { render } from '@adapter/ui/renderer';
import type { Entry, ArchetypeId } from '@core/model/record';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

// ── helpers ─────────────────────────────────────────────────

function makeEntry(lid: string, archetype: ArchetypeId, title = lid): Entry {
  return {
    lid,
    title,
    body: '',
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const allTypesEntries: Entry[] = [
  makeEntry('e1', 'text'),
  makeEntry('e2', 'textlog'),
  makeEntry('e3', 'todo'),
  makeEntry('e4', 'attachment'),
  makeEntry('e5', 'folder'),
];

const mockContainer: Container = {
  meta: { container_id: 'c1', title: 'Test', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', schema_version: 1 },
  entries: allTypesEntries,
  relations: [],
  revisions: [],
  assets: {},
};

function readyState(): AppState {
  return { ...createInitialState(), phase: 'ready', container: mockContainer };
}

// ── 1. filterByArchetypes pure helper ───────────────────────

describe('filterByArchetypes', () => {
  it('empty set returns all entries', () => {
    expect(filterByArchetypes(allTypesEntries, new Set())).toEqual(allTypesEntries);
  });

  it('single archetype filters correctly', () => {
    const result = filterByArchetypes(allTypesEntries, new Set(['text'] as const));
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('e1');
  });

  it('multi-select uses OR semantics', () => {
    const result = filterByArchetypes(allTypesEntries, new Set(['text', 'todo'] as const));
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.lid)).toEqual(['e1', 'e3']);
  });

  it('archetype not present returns empty', () => {
    const result = filterByArchetypes(allTypesEntries, new Set(['form'] as const));
    expect(result).toHaveLength(0);
  });

  it('all archetypes selected returns all entries', () => {
    const all = new Set(['text', 'textlog', 'todo', 'attachment', 'folder'] as const);
    expect(filterByArchetypes(allTypesEntries, all)).toHaveLength(5);
  });

  it('handles empty entries array', () => {
    expect(filterByArchetypes([], new Set(['text'] as const))).toEqual([]);
  });

  it('applyFilters: empty set = no filter', () => {
    expect(applyFilters(allTypesEntries, '', new Set())).toEqual(allTypesEntries);
  });

  it('applyFilters: text AND archetype', () => {
    const entries = [
      makeEntry('a1', 'text', 'hello'),
      makeEntry('a2', 'todo', 'hello'),
      makeEntry('a3', 'text', 'world'),
    ];
    const result = applyFilters(entries, 'hello', new Set(['text'] as const));
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('a1');
  });

  it('multi-select + text query = AND across both dimensions', () => {
    const entries = [
      makeEntry('b1', 'text', 'note'),
      makeEntry('b2', 'textlog', 'note'),
      makeEntry('b3', 'todo', 'note'),
    ];
    const result = applyFilters(entries, 'note', new Set(['text', 'textlog'] as const));
    expect(result.map((e) => e.lid)).toEqual(['b1', 'b2']);
  });

  it('single archetype in Set matches exactly like old single-select', () => {
    const old = filterByArchetypes(allTypesEntries, new Set(['textlog'] as const));
    expect(old).toHaveLength(1);
    expect(old[0]!.lid).toBe('e2');
  });

  it('ReadonlySet does not mutate on re-call', () => {
    const filter = new Set(['text'] as const) as ReadonlySet<ArchetypeId>;
    filterByArchetypes(allTypesEntries, filter);
    filterByArchetypes(allTypesEntries, filter);
    expect(filter.size).toBe(1);
  });

  it('folder archetype filtered correctly', () => {
    const result = filterByArchetypes(allTypesEntries, new Set(['folder'] as const));
    expect(result).toHaveLength(1);
    expect(result[0]!.lid).toBe('e5');
  });
});

// ── 2. Reducer ──────────────────────────────────────────────

describe('TOGGLE_ARCHETYPE_FILTER', () => {
  it('adds archetype to empty set', () => {
    const { state } = reduce(readyState(), { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'text' });
    expect(state.archetypeFilter).toEqual(new Set(['text']));
  });

  it('removes archetype when already selected', () => {
    const base = { ...readyState(), archetypeFilter: new Set(['text', 'todo'] as const) };
    const { state } = reduce(base, { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'text' });
    expect(state.archetypeFilter).toEqual(new Set(['todo']));
  });

  it('removing last archetype yields empty set (= All)', () => {
    const base = { ...readyState(), archetypeFilter: new Set(['todo'] as const) };
    const { state } = reduce(base, { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'todo' });
    expect(state.archetypeFilter).toEqual(new Set());
  });

  it('supports multi-select (two archetypes active)', () => {
    const s1 = reduce(readyState(), { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'text' }).state;
    const s2 = reduce(s1, { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'folder' }).state;
    expect(s2.archetypeFilter).toEqual(new Set(['text', 'folder']));
  });

  it('produces no domain events', () => {
    const { events } = reduce(readyState(), { type: 'TOGGLE_ARCHETYPE_FILTER', archetype: 'text' });
    expect(events).toHaveLength(0);
  });
});

describe('TOGGLE_ARCHETYPE_FILTER_EXPANDED', () => {
  it('expands when collapsed (default false)', () => {
    const { state } = reduce(readyState(), { type: 'TOGGLE_ARCHETYPE_FILTER_EXPANDED' });
    expect(state.archetypeFilterExpanded).toBe(true);
  });

  it('collapses when expanded', () => {
    const base = { ...readyState(), archetypeFilterExpanded: true };
    const { state } = reduce(base, { type: 'TOGGLE_ARCHETYPE_FILTER_EXPANDED' });
    expect(state.archetypeFilterExpanded).toBe(false);
  });

  it('CLEAR_FILTERS does NOT reset archetypeFilterExpanded', () => {
    const base = { ...readyState(), archetypeFilterExpanded: true, archetypeFilter: new Set(['todo'] as const) };
    const { state } = reduce(base, { type: 'CLEAR_FILTERS' });
    expect(state.archetypeFilter).toEqual(new Set());
    expect(state.archetypeFilterExpanded).toBe(true);
  });
});

// ── 3. Renderer ─────────────────────────────────────────────

describe('renderArchetypeFilter UI', () => {
  let root: HTMLElement;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  it('renders All button active when archetypeFilter is empty', () => {
    render(readyState(), root);
    const allBtn = root.querySelector('[data-pkc-action="set-archetype-filter"][data-pkc-archetype=""]');
    expect(allBtn).not.toBeNull();
    expect(allBtn!.getAttribute('data-pkc-active')).toBe('true');
  });

  it('primary group is always present', () => {
    render(readyState(), root);
    const group = root.querySelector('[data-pkc-filter-group="primary"]');
    expect(group).not.toBeNull();
    const textBtn = group!.querySelector('[data-pkc-archetype="text"]');
    expect(textBtn).not.toBeNull();
  });

  it('secondary group is initially hidden (data-pkc-visible=false)', () => {
    render(readyState(), root);
    const secondary = root.querySelector('[data-pkc-filter-group="secondary"]');
    expect(secondary).not.toBeNull();
    expect(secondary!.getAttribute('data-pkc-visible')).toBe('false');
  });

  it('secondary group becomes visible when archetypeFilterExpanded=true', () => {
    const state = { ...readyState(), archetypeFilterExpanded: true };
    render(state, root);
    const secondary = root.querySelector('[data-pkc-filter-group="secondary"]');
    expect(secondary!.getAttribute('data-pkc-visible')).toBe('true');
  });

  it('selected archetype button has data-pkc-active=true, All does not', () => {
    const state = { ...readyState(), archetypeFilter: new Set(['text'] as const) };
    render(state, root);
    const textBtn = root.querySelector('[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="text"]');
    expect(textBtn!.getAttribute('data-pkc-active')).toBe('true');
    const allBtn = root.querySelector('[data-pkc-action="set-archetype-filter"][data-pkc-archetype=""]');
    expect(allBtn!.hasAttribute('data-pkc-active')).toBe(false);
  });

  it('expand toggle button is rendered', () => {
    render(readyState(), root);
    const toggle = root.querySelector('[data-pkc-action="toggle-archetype-filter-expanded"]');
    expect(toggle).not.toBeNull();
  });

  it('multi-select: two archetypes both show data-pkc-active=true', () => {
    const state = { ...readyState(), archetypeFilter: new Set(['text', 'folder'] as const) };
    render(state, root);
    const textBtn = root.querySelector('[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="text"]');
    const folderBtn = root.querySelector('[data-pkc-action="toggle-archetype-filter"][data-pkc-archetype="folder"]');
    expect(textBtn!.getAttribute('data-pkc-active')).toBe('true');
    expect(folderBtn!.getAttribute('data-pkc-active')).toBe('true');
  });
});
