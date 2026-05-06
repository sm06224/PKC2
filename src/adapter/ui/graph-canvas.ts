/**
 * Graph view Canvas renderer + gestures (PR-H G16, 2026-05-06).
 *
 * User direction:
 * > グラフ表示が全然グラフっぽくない。これ Canvas?SVG なら Canvas にしてね
 *
 * Replaces the SVG-based graph rendering(`graph-zoom.ts` の SVG path)。
 * Canvas は単一 element なので:
 *   - test 互換のため `data-pkc-region="graph-canvas"` を root に立て、
 *     hit-test → lid 解決を coordinate-based(`hitTestNodeAt`)で実装
 *   - 描画は `<canvas>` に直接、edges / nodes / labels / time-axis /
 *     region-rect を全部 ctx で書く(SVG 階層化された要素 layer 不要)
 *   - zoom + pan の transform は ctx.translate + ctx.scale で実施
 *   - hi-DPI:`canvas.width = logicalW × dpr`、`canvas.style.width =
 *     '100%'` で CSS 拡大、`ctx.scale(dpr, dpr)` で論理座標系を維持
 *
 * Gestures(graph-zoom.ts の論理を Canvas 用に再利用):
 *   - wheel: cursor 中心 zoom(感度 flag `graph.zoom.wheel_sensitivity`)
 *   - mouse drag(背景):pan / region-select(mode 別)
 *   - 2-finger pinch / 1-finger touch drag:zoom / pan
 *   - mousedown on node(coord で hit):dispatch SELECT_ENTRY
 *   - region-select: drag-rect 解放時に `pkc-graph-region-selected` CustomEvent
 *
 * Layer rule: adapter 層なので core / features 経由で参照可。
 */

import { graphZoomWheelSensitivity, graphNodeRadiusFactor } from '../../features/graph/flags';
import type { Entry } from '@core/model/record';

export interface GraphCanvasNode {
  id: string;
  label: string;
  archetype: string;
  /** Optional inline fill (color-tags / hierarchy depth). */
  cssColor?: string;
  /**
   * PR-LLL (2026-05-06):node degree(linked relation count)。設定
   * されていれば draw が radius スケーリングに使う。0 / undefined は
   * default size のまま。
   */
  degree?: number;
  /**
   * PR-LLL:hover tooltip 用 preview 文字列(title + body excerpt)。
   * 設定されていれば mousemove で当たった時に下端 tooltip 表示。
   */
  preview?: string;
}

export interface GraphCanvasLink {
  from: string;
  to: string;
  /**
   * PR-LLL:`structural` / `semantic` / `categorical` / `temporal` の
   * kind 別に edge を色分けする。設定されていれば legend にも反映。
   */
  kind?: string;
}

export interface GraphCanvasPayload {
  /** Logical viewBox-equivalent dimensions (px). Coords below are in this space. */
  width: number;
  height: number;
  /** Active graph mode (`relations` etc., used for axis hint rendering). */
  mode: string;
  nodes: readonly GraphCanvasNode[];
  positions: ReadonlyMap<string, { x: number; y: number }>;
  links: readonly GraphCanvasLink[];
  selectedLid: string | null;
  regionLids: readonly string[];
  regionMode: boolean;
  collideRadius: number;
  /**
   * For time-proximity mode. When present, draws 3 vertical guide lines +
   * date labels across the bottom in the same coord space as nodes.
   */
  timeAxis?: { minT: number; maxT: number };
  /**
   * PR-I G17 (2026-05-06):Venn-style グルーピング memberships。
   * ON のとき、各 node lid → 所属 group ids(folder ancestor lids + tag
   * names)の配列。draw 時に concentric translucent ring を node 周りに
   * 重ねて Venn-like overlap を視覚化。
   */
  vennMemberships?: ReadonlyMap<string, readonly string[]>;
}

interface CanvasViewState {
  scale: number;
  tx: number;
  ty: number;
  /** Region-select drag in progress; null when not dragging. */
  rectStart: { ux: number; uy: number } | null;
  rectEnd: { ux: number; uy: number } | null;
  /**
   * PR-AAA (2026-05-06):banner of "first bind has been auto-fit to
   * node bounds yet". Once true, subsequent re-binds preserve the
   * user's zoom/pan instead of re-fitting. Reset by `resetGraphCanvasZoom`.
   */
  autoFitDone?: boolean;
}

// PR-DD (2026-05-06、user 報告「銀河の星々のように」):zoom range を
// galaxy 風の超広域に拡張。MIN 0.1 → 0.05(全体俯瞰)、MAX 8 → 32
// (個別 node まで近づける)。
const MIN_SCALE = 0.05;
const MAX_SCALE = 32;

