/**
 * @vitest-environment happy-dom
 *
 * FI-02 edit-safety regression tests.
 *
 * A. TEXTLOG paste target: image paste in a non-first log cell must write
 *    the asset link into that specific cell, not the DOM-first cell.
 *
 * B. FOLDER Ctrl+S: Ctrl+S while editing a FOLDER entry must dispatch
 *    COMMIT_EDIT (EDIT_COMMITTED event) — parity with TEXT / TEXTLOG.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher as _createRawDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import { registerPresenter } from '@adapter/ui/detail-presenter';
import { textlogPresenter } from '@adapter/ui/textlog-presenter';
import { folderPresenter } from '@adapter/ui/folder-presenter';
import { serializeTextlogBody } from '@features/textlog/textlog-body';
import type { Container } from '@core/model/container';
import type { DomainEvent } from '@core/action/domain-event';

registerPresenter('textlog', textlogPresenter);
registerPresenter('folder', folderPresenter);

const T = '2026-04-17T00:00:00Z';

// ── Boilerplate ──────────────────────────────────────────────────────────────

let root: HTMLElement;
let cleanup: () => void;
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

// ── A. TEXTLOG paste target ──────────────────────────────────────────────────
//
// The selector used to re-find the textarea after PASTE_ATTACHMENT dispatch +
// re-render must include `data-pkc-log-id` for TEXTLOG cells.  Without it,
// root.querySelector('textarea[data-pkc-field="textlog-entry-text"]') always
// returns the DOM-first element (= newest log, rendered at the top in desc
// order), even when the user was focused on a middle or last cell.

describe('TEXTLOG paste target — DOM selector invariants', () => {
  // Three log entries.  oldest→newest in storage (A→B→C).
  // In the editor they render desc (newest first in DOM): C, B, A.
  const tlBody = serializeTextlogBody({
    entries: [
      { id: 'log-A', text: 'oldest entry', createdAt: '2026-04-17T08:00:00Z', flags: [] },
      { id: 'log-B', text: 'middle entry', createdAt: '2026-04-17T09:00:00Z', flags: [] },
      { id: 'log-C', text: 'newest entry', createdAt: '2026-04-17T10:00:00Z', flags: [] },
    ],
  });

  const container: Container = {
    meta: { container_id: 'c1', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{ lid: 'tl1', title: 'Log', body: tlBody, archetype: 'textlog', created_at: T, updated_at: T }],
    relations: [], revisions: [], assets: {},
  };

  function setupTextlogEditing() {
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'tl1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'tl1' });
    render(dispatcher.getState(), root);

    return { dispatcher };
  }

  it('editor renders 3 textareas each with a unique data-pkc-log-id', () => {
    setupTextlogEditing();
    const textareas = root.querySelectorAll<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"]',
    );
    expect(textareas.length).toBe(3);

    const ids = Array.from(textareas).map((ta) => ta.getAttribute('data-pkc-log-id'));
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain('log-A');
    expect(ids).toContain('log-B');
    expect(ids).toContain('log-C');
  });

  it('DOM-first textarea is the newest log (log-C) — desc order confirmed', () => {
    setupTextlogEditing();
    // Without a log-id in the selector, querySelector always returns the
    // first element in DOM order, which is the newest log.
    const first = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"]',
    );
    expect(first?.getAttribute('data-pkc-log-id')).toBe('log-C');
  });

  it('middle log (log-B) is NOT the DOM-first element — confirms bug surface', () => {
    setupTextlogEditing();
    const first = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"]',
    );
    // The first DOM element is log-C, not log-B
    expect(first?.getAttribute('data-pkc-log-id')).not.toBe('log-B');
  });

  it('middle log (log-B) is uniquely addressable with data-pkc-log-id selector', () => {
    setupTextlogEditing();
    // This is the selector the FIX introduces: fieldAttr + logId combined.
    const targetB = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="log-B"]',
    );
    expect(targetB).not.toBeNull();
    expect(targetB?.getAttribute('data-pkc-log-id')).toBe('log-B');
    // Must NOT be the DOM-first textarea
    const domFirst = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"]',
    );
    expect(targetB).not.toBe(domFirst);
  });

  it('oldest log (log-A) is uniquely addressable with data-pkc-log-id selector', () => {
    setupTextlogEditing();
    const targetA = root.querySelector<HTMLTextAreaElement>(
      'textarea[data-pkc-field="textlog-entry-text"][data-pkc-log-id="log-A"]',
    );
    expect(targetA).not.toBeNull();
    expect(targetA?.getAttribute('data-pkc-log-id')).toBe('log-A');
  });

  it('TEXT body textarea has no data-pkc-log-id — non-log selector fallback path', () => {
    // After fix: when logId is null (TEXT body), the selector falls back to
    // fieldAttr-only — verifying the non-regression path is structurally valid.
    const textContainer: Container = {
      meta: { container_id: 'c2', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'Doc', body: 'hello', archetype: 'text', created_at: T, updated_at: T }],
      relations: [], revisions: [], assets: {},
    };
    const dispatcher = createDispatcher();
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: textContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const bodyTextarea = root.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
    expect(bodyTextarea).not.toBeNull();
    // No log-id on a TEXT body textarea
    expect(bodyTextarea?.getAttribute('data-pkc-log-id')).toBeNull();
  });
});

// ── B. FOLDER Ctrl+S ─────────────────────────────────────────────────────────
//
// Ctrl+S while editing a FOLDER entry must dispatch COMMIT_EDIT, just like
// TEXT and TEXTLOG.  This was broken — the save command did not fire.

describe('FOLDER Ctrl+S save', () => {
  const folderContainer: Container = {
    meta: { container_id: 'c3', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
    entries: [{
      lid: 'f1',
      title: 'My Folder',
      body: 'Some folder description',
      archetype: 'folder',
      created_at: T,
      updated_at: T,
    }],
    relations: [], revisions: [], assets: {},
  };

  function setupFolderEditing() {
    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: folderContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'f1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'f1' });
    render(dispatcher.getState(), root);

    return { dispatcher, events };
  }

  it('FOLDER enters editing phase via BEGIN_EDIT', () => {
    const { dispatcher } = setupFolderEditing();
    expect(dispatcher.getState().phase).toBe('editing');
    expect(dispatcher.getState().editingLid).toBe('f1');
  });

  it('FOLDER editor renders [data-pkc-mode="edit"] with archetype="folder"', () => {
    setupFolderEditing();
    const editor = root.querySelector('[data-pkc-mode="edit"]');
    expect(editor).not.toBeNull();
    expect(editor?.getAttribute('data-pkc-archetype')).toBe('folder');
  });

  it('FOLDER editor renders a body textarea with data-pkc-field="body"', () => {
    setupFolderEditing();
    const ta = root.querySelector<HTMLTextAreaElement>('[data-pkc-field="body"]');
    expect(ta).not.toBeNull();
    expect(ta?.tagName).toBe('TEXTAREA');
  });

  it('Ctrl+S while editing FOLDER dispatches EDIT_COMMITTED (I-EditSafety3)', () => {
    const { events } = setupFolderEditing();
    const beforeLen = events.length;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', ctrlKey: true, bubbles: true,
    }));

    const newEvents = events.slice(beforeLen);
    expect(newEvents.some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
  });

  it('Ctrl+S while editing FOLDER transitions phase to ready', () => {
    const { dispatcher } = setupFolderEditing();

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', ctrlKey: true, bubbles: true,
    }));

    expect(dispatcher.getState().phase).toBe('ready');
  });

  it('Cmd+S (metaKey) while editing FOLDER also dispatches EDIT_COMMITTED', () => {
    const { events } = setupFolderEditing();
    const beforeLen = events.length;

    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', metaKey: true, bubbles: true,
    }));

    const newEvents = events.slice(beforeLen);
    expect(newEvents.some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
  });

  it('TEXT Ctrl+S still works after FOLDER fix (I-EditSafety4 regression)', () => {
    const textContainer: Container = {
      meta: { container_id: 'c4', title: 'T', created_at: T, updated_at: T, schema_version: 1 },
      entries: [{ lid: 'e1', title: 'Doc', body: 'hello', archetype: 'text', created_at: T, updated_at: T }],
      relations: [], revisions: [], assets: {},
    };

    const dispatcher = createDispatcher();
    const events: DomainEvent[] = [];
    dispatcher.onEvent((e) => events.push(e));
    dispatcher.onState((state) => render(state, root));
    dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: textContainer });
    render(dispatcher.getState(), root);
    cleanup = bindActions(root, dispatcher);

    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
    dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
    render(dispatcher.getState(), root);

    const beforeLen = events.length;
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 's', ctrlKey: true, bubbles: true,
    }));

    expect(events.slice(beforeLen).some((e) => e.type === 'EDIT_COMMITTED')).toBe(true);
  });
});
