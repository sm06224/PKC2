/**
 * Cytoscape-based graph renderer.
 *
 * Renders the projection with Cytoscape.js: data-driven node/edge styling,
 * per-mode layouts (fcose force / breadthfirst hierarchy / time-line preset),
 * **folder compound boxes**, in-document **internal hyperlinks**, and
 * **external URL nodes** that reach outside the container.
 */

import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Entry, Relation } from './types';
import type { GraphHyperlink, GraphExternalLink } from './protocol';
import { isSystemArchetype, getAncestorFolderLids } from './util';
import {
  archetypeColor,
  archetypeEmoji,
  relationColor,
  colorTagColor,
  hashColor,
  depthColor,
} from './colors';

cytoscape.use(fcose);

export type GraphMode =
  | 'relations'
  | 'color-tags'
  | 'tag-groups'
  | 'folder-hierarchy'
  | 'time-proximity';

const COMPOUND_MODES: ReadonlySet<GraphMode> = new Set(['relations', 'color-tags', 'tag-groups']);

export interface GraphRenderInput {
  entries: Entry[];
  relations: Relation[];
  hyperlinks: GraphHyperlink[];
  externalLinks: GraphExternalLink[];
  folderOf: Map<string, string>;
  mode: GraphMode;
  focusLid: string | null;
  showHyperlinks: boolean;
  showExternal: boolean;
}

export interface CytoscapeGraph {
  update(input: GraphRenderInput): void;
  resetView(): void;
  destroy(): void;
}

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
    // Folder compound boxes.
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
        'text-halign': 'center',
        'font-size': 11,
        color: '#f0c060',
        padding: '14px',
      },
    },
    // External URL nodes.
    {
      selector: 'node[type="external"]',
      style: {
        'background-color': '#2a3550',
        'border-color': '#5b8def',
        'border-width': 1.5,
        shape: 'diamond',
        width: 18,
        height: 18,
        color: '#9bc0ff',
        'font-size': 8,
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
    // Internal hyperlinks (in-document entry references).
    {
      selector: 'edge[kind="hyperlink"]',
      style: {
        'line-color': '#33d6c0',
        'line-style': 'dashed',
        'target-arrow-color': '#33d6c0',
        width: 1.6,
        opacity: 0.8,
      },
    },
    // External links (to outside URLs).
    {
      selector: 'edge[kind="external"]',
      style: {
        'line-color': '#5b8def',
        'line-style': 'dotted',
        'target-arrow-shape': 'none',
        width: 1.2,
        opacity: 0.55,
      },
    },
    {
      selector: 'node.focused, node:selected',
      style: { 'border-width': 3, 'border-color': '#33ff66', color: '#eaffea' },
    },
  ] as unknown) as StylesheetJson;
}

function nodeColor(e: Entry, mode: GraphMode, depth: number): string {
  switch (mode) {
    case 'color-tags':
      return colorTagColor(e.color_tag);
    case 'tag-groups':
      return e.tags && e.tags.length > 0 ? hashColor(e.tags[0]!) : '#6b7280';
    case 'folder-hierarchy':
      return e.archetype === 'folder' ? '#f0a500' : depthColor(depth);
    default:
      return archetypeColor(e.archetype);
  }
}

