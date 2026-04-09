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
});

// ── Command count ──

describe('SLASH_COMMANDS', () => {
  it('has expected initial set of 9 commands', () => {
    expect(SLASH_COMMANDS.length).toBe(9);
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
