/**
 * Image preview viewer (領域 10-6 ζ'' Phase 4 follow-up).
 *
 * User direction(2026-05-05、二段):
 * > ファイラーから画像を開いた時に限り、PiP かフォールバックで同一
 * > ウィンドウ内プレビューを開いて。
 * > → 訂正:メインをモーダルにしたくない。これは PKC2 哲学違反だった。
 *   フォールバックは別ウィンドウで開くにして。
 *
 * Two delivery paths:
 *   1. Document Picture-in-Picture (Chrome / Edge 116+) — floating
 *      always-on-top window.
 *   2. Fallback `window.open(...)` — separate browser window.
 * **No in-main-window modal**: the main shell stays clean.
 *
 * Controls:
 *   - 「等倍 (1:1)」button — sets zoom = 100% (no scaling)
 *   - 「画面内フィット」button — sets zoom = fit (image scaled to
 *     viewport contain)
 *   - プリセット pull-down — 25% / 50% / 75% / 100% / 150% / 200% /
 *     400% absolute zoom
 *   - 「Copy link」button — copies the entry permalink to clipboard
 *     (uses document.execCommand fallback; no clipboard permissions
 *     required)
 *
 * Pinch-zoom / pan (2026-05-06 G7):
 *   - 2-finger pinch on the stage → zoom centered on midpoint
 *   - 1-finger drag (only when zoomed > fit) → pan
 *   - Double-tap → toggle 等倍(100%) ↔ 画面内フィット
 *   - Ctrl+wheel on PC → zoom centered on cursor
 *   - Bootstrap window gets a viewport meta with user-scalable=yes so
 *     iOS Safari fallback (window.open) also exposes native page-level
 *     pinch when our handlers don't catch (defence in depth).
 *
 * Pure DOM helpers — no dispatcher coupling. action-binder owns
 * event wiring (click on filer image attachment → openImagePreview).
 */

export interface ImagePreviewSource {
  /** Data URL or remote URL of the image. */
  src: string;
  /** Display alt + label for the image. */
  label: string;
  /** Optional pkc:// or https:// permalink for the Copy link button. */
  permalink?: string;
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200, 400];

/**
 * Track the currently-open preview window so the next openImagePreview
 * call can refocus / replace instead of spawning a duplicate.
 */
let activePreviewWindow: Window | null = null;

/**
 * Open the image preview in either Document PiP (preferred) or
 * `window.open(...)` fallback. The main shell never receives a modal
 * overlay (PKC2 単一 HTML 哲学維持)。
 */
export async function openImagePreview(source: ImagePreviewSource): Promise<void> {
  // Reuse an existing preview window when one is still open.
  if (activePreviewWindow && !activePreviewWindow.closed) {
    activePreviewWindow.focus();
    mountImagePreviewBody(
      activePreviewWindow.document.getElementById('pkc-image-preview-root') as HTMLElement,
      source,
      activePreviewWindow,
    );
    return;
  }

  const dpip = (window as unknown as {
    documentPictureInPicture?: { requestWindow(opts?: { width?: number; height?: number }): Promise<Window> };
  }).documentPictureInPicture;

  if (dpip) {
    try {
      const pipWin = await dpip.requestWindow({ width: 720, height: 540 });
      bootstrapPreviewWindow(pipWin, source);
      activePreviewWindow = pipWin;
      pipWin.addEventListener('pagehide', () => { activePreviewWindow = null; });
      return;
    } catch {
      // fall through to window.open
    }
  }

  const newWin = window.open(
    'about:blank',
    `pkc2-image-preview-${Date.now()}`,
    'width=720,height=540,resizable,scrollbars',
  );
  if (!newWin) {
    // Pop-up blocked — surface a minimal native fallback so the user
    // at least gets the image without violating the no-modal rule.
    window.open(source.src, '_blank', 'noopener');
    return;
  }
  bootstrapPreviewWindow(newWin, source);
  activePreviewWindow = newWin;
  newWin.addEventListener('pagehide', () => { activePreviewWindow = null; });
}

