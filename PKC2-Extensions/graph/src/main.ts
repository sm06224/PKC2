/**
 * Graph extension entry point.
 *
 * Launched from a host PKC2 over the secure PKC-Message channel; receives a
 * minimal `GraphProjection` and renders it with **Cytoscape.js** (data-driven
 * styling + force / hierarchy / time-line layouts). Opened standalone (no
 * host), it shows a small demo.
 */

import './tokens.css';
import './graph-styles.css';
import './page.css';
import { createCytoscapeGraph, type CytoscapeGraph, type GraphView, type ColorBy, type EditMode } from './cytoscape-renderer';
import { createElement, isSystemArchetype } from './util';
import { archetypeColor, archetypeEmoji, relationColor } from './colors';
import type { ArchetypeId, Entry, Relation, RelationKind } from './types';
import { makeDemoContainer } from './demo-container';
import { GraphChannel, type ContainerProjection } from './protocol';
import { EXT_INFO } from './deps.generated';

/** Toggle a small ⓘ panel listing version + dependency licenses (build-resolved). */
function toggleInfoPanel(): void {
  const existing = document.querySelector('[data-pkc-region="graph-info"]');
  if (existing) { existing.remove(); return; }
  const panel = createElement('div', 'pkc-graph-info-panel');
  panel.setAttribute('data-pkc-region', 'graph-info');
  const rows = EXT_INFO.dependencies
    .map((d) => `<tr><td>${d.name}</td><td>${d.version}</td><td>${d.license}</td></tr>`)
    .join('');
  panel.innerHTML =
    `<button class="pkc-graph-info-close" data-pkc-action="close-info" aria-label="閉じる">✕</button>`
    + `<div class="pkc-graph-info-title">${EXT_INFO.name} v${EXT_INFO.version}`
    + ` <span>(${EXT_INFO.license} · built ${EXT_INFO.builtAt})</span></div>`
    + `<table class="pkc-graph-info-table"><thead><tr><th>dependency</th><th>version</th><th>license</th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`;
  panel.querySelector('[data-pkc-action="close-info"]')?.addEventListener('click', () => panel.remove());
  document.body.appendChild(panel);
}

// Purpose-driven views: each bundles a layout + which links/grouping it emphasises.
const VIEW_LABELS: { v: GraphView; label: string }[] = [
  { v: 'explore', label: '🧭 探索(全体)' },
  { v: 'folders', label: '📁 フォルダ整理' },
  { v: 'connectivity', label: '🔗 つながり' },
  { v: 'timeline', label: '🕒 時系列' },
];
const COLOR_LABELS: { v: ColorBy; label: string }[] = [
  { v: 'archetype', label: '色: 種別' },
  { v: 'color-tag', label: '色: カラータグ' },
  { v: 'tag', label: '色: タグ' },
  { v: 'depth', label: '色: フォルダ深さ' },
  { v: 'cluster', label: '色: クラスタ' },
];

interface ViewState {
  entries: Entry[];
  relations: Relation[];
  hyperlinks: { from: string; to: string }[];
  externalLinks: { from: string; url: string }[];
  folderOf: Map<string, string>;
  title: string;
  view: GraphView;
  colorBy: ColorBy;
  search: string;
  editMode: EditMode;
  source: 'connecting' | 'host' | 'demo';
  showHyperlinks: boolean;
  showExternal: boolean;
  collapseAssets: boolean;
  collapseTodos: boolean;
  focusFolder: string | null;
}

const state: ViewState = {
  entries: [],
  relations: [],
  hyperlinks: [],
  externalLinks: [],
  folderOf: new Map(),
  title: '',
  view: 'explore',
  colorBy: 'archetype',
  search: '',
  editMode: 'none',
  source: 'connecting',
  showHyperlinks: true,
  showExternal: false,
  collapseAssets: true,
  collapseTodos: true,
  focusFolder: null,
};

let rootEl: HTMLElement | null = null;
let channel: GraphChannel | null = null;
let graph: CytoscapeGraph | null = null;
let toolbarHost: HTMLElement | null = null;
let graphHost: HTMLElement | null = null;
/** Last selection the graph itself sent — its host echo must not re-pan the view. */
let lastSentSelect: { lid: string; at: number } = { lid: '', at: 0 };

