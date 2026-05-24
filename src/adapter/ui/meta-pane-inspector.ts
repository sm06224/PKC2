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

import { shellInspectorTabBadgesEnabled } from './shell-flags';

export type InspectorTab = 'properties' | 'references' | 'history' | 'style' | 'ai';

interface InspectorTabMeta {
  id: InspectorTab;
  icon: string;
  label: string;
  /**
   * pgc-124 wave-γ #23:keyboard chord 文字列(tooltip 用、`Ctrl+K P` 等)。
   * pgc-123 で registerKeyBinding 済の chord と一致、ここに併記することで
   * button hover で keybind が見える(VSCode 流の「button hover → tooltip」)。
   */
  keybind?: string;
  /** この tab で表示する `data-pkc-region` 一覧。空配列 = placeholder のみ。 */
  visibleRegions: ReadonlyArray<string>;
}

// 既存 meta pane の region(`renderMetaPaneImpl` 側で setAttribute される
// `data-pkc-region` の値)を tab に振り分ける。`null` = 常時表示(header /
// timestamps 等の framework parts)。
//
// Note(2026-05-23、pgc-117):実際の region は renderer.ts で attr 名を
// grep して確定したもの:
//   - Properties:frontmatter / frontmatter-warning(YAML preview)
//   - References:references(umbrella)+ tags / entry-tags / entry-tag-add /
//     entry-tag-filter / tag-add / relation-create / graph-bulk-relate
//   - History:revision-history(picker)+ revision-info / revision-latest /
//     revision-preview / derived-branches
//   - Style / AI:placeholder(後続 PR)
//
// pgc-117 で History tab を `revision-history` に修正(scaffold 時は誤った
// `'history'` / `'revisions'` を visibleRegions に置いていた)── これで
// flag ON 時に History tab を選んで実際に revision picker が出る。
export const META_PANE_INSPECTOR_TABS: ReadonlyArray<InspectorTabMeta> = [
  {
    id: 'properties',
    icon: '📋',
    label: 'Properties',
    keybind: 'Ctrl+K P',
    visibleRegions: ['frontmatter', 'frontmatter-warning'],
  },
  {
    id: 'references',
    icon: '🔗',
    label: 'References',
    keybind: 'Ctrl+K R',
    visibleRegions: [
      'references', 'references-summary',
      'tags', 'tag-add',
      'entry-tags', 'entry-tag-add', 'entry-tag-filter',
      'relation-create',
      'relations',
      'graph-bulk-relate',
    ],
  },
  {
    id: 'history',
    icon: '📜',
    label: 'History',
    keybind: 'Ctrl+K H',
    visibleRegions: [
      'revision-history',
      'revision-info', 'revision-latest', 'revision-preview',
      'derived-branches',
    ],
  },
  {
    id: 'style',
    icon: '🎨',
    label: 'Style',
    keybind: 'Ctrl+K Y',
    // pgc-118 wave-γ #18:Style tab を placeholder から脱却 ── 読み取り
    // 専用 metrics(archetype / char count / heading 数 / frontmatter style
    // globals 等)を `inspector-style-tab.ts buildInspectorStyleSection` で
    // render、`data-pkc-region="inspector-style-metrics"` で識別。
    visibleRegions: ['inspector-style-metrics'],
  },
  {
    // pgc-166 user bug fix(2026-05-24「この程度を AI と呼ぶのは
    // ちゃんちゃらおかしい」):tab id は `ai`(action-binder の既存
    // 経路 + flag key `shell.inspector_ai_local_enabled` 互換性のため
    // 維持)、**label を「AI」 → 「Hints」 に rename**。Phase 1〜2 の
    // 8 機能は heuristic ベースの「local lint / hints」 であり LLM
    // 接続なし、AI を名乗るのは inflated。Hints(💡 wisdom)が実態と
    // 整合、keybind tooltip も「Inspector Hints」 に。
    id: 'ai',
    icon: '💡',
    label: 'Hints',
    keybind: 'Ctrl+K I',
    visibleRegions: ['inspector-ai-suggestions'],
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

// pgc-201 wave-α' polish #23(v3 統合 master G6 Inspector + G8 visual):
// Inspector tab strip(Properties / References / History / Style / Hints)
// の References / History tab に count badge を重ねる。pgc-180 / 199 / 200
// の Activity Bar badge 流儀を Inspector 側にも展開、user が「この entry に
// relation N 件 / revision N 件ある」 を 1 目で把握できる。
//
// `shell.inspector_tab_badges_enabled` Tier 0 flag(default OFF)で gate。
// Properties / Style / Hints は count badge を出さない(Properties は
// frontmatter の有無で意味希薄、Style は metric 集合、Hints は detector の
// 集約結果が動的で count 算出が大規模)。
export interface InspectorTabBadges {
  readonly properties: number;
  readonly references: number;
  readonly history: number;
  readonly style: number;
  readonly ai: number;
}

export function computeInspectorTabBadges(
  entry?: import('../../core/model/record').Entry | null,
  container?: import('../../core/model/container').Container | null,
): InspectorTabBadges {
  const empty: InspectorTabBadges = {
    properties: 0, references: 0, history: 0, style: 0, ai: 0,
  };
  if (!entry || !container) return empty;
  // References:選択 entry の outbound + inbound relation 数(Activity Bar
  // と同 helper を使うが import cycle 回避のため inline 計算)。
  let relations = 0;
  for (const r of container.relations) {
    if (r.from === entry.lid || r.to === entry.lid) relations++;
  }
  // History:選択 entry の revision 数(getEntryRevisions と同等)。
  let history = 0;
  for (const r of container.revisions) {
    if (r.entry_lid === entry.lid) history++;
  }
  return { ...empty, references: relations, history };
}

export function buildMetaPaneInspectorTabStrip(
  entry?: import('../../core/model/record').Entry | null,
  container?: import('../../core/model/container').Container | null,
): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'pkc-meta-inspector-tabs';
  strip.setAttribute('data-pkc-region', 'meta-inspector-tabs');
  strip.setAttribute('role', 'tablist');
  strip.setAttribute('aria-label', 'Inspector tabs');
  // pgc-201:flag ON + entry/container 指定で badge 計算、それ以外は全 0。
  const badges = (
    shellInspectorTabBadgesEnabled() ? computeInspectorTabBadges(entry, container) : { properties: 0, references: 0, history: 0, style: 0, ai: 0 }
  );
  for (const t of META_PANE_INSPECTOR_TABS) {
    const btn = document.createElement('button');
    btn.className = 'pkc-button-base pkc-button-size-tab pkc-meta-inspector-tab';
    btn.setAttribute('data-pkc-action', 'select-meta-pane-tab');
    btn.setAttribute('data-pkc-meta-pane-tab', t.id);
    // pgc-124 wave-γ #23:tooltip に keybind を併記(VSCode 流)。
    btn.setAttribute('title', t.keybind ? `${t.label} (${t.keybind})` : t.label);
    btn.setAttribute('aria-label', t.label);
    btn.setAttribute('role', 'tab');
    if (t.id === activeInspectorTab) {
      btn.setAttribute('data-pkc-active', 'true');
      btn.setAttribute('aria-selected', 'true');
    } else {
      btn.setAttribute('aria-selected', 'false');
    }
    btn.textContent = t.icon;
    // pgc-201:References / History の count > 0 で badge を append。
    // Activity Bar の `.pkc-activity-bar-badge` と別 class(visual 位置が
    // 異なる tab 形状に合わせるため `.pkc-meta-inspector-tab-badge`)。
    const count = badges[t.id];
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'pkc-meta-inspector-tab-badge';
      badge.setAttribute('data-pkc-badge-tab', t.id);
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = count > 99 ? '99+' : String(count);
      btn.appendChild(badge);
      btn.setAttribute('data-pkc-badge-count', String(count));
    }
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
 *
 * pgc-117 wave-γ #17:visibleRegions が non-empty でも、その region が
 * 実際に pane 内に **1 件も無かった場合** は "No content yet" empty hint
 * を出して user の戸惑いを防ぐ(例:revision 0 件 entry で History tab、
 * frontmatter 無し entry で Properties tab 等)。
 */
export function applyInspectorTabFilter(pane: HTMLElement): void {
  const tab = activeInspectorTab;
  const meta = META_PANE_INSPECTOR_TABS.find((t) => t.id === tab);
  if (!meta) return;
  const visibleRegions = meta.visibleRegions;
  const tabStripRegion = 'meta-inspector-tabs';
  let matchedCount = 0;
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
    } else {
      matchedCount++;
    }
  }
  // placeholder tab で全 section 隠れたら "Coming soon" message を追加。
  if (meta.visibleRegions.length === 0) {
    appendPlaceholderMessage(pane, meta);
    return;
  }
  // pgc-117:non-placeholder tab で 1 件も matched region が無い場合は
  // "No <Label> content yet" empty hint を表示。例:revision 0 件 entry
  // で History tab、frontmatter 無し entry で Properties tab。
  if (matchedCount === 0) {
    appendNoContentHint(pane, meta);
  }
}

