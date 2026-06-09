/**
 * Graph extension entry point.
 *
 * Standalone re-implementation of the host's `renderCenterGraphView`,
 * driven by local view state instead of PKC2's AppState/dispatcher. The
 * Container is supplied by one of three sources:
 *   1. postMessage from a host PKC2 (`{ type: 'pkc-graph:container', container }`)
 *   2. a user-loaded `.pkc` / pkc-data JSON file
 *   3. a bundled demo container (first-open experience)
 *
 * The rendering pipeline (buildGraphForMode → force sim → GraphCanvasPayload
 * → bindGraphCanvas) is identical to the host; only the host-coupled
 * controls (multi-select bulk ops, relation wire editor) are dropped.
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
import type { Container, Entry } from './types';
import { makeDemoContainer } from './demo-container';

type GraphMode = 'relations' | 'color-tags' | 'tag-groups' | 'folder-hierarchy' | 'time-proximity';

const MODE_LABELS: { v: GraphMode; label: string }[] = [
  { v: 'relations', label: 'Relations' },
  { v: 'color-tags', label: 'Color tags' },
  { v: 'tag-groups', label: 'Tag groups' },
  { v: 'folder-hierarchy', label: 'Folder hierarchy' },
  { v: 'time-proximity', label: 'Time proximity' },
];

interface ViewState {
  container: Container | null;
  mode: GraphMode;
  focusLid: string | null;
  vennMode: boolean;
  isDemo: boolean;
}

const state: ViewState = {
  container: null,
  mode: 'relations',
  focusLid: null,
  vennMode: false,
  isDemo: false,
};

let rootEl: HTMLElement | null = null;

/** Mount the extension into a root element and start rendering. */
export function mountGraphExtension(root: HTMLElement): void {
  rootEl = root;
  // Container source 1: host postMessage.
  window.addEventListener('message', (ev: MessageEvent) => {
    const data = ev.data as { type?: string; container?: Container } | null;
    if (data && data.type === 'pkc-graph:container' && data.container) {
      setContainer(data.container);
    }
  });
  // Container source 2: drag a PKC2 export (HTML / JSON) anywhere onto the page.
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) void loadContainerFile(file);
  });
  // Source 3: demo container until something real arrives.
  if (!state.container) {
    state.container = makeDemoContainer();
    state.isDemo = true;
  }
  render();
}

/** Replace the container and re-render. */
export function setContainer(c: Container | null): void {
  state.container = c;
  state.focusLid = null;
  state.isDemo = false;
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

  // Source indicator — which container is on screen (demo vs loaded).
  const status = createElement('span', 'pkc-graph-source-label');
  const entryCount = (state.container?.entries ?? []).filter(
    (e) => !isSystemArchetype(e.archetype),
  ).length;
  if (state.isDemo) {
    status.textContent = '🧪 デモ表示 — PKC2 で書き出した HTML をここにドラッグ、または 📂 で読込';
    status.setAttribute('data-pkc-demo', 'true');
  } else {
    const title = state.container?.meta?.title || 'Container';
    status.textContent = `📊 ${title}(${entryCount} entries)`;
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
  select.addEventListener('change', () => {
    state.mode = select.value as GraphMode;
    render();
  });
  toolbar.appendChild(select);

  // Focus indicator + clear.
  if (state.focusLid && state.container) {
    const focus = state.container.entries.find((e) => e.lid === state.focusLid);
    const label = createElement('span', 'pkc-graph-focus-label');
    label.textContent = `🎯 ${focus?.title || state.focusLid}`;
    toolbar.appendChild(label);
    const clear = createElement('button', 'pkc-btn-small');
    clear.textContent = '全体に戻る';
    clear.addEventListener('click', () => {
      state.focusLid = null;
      render();
    });
    toolbar.appendChild(clear);
  }

  // Zoom reset.
  const zoomReset = createElement('button', 'pkc-btn-small');
  zoomReset.textContent = '↺ 表示リセット';
  zoomReset.title = '拡大縮小・パン位置をリセット(wheel / pinch / drag で操作可能)';
  zoomReset.addEventListener('click', () => {
    const canvas = rootEl?.querySelector<HTMLCanvasElement>('[data-pkc-region="graph-canvas"]');
    if (canvas) resetGraphCanvasZoom(canvas);
  });
  toolbar.appendChild(zoomReset);

  // Galaxy 3D toggle.
  const galaxyOn = graphGalaxyMode() === 1;
  const galaxyToggle = createElement('button', 'pkc-btn-small');
  galaxyToggle.textContent = galaxyOn ? '🌌 Galaxy ON' : '🌌 Galaxy';
  galaxyToggle.title = '3D perspective(folder depth = 奥行き)';
  if (galaxyOn) galaxyToggle.setAttribute('data-pkc-active', 'true');
  galaxyToggle.addEventListener('click', () => {
    graphSettings.galaxyMode = galaxyOn ? 0 : 1;
    render();
  });
  toolbar.appendChild(galaxyToggle);

  // Venn grouping toggle.
  const vennToggle = createElement('button', 'pkc-btn-small');
  vennToggle.textContent = state.vennMode ? '🎨 Venn ON' : '🎨 Venn';
  vennToggle.title = 'folder / tag の所属を Venn 図風に重畳描画(toggle)';
  if (state.vennMode) vennToggle.setAttribute('data-pkc-active', 'true');
  vennToggle.addEventListener('click', () => {
    state.vennMode = !state.vennMode;
    render();
  });
  toolbar.appendChild(vennToggle);

  // Load container file.
  const loadLabel = createElement('label', 'pkc-btn-small');
  loadLabel.textContent = '📂 Container 読込';
  loadLabel.style.cursor = 'pointer';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pkc,.json,.html';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void loadContainerFile(file);
  });
  loadLabel.appendChild(fileInput);
  toolbar.appendChild(loadLabel);

  return toolbar;
}

