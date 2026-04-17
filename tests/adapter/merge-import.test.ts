/** @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest';
import { createInitialState, reduce } from '@adapter/state/app-state';
import type { AppState } from '@adapter/state/app-state';
import type { Container, ContainerMeta } from '@core/model/container';
import type { Entry } from '@core/model/record';
import type { ImportPreviewRef } from '@core/action/system-command';
import { createDispatcher } from '@adapter/state/dispatcher';
import { bindActions } from '@adapter/ui/action-binder';
import { render } from '@adapter/ui/renderer';

/**
 * Tier 3-1 — merge import (Overlay MVP) tests.
 *
 * Three layers:
 *
 *   1. Reducer (CONFIRM_MERGE_IMPORT / SET_IMPORT_MODE / CANCEL_IMPORT
 *      reset semantics).
 *   2. Integration (full merge round-trip applied via dispatch).
 *   3. UI (mode radio, summary counts, confirm button routing).
 *
 * Fixtures kept minimal — the planner already owns the deep remap
 * coverage; here we verify that the reducer wires planner output
 * through the state transition and event stream.
 */

const NOW = '2026-04-14T12:00:00.000Z';

function makeMeta(over: Partial<ContainerMeta> = {}): ContainerMeta {
  return {
    container_id: 'host-cid',
    title: 'Host',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    schema_version: 1,
    ...over,
  };
}

function makeEntry(lid: string, body = '', over: Partial<Entry> = {}): Entry {
  return {
    lid,
    title: `Entry ${lid}`,
    body,
    archetype: 'text',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...over,
  };
}

function makeContainer(over: Partial<Container> = {}): Container {
  return {
    meta: makeMeta(over.meta),
    entries: over.entries ?? [],
    relations: over.relations ?? [],
    revisions: over.revisions ?? [],
    assets: over.assets ?? {},
  };
}

function previewOf(container: Container, source = 'test.zip'): ImportPreviewRef {
  return {
    title: container.meta.title,
    container_id: container.meta.container_id,
    entry_count: container.entries.length,
    revision_count: container.revisions.length,
    schema_version: container.meta.schema_version,
    source,
    container,
  };
}

function readyStateWithHostAndPreview(
  host: Container,
  imported: Container,
  mode: 'replace' | 'merge' = 'merge',
): AppState {
  return {
    ...createInitialState(),
    phase: 'ready',
    container: host,
    importPreview: previewOf(imported),
    importMode: mode,
  };
}

// ── Reducer layer ─────────────────────────────────

describe('SET_IMPORT_MODE', () => {
  it('switches importMode from replace to merge', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({ meta: makeMeta({ container_id: 'imp' }), entries: [makeEntry('i1')] });
    const { state } = reduce(readyStateWithHostAndPreview(host, imp, 'replace'), {
      type: 'SET_IMPORT_MODE',
      mode: 'merge',
    });
    expect(state.importMode).toBe('merge');
  });

  it('is a no-op when no import preview exists', () => {
    const { state } = reduce({ ...createInitialState(), phase: 'ready' }, {
      type: 'SET_IMPORT_MODE',
      mode: 'merge',
    });
    // blocked → state unchanged, importMode stays 'replace' default.
    expect(state.importMode ?? 'replace').toBe('replace');
  });
});

describe('CONFIRM_MERGE_IMPORT', () => {
  it('appends imported entries to host without touching host entries', () => {
    const host = makeContainer({ entries: [makeEntry('h1', 'host body')] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'imp body')],
    });
    const { state, events } = reduce(readyStateWithHostAndPreview(host, imp), {
      type: 'CONFIRM_MERGE_IMPORT',
      now: NOW,
    });
    expect(state.container!.entries.length).toBe(2);
    expect(state.container!.entries[0]!.lid).toBe('h1');
    expect(state.container!.entries[1]!.lid).toBe('i1');
    expect(state.importPreview).toBeNull();
    expect(state.importMode ?? 'replace').toBe('replace');
    expect(state.phase).toBe('ready');
    // CONTAINER_MERGED event with counts
    const merged = events.find((e) => e.type === 'CONTAINER_MERGED');
    expect(merged).toBeDefined();
    expect(merged).toMatchObject({
      type: 'CONTAINER_MERGED',
      container_id: 'host-cid',
      source: 'test.zip',
      added_entries: 1,
    });
  });

  it('is blocked when preview is missing', () => {
    const base = { ...createInitialState(), phase: 'ready' as const, container: makeContainer() };
    const { state } = reduce(base, { type: 'CONFIRM_MERGE_IMPORT', now: NOW });
    expect(state).toEqual(base);
  });

  it('is blocked on schema-mismatch (host container stays intact)', () => {
    const host = makeContainer({ meta: makeMeta({ schema_version: 1 }) });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp', schema_version: 2 }),
      entries: [makeEntry('i1')],
    });
    const pre = readyStateWithHostAndPreview(host, imp);
    const { state } = reduce(pre, { type: 'CONFIRM_MERGE_IMPORT', now: NOW });
    // blocked → importPreview still present, container unchanged
    expect(state.importPreview).not.toBeNull();
    expect(state.container!.entries).toEqual(host.entries);
  });

  it('does not emit CONTAINER_IMPORTED (replace event is separate)', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({ meta: makeMeta({ container_id: 'imp' }), entries: [makeEntry('i1')] });
    const { events } = reduce(readyStateWithHostAndPreview(host, imp), {
      type: 'CONFIRM_MERGE_IMPORT',
      now: NOW,
    });
    expect(events.some((e) => e.type === 'CONTAINER_IMPORTED')).toBe(false);
    expect(events.some((e) => e.type === 'CONTAINER_MERGED')).toBe(true);
  });
});