export function closeImagePreview(): void {
  if (activePreviewWindow && !activePreviewWindow.closed) {
    activePreviewWindow.close();
  }
  activePreviewWindow = null;
}

function bootstrapPreviewWindow(win: Window, source: ImagePreviewSource): void {
  const doc = win.document;
  doc.title = `Preview — ${source.label}`;
  const styleClones = collectStylesheetClones();
  doc.head.replaceChildren();

  // G7 (2026-05-06):iOS Safari の fallback (window.open) で page-level
  // pinch を許可し、独自 touch handler が拾わないケースでも拡大縮小
  // が成立するよう viewport meta を入れる。
  const meta = doc.createElement('meta');
  meta.setAttribute('name', 'viewport');
  meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=10, user-scalable=yes');
  doc.head.appendChild(meta);

  for (const node of styleClones) doc.head.appendChild(node);

  const root = doc.createElement('div');
  root.id = 'pkc-image-preview-root';
  root.className = 'pkc-image-preview-host';
  doc.body.replaceChildren();
  doc.body.appendChild(root);

  // Toolbar lives inside the preview window itself; the host page
  // gets no modal / overlay.
  const toolbar = doc.createElement('div');
  toolbar.className = 'pkc-image-preview-toolbar';
  toolbar.setAttribute('data-pkc-region', 'image-preview-toolbar');

  const mkBtn = (label: string, handler: () => void): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'pkc-btn-small';
    b.textContent = label;
    b.addEventListener('click', handler);
    return b;
  };

  toolbar.appendChild(mkBtn('画面内フィット', () => applyImageZoomIn(win, 'fit')));
  toolbar.appendChild(mkBtn('等倍 (1:1)', () => applyImageZoomIn(win, 100)));

  const select = doc.createElement('select');
  select.className = 'pkc-image-preview-zoom-select';
  for (const z of ZOOM_PRESETS) {
    const opt = doc.createElement('option');
    opt.value = String(z);
    opt.textContent = `${z}%`;
    if (z === 100) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => {
    const v = Number(select.value);
    if (Number.isFinite(v)) applyImageZoomIn(win, v);
  });
  toolbar.appendChild(select);

  toolbar.appendChild(mkBtn('🔗 Copy link', () => copyLinkInWindow(win, source.permalink ?? '')));

  toolbar.appendChild(mkBtn('✕', () => win.close()));

  root.appendChild(toolbar);

  const stage = doc.createElement('div');
  stage.className = 'pkc-image-preview-stage';
  stage.setAttribute('data-pkc-region', 'image-preview-stage');
  root.appendChild(stage);

  mountImagePreviewBody(stage, source, win);
}

/**
 * Per-image gesture state. Persists across touch/wheel events while
 * the same wrap is mounted; reset on remount.
 *
 *   - mode='fit'      : CSS contain layout, no transform applied. tx/ty
 *                       ignored. Zoom select shows nothing meaningful.
 *   - mode='numeric'  : transform = translate(tx, ty) scale(scale).
 *                       Origin is top-left so tx/ty math is direct.
 *
 * Stored on the wrap element via WeakMap so we don't pollute DOM
 * dataset (touch handlers fire many times — toString churn matters).
 */
interface ZoomState {
  mode: 'fit' | 'numeric';
  scale: number;
  tx: number;
  ty: number;
}
const zoomStates: WeakMap<HTMLElement, ZoomState> = new WeakMap();
const MIN_SCALE = 0.1;
const MAX_SCALE = 16;

/**
 * Track gesture handler AbortControllers per stage so re-mounting an
 * image into the same stage (e.g. clicking another image while the
 * window is still open) doesn't accumulate touch listeners.
 */
const gestureControllers: WeakMap<HTMLElement, AbortController> = new WeakMap();

