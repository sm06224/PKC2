/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { parseTextlogBody, serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

// Register the textlog presenter once so the renderer can draw textlog entries
// during these tests. Registration is idempotent.
registerPresenter('textlog', textlogPresenter);
registerPresenter('attachment', attachmentPresenter);

const mockContainer: Container = {
  meta: {
    container_id: 'test-id',
    title: 'Test',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'Entry One',
      body: 'Body one',
      archetype: 'text',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: () => void;

// --- Stale-listener prevention infrastructure ---
// Every dispatcher.onState / onEvent subscription is auto-tracked here.
// The beforeEach teardown calls all accumulated unsubscribe functions,
// ensuring no stale listener can render into a subsequent test's root.
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
  return () => {
    cleanup?.();
    for (const fn of _trackedUnsubs) fn();
    _trackedUnsubs.length = 0;
    root.remove();
  };
});

// NOTE: `setup()` helper is not used in this file — each describe bootstraps
// its own dispatcher + render fixture inline (e.g. `bootstrapEditingText`).
// The shared `root` / `cleanup` / `_trackedUnsubs` above remain useful.


// ─────────────────────────────────────────────────────────────
// Inline calc shortcut (TEXT / TEXTLOG textarea Enter key)
// ─────────────────────────────────────────────────────────────
//
// These tests pin the keydown → evaluator → textarea insertion
// flow for the "1+2=" + Enter shortcut. They cover:
//   - TEXT body field (editing phase + text archetype filter)
//   - TEXTLOG append textarea (Enter fires calc, Ctrl+Enter still
//     appends — the two paths are deliberately layered so plain
//     Enter stays available for inline calc while Ctrl+Enter
//     keeps its append meaning)
//   - Folder body textareas are NOT eligible (same field name,
//     different archetype)
//   - Failures (bad expression, non-end caret, no `=`, text
//     selection) fall through to the browser's default Enter
//     behaviour rather than corrupting the body.
//   - TEXTLOG append behavioural regression: plain-Enter
//     preservation and Ctrl+Enter append still work end-to-end.

describe('ActionBinder — inline calc shortcut', () => {
  function bootstrapEditingText(initialBody = ''): {
    dispatcher: ReturnType<typeof createDispatcher>;
    events: DomainEvent[];
  } {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'e1',
          title: 'Note',
          body: initialBody,
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);
    return { dispatcher, events };
  }

  function bootstrapEditingFolder(): {
    dispatcher: ReturnType<typeof createDispatcher>;
  } {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'f1',
          title: 'My Folder',
          body: '',
          archetype: 'folder',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'f1' });
    render(dispatcher.getState(), root);
    return { dispatcher };
  }

  function bootstrapTextlog(): {
    dispatcher: ReturnType<typeof createDispatcher>;
  } {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'tl1',
          title: 'Work Log',
          body: serializeTextlogBody({ entries: [] }),
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    return { dispatcher };
  }

  it('TEXT body: plain Enter on "2+3=" inserts "5\\n" at caret', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(ta).not.toBeNull();
    ta!.value = '2+3=';
    ta!.selectionStart = ta!.selectionEnd = 4;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('2+3=5\n');
    expect(ev.defaultPrevented).toBe(true);
    expect(ta!.selectionStart).toBe(6);
    expect(ta!.selectionEnd).toBe(6);
  });

  it('TEXT body: operator precedence is respected through the full chain', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '2+3*4=';
    ta!.selectionStart = ta!.selectionEnd = 6;
    ta!.focus();
    ta!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ta!.value).toBe('2+3*4=14\n');
  });

  it('TEXT body: multi-line — only the current line ending with = triggers', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = 'intro line\n10-4=';
    ta!.selectionStart = ta!.selectionEnd = ta!.value.length;
    ta!.focus();
    ta!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(ta!.value).toBe('intro line\n10-4=6\n');
  });

  it('TEXT body: invalid expression is a silent no-op (browser default Enter runs)', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '1+abc=';
    ta!.selectionStart = ta!.selectionEnd = 6;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    // Nothing was inserted and preventDefault was NOT called — the
    // browser / happy-dom is free to apply its normal Enter behaviour.
    expect(ta!.value).toBe('1+abc=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('TEXT body: division by zero is a silent no-op', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '1/0=';
    ta!.selectionStart = ta!.selectionEnd = 4;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('1/0=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('TEXT body: does NOT fire when caret is not at the end of the line', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '1+2=';
    ta!.selectionStart = ta!.selectionEnd = 2; // inside the expression
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('1+2=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('TEXT body: does NOT fire when a selection range is active', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '1+2=';
    ta!.selectionStart = 0;
    ta!.selectionEnd = 4; // entire text selected
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('1+2=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('TEXT body: Shift+Enter does NOT trigger inline calc', () => {
    bootstrapEditingText();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    ta!.value = '1+2=';
    ta!.selectionStart = ta!.selectionEnd = 4;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter', shiftKey: true, bubbles: true, cancelable: true,
    });
    ta!.dispatchEvent(ev);
    // Shift+Enter is reserved for soft line breaks — we must not intercept.
    expect(ta!.value).toBe('1+2=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('FOLDER body: inline calc is NOT eligible (same field name, different archetype)', () => {
    bootstrapEditingFolder();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(ta).not.toBeNull();
    ta!.value = '1+2=';
    ta!.selectionStart = ta!.selectionEnd = 4;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('1+2=');
    expect(ev.defaultPrevented).toBe(false);
  });

  it('TEXTLOG append: plain Enter on "10%3=" inserts "1\\n"', () => {
    bootstrapTextlog();
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    expect(ta).not.toBeNull();
    ta!.value = '10%3=';
    ta!.selectionStart = ta!.selectionEnd = 5;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    expect(ta!.value).toBe('10%3=1\n');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('TEXTLOG append: Ctrl+Enter still appends the log entry (regression)', () => {
    const { dispatcher } = bootstrapTextlog();
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    ta!.value = 'Quick note';
    ta!.selectionStart = ta!.selectionEnd = ta!.value.length;
    ta!.focus();
    ta!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', ctrlKey: true, bubbles: true,
    }));
    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('Quick note');
  });

  it('TEXTLOG append: plain Enter without a trailing `=` stays a pure no-op (multiline preserved)', () => {
    const { dispatcher } = bootstrapTextlog();
    const ta = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    ta!.value = 'plain line';
    ta!.selectionStart = ta!.selectionEnd = ta!.value.length;
    ta!.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    ta!.dispatchEvent(ev);
    // Value unchanged at the DOM level, and no log entry got
    // appended (that would require Ctrl+Enter). preventDefault was
    // not called, so the browser keeps its normal multiline Enter.
    expect(ta!.value).toBe('plain line');
    expect(ev.defaultPrevented).toBe(false);
    const ent = dispatcher.getState().container!.entries[0]!;
    expect(parseTextlogBody(ent.body).entries).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────
// Issue D — TEXTLOG / TEXT / attachment UX polish batch
// ────────────────────────────────────────────────────────────────
//
// Groups below test five independent items added together:
//   A. TEXTLOG row dblclick → BEGIN_EDIT
//   B. Reference-string context-menu items
//   C. HTML attachment card "Open in New Window" button
//   D. Markdown source copy + rich (markdown + HTML) copy
//   E. Rendered viewer new window
//
// The helpers below build the minimal container each item needs.

function mountTextlogContainer(entries: Array<{ id: string; text: string; createdAt: string; flags?: Array<'important'> }>): {
  dispatcher: ReturnType<typeof createDispatcher>;
} {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  const container: Container = {
    ...mockContainer,
    entries: [
      {
        lid: 'tl1',
        title: 'Work Log',
        body: serializeTextlogBody({
          entries: entries.map((e) => ({
            id: e.id,
            text: e.text,
            createdAt: e.createdAt,
            flags: e.flags ?? [],
          })),
        }),
        archetype: 'textlog',
        created_at: '2026-04-09T00:00:00Z',
        updated_at: '2026-04-09T00:00:00Z',
      },
    ],
  };
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
  return { dispatcher };
}

// ── A. TEXTLOG row dblclick → BEGIN_EDIT ──

describe('TEXTLOG row edit affordance (Slice 4 dblclick revision)', () => {
  // Slice 4 contract: plain dblclick on a log row no longer enters
  // edit mode — the browser's native word / block selection is
  // preserved. Explicit entry points are (a) the per-row ✏︎ button
  // with `data-pkc-action="edit-log"` and (b) `Alt+Click` on the row
  // body.

  it('plain dblclick on a log row does NOT begin editing (native selection preserved)', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    expect(textEl).not.toBeNull();
    textEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
  });

  it('single click on a log row does NOT begin editing', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
  });

  it('the ✏︎ edit-log button renders inside the log row header', () => {
    mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const btn = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] [data-pkc-action="edit-log"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-lid')).toBe('tl1');
    expect(btn!.getAttribute('data-pkc-log-id')).toBe('log-1');
  });

  it('clicking the ✏︎ edit-log button enters edit mode', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const btn = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] [data-pkc-action="edit-log"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('Alt+Click on a log row body enters edit mode', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('Alt+Click on the flag button does NOT begin editing (flag handler wins)', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const flagBtn = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-flag-btn',
    );
    flagBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('clicking the flag button still calls preventDefault (scroll-jump guard kept)', () => {
    mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const flagBtn = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-flag-btn',
    );
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    flagBtn!.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('the existing Edit button in the action bar still dispatches BEGIN_EDIT', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const editBtn = root.querySelector<HTMLElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="begin-edit"]',
    );
    editBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('Alt+Click is a no-op in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'tl1',
          title: 'Work Log',
          body: serializeTextlogBody({
            entries: [{ id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z', flags: [] }],
          }),
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Alt+Click on nested child element resolves to owning row', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: '**bold text**', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    const childTarget = textEl!.firstElementChild ?? textEl!;
    childTarget.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('save after Alt+Click-edit produces correct body', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'original', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('editing');

    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    textarea!.value = 'modified text';

    const saveBtn = root.querySelector<HTMLElement>('[data-pkc-action="commit-edit"]');
    saveBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();

    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'tl1');
    const log = parseTextlogBody(entry!.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('modified text');
  });

  it('cancel after Alt+Click-edit preserves original body', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'original', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const originalBody = dispatcher.getState().container!.entries.find((e) => e.lid === 'tl1')!.body;

    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true }));
    expect(dispatcher.getState().phase).toBe('editing');

    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    textarea!.value = 'should be discarded';

    const cancelBtn = root.querySelector<HTMLElement>('[data-pkc-action="cancel-edit"]');
    cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'tl1');
    expect(entry!.body).toBe(originalBody);
  });
});