describe('CONFIRM_IMPORT regression (replace path unchanged)', () => {
  it('still performs full replace even when importMode was left at merge', () => {
    // Defensive: CONFIRM_IMPORT ignores importMode entirely — the two
    // reducer paths are cleanly separated.
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp-cid' }),
      entries: [makeEntry('i1')],
    });
    const pre = readyStateWithHostAndPreview(host, imp, 'merge');
    const { state, events } = reduce(pre, { type: 'CONFIRM_IMPORT' });
    // replaced by imported container (full replace)
    expect(state.container!.meta.container_id).toBe('imp-cid');
    expect(state.container!.entries.length).toBe(1);
    expect(state.container!.entries[0]!.lid).toBe('i1');
    expect(events.some((e) => e.type === 'CONTAINER_IMPORTED')).toBe(true);
  });
});

describe('CANCEL_IMPORT resets importMode', () => {
  it('clears importPreview and resets importMode to replace', () => {
    const host = makeContainer();
    const imp = makeContainer({ meta: makeMeta({ container_id: 'imp' }), entries: [makeEntry('i1')] });
    const pre = readyStateWithHostAndPreview(host, imp, 'merge');
    const { state } = reduce(pre, { type: 'CANCEL_IMPORT' });
    expect(state.importPreview).toBeNull();
    expect(state.importMode ?? 'replace').toBe('replace');
  });
});

// ── Integration layer ──────────────────────────────

describe('merge import integration', () => {
  it('merges asset with matching content as dedupe + renames lid on collision', () => {
    const host = makeContainer({
      // host body references 'shared' so post-merge orphan-GC keeps it
      entries: [makeEntry('e1', '![](asset:shared)')],
      assets: { 'shared': 'ASSET-BYTES' },
    });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [
        makeEntry('e1', 'collision'), // lid 'e1' collides with host
        makeEntry('fresh', 'imported only'),
      ],
      assets: { 'shared': 'ASSET-BYTES' }, // same content → dedupe
    });
    const pre = readyStateWithHostAndPreview(host, imp);
    const { state, events } = reduce(pre, { type: 'CONFIRM_MERGE_IMPORT', now: NOW });
    const c = state.container!;
    // Host entry untouched
    expect(c.entries[0]).toEqual(host.entries[0]);
    // Imported 'e1' was renamed
    const renamedImport = c.entries.find((e) => e.body === 'collision')!;
    expect(renamedImport.lid).not.toBe('e1');
    // Asset deduplicated (one key, not two)
    expect(Object.keys(c.assets)).toEqual(['shared']);
    // Event counts
    const merged = events.find((e) => e.type === 'CONTAINER_MERGED')!;
    expect(merged).toMatchObject({ added_entries: 2 });
  });

  it('merge does NOT duplicate when called twice with same imported content', () => {
    // Simulates user hitting "merge" twice with same source — no
    // dedup based on content identity; every entry gets a fresh lid
    // (append semantics, I-Merge1).
    const host = makeContainer();
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'hello')],
    });

    let state: AppState = readyStateWithHostAndPreview(host, imp);
    let result = reduce(state, { type: 'CONFIRM_MERGE_IMPORT', now: NOW });
    state = result.state;
    expect(state.container!.entries.length).toBe(1);

    // Second merge — set up preview again with the SAME imported container.
    state = { ...state, importPreview: previewOf(imp), importMode: 'merge' };
    result = reduce(state, {
      type: 'CONFIRM_MERGE_IMPORT',
      now: '2026-04-14T12:00:01.000Z',
    });
    state = result.state;
    // Now 2 entries — second one got renamed (i1 already in host-space).
    expect(state.container!.entries.length).toBe(2);
    const renamed = state.container!.entries[1]!;
    expect(renamed.lid).not.toBe('i1');
  });

  it('merge auto-purges orphan assets on apply (I-AutoGC1 extension)', () => {
    // Imported carries an orphan asset. After merge it should be gone.
    const host = makeContainer();
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'no refs')],
      assets: { 'orphan-xyz': 'ORPHAN' },
    });
    const pre = readyStateWithHostAndPreview(host, imp);
    const { state, events } = reduce(pre, { type: 'CONFIRM_MERGE_IMPORT', now: NOW });
    expect(state.container!.assets['orphan-xyz']).toBeUndefined();
    expect(events.some((e) => e.type === 'ORPHAN_ASSETS_PURGED')).toBe(true);
  });
});

