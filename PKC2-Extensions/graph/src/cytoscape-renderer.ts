/**
 * Cytoscape-based graph renderer.
 *
 * Replaces the original hand-written canvas renderer with Cytoscape.js — a
 * general, mature network-graph library — for a richer, more readable result:
 * data-driven node/edge styling, real force layout (fcose) plus hierarchical
 * and time-line layouts per mode, smooth zoom/pan, selection and hover.
 *
 * Input is the minimal projection (entries + relations); no host coupling.
 */

import cytoscape, { type Core, type ElementDefinition, type StylesheetJson } from 'cytoscape';
import fcose from 'cytoscape-fcose';
import type { Entry, Relation } from './types';
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

export interface GraphRenderInput {
  entries: Entry[];
  relations: Relation[];
  mode: GraphMode;
  focusLid: string | null;
}

export interface CytoscapeGraph {
  update(input: GraphRenderInput): void;
  resetView(): void;
  destroy(): void;
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
        'transition-property': 'background-color, border-color, opacity',
        'transition-duration': 180 as unknown as string,
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
        opacity: 0.65,
      },
    },
    {
      selector: 'node.focused, node:selected',
      style: {
        'border-width': 3,
        'border-color': '#33ff66',
        'text-outline-color': 'rgba(13,15,10,0.9)',
        color: '#eaffea',
      },
    },
    {
      selector: 'node.dim',
      style: { opacity: 0.18 },
    },
    {
      selector: 'edge.dim',
      style: { opacity: 0.06 },
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
  const { entries, relations, mode, focusLid } = input;
  const userEntries = entries.filter((e) => !isSystemArchetype(e.archetype));

  // Focus → 1-hop neighbourhood.
  let scope = new Set(userEntries.map((e) => e.lid));
  if (focusLid && scope.has(focusLid)) {
    const hop = new Set<string>([focusLid]);
    for (const r of relations) {
      if (r.from === focusLid && scope.has(r.to)) hop.add(r.to);
      if (r.to === focusLid && scope.has(r.from)) hop.add(r.from);
    }
    scope = hop;
  }

  const inScope = (lid: string): boolean => scope.has(lid);
  const byLid = new Map<string, Entry>();
  for (const e of userEntries) byLid.set(e.lid, e);

  // Edge filtering per mode.
  const edges = relations.filter((r) => {
    if (!inScope(r.from) || !inScope(r.to)) return false;
    if (mode === 'time-proximity') return false; // time line: positions carry the meaning
    if (mode === 'folder-hierarchy') return r.kind === 'structural';
    return r.kind === 'structural' || r.kind === 'semantic';
  });

  const degree = new Map<string, number>();
  for (const r of edges) {
    degree.set(r.from, (degree.get(r.from) ?? 0) + 1);
    degree.set(r.to, (degree.get(r.to) ?? 0) + 1);
  }

  const elements: ElementDefinition[] = [];
  for (const e of userEntries) {
    if (!inScope(e.lid)) continue;
    const depth = mode === 'folder-hierarchy'
      ? getAncestorFolderLids(relations, entries, e.lid).length
      : 0;
    const deg = degree.get(e.lid) ?? 0;
    elements.push({
      data: {
        id: e.lid,
        label: `${archetypeEmoji(e.archetype)} ${e.title || e.lid}`,
        color: nodeColor(e, mode, depth),
        shape: e.archetype === 'folder' ? 'round-rectangle' : 'ellipse',
        size: 22 + Math.min(deg, 12) * 4,
        archetype: e.archetype,
      },
    });
  }
  for (let i = 0; i < edges.length; i++) {
    const r = edges[i]!;
    elements.push({
      data: {
        id: `e${i}`,
        source: r.from,
        target: r.to,
        ecolor: relationColor(r.kind),
        ewidth: r.kind === 'structural' ? 1.5 : 2.5,
        kind: r.kind,
      },
    });
  }

  // time-proximity: preset positions (x = updated_at, y = archetype lane).
  let preset: Map<string, { x: number; y: number }> | null = null;
  if (mode === 'time-proximity') {
    preset = new Map();
    const times = userEntries
      .filter((e) => inScope(e.lid))
      .map((e) => Date.parse(e.updated_at))
      .filter((t) => Number.isFinite(t));
    const minT = times.length ? Math.min(...times) : 0;
    const maxT = times.length ? Math.max(...times) : 1;
    const span = Math.max(1, maxT - minT);
    const lanes = new Map<string, number>();
    const laneOf = (a: string): number => {
      if (!lanes.has(a)) lanes.set(a, lanes.size);
      return lanes.get(a)!;
    };
    // bucket collision spread within a lane
    const seen = new Map<string, number>();
    for (const e of userEntries) {
      if (!inScope(e.lid)) continue;
      const t = Date.parse(e.updated_at);
      const x = (((Number.isFinite(t) ? t : minT) - minT) / span) * 1600;
      const lane = laneOf(e.archetype);
      const key = `${lane}:${Math.round(x / 60)}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      const y = lane * 140 + (k % 5) * 26;
      preset.set(e.lid, { x, y });
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
    return {
      name: 'breadthfirst',
      directed: true,
      spacingFactor: 1.1,
      padding: 30,
      animate: false,
    } as cytoscape.LayoutOptions;
  }
  return {
    name: 'fcose',
    quality: 'default',
    animate: true,
    animationDuration: 500,
    randomize: true,
    nodeRepulsion: 6500,
    idealEdgeLength: 90,
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

  cy.on('tap', 'node', (evt) => onSelect(evt.target.id()));

  // Lightweight hover tooltip.
  const tip = document.createElement('div');
  tip.className = 'pkc-graph-hover-tooltip';
  tip.style.cssText =
    'position:absolute;z-index:50;pointer-events:none;display:none;'
    + 'background:rgba(13,15,10,0.95);color:#c8d8b0;border:1px solid #1e2a16;'
    + 'border-radius:3px;padding:3px 6px;font-size:11px;max-width:260px;';
  container.style.position = 'relative';
  container.appendChild(tip);
  cy.on('mouseover', 'node', (evt) => {
    tip.textContent = String(evt.target.data('label') ?? '');
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
      container.setAttribute('data-pkc-node-count', String(cy.nodes().length));
    },
    resetView(): void {
      cy.fit(undefined, 30);
    },
    destroy(): void {
      cy.destroy();
    },
  };
}
