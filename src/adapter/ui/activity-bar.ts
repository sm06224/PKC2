// VSCode 流 Activity Bar の最小 scaffold(MASTER.md §6.2、pgc-102 wave-γ
// #4)。sidebar の左に縦 strip として表示、6 tab(Explorer / Search /
// Outline / Relations / Recent / Pinned)を持つ。
//
// 本 PR(pgc-102)の scope は **visual scaffold + tab selection のみ**:
//   - activity bar を flag ON 時に prepend して描画
//   - tab を click で active tab を切替(module-local state)
//   - active tab に `data-pkc-active="true"` を立てて CSS で強調
//   - Explorer は既存 sidebar をそのまま出す(機能後退ゼロ)
//   - Search / Outline / Relations / Recent / Pinned は **placeholder**
//     (後続 pgc-103〜107 で順次実装)
//
// 後続 PR で各 tab の中身を渡せるよう、`getActivityBarActiveTab()` を
// export して renderer.ts 側の sidebar 描画分岐に使う。

export type ActivityTab = 'explorer' | 'search' | 'outline' | 'relations' | 'recent' | 'pinned';

const ALL_TABS: ReadonlyArray<{ id: ActivityTab; icon: string; label: string; tip: string }> = [
  { id: 'explorer',  icon: '📁', label: 'Explorer',  tip: 'Explorer(Ctrl+Shift+E)' },
  { id: 'search',    icon: '🔍', label: 'Search',    tip: 'Search(Ctrl+Shift+F)' },
  { id: 'outline',   icon: '📊', label: 'Outline',   tip: 'Outline(Ctrl+Shift+O)' },
  { id: 'relations', icon: '🔗', label: 'Relations', tip: 'Relations graph(Ctrl+Shift+G)' },
  { id: 'recent',    icon: '📜', label: 'Recent',    tip: 'Recent entries(Ctrl+Shift+R)' },
  { id: 'pinned',    icon: '📌', label: 'Pinned',    tip: 'Pinned entries(Ctrl+Shift+P)' },
];

let activeTab: ActivityTab = 'explorer';

export function getActivityBarActiveTab(): ActivityTab {
  return activeTab;
}

export function setActivityBarActiveTab(tab: ActivityTab): void {
  activeTab = tab;
}

// テスト用の reset helper。
export function resetActivityBarState(): void {
  activeTab = 'explorer';
}

export function buildActivityBarElement(): HTMLElement {
  const bar = document.createElement('aside');
  bar.className = 'pkc-activity-bar';
  bar.setAttribute('data-pkc-region', 'activity-bar');
  bar.setAttribute('aria-label', 'Activity Bar');
  bar.setAttribute('role', 'tablist');
  for (const { id, icon, label, tip } of ALL_TABS) {
    const btn = document.createElement('button');
    btn.className = 'pkc-activity-bar-btn';
    btn.setAttribute('data-pkc-action', 'select-activity-tab');
    btn.setAttribute('data-pkc-activity-tab', id);
    btn.setAttribute('title', tip);
    btn.setAttribute('aria-label', label);
    btn.setAttribute('role', 'tab');
    if (id === activeTab) {
      btn.setAttribute('data-pkc-active', 'true');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.setAttribute('aria-selected', 'false');
    }
    btn.textContent = icon;
    bar.appendChild(btn);
  }
  return bar;
}

// 後続 PR でこの helper を sidebar 描画分岐から call する。本 PR(pgc-102)
// では Explorer 以外を選んだ場合に既存 sidebar の代わりに表示する placeholder
// を提供する(機能ダウンを最小化:Explorer 以外は「Coming soon」表示)。
export function buildActivityTabPlaceholder(tab: ActivityTab): HTMLElement {
  const meta = ALL_TABS.find((t) => t.id === tab);
  const wrap = document.createElement('aside');
  wrap.className = 'pkc-sidebar pkc-activity-tab-placeholder';
  wrap.setAttribute('data-pkc-region', 'activity-tab-placeholder');
  wrap.setAttribute('data-pkc-activity-tab', tab);
  const inner = document.createElement('div');
  inner.className = 'pkc-activity-tab-placeholder-inner';
  const icon = document.createElement('div');
  icon.className = 'pkc-activity-tab-placeholder-icon';
  icon.textContent = meta?.icon ?? '○';
  inner.appendChild(icon);
  const title = document.createElement('div');
  title.className = 'pkc-activity-tab-placeholder-title';
  title.textContent = meta?.label ?? tab;
  inner.appendChild(title);
  const note = document.createElement('div');
  note.className = 'pkc-activity-tab-placeholder-note';
  note.textContent = 'Coming soon(wave-γ で順次実装中)';
  inner.appendChild(note);
  wrap.appendChild(inner);
  return wrap;
}
