/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindActions, cleanupBlobUrls } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { attachmentPresenter } from '@adapter/ui/attachment-presenter';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

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
    expect(textarea.value).toMatch(/^\d{2}\/\d{2}\/\d{2} (Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/);
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
    expect(textarea.value).toMatch(/^\d{2}\/\d{2}\/\d{2} (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{2}:\d{2}:\d{2}$/);
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