export function mountGraphExtension(root: HTMLElement): void {
  rootEl = root;
  ensureLayout();
  channel = new GraphChannel(
    (projection) => applyProjection(projection),
    (lid) => {
      // PKC2 側で選択が変わった。フォルダなら「そのフォルダのみ」にフォーカス
      // (subtree 表示)、それ以外は該当ノードへ寄る。graph 自身の tap echo は
      // 視点を動かさない(操作の邪魔)。
      const isEcho = lastSentSelect.lid === lid && Date.now() - lastSentSelect.at < 1500;
      const ent = state.entries.find((e) => e.lid === lid);
      if (ent?.archetype === 'folder' && !isEcho) {
        state.focusFolder = lid;
        render();
      } else {
        graph?.focusNode(lid, !isEcho);
      }
    },
  );
  if (!channel.start()) {
    showDemo();
  } else {
    state.source = 'connecting';
    render();
  }
}

/** Build the persistent shell once: a toolbar host + a Cytoscape host. */
function ensureLayout(): void {
  if (!rootEl) return;
  rootEl.innerHTML = '';
  toolbarHost = createElement('div');
  graphHost = createElement('div', 'pkc-center-graph-view');
  graphHost.setAttribute('data-pkc-region', 'graph-view');
  rootEl.appendChild(toolbarHost);
  rootEl.appendChild(graphHost);
  graph = createCytoscapeGraph(
    graphHost,
    (lid) => {
      lastSentSelect = { lid, at: Date.now() };
      channel?.select(lid);
    },
    (lid) => channel?.open(lid),
    {
      onMove: (lid, folderLid) => channel?.move(lid, folderLid),
      onRelate: (from, to) => channel?.relate(from, to),
    },
    (arch) => {
      // Tapped an aggregate node → expand that archetype.
      if (arch === 'attachment') state.collapseAssets = false;
      if (arch === 'todo') state.collapseTodos = false;
      render();
    },
  );
}

function applyProjection(p: ContainerProjection): void {
  // pkc-ext の ContainerProjection(2026-06-12 移行): nodes→entries /
  // edges→relations / hyperlinks→links.internal / externalLinks→links.external。
  state.entries = p.entries.map((n) => ({
    lid: n.lid,
    title: n.title,
    body: '',
    archetype: n.archetype as ArchetypeId,
    created_at: n.created_at,
    updated_at: n.updated_at,
    ...(n.tags ? { tags: n.tags } : {}),
    ...(n.color_tag !== undefined ? { color_tag: n.color_tag } : {}),
  }));
  state.relations = p.relations.map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    kind: e.kind as RelationKind,
    created_at: '',
    updated_at: '',
  }));
  state.hyperlinks = p.links?.internal ?? [];
  state.externalLinks = p.links?.external ?? [];
  state.folderOf = new Map(p.entries.filter((n) => n.folder).map((n) => [n.lid, n.folder!]));
  state.title = p.title;
  state.source = 'host';
  render();
}

function showDemo(): void {
  const c = makeDemoContainer();
  state.entries = c.entries;
  state.relations = c.relations;
  state.hyperlinks = [];
  state.externalLinks = [];
  state.folderOf = new Map();
  for (const r of c.relations) {
    if (r.kind === 'structural') {
      const parent = c.entries.find((e) => e.lid === r.from);
      if (parent?.archetype === 'folder') state.folderOf.set(r.to, r.from);
    }
  }
  state.title = c.meta.title;
  state.source = 'demo';
  render();
}

function render(): void {
  if (!rootEl || !toolbarHost || !graph) return;
  // Skip the toolbar rebuild while the user is typing in it (a live
  // projection push must not steal focus from the search box).
  if (!toolbarHost.contains(document.activeElement)) {
    toolbarHost.replaceChildren(renderToolbar());
  }
  graph.update({
    entries: state.entries,
    relations: state.relations,
    hyperlinks: state.hyperlinks,
    externalLinks: state.externalLinks,
    folderOf: state.folderOf,
    view: state.view,
    colorBy: state.colorBy,
    search: state.search,
    showHyperlinks: state.showHyperlinks,
    showExternal: state.showExternal,
    collapseAssets: state.collapseAssets,
    collapseTodos: state.collapseTodos,
    focusFolder: state.focusFolder,
  });
  // Swap the legend overlay without touching Cytoscape's canvas layers.
  if (graphHost) {
    graphHost.querySelector('[data-pkc-region="graph-legend"]')?.remove();
    graphHost.appendChild(renderLegend());
  }
}

