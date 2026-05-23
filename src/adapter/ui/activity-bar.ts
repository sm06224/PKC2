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

export type ActivityBarSide = 'left' | 'right';
let barSide: ActivityBarSide = 'left';

export function getActivityBarActiveTab(): ActivityTab {
  return activeTab;
}

export function setActivityBarActiveTab(tab: ActivityTab): void {
  activeTab = tab;
}

// pgc-116 wave-γ #16(MASTER.md §6.2 後続):Activity Bar の左 / 右 配置
// 切替。default 'left'(VSCode 既定)、'right' で sidebar の右へ。
// 位置自体は renderer.ts 側で main の prepend / append を決定する。
export function getActivityBarSide(): ActivityBarSide {
  return barSide;
}

export function setActivityBarSide(side: ActivityBarSide): void {
  barSide = side;
}

export function toggleActivityBarSide(): void {
  barSide = barSide === 'left' ? 'right' : 'left';
}

// テスト用の reset helper。
export function resetActivityBarState(): void {
  activeTab = 'explorer';
  barSide = 'left';
}

export function buildActivityBarElement(): HTMLElement {
  const bar = document.createElement('aside');
  bar.className = 'pkc-activity-bar';
  bar.setAttribute('data-pkc-region', 'activity-bar');
  bar.setAttribute('data-pkc-side', barSide);
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
  // pgc-116 wave-γ #16:Activity Bar 末尾に left/right 切替 button(↔)
  // を追加。click で `toggle-activity-bar-side` action 経由で bar の位置が
  // flip する(left ↔ right)。spacer で間隔を取って separator 効果。
  const spacer = document.createElement('div');
  spacer.className = 'pkc-activity-bar-spacer';
  bar.appendChild(spacer);
  const sideToggle = document.createElement('button');
  sideToggle.className = 'pkc-activity-bar-btn pkc-activity-bar-side-toggle';
  sideToggle.setAttribute('data-pkc-action', 'toggle-activity-bar-side');
  sideToggle.setAttribute('data-pkc-current-side', barSide);
  sideToggle.setAttribute(
    'title',
    barSide === 'left' ? 'Move Activity Bar to right' : 'Move Activity Bar to left',
  );
  sideToggle.setAttribute('aria-label', 'Toggle Activity Bar side');
  sideToggle.textContent = '↔';
  bar.appendChild(sideToggle);
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
