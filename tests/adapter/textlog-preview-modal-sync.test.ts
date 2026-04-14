/**
 * @vitest-environment happy-dom
 *
 * UI singleton audit final pass (2026-04-13):
 * renderer-driven auto-close for the TEXTLOG → TEXT preview modal.
 *
 * Existing singleton close paths (Escape, cancel / confirm buttons,
 * cancel-textlog-selection action, open-another, action-binder
 * teardown) already covered the common user flows. The gap this
 * file pins is the reducer-driven teardown: when `textlogSelection`
 * clears in AppState (SELECT_ENTRY to a different lid, BEGIN_EDIT,
 * DELETE_ENTRY of the source, SYS_IMPORT_COMPLETE), the modal's
 * module-local `activeModal` pointer must collapse in lock-step.
 *
 * Also verifies the orphan-detach case: if the renderer's
 * `root.innerHTML = ''` has detached the overlay but reducer state
 * still holds the selection, the sync helper still cleans the
 * dangling pointer.
 *
 * Scope discipline:
 *   - No reducer / AppState / action changes under test.
 *   - No production changes to other singletons.
 *   - Every assertion is scoped to `textlog-preview-modal`; the
 *     TEXT → TEXTLOG modal (P1-1) is checked only in the negative
 *     ("sync did not affect it").
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { __resetSelectionStateForTest } from '@adapter/ui/textlog-selection';
import {
  isTextlogPreviewModalOpen,
  openTextlogPreviewModal,
  closeTextlogPreviewModal,
  getTextlogPreviewTitle,
  getTextlogPreviewBody,
} from '@adapter/ui/textlog-preview-modal';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';

registerPresenter('textlog', textlogPresenter);

const T = '2026-04-13T00:00:00Z';

const baseContainer: Container = {
  meta: {
    container_id: 'c',
    title: 'T',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    {
      lid: 'tl1',
      title: 'Log 1',
      body: serializeTextlogBody({
        entries: [
          { id: 'a', text: 'alpha', createdAt: '2026-04-09T10:00:00', flags: [] },
          { id: 'b', text: 'beta', createdAt: '2026-04-09T11:00:00', flags: [] },
        ],
      }),
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'tl2',
      title: 'Log 2',
      body: serializeTextlogBody({
        entries: [
          { id: 'x', text: 'xray', createdAt: '2026-04-09T12:00:00', flags: [] },
        ],
      }),
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'tx1',
      title: 'Text 1',
      body: '# text doc',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

const _trackedUnsubs: (() => void)[] = [];
function createDispatcher() {
  const d = _createRawDispatcher();
  return {
    ...d,
    onState(listener: Parameters<typeof d.onState>[0]) {
      const unsub = d.onState(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
    onEvent(listener: Parameters<typeof d.onEvent>[0]) {
      const unsub = d.onEvent(listener);
      _trackedUnsubs.push(unsub);
      return unsub;
    },
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;

/** Bootstrap: render initial state, bind actions, select tl1, put
 *  the TEXTLOG into selection mode with one log checked, then open
 *  the preview modal against that selection. Returns the dispatcher
 *  so each test can drive follow-up state changes. */
function bootstrapWithOpenPreview(sourceLid: 'tl1' | 'tl2' = 'tl1') {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: sourceLid });
  dispatcher.dispatch({ type: 'BEGIN_TEXTLOG_SELECTION', lid: sourceLid });
  dispatcher.dispatch({
    type: 'TOGGLE_TEXTLOG_LOG_SELECTION',
    logId: sourceLid === 'tl1' ? 'a' : 'x',
  });

  // Mount the preview modal directly — we're testing the sync
  // reaction, not the action-binder's wiring to open it.
  openTextlogPreviewModal(root, {
    title: 'Preview',
    body: 'preview body markdown',
    emittedCount: 1,
    skippedEmptyCount: 0,
    sourceLid,
  });
  expect(isTextlogPreviewModalOpen()).toBe(true);

  return { dispatcher };
}

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  __resetSelectionStateForTest();
  closeTextlogPreviewModal();
  return () => {
    cleanup?.();
    cleanup = undefined;
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
    __resetSelectionStateForTest();
    closeTextlogPreviewModal();
  };
});

