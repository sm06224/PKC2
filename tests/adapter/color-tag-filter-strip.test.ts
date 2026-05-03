/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import { render } from '@adapter/ui/renderer';
import { type AppState } from '@adapter/state/app-state';

/**
 * Color tag simple search UI — chip strip render contract.
 *
 * The strip shows a chip per palette ID that at least one entry in
 * the container currently carries. Click toggles
 * `state.colorTagFilter`. Renders nothing when no entry has a
 * recognised color tag, so the sidebar stays clean for users who
 * don't tag.
 */

function mkEntry(lid: string, overrides: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: lid.toUpperCase(),
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'test',
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

function mkState(container: Container, overrides?: Partial<AppState>): AppState {
  return {
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
    categoricalPeerFilter: null,
    sortKey: 'created_at',
    sortDirection: 'desc',
    exportMode: null,
    exportMutability: null,
    readonly: false,
    lightSource: false,
    showArchived: false,
    viewMode: 'detail',
    calendarYear: 2026,
    calendarMonth: 4,
    multiSelectedLids: [],
    batchImportResult: null,
    collapsedFolders: [],
    recentEntryRefLids: [],
    ...overrides,
  };
}

describe('Color tag filter strip', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('renders nothing when no entry has a color tag', () => {
    const container = mkContainer([
      mkEntry('e1'),
      mkEntry('e2'),
    ]);
    render(mkState(container), root);
    const strip = root.querySelector('[data-pkc-region="color-filter-strip"]');
    expect(strip).toBeNull();
  });

  it('renders nothing when the only color_tag values are unrecognised', () => {
    // Round-trip preservation lets unknown palette IDs survive on
    // entries, but the strip must only surface canonical v1 IDs.
    const container = mkContainer([
      mkEntry('e1', { color_tag: 'teal' }),
    ]);
    render(mkState(container), root);
    const strip = root.querySelector('[data-pkc-region="color-filter-strip"]');
    expect(strip).toBeNull();
  });

  it('renders one chip per palette ID actually in use', () => {
    const container = mkContainer([
      mkEntry('e1', { color_tag: 'red' }),
      mkEntry('e2', { color_tag: 'red' }),  // duplicate → still 1 chip
      mkEntry('e3', { color_tag: 'blue' }),
      mkEntry('e4'),                          // untagged
    ]);
    render(mkState(container), root);
    const chips = root.querySelectorAll(
      '[data-pkc-region="color-filter-strip"] [data-pkc-action="toggle-color-tag-filter"]',
    );
    expect(chips).toHaveLength(2);
    const colors = Array.from(chips).map((c) => c.getAttribute('data-pkc-color'));
    expect(colors).toEqual(['red', 'blue']);  // palette order: red < blue
  });

  it('orders chips by palette order regardless of insertion order', () => {
    const container = mkContainer([
      mkEntry('e1', { color_tag: 'gray' }),
      mkEntry('e2', { color_tag: 'red' }),
      mkEntry('e3', { color_tag: 'green' }),
      mkEntry('e4', { color_tag: 'yellow' }),
    ]);
    render(mkState(container), root);
    const chips = root.querySelectorAll(
      '[data-pkc-region="color-filter-strip"] [data-pkc-color]',
    );
    const colors = Array.from(chips).map((c) => c.getAttribute('data-pkc-color'));
    // COLOR_TAG_IDS = red, orange, yellow, green, blue, purple, pink, gray
    expect(colors).toEqual(['red', 'yellow', 'green', 'gray']);
  });

  it('marks chips active when their color is in colorTagFilter', () => {
    const container = mkContainer([
      mkEntry('e1', { color_tag: 'red' }),
      mkEntry('e2', { color_tag: 'blue' }),
      mkEntry('e3', { color_tag: 'green' }),
    ]);
    render(
      mkState(container, { colorTagFilter: new Set(['red', 'green']) }),
      root,
    );
    const red = root.querySelector('[data-pkc-color="red"]');
    const blue = root.querySelector('[data-pkc-color="blue"]');
    const green = root.querySelector('[data-pkc-color="green"]');
    expect(red!.getAttribute('data-pkc-active')).toBe('true');
    expect(red!.getAttribute('aria-pressed')).toBe('true');
    expect(blue!.hasAttribute('data-pkc-active')).toBe(false);
    expect(blue!.getAttribute('aria-pressed')).toBe('false');
    expect(green!.getAttribute('data-pkc-active')).toBe('true');
  });

  it('chip carries pkc-color-<id> class for palette tinting', () => {
    const container = mkContainer([
      mkEntry('e1', { color_tag: 'purple' }),
    ]);
    render(mkState(container), root);
    const chip = root.querySelector('[data-pkc-color="purple"]');
    expect(chip!.classList.contains('pkc-color-filter-chip')).toBe(true);
    expect(chip!.classList.contains('pkc-color-purple')).toBe(true);
  });

  it('chip exposes accessible label for screen readers', () => {
    const container = mkContainer([mkEntry('e1', { color_tag: 'orange' })]);
    render(mkState(container), root);
    const chip = root.querySelector('[data-pkc-color="orange"]');
    expect(chip!.getAttribute('aria-label')).toBe('Filter by color: orange');
    expect(chip!.getAttribute('title')).toBe('Filter by color: orange');
    expect(chip!.getAttribute('type')).toBe('button');
  });

  it('strip is announced as a labeled group', () => {
    const container = mkContainer([mkEntry('e1', { color_tag: 'red' })]);
    render(mkState(container), root);
    const strip = root.querySelector('[data-pkc-region="color-filter-strip"]');
    expect(strip!.getAttribute('role')).toBe('group');
    expect(strip!.getAttribute('aria-label')).toBe('Color filter');
  });

  it('strip lives inside the ⚙ Filters disclosure (not at sidebar root)', () => {
    const container = mkContainer([mkEntry('e1', { color_tag: 'red' })]);
    render(mkState(container), root);
    const disclosure = root.querySelector('[data-pkc-region="advanced-filters"]');
    expect(disclosure).not.toBeNull();
    const strip = disclosure!.querySelector('[data-pkc-region="color-filter-strip"]');
    expect(strip).not.toBeNull();
    // Strip must NOT be a direct child of the sidebar — only inside
    // the disclosure. Walk up: the closest wrapping region must be
    // advanced-filters, not the sidebar itself.
    const wrapper = strip!.closest('[data-pkc-region]');
    expect(wrapper).toBe(strip);
    const parentRegion = strip!.parentElement?.closest('[data-pkc-region]');
    expect(parentRegion?.getAttribute('data-pkc-region')).toBe('advanced-filters');
  });

  it('disclosure surfaces even when only colored entries exist (no other toggles)', () => {
    // Pure TEXT entry with a color: archetype filter doesn't show
    // any toggle, no archived todo, no attachment, no bucket folder.
    // The disclosure should still appear because color chips are
    // sufficient on their own.
    const container = mkContainer([mkEntry('e1', { color_tag: 'green' })]);
    render(mkState(container), root);
    const disclosure = root.querySelector('[data-pkc-region="advanced-filters"]');
    expect(disclosure).not.toBeNull();
    const summary = disclosure!.querySelector('summary');
    expect(summary?.textContent).toBe('⚙ Filters');
  });

  it('strip is hidden when the container has no user entries', () => {
    // The whole search/filter region is gated on `allEntries.length`,
    // so an empty container drops everything (including the color
    // strip) without a separate guard inside the strip.
    const container = mkContainer([]);
    render(mkState(container), root);
    const strip = root.querySelector('[data-pkc-region="color-filter-strip"]');
    expect(strip).toBeNull();
  });
});
