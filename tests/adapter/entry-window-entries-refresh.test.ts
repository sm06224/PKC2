/** @vitest-environment happy-dom */
/**
 * Entry-window live refresh — P1-2 entries-identity trigger tests.
 *
 * Pre-P1-2 the live-refresh wiring only fired on `prev.assets !==
 * next.assets`. That left several UX gaps that the P0-2a inventory
 * flagged, chief among them: a text entry that embeds a TODO would
 * continue to show stale preview content when the TODO's status /
 * description was edited from another window, because a QUICK_UPDATE_
 * ENTRY only flips `entries` identity — not `assets`.
 *
 * P1-2 (2026-04-13) widens both wirings to also fire on entries-
 * identity change. This file pins the new triggers and documents the
 * per-entry gates that avoid redundant pushes.
 *
 * Scope for this suite:
 *   - wireEntryWindowLiveRefresh: fires on entries-identity change
 *     for every open text / textlog child.
 *   - wireEntryWindowViewBodyRefresh: fires for the precise set
 *     described in its JSDoc — host entry changed, or body has the
 *     kind of ref that the changed identity would affect.
 *   - Lifecycle safety: closed children are not pushed to; multiple
 *     open windows each get their own push exactly once per change.
 *   - Unsubscribe: after `unsub()` the wiring is inert.
 *
 * Test isolation mirrors `entry-window-live-refresh.test.ts`:
 *   - per-test-unique lids via `testCounter`
 *   - stub every child as `closed = true` in `afterEach` so the
 *     module-scope `openWindows` map drains before the next test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { wireEntryWindowLiveRefresh } from '@adapter/ui/entry-window-live-refresh';
import { wireEntryWindowViewBodyRefresh } from '@adapter/ui/entry-window-view-body-refresh';
import { openEntryWindow } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';
import type { Entry } from '@core/model/record';

const T = '2026-04-13T00:00:00Z';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

function makeEntry(
  lid: string,
  archetype: Entry['archetype'],
  body: string,
  title = lid,
): Entry {
  return { lid, title, body, archetype, created_at: T, updated_at: T };
}

function makeContainer(entries: Entry[]): Container {
  return {
    meta: {
      container_id: `c-${testCounter}`,
      title: 'P1-2',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries,
    relations: [],
    revisions: [],
    assets: {},
  };
}

function setupChildWindow() {
  const childDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
  const child = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  createdChildren.push(child);
  return child;
}

function countPreview(child: { postMessage: ReturnType<typeof vi.fn> }): number {
  return child.postMessage.mock.calls.filter(
    (call: unknown[]) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
  ).length;
}

function countViewBody(child: { postMessage: ReturnType<typeof vi.fn> }): number {
  return child.postMessage.mock.calls.filter(
    (call: unknown[]) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
  ).length;
}

beforeEach(() => {
  vi.restoreAllMocks();
  testCounter++;
});

afterEach(() => {
  for (const c of createdChildren) c.closed = true;
  createdChildren.length = 0;
});

// ════════════════════════════════════════════════════════════════════
// (1) TODO embed stale — the canonical P0-2a / P1-2 failure case
// ════════════════════════════════════════════════════════════════════

describe('P1-2 — TODO embed stale (the motivating case)', () => {
  it('view-body wiring pushes a refresh to the host when the embedded TODO is updated', () => {
    const hostLid = `host-${testCounter}`;
    const todoLid = `todo-${testCounter}`;
    const host = makeEntry(
      hostLid,
      'text',
      `See the task: ![](entry:${todoLid})`,
      'Host doc',
    );
    const todo = makeEntry(
      todoLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'buy milk' }),
      'Shopping',
    );
    const container = makeContainer([host, todo]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    // Simulate the user toggling the TODO's status from another window.
    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: todoLid,
      body: JSON.stringify({ status: 'done', description: 'buy milk' }),
    });

    // The host has an `entry:<todoLid>` ref and entries identity has
    // changed — view-body wiring must push exactly once.
    expect(countViewBody(child)).toBe(1);
    unsub();
  });

  it('preview wiring also pushes when the embedded TODO is updated', () => {
    const hostLid = `host-prev-${testCounter}`;
    const todoLid = `todo-prev-${testCounter}`;
    const host = makeEntry(hostLid, 'text', `![](entry:${todoLid})`, 'Host');
    const todo = makeEntry(
      todoLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'x' }),
      'T',
    );
    const container = makeContainer([host, todo]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: todoLid,
      body: JSON.stringify({ status: 'done', description: 'x' }),
    });

    // Preview wiring gates on assets OR entries change and pushes a
    // fresh ctx unconditionally (text/textlog archetype only). Exactly
    // one push per state transition.
    expect(countPreview(child)).toBe(1);
    unsub();
  });
});

// ════════════════════════════════════════════════════════════════════
// (2) Host entry's own body edited — push even without refs
// ════════════════════════════════════════════════════════════════════

describe('P1-2 — host entry changed (no refs required)', () => {
  it('view-body wiring pushes when the host entry itself is QUICK_UPDATE_ENTRY-d', () => {
    const hostLid = `host-self-${testCounter}`;
    const host = makeEntry(hostLid, 'text', 'plain body, no refs', 'Host');
    const container = makeContainer([host]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    // A hypothetical external mutation — this is not the user typing
    // inside the same entry-window, but a sibling window or a
    // programmatic dispatch. In either case the host identity flips.
    //
    // QUICK_UPDATE_ENTRY is blocked in phase 'ready' only when the
    // lid is missing, so the below dispatch should succeed for a
    // valid entry.
    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: hostLid,
      body: 'new body, still no refs',
    });

    expect(countViewBody(child)).toBe(1);
    unsub();
  });
});

// ════════════════════════════════════════════════════════════════════
// (3) Per-entry gating: unrelated changes that the host ignores
// ════════════════════════════════════════════════════════════════════

describe('P1-2 — per-entry gating avoids redundant view-body pushes', () => {
  it('no view-body push when an unrelated entry changes AND the host has no refs', () => {
    const hostLid = `host-noref-${testCounter}`;
    const otherLid = `other-${testCounter}`;
    const host = makeEntry(hostLid, 'text', 'plain body, no refs at all', 'Host');
    const other = makeEntry(
      otherLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'a' }),
      'Other',
    );
    const container = makeContainer([host, other]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: otherLid,
      body: JSON.stringify({ status: 'done', description: 'a' }),
    });

    // Host identity unchanged, assetsChanged false, entriesChanged
    // true but host body has NO entry ref → skip.
    expect(countViewBody(child)).toBe(0);
    unsub();
  });

  it('no view-body push when an unrelated entry changes AND the host only has asset refs', () => {
    const hostLid = `host-assetonly-${testCounter}`;
    const otherLid = `other-a-${testCounter}`;
    const host = makeEntry(hostLid, 'text', '![i](asset:ast-x)', 'Host');
    const other = makeEntry(
      otherLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'a' }),
      'Other',
    );
    const container = makeContainer([host, other]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: otherLid,
      body: JSON.stringify({ status: 'done', description: 'a' }),
    });

    // entriesChanged true, but host has only asset refs — the
    // entries change cannot affect the rendered HTML for an
    // asset-only body, so view-body wiring skips.
    expect(countViewBody(child)).toBe(0);
    unsub();
  });
});

// ════════════════════════════════════════════════════════════════════
// (4) Multi-window — each open child is refreshed independently
// ════════════════════════════════════════════════════════════════════

describe('P1-2 — multi-window', () => {
  it('two hosts embedding different TODOs each receive exactly their own refresh', () => {
    const hostALid = `hA-${testCounter}`;
    const hostBLid = `hB-${testCounter}`;
    const todoALid = `tA-${testCounter}`;
    const todoBLid = `tB-${testCounter}`;

    const entries: Entry[] = [
      makeEntry(hostALid, 'text', `![](entry:${todoALid})`, 'HA'),
      makeEntry(hostBLid, 'text', `![](entry:${todoBLid})`, 'HB'),
      makeEntry(todoALid, 'todo', JSON.stringify({ status: 'open', description: 'A' }), 'TA'),
      makeEntry(todoBLid, 'todo', JSON.stringify({ status: 'open', description: 'B' }), 'TB'),
    ];
    const container = makeContainer(entries);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    // Two separate child windows.
    const childA = setupChildWindow();
    openEntryWindow(entries[0]! as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);
    const childB = setupChildWindow();
    openEntryWindow(entries[1]! as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    childA.postMessage.mockClear();
    childB.postMessage.mockClear();

    // Update only TODO A — both hosts observe the same entries-
    // identity change, but only host A's body has an `entry:`
    // reference to the changed TODO. Nonetheless, host B also has
    // an `entry:` ref (to TODO B) so its body COULD be affected by
    // any entries change — the wiring's gate admits both pushes.
    // This is the conservative-but-correct behaviour: each open
    // entry-window with any `entry:` ref gets a fresh render when
    // entries change.
    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: todoALid,
      body: JSON.stringify({ status: 'done', description: 'A' }),
    });

    expect(countViewBody(childA)).toBe(1);
    expect(countViewBody(childB)).toBe(1);
    unsub();
  });
});

// ════════════════════════════════════════════════════════════════════
// (5) Lifecycle — closed child must not receive pushes
// ════════════════════════════════════════════════════════════════════

describe('P1-2 — lifecycle safety', () => {
  it('no push after the child window is closed (push helper short-circuits on closed)', () => {
    const hostLid = `host-closed-${testCounter}`;
    const todoLid = `todo-closed-${testCounter}`;
    const host = makeEntry(hostLid, 'text', `![](entry:${todoLid})`);
    const todo = makeEntry(
      todoLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'x' }),
    );
    const container = makeContainer([host, todo]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);

    // Simulate the child being closed by the user.
    child.closed = true;
    child.postMessage.mockClear();

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: todoLid,
      body: JSON.stringify({ status: 'done', description: 'x' }),
    });

    // pushViewBodyUpdate short-circuits when the child is closed;
    // no postMessage is emitted, and the open-windows map will be
    // drained on the next poll tick.
    expect(countViewBody(child)).toBe(0);
    unsub();
  });

  it('unsubscribe silences subsequent pushes', () => {
    const hostLid = `host-unsub-${testCounter}`;
    const todoLid = `todo-unsub-${testCounter}`;
    const host = makeEntry(hostLid, 'text', `![](entry:${todoLid})`);
    const todo = makeEntry(
      todoLid,
      'todo',
      JSON.stringify({ status: 'open', description: 'x' }),
    );
    const container = makeContainer([host, todo]);

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    openEntryWindow(host as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    unsub();

    dispatcher.dispatch({
      type: 'QUICK_UPDATE_ENTRY',
      lid: todoLid,
      body: JSON.stringify({ status: 'done', description: 'x' }),
    });

    expect(countViewBody(child)).toBe(0);
  });
});
