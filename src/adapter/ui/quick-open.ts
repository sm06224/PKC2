/**
 * Quick Open overlay(vscode-grade-overhaul-2026-05 MASTER.md §4.2、wave-α
 * PR pgc-81 POC)。
 *
 * VSCode / Obsidian / Notion 流の **entry fuzzy launcher**。`Ctrl+P` 1 つで
 * 全 entry を fuzzy search、Enter で open。`Ctrl+P` は browser print を
 * 上書きする ── PKC2 では entry navigation の方が圧倒的に高頻度動作。
 *
 * Mode prefix(Notion 流):
 * - **何もなし** → entry search(POC scope、本 PR)
 * - **`>`** → command(Command Palette と同じ commands を delegate)
 * - **`:`** → heading(現 entry の見出しへ jump、後続 PR で本格化)
 * - **`#`** → tag(後続)
 * - **`@`** → recent only(後続)
 * - **`?`** → help（後続)
 * - **`!`** → debug（後続)
 *
 * POC scope:default = entry search、`>` で Command Palette、それ以外の
 * prefix は entry search に fall back(未実装 hint を空 state に出す)。
 *
 * Tier 0 flag `shell.quick_open_enabled`(default OFF)で gate。
 *
 * Recent 出力:`state.navHistory`(`AppState` に既存)の末尾 5 件を popularity
 * top に並べる(query 空のとき)。query 非空時は score-desc sort + recent
 * tie-break。
 */

import type { Entry } from '../../core/model/record';
import type { Dispatcher } from '../state/dispatcher';
import { fuzzyMatchSingle, rankCommands } from '../../features/command/fuzzy';
import { shellQuickOpenEnabled } from './shell-flags';
import { getCommandMetas, executeCommand } from './command-palette';

interface RankedEntry {
  readonly entry: Entry;
  readonly score: number;
}

let mountedRoot: HTMLElement | null = null;
let mountedCleanup: (() => void) | null = null;

export function isQuickOpenOpen(): boolean {
  if (!mountedRoot) return false;
  if (typeof document !== 'undefined' && !document.contains(mountedRoot)) {
    mountedRoot = null;
    mountedCleanup = null;
    return false;
  }
  return true;
}

export function resetQuickOpenOverlay(): void {
  if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
  mountedRoot = null;
  mountedCleanup = null;
}

/**
 * Entry を fuzzy match。title を主に、archetype + lid を補助で。
 * recent(navHistory 末尾)に近いほど tie-break で上位。
 */
