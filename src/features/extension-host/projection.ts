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
 * graph 拡張(#790)の `GraphProjection` を一般化したもの。graph が使って
 * いた hyperlink / external-link 統計(body から**導出した集計** — body
 * そのものではない)も `links` として本 projection が持つ(#796 切替で
 * graph 固有 projection は廃止、graph は本 projection で再ビルドする)。
 *
 * Pure: no browser APIs(features 層、core のみ import)。読み取り専用で
 * pkc-data を変更しない。
 */

import type { Container } from '@core/model/container';
import { isSystemArchetype } from '@core/model/record';
import { getRestoreCandidates, parseRevisionSnapshot } from '@core/operations/container-ops';
import { collectOrphanAssetKeys } from '@features/asset/asset-scan';
import { collectLinkRefs } from '@features/link-index/link-index';
import { parseTodoBody } from '@features/todo/todo-body';

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
  /**
   * todo のみ: body JSON から導出した状態メタ(#830 R1)。`description`
   * は含めない(body そのものは依然 projection に載せない — data
   * minimization 不変条件)。status/date/archived は core の Kanban /
   * カレンダーが既に body から導出して表示している値の範疇。
   */
  todo?: { status: 'open' | 'done'; date?: string; archived?: boolean };
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

/** body 内のエントリ間 hyperlink(解決済み参照、導出統計)。 */
export interface ProjectionInternalLink {
  from: string;
  to: string;
}
/** body 内の外部 URL(導出統計)。 */
export interface ProjectionExternalLink {
  from: string;
  url: string;
}

/**
 * 削除済みで復元可能な entry の派生メタ(#830 R4)。PKC2 の delete は
 * soft(revision snapshot を残す物理削除)で、`getRestoreCandidates` が
 * 復元候補を返す。拡張のゴミ箱 UI 用に lid/title/archetype のみ載せる
 * (body/snapshot 本体は含めない — data minimization 不変)。
 */
export interface ProjectionRestoreCandidate {
  lid: string;
  title: string;
  archetype: string;
}

/**
 * どの entry からも参照されていない孤児アセットの派生メタ(#830 R8)。
 * 拡張のストレージ掃除 UI 用に key と size(base64 文字列長、attachment
 * の `asset_size` と同単位)のみ載せる。base64 本体は含めない。
 */
export interface ProjectionOrphanAsset {
  key: string;
  size: number;
}

export interface ContainerProjection {
  containerId: string;
  title: string;
  entries: ProjectionEntry[];
  relations: ProjectionRelation[];
  /** body から導出した link 統計(body そのものは含まない)。 */
  links: {
    internal: ProjectionInternalLink[];
    external: ProjectionExternalLink[];
  };
  /** 削除済みで復元可能な entry(#830 R4、ゴミ箱 UI 用。body は含まない)。 */
  restoreCandidates: ProjectionRestoreCandidate[];
  /** どの entry からも参照されない孤児アセット(#830 R8、掃除 UI 用。base64 は含まない)。 */
  orphanAssets: ProjectionOrphanAsset[];
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
    } else if (e.archetype === 'todo') {
      // #830 R1: status/date/archived のみを派生メタとして載せる。
      // parseTodoBody は features 層・防御的(壊れた JSON でも open に
      // フォールバック)。description は意図的に捨てる。
      const todo = parseTodoBody(e.body);
      const todoMeta: { status: 'open' | 'done'; date?: string; archived?: boolean } = {
        status: todo.status,
      };
      if (todo.date) todoMeta.date = todo.date;
      if (todo.archived) todoMeta.archived = true;
      entry.todo = todoMeta;
    }
    entries.push(entry);
  }

  const relations: ProjectionRelation[] = [];
  for (const r of container.relations) {
    if (!inScope(r.from) || !inScope(r.to)) continue;
    relations.push({ from: r.from, to: r.to, kind: r.kind });
  }

  // Internal hyperlinks (resolved entry references in bodies), deduped.
  const seenLink = new Set<string>();
  const internal: ProjectionInternalLink[] = [];
  for (const ref of collectLinkRefs(container)) {
    if (!ref.resolved) continue;
    if (!inScope(ref.sourceLid) || !inScope(ref.targetLid)) continue;
    if (ref.sourceLid === ref.targetLid) continue;
    const key = `${ref.sourceLid} ${ref.targetLid}`;
    if (seenLink.has(key)) continue;
    seenLink.add(key);
    internal.push({ from: ref.sourceLid, to: ref.targetLid });
  }

  // External URLs in bodies, deduped per (entry, url).
  const seenExt = new Set<string>();
  const external: ProjectionExternalLink[] = [];
  for (const e of container.entries) {
    if (isSystemArchetype(e.archetype)) continue;
    for (const url of extractExternalUrls(e.body)) {
      const key = `${e.lid} ${url}`;
      if (seenExt.has(key)) continue;
      seenExt.add(key);
      external.push({ from: e.lid, url });
    }
  }

  // 削除済み復元候補(#830 R4)。snapshot から lid/title/archetype のみ拾い、
  // body は載せない。system archetype は projection の他部分と同様に除外。
  const restoreCandidates: ProjectionRestoreCandidate[] = [];
  for (const rev of getRestoreCandidates(container)) {
    const snap = parseRevisionSnapshot(rev);
    if (!snap || isSystemArchetype(snap.archetype)) continue;
    restoreCandidates.push({ lid: snap.lid, title: snap.title, archetype: snap.archetype });
  }

  // 孤児アセット(#830 R8)。collectOrphanAssetKeys = container.assets に在る
  // が、どの entry からも参照されない key。base64 本体は載せず key+size のみ。
  const assets = container.assets ?? {};
  const orphanAssets: ProjectionOrphanAsset[] = [];
  for (const key of collectOrphanAssetKeys(container)) {
    const b64 = assets[key];
    orphanAssets.push({ key, size: typeof b64 === 'string' ? b64.length : 0 });
  }

  return {
    containerId: container.meta.container_id,
    title: container.meta.title,
    entries,
    relations,
    links: { internal, external },
    restoreCandidates,
    orphanAssets,
    stats: {
      totalEntries: entries.length,
      byArchetype,
      totalRelations: relations.length,
      totalAssets: Object.keys(container.assets).length,
    },
  };
}

const EXTERNAL_URL_RE = /\bhttps?:\/\/[^\s)<>"'\]]+/gi;

/** Extract distinct external http(s) URLs from a raw body string. */
function extractExternalUrls(body: string): string[] {
  if (!body) return [];
  const out = new Set<string>();
  for (const m of body.matchAll(EXTERNAL_URL_RE)) {
    // Trim common trailing punctuation that regex greedily swallowed.
    const url = m[0].replace(/[.,;:!?]+$/, '');
    if (url.length > 8) out.add(url);
  }
  return [...out];
}
