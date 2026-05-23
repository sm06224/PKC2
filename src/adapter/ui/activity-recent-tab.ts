// Activity Bar `Recent` tab(MASTER.md §6.2、pgc-104 wave-γ #6)。
// `selectRecentEntries` を使って最新 N 件(`recent.default_limit` flag、
// default 10)を sidebar 領域に list 表示。row click で `SELECT_ENTRY`
// dispatch(`data-pkc-action="select-entry"` の汎用 handler 透過)、
// 既存 sidebar 行と同 contract。
//
// pgc-102 Activity Bar scaffold + pgc-103 Outline tab に続く 3 件目の
// tab 実装。Recent は selectRecentEntries(pure feature)を call するだけ
// で済むので最小実装、後続 Search / Relations / Pinned より先に着地。

import type { AppState } from '../state/app-state';
import { selectRecentEntries } from '../../features/entry-order/recent-entries';

export function buildRecentTab(state: AppState): HTMLElement {
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-recent';
  wrap.setAttribute('data-pkc-region', 'activity-tab-recent');

  const header = document.createElement('div');
  header.className = 'pkc-activity-tab-header';
  const title = document.createElement('span');
  title.className = 'pkc-activity-tab-title';
  title.textContent = '📜 Recent';
  header.appendChild(title);
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pkc-activity-tab-recent-body';

  if (!state.container) {
    body.appendChild(buildEmptyHint('No container loaded.'));
    wrap.appendChild(body);
    return wrap;
  }

  const recent = selectRecentEntries(state.container.entries);
  if (recent.length === 0) {
    body.appendChild(buildEmptyHint('No entries yet.'));
    wrap.appendChild(body);
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'pkc-recent-list';
  for (const e of recent) {
    const li = document.createElement('li');
    li.className = 'pkc-recent-item';
    if (e.lid === state.selectedLid) {
      li.setAttribute('data-pkc-active', 'true');
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-recent-link';
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', e.lid);
    btn.setAttribute('title', e.title || '(untitled)');
    const icon = document.createElement('span');
    icon.className = 'pkc-recent-icon';
    icon.textContent = archetypeIcon(e.archetype);
    btn.appendChild(icon);
    const text = document.createElement('span');
    text.className = 'pkc-recent-text';
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
