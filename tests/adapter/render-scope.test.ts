/** @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import { computeRenderScope } from '@adapter/ui/render-scope';
import { createInitialState } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { SystemSettingsPayload } from '@core/model/system-settings-payload';

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

const SETTINGS_DEFAULTS: SystemSettingsPayload = {
  theme: { mode: 'auto', scanline: false, accentColor: null },
  locale: { language: 'auto', timezone: 'auto' },
};

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

  it('returns "full" when selectedLid changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when searchQuery changes (sidebar-affecting field)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, searchQuery: 'meeting' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when archetypeFilter Set reference changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, archetypeFilter: new Set(['text']) }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when viewMode changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, viewMode: 'kanban' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when treeHideBuckets toggle flips', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, treeHideBuckets: false }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when collapsedFolders array reference changes', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, collapsedFolders: ['fld'] }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when both settings and a sidebar field change in one diff', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      settings: SETTINGS_DEFAULTS,
      searchQuery: 'meeting',
    }));
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
