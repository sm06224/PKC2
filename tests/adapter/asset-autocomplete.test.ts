/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  closeAssetAutocomplete,
  filterAssetCandidates,
  findAssetCompletionContext,
  handleAssetAutocompleteKeydown,
  isAssetAutocompleteOpen,
  openAssetAutocomplete,
  updateAssetAutocompleteQuery,
} from '@adapter/ui/asset-autocomplete';
import type { AssetCandidate } from '@adapter/ui/asset-picker';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeAssetAutocomplete();
  root.remove();
});

// ── findAssetCompletionContext ──

describe('findAssetCompletionContext', () => {
  it('matches at `(asset:|` with empty query', () => {
    const text = '![a](asset:';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.queryStart).toBe(text.length);
    expect(res!.query).toBe('');
  });

  it('matches at `(asset:abc|` with partial query', () => {
    const text = '![a](asset:ast-';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('ast-');
  });

  it('matches with full key and caret inside the run', () => {
    const text = '![x](asset:ast-abc123)';
    // Caret just before `)`
    const res = findAssetCompletionContext(text, text.length - 1);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('ast-abc123');
  });

  it('matches at link form `[text](asset:...)`', () => {
    const text = '[click](asset:ast-x';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('ast-x');
  });

  it('does not match without preceding `(`', () => {
    const text = 'asset:ast-a';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).toBeNull();
  });

  it('does not match inside URL like `https://site/asset:`', () => {
    const text = 'https://example.com/asset:bad';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).toBeNull();
  });

  it('does not match when the preceding char before `asset:` is not `(`', () => {
    const text = 'xasset:a';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).toBeNull();
  });

  it('does not match when caret is before the trigger', () => {
    const text = '![a](asset:abc)';
    const res = findAssetCompletionContext(text, 2); // inside `![`
    expect(res).toBeNull();
  });

  it('does not match when a space interrupts the key', () => {
    const text = '![a](asset:abc def';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).toBeNull();
  });

  it('does not match when caret sits after `)`', () => {
    const text = '![a](asset:ast-abc) and more';
    const res = findAssetCompletionContext(text, text.length);
    expect(res).toBeNull();
  });

  it('returns query when caret is partway through the key run', () => {
    const text = '![a](asset:ast-zzz)';
    // Position caret inside the key after `ast-`
    const caret = text.indexOf('zzz') + 2; // after `zz`
    const res = findAssetCompletionContext(text, caret);
    expect(res).not.toBeNull();
    expect(res!.query).toBe('ast-zz');
  });

  it('returns null for empty text', () => {
    expect(findAssetCompletionContext('', 0)).toBeNull();
  });

  it('handles caret at position < 7 safely', () => {
    expect(findAssetCompletionContext('abc', 3)).toBeNull();
    expect(findAssetCompletionContext('(asset', 6)).toBeNull();
  });
});

// ── filterAssetCandidates ──

describe('filterAssetCandidates', () => {
  const all: AssetCandidate[] = [
    { key: 'ast-aaa', name: 'cover.png', mime: 'image/png' },
    { key: 'ast-bbb', name: 'photo.jpg', mime: 'image/jpeg' },
    { key: 'ast-ccc', name: 'diagram.gif', mime: 'image/gif' },
  ];

  it('returns full list for empty query', () => {
    expect(filterAssetCandidates(all, '')).toEqual(all);
  });

  it('matches by name substring (case-insensitive)', () => {
    const result = filterAssetCandidates(all, 'PHOTO');
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('ast-bbb');
  });

  it('matches by key substring', () => {
    const result = filterAssetCandidates(all, 'aaa');
    expect(result).toHaveLength(1);
    expect(result[0]!.key).toBe('ast-aaa');
  });

  it('returns empty array when nothing matches', () => {
    expect(filterAssetCandidates(all, 'zzz')).toEqual([]);
  });

  it('returns a copy (caller cannot mutate the source)', () => {
    const result = filterAssetCandidates(all, '');
    result.pop();
    expect(all).toHaveLength(3);
  });
});

// ── Popover lifecycle ──

describe('asset autocomplete lifecycle', () => {
  const cands: AssetCandidate[] = [
    { key: 'ast-a', name: 'a.png', mime: 'image/png' },
    { key: 'ast-b', name: 'b.jpg', mime: 'image/jpeg' },
  ];

  it('is initially closed', () => {
    expect(isAssetAutocompleteOpen()).toBe(false);
  });

  it('opens and appears in DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    expect(isAssetAutocompleteOpen()).toBe(true);
    expect(
      root.querySelector('[data-pkc-region="asset-autocomplete"]'),
    ).not.toBeNull();
    expect(
      root.querySelectorAll('.pkc-asset-autocomplete-item').length,
    ).toBe(2);
  });

  it('does not open when candidate list is empty', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', [], root);
    expect(isAssetAutocompleteOpen()).toBe(false);
    expect(
      root.querySelector('[data-pkc-region="asset-autocomplete"]'),
    ).toBeNull();
  });

  it('shows empty state when query filters to zero', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, 'zzz', cands, root);
    expect(isAssetAutocompleteOpen()).toBe(true);
    const empty = root.querySelector('.pkc-asset-autocomplete-empty');
    expect(empty).not.toBeNull();
  });

  it('updates visible list on query change', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    expect(
      root.querySelectorAll('.pkc-asset-autocomplete-item').length,
    ).toBe(2);

    updateAssetAutocompleteQuery('a.png');
    const items = root.querySelectorAll('.pkc-asset-autocomplete-item');
    expect(items.length).toBe(1);
    expect(items[0]!.getAttribute('data-pkc-asset-key')).toBe('ast-a');
  });

  it('closes and removes from DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    closeAssetAutocomplete();

    expect(isAssetAutocompleteOpen()).toBe(false);
    expect(
      root.querySelector('[data-pkc-region="asset-autocomplete"]'),
    ).toBeNull();
  });
});