function buildElements(input: GraphRenderInput): {
  elements: ElementDefinition[];
  preset: Map<string, { x: number; y: number }> | null;
} {
  const { entries, relations, mode, showHyperlinks, showExternal, folderOf } = input;
  const userEntries = entries.filter((e) => !isSystemArchetype(e.archetype));
  const scope = new Set(userEntries.map((e) => e.lid));
  const compound = COMPOUND_MODES.has(mode);

  const relEdges = relations.filter((r) => {
    if (!scope.has(r.from) || !scope.has(r.to)) return false;
    if (mode === 'time-proximity') return false;
    if (mode === 'folder-hierarchy') return r.kind === 'structural';
    return r.kind === 'structural' || r.kind === 'semantic' || r.kind === 'categorical';
  });

  const hyperEdges = showHyperlinks && mode !== 'time-proximity'
    ? input.hyperlinks.filter((h) => scope.has(h.from) && scope.has(h.to))
    : [];
  const extLinks = showExternal && mode !== 'time-proximity'
    ? input.externalLinks.filter((x) => scope.has(x.from))
    : [];

  // degree (visible structural/semantic + hyperlinks) → node size
  const degree = new Map<string, number>();
  const bump = (id: string): void => { degree.set(id, (degree.get(id) ?? 0) + 1); };
  for (const r of relEdges) { bump(r.from); bump(r.to); }
  for (const h of hyperEdges) { bump(h.from); bump(h.to); }
  for (const x of extLinks) bump(x.from);

  const elements: ElementDefinition[] = [];

  for (const e of userEntries) {
    const depth = mode === 'folder-hierarchy'
      ? getAncestorFolderLids(relations, entries, e.lid).length
      : 0;
    const deg = degree.get(e.lid) ?? 0;
    const data: ElementDefinition['data'] = {
      id: e.lid,
      label: `${archetypeEmoji(e.archetype)} ${e.title || e.lid}`,
      color: nodeColor(e, mode, depth),
      shape: e.archetype === 'folder' ? 'round-rectangle' : 'ellipse',
      size: 22 + Math.min(deg, 12) * 4,
      archetype: e.archetype,
    };
    if (compound) {
      const parent = folderOf.get(e.lid);
      if (parent && scope.has(parent) && parent !== e.lid) data.parent = parent;
    }
    elements.push({ data });
  }

  // External URL nodes (deduped) + edges.
  if (extLinks.length > 0) {
    const urls = new Set(extLinks.map((x) => x.url));
    for (const url of urls) {
      elements.push({ data: { id: `ext:${url}`, type: 'external', label: `🌐 ${hostname(url)}`, color: '#2a3550', shape: 'diamond', size: 18 } });
    }
    for (let i = 0; i < extLinks.length; i++) {
      const x = extLinks[i]!;
      elements.push({ data: { id: `xe${i}`, source: x.from, target: `ext:${x.url}`, kind: 'external', ecolor: '#5b8def', ewidth: 1.2 } });
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

  // time-proximity preset positions.
  let preset: Map<string, { x: number; y: number }> | null = null;
  if (mode === 'time-proximity') {
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

function layoutFor(
  mode: GraphMode,
  preset: Map<string, { x: number; y: number }> | null,
): cytoscape.LayoutOptions {
  if (mode === 'time-proximity' && preset) {
    return {
      name: 'preset',
      positions: (n: cytoscape.NodeSingular) => preset.get(n.id()) ?? { x: 0, y: 0 },
      fit: true,
      padding: 40,
    } as unknown as cytoscape.LayoutOptions;
  }
  if (mode === 'folder-hierarchy') {
    return { name: 'breadthfirst', directed: true, spacingFactor: 1.1, padding: 30, animate: false } as cytoscape.LayoutOptions;
  }
  return {
    name: 'fcose',
    quality: 'default',
    animate: true,
    animationDuration: 500,
    randomize: true,
    nodeRepulsion: 6500,
    idealEdgeLength: 90,
    nestingFactor: 0.2,
    padding: 30,
  } as unknown as cytoscape.LayoutOptions;
}

export function createCytoscapeGraph(
  container: HTMLElement,
  onSelect: (lid: string) => void,
): CytoscapeGraph {
  const cy: Core = cytoscape({
    container,
    style: buildStyle(),
    wheelSensitivity: 0.2,
    minZoom: 0.05,
    maxZoom: 4,
  });

  cy.on('tap', 'node', (evt) => {
    const id = evt.target.id();
    if (!id.startsWith('ext:')) onSelect(id);
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
    tip.textContent = id.startsWith('ext:') ? id.slice(4) : String(evt.target.data('label') ?? '');
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
      if (input.focusLid) cy.getElementById(input.focusLid).addClass('focused');
      cy.layout(layoutFor(input.mode, preset)).run();
      container.setAttribute('data-pkc-node-count', String(cy.nodes('[!type]').length));
      container.setAttribute('data-pkc-external-count', String(cy.nodes('[type="external"]').length));
      container.setAttribute('data-pkc-hyperlink-count', String(cy.edges('[kind="hyperlink"]').length));
    },
    resetView(): void { cy.fit(undefined, 30); },
    destroy(): void { cy.destroy(); },
  };
}
