/**
 * Graph view zoom + pan (領域 10-6 ζ'' PR-C / G1).
 *
 * User direction(2026-05-06):
 * > Graph view が拡大縮小できない。Galaxy のような操作感が欲しい。
 *
 * Approach:
 *   - Wrap nodes/edges in `<g class="pkc-graph-zoom-layer">`
 *   - Apply `transform="translate(tx, ty) scale(s)"` on this layer only
 *     (force-layout output is reused as-is; no re-render on zoom)
 *   - Gesture handlers (wheel / drag / touch pinch) mutate the
 *     transform via setAttribute directly — never round-trip through
 *     dispatcher (would re-run force layout = jank)
 *   - Reset button(in toolbar)resets transform + state
 *
 * State per-svg via WeakMap so a graph re-render(mode change etc.)
 * gets a fresh layer transform without leaking. Handlers themselves
 * are bound once per svg via AbortController to survive re-renders
 * in-place — but full re-render of the toolbar replaces svg, so the
 * WeakMap entry will dangle and be GC'd along with the old svg.
 *
 * No dispatcher coupling: zoom is transient view state, recomputed
 * only when the user gestures. The SVG is the source of truth for the
 * current transform via the layer's `transform` attribute.
 */

interface GraphZoomState {
  scale: number;
  tx: number;
  ty: number;
}

const zoomStates: WeakMap<SVGSVGElement, GraphZoomState> = new WeakMap();
const gestureControllers: WeakMap<SVGSVGElement, AbortController> = new WeakMap();

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

const ZOOM_LAYER_CLASS = 'pkc-graph-zoom-layer';

/**
 * Find (or warn-and-skip) the zoom layer inside an svg.
 */
function getZoomLayer(svg: SVGSVGElement): SVGGElement | null {
  return svg.querySelector(`.${ZOOM_LAYER_CLASS}`);
}

function applyZoom(svg: SVGSVGElement, state: GraphZoomState): void {
  const layer = getZoomLayer(svg);
  if (!layer) return;
  layer.setAttribute(
    'transform',
    `translate(${state.tx}, ${state.ty}) scale(${state.scale})`,
  );
  // Surface to data attr so parity tests can read the resolved state
  // without re-parsing the transform string.
  svg.setAttribute('data-pkc-graph-zoom-scale', String(state.scale));
  svg.setAttribute('data-pkc-graph-zoom-tx', String(state.tx));
  svg.setAttribute('data-pkc-graph-zoom-ty', String(state.ty));
}

function getOrInit(svg: SVGSVGElement): GraphZoomState {
  let s = zoomStates.get(svg);
  if (!s) {
    s = { scale: 1, tx: 0, ty: 0 };
    zoomStates.set(svg, s);
    applyZoom(svg, s);
  }
  return s;
}

/**
 * Convert a client-coordinate point into the svg's *user* coord system
 * (the coord system of the zoom-layer's parent — i.e. unscaled svg
 * viewBox space). Used as the focal point for wheel zoom centered on
 * the cursor and pinch zoom centered on midpoint.
 */
function clientToSvgUserPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) {
    const r = svg.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }
  const inv = ctm.inverse();
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(inv);
  return { x: local.x, y: local.y };
}

/**
 * Reset the zoom + pan to identity. Called by the reset toolbar button.
 */
export function resetGraphZoom(svg: SVGSVGElement): void {
  const state = { scale: 1, tx: 0, ty: 0 };
  zoomStates.set(svg, state);
  applyZoom(svg, state);
}

/**
 * Test-only — read the current zoom state. Production callers should
 * read the data attributes on the svg if they need to inspect.
 */
export function __getGraphZoomStateForTest(svg: SVGSVGElement): GraphZoomState | undefined {
  return zoomStates.get(svg);
}

/**
 * Wire wheel / drag / touch pinch handlers on an svg. Idempotent per
 * svg — re-binding aborts the previous controller. Re-rendered svgs
 * (different DOM node) get a fresh binding because the WeakMap key
 * is the svg node itself.
 */
