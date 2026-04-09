/** @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openEntryWindow, pushViewBodyUpdate } from '@adapter/ui/entry-window';

/**
 * Tests for the "Entry-window child dirty state policy for view
 * rerender" Issue.
 *
 * Policy:
 *   - Clean child (body-edit.value === originalBody &&
 *     title-input.value === originalTitle): parent-pushed
 *     view-body HTML is applied immediately to #body-view.innerHTML.
 *   - Dirty child: the HTML is stashed in pendingViewBody, the
 *     #pending-view-notice element is shown, and #body-view /
 *     #body-edit / other DOM is untouched.
 *   - cancelEdit() flushes pendingViewBody into #body-view and
 *     hides the notice (user discarded edits — apply latest
 *     parent snapshot).
 *   - 'pkc-entry-saved' clears pendingViewBody and hides the notice
 *     WITHOUT applying the stash (save's own rerender is
 *     authoritative).
 *   - Preview live refresh ('pkc-entry-update-preview-ctx') runs
 *     independently of this policy — works even while the view pane
 *     is held stale by a dirty stash.
 *
 * Verification strategy: the child-side logic lives entirely in the
 * string template that the parent writes into child.document. The
 * tests use a small execution harness that (a) captures the child
 * HTML via a write-mock, (b) parses out the body DOM skeleton and
 * the inline <script>, (c) installs the skeleton into happy-dom's
 * document, (d) runs the script inside a fresh function scope via
 * `new Function`, and (e) tracks every `window.addEventListener`
 * call so the per-test-instance listeners can be torn down in
 * afterEach without leaking across tests.
 */

const T = '2026-04-09T00:00:00Z';

interface TrackedListener {
  type: string;
  fn: EventListenerOrEventListenerObject;
}

interface ChildStub {
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  document: {
    open: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  postMessage: ReturnType<typeof vi.fn>;
}

interface ExecutedChild {
  entryLid: string;
  capturedHtml: string;
  stub: ChildStub;
  listeners: TrackedListener[];
  cleanup: () => void;
  dispatchMessage: (data: unknown) => void;
  $: (id: string) => HTMLElement | null;
  setBodyEdit: (value: string) => void;
  setTitleInput: (value: string) => void;
  enterEdit: () => void;
  cancelEdit: () => void;
  showTab: (tab: 'source' | 'preview') => void;
}

function extractScriptBody(html: string): string {
  const start = html.indexOf('<script>');
  const end = html.indexOf('</script>', start);
  if (start < 0 || end < 0) throw new Error('no <script> tag in child HTML');
  return html.slice(start + '<script>'.length, end);
}

function extractBodyInnerHtml(html: string): string {
  const start = html.indexOf('<body>');
  const end = html.indexOf('</body>', start);
  if (start < 0 || end < 0) throw new Error('no <body> tag in child HTML');
  // Strip out the <script>...</script> block from the body content —
  // we'll execute the script manually after installing the DOM.
  const raw = html.slice(start + '<body>'.length, end);
  return raw.replace(/<script>[\s\S]*?<\/script>/g, '');
}

let testCounter = 0;
const allExecutedChildren: ExecutedChild[] = [];

function executeChild(entryOverrides: Record<string, unknown> = {}): ExecutedChild {
  testCounter++;
  const entry = {
    lid: `dp-${testCounter}`,
    title: 'Original Title',
    body: 'original body text',
    archetype: 'text' as const,
    created_at: T,
    updated_at: T,
    ...entryOverrides,
  };

  let capturedHtml = '';
  const childDoc = {
    open: vi.fn(),
    write: vi.fn((html: string) => {
      capturedHtml = html;
    }),
    close: vi.fn(),
  };
  const stub: ChildStub = {
    closed: false,
    focus: vi.fn(),
    document: childDoc,
    postMessage: vi.fn(),
  };
  vi.spyOn(window, 'open').mockReturnValue(stub as unknown as Window);

  openEntryWindow(
    entry as never,
    /* readonly */ false,
    vi.fn(),
    /* lightSource */ false,
    undefined,
  );

  if (!capturedHtml) throw new Error('openEntryWindow did not write child HTML');

  // Install the body DOM skeleton into happy-dom's document.
  document.body.innerHTML = extractBodyInnerHtml(capturedHtml);

  // Mock window.opener with the minimal renderer surface the child
  // script expects. The child calls window.opener.pkcRenderEntryPreview
  // (preferred) or window.opener.pkcRenderMarkdown (fallback) from
  // inside renderMd().
  (window as unknown as Record<string, unknown>).opener = {
    pkcRenderMarkdown: (text: string) => `<p>${text}</p>`,
    pkcRenderEntryPreview: (_lid: string, text: string) => `<p>${text}</p>`,
  };

  // Track addEventListener calls during script execution so the
  // per-instance listeners can be torn down in afterEach. We only
  // track calls on the window object (where the child script attaches
  // its 'message', 'pagehide', 'unload' listeners).
  const tracked: TrackedListener[] = [];
  const origAdd = window.addEventListener.bind(window);
  (window as unknown as Record<string, unknown>).addEventListener = (
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    tracked.push({ type, fn });
    origAdd(type, fn, opts);
  };

  // Append bridging lines that expose the closure-local functions
  // to the test's window scope. The actual functions still close over
  // the script's scope (including `originalBody`, `currentMode`,
  // `pendingViewBody`, etc.) — the bridging is purely a way to reach
  // them from outside the `new Function(...)` IIFE without modifying
  // production code.
  //
  // Inline onclick attributes in the child HTML skeleton reference
  // these functions by bare name (e.g. `onclick="cancelEdit()"`) and
  // are NOT reachable via `.click()` in this harness because the bare
  // name resolves against the element's / document's scope chain,
  // which does not include our Function-scoped vars. Calling
  // `child.cancelEdit()` below routes through `window.__testCancelEdit`
  // to invoke the real function with its real closure.
  const augmented =
    extractScriptBody(capturedHtml) +
    `\n;try{window.__testEnterEdit=enterEdit;}catch(_){};` +
    `try{window.__testCancelEdit=cancelEdit;}catch(_){};` +
    `try{window.__testShowTab=showTab;}catch(_){};` +
    `try{window.__testSaveEntry=saveEntry;}catch(_){};` +
    `try{window.__testIsEntryDirty=isEntryDirty;}catch(_){};` +
    `try{window.__testFlushPendingViewBody=flushPendingViewBody;}catch(_){};`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function(augmented)();
  } finally {
    (window as unknown as Record<string, unknown>).addEventListener = origAdd;
  }

