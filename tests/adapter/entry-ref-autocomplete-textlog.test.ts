/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  closeEntryRefAutocomplete,
  handleEntryRefAutocompleteKeydown,
  isEntryRefAutocompleteOpen,
  openEntryRefAutocomplete,
} from '@adapter/ui/entry-ref-autocomplete';
import type { Entry } from '@core/model/record';

/**
 * v1.2 parity suite — identical insertion / keyboard / popup semantics
 * should hold for textlog editor fields as for text `body`. See
 * docs/development/entry-autocomplete-v1.2-textlog.md.
 *
 * These tests lock in the shared gate so that future changes to
 * SLASH_ELIGIBLE_FIELDS or the input handler cannot silently drop
 * textlog support without tripping a regression.
 */

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

// v1.3 extends this set to explicitly cover `todo-description`, which
// has been in the SLASH_ELIGIBLE_FIELDS gate but was not test-locked.
const PARITY_FIELDS = [
  'textlog-append-text',
  'textlog-entry-text',
  'todo-description',
] as const;

for (const field of PARITY_FIELDS) {
  describe(`entry-ref autocomplete — non-body field "${field}"`, () => {
    const cands: Entry[] = [
      makeEntry('alpha-1', 'Alpha'),
      makeEntry('beta-2', 'Beta'),
    ];

    it('opens popup on the textarea', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-pkc-field', field);
      root.appendChild(ta);

      openEntryRefAutocomplete(ta, 0, '', cands, root);
      expect(isEntryRefAutocompleteOpen()).toBe(true);
      expect(
        root.querySelector('[data-pkc-region="entry-ref-autocomplete"]'),
      ).not.toBeNull();
    });

    it('entry-url kind (`(entry:`) inserts only the lid', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-pkc-field', field);
      root.appendChild(ta);
      ta.value = '[x](entry:al)';
      ta.selectionStart = ta.selectionEnd = 12;

      openEntryRefAutocomplete(ta, 10, 'al', cands, root, 'entry-url');
      handleEntryRefAutocompleteKeydown(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );

      expect(ta.value).toBe('[x](entry:alpha-1)');
      expect(isEntryRefAutocompleteOpen()).toBe(false);
    });

    it('bracket kind (`[[`) expands to full markdown link form', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-pkc-field', field);
      root.appendChild(ta);
      ta.value = 'log body [[al tail';
      ta.selectionStart = ta.selectionEnd = 13;

      // bracketStart at position of first `[` in `[[`, i.e. 9
      openEntryRefAutocomplete(ta, 9, 'al', cands, root, 'bracket');
      handleEntryRefAutocompleteKeydown(
        new KeyboardEvent('keydown', { key: 'Enter' }),
      );

      expect(ta.value).toBe('log body [Alpha](entry:alpha-1) tail');
      expect(isEntryRefAutocompleteOpen()).toBe(false);
    });

    it('Escape preserves textarea value and closes popup', () => {
      const ta = document.createElement('textarea');
      ta.setAttribute('data-pkc-field', field);
      root.appendChild(ta);
      ta.value = '[[foo';
      ta.selectionStart = ta.selectionEnd = 5;

      openEntryRefAutocomplete(ta, 0, 'foo', cands, root, 'bracket');
      handleEntryRefAutocompleteKeydown(
        new KeyboardEvent('keydown', { key: 'Escape' }),
      );

      expect(ta.value).toBe('[[foo');
      expect(isEntryRefAutocompleteOpen()).toBe(false);
    });
  });
}
