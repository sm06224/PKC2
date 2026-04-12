/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openEntryWindow,
  pushViewBodyUpdate,
  pushPreviewContextUpdate,
  ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
} from '@adapter/ui/entry-window';

/**
 * Tests for the "Child view-pane rerender foundation" Issue.
 *
 * Scope verified here:
 *   - The new message-type constant is exported and carries the
 *     expected private wire value.
 *   - `pushViewBodyUpdate` sends the correct postMessage payload to an
 *     open child (with renderMarkdown already applied).
 *   - Returns `false` when no child window exists for the lid, or
 *     when the stub reports `closed: true`.
 *   - The child HTML template contains a listener branch for the new
 *     message type that touches ONLY `#body-view.innerHTML` (body-edit,
 *     body-preview, title-display, title-input are not mentioned in
 *     that branch).
 *   - Empty-body input produces the `(empty)` fallback that mirrors
 *     `renderViewBody`.
 *   - `pushViewBodyUpdate` and `pushPreviewContextUpdate` are
 *     orthogonal: calling one does not produce a message of the other
 *     type, and both can be invoked against the same child.
 *   - XSS safety: the parent's markdown renderer does not surface raw
 *     `<script>` / `javascript:` URLs, so the payload the child
 *     receives cannot be hijacked through user body content.
 *   - textlog archetype is handled the same way as text (foundation
 *     is archetype-agnostic on the helper side).
 *
 * Note on test isolation: `entry-window.ts` keeps its `openWindows`
 * Map at module scope. Each test uses a unique lid via `testCounter`
 * and every child stub is flipped to `closed = true` in `afterEach`
 * so the poll-close interval drops the entry before the next test.
 */

const T = '2026-04-09T00:00:00Z';

let testCounter = 0;
const createdChildren: Array<{ closed: boolean }> = [];

interface ChildStub {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  document: {
    open: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  postMessage: ReturnType<typeof vi.fn>;
  __capturedHtml: string;
}

function setupChildWindow(): ChildStub {
  const child: ChildStub = {
    closed: false,
    focus: vi.fn(),
    document: {
      open: vi.fn(),
      write: vi.fn(),
      close: vi.fn(),
    },
    postMessage: vi.fn(),
    __capturedHtml: '',
  };
  child.document.write.mockImplementation((html: string) => {
    child.__capturedHtml = html;
  });
  vi.spyOn(window, 'open').mockReturnValue(child as unknown as Window);
  createdChildren.push(child);
  return child;
}

function makeTextEntry(archetype: 'text' | 'textlog' = 'text') {
  testCounter++;
  return {
    lid: `vb-${archetype}-${testCounter}`,
    title: 'View Body Target',
    body: 'initial body',
    archetype,
    created_at: T,
    updated_at: T,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const child of createdChildren) {
    child.closed = true;
  }
  createdChildren.length = 0;
});

