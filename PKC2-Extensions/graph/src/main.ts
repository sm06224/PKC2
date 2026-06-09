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
import { createCytoscapeGraph, type CytoscapeGraph, type GraphMode } from './cytoscape-renderer';
import { createElement, isSystemArchetype } from './util';
import { archetypeColor, archetypeEmoji, relationColor } from './colors';
import type { ArchetypeId, Entry, Relation, RelationKind } from './types';
import { makeDemoContainer } from './demo-container';
import { GraphChannel, type GraphProjection } from './protocol';

const MODE_LABELS: { v: GraphMode; label: string }[] = [
  { v: 'relations', label: 'Relations' },
  { v: 'color-tags', label: 'Color tags' },
  { v: 'tag-groups', label: 'Tag groups' },
  { v: 'folder-hierarchy', label: 'Folder hierarchy' },
  { v: 'time-proximity', label: 'Time proximity' },
];

interface ViewState {
  entries: Entry[];
  relations: Relation[];
  title: string;
  mode: GraphMode;
  source: 'connecting' | 'host' | 'demo';
}

const state: ViewState = {
  entries: [],
  relations: [],
  title: '',
  mode: 'relations',
  source: 'connecting',
};

let rootEl: HTMLElement | null = null;
let channel: GraphChannel | null = null;
let graph: CytoscapeGraph | null = null;
let toolbarHost: HTMLElement | null = null;
let graphHost: HTMLElement | null = null;

export function mountGraphExtension(root: HTMLElement): void {
  rootEl = root;
  ensureLayout();
  channel = new GraphChannel((projection) => applyProjection(projection));
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
  graph = createCytoscapeGraph(graphHost, (lid) => {
    // Node tapped → tell the host (Cytoscape handles the visual selection).
    channel?.select(lid);
  });
}

function applyProjection(p: GraphProjection): void {
  state.entries = p.nodes.map((n) => ({
    lid: n.lid,
    title: n.title,
    body: '',
    archetype: n.archetype as ArchetypeId,
    created_at: n.created_at,
    updated_at: n.updated_at,
    ...(n.tags ? { tags: n.tags } : {}),
    ...(n.color_tag !== undefined ? { color_tag: n.color_tag } : {}),
  }));
  state.relations = p.edges.map((e, i) => ({
    id: `e${i}`,
    from: e.from,
    to: e.to,
    kind: e.kind as RelationKind,
    created_at: '',
    updated_at: '',
  }));
  state.title = p.title;
  state.source = 'host';
  render();
}

function showDemo(): void {
  const c = makeDemoContainer();
  state.entries = c.entries;
  state.relations = c.relations;
  state.title = c.meta.title;
  state.source = 'demo';
  render();
}

function render(): void {
  if (!rootEl || !toolbarHost || !graph) return;
  toolbarHost.replaceChildren(renderToolbar());
  graph.update({
    entries: state.entries,
    relations: state.relations,
    mode: state.mode,
    focusLid: null,
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

  const select = document.createElement('select');
  select.className = 'pkc-graph-mode-select';
  for (const m of MODE_LABELS) {
    const opt = document.createElement('option');
    opt.value = m.v;
    opt.textContent = m.label;
    if (m.v === state.mode) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => { state.mode = select.value as GraphMode; render(); });
  toolbar.appendChild(select);

  const zoomReset = createElement('button', 'pkc-btn-small');
  zoomReset.textContent = '↺ 表示リセット';
  zoomReset.addEventListener('click', () => graph?.resetView());
  toolbar.appendChild(zoomReset);

  return toolbar;
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
  if (kinds.size > 0) {
    const kindRow = createElement('div', 'pkc-graph-legend-row');
    for (const k of Array.from(kinds).sort()) {
      const item = createElement('span', 'pkc-graph-legend-item');
      const sw = createElement('span', 'pkc-graph-legend-swatch');
      sw.style.background = relationColor(k);
      item.appendChild(sw);
      item.appendChild(document.createTextNode(` ${k}`));
      kindRow.appendChild(item);
    }
    legend.appendChild(kindRow);
  }
  return legend;
}

const mountTarget = document.getElementById('graph-root');
if (mountTarget) mountGraphExtension(mountTarget);
