/**
 * Graph-extension projection (host side).
 *
 * The graph view was removed from the product (#790) and now lives as a
 * standalone extension launched from the launcher. The host hands the
 * extension only what a graph needs — node/edge metadata — over a secure
 * PKC-Message channel. Entry `body`, `assets` (base64 blobs) and
 * `revisions` are deliberately excluded so the payload stays small.
 *
 * Pure: no browser APIs. Mirrors the extension's `GraphProjection` shape.
 */

import type { Container } from '@core/model/container';
import { isSystemArchetype } from '@core/model/record';

export interface GraphNodeProjection {
  lid: string;
  title: string;
  archetype: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  color_tag?: string | null;
}
export interface GraphEdgeProjection {
  from: string;
  to: string;
  kind: string;
}
export interface GraphProjection {
  containerId: string;
  title: string;
  nodes: GraphNodeProjection[];
  edges: GraphEdgeProjection[];
}

/**
 * Build the minimal graph projection from a container. System entries are
 * excluded; only the fields the graph renders are copied.
 */
export function buildGraphProjection(container: Container): GraphProjection {
  const nodes: GraphNodeProjection[] = [];
  for (const e of container.entries) {
    if (isSystemArchetype(e.archetype)) continue;
    const node: GraphNodeProjection = {
      lid: e.lid,
      title: e.title,
      archetype: e.archetype,
      created_at: e.created_at,
      updated_at: e.updated_at,
    };
    if (e.tags && e.tags.length > 0) node.tags = [...e.tags];
    if (e.color_tag !== undefined && e.color_tag !== null) node.color_tag = e.color_tag;
    nodes.push(node);
  }
  const edges: GraphEdgeProjection[] = container.relations.map((r) => ({
    from: r.from,
    to: r.to,
    kind: r.kind,
  }));
  return {
    containerId: container.meta.container_id,
    title: container.meta.title,
    nodes,
    edges,
  };
}