// ── UI layer ─────────────────────────────────────

function render_helper(state: AppState): HTMLElement {
  const root = document.createElement('div');
  render(state, root);
  return root;
}

describe('renderer — import preview dialog (mode radio + summary)', () => {
  it('renders mode radio group with replace selected by default', () => {
    const host = makeContainer();
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1')],
    });
    const state = readyStateWithHostAndPreview(host, imp, 'replace');
    const root = render_helper(state);
    const group = root.querySelector('[data-pkc-region="import-mode"]')!;
    expect(group).toBeTruthy();
    const replaceBtn = root.querySelector(
      '[data-pkc-action="set-import-mode"][data-pkc-mode="replace"]',
    ) as HTMLElement;
    const mergeBtn = root.querySelector(
      '[data-pkc-action="set-import-mode"][data-pkc-mode="merge"]',
    ) as HTMLElement;
    expect(replaceBtn.getAttribute('aria-checked')).toBe('true');
    expect(mergeBtn.getAttribute('aria-checked')).toBe('false');
    const confirm = root.querySelector('[data-pkc-action="confirm-import"]');
    expect(confirm).toBeTruthy();
  });

  it('when mode=merge, shows merge summary with 5 rows and merge confirm button', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1'), makeEntry('i2')],
    });
    const state = readyStateWithHostAndPreview(host, imp, 'merge');
    const root = render_helper(state);
    const summary = root.querySelector('[data-pkc-region="import-summary"]')!;
    const rows = summary.querySelectorAll('.pkc-import-row');
    expect(rows.length).toBe(5);
    const confirm = root.querySelector('[data-pkc-action="confirm-merge-import"]');
    expect(confirm).toBeTruthy();
    // Replace confirm no longer present.
    expect(root.querySelector('[data-pkc-action="confirm-import"]')).toBeNull();
  });

  it('disables merge confirm when schema versions mismatch', () => {
    const host = makeContainer({ meta: makeMeta({ schema_version: 1 }) });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp', schema_version: 2 }),
      entries: [makeEntry('i1')],
    });
    const state = readyStateWithHostAndPreview(host, imp, 'merge');
    const root = render_helper(state);
    const confirm = root.querySelector(
      '[data-pkc-action="confirm-merge-import"]',
    ) as HTMLButtonElement;
    expect(confirm.getAttribute('disabled')).toBe('true');
  });

  it('mode radio click dispatches SET_IMPORT_MODE, triggering re-render with merge summary', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1')],
    });
    const dispatcher = createDispatcher();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const unsub = dispatcher.onState((s) => render(s, root));
    // Boot dispatcher into a ready state with a preview in replace mode.
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: host });
    dispatcher.dispatch({ type: 'SYS_IMPORT_PREVIEW', preview: previewOf(imp) });
    bindActions(root, dispatcher);
    render(dispatcher.getState(), root);
    try {
      const mergeBtn = root.querySelector(
        '[data-pkc-action="set-import-mode"][data-pkc-mode="merge"]',
      ) as HTMLElement;
      mergeBtn.click();
      expect(dispatcher.getState().importMode).toBe('merge');
      // After re-render, merge confirm should now be present.
      expect(root.querySelector('[data-pkc-action="confirm-merge-import"]')).toBeTruthy();
    } finally {
      unsub();
      document.body.removeChild(root);
    }
  });
});

