/**
 * Container projection for PKC-Extensions(host-push 体系の既定露出、
 * #806 設計 doc rev.2 §0/§3.2 — 一括実装 2/6)。
 *
 * **拡張が既定で受け取れるのはこの projection だけ**(index / list / 統計)。
 * 実体は host の send ジェスチャ(`pkc:deliver`)でしか渡らない。よって
 * 本 projection はデータ最小化の不変条件を持つ:
 *
 *   - entry `body` を含めない
 *   - `assets`(base64)を含めない
 *   - `revisions` を含めない
 *
 * graph 拡張(#790)の `GraphProjection` を一般化したもの。graph 固有の
 * hyperlink / external-link 統計は `graph-extension/projection.ts` 側が
 * 本 projection の上に重ねる。
 *
 * Pure: no browser APIs(features 層、core のみ import)。読み取り専用で
 * pkc-data を変更しない。
 */

import type { Container } from '@core/model/container';
import { isSystemArchetype } from '@core/model/record';

/** 1 entry のメタ投影(body は決して含まない)。 */
export interface ProjectionEntry {
  lid: string;
  title: string;
  archetype: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  color_tag?: string | null;
  /** 親 folder の lid(structural)。 */
  folder?: string;
  /** attachment のみ: MIME(body JSON の `mime`)。 */
  mime?: string;
  /** attachment のみ: 元 filename(body JSON の `name`)。 */
  filename?: string;
  /** attachment のみ: asset の base64 長(サイズ概算、bytes ≒ ×3/4)。 */
  asset_size?: number;
}

export interface ProjectionRelation {
  from: string;
  to: string;
  kind: string;
}

/** container 全体の統計(list を読まずに概況を掴むための要約)。 */
export interface ProjectionStats {
  totalEntries: number;
  byArchetype: Record<string, number>;
  totalRelations: number;
  totalAssets: number;
}

export interface ContainerProjection {
  containerId: string;
  title: string;
  entries: ProjectionEntry[];
  relations: ProjectionRelation[];
  stats: ProjectionStats;
}

/**
 * attachment body(JSON 文字列)から mime / name / asset_key を防御的に
 * 覗き見る。adapter 層の `parseAttachmentBody` は import できない
 * (features → adapter は層違反)ため、必要 3 field だけの最小 reader。
 * 壊れた JSON は全 undefined(projection は落とさない)。
 */
export function peekAttachmentMeta(body: string): { mime?: string; name?: string; asset_key?: string } {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    return {
      mime: typeof parsed.mime === 'string' ? parsed.mime : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      asset_key: typeof parsed.asset_key === 'string' ? parsed.asset_key : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Build the general container projection. System entries are excluded.
 * graph の `buildGraphProjection` と同じ node/edge 算出規則(folder 同定 /
 * in-scope filter)を一般化している。
 */
export function buildContainerProjection(container: Container): ContainerProjection {
  const byLid = new Map(container.entries.map((e) => [e.lid, e]));
  const inScope = (lid: string): boolean => {
    const e = byLid.get(lid);
    return !!e && !isSystemArchetype(e.archetype);
  };

  // Parent folder for each entry (structural relation from a folder).
  const folderOf = new Map<string, string>();
  for (const r of container.relations) {
    if (r.kind !== 'structural') continue;
    const parent = byLid.get(r.from);
    if (parent && parent.archetype === 'folder') folderOf.set(r.to, r.from);
  }

  const entries: ProjectionEntry[] = [];
  const byArchetype: Record<string, number> = {};
  for (const e of container.entries) {
    if (isSystemArchetype(e.archetype)) continue;
    byArchetype[e.archetype] = (byArchetype[e.archetype] ?? 0) + 1;
    const entry: ProjectionEntry = {
      lid: e.lid,
      title: e.title,
      archetype: e.archetype,
      created_at: e.created_at,
      updated_at: e.updated_at,
    };
    if (e.tags && e.tags.length > 0) entry.tags = [...e.tags];
    if (e.color_tag !== undefined && e.color_tag !== null) entry.color_tag = e.color_tag;
    const folder = folderOf.get(e.lid);
    if (folder && inScope(folder)) entry.folder = folder;
    if (e.archetype === 'attachment') {
      const meta = peekAttachmentMeta(e.body);
      if (meta.mime) entry.mime = meta.mime;
      if (meta.name) entry.filename = meta.name;
      if (meta.asset_key) {
        const b64 = container.assets[meta.asset_key];
        if (typeof b64 === 'string') entry.asset_size = b64.length;
      }
    }
    entries.push(entry);
  }

  const relations: ProjectionRelation[] = [];
  for (const r of container.relations) {
    if (!inScope(r.from) || !inScope(r.to)) continue;
    relations.push({ from: r.from, to: r.to, kind: r.kind });
  }

  return {
    containerId: container.meta.container_id,
    title: container.meta.title,
    entries,
    relations,
    stats: {
      totalEntries: entries.length,
      byArchetype,
      totalRelations: relations.length,
      totalAssets: Object.keys(container.assets).length,
    },
  };
}
