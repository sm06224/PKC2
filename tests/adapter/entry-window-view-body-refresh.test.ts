/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDispatcher } from '@adapter/state/dispatcher';
import { wireEntryWindowViewBodyRefresh } from '@adapter/ui/entry-window-view-body-refresh';
import { wireEntryWindowLiveRefresh } from '@adapter/ui/entry-window-live-refresh';
import { openEntryWindow } from '@adapter/ui/entry-window';
import type { Container } from '@core/model/container';

/**
 * Tests for `wireEntryWindowViewBodyRefresh` — the wiring that
 * connects dispatcher state changes (container asset identity flip)
 * to `pushViewBodyUpdate` calls for every currently-open text /
 * textlog entry-window child whose saved body contains at least one
 * `asset:` reference.
 *
 * Scope of this suite:
 *   - The wiring fires exactly when the Preview wiring fires
 *     (`prev.assets !== next.assets`) and nowhere else.
 *   - The payload pushed to the child carries fully-rendered HTML
 *     produced by `pushViewBodyUpdate` → `renderMarkdown`, with the
 *     added asset's `data:` URI inlined into the `<img>` src.
 *   - Archetype filter: only text / textlog children receive a
 *     push. Attachment, todo and other archetypes are skipped.
 *   - Body-content filter: text bodies with no `asset:` references
 *     are skipped (no push, no dirty-state notice flash).
 *   - Coexistence with Preview wiring: both wires live on the same
 *     dispatcher and each produces its own dedicated message type.
 *   - No-op safety: no open windows, no assets change, DELETE_ENTRY,
 *     and identity-preserving dispatches produce zero pushes.
 *   - Document-write hygiene: the wiring must never re-invoke
 *     `document.open` / `document.write` / `document.close` on the
 *     child — that would destroy the edit textarea, listeners, and
 *     pending dirty state.
 *
 * Note on test isolation: `entry-window.ts` keeps its `openWindows`
 * Map at module scope. To keep each test hermetic we (a) use per-test
 * unique lids via `testCounter`, and (b) flip every child stub to
 * `closed = true` in `afterEach` so the close-poller can drop the
 * stale entry before the next test runs.
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

/**
 * Commit a COMMIT_EDIT for a new attachment, producing a fresh
 * `container.assets` identity via `mergeAssets`. This is the canonical
 * asset-mutation dispatch that both the Preview wiring and the View
 * wiring observe.
 */
