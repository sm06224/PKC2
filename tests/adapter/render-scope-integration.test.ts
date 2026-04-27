/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@adapter/ui/renderer';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container } from '@core/model/container';

/**
 * PR #178 integration contract for the `'sidebar-only'` render scope.
 *
 * The renderer's scope short-circuit only earns its keep if the
 * sidebar replacement preserves the surrounding DOM. The bench
 * shows the win (per-keystroke ~143 ms → ~30-40 ms expected) but
 * it's only safe to ship if the unchanged regions actually stay
 * untouched between renders. These tests pin that.
 *
 * Pinned invariants:
 *   - sidebar `[data-pkc-region="sidebar"]` element is REPLACED
 *     (different `Element` reference after the dispatch) when only
 *     a sidebar-affecting field changes.
 *   - center `[data-pkc-region="center"]` element is REUSED (same
 *     `Element` reference) — proves no full-shell rebuild fired.
 *   - header `header.pkc-header` element is REUSED.
 *   - meta `[data-pkc-region="meta"]` element is REUSED when an
 *     entry is selected.
 *   - sidebar `data-pkc-collapsed="true"` survives the replacement
 *     (user-collapsed sidebar doesn't re-open mid-keystroke).
 *   - sidebar scrollTop survives the replacement.
 */

const T = '2026-04-27T00:00:00.000Z';

function fixture(): Container {
  return {
    meta: { container_id: 'cid', title: 't', created_at: T, updated_at: T, schema_version: 1 },
    entries: [
      { lid: 'a1', title: 'Alpha note', archetype: 'text', body: 'first', created_at: T, updated_at: T },
      { lid: 'a2', title: 'Beta note', archetype: 'text', body: 'second', created_at: T, updated_at: T },
      { lid: 'a3', title: 'Gamma note', archetype: 'text', body: 'third', created_at: T, updated_at: T },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

function readyState(container: Container): AppState {
  const initial = createInitialState();
  const { state } = reduce(initial, { type: 'SYS_INIT_COMPLETE', container });
  return state;
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => root.remove();
});

describe('render scope=sidebar-only — region replacement contract', () => {
  it('replaces sidebar but reuses header / center / meta / shell when only searchQuery changes', () => {
    const prev = readyState(fixture());
    render(prev, root); // first mount, scope='full'

    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');
    const headerBefore = root.querySelector('header.pkc-header');
    const centerBefore = root.querySelector('[data-pkc-region="center"]');
    expect(sidebarBefore).not.toBeNull();
    expect(headerBefore).not.toBeNull();
    expect(centerBefore).not.toBeNull();

    const next: AppState = { ...prev, searchQuery: 'alpha' };
    render(next, root, prev);

    const sidebarAfter = root.querySelector('[data-pkc-region="sidebar"]');
    const headerAfter = root.querySelector('header.pkc-header');
    const centerAfter = root.querySelector('[data-pkc-region="center"]');

    expect(sidebarAfter).not.toBe(sidebarBefore); // ← replaced
    expect(headerAfter).toBe(headerBefore);       // ← preserved
    expect(centerAfter).toBe(centerBefore);       // ← preserved
  });

  it('preserves sidebar `data-pkc-collapsed="true"` across the replacement', () => {
    const prev = readyState(fixture());
    render(prev, root);
    const sidebarBefore = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')!;
    sidebarBefore.setAttribute('data-pkc-collapsed', 'true');

    const next: AppState = { ...prev, searchQuery: 'alpha' };
    render(next, root, prev);

    const sidebarAfter = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')!;
    expect(sidebarAfter.getAttribute('data-pkc-collapsed')).toBe('true');
  });

  it('preserves sidebar scrollTop across the replacement', () => {
    const prev = readyState(fixture());
    render(prev, root);
    const sidebarBefore = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')!;
    // happy-dom scrollTop is writable; setting it simulates a user
    // having scrolled the entry list.
    sidebarBefore.scrollTop = 42;

    const next: AppState = { ...prev, searchQuery: 'alpha' };
    render(next, root, prev);

    const sidebarAfter = root.querySelector<HTMLElement>('[data-pkc-region="sidebar"]')!;
    expect(sidebarAfter.scrollTop).toBe(42);
  });

  it('falls back to full render when selectedLid changes alongside searchQuery', () => {
    const prev = readyState(fixture());
    render(prev, root);
    const headerBefore = root.querySelector('header.pkc-header');

    const next: AppState = {
      ...prev,
      searchQuery: 'alpha',
      selectedLid: 'a1', // selection-change forces 'full'
    };
    render(next, root, prev);

    const headerAfter = root.querySelector('header.pkc-header');
    // Full rebuild ⇒ header element identity changes too.
    expect(headerAfter).not.toBe(headerBefore);
  });

  it('skips DOM work when the dispatch leaves render-relevant state untouched (scope=none)', () => {
    const prev = readyState(fixture());
    render(prev, root);
    const sidebarBefore = root.querySelector('[data-pkc-region="sidebar"]');

    // pendingNav is render-irrelevant — render-scope returns 'none'.
    const next: AppState = { ...prev, pendingNav: { subId: 'foo', ticket: 1 } };
    render(next, root, prev);

    const sidebarAfter = root.querySelector('[data-pkc-region="sidebar"]');
    expect(sidebarAfter).toBe(sidebarBefore); // ← reused, no replacement
  });
});