// ── B. Reference-string context-menu items ──

describe('Issue D / B — Reference-string context menu items', () => {
  async function clipboardCaptureMock(): Promise<{ restore: () => void; capture: { value: string | null } }> {
    const capture: { value: string | null } = { value: null };
    const nav = globalThis.navigator as unknown as { clipboard?: unknown };
    const prev = nav.clipboard;
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: (t: string) => {
          capture.value = t;
          return Promise.resolve();
        },
      },
    });
    return {
      capture,
      restore: () => {
        Object.defineProperty(nav, 'clipboard', {
          configurable: true,
          writable: true,
          value: prev,
        });
      },
    };
  }

  it('right-clicking a TEXT entry view shows a "copy entry reference" item', () => {
    // Fresh dispatcher with selection so the detail pane is rendered.
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    const viewWrap = root.querySelector<HTMLElement>(
      '[data-pkc-mode="view"][data-pkc-archetype="text"]',
    );
    expect(viewWrap).not.toBeNull();
    viewWrap!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );

    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
    // Asset/log line references are NOT present for plain TEXT archetype.
    expect(menu!.querySelector('[data-pkc-action="copy-asset-ref"]')).toBeNull();
    expect(menu!.querySelector('[data-pkc-action="copy-log-line-ref"]')).toBeNull();
  });

  it('right-clicking an attachment entry shows a "copy asset reference" item', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'Picture',
          body: JSON.stringify({ name: 'picture.png', mime: 'image/png', size: 10, asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: 'AAAA' },
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'att1' });

    const viewWrap = root.querySelector<HTMLElement>(
      '[data-pkc-mode="view"][data-pkc-archetype="attachment"]',
    );
    expect(viewWrap).not.toBeNull();
    viewWrap!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }),
    );

    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    expect(menu).not.toBeNull();
    expect(menu!.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
    expect(menu!.querySelector('[data-pkc-action="copy-asset-ref"]')).not.toBeNull();
  });

  it('right-clicking a TEXTLOG row shows a "copy log line reference" item tagged with the log id', () => {
    mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const row = root.querySelector<HTMLElement>(
      '.pkc-textlog-log[data-pkc-log-id="log-1"]',
    );
    expect(row).not.toBeNull();
    row!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }),
    );
    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    expect(menu).not.toBeNull();
    const item = menu!.querySelector<HTMLElement>('[data-pkc-action="copy-log-line-ref"]');
    expect(item).not.toBeNull();
    expect(item!.getAttribute('data-pkc-lid')).toBe('tl1');
    expect(item!.getAttribute('data-pkc-log-id')).toBe('log-1');
  });

  it('clicking "copy entry reference" writes `[title](entry:lid)` to the clipboard', async () => {
    const { capture, restore } = await clipboardCaptureMock();
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      const viewWrap = root.querySelector<HTMLElement>(
        '[data-pkc-mode="view"][data-pkc-archetype="text"]',
      );
      viewWrap!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }),
      );
      const item = root.querySelector<HTMLElement>(
        '[data-pkc-region="context-menu"] [data-pkc-action="copy-entry-ref"]',
      );
      item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Microtask flush: the copy helper is async.
      await Promise.resolve();
      expect(capture.value).toBe('[Entry One](entry:e1)');
    } finally {
      restore();
    }
  });

  it('clicking "copy log line reference" writes `[title › ts](entry:lid#log-id)` to the clipboard', async () => {
    const { capture, restore } = await clipboardCaptureMock();
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
      ]);
      const row = root.querySelector<HTMLElement>(
        '.pkc-textlog-log[data-pkc-log-id="log-1"]',
      );
      row!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
      const item = root.querySelector<HTMLElement>(
        '[data-pkc-region="context-menu"] [data-pkc-action="copy-log-line-ref"]',
      );
      expect(item).not.toBeNull();
      item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      expect(capture.value).not.toBeNull();
      expect(capture.value!).toContain('](entry:tl1#log-1)');
      expect(capture.value!.startsWith('[Work Log')).toBe(true);
    } finally {
      restore();
    }
  });

  it('readonly container still exposes reference-copy items but hides Edit/Delete', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    const viewWrap = root.querySelector<HTMLElement>(
      '[data-pkc-mode="view"][data-pkc-archetype="text"]',
    );
    viewWrap!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
    );
    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    expect(menu).not.toBeNull();
    // Reference copy items remain available.
    expect(menu!.querySelector('[data-pkc-action="copy-entry-ref"]')).not.toBeNull();
    // Mutating items are hidden in readonly.
    expect(menu!.querySelector('[data-pkc-action="begin-edit"]')).toBeNull();
    expect(menu!.querySelector('[data-pkc-action="delete-entry"]')).toBeNull();
  });

  it('right-clicking a textarea in the center pane does NOT show custom context menu', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(textarea).not.toBeNull();

    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    textarea!.dispatchEvent(evt);

    // Native context menu should NOT be prevented
    expect(evt.defaultPrevented).toBe(false);
    // Custom context menu should NOT appear
    const menu = root.querySelector('[data-pkc-region="context-menu"]');
    expect(menu).toBeNull();
  });

  it('right-clicking a text input does NOT show custom context menu', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    // Create a text input inside the root to simulate date input etc.
    const input = document.createElement('input');
    input.type = 'text';
    root.appendChild(input);

    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    input.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    expect(root.querySelector('[data-pkc-region="context-menu"]')).toBeNull();
  });
});