function renderToolbar(): HTMLElement {
  const toolbar = createElement('div', 'pkc-center-graph-toolbar');
  toolbar.setAttribute('data-pkc-region', 'graph-toolbar');

  const status = createElement('span', 'pkc-graph-source-label');
  const entryCount = state.entries.filter((e) => !isSystemArchetype(e.archetype)).length;
  if (state.source === 'connecting') {
    status.textContent = '🔌 ホスト PKC2 に接続中…(PKC-Message)';
  } else if (state.source === 'demo') {
    status.textContent = '🧪 スタンドアロン demo(launcher から起動するとホストに接続)';
    status.setAttribute('data-pkc-demo', 'true');
  } else {
    status.textContent = `📊 ${state.title || 'Container'}(${entryCount} entries)— PKC-Message 接続`;
  }
  toolbar.appendChild(status);

  // View (purpose) selector.
  const viewSel = document.createElement('select');
  viewSel.className = 'pkc-graph-mode-select';
  viewSel.setAttribute('data-pkc-field', 'graph-view');
  for (const m of VIEW_LABELS) {
    const opt = document.createElement('option');
    opt.value = m.v;
    opt.textContent = m.label;
    if (m.v === state.view) opt.selected = true;
    viewSel.appendChild(opt);
  }
  viewSel.addEventListener('change', () => { state.view = viewSel.value as GraphView; render(); });
  toolbar.appendChild(viewSel);

  // Colour-by (orthogonal) selector.
  const colorSel = document.createElement('select');
  colorSel.className = 'pkc-graph-mode-select';
  colorSel.setAttribute('data-pkc-field', 'graph-color');
  for (const m of COLOR_LABELS) {
    const opt = document.createElement('option');
    opt.value = m.v;
    opt.textContent = m.label;
    if (m.v === state.colorBy) opt.selected = true;
    colorSel.appendChild(opt);
  }
  colorSel.addEventListener('change', () => { state.colorBy = colorSel.value as ColorBy; render(); });
  toolbar.appendChild(colorSel);

  // Search — live highlight without re-layout (no toolbar rebuild on keystroke).
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'pkc-graph-search';
  search.placeholder = '🔍 タイトル・タグで絞り込み';
  search.value = state.search;
  search.setAttribute('data-pkc-field', 'graph-search');
  search.addEventListener('input', () => {
    state.search = search.value;
    graph?.applySearch(state.search);
  });
  toolbar.appendChild(search);

  // In-document link toggles.
  const linkBtn = createElement('button', 'pkc-btn-small');
  linkBtn.textContent = `🔗 内部リンク(${state.hyperlinks.length})`;
  if (state.showHyperlinks) linkBtn.setAttribute('data-pkc-active', 'true');
  linkBtn.title = '文書内の内部リンク(entry 参照)を辺として表示';
  linkBtn.addEventListener('click', () => { state.showHyperlinks = !state.showHyperlinks; render(); });
  toolbar.appendChild(linkBtn);

  const extBtn = createElement('button', 'pkc-btn-small');
  extBtn.textContent = `🌐 外部リンク(${new Set(state.externalLinks.map((x) => x.url)).size})`;
  if (state.showExternal) extBtn.setAttribute('data-pkc-active', 'true');
  extBtn.title = '文書内の外部 URL を node 化して表示(PKC の外と繋ぐ)';
  extBtn.addEventListener('click', () => { state.showExternal = !state.showExternal; render(); });
  toolbar.appendChild(extBtn);

  // Edit toggles (no re-layout; just switch interaction mode).
  const organizeBtn = createElement('button', 'pkc-btn-small');
  organizeBtn.textContent = '✏️ 整理';
  organizeBtn.title = 'ドラッグでノードをフォルダ箱へ入れて移動(付け替え)';
  if (state.editMode === 'organize') organizeBtn.setAttribute('data-pkc-active', 'true');
  organizeBtn.addEventListener('click', () => {
    state.editMode = state.editMode === 'organize' ? 'none' : 'organize';
    graph?.setEditMode(state.editMode);
    refreshToolbar();
  });
  toolbar.appendChild(organizeBtn);

  const relateBtn = createElement('button', 'pkc-btn-small');
  relateBtn.textContent = '🔗+ リンク作成';
  relateBtn.title = 'ノードからノードへドラッグして関連(semantic relation)を作成';
  if (state.editMode === 'relate') relateBtn.setAttribute('data-pkc-active', 'true');
  relateBtn.addEventListener('click', () => {
    state.editMode = state.editMode === 'relate' ? 'none' : 'relate';
    graph?.setEditMode(state.editMode);
    refreshToolbar();
  });
  toolbar.appendChild(relateBtn);

  // asset / todo aggregate toggles.
  const assetBtn = createElement('button', 'pkc-btn-small');
  assetBtn.textContent = state.collapseAssets ? '📎 Asset 集約' : '📎 Asset 展開';
  if (state.collapseAssets) assetBtn.setAttribute('data-pkc-active', 'true');
  assetBtn.title = 'attachment エントリを1ノードに集約 / 展開';
  assetBtn.addEventListener('click', () => { state.collapseAssets = !state.collapseAssets; render(); });
  toolbar.appendChild(assetBtn);

  const todoBtn = createElement('button', 'pkc-btn-small');
  todoBtn.textContent = state.collapseTodos ? '✅ Todo 集約' : '✅ Todo 展開';
  if (state.collapseTodos) todoBtn.setAttribute('data-pkc-active', 'true');
  todoBtn.title = 'todo エントリを1ノードに集約 / 展開';
  todoBtn.addEventListener('click', () => { state.collapseTodos = !state.collapseTodos; render(); });
  toolbar.appendChild(todoBtn);

  // Folder-focus indicator + clear.
  if (state.focusFolder) {
    const f = state.entries.find((e) => e.lid === state.focusFolder);
    const clear = createElement('button', 'pkc-btn-small');
    clear.textContent = `⬑ 全体に戻る(📁 ${f?.title ?? state.focusFolder})`;
    clear.setAttribute('data-pkc-active', 'true');
    clear.addEventListener('click', () => { state.focusFolder = null; render(); });
    toolbar.appendChild(clear);
  }

  const zoomReset = createElement('button', 'pkc-btn-small');
  zoomReset.textContent = '↺ 表示リセット';
  zoomReset.addEventListener('click', () => graph?.resetView());
  toolbar.appendChild(zoomReset);

  // Saves never shuffle the layout any more; this button is the explicit way
  // to ask for a fresh arrangement.
  const relayoutBtn = createElement('button', 'pkc-btn-small');
  relayoutBtn.textContent = '⟳ 再配置';
  relayoutBtn.title = 'レイアウトを組み直す(通常の更新では配置は固定)';
  relayoutBtn.addEventListener('click', () => graph?.relayout());
  toolbar.appendChild(relayoutBtn);

  const infoBtn = createElement('button', 'pkc-btn-small');
  infoBtn.textContent = 'ⓘ';
  infoBtn.title = `バージョン・依存・ライセンス(${EXT_INFO.name} v${EXT_INFO.version})`;
  infoBtn.addEventListener('click', () => toggleInfoPanel());
  toolbar.appendChild(infoBtn);

  return toolbar;
}

