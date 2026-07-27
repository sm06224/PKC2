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
//   4. **常時有効(フラグ制御なし)** ── codeblock-render-standard-2026-07
//      の user 裁定(2026-07-24)で `editor.mermaid_render_enabled` flag は
//      撤去。render させたくない fence は ` ```mermaid-norender `(placeholder
//      を emit しないので本 module は不介入)。hydrate 前 / 失敗時は
//      placeholder の `<pre class="pkc-mermaid-source">` がそのまま表示。
//   5. **Error handling** ── mermaid parse error 時は placeholder に
//      `data-pkc-mermaid-error="..."` を attach、source を残して visible
//      error message を出す(silent fail 禁止)。

import { isWcagAutoShiftEnabled, getWcagTargetRatio } from './wcag-runtime';
import { applyWcagToMermaidSvg } from '../../features/theme/wcag-svg-resolver';
import { registerIdleDisposable } from '../platform/idle-dispose';

/**
 * 2026-07-04 user 要望「mermaid にも WCAG 改善レンダリング」:inject 済み
 * SVG に同系色 shift(shape fill × label color のペアを、色相・彩度を
 * 保ったまま目標コントラストへ)を適用する。`theme.wcag_auto_shift`
 * flag(既定 ON)配下、失敗は non-fatal。DOM attach 後に呼ぶこと
 * (label の computed color 読取りと背景解決に layout が要る)。
 */
function applyMermaidWcag(wrap: HTMLElement): void {
  try {
    if (!isWcagAutoShiftEnabled()) return;
    // ダイアグラム背景 = 最寄りの不透明 ancestor 背景(裸 text の対向色)。
    let bg: string | undefined;
    const win = wrap.ownerDocument?.defaultView;
    if (win) {
      let cur: Element | null = wrap;
      while (cur) {
        const v = win.getComputedStyle(cur as HTMLElement).backgroundColor;
        if (v && v !== 'transparent' && v !== 'rgba(0, 0, 0, 0)') { bg = v; break; }
        cur = cur.parentElement;
      }
    }
    applyWcagToMermaidSvg(wrap, { targetRatio: getWcagTargetRatio(), containerBg: bg });
  } catch {
    /* WCAG shift 失敗で mermaid 表示自体は壊さない */
  }
}

let mermaidPromise: Promise<typeof import('mermaid')> | null = null;
let lastInitTheme: 'default' | 'dark' | null = null;

// user direction 2026-05-28「負荷を増幅させずに mermaid レンダーを有効化」── 同一
// source の再 render を skip するための (theme, source) → svg cache。Split View
// edit preview の 500ms debounce 経路が毎更新で innerHTML 再構築 → mermaid
// placeholder が再 emit されても、同 source なら cache hit で mermaid.render を
// skip し直接 SVG を inject、CPU 負荷を増幅させない。
// theme 切替時は lastInitTheme 経由で全 cache を invalidate(下記 ensureThemeListener)。
const mermaidSvgCache = new Map<string, string>();
const MERMAID_CACHE_MAX = 64;
/**
 * L2(2026-07-27): **件数だけでなくバイト数でも上限を持つ**。
 * 64 件という上限は「1 件が小さい」前提に立っているが、mermaid の SVG は
 * 複雑な図で 100KB を超える ── 件数上限だけでは数 MB が黙って常駐しうる。
 * 予算超過時は古い順に落とす(既存 FIFO と同じ向き)。
 */
const MERMAID_CACHE_MAX_BYTES = 1_500_000;
let mermaidCacheBytes = 0;
/**
 * L2: **使わなくなったら時間で捨てる**(user 指示 2026-07-27
 * 「連続で使われないなら、時間で破棄みたいな」)。この cache は
 * 「同じ図を短時間に再 render する」場面(Split View の 500ms debounce)の
 * ためのもので、手が止まったら保持する理由がない。
 */