// ── C. HTML attachment open-in-new-window button ──

describe('Issue D / C — HTML attachment "Open in New Window" action', () => {
  function mountHtmlAttachment(mime: string, base64: string, name = 'report.html'): ReturnType<typeof createDispatcher> {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: name,
          body: JSON.stringify({ name, mime, size: base64.length, asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: base64 },
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'att1' });
    return dispatcher;
  }

  it('HTML attachment card exposes an "open-html-attachment" button', () => {
    // btoa('<p>ok</p>') = 'PHA+b2s8L3A+'
    mountHtmlAttachment('text/html', 'PHA+b2s8L3A+');
    const btn = root.querySelector<HTMLElement>(
      '[data-pkc-region="attachment-actions"] [data-pkc-action="open-html-attachment"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-lid')).toBe('att1');
  });

  it('non-HTML (PDF) attachment does NOT show the open-in-new-window button', () => {
    mountHtmlAttachment('application/pdf', 'JVBERi0xLjQK');
    const btn = root.querySelector('[data-pkc-region="attachment-actions"] [data-pkc-action="open-html-attachment"]');
    expect(btn).toBeNull();
    // But the download button is still present.
    expect(
      root.querySelector('[data-pkc-region="attachment-actions"] [data-pkc-action="download-attachment"]'),
    ).not.toBeNull();
  });

  it('clicking the HTML open button invokes window.open() with the decoded document', () => {
    mountHtmlAttachment('text/html', 'PHA+b2s8L3A+'); // base64 of <p>ok</p>
    const childDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const childWin = { document: childDoc, closed: false } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(childWin);
    try {
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="attachment-actions"] [data-pkc-action="open-html-attachment"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(openSpy).toHaveBeenCalled();
      expect(childDoc.write).toHaveBeenCalled();
      const written = childDoc.write.mock.calls[0]![0] as string;
      expect(written).toContain('<p>ok</p>');
    } finally {
      openSpy.mockRestore();
    }
  });
});

