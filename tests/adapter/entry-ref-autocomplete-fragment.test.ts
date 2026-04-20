/**
 * @vitest-environment happy-dom
 *
 * v1.4 fragment autocomplete adapter tests. Covers popup lifecycle,
 * keyboard navigation, insertion, and the entry/fragment mode switch.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  closeEntryRefAutocomplete,
  handleEntryRefAutocompleteKeydown,
  isEntryRefAutocompleteOpen,
  openEntryRefAutocomplete,
  openFragmentAutocomplete,
  registerEntryRefInsertCallback,
  updateFragmentAutocompleteQuery,
} from '@adapter/ui/entry-ref-autocomplete';
import type { Entry } from '@core/model/record';
import type { FragmentCandidate } from '@features/entry-ref/fragment-completion';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeEntryRefAutocomplete();
  registerEntryRefInsertCallback(null);
  root.remove();
});

const fragments: FragmentCandidate[] = [
  { kind: 'log', fragment: 'log/abc123', label: '10:00  first note' },
  { kind: 'log', fragment: 'log/def456', label: '11:00  second note' },
  { kind: 'day', fragment: 'day/2026-04-20', label: '2026-04-20' },
];

describe('fragment autocomplete — lifecycle', () => {
  it('opens with mode=fragment when called', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#';
    ta.selectionStart = ta.selectionEnd = 14;

    openFragmentAutocomplete(ta, 14, '', fragments, root);
    expect(isEntryRefAutocompleteOpen()).toBe(true);

    const pop = root.querySelector('[data-pkc-region="entry-ref-autocomplete"]');
    expect(pop).not.toBeNull();
    expect(pop!.getAttribute('data-pkc-mode')).toBe('fragment');
  });

  it('opens (not no-op) even with empty candidates — shows empty state', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openFragmentAutocomplete(ta, 0, '', [], root);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
    const empty = root.querySelector('.pkc-entry-ref-autocomplete-empty');
    expect(empty?.textContent).toBe('No fragments.');
  });

  it('renders each candidate with its kind badge + fragment attributes', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openFragmentAutocomplete(ta, 0, '', fragments, root);
    const items = root.querySelectorAll('.pkc-entry-ref-autocomplete-item');
    expect(items.length).toBe(3);

    expect(items[0]!.getAttribute('data-pkc-fragment-kind')).toBe('log');
    expect(items[0]!.getAttribute('data-pkc-fragment')).toBe('log/abc123');
    const badge = items[0]!.querySelector('.pkc-entry-ref-autocomplete-fragment-kind');
    expect(badge?.textContent).toBe('log');

    expect(items[2]!.getAttribute('data-pkc-fragment-kind')).toBe('day');
    expect(items[2]!.getAttribute('data-pkc-fragment')).toBe('day/2026-04-20');
  });

  it('heading reads "fragment: suggestions"', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    openFragmentAutocomplete(ta, 0, '', fragments, root);
    const heading = root.querySelector('.pkc-entry-ref-autocomplete-heading');
    expect(heading?.textContent).toBe('fragment: suggestions');
  });

  it('updateFragmentAutocompleteQuery narrows visible set', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    openFragmentAutocomplete(ta, 0, '', fragments, root);

    updateFragmentAutocompleteQuery('day/');
    const items = root.querySelectorAll('.pkc-entry-ref-autocomplete-item');
    expect(items.length).toBe(1);
    expect(items[0]!.getAttribute('data-pkc-fragment')).toBe('day/2026-04-20');
  });

  it('closes and resets mode on close', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    openFragmentAutocomplete(ta, 0, '', fragments, root);

    closeEntryRefAutocomplete();
    expect(isEntryRefAutocompleteOpen()).toBe(false);
    expect(
      root.querySelector('[data-pkc-region="entry-ref-autocomplete"]'),
    ).toBeNull();
  });
});

describe('fragment autocomplete — keyboard + insertion', () => {
  it('Enter inserts the fragment identifier, replacing only the query', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#lo)';
    // Caret just before `)`
    ta.selectionStart = ta.selectionEnd = 16;

    // queryStart is position right after `#` (index 14)
    openFragmentAutocomplete(ta, 14, 'lo', fragments, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(ta.value).toBe('[x](entry:foo#log/abc123)');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('ArrowDown moves selection between fragment rows', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#';
    ta.selectionStart = ta.selectionEnd = 14;

    openFragmentAutocomplete(ta, 14, '', fragments, root);
    let sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-fragment')).toBe('log/abc123');

    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-fragment')).toBe('log/def456');
  });

  it('Escape closes and leaves textarea value intact', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#lo';
    ta.selectionStart = ta.selectionEnd = ta.value.length;

    openFragmentAutocomplete(ta, 14, 'lo', fragments, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );

    expect(ta.value).toBe('[x](entry:foo#lo');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('mousedown inserts the fragment identifier', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#';
    ta.selectionStart = ta.selectionEnd = 14;

    openFragmentAutocomplete(ta, 14, '', fragments, root);
    const items = root.querySelectorAll<HTMLElement>('.pkc-entry-ref-autocomplete-item');
    items[2]!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(ta.value).toBe('[x](entry:foo#day/2026-04-20');
    expect(isEntryRefAutocompleteOpen()).toBe(false);
  });

  it('does NOT fire the entry-insert callback when accepting a fragment', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '[x](entry:foo#';
    ta.selectionStart = ta.selectionEnd = 14;

    const seen: string[] = [];
    registerEntryRefInsertCallback((lid) => seen.push(lid));

    openFragmentAutocomplete(ta, 14, '', fragments, root);
    handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    // Fragment acceptance is lid-agnostic — no RECORD_ENTRY_REF_SELECTION.
    expect(seen).toEqual([]);
  });

  it('empty-list + Enter does not crash (no-op, popup stays open)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openFragmentAutocomplete(ta, 0, '', [], root);
    const consumed = handleEntryRefAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(consumed).toBe(false);
    expect(isEntryRefAutocompleteOpen()).toBe(true);
  });
});

describe('entry vs fragment mode switching', () => {
  it('opening fragment mode cleanly supersedes an open entry popup', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    const entry: Entry = {
      lid: 'alpha', title: 'Alpha', body: '', archetype: 'text',
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    };
    openEntryRefAutocomplete(ta, 0, '', [entry], root, 'entry-url');
    expect(
      root.querySelector('[data-pkc-region="entry-ref-autocomplete"]')
        ?.getAttribute('data-pkc-mode'),
    ).toBe('entry');

    openFragmentAutocomplete(ta, 0, '', fragments, root);
    // Previous popover closed + new one opened in fragment mode.
    const pop = root.querySelector('[data-pkc-region="entry-ref-autocomplete"]');
    expect(pop?.getAttribute('data-pkc-mode')).toBe('fragment');
    expect(root.querySelectorAll('[data-pkc-region="entry-ref-autocomplete"]').length).toBe(1);
  });
});