function renderGraph(): HTMLElement {
  const wrap = createElement('div', 'pkc-center-graph-view');
  wrap.setAttribute('data-pkc-region', 'graph-view');
  wrap.setAttribute('data-pkc-graph-mode', state.mode);

  const width = 960;
  const height = 600;

  const container = state.container;
  const allEntries: Entry[] = (container?.entries ?? []).filter(
    (e) => !isSystemArchetype(e.archetype),
  );
  const allRels = container?.relations ?? [];

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

  // Venn memberships (folder ancestors + tags) when enabled.
  let vennMemberships: Map<string, string[]> | undefined;
  if (state.vennMode && container) {
    vennMemberships = new Map();
    const entriesByLid = new Map<string, Entry>();
    for (const e of container.entries) entriesByLid.set(e.lid, e);
    for (const n of nodes) {
      const groups: string[] = [];
      const ancestors = getAncestorFolderLids(container.relations, container.entries, n.id);
      for (const lid of ancestors) groups.push(`folder:${lid}`);
      const e = entriesByLid.get(n.id);
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

  // Node degree → size.
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
    ...(state.mode === 'time-proximity' && container?.revisions
      ? {
          nodeRevisions: (() => {
            const m = new Map<string, number[]>();
            for (const e of container.entries) {
              const ct = Date.parse(e.created_at ?? '');
              const ut = Date.parse(e.updated_at ?? '');
              if (Number.isFinite(ct) && ct !== ut) m.set(e.lid, [ct]);
            }
            for (const rev of container.revisions) {
              const t = Date.parse(rev.created_at ?? '');
              if (!Number.isFinite(t)) continue;
              const arr = m.get(rev.entry_lid) ?? [];
              arr.push(t);
              m.set(rev.entry_lid, arr);
            }
            return m;
          })(),
          nodeReferences: (() => {
            const m = new Map<string, Array<{ to: string; kind: string }>>();
            for (const r of container.relations) {
              const arr = m.get(r.from) ?? [];
              arr.push({ to: r.to, kind: r.kind });
              m.set(r.from, arr);
            }
            return m;
          })(),
        }
      : {}),
    vennMemberships: vennMemberships ?? undefined,
  };

  queueMicrotask(() => {
    bindGraphCanvas(canvas, payload);
    installGraphCanvasGestures(canvas);
  });

  // Click a node → focus on its 1-hop neighbourhood.
  canvas.addEventListener('pkc-graph-node-click', (ev: Event) => {
    const detail = (ev as CustomEvent).detail as { lid?: string } | undefined;
    if (detail?.lid) {
      state.focusLid = detail.lid;
      // Notify a host (if embedded) that a node was selected.
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'pkc-graph:node-selected', lid: detail.lid }, '*');
      }
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

/**
 * Parse a user-loaded container file. Accepts:
 *   - a PKC2 exported HTML artifact (`pkc2.html` / an exported `.html`) with
 *     the embedded `<script id="pkc-data" type="application/json">` slot,
 *   - the `{ container, export_meta? }` export wrapper as raw JSON,
 *   - a bare Container JSON.
 */
async function loadContainerFile(file: File): Promise<void> {
  try {
    const text = await file.text();
    const parsed = parsePkcPayload(text);
    const container = extractContainer(parsed);
    if (container) {
      setContainer(container);
    } else {
      window.alert(
        'Container を認識できませんでした。\n'
          + 'PKC2 で書き出した HTML(pkc-data 埋込)/ JSON を読み込んでください。',
      );
    }
  } catch (err) {
    window.alert(`読込に失敗しました: ${String(err)}`);
  }
}

/**
 * Extract the JSON payload from either a PKC2 HTML artifact (the
 * `#pkc-data` script slot) or a raw JSON file.
 */
function parsePkcPayload(text: string): unknown {
  const m = text.match(/<script[^>]*id="pkc-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (m) return JSON.parse(m[1]!.trim());
  return JSON.parse(text);
}

function extractContainer(parsed: unknown): Container | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const cand = (Array.isArray(obj.entries) ? obj : obj.container) as Container | undefined;
  if (cand && Array.isArray(cand.entries)) {
    return {
      meta: cand.meta ?? {
        container_id: 'loaded', title: 'Loaded', created_at: '', updated_at: '', schema_version: 1,
      },
      entries: cand.entries,
      relations: cand.relations ?? [],
      revisions: cand.revisions ?? [],
      assets: cand.assets ?? {},
    };
  }
  return null;
}

// Auto-mount when loaded as a page.
const mountTarget = document.getElementById('graph-root');
if (mountTarget) mountGraphExtension(mountTarget);
