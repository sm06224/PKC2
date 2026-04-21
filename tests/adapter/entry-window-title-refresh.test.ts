/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { wireEntryWindowTitleRefresh } from '@adapter/ui/entry-window-title-refresh';
import { openEntryWindow, pushTitleUpdate } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';

/**
 * Tests for `wireEntryWindowTitleRefresh` and `pushTitleUpdate`.
 *
 * Spec: docs/development/entry-window-title-live-refresh-v1.md §8.
 *
 * Scope:
 *   - The wire pushes exactly once when an open entry's title changes.
 *   - It does NOT push when entries identity flips without any title
 *     change (e.g. body-only edit, unrelated entry edit).
 *   - It does NOT push on pure AppState transitions like SELECT_ENTRY
 *     that never touch entries at all.
 *   - It is archetype-agnostic: attachment / folder / todo pushes fire
 *     just as for text, because rename is meaningful everywhere.
 *   - `pushTitleUpdate` is a thin helper: postMessage on a live child,
 *     no-op on a closed child.
 */

const T = '2026-04-09T00:00:00Z';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

function makeContainer(partials: Partial<Container> = {}): Container {
  return {
    meta: {
      container_id: `c-${testCounter}`,
      title: 'Test',
      created_at: T,
      updated_at: T,
      schema_version: 1,
    },
    entries: [],
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

function titlePushes(child: { postMessage: ReturnType<typeof vi.fn> }) {
  return child.postMessage.mock.calls.filter(
    (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-title',
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  testCounter++;
});

afterEach(() => {
  for (const child of createdChildren) {
    child.closed = true;
  }
  createdChildren.length = 0;
});

describe('pushTitleUpdate (helper)', () => {
  it('posts a pkc-entry-update-title message to a live child window', () => {
    const dispatcher = createDispatcher();
    const lid = `push-live-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Hello',
          body: 'body',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);
    child.postMessage.mockClear();

    const ok = pushTitleUpdate(lid, 'World');

    expect(ok).toBe(true);
    const pushes = titlePushes(child);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]![0]).toEqual({ type: 'pkc-entry-update-title', title: 'World' });
  });

  it('returns false and is a no-op when no window is open for the lid', () => {
    const ok = pushTitleUpdate(`no-such-${testCounter}`, 'X');
    expect(ok).toBe(false);
  });

  it('returns false when the child window has been closed', () => {
    const dispatcher = createDispatcher();
    const lid = `push-closed-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Hello',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);
    child.closed = true;
    child.postMessage.mockClear();

    const ok = pushTitleUpdate(lid, 'Renamed');

    expect(ok).toBe(false);
    expect(titlePushes(child)).toHaveLength(0);
  });
});

describe('wireEntryWindowTitleRefresh', () => {
  function renameEntry(
    dispatcher: ReturnType<typeof createDispatcher>,
    lid: string,
    newTitle: string,
    body: string,
  ): void {
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid });
    dispatcher.dispatch({
      type: 'COMMIT_EDIT',
      lid,
      title: newTitle,
      body,
    });
  }

  it('pushes the new title when an open entry is renamed', () => {
    const dispatcher = createDispatcher();
    const lid = `rename-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Before',
          body: 'same body',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    child.postMessage.mockClear();

    renameEntry(dispatcher, lid, 'After', 'same body');

    const pushes = titlePushes(child);
    expect(pushes).toHaveLength(1);
    expect(pushes[0]![0]).toEqual({ type: 'pkc-entry-update-title', title: 'After' });
    unsub();
  });

  it('does not push when a body-only edit leaves the title unchanged', () => {
    const dispatcher = createDispatcher();
    const lid = `body-only-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Stable',
          body: 'old body',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    child.postMessage.mockClear();

    renameEntry(dispatcher, lid, 'Stable', 'new body');

    expect(titlePushes(child)).toHaveLength(0);
    unsub();
  });

  it('does not push for SELECT_ENTRY or other entries-preserving dispatches', () => {
    const dispatcher = createDispatcher();
    const lid = `select-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Hello',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'calendar' });

    expect(titlePushes(child)).toHaveLength(0);
    unsub();
  });

  it('is a no-op when no child windows are open', () => {
    const dispatcher = createDispatcher();
    const lid = `no-open-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'Before',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const unsub = wireEntryWindowTitleRefresh(dispatcher);

    expect(() => {
      renameEntry(dispatcher, lid, 'After', '');
    }).not.toThrow();
    unsub();
  });

  it('does not push for an unrelated entry being renamed', () => {
    const dispatcher = createDispatcher();
    const openLid = `open-${testCounter}`;
    const otherLid = `other-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: openLid,
          title: 'Open One',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
        {
          lid: otherLid,
          title: 'Other One',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const openEntry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(openEntry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    child.postMessage.mockClear();

    // Rename the OTHER entry. The entries identity flips but the
    // open entry's title does not — wire must not push.
    renameEntry(dispatcher, otherLid, 'Other Renamed', '');

    expect(titlePushes(child)).toHaveLength(0);
    unsub();
  });

  it('is archetype-agnostic: attachment rename also produces a push', () => {
    const dispatcher = createDispatcher();
    const lid = `att-rename-${testCounter}`;
    const attBody = JSON.stringify({
      name: 'pic.png',
      mime: 'image/png',
      size: 4,
      asset_key: 'ast-a',
    });
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'pic.png',
          body: attBody,
          archetype: 'attachment',
          created_at: T,
          updated_at: T,
        },
      ],
      assets: { 'ast-a': 'AAAA' },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    child.postMessage.mockClear();

    renameEntry(dispatcher, lid, 'renamed.png', attBody);

    const pushes = titlePushes(child);
    expect(pushes).toHaveLength(1);
    expect((pushes[0]![0] as { title: string }).title).toBe('renamed.png');
    unsub();
  });

  it('pushes to each open window when two different entries are renamed', () => {
    const dispatcher = createDispatcher();
    const a = `multi-a-${testCounter}`;
    const b = `multi-b-${testCounter}`;
    const container = makeContainer({
      entries: [
        { lid: a, title: 'A', body: '', archetype: 'text', created_at: T, updated_at: T },
        { lid: b, title: 'B', body: '', archetype: 'text', created_at: T, updated_at: T },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const childA = setupChildWindow();
    const entryA = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entryA as never, false, vi.fn(), false, undefined);

    const childB = setupChildWindow();
    const entryB = dispatcher.getState().container!.entries[1]!;
    openEntryWindow(entryB as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    childA.postMessage.mockClear();
    childB.postMessage.mockClear();

    renameEntry(dispatcher, a, 'A2', '');
    renameEntry(dispatcher, b, 'B2', '');

    const pushesA = titlePushes(childA);
    const pushesB = titlePushes(childB);
    expect(pushesA).toHaveLength(1);
    expect((pushesA[0]![0] as { title: string }).title).toBe('A2');
    expect(pushesB).toHaveLength(1);
    expect((pushesB[0]![0] as { title: string }).title).toBe('B2');
    unsub();
  });

  it('unsubscribe stops subsequent pushes', () => {
    const dispatcher = createDispatcher();
    const lid = `unsub-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid,
          title: 'V1',
          body: '',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowTitleRefresh(dispatcher);
    renameEntry(dispatcher, lid, 'V2', '');
    expect(titlePushes(child)).toHaveLength(1);

    unsub();
    child.postMessage.mockClear();

    renameEntry(dispatcher, lid, 'V3', '');
    expect(titlePushes(child)).toHaveLength(0);
  });
});
