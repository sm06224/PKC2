// pgc-203 wave-α' polish #24(v3 統合 master G5 markdown 方言完結、user
// 直接指示 2026-05-24「ビルトインマーメイドに対応して」):built-in
// mermaid SVG render。markdown-render.ts が ` ```mermaid ` fence を
// `<div class="pkc-mermaid-placeholder">` placeholder として emit、本 module
// が **lazy import('mermaid')** で SVG render → DOM 入替え。
//
// 設計判断:
//   1. **Lazy import** で初期 bundle.js から mermaid 本体(3 MB / ESM
//      chunks 経由なら ~28 KB entry + lazy chunks per diagram type)を排除。
//      初回 mermaid 検出時に dynamic import、以後 module 内 promise を
//      cache(2 回目以降は immediate resolve)。
//   2. **Theme aware** ── `prefers-color-scheme: dark` を listen して
//      light / dark theme を mermaid に渡し、theme 切替時は再 hydrate。
//   3. **3 surface 統一**(S1 center / S2 Viewer popup / S4 entry-window)
//      で `hydrateMermaidPlaceholders(root)` を呼ぶ ── render-surface-
//      parity-audit-2026-05.md の **新規 dialect 追加 = 3 surface 全部に
//      mirror** 規約に従う。
//   4. **`editor.mermaid_render_enabled` Tier 0 flag default OFF** で gate。
//      OFF 時は placeholder の `<pre class="pkc-mermaid-source">` がそのまま
//      表示(source を fence code として閲覧、export / copy も維持)。
//   5. **Error handling** ── mermaid parse error 時は placeholder に
//      `data-pkc-mermaid-error="..."` を attach、source を残して visible
//      error message を出す(silent fail 禁止)。

import { editorMermaidRenderEnabled } from './shell-flags';

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
let lastInitTheme: 'default' | 'dark' | null = null;

function detectMermaidTheme(): 'default' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
    return 'default';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
}

/**
 * mermaid.js を lazy import + initialize。初回 call で dynamic import、以後
 * 同 promise を再利用。theme 切替時は再 initialize。
 */
async function loadMermaid(): Promise<typeof import('mermaid')> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid');
  }
  const mod = await mermaidPromise;
  const theme = detectMermaidTheme();
  if (lastInitTheme !== theme) {
    mod.default.initialize({
      startOnLoad: false,
      theme,
      // securityLevel 'strict' で <script> 等を block。
      securityLevel: 'strict',
      // user-visible error 表示用(parse error は本 module 側で catch するが、
      // mermaid 内部 fatal error も hide しないよう logLevel を info に。
      logLevel: 'error',
    });
    lastInitTheme = theme;
  }
  return mod;
}

let theme_listener_attached = false;
let pendingRoots = new Set<HTMLElement>();

/**
 * theme 切替時、現 hydrated root を全 re-hydrate。`matchMedia` listener は
 * module-local で 1 回だけ attach。
 */
function ensureThemeListener(): void {
  if (theme_listener_attached) return;
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
  theme_listener_attached = true;
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      // re-init theme は loadMermaid が次回 call 時に判定する。pending root を
      // 全部 re-hydrate(placeholder に戻して再 render させる)。
      lastInitTheme = null; // 強制再 init
      for (const root of pendingRoots) {
        if (!root.isConnected) {
          pendingRoots.delete(root);
          continue;
        }
        // SVG 化済 element を placeholder に戻す
        const rendered = root.querySelectorAll<HTMLElement>('.pkc-mermaid-rendered');
        for (const r of Array.from(rendered)) {
          const src = r.getAttribute('data-pkc-mermaid-src') ?? '';
          const escaped = escapeAttr(src);
          r.outerHTML = `<div class="pkc-mermaid-placeholder" data-pkc-mermaid-src="${escaped}" data-pkc-md-block-kind="mermaid"><pre class="pkc-mermaid-source"><code class="language-mermaid">${escapeText(src)}</code></pre></div>`;
        }
        // 再 hydrate
        void hydrateMermaidPlaceholders(root);
      }
    });
  } catch {
    // matchMedia listener attach 失敗は silent skip(古い browser 等)
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * `root` 内の `.pkc-mermaid-placeholder` を全件 mermaid SVG に置換する。
 * flag OFF / placeholder 0 件で early return。各 placeholder に
 * `data-pkc-mermaid-src` の source を `mermaid.render` に渡す。
 *
 * Error:source parse 失敗時は source を残して `data-pkc-mermaid-error`
 * を立て、error message を可視表示(silent fail 禁止)。
 */
export async function hydrateMermaidPlaceholders(root: HTMLElement): Promise<void> {
  if (!editorMermaidRenderEnabled()) return;
  const placeholders = root.querySelectorAll<HTMLElement>('.pkc-mermaid-placeholder');
  if (placeholders.length === 0) return;
  ensureThemeListener();
  pendingRoots.add(root);
  const { default: mermaid } = await loadMermaid();
  let idCounter = 0;
  for (const ph of Array.from(placeholders)) {
    const src = ph.getAttribute('data-pkc-mermaid-src') ?? '';
    if (!src.trim()) continue;
    const id = `pkc-mermaid-${Date.now()}-${idCounter++}`;
    // **cross-document compat**:popup window で hydrate する場合 placeholder
    // の ownerDocument が main 以外。新 element 生成は ownerDocument 経由で
    // 行うことで DOMException を防ぐ(rendered-viewer.ts の Viewer popup
    // 経路で必要)。
    const doc = ph.ownerDocument ?? document;
    try {
      const { svg } = await mermaid.render(id, src);
      const wrap = doc.createElement('div');
      wrap.className = 'pkc-mermaid-rendered';
      wrap.setAttribute('data-pkc-mermaid-src', src); // source 保持(copy / export 用)
      wrap.setAttribute('data-pkc-md-block-kind', 'mermaid');
      wrap.innerHTML = svg;
      ph.replaceWith(wrap);
    } catch (err) {
      // parse error 等。source を残しつつ error 表示。
      const msg = err instanceof Error ? err.message : String(err);
      ph.setAttribute('data-pkc-mermaid-error', msg);
      const errEl = doc.createElement('div');
      errEl.className = 'pkc-mermaid-error';
      errEl.setAttribute('role', 'alert');
      errEl.textContent = `⚠ Mermaid render error: ${msg}`;
      ph.prepend(errEl);
    }
  }
}

/**
 * test 用:internal state reset。
 */
export function resetMermaidRendererState(): void {
  mermaidPromise = null;
  lastInitTheme = null;
  pendingRoots.clear();
  theme_listener_attached = false;
}
