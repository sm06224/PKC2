/**
 * Graph extension entry point.
 *
 * Launched from a host PKC2's launcher (the single-file HTML lives in
 * `container.assets`). On load it opens a **secure PKC-Message channel** to
 * the host (`window.opener`) and receives a minimal `GraphProjection`
 * (node/edge metadata only — never bodies, assets or revisions). Node
 * selections flow back to the host over the same channel.
 *
 * Opened standalone (no opener), it renders a small demo so the file is
 * still inspectable on its own.
 */

import './tokens.css';
import './graph-styles.css';
import './page.css';
import {
  type GraphCanvasPayload,
  bindGraphCanvas,
  installGraphCanvasGestures,
  resetGraphCanvasZoom,
  archetypeEmoji,
  relationColor,
  buildTimeAxisHint,
} from './graph-canvas';
import { buildGraphForMode, seedTimeProximityLayout } from './payload-builder';
import { seedSimulation, stepSimulation } from './force-layout';
import { getGraphForceParams, graphIterations, graphGalaxyMode, graphSettings } from './flags';
import { createElement, isSystemArchetype, getAncestorFolderLids } from './util';
import type { ArchetypeId, Entry, Relation, RelationKind } from './types';
import { makeDemoContainer } from './demo-container';
import { GraphChannel, type GraphProjection } from './protocol';

type GraphMode = 'relations' | 'color-tags' | 'tag-groups' | 'folder-hierarchy' | 'time-proximity';

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
  focusLid: string | null;
  vennMode: boolean;
  /** 'connecting' until the host's first projection; 'host' once connected; 'demo' standalone. */
  source: 'connecting' | 'host' | 'demo';
}

const state: ViewState = {
  entries: [],
  relations: [],
  title: '',
  mode: 'relations',
  focusLid: null,
  vennMode: false,
  source: 'connecting',
};

let rootEl: HTMLElement | null = null;
let channel: GraphChannel | null = null;

/** Mount the extension and start the secure host channel (or demo). */
export function mountGraphExtension(root: HTMLElement): void {
  rootEl = root;
  channel = new GraphChannel((projection) => applyProjection(projection));
  const hasHost = channel.start();
  if (!hasHost) {
    showDemo();
  } else {
    state.source = 'connecting';
    render();
  }
}

/** Apply a minimal projection received from the host over PKC-Message. */
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
  state.focusLid = null;
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
  if (!rootEl) return;
  rootEl.innerHTML = '';
  rootEl.appendChild(renderToolbar());
  rootEl.appendChild(renderGraph());
}

function renderToolbar(): HTMLElement {
  const toolbar = createElement('div', 'pkc-center-graph-toolbar');
  toolbar.setAttribute('data-pkc-region', 'graph-toolbar');

  // Source / connection indicator.
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

  // Mode selector.
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

  if (state.focusLid) {
    const focus = state.entries.find((e) => e.lid === state.focusLid);
    const label = createElement('span', 'pkc-graph-focus-label');
    label.textContent = `🎯 ${focus?.title || state.focusLid}`;
    toolbar.appendChild(label);
    const clear = createElement('button', 'pkc-btn-small');
    clear.textContent = '全体に戻る';
    clear.addEventListener('click', () => { state.focusLid = null; render(); });
    toolbar.appendChild(clear);
  }

  const zoomReset = createElement('button', 'pkc-btn-small');
  zoomReset.textContent = '↺ 表示リセット';
  zoomReset.addEventListener('click', () => {
    const canvas = rootEl?.querySelector<HTMLCanvasElement>('[data-pkc-region="graph-canvas"]');
    if (canvas) resetGraphCanvasZoom(canvas);
  });
  toolbar.appendChild(zoomReset);

  const galaxyOn = graphGalaxyMode() === 1;
  const galaxyToggle = createElement('button', 'pkc-btn-small');
  galaxyToggle.textContent = galaxyOn ? '🌌 Galaxy ON' : '🌌 Galaxy';
  if (galaxyOn) galaxyToggle.setAttribute('data-pkc-active', 'true');
  galaxyToggle.addEventListener('click', () => { graphSettings.galaxyMode = galaxyOn ? 0 : 1; render(); });
  toolbar.appendChild(galaxyToggle);

  const vennToggle = createElement('button', 'pkc-btn-small');
  vennToggle.textContent = state.vennMode ? '🎨 Venn ON' : '🎨 Venn';
  if (state.vennMode) vennToggle.setAttribute('data-pkc-active', 'true');
  vennToggle.addEventListener('click', () => { state.vennMode = !state.vennMode; render(); });
  toolbar.appendChild(vennToggle);

  return toolbar;
}

