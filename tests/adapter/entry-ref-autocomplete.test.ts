/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  closeEntryRefAutocomplete,
  handleEntryRefAutocompleteKeydown,
  isEntryRefAutocompleteOpen,
  openEntryRefAutocomplete,
  updateEntryRefAutocompleteQuery,
} from '@adapter/ui/entry-ref-autocomplete';
import type { Entry } from '@core/model/record';

function makeEntry(lid: string, title: string): Entry {
  return {
    lid,
    title,
    body: '',
    archetype: 'text',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeEntryRefAutocomplete();
  root.remove();
});

describe('entry-ref autocomplete lifecycle', () => {
  const cands: Entry[] = [
    makeEntry('alpha-1', 'Alpha'),
    makeEntry('beta-2', 'Beta'),
  ];

  it('is initially closed', () => {
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('opens and appears in DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
    expect(
      root.querySelector('[data-pkc-region="entry-ref-autocomplete"]'),
    ).not.toBeNull();
    expect(
      root.querySelectorAll('.pkc-entry-ref-autocomplete-item').length,
    ).toBe(2);
  });

  it('does not open when candidate list is empty', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', [], root);
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('shows empty state when query filters to zero', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, 'zzz', cands, root);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
    expect(
      root.querySelector('.pkc-entry-ref-autocomplete-empty')?.textContent,
    ).toBe('No matching entries.');
  });

  it('updates visible list on query change', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    updateEntryRefAutocompleteQuery('beta');
    const items = root.querySelectorAll('.pkc-entry-ref-autocomplete-item');
    expect(items.length).toBe(1);
    expect(items[0]!.getAttribute('data-pkc-lid')).toBe('beta-2');
  });

  it('shows (untitled) fallback for empty titles', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    const untitled: Entry[] = [makeEntry('lid-only', '')];

    openEntryRefAutocomplete(ta, 0, '', untitled, root);
    const title = root.querySelector('.pkc-entry-ref-autocomplete-title');
    expect(title?.textContent).toBe('(untitled)');
  });

  it('closes and removes from DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    closeEntryRefAutocomplete();

    expect(isEntryRefAutocompleteOpen()).toBe(false);
    expect(
      root.querySelector('[data-pkc-region="entry-ref-autocomplete"]'),
    ).toBeNull();
  });
});

describe('entry-ref autocomplete keyboard', () => {
  const cands: Entry[] = [
    makeEntry('alpha-1', 'Alpha'),
    makeEntry('beta-2', 'Beta'),
  ];

  it('Escape closes the popover and is consumed', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    const consumed = handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(consumed).toBe(true);
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('ArrowDown moves selection', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    let sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-lid')).toBe('alpha-1');

    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-lid')).toBe('beta-2');
  });

  it('ArrowUp wraps to last item', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowUp' }),
    );
    const sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-lid')).toBe('beta-2');
  });

  it('Enter replaces only the typed query with the chosen lid', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[click](entry:al)';
    // Caret just before ")"
    ta.selectionStart = ta.selectionEnd = 16;

    openEntryRefAutocomplete(ta, 14, 'al', cands, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(isEntryRefAutocompleteOpen()).toBe(false);
    expect(ta.value).toBe('[click](entry:alpha-1)');
    expect(ta.selectionStart).toBe(14 + 'alpha-1'.length);
  });

  it('Tab behaves like Enter', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:)';
    ta.selectionStart = ta.selectionEnd = 10;

    openEntryRefAutocomplete(ta, 10, '', cands, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Tab' }),
    );
    expect(ta.value).toBe('[x](entry:alpha-1)');
  });

  it('empty list + Enter does not consume event (popover stays open)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, 'zzz', cands, root);
    const consumed = handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(consumed).toBe(false);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
  });

  it('unhandled key (e.g. letter) is not consumed', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openEntryRefAutocomplete(ta, 0, '', cands, root);
    const consumed = handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'a' }),
    );
    expect(consumed).toBe(false);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
  });
});

describe('entry-ref autocomplete mouse insertion', () => {
  it('mousedown on an item inserts its lid and closes', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:)';
    ta.selectionStart = ta.selectionEnd = 10;

    const cands: Entry[] = [makeEntry('hit-lid', 'hit title')];
    openEntryRefAutocomplete(ta, 10, '', cands, root);

    const item = root.querySelector<HTMLElement>(
      '.pkc-entry-ref-autocomplete-item',
    );
    expect(item).not.toBeNull();
    item!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(ta.value).toBe('[x](entry:hit-lid)');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });
});