export function rankEntries(
  query: string,
  entries: readonly Entry[],
  recentLids: readonly string[],
): RankedEntry[] {
  // recent lid → recency index(末尾が最大値 = 最近)
  const recencyMap = new Map<string, number>();
  recentLids.forEach((lid, i) => {
    recencyMap.set(lid, i);
  });

  if (!query) {
    // query 空 ── 全 entry を recency 降順 + ARCHIVED / opaque は除外。
    const visible = entries.filter((e) => e.archetype !== 'opaque');
    return visible
      .map((e) => ({
        entry: e,
        score: 1 + (recencyMap.get(e.lid) ?? -1),
      }))
      .sort((a, b) => b.score - a.score);
  }

  const out: RankedEntry[] = [];
  for (const e of entries) {
    if (e.archetype === 'opaque') continue;
    // title が主 ── lid / archetype の最大 score を取る
    const titleR = fuzzyMatchSingle(query, e.title || '(untitled)');
    const lidR = fuzzyMatchSingle(query, e.lid);
    const archR = fuzzyMatchSingle(query, e.archetype);
    let score = Math.max(titleR.score, lidR.score, archR.score);
    if (score <= 0) continue;
    // recency tie-break:0.1 per recency rank
    score += (recencyMap.get(e.lid) ?? -1) * 0.1;
    out.push({ entry: e, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

const ARCHETYPE_ICON: Record<string, string> = {
  text: '📝',
  textlog: '📋',
  todo: '☑',
  attachment: '📎',
  folder: '📁',
  form: '📝',
  generic: '📄',
  opaque: '⚫',
};

/**
 * Quick Open overlay を mount する。flag OFF または既に開いている場合は
 * no-op。host に append、Escape / backdrop click で unmount。
 */
export function openQuickOpen(
  host: HTMLElement,
  dispatcher: Dispatcher,
): () => void {
  if (!shellQuickOpenEnabled()) return () => undefined;
  if (isQuickOpenOpen() && mountedRoot) {
    const input = mountedRoot.querySelector<HTMLInputElement>('[data-pkc-field="quick-open-query"]');
    input?.focus();
    return mountedCleanup ?? (() => undefined);
  }

  const overlay = document.createElement('div');
  overlay.className = 'pkc-quick-open-overlay';
  overlay.setAttribute('data-pkc-region', 'quick-open');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Quick Open');

  const backdrop = document.createElement('div');
  backdrop.className = 'pkc-quick-open-backdrop';
  overlay.appendChild(backdrop);

  const card = document.createElement('div');
  card.className = 'pkc-quick-open-card';
  overlay.appendChild(card);

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'pkc-quick-open-input';
  input.setAttribute('data-pkc-field', 'quick-open-query');
  input.setAttribute('placeholder', 'エントリ検索 (>= command、: = heading)…');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', 'Quick Open query');
  card.appendChild(input);

  const modeHint = document.createElement('div');
  modeHint.className = 'pkc-quick-open-mode-hint';
  modeHint.setAttribute('data-pkc-region', 'quick-open-mode');
  card.appendChild(modeHint);

  const list = document.createElement('ul');
  list.className = 'pkc-quick-open-list';
  list.setAttribute('data-pkc-region', 'quick-open-list');
  list.setAttribute('role', 'listbox');
  card.appendChild(list);

  const empty = document.createElement('div');
  empty.className = 'pkc-quick-open-empty';
  empty.textContent = '(該当エントリなし)';
  empty.style.display = 'none';
  card.appendChild(empty);

  const footer = document.createElement('div');
  footer.className = 'pkc-quick-open-footer';
  footer.innerHTML =
    '<kbd>↑↓</kbd> 移動 · <kbd>Enter</kbd> 開く · <kbd>Ctrl+Enter</kbd> 別窓 · <kbd>Esc</kbd> 閉じる';
  card.appendChild(footer);

  host.appendChild(overlay);
  mountedRoot = overlay;

  let activeIndex = 0;
  let mode: 'entry' | 'command' = 'entry';
  let entryItems: RankedEntry[] = [];
  let commandItems: ReturnType<typeof rankCommands> = [];

  function detectMode(q: string): { mode: 'entry' | 'command'; effective: string; hint: string } {
    if (q.startsWith('>')) {
      return { mode: 'command', effective: q.slice(1).trim(), hint: '🛠 Command mode' };
    }
    if (q.startsWith(':')) {
      return { mode: 'entry', effective: q, hint: '📑 Heading mode は POC 範囲外、entry 検索にフォールバック' };
    }
    if (q.startsWith('#')) {
      return { mode: 'entry', effective: q, hint: '🏷 Tag mode は POC 範囲外、entry 検索にフォールバック' };
    }
    return { mode: 'entry', effective: q, hint: '' };
  }

  function renderList(query: string): void {
    const { mode: m, effective, hint } = detectMode(query);
    mode = m;
    if (hint) {
      modeHint.textContent = hint;
      modeHint.style.display = '';
    } else {
      modeHint.style.display = 'none';
      modeHint.textContent = '';
    }
    list.textContent = '';
    activeIndex = 0;

    if (m === 'command') {
      const metas = getCommandMetas();
      commandItems = rankCommands(effective, metas);
      if (commandItems.length === 0) {
        empty.style.display = '';
        list.style.display = 'none';
        return;
      }
      empty.style.display = 'none';
      list.style.display = '';
      const visible = commandItems.slice(0, 50);
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i]!;
        const li = document.createElement('li');
        li.className = 'pkc-quick-open-item';
        li.setAttribute('data-pkc-cmd-id', r.meta.id);
        li.setAttribute('data-pkc-quick-mode', 'command');
        li.setAttribute('role', 'option');
        if (i === 0) {
          li.classList.add('pkc-quick-open-item-active');
          li.setAttribute('aria-selected', 'true');
        }
        const icon = document.createElement('span');
        icon.className = 'pkc-quick-open-item-icon';
        icon.textContent = '🛠';
        li.appendChild(icon);
        const title = document.createElement('span');
        title.className = 'pkc-quick-open-item-title';
        title.textContent = `${r.meta.titleJa} / ${r.meta.titleEn}`;
        li.appendChild(title);
        const cat = document.createElement('span');
        cat.className = 'pkc-quick-open-item-meta';
        cat.textContent = r.meta.category;
        li.appendChild(cat);
        list.appendChild(li);
      }
      return;
    }

    // entry mode
    const state = dispatcher.getState();
    const entries = state.container?.entries ?? [];
    const recentLids = state.navHistory ?? [];
    entryItems = rankEntries(effective, entries, recentLids);
    if (entryItems.length === 0) {
      empty.style.display = '';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = '';
    const visible = entryItems.slice(0, 50);
    for (let i = 0; i < visible.length; i++) {
      const r = visible[i]!;
      const li = document.createElement('li');
      li.className = 'pkc-quick-open-item';
      li.setAttribute('data-pkc-quick-lid', r.entry.lid);
      li.setAttribute('data-pkc-quick-mode', 'entry');
      li.setAttribute('data-pkc-archetype', r.entry.archetype);
      li.setAttribute('role', 'option');
      if (i === 0) {
        li.classList.add('pkc-quick-open-item-active');
        li.setAttribute('aria-selected', 'true');
      }
      const icon = document.createElement('span');
      icon.className = 'pkc-quick-open-item-icon';
      icon.textContent = ARCHETYPE_ICON[r.entry.archetype] ?? '📄';
      li.appendChild(icon);
      const title = document.createElement('span');
      title.className = 'pkc-quick-open-item-title';
      title.textContent = r.entry.title || '(untitled)';
      li.appendChild(title);
      const meta = document.createElement('span');
      meta.className = 'pkc-quick-open-item-meta';
      meta.textContent = r.entry.archetype;
      li.appendChild(meta);
      list.appendChild(li);
    }
  }

  function setActive(next: number): void {
    const len = mode === 'command' ? Math.min(commandItems.length, 50) : Math.min(entryItems.length, 50);
    if (len === 0) return;
    activeIndex = (next + len) % len;
    const all = list.querySelectorAll<HTMLLIElement>('.pkc-quick-open-item');
    all.forEach((li, i) => {
      if (i === activeIndex) {
        li.classList.add('pkc-quick-open-item-active');
        li.setAttribute('aria-selected', 'true');
        li.scrollIntoView({ block: 'nearest' });
      } else {
        li.classList.remove('pkc-quick-open-item-active');
        li.removeAttribute('aria-selected');
      }
    });
  }

  function execActive(opts: { modifier: 'none' | 'ctrl' | 'shift' }): void {
    if (mode === 'command') {
      const r = commandItems[Math.min(activeIndex, commandItems.length - 1)];
      if (!r) return;
      const id = r.meta.id;
      cleanup();
      executeCommand(id);
      return;
    }
    const r = entryItems[Math.min(activeIndex, entryItems.length - 1)];
    if (!r) return;
    const lid = r.entry.lid;
    cleanup();
    if (opts.modifier === 'ctrl') {
      // 別窓 editor で開く ── context menu の ctx-open-window button を click
      const btn = document.querySelector<HTMLElement>('[data-pkc-action="ctx-open-window"]');
      if (btn) {
        // 該当 lid を SELECT してから click(handler が現 selectedLid を使う)
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        btn.click();
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
      }
      return;
    }
    dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
  }

  function handleKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      execActive({ modifier: e.ctrlKey || e.metaKey ? 'ctrl' : e.shiftKey ? 'shift' : 'none' });
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(activeIndex + 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(activeIndex - 1);
      return;
    }
    if (e.key === 'Home' && !e.shiftKey) {
      e.preventDefault();
      setActive(0);
      return;
    }
    if (e.key === 'End' && !e.shiftKey) {
      e.preventDefault();
      const len = mode === 'command' ? Math.min(commandItems.length, 50) : Math.min(entryItems.length, 50);
      setActive(len - 1);
      return;
    }
  }

  function handleInput(): void {
    renderList(input.value);
  }

  function handleBackdropClick(e: MouseEvent): void {
    if (e.target === backdrop) {
      e.preventDefault();
      cleanup();
    }
  }

  function handleListClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    const li = e.target.closest<HTMLLIElement>('.pkc-quick-open-item');
    if (!li) return;
    const isCommand = li.getAttribute('data-pkc-quick-mode') === 'command';
    if (isCommand) {
      const id = li.getAttribute('data-pkc-cmd-id');
      cleanup();
      if (id) executeCommand(id);
    } else {
      const lid = li.getAttribute('data-pkc-quick-lid');
      cleanup();
      if (lid) {
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl) {
          const btn = document.querySelector<HTMLElement>('[data-pkc-action="ctx-open-window"]');
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
          if (btn) btn.click();
        } else {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
        }
      }
    }
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKey);
  backdrop.addEventListener('click', handleBackdropClick);
  list.addEventListener('click', handleListClick);

  renderList('');
  input.focus();

  function cleanup(): void {
    if (mountedRoot !== overlay) return;
    input.removeEventListener('input', handleInput);
    input.removeEventListener('keydown', handleKey);
    backdrop.removeEventListener('click', handleBackdropClick);
    list.removeEventListener('click', handleListClick);
    overlay.remove();
    mountedRoot = null;
    mountedCleanup = null;
  }

  mountedCleanup = cleanup;
  return cleanup;
}

export function toggleQuickOpen(host: HTMLElement, dispatcher: Dispatcher): void {
  if (mountedRoot) {
    mountedCleanup?.();
    return;
  }
  openQuickOpen(host, dispatcher);
}