// ════════════════════════════════════════════════════════════════════
// Core 6 cases — reducer-driven auto-close + orphan detach cleanup.
// ════════════════════════════════════════════════════════════════════

describe('textlog-preview-modal sync — reducer-driven auto-close', () => {
  it('(1) SELECT_ENTRY to a different lid tears down the preview modal', () => {
    const { dispatcher } = bootstrapWithOpenPreview('tl1');
    // SELECT_ENTRY tl2 — P1-1 clears textlogSelection because
    // the active lid changes → sync closes the modal.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl2' });
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('(2) BEGIN_EDIT clears the preview modal', () => {
    const { dispatcher } = bootstrapWithOpenPreview('tl1');
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'tl1' });
    // BEGIN_EDIT in P1-1 nulls textlogSelection.
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('(3) DELETE_ENTRY of the source textlog clears the preview modal', () => {
    const { dispatcher } = bootstrapWithOpenPreview('tl1');
    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: 'tl1' });
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('(4) SYS_IMPORT_COMPLETE clears the preview modal', () => {
    const { dispatcher } = bootstrapWithOpenPreview('tl1');
    const otherContainer: Container = {
      ...baseContainer,
      meta: { ...baseContainer.meta, container_id: 'c2', title: 'T2' },
      entries: [],
    };
    dispatcher.dispatch({ type: 'SYS_IMPORT_COMPLETE', container: otherContainer, source: 'test' });
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('(5) same-lid SELECT_ENTRY preserves the reducer selection — sync rule (1) does NOT fire', () => {
    // The existing renderer's `root.innerHTML = ''` detaches the
    // overlay visually on every render — that is the pre-audit
    // behaviour and not something this sync is trying to change.
    // What we assert here is that the CLOSURE is caused by the
    // orphan-detach rule (2), NOT by the selection-gone rule (1):
    // the reducer's `textlogSelection` must still carry the same
    // `activeLid` and selected ids after a same-lid SELECT_ENTRY.
    //
    // This is the P1-1 regression guard expressed from the preview
    // modal's side: if rule (1) ever starts firing on same-lid
    // SELECT_ENTRY, it means the P1-1 clear semantics got tightened
    // in a way that would also wipe the user's selection, which
    // would be a larger regression.
    const { dispatcher } = bootstrapWithOpenPreview('tl1');
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    const s = dispatcher.getState();
    expect(s.textlogSelection).not.toBeNull();
    expect(s.textlogSelection!.activeLid).toBe('tl1');
    expect(s.textlogSelection!.selectedLogIds).toEqual(['a']);
  });

  it('(6) orphan detach is auto-swept on the next render', () => {
    // Bootstrap WITHOUT binding onState → render — so the reducer
    // does not force a render. Then manually detach the overlay
    // and invoke render again to see that sync cleans the stale
    // pointer.
    //
    // To set this up, we drive state by hand: init + selection,
    // mount the modal, then wipe root.innerHTML as the renderer
    // would, then call render() directly. Because textlogSelection
    // is still non-null (we did not dispatch SELECT_ENTRY/etc.),
    // the FIRST sync rule does not fire — only the `!isConnected`
    // rule can clean this up.
    const dispatcher = createDispatcher();
    // No onState→render binding — we drive render() manually so we
    // can interpose the wipe.
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    dispatcher.dispatch({ type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' });
    dispatcher.dispatch({ type: 'TOGGLE_TEXTLOG_LOG_SELECTION', logId: 'a' });
    render(dispatcher.getState(), root);
    openTextlogPreviewModal(root, {
      title: 'Orphan',
      body: 'will be detached',
      emittedCount: 1,
      skippedEmptyCount: 0,
      sourceLid: 'tl1',
    });
    expect(isTextlogPreviewModalOpen()).toBe(true);
    // Manually detach the overlay — simulates a renderer-driven
    // `root.innerHTML = ''` without a reducer state change.
    root.innerHTML = '';
    // `activeModal` is still non-null from the module's POV.
    expect(isTextlogPreviewModalOpen()).toBe(true);
    // Running render() again invokes sync; state still has
    // textlogSelection so rule (1) does NOT fire, but rule (2)
    // (`!isConnected`) clears the stale pointer.
    render(dispatcher.getState(), root);
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// Regression guards — existing close paths must keep working.
// ════════════════════════════════════════════════════════════════════

describe('textlog-preview-modal sync — regression guards', () => {
  it('existing closeTextlogPreviewModal() helper still works (explicit close)', () => {
    const _ = bootstrapWithOpenPreview('tl1');
    expect(isTextlogPreviewModalOpen()).toBe(true);
    closeTextlogPreviewModal();
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('sync never OPENS a modal — it only closes', () => {
    // Fresh state, no selection, no open modal. Running render
    // (which internally calls sync) must not magically mount a
    // preview overlay.
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    dispatcher.dispatch({ type: 'BEGIN_TEXTLOG_SELECTION', lid: 'tl1' });
    expect(isTextlogPreviewModalOpen()).toBe(false);
    // Render cycles should not open the modal out of thin air.
    render(dispatcher.getState(), root);
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });

  it('sync does not affect the TEXT → TEXTLOG modal (P1-1 path remains orthogonal)', () => {
    // Open the TEXT → TEXTLOG modal via the reducer. Sync for the
    // TEXTLOG-preview modal must leave this overlay untouched —
    // the two modals are independent singletons and different
    // render-side syncs own them.
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tx1' });
    dispatcher.dispatch({ type: 'OPEN_TEXT_TO_TEXTLOG_MODAL', sourceLid: 'tx1' });
    // The TEXT→TEXTLOG modal is mounted via its own sync.
    expect(root.querySelector('[data-pkc-region="text-to-textlog-overlay"]')).not.toBeNull();
    // No TEXTLOG-preview modal around.
    expect(isTextlogPreviewModalOpen()).toBe(false);
    // Trigger a second render — sync must not disturb the other
    // modal.
    render(dispatcher.getState(), root);
    expect(root.querySelector('[data-pkc-region="text-to-textlog-overlay"]')).not.toBeNull();
  });

  it('preview == commit invariant: in the open window, body / title read from DOM', () => {
    // The preview modal's DOM is the authoritative source for the
    // title input + body `<pre>`. While mounted (no intervening
    // render), reading the DOM returns exactly what was passed to
    // `openTextlogPreviewModal`. This is the foundation of the
    // "preview == commit" contract — the confirm handler reads
    // from the same DOM it displays.
    //
    // This test exercises the invariant in its pure form, without
    // dispatching state changes that would tear down the modal via
    // renderer-driven detach.
    openTextlogPreviewModal(root, {
      title: 'Preview Title',
      body: '# Preview body markdown',
      emittedCount: 2,
      skippedEmptyCount: 0,
      sourceLid: 'tl1',
    });
    expect(isTextlogPreviewModalOpen()).toBe(true);
    // These are the functions that `confirm-textlog-to-text` reads.
    expect(getTextlogPreviewTitle()).toBe('Preview Title');
    expect(getTextlogPreviewBody()).toBe('# Preview body markdown');
  });

  it('sync is idempotent — repeated render() while closed is a no-op', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
    render(dispatcher.getState(), root);
    // No modal open. Run render() several more times.
    render(dispatcher.getState(), root);
    render(dispatcher.getState(), root);
    render(dispatcher.getState(), root);
    expect(isTextlogPreviewModalOpen()).toBe(false);
  });
});
