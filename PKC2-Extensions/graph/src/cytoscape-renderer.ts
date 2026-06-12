/**
 * Cytoscape-based graph renderer.
 *
 * Purpose-driven **views** (explore / folders / connectivity / timeline), an
 * orthogonal **colour-by** axis, **search** highlighting, folder **compound
 * boxes**, in-document **internal hyperlinks**, and **external links
 * aggregated by domain** (so they reach outside the container without breaking
 * the folder grouping). Tap a node to select; double-tap to open it in PKC2.
 */

import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import edgehandles from 'cytoscape-edgehandles';
import type { Entry, Relation } from './types';
import type { ProjectionInternalLink, ProjectionExternalLink } from './protocol';
import { isSystemArchetype, getAncestorFolderLids } from './util';
import { archetypeColor, archetypeEmoji, relationColor, colorTagColor, hashColor, depthColor, emojiSvgUrl } from './colors';

cytoscape.use(fcose);
cytoscape.use(edgehandles);

export type GraphView = 'explore' | 'folders' | 'connectivity' | 'timeline';
export type ColorBy = 'archetype' | 'color-tag' | 'tag' | 'depth' | 'cluster';
export type EditMode = 'none' | 'organize' | 'relate';

/** Edit callbacks (graph → host). */
export interface GraphEditHandlers {
  onMove: (lid: string, folderLid: string) => void;
  onRelate: (from: string, to: string) => void;
}

const COMPOUND_VIEWS: ReadonlySet<GraphView> = new Set(['explore', 'folders']);

export interface GraphRenderInput {
  entries: Entry[];
  relations: Relation[];
  hyperlinks: ProjectionInternalLink[];
  externalLinks: ProjectionExternalLink[];
  folderOf: Map<string, string>;
  view: GraphView;
  colorBy: ColorBy;
  search: string;
  showHyperlinks: boolean;
  showExternal: boolean;
  /** Aggregate all attachment entries into a single node (toggle to expand). */
  collapseAssets: boolean;
  /** Aggregate all todo entries into a single node. */
  collapseTodos: boolean;
  /** Show only this folder + its subtree (null = whole container). */
  focusFolder: string | null;
}

export interface CytoscapeGraph {
  update(input: GraphRenderInput): void;
  /** Highlight/dim by query without re-running layout (live search). */
  applySearch(query: string): void;
  /** Highlight + (optionally) animate-fit to a node; folders fit their contents. */
  focusNode(lid: string, animate?: boolean): void;
  /** Explicit full re-layout (the only thing allowed to shuffle positions). */
  relayout(): void;
  /** Switch interaction mode: 'organize' (drag into folders) / 'relate' (draw edges). */
  setEditMode(mode: EditMode): void;
  resetView(): void;
  destroy(): void;
}

interface EdgehandlesApi { enable(): void; disable(): void; }

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 28);
  }
}

function buildStyle(): StylesheetJson {
  return ([
    {
      selector: 'node',
      style: {
        // The symbol IS the archetype emoji (rendered as an SVG background);
        // the colour shows as a ring behind it.
        'background-color': 'data(color)',
        'background-image': 'data(emoji)',
        'background-fit': 'contain',
        'background-clip': 'none',
        shape: 'ellipse',
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: '#dbe7c8',
        'font-size': 13,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 3,
        'text-wrap': 'ellipsis',
        'text-max-width': '140px',
        'text-outline-width': 2.5,
        'text-outline-color': 'rgba(13,15,10,0.92)',
        'border-width': 2,
        'border-color': 'data(color)',
      },
    },
    {
      selector: 'node[type="folder"], node[archetype="folder"]',
      style: { shape: 'round-rectangle' },
    },
    {
      selector: ':parent',
      style: {
        'background-image': 'none',
        'background-color': 'rgba(240,165,0,0.06)',
        'background-opacity': 0.5,
        'border-width': 1,
        'border-color': 'rgba(240,165,0,0.5)',
        'border-style': 'dashed',
        shape: 'round-rectangle',
        label: 'data(label)',
        'text-valign': 'top',
        'font-size': 14,
        color: '#f0c060',
        padding: '16px',
      },
    },
    {
      selector: 'node[type="root"]',
      style: { 'border-color': 'rgba(150,170,140,0.5)', 'background-color': 'rgba(150,170,140,0.05)', color: '#9aa5b1' },
    },
    {
      selector: 'node[type="extgroup"]',
      style: { 'border-color': 'rgba(91,141,239,0.5)', 'background-color': 'rgba(91,141,239,0.06)', color: '#9bc0ff' },
    },
    {
      selector: 'node[type="agg"]',
      style: { 'border-width': 3, 'border-color': '#f0a500', 'font-size': 13, shape: 'round-rectangle' },
    },
    {
      selector: 'edge',
      style: {
        'line-color': 'data(ecolor)',
        width: 'data(ewidth)',
        'curve-style': 'bezier',
        'target-arrow-color': 'data(ecolor)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        opacity: 0.62,
      },
    },
    {
      selector: 'edge[kind="hyperlink"]',
      style: { 'line-color': '#33d6c0', 'line-style': 'dashed', 'target-arrow-color': '#33d6c0', width: 1.6, opacity: 0.8 },
    },
    {
      selector: 'edge[kind="external"]',
      style: { 'line-color': '#5b8def', 'line-style': 'dotted', 'target-arrow-shape': 'none', width: 1.2, opacity: 0.55 },
    },
    {
      selector: 'node.focused, node:selected',
      style: { 'border-width': 3, 'border-color': '#33ff66', color: '#eaffea' },
    },
    {
      selector: 'node.match',
      style: { 'border-width': 3, 'border-color': '#ffd23f' },
    },
    { selector: '.dim', style: { opacity: 0.12 } },
  ] as unknown) as StylesheetJson;
}