describe('Entry-window view-body rerender foundation', () => {
  it('exports the message-type constant with the correct wire value', () => {
    expect(ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG).toBe('pkc-entry-update-view-body');
  });

  it('pushes a rendered-HTML message to an open child when called', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    child.postMessage.mockClear();

    const ok = pushViewBodyUpdate(entry.lid, '# Fresh heading\n\nbody text');
    expect(ok).toBe(true);

    const calls = child.postMessage.mock.calls.filter(
      (c) => (c[0] as { type?: string })?.type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
    );
    expect(calls.length).toBe(1);
    const payload = calls[0]![0] as { type: string; viewBody: string };
    expect(payload.type).toBe('pkc-entry-update-view-body');
    // renderMarkdown is applied on the parent side before posting.
    expect(payload.viewBody).toMatch(/<h1[ >]/);
    expect(payload.viewBody).toContain('Fresh heading');
    expect(payload.viewBody).toContain('body text');
  });

  it('returns false when no child window is open for the lid', () => {
    // No openEntryWindow call — nothing registered under this lid.
    const ok = pushViewBodyUpdate(`vb-missing-${++testCounter}`, '# not pushed');
    expect(ok).toBe(false);
  });

  it('returns false when the child stub reports closed=true', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    child.postMessage.mockClear();
    // Simulate the child having been closed by the user between the
    // open and the push.
    child.closed = true;

    const ok = pushViewBodyUpdate(entry.lid, '# still ignored');
    expect(ok).toBe(false);
    const calls = child.postMessage.mock.calls.filter(
      (c) => (c[0] as { type?: string })?.type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
    );
    expect(calls.length).toBe(0);
  });

  it('produces the (empty) fallback markup when resolvedBody is blank', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    child.postMessage.mockClear();

    pushViewBodyUpdate(entry.lid, '');

    const payload = child.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
    )![0] as { viewBody: string };
    // Mirrors `renderViewBody` default branch.
    expect(payload.viewBody).toContain('(empty)');
    expect(payload.viewBody).toContain('color:var(--c-muted)');
  });

  it('child template contains a listener branch that only touches body-view', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const html = child.__capturedHtml;
    // The new listener branch exists.
    const marker = "e.data.type === 'pkc-entry-update-view-body'";
    const branchStart = html.indexOf(marker);
    expect(branchStart).toBeGreaterThan(-1);

    // Isolate the branch body. We scan from the marker forward until
    // the next `if (e.data &&` (next listener branch) or the closing
    // `});` of the message handler, whichever comes first.
    const nextBranch = html.indexOf('if (e.data &&', branchStart + marker.length);
    const handlerEnd = html.indexOf('});', branchStart + marker.length);
    const branchEnd =
      nextBranch > -1 && nextBranch < handlerEnd ? nextBranch : handlerEnd;
    const branchBody = html.slice(branchStart, branchEnd);

    // Must touch body-view.
    expect(branchBody).toContain("getElementById('body-view')");
    expect(branchBody).toContain('.innerHTML');

    // Must NOT touch the other DOM IDs that are out of scope for this
    // foundation Issue.
    expect(branchBody).not.toContain("getElementById('body-edit')");
    expect(branchBody).not.toContain("getElementById('body-preview')");
    expect(branchBody).not.toContain("getElementById('title-display')");
    expect(branchBody).not.toContain("getElementById('title-input')");
    expect(branchBody).not.toContain("getElementById('status')");
  });

  it('does not emit a preview-ctx message and does not conflict with pushPreviewContextUpdate', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, {
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    } as never);

    child.postMessage.mockClear();

    // Call the view-body helper.
    pushViewBodyUpdate(entry.lid, 'plain body');

    // Only a view-body message should be dispatched — nothing of the
    // preview-ctx message type.
    const calls = child.postMessage.mock.calls;
    const viewBodyCalls = calls.filter(
      (c) => (c[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    const previewCtxCalls = calls.filter(
      (c) => (c[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(viewBodyCalls.length).toBe(1);
    expect(previewCtxCalls.length).toBe(0);

    // Now also drive a preview-ctx update — both helpers should
    // coexist without interference. Each produces exactly one call of
    // its own type.
    pushPreviewContextUpdate(entry.lid, {
      assets: { k: 'AAAA' },
      mimeByKey: { k: 'image/png' },
      nameByKey: { k: 'p.png' },
    });
    const afterCalls = child.postMessage.mock.calls;
    const vb2 = afterCalls.filter(
      (c) => (c[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    const pc2 = afterCalls.filter(
      (c) => (c[0] as { type?: string })?.type === 'pkc-entry-update-preview-ctx',
    );
    expect(vb2.length).toBe(1);
    expect(pc2.length).toBe(1);
  });

  it('treats textlog archetype the same as text (foundation is archetype-agnostic)', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry('textlog');
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    child.postMessage.mockClear();

    const ok = pushViewBodyUpdate(entry.lid, '## Log entry');
    expect(ok).toBe(true);

    const payload = child.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
    )![0] as { viewBody: string };
    expect(payload.viewBody).toMatch(/<h2[ >]/);
    expect(payload.viewBody).toContain('Log entry');
  });

  it('does not surface raw <script> tags or javascript: URLs through the payload (XSS safety)', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    child.postMessage.mockClear();

    // Hostile body: raw HTML, an inline <script>, and a javascript:
    // URL in a link. renderMarkdown is configured with html:false and
    // a SAFE_URL regex, so none of these should reach the child as
    // executable content.
    const hostile =
      'before <script>alert(1)</script> after\n\n[click](javascript:alert(2))';
    pushViewBodyUpdate(entry.lid, hostile);

    const payload = child.postMessage.mock.calls.find(
      (c) => (c[0] as { type?: string })?.type === ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG,
    )![0] as { viewBody: string };

    // The raw opening <script> tag must not appear verbatim.
    expect(payload.viewBody.toLowerCase()).not.toContain('<script');
    // A clickable href="javascript:..." must not survive.
    expect(payload.viewBody).not.toMatch(/href="javascript:/i);
  });

  it('does not call document.open / write / close on the child when pushing a view-body update', () => {
    const child = setupChildWindow();
    const entry = makeTextEntry();
    openEntryWindow(entry as never, false, vi.fn(), false, undefined);

    const openCalls = child.document.open.mock.calls.length;
    const writeCalls = child.document.write.mock.calls.length;
    const closeCalls = child.document.close.mock.calls.length;

    pushViewBodyUpdate(entry.lid, '# no rewrite');

    // The foundation helper must never re-invoke the document
    // open/write/close pipeline — that would destroy unrelated DOM
    // (body-edit textarea, listeners, etc.).
    expect(child.document.open.mock.calls.length).toBe(openCalls);
    expect(child.document.write.mock.calls.length).toBe(writeCalls);
    expect(child.document.close.mock.calls.length).toBe(closeCalls);
  });
});
