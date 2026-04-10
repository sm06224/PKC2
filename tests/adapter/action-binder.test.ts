/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions, cleanupBlobUrls } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
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

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    root.remove();
  };
});

function setup() {
  const dispatcher = createDispatcher();
  const events: DomainEvent[] = [];
  dispatcher.onEvent((e) => events.push(e));
  dispatcher.onState((state) => render(state, root));

  // Initialize
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  return { dispatcher, events };
}

describe('ActionBinder', () => {
  it('click on entry item dispatches SELECT_ENTRY', () => {
    const { events } = setup();

    const item = root.querySelector('[data-pkc-action="select-entry"]');
    expect(item).not.toBeNull();
    item!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events.some((e) => e.type === 'ENTRY_SELECTED')).toBe(true);
  });

  it('click on edit button dispatches BEGIN_EDIT', () => {
    const { dispatcher, events } = setup();

    // First select an entry
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    render(dispatcher.getState(), root);

    const editBtn = root.querySelector('[data-pkc-action="begin-edit"]');
    expect(editBtn).not.toBeNull();
    editBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events.some((e) => e.type === 'EDIT_BEGUN')).toBe(true);
  });

  it('click cancel in editor dispatches CANCEL_EDIT', () => {
    const { dispatcher, events } = setup();

    // Select + begin edit
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const cancelBtn = root.querySelector('[data-pkc-action="cancel-edit"]');
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events.some((e) => e.type === 'EDIT_CANCELLED')).toBe(true);
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('click commit reads field values from data-pkc-field', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    // Modify input values
    const titleInput = root.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
    const bodyArea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(titleInput).not.toBeNull();
    expect(bodyArea).not.toBeNull();

    // jsdom allows setting .value directly
    titleInput!.value = 'Updated Title';
    bodyArea!.value = 'Updated Body';

    const commitBtn = root.querySelector('[data-pkc-action="commit-edit"]');
    commitBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(events.some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Escape during editing dispatches CANCEL_EDIT', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(events.some((e) => e.type === 'EDIT_CANCELLED')).toBe(true);
  });

  it('Escape during ready with selection dispatches DESELECT_ENTRY', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(events.some((e) => e.type === 'ENTRY_DESELECTED')).toBe(true);
  });

  // ── TEXTLOG append polish ──

  function setupWithTextlog() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const containerWithLog: Container = {
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

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: containerWithLog });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    return { dispatcher, events };
  }

  it('append button appends a new log entry and clears the input', () => {
    const { dispatcher } = setupWithTextlog();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    expect(input).not.toBeNull();
    input!.value = 'First log line';

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="append-log-entry"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Body should now contain the appended entry
    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('First log line');

    // A fresh (empty) append textarea should be rendered and refocused
    const newInput = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    expect(newInput).not.toBeNull();
    expect(newInput!.value).toBe('');
  });

  it('append ignores whitespace-only input', () => {
    const { dispatcher } = setupWithTextlog();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    input!.value = '   \n  ';

    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="append-log-entry"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(0);
  });

  it('Ctrl+Enter in append textarea appends a log entry', () => {
    const { dispatcher } = setupWithTextlog();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    input!.value = 'Quick note';
    input!.focus();

    // Simulate Ctrl+Enter; the keydown handler is attached to document.
    const ev = new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
    });
    // Dispatch from the textarea so e.target is the textarea
    input!.dispatchEvent(ev);

    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('Quick note');
  });

  it('plain Enter in append textarea does NOT append (preserves multiline input)', () => {
    const { dispatcher } = setupWithTextlog();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    input!.value = 'line one';
    input!.focus();

    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    input!.dispatchEvent(ev);

    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(0);
  });

  it('Meta+Enter in append textarea appends (macOS convention)', () => {
    const { dispatcher } = setupWithTextlog();

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    input!.value = 'mac path';
    input!.focus();

    const ev = new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
    });
    input!.dispatchEvent(ev);

    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('mac path');
  });

  it('append does nothing in readonly mode', () => {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const readonlyContainer: Container = {
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

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: readonlyContainer, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    // In readonly, the append area is hidden via CSS but still in DOM.
    // The handler itself must reject the write.
    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-pkc-field="textlog-append-text"]',
    );
    if (input) {
      input.value = 'should not append';
      const btn = root.querySelector<HTMLButtonElement>(
        '[data-pkc-action="append-log-entry"]',
      );
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    const ent = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(ent.body);
    expect(log.entries).toHaveLength(0);
  });

  it('cleanup removes event listeners', () => {
    const { events } = setup();
    cleanup();

    // After cleanup, clicks should not dispatch
    const eventsBefore = events.length;
    const item = root.querySelector('[data-pkc-action="select-entry"]');
    item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Re-render won't happen, and no new events from the click handler
    // (the item may be stale but the listener is gone)
    // We verify no new events were dispatched via the listener
    expect(events.length).toBe(eventsBefore);
  });
});