function nodeColor(e: Entry, colorBy: ColorBy, depth: number): string {
  switch (colorBy) {
    case 'color-tag': return colorTagColor(e.color_tag);
    case 'tag': return e.tags && e.tags.length > 0 ? hashColor(e.tags[0]!) : '#6b7280';
    case 'depth': return e.archetype === 'folder' ? '#f0a500' : depthColor(depth);
    default: return archetypeColor(e.archetype);
  }
}

/**
 * Community detection by label propagation over the visible link graph — a
 * lightweight clustering so "色: クラスタ" groups densely-connected entries.
 */
function detectCommunities(nodeIds: string[], links: ReadonlyArray<{ from: string; to: string }>): Map<string, number> {
  const label = new Map<string, number>();
  nodeIds.forEach((id, i) => label.set(id, i));
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const l of links) {
    if (adj.has(l.from) && adj.has(l.to)) {
      adj.get(l.from)!.push(l.to);
      adj.get(l.to)!.push(l.from);
    }
  }
  for (let iter = 0; iter < 12; iter++) {
    let changed = false;
    for (const id of nodeIds) {
      const neigh = adj.get(id)!;
      if (neigh.length === 0) continue;
      const counts = new Map<number, number>();
      let best = label.get(id)!;
      let bestN = -1;
      for (const n of neigh) {
        const l = label.get(n)!;
        const c = (counts.get(l) ?? 0) + 1;
        counts.set(l, c);
        if (c > bestN) { bestN = c; best = l; }
      }
      if (best !== label.get(id)) { label.set(id, best); changed = true; }
    }
    if (!changed) break;
  }
  return label;
}

/** Group key for an external URL: domain + up to 3 path segments. */
function extGroupKey(url: string): string {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean).slice(0, 3);
    return [u.hostname.replace(/^www\./, ''), ...segs].join('/');
  } catch {
    return hostname(url);
  }
}

const AGG_ARCH: Record<string, { emoji: string; label: string }> = {
  attachment: { emoji: '📎', label: 'Assets' },
  todo: { emoji: '✅', label: 'Todos' },
};