  const win = window as unknown as Record<string, unknown>;

  const executed: ExecutedChild = {
    entryLid: entry.lid,
    capturedHtml,
    stub,
    listeners: tracked,
    cleanup: () => {
      for (const { type, fn } of tracked) {
        window.removeEventListener(type, fn as EventListener);
      }
      document.body.innerHTML = '';
      delete win.opener;
      delete win.__testEnterEdit;
      delete win.__testCancelEdit;
      delete win.__testShowTab;
      delete win.__testSaveEntry;
      delete win.__testIsEntryDirty;
      delete win.__testFlushPendingViewBody;
    },
    dispatchMessage: (data: unknown) => {
      window.dispatchEvent(new MessageEvent('message', { data }));
    },
    $: (id: string) => document.getElementById(id),
    setBodyEdit: (value: string) => {
      const el = document.getElementById('body-edit') as HTMLTextAreaElement | null;
      if (el) el.value = value;
    },
    setTitleInput: (value: string) => {
      const el = document.getElementById('title-input') as HTMLInputElement | null;
      if (el) el.value = value;
    },
    enterEdit: () => {
      const fn = win.__testEnterEdit as (() => void) | undefined;
      if (typeof fn === 'function') fn();
    },
    cancelEdit: () => {
      const fn = win.__testCancelEdit as (() => void) | undefined;
      if (typeof fn === 'function') fn();
    },
    showTab: (tab: 'source' | 'preview') => {
      const fn = win.__testShowTab as ((t: string) => void) | undefined;
      if (typeof fn === 'function') fn(tab);
    },
  };
  allExecutedChildren.push(executed);
  return executed;
}

beforeEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const child of allExecutedChildren) {
    child.cleanup();
  }
  allExecutedChildren.length = 0;
});