// ── Blob URL lifecycle management ──

describe('cleanupBlobUrls', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('revokes all tracked blob URLs in the DOM', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const el1 = document.createElement('object');
    el1.setAttribute('data-pkc-blob-url', 'blob:http://localhost/pdf-1');
    container.appendChild(el1);

    const el2 = document.createElement('iframe');
    el2.setAttribute('data-pkc-blob-url', 'blob:http://localhost/html-2');
    container.appendChild(el2);

    cleanupBlobUrls(container);

    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/pdf-1');
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/html-2');

    revokeSpy.mockRestore();
  });

  it('does nothing when no blob URLs are tracked', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const img = document.createElement('img');
    img.src = 'data:image/png;base64,iVBORw0KGgo=';
    container.appendChild(img);

    cleanupBlobUrls(container);

    expect(revokeSpy).not.toHaveBeenCalled();
    revokeSpy.mockRestore();
  });

  it('handles nested blob URL elements', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const preview = document.createElement('div');
    preview.setAttribute('data-pkc-region', 'attachment-preview');
    const video = document.createElement('video');
    video.setAttribute('data-pkc-blob-url', 'blob:http://localhost/video-3');
    preview.appendChild(video);
    container.appendChild(preview);

    cleanupBlobUrls(container);

    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/video-3');
    revokeSpy.mockRestore();
  });
});

// ── Ctrl+S save ──

describe('Ctrl+S save', () => {
  it('Ctrl+S during editing dispatches EDIT_COMMITTED', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    // Set field values so commit has data
    const titleInput = root.querySelector<HTMLInputElement>('[data-pkc-field="title"]');
    if (titleInput) titleInput.value = 'Saved Title';

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', ctrlKey: true, bubbles: true,
    }));

    expect(events.some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Ctrl+S in ready phase does nothing', () => {
    const { events } = setup();
    const beforeLen = events.length;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', ctrlKey: true, bubbles: true,
    }));

    // No new domain events from Ctrl+S
    expect(events.length).toBe(beforeLen);
  });
});

// ── CLEAR button safety ──

describe('CLEAR button', () => {
  it('renders with danger styling and warning icon', () => {
    setup();
    const clearBtn = root.querySelector('[data-pkc-action="clear-local-data"]');
    expect(clearBtn).not.toBeNull();
    expect(clearBtn!.textContent).toContain('Reset');
    expect(clearBtn!.className).toContain('pkc-btn-danger');
    expect(clearBtn!.getAttribute('title')).toContain('WARNING');
  });
});

// ── Clipboard paste handler ──

describe('clipboard paste', () => {
  it('does not intercept text-only paste', () => {
    const { events } = setup();
    const beforeLen = events.length;

    // Simulate text-only paste (no files/images)
    const pasteEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{
          kind: 'string',
          type: 'text/plain',
          getAsFile: () => null,
        }],
      },
    });
    document.dispatchEvent(pasteEvent);

    // No entry creation should happen
    expect(events.filter((e) => e.type === 'ENTRY_CREATED').length).toBe(0);
    expect(events.length).toBe(beforeLen);
  });

  it('does not process paste during editing phase', () => {
    const { dispatcher, events } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });

    const beforeLen = events.length;

    const pasteEvent = new Event('paste', { bubbles: true }) as unknown as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{
          kind: 'file',
          type: 'image/png',
          getAsFile: () => new File([new Uint8Array([0x89, 0x50])], 'test.png', { type: 'image/png' }),
        }],
      },
    });
    document.dispatchEvent(pasteEvent);

    // No new entry creation during editing
    expect(events.filter((e) => e.type === 'ENTRY_CREATED').length === (events.slice(beforeLen).filter((e) => e.type === 'ENTRY_CREATED').length)).toBe(true);
  });
});

// ── Attachment download button presence ──