export function installGraphZoomGestures(svg: SVGSVGElement): void {
  const prev = gestureControllers.get(svg);
  if (prev) prev.abort();
  const controller = new AbortController();
  const signal = controller.signal;
  gestureControllers.set(svg, controller);

  // Initialize zoom layer + state.
  getOrInit(svg);

  let panStart: { clientX: number; clientY: number; tx: number; ty: number } | null = null;
  let pinchStart: {
    dist: number; scale: number;
    midX: number; midY: number;
    layerMidX: number; layerMidY: number;
  } | null = null;

  // ── Wheel zoom (cursor-centered) ──
  svg.addEventListener('wheel', (ev) => {
    const we = ev as WheelEvent;
    we.preventDefault();
    const state = zoomStates.get(svg);
    if (!state) return;
    const focal = clientToSvgUserPoint(svg, we.clientX, we.clientY);
    // imageInLayer = (focal - tx) / scale; after scale change we want
    // tx' = focal - imageInLayer * newScale so the focal point stays put.
    const imageX = (focal.x - state.tx) / state.scale;
    const imageY = (focal.y - state.ty) / state.scale;
    const factor = Math.exp(-we.deltaY * 0.0015);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor));
    state.scale = newScale;
    state.tx = focal.x - imageX * newScale;
    state.ty = focal.y - imageY * newScale;
    applyZoom(svg, state);
  }, { passive: false, signal });

  // ── Mouse drag pan (background only — drag on a node still selects) ──
  svg.addEventListener('mousedown', (ev) => {
    const me = ev as MouseEvent;
    if (me.button !== 0) return;
    const target = me.target as Element | null;
    // Skip when starting a drag on a node — the action-binder owns
    // that click and we don't want to swallow selection.
    if (target?.closest('.pkc-filer-graph-node')) return;
    const state = zoomStates.get(svg);
    if (!state) return;
    panStart = { clientX: me.clientX, clientY: me.clientY, tx: state.tx, ty: state.ty };
    me.preventDefault();
  }, { signal });

  // mousemove / mouseup are listened on window so dragging out of svg
  // still updates pan continuously and releases cleanly.
  const win = svg.ownerDocument.defaultView!;
  win.addEventListener('mousemove', (ev) => {
    if (!panStart) return;
    const me = ev as MouseEvent;
    const state = zoomStates.get(svg);
    if (!state) return;
    // ScreenCTM scaling: the svg uses preserveAspectRatio with viewBox
    // 0 0 width height, scaled to the rendered svg bounds. Convert
    // pixel delta → user-space delta via the CTM ratio.
    const r = svg.getBoundingClientRect();
    const sx = r.width === 0 ? 1 : Number(svg.getAttribute('viewBox')?.split(/\s+/)[2] ?? r.width) / r.width;
    const sy = r.height === 0 ? 1 : Number(svg.getAttribute('viewBox')?.split(/\s+/)[3] ?? r.height) / r.height;
    state.tx = panStart.tx + (me.clientX - panStart.clientX) * sx;
    state.ty = panStart.ty + (me.clientY - panStart.clientY) * sy;
    applyZoom(svg, state);
  }, { signal });

  win.addEventListener('mouseup', () => {
    panStart = null;
  }, { signal });

  // ── Touch pinch + pan ──
  svg.addEventListener('touchstart', (ev) => {
    const te = ev as TouchEvent;
    const touches = te.touches;
    const state = zoomStates.get(svg);
    if (!state) return;
    if (touches.length === 2) {
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const midClient = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const focal = clientToSvgUserPoint(svg, midClient.x, midClient.y);
      pinchStart = {
        dist,
        scale: state.scale,
        midX: midClient.x,
        midY: midClient.y,
        layerMidX: focal.x,
        layerMidY: focal.y,
      };
      panStart = null;
      te.preventDefault();
    } else if (touches.length === 1) {
      const target = te.target as Element | null;
      if (target?.closest('.pkc-filer-graph-node')) return;
      const t = touches[0]!;
      panStart = { clientX: t.clientX, clientY: t.clientY, tx: state.tx, ty: state.ty };
      pinchStart = null;
    }
  }, { passive: false, signal });

  svg.addEventListener('touchmove', (ev) => {
    const te = ev as TouchEvent;
    const touches = te.touches;
    const state = zoomStates.get(svg);
    if (!state) return;
    if (touches.length === 2 && pinchStart) {
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / pinchStart.dist;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.scale * ratio));
      // Recompute focal in svg user-space from current screen midpoint
      // so pinch *and* simultaneous drag both feel natural.
      const midClient = { x: (t0.clientX + t1.clientX) / 2, y: (t0.clientY + t1.clientY) / 2 };
      const focalNow = clientToSvgUserPoint(svg, midClient.x, midClient.y);
      state.scale = newScale;
      state.tx = focalNow.x - pinchStart.layerMidX * newScale;
      state.ty = focalNow.y - pinchStart.layerMidY * newScale;
      applyZoom(svg, state);
      te.preventDefault();
    } else if (touches.length === 1 && panStart) {
      const t = touches[0]!;
      const r = svg.getBoundingClientRect();
      const sx = r.width === 0 ? 1 : Number(svg.getAttribute('viewBox')?.split(/\s+/)[2] ?? r.width) / r.width;
      const sy = r.height === 0 ? 1 : Number(svg.getAttribute('viewBox')?.split(/\s+/)[3] ?? r.height) / r.height;
      state.tx = panStart.tx + (t.clientX - panStart.clientX) * sx;
      state.ty = panStart.ty + (t.clientY - panStart.clientY) * sy;
      applyZoom(svg, state);
      te.preventDefault();
    }
  }, { passive: false, signal });

  svg.addEventListener('touchend', (ev) => {
    const te = ev as TouchEvent;
    if (te.touches.length < 2) pinchStart = null;
    if (te.touches.length === 0) panStart = null;
  }, { signal });
}