/** Replace only the toolbar (no graph re-layout) — used by edit toggles. */
function refreshToolbar(): void {
  if (toolbarHost) toolbarHost.replaceChildren(renderToolbar());
}

/** A legend overlay (archetypes + relation kinds present). */
function renderLegend(): HTMLElement {
  const legend = createElement('div', 'pkc-graph-legend');
  legend.setAttribute('data-pkc-region', 'graph-legend');
  const heading = createElement('div', 'pkc-graph-legend-heading');
  heading.textContent = '凡例';
  legend.appendChild(heading);

  const archetypes = new Set<string>();
  for (const e of state.entries) if (!isSystemArchetype(e.archetype)) archetypes.add(e.archetype);
  const archRow = createElement('div', 'pkc-graph-legend-row');
  for (const a of Array.from(archetypes).sort()) {
    const item = createElement('span', 'pkc-graph-legend-item');
    const sw = createElement('span', 'pkc-graph-legend-swatch');
    sw.style.background = archetypeColor(a);
    item.appendChild(sw);
    item.appendChild(document.createTextNode(` ${archetypeEmoji(a)} ${a}`));
    archRow.appendChild(item);
  }
  legend.appendChild(archRow);

  const kinds = new Set<string>();
  for (const r of state.relations) kinds.add(r.kind);
  const kindRow = createElement('div', 'pkc-graph-legend-row');
  for (const k of Array.from(kinds).sort()) {
    const item = createElement('span', 'pkc-graph-legend-item');
    const sw = createElement('span', 'pkc-graph-legend-swatch');
    sw.style.background = relationColor(k);
    item.appendChild(sw);
    item.appendChild(document.createTextNode(` ${k}`));
    kindRow.appendChild(item);
  }
  if (state.showHyperlinks && state.hyperlinks.length > 0) {
    const item = createElement('span', 'pkc-graph-legend-item');
    const sw = createElement('span', 'pkc-graph-legend-swatch');
    sw.style.background = '#33d6c0';
    item.appendChild(sw);
    item.appendChild(document.createTextNode(' 内部リンク'));
    kindRow.appendChild(item);
  }
  if (state.showExternal && state.externalLinks.length > 0) {
    const item = createElement('span', 'pkc-graph-legend-item');
    const sw = createElement('span', 'pkc-graph-legend-swatch');
    sw.style.background = '#5b8def';
    item.appendChild(sw);
    item.appendChild(document.createTextNode(' 外部 URL'));
    kindRow.appendChild(item);
  }
  if (kindRow.childElementCount > 0) legend.appendChild(kindRow);
  return legend;
}

const mountTarget = document.getElementById('graph-root');
if (mountTarget) mountGraphExtension(mountTarget);
