/**
 * Slash Command Menu — minimal input assistance for free-text areas.
 *
 * Scope:
 * - Targets validation-free textareas (body, todo-description)
 * - Triggered by `/` at line start or after whitespace
 * - Renders a small popover with command candidates
 * - Replaces the `/` trigger with the chosen command's text
 *
 * This is adapter-layer: it touches DOM and imports from features.
 */

import {
  formatDate,
  formatTime,
  formatDateTime,
  formatISO8601,
} from '../../features/datetime/datetime-format';

// ── Command definitions ──

export interface SlashCommand {
  id: string;
  label: string;
  /** Text to insert (replaces the `/` trigger). May be a function for dynamic values. */
  insert: string | (() => string);
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'date', label: '/date — yyyy/MM/dd', insert: () => formatDate() },
  { id: 'time', label: '/time — HH:mm:ss', insert: () => formatTime() },
  { id: 'datetime', label: '/datetime — yyyy/MM/dd HH:mm:ss', insert: () => formatDateTime() },
  { id: 'iso', label: '/iso — ISO 8601', insert: () => formatISO8601() },
  { id: 'h1', label: '/h1 — # Heading', insert: '# ' },
  { id: 'list', label: '/list — - Bullet list', insert: '- ' },
  { id: 'code', label: '/code — ``` Code block', insert: '```\n\n```' },
  { id: 'link', label: '/link — [text](url)', insert: '[text](url)' },
];

// ── Trigger detection ──

/** Fields eligible for slash commands (validation-free textareas). */
const SLASH_ELIGIBLE_FIELDS = new Set(['body', 'todo-description']);

/**
 * Returns true if the given textarea is eligible for slash commands.
 */
export function isSlashEligible(el: HTMLTextAreaElement): boolean {
  const field = el.getAttribute('data-pkc-field');
  return field !== null && SLASH_ELIGIBLE_FIELDS.has(field);
}

/**
 * Returns true if slash menu should open based on current input state.
 * Condition: `/` at line start or after whitespace.
 */
export function shouldOpenSlashMenu(text: string, caretPos: number): boolean {
  // The `/` must be the character just typed (at caretPos - 1)
  if (caretPos < 1) return false;
  if (text[caretPos - 1] !== '/') return false;

  // Must be at line start or preceded by whitespace
  if (caretPos === 1) return true; // `/` is the first character
  const charBefore = text[caretPos - 2];
  return charBefore === '\n' || charBefore === ' ' || charBefore === '\t';
}

/**
 * Returns the start position of the `/` trigger for replacement.
 */
export function getSlashTriggerStart(text: string, caretPos: number): number {
  // Walk backward from caret to find the `/`
  let pos = caretPos - 1;
  while (pos >= 0 && text[pos] !== '/' && text[pos] !== '\n') {
    pos--;
  }
  return pos >= 0 && text[pos] === '/' ? pos : -1;
}

// ── Menu UI ──

let activeMenu: HTMLElement | null = null;
let activeTextarea: HTMLTextAreaElement | null = null;
let activeSlashPos = -1;
let selectedIndex = 0;
let filteredCommands: SlashCommand[] = [];

export function isSlashMenuOpen(): boolean {
  return activeMenu !== null;
}

/**
 * Opens the slash menu near the given textarea.
 */
export function openSlashMenu(textarea: HTMLTextAreaElement, slashPos: number, root: HTMLElement): void {
  closeSlashMenu();
  activeTextarea = textarea;
  activeSlashPos = slashPos;
  selectedIndex = 0;
  filteredCommands = [...SLASH_COMMANDS];

  activeMenu = document.createElement('div');
  activeMenu.className = 'pkc-slash-menu';
  activeMenu.setAttribute('data-pkc-region', 'slash-menu');

  renderMenuItems();

  // Position near the textarea
  const rect = textarea.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  activeMenu.style.position = 'absolute';
  activeMenu.style.left = `${rect.left - rootRect.left}px`;
  // Place below the textarea's current line or at bottom of textarea
  activeMenu.style.top = `${rect.bottom - rootRect.top + 4}px`;
  activeMenu.style.zIndex = '100';

  root.appendChild(activeMenu);
}

function renderMenuItems(): void {
  if (!activeMenu) return;
  activeMenu.innerHTML = '';

  if (filteredCommands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'pkc-slash-menu-empty';
    empty.textContent = 'No matching commands';
    activeMenu.appendChild(empty);
    return;
  }

  for (let i = 0; i < filteredCommands.length; i++) {
    const cmd = filteredCommands[i]!;
    const item = document.createElement('div');
    item.className = 'pkc-slash-menu-item';
    if (i === selectedIndex) item.setAttribute('data-pkc-selected', 'true');
    item.setAttribute('data-pkc-slash-id', cmd.id);
    item.textContent = cmd.label;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent textarea blur
      executeCommand(cmd);
    });
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      updateSelection();
    });
    activeMenu.appendChild(item);
  }
}

function updateSelection(): void {
  if (!activeMenu) return;
  const items = activeMenu.querySelectorAll('.pkc-slash-menu-item');
  for (let i = 0; i < items.length; i++) {
    if (i === selectedIndex) {
      items[i]!.setAttribute('data-pkc-selected', 'true');
    } else {
      items[i]!.removeAttribute('data-pkc-selected');
    }
  }
}

/**
 * Filters commands based on text typed after `/`.
 */
export function filterSlashMenu(query: string): void {
  if (!activeMenu) return;
  const q = query.toLowerCase();
  filteredCommands = SLASH_COMMANDS.filter((cmd) => cmd.id.includes(q) || cmd.label.toLowerCase().includes(q));
  selectedIndex = 0;
  renderMenuItems();
}

/**
 * Handles keyboard navigation within the slash menu.
 * Returns true if the event was consumed.
 */
export function handleSlashMenuKeydown(e: KeyboardEvent): boolean {
  if (!activeMenu || filteredCommands.length === 0) {
    if (e.key === 'Escape') {
      closeSlashMenu();
      return true;
    }
    return false;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
      updateSelection();
      return true;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
      updateSelection();
      return true;
    case 'Enter':
    case 'Tab':
      e.preventDefault();
      executeCommand(filteredCommands[selectedIndex]!);
      return true;
    case 'Escape':
      e.preventDefault();
      closeSlashMenu();
      return true;
    default:
      return false;
  }
}

function executeCommand(cmd: SlashCommand): void {
  if (!activeTextarea || activeSlashPos < 0) return;

  const text = typeof cmd.insert === 'function' ? cmd.insert() : cmd.insert;
  const textarea = activeTextarea;
  const caretPos = textarea.selectionStart ?? textarea.value.length;

  // Replace from slashPos to current caret (includes `/` and any typed filter)
  const before = textarea.value.slice(0, activeSlashPos);
  const after = textarea.value.slice(caretPos);
  textarea.value = before + text + after;

  // Place cursor after inserted text
  const newPos = activeSlashPos + text.length;
  textarea.selectionStart = textarea.selectionEnd = newPos;

  // For code block, place cursor between the fences
  if (cmd.id === 'code') {
    textarea.selectionStart = textarea.selectionEnd = activeSlashPos + 4; // after "```\n"
  }

  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();

  closeSlashMenu();
}

/**
 * Closes the slash menu if open.
 */
export function closeSlashMenu(): void {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
  activeTextarea = null;
  activeSlashPos = -1;
  selectedIndex = 0;
  filteredCommands = [];
}
