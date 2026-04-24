/**
 * @vitest-environment happy-dom
 *
 * Integration test for the PKC permalink → internal markdown link
 * paste path wired into `handlePaste` inside `bindActions`. See:
 *   - src/adapter/ui/action-binder.ts (handlePaste / maybeHandlePkcPermalinkPaste)
 *   - src/adapter/ui/link-paste-handler.ts
 *   - docs/spec/pkc-link-unification-v0.md §7
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-04-24T00:00:00Z';
const SELF = 'c-self';
const OTHER = 'c-other';

const baseContainer: Container = {
  meta: {
    container_id: SELF,
    title: 'Test',
    created_at: T,
    updated_at: T,
    schema_version: 1,
  },
  entries: [
    {
      lid: 'e1',
      title: 'A text entry',
      body: 'original body',
      archetype: 'text',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'att1',
      title: 'photo entry',
      body: JSON.stringify({
        name: 'photo.png',
        mime: 'image/png',
        size: 10,
        asset_key: 'ast-001',
      }),
      archetype: 'attachment',
      created_at: T,
      updated_at: T,
    },
    {
      lid: 'tl1',
      title: 'Work Log',
      body: JSON.stringify({
        entries: [
          { id: 'log-1', text: 'first log note', createdAt: '2026-04-20T09:15:00Z', flags: [] },
        ],
      }),
      archetype: 'textlog',
      created_at: T,
      updated_at: T,
    },
  ],
  relations: [],
  revisions: [],
  assets: { 'ast-001': 'AAAA' },
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

interface PasteShape {
  html?: string;
  plain?: string;
}

function firePaste(target: HTMLElement, payload: PasteShape): Event {
  const evt = new Event('paste', { bubbles: true, cancelable: true });
  const clipboardData = {
    items: [],
    getData(type: string): string {
      if (type === 'text/html') return payload.html ?? '';
      if (type === 'text/plain') return payload.plain ?? '';
      return '';
    },
  };
  Object.defineProperty(evt, 'clipboardData', { value: clipboardData });
  target.dispatchEvent(evt);
  return evt;
}

function setupEditingText(): { textarea: HTMLTextAreaElement } {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);

  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  dispatcher.dispatch({ type: 'BEGIN_EDIT', lid: 'e1' });
  render(dispatcher.getState(), root);

  const textarea = root.querySelector<HTMLTextAreaElement>(
    '[data-pkc-field="body"]',
  );
  if (!textarea) throw new Error('body textarea not found');
  textarea.value = '';
  textarea.setSelectionRange(0, 0);
  textarea.focus();
  return { textarea };
}

describe('action-binder · PKC permalink → internal markdown link', () => {
  it('converts a same-container entry permalink on paste', () => {
    const { textarea } = setupEditingText();

    const evt = firePaste(textarea, { plain: `pkc://${SELF}/entry/e1` });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('[A text entry](entry:e1)');
  });

  it('converts a same-container entry permalink with a fragment', () => {
    const { textarea } = setupEditingText();

    const evt = firePaste(textarea, {
      plain: `pkc://${SELF}/entry/e1#log/abc`,
    });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('[A text entry](entry:e1#log/abc)');
  });

  it('converts a same-container asset permalink', () => {
    const { textarea } = setupEditingText();

    const evt = firePaste(textarea, {
      plain: `pkc://${SELF}/asset/ast-001`,
    });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('[photo.png](asset:ast-001)');
  });

  it('does NOT preventDefault on a cross-container permalink', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, {
      plain: `pkc://${OTHER}/entry/e1`,
    });

    expect(evt.defaultPrevented).toBe(false);
    // Native browser paste path takes over → our handler must not
    // have written anything into the textarea.
    expect(textarea.value).toBe(before);
  });

  it('does NOT preventDefault on a malformed permalink', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, {
      plain: `pkc://${SELF}/folder/e1`,
    });

    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  it('does NOT preventDefault on an ordinary https URL', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, {
      plain: 'https://example.com/path',
    });

    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  it('does NOT preventDefault on plain text', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, { plain: 'hello world' });

    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  it('runs before the HTML link normalization (permalink wins on text/plain)', () => {
    // If both an HTML payload and a same-container permalink are on
    // the clipboard, the permalink path takes priority and preventDefault
    // fires, so the HTML path never inserts a [foo](url) wrapper.
    const { textarea } = setupEditingText();

    const evt = firePaste(textarea, {
      plain: `pkc://${SELF}/entry/e1`,
      html: '<a href="https://example.com">Example</a>',
    });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('[A text entry](entry:e1)');
    // No HTML-link splice should have leaked through.
    expect(textarea.value).not.toContain('Example');
  });

  // Post-correction: External Permalink also runs through this hook.
  it('converts a same-container External Permalink (`<base>#pkc?...`) on paste', () => {
    const { textarea } = setupEditingText();
    const url = `https://example.com/pkc2.html#pkc?container=${SELF}&entry=e1`;

    const evt = firePaste(textarea, { plain: url });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe('[A text entry](entry:e1)');
  });

  it('does NOT preventDefault on a cross-container External Permalink', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;
    const url = `https://example.com/pkc2.html#pkc?container=${OTHER}&entry=e1`;

    const evt = firePaste(textarea, { plain: url });

    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  // Phase 1 step 3 — log External Permalink paste produces a
  // `[<entry title> › <log snippet>](entry:<lid>#log/<logId>)` link
  // end-to-end through the action-binder paste hook. Unit tests
  // cover the label branches; this case pins the integration.
  it('converts a TEXTLOG log External Permalink to [Title › snippet](entry:lid#log/id)', () => {
    const { textarea } = setupEditingText();
    const url = `https://example.com/pkc2.html#pkc?container=${SELF}&entry=tl1&fragment=log/log-1`;

    const evt = firePaste(textarea, { plain: url });

    expect(evt.defaultPrevented).toBe(true);
    expect(textarea.value).toBe(
      '[Work Log › first log note](entry:tl1#log/log-1)',
    );
  });

  it('does not wrap a bare entry: reference the user pasted', () => {
    // The user already chose the internal form; we leave it to the
    // browser default paste so they get the literal text back.
    const { textarea } = setupEditingText();

    const evt = firePaste(textarea, { plain: 'entry:e1' });

    expect(evt.defaultPrevented).toBe(false);
  });
});
