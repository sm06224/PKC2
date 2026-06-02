// Activity Bar `Outline` tab(MASTER.md §4.5、pgc-103 wave-γ #5)。
// 現在選択中の entry の h1〜h3 見出しアウトラインを sidebar 領域に表示。
// click で center pane の該当 heading anchor に scroll。
//
// pgc-102 で導入した Activity Bar scaffold を利用 ── flag ON + active tab
// が `'outline'` の時に renderer.ts が `buildOutlineTab(state)` を sidebar
// 位置に描画する(従来 placeholder "Coming soon" を本 PR で置き換え)。

import type { AppState } from '../state/app-state';
import { extractHeadingsFromMarkdown, type TocHeading } from '../../features/markdown/markdown-toc';

export function buildOutlineTab(state: AppState): HTMLElement {
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-outline';
  wrap.setAttribute('data-pkc-region', 'activity-tab-outline');

  const header = document.createElement('div');
  header.className = 'pkc-activity-tab-header';
  const title = document.createElement('span');
  title.className = 'pkc-activity-tab-title';
  title.textContent = '📊 Outline';
  header.appendChild(title);
  wrap.appendChild(header);

  const body = document.createElement('div');
  body.className = 'pkc-activity-tab-outline-body';

  const lid = state.selectedLid;
  const entry = lid ? state.container?.entries.find((e) => e.lid === lid) : undefined;

  if (!entry) {
    body.appendChild(buildEmptyHint('Select an entry to see its outline.'));
    wrap.appendChild(body);
    return wrap;
  }

  // Outline は text / textlog の markdown body のみ対象。他 archetype は
  // 「No outline available for this archetype」を出す。
  if (entry.archetype !== 'text' && entry.archetype !== 'textlog') {
    body.appendChild(buildEmptyHint(`No outline available for ${entry.archetype} archetype.`));
    wrap.appendChild(body);
    return wrap;
  }

  const headings = extractHeadingsFromMarkdown(entry.body || '');
  if (headings.length === 0) {
    body.appendChild(buildEmptyHint('No headings in this entry.'));
    wrap.appendChild(body);
    return wrap;
  }

  const list = document.createElement('ul');
  list.className = 'pkc-outline-list';
  for (const h of headings) {
    list.appendChild(buildOutlineItem(h));
  }
  body.appendChild(list);
  wrap.appendChild(body);
  return wrap;
}

function buildOutlineItem(h: TocHeading): HTMLElement {
  const li = document.createElement('li');
  li.className = 'pkc-outline-item';
  li.setAttribute('data-pkc-outline-level', String(h.level));
  const btn = document.createElement('button');
  btn.className = 'pkc-outline-link';
  btn.setAttribute('data-pkc-action', 'scroll-to-heading');
  btn.setAttribute('data-pkc-heading-slug', h.slug);
  btn.setAttribute('title', h.text);
  btn.textContent = h.text;
  li.appendChild(btn);
  return li;
}

function buildEmptyHint(text: string): HTMLElement {
  const hint = document.createElement('div');
  hint.className = 'pkc-outline-empty-hint';
  hint.textContent = text;
  return hint;
}