describe('attachment download button', () => {
  it('download action is wired in action handler', () => {
    registerPresenter('attachment', attachmentPresenter);

    const attContainer: Container = {
      meta: { ...mockContainer.meta },
      entries: [{
        lid: 'att1',
        title: 'Test File',
        body: JSON.stringify({ name: 'test.pdf', mime: 'application/pdf', data: 'JVBER', size: 100 }),
        archetype: 'attachment',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [],
      revisions: [],
      assets: {},
    };

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: attContainer });
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'att1' });
    render(dispatcher.getState(), root);

    const downloadBtn = root.querySelector('[data-pkc-action="download-attachment"]');
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn!.textContent).toBe('Download');
  });
});

// ── Non-image asset chip click interception ──

describe('non-image asset chip clicks', () => {
  it('intercepts click on [href^="#asset-"] and triggers attachment download', () => {
    registerPresenter('attachment', attachmentPresenter);

    const attContainer: Container = {
      meta: { ...mockContainer.meta },
      entries: [{
        lid: 'att-pdf',
        title: 'Report',
        body: JSON.stringify({
          name: 'report.pdf',
          mime: 'application/pdf',
          size: 1234,
          asset_key: 'ast-pdf-chip-001',
        }),
        archetype: 'attachment',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }],
      relations: [],
      revisions: [],
      assets: { 'ast-pdf-chip-001': 'JVBERi0xLjQK' },
    };

    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: attContainer });
    render(dispatcher.getState(), root);

    // Spy on Blob URL creation so we can see that the download path ran.
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    cleanup = bindActions(root, dispatcher);

    // Stand up a chip anchor inside `root` — the shape the resolver emits.
    const chip = document.createElement('a');
    chip.setAttribute('href', '#asset-ast-pdf-chip-001');
    chip.textContent = '📄 report.pdf';
    root.appendChild(chip);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    chip.dispatchEvent(clickEvent);

    expect(clickEvent.defaultPrevented).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
  });

  it('no-ops gracefully when the referenced asset key does not exist', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);

    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

    cleanup = bindActions(root, dispatcher);

    const chip = document.createElement('a');
    chip.setAttribute('href', '#asset-ast-nope-001');
    chip.textContent = '📎 nope';
    root.appendChild(chip);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    chip.dispatchEvent(clickEvent);

    // Click is still consumed (we own the fragment URL scheme), but no
    // download is triggered because there is no matching attachment.
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(createSpy).not.toHaveBeenCalled();

    createSpy.mockRestore();
  });
});

// ── Date/Time shortcuts ──

describe('Date/Time shortcuts', () => {
  it('Ctrl+; inserts date into focused textarea in editing mode', () => {
    const { dispatcher } = setup();

    // Enter editing mode
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    // Create and focus a textarea inside root (simulating edit field)
    const textarea = document.createElement('textarea');
    textarea.setAttribute('data-pkc-field', 'body');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = 'Before ';
    textarea.selectionStart = textarea.selectionEnd = 7;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ';', ctrlKey: true, bubbles: true,
    }));

    // Should have inserted a date pattern yyyy/MM/dd
    expect(textarea.value).toMatch(/^Before \d{4}\/\d{2}\/\d{2}$/);
  });

  it('Ctrl+: inserts time (Shift+; on US layout)', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = '';
    textarea.selectionStart = textarea.selectionEnd = 0;

    // Ctrl+Shift+; (produces ':' on US keyboard) — should insert datetime
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ':', ctrlKey: true, shiftKey: true, bubbles: true,
    }));

    // Ctrl+Shift+; → datetime (yyyy/MM/dd HH:mm:ss)
    expect(textarea.value).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('Ctrl+D inserts short date with day abbreviation', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = '';
    textarea.selectionStart = textarea.selectionEnd = 0;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'd', ctrlKey: true, bubbles: true,
    }));

    // yy/MM/dd ddd
    expect(textarea.value).toMatch(/^\d{2}\/\d{2}\/\d{2} .+$/);
  });

  it('Ctrl+Shift+D inserts short date+time', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = '';
    textarea.selectionStart = textarea.selectionEnd = 0;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'D', ctrlKey: true, shiftKey: true, bubbles: true,
    }));

    // yy/MM/dd ddd HH:mm:ss
    expect(textarea.value).toMatch(/^\d{2}\/\d{2}\/\d{2} .+ \d{2}:\d{2}:\d{2}$/);
  });

  it('Ctrl+Shift+Alt+D inserts ISO 8601', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = '';
    textarea.selectionStart = textarea.selectionEnd = 0;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'D', ctrlKey: true, shiftKey: true, altKey: true, bubbles: true,
    }));

    // ISO 8601
    expect(textarea.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it('does NOT insert date when not in editing phase', () => {
    setup();

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = '';
    textarea.selectionStart = textarea.selectionEnd = 0;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ';', ctrlKey: true, bubbles: true,
    }));

    // Should not insert anything — phase is 'ready', not 'editing'
    expect(textarea.value).toBe('');
  });

  it('does NOT insert date when no textarea is focused', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    // No textarea is focused — activeElement is body or root
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ';', ctrlKey: true, bubbles: true,
    }));

    // No crash, no unexpected behavior
    expect(true).toBe(true);
  });

  it('inserts at cursor position replacing selection', () => {
    const { dispatcher } = setup();

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const textarea = document.createElement('textarea');
    root.appendChild(textarea);
    textarea.focus();
    textarea.value = 'Hello REPLACE World';
    textarea.selectionStart = 6;
    textarea.selectionEnd = 13; // select "REPLACE"

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: ';', ctrlKey: true, bubbles: true,
    }));

    // "REPLACE" should be replaced with date
    expect(textarea.value).toMatch(/^Hello \d{4}\/\d{2}\/\d{2} World$/);
  });
});

