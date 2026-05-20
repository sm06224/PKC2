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

import { graphZoomWheelSensitivity, graphNodeRadiusFactor, graphGalaxyMode } from '../../features/graph/flags';
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
  /**
   * PR-Δ22 (2026-05-07、user 指摘「銀河的に空間所属を表現しろ」):
   * folder depth を z 軸として galaxy mode で perspective 投影。
   * 0 = root level、深いほど大きい数値。renderer 側 BFS depth から populate。
   */
  depth?: number;
}

export interface GraphCanvasLink {
  from: string;
  to: string;
  /**
   * PR-LLL:`structural` / `semantic` / `categorical` / `temporal` の
   * kind 別に edge を色分けする。設定されていれば legend にも反映。
   */
  kind?: string;
  /**
   * PR-Δ6 (2026-05-07、user 報告「グラフのカラータグ表示で同じカラータグは
   * カラータグと同じ色のリレーションで接続してほしい」):kind ごとの
   * default 色を override する直接指定。color-tags mode で使う。
   */
  cssColor?: string;
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
   * PR-Δ6 (2026-05-07、user 報告「時系列グラフ Git 的なエントリの更新点」):
   * lid → revisions(updated_at timestamps、ms)の配列。time-proximity
   * mode で各 entry に重なる X 軸上に小 dot で revision history を表示。
   * 空 / undefined の entry は描画スキップ。
   */
  nodeRevisions?: ReadonlyMap<string, readonly number[]>;
  /**
   * PR-Δ13 (2026-05-07、user 報告「時系列の中で参照ラインが見えていない、
   * どの更新時点でどの種別の参照を含むようになったのかわかればその時点で
   * 参照ラインを引くべき」):lid → relations 配列。time-proximity mode で
   * head node 同士を結ぶ参照ラインを描画(relation kind で色分け)。
   */
  nodeReferences?: ReadonlyMap<string, ReadonlyArray<{ to: string; kind: string }>>;
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
  /**
   * PR-Δ33 (2026-05-07、user 指示「特定のエントリや結節点、リレーションを
   * 掴んで引っ張ることで、ぶら下がるものが動く」):node drag 中の状態。
   * dragLid:現在 drag 中の node、null = drag していない。
   * dragOrigUser:drag 開始時の dragLid と 1/2-hop 先の neighbor の元位置を
   *   user-space で記録。move 中はここから delta を加減して positions を更新。
   * dragMouseStart:mousedown 時の client 座標。move 中の delta 計算に使用。
   */
  dragLid?: string | null;
  dragOrigUser?: Map<string, { x: number; y: number }>;
  dragNeighborFactor?: Map<string, number>;
  dragMouseStartClient?: { x: number; y: number } | null;
  /**
   * Phase γ-B2:relation wire editor の drag 中状態。wireSource = drag 元
   * node の lid、wireTarget = cursor の user-space 座標。edit mode 時のみ。
   */
  wireSource?: string | null;
  wireTarget?: { x: number; y: number } | null;
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

// ── Phase γ-B2:relation wire editor の edit mode ──
//
// graph view の view / edit mode を保持する canvas-local runtime state。
// edit mode では node 間 drag で relation を作成する(drag 実装は後続 PR)。
// AppState には載せない(graph view の runtime 操作 state、persistence 不要)。
export type GraphEditMode = 'view' | 'edit';

let graphEditMode: GraphEditMode = 'view';

export function getGraphEditMode(): GraphEditMode {
  return graphEditMode;
}

export function setGraphEditMode(mode: GraphEditMode): void {
  graphEditMode = mode;
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
  // U2 (2026-05-07、wave-10-6 UX evaluation):単一 folder の小 N case で
  // node が中央に固まり viewport が空白だらけになる症状の修正。旧実装は
  // `scale >= 1` で identity を強制(zoom-OUT 専用、銀河感重視)していたが、
  // 小 N cluster が見栄え悪く U2 で指摘された。zoom-IN も許可、ただし
  // 2.5x で cap して過剰拡大は防止(node の輪郭がボヤけない上限)。
  const MAX_AUTOFIT_SCALE = 2.5;
  const s = Math.max(MIN_SCALE, Math.min(MAX_AUTOFIT_SCALE, Math.min(sx, sy)));
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
/**
 * PR-Δ1 (2026-05-07、修正指示9):canvas 内部 raster サイズと CSS
 * 表示サイズの aspect mismatch によるノード歪み(円が楕円化)を撃退
 * するための uniform-scale + letterbox 計算。
 *
 * payload の logical 座標系 (payload.width × payload.height、典型的に
 * 960 × 600)を CSS pixel 表示エリアに **同比例** で fit させる。狭い
 * 方向に letterbox(背景色)が生じる代わりに、円は常に円のまま。
 *
 * 戻り値:
 *   - cssW / cssH:CSS 表示寸法 (px)
 *   - dpr:devicePixelRatio
 *   - scale:logical → CSS px 変換比率(uniform、両軸同値)
 *   - offsetX / offsetY:letterbox 中央寄せのための CSS px 単位 offset
 */
function getCanvasRenderTransform(canvas: HTMLCanvasElement): {
  cssW: number;
  cssH: number;
  dpr: number;
  scale: number;
  offsetX: number;
  offsetY: number;
} | null {
  const payload = payloads.get(canvas);
  if (!payload) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
  const scale = Math.min(rect.width / payload.width, rect.height / payload.height);
  const offsetX = (rect.width - payload.width * scale) / 2;
  const offsetY = (rect.height - payload.height * scale) / 2;
  return {
    cssW: rect.width,
    cssH: rect.height,
    dpr,
    scale,
    offsetX,
    offsetY,
  };
}

/**
 * PR-Δ1:CSS rect の重要 helper。`getBoundingClientRect` を 1 度だけ
 * 呼び出して使い回す callers のために、canvas CSS サイズを返す。
 * canvas CSS-display vs. logical size ratio.
 */
function clientToLogical(canvas: HTMLCanvasElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const tr = getCanvasRenderTransform(canvas);
  if (!tr) return { x: clientX - rect.left, y: clientY - rect.top };
  // PR-Δ1:uniform scale + letterbox offset を反映。元の non-uniform
  // sx/sy を撤回し、円が円のまま hit-test も正しく当たる。
  const cssX = clientX - rect.left - tr.offsetX;
  const cssY = clientY - rect.top - tr.offsetY;
  return { x: cssX / tr.scale, y: cssY / tr.scale };
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

/** archetype → fill color (matches existing CSS rules).
 *
 * PR-Δ6 (2026-05-07、user 報告「グラフにはテーマ適用されないの? ライト・
 * ダーク適用してほしい。視認性も WCAG 的に見やすく」):theme-aware に
 * 拡張。bg luminance を見て dark/light を判定し、それぞれに最適化された
 * 色を返す。各色の WCAG contrast vs theme bg は 3:1 (AA non-text) 以上を
 * 確保。light theme では soft alpha を諦め saturated solid を採用、dark
 * theme は従来の柔らかい semi-transparent を維持(従来の星空感を保ちつつ
 * light でも識別可能に)。
 */
function archetypeFill(archetype: string, themeBgIsDark: boolean): string {
  if (themeBgIsDark) {
    // Dark theme:従来の semi-transparent muted colors。bg #0d0f0a 上で
    // 1:1 〜 3:1 程度の見え方、border (theme.fg = #c8d8b0) と組み合わせ
    // node が明確に見える。
    switch (archetype) {
      case 'folder': return 'rgba(255, 200, 100, 0.55)';
      case 'text': return 'rgba(120, 180, 255, 0.55)';
      case 'textlog': return 'rgba(100, 220, 180, 0.55)';
      case 'todo': return 'rgba(255, 150, 150, 0.55)';
      case 'attachment': return 'rgba(180, 180, 180, 0.55)';
      default: return 'rgba(160, 160, 160, 0.55)';
    }
  }
  // Light theme(parchment bg #f0ebe0):dark saturated colors で
  // 4:1+ contrast 確保。
  switch (archetype) {
    case 'folder': return '#d97706';      // amber-600  4.3:1 vs #f0ebe0
    case 'text': return '#2563eb';        // blue-600   4.5:1
    case 'textlog': return '#059669';     // emerald-600 4.0:1
    case 'todo': return '#dc2626';        // red-600    5.0:1
    case 'attachment': return '#525b67';  // slate-600  6.5:1
    default: return '#71717a';            // zinc-500   4.7:1
  }
}

function themeIsDark(bg: string): boolean {
  // Quick luminance proxy:hex の R+G+B 合計 < 384 なら dark とみなす。
  // CSS variable token "#0d0f0a" → 0d+0f+0a = 13+15+10 = 38 → dark。
  // "#f0ebe0" → f0+eb+e0 = 240+235+224 = 699 → light。
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bg.trim().replace(/^#/, '#'));
  if (!m) return true; // default dark
  const r = parseInt(m[1]!, 16);
  const g = parseInt(m[2]!, 16);
  const b = parseInt(m[3]!, 16);
  return (r + g + b) < 384;
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

  // PR-Δ1 (2026-05-07、修正指示9):canvas raster size を CSS 表示
  // サイズに合わせて adjust(× dpr で hi-DPI 対応)。旧は payload の
  // logical 寸法 (960 × 600) で raster を作り、CSS は `width:100%`
  // で勝手に伸縮させていたので CSS aspect が 1.846 で内部が 1.6 だと
  // ノードが楕円化する。今は raster = CSS × dpr に合わせ、描画 ctx
  // 側で uniform-scale + letterbox させて aspect を保つ。
  const tr = getCanvasRenderTransform(canvas);
  if (!tr) return;
  const targetW = Math.round(tr.cssW * tr.dpr);
  const targetH = Math.round(tr.cssH * tr.dpr);
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
  // 2. PR-Δ1:letterbox 部を含む raster 全体に theme.bg を塗る。
  //    aspect mismatch がある場合(短軸方向に letterbox が出る)、
  //    そこも地色で埋めるため transform 適用前に塗っておく。
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 3. PR-Δ1:uniform scale + center offset + dpr。これで logical
  //    coords (payload.width × payload.height) は CSS rect 内に
  //    aspect 保持で letterbox 配置される。
  ctx.scale(tr.dpr, tr.dpr);
  ctx.translate(tr.offsetX, tr.offsetY);
  ctx.scale(tr.scale, tr.scale);
  // 4. Subtle tint overlay (semi-transparent — but we have solid bg now).
  ctx.fillStyle = theme.bgTag;
  ctx.fillRect(0, 0, payload.width, payload.height);

  // PR-Δ26 (2026-05-07、user 指摘「Galaxy 期待外れ、名前負け」):
  // galaxy mode 時、銀河風の背景効果を描画。
  //   1. Galactic core radial gradient(中心明、外側暗)
  //   2. Starfield(deterministic 1000+ small dots)
  //   3. Edge を nebula 色(青紫グラデ)に置換
  //   4. 各 node に glow halo
  if (graphGalaxyMode() === 1) {
    // Core gradient
    const cx = payload.width / 2, cy = payload.height / 2;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(payload.width, payload.height) * 0.6);
    coreGrad.addColorStop(0, 'rgba(90, 70, 130, 0.35)');
    coreGrad.addColorStop(0.4, 'rgba(40, 30, 70, 0.22)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, payload.width, payload.height);
    // Starfield (deterministic stars based on canvas dims)。
    const starCount = 600;
    let s = 1234567;
    const rand = (): number => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let i = 0; i < starCount; i++) {
      const sx = rand() * payload.width;
      const sy = rand() * payload.height;
      const sr = 0.3 + rand() * 1.0;
      const sa = 0.3 + rand() * 0.6;
      ctx.globalAlpha = sa;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

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
    // PR-Δ6:link.cssColor が直接指定されていればそれを使う(color-tags
    // mode の同色 group で活用)。kind ベースの default はその後の fallback。
    ctx.strokeStyle = link.cssColor ?? relationColor(link.kind, theme.graphEdge);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Phase γ-B2:relation wire editor の prototype line(edit mode の drag 中)。
  // kind 未確定なので neutral 灰色 + 半透明 + 点線(spec OQ-B-4 暫定)。
  if (view.wireSource && view.wireTarget) {
    const src = payload.positions.get(view.wireSource);
    if (src) {
      ctx.save();
      ctx.strokeStyle = theme.fgMuted;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 2 / view.scale;
      ctx.setLineDash([6 / view.scale, 4 / view.scale]);
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(view.wireTarget.x, view.wireTarget.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // PR-Δ21 (2026-05-07、user 指摘「Venn って何?どう見てもベンでは
  // ない」):旧 concentric ring を撤回。**真の集合 hull**(group
  // メンバーの凸包に相当する circle envelope)を translucent fill で
  // 描画して、複数 hull の交差領域を visually に Venn 図化する。
  // Algorithm:
  //   1. group ごとに member node の bounding circle(centroid +
  //      max distance + radius padding)を計算
  //   2. 各 hull を低 alpha (0.12) の deterministic hue で fill、
  //      重なり部分は加算合成で濃く見える(色相の混色 = Venn 効果)
  //   3. hull の輪郭線も同 hue で描画(0.6 alpha)、所属境界を明示
  //   4. node 自体は通常通り別 layer で描画される(後段)。
  if (payload.vennMemberships && payload.vennMemberships.size > 0) {
    const baseR = payload.collideRadius * graphNodeRadiusFactor();
    // group → list of node positions
    const groupMembers = new Map<string, Array<{ x: number; y: number }>>();
    for (const node of payload.nodes) {
      const memberships = payload.vennMemberships.get(node.id);
      if (!memberships || memberships.length === 0) continue;
      const p = payload.positions.get(node.id);
      if (!p) continue;
      for (const g of memberships) {
        const arr = groupMembers.get(g) ?? [];
        arr.push(p);
        groupMembers.set(g, arr);
      }
    }
    // Draw bounding-circle hulls in group-id-determinstic hue.
    for (const [groupId, pts] of groupMembers) {
      if (pts.length === 0) continue;
      let cx = 0, cy = 0;
      for (const p of pts) { cx += p.x; cy += p.y; }
      cx /= pts.length;
      cy /= pts.length;
      let maxR = 0;
      for (const p of pts) {
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d > maxR) maxR = d;
      }
      const hullR = maxR + baseR + 18;
      const hue = vennHueForGroupId(groupId);
      // Fill with low alpha for blending(複数 hull が重なるとそこが濃く
      // 見える = Venn 図の交差領域表現)。
      ctx.fillStyle = `hsla(${hue}, 75%, 55%, 0.12)`;
      ctx.beginPath();
      ctx.arc(cx, cy, hullR, 0, Math.PI * 2);
      ctx.fill();
      // Outline at higher alpha to show set boundary.
      ctx.strokeStyle = `hsla(${hue}, 75%, 50%, 0.55)`;
      ctx.lineWidth = 1.5 / view.scale;
      ctx.stroke();
      // Group label at top of hull.
      ctx.fillStyle = `hsla(${hue}, 65%, 45%, 0.85)`;
      ctx.font = `600 ${11 / view.scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(groupId, cx, cy - hullR + 4 / view.scale);
    }
  }

  // Nodes.
  // PR-LLL (2026-05-06):relation 数に応じてサイズ拡大、archetype
  // emoji を中央に重畳描画(円は薄く残して selection / hover の
  // affordance を保持)。
  const baseR = payload.collideRadius * graphNodeRadiusFactor();
  // PR-Δ22 (2026-05-07、user 指摘「銀河的に空間所属を表現しろ」):
  // galaxy mode 時、folder depth を z 軸として透視投影。深い node ほど
  // 小さく / 暗く / 後方に描画される。perspective scale = 1/(1 + d*0.18)。
  // 描画順は深い順(後方)→ 浅い順(前方)で z-sort 効果。
  const galaxyOn = graphGalaxyMode() === 1;
  const drawOrder = galaxyOn
    ? [...payload.nodes].sort((a, b) => (b.depth ?? 0) - (a.depth ?? 0))
    : payload.nodes;
  for (const node of drawOrder) {
    const p = payload.positions.get(node.id);
    if (!p) continue;
    const depth = node.depth ?? 0;
    const persp = galaxyOn ? 1 / (1 + depth * 0.18) : 1;
    const alpha = galaxyOn ? Math.max(0.35, persp) : 1;
    const isSelected = node.id === payload.selectedLid;
    const isInRegion = payload.regionLids.includes(node.id);

    // PR-LLL: degree-scaled radius. degree 0 → 1.0x、degree 1 → 1.04x、
    // degree 10 → 1.4x、上限 1.5x で打ち止め。
    // PR-TTT (2026-05-07、修正指示7 #6):過剰スケールを抑制(0.05/1.8 → 0.04/1.5)
    // し、ノードサイズを label に対して相対的に小さく。
    const degree = node.degree ?? 0;
    const scale = Math.min(1.5, 1 + degree * 0.04);
    const r = baseR * scale * persp;

    // PR-Δ22:galaxy mode で alpha 適用(深い node を奥に配置)。
    ctx.globalAlpha = alpha;
    // PR-Δ26 (2026-05-07、user 指摘「Galaxy 期待外れ」):galaxy mode 時
    // 各 node に glow halo を radial gradient で描画。星のような輝き感。
    if (galaxyOn && node.archetype !== 'folder') {
      const haloR = baseR * 4 * persp;
      const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
      const haloHue = node.cssColor ?? archetypeFill(node.archetype, themeIsDark(theme.bg));
      halo.addColorStop(0, haloHue);
      halo.addColorStop(0.3, haloHue.replace(/[\d.]+\)$/, '0.4)') || 'rgba(180,180,255,0.4)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
      ctx.fill();
    }
    // PR-Δ24 (2026-05-07、user 訂正「フォルダはリレーションの結節点
    // として小さく描画」):folder archetype は **小さい diamond(◇)** で
    // 描画、entry node の半分以下のサイズ + label 省略。
    if (node.archetype === 'folder') {
      const jr = Math.max(5 / view.scale, r * 0.4);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - jr);
      ctx.lineTo(p.x + jr, p.y);
      ctx.lineTo(p.x, p.y + jr);
      ctx.lineTo(p.x - jr, p.y);
      ctx.closePath();
      ctx.fillStyle = theme.bgTag;
      ctx.fill();
      ctx.strokeStyle = isSelected || isInRegion ? theme.accent : theme.fgMuted;
      ctx.lineWidth = (isSelected || isInRegion ? 2.5 : 1) / view.scale;
      ctx.stroke();
      // junction の小 label(folder title)を下に出す。
      const labelText = truncate(node.label, 20);
      ctx.font = `400 ${10}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 2 / view.scale;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = theme.bg;
      ctx.strokeText(labelText, p.x, p.y + jr + 2);
      ctx.fillStyle = theme.fgMuted;
      ctx.fillText(labelText, p.x, p.y + jr + 2);
      ctx.globalAlpha = 1;
      continue;
    }
    // Circle (背景色、emoji 視認性のため薄め).
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = node.cssColor ?? archetypeFill(node.archetype, themeIsDark(theme.bg));
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
  // PR-Δ22:reset alpha after galaxy depth fading.
  ctx.globalAlpha = 1;

  // PR-Δ6 (2026-05-07、user 報告「時系列グラフに Git 的更新点表示」):
  // time-proximity mode で各 entry の revisions timestamps を小 dot として
  // 同じ Y 位置の X 軸上に描画、main node から細い線で繋ぐ。
  if (
    payload.timeAxis
    && payload.mode === 'time-proximity'
    && payload.nodeRevisions
    && payload.nodeRevisions.size > 0
  ) {
    const { minT, maxT } = payload.timeAxis;
    const span = Math.max(1, maxT - minT);
    const padX = 40;
    const usableW = payload.width - padX * 2;
    ctx.lineWidth = 0.8 / view.scale;
    ctx.strokeStyle = theme.fgMuted;
    ctx.fillStyle = theme.accent;
    for (const [lid, revs] of payload.nodeRevisions) {
      if (!revs || revs.length === 0) continue;
      const p = payload.positions.get(lid);
      if (!p) continue;
      // Connect main node (head, updated_at) to each revision dot
      // and to created_at marker (trunk root). Git-commit-graph 風。
      for (const t of revs) {
        if (!Number.isFinite(t)) continue;
        const xRatio = (t - minT) / span;
        const x = padX + xRatio * usableW;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(x, p.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, p.y, 3 / view.scale + 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // PR-Δ13 (2026-05-07):time-proximity 参照ライン。head node 間を結ぶ
  // relation を、kind 別の色で描画。drawn AFTER revision trails so
  // reference lines sit on top.
  if (
    payload.mode === 'time-proximity'
    && payload.nodeReferences
    && payload.nodeReferences.size > 0
  ) {
    ctx.lineWidth = 1.2 / view.scale;
    ctx.globalAlpha = 0.7;
    for (const [from, refs] of payload.nodeReferences) {
      const a = payload.positions.get(from);
      if (!a) continue;
      for (const ref of refs) {
        const b = payload.positions.get(ref.to);
        if (!b) continue;
        ctx.strokeStyle = relationColor(ref.kind, theme.graphEdge);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        // Arrow head at target (small triangle).
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 12) {
          const ux = dx / len, uy = dy / len;
          const ah = 6 / view.scale;
          const aw = 3 / view.scale;
          const tx = b.x - ux * 12;
          const ty = b.y - uy * 12;
          ctx.beginPath();
          ctx.moveTo(tx + ux * ah, ty + uy * ah);
          ctx.lineTo(tx - uy * aw, ty + ux * aw);
          ctx.lineTo(tx + uy * aw, ty - ux * aw);
          ctx.closePath();
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // PR-Δ31 (2026-05-07、user 指示「矩形選択じゃなく楕円選択のほうがいい」):
  // start→end の bounding rect を楕円(ellipse)に置換。drag 軌跡が斜めの
  // ときは扁平楕円になる。中心は中点、ラジアスは |end-start|/2。
  // happy-dom test 環境では ctx.ellipse が未実装のため、手動 path
  // (arc 64 セグメント)で描画する。
  if (view.rectStart && view.rectEnd) {
    const cx = (view.rectStart.ux + view.rectEnd.ux) / 2;
    const cy = (view.rectStart.uy + view.rectEnd.uy) / 2;
    const rx = Math.max(1, Math.abs(view.rectEnd.ux - view.rectStart.ux) / 2);
    const ry = Math.max(1, Math.abs(view.rectEnd.uy - view.rectStart.uy) / 2);
    const tracePath = (): void => {
      ctx.beginPath();
      const SEG = 64;
      for (let i = 0; i <= SEG; i++) {
        const t = (i / SEG) * Math.PI * 2;
        const px = cx + Math.cos(t) * rx;
        const py = cy + Math.sin(t) * ry;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      // closePath は happy-dom 未実装。lineTo で i=SEG が始点に戻るため不要。
    };
    ctx.fillStyle = theme.accent;
    ctx.globalAlpha = 0.1;
    tracePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5 / view.scale;
    ctx.setLineDash([4 / view.scale, 2 / view.scale]);
    tracePath();
    ctx.stroke();
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
    // PR-Δ33 (2026-05-07、user 指示「ノードを掴んで引っ張ると接続ノードが
    // ぶら下がる」):pressDownLid が set されている状態で 5px 以上動いたら
    // drag mode に engage。drag 中は dragLid / 1-hop / 2-hop neighbor の
    // 元位置を保存し、cursor delta を decay 付きで適用。
    if (pressDownLid && mouseDownPos) {
      const movedDist = Math.hypot(me.clientX - mouseDownPos.x, me.clientY - mouseDownPos.y);
      const payload = payloads.get(canvas);
      // Phase γ-B2:edit mode では node-drag ではなく wire drag(prototype
      // line を引いて relation 作成へ)。drag-end の relation 確定は後続 PR。
      if (getGraphEditMode() === 'edit') {
        if (!view.wireSource && movedDist > 5) {
          view.wireSource = pressDownLid;
        }
        if (view.wireSource) {
          const lg = clientToLogical(canvas, me.clientX, me.clientY);
          view.wireTarget = logicalToUser(canvas, lg.x, lg.y);
          drawGraphCanvas(canvas);
          return;
        }
      }
      if (!view.dragLid && movedDist > 5 && payload) {
        view.dragLid = pressDownLid;
        view.dragMouseStartClient = { x: mouseDownPos.x, y: mouseDownPos.y };
        const orig = new Map<string, { x: number; y: number }>();
        const factor = new Map<string, number>();
        const seedPos = payload.positions.get(pressDownLid);
        if (seedPos) {
          orig.set(pressDownLid, { x: seedPos.x, y: seedPos.y });
          factor.set(pressDownLid, 1);
        }
        const layer1: string[] = [];
        for (const link of payload.links) {
          let other: string | null = null;
          if (link.from === pressDownLid) other = link.to;
          else if (link.to === pressDownLid) other = link.from;
          if (!other || orig.has(other)) continue;
          const p = payload.positions.get(other);
          if (!p) continue;
          orig.set(other, { x: p.x, y: p.y });
          factor.set(other, 0.55);
          layer1.push(other);
        }
        for (const l1 of layer1) {
          for (const link of payload.links) {
            let other: string | null = null;
            if (link.from === l1) other = link.to;
            else if (link.to === l1) other = link.from;
            if (!other || orig.has(other)) continue;
            const p = payload.positions.get(other);
            if (!p) continue;
            orig.set(other, { x: p.x, y: p.y });
            factor.set(other, 0.25);
          }
        }
        view.dragOrigUser = orig;
        view.dragNeighborFactor = factor;
        // drag に切り替わったので pan は中止。
        panStart = null;
      }
      if (view.dragLid && view.dragOrigUser && view.dragNeighborFactor && view.dragMouseStartClient && payload) {
        const u0 = (() => {
          const lg = clientToLogical(canvas, view.dragMouseStartClient.x, view.dragMouseStartClient.y);
          return logicalToUser(canvas, lg.x, lg.y);
        })();
        const u1 = (() => {
          const lg = clientToLogical(canvas, me.clientX, me.clientY);
          return logicalToUser(canvas, lg.x, lg.y);
        })();
        const dx = u1.x - u0.x;
        const dy = u1.y - u0.y;
        const positions = payload.positions as Map<string, { x: number; y: number }>;
        for (const [lid, orig] of view.dragOrigUser) {
          const f = view.dragNeighborFactor.get(lid) ?? 0;
          positions.set(lid, { x: orig.x + dx * f, y: orig.y + dy * f });
        }
        drawGraphCanvas(canvas);
        return;
      }
    }
    if (!panStart) return;
    // PR-Δ1 (2026-05-07):pan delta も uniform scale で変換、aspect
    // 歪みを伝播させない。
    const tr = getCanvasRenderTransform(canvas);
    const inv = tr ? 1 / tr.scale : 1;
    view.tx = panStart.tx + (me.clientX - panStart.clientX) * inv;
    view.ty = panStart.ty + (me.clientY - panStart.clientY) * inv;
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
          // PR-Δ32 (2026-05-07):Ctrl/Meta/Shift 修飾子で multi-select を
          // toggle するため、modifier kind を detail に同梱して action-
          // binder 側で分岐させる。
          const modifier = me.ctrlKey
            ? 'ctrl'
            : me.metaKey
            ? 'meta'
            : me.shiftKey
            ? 'shift'
            : 'none';
          const evt = new CustomEvent('pkc-graph-node-click', {
            detail: { lid: pressDownLid, modifier },
            bubbles: true,
          });
          canvas.dispatchEvent(evt);
        }
      }
    }
    panStart = null;
    pressDownLid = null;
    mouseDownPos = null;
    // PR-Δ33: drag 終了で session 状態を破棄(positions は更新済みのまま
    // 次の re-render まで保持される)。
    if (view.dragLid) {
      view.dragLid = null;
      view.dragOrigUser = undefined;
      view.dragNeighborFactor = undefined;
      view.dragMouseStartClient = null;
    }
    // Phase γ-B2-3:wire drag 終了。drop 点に別 node があれば wire-drop
    // event を発行(action-binder が kind selector popup → CREATE_RELATION)。
    if (view.wireSource) {
      const dropTarget = hitTestNodeAt(canvas, me.clientX, me.clientY);
      if (dropTarget && dropTarget !== view.wireSource) {
        canvas.dispatchEvent(
          new CustomEvent('pkc-graph-wire-drop', {
            detail: {
              source: view.wireSource,
              target: dropTarget,
              clientX: me.clientX,
              clientY: me.clientY,
            },
            bubbles: true,
          }),
        );
      }
      view.wireSource = null;
      view.wireTarget = null;
      drawGraphCanvas(canvas);
    }
  }, { signal });

  // PR-Δ34 (2026-05-07、user 指示「左クリック=graph 操作、右クリック=context
  // menu」):右クリックで node hit test → `pkc-graph-node-context` event を
  // 発行。action-binder 側で renderContextMenu({showOpen: true}) を表示する。
  // ノード以外の場所(空白)では event を発行せず、native contextmenu を
  // 抑止するだけ(graph 上での意図しない browser menu は誤操作扱い)。
  canvas.addEventListener('contextmenu', (ev) => {
    const me = ev as MouseEvent;
    me.preventDefault();
    const lid = hitTestNodeAt(canvas, me.clientX, me.clientY);
    if (!lid) return;
    const evt = new CustomEvent('pkc-graph-node-context', {
      detail: { lid, x: me.clientX, y: me.clientY },
      bubbles: true,
    });
    canvas.dispatchEvent(evt);
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
        // PR-Δ1 (2026-05-07):touch pan も uniform scale で変換。
        const tr = getCanvasRenderTransform(canvas);
        const inv = tr ? 1 / tr.scale : 1;
        view.tx = panStart.tx + (t.clientX - panStart.clientX) * inv;
        view.ty = panStart.ty + (t.clientY - panStart.clientY) * inv;
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
  // PR-Δ31 (2026-05-07):矩形 → 楕円 hit test。中心 (cx,cy) を中点、半径
  // (rx,ry) を |end-start|/2 とし、楕円式 ((x-cx)/rx)² + ((y-cy)/ry)² ≤ 1
  // を満たす node を含める。
  const u0 = logicalToUser(canvas, view.rectStart.ux, view.rectStart.uy);
  const u1 = logicalToUser(canvas, view.rectEnd.ux, view.rectEnd.uy);
  const cx = (u0.x + u1.x) / 2;
  const cy = (u0.y + u1.y) / 2;
  const rx = Math.abs(u1.x - u0.x) / 2;
  const ry = Math.abs(u1.y - u0.y) / 2;
  const lids: string[] = [];
  if (rx >= 4 && ry >= 4) {
    for (const node of payload.nodes) {
      const p = payload.positions.get(node.id);
      if (!p) continue;
      const dx = (p.x - cx) / rx;
      const dy = (p.y - cy) / ry;
      if (dx * dx + dy * dy <= 1) lids.push(node.id);
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

