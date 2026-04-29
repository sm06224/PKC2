/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isSlashEligible,
  shouldOpenSlashMenu,
  getSlashTriggerStart,
  isSlashMenuOpen,
  openSlashMenu,
  closeSlashMenu,
  filterSlashMenu,
  handleSlashMenuKeydown,
  registerAssetPickerCallback,
  SLASH_COMMANDS,
  type SlashCommandContext,
} from '@adapter/ui/slash-menu';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeSlashMenu();
  registerAssetPickerCallback(null);
  root.remove();
});

// ── isSlashEligible ──

describe('isSlashEligible', () => {
  it('returns true for body textarea', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    expect(isSlashEligible(ta)).toBe(true);
  });

  it('returns true for todo-description textarea', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'todo-description');
    expect(isSlashEligible(ta)).toBe(true);
  });

  it('returns true for textlog-append-text textarea', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-append-text');
    expect(isSlashEligible(ta)).toBe(true);
  });

  it('returns true for textlog-entry-text textarea', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'textlog-entry-text');
    expect(isSlashEligible(ta)).toBe(true);
  });

  it('returns false for form-note textarea', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'form-note');
    expect(isSlashEligible(ta)).toBe(false);
  });

  it('returns false for search input', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'search');
    expect(isSlashEligible(ta)).toBe(false);
  });

  it('returns false for textarea without data-pkc-field', () => {
    const ta = document.createElement('textarea');
    expect(isSlashEligible(ta)).toBe(false);
  });
});

// ── shouldOpenSlashMenu ──

describe('shouldOpenSlashMenu', () => {
  it('returns true for / at position 0 (first char)', () => {
    expect(shouldOpenSlashMenu('/', 1)).toBe(true);
  });

  it('returns true for / after newline', () => {
    expect(shouldOpenSlashMenu('hello\n/', 7)).toBe(true);
  });

  it('returns true for / after space', () => {
    expect(shouldOpenSlashMenu('word /', 6)).toBe(true);
  });

  it('returns true for / after tab', () => {
    expect(shouldOpenSlashMenu('\t/', 2)).toBe(true);
  });

  it('returns false for / in middle of word', () => {
    expect(shouldOpenSlashMenu('a/b', 2)).toBe(false);
  });

  it('returns false for / in URL', () => {
    expect(shouldOpenSlashMenu('http://example', 6)).toBe(false);
  });

  it('returns false when no / at caret-1', () => {
    expect(shouldOpenSlashMenu('abc', 3)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(shouldOpenSlashMenu('', 0)).toBe(false);
  });
});

// ── getSlashTriggerStart ──

describe('getSlashTriggerStart', () => {
  it('finds / at start of text', () => {
    expect(getSlashTriggerStart('/date', 5)).toBe(0);
  });

  it('finds / after newline', () => {
    expect(getSlashTriggerStart('hello\n/time', 11)).toBe(6);
  });

  it('returns -1 when no slash found', () => {
    expect(getSlashTriggerStart('no slash here', 13)).toBe(-1);
  });
});

// ── Menu open/close ──

describe('slash menu lifecycle', () => {
  it('is initially closed', () => {
    expect(isSlashMenuOpen()).toBe(false);
  });

  it('opens and appears in DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    expect(isSlashMenuOpen()).toBe(true);
    expect(root.querySelector('[data-pkc-region="slash-menu"]')).not.toBeNull();
  });

  it('shows all commands initially', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    const items = root.querySelectorAll('.pkc-slash-menu-item');
    expect(items.length).toBe(SLASH_COMMANDS.length);
  });

  it('closes and removes from DOM', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    closeSlashMenu();
    expect(isSlashMenuOpen()).toBe(false);
    expect(root.querySelector('[data-pkc-region="slash-menu"]')).toBeNull();
  });
});

// ── Filtering ──

describe('slash menu filtering', () => {
  it('filters commands by query', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('da');
    const items = root.querySelectorAll('.pkc-slash-menu-item');
    // Should match "date" and "datetime"
    expect(items.length).toBe(2);
  });

  it('shows empty state for no matches', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('zzz');
    const items = root.querySelectorAll('.pkc-slash-menu-item');
    expect(items.length).toBe(0);
    const empty = root.querySelector('.pkc-slash-menu-empty');
    expect(empty).not.toBeNull();
  });

  it('subsequence (fuzzy) match on id catches non-contiguous typing', () => {
    // PR #205: typing `dt` should match `datetime` via fuzzy id
    // even though "dt" is not a substring of any id or label.
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('dt');
    const items = root.querySelectorAll<HTMLElement>('.pkc-slash-menu-item');
    const ids = Array.from(items).map((el) => el.getAttribute('data-pkc-slash-id'));
    expect(ids).toContain('datetime');
  });

  it('fuzzy match catches typos in scrambled order (tdo → todo)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('tdo');
    const items = root.querySelectorAll<HTMLElement>('.pkc-slash-menu-item');
    const ids = Array.from(items).map((el) => el.getAttribute('data-pkc-slash-id'));
    expect(ids).toContain('todo');
  });

  it('substring match still wins (no false positives from fuzzy)', () => {
    // `xy` shouldn't match anything because no command id has 'x'
    // followed by 'y' anywhere.
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('xy');
    const items = root.querySelectorAll('.pkc-slash-menu-item');
    expect(items.length).toBe(0);
  });
});

