// Activity Bar `Relations` tab(MASTER.md §6.2、pgc-108 wave-γ #9)。
// 現在選択中 entry の **outbound / inbound relation**(both kinds)を
// sidebar 領域に list 表示。row click で peer entry を `SELECT_ENTRY`
// dispatch(既存 select-entry 汎用 handler 透過)。
//
// "graph mini" は MASTER の野心目標だが、wave-γ では最小 list 表示 ──
// graph viz は wave-ε(canvas prep)で別途。本 PR は entry-pivot な
// relations browser を Activity Bar から開ける動線を作るのが主目的。
//
// pgc-107 までの 5 tab(Explorer / Outline / Recent / Pinned / Search)に
// 続く **6 件目 = 最後の tab**。これで Activity Bar 全 6 tab 機能化。

import type { AppState } from '../state/app-state';
import { getRelationsForEntry, resolveRelations } from '../../features/relation/selector';

export function buildRelationsTab(state: AppState): HTMLElement {
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-relations';
  wrap.setAttribute('data-pkc-region', 'activity-tab-relations');

  const header = document.createElement('div');
  header.className = 'pkc-activity-tab-header';
  const title = document.createElement('span');
  title.className = 'pkc-activity-tab-title';
  title.textContent = '🔗 Relations';
  header.appendChild(title);
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pkc-activity-tab-relations-body';

  const lid = state.selectedLid;
  if (!lid || !state.container) {
    body.appendChild(buildEmptyHint('Select an entry to see its relations.'));
    wrap.appendChild(body);
    return wrap;
  }
  const entry = state.container.entries.find((e) => e.lid === lid);
  if (!entry) {
    body.appendChild(buildEmptyHint('Selected entry not found.'));
    wrap.appendChild(body);
    return wrap;
  }

  const directed = getRelationsForEntry(state.container.relations, lid);
  const resolved = resolveRelations(directed, state.container.entries);
  if (resolved.length === 0) {
    body.appendChild(buildEmptyHint('No relations for this entry.'));
    wrap.appendChild(body);
    return wrap;
  }

  const outbound = resolved.filter((r) => r.direction === 'outbound');
  const inbound = resolved.filter((r) => r.direction === 'inbound');

  if (outbound.length > 0) {
    body.appendChild(buildSection('Outgoing', '→', outbound, state.selectedLid));
  }
  if (inbound.length > 0) {
    body.appendChild(buildSection('Incoming', '←', inbound, state.selectedLid));
  }

  wrap.appendChild(body);
  return wrap;
}

function buildSection(
  label: string,
  arrow: string,
  rels: ReturnType<typeof resolveRelations>,
  selectedLid: string | null,
): HTMLElement {
  const sec = document.createElement('div');
  sec.className = 'pkc-relations-section';
  sec.setAttribute('data-pkc-direction', label.toLowerCase());

  const head = document.createElement('div');
  head.className = 'pkc-relations-section-label';
  head.textContent = `${arrow} ${label} (${rels.length})`;
  sec.appendChild(head);

  const list = document.createElement('ul');
  list.className = 'pkc-relations-list';
  for (const r of rels) {
    const li = document.createElement('li');
    li.className = 'pkc-relations-item';
    li.setAttribute('data-pkc-kind', r.relation.kind);
    if (r.peer.lid === selectedLid) {
      li.setAttribute('data-pkc-active', 'true');
    }
    const btn = document.createElement('button');
    btn.className = 'pkc-relations-link';
    btn.setAttribute('data-pkc-action', 'select-entry');
    btn.setAttribute('data-pkc-lid', r.peer.lid);
    btn.setAttribute('title', `${r.relation.kind}: ${r.peer.title || '(untitled)'}`);
    const kind = document.createElement('span');
    kind.className = 'pkc-relations-kind';
    kind.textContent = relationKindIcon(r.relation.kind);
    btn.appendChild(kind);
    const text = document.createElement('span');
    text.className = 'pkc-relations-text';
    text.textContent = r.peer.title || '(untitled)';
    btn.appendChild(text);
    li.appendChild(btn);
    list.appendChild(li);
  }
  sec.appendChild(list);
  return sec;
}

function buildEmptyHint(text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'pkc-outline-empty-hint';
  hint.textContent = text;
  return hint;
}

function relationKindIcon(kind: string): string {
  switch (kind) {
    case 'structural': return '📁';
    case 'categorical': return '🏷';
    case 'semantic': return '🔗';
    case 'temporal': return '⏱';
    default: return '○';
  }
}
