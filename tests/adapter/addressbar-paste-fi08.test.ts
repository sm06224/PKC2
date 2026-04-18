/**
 * @vitest-environment happy-dom
 *
 * FI-08: address bar URL+title paste enhancement tests.
 *
 * G-1 (pure): label === URL → bare URL dedup
 * G-3 (integration): TEXTLOG textarea field gate extension
 *
 * See docs/spec/addressbar-url-title-paste-v1-behavior-contract.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { htmlPasteToMarkdown } from '@adapter/ui/html-paste-to-markdown';
import { bindActions } from '@adapter/ui/action-binder';
import { createDispatcher } from '@adapter/state/dispatcher';
import { render } from '@adapter/ui/renderer';
import type { Container } from '@core/model/container';

// ── shared helpers ─────────────────────────────────────────────

const T = '2026-04-18T00:00:00Z';

const baseContainer: Container = {
  meta: { container_id: 'c1', title: 'Test', created_at: T, updated_at: T, schema_version: 1 },
  entries: [
    { lid: 'e1', title: 'Text entry', body: '', archetype: 'text', created_at: T, updated_at: T },
  ],
  relations: [],
  revisions: [],
  assets: {},
};

let root: HTMLElement;
let cleanup: (() => void) | undefined;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
  return () => {
    cleanup?.();
    root.remove();
    cleanup = undefined;
  };
});

function firePaste(target: HTMLElement, html: string): Event {
  const evt = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'clipboardData', {
    value: {
      items: [],
      getData(type: string): string {
        return type === 'text/html' ? html : '';
      },
    },
  });
  target.dispatchEvent(evt);
  return evt;
}

function setupBound(): void {
  const dispatcher = createDispatcher();
  dispatcher.onState((state) => render(state, root));
  dispatcher.dispatch({ type: 'SYS_INIT_COMPLETE', container: baseContainer });
  render(dispatcher.getState(), root);
  cleanup = bindActions(root, dispatcher);
  // Enter ready phase so paste is not blocked by readonly guard
  dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: 'e1' });
  render(dispatcher.getState(), root);
}

function makeTextarea(field: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.setAttribute('data-pkc-field', field);
  ta.value = '';
  root.appendChild(ta);
  return ta;
}

// ── G-1: label === URL dedup (pure unit) ────────────────────────

describe('G-1: label===URL → bare URL (htmlPasteToMarkdown)', () => {
  it('label equals URL → returns bare URL', () => {
    const result = htmlPasteToMarkdown(
      '<a href="https://example.com">https://example.com</a>',
    );
    expect(result).toBe('https://example.com');
    expect(result).not.toContain('](');
  });

  it('label differs from URL → returns [label](url)', () => {
    const result = htmlPasteToMarkdown(
      '<a href="https://example.com">Example Page</a>',
    );
    expect(result).toBe('[Example Page](https://example.com)');
  });

  it('label equals URL after trim (leading/trailing spaces) → bare URL', () => {
    const result = htmlPasteToMarkdown(
      '<a href="  https://example.com  ">  https://example.com  </a>',
    );
    // label after collapseWhitespace+trim = "https://example.com"
    // href after trim = "https://example.com"
    expect(result).toBe('https://example.com');
    expect(result).not.toContain('](');
  });

  it('label === URL with parens → bare URL with percent-encoded parens', () => {
    const result = htmlPasteToMarkdown(
      '<a href="https://x.com/foo (bar)">https://x.com/foo (bar)</a>',
    );
    // label.trim() === href.trim() → sanitizeHref applied
    expect(result).toBe('https://x.com/foo%20%28bar%29');
    expect(result).not.toContain('](');
  });

  it('mixed: first anchor label===URL, second has distinct label', () => {
    const result = htmlPasteToMarkdown(
      '<a href="https://x.com">https://x.com</a> and <a href="https://y.com">Y Site</a>',
    );
    expect(result).toContain('https://x.com');
    expect(result).toContain('[Y Site](https://y.com)');
    // The bare URL anchor must NOT produce [url](url)
    expect(result).not.toMatch(/\[https:\/\/x\.com\]\(/);
  });
});

// ── G-3: TEXTLOG field gate extension (integration) ─────────────

describe('G-3: TEXTLOG textarea field gate', () => {
  it('textlog-append-text textarea: anchor HTML is converted to Markdown link', () => {
    setupBound();
    const ta = makeTextarea('textlog-append-text');
    firePaste(ta, '<a href="https://example.com">Example</a>');
    expect(ta.value).toContain('[Example](https://example.com)');
  });

  it('textlog-entry-text textarea: anchor HTML is converted to Markdown link', () => {
    setupBound();
    const ta = makeTextarea('textlog-entry-text');
    firePaste(ta, '<a href="https://example.com">Example</a>');
    expect(ta.value).toContain('[Example](https://example.com)');
  });

  it('body textarea: still converts (regression)', () => {
    setupBound();
    const ta = makeTextarea('body');
    firePaste(ta, '<a href="https://example.com">Example</a>');
    expect(ta.value).toContain('[Example](https://example.com)');
  });

  it('title textarea: not converted, preventDefault not called', () => {
    setupBound();
    const ta = makeTextarea('title');
    const evt = firePaste(ta, '<a href="https://example.com">Example</a>');
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('');
  });

  it('textarea with no field attribute: not converted, preventDefault not called', () => {
    setupBound();
    const ta = document.createElement('textarea');
    ta.value = '';
    root.appendChild(ta);
    const evt = firePaste(ta, '<a href="https://example.com">Example</a>');
    expect(evt.defaultPrevented).toBe(false);
    expect(ta.value).toBe('');
  });

  it('G-3 + G-1 combined: textlog-append-text + label===URL → bare URL', () => {
    setupBound();
    const ta = makeTextarea('textlog-append-text');
    firePaste(ta, '<a href="https://example.com">https://example.com</a>');
    expect(ta.value).toContain('https://example.com');
    expect(ta.value).not.toContain('](');
  });
});
