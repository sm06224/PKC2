/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import {
  closeDualEditConflictOverlay,
  isDualEditConflictOverlayOpen,
} from '@adapter/ui/dual-edit-conflict-overlay';
import type { Container } from '@core/model/container';
import type { AppState } from '@adapter/state/app-state';

/**
 * FI-01 dual-edit-safety v1 — reject overlay UI slice tests.
 *
 * Contract: `docs/spec/dual-edit-safety-v1-behavior-contract.md` §8.
 *
 * Covers:
 *   - overlay mount when state.dualEditConflict is populated
 *   - default focus on Save as branch
 *   - Save as branch / Discard / Copy dispatches
 *   - clipboard write on Copy
 *   - overlay hidden when conflict is null
 *   - Escape / backdrop click do NOT close
 *   - overlay unmounts after reducer clears the conflict
 *   - non-regression for existing UI surfaces
 */

const T0 = '2026-04-17T00:00:00Z';
const T2 = '2026-04-17T02:00:00Z';

function makeContainer(): Container {
  return {
    meta: {
      container_id: 'test-id',
      title: 'Test',
      created_at: T0,
      updated_at: T0,
      schema_version: 1,
    },
    entries: [
      {
        lid: 'e1', title: 'Title', body: 'original',
        archetype: 'text', created_at: T0, updated_at: T0,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
  };
}

let root: HTMLElement;
let cleanup: (() => void) | undefined;
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

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  for (const fn of _trackedUnsubs) fn();
  _trackedUnsubs.length = 0;
  closeDualEditConflictOverlay();
  root.remove();
});

/** Drive the reducer into "dualEditConflict parked" via BEGIN_EDIT →
 *  racy container bump → COMMIT_EDIT. */
function setupInConflict() {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

  // Force a concurrent-edit race by injecting a bumped container via
  // SYS_INIT_COMPLETE (simpler than going through a transport).
  const bumped: Container = {
    ...makeContainer(),
    entries: [
      {
        lid: 'e1', title: 'Title', body: 'remote',
        archetype: 'text', created_at: T0, updated_at: T2,
      },
    ],
    meta: { ...makeContainer().meta, updated_at: T2 },
  };
  // Swap container in-place: the state slice tests use the same
  // reducer path. We reset phase to 'editing' through BEGIN_EDIT
  // initially, then mutate via a synthetic SYS_INIT_COMPLETE path
  // would reset phase — instead we rely on COMMIT_EDIT itself
  // testing against the CURRENT container, so we use a direct
  // state-mutation via dispatcher internals is not ideal. Instead,
  // we leave phase='editing', but patch the dispatcher's getState
  // to return a bumped container. Simpler: use reduce directly.
  //
  // Pragmatic path: dispatch a SYS_INIT_COMPLETE while already in
  // editing won't do what we want. Use a second path: dispatch
  // BEGIN_EDIT, then rely on the fact that state.editingBase was
  // captured with updated_at=T0. Then simulate the race by
  // *manually* replacing container in dispatcher state via a new
  // SYS_INIT_COMPLETE when phase is editing — this is blocked
  // today. Alternative: we dispatch COMMIT_EDIT with an explicit
  // action.base that forces mismatch.
  dispatcher.dispatch({
    type: 'COMMIT_EDIT', lid: 'e1',
    title: 'My Draft Title',
    body: 'my draft body',
    base: { lid: 'e1', archetype: 'text', updated_at: 'ANCIENT' },
  });
  // Verify conflict is parked.
  const st = dispatcher.getState();
  if (!st.dualEditConflict) throw new Error('expected dualEditConflict to be populated');
  cleanup = bindActions(root, dispatcher);
  // Ignore `bumped` — the overlay uses the base captured via BEGIN_EDIT
  // which was T0, plus the forced-mismatch base override above.
  void bumped;
  return { dispatcher };
}

describe('FI-01 UI slice — mount / unmount', () => {
  it('1. overlay renders when state.dualEditConflict is populated', () => {
    setupInConflict();
    const overlay = root.querySelector('[data-pkc-region="dual-edit-conflict"]');
    expect(overlay).not.toBeNull();
    expect(isDualEditConflictOverlayOpen()).toBe(true);
  });

  it('2. overlay carries a dialog role + aria-modal + aria-label', () => {
    setupInConflict();
    const overlay = root.querySelector('[data-pkc-region="dual-edit-conflict"]')!;
    expect(overlay.getAttribute('role')).toBe('dialog');
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toBe('Save conflict');
  });

  it('3. 3 action buttons are present in stable DOM order', () => {
    setupInConflict();
    const buttons = root.querySelectorAll(
      '[data-pkc-region="dual-edit-conflict"] button[data-pkc-action]',
    );
    expect(buttons.length).toBe(3);
    expect(buttons[0]!.getAttribute('data-pkc-action')).toBe('resolve-dual-edit-save-as-branch');
    expect(buttons[1]!.getAttribute('data-pkc-action')).toBe('resolve-dual-edit-discard');
    expect(buttons[2]!.getAttribute('data-pkc-action')).toBe('resolve-dual-edit-copy-clipboard');
    for (const b of Array.from(buttons)) {
      expect(b.getAttribute('data-pkc-lid')).toBe('e1');
    }
  });

  it('4. default focus lands on Save as branch', () => {
    setupInConflict();
    const saveAsBranchBtn = root.querySelector(
      '[data-pkc-action="resolve-dual-edit-save-as-branch"]',
    );
    expect(saveAsBranchBtn).toBe(document.activeElement);
  });

  it('5. no overlay is mounted when state.dualEditConflict is null', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).toBeNull();
    expect(isDualEditConflictOverlayOpen()).toBe(false);
  });
});