const payloads: WeakMap<HTMLCanvasElement, GraphCanvasPayload> = new WeakMap();
const viewStates: WeakMap<HTMLCanvasElement, CanvasViewState> = new WeakMap();
const gestureControllers: WeakMap<HTMLCanvasElement, AbortController> = new WeakMap();

function getOrInitView(canvas: HTMLCanvasElement): CanvasViewState {
  let v = viewStates.get(canvas);
  if (!v) {
    v = { scale: 1, tx: 0, ty: 0, rectStart: null, rectEnd: null };
    viewStates.set(canvas, v);
  }
  return v;
}

/**
 * Public — renderer calls this to (re)bind the data + draw. Idempotent.
 * The view state(zoom / pan)survives re-binding so the user's zoom
 * level is preserved across re-renders.
 */
export function bindGraphCanvas(canvas: HTMLCanvasElement, payload: GraphCanvasPayload): void {
  payloads.set(canvas, payload);
  // Clear the "smoke-test data stamp" flag so the next draw re-emits
  // node summary attrs reflecting the new payload.
  canvas.removeAttribute('data-pkc-graph-nodes-bound');
  const view = getOrInitView(canvas);
  // PR-AAA (2026-05-06):user 修正指示1「グラフビューが詰まりすぎ
  // ていて見づらい … まるで銀河の星々のように」への対応。初回 bind
  // で全 node の bounding box を画面内にフィットさせる auto-fit を
  // 実行(`autoFitDone` flag で 1 度限り)。subsequent re-bind は user
  // の zoom / pan を保持。 resetGraphCanvasZoom が flag をクリアして
  // re-fit を可能にする。
  if (!view.autoFitDone && payload.positions.size > 0) {
    fitToBounds(view, payload);
    view.autoFitDone = true;
  }
  drawGraphCanvas(canvas);
}

/** Reset zoom + pan to auto-fit (PR-AAA: identity → auto-fit). */
export function resetGraphCanvasZoom(canvas: HTMLCanvasElement): void {
  const v = getOrInitView(canvas);
  const payload = payloads.get(canvas);
  v.scale = 1;
  v.tx = 0;
  v.ty = 0;
  v.rectStart = null;
  v.rectEnd = null;
  v.autoFitDone = false;
  if (payload && payload.positions.size > 0) {
    fitToBounds(v, payload);
    v.autoFitDone = true;
  }
  drawGraphCanvas(canvas);
}

/**
 * PR-AAA: compute a `scale` + `tx/ty` that fits all node positions
 * inside the canvas's logical viewport with 12% padding margin. Pure
 * mutator on `view` — caller drives the redraw.
 */
function fitToBounds(view: CanvasViewState, payload: GraphCanvasPayload): void {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pos of payload.positions.values()) {
    if (pos.x < minX) minX = pos.x;
    if (pos.y < minY) minY = pos.y;
    if (pos.x > maxX) maxX = pos.x;
    if (pos.y > maxY) maxY = pos.y;
  }
  if (!Number.isFinite(minX)) return;
  // Account for node radius so labels don't get clipped.
  const r = Math.max(payload.collideRadius, 24);
  minX -= r; minY -= r; maxX += r; maxY += r;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const pad = 0.88;
  const sx = (payload.width * pad) / w;
  const sy = (payload.height * pad) / h;
  // PR-AAA:auto-fit は zoom-OUT 専用。bbox がもともと viewport 内に
  // 収まる場合(scale > 1)は identity に保つ — 既存 test の click
  // 座標期待値を壊さず、銀河 view としても自然(1 つの近接群を
  // 拡大しすぎない)。
  const s = Math.max(MIN_SCALE, Math.min(1, Math.min(sx, sy)));
  if (s >= 1) {
    view.scale = 1;
    view.tx = 0;
    view.ty = 0;
    return;
  }
  view.scale = s;
  // Center the bounding box within the canvas logical viewport.
  view.tx = (payload.width - w * s) / 2 - minX * s;
  view.ty = (payload.height - h * s) / 2 - minY * s;
}

/** Test-only — read current view state. */
export function __getGraphCanvasViewForTest(canvas: HTMLCanvasElement): CanvasViewState | undefined {
  return viewStates.get(canvas);
}

/**
 * Test-only — given a payload, return the bounding box of a named node
 * (in logical coord space). Lets parity tests verify positions without
 * hit-testing canvas pixels.
 */
export function __getGraphCanvasNodePosForTest(canvas: HTMLCanvasElement, lid: string): { x: number; y: number } | null {
  const p = payloads.get(canvas);
  return p?.positions.get(lid) ?? null;
}

/**
 * Test-only — return all (lid, label, position) tuples currently bound
 * to the canvas. Smoke tests use this to look up positions / labels
 * without DOM children (which Canvas doesn't have).
 */