// ── Keyboard navigation ──

describe('asset autocomplete keyboard', () => {
  const cands: AssetCandidate[] = [
    { key: 'ast-a', name: 'a.png', mime: 'image/png' },
    { key: 'ast-b', name: 'b.png', mime: 'image/png' },
  ];

  it('Escape closes the popover', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Escape' }),
    );
    expect(consumed).toBe(true);
    expect(isAssetAutocompleteOpen()).toBe(false);
  });

  it('ArrowDown moves selection', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    let sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-asset-key')).toBe('ast-a');

    handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    );
    sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-asset-key')).toBe('ast-b');
  });

  it('ArrowUp wraps to last item', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'ArrowUp' }),
    );
    const sel = root.querySelector('[data-pkc-selected="true"]');
    expect(sel?.getAttribute('data-pkc-asset-key')).toBe('ast-b');
  });

  it('Enter replaces only the typed query with the chosen key', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    // Caret positioned right after "as", before ")"
    ta.selectionStart = ta.selectionEnd = 15;

    // queryStart is position right after "asset:" — i.e. index of 'a' in 'as'
    openAssetAutocomplete(ta, 13, 'as', cands, root);
    handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(isAssetAutocompleteOpen()).toBe(false);
    expect(ta.value).toBe('![alt](asset:ast-a)');
    // Caret should land at end of inserted key
    expect(ta.selectionStart).toBe(13 + 'ast-a'.length);
  });

  it('Tab behaves like Enter', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![x](asset:)';
    ta.selectionStart = ta.selectionEnd = 11;

    openAssetAutocomplete(ta, 11, '', cands, root);
    handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Tab' }),
    );
    expect(ta.value).toBe('![x](asset:ast-a)');
  });

  it('empty list + Enter does not consume event (popover stays open)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, 'zzz', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    expect(consumed).toBe(false);
    expect(isAssetAutocompleteOpen()).toBe(true);
  });

  it('unhandled key (e.g. letter) is not consumed', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, '', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'a' }),
    );
    expect(consumed).toBe(false);
    expect(isAssetAutocompleteOpen()).toBe(true);
  });
});

// ── Safety: mousedown inserts without closing focus ──

describe('asset autocomplete mouse insertion', () => {
  it('mousedown on an item inserts its key and closes', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![](asset:)';
    ta.selectionStart = ta.selectionEnd = 10;

    const cands: AssetCandidate[] = [
      { key: 'ast-hit', name: 'hit.png', mime: 'image/png' },
    ];
    openAssetAutocomplete(ta, 10, '', cands, root);

    const item = root.querySelector<HTMLElement>('.pkc-asset-autocomplete-item');
    expect(item).not.toBeNull();
    item!.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
    );

    expect(ta.value).toBe('![](asset:ast-hit)');
    expect(isAssetAutocompleteOpen()).toBe(false);
  });
});

// ── Modifier-Enter policy (mirrors entry-ref autocomplete v1.5) ──

describe('asset autocomplete — modifier-Enter', () => {
  const cands: AssetCandidate[] = [
    { key: 'ast-a', name: 'a.png', mime: 'image/png' },
    { key: 'ast-b', name: 'b.png', mime: 'image/png' },
  ];

  it('Ctrl+Enter closes popup, leaves textarea unchanged, returns false', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-append-text');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);
    expect(isAssetAutocompleteOpen()).toBe(true);

    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }),
    );

    expect(consumed).toBe(false);
    expect(isAssetAutocompleteOpen()).toBe(false);
    // No insertion happened — value unchanged.
    expect(ta.value).toBe('![alt](asset:as)');
  });

  it('Cmd+Enter (metaKey) behaves identically to Ctrl+Enter', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-append-text');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);

    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }),
    );

    expect(consumed).toBe(false);
    expect(isAssetAutocompleteOpen()).toBe(false);
    expect(ta.value).toBe('![alt](asset:as)');
  });

  it('plain Enter still accepts (regression check)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-append-text');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );

    expect(consumed).toBe(true);
    expect(isAssetAutocompleteOpen()).toBe(false);
    expect(ta.value).toBe('![alt](asset:ast-a)');
  });

  it('Shift+Enter still accepts (only Ctrl/Cmd modifier triggers pass-through)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }),
    );

    expect(consumed).toBe(true);
    expect(ta.value).toBe('![alt](asset:ast-a)');
  });

  it('Alt+Enter still accepts', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter', altKey: true }),
    );

    expect(consumed).toBe(true);
    expect(ta.value).toBe('![alt](asset:ast-a)');
  });

  it('Ctrl+Enter on empty list also closes popup + returns false', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-append-text');
    root.appendChild(ta);

    openAssetAutocomplete(ta, 0, 'zzz', cands, root);
    expect(isAssetAutocompleteOpen()).toBe(true);
    expect(
      root.querySelector('.pkc-asset-autocomplete-empty'),
    ).not.toBeNull();

    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }),
    );

    expect(consumed).toBe(false);
    expect(isAssetAutocompleteOpen()).toBe(false);
  });

  it('Ctrl+Tab is out of scope (still accepts)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '![alt](asset:as)';
    ta.selectionStart = ta.selectionEnd = 15;

    openAssetAutocomplete(ta, 13, 'as', cands, root);
    const consumed = handleAssetAutocompleteKeydown(
      new KeyboardEvent('keydown', { key: 'Tab', ctrlKey: true }),
    );

    expect(consumed).toBe(true);
    expect(ta.value).toBe('![alt](asset:ast-a)');
  });
});
