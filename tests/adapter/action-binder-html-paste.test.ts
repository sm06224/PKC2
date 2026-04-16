/**
 * @vitest-environment happy-dom
 *
 * Integration test for the HTML-paste → Markdown-link normalization
 * wired into `handlePaste` inside `bindActions`. See:
 *   - src/adapter/ui/action-binder.ts (handlePaste)
 *   - src/adapter/ui/html-paste-to-markdown.ts
 *   - docs/development/html-paste-link-markdown.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

const T = '2026-04-16T00:00:00Z';

const baseContainer: Container = {
  meta: {
    container_id: 'c1',
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

interface PasteShape {
  html?: string;
  plain?: string;
  items?: DataTransferItem[];
}

function firePaste(target: HTMLElement, payload: PasteShape): Event {
  // happy-dom does not ship a spec-complete ClipboardEvent. Build a
  // plain Event and install a duck-typed `clipboardData` so the
  // production handler (which only calls .items + .getData) sees the
  // shapes it expects.
  const evt = new Event('paste', { bubbles: true, cancelable: true });
  const clipboardData = {
    items: payload.items ?? [],
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

function setupEditingText(): {
  textarea: HTMLTextAreaElement;
  initialValue: string;
} {
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
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  return { textarea, initialValue: textarea.value };
}

describe('action-binder · HTML paste → Markdown link normalization', () => {
  it('transforms a single anchor in the clipboard HTML into [label](url)', () => {
    const { textarea } = setupEditingText();
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    firePaste(textarea, {
      html: '<a href="https://example.com">Example</a>',
      plain: 'Example',
    });

    // happy-dom's execCommand('insertText') is not reliable, so the
    // manual-splice fallback path takes effect. Either way, the
    // textarea must end up with the Markdown form of the link.
    expect(textarea.value).toContain('[Example](https://example.com)');
  });

  it('preserves multiple anchors in a Gmail-style wrapped paste', () => {
    const { textarea } = setupEditingText();
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    firePaste(textarea, {
      html:
        '<div>See <a href="https://a.example">A</a> and '
          + '<a href="https://b.example">B</a>.</div>',
      plain: 'See A and B.',
    });

    expect(textarea.value).toContain('[A](https://a.example)');
    expect(textarea.value).toContain('[B](https://b.example)');
  });

  it('does NOT intercept a paste whose HTML has no anchors', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, {
      html: '<p>just plain text</p>',
      plain: 'just plain text',
    });

    // preventDefault was NOT called → the browser's text/plain
    // default handling stays in charge. Our handler must leave the
    // textarea untouched in that case.
    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  it('does NOT intercept a plain-text paste (no text/html payload)', () => {
    const { textarea } = setupEditingText();
    const before = textarea.value;

    const evt = firePaste(textarea, { plain: 'hello' });
    expect(evt.defaultPrevented).toBe(false);
    expect(textarea.value).toBe(before);
  });

  it('drops javascript: hrefs safely, keeping the label as plain text', () => {
    const { textarea } = setupEditingText();
    textarea.value = '';
    textarea.setSelectionRange(0, 0);

    firePaste(textarea, {
      html: 'Visit <a href="javascript:alert(1)">this site</a> now',
      plain: 'Visit this site now',
    });

    expect(textarea.value).not.toContain('javascript:');
    expect(textarea.value).not.toContain('](');
    expect(textarea.value).toContain('this site');
  });
});