function mountImagePreviewBody(host: HTMLElement, source: ImagePreviewSource, win?: Window): void {
  const doc = host.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'pkc-image-preview-wrap';
  wrap.setAttribute('data-pkc-image-zoom', 'fit');

  const img = doc.createElement('img');
  img.src = source.src;
  img.alt = source.label;
  img.className = 'pkc-image-preview-img pkc-image-preview-img-fit';
  // Initial mode = fit (CSS contain). transform applied only when
  // mode switches to 'numeric' via toolbar / pinch / wheel / dblclick.
  img.style.transformOrigin = '0 0';
  img.setAttribute('data-pkc-image-zoom-target', 'true');
  // 描画 hint:transform を毎フレーム動かすので will-change で promote。
  img.style.willChange = 'transform';
  wrap.appendChild(img);

  // Replace any pre-existing wrap on re-open into the same window.
  for (const old of Array.from(host.querySelectorAll('.pkc-image-preview-wrap'))) old.remove();
  host.appendChild(wrap);

  zoomStates.set(wrap, { mode: 'fit', scale: 1, tx: 0, ty: 0 });
  bindGestures(host, wrap, img);

  if (win && source.permalink) {
    win.document.body.setAttribute('data-pkc-permalink', source.permalink);
  }
}

/**
 * Apply zoom inside a specific window — preview window has its own
 * document. The host page never has this img, so we keep the API
 * scoped to the preview surface.
 *
 * Numeric zoom switches mode from fit to numeric and centers the
 * image on the stage (tx/ty so the image midpoint stays put). 'fit'
 * resets state and lets CSS take over.
 */
function applyImageZoomIn(win: Window, zoom: number | 'fit'): void {
  const img = win.document.querySelector<HTMLImageElement>('[data-pkc-image-zoom-target="true"]');
  if (!img) return;
  const wrap = img.parentElement as HTMLElement | null;
  if (!wrap) return;
  const state = zoomStates.get(wrap);
  if (!state) return;
  if (zoom === 'fit') {
    state.mode = 'fit';
    state.scale = 1;
    state.tx = 0;
    state.ty = 0;
    img.style.transform = '';
    img.classList.add('pkc-image-preview-img-fit');
    wrap.setAttribute('data-pkc-image-zoom', 'fit');
  } else {
    const stage = wrap.parentElement as HTMLElement | null;
    centerNumericZoom(stage, wrap, img, zoom / 100);
  }
}

/**
 * Switch wrap to numeric mode at the given scale, centering the image
 * within the stage so the visual midpoint doesn't jump. Used by toolbar
 * preset selection + 等倍 button + double-tap.
 */
function centerNumericZoom(
  stage: HTMLElement | null,
  wrap: HTMLElement,
  img: HTMLImageElement,
  scale: number,
): void {
  const state = zoomStates.get(wrap);
  if (!state) return;
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  state.mode = 'numeric';
  state.scale = clamped;
  // Center on the stage. natural{Width,Height} can be 0 if the image
  // hasn't decoded yet; in that case we fall back to translate(0,0)
  // and the user's first pan corrects it.
  const stageW = stage?.clientWidth ?? 0;
  const stageH = stage?.clientHeight ?? 0;
  const naturalW = img.naturalWidth || img.width || stageW;
  const naturalH = img.naturalHeight || img.height || stageH;
  state.tx = (stageW - naturalW * clamped) / 2;
  state.ty = (stageH - naturalH * clamped) / 2;
  img.classList.remove('pkc-image-preview-img-fit');
  applyTransform(img, state);
  wrap.setAttribute('data-pkc-image-zoom', String(Math.round(clamped * 100)));
}

function applyTransform(img: HTMLImageElement, state: ZoomState): void {
  if (state.mode === 'fit') {
    img.style.transform = '';
    return;
  }
  img.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
}

/**
 * Wire pinch-zoom + 1-finger pan + double-tap + wheel.
 *
 * Touch model:
 *   - 1 finger     → pan (only when mode='numeric')
 *   - 2 fingers    → pinch zoom around midpoint。touchstart で初期距離 +
 *                    現在 scale を保存、touchmove で比率 → scale を更新、
 *                    midpoint で center を保ちつつ tx/ty 補正。
 *   - 双タップ     → fit ↔ 100% トグル
 *
 * Wheel (PC): Ctrl+wheel = zoom around cursor。生 wheel は browser native の
 * scroll に任せるが、preview window は overflow:hidden なので実質 no-op。
 */