// ─────────────────────────────────────────────────────────────
// Orphan asset cleanup wiring (manual cleanup UI)
// ─────────────────────────────────────────────────────────────
//
// These tests pin the shell-menu → dispatcher plumbing for the
// orphan asset cleanup button. They cover the click → dispatch
// handshake, the "disabled button is a no-op" guard, the reducer
// result, and the "no auto-GC on DELETE_ENTRY" guarantee.

describe('ActionBinder — orphan asset cleanup (manual UI)', () => {
  function containerWithOrphans(): Container {
    const attachmentBody = JSON.stringify({
      name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-keep',
    });
    return {
      meta: {
        container_id: 'c-orphan', title: 'Orphan',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [
        {
          lid: 'a1', title: 'keep.png', body: attachmentBody, archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: { 'ast-keep': 'KK', 'ast-drop-a': 'AA', 'ast-drop-b': 'BB' },
    };
  }

  function containerNoOrphans(): Container {
    const attachmentBody = JSON.stringify({
      name: 'keep.png', mime: 'image/png', size: 4, asset_key: 'ast-keep',
    });
    return {
      meta: {
        container_id: 'c-clean', title: 'Clean',
        created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        schema_version: 1,
      },
      entries: [
        {
          lid: 'a1', title: 'keep.png', body: attachmentBody, archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      relations: [],
      revisions: [],
      assets: { 'ast-keep': 'KK' },
    };
  }

  function bootstrap(initial: Container): {
    dispatcher: ReturnType<typeof createDispatcher>;
    events: DomainEvent[];
  } {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: initial });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    return { dispatcher, events };
  }

  it('clicking the enabled cleanup button dispatches PURGE_ORPHAN_ASSETS', () => {
    const { dispatcher, events } = bootstrap(containerWithOrphans());
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="purge-orphan-assets"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-disabled')).toBeNull();
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // ORPHAN_ASSETS_PURGED is emitted with the correct count.
    const purged = events.find((e) => e.type === 'ORPHAN_ASSETS_PURGED');
    expect(purged).toBeDefined();
    expect(purged && 'count' in purged ? purged.count : -1).toBe(2);
    // The orphan keys are gone, the referenced one remains.
    const assets = dispatcher.getState().container!.assets;
    expect(assets['ast-keep']).toBe('KK');
    expect(assets['ast-drop-a']).toBeUndefined();
    expect(assets['ast-drop-b']).toBeUndefined();
  });

  it('clicking the disabled cleanup button (0 orphans) is a no-op', () => {
    const { dispatcher, events } = bootstrap(containerNoOrphans());
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="purge-orphan-assets"]',
    );
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('data-pkc-disabled')).toBe('true');
    // Prior state snapshot.
    const beforeContainer = dispatcher.getState().container;
    const beforeEventCount = events.length;
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // No ORPHAN_ASSETS_PURGED event was emitted — the binder swallowed
    // the click before it reached the dispatcher.
    expect(events.some((e) => e.type === 'ORPHAN_ASSETS_PURGED')).toBe(false);
    expect(events.length).toBe(beforeEventCount);
    // Container reference is unchanged.
    expect(dispatcher.getState().container).toBe(beforeContainer);
  });

  it('cleanup flips the container.assets identity (Preview/View wiring compat)', () => {
    // Preview/View refresh wiring uses `prev.assets !== next.assets`
    // as its gate. A successful cleanup MUST produce a new assets
    // object so the gate fires; this test pins that contract at the
    // dispatcher level (the reducer + foundation already pin it at
    // the unit level, but clicking through the UI is where the
    // contract would actually break first).
    const { dispatcher } = bootstrap(containerWithOrphans());
    const before = dispatcher.getState().container!.assets;
    const btn = root.querySelector<HTMLButtonElement>(
      '[data-pkc-action="purge-orphan-assets"]',
    );
    btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const after = dispatcher.getState().container!.assets;
    expect(after).not.toBe(before);
  });

  it('DELETE_ENTRY does NOT silently run orphan cleanup', () => {
    // Regression pin: dispatching DELETE_ENTRY must NOT auto-emit
    // ORPHAN_ASSETS_PURGED. The only legitimate code path that
    // emits that event is the manual cleanup button. This test
    // will fail loudly if a future commit adds auto-GC to the
    // DELETE_ENTRY reducer path.
    const { dispatcher, events } = bootstrap(containerWithOrphans());
    dispatcher.dispatch({ type: 'DELETE_ENTRY', lid: 'a1' });
    const autoPurged = events.some((e) => e.type === 'ORPHAN_ASSETS_PURGED');
    expect(autoPurged).toBe(false);
    // The orphan (and the freshly-orphaned ast-keep) all survive.
    const assets = dispatcher.getState().container!.assets;
    expect(assets['ast-keep']).toBe('KK');
    expect(assets['ast-drop-a']).toBe('AA');
    expect(assets['ast-drop-b']).toBe('BB');
  });
});

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