function addAttachment(
  dispatcher: ReturnType<typeof createDispatcher>,
  assetKey: string,
  data: string,
  name = `${assetKey}.png`,
  mime = 'image/png',
): void {
  dispatcher.dispatch({ type: 'CREATE_ENTRY', archetype: 'attachment', title: name });
  const lid = dispatcher.getState().editingLid!;
  dispatcher.dispatch({
    type: 'COMMIT_EDIT',
    lid,
    title: name,
    body: JSON.stringify({
      name,
      mime,
      size: data.length,
      asset_key: assetKey,
    }),
    assets: { [assetKey]: data },
  });
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

describe('wireEntryWindowViewBodyRefresh', () => {
  it('pushes a rendered view-body to an open text entry with asset references when assets change', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-vb-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'Text with ref',
          body: 'before ![pic](asset:ast-new) after',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-new', 'AAAA');

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(1);
    const payload = pushCalls[0]![0] as { type: string; viewBody: string };
    expect(payload.type).toBe('pkc-entry-update-view-body');
    // renderMarkdown output should contain an <img> tag — proof that
    // the parent ran both resolveAssetReferences AND renderMarkdown
    // before posting.
    expect(payload.viewBody).toContain('<img');
    // The newly added asset's data URI must be inlined into the img src.
    expect(payload.viewBody).toContain('data:image/png;base64,AAAA');
    expect(payload.viewBody).toContain('alt="pic"');
    unsub();
  });

  it('does nothing when no entry windows are open (pure no-op)', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: makeContainer() });
    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);

    // Mutate assets with no child open — wiring should be a no-op
    // (no throw, no side effect).
    expect(() => {
      addAttachment(dispatcher, 'k1', 'BBBB');
    }).not.toThrow();
    unsub();
  });

  it('ignores state changes that do not replace the assets identity', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-sel-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'T',
          body: '![x](asset:ast-sel)',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    // SELECT_ENTRY does not touch container.assets — wiring must not push.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: entry.lid });

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('skips non-text archetypes among the open lids (attachment child is ignored)', () => {
    const dispatcher = createDispatcher();
    const attLid = `att-skip-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: attLid,
          title: 'pic.png',
          body: JSON.stringify({
            name: 'pic.png',
            mime: 'image/png',
            size: 1,
            asset_key: 'ast-initial',
          }),
          archetype: 'attachment',
          created_at: T,
          updated_at: T,
        },
      ],
      assets: { 'ast-initial': 'ZZZZ' },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const att = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(att as never, false, vi.fn(), false, undefined);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-new', 'CCCC');

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    // Attachment archetype must be filtered out by buildEntryPreviewCtx.
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('skips a todo child (non-markdown archetype)', () => {
    const dispatcher = createDispatcher();
    const todoLid = `todo-skip-${testCounter}`;
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

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'kX', 'DDDD');

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('skips text entries whose body has no asset references at all', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-noref-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'No refs',
          body: '# Plain heading\n\nno asset refs at all',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-unused', 'EEEE');

    // Body has no asset references — resolving would produce the same
    // HTML, so the wiring deliberately skips the push. The child's
    // dirty-state notice must not flash for a no-op update.
    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(0);
    unsub();
  });

  it('pushes a view-body update for a textlog archetype entry with references', () => {
    const dispatcher = createDispatcher();
    const textlogLid = `textlog-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textlogLid,
          title: 'Log',
          body: '## Entry\n\n![log-pic](asset:ast-log)',
          archetype: 'textlog',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-log', 'FFFF');

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(1);
    const payload = pushCalls[0]![0] as { viewBody: string };
    expect(payload.viewBody).toContain('data:image/png;base64,FFFF');
    expect(payload.viewBody).toContain('alt="log-pic"');
    unsub();
  });

  it('coexists with Preview wiring: each wire emits its own message type without interference', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-coex-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'Coexist',
          body: 'body ![c](asset:ast-coex)',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    // Wire both modules on the same dispatcher — production layout.
    const unsubPreview = wireEntryWindowLiveRefresh(dispatcher);
    const unsubView = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-coex', 'GGGG');

    const calls = child.postMessage.mock.calls;
    const previewCalls = calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    const viewCalls = calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    // `addAttachment` is a two-step dispatch: CREATE_ENTRY creates
    // the attachment entry (entries identity change), then COMMIT_EDIT
    // commits the body AND merges the asset into container.assets
    // (both identities change). Under the P1-2 widened gate each
    // wire fires ONCE per identity change that is relevant to it:
    //   - Preview wiring: fires on both CREATE_ENTRY and COMMIT_EDIT
    //     (it gates on assets OR entries change). 2 pushes.
    //   - View wiring: CREATE_ENTRY gives it an entries change but the
    //     host text body has no `entry:` ref, so it skips; COMMIT_EDIT
    //     gives it an assets change AND the host has an `asset:` ref,
    //     so it pushes. 1 push.
    //
    // Pre-P1-2 the Preview wiring only fired on the COMMIT_EDIT
    // because it gated purely on assets-identity — so the assertion
    // was `toBe(1)`. The new `toBe(2)` documents the deliberate
    // broadening (P1-2, 2026-04-13). The last push is still the
    // authoritative one; children applying context updates always
    // render against the latest payload.
    expect(previewCalls.length).toBe(2);
    expect(viewCalls.length).toBe(1);

    // Preview payload carries the resolver context shape. The LAST
    // push is what reflects the fully-committed attachment; earlier
    // pushes may have had an empty `assets` map (from the transient
    // CREATE_ENTRY step).
    const lastPreview = previewCalls[previewCalls.length - 1]![0] as {
      previewCtx: { assets: Record<string, string> };
    };
    expect(lastPreview.previewCtx.assets['ast-coex']).toBe('GGGG');

    // View payload carries rendered HTML with the inlined data URI.
    const viewPayload = viewCalls[0]![0] as { viewBody: string };
    expect(viewPayload.viewBody).toContain('data:image/png;base64,GGGG');

    // The two payloads must NOT leak into each other.
    expect(lastPreview).not.toHaveProperty('viewBody');
    expect(viewPayload).not.toHaveProperty('previewCtx');

    unsubPreview();
    unsubView();
  });

  it('does not touch the child document (no rewrite of the view pane HTML)', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-nowrite-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'No write',
          body: '![x](asset:ast-nw)',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const initialOpenCalls = child.document.open.mock.calls.length;
    const initialWriteCalls = child.document.write.mock.calls.length;
    const initialCloseCalls = child.document.close.mock.calls.length;

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    addAttachment(dispatcher, 'ast-nw', 'HHHH');

    // Wiring only calls postMessage — never re-invokes document
    // open/write/close. Re-invoking would destroy the edit textarea,
    // listeners, and stored pending dirty state.
    expect(child.document.open.mock.calls.length).toBe(initialOpenCalls);
    expect(child.document.write.mock.calls.length).toBe(initialWriteCalls);
    expect(child.document.close.mock.calls.length).toBe(initialCloseCalls);
    unsub();
  });

  it('does not fire for DELETE_ENTRY because the reducer leaves container.assets unchanged', () => {
    // Mirrors the equivalent DELETE_ENTRY documentation test in
    // `entry-window-live-refresh.test.ts`: the reducer's removeEntry
    // path does not cleanup orphaned assets, so
    // `prev.assets === next.assets` holds and the wiring (correctly)
    // stays silent. Orphan-asset cleanup is out-of-scope.
    const dispatcher = createDispatcher();
    const textLid = `text-del-${testCounter}`;
    const attLid = `att-del-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'T',
          body: '![x](asset:ast-orphan)',
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
      assets: { 'ast-orphan': 'IIII' },
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === textLid)!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: {
        assets: { 'ast-orphan': 'IIII' },
        mimeByKey: { 'ast-orphan': 'image/png' },
        nameByKey: { 'ast-orphan': 'pic.png' },
      },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: attLid });

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(0);
    // Orphan still present in state — documents current behavior.
    expect(dispatcher.getState().container!.assets['ast-orphan']).toBe('IIII');
    unsub();
  });

  it('pushes exactly one view-body update per asset mutation (not once per unrelated state cycle)', () => {
    const dispatcher = createDispatcher();
    const textLid = `text-once-${testCounter}`;
    const container = makeContainer({
      entries: [
        {
          lid: textLid,
          title: 'Once',
          body: '![x](asset:ast-once)',
          archetype: 'text',
          created_at: T,
          updated_at: T,
        },
      ],
    });
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });

    const child = setupChildWindow();
    const entry = dispatcher.getState().container!.entries[0]!;
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    const unsub = wireEntryWindowViewBodyRefresh(dispatcher);
    child.postMessage.mockClear();

    addAttachment(dispatcher, 'ast-once', 'JJJJ');

    // Extra non-asset dispatches that still trigger state listeners —
    // the wiring must NOT push again because prev.assets === next.assets.
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: textLid });
    dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: 'detail' });

    const pushCalls = child.postMessage.mock.calls.filter(
      (call) => (call[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(pushCalls.length).toBe(1);
    unsub();
  });
});
