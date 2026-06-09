/**
 * Graph payload builder — ported from PKC2 `renderer.ts` (the
 * `renderCenterGraphView` support functions). Pure data transformation:
 * Container entries + relations → graph nodes/links for a given mode,
 * plus the time-proximity seed layout. No DOM, no host state.
 *
 * The only cross-module dependency is `relationColor` (edge color by
 * relation kind), which lives in `graph-canvas.ts`.
 */

import type { Entry } from './types';

export interface GraphNodeView {
  id: string;
  label: string;
  archetype: string;
  /** Optional inline fill (color-tags / hierarchy depth). */
  cssColor?: string;
  /** Optional class hint for tag-group coloring. */
  colorClass?: string;
  /** Hover tooltip 用 preview(title + body excerpt). PR-WWW(2026-05-07). */
  preview?: string;
  /** PR-Δ22 (2026-05-07):galaxy mode の z 軸 = folder depth。 */
  depth?: number;
}

export function seedTimeProximityLayout(
  nodes: readonly GraphNodeView[],
  entries: readonly Entry[],
  width: number,
  height: number,
  rangeStart?: number | null,
  rangeEnd?: number | null,
): { id: string; x: number; y: number; vx: number; vy: number }[] {
  if (nodes.length === 0) return [];
  const headTime = new Map<string, number>();
  for (const e of entries) {
    const t = Date.parse(e.updated_at);
    headTime.set(e.lid, Number.isFinite(t) ? t : 0);
  }
  const ts = nodes.map((n) => headTime.get(n.id) ?? 0).filter((t) => t > 0);
  const dataMinT = ts.length > 0 ? Math.min(...ts) : 0;
  const dataMaxT = ts.length > 0 ? Math.max(...ts) : 1;
  // PR-Δ13:user 指定 range があれば優先。なければ data の min/max。
  const minT = typeof rangeStart === 'number' && Number.isFinite(rangeStart) ? rangeStart : dataMinT;
  const maxT = typeof rangeEnd === 'number' && Number.isFinite(rangeEnd) ? rangeEnd : dataMaxT;
  const span = Math.max(1, maxT - minT);
  // 古い created に対する alias 維持(関数末尾で利用するため)。
  const created = headTime;

  // Bucket nodes by archetype to assign lanes.
  const lanes = new Map<string, number>();
  const laneOrder: string[] = [];
  for (const n of nodes) {
    if (!lanes.has(n.archetype)) {
      lanes.set(n.archetype, laneOrder.length);
      laneOrder.push(n.archetype);
    }
  }
  const laneCount = Math.max(1, laneOrder.length);
  const padX = 40;
  const padY = 40;
  const usableW = width - padX * 2;
  const usableH = height - padY * 2;
  const laneH = usableH / laneCount;

  // PR-Δ6 (2026-05-07、user 報告「時系列グラフでも重ね合わせがきつい、
  // エントリが見えない」):lane 内でも X が近い node は Y を均等分割して
  // 物理的に分離する。X bucket(50px 幅)単位で同じ bucket の node を
  // 列挙し、bucket 内で stable sort 後 Y を均等配置。
  const bucketW = 50;
  const byBucket = new Map<string, GraphNodeView[]>(); // key = `${lane}:${bucketIdx}`
  for (const n of nodes) {
    const t = created.get(n.id) ?? minT;
    const xRatio = (t - minT) / span;
    const x = padX + xRatio * usableW;
    const lane = lanes.get(n.archetype) ?? 0;
    const bucketIdx = Math.floor(x / bucketW);
    const key = `${lane}:${bucketIdx}`;
    const arr = byBucket.get(key) ?? [];
    arr.push(n);
    byBucket.set(key, arr);
  }
  // Within each bucket, sort by id hash for determinism.
  for (const arr of byBucket.values()) {
    arr.sort((a, b) => hashStringToUnit(a.id) - hashStringToUnit(b.id));
  }

  return nodes.map((n) => {
    const t = created.get(n.id) ?? minT;
    const xRatio = (t - minT) / span;
    const x = padX + xRatio * usableW;
    const lane = lanes.get(n.archetype) ?? 0;
    const bucketIdx = Math.floor(x / bucketW);
    const key = `${lane}:${bucketIdx}`;
    const bucket = byBucket.get(key) ?? [n];
    const idx = bucket.indexOf(n);
    const total = bucket.length;
    // PR-Δ10 (2026-05-07、user 報告「時系列グラフでもノードが重なった
    // ままになってる」、Playwright 計測 38 overlap pairs/30 nodes):
    // bucket 内に N 個ある場合、Y を lane height いっぱいに均等分散させる。
    // 4+ entries が同 X bucket に落ちると Y ピッチが node 衝突半径(70px)
    // 以下になり重なる。X 方向にも bucketW 内で散らして 2D 配置にする。
    // PR-Δ28 (2026-05-07、user 視覚指摘「同じ種別のエントリが一直線
     // に並んでてきもい」):
    // Δ10 の grid 配置は確定的だが entry が perfectly 整列して
     // 機械的・気持ち悪い見た目。各 entry に **hash-based jitter** を
    // grid 位置から ±20px 程度乗せて自然な散らばりを作る。time order は
    // X 軸が保証するので Y は意味より見栄え優先。
    let xOffset = 0;
    let yOffset: number;
    if (total > 1) {
      const minPitch = 80;
      const rows = Math.max(1, Math.floor(laneH / minPitch));
      const cols = Math.ceil(total / rows);
      const col = Math.floor(idx / rows);
      const row = idx % rows;
      xOffset = (col - (cols - 1) / 2) * minPitch;
      yOffset = (row + 0.5 - rows / 2) * (laneH / Math.max(1, rows));
      // Δ28:hash jitter で direction 揺らぎ。X / Y それぞれ ±15px。
      const h1 = hashStringToUnit(n.id);
      const h2 = hashStringToUnit(n.id + '_y');
      xOffset += (h1 - 0.5) * 30;
      yOffset += (h2 - 0.5) * 30;
    } else {
      // 単独 entry も Y を full lane height 内で hash 散らし、archetype
      // 一直線を撲滅。
      yOffset = (hashStringToUnit(n.id) - 0.5) * (laneH * 0.85);
    }
    const y = padY + lane * laneH + laneH / 2 + yOffset;
    return { id: n.id, x: x + xOffset, y, vx: 0, vy: 0 };
  });
}

