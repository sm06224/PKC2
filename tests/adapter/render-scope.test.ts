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

  it('returns "selection-only" when selectedLid changes(pgc-208)', () => {
    // pgc-208(user 報告「100エントリ程度で凄まじく動作が重い」):
    // SELECT_ENTRY のみで full rebuild してた pattern を sidebar + center +
    // meta 3 region 差し替えに narrow 化。selectedLid 単独変化で
    // 'selection-only' を返す(以前は 'full')。
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, selectedLid: 'e1' }));
    expect(computeRenderScope(next, prev)).toBe('selection-only');
  });

  // pgc-45:Phase γ stack で追加された AppState field が full-trigger に
  // 未登録だと、当該 field のみ変わる dispatch が 'none' に落ちて再描画
  // されない(編集モード picker 無反応バグの root-cause)。回帰防止。
  it('returns "full" when editMode changes (γ-A2 編集モード picker)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, editMode: 'window' as const }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when childWindowLids changes (γ-A3 マルチウィンドウ)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, childWindowLids: ['e1'] }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when sidebarFilerQuery changes (γ-A1 filer 絞り込み検索)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, sidebarFilerQuery: 'foo' }));
    expect(computeRenderScope(next, prev)).toBe('full');
  });

  it('returns "full" when metaPaneMode changes (γ-B3 meta pane mode tab)', () => {
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({ ...s, metaPaneMode: 'properties' as const }));
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

  it('returns "selection-only" when textlogSelection identity changes(pgc-208)', () => {
    // pgc-208:textlogSelection は SELECT_ENTRY と同 set で mutate される
    // (per-entry transient UI clear-rules、P1-1)。selection-only path
    // で扱う(以前は full)。
    const prev = createInitialState();
    const next = withChange(prev, (s) => ({
      ...s,
      textlogSelection: { activeLid: 'tl', selectedLogIds: [] },
    }));
    expect(computeRenderScope(next, prev)).toBe('selection-only');
  });
});