// ── D. Markdown + rich copy ──

describe('Issue D / D — Markdown source + rich clipboard copy', () => {
  function installClipboard(mock: {
    writeText?: (t: string) => Promise<void>;
    write?: (items: unknown[]) => Promise<void>;
  } | undefined): () => void {
    const nav = globalThis.navigator as unknown as { clipboard?: unknown };
    const prev = nav.clipboard;
    Object.defineProperty(nav, 'clipboard', {
      configurable: true,
      writable: true,
      value: mock,
    });
    return () => {
      Object.defineProperty(nav, 'clipboard', {
        configurable: true,
        writable: true,
        value: prev,
      });
    };
  }

  function installClipboardItem(): () => void {
    const g = globalThis as unknown as { ClipboardItem?: unknown };
    const prev = g.ClipboardItem;
    g.ClipboardItem = function (this: { items: Record<string, Blob> }, parts: Record<string, Blob>) {
      this.items = parts;
    } as unknown as typeof ClipboardItem;
    return () => {
      g.ClipboardItem = prev;
    };
  }

  it('Copy MD on a TEXT entry writes the body as text/plain', async () => {
    let captured: string | null = null;
    const restore = installClipboard({
      writeText: (t: string) => {
        captured = t;
        return Promise.resolve();
      },
    });
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: {
          ...mockContainer,
          entries: [
            {
              lid: 'e1',
              title: 'Note',
              body: '# Hello\n\nWorld',
              archetype: 'text',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="copy-markdown-source"]',
      );
      expect(btn).not.toBeNull();
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      expect(captured).toBe('# Hello\n\nWorld');
    } finally {
      restore();
    }
  });

  it('Copy MD button is not rendered for TEXTLOG entries (Slice 4-B)', () => {
    // Slice 4-B of textlog-viewer-and-linkability-redesign.md gated
    // Copy MD / Copy Rendered on `archetype === 'text'`. The TEXTLOG
    // action bar now ships with viewer / export-csv only, so the
    // copy-markdown-source button should not exist.
    mountTextlogContainer([
      { id: 'log-1', text: 'alpha', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const btn = root.querySelector<HTMLElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="copy-markdown-source"]',
    );
    expect(btn).toBeNull();
  });

  it('Copy Rendered writes both text/plain and text/html through ClipboardItem', async () => {
    const payloads: Array<Record<string, Blob>> = [];
    const restoreCI = installClipboardItem();
    const restore = installClipboard({
      write: (items: unknown[]) => {
        const item = items[0] as { items: Record<string, Blob> };
        payloads.push(item.items);
        return Promise.resolve();
      },
    });
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: {
          ...mockContainer,
          entries: [
            {
              lid: 'e1',
              title: 'Note',
              body: '# Hello\n\nWorld',
              archetype: 'text',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="copy-rich-markdown"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // Two microtask boundaries: feature detect + write().
      await Promise.resolve();
      await Promise.resolve();
      expect(payloads).toHaveLength(1);
      const keys = Object.keys(payloads[0]!).sort();
      expect(keys).toEqual(['text/html', 'text/plain']);
      const plain = await payloads[0]!['text/plain']!.text();
      const html = await payloads[0]!['text/html']!.text();
      expect(plain).toBe('# Hello\n\nWorld');
      // h1 now carries a slug `id` for TOC (A-3), so match loosely.
      expect(html).toMatch(/<h1[^>]*>Hello<\/h1>/);
      expect(html).toContain('<p>World</p>');
    } finally {
      restore();
      restoreCI();
    }
  });

  it('Copy Rendered falls back to plain markdown when ClipboardItem is unavailable', async () => {
    let captured: string | null = null;
    const restore = installClipboard({
      writeText: (t: string) => {
        captured = t;
        return Promise.resolve();
      },
    });
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: {
          ...mockContainer,
          entries: [
            {
              lid: 'e1',
              title: 'Fallback',
              body: 'plain body',
              archetype: 'text',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="copy-rich-markdown"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      expect(captured).toBe('plain body');
    } finally {
      restore();
    }
  });
});

// ── E. Rendered viewer new window ──

describe('Issue D / E — Open rendered viewer in new window', () => {
  function mockChildWindow() {
    const childDoc = { open: vi.fn(), write: vi.fn(), close: vi.fn() };
    const childWin = { document: childDoc, closed: false } as unknown as Window;
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(childWin);
    return { childDoc, openSpy };
  }

  it('TEXT entry: clicking Open Viewer calls window.open and writes rendered HTML', () => {
    const { childDoc, openSpy } = mockChildWindow();
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: {
          ...mockContainer,
          entries: [
            {
              lid: 'e1',
              title: 'Printable',
              body: '# Title\n\nBody',
              archetype: 'text',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="open-rendered-viewer"]',
      );
      expect(btn).not.toBeNull();
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(openSpy).toHaveBeenCalled();
      expect(childDoc.write).toHaveBeenCalled();
      const html = childDoc.write.mock.calls[0]![0] as string;
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Printable');
      expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
      // No editor UI leaks into the viewer.
      expect(html).not.toContain('data-pkc-action="commit-edit"');
      expect(html).not.toContain('<textarea');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('TEXTLOG entry: Open Viewer renders day-grouped HTML via buildTextlogDoc', () => {
    // Slice 4-B switched the TEXTLOG viewer away from the flat
    // `serializeTextlogAsMarkdown` output. The rendered HTML now
    // mirrors the live viewer: `<section class="pkc-textlog-day">`
    // wrappers around `<article class="pkc-textlog-log">` entries.
    const { childDoc, openSpy } = mockChildWindow();
    try {
      mountTextlogContainer([
        { id: 'log-1', text: '**first**', createdAt: '2026-04-09T10:00:00Z' },
        { id: 'log-2', text: 'second', createdAt: '2026-04-09T10:05:00Z', flags: ['important'] },
      ]);
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="open-rendered-viewer"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(openSpy).toHaveBeenCalled();
      const html = childDoc.write.mock.calls[0]![0] as string;
      expect(html).toContain('<strong>first</strong>');
      expect(html).toContain('second');
      // Day grouping + log articles appear.
      expect(html).toContain('class="pkc-textlog-day"');
      expect(html).toContain('class="pkc-textlog-log"');
      // Important flag is surfaced via a data attribute on the article.
      expect(html).toMatch(/data-pkc-log-important="true"/);
    } finally {
      openSpy.mockRestore();
    }
  });
});

// ── F. TEXTLOG CSV + assets ZIP export action ──

describe('Issue F — TEXTLOG CSV+ZIP export action', () => {
  /**
   * The download path goes through `triggerZipDownload`, which calls
   * `URL.createObjectURL` and clicks an anchor. happy-dom does not
   * implement createObjectURL by default, so we install a stub on
   * window.URL for the duration of the test and capture the anchor
   * click via a click listener on the document body.
   *
   * Returns a small handle exposing whatever the action handler asks
   * the browser to download (filename + Blob).
   */
  function installDownloadCapture(): {
    captures: Array<{ filename: string; blob: Blob | null }>;
    restore: () => void;
  } {
    const captures: Array<{ filename: string; blob: Blob | null }> = [];
    const originalCreate = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
    let lastBlob: Blob | null = null;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      lastBlob = b;
      return 'blob:mock';
    };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};

    // Intercept anchor clicks at the body level so the download is
    // captured before the JSDOM/happy-dom default action runs.
    const handler = (e: Event): void => {
      const a = e.target as HTMLAnchorElement | null;
      if (a && a.tagName === 'A' && a.download) {
        e.preventDefault();
        captures.push({ filename: a.download, blob: lastBlob });
      }
    };
    document.body.addEventListener('click', handler, true);

    return {
      captures,
      restore: () => {
        document.body.removeEventListener('click', handler, true);
        if (originalCreate) {
          (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = originalCreate;
        } else {
          delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
        }
        if (originalRevoke) {
          (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = originalRevoke;
        } else {
          delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
        }
      },
    };
  }

  it('clicking 📦 Export CSV+ZIP triggers a .textlog.zip download', async () => {
    const cap = installDownloadCapture();
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
        { id: 'log-2', text: 'second', createdAt: '2026-04-09T10:05:00Z', flags: ['important'] },
      ]);
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      expect(btn).not.toBeNull();
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      // The download is dispatched synchronously inside the action
      // handler — `exportTextlogAsBundle` is awaited but its body is
      // synchronous up to and including the downloadFn call. Yield
      // once to let the microtask queue drain, then assert.
      await Promise.resolve();
      await Promise.resolve();
      expect(cap.captures.length).toBe(1);
      const { filename, blob } = cap.captures[0]!;
      expect(filename).toMatch(/^work-log-\d{8}\.textlog\.zip$/);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob!.size).toBeGreaterThan(0);
    } finally {
      cap.restore();
    }
  });

  it('Export button is rendered for textlog and absent for non-textlog archetypes', () => {
    mountTextlogContainer([
      { id: 'log-1', text: 'a', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const exportBtn = root.querySelector<HTMLElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
    );
    expect(exportBtn).not.toBeNull();

    // Switch back to a non-textlog (TEXT) container, the button must vanish.
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({
      type: 'SYS_INIT_COMPLETE',
      container: {
        ...mockContainer,
        entries: [
          {
            lid: 'e1',
            title: 'Plain text',
            body: 'hello',
            archetype: 'text',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    expect(
      root.querySelector('[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]'),
    ).toBeNull();
  });

  it('export action is a no-op when the targeted entry is not a textlog', async () => {
    // Wire a TEXT entry but synthesize a fake export-textlog button on
    // it. The action handler must refuse to export and not call the
    // download path.
    const cap = installDownloadCapture();
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      dispatcher.dispatch({
        type: 'SYS_INIT_COMPLETE',
        container: {
          ...mockContainer,
          entries: [
            {
              lid: 'e1',
              title: 'Not a log',
              body: 'plain',
              archetype: 'text',
              created_at: '2026-01-01T00:00:00Z',
              updated_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

      // Inject a synthetic button mimicking what the renderer would
      // emit if the wiring leaked. The handler must still bail out
      // because of the archetype check.
      const fake = document.createElement('button');
      fake.setAttribute('data-pkc-action', 'export-textlog-csv-zip');
      fake.setAttribute('data-pkc-lid', 'e1');
      root.appendChild(fake);
      fake.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(cap.captures.length).toBe(0);
    } finally {
      cap.restore();
    }
  });
});

// ── G. TEXTLOG export UX polish: missing-asset warning + compact ──

describe('Issue G — missing-asset warning + compact export', () => {
  /**
   * installDownloadCapture and installConfirmStub are separate so each
   * test can opt into exactly what it needs. installConfirmStub lets
   * the test decide whether confirm() returns true (user continues)
   * or false (user cancels), and records how many times and with
   * what message it was called.
   */
  function installDownloadCapture(): {
    captures: Array<{ filename: string; blob: Blob | null }>;
    restore: () => void;
  } {
    const captures: Array<{ filename: string; blob: Blob | null }> = [];
    const originalCreate = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;
    const originalRevoke = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
    let lastBlob: Blob | null = null;
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b: Blob) => {
      lastBlob = b;
      return 'blob:mock';
    };
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => {};
    const handler = (e: Event): void => {
      const a = e.target as HTMLAnchorElement | null;
      if (a && a.tagName === 'A' && a.download) {
        e.preventDefault();
        captures.push({ filename: a.download, blob: lastBlob });
      }
    };
    document.body.addEventListener('click', handler, true);
    return {
      captures,
      restore: () => {
        document.body.removeEventListener('click', handler, true);
        if (originalCreate) {
          (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = originalCreate;
        } else {
          delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
        }
        if (originalRevoke) {
          (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = originalRevoke;
        } else {
          delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
        }
      },
    };
  }

  interface ConfirmStub {
    calls: string[];
    restore: () => void;
  }
  function installConfirmStub(answer: boolean): ConfirmStub {
    const calls: string[] = [];
    const original = (globalThis as unknown as { confirm?: (m: string) => boolean }).confirm;
    (globalThis as unknown as { confirm: (m: string) => boolean }).confirm = (m: string) => {
      calls.push(m);
      return answer;
    };
    return {
      calls,
      restore: () => {
        if (original) {
          (globalThis as unknown as { confirm: (m: string) => boolean }).confirm = original;
        } else {
          delete (globalThis as unknown as { confirm?: unknown }).confirm;
        }
      },
    };
  }

  /**
   * Mount a textlog container whose single row references `ast-missing`,
   * which is intentionally NOT present in container.assets. This
   * guarantees `manifest.missing_asset_count > 0` and therefore that
   * the warning flow engages.
   */
  function mountTextlogWithMissingRef(): void {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    const container: Container = {
      ...mockContainer,
      assets: {},
      entries: [
        {
          lid: 'tl1',
          title: 'Work Log',
          body: serializeTextlogBody({
            entries: [
              {
                id: 'log-1',
                text: 'See ![chart](asset:ast-missing) please',
                createdAt: '2026-04-09T10:00:00Z',
                flags: [],
              },
            ],
          }),
          archetype: 'textlog',
          created_at: '2026-04-09T00:00:00Z',
          updated_at: '2026-04-09T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
  }

  it('compact checkbox is rendered next to the export button on textlog entries', () => {
    mountTextlogContainer([
      { id: 'log-1', text: 'a', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const cb = root.querySelector<HTMLInputElement>(
      '[data-pkc-region="action-bar"] input[data-pkc-control="textlog-export-compact"]',
    );
    expect(cb).not.toBeNull();
    expect(cb!.type).toBe('checkbox');
    expect(cb!.checked).toBe(false);
    expect(cb!.getAttribute('data-pkc-lid')).toBe('tl1');
  });

  it('no warning confirm is shown when no references are missing', async () => {
    const cap = installDownloadCapture();
    const cf = installConfirmStub(false);
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'no refs', createdAt: '2026-04-09T10:00:00Z' },
      ]);
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      // No confirm call because nothing is missing.
      expect(cf.calls.length).toBe(0);
      // Download proceeds.
      expect(cap.captures.length).toBe(1);
    } finally {
      cf.restore();
      cap.restore();
    }
  });

  it('shows a warning confirm when a referenced asset is missing and reports the count', async () => {
    const cap = installDownloadCapture();
    const cf = installConfirmStub(true); // user continues
    try {
      mountTextlogWithMissingRef();
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(cf.calls.length).toBe(1);
      // The warning message must mention the exact count.
      expect(cf.calls[0]).toContain('1 件');
      expect(cap.captures.length).toBe(1);
    } finally {
      cf.restore();
      cap.restore();
    }
  });

  it('cancelling the warning prevents any download (and never creates a blob URL)', async () => {
    const cap = installDownloadCapture();
    const cf = installConfirmStub(false); // user cancels
    try {
      mountTextlogWithMissingRef();
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
      expect(cf.calls.length).toBe(1);
      expect(cap.captures.length).toBe(0);
    } finally {
      cf.restore();
      cap.restore();
    }
  });

  it('cancelling the warning does not mutate container state', async () => {
    const cap = installDownloadCapture();
    const cf = installConfirmStub(false); // user cancels
    try {
      const dispatcher = createDispatcher();
      dispatcher.onState((state) => render(state, root));
      const container: Container = {
        ...mockContainer,
        assets: {},
        entries: [
          {
            lid: 'tl1',
            title: 'Work Log',
            body: serializeTextlogBody({
              entries: [
                {
                  id: 'log-1',
                  text: 'See ![chart](asset:ast-missing)',
                  createdAt: '2026-04-09T10:00:00Z',
                  flags: [],
                },
              ],
            }),
            archetype: 'textlog',
            created_at: '2026-04-09T00:00:00Z',
            updated_at: '2026-04-09T00:00:00Z',
          },
        ],
      };
      dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
      render(dispatcher.getState(), root);
      cleanup = bindActions(root, dispatcher);
      dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
      const before = JSON.stringify(dispatcher.getState().container);

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(JSON.stringify(dispatcher.getState().container)).toBe(before);
    } finally {
      cf.restore();
      cap.restore();
    }
  });

  it('compact checkbox checked → manifest.compacted = true on the downloaded bundle', async () => {
    const cap = installDownloadCapture();
    // No missing refs in this variant, so no confirm will fire.
    const cf = installConfirmStub(true);
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'hello', createdAt: '2026-04-09T10:00:00Z' },
      ]);
      const cb = root.querySelector<HTMLInputElement>(
        'input[data-pkc-control="textlog-export-compact"]',
      )!;
      cb.checked = true;

      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(cap.captures.length).toBe(1);
      const blob = cap.captures[0]!.blob!;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      // Find EOCD + central directory to locate manifest.json.
      let eocd = -1;
      for (let i = buf.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      expect(eocd).toBeGreaterThanOrEqual(0);
      const total = view.getUint16(eocd + 10, true);
      const cdOffset = view.getUint32(eocd + 16, true);
      const decoder = new TextDecoder();
      let p = cdOffset;
      let manifestBytes: Uint8Array | null = null;
      for (let i = 0; i < total; i++) {
        const compressed = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOff = view.getUint32(p + 42, true);
        const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
        if (name === 'manifest.json') {
          const localNameLen = view.getUint16(localOff + 26, true);
          const localExtraLen = view.getUint16(localOff + 28, true);
          const dataStart = localOff + 30 + localNameLen + localExtraLen;
          manifestBytes = buf.slice(dataStart, dataStart + compressed);
        }
        p += 46 + nameLen + extraLen + commentLen;
      }
      expect(manifestBytes).not.toBeNull();
      const manifest = JSON.parse(decoder.decode(manifestBytes!)) as { compacted: boolean };
      expect(manifest.compacted).toBe(true);
    } finally {
      cf.restore();
      cap.restore();
    }
  });

  it('compact checkbox unchecked → manifest.compacted = false on the downloaded bundle', async () => {
    const cap = installDownloadCapture();
    const cf = installConfirmStub(true);
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'hello', createdAt: '2026-04-09T10:00:00Z' },
      ]);
      // Leave the checkbox unchecked (the default).
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="export-textlog-csv-zip"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();

      expect(cap.captures.length).toBe(1);
      const blob = cap.captures[0]!.blob!;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      let eocd = -1;
      for (let i = buf.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      const total = view.getUint16(eocd + 10, true);
      const cdOffset = view.getUint32(eocd + 16, true);
      const decoder = new TextDecoder();
      let p = cdOffset;
      let manifestBytes: Uint8Array | null = null;
      for (let i = 0; i < total; i++) {
        const compressed = view.getUint32(p + 20, true);
        const nameLen = view.getUint16(p + 28, true);
        const extraLen = view.getUint16(p + 30, true);
        const commentLen = view.getUint16(p + 32, true);
        const localOff = view.getUint32(p + 42, true);
        const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
        if (name === 'manifest.json') {
          const localNameLen = view.getUint16(localOff + 26, true);
          const localExtraLen = view.getUint16(localOff + 28, true);
          const dataStart = localOff + 30 + localNameLen + localExtraLen;
          manifestBytes = buf.slice(dataStart, dataStart + compressed);
        }
        p += 46 + nameLen + extraLen + commentLen;
      }
      expect(manifestBytes).not.toBeNull();
      const manifest = JSON.parse(decoder.decode(manifestBytes!)) as { compacted: boolean };
      expect(manifest.compacted).toBe(false);
    } finally {
      cf.restore();
      cap.restore();
    }
  });
});

// ── Interactive task list checkbox toggle ──
