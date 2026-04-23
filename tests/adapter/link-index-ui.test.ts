/**
 * @vitest-environment happy-dom
 *
 * C-3 v1 UI slice: meta pane link-index sections.
 *
 * Contract: docs/spec/link-index-v1-behavior-contract.md §4.6
 * Categories: outgoing / backlinks / broken / empty / self-link /
 * duplicate-no-multiplication / click-action / no-selected-entry /
 * existing-meta-no-regression
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { ArchetypeId } from '@core/model/record';

function mkEntry(lid: string, archetype: ArchetypeId, body: string): Entry {
  return {
    lid,
    title: `${lid.toUpperCase()} title`,
    body,
    archetype,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function mkContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: 'c1',
      title: 'Test',
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

function mkState(container: Container, selectedLid: string | null): AppState {
  return {
    phase: 'ready',
    container,
    selectedLid,
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
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    root.remove();
  };
});

describe('C-3 UI: meta pane link-index sections', () => {
  it('renders outgoing links for selected entry', () => {
    const container = mkContainer([
      mkEntry('a', 'text', 'see entry:b and entry:c'),
      mkEntry('b', 'text', ''),
      mkEntry('c', 'text', ''),
    ]);
    render(mkState(container, 'a'), root);

    const outgoing = root.querySelector('[data-pkc-region="link-index-outgoing"]');
    expect(outgoing).not.toBeNull();
    const items = outgoing!.querySelectorAll('.pkc-link-index-item');
    expect(items).toHaveLength(2);
    const lids = Array.from(items).map((el) => el.getAttribute('data-pkc-lid'));
    expect(lids).toEqual(['b', 'c']);
    // First row shows peer title and has select-entry action
    const firstPeer = items[0]!.querySelector('.pkc-link-index-peer');
    expect(firstPeer?.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(firstPeer?.getAttribute('data-pkc-lid')).toBe('b');
    expect(firstPeer?.textContent).toBe('B title');
  });

  it('renders backlinks for selected entry', () => {
    const container = mkContainer([
      mkEntry('hub', 'text', ''),
      mkEntry('x', 'text', 'entry:hub'),
      mkEntry('y', 'text', 'entry:hub'),
    ]);
    render(mkState(container, 'hub'), root);

    const backlinks = root.querySelector('[data-pkc-region="link-index-backlinks"]');
    expect(backlinks).not.toBeNull();
    const items = backlinks!.querySelectorAll('.pkc-link-index-item');
    expect(items).toHaveLength(2);
    const sourceLids = Array.from(items).map((el) => el.getAttribute('data-pkc-lid'));
    expect(sourceLids).toEqual(['x', 'y']);
  });

  it('renders broken links for selected entry with broken marker', () => {
    const container = mkContainer([
      mkEntry('a', 'text', 'link to entry:missing and entry:gone'),
    ]);
    render(mkState(container, 'a'), root);

    const broken = root.querySelector('[data-pkc-region="link-index-broken"]');
    expect(broken).not.toBeNull();
    const items = broken!.querySelectorAll('.pkc-link-index-item');
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.getAttribute('data-pkc-broken')).toBe('true');
      const peer = item.querySelector('.pkc-link-index-peer');
      // Broken rows have no click action; text is the raw lid.
      expect(peer?.getAttribute('data-pkc-action')).toBeNull();
    }
    const lids = Array.from(items).map((el) => el.getAttribute('data-pkc-lid'));
    expect(lids).toEqual(['missing', 'gone']);
  });

  it('renders empty state when no outgoing / backlinks / broken', () => {
    const container = mkContainer([mkEntry('lonely', 'text', 'just text no refs')]);
    render(mkState(container, 'lonely'), root);

    const outgoing = root.querySelector('[data-pkc-region="link-index-outgoing"]');
    const backlinks = root.querySelector('[data-pkc-region="link-index-backlinks"]');
    const broken = root.querySelector('[data-pkc-region="link-index-broken"]');
    expect(outgoing?.querySelector('.pkc-link-index-empty')?.textContent).toBe(
      'No outgoing links.',
    );
    expect(backlinks?.querySelector('.pkc-link-index-empty')?.textContent).toBe(
      'No backlinks.',
    );
    expect(broken?.querySelector('.pkc-link-index-empty')?.textContent).toBe(
      'No broken links.',
    );
  });

  it('self-link appears in both outgoing and backlinks', () => {
    const container = mkContainer([mkEntry('a', 'text', 'self ref entry:a')]);
    render(mkState(container, 'a'), root);

    const outgoing = root.querySelector('[data-pkc-region="link-index-outgoing"]');
    const backlinks = root.querySelector('[data-pkc-region="link-index-backlinks"]');
    expect(outgoing!.querySelectorAll('.pkc-link-index-item')).toHaveLength(1);
    expect(backlinks!.querySelectorAll('.pkc-link-index-item')).toHaveLength(1);
    const outLid = outgoing!
      .querySelector('.pkc-link-index-item')!
      .getAttribute('data-pkc-lid');
    const backLid = backlinks!
      .querySelector('.pkc-link-index-item')!
      .getAttribute('data-pkc-lid');
    expect(outLid).toBe('a');
    expect(backLid).toBe('a');
  });

  it('duplicate refs in same entry do not multiply the row', () => {
    const container = mkContainer([
      mkEntry('a', 'text', 'entry:b and again entry:b and once more entry:b'),
      mkEntry('b', 'text', ''),
    ]);
    render(mkState(container, 'a'), root);

    const outgoing = root.querySelector('[data-pkc-region="link-index-outgoing"]');
    expect(outgoing!.querySelectorAll('.pkc-link-index-item')).toHaveLength(1);
  });

  it('resolved outgoing row carries select-entry action with target lid', () => {
    const container = mkContainer([
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text', ''),
    ]);
    render(mkState(container, 'a'), root);

    const outgoing = root.querySelector('[data-pkc-region="link-index-outgoing"]');
    const peer = outgoing!.querySelector('.pkc-link-index-peer');
    expect(peer?.getAttribute('data-pkc-action')).toBe('select-entry');
    expect(peer?.getAttribute('data-pkc-lid')).toBe('b');
  });

  it('no selected entry → no link-index region rendered', () => {
    const container = mkContainer([
      mkEntry('a', 'text', 'entry:b'),
      mkEntry('b', 'text', ''),
    ]);
    render(mkState(container, null), root);

    expect(root.querySelector('[data-pkc-region="link-index"]')).toBeNull();
    expect(root.querySelector('[data-pkc-region="link-index-outgoing"]')).toBeNull();
  });

  it('existing meta pane sections still render alongside link-index', () => {
    const container = mkContainer([mkEntry('a', 'text', 'entry:b'), mkEntry('b', 'text', '')]);
    render(mkState(container, 'a'), root);

    // Existing meta sections survive.
    const metaPane = root.querySelector('[data-pkc-region="meta"]');
    expect(metaPane).not.toBeNull();
    // Link-index region appears inside the meta pane.
    const linkIndex = metaPane!.querySelector('[data-pkc-region="link-index"]');
    expect(linkIndex).not.toBeNull();
    // All three subsections present.
    expect(linkIndex!.querySelector('[data-pkc-region="link-index-outgoing"]')).not.toBeNull();
    expect(linkIndex!.querySelector('[data-pkc-region="link-index-backlinks"]')).not.toBeNull();
    expect(linkIndex!.querySelector('[data-pkc-region="link-index-broken"]')).not.toBeNull();
  });
});
