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
import type { GraphHyperlink, GraphExternalLink } from './protocol';
import { isSystemArchetype, getAncestorFolderLids } from './util';
import { archetypeColor, archetypeEmoji, relationColor, colorTagColor, hashColor, depthColor } from './colors';

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
  hyperlinks: GraphHyperlink[];
  externalLinks: GraphExternalLink[];
  folderOf: Map<string, string>;
  view: GraphView;
  colorBy: ColorBy;
  search: string;
  showHyperlinks: boolean;
  showExternal: boolean;
}

export interface CytoscapeGraph {
  update(input: GraphRenderInput): void;
  /** Highlight/dim by query without re-running layout (live search). */
  applySearch(query: string): void;
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
        'background-color': 'data(color)',
        shape: 'data(shape)',
        width: 'data(size)',
        height: 'data(size)',
        label: 'data(label)',
        color: '#c8d8b0',
        'font-size': 9,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 3,
        'text-wrap': 'ellipsis',
        'text-max-width': '120px',
        'text-outline-width': 2,
        'text-outline-color': 'rgba(13,15,10,0.9)',
        'border-width': 1,
        'border-color': 'rgba(255,255,255,0.25)',
      },
    },
    {
      selector: ':parent',
      style: {
        'background-color': 'rgba(240,165,0,0.06)',
        'background-opacity': 0.5,
        'border-width': 1,
        'border-color': 'rgba(240,165,0,0.5)',
        'border-style': 'dashed',
        shape: 'round-rectangle',
        label: 'data(label)',
        'text-valign': 'top',
        'font-size': 11,
        color: '#f0c060',
        padding: '14px',
      },
    },
    {
      selector: 'node[type="domain"]',
      style: {
        'background-color': '#2a3550',
        'border-color': '#5b8def',
        'border-width': 1.5,
        shape: 'diamond',
        color: '#9bc0ff',
        'font-size': 9,
      },
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

function buildElements(input: GraphRenderInput): {
  elements: ElementDefinition[];
  preset: Map<string, { x: number; y: number }> | null;
} {
  const { entries, relations, view, colorBy, showHyperlinks, showExternal, folderOf } = input;
  const userEntries = entries.filter((e) => !isSystemArchetype(e.archetype));
  const scope = new Set(userEntries.map((e) => e.lid));
  const compound = COMPOUND_VIEWS.has(view);

  const relEdges = relations.filter((r) => {
    if (!scope.has(r.from) || !scope.has(r.to)) return false;
    if (view === 'timeline') return false;
    if (view === 'folders') return r.kind === 'structural';
    if (view === 'connectivity') return r.kind === 'semantic' || r.kind === 'categorical';
    return r.kind === 'structural' || r.kind === 'semantic' || r.kind === 'categorical';
  });
  const hyperEdges = showHyperlinks && view !== 'timeline'
    ? input.hyperlinks.filter((h) => scope.has(h.from) && scope.has(h.to))
    : [];
  const extLinks = showExternal && view !== 'timeline'
    ? input.externalLinks.filter((x) => scope.has(x.from))
    : [];

  const degree = new Map<string, number>();
  const bump = (id: string): void => { degree.set(id, (degree.get(id) ?? 0) + 1); };
  for (const r of relEdges) { bump(r.from); bump(r.to); }
  for (const h of hyperEdges) { bump(h.from); bump(h.to); }
  for (const x of extLinks) bump(x.from);

  const communities = colorBy === 'cluster'
    ? detectCommunities(userEntries.map((e) => e.lid), [...relEdges, ...hyperEdges])
    : null;

  const elements: ElementDefinition[] = [];

  for (const e of userEntries) {
    const depth = colorBy === 'depth' || view === 'folders'
      ? getAncestorFolderLids(relations, entries, e.lid).length
      : 0;
    const deg = degree.get(e.lid) ?? 0;
    const color = communities
      ? hashColor(`cl${communities.get(e.lid) ?? 0}`)
      : nodeColor(e, colorBy, depth);
    const data: ElementDefinition['data'] = {
      id: e.lid,
      label: `${archetypeEmoji(e.archetype)} ${e.title || e.lid}`,
      search: `${e.title} ${(e.tags ?? []).join(' ')}`.toLowerCase(),
      color,
      shape: e.archetype === 'folder' ? 'round-rectangle' : 'ellipse',
      size: 22 + Math.min(deg, 14) * 4,
      archetype: e.archetype,
    };
    if (compound) {
      const parent = folderOf.get(e.lid);
      if (parent && scope.has(parent) && parent !== e.lid) data.parent = parent;
    }
    elements.push({ data });
  }

  // External links aggregated by DOMAIN (one hub per domain; folders untouched).
  if (extLinks.length > 0) {
    const byDomain = new Map<string, Set<string>>();
    for (const x of extLinks) {
      const d = hostname(x.url);
      let s = byDomain.get(d);
      if (!s) { s = new Set(); byDomain.set(d, s); }
      s.add(x.from);
    }
    let i = 0;
    for (const [domain, froms] of byDomain) {
      elements.push({ data: { id: `dom:${domain}`, type: 'domain', label: `🌐 ${domain}`, color: '#2a3550', shape: 'diamond', size: 16 + Math.min(froms.size, 12) * 3 } });
      for (const from of froms) {
        elements.push({ data: { id: `xe${i++}`, source: from, target: `dom:${domain}`, kind: 'external', ecolor: '#5b8def', ewidth: 1.2 } });
      }
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
    const times = userEntries.map((e) => Date.parse(e.updated_at)).filter((t) => Number.isFinite(t));
    const minT = times.length ? Math.min(...times) : 0;
    const maxT = times.length ? Math.max(...times) : 1;
    const span = Math.max(1, maxT - minT);
    const lanes = new Map<string, number>();
    const laneOf = (a: string): number => { if (!lanes.has(a)) lanes.set(a, lanes.size); return lanes.get(a)!; };
    const seen = new Map<string, number>();
    for (const e of userEntries) {
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
): CytoscapeGraph {
  const cy: Core = cytoscape({ container, style: buildStyle(), wheelSensitivity: 0.2, minZoom: 0.05, maxZoom: 4 });
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
    if (id.startsWith('dom:')) return;
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
  const mini = document.createElement('div');
  mini.setAttribute('data-pkc-region', 'graph-minimap');
  mini.style.cssText =
    'position:absolute;right:8px;bottom:8px;width:180px;height:120px;z-index:40;'
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

  return {
    update(input: GraphRenderInput): void {
      const { elements, preset } = buildElements(input);
      cy.elements().remove();
      cy.add(elements);
      cy.layout(layoutFor(input.view, preset)).run();
      applySearch(cy, input.search);
      // Mirror into the minimap.
      miniCy.elements().remove();
      miniCy.add(cy.elements().map((el) => ({
        group: el.isNode() ? 'nodes' : 'edges',
        data: { ...el.data() },
      })) as ElementDefinition[]);
      miniCy.layout(layoutFor(input.view, preset)).run();
      miniCy.fit(undefined, 4);
      container.setAttribute('data-pkc-node-count', String(cy.nodes('[!type]').length));
      container.setAttribute('data-pkc-external-count', String(cy.nodes('[type="domain"]').length));
      container.setAttribute('data-pkc-hyperlink-count', String(cy.edges('[kind="hyperlink"]').length));
    },
    applySearch(query: string): void {
      applySearch(cy, query);
      container.setAttribute('data-pkc-match-count', String(cy.nodes('.match').length));
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