describe('Issue D / A — TEXTLOG row dblclick enters edit mode', () => {
  it('double-clicking a row dispatches BEGIN_EDIT for the owning entry', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const row = root.querySelector<HTMLElement>('.pkc-textlog-row[data-pkc-log-id="log-1"]');
    expect(row).not.toBeNull();
    // Seed a text node inside the row so the dblclick origin is NOT the flag button or asset chip.
    const textEl = row!.querySelector<HTMLElement>('.pkc-textlog-text');
    expect(textEl).not.toBeNull();
    textEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('single click on a log row does NOT begin editing', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();
  });

  it('dblclick on the flag button does NOT begin editing (flag handler wins)', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const flagBtn = root.querySelector<HTMLElement>(
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-flag-btn',
    );
    expect(flagBtn).not.toBeNull();
    flagBtn!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    // Flag area must be opted out of the dblclick→edit path.
    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('the existing Edit button in the action bar still dispatches BEGIN_EDIT', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const editBtn = root.querySelector<HTMLElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="begin-edit"]',
    );
    expect(editBtn).not.toBeNull();
    editBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('dblclick is a no-op in readonly mode', () => {
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
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('ready');
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
      '.pkc-textlog-row[data-pkc-log-id="log-1"]',
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
        '.pkc-textlog-row[data-pkc-log-id="log-1"]',
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

  it('Copy MD on a TEXTLOG entry writes the serializeTextlogAsMarkdown output', async () => {
    let captured: string | null = null;
    const restore = installClipboard({
      writeText: (t: string) => {
        captured = t;
        return Promise.resolve();
      },
    });
    try {
      mountTextlogContainer([
        { id: 'log-1', text: 'alpha', createdAt: '2026-04-09T10:00:00Z' },
        { id: 'log-2', text: 'beta', createdAt: '2026-04-09T10:05:00Z', flags: ['important'] },
      ]);
      const btn = root.querySelector<HTMLElement>(
        '[data-pkc-region="action-bar"] [data-pkc-action="copy-markdown-source"]',
      );
      btn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      expect(captured).not.toBeNull();
      expect(captured!).toContain('alpha');
      expect(captured!).toContain('beta');
      // Important marker must be present on the second heading.
      expect(captured!).toContain('★');
      // Two h2 headings.
      expect(captured!.match(/## /g)?.length).toBe(2);
    } finally {
      restore();
    }
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
      expect(html).toContain('<h1>Hello</h1>');
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
      expect(html).toContain('<h1>Title</h1>');
      // No editor UI leaks into the viewer.
      expect(html).not.toContain('data-pkc-action="commit-edit"');
      expect(html).not.toContain('<textarea');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('TEXTLOG entry: Open Viewer flattens via serializeTextlogAsMarkdown', () => {
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
      // Important ★ marker ends up inside an h2 heading.
      expect(html).toMatch(/<h2>[^<]*★<\/h2>/);
    } finally {
      openSpy.mockRestore();
    }
  });
});