describe('FI-01 UI slice — button dispatches', () => {
  it('6. Save as branch click dispatches RESOLVE + creates new entry', () => {
    const { dispatcher } = setupInConflict();
    const btn = root.querySelector<HTMLElement>(
      '[data-pkc-action="resolve-dual-edit-save-as-branch"]',
    )!;

    btn.click();
    const after = dispatcher.getState();
    expect(after.dualEditConflict).toBeNull();
    expect(after.phase).toBe('ready');
    expect(after.selectedLid).not.toBe('e1'); // moved to new branch lid
    expect(after.selectedLid).not.toBeNull();
    const branch = after.container!.entries.find((e) => e.lid === after.selectedLid)!;
    expect(branch.title).toBe('My Draft Title');
    expect(branch.body).toBe('my draft body');

    // After dispatch, overlay is unmounted on next render.
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).toBeNull();
  });

  it('7. Discard click dispatches RESOLVE + preserves container', () => {
    const { dispatcher } = setupInConflict();
    const containerBefore = dispatcher.getState().container;

    const btn = root.querySelector<HTMLElement>(
      '[data-pkc-action="resolve-dual-edit-discard"]',
    )!;
    btn.click();

    const after = dispatcher.getState();
    expect(after.container).toBe(containerBefore);
    expect(after.dualEditConflict).toBeNull();
    expect(after.phase).toBe('ready');
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).toBeNull();
  });

  it('8. Copy click writes clipboard and bumps ticket (conflict stays)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // Install a minimal navigator.clipboard stub.
    const originalClipboard = (navigator as unknown as { clipboard?: unknown }).clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    try {
      const { dispatcher } = setupInConflict();
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-action="resolve-dual-edit-copy-clipboard"]',
      )!;
      btn.click();

      // Flush the microtask that navigator.clipboard.writeText schedules.
      await Promise.resolve();

      expect(writeText).toHaveBeenCalledWith('my draft body');
      const after = dispatcher.getState();
      expect(after.dualEditConflict).not.toBeNull();
      expect(after.dualEditConflict!.copyRequestTicket).toBe(1);
      // Overlay still mounted (conflict not cleared by copy).
      expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).not.toBeNull();

      // Second press increments ticket monotonically. The overlay is
      // wiped + re-mounted on every render, so the button captured
      // before the first click is now detached — re-query to target
      // the fresh DOM node.
      const btn2 = root.querySelector<HTMLElement>(
        '[data-pkc-action="resolve-dual-edit-copy-clipboard"]',
      )!;
      btn2.click();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(dispatcher.getState().dualEditConflict!.copyRequestTicket).toBe(2);
    } finally {
      if (originalClipboard === undefined) {
        delete (navigator as unknown as { clipboard?: unknown }).clipboard;
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          value: originalClipboard,
          configurable: true,
        });
      }
    }
  });
});

describe('FI-01 UI slice — Escape / backdrop non-dismiss', () => {
  it('9. Escape keydown does not close the overlay', () => {
    const { dispatcher } = setupInConflict();
    const overlay = root.querySelector('[data-pkc-region="dual-edit-conflict"]')!;

    const evt = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    overlay.dispatchEvent(evt);
    // No escape handler bound, so overlay and state unchanged.
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).not.toBeNull();
    expect(dispatcher.getState().dualEditConflict).not.toBeNull();
  });

  it('10. Clicking the backdrop (overlay root) does not close the overlay', () => {
    const { dispatcher } = setupInConflict();
    const overlay = root.querySelector<HTMLElement>(
      '[data-pkc-region="dual-edit-conflict"]',
    )!;

    overlay.click();
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).not.toBeNull();
    expect(dispatcher.getState().dualEditConflict).not.toBeNull();
  });
});

describe('FI-01 UI slice — unmount after reducer clear', () => {
  it('11. external state transition to dualEditConflict=null unmounts the overlay', () => {
    const { dispatcher } = setupInConflict();
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).not.toBeNull();

    // CANCEL_EDIT clears dualEditConflict (state slice §5 housekeeping).
    dispatcher.dispatch({ type: 'CANCEL_EDIT' });
    expect(dispatcher.getState().dualEditConflict).toBeNull();
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).toBeNull();
    expect(isDualEditConflictOverlayOpen()).toBe(false);
  });
});

describe('FI-01 UI slice — existing UI non-regression', () => {
  it('12. ordinary edit flow (no conflict) does not render the overlay', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    dispatcher.dispatch({
      type: 'COMMIT_EDIT', lid: 'e1', title: 'Title', body: 'new body',
    });

    const st = dispatcher.getState();
    expect(st.phase).toBe('ready');
    expect(st.dualEditConflict).toBeNull();
    expect(root.querySelector('[data-pkc-region="dual-edit-conflict"]')).toBeNull();
  });
});
