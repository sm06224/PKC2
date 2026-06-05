/**
 * @vitest-environment happy-dom
 *
 * Object-aware context menu test(pgc-84、MASTER.md §4.7)。
 * - detectObjectContext で 4 kind の正しい検出
 * - renderObjectContextMenu の DOM 構造 + item action
 * - clipboard 経路の検証
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectObjectContext,
  renderObjectContextMenu,
} from '../../src/adapter/ui/context-menu-object';

beforeEach(() => {
  document.body.innerHTML = '';
  // Stub clipboard
  if (typeof navigator !== 'undefined') {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
  }
});

function makeSel(text: string): Selection {
  return {
    isCollapsed: text.length === 0,
    toString: () => text,
  } as unknown as Selection;
}

describe('detectObjectContext', () => {
  it('returns null for null target', () => {
    expect(detectObjectContext(null, null)).toBeNull();
  });

  it('returns null for textarea target (native menu preferred)', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    expect(detectObjectContext(ta, makeSel('selected'))).toBeNull();
  });

  it('detects selection on regular element', () => {
    const div = document.createElement('div');
    div.textContent = 'hello world';
    document.body.appendChild(div);
    const ctx = detectObjectContext(div, makeSel('hello'));
    expect(ctx?.kind).toBe('selection');
    expect(ctx?.payload.text).toBe('hello');
  });

  it('detects link <a href>', () => {
    const a = document.createElement('a');
    a.href = 'https://example.com/';
    a.textContent = 'Example';
    document.body.appendChild(a);
    const ctx = detectObjectContext(a, null);
    expect(ctx?.kind).toBe('link');
    expect(ctx?.payload.url).toBe('https://example.com/');
    expect(ctx?.payload.text).toBe('Example');
  });

  it('detects link from descendant', () => {
    const a = document.createElement('a');
    a.href = '/foo';
    const span = document.createElement('span');
    span.textContent = 'inner';
    a.appendChild(span);
    document.body.appendChild(a);
    const ctx = detectObjectContext(span, null);
    expect(ctx?.kind).toBe('link');
  });

  it('detects image', () => {
    const img = document.createElement('img');
    img.setAttribute('src', 'cat.png');
    img.setAttribute('alt', 'A cat');
    document.body.appendChild(img);
    const ctx = detectObjectContext(img, null);
    expect(ctx?.kind).toBe('image');
    expect(ctx?.payload.url).toBe('cat.png');
    expect(ctx?.payload.altText).toBe('A cat');
  });

  it('detects heading', () => {
    const h2 = document.createElement('h2');
    h2.id = 'sec-1';
    h2.textContent = 'Section 1';
    document.body.appendChild(h2);
    const ctx = detectObjectContext(h2, null);
    expect(ctx?.kind).toBe('heading');
    expect(ctx?.payload.text).toBe('Section 1');
    expect(ctx?.payload.anchorId).toBe('sec-1');
  });

  it('selection wins over link (selection is priority 1)', () => {
    const a = document.createElement('a');
    a.href = '/x';
    a.textContent = 'X';
    document.body.appendChild(a);
    const ctx = detectObjectContext(a, makeSel('X'));
    expect(ctx?.kind).toBe('selection');
  });

  it('returns null on plain paragraph without selection', () => {
    const p = document.createElement('p');
    p.textContent = 'just text';
    document.body.appendChild(p);
    expect(detectObjectContext(p, null)).toBeNull();
  });
});

describe('renderObjectContextMenu', () => {
  it('selection menu has copy items', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const menu = renderObjectContextMenu(
      { kind: 'selection', target: div, payload: { text: 'hello' } },
      10, 20,
    );
    expect(menu.getAttribute('data-pkc-context-object')).toBe('selection');
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toContain('object.copy-selection');
    expect(ids).toContain('object.copy-as-quote');
  });

  it('selection copy item writes text to clipboard', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const menu = renderObjectContextMenu(
      { kind: 'selection', target: div, payload: { text: 'hello world' } },
      0, 0,
    );
    document.body.appendChild(menu);
    const btn = menu.querySelector<HTMLElement>('[data-pkc-cmd-id="object.copy-selection"]');
    btn?.click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello world');
    expect(document.body.contains(menu)).toBe(false);
  });

  it('selection copy-as-quote prefixes each line with > ', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const menu = renderObjectContextMenu(
      { kind: 'selection', target: div, payload: { text: 'line a\nline b' } },
      0, 0,
    );
    document.body.appendChild(menu);
    const btn = menu.querySelector<HTMLElement>('[data-pkc-cmd-id="object.copy-as-quote"]');
    btn?.click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('> line a\n> line b');
  });

  it('link menu has open + copy URL + copy markdown', () => {
    const a = document.createElement('a');
    document.body.appendChild(a);
    const menu = renderObjectContextMenu(
      { kind: 'link', target: a, payload: { url: 'https://x/', text: 'X' } },
      0, 0,
    );
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toEqual(['object.open-link', 'object.copy-link-url', 'object.copy-link-markdown']);
  });

  it('link copy-link-markdown writes formatted', () => {
    const a = document.createElement('a');
    document.body.appendChild(a);
    const menu = renderObjectContextMenu(
      { kind: 'link', target: a, payload: { url: 'https://x/', text: 'Example' } },
      0, 0,
    );
    document.body.appendChild(menu);
    const btn = menu.querySelector<HTMLElement>('[data-pkc-cmd-id="object.copy-link-markdown"]');
    btn?.click();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('[Example](https://x/)');
  });

  it('image menu has open + copy URL + markdown', () => {
    const img = document.createElement('img');
    document.body.appendChild(img);
    const menu = renderObjectContextMenu(
      { kind: 'image', target: img, payload: { url: 'cat.png', altText: 'cat' } },
      0, 0,
    );
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toEqual(['object.open-image', 'object.copy-image-url', 'object.copy-image-markdown']);
  });

  it('heading menu without anchor has only text copy', () => {
    const h = document.createElement('h2');
    document.body.appendChild(h);
    const menu = renderObjectContextMenu(
      { kind: 'heading', target: h, payload: { text: 'Title', anchorId: '' } },
      0, 0,
    );
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toEqual(['object.copy-heading-text']);
  });

  it('heading menu with anchor has 2 items', () => {
    const h = document.createElement('h2');
    document.body.appendChild(h);
    const menu = renderObjectContextMenu(
      { kind: 'heading', target: h, payload: { text: 'Title', anchorId: 'sec-1' } },
      0, 0,
    );
    const ids = [...menu.querySelectorAll('[data-pkc-cmd-id]')]
      .map((b) => b.getAttribute('data-pkc-cmd-id'));
    expect(ids).toContain('object.copy-heading-text');
    expect(ids).toContain('object.copy-heading-anchor');
  });

  it('positioning uses x / y', () => {
    const div = document.createElement('div');
    const menu = renderObjectContextMenu(
      { kind: 'selection', target: div, payload: { text: 'x' } },
      123, 456,
    );
    expect(menu.style.left).toBe('123px');
    expect(menu.style.top).toBe('456px');
  });
});
