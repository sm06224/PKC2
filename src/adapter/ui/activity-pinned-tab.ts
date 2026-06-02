// Activity Bar `Pinned` tab(MASTER.md §6.2、pgc-105 wave-γ #7)。
// **pinned tab(`pgc-88` で導入)= ピン留めされた tab = ユーザが固定して
// 「常に手元に置きたい entry」**を sidebar 領域に list 表示する。
// tab-strip 機構の `getOpenTabs().filter(t => t.pinned)` を data source に
// 使うため、pinned 専用 storage を増やさずに済む(既存機構透過)。
//
// row click で `SELECT_ENTRY` dispatch(既存 select-entry 汎用 handler
// 透過、新規 action 追加ゼロ)。pinned tab が無い場合は empty hint。

import type { AppState } from '../state/app-state';
import { getOpenTabs } from './tab-strip';

export function buildPinnedTab(state: AppState): HTMLElement {
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-pinned';
  wrap.setAttribute('data-pkc-region', 'activity-tab-pinned');

  const header = document.createElement('div');
  header.className = 'pkc-activity-tab-header';
  const title = document.createElement('span');
  title.className = 'pkc-activity-tab-title';
  title.textContent = '📌 Pinned';
  header.appendChild(title);
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pkc-activity-tab-pinned-body';

  const pinnedTabs = getOpenTabs().filter((t) => t.pinned === true && t.kind !== 'view');
  if (pinnedTabs.length === 0) {
    body.appendChild(buildEmptyHint('No pinned entries yet. Open a tab and pin it (Ctrl+K Ctrl+W).'));
    wrap.appendChild(body);
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'pkc-pinned-list';
  for (const t of pinnedTabs) {
    const li = document.createElement('li');
    li.className = 'pkc-pinned-item';
    if (t.lid === state.selectedLid) {
      li.setAttribute('data-pkc-active', 'true');
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-pinned-link';
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', t.lid);
    btn.setAttribute('title', t.title || '(untitled)');
    const icon = document.createElement('span');
    icon.className = 'pkc-pinned-icon';
    icon.textContent = '📌';
    btn.appendChild(icon);
    const text = document.createElement('span');
    text.className = 'pkc-pinned-text';
    text.textContent = t.title || '(untitled)';
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