/** Cheap deterministic hash → [0, 1). Used for lane jitter. */
function hashStringToUnit(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function buildGraphForMode(
  entries: readonly Entry[],
  relations: readonly { kind: string; from: string; to: string }[],
  mode: 'relations' | 'color-tags' | 'tag-groups' | 'folder-hierarchy' | 'time-proximity',
  focusLid: string | null,
): { nodes: GraphNodeView[]; links: { from: string; to: string; kind?: string; cssColor?: string }[] } {
  // Restrict scope when focusLid is set to 1-hop neighbourhood.
  let nodeIds = new Set<string>(entries.map((e) => e.lid));
  if (focusLid && entries.some((e) => e.lid === focusLid)) {
    nodeIds = new Set<string>([focusLid]);
    for (const r of relations) {
      if (r.from === focusLid) nodeIds.add(r.to);
      if (r.to === focusLid) nodeIds.add(r.from);
    }
  }

  const inScope = (id: string): boolean => nodeIds.has(id);
  // PR-Δ17 → Δ24 (2026-05-07、user 訂正「フォルダを不可視化するのではなく
  // リレーションとして結節点から線を伸ばして表現」):
  //   folder は entry ではなく junction(結節点)、しかし完全除外では
  //   なく **junction symbol として小さく描画 + folder→子 の線を残す**。
  //   time-proximity mode では folder を独立 entry として X 軸に並べる
  //   ことに意味がない(folder には updated_at が user 編集としては
  //   無いに等しい)ため除外、それ以外の mode では junction として残す。
  const isFolder = (lid: string): boolean => {
    const e = entries.find((x) => x.lid === lid);
    return e?.archetype === 'folder';
  };
  const excludeFolderAsNode = mode === 'time-proximity';
  const filteredEntries = entries.filter((e) => {
    if (!inScope(e.lid)) return false;
    if (excludeFolderAsNode && e.archetype === 'folder') return false;
    return true;
  });
  const linksRaw = relations.filter((r) => {
    if (!inScope(r.from) || !inScope(r.to)) return false;
    if (excludeFolderAsNode && (isFolder(r.from) || isFolder(r.to))) return false;
    return true;
  });

  // PR-LLL (2026-05-06、user 修正指示5「リレーションは線の色で分けて」):
  // link.kind を payload まで運ぶ。色は graph-canvas の relationColor() で決定。
  let links: { from: string; to: string; kind?: string; cssColor?: string }[] = [];
  switch (mode) {
    case 'relations':
      links = linksRaw
        .filter((r) => r.kind === 'structural' || r.kind === 'semantic')
        .map((r) => ({ from: r.from, to: r.to, kind: r.kind }));
      break;
    case 'folder-hierarchy':
      links = linksRaw
        .filter((r) => r.kind === 'structural')
        .map((r) => ({ from: r.from, to: r.to, kind: 'structural' }));
      break;
    case 'color-tags': {
      // Edges between entries that share the same color_tag.
      // PR-Δ6 (2026-05-07、user 報告):同色 group の relation は
      // 「カラータグと同じ色」で描画。link.cssColor 経由で graph-canvas に
      // 直接 stroke 色を渡す。
      const colorTagToHex: Record<string, string> = {
        red: '#ef4444', orange: '#f97316', yellow: '#eab308',
        green: '#22c55e', blue: '#3b82f6', indigo: '#6366f1',
        purple: '#a855f7', pink: '#ec4899', gray: '#6b7280',
      };
      const byColor = new Map<string, string[]>();
      for (const e of filteredEntries) {
        const c = (e as Entry).color_tag;
        if (!c) continue;
        const arr = byColor.get(c) ?? [];
        arr.push(e.lid);
        byColor.set(c, arr);
      }
      for (const [color, arr] of byColor.entries()) {
        const cssColor = colorTagToHex[color] ?? '#9ca3af';
        // chain pattern keeps O(N) edges per group.
        for (let i = 1; i < arr.length; i++) {
          links.push({ from: arr[i - 1]!, to: arr[i]!, kind: 'categorical', cssColor });
        }
      }
      break;
    }
    case 'tag-groups': {
      // Edges between entries sharing at least one tag.
      const byTag = new Map<string, string[]>();
      for (const e of filteredEntries) {
        for (const t of (e as Entry).tags ?? []) {
          const arr = byTag.get(t) ?? [];
          arr.push(e.lid);
          byTag.set(t, arr);
        }
      }
      for (const arr of byTag.values()) {
        for (let i = 1; i < arr.length; i++) links.push({ from: arr[i - 1]!, to: arr[i]!, kind: 'categorical' });
      }
      break;
    }
    case 'time-proximity':
      // Time-proximity layout は edge を引かない(時系列軸そのものが
      // 「接近性」の表現)。位置決定は seedTimeProximityLayout が行う。
      links = [];
      break;
  }

  // Folder-hierarchy color assignment via BFS depth.
  const depthMap = new Map<string, number>();
  if (mode === 'folder-hierarchy') {
    const childrenOf = new Map<string, string[]>();
    for (const r of linksRaw) {
      if (r.kind !== 'structural') continue;
      const arr = childrenOf.get(r.from) ?? [];
      arr.push(r.to);
      childrenOf.set(r.from, arr);
    }
    const hasParent = new Set<string>();
    for (const r of linksRaw) {
      if (r.kind === 'structural') hasParent.add(r.to);
    }
    const queue: { id: string; d: number }[] = filteredEntries
      .filter((e) => !hasParent.has(e.lid))
      .map((e) => ({ id: e.lid, d: 0 }));
    const visited = new Set<string>();
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur.id)) continue;
      visited.add(cur.id);
      depthMap.set(cur.id, cur.d);
      for (const c of childrenOf.get(cur.id) ?? []) queue.push({ id: c, d: cur.d + 1 });
    }
  }

  const colorTagPalette = (id: string): string => {
    // Map our internal color tag id (e.g. 'red'/'blue') to a CSS-safe value.
    const map: Record<string, string> = {
      red: '#ef4444',
      orange: '#f97316',
      yellow: '#eab308',
      green: '#22c55e',
      blue: '#3b82f6',
      indigo: '#6366f1',
      purple: '#a855f7',
      pink: '#ec4899',
      gray: '#6b7280',
    };
    return map[id] ?? '#9ca3af';
  };

  const tagGroupPalette = (() => {
    const cache = new Map<string, string>();
    let idx = 0;
    const palette = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899', '#0891b2', '#eab308'];
    return (tag: string): string => {
      const cached = cache.get(tag);
      if (cached) return cached;
      const c = palette[idx % palette.length]!;
      idx += 1;
      cache.set(tag, c);
      return c;
    };
  })();

  const nodes: GraphNodeView[] = filteredEntries.map((e) => {
    let cssColor: string | undefined;
    switch (mode) {
      case 'color-tags':
        if ((e as Entry).color_tag) cssColor = colorTagPalette(String((e as Entry).color_tag));
        break;
      case 'tag-groups': {
        const t = (e as Entry).tags?.[0];
        if (t) cssColor = tagGroupPalette(t);
        break;
      }
      case 'folder-hierarchy': {
        const d = depthMap.get(e.lid) ?? 0;
        // Lighten by depth: hue green→cyan→blue progression.
        const palette = ['#22c55e', '#10b981', '#0891b2', '#3b82f6', '#6366f1', '#a855f7', '#ec4899'];
        cssColor = palette[Math.min(d, palette.length - 1)];
        break;
      }
      default:
        break;
    }
    // PR-WWW (2026-05-07、修正指示5 残):hover tooltip 用 preview。
    // entry.body の冒頭を 100 char に trim、改行 / マークアップ系
    // ノイズを軽く除去して title と組み合わせる。
    const bodyExcerpt = ((e as Entry).body ?? '')
      .replace(/^---[\s\S]*?---\n?/, '') // strip frontmatter
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    const preview = bodyExcerpt
      ? `${e.title || e.lid}\n${bodyExcerpt}`
      : (e.title || e.lid);
    return {
      id: e.lid,
      label: e.title || e.lid,
      archetype: e.archetype,
      ...(cssColor ? { cssColor } : {}),
      preview,
      depth: depthMap.get(e.lid) ?? 0,
    };
  });

  return { nodes, links };
}