function appendNoContentHint(pane: HTMLElement, meta: InspectorTabMeta): void {
  // 連続描画で二重添加を回避
  const old = pane.querySelector('[data-pkc-region="meta-inspector-empty-hint"]');
  if (old) old.remove();
  const hint = document.createElement('div');
  hint.className = 'pkc-meta-inspector-empty-hint';
  hint.setAttribute('data-pkc-region', 'meta-inspector-empty-hint');
  const icon = document.createElement('div');
  icon.className = 'pkc-meta-inspector-placeholder-icon';
  icon.textContent = meta.icon;
  hint.appendChild(icon);
  const title = document.createElement('div');
  title.className = 'pkc-meta-inspector-placeholder-title';
  title.textContent = `No ${meta.label} yet`;
  hint.appendChild(title);
  const note = document.createElement('div');
  note.className = 'pkc-meta-inspector-placeholder-note';
  note.textContent = labelToEmptyMessage(meta.id);
  hint.appendChild(note);
  pane.appendChild(hint);
}

function labelToEmptyMessage(tab: InspectorTab): string {
  switch (tab) {
    case 'properties':
      return 'Add frontmatter properties (--- … ---) at the start of the body.';
    case 'references':
      return 'No tags / relations / markdown links for this entry yet.';
    case 'history':
      return 'No revisions yet. Edit and save the entry to create the first revision.';
    case 'style':
      return 'Coming soon(wave-γ で順次実装中)';
    case 'ai':
      // pgc-147 wave-γ #24:Hints tab(旧 AI tab、pgc-166 で rename)を
      // flag opt-in で local lint に解放。flag OFF の user に opt-in 経路
      // を案内。「local lint = heuristic / LLM 接続なし」 を明示。
      return 'Flag Inspector で `shell.inspector_ai_local_enabled` を ON にすると本文 + container 状態から 8 種の local lint(frontmatter / abandoned / broken / duplicates / outline / archetype / circular / tag)が出ます(LLM 接続なし、計算は端末内)';
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