describe('action-binder — confirm-merge-import routes correctly', () => {
  it('clicking the merge confirm dispatches CONFIRM_MERGE_IMPORT with a now timestamp', () => {
    const host = makeContainer({ entries: [makeEntry('h1')] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1')],
    });
    const dispatcher = createDispatcher();
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: host });
    dispatcher.dispatch({ type: 'SYS_IMPORT_PREVIEW', preview: previewOf(imp) });
    dispatcher.dispatch({ type: 'SET_IMPORT_MODE', mode: 'merge' });
    bindActions(root, dispatcher);
    render(dispatcher.getState(), root);
    const dispatchSpy = vi.spyOn(dispatcher, 'dispatch');
    try {
      const btn = root.querySelector(
        '[data-pkc-action="confirm-merge-import"]',
      ) as HTMLElement;
      btn.click();
      const confirmCalls = dispatchSpy.mock.calls.filter(
        (c) => (c[0] as { type: string }).type === 'CONFIRM_MERGE_IMPORT',
      );
      expect(confirmCalls.length).toBe(1);
      const payload = confirmCalls[0]![0] as { type: string; now: string };
      expect(typeof payload.now).toBe('string');
      expect(payload.now.length).toBeGreaterThan(0);
    } finally {
      document.body.removeChild(root);
    }
  });
});

describe('action-binder — conflict detection on mode=merge (H-10 audit)', () => {
  it('detects conflicts and dispatches SET_MERGE_CONFLICTS when switching to merge', () => {
    const host = makeContainer({ entries: [makeEntry('h1', 'x', { title: 'Report' })] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'x', { title: 'Report' })],
    });
    const dispatcher = createDispatcher();
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: host });
    dispatcher.dispatch({ type: 'SYS_IMPORT_PREVIEW', preview: previewOf(imp) });
    bindActions(root, dispatcher);
    render(dispatcher.getState(), root);
    try {
      const mergeBtn = root.querySelector(
        '[data-pkc-action="set-import-mode"][data-pkc-mode="merge"]',
      ) as HTMLElement;
      mergeBtn.click();
      const st = dispatcher.getState();
      expect(st.importMode).toBe('merge');
      expect(st.mergeConflicts).toBeDefined();
      expect(st.mergeConflicts!.length).toBe(1);
      expect(st.mergeConflictResolutions!['i1']).toBe('keep-current');
      const region = root.querySelector('[data-pkc-region="merge-conflicts"]');
      expect(region).not.toBeNull();
    } finally {
      document.body.removeChild(root);
    }
  });

  it('does not dispatch SET_MERGE_CONFLICTS when schema mismatches (I-MergeUI8)', () => {
    const host = makeContainer({
      meta: makeMeta({ schema_version: 1 }),
      entries: [makeEntry('h1', 'x', { title: 'Report' })],
    });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp', schema_version: 2 }),
      entries: [makeEntry('i1', 'x', { title: 'Report' })],
    });
    const dispatcher = createDispatcher();
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: host });
    dispatcher.dispatch({ type: 'SYS_IMPORT_PREVIEW', preview: previewOf(imp) });
    bindActions(root, dispatcher);
    render(dispatcher.getState(), root);
    try {
      const mergeBtn = root.querySelector(
        '[data-pkc-action="set-import-mode"][data-pkc-mode="merge"]',
      ) as HTMLElement;
      mergeBtn.click();
      const st = dispatcher.getState();
      expect(st.mergeConflicts).toBeUndefined();
      expect(root.querySelector('[data-pkc-region="merge-conflicts"]')).toBeNull();
    } finally {
      document.body.removeChild(root);
    }
  });

  it('does not dispatch SET_MERGE_CONFLICTS when no conflicts exist', () => {
    const host = makeContainer({ entries: [makeEntry('h1', 'x', { title: 'Report' })] });
    const imp = makeContainer({
      meta: makeMeta({ container_id: 'imp' }),
      entries: [makeEntry('i1', 'x', { title: 'UnrelatedTitle' })],
    });
    const dispatcher = createDispatcher();
    const root = document.createElement('div');
    document.body.appendChild(root);
    dispatcher.onState((s) => render(s, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: host });
    dispatcher.dispatch({ type: 'SYS_IMPORT_PREVIEW', preview: previewOf(imp) });
    bindActions(root, dispatcher);
    render(dispatcher.getState(), root);
    try {
      const mergeBtn = root.querySelector(
        '[data-pkc-action="set-import-mode"][data-pkc-mode="merge"]',
      ) as HTMLElement;
      mergeBtn.click();
      const st = dispatcher.getState();
      expect(st.importMode).toBe('merge');
      expect(st.mergeConflicts).toBeUndefined();
      expect(root.querySelector('[data-pkc-region="merge-conflicts"]')).toBeNull();
    } finally {
      document.body.removeChild(root);
    }
  });
});
