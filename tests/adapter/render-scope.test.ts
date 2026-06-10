/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import { SETTINGS_DEFAULTS } from '@core/model/system-settings-payload';

/**
 * PR #177 scope-detection contract.
 *
 * Cases listed in the order the renderer's main.ts subscriber will
 * encounter them at boot:
 *
 *   1. First mount (`prev === null`)             → 'full'
 *   2. Identity-equal (`prev === state`)         → 'none'
 *   3. RESTORE_SETTINGS hydrates settings null → defaults → 'settings-only'
 *      (the cold-boot dominator the bench surfaced)
 *   4. Any other field-level diff                → 'full'
 *
 * Conservative-by-default: when in doubt, 'full'. Misclassifying
 * a delta as 'settings-only' or 'none' could leave the UI stale.
 */

function withChange(base: AppState, mutate: (s: AppState) => AppState): AppState {
  return mutate({ ...base });
}

describe('computeRenderScope', () => {
  it('returns "full" on first mount (prev null)', () => {
    expect(computeRenderScope(createInitialState(), null)).toBe('full');
  });

  it('returns "none" when state and prev are identity-equal', () => {
    const s = createInitialState();
    expect(computeRenderScope(s, s)).toBe('none');
  });

  it('returns "settings-only" when only `settings` changed (cold-boot RESTORE_SETTINGS)', () => {
    const prev = createInitialState();
    expect(prev.settings).toBeUndefined();
    const next = withChange(prev, (s) => ({ ...s, settings: SETTINGS_DEFAULTS }));
    expect(computeRenderScope(next, prev)).toBe('settings-only');
  });

  it('returns "settings-only" when only `showScanline` mirror flips', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, showScanline: true }));
    expect(computeRenderScope(next, prev)).toBe('settings-only');
  });

  it('returns "settings-only" when only `accentColor` mirror flips', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, accentColor: '#abcdef' }));
    expect(computeRenderScope(next, prev)).toBe('settings-only');
  });

  it('returns "full" when phase changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, phase: 'ready' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when only editMode changes (inline/window picker toggle)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, editMode: 'window' as const }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when only metaPaneMode changes (meta-pane tab toggle)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, metaPaneMode: 'properties' as const }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when only childWindowLids changes (SYS_SYNC_CHILD_WINDOWS forces pane rebuild)', () => {
    const prev = createInitialState();
    // togglePane dispatches SYS_SYNC_CHILD_WINDOWS to force a full render that
    // rebuilds the lazy-placeholder sidebar on expand — must not be 'none'.
    const next = withChange(prev, (s) => ({ ...s, childWindowLids: ['e1'] }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when container reference changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      container: {
        meta: { container_id: 'c', title: 't', created_at: 'T', updated_at: 'T', schema_version: 1 },
        entries: [],
        relations: [],
        revisions: [],
        assets: {},
      },
    }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "selection" when ONLY selectedLid changes (L1 #693)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1' }));
    expect(computeRenderScope(next, prev)).toBe('selection');
  });

  it('returns "selection" when selectedLid changes and multiSelectedLids stays empty (SELECT_ENTRY clears it)', () => {
    const prev = createInitialState();
    // SELECT_ENTRY always emits a fresh empty multiSelectedLids array.
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1', multiSelectedLids: [] }));
    expect(computeRenderScope(next, prev)).toBe('selection');
  });

  it('returns "full" when selectedLid changes while a multi-select bar is showing (transition)', () => {
    const prev = withChange(createInitialState(), (s) => ({ ...s, multiSelectedLids: ['x'] }));
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1', multiSelectedLids: [] }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when selectedLid changes alongside collapsedFolders (reveal jump needs tree rebuild)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1', collapsedFolders: ['fld'] }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "sidebar-only" when only searchQuery changes (PR #178)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, searchQuery: 'meeting' }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "sidebar-only" when only archetypeFilter Set reference changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, archetypeFilter: new Set(['text']) }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "sidebar-only" when only sortKey changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, sortKey: 'updated_at' }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "sidebar-only" when only collapsedFolders array reference changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, collapsedFolders: ['fld'] }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "sidebar-only" when only treeHideBuckets toggle flips', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, treeHideBuckets: false }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "sidebar-only" when both searchQuery and archetypeFilter change in the same dispatch', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      searchQuery: 'meeting',
      archetypeFilter: new Set(['text']),
    }));
    expect(computeRenderScope(next, prev)).toBe('sidebar-only');
  });

  it('returns "full" when sidebar-only field combines with selectedLid (a non-sidebar field)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      searchQuery: 'meeting',
      selectedLid: 'e1',
    }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when sidebar-only AND settings change in the same dispatch', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      searchQuery: 'meeting',
      settings: SETTINGS_DEFAULTS,
    }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when viewMode changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, viewMode: 'kanban' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });


  it('returns "none" when only render-irrelevant fields differ (textlogSelection structural sameness)', () => {
    const prev = createInitialState();
    // textlogSelection IS in the render-affecting list (full-render
    // bucket). When prev and next have the same null reference, no
    // change → 'none'.
    expect(computeRenderScope(prev, prev)).toBe('none');
  });

  it('returns "full" when textlogSelection identity changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      textlogSelection: { activeLid: 'tl', selectedLogIds: [] },
    }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });
});