const MERMAID_CACHE_IDLE_MS = 60_000;
const touchMermaidCache = registerIdleDisposable({
  name: 'mermaid-svg-cache',
  idleMs: MERMAID_CACHE_IDLE_MS,
  dispose: () => {
    if (mermaidSvgCache.size === 0) return false;
    mermaidSvgCache.clear();
    mermaidCacheBytes = 0;
    return true;
  },
});
function cacheKey(theme: 'default' | 'dark', src: string): string {
  // 区切りは NUL(mermaid source には現れない)。**エスケープで書く** ──
  // 生の NUL バイトを埋め込むと file(1) が "data" 判定し、grep も編集ツールも
  // バイナリ扱いになる(2026-07-27 に実際に踏み、Edit が当たらなかった)。
  return theme + '\0' + src;
}
function getCachedSvg(theme: 'default' | 'dark', src: string): string | undefined {
  const hit = mermaidSvgCache.get(cacheKey(theme, src));
  if (hit !== undefined) touchMermaidCache(); // 使われている間は畳まない
  return hit;
}
function evictOldestCached(): void {
  const firstKey = mermaidSvgCache.keys().next().value;
  if (firstKey === undefined) return;
  const old = mermaidSvgCache.get(firstKey);
  mermaidSvgCache.delete(firstKey);
  if (old !== undefined) mermaidCacheBytes -= old.length;
}
function setCachedSvg(theme: 'default' | 'dark', src: string, svg: string): void {
  while (mermaidSvgCache.size >= MERMAID_CACHE_MAX) evictOldestCached();
  while (mermaidCacheBytes + svg.length > MERMAID_CACHE_MAX_BYTES && mermaidSvgCache.size > 0) {
    evictOldestCached();
  }
  mermaidSvgCache.set(cacheKey(theme, src), svg);
  mermaidCacheBytes += svg.length;
  touchMermaidCache();
}

/** 計器(bench harness が cache の実バイト数を読む窓口)。 */
export function __mermaidCacheStats(): { entries: number; bytes: number } {
  return { entries: mermaidSvgCache.size, bytes: mermaidCacheBytes };
}

/**
 * 2026-07-03 user 報告「システムと反対のテーマを選択すると mermaid が
 * 視認不能」:従来は OS の prefers-color-scheme のみで theme を選んで
 * いたため、アプリ明示テーマ(data-pkc-theme)と OS が食い違うと逆配色の
 * SVG(色は SVG に焼き込み)を注入していた。**アプリの明示テーマを最優先**
 * し、auto(属性なし)のときだけ OS に従う。export は unit test 用。
 */