function bindGestures(stage: HTMLElement, wrap: HTMLElement, img: HTMLImageElement): void {
  const win = stage.ownerDocument.defaultView!;
  // Detach any previously-bound handlers on this stage so a re-mount
  // doesn't end up with stacked listeners that fire against the old wrap.
  const prev = gestureControllers.get(stage);
  if (prev) prev.abort();
  const controller = new AbortController();
  const signal = controller.signal;
  gestureControllers.set(stage, controller);

  let pinchStart: { dist: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null = null;
  let panStart: { x: number; y: number; tx: number; ty: number } | null = null;
  let lastTapTime = 0;

  const stageRect = (): DOMRect => stage.getBoundingClientRect();

  stage.addEventListener('touchstart', (ev) => {
    const touches = (ev as TouchEvent).touches;
    const state = zoomStates.get(wrap);
    if (!state) return;
    if (touches.length === 2) {
      // Pinch begin。midpoint は stage 座標系に変換して保存。
      const r = stageRect();
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const midX = (t0.clientX + t1.clientX) / 2 - r.left;
      const midY = (t0.clientY + t1.clientY) / 2 - r.top;
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      // fit から始まる pinch は state.scale=1 として扱う(等倍基準)。
      const baseScale = state.mode === 'numeric' ? state.scale : 1;
      const baseTx = state.mode === 'numeric' ? state.tx : (r.width - (img.naturalWidth || r.width)) / 2;
      const baseTy = state.mode === 'numeric' ? state.ty : (r.height - (img.naturalHeight || r.height)) / 2;
      pinchStart = { dist, scale: baseScale, midX, midY, tx: baseTx, ty: baseTy };
      panStart = null;
      ev.preventDefault();
    } else if (touches.length === 1) {
      // 1-finger pan は numeric mode かつ拡大中(scale>fit)のみ意味あり。
      // fit のときは pan 無効(double-tap で開始する)。
      if (state.mode !== 'numeric') return;
      const t = touches[0]!;
      panStart = { x: t.clientX, y: t.clientY, tx: state.tx, ty: state.ty };
      pinchStart = null;
    }
  }, { passive: false, signal });

  stage.addEventListener('touchmove', (ev) => {
    const touches = (ev as TouchEvent).touches;
    const state = zoomStates.get(wrap);
    if (!state) return;
    if (touches.length === 2 && pinchStart) {
      const t0 = touches[0]!;
      const t1 = touches[1]!;
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / pinchStart.dist;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStart.scale * ratio));
      // midpoint を画面座標系で固定:変化率分だけ tx/ty を補正。
      // image coord at midpoint before scale = (midX - tx) / oldScale
      // ⇒ 新 tx = midX - imageCoord * newScale
      const imgX = (pinchStart.midX - pinchStart.tx) / pinchStart.scale;
      const imgY = (pinchStart.midY - pinchStart.ty) / pinchStart.scale;
      state.mode = 'numeric';
      state.scale = newScale;
      state.tx = pinchStart.midX - imgX * newScale;
      state.ty = pinchStart.midY - imgY * newScale;
      img.classList.remove('pkc-image-preview-img-fit');
      applyTransform(img, state);
      wrap.setAttribute('data-pkc-image-zoom', String(Math.round(newScale * 100)));
      ev.preventDefault();
    } else if (touches.length === 1 && panStart) {
      const t = touches[0]!;
      state.tx = panStart.tx + (t.clientX - panStart.x);
      state.ty = panStart.ty + (t.clientY - panStart.y);
      applyTransform(img, state);
      ev.preventDefault();
    }
  }, { passive: false, signal });

  stage.addEventListener('touchend', (ev) => {
    const touches = (ev as TouchEvent).touches;
    if (touches.length < 2) pinchStart = null;
    if (touches.length === 0) panStart = null;
    // Double-tap detection (single finger, no movement)。
    if (touches.length === 0 && (ev as TouchEvent).changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTapTime < 300) {
        const state = zoomStates.get(wrap);
        if (state) {
          if (state.mode === 'fit') {
            applyImageZoomIn(win, 100);
          } else {
            applyImageZoomIn(win, 'fit');
          }
        }
        lastTapTime = 0;
        ev.preventDefault();
      } else {
        lastTapTime = now;
      }
    }
  }, { passive: false, signal });

  // Wheel zoom — PC fallback。Ctrl+wheel = zoom centered on cursor。
  // 単純 wheel(Ctrl 無し)は browser native scroll に任せる(stage は
  // overflow:hidden なので実質 no-op)。
  stage.addEventListener('wheel', (ev) => {
    const we = ev as WheelEvent;
    if (!we.ctrlKey && !we.metaKey) return;
    we.preventDefault();
    const state = zoomStates.get(wrap);
    if (!state) return;
    const r = stageRect();
    const cx = we.clientX - r.left;
    const cy = we.clientY - r.top;
    const baseScale = state.mode === 'numeric' ? state.scale : 1;
    const baseTx = state.mode === 'numeric' ? state.tx : (r.width - (img.naturalWidth || r.width)) / 2;
    const baseTy = state.mode === 'numeric' ? state.ty : (r.height - (img.naturalHeight || r.height)) / 2;
    const factor = Math.exp(-we.deltaY * 0.0015);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, baseScale * factor));
    const imgX = (cx - baseTx) / baseScale;
    const imgY = (cy - baseTy) / baseScale;
    state.mode = 'numeric';
    state.scale = newScale;
    state.tx = cx - imgX * newScale;
    state.ty = cy - imgY * newScale;
    img.classList.remove('pkc-image-preview-img-fit');
    applyTransform(img, state);
    wrap.setAttribute('data-pkc-image-zoom', String(Math.round(newScale * 100)));
  }, { passive: false, signal });
}

