/**
 * @vitest-environment happy-dom
 *
 * Split View test(pgc-89、MASTER.md §4.3 / §5.5)。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isSplitViewOpen,
  toggleSplitView,
  closeSplitView,
  getSplitOrientation,
  buildSplitViewElement,
  resetSplitViewState,
} from '../../src/adapter/ui/split-view';
import { setContainerFlagSource } from '../../src/adapter/flags';
import type { Container } from '../../src/core/model/container';
import type { Entry } from '../../src/core/model/record';
import type { AppState } from '../../src/adapter/state/app-state';

function mkEntry(lid: string, title: string, body: string = ''): Entry {
  return { lid, title, body, archetype: 'text', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z' };
}
function mkContainer(entries: Entry[]): Container {
  return {
    meta: { container_id: 't', title: 't', created_at: '2026-05-23T00:00:00Z', updated_at: '2026-05-23T00:00:00Z', schema_version: 1, generator: 't' },
    entries, relations: [], revisions: [], assets: {},
  } as Container;
}
function mkState(c: Container | null, selectedLid: string | null): AppState {
  return { container: c, selectedLid, phase: 'ready' } as AppState;
}

beforeEach(() => {
  resetSplitViewState();
  setContainerFlagSource({ 'shell.split_view_enabled': true });
});

describe('toggle / state', () => {
  it('initially closed', () => {
    expect(isSplitViewOpen()).toBe(false);
  });

  it('toggle opens then closes', () => {
    expect(toggleSplitView('right')).toBe(true);
    expect(isSplitViewOpen()).toBe(true);
    expect(getSplitOrientation()).toBe('right');
    expect(toggleSplitView('right')).toBe(false);
    expect(isSplitViewOpen()).toBe(false);
  });

  it('different orientation switches without closing', () => {
    toggleSplitView('right');
    toggleSplitView('bottom');
    expect(isSplitViewOpen()).toBe(true);
    expect(getSplitOrientation()).toBe('bottom');
  });

  it('closeSplitView force closes', () => {
    toggleSplitView('right');
    closeSplitView();
    expect(isSplitViewOpen()).toBe(false);
  });

  it('flag OFF: toggle is no-op', () => {
    setContainerFlagSource({ 'shell.split_view_enabled': false });
    expect(toggleSplitView('right')).toBe(false);
    expect(isSplitViewOpen()).toBe(false);
  });
});

describe('buildSplitViewElement', () => {
  it('renders aside with split-view region', () => {
    const c = mkContainer([mkEntry('a', 'A', '# Hello')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    expect(el.tagName).toBe('ASIDE');
    expect(el.getAttribute('data-pkc-region')).toBe('split-view');
  });

  it('has close button with toggle-split-view action', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    const close = el.querySelector('.pkc-split-view-close');
    expect(close?.getAttribute('data-pkc-action')).toBe('toggle-split-view');
  });

  it('renders markdown body (heading)', () => {
    const c = mkContainer([mkEntry('a', 'A', '# Hello\n\nWorld')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    const body = el.querySelector('.pkc-split-view-body');
    expect(body?.innerHTML).toContain('<h1');
    expect(body?.textContent).toContain('Hello');
  });

  it('renders plain text fallback for non-markdown body', () => {
    const c = mkContainer([mkEntry('a', 'A', 'plain text content')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    const pre = el.querySelector('.pkc-split-view-body pre');
    expect(pre?.textContent).toBe('plain text content');
  });

  it('shows (empty) when entry body is empty', () => {
    const c = mkContainer([mkEntry('a', 'A', '')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    expect(el.textContent).toContain('(empty)');
  });

  it('shows (no entry selected) when selectedLid is null', () => {
    const c = mkContainer([mkEntry('a', 'A')]);
    const el = buildSplitViewElement(mkState(c, null));
    expect(el.textContent).toContain('(no entry selected)');
  });

  it('shows (no entry selected) when entry not found', () => {
    const c = mkContainer([]);
    const el = buildSplitViewElement(mkState(c, 'missing'));
    expect(el.textContent).toContain('(no entry selected)');
  });

  it('orientation right adds pkc-split-right class', () => {
    toggleSplitView('right');
    const c = mkContainer([mkEntry('a', 'A')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    expect(el.classList.contains('pkc-split-right')).toBe(true);
  });

  it('orientation bottom adds pkc-split-bottom class', () => {
    toggleSplitView('right');
    toggleSplitView('bottom');
    const c = mkContainer([mkEntry('a', 'A')]);
    const el = buildSplitViewElement(mkState(c, 'a'));
    expect(el.classList.contains('pkc-split-bottom')).toBe(true);
  });
});