export function __getGraphCanvasNodesForTest(canvas: HTMLCanvasElement): Array<{ lid: string; label: string; x: number; y: number }> {
  const p = payloads.get(canvas);
  if (!p) return [];
  const out: Array<{ lid: string; label: string; x: number; y: number }> = [];
  for (const n of p.nodes) {
    const pos = p.positions.get(n.id);
    if (!pos) continue;
    out.push({ lid: n.id, label: n.label, x: pos.x, y: pos.y });
  }
  return out;
}

/**
 * Convert a client (viewport) point into the canvas's logical coord
 * space (the same space `payload.positions` uses). Accounts for the
 * canvas CSS-display vs. logical size ratio.
 */
function clientToLogical(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const payload = payloads.get(canvas);
  const lw = payload?.width ?? rect.width;
  const lh = payload?.height ?? rect.height;
  const sx = rect.width === 0 ? 1 : lw / rect.width;
  const sy = rect.height === 0 ? 1 : lh / rect.height;
  return {
    x: (clientX - rect.left) * sx,
    y: (clientY - rect.top) * sy,
  };
}

/** Convert logical coord → user (post-view-transform) coord. */
function logicalToUser(canvas: HTMLCanvasElement, lx: number, ly: number): { x: number; y: number } {
  const v = viewStates.get(canvas);
  if (!v) return { x: lx, y: ly };
  return { x: (lx - v.tx) / v.scale, y: (ly - v.ty) / v.scale };
}

/**
 * Coordinate-based hit testing — given a client point, return the
 * topmost node lid under it (within node radius). Used by mouse / touch
 * handlers to translate clicks into select-entry dispatches.
 */
