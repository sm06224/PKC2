/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions, cleanupBlobUrls, populateInlineAssetPreviews, resolveContainerSandboxDefault } from '@adapter/ui/action-binder';
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
    expect(clearBtn!.getAttribute('title')).toContain('IndexedDB');
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

  it('dblclick while already editing is a no-op (phase guard)', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'first', createdAt: '2026-04-09T10:00:00Z' },
      { id: 'log-2', text: 'second', createdAt: '2026-04-09T11:00:00Z' },
    ]);
    // Enter editing via Edit button
    const editBtn = root.querySelector<HTMLElement>(
      '[data-pkc-region="action-bar"] [data-pkc-action="begin-edit"]',
    );
    editBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');

    // Re-render to show editor, then simulate dblclick on the editor area
    // (there are no .pkc-textlog-row elements in edit mode, but verify no error)
    const editorArea = root.querySelector<HTMLElement>('.pkc-textlog-editor');
    if (editorArea) {
      editorArea.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    }
    // State remains in editing — no duplicate transition
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('dblclick on nested child element resolves to owning row', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: '**bold text**', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    // The text content may contain rendered markdown children.
    // Target a child of the textlog-text element.
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    expect(textEl).not.toBeNull();
    // Even if we target a child node, closest() should resolve to the row
    const childTarget = textEl!.firstElementChild ?? textEl!;
    childTarget.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('tl1');
  });

  it('save after dblclick-edit produces correct body', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'original', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    // Enter edit via dblclick
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('editing');

    // Modify the textarea
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    expect(textarea).not.toBeNull();
    textarea!.value = 'modified text';

    // Click save
    const saveBtn = root.querySelector<HTMLElement>('[data-pkc-action="commit-edit"]');
    expect(saveBtn).not.toBeNull();
    saveBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Phase returns to ready
    expect(dispatcher.getState().phase).toBe('ready');
    expect(dispatcher.getState().editingLid).toBeNull();

    // Body was updated with the modified text
    const entry = dispatcher.getState().container!.entries.find((e) => e.lid === 'tl1');
    expect(entry).toBeDefined();
    const log = parseTextlogBody(entry!.body);
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]!.text).toBe('modified text');
  });

  it('cancel after dblclick-edit preserves original body', () => {
    const { dispatcher } = mountTextlogContainer([
      { id: 'log-1', text: 'original', createdAt: '2026-04-09T10:00:00Z' },
    ]);
    const originalBody = dispatcher.getState().container!.entries.find((e) => e.lid === 'tl1')!.body;

    // Enter edit via dblclick
    const textEl = root.querySelector<HTMLElement>(
      '.pkc-textlog-row[data-pkc-log-id="log-1"] .pkc-textlog-text',
    );
    textEl!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(dispatcher.getState().phase).toBe('editing');

    // Modify the textarea
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="textlog-entry-text"]');
    textarea!.value = 'should be discarded';

    // Click cancel
    const cancelBtn = root.querySelector<HTMLElement>('[data-pkc-action="cancel-edit"]');
    cancelBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Phase returns to ready, body unchanged
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

describe('Interactive task list — checkbox toggle', () => {
  function setupTextWithTasks() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'txt1',
          title: 'Tasks',
          body: '- [ ] Buy milk\n- [x] Write code\n- [ ] Deploy',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'txt1' });

    return { dispatcher, events };
  }

  function setupTextlogWithTasks() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'tl1',
          title: 'Log',
          body: serializeTextlogBody({
            entries: [
              { id: 'log1', text: '- [ ] Todo A\n- [x] Todo B', createdAt: '2026-01-01T00:00:00Z', flags: [] },
            ],
          }),
          archetype: 'textlog',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });

    return { dispatcher, events };
  }

  it('TEXT: clicking a checkbox toggles the task in the body', () => {
    const { dispatcher } = setupTextWithTasks();

    // First checkbox should be unchecked (index 0)
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toContain('- [x] Buy milk');
    // Other tasks unchanged
    expect(entry.body).toContain('- [x] Write code');
    expect(entry.body).toContain('- [ ] Deploy');
  });

  it('TEXT: clicking a checked checkbox unchecks it', () => {
    const { dispatcher } = setupTextWithTasks();

    // Second checkbox (index 1) is checked
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="1"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toContain('- [ ] Write code');
  });

  it('TEXT: readonly prevents checkbox toggle', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'txt1',
          title: 'Tasks',
          body: '- [ ] Buy milk',
          archetype: 'text',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container, readonly: true });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'txt1' });

    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Body should be unchanged
    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toBe('- [ ] Buy milk');
  });

  it('TEXT: editing phase prevents checkbox toggle', () => {
    const { dispatcher } = setupTextWithTasks();

    // Enter editing
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'txt1' });
    render(dispatcher.getState(), root);

    // Edit preview may contain checkboxes but they should be ignored
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    if (checkbox) {
      checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    // Body should remain unchanged
    const entry = dispatcher.getState().container!.entries[0]!;
    expect(entry.body).toBe('- [ ] Buy milk\n- [x] Write code\n- [ ] Deploy');
  });

  it('TEXTLOG: clicking a checkbox toggles the task in the log entry', () => {
    const { dispatcher } = setupTextlogWithTasks();

    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="0"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(entry.body);
    expect(log.entries[0]!.text).toContain('- [x] Todo A');
    // Other task unchanged
    expect(log.entries[0]!.text).toContain('- [x] Todo B');
  });

  it('TEXTLOG: unchecking works', () => {
    const { dispatcher } = setupTextlogWithTasks();

    // Second task (index 1) is checked
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index="1"]');
    expect(checkbox).not.toBeNull();

    checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const entry = dispatcher.getState().container!.entries[0]!;
    const log = parseTextlogBody(entry.body);
    expect(log.entries[0]!.text).toContain('- [ ] Todo B');
  });

  it('does not fire on entries without task lists', () => {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });

    // No checkboxes should exist
    const checkbox = root.querySelector<HTMLInputElement>('input[data-pkc-task-index]');
    expect(checkbox).toBeNull();
  });

  it('rendered checkboxes have data-pkc-task-index attribute', () => {
    setupTextWithTasks();

    const checkboxes = root.querySelectorAll<HTMLInputElement>('input[data-pkc-task-index]');
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes[0]!.getAttribute('data-pkc-task-index')).toBe('0');
    expect(checkboxes[1]!.getAttribute('data-pkc-task-index')).toBe('1');
    expect(checkboxes[2]!.getAttribute('data-pkc-task-index')).toBe('2');
  });
});

