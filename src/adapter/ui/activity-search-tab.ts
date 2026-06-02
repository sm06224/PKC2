// Activity Bar `Search` tab(MASTER.md §6.2、pgc-107 wave-γ #8)。
// container 内 entry を **title + body の case-insensitive 部分一致** で
// 絞り込み、最大 N 件を sidebar 領域に list 表示。row click で
// `SELECT_ENTRY` dispatch(既存 select-entry 汎用 handler 透過)。
//
// `searchQuery` は **module-local state**(AppState の searchQuery /
// sidebarFilerQuery とは独立)── Activity Bar search は sidebar filer 検索
// や top-header 検索とは別 surface のため、状態を分離して相互影響ゼロ。
//
// pgc-102 scaffold + pgc-103 Outline / pgc-104 Recent / pgc-105 Pinned に
// 続く 5 件目の tab 実装。残りは Relations のみ。

import type { AppState } from '../state/app-state';
import { filterEntries } from '../../features/search/filter';
import { isUserEntry } from '../../core/model/record';

const MAX_RESULTS = 50;

let searchQuery = '';

export function getActivitySearchQuery(): string {
  return searchQuery;
}

export function setActivitySearchQuery(q: string): void {
  searchQuery = q;
}

export function resetActivitySearchQuery(): void {
  searchQuery = '';
}

export function buildSearchTab(state: AppState): HTMLElement {
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-search';
  wrap.setAttribute('data-pkc-region', 'activity-tab-search');

  const header = document.createElement('div');
  header.className = 'pkc-activity-tab-header';
  const title = document.createElement('span');
  title.className = 'pkc-activity-tab-title';
  title.textContent = '🔍 Search';
  header.appendChild(title);
  wrap.appendChild(header);

  const inputRow = document.createElement('div');
  inputRow.className = 'pkc-activity-search-input-row';
  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'pkc-activity-search-input';
  input.setAttribute('data-pkc-action', 'set-activity-search-query');
  input.setAttribute('placeholder', 'Search entries…');
  input.setAttribute('aria-label', 'Search entries');
  input.value = searchQuery;
  inputRow.appendChild(input);
  wrap.appendChild(inputRow);

  const body = document.createElement('div');
  body.className = 'pkc-activity-tab-search-body';

  if (!state.container) {
    body.appendChild(buildEmptyHint('No container loaded.'));
    wrap.appendChild(body);
    return wrap;
  }

  const trimmed = searchQuery.trim();
  if (trimmed === '') {
    body.appendChild(buildEmptyHint('Type to search entries by title or body.'));
    wrap.appendChild(body);
    return wrap;
  }

  const userEntries = state.container.entries.filter(isUserEntry);
  const matches = filterEntries(userEntries, trimmed).slice(0, MAX_RESULTS);
  if (matches.length === 0) {
    body.appendChild(buildEmptyHint(`No matches for "${trimmed}".`));
    wrap.appendChild(body);
    return wrap;
  }

  const countLine = document.createElement('div');
  countLine.className = 'pkc-activity-search-count';
  countLine.textContent = matches.length === MAX_RESULTS
    ? `${MAX_RESULTS}+ matches`
    : `${matches.length} match${matches.length === 1 ? '' : 'es'}`;
  body.appendChild(countLine);

  const list = document.createElement('ul');
  list.className = 'pkc-search-list';
  for (const e of matches) {
    const li = document.createElement('li');
    li.className = 'pkc-search-item';
    if (e.lid === state.selectedLid) {
      li.setAttribute('data-pkc-active', 'true');
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-search-link';
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', e.lid);
    btn.setAttribute('title', e.title || '(untitled)');
    const icon = document.createElement('span');
    icon.className = 'pkc-search-icon';
    icon.textContent = archetypeIcon(e.archetype);
    btn.appendChild(icon);
    const text = document.createElement('span');
    text.className = 'pkc-search-text';
    text.textContent = e.title || '(untitled)';
    btn.appendChild(text);
    li.appendChild(btn);
    list.appendChild(li);
  }
  body.appendChild(list);
  wrap.appendChild(body);
  return wrap;
}

function buildEmptyHint(text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'pkc-outline-empty-hint';
  hint.textContent = text;
  return hint;
}

function archetypeIcon(arch: string): string {
  switch (arch) {
    case 'text':       return '📝';
    case 'textlog':    return '📋';
    case 'todo':       return '☑';
    case 'attachment': return '📎';
    case 'folder':     return '📁';
    case 'form':       return '📋';
    default:           return '○';
  }
}