describe('Entry-window child dirty state policy for view rerender', () => {
  it('clean child: parent view-body push is applied to #body-view immediately', () => {
    const child = executeChild();
    const view = child.$('body-view')!;
    const beforeHtml = view.innerHTML;

    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<h1>fresh</h1>',
    });

    expect(view.innerHTML).toBe('<h1>fresh</h1>');
    expect(view.innerHTML).not.toBe(beforeHtml);

    // Notice must stay hidden when the update applied cleanly.
    const notice = child.$('pending-view-notice')!;
    expect(notice.style.display).toBe('none');
  });

  it('dirty child: parent view-body push is suppressed and stashed', () => {
    const child = executeChild();
    const view = child.$('body-view')!;
    const beforeHtml = view.innerHTML;

    // Make the body dirty.
    child.setBodyEdit('user is typing a new paragraph');

    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<h1>should not appear yet</h1>',
    });

    // body-view unchanged — the push was stashed, not applied.
    expect(view.innerHTML).toBe(beforeHtml);
    expect(view.innerHTML).not.toContain('should not appear yet');

    // The notice element is visible to signal the pending update.
    const notice = child.$('pending-view-notice')!;
    expect(notice.style.display).not.toBe('none');
  });

  it('dirty child: Preview live refresh still applies independently', () => {
    const child = executeChild();

    // Enter edit mode and switch to the Preview tab — this is the
    // precondition the child script's 'pkc-entry-update-preview-ctx'
    // branch checks (`currentMode === 'edit'` && Preview tab visible)
    // before doing an in-place re-render.
    child.enterEdit();
    child.showTab('preview');

    // NOW make the body dirty (by mutating the textarea directly;
    // the showTab('preview') path reads body-edit.value at that
    // moment, and we want the dirty value to be what flows through
    // the live refresh).
    child.setBodyEdit('half-written draft');

    const bodyEdit = child.$('body-edit') as HTMLTextAreaElement;
    const bodyPreview = child.$('body-preview')!;
    const view = child.$('body-view')!;
    const viewBeforeHtml = view.innerHTML;

    // Sanity: dirty state is real.
    const isDirty = (window as unknown as Record<string, unknown>)
      .__testIsEntryDirty as (() => boolean) | undefined;
    expect(typeof isDirty).toBe('function');
    expect(isDirty!()).toBe(true);

    // Preview-ctx message runs the in-place re-render of body-preview
    // regardless of dirty state.
    child.dispatchMessage({
      type: 'pkc-entry-update-preview-ctx',
      previewCtx: { assets: {}, mimeByKey: {}, nameByKey: {} },
    });

    // body-preview content reflects the mocked opener renderer
    // (<p>...</p>) run against the current (dirty) textarea value.
    expect(bodyPreview.innerHTML).toContain('half-written draft');

    // body-edit textarea value is unchanged — the preview-ctx path
    // never writes to the Source textarea.
    expect(bodyEdit.value).toBe('half-written draft');

    // body-view is unchanged — the preview-ctx path also never
    // touches the view pane. This is the orthogonality invariant:
    // Preview sync and View sync are independent.
    expect(view.innerHTML).toBe(viewBeforeHtml);
  });

  it('pending UI indicator is hidden by default and visible only after a dirty suppression', () => {
    const child = executeChild();
    const notice = child.$('pending-view-notice')!;

    // Initial state from the inline style attribute.
    expect(notice.style.display).toBe('none');

    // Clean push: still hidden.
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>clean</p>',
    });
    expect(notice.style.display).toBe('none');

    // Dirty push: becomes visible.
    child.setBodyEdit('dirty now');
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>stashed</p>',
    });
    expect(notice.style.display).not.toBe('none');
  });

  it('dirty → cancelEdit flushes the pending view body and hides the notice', () => {
    const child = executeChild();
    const view = child.$('body-view')!;

    // Dirty + push → stash.
    child.setBodyEdit('a draft the user will abandon');
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<h2>fresh parent snapshot</h2>',
    });

    // Confirm stash state.
    expect(view.innerHTML).not.toContain('fresh parent snapshot');
    expect(child.$('pending-view-notice')!.style.display).not.toBe('none');

    // Now the user cancels the edit. cancelEdit() in the child
    // script resets body-edit / title-input to originals and then
    // calls flushPendingViewBody(), which writes pendingViewBody
    // into #body-view.innerHTML.
    child.cancelEdit();

    expect(view.innerHTML).toBe('<h2>fresh parent snapshot</h2>');
    expect(child.$('pending-view-notice')!.style.display).toBe('none');
    // body-edit was reset to original by cancelEdit.
    expect((child.$('body-edit') as HTMLTextAreaElement).value).toBe(
      'original body text',
    );
  });

  it('dirty → pkc-entry-saved discards the pending stash (save rerender is authoritative)', () => {
    const child = executeChild();
    const view = child.$('body-view')!;

    // Dirty + push → stash.
    child.setBodyEdit('edits that will be saved');
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<h3>EARLIER parent snapshot</h3>',
    });
    expect(child.$('pending-view-notice')!.style.display).not.toBe('none');

    // Simulate a save round-trip: the parent would have already
    // persisted the user's current textarea via onSave, and now
    // echoes back the saved confirmation.
    child.dispatchMessage({ type: 'pkc-entry-saved' });

    // body-view reflects the SAVED content, not the earlier pending
    // parent snapshot. The mocked opener renderer wraps the saved
    // body in <p>...</p>.
    expect(view.innerHTML).toContain('edits that will be saved');
    expect(view.innerHTML).not.toContain('EARLIER parent snapshot');

    // Pending stash and notice cleared.
    expect(child.$('pending-view-notice')!.style.display).toBe('none');

    // A subsequent clean push should apply normally — proving
    // pendingViewBody is actually null, not just hidden.
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<h4>post-save clean push</h4>',
    });
    expect(view.innerHTML).toBe('<h4>post-save clean push</h4>');
  });

  it('textarea value is never mutated by the view-body push (dirty or clean)', () => {
    const child = executeChild();
    const bodyEdit = child.$('body-edit') as HTMLTextAreaElement;

    // Dirty case.
    bodyEdit.value = 'draft-in-progress-D1';
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>dirty-case push</p>',
    });
    expect(bodyEdit.value).toBe('draft-in-progress-D1');

    // Clean case (reset to original).
    bodyEdit.value = 'original body text';
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>clean-case push</p>',
    });
    expect(bodyEdit.value).toBe('original body text');
  });

  it('title-input alone can make the child dirty (dirty is body OR title)', () => {
    const child = executeChild();
    const view = child.$('body-view')!;

    // body-edit untouched, only title-input is edited.
    child.setTitleInput('Renamed But Not Saved');

    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>should be stashed</p>',
    });

    expect(view.innerHTML).not.toContain('should be stashed');
    expect(child.$('pending-view-notice')!.style.display).not.toBe('none');
  });

  it('textlog entry follows the same clean / dirty policy as text', () => {
    const child = executeChild({ archetype: 'textlog' });
    const view = child.$('body-view')!;

    // Clean: push applies.
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>textlog clean push</p>',
    });
    expect(view.innerHTML).toBe('<p>textlog clean push</p>');

    // Dirty: stash + notice.
    child.setBodyEdit('textlog user edit');
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>textlog stashed</p>',
    });
    expect(view.innerHTML).toBe('<p>textlog clean push</p>');
    expect(child.$('pending-view-notice')!.style.display).not.toBe('none');
  });

  it('only the most recent suppressed push is retained while dirty', () => {
    const child = executeChild();
    const view = child.$('body-view')!;

    child.setBodyEdit('keep dirty');

    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>v1 (will be overwritten in stash)</p>',
    });
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>v2 (will be overwritten in stash)</p>',
    });
    child.dispatchMessage({
      type: 'pkc-entry-update-view-body',
      viewBody: '<p>v3 newest</p>',
    });

    // View pane never changed during dirty.
    expect(view.innerHTML).not.toContain('v1');
    expect(view.innerHTML).not.toContain('v2');
    expect(view.innerHTML).not.toContain('v3');

    // On cancel, only the newest (v3) is flushed.
    child.cancelEdit();
    expect(view.innerHTML).toBe('<p>v3 newest</p>');
  });

  it('pushViewBodyUpdate on the parent side still dispatches regardless of child dirty state', () => {
    // The policy lives entirely on the child side. The parent helper
    // `pushViewBodyUpdate` is dirty-agnostic — it always posts the
    // message when a child is open. This test guards that invariant
    // so future refactors don't accidentally move the policy up into
    // the parent (which would couple the parent to child UI state).
    const child = executeChild();

    // Make the child dirty — the parent helper must still dispatch.
    child.setBodyEdit('some in-progress edit the parent cannot see');

    child.stub.postMessage.mockClear();
    const ok = pushViewBodyUpdate(child.entryLid, 'parent-side push');
    expect(ok).toBe(true);

    const calls = child.stub.postMessage.mock.calls.filter(
      (c) => (c[0] as { type?: string })?.type === 'pkc-entry-update-view-body',
    );
    expect(calls.length).toBe(1);
    // The payload is the rendered HTML (renderMarkdown applied).
    const payload = calls[0]![0] as { viewBody: string };
    expect(typeof payload.viewBody).toBe('string');
    expect(payload.viewBody).toContain('parent-side push');
  });
});