function buildElements(input: GraphRenderInput): {
  elements: ElementDefinition[];
  preset: Map<string, { x: number; y: number }> | null;
} {
  const { entries, relations, view, colorBy, showHyperlinks, showExternal, folderOf, focusFolder } = input;
  const compound = COMPOUND_VIEWS.has(view);
  const userEntries = entries.filter((e) => !isSystemArchetype(e.archetype));

  // Scope: a focused folder shows only its subtree; otherwise the whole graph.
  let scope: Set<string>;
  if (focusFolder) {
    scope = new Set([focusFolder]);
    let frontier = [focusFolder];
    while (frontier.length) {
      const next: string[] = [];
      for (const f of frontier) {
        for (const r of relations) {
          if (r.kind === 'structural' && r.from === f && !scope.has(r.to)) { scope.add(r.to); next.push(r.to); }
        }
      }
      frontier = next;
    }
  } else {
    scope = new Set(userEntries.map((e) => e.lid));
  }

  // Aggregate (collapse) asset / todo entries into one node each.
  const collapsed = new Set<string>();
  if (input.collapseAssets) collapsed.add('attachment');
  if (input.collapseTodos) collapsed.add('todo');
  const scopedEntries = userEntries.filter((e) => scope.has(e.lid));
  const visibleEntries = scopedEntries.filter((e) => !collapsed.has(e.archetype) || e.lid === focusFolder);
  const visible = new Set(visibleEntries.map((e) => e.lid));
  const aggCounts = new Map<string, number>();
  for (const e of scopedEntries) {
    if (collapsed.has(e.archetype) && e.lid !== focusFolder) aggCounts.set(e.archetype, (aggCounts.get(e.archetype) ?? 0) + 1);
  }

  const relEdges = relations.filter((r) => {
    if (!visible.has(r.from) || !visible.has(r.to)) return false;
    if (view === 'timeline') return false;
    if (view === 'folders') return r.kind === 'structural';
    if (view === 'connectivity') return r.kind === 'semantic' || r.kind === 'categorical';
    return r.kind === 'structural' || r.kind === 'semantic' || r.kind === 'categorical';
  });
  const hyperEdges = showHyperlinks && view !== 'timeline'
    ? input.hyperlinks.filter((h) => visible.has(h.from) && visible.has(h.to))
    : [];
  const extLinks = showExternal && view !== 'timeline'
    ? input.externalLinks.filter((x) => visible.has(x.from))
    : [];

  const degree = new Map<string, number>();
  const bump = (id: string): void => { degree.set(id, (degree.get(id) ?? 0) + 1); };
  for (const r of relEdges) { bump(r.from); bump(r.to); }
  for (const h of hyperEdges) { bump(h.from); bump(h.to); }
  for (const x of extLinks) bump(x.from);

  const communities = colorBy === 'cluster'
    ? detectCommunities(visibleEntries.map((e) => e.lid), [...relEdges, ...hyperEdges])
    : null;

  const elements: ElementDefinition[] = [];
  // Implicit root: top-level entries nest here so nothing floats unrooted.
  const topParent = focusFolder ?? (compound ? 'root' : null);
  if (compound && !focusFolder) {
    elements.push({ data: { id: 'root', type: 'root', label: '📂 root' } });
  }

  for (const e of visibleEntries) {
    const depth = colorBy === 'depth' || view === 'folders'
      ? getAncestorFolderLids(relations, entries, e.lid).length
      : 0;
    const deg = degree.get(e.lid) ?? 0;
    const color = communities ? hashColor(`cl${communities.get(e.lid) ?? 0}`) : nodeColor(e, colorBy, depth);
    const data: ElementDefinition['data'] = {
      id: e.lid,
      label: e.title || e.lid,
      emoji: emojiSvgUrl(archetypeEmoji(e.archetype)),
      search: `${e.title} ${(e.tags ?? []).join(' ')}`.toLowerCase(),
      color,
      size: 24 + Math.min(deg, 14) * 4,
      archetype: e.archetype,
    };
    if (compound && e.lid !== focusFolder) {
      const parent = folderOf.get(e.lid);
      data.parent = parent && visible.has(parent) && parent !== e.lid ? parent : topParent ?? undefined;
    }
    elements.push({ data });
  }

  // Aggregate nodes for collapsed archetypes.
  for (const [arch, count] of aggCounts) {
    const meta = AGG_ARCH[arch] ?? { emoji: archetypeEmoji(arch), label: arch };
    elements.push({ data: {
      id: `agg:${arch}`, type: 'agg', aggArch: arch,
      label: `${meta.label} (${count})`, emoji: emojiSvgUrl(meta.emoji),
      color: archetypeColor(arch), size: 34,
      ...(topParent ? { parent: topParent } : {}),
    } });
  }

  // External URLs: one node per URL, grouped in a domain/path-3 compound box.
  if (extLinks.length > 0) {
    const groups = new Set<string>();
    const urlNodes = new Set<string>();
    let i = 0;
    for (const x of extLinks) {
      const key = extGroupKey(x.url);
      const grpId = `extgrp:${key}`;
      if (!groups.has(key)) {
        groups.add(key);
        elements.push({ data: { id: grpId, type: 'extgroup', label: `🌐 ${key}` } });
      }
      const urlId = `ext:${x.url}`;
      if (!urlNodes.has(x.url)) {
        urlNodes.add(x.url);
        elements.push({ data: { id: urlId, type: 'external', label: hostname(x.url), emoji: emojiSvgUrl('🔗'), color: '#2a3550', size: 18, parent: grpId } });
      }
      elements.push({ data: { id: `xe${i++}`, source: x.from, target: urlId, kind: 'external', ecolor: '#5b8def', ewidth: 1.1 } });
    }
  }

  for (let i = 0; i < relEdges.length; i++) {
    const r = relEdges[i]!;
    elements.push({ data: { id: `r${i}`, source: r.from, target: r.to, ecolor: relationColor(r.kind), ewidth: r.kind === 'structural' ? 1.5 : 2.5, kind: r.kind } });
  }
  for (let i = 0; i < hyperEdges.length; i++) {
    const h = hyperEdges[i]!;
    elements.push({ data: { id: `h${i}`, source: h.from, target: h.to, kind: 'hyperlink', ecolor: '#33d6c0', ewidth: 1.6 } });
  }

  let preset: Map<string, { x: number; y: number }> | null = null;
  if (view === 'timeline') {
    preset = new Map();
    const times = visibleEntries.map((e) => Date.parse(e.updated_at)).filter((t) => Number.isFinite(t));
    const minT = times.length ? Math.min(...times) : 0;
    const maxT = times.length ? Math.max(...times) : 1;
    const span = Math.max(1, maxT - minT);
    const lanes = new Map<string, number>();
    const laneOf = (a: string): number => { if (!lanes.has(a)) lanes.set(a, lanes.size); return lanes.get(a)!; };
    const seen = new Map<string, number>();
    for (const e of visibleEntries) {
      const t = Date.parse(e.updated_at);
      const x = (((Number.isFinite(t) ? t : minT) - minT) / span) * 1600;
      const lane = laneOf(e.archetype);
      const key = `${lane}:${Math.round(x / 60)}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      preset.set(e.lid, { x, y: lane * 140 + (k % 5) * 26 });
    }
  }

  return { elements, preset };
}

function layoutFor(view: GraphView, preset: Map<string, { x: number; y: number }> | null): cytoscape.LayoutOptions {
  if (view === 'timeline' && preset) {
    return { name: 'preset', positions: (n: cytoscape.NodeSingular) => preset.get(n.id()) ?? { x: 0, y: 0 }, fit: true, padding: 40 } as unknown as cytoscape.LayoutOptions;
  }
  return {
    name: 'fcose',
    quality: 'default',
    animate: true,
    animationDuration: 450,
    randomize: true,
    nodeRepulsion: view === 'connectivity' ? 9000 : 6500,
    idealEdgeLength: view === 'connectivity' ? 120 : 90,
    nestingFactor: 0.2,
    padding: 30,
  } as unknown as cytoscape.LayoutOptions;
}

function applySearch(cy: Core, query: string): void {
  const q = query.trim().toLowerCase();
  if (!q) { cy.elements().removeClass('dim match'); return; }
  cy.nodes().forEach((n) => {
    const hay = String(n.data('search') ?? n.data('label') ?? '').toLowerCase();
    const match = hay.includes(q);
    n.toggleClass('match', match);
    n.toggleClass('dim', !match);
  });
  cy.edges().forEach((e) => {
    e.toggleClass('dim', e.source().hasClass('dim') || e.target().hasClass('dim'));
  });
}

export function createCytoscapeGraph(
  container: HTMLElement,
  onSelect: (lid: string) => void,
  onOpen: (lid: string) => void,
  edit: GraphEditHandlers,
  onAggExpand: (arch: string) => void,
): CytoscapeGraph {
  // Custom wheel zoom (cytoscape's fixed wheelSensitivity can't react to Alt):
  // high sensitivity by default, finer while Alt is held.
  const cy: Core = cytoscape({ container, style: buildStyle(), userZoomingEnabled: false, minZoom: 0.04, maxZoom: 6 });
  container.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rate = e.altKey ? 0.0009 : 0.0042; // Alt = finer control
    const next = cy.zoom() * Math.exp(-e.deltaY * rate);
    const r = container.getBoundingClientRect();
    cy.zoom({ level: Math.max(0.04, Math.min(next, 6)), renderedPosition: { x: e.clientX - r.left, y: e.clientY - r.top } });
  }, { passive: false });
  // Test hook(PKC2 の __forTest 流儀): E2E が位置・viewport を検証できるよう
  // container 要素経由で core を参照可能にする。
  (container as HTMLElement & { __cyForTest?: Core }).__cyForTest = cy;
  container.style.position = 'relative';

  let editMode: EditMode = 'none';

  // Edge-drawing for "relate" mode (cytoscape-edgehandles).
  const eh = (cy as unknown as { edgehandles: (o: unknown) => EdgehandlesApi }).edgehandles({
    snap: true,
    canConnectFn: (s: cytoscape.NodeSingular, t: cytoscape.NodeSingular) =>
      s.id() !== t.id() && !s.id().startsWith('dom:') && !t.id().startsWith('dom:') && !s.isParent() && !t.isParent(),
  });
  eh.disable();
  cy.on('ehcomplete', (_evt: unknown, source: cytoscape.NodeSingular, target: cytoscape.NodeSingular, added: cytoscape.EdgeSingular) => {
    added.remove(); // host creates the real relation and pushes a fresh projection
    edit.onRelate(source.id(), target.id());
  });

  // Drag a node into a folder box (organize mode) → reparent.
  cy.on('dragfree', 'node', (evt) => {
    if (editMode !== 'organize') return;
    const n = evt.target as cytoscape.NodeSingular;
    const id = n.id();
    if (id.startsWith('dom:') || n.isParent()) return;
    const pos = n.position();
    let bestFolder: string | null = null;
    let bestArea = Infinity;
    cy.nodes('[archetype="folder"]').forEach((f) => {
      if (f.id() === id) return;
      const bb = f.boundingBox();
      if (pos.x >= bb.x1 && pos.x <= bb.x2 && pos.y >= bb.y1 && pos.y <= bb.y2) {
        const area = (bb.x2 - bb.x1) * (bb.y2 - bb.y1);
        if (area < bestArea) { bestArea = area; bestFolder = f.id(); }
      }
    });
    const curParent = n.parent().nonempty() ? n.parent().first().id() : '';
    if (bestFolder && bestFolder !== curParent) edit.onMove(id, bestFolder);
  });

  // Tap = select, double-tap = open (manual detection). Skip while editing.
  let lastTapId = '';
  let lastTapAt = 0;
  cy.on('tap', 'node', (evt) => {
    if (editMode !== 'none') return;
    const id = evt.target.id();
    if (id.startsWith('agg:')) { onAggExpand(String(evt.target.data('aggArch'))); return; }
    // Virtual nodes (external URLs/groups, root) are not real entries.
    if (id.startsWith('ext:') || id.startsWith('extgrp:') || id === 'root') return;
    const now = Date.now();
    if (id === lastTapId && now - lastTapAt < 320) {
      onOpen(id);
      lastTapId = '';
    } else {
      onSelect(id);
      lastTapId = id;
      lastTapAt = now;
    }
  });

  // Minimap: a small read-only overview; click to pan the main view.
  const MINI_W = 180;
  const MINI_H = 120;
  const mini = document.createElement('div');
  mini.setAttribute('data-pkc-region', 'graph-minimap');
  mini.style.cssText =
    `position:absolute;right:8px;bottom:8px;width:${MINI_W}px;height:${MINI_H}px;z-index:40;`
    + 'background:rgba(13,15,10,0.85);border:1px solid #1e2a16;border-radius:3px;overflow:hidden;';
  container.appendChild(mini);
  const miniCy: Core = cytoscape({
    container: mini,
    userZoomingEnabled: false,
    userPanningEnabled: false,
    boxSelectionEnabled: false,
    autoungrabify: true,
    style: [{ selector: 'node', style: { 'background-color': 'data(color)', width: 6, height: 6, label: '' } },
      { selector: 'edge', style: { width: 0.5, 'line-color': '#3a4632', 'curve-style': 'haystack' } }] as unknown as StylesheetJson,
  });
  // 現在のメイン表示範囲を示す矩形(2026-06-12 修正: 従来は矩形が無く、
  // ノードも fit 後の zoom で 1px 未満に縮んで「何も映らない」状態だった)。
  const viewRect = document.createElement('div');
  viewRect.setAttribute('data-pkc-region', 'graph-minimap-viewport');
  viewRect.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;'
    + 'border:1px solid #9ec27a;background:rgba(158,194,122,0.12);box-sizing:border-box;';
  mini.appendChild(viewRect);
  function updateMiniViewport(): void {
    if (miniCy.nodes().length === 0) { viewRect.style.display = 'none'; return; }
    const ext = cy.extent(); // main viewport in model coords
    const mz = miniCy.zoom();
    const mpan = miniCy.pan();
    viewRect.style.display = 'block';
    viewRect.style.left = `${ext.x1 * mz + mpan.x}px`;
    viewRect.style.top = `${ext.y1 * mz + mpan.y}px`;
    viewRect.style.width = `${ext.w * mz}px`;
    viewRect.style.height = `${ext.h * mz}px`;
  }
  cy.on('viewport', () => updateMiniViewport());
  mini.addEventListener('click', (ev) => {
    const r = mini.getBoundingClientRect();
    const mx = ev.clientX - r.left;
    const my = ev.clientY - r.top;
    const mpan = miniCy.pan();
    const mz = miniCy.zoom();
    const modelX = (mx - mpan.x) / mz;
    const modelY = (my - mpan.y) / mz;
    cy.pan({ x: container.clientWidth / 2 - modelX * cy.zoom(), y: container.clientHeight / 2 - modelY * cy.zoom() });
  });

  const tip = document.createElement('div');
  tip.className = 'pkc-graph-hover-tooltip';
  tip.style.cssText =
    'position:absolute;z-index:50;pointer-events:none;display:none;'
    + 'background:rgba(13,15,10,0.95);color:#c8d8b0;border:1px solid #1e2a16;'
    + 'border-radius:3px;padding:3px 6px;font-size:11px;max-width:280px;word-break:break-all;';
  container.style.position = 'relative';
  container.appendChild(tip);
  cy.on('mouseover', 'node', (evt) => {
    const id = evt.target.id();
    tip.textContent = id.startsWith('dom:') ? id.slice(4) : String(evt.target.data('label') ?? '');
    tip.style.display = 'block';
  });
  cy.on('mousemove', 'node', (evt) => {
    const pos = evt.renderedPosition ?? { x: 0, y: 0 };
    tip.style.left = `${pos.x + 12}px`;
    tip.style.top = `${pos.y + 12}px`;
  });
  cy.on('mouseout', 'node', () => { tip.style.display = 'none'; });

  // Mirror the MAIN graph's positions into the minimap (no separate layout,
  // so the minimap always matches what the user sees).
  function syncMinimap(): void {
    miniCy.elements().remove();
    const defs: ElementDefinition[] = [];
    cy.nodes().forEach((n) => {
      // compound 親(フォルダ箱)は子の重心に描かれるだけでノイズになる
      // ので minimap では除外。`color` が無い仮想ノードは灰色に落とす
      // (style mapper の missing-data warning も消える)。
      if (n.isParent()) return;
      defs.push({
        group: 'nodes',
        data: { id: n.id(), color: (n.data('color') as string | undefined) ?? '#999' },
        position: { ...n.position() },
      });
    });
    const miniIds = new Set(defs.map((d) => String(d.data.id)));
    cy.edges().forEach((e) => {
      if (!miniIds.has(e.source().id()) || !miniIds.has(e.target().id())) return;
      defs.push({ group: 'edges', data: { id: e.id(), source: e.source().id(), target: e.target().id() } });
    });
    miniCy.add(defs);
    miniCy.fit(undefined, 6);
    // fit の zoom は容易に 0.1 を割る。node 径は model px 指定なので、
    // zoom の逆数を掛けて **画面上 ~4px** を維持する(従来は 6 model px
    // 固定 → fit 後に 1px 未満となり実質不可視 = 「ミニマップが動いて
    // いない」と見える根本原因)。
    const z = miniCy.zoom() || 1;
    miniCy.nodes().style({ width: 4 / z, height: 4 / z });
    miniCy.edges().style({ width: Math.min(1 / z, 1.5) });
    updateMiniViewport();
  }
  cy.on('layoutstop', () => syncMinimap());

  let lastView: GraphView | null = null;
  let lastFocus: string | null = null;
  let lastCollapse = '';
  let lastPreset: Map<string, { x: number; y: number }> | null = null;

  function setCounts(): void {
    container.setAttribute('data-pkc-node-count', String(cy.nodes('[!type]').length));
    container.setAttribute('data-pkc-external-count', String(cy.nodes('[type="external"]').length));
    container.setAttribute('data-pkc-hyperlink-count', String(cy.edges('[kind="hyperlink"]').length));
  }

  return {
    update(input: GraphRenderInput): void {
      const { elements, preset } = buildElements(input);
      lastPreset = preset;
      // A different node SET (view / folder focus / collapse / external toggle)
      // warrants a fresh layout; an unchanged set keeps positions stable.
      const collapseKey = `${input.collapseAssets}/${input.collapseTodos}/${input.showExternal}/${input.showHyperlinks}`;
      const setChanged = lastView !== input.view || lastFocus !== input.focusFolder || lastCollapse !== collapseKey;
      const viewChanged = setChanged;
      const firstRender = cy.nodes().length === 0;
      lastView = input.view;
      lastFocus = input.focusFolder;
      lastCollapse = collapseKey;

      const nodeDefs: ElementDefinition[] = [];
      const edgeDefs: ElementDefinition[] = [];
      for (const el of elements) {
        ((el.data as { source?: unknown }).source === undefined ? nodeDefs : edgeDefs).push(el);
      }

      if (firstRender || viewChanged) {
        // Full (re)build with layout — only on first paint or explicit view switch.
        cy.elements().remove();
        cy.add(elements);
        cy.layout(layoutFor(input.view, preset)).run();
      } else {
        // Stable incremental patch: a save / live push must NOT shuffle the
        // graph. Surviving nodes keep their positions, the viewport is
        // preserved, and new nodes appear next to a connected neighbour.
        const pan = { ...cy.pan() };
        const zoom = cy.zoom();
        const newIds = new Set(nodeDefs.map((d) => String(d.data.id)));
        const addedIds: string[] = [];
        cy.startBatch();
        cy.edges().remove();
        cy.nodes().forEach((n) => { if (!newIds.has(n.id())) n.remove(); });
        for (const def of nodeDefs) {
          const id = String(def.data.id);
          const existing = cy.getElementById(id);
          if (existing.nonempty()) {
            const data = { ...def.data } as Record<string, unknown>;
            const nextParent = data.parent as string | undefined;
            delete data.parent;
            existing.data(data);
            const curParent = existing.parent().nonempty() ? existing.parent().first().id() : undefined;
            if (curParent !== nextParent) existing.move({ parent: nextParent ?? null });
          } else {
            cy.add(def);
            addedIds.push(id);
          }
        }
        cy.add(edgeDefs);
        const addedSet = new Set(addedIds);
        for (const id of addedIds) {
          const n = cy.getElementById(id);
          const neigh = n.neighborhood('node').filter((m) => !addedSet.has(m.id()));
          if (neigh.nonempty()) {
            let sx = 0; let sy = 0;
            neigh.forEach((m) => { sx += m.position('x'); sy += m.position('y'); });
            n.position({ x: sx / neigh.length + 48, y: sy / neigh.length + 32 });
          } else {
            const ext = cy.extent();
            n.position({ x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 });
          }
        }
        if (input.view === 'timeline' && preset) {
          // Timeline positions ARE the data (x = updated_at) — refresh them.
          cy.nodes().forEach((n) => { const p = preset.get(n.id()); if (p) n.position(p); });
        }
        cy.endBatch();
        cy.viewport({ zoom, pan }); // exactly where the user left it
      }
      applySearch(cy, input.search);
      syncMinimap();
      setCounts();
    },
    applySearch(query: string): void {
      applySearch(cy, query);
      container.setAttribute('data-pkc-match-count', String(cy.nodes('.match').length));
    },
    focusNode(lid: string, animate = true): void {
      const n = cy.getElementById(lid);
      if (n.empty()) return;
      cy.nodes().removeClass('focused');
      n.addClass('focused');
      if (!animate) return;
      // Folders zoom into their contents; plain entries into their neighbourhood.
      const eles = n.isParent() ? n.union(n.descendants()) : n.closedNeighborhood();
      cy.animate({ fit: { eles, padding: 60 } }, { duration: 350, easing: 'ease-in-out' });
    },
    relayout(): void {
      cy.layout(layoutFor(lastView ?? 'explore', lastPreset)).run();
    },
    setEditMode(mode: EditMode): void {
      editMode = mode;
      if (mode === 'relate') eh.enable(); else eh.disable();
      cy.autoungrabify(mode === 'none' ? false : mode === 'relate');
    },
    resetView(): void { cy.fit(undefined, 30); },
    destroy(): void { miniCy.destroy(); cy.destroy(); },
  };
}