// ── Keyboard navigation ──

describe('slash menu keyboard', () => {
  it('Escape closes the menu', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    const consumed = handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(consumed).toBe(true);
    expect(isSlashMenuOpen()).toBe(false);
  });

  it('ArrowDown moves selection', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    // Initially first item is selected
    let selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected?.getAttribute('data-pkc-slash-id')).toBe('date');

    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    selected = root.querySelector('[data-pkc-selected="true"]');
    expect(selected?.getAttribute('data-pkc-slash-id')).toBe('time');
  });

  it('ArrowUp wraps to last item', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);

    openSlashMenu(ta, 0, root);
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    const selected = root.querySelector('[data-pkc-selected="true"]');
    // Should wrap to the last command (asset, with /asset being the newest)
    expect(selected?.getAttribute('data-pkc-slash-id')).toBe('asset');
  });

  it('Enter executes selected command', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/';
    ta.selectionStart = ta.selectionEnd = 1;

    openSlashMenu(ta, 0, root);
    // First item is 'date'
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Menu should be closed
    expect(isSlashMenuOpen()).toBe(false);
    // `/` should be replaced with date
    expect(ta.value).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });

  it('Tab executes selected command', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/';
    ta.selectionStart = ta.selectionEnd = 1;

    openSlashMenu(ta, 0, root);
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));

    expect(isSlashMenuOpen()).toBe(false);
    expect(ta.value).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);
  });
});

// ── Command insertion ──

describe('slash command insertion', () => {
  it('replaces /code with fenced code block', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/code';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    // Navigate to 'code' command
    filterSlashMenu('code');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('```\n\n```');
    // Cursor should be between the fences (position 4)
    expect(ta.selectionStart).toBe(4);
  });

  it('replaces /h1 with heading prefix', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'text\n/h1';
    ta.selectionStart = ta.selectionEnd = 8;

    openSlashMenu(ta, 5, root);
    filterSlashMenu('h1');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('text\n# ');
  });

  it('replaces /list with bullet prefix', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/list';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('list');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('- ');
  });

  it('replaces /link with placeholder', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/link';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('link');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('[text](url)');
  });

  it('preserves text before and after slash', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'Before /h1 After';
    // Simulate caret right after `/h1` but before ` After` — at position 11
    // Actually the slash trigger starts at 7 and filter typed is 'h1'
    ta.selectionStart = ta.selectionEnd = 10;

    openSlashMenu(ta, 7, root);
    filterSlashMenu('h1');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    // '/' at pos 7 through caret at 10 replaced by '# '
    expect(ta.value).toBe('Before # ' + ' After');
  });

  it('/bold inserts **** with caret in the middle (cursorOffset)', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/bold';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('bold');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('****');
    // Caret between the two `**` so user can type the bold content.
    expect(ta.selectionStart).toBe(2);
  });

  it('/italic inserts ** with caret in the middle', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/italic';
    ta.selectionStart = ta.selectionEnd = 7;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('italic');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('**');
    expect(ta.selectionStart).toBe(1);
  });

  it('/inlinecode inserts `` with caret in the middle', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/inlinecode';
    ta.selectionStart = ta.selectionEnd = 11;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('inlinecode');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('``');
    expect(ta.selectionStart).toBe(1);
  });

  it('/strike inserts ~~~~ with caret in the middle', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/strike';
    ta.selectionStart = ta.selectionEnd = 7;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('strike');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('~~~~');
    expect(ta.selectionStart).toBe(2);
  });

  it('/todo inserts checkbox prefix', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/todo';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('todo');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('- [ ] ');
  });

  it('/done inserts checked checkbox prefix', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/done';
    ta.selectionStart = ta.selectionEnd = 5;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('done');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toBe('- [x] ');
  });

  it('/h2 and /h3 insert their respective prefixes', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/h2';
    ta.selectionStart = ta.selectionEnd = 3;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('h2');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ta.value).toBe('## ');

    ta.value = '/h3';
    ta.selectionStart = ta.selectionEnd = 3;
    openSlashMenu(ta, 0, root);
    filterSlashMenu('h3');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(ta.value).toBe('### ');
  });

  it('/table inserts a 2-column scaffold', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/table';
    ta.selectionStart = ta.selectionEnd = 6;

    openSlashMenu(ta, 0, root);
    filterSlashMenu('table');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    expect(ta.value).toContain('| Header 1 | Header 2 |');
    expect(ta.value).toContain('| --- | --- |');
    expect(ta.value).toContain('| Cell 1 | Cell 2 |');
  });
});