export function hitTestNodeAt(canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null {
  const payload = payloads.get(canvas);
  if (!payload) return null;
  const logical = clientToLogical(canvas, clientX, clientY);
  const user = logicalToUser(canvas, logical.x, logical.y);
  // PR-TTT (2026-05-07、修正指示7 #6):node 視覚半径を flag 制御化。
  const r = payload.collideRadius * graphNodeRadiusFactor();
  const r2 = r * r;
  // Iterate in reverse so visually-on-top(later-drawn) nodes win ties.
  // Current draw order = payload.nodes order, so reverse iterate.
  for (let i = payload.nodes.length - 1; i >= 0; i--) {
    const n = payload.nodes[i]!;
    const p = payload.positions.get(n.id);
    if (!p) continue;
    const dx = user.x - p.x;
    const dy = user.y - p.y;
    if (dx * dx + dy * dy <= r2) return n.id;
  }
  return null;
}

/**
 * Resolve theme-aware colors at draw time. The canvas paints into a
 * raster bitmap, so CSS `var(--c-...)` cascades aren't visible — we
 * need to compute concrete RGB strings from the page's `:root` style.
 */
function resolveTheme(canvas: HTMLCanvasElement): {
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  accent: string;
  bgTag: string;
  graphEdge: string;
} {
  const root = canvas.ownerDocument.documentElement;
  const cs = canvas.ownerDocument.defaultView!.getComputedStyle(root);
  const get = (key: string, fallback: string): string => {
    const v = cs.getPropertyValue(key).trim();
    return v.length > 0 ? v : fallback;
  };
  return {
    bg: get('--c-bg', '#fff'),
    fg: get('--c-fg', '#222'),
    // PKC2 token は `--c-muted`(`--c-fg-muted` は存在しない)。
    // PR-AA hotfix:fallback も rgb 値を両 theme で見える gray に。
    fgMuted: get('--c-muted', '#888'),
    border: get('--c-border', 'rgba(0,0,0,0.3)'),
    accent: get('--c-accent', '#3b82f6'),
    bgTag: get('--c-bg-tag', 'rgba(0,0,0,0.04)'),
    // PR-K G20:graph view edges 専用 token。WCAG AA non-text 3:1 を確保。
    graphEdge: get('--c-graph-edge', '#666'),
  };
}

/** archetype → fill color (matches existing CSS rules). */
function archetypeFill(archetype: string): string {
  switch (archetype) {
    case 'folder': return 'rgba(255, 200, 100, 0.55)';
    case 'text': return 'rgba(120, 180, 255, 0.55)';
    case 'textlog': return 'rgba(100, 220, 180, 0.55)';
    case 'todo': return 'rgba(255, 150, 150, 0.55)';
    case 'attachment': return 'rgba(180, 180, 180, 0.55)';
    default: return 'rgba(160, 160, 160, 0.55)';
  }
}

/**
 * PR-LLL (2026-05-06、user 修正指示5「ノードはエントリ種別に応じて
 * 絵文字にすること」):archetype → emoji map。center pane の
 * archetype icon と一致(視覚的整合)。
 */
export function archetypeEmoji(archetype: string): string {
  switch (archetype) {
    case 'folder': return '📁';
    case 'text': return '📝';
    case 'textlog': return '📜';
    case 'todo': return '☑';
    case 'attachment': return '📎';
    case 'form': return '📋';
    case 'generic': return '📄';
    default: return '◯';
  }
}

/**
 * PR-LLL (2026-05-06、user 修正指示5「リレーションは線の色で分けて」):
 * relation kind → CSS color。legend と同じ色を使うため共通化。
 * Color choices are CB-friendly(色覚多様性配慮、鮮やかすぎない
 * 中明度):
 *   - structural(folder hierarchy)→ blue
 *   - semantic(本文中の entry: link)→ purple
 *   - categorical(tag)→ green
 *   - temporal(time proximity)→ orange
 *   - その他 → fallback gray(theme.graphEdge)
 */
export function relationColor(kind: string | undefined, fallback: string): string {
  switch (kind) {
    case 'structural': return '#3b82f6';
    case 'semantic': return '#a855f7';
    case 'categorical': return '#22c55e';
    case 'temporal': return '#f97316';
    default: return fallback;
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

/**
 * PR-I G17:group id → deterministic hue [0, 360)。同じ id は常に同じ
 * 色になり、複数 group の重なりを安定して視覚化できる。
 */
function vennHueForGroupId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i++) {
    h = ((h * 33) ^ id.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 360);
}

/**
 * Main draw function. Idempotent — clears the canvas and redraws
 * everything from `payload` + `viewState`. Call after any state change.
 *
 * Hi-DPI: `canvas.width = logicalW × dpr`, `ctx.scale(dpr, dpr)` so
 * subsequent draws are in logical pixel coords.
 */
export function drawGraphCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  const payload = payloads.get(canvas);
  const view = viewStates.get(canvas);
  if (!ctx || !payload || !view) return;

  const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  // Match raster size to logical × dpr if not already.
  const targetW = Math.round(payload.width * dpr);
  const targetH = Math.round(payload.height * dpr);
  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const theme = resolveTheme(canvas);

  // PR-K G21 (2026-05-06、user 報告):「グラフの残像がひどい」。
  // 旧:`fillRect(0, 0, width, height)` の前に `clearRect` を呼んでおら
  // ず、背景が `--c-bg-tag` (`rgba(0,0,0,0.04)`)で **半透明** だった
  // ので、新フレームを描く前に旧フレームが消えず ghost として残って
  // いた。修正:transform 適用前の素 canvas pixel space で `clearRect`
  // を全面に当て、その後 **不透明** な `theme.bg` を background に塗る。
  ctx.save();
  // 1. Reset transform → clear raw raster.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 2. Now apply dpr scale + paint solid background.
  ctx.scale(dpr, dpr);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, payload.width, payload.height);
  // 3. Subtle tint overlay (semi-transparent — but we have solid bg now).
  ctx.fillStyle = theme.bgTag;
  ctx.fillRect(0, 0, payload.width, payload.height);

  // View transform.
  ctx.translate(view.tx, view.ty);
  ctx.scale(view.scale, view.scale);

  // Time axis (under nodes).
  if (payload.timeAxis && payload.mode === 'time-proximity') {
    drawTimeAxis(ctx, payload, view, theme);
  }

  // Edges.
  // PR-K G20 → PR-P (2026-05-06):user 報告「関連線が細くて関連が
  // 見えない、ライト/ダークで見やすさが変わる」。PR-K で WCAG 5.5:1
  // を担保したが太さ 1.5 px はまだ細い。PR-P で 2.5 px に bump、
  // 線幅 + token color の両方で「edge が一目で見える」を確保。
  // theme.graphEdge は base.css で dark / light 両方 7:1 程度に bump
  // 済み(両 theme で同等の視認性)。
  // PR-LLL (2026-05-06):relation kind 別に色分け。kind が undefined
  // の link は theme.graphEdge にフォールバック(後方互換)。
  ctx.lineWidth = 2.5 / view.scale;
  ctx.globalAlpha = 1;
  for (const link of payload.links) {
    const a = payload.positions.get(link.from);
    const b = payload.positions.get(link.to);
    if (!a || !b) continue;
    ctx.strokeStyle = relationColor(link.kind, theme.graphEdge);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // PR-I G17 (2026-05-06):Venn-style memberships。各 node の所属 group
  // ごとに deterministic な hue で translucent ring を concentric に
  // 描画。複数 group に所属する node は ring が重なり Venn 相当の重畳
  // を視覚化(node 自体の色 + group 1 の ring + group 2 の ring …)。
  if (payload.vennMemberships && payload.vennMemberships.size > 0) {
    const baseR = payload.collideRadius * graphNodeRadiusFactor();
    for (const node of payload.nodes) {
      const memberships = payload.vennMemberships.get(node.id);
      if (!memberships || memberships.length === 0) continue;
      const p = payload.positions.get(node.id);
      if (!p) continue;
      memberships.forEach((groupId, idx) => {
        // 各 ring は node 円の外周から段階的に外へ広がる(idx 0 = +6,
        // idx 1 = +11, ...)。半径は user-space pixel、line width は
        // view.scale で割って render pixel 一定化。
        const ringR = baseR + 6 + idx * 5;
        const hue = vennHueForGroupId(groupId);
        ctx.beginPath();
        ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = `hsla(${hue}, 80%, 50%, 0.55)`;
        ctx.lineWidth = 4 / view.scale;
        ctx.stroke();
      });
    }
  }

  // Nodes.
  // PR-LLL (2026-05-06):relation 数に応じてサイズ拡大、archetype
  // emoji を中央に重畳描画(円は薄く残して selection / hover の
  // affordance を保持)。
  const baseR = payload.collideRadius * graphNodeRadiusFactor();
  for (const node of payload.nodes) {
    const p = payload.positions.get(node.id);
    if (!p) continue;
    const isSelected = node.id === payload.selectedLid;
    const isInRegion = payload.regionLids.includes(node.id);

    // PR-LLL: degree-scaled radius. degree 0 → 1.0x、degree 1 → 1.04x、
    // degree 10 → 1.4x、上限 1.5x で打ち止め。
    // PR-TTT (2026-05-07、修正指示7 #6):過剰スケールを抑制(0.05/1.8 → 0.04/1.5)
    // し、ノードサイズを label に対して相対的に小さく。
    const degree = node.degree ?? 0;
    const scale = Math.min(1.5, 1 + degree * 0.04);
    const r = baseR * scale;

    // Circle (背景色、emoji 視認性のため薄め).
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.cssColor ?? archetypeFill(node.archetype);
    ctx.fill();

    if (isSelected || isInRegion) {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 3 / view.scale;
      ctx.stroke();
    } else {
      ctx.strokeStyle = theme.fg;
      ctx.lineWidth = 1.5 / view.scale;
      ctx.stroke();
    }

    // PR-LLL:archetype emoji を node 中央に描画。emoji font は OS
    // が決めるが segoe / apple-color / noto-color が共通で使える。
    const emoji = archetypeEmoji(node.archetype);
    const emojiSize = Math.max(14, r * 1.2);
    ctx.font = `${emojiSize}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.fg;
    ctx.fillText(emoji, p.x, p.y);

    // Label with halo (G18 readability).
    // PR-P (2026-05-06):user 報告「エントリ名が省略されているので、
    // 何が関連しているのかわからない」。truncate 長を 18 → 32 に
    // bump、長い title でも relations が読めるように。force layout の
    // 余白 bump (PR-P のもう 1 件) と組み合わせて重複を最小化。
    const labelText = truncate(node.label, 32);
    const fontSize = 13;
    ctx.font = `500 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 3 / view.scale;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = theme.bg;
    ctx.strokeText(labelText, p.x, p.y + r + 4);
    ctx.fillStyle = theme.fg;
    ctx.fillText(labelText, p.x, p.y + r + 4);
  }

  // Region-select rect (drawn last so it's above everything).
  if (view.rectStart && view.rectEnd) {
    const x = Math.min(view.rectStart.ux, view.rectEnd.ux);
    const y = Math.min(view.rectStart.uy, view.rectEnd.uy);
    const w = Math.abs(view.rectEnd.ux - view.rectStart.ux);
    const h = Math.abs(view.rectEnd.uy - view.rectStart.uy);
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5 / view.scale;
    ctx.setLineDash([4 / view.scale, 2 / view.scale]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Surface zoom state to data attrs for parity tests.
  canvas.setAttribute('data-pkc-graph-zoom-scale', String(view.scale));
  canvas.setAttribute('data-pkc-graph-zoom-tx', String(view.tx));
  canvas.setAttribute('data-pkc-graph-zoom-ty', String(view.ty));
  // Smoke-test surface — Canvas は DOM 子を持たないので、parity test が
  // 個々の node の座標 / lid を assert するために JSON で表面化する。
  // bind 時に 1 度書けば十分(scale/tx/ty とは違って draw ループで不変)。
  if (canvas.getAttribute('data-pkc-graph-nodes-bound') !== 'true') {
    const summary = payload.nodes.map((n) => {
      const p = payload.positions.get(n.id);
      return { lid: n.id, label: n.label, archetype: n.archetype, x: p?.x ?? 0, y: p?.y ?? 0 };
    });
    canvas.setAttribute('data-pkc-graph-nodes', JSON.stringify(summary));
    canvas.setAttribute('data-pkc-graph-edges', String(payload.links.length));
    canvas.setAttribute('data-pkc-graph-time-axis', payload.timeAxis ? 'true' : 'false');
    canvas.setAttribute('data-pkc-graph-nodes-bound', 'true');
  }
}

function drawTimeAxis(
  ctx: CanvasRenderingContext2D,
  payload: GraphCanvasPayload,
  view: CanvasViewState,
  theme: { fgMuted: string; border: string },
): void {
  if (!payload.timeAxis) return;
  const { minT, maxT } = payload.timeAxis;
  const fmt = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const ticks: [number, 'left' | 'center' | 'right', string][] = [
    [minT, 'left', `← ${fmt(minT)}(古い)`],
    [(minT + maxT) / 2, 'center', fmt((minT + maxT) / 2)],
    [maxT, 'right', `${fmt(maxT)}(新しい)→`],
  ];
  const padX = 40;
  const usableW = payload.width - padX * 2;
  ctx.save();
  ctx.font = `11px sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = theme.fgMuted;
  ctx.strokeStyle = theme.border;
  ctx.lineWidth = 1 / view.scale;
  ctx.setLineDash([2 / view.scale, 4 / view.scale]);
  for (const [t, anchor, label] of ticks) {
    const xRatio = (t - minT) / Math.max(1, maxT - minT);
    const x = padX + xRatio * usableW;
    // Vertical guide line.
    ctx.beginPath();
    ctx.moveTo(x, 20);
    ctx.lineTo(x, payload.height - 24);
    ctx.stroke();
    // Label.
    ctx.textAlign = anchor === 'left' ? 'left' : anchor === 'right' ? 'right' : 'center';
    ctx.fillText(label, x, payload.height - 18);
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/**
 * Wire wheel / drag / touch / pinch handlers on a canvas. Idempotent —
 * re-binding aborts the previous controller. Call once after the
 * canvas is mounted; bindGraphCanvas() handles redraw on payload changes.
 */
export function installGraphCanvasGestures(canvas: HTMLCanvasElement): void {
  const prev = gestureControllers.get(canvas);
  if (prev) prev.abort();
  const controller = new AbortController();
  const signal = controller.signal;
  gestureControllers.set(canvas, controller);

  getOrInitView(canvas);

  let panStart: { clientX: number; clientY: number; tx: number; ty: number } | null = null;
  let pinchStart: {
    dist: number; scale: number;
    midClientX: number; midClientY: number;
    midUserX: number; midUserY: number;
  } | null = null;
  let pressDownLid: string | null = null;
  let mouseDownPos: { x: number; y: number } | null = null;

  const isRegionMode = (): boolean => canvas.getAttribute('data-pkc-graph-region-select-mode') === 'true';

  const win = canvas.ownerDocument.defaultView!;

  // ── Hover tooltip (PR-WWW 2026-05-07、修正指示5 残)──
  // node の preview 文字列を mouse 位置近くに表示。dragging / pinch
  // 中は非表示。tooltip は canvas の親に absolute 配置(canvas 自体を
  // positioning context にしないため、positioned ancestor が必要)。
  let hoverTooltip: HTMLDivElement | null = null;
  const ensureTooltip = (): HTMLDivElement => {
    if (hoverTooltip) return hoverTooltip;
    const t = canvas.ownerDocument.createElement('div');
    t.className = 'pkc-graph-hover-tooltip';
    t.setAttribute('data-pkc-region', 'graph-hover-tooltip');
    t.style.display = 'none';
    canvas.parentElement?.appendChild(t);
    hoverTooltip = t;
    return t;
  };
  const hideTooltip = (): void => {
    if (hoverTooltip) hoverTooltip.style.display = 'none';
  };
  canvas.addEventListener('mousemove', (ev) => {
    const me = ev as MouseEvent;
    // Skip during pan / region drag — those operations own the cursor.
    if (panStart || viewStates.get(canvas)?.rectStart) {
      hideTooltip();
      return;
    }
    const lid = hitTestNodeAt(canvas, me.clientX, me.clientY);
    if (!lid) {
      hideTooltip();
      return;
    }
    const node = payloads.get(canvas)?.nodes.find((n) => n.id === lid);
    const text = node?.preview ?? node?.label;
    if (!text) {
      hideTooltip();
      return;
    }
    const tip = ensureTooltip();
    tip.textContent = text;
    tip.style.display = 'block';
    // Position relative to canvas parent (assumed positioning context).
    const parentRect = canvas.parentElement!.getBoundingClientRect();
    const x = me.clientX - parentRect.left + 12;
    const y = me.clientY - parentRect.top + 12;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }, { signal });
  canvas.addEventListener('mouseleave', () => {
    hideTooltip();
  }, { signal });

  // ── Wheel: cursor-centered zoom. ──
  canvas.addEventListener('wheel', (ev) => {
    const we = ev as WheelEvent;
    we.preventDefault();
    const view = viewStates.get(canvas);
    if (!view) return;
    const logical = clientToLogical(canvas, we.clientX, we.clientY);
    const userX = (logical.x - view.tx) / view.scale;
    const userY = (logical.y - view.ty) / view.scale;
    const sensitivity = graphZoomWheelSensitivity() * 0.0001;
    const factor = Math.exp(-we.deltaY * sensitivity);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * factor));
    view.scale = newScale;
    view.tx = logical.x - userX * newScale;
    view.ty = logical.y - userY * newScale;
    drawGraphCanvas(canvas);
  }, { passive: false, signal });

  // ── Mouse: click / drag / pan / region-select. ──
  canvas.addEventListener('mousedown', (ev) => {
    const me = ev as MouseEvent;
    if (me.button !== 0) return;
    const view = viewStates.get(canvas);
    if (!view) return;
    // First check if this is a click on a node — if so, defer to mouseup.
    pressDownLid = hitTestNodeAt(canvas, me.clientX, me.clientY);
    mouseDownPos = { x: me.clientX, y: me.clientY };
    if (pressDownLid) {
      // Don't engage pan/region for node clicks.
      return;
    }
    if (isRegionMode()) {
      const logical = clientToLogical(canvas, me.clientX, me.clientY);
      view.rectStart = { ux: logical.x, uy: logical.y };
      view.rectEnd = { ux: logical.x, uy: logical.y };
      panStart = null;
      drawGraphCanvas(canvas);
    } else {
      panStart = { clientX: me.clientX, clientY: me.clientY, tx: view.tx, ty: view.ty };
    }
    me.preventDefault();
  }, { signal });

  win.addEventListener('mousemove', (ev) => {
    const me = ev as MouseEvent;
    const view = viewStates.get(canvas);
    if (!view) return;
    if (view.rectStart) {
      const logical = clientToLogical(canvas, me.clientX, me.clientY);
      view.rectEnd = { ux: logical.x, uy: logical.y };
      drawGraphCanvas(canvas);
      return;
    }
    if (!panStart) return;
    const rect = canvas.getBoundingClientRect();
    const payload = payloads.get(canvas);
    const lw = payload?.width ?? rect.width;
    const lh = payload?.height ?? rect.height;
    const sx = rect.width === 0 ? 1 : lw / rect.width;
    const sy = rect.height === 0 ? 1 : lh / rect.height;
    view.tx = panStart.tx + (me.clientX - panStart.clientX) * sx;
    view.ty = panStart.ty + (me.clientY - panStart.clientY) * sy;
    drawGraphCanvas(canvas);
  }, { signal });

  win.addEventListener('mouseup', (ev) => {
    const me = ev as MouseEvent;
    const view = viewStates.get(canvas);
    if (!view) return;
    if (view.rectStart && view.rectEnd) {
      // Region-select complete — compute hit lids and emit.
      finalizeRegionSelect(canvas);
      view.rectStart = null;
      view.rectEnd = null;
      drawGraphCanvas(canvas);
    }
    if (pressDownLid) {
      // Click on a node — emit a synthetic CustomEvent so action-binder
      // can dispatch SELECT_ENTRY without touching SVG-style delegation.
      const start = mouseDownPos;
      if (start) {
        const dist = Math.hypot(me.clientX - start.x, me.clientY - start.y);
        if (dist < 5) {
          const evt = new CustomEvent('pkc-graph-node-click', {
            detail: { lid: pressDownLid },
            bubbles: true,
          });
          canvas.dispatchEvent(evt);
        }
      }
    }
    panStart = null;
    pressDownLid = null;
    mouseDownPos = null;
  }, { signal });

  // ── Touch: pinch + 1-finger pan / region-select / tap. ──
  canvas.addEventListener('touchstart', (ev) => {
    const te = ev as TouchEvent;
    const touches = te.touches;
    const view = viewStates.get(canvas);
    if (!view) return;
    if (touches.length === 2) {
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const midClient = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const logical = clientToLogical(canvas, midClient.x, midClient.y);
      const midUserX = (logical.x - view.tx) / view.scale;
      const midUserY = (logical.y - view.ty) / view.scale;
      pinchStart = {
        dist,
        scale: view.scale,
        midClientX: midClient.x,
        midClientY: midClient.y,
        midUserX,
        midUserY,
      };
      panStart = null;
      view.rectStart = null;
      view.rectEnd = null;
      te.preventDefault();
    } else if (touches.length === 1) {
      const t = touches[0]!;
      pressDownLid = hitTestNodeAt(canvas, t.clientX, t.clientY);
      mouseDownPos = { x: t.clientX, y: t.clientY };
      if (pressDownLid) return;
      if (isRegionMode()) {
        const logical = clientToLogical(canvas, t.clientX, t.clientY);
        view.rectStart = { ux: logical.x, uy: logical.y };
        view.rectEnd = { ux: logical.x, uy: logical.y };
        panStart = null;
        drawGraphCanvas(canvas);
      } else {
        panStart = { clientX: t.clientX, clientY: t.clientY, tx: view.tx, ty: view.ty };
      }
    }
  }, { passive: false, signal });

  canvas.addEventListener('touchmove', (ev) => {
    const te = ev as TouchEvent;
    const touches = te.touches;
    const view = viewStates.get(canvas);
    if (!view) return;
    if (touches.length === 2 && pinchStart) {
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / pinchStart.dist;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.scale * ratio));
      const midClient = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const logicalNow = clientToLogical(canvas, midClient.x, midClient.y);
      view.scale = newScale;
      view.tx = logicalNow.x - pinchStart.midUserX * newScale;
      view.ty = logicalNow.y - pinchStart.midUserY * newScale;
      drawGraphCanvas(canvas);
      te.preventDefault();
    } else if (touches.length === 1) {
      const t = touches[0]!;
      if (view.rectStart) {
        const logical = clientToLogical(canvas, t.clientX, t.clientY);
        view.rectEnd = { ux: logical.x, uy: logical.y };
        drawGraphCanvas(canvas);
        te.preventDefault();
      } else if (panStart) {
        const rect = canvas.getBoundingClientRect();
        const payload = payloads.get(canvas);
        const lw = payload?.width ?? rect.width;
        const lh = payload?.height ?? rect.height;
        const sx = rect.width === 0 ? 1 : lw / rect.width;
        const sy = rect.height === 0 ? 1 : lh / rect.height;
        view.tx = panStart.tx + (t.clientX - panStart.clientX) * sx;
        view.ty = panStart.ty + (t.clientY - panStart.clientY) * sy;
        drawGraphCanvas(canvas);
        te.preventDefault();
      }
    }
  }, { passive: false, signal });

  canvas.addEventListener('touchend', (ev) => {
    const te = ev as TouchEvent;
    const touches = te.touches;
    const view = viewStates.get(canvas);
    if (!view) return;
    if (touches.length < 2) pinchStart = null;
    if (touches.length === 0) {
      if (view.rectStart && view.rectEnd) {
        finalizeRegionSelect(canvas);
        view.rectStart = null;
        view.rectEnd = null;
        drawGraphCanvas(canvas);
      }
      // Tap on a node?
      if (pressDownLid && te.changedTouches.length === 1) {
        const ct = te.changedTouches[0]!;
        const start = mouseDownPos;
        if (start) {
          const dist = Math.hypot(ct.clientX - start.x, ct.clientY - start.y);
          if (dist < 10) {
            canvas.dispatchEvent(new CustomEvent('pkc-graph-node-click', {
              detail: { lid: pressDownLid },
              bubbles: true,
            }));
          }
        }
      }
      panStart = null;
      pressDownLid = null;
      mouseDownPos = null;
    }
  }, { passive: false, signal });
}

function finalizeRegionSelect(canvas: HTMLCanvasElement): void {
  const view = viewStates.get(canvas);
  const payload = payloads.get(canvas);
  if (!view || !payload || !view.rectStart || !view.rectEnd) return;
  // Convert logical rect → user-space rect.
  const u0 = logicalToUser(canvas, view.rectStart.ux, view.rectStart.uy);
  const u1 = logicalToUser(canvas, view.rectEnd.ux, view.rectEnd.uy);
  const rx = Math.min(u0.x, u1.x);
  const ry = Math.min(u0.y, u1.y);
  const rw = Math.abs(u1.x - u0.x);
  const rh = Math.abs(u1.y - u0.y);
  const lids: string[] = [];
  if (rw >= 4 && rh >= 4) {
    for (const node of payload.nodes) {
      const p = payload.positions.get(node.id);
      if (!p) continue;
      if (p.x >= rx && p.x <= rx + rw && p.y >= ry && p.y <= ry + rh) lids.push(node.id);
    }
    canvas.dispatchEvent(new CustomEvent('pkc-graph-region-selected', {
      detail: { lids },
      bubbles: true,
    }));
  }
}

/**
 * Container helper for renderer — given pre-computed graph data, return
 * the time-axis hint. Used to keep the renderer's responsibility narrow
 * (it just provides Entry data; we extract timestamps).
 */
export function buildTimeAxisHint(entries: readonly Entry[]): { minT: number; maxT: number } | null {
  const ts = entries
    .map((e) => Date.parse(e.created_at))
    .filter((t) => Number.isFinite(t) && t > 0);
  if (ts.length === 0) return null;
  return { minT: Math.min(...ts), maxT: Math.max(...ts) };
}

