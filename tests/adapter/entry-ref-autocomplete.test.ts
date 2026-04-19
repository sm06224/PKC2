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

// ── v1.1: bracket (`[[`) trigger kind ──

describe('entry-ref autocomplete — bracket (`[[`) kind', () => {
  it('inserts `[title](entry:lid)` replacing `[[<query>` wholesale', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'before [[al after';
    // Caret right after "al", i.e. between 'l' (idx 10) and ' ' (idx 11)
    ta.selectionStart = ta.selectionEnd = 11;

    const cands: Entry[] = [makeEntry('alpha-1', 'Alpha')];
    // bracketStart = position of the first `[` in `[[`, i.e. 7
    openEntryRefAutocomplete(ta, 7, 'al', cands, root, 'bracket');
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(ta.value).toBe('before [Alpha](entry:alpha-1) after');
    // Caret lands right after the inserted text (before ` after`)
    expect(ta.selectionStart).toBe(7 + '[Alpha](entry:alpha-1)'.length);
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('uses lid as label fallback for untitled entries', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[[';
    ta.selectionStart = ta.selectionEnd = 2;

    const cands: Entry[] = [makeEntry('lid-only', '')];
    openEntryRefAutocomplete(ta, 0, '', cands, root, 'bracket');
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(ta.value).toBe('[lid-only](entry:lid-only)');
  });

  it('does not auto-insert `]]` on Escape (leaves `[[<query>` intact)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[[foo';
    ta.selectionStart = ta.selectionEnd = 5;

    const cands: Entry[] = [makeEntry('alpha-1', 'Alpha')];
    openEntryRefAutocomplete(ta, 0, 'foo', cands, root, 'bracket');
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );

    expect(ta.value).toBe('[[foo');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('mousedown in bracket mode inserts the markdown link form', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[[';
    ta.selectionStart = ta.selectionEnd = 2;

    const cands: Entry[] = [makeEntry('hit-lid', 'Hit Title')];
    openEntryRefAutocomplete(ta, 0, '', cands, root, 'bracket');

    const item = root.querySelector<HTMLElement>(
      '.pkc-entry-ref-autocomplete-item',
    );
    item!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(ta.value).toBe('[Hit Title](entry:hit-lid)');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('entry-url kind still inserts only the lid (v1 behavior preserved)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:al)';
    ta.selectionStart = ta.selectionEnd = 12;

    const cands: Entry[] = [makeEntry('alpha-1', 'Alpha')];
    // Explicitly pass 'entry-url' kind; also verifies the default.
    openEntryRefAutocomplete(ta, 10, 'al', cands, root, 'entry-url');
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(ta.value).toBe('[x](entry:alpha-1)');
  });
});