function copyLinkInWindow(win: Window, link: string): void {
  if (!link) return;
  try {
    if (win.navigator.clipboard?.writeText) {
      void win.navigator.clipboard.writeText(link);
      return;
    }
    const ta = win.document.createElement('textarea');
    ta.value = link;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    win.document.body.appendChild(ta);
    ta.select();
    win.document.execCommand('copy');
    ta.remove();
  } catch {
    // ignore — preview is best-effort.
  }
}

/** Public API for action-binder when no preview window is open. */
export function applyImageZoom(zoom: number | 'fit'): void {
  if (!activePreviewWindow || activePreviewWindow.closed) return;
  applyImageZoomIn(activePreviewWindow, zoom);
}

/** Public API for action-binder when no preview window is open. */
export function readImagePreviewPermalink(): string | null {
  if (!activePreviewWindow || activePreviewWindow.closed) return null;
  return activePreviewWindow.document.body.getAttribute('data-pkc-permalink');
}

/**
 * Test-only export — wires gesture handlers + mounts img into a stage
 * directly, without opening a new window. Lets vitest happy-dom exercise
 * the pinch / pan / dblclick path without needing a popup.
 *
 * Production code should keep using openImagePreview which manages the
 * window + toolbar surrounding this body.
 */
export function __mountImagePreviewBodyForTest(host: HTMLElement, source: ImagePreviewSource): void {
  mountImagePreviewBody(host, source);
}

/** No-op placeholder kept for renderer.ts compat — modal removed. */
export function renderImagePreviewModal(): HTMLElement {
  const placeholder = document.createElement('div');
  placeholder.hidden = true;
  placeholder.setAttribute('data-pkc-region', 'image-preview-noop');
  return placeholder;
}

/**
 * Stylesheet cloning shared with media-viewer's PiP path.
 */
function collectStylesheetClones(): Node[] {
  const out: Node[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      let css = '';
      for (let i = 0; i < rules.length; i++) css += `${rules[i]!.cssText}\n`;
      const style = document.createElement('style');
      style.textContent = css;
      out.push(style);
    } catch {
      // cross-origin — skip silently.
    }
  }
  return out;
}
