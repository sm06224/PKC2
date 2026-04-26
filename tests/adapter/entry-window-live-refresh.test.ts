/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { wireEntryWindowLiveRefresh } from '@adapter/ui/entry-window-live-refresh';
import { openEntryWindow } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';

/**
 * Tests for the Sub-item A wiring: container asset change → live
 * push of a fresh preview context into every open entry window.
 *
 * Note on test isolation: `entry-window.ts` keeps its `openWindows`
 * Map at module scope. To keep each test hermetic we (a) use a
 * per-test-unique text-entry lid via `testCounter`, and (b) mark all
 * child stubs as `closed` in `afterEach` so the poll-close loop can
 * cleanly drop the Map entry before the next test runs.
 */

const T = '2026-04-09T00:00:00Z';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

function makeContainer(partials: Partial<Container> = {}): Container {
  const textLid = `text-${testCounter}`;
  return {
    meta: {
      container_id: `c-${testCounter}`,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [
      {
        lid: textLid,
        title: 'Text 1',
        body: 'hello',
        archetype: 'text',
        created_at: T,
        updated_at: T,
      },
    ],
    relations: [],
    revisions: [],
    assets: {},
    ...partials,
  };
}

function setupChildWindow() {
  const childDoc = {
    open: vi.fn(),
    write: vi.fn(),
    close: vi.fn(),
  };
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

beforeEach(() => {
  vi.restoreAllMocks();
  testCounter++;
});

afterEach(() => {
  // Mark every child stub as closed so the entry-window module's
  // poll-close interval can drop the lid from `openWindows` before
  // the next test runs. Without this the module-level Map leaks
  // stale "still open" children across tests and would force
  // `openEntryWindow` onto its duplicate-open early-return path.
  for (const child of createdChildren) {
    child.closed = true;
  }
  createdChildren.length = 0;
});

describe('wireEntryWindowLiveRefresh', () => {
  it('pushes a fresh preview context to an open text entry window when assets change', () => {
    const dispatcher = createDispatcher();
    const container = makeContainer();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    // Open a text entry window first.
    const child = setupChildWindow();
    const state0 = dispatcher.getState();
    const entry = state0.container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    // Then wire the live refresh AFTER the window is open.
    const unsub = wireEntryWindowLiveRefresh(dispatcher);

    // Clear the any-pre-wire-open postMessage calls so we only see
    // the ones produced by the wiring itself.
    child.postMessage.mockClear();

    // Add an attachment via the BEGIN_EDIT + COMMIT_EDIT sequence used
    // by the real file-drop flow. COMMIT_EDIT carries the `assets`
    // map, which the reducer merges into container.assets (producing
    // a new object identity).
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'pic.png' });
    const newLid = dispatcher.getState().editingLid!;
    dispatcher.dispatch({
      type: 'COMMIT_EDIT',
      lid: newLid,
      title: 'pic.png',
      body: JSON.stringify({
        name: 'pic.png',
        mime: 'image/png',
        size: 10,
        asset_key: 'ast-new',
      }),
      assets: { 'ast-new': 'AAAA' },
    });

    // The wiring should have posted a preview-ctx update to the open
    // child for the text entry.
    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);

    const lastPush = pushCalls[pushCalls.length - 1]![0] as {
      type: string;
      previewCtx: {
        assets: Record<string, string>;
        mimeByKey: Record<string, string>;
        nameByKey: Record<string, string>;
      };
    };
    // The pushed context reflects the freshly added asset.
    expect(lastPush.previewCtx.assets['ast-new']).toBe('AAAA');
    expect(lastPush.previewCtx.mimeByKey['ast-new']).toBe('image/png');
    expect(lastPush.previewCtx.nameByKey['ast-new']).toBe('pic.png');

    unsub();
  });

  it('does nothing when no entry windows are open', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const unsub = wireEntryWindowLiveRefresh(dispatcher);

    // Mutate assets with no child open — wiring should be a no-op
    // (no throw, no side effect).
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'x.png' });
    const lid = dispatcher.getState().editingLid!;
    expect(() => {
      dispatcher.dispatch({
        type: 'COMMIT_EDIT',
        lid,
        title: 'x.png',
        body: JSON.stringify({
          name: 'x.png',
          mime: 'image/png',
          size: 1,
          asset_key: 'k1',
        }),
        assets: { k1: 'BBBB' },
      });
    }).not.toThrow();
    unsub();
  });

  it('ignores state changes that do not replace the assets identity', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    child.postMessage.mockClear();

    // SELECT_ENTRY does not touch container.assets — no push.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: entry.lid });
    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('skips non-text archetypes among the open lids', () => {
    const dispatcher = createDispatcher();
    // Bootstrap with a todo entry whose window is opened — the
    // wiring should skip it because buildEntryPreviewCtx returns
    // undefined for non-text archetypes.
    const todoLid = `todo-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: todoLid,
          title: 'Todo',
          body: JSON.stringify({ status: 'open', description: 'do it' }),
          archetype: 'todo',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const todo = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(todo as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    child.postMessage.mockClear();

    // Mutate assets.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'a.png' });
    const lid = dispatcher.getState().editingLid!;
    dispatcher.dispatch({
      type: 'COMMIT_EDIT',
      lid,
      title: 'a.png',
      body: JSON.stringify({
        name: 'a.png',
        mime: 'image/png',
        size: 1,
        asset_key: 'kX',
      }),
      assets: { kX: 'CCCC' },
    });

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    // Todo archetype: no push.
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('merges a second asset into a pre-existing non-empty context', () => {
    const dispatcher = createDispatcher();

    // Start with an attachment so the initial assets map is NOT empty —
    // exercises the "non-empty initial state + merge" code path.
    const textLid = `text-merge-${testCounter}`;
    const attLid = `att-merge-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'T',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
        {
          lid: attLid,
          title: 'first.png',
          body: JSON.stringify({
            name: 'first.png',
            mime: 'image/png',
            size: 1,
            asset_key: 'ast-first',
          }),
          archetype: 'attachment',
          created_at: T,
          updated_at: T,
        },
      ],
      assets: { 'ast-first': 'XXXX' },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const textEntry = dispatcher.getState().container!.entries.find(
      (e) => e.lid === textLid,
    )!;
    openEntryWindow(textEntry as never, false, vi.fn(), false, {
      previewCtx: {
        assets: { 'ast-first': 'XXXX' },
        mimeByKey: { 'ast-first': 'image/png' },
        nameByKey: { 'ast-first': 'first.png' },
      },
    } as never);

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    child.postMessage.mockClear();

    // Add a second attachment — reducer produces a NEW assets object
    // via mergeAssets spread.
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'second.png' });
    const newLid = dispatcher.getState().editingLid!;
    dispatcher.dispatch({
      type: 'COMMIT_EDIT',
      lid: newLid,
      title: 'second.png',
      body: JSON.stringify({
        name: 'second.png',
        mime: 'image/png',
        size: 2,
        asset_key: 'ast-second',
      }),
      assets: { 'ast-second': 'YYYY' },
    });

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(pushCalls.length).toBeGreaterThanOrEqual(1);
    const lastPush = pushCalls[pushCalls.length - 1]![0] as {
      previewCtx: {
        assets: Record<string, string>;
        mimeByKey: Record<string, string>;
        nameByKey: Record<string, string>;
      };
    };
    // Both the original and the newly-merged asset are visible.
    expect(lastPush.previewCtx.assets['ast-first']).toBe('XXXX');
    expect(lastPush.previewCtx.assets['ast-second']).toBe('YYYY');
    expect(lastPush.previewCtx.mimeByKey['ast-second']).toBe('image/png');
    expect(lastPush.previewCtx.nameByKey['ast-second']).toBe('second.png');
    unsub();
  });

  it('fires for DELETE_ENTRY because the entries identity changes (P1-2)', () => {
    // Original pre-P1-2 assertion was "does NOT fire, because
    // prev.assets === next.assets". P1-2 (2026-04-13) widened the
    // gate to also fire on entries-identity change, so any entry
    // deletion now triggers a push. This is the intended behaviour:
    // after DELETE_ENTRY the mimeByKey / nameByKey maps (derived
    // from attachment entries) may have shrunk, and pushing a fresh
    // preview ctx keeps the child's resolver consistent with the
    // main window's current truth.
    //
    // `removeEntry` still does not touch `container.assets`, so the
    // raw asset bytes remain — the test also documents that orphan
    // asset cleanup is still out-of-scope (see
    // docs/development/completed/edit-preview-asset-resolution.md §Live refresh
    // wiring).
    const dispatcher = createDispatcher();
    const textLid = `text-del-${testCounter}`;
    const attLid = `att-del-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'T',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
        {
          lid: attLid,
          title: 'pic.png',
          body: JSON.stringify({
            name: 'pic.png',
            mime: 'image/png',
            size: 1,
            asset_key: 'ast-orphan',
          }),
          archetype: 'attachment',
          created_at: T,
          updated_at: T,
        },
      ],
      assets: { 'ast-orphan': 'DDDD' },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const textEntry = dispatcher.getState().container!.entries.find(
      (e) => e.lid === textLid,
    )!;
    openEntryWindow(textEntry as never, false, vi.fn(), false, {
      previewCtx: {
        assets: { 'ast-orphan': 'DDDD' },
        mimeByKey: { 'ast-orphan': 'image/png' },
        nameByKey: { 'ast-orphan': 'pic.png' },
      },
    } as never);

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: attLid });

    // P1-2: entries identity changed → exactly one push fires. The
    // rebuilt ctx drops `ast-orphan` from nameByKey / mimeByKey
    // because the attachment entry no longer exists.
    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(pushCalls.length).toBe(1);
    const pushedCtx = pushCalls[0]![0] as {
      previewCtx: {
        assets: Record<string, string>;
        mimeByKey: Record<string, string>;
        nameByKey: Record<string, string>;
      };
    };
    expect(pushedCtx.previewCtx.mimeByKey['ast-orphan']).toBeUndefined();
    expect(pushedCtx.previewCtx.nameByKey['ast-orphan']).toBeUndefined();
    // Orphan BYTES still present in container.assets — that is a
    // separate open concern (orphan asset cleanup not implemented).
    expect(dispatcher.getState().container!.assets['ast-orphan']).toBe('DDDD');
    unsub();
  });

  it('does not touch the child document (no rewrite of the view pane HTML)', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const initialWriteCalls = child.document.write.mock.calls.length;
    const initialOpenCalls = child.document.open.mock.calls.length;
    const initialCloseCalls = child.document.close.mock.calls.length;

    const unsub = wireEntryWindowLiveRefresh(dispatcher);
    dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: 'p.png' });
    const lid = dispatcher.getState().editingLid!;
    dispatcher.dispatch({
      type: 'COMMIT_EDIT',
      lid,
      title: 'p.png',
      body: JSON.stringify({
        name: 'p.png',
        mime: 'image/png',
        size: 1,
        asset_key: 'k',
      }),
      assets: { k: 'EEEE' },
    });

    // The wiring only calls postMessage — it must never re-invoke
    // document.open / write / close on the child.
    expect(child.document.write.mock.calls.length).toBe(initialWriteCalls);
    expect(child.document.open.mock.calls.length).toBe(initialOpenCalls);
    expect(child.document.close.mock.calls.length).toBe(initialCloseCalls);
    unsub();
  });
});