function renderGraph(): HTMLElement {
  const wrap = createElement('div', 'pkc-center-graph-view');
  wrap.setAttribute('data-pkc-region', 'graph-view');
  wrap.setAttribute('data-pkc-graph-mode', state.mode);

  const width = 960;
  const height = 600;

  const allEntries: Entry[] = state.entries.filter((e) => !isSystemArchetype(e.archetype));
  const allRels = state.relations;

  const { nodes, links } = buildGraphForMode(allEntries, allRels, state.mode, state.focusLid);
  wrap.setAttribute('data-pkc-node-count', String(nodes.length));
  wrap.setAttribute('data-pkc-entry-count', String(allEntries.length));

  const params = getGraphForceParams(width, height);
  let sim;
  if (state.mode === 'time-proximity') {
    sim = seedTimeProximityLayout(nodes, allEntries, width, height, null, null);
  } else {
    sim = seedSimulation(nodes.map((n) => ({ id: n.id })), width, height);
    const iter = graphIterations();
    for (let i = 0; i < iter; i++) stepSimulation(sim, links, params);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of sim) positions.set(n.id, { x: n.x, y: n.y });

  const timeAxis = state.mode === 'time-proximity' ? buildTimeAxisHint(allEntries) : undefined;

  let vennMemberships: Map<string, string[]> | undefined;
  if (state.vennMode) {
    vennMemberships = new Map();
    const byLid = new Map<string, Entry>();
    for (const e of state.entries) byLid.set(e.lid, e);
    for (const n of nodes) {
      const groups: string[] = [];
      for (const lid of getAncestorFolderLids(state.relations, state.entries, n.id)) groups.push(`folder:${lid}`);
      const e = byLid.get(n.id);
      if (e?.tags && e.tags.length > 0) for (const t of e.tags) groups.push(`tag:${t}`);
      if (groups.length > 0) vennMemberships.set(n.id, groups);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.classList.add('pkc-graph-canvas');
  canvas.setAttribute('data-pkc-region', 'graph-canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  if (state.vennMode) canvas.setAttribute('data-pkc-graph-venn-mode', 'true');
  wrap.appendChild(canvas);

  const degreeMap = new Map<string, number>();
  for (const lk of links) {
    degreeMap.set(lk.from, (degreeMap.get(lk.from) ?? 0) + 1);
    degreeMap.set(lk.to, (degreeMap.get(lk.to) ?? 0) + 1);
  }

  const payload: GraphCanvasPayload = {
    width,
    height,
    mode: state.mode,
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      archetype: n.archetype,
      cssColor: n.cssColor,
      degree: degreeMap.get(n.id) ?? 0,
      ...(n.preview ? { preview: n.preview } : {}),
      ...(n.depth !== undefined ? { depth: n.depth } : {}),
    })),
    positions,
    links,
    selectedLid: state.focusLid,
    regionLids: [],
    regionMode: false,
    collideRadius: params.collideRadius,
    timeAxis: timeAxis ?? undefined,
    vennMemberships: vennMemberships ?? undefined,
  };

  queueMicrotask(() => {
    bindGraphCanvas(canvas, payload);
    installGraphCanvasGestures(canvas);
  });

  // Node click → focus locally + notify the host over the secure channel.
  canvas.addEventListener('pkc-graph-node-click', (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { lid?: string } | undefined;
    if (detail?.lid) {
      state.focusLid = detail.lid;
      channel?.select(detail.lid);
      render();
    }
  });

  wrap.appendChild(renderLegend(nodes, links));
  return wrap;
}

function renderLegend(
  nodes: readonly { archetype: string }[],
  links: readonly { kind?: string }[],
): HTMLElement {
  const legend = createElement('div', 'pkc-graph-legend');
  legend.setAttribute('data-pkc-region', 'graph-legend');
  const legendH = createElement('div', 'pkc-graph-legend-heading');
  legendH.textContent = '凡例';
  legend.appendChild(legendH);

  const archetypesSeen = new Set<string>();
  for (const n of nodes) archetypesSeen.add(n.archetype);
  const archList = createElement('div', 'pkc-graph-legend-row');
  for (const a of Array.from(archetypesSeen).sort()) {
    const item = createElement('span', 'pkc-graph-legend-item');
    item.textContent = `${archetypeEmoji(a)} ${a}`;
    archList.appendChild(item);
  }
  legend.appendChild(archList);

  const kindsSeen = new Set<string>();
  for (const lk of links) if (lk.kind) kindsSeen.add(lk.kind);
  if (kindsSeen.size > 0) {
    const kindsList = createElement('div', 'pkc-graph-legend-row');
    for (const k of Array.from(kindsSeen).sort()) {
      const item = createElement('span', 'pkc-graph-legend-item');
      const swatch = createElement('span', 'pkc-graph-legend-swatch');
      swatch.style.background = relationColor(k, 'currentColor');
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(` ${k}`));
      kindsList.appendChild(item);
    }
    legend.appendChild(kindsList);
  }
  return legend;
}

const mountTarget = document.getElementById('graph-root');
if (mountTarget) mountGraphExtension(mountTarget);