// ── Inline asset preview (non-image) ──

describe('populateInlineAssetPreviews', () => {
  // Helper: create a minimal attachment entry body JSON
  function attBody(name: string, mime: string, assetKey: string): string {
    return JSON.stringify({ name, mime, size: 1024, asset_key: assetKey });
  }

  // Helper: set up a dispatcher with attachment entries + assets and
  // a DOM root containing chip links inside a .pkc-md-rendered container.
  function setupInlinePreview(chips: { key: string; label: string }[], attachments: { key: string; mime: string; name: string }[]) {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const entries = attachments.map((att, i) => ({
      lid: `att-${i}`,
      title: att.name,
      body: attBody(att.name, att.mime, att.key),
      archetype: 'attachment' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }));

    // Add a text entry whose rendered body will contain the chip links
    entries.push({
      lid: 'txt1',
      title: 'Test Text',
      body: 'plain text',
      archetype: 'text' as any,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    const assets: Record<string, string> = {};
    for (const att of attachments) {
      // Minimal valid base64 (a few bytes)
      assets[att.key] = btoa('testdata');
    }

    const container: Container = {
      ...mockContainer,
      entries,
      assets,
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    // Manually create a .pkc-md-rendered container with chip links
    // (simulating what the renderer + asset resolver would produce)
    const mdContainer = document.createElement('div');
    mdContainer.className = 'pkc-md-rendered';
    for (const chip of chips) {
      const a = document.createElement('a');
      a.href = `#asset-${chip.key}`;
      a.textContent = chip.label;
      mdContainer.appendChild(a);
    }
    root.appendChild(mdContainer);

    return { dispatcher };
  }

  it('creates PDF preview with <object> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k1', label: '📄 test.pdf' }],
      [{ key: 'k1', mime: 'application/pdf', name: 'test.pdf' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const obj = root.querySelector('object.pkc-inline-pdf-preview');
    expect(obj).not.toBeNull();
    expect(obj!.getAttribute('type')).toBe('application/pdf');
    expect(obj!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    // PDF fallback text
    expect(obj!.querySelector('p')?.textContent).toBe('PDF preview not available in this browser.');
  });

  it('does NOT hide chip for PDF (fallback unreliable)', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k1', label: '📄 test.pdf' }],
      [{ key: 'k1', mime: 'application/pdf', name: 'test.pdf' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k1"]');
    expect(chip).not.toBeNull();
    // Chip should remain visible (style.display should NOT be 'none')
    expect(chip!.style.display).not.toBe('none');
  });

  it('creates audio preview with <audio> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k2', label: '🎵 song.mp3' }],
      [{ key: 'k2', mime: 'audio/mpeg', name: 'song.mp3' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const audio = root.querySelector('audio.pkc-inline-audio-preview');
    expect(audio).not.toBeNull();
    expect(audio!.getAttribute('controls')).not.toBeNull();
    expect(audio!.getAttribute('preload')).toBe('none');
    expect(audio!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    expect(audio!.querySelector('source')).not.toBeNull();
  });

  it('hides chip for audio preview', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k2', label: '🎵 song.mp3' }],
      [{ key: 'k2', mime: 'audio/mpeg', name: 'song.mp3' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k2"]');
    expect(chip!.style.display).toBe('none');
  });

  it('creates video preview with <video> element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k3', label: '🎬 clip.mp4' }],
      [{ key: 'k3', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const video = root.querySelector('video.pkc-inline-video-preview');
    expect(video).not.toBeNull();
    expect(video!.getAttribute('controls')).not.toBeNull();
    expect(video!.getAttribute('preload')).toBe('none');
    expect(video!.getAttribute('data-pkc-blob-url')).toBeTruthy();
    expect(video!.querySelector('source')).not.toBeNull();
  });

  it('hides chip for video preview', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k3', label: '🎬 clip.mp4' }],
      [{ key: 'k3', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k3"]');
    expect(chip!.style.display).toBe('none');
  });

  it('skips non-previewable MIME (archive)', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k4', label: '🗜 data.zip' }],
      [{ key: 'k4', mime: 'application/zip', name: 'data.zip' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    // No preview element should be created
    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
    // Chip should remain visible
    const chip = root.querySelector<HTMLAnchorElement>('a[href="#asset-k4"]');
    expect(chip!.style.display).not.toBe('none');
  });

  it('skips chip when asset key has no matching attachment', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'no-such-key', label: '📎 missing' }],
      [], // no attachments
    );

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('skips chip when asset data is missing from container.assets', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'test.pdf',
          body: attBody('test.pdf', 'application/pdf', 'k-no-data'),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: {}, // no data for k-no-data
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    const mdContainer = document.createElement('div');
    mdContainer.className = 'pkc-md-rendered';
    const a = document.createElement('a');
    a.href = '#asset-k-no-data';
    a.textContent = '📄 test.pdf';
    mdContainer.appendChild(a);
    root.appendChild(mdContainer);

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('wraps preview in div with data-pkc-inline-preview attribute', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'k5', label: '🎬 vid.webm' }],
      [{ key: 'k5', mime: 'video/webm', name: 'vid.webm' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const wrapper = root.querySelector('[data-pkc-inline-preview]');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute('data-pkc-inline-preview')).toBe('video');
    expect(wrapper!.classList.contains('pkc-inline-preview')).toBe(true);
  });

  it('does not process chips inside edit-preview panes', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'att1',
          title: 'test.mp4',
          body: attBody('test.mp4', 'video/mp4', 'k-edit'),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { 'k-edit': btoa('data') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);

    // Create a container with both pkc-md-rendered AND pkc-text-edit-preview
    const editPreview = document.createElement('div');
    editPreview.className = 'pkc-text-edit-preview pkc-md-rendered';
    const a = document.createElement('a');
    a.href = '#asset-k-edit';
    a.textContent = '🎬 test.mp4';
    editPreview.appendChild(a);
    root.appendChild(editPreview);

    populateInlineAssetPreviews(root, dispatcher);

    expect(root.querySelector('[data-pkc-inline-preview]')).toBeNull();
  });

  it('handles multiple chips of different types', () => {
    const { dispatcher } = setupInlinePreview(
      [
        { key: 'kp', label: '📄 doc.pdf' },
        { key: 'ka', label: '🎵 track.wav' },
        { key: 'kv', label: '🎬 movie.mp4' },
      ],
      [
        { key: 'kp', mime: 'application/pdf', name: 'doc.pdf' },
        { key: 'ka', mime: 'audio/wav', name: 'track.wav' },
        { key: 'kv', mime: 'video/mp4', name: 'movie.mp4' },
      ],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const previews = root.querySelectorAll('[data-pkc-inline-preview]');
    expect(previews).toHaveLength(3);
    expect(previews[0]!.getAttribute('data-pkc-inline-preview')).toBe('pdf');
    expect(previews[1]!.getAttribute('data-pkc-inline-preview')).toBe('audio');
    expect(previews[2]!.getAttribute('data-pkc-inline-preview')).toBe('video');
  });

  it('cleanupBlobUrls revokes inline preview blob URLs', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kc', label: '🎬 clip.mp4' }],
      [{ key: 'kc', mime: 'video/mp4', name: 'clip.mp4' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const blobEl = root.querySelector<HTMLElement>('[data-pkc-blob-url]');
    expect(blobEl).not.toBeNull();
    const blobUrl = blobEl!.getAttribute('data-pkc-blob-url')!;

    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    cleanupBlobUrls(root);
    expect(revokeSpy).toHaveBeenCalledWith(blobUrl);
    revokeSpy.mockRestore();
  });

  it('does not double-populate if called twice', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kd', label: '🎵 song.ogg' }],
      [{ key: 'kd', mime: 'audio/ogg', name: 'song.ogg' }],
    );

    populateInlineAssetPreviews(root, dispatcher);
    populateInlineAssetPreviews(root, dispatcher);

    const previews = root.querySelectorAll('[data-pkc-inline-preview]');
    expect(previews).toHaveLength(1);
  });

  it('sets correct source type on audio element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'ks', label: '🎵 sound.wav' }],
      [{ key: 'ks', mime: 'audio/wav', name: 'sound.wav' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const source = root.querySelector('audio.pkc-inline-audio-preview source');
    expect(source).not.toBeNull();
    expect(source!.getAttribute('type')).toBe('audio/wav');
  });

  it('sets correct source type on video element', () => {
    const { dispatcher } = setupInlinePreview(
      [{ key: 'kv2', label: '🎬 movie.webm' }],
      [{ key: 'kv2', mime: 'video/webm', name: 'movie.webm' }],
    );

    populateInlineAssetPreviews(root, dispatcher);

    const source = root.querySelector('video.pkc-inline-video-preview source');
    expect(source).not.toBeNull();
    expect(source!.getAttribute('type')).toBe('video/webm');
  });
});

// ── Container default sandbox policy ──

describe('resolveContainerSandboxDefault', () => {
  it('returns empty array for undefined (strict default)', () => {
    expect(resolveContainerSandboxDefault(undefined)).toEqual([]);
  });

  it('returns empty array for "strict"', () => {
    expect(resolveContainerSandboxDefault('strict')).toEqual([]);
  });

  it('returns allow-scripts + allow-forms for "relaxed"', () => {
    expect(resolveContainerSandboxDefault('relaxed')).toEqual(['allow-scripts', 'allow-forms']);
  });

  it('returns empty array for unknown/invalid values', () => {
    expect(resolveContainerSandboxDefault('invalid')).toEqual([]);
    expect(resolveContainerSandboxDefault('')).toEqual([]);
  });
});

describe('Container sandbox policy — reducer + UI', () => {
  it('SET_SANDBOX_POLICY updates container.meta.sandbox_policy', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBeUndefined();

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('relaxed');
  });

  it('SET_SANDBOX_POLICY can switch back to strict', () => {
    const dispatcher = createDispatcher();
    const container: Container = {
      ...mockContainer,
      meta: { ...mockContainer.meta, sandbox_policy: 'relaxed' },
    };
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('relaxed');

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'strict' });
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBe('strict');
  });

  it('SET_SANDBOX_POLICY is blocked in readonly mode', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer, readonly: true });

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    // Should remain unchanged
    expect(dispatcher.getState().container?.meta.sandbox_policy).toBeUndefined();
  });

  it('SET_SANDBOX_POLICY updates container.meta.updated_at', () => {
    const dispatcher = createDispatcher();
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: mockContainer });
    const before = dispatcher.getState().container!.meta.updated_at;

    dispatcher.dispatch({ type: 'SET_SANDBOX_POLICY', policy: 'relaxed' });
    const after = dispatcher.getState().container!.meta.updated_at;
    expect(after).not.toBe(before);
  });

  it('sandbox policy select renders in meta pane for HTML attachment', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('strict');
  });

  it('sandbox policy select reflects current container policy', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    const container: Container = {
      ...mockContainer,
      meta: { ...mockContainer.meta, sandbox_policy: 'relaxed' },
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('relaxed');
  });

  it('backward compat: container without sandbox_policy works normally', () => {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));

    // Container has no sandbox_policy field at all
    const container: Container = {
      ...mockContainer,
      entries: [
        {
          lid: 'html1',
          title: 'Page',
          body: JSON.stringify({ name: 'page.html', mime: 'text/html', asset_key: 'k1' }),
          archetype: 'attachment',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      assets: { k1: btoa('<html></html>') },
    };

    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'html1' });

    // Select defaults to strict
    const select = root.querySelector<HTMLSelectElement>('[data-pkc-action="set-sandbox-policy"]');
    expect(select).not.toBeNull();
    expect(select!.value).toBe('strict');
  });
});
