// VSCode 流 meta pane Inspector tab strip(MASTER.md §6.3、pgc-109 wave-γ
// #10)。meta pane(右ペイン)を頭の tab strip + 各 tab で section
// 可視性を切替える形に再構成 ── 従来 13+ section の縦長 list が
// chunk 分けされて見通しが良くなる。
//
// pgc-109 scope:**scaffold のみ**
//   - 5 tab(Properties / References / History / Style / AI)
//   - module-local state で active tab を管理
//   - active tab に応じて `data-pkc-region` で section の display を制御
//   - Style / AI は placeholder("Coming soon")
//   - 各 tab の中身の肉付けは後続 PR
//
// renderer.ts の `renderMetaPaneImpl` から flag ON 時のみ call される。

export type InspectorTab = 'properties' | 'references' | 'history' | 'style' | 'ai';

interface InspectorTabMeta {
  id: InspectorTab;
  icon: string;
  label: string;
  /** この tab で表示する `data-pkc-region` 一覧。空配列 = placeholder のみ。 */
  visibleRegions: ReadonlyArray<string>;
}

// 既存 meta pane の region(`renderMetaPaneImpl` 側で setAttribute される
// `data-pkc-region` の値)を tab に振り分ける。`null` = 常時表示(header /
// timestamps 等の framework parts)。
//
// Note:`References` は従来 mode bar の 'references' と同じ region 集合
// (references / tags / entry-tags / relation-create)。History は revisions
// 系 + (将来)diff viewer。Style / AI は新規 placeholder(後続 PR)。
export const META_PANE_INSPECTOR_TABS: ReadonlyArray<InspectorTabMeta> = [
  {
    id: 'properties',
    icon: '📋',
    label: 'Properties',
    visibleRegions: ['frontmatter', 'meta-folder', 'meta-categorical'],
  },
  {
    id: 'references',
    icon: '🔗',
    label: 'References',
    visibleRegions: ['references', 'tags', 'entry-tags', 'relation-create'],
  },
  {
    id: 'history',
    icon: '📜',
    label: 'History',
    visibleRegions: ['history', 'revisions'],
  },
  {
    id: 'style',
    icon: '🎨',
    label: 'Style',
    visibleRegions: [],
  },
  {
    id: 'ai',
    icon: '🧠',
    label: 'AI',
    visibleRegions: [],
  },
];

let activeInspectorTab: InspectorTab = 'properties';

export function getMetaPaneInspectorActiveTab(): InspectorTab {
  return activeInspectorTab;
}

export function setMetaPaneInspectorActiveTab(tab: InspectorTab): void {
  activeInspectorTab = tab;
}

export function resetMetaPaneInspectorState(): void {
  activeInspectorTab = 'properties';
}

export function buildMetaPaneInspectorTabStrip(): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'pkc-meta-inspector-tabs';
  strip.setAttribute('data-pkc-region', 'meta-inspector-tabs');
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Inspector tabs');
  for (const t of META_PANE_INSPECTOR_TABS) {
    const btn = document.createElement('button');
    btn.className = 'pkc-meta-inspector-tab';
    btn.setAttribute('data-pkc-action', 'select-meta-pane-tab');
    btn.setAttribute('data-pkc-meta-pane-tab', t.id);
    btn.setAttribute('title', t.label);
    btn.setAttribute('aria-label', t.label);
    btn.setAttribute('role', 'tab');
    if (t.id === activeInspectorTab) {
      btn.setAttribute('data-pkc-active', 'true');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.setAttribute('aria-selected', 'false');
    }
    btn.textContent = t.icon;
    strip.appendChild(btn);
  }
  return strip;
}

/**
 * `renderMetaPaneImpl` が描画した pane に対して inspector tab の
 * visibility filter を適用する。active tab の `visibleRegions` に含まれない
 * `[data-pkc-region]` 子要素を `display: none` で隠す。`null` の region
 * (header / timestamps / mode-bar 等)は常時表示。`visibleRegions` が
 * 空配列の tab(Style / AI 等の placeholder tab)は **すべての region を
 * 隠し**、placeholder メッセージのみ表示。
 */
export function applyInspectorTabFilter(pane: HTMLElement): void {
  const tab = activeInspectorTab;
  const meta = META_PANE_INSPECTOR_TABS.find((t) => t.id === tab);
  if (!meta) return;
  const visibleRegions = meta.visibleRegions;
  const tabStripRegion = 'meta-inspector-tabs';
  for (const child of Array.from(pane.children)) {
    const region = child.getAttribute('data-pkc-region');
    if (!region) continue; // framework parts(header 等)は常時表示
    if (region === tabStripRegion) continue; // tab strip 自体は隠さない
    // pgc-109:旧 mode bar(pkc-meta-pane-mode-bar)は inspector 有効時は
    // 上位 chunk 分けに置き換わるため非表示。
    if (region === 'meta-pane-mode-bar') {
      (child as HTMLElement).style.display = 'none';
      continue;
    }
    if (visibleRegions.length === 0) {
      // placeholder tab(Style / AI):全 region 非表示
      (child as HTMLElement).style.display = 'none';
      continue;
    }
    if (!visibleRegions.includes(region)) {
      (child as HTMLElement).style.display = 'none';
    }
  }
  // placeholder tab で全 section 隠れたら "Coming soon" message を追加。
  if (meta.visibleRegions.length === 0) {
    appendPlaceholderMessage(pane, meta);
  }
}

function appendPlaceholderMessage(pane: HTMLElement, meta: InspectorTabMeta): void {
  // 既存の placeholder があれば消去(連続描画で二重添加を回避)
  const old = pane.querySelector('[data-pkc-region="meta-inspector-placeholder"]');
  if (old) old.remove();
  const ph = document.createElement('div');
  ph.className = 'pkc-meta-inspector-placeholder';
  ph.setAttribute('data-pkc-region', 'meta-inspector-placeholder');
  const icon = document.createElement('div');
  icon.className = 'pkc-meta-inspector-placeholder-icon';
  icon.textContent = meta.icon;
  ph.appendChild(icon);
  const title = document.createElement('div');
  title.className = 'pkc-meta-inspector-placeholder-title';
  title.textContent = meta.label;
  ph.appendChild(title);
  const note = document.createElement('div');
  note.className = 'pkc-meta-inspector-placeholder-note';
  note.textContent = 'Coming soon(wave-γ で順次実装中)';
  ph.appendChild(note);
  pane.appendChild(ph);
}