export function detectMermaidTheme(): 'default' | 'dark' {
  if (typeof document !== 'undefined') {
    const attr = document.getElementById('pkc-root')?.getAttribute('data-pkc-theme');
    if (attr === 'dark') return 'dark';
    if (attr === 'light') return 'default';
  }
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
/**
 * theme 切替時に再 hydrate すべき root の集合。
 *
 * 🔴 **強参照の Set である**(2026-07-27 の常駐棚卸しで判明)。呼び手
 * (`detail-presenter.ts` の center pane / `rendered-viewer.ts` の popup body ほか)は
 * **render のたびに新しい element** を渡すため、ここに入れっぱなしにすると
 * **detach 済みの DOM がすべて残る**(popup を閉じた別 document ごと残る)。
 * 「mermaid を 1 枚描くと +6.9MB が戻らない」の直接の説明がこれ。
 *
 * prune は従来 `rehydrateIfThemeChanged` の中だけにあったが、そこは
 * 「resolved theme が変わったとき」しか到達しない(通常は永久に来ない)。
 * → **hydrate のたびに接続の切れた root を落とす**(`prunePendingRoots`)。
 */
const pendingRoots = new Set<HTMLElement>();
let themeAttrObserver: MutationObserver | null = null;

/** detach された root を落とす。hydrate のたびに呼ぶ(O(登録数)、通常は数個)。 */
function prunePendingRoots(): void {
  for (const root of pendingRoots) {
    if (!root.isConnected) pendingRoots.delete(root);
  }
}

/** 計器(bench harness が保持数を読む窓口)。 */
export function __mermaidPendingRootCount(): number {
  return pendingRoots.size;
}

/**
 * theme 実効値の変化時、現 hydrated root を全 re-hydrate(placeholder に
 * 戻して再 render)。resolved theme が前回 init と同じなら no-op —
 * applySystemSettings は full render のたびに data-pkc-theme を(同値でも)
 * setAttribute するため、この guard が無いと毎 render で mermaid が
 * 再構築される。
 */
function rehydrateIfThemeChanged(): void {
  const next = detectMermaidTheme();
  if (lastInitTheme === null || next === lastInitTheme) return;
  lastInitTheme = null; // 強制再 init(loadMermaid が次回 call 時に再 initialize)
  // theme 切替で SVG cache を完全 invalidate(theme key 別 cache 化と等価)。
  mermaidSvgCache.clear();
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
}

/**
 * theme 変化の 2 経路を listen(module-local で 1 回だけ attach):
 *   1. OS の prefers-color-scheme change(auto モードで効く)
 *   2. アプリの data-pkc-theme attribute change(明示テーマ切替 —
 *      2026-07-03 追加。従来は OS しか見ておらず、アプリのテーマ切替で
 *      mermaid が旧配色のまま残った)
 * どちらも rehydrateIfThemeChanged が実効値の変化を判定するので、
 * 空振り(同値 setAttribute / 明示テーマ中の OS 切替)は no-op。
 */
function ensureThemeListener(): void {
  if (theme_listener_attached) return;
  if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
  theme_listener_attached = true;
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => rehydrateIfThemeChanged());
  } catch {
    // matchMedia listener attach 失敗は silent skip(古い browser 等)
  }
  try {
    const rootEl = typeof document !== 'undefined' ? document.getElementById('pkc-root') : null;
    if (rootEl && typeof MutationObserver !== 'undefined') {
      themeAttrObserver = new MutationObserver(() => rehydrateIfThemeChanged());
      themeAttrObserver.observe(rootEl, {
        attributes: true,
        attributeFilter: ['data-pkc-theme'],
      });
    }
  } catch {
    // observer attach 失敗も silent skip
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
 * placeholder 0 件で early return。各 placeholder に
 * `data-pkc-mermaid-src` の source を `mermaid.render` に渡す。
 *
 * Error:source parse 失敗時は source を残して `data-pkc-mermaid-error`
 * を立て、error message を可視表示(silent fail 禁止)。
 *
 * 標準規約(codeblock-render-standard-2026-07 §3):SVG 差し替え成功時は
 * `[data-pkc-render-mode]` wrapper に `data-pkc-render-ready` を立てる。
 * -both の CSS-only トグルは hydrate 完了までこの attr で非表示になる
 * (「ソース ⇄ ソース」の無意味な一瞬を出さないための体裁)。
 */
export async function hydrateMermaidPlaceholders(root: HTMLElement): Promise<void> {
  const placeholders = root.querySelectorAll<HTMLElement>('.pkc-mermaid-placeholder');
  if (placeholders.length === 0) return;
  ensureThemeListener();
  // 先に掃除してから登録する ── 登録が増える瞬間が唯一の確実な契機。
  prunePendingRoots();
  pendingRoots.add(root);
  // user direction 2026-05-28「負荷を増幅させずに」── cache fast path:current
  // theme での既知 source は mermaid.render を skip して直接 SVG inject。
  const theme = detectMermaidTheme();
  const cacheHits: { ph: HTMLElement; src: string; svg: string }[] = [];
  const cacheMisses: HTMLElement[] = [];
  for (const ph of Array.from(placeholders)) {
    const src = ph.getAttribute('data-pkc-mermaid-src') ?? '';
    if (!src.trim()) continue;
    const cached = getCachedSvg(theme, src);
    if (cached !== undefined) {
      cacheHits.push({ ph, src, svg: cached });
    } else {
      cacheMisses.push(ph);
    }
  }
  // cache hit は mermaid module ロード前に即時 inject(typed source の再表示で
  // module import を遅延させない)。
  for (const { ph, src, svg } of cacheHits) {
    const doc = ph.ownerDocument ?? document;
    const host = ph.closest<HTMLElement>('[data-pkc-render-mode]');
    const wrap = doc.createElement('div');
    wrap.className = 'pkc-mermaid-rendered';
    wrap.setAttribute('data-pkc-mermaid-src', src);
    wrap.setAttribute('data-pkc-md-block-kind', 'mermaid');
    wrap.innerHTML = svg;
    ph.replaceWith(wrap);
    host?.setAttribute('data-pkc-render-ready', '');
    // cache には shift 前の SVG を保持し、inject のたびに適用する
    // (targetRatio / 背景が変わっても cache が汚れない)。
    applyMermaidWcag(wrap);
  }
  if (cacheMisses.length === 0) return; // 全 hit:mermaid 本体 import 不要
  const { default: mermaid } = await loadMermaid();
  let idCounter = 0;
  for (const ph of cacheMisses) {
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
      setCachedSvg(theme, src, svg); // shift 前の raw SVG を cache
      const host = ph.closest<HTMLElement>('[data-pkc-render-mode]');
      const wrap = doc.createElement('div');
      wrap.className = 'pkc-mermaid-rendered';
      wrap.setAttribute('data-pkc-mermaid-src', src); // source 保持(copy / export 用)
      wrap.setAttribute('data-pkc-md-block-kind', 'mermaid');
      wrap.innerHTML = svg;
      ph.replaceWith(wrap);
      host?.setAttribute('data-pkc-render-ready', '');
      applyMermaidWcag(wrap);
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
  mermaidSvgCache.clear();
  themeAttrObserver?.disconnect();
  themeAttrObserver = null;
}