// ── Command count ──

describe('SLASH_COMMANDS', () => {
  it('has the expanded command set (date/time + headings + blocks + inline marks + media)', () => {
    // PR #205 expanded the command list from 9 to ~20 by adding
    // h2 / h3 / quote / hr / todo / done / table / bold / italic /
    // strike / inlinecode / img.
    expect(SLASH_COMMANDS.length).toBeGreaterThanOrEqual(20);
    const ids = SLASH_COMMANDS.map((c) => c.id);
    for (const expected of [
      'date', 'time', 'datetime', 'iso',
      'h1', 'h2', 'h3',
      'list', 'todo', 'done', 'quote', 'hr', 'code', 'table',
      'bold', 'italic', 'strike', 'inlinecode',
      'link', 'img', 'asset',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('all commands have id and label', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.label).toBeTruthy();
      // A command must provide either a text-insert value or an onSelect handler.
      expect(cmd.insert !== undefined || cmd.onSelect !== undefined).toBe(true);
    }
  });

  it('includes /asset command with onSelect handler', () => {
    const asset = SLASH_COMMANDS.find((c) => c.id === 'asset');
    expect(asset).toBeDefined();
    expect(asset?.onSelect).toBeTypeOf('function');
    expect(asset?.insert).toBeUndefined();
  });
});

// ── onSelect callback dispatch ──

describe('slash command onSelect', () => {
  it('/asset invokes registered callback with context and does not insert text', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = 'before /asset';
    ta.selectionStart = ta.selectionEnd = 13;

    let captured: SlashCommandContext | null = null;
    registerAssetPickerCallback((ctx) => {
      captured = ctx;
    });

    openSlashMenu(ta, 7, root);
    filterSlashMenu('asset');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Callback was invoked with accurate range and the same textarea
    expect(captured).not.toBeNull();
    const ctx = captured as unknown as SlashCommandContext;
    expect(ctx.textarea).toBe(ta);
    expect(ctx.replaceStart).toBe(7);
    expect(ctx.replaceEnd).toBe(13);

    // Text is unchanged — insertion is deferred to the asset picker
    expect(ta.value).toBe('before /asset');

    // Slash menu itself is closed after handing off
    expect(isSlashMenuOpen()).toBe(false);
  });

  it('/asset is a no-op when no callback is registered', () => {
    const ta = document.createElement('textarea');
    ta.setAttribute('data-pkc-field', 'body');
    root.appendChild(ta);
    ta.value = '/asset';
    ta.selectionStart = ta.selectionEnd = 6;

    // No callback
    registerAssetPickerCallback(null);

    openSlashMenu(ta, 0, root);
    filterSlashMenu('asset');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    // Text unchanged, menu closed
    expect(ta.value).toBe('/asset');
    expect(isSlashMenuOpen()).toBe(false);
  });
});

// ── Per-root isolation (WeakMap-scoped state) ──
//
// The slash menu used to stash its runtime state (`menu`, `textarea`,
// `slashPos`, `selectedIndex`, `filteredCommands`) as module-level
// `let`s — effectively a single global. Under a multi-root mount
// (test harness, multi-embed) that global would leak across roots
// and corrupt each other's open-state. The refactor introduced a
// per-root WeakMap<HTMLElement, ActiveSlashMenu> + a single
// `activeRoot` pointer, preserving the "at most one visible menu"
// guarantee while fully isolating dormant state. These tests lock
// that contract in.

