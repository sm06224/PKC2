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
  SLASH_COMMANDS,
} from '@adapter/ui/slash-menu';

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement('div');
  root.id = 'pkc-root';
  document.body.appendChild(root);
});

afterEach(() => {
  closeSlashMenu();
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
    // Should wrap to last command
    expect(selected?.getAttribute('data-pkc-slash-id')).toBe('link');
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
  it('has expected initial set of 8 commands', () => {
    expect(SLASH_COMMANDS.length).toBe(8);
  });

  it('all commands have id and label', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.id).toBeTruthy();
      expect(cmd.label).toBeTruthy();
      expect(cmd.insert).toBeTruthy();
    }
  });
});
