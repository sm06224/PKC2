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

function mountImagePreviewBody(host: HTMLElement, source: ImagePreviewSource, win?: Window): void {
  const doc = host.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'pkc-image-preview-wrap';
  wrap.setAttribute('data-pkc-image-zoom', '100');

  const img = doc.createElement('img');
  img.src = source.src;
  img.alt = source.label;
  img.className = 'pkc-image-preview-img';
  img.style.transform = 'scale(1)';
  img.style.transformOrigin = 'center center';
  img.setAttribute('data-pkc-image-zoom-target', 'true');
  wrap.appendChild(img);

  // Replace any pre-existing wrap on re-open into the same window.
  for (const old of Array.from(host.querySelectorAll('.pkc-image-preview-wrap'))) old.remove();
  host.appendChild(wrap);

  if (win && source.permalink) {
    win.document.body.setAttribute('data-pkc-permalink', source.permalink);
  }
}

/**
 * Apply zoom inside a specific window — preview window has its own
 * document. The host page never has this img, so we keep the API
 * scoped to the preview surface.
 */
function applyImageZoomIn(win: Window, zoom: number | 'fit'): void {
  const img = win.document.querySelector<HTMLImageElement>('[data-pkc-image-zoom-target="true"]');
  if (!img) return;
  const wrap = img.parentElement;
  if (zoom === 'fit') {
    img.style.transform = 'none';
    img.classList.add('pkc-image-preview-img-fit');
    if (wrap) wrap.setAttribute('data-pkc-image-zoom', 'fit');
  } else {
    img.classList.remove('pkc-image-preview-img-fit');
    img.style.transform = `scale(${zoom / 100})`;
    if (wrap) wrap.setAttribute('data-pkc-image-zoom', String(zoom));
  }
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