describe('slash menu per-root isolation', () => {
  let rootA: HTMLElement;
  let rootB: HTMLElement;
  let taA: HTMLTextAreaElement;
  let taB: HTMLTextAreaElement;

  beforeEach(() => {
    rootA = document.createElement('div');
    rootA.id = 'pkc-root-a';
    document.body.appendChild(rootA);

    rootB = document.createElement('div');
    rootB.id = 'pkc-root-b';
    document.body.appendChild(rootB);

    taA = document.createElement('textarea');
    taA.setAttribute('data-pkc-field', 'body');
    taA.value = '/';
    taA.selectionStart = taA.selectionEnd = 1;
    rootA.appendChild(taA);

    taB = document.createElement('textarea');
    taB.setAttribute('data-pkc-field', 'body');
    taB.value = '/';
    taB.selectionStart = taB.selectionEnd = 1;
    rootB.appendChild(taB);
  });

  afterEach(() => {
    closeSlashMenu();
    rootA.remove();
    rootB.remove();
  });

  it('opening the menu on rootB closes an open menu on rootA (single-visible invariant)', () => {
    openSlashMenu(taA, 0, rootA);
    expect(rootA.querySelector('[data-pkc-region="slash-menu"]')).not.toBeNull();

    openSlashMenu(taB, 0, rootB);

    // The prior menu on rootA must have been removed from the DOM.
    expect(rootA.querySelector('[data-pkc-region="slash-menu"]')).toBeNull();
    // The new menu on rootB is now visible.
    expect(rootB.querySelector('[data-pkc-region="slash-menu"]')).not.toBeNull();
    expect(isSlashMenuOpen()).toBe(true);
  });

  it('closeSlashMenu only clears the currently-active root, leaving dormant per-root state alone', () => {
    // Open on rootA first, then close — this exercises rootA's
    // per-root slot but leaves it dormant.
    openSlashMenu(taA, 0, rootA);
    closeSlashMenu();
    expect(rootA.querySelector('[data-pkc-region="slash-menu"]')).toBeNull();
    expect(isSlashMenuOpen()).toBe(false);

    // Opening on rootB must not throw, and must not touch rootA.
    openSlashMenu(taB, 0, rootB);
    expect(rootB.querySelector('[data-pkc-region="slash-menu"]')).not.toBeNull();
    expect(rootA.querySelector('[data-pkc-region="slash-menu"]')).toBeNull();
  });

  it('keyboard navigation operates on the currently-active root only', () => {
    // Open on rootA, advance selection with ArrowDown.
    openSlashMenu(taA, 0, rootA);
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    const aSelected = rootA.querySelector('[data-pkc-selected="true"]');
    expect(aSelected?.getAttribute('data-pkc-slash-id')).toBe('time');

    // Switch focus to rootB — now only rootB's selection should move.
    openSlashMenu(taB, 0, rootB);
    // Fresh open → selection is back at the first item.
    let bSelected = rootB.querySelector('[data-pkc-selected="true"]');
    expect(bSelected?.getAttribute('data-pkc-slash-id')).toBe('date');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    bSelected = rootB.querySelector('[data-pkc-selected="true"]');
    expect(bSelected?.getAttribute('data-pkc-slash-id')).toBe('time');

    // rootA is no longer the active root; its DOM menu is gone.
    expect(rootA.querySelector('[data-pkc-region="slash-menu"]')).toBeNull();
  });

  it('filterSlashMenu targets the active root, not a previously-opened one', () => {
    openSlashMenu(taA, 0, rootA);
    // Close, then open a new menu on rootB.
    closeSlashMenu();
    openSlashMenu(taB, 0, rootB);

    filterSlashMenu('da');
    // Filter applied to rootB (2 matches: date, datetime).
    const bItems = rootB.querySelectorAll('.pkc-slash-menu-item');
    expect(bItems.length).toBe(2);
    // rootA is empty.
    expect(rootA.querySelectorAll('.pkc-slash-menu-item').length).toBe(0);
  });

  it('executing Enter on the rootB menu inserts into taB and leaves taA untouched', () => {
    // Open on rootA, then switch to rootB (closes A).
    openSlashMenu(taA, 0, rootA);
    openSlashMenu(taB, 0, rootB);
    filterSlashMenu('list');
    handleSlashMenuKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));

    // taB got the insertion.
    expect(taB.value).toBe('- ');
    // taA is untouched.
    expect(taA.value).toBe('/');
    // Menu closed.
    expect(isSlashMenuOpen()).toBe(false);
  });

  it('opens again on the same root after a close without leaking prior filter state', () => {
    // Open → filter → close on rootA. A bug in the old global model
    // could leave `filteredCommands` stale on reopen.
    openSlashMenu(taA, 0, rootA);
    filterSlashMenu('da');
    expect(rootA.querySelectorAll('.pkc-slash-menu-item').length).toBe(2);
    closeSlashMenu();

    // Reopen — must show the full command list.
    openSlashMenu(taA, 0, rootA);
    expect(rootA.querySelectorAll('.pkc-slash-menu-item').length).toBe(SLASH_COMMANDS.length);
  });

  it('isSlashMenuOpen reflects only the currently-visible menu, not any dormant per-root state', () => {
    expect(isSlashMenuOpen()).toBe(false);

    openSlashMenu(taA, 0, rootA);
    expect(isSlashMenuOpen()).toBe(true);

    // Switching active root does not double-count — still "one menu visible".
    openSlashMenu(taB, 0, rootB);
    expect(isSlashMenuOpen()).toBe(true);
    expect(document.querySelectorAll('[data-pkc-region="slash-menu"]').length).toBe(1);

    closeSlashMenu();
    expect(isSlashMenuOpen()).toBe(false);
    expect(document.querySelectorAll('[data-pkc-region="slash-menu"]').length).toBe(0);
  });
});
