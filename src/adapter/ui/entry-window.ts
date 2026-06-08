/**
 * Entry Window: opens an entry in a separate browser window for
 * markdown-rendered viewing and optional editing.
 *
 * The child window's UI mirrors the center pane (same CSS variables,
 * class names, DOM structure) so the user sees a consistent experience.
 *
 * Communication with the parent window uses postMessage.
 * Protocol:
 *   Parent → Child: { type: 'pkc-entry-init', entry, readonly }
 *   Child → Parent: { type: 'pkc-entry-save', lid, title, body, openedAt }
 *   Parent → Child: { type: 'pkc-entry-saved' }
 *   Parent → Child: { type: 'pkc-entry-conflict', message }
 *   Child → Parent: { type: 'pkc-entry-task-toggle', lid, taskIndex, logId }
 */

import type { Entry } from '../../core/model/record';
import type { Container } from '../../core/model/container';
import { renderMarkdown } from '../../features/markdown/markdown-render';
// pgc-96(audit pgc-77 Gap-15):S4 全 render path に features 層 DOM op
// (expandTransclusions + hydrateCardPlaceholders)を parent 完成 HTML 経路
// で挿入する。inline script からは features 層を呼べないため、parent 側で
// markdown HTML を一旦 detached DOM 化 → DOM op → outerHTML serialize の
// chain を回し、push する HTML 文字列に完成形を込める(canvas 前方互換、
// multi-window spec §11.3)。
import { expandTransclusions } from './transclusion';
import { hydrateCardPlaceholders } from './card-hydrator';
import { hydrateMermaidPlaceholders } from './mermaid-renderer';
// pgc-97(audit pgc-77 Gap-14):S4 全 path で heading-fold が機能していな
// かった(features 層 op 未連動)。pgc-96 で導入した injectFeaturesDomOps
// pipeline に applyHeadingFold を追加し、center pane(S1)と同 contract に。
import { applyHeadingFold } from '../../features/markdown/heading-fold';
// pgc-91(audit pgc-77 Gap-6 + Gap-7):S4 全 render path に frontmatter
// strip + extractVars + extractHeadingNumberConfig を thread して
// canonical S1 と一致させる。これまで raw frontmatter が `<hr>+text+<hr>`
// として漏れ、{{vars.x}} は literal、見出し番号は付かない状態だった。
import { parseFrontmatter, extractVars } from '../../features/markdown/frontmatter';
import {
  extractHeadingNumberConfig,
  extractDocumentGlobals,
  globalsToDataAttrs,
} from '../../features/markdown/document-globals';
import { extractTocFromEntry, renderStaticTocHtml, extractHeadingsFromMarkdown } from '../../features/markdown/markdown-toc';
import { formatLogTimestampWithSeconds } from '../../features/textlog/textlog-body';
import { buildTextlogDoc } from '../../features/textlog/textlog-doc';
import {
  resolveAssetReferences,
  hasAssetReferences,
  type AssetResolutionContext,
} from '../../features/markdown/asset-resolver';
import { parseTodoBody, formatTodoDate, isTodoPastDue } from '../../features/todo/todo-body';
import {
  parseAttachmentBody,
  classifyPreviewType,
  isSvg,
} from './attachment-presenter';
import { parseFormBody, formPresenter } from './form-presenter';
import { textlogPresenter } from './textlog-presenter';
import { todoPresenter } from './todo-presenter';
import { spreadsheetPresenter, renderSpreadsheetEmbedBody } from './spreadsheet-presenter';
import { shellWindowRolesEnabled, shellWindowLayoutPersistEnabled, shellEntryWindowSplitDefaultOffEnabled, shellEntryWindowChromeEnabled } from './shell-flags';
import type { DiffRow } from '../../features/diff/line-diff';
import {
  readWindowLayout,
  upsertWindowLayout,
  removeWindowLayout,
  type WindowLayoutEntry,
} from '../platform/window-layout-store';

/**
 * Expose renderMarkdown on the parent window so child windows
 * can call it via window.opener.pkcRenderMarkdown().
 * This ensures preview rendering in the child window uses the
 * exact same markdown-it instance as the parent.
 */
(window as unknown as Record<string, unknown>).pkcRenderMarkdown = renderMarkdown;

/**
 * Per-lid preview resolver contexts.
 *
 * Captured at `openEntryWindow` time from the current container and
 * used by `pkcRenderEntryPreview(lid, text)` (exposed on the parent
 * `window` below) so that the child window's edit-mode Preview tab
 * can resolve `![alt](asset:key)` image embeds and
 * `[label](asset:key)` non-image chips in the textarea's current
 * contents before handing the string to `renderMarkdown()`.
 *
 * Snapshot semantics: the context is taken once at window-open time
 * and then pushed to the child via `pushPreviewContextUpdate` on
 * subsequent updates (duplicate-open, attachment add/remove). The
 * child keeps its own local copy, so the parent map is primarily the
 * initial seed and a fallback for the first render before any push
 * has arrived. It is cleared on child close.
 */
const previewResolverContexts = new Map<string, AssetResolutionContext>();

/**
 * pgc-96(audit pgc-77 Gap-15):S4 render path で features 層 DOM op を
 * 完成 HTML に込めるため、現在の container reference を module-local に
 * 保持する。wireEntryWindowFeaturesDom(dispatcher)が `dispatcher.onState`
 * で最新値を流し込む。
 */
let currentContainerRef: Container | null = null;
export function setEntryWindowCurrentContainer(c: Container | null): void {
  currentContainerRef = c;
}

/**
 * pgc-96 helper:rendered HTML 文字列に対して **features 層 DOM op を
 * inject** して outerHTML を返す。container が無いとき(boot 前等)は
 * pass-through。inline script から features 層を呼べない S4 child window の
 * 制約を、parent 側で完成 HTML を build して push 経路で代用する流儀。
 *
 * pgc-98(audit pgc-77 Gap-8):任意 `raw` 引数で source body 全文を
 * 受け取れる。raw に frontmatter `writing` / `direction` / `align` /
 * `layout` が含まれているとき、output HTML を `<div data-pkc-writing="…"
 * dir="…" data-pkc-doc-align="…" data-pkc-layout="…">…</div>` で wrap する
 * (canonical S1 detail-presenter は `.pkc-md-rendered` 自身に attribute を
 * 載せるが、S4 では `#body-view` の innerHTML を経由するため、attribute を
 * 載せられる新規 wrapper を 1 段追加する。CSS は entry-window inline CSS で
 * `.pkc-md-rendered > div[data-pkc-writing]` 系で消費する)。
 */
function injectFeaturesDomOps(
  html: string,
  hostLid: string,
  container: Container | null,
  raw?: string,
): string {
  if (typeof document === 'undefined') return html;
  if (!html) return html;
  let inner = html;
  if (container) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const containerId = container.meta?.container_id ?? '';
    try {
      expandTransclusions(tmp, {
        entries: container.entries,
        assets: container.assets,
        mimeByKey: buildAssetMimeMapLocal(container),
        nameByKey: buildAssetNameMapLocal(container),
        hostLid,
      });
      hydrateCardPlaceholders(tmp, {
        entries: container.entries,
        currentContainerId: containerId,
      });
      // user direction 2026-05-28「プレビューにおいて負荷を増幅させずに HTML レンダー
      // と mermaid レンダーを有効化」── pgc-203 wave-α' polish #24 の known
      // limitation を解消。parent の detached tmp div で hydrate しても async SVG
      // 完了前に serialize されて child window に渡らないため、parent 側は呼ばず、
      // child 側で `window.opener.pkcHydratePreviewMermaid(element)` を innerHTML
      // 設定後に呼ぶ動線に変更(L75 / L270 と同じ exposed function pattern)。
      // mermaid renderer 内の cross-document compat(ph.ownerDocument 経由)+
      // source→svg cache(同 source なら mermaid.render skip)で負荷増幅を抑制。
      // pgc-97(audit pgc-77 Gap-14):S1 / S2 と同様に native <details> で
      // top-level 見出しを折りたためるように。pure DOM 操作なので entries 有無
      // に依らず無条件で適用(detail-presenter.ts:139 と同 contract)。
      applyHeadingFold(tmp);
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[entry-window] features DOM op failed:', e);
      }
      return html;
    }
    inner = tmp.innerHTML;
  }
  // pgc-98:document globals(writing / direction / align / layout)を
  // wrapper div へ反映。raw が無い path(per-log textlog 等、文書 frontmatter
  // を持たない)は wrap せず素通し。
  if (raw) {
    const globals = extractDocumentGlobals(raw);
    const attrEntries = Object.entries(globalsToDataAttrs(globals));
    if (attrEntries.length > 0 || globals.direction) {
      const wrapper = document.createElement('div');
      for (const [k, v] of attrEntries) wrapper.setAttribute(k, v);
      if (globals.direction === 'rtl' || globals.direction === 'ltr') {
        wrapper.setAttribute('dir', globals.direction);
      }
      wrapper.innerHTML = inner;
      inner = wrapper.outerHTML;
    }
  }
  return inner;
}

// renderer.ts の buildAssetMimeMap / buildAssetNameMap は同 module export
// あり(rendered-viewer.ts も使用、L54)。entry-window から直 import すると
// 循環参照になりかねないため、ここでは inline で同等関数を持つ。
function buildAssetMimeMapLocal(container: Container): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    try {
      const body = e.body ? (JSON.parse(e.body) as { asset_key?: string; mime?: string }) : null;
      if (body && body.asset_key && body.mime) out[body.asset_key] = body.mime;
    } catch { /* ignore */ }
  }
  return out;
}
function buildAssetNameMapLocal(container: Container): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of container.entries) {
    if (e.archetype !== 'attachment') continue;
    try {
      const body = e.body ? (JSON.parse(e.body) as { asset_key?: string; name?: string }) : null;
      if (body && body.asset_key && body.name) out[body.asset_key] = body.name;
    } catch { /* ignore */ }
  }
  return out;
}

/**
 * Render a textarea body string as the entry-window preview, running
 * asset reference resolution against the captured per-lid context
 * first when the text contains any `asset:` references. Exposed on
 * the parent `window` so the child window's inline `<script>` can
 * call it via `window.opener.pkcRenderEntryPreview(lid, text, ctx?)`.
 *
 * - The third argument `overrideCtx` is supplied by the child window
 *   when it has a locally-stored preview context from an earlier
 *   `pkc-entry-update-preview-ctx` live-refresh push. When present,
 *   it takes precedence over the parent's per-lid map so a freshly
 *   pushed snapshot wins over the stale initial one.
 * - If no override is given and no context is registered for the
 *   given lid (non-text archetype or no references at open time),
 *   the function is a plain wrapper around `renderMarkdown()` —
 *   identical to the legacy `pkcRenderMarkdown` path.
 * - If the current text has no `asset:` reference, the resolver is
 *   skipped and `renderMarkdown()` is called directly. This keeps the
 *   common typing path cheap.
 */
function renderEntryPreview(
  lid: string,
  text: string,
  overrideCtx?: AssetResolutionContext | null,
): string {
  // PR-XX2-fix (2026-05-07、user 報告):popup split editor の input →
  // preview re-render 経路。`sourceLineAnchors: true` を必ず付与しないと
  // re-render 後の preview に source-line anchor が消え、popup-side
  // sync logic が target を見失う。center pane の split editor preview
  // も同じ option を使う(`detail-presenter.ts` の initial render +
  // action-binder.ts の `updateTextEditPreview`)。
  //
  // pgc-91(audit pgc-77 Gap-6 + Gap-7):S4 split editor preview path も
  // canonical S1 と同じ前処理を入れる ── frontmatter strip + vars 展開 +
  // headingNumber config。raw frontmatter の漏れ / {{vars.x}} literal /
  // 見出し番号未付与 を解消。
  const ctx = overrideCtx ?? previewResolverContexts.get(lid);
  const raw = text ?? '';
  const vars = extractVars(raw);
  const stripped = parseFrontmatter(raw).body;
  const headingNumber = extractHeadingNumberConfig(raw);
  // pgc-96(audit pgc-77 Gap-15):currentContainerId 連動 + features DOM
  // op を完成 HTML に inject(parent 経路で実行、child 側 inline script は
  // 受け取り済 HTML をそのまま展開)。
  const containerId = currentContainerRef?.meta?.container_id ?? '';
  const opts = { sourceLineAnchors: true, vars, headingNumber, currentContainerId: containerId };
  let html: string;
  if (ctx && stripped && hasAssetReferences(stripped)) {
    const resolved = resolveAssetReferences(stripped, ctx);
    html = renderMarkdown(resolved, opts);
  } else {
    html = renderMarkdown(stripped, opts);
  }
  // pgc-98(audit pgc-77 Gap-8):raw を thread して document globals
  // (writing / direction / align / layout)を wrapper に反映。
  return injectFeaturesDomOps(html, lid, currentContainerRef, raw);
}
(window as unknown as Record<string, unknown>).pkcRenderEntryPreview = renderEntryPreview;

/**
 * user direction 2026-05-28「プレビューにおいて負荷を増幅させずに HTML レンダーと
 * mermaid レンダーを有効化」── child window の inline script から
 * `window.opener.pkcHydratePreviewMermaid(element)` で呼び、child の DOM 要素
 * 内の `.pkc-mermaid-placeholder` を SVG 化する。
 *
 * 設計:
 * - mermaid renderer の `hydrateMermaidPlaceholders` は `ph.ownerDocument`
 *   経由で cross-document に対応済(L131 mermaid-renderer.ts)。child element
 *   を渡せば child document 内に SVG を inject する。
 * - source → SVG cache は parent module-local。child preview の連続更新で
 *   同 source が何度も placeholder として現れても 2 回目以降は cache hit で
 *   mermaid.render を skip(負荷を増幅させない)。
 * - fire-and-forget(child は SVG 完了を待たず次の input を処理可能)。
 *
 * 呼出側(child inline script):
 *   var preview = document.getElementById('body-preview');
 *   preview.innerHTML = renderMd(src);
 *   if (window.opener && window.opener.pkcHydratePreviewMermaid) {
 *     window.opener.pkcHydratePreviewMermaid(preview);
 *   }
 */
function pkcHydratePreviewMermaid(el: unknown): void {
  if (!el || typeof (el as HTMLElement).querySelectorAll !== 'function') return;
  void hydrateMermaidPlaceholders(el as HTMLElement);
}
(window as unknown as Record<string, unknown>).pkcHydratePreviewMermaid = pkcHydratePreviewMermaid;

/** Track open child windows to prevent duplicates. */
const openWindows = new Map<string, Window>();

/**
 * γ-A5(multi-window-vscode-extension-spec §3):viewer role の子 window
 * 一覧。editor の `openWindows` とは **別 Map** で管理するため、同じ entry
 * を editor と viewer の両方で同時に開ける。既存 editor 機構(`openWindows`
 * / reload guard / 競合検知)には一切影響しない。
 */
const viewerWindows = new Map<string, Window>();

/**
 * γ-A5(multi-window-vscode-extension-spec §3.3):monitor role の子 window
 * 一覧。monitor は特定 entry の編集ではなく container 由来のライブ panel
 * (現状は `toc` = 本文見出しアウトライン)を表示する。key は `${kind}:${lid}`。
 */
export type MonitorKind = 'toc';

interface MonitorWindowEntry {
  win: Window;
  kind: MonitorKind;
  lid: string;
}

const monitorWindows = new Map<string, MonitorWindowEntry>();

/** monitor panel の 1 行(level = 見出し深さ、text = 表示文字列)。 */
export interface MonitorItem {
  level: number;
  text: string;
}

/** monitor へ派生データを push する postMessage type。 */
export const ENTRY_WINDOW_MONITOR_UPDATE_MSG = 'pkc-monitor-update';

/**
 * Phase γ-A3:child window の open/close を state machine へ通知する
 * listener。main.ts が boot 時に登録し、`SYS_SYNC_CHILD_WINDOWS` dispatch
 * へ配線する。`openEntryWindow`(open 時)と close-poll(close 検知時)が
 * `notifyWindowsChanged` を呼び、AppState.childWindowLids を同期させる。
 */
let windowsChangedListener: (() => void) | null = null;

export function setEntryWindowsChangedListener(cb: (() => void) | null): void {
  windowsChangedListener = cb;
}

function notifyWindowsChanged(): void {
  if (windowsChangedListener) windowsChangedListener();
}

/**
 * Phase γ-A3:既に開いている child window を front へ focus する。
 * action-binder の `triggerEdit` から、同一 entry の inline 編集要求を
 * 「その window へ切替える」挙動に振り替えるために呼ぶ。window が無ければ
 * `false` を返す。
 */
export function focusEntryWindow(lid: string): boolean {
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.focus();
    return true;
  }
  return false;
}

/**
 * Return the set of lids for which an entry-window child is currently
 * open. Used by the main-window state subscriber to decide which open
 * children should receive a live preview-context refresh when the
 * container's asset state changes (e.g. an attachment entry added or
 * removed between the initial open and now).
 *
 * The returned array is a snapshot — callers iterating over it may
 * safely dispatch `pushPreviewContextUpdate` or similar without
 * worrying about concurrent mutation of the underlying map.
 *
 * Closed children that the close-poller has not yet cleaned up are
 * filtered out here so callers never receive a stale lid that would
 * make `pushPreviewContextUpdate` post to a dead child.
 */
export function getOpenEntryWindowLids(): string[] {
  const lids: string[] = [];
  for (const [lid, child] of openWindows) {
    if (!child.closed) lids.push(lid);
  }
  return lids;
}

/**
 * γ-A5:現在開いている viewer role の子 window の lid 一覧。
 * view-body live-refresh(`wireEntryWindowViewBodyRefresh`)が editor と
 * viewer の両方へ push するために参照する。
 */
export function getOpenViewerWindowLids(): string[] {
  const lids: string[] = [];
  for (const [lid, child] of viewerWindows) {
    if (!child.closed) lids.push(lid);
  }
  return lids;
}

/**
 * γ-A5:monitor kind に応じて entry から派生データを計算する。
 * `toc` は本文の見出しアウトライン。
 */
function deriveMonitorItems(kind: MonitorKind, entry: Entry): MonitorItem[] {
  if (kind === 'toc') {
    return extractHeadingsFromMarkdown(entry.body).map((h) => ({
      level: h.level,
      text: h.text,
    }));
  }
  return [];
}

/**
 * γ-A5:現在開いている monitor 一覧(kind + 対象 lid)。monitor refresh
 * 配線が container 変更時に再計算 → push するために参照する。
 */
export function getOpenMonitorTargets(): { kind: MonitorKind; lid: string }[] {
  const out: { kind: MonitorKind; lid: string }[] = [];
  for (const m of monitorWindows.values()) {
    if (!m.win.closed) out.push({ kind: m.kind, lid: m.lid });
  }
  return out;
}

/**
 * γ-A5:monitor window へ最新の派生データを push する(spec §3.3)。
 * 描画済み HTML ではなく **データ**(`MonitorItem[]`)を送り、子側 inline
 * script が描画する(spec §11.3 ── canvas 前方互換のためデータ経路)。
 */
export function pushMonitorUpdate(
  kind: MonitorKind,
  lid: string,
  entry: Entry,
): boolean {
  const m = monitorWindows.get(`${kind}:${lid}`);
  if (!m || m.win.closed) return false;
  m.win.postMessage(
    {
      type: ENTRY_WINDOW_MONITOR_UPDATE_MSG,
      kind,
      items: deriveMonitorItems(kind, entry),
    },
    '*',
  );
  return true;
}

/**
 * γ-A5-4:保存済み layout から viewer / monitor window を再オープンする
 * (spec §4.3)。editor は復元対象外 ── 参照系の viewer / monitor のみ
 * (editor 復元は onSave 等の callback 配線が要るため A5-4 scope 外)。
 *
 * 戻り値 = 復元試行後もまだ開いていない window 数。0 なら全復元成功、
 * >0 は browser popup blocker 等で開けなかった分(呼び出し側が再クリック
 * を促す)。entry が container から消えている layout 項目は skip(pending
 * にも数えない)。同じ window が既に開いていれば dedup focus され、open
 * 済み判定に入るため再クリックは安全に冪等。
 */
export function restoreWindowLayout(entries: Entry[]): number {
  const layout = readWindowLayout().filter(
    (e) => e.role === 'viewer' || e.role === 'monitor',
  );
  for (const item of layout) {
    const entry = entries.find((e) => e.lid === item.lid);
    if (!entry) continue;
    if (item.role === 'viewer') {
      openViewerWindow(entry);
    } else {
      openMonitorWindow((item.monitorKind ?? 'toc') as MonitorKind, entry);
    }
  }
  const openViewers = new Set(getOpenViewerWindowLids());
  const openMonitors = new Set(
    getOpenMonitorTargets().map((t) => `${t.kind}:${t.lid}`),
  );
  let pending = 0;
  for (const item of layout) {
    if (!entries.some((e) => e.lid === item.lid)) continue;
    if (item.role === 'viewer') {
      if (!openViewers.has(item.lid)) pending++;
    } else if (!openMonitors.has(`${item.monitorKind ?? 'toc'}:${item.lid}`)) {
      pending++;
    }
  }
  return pending;
}

/**
 * Private message type name used for the parent → child live refresh
 * of the edit-mode Preview resolver context. Exported so the test
 * harness and adjacent adapter code can reference the exact string
 * without re-hard-coding it.
 *
 * Payload shape:
 *   { type: 'pkc-entry-update-preview-ctx', previewCtx: AssetResolutionContext }
 *
 * Direction:
 *   parent → child (the child listens for this message; the parent
 *   never receives it).
 *
 * Scope:
 *   affects ONLY the child's edit-mode Preview tab resolver. The
 *   child's view-pane HTML (already written at open time) is not
 *   redrawn, the Source textarea is not touched, and no other state
 *   is changed. A separate message type is introduced below
 *   (`ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG`) for view-pane rerender —
 *   see `edit-preview-asset-resolution.md`, "Child view-pane rerender
 *   foundation".
 */
export const ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG = 'pkc-entry-update-preview-ctx';

/**
 * Private message type name used for the parent → child rerender of
 * the view-pane body (`#body-view`). Exported so the test harness and
 * future wiring code can reference the exact string without
 * re-hard-coding it.
 *
 * Payload shape:
 *   { type: 'pkc-entry-update-view-body', viewBody: string }
 *
 * The `viewBody` field is a **fully rendered HTML string** produced by
 * the parent (markdown render + asset resolution already applied). The
 * child treats the payload as trusted HTML — same trust domain as the
 * initial `document.write` at window-open time — and writes it
 * directly into `#body-view.innerHTML`.
 *
 * Direction:
 *   parent → child (the child listens for this message; the parent
 *   never receives it).
 *
 * Scope — what this rerender touches:
 *   - ONLY `#body-view.innerHTML`
 *
 * Scope — what this rerender does NOT touch:
 *   - `#body-edit` (Source textarea) — user's in-progress edit is
 *     preserved verbatim
 *   - `#body-preview` (edit-mode Preview tab's scratch div) — that
 *     path is owned by `ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG` and runs
 *     independently
 *   - `#title-display` / `#title-input` — title sync is a separate
 *     concern (if needed) and not part of this foundation
 *   - any other DOM, CSS, scroll, or tab state
 *
 * Intentionally out of scope for this foundation Issue:
 *   - automatic wiring into the dispatcher state stream (callers must
 *     invoke `pushViewBodyUpdate` explicitly; no auto-subscriber
 *     exists yet)
 *   - dirty state / conflict resolution with in-progress edits
 *   - non-text / non-textlog archetypes — attachment / todo / form
 *     have different `#body-view` contents (preview card, kanban
 *     card, etc.) and would be destroyed by innerHTML replacement
 *   - main-window Source/Preview tab introduction
 */
export const ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG = 'pkc-entry-update-view-body';

/**
 * Private message type name used for the parent → child refresh of
 * entry-window title surfaces. See
 * `docs/development/entry-window-title-live-refresh-v1.md` §3 for the
 * full protocol.
 *
 * Payload shape:
 *   { type: 'pkc-entry-update-title', title: string }
 *
 * The `title` field is the new plain-text title. The child applies it
 * to `document.title`, `#title-display`, and `originalTitle`, subject
 * to the dirty-state policy in §4 of the spec (edit-mode stashes into
 * `pendingTitle` to avoid stomping an in-progress rename).
 */
export const ENTRY_WINDOW_TITLE_UPDATE_MSG = 'pkc-entry-update-title';

/**
 * Push a fresh preview resolver context snapshot to an already-open
 * child window, updating both the parent-side map and the child's
 * local copy via postMessage.
 *
 * This is the live-refresh foundation: callers that know the parent
 * container's asset state has changed (e.g. an attachment was added
 * or removed) can invoke this helper to make the child's Preview tab
 * see the new state on its next render, without the user having to
 * close and re-open the entry window.
 *
 * Behavior:
 *   - Always updates `previewResolverContexts[lid]` so the parent-side
 *     fallback stays in sync with the latest snapshot.
 *   - If a child window is open for this lid, sends a
 *     `pkc-entry-update-preview-ctx` postMessage carrying the new
 *     context. The child stores it locally and uses it as the
 *     override argument to `pkcRenderEntryPreview` on the next render.
 *   - If no child is open, this is effectively a parent-side map
 *     update only (which still matters for the duplicate-open path
 *     and for any future child reopen).
 *
 * Intentionally out of scope:
 *   - Does NOT redraw the child's view-pane HTML.
 *   - Does NOT touch the child's Source textarea.
 *   - Does NOT participate in the save/conflict/download protocols.
 *   - Does NOT synchronize state across multiple windows for the same
 *     lid (duplicate-open is handled separately in `openEntryWindow`).
 *
 * Returns `true` when a postMessage was dispatched to a live child,
 * `false` when only the parent-side map was updated.
 */
export function pushPreviewContextUpdate(
  lid: string,
  previewCtx: AssetResolutionContext,
): boolean {
  previewResolverContexts.set(lid, previewCtx);
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.postMessage(
      { type: ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG, previewCtx },
      '*',
    );
    return true;
  }
  return false;
}

/**
 * Push a rerender of the child's view-pane body (`#body-view`).
 *
 * This is the view-pane rerender **foundation** — counterpart to
 * `pushPreviewContextUpdate`, but targeting the view-mode body HTML
 * instead of the edit-mode Preview resolver context. Callers that
 * already know the parent-side resolved-body string has changed
 * (e.g. because container assets were mutated and the caller re-ran
 * `resolveAssetReferences` for this entry) can invoke this helper to
 * replace the child's `#body-view.innerHTML` on the spot, without
 * closing and reopening the window.
 *
 * Contract:
 *   - Parent runs `renderMarkdown(resolvedBody || '')` using the same
 *     safe markdown settings as the initial `renderViewBody` default
 *     branch, with the same `(empty)` fallback when the render result
 *     is an empty string. The caller therefore does not need to worry
 *     about renderer configuration drift.
 *   - The rendered HTML string is sent to the child as
 *     `{ type: 'pkc-entry-update-view-body', viewBody }` via
 *     postMessage.
 *   - The child listener replaces ONLY `#body-view.innerHTML`. No
 *     other DOM in the child is touched (see
 *     `ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG` JSDoc for the full scope /
 *     non-scope list).
 *
 * Caller responsibility:
 *   - Only invoke this for `text` / `textlog` archetypes. Other
 *     archetypes (`attachment`, `todo`, `form`, `folder`) use
 *     dedicated card renderers whose HTML would be destroyed by a
 *     markdown-rendered replacement. The helper itself is archetype-
 *     agnostic and does no gating; archetype filtering lives at the
 *     call site.
 *   - Pass a `resolvedBody` string that has already been through
 *     `resolveAssetReferences` (or the caller's equivalent). Passing
 *     a raw `entry.body` without resolving `asset:` references is
 *     valid but will produce a view that lacks inline data-URI
 *     embeds / chip anchors for referenced assets.
 *
 * Intentionally out of scope:
 *   - Does NOT auto-subscribe to dispatcher state changes. Unlike
 *     `pushPreviewContextUpdate`, which has an
 *     `entry-window-live-refresh.ts` wiring layer on top of it, this
 *     helper has no live-wiring counterpart yet — it is foundation
 *     only. Wiring (and the associated dirty-state policy for
 *     unsaved edits in the Source textarea) is a separate Issue.
 *   - Does NOT touch the child's `#body-edit` textarea. The user's
 *     in-progress edit is never replaced, moved, or cleared by this
 *     helper.
 *   - Does NOT touch the child's `#body-preview`, `#title-display`,
 *     `#title-input`, or any other DOM node.
 *   - Does NOT update the parent-side `previewResolverContexts` map
 *     (that is the `pushPreviewContextUpdate` responsibility; the
 *     two helpers are deliberately independent).
 *   - Does NOT perform any dirty-state / conflict-resolution
 *     protocol handshake with the child.
 *
 * Returns `true` when a postMessage was dispatched to a live child,
 * `false` when no open window exists for the lid (or the child has
 * been closed).
 */
export function pushViewBodyUpdate(
  lid: string,
  resolvedBody: string,
): boolean {
  // γ-A5:同じ lid の editor window と viewer window の両方へ push する。
  // どちらの child も `buildWindowHtml` 由来の同一 `#body-view` を持つため
  // 同じ message で再描画でき、editor 保存 → viewer 反映(spec §3.4)が
  // この両投で成立する。
  const targets: Window[] = [];
  const editor = openWindows.get(lid);
  if (editor && !editor.closed) targets.push(editor);
  const viewer = viewerWindows.get(lid);
  if (viewer && !viewer.closed) targets.push(viewer);
  if (targets.length === 0) return false;
  // pgc-91(audit pgc-77 Gap-6 + Gap-7):resolvedBody は asset 解決済だが、
  // frontmatter は raw のまま残るので strip + extractVars + headingNumber
  // を canonical S1 と同様に thread。
  // pgc-96(audit pgc-77 Gap-15):features 層 DOM op を parent 完成 HTML
  // に inject(child は inline script から features 層を呼べないため)。
  const raw = resolvedBody || '';
  const vars = extractVars(raw);
  const stripped = parseFrontmatter(raw).body;
  const headingNumber = extractHeadingNumberConfig(raw);
  const containerId = currentContainerRef?.meta?.container_id ?? '';
  let html =
    renderMarkdown(stripped, { vars, headingNumber, currentContainerId: containerId }) ||
    '<em style="color:var(--c-muted)">(empty)</em>';
  // pgc-98(audit pgc-77 Gap-8):raw を thread して document globals 反映。
  html = injectFeaturesDomOps(html, lid, currentContainerRef, raw);
  for (const child of targets) {
    child.postMessage(
      { type: ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG, viewBody: html },
      '*',
    );
  }
  return true;
}

/**
 * Push a title refresh to an already-open child entry-window.
 *
 * See `docs/development/entry-window-title-live-refresh-v1.md` for the
 * full contract. In brief: the child applies the new title to
 * `document.title`, `#title-display`, and the script's `originalTitle`
 * variable, unless the child is currently in edit mode (in which case
 * the new title is stashed into `pendingTitle` to avoid stomping an
 * in-progress rename).
 *
 * Returns `true` when a postMessage was dispatched to a live child,
 * `false` when no open window exists for the lid (or the child has
 * been closed).
 */
export function pushTitleUpdate(
  lid: string,
  title: string,
): boolean {
  const child = openWindows.get(lid);
  if (!child || child.closed) return false;
  child.postMessage(
    { type: ENTRY_WINDOW_TITLE_UPDATE_MSG, title },
    '*',
  );
  return true;
}

/**
 * Build the day-grouped TEXTLOG view-body HTML string used by both the
 * initial parent-side render (`renderViewBody`) and the post-save
 * rerender paths (`pushTextlogViewBodyUpdate`, child-side
 * `renderBodyView`).
 *
 * Slice 4-A unifies the rendered viewer with the live viewer's common
 * builder: `buildTextlogDoc(entry, { order: 'asc' })` drives a
 * `<section id="day-…"><article id="log-…">` tree that matches the
 * structure emitted by `textlogPresenter.renderBody` (see
 * `docs/development/textlog-viewer-and-linkability-redesign.md`).
 *
 * Differences from the live viewer:
 *   - `order: 'asc'` — chronological, natural document order.
 *   - No append area, no flag-toggle / copy-anchor buttons — the
 *     entry-window view pane is read-oriented; in-place mutation
 *     happens via the edit pane (structured editor).
 *
 * pgc-211 (audit pgc-77 Gap-9 resolved):per-log の asset reference
 * resolution を S2 `buildTextlogBodyHtml` と equivalent な流儀で実装。
 * `![](asset:K)` / `[label](asset:K)` を currentContainerRef の assets /
 * mime / name map で resolve(canonical path 一致)。container 不在 / asset
 * 参照無しなら no-op で従来挙動を維持。
 */
function buildTextlogViewBodyHtml(lid: string, body: string): string {
  const stubEntry: Entry = {
    lid,
    archetype: 'textlog',
    title: '',
    body,
    created_at: '',
    updated_at: '',
  };
  const doc = buildTextlogDoc(stubEntry, { order: 'asc' });
  if (doc.sections.length === 0) {
    return '<em style="color:var(--c-muted)">(empty)</em>';
  }
  const parts: string[] = [];
  parts.push(
    `<div class="pkc-textlog-document" data-pkc-region="textlog-document">`,
  );
  for (const section of doc.sections) {
    const dayId =
      section.dateKey === '' ? 'day-undated' : `day-${section.dateKey}`;
    const dayTitle = section.dateKey === '' ? 'Undated' : section.dateKey;
    parts.push(
      `<section class="pkc-textlog-day" id="${escapeForAttr(dayId)}" data-pkc-date-key="${escapeForAttr(section.dateKey)}">`,
      `<header class="pkc-textlog-day-header"><h2 class="pkc-textlog-day-title">${escapeForHtml(dayTitle)}</h2></header>`,
    );
    for (const log of section.logs) {
      const importantAttr = log.flags.includes('important')
        ? ' data-pkc-log-important="true"'
        : '';
      // pgc-91(audit pgc-77 Gap-6):per-log の bodySource にも frontmatter
      // strip + extractVars を thread(canonical S1 textlog-presenter の
      // per-log path と一致、`textlog-presenter.ts:477-484` を参照)。
      // pgc-96(audit pgc-77 Gap-15):features 層 DOM op を per-log にも
      // inject(transclusion / card は log 内本文にも出現しうる)。
      const logRaw = log.bodySource || '';
      const logVars = extractVars(logRaw);
      const logStripped = parseFrontmatter(logRaw).body;
      const containerId = currentContainerRef?.meta?.container_id ?? '';
      // pgc-211 (audit pgc-77 Gap-9): per-log の asset reference を resolve。
      // canonical S2 `rendered-viewer.ts` `buildTextlogBodyHtml` L1176 と
      // 同流儀。currentContainerRef から assets / mime / name map を build
      // して `resolveAssetReferences` に渡す。container 不在 / asset 参照
      // 無しなら no-op で従来挙動を維持(後方互換完全)。
      let logToRender = logStripped;
      if (currentContainerRef && logStripped && hasAssetReferences(logStripped)) {
        const assetCtx = {
          assets: currentContainerRef.assets,
          mimeByKey: buildAssetMimeMapLocal(currentContainerRef),
          nameByKey: buildAssetNameMapLocal(currentContainerRef),
        };
        logToRender = resolveAssetReferences(logStripped, assetCtx);
      }
      let bodyHtml = renderMarkdown(logToRender, { vars: logVars, currentContainerId: containerId }) || '';
      bodyHtml = injectFeaturesDomOps(bodyHtml, lid, currentContainerRef);
      parts.push(
        `<article class="pkc-textlog-log" id="log-${escapeForAttr(log.id)}" data-pkc-log-id="${escapeForAttr(log.id)}" data-pkc-lid="${escapeForAttr(lid)}"${importantAttr}>`,
        `<header class="pkc-textlog-log-header">`,
        `<span class="pkc-textlog-timestamp" title="${escapeForAttr(log.createdAt)}">${escapeForHtml(formatLogTimestampWithSeconds(log.createdAt))}</span>`,
        `</header>`,
        `<div class="pkc-textlog-text pkc-md-rendered">${bodyHtml}</div>`,
        `</article>`,
      );
    }
    parts.push(`</section>`);
  }
  parts.push(`</div>`);
  return parts.join('');
}

/**
 * Expose the TEXTLOG view-body builder on the parent window so the
 * child window's inline `<script>` can re-render its view pane after a
 * save (`renderBodyView` in the child). Keeping the day-grouping logic
 * on the parent side avoids duplicating `buildTextlogDoc` /
 * `formatLogTimestampWithSeconds` / `renderMarkdown` in the child's
 * inline JS string.
 */
(window as unknown as Record<string, unknown>).pkcRenderTextlogViewBody =
  buildTextlogViewBodyHtml;

/**
 * Push a TEXTLOG view-body update with per-log-entry rendering so the
 * child retains `data-pkc-log-id` markers for task toggle identification.
 */
export function pushTextlogViewBodyUpdate(
  lid: string,
  textlogBody: string,
): boolean {
  const child = openWindows.get(lid);
  if (!child || child.closed) return false;
  const html = buildTextlogViewBodyHtml(lid, textlogBody);
  child.postMessage(
    { type: ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG, viewBody: html },
    '*',
  );
  return true;
}

/**
 * Asset context threaded from the parent window into the child window
 * at open time so the child can preview attachments and show resolved
 * asset references without having live access to `container.assets`.
 *
 * All fields are optional — an absent field means "data not available
 * for this reason" and the child renders the corresponding fallback.
 */
export interface EntryWindowAssetContext {
  /**
   * For attachment archetype entries only: the base64 bytes of the
   * attached file. Undefined means either Light export (no data) or
   * the asset key is no longer present in the container.
   */
  attachmentData?: string;
  /**
   * For attachment archetype entries with HTML/SVG MIME: the sandbox
   * permissions to apply to the iframe. `allow-same-origin` is always
   * added as a baseline.
   */
  sandboxAllow?: string[];
  /**
   * For text / textlog archetype entries: the entry body with
   * `![alt](asset:key)` and `[label](asset:key)` references already
   * resolved by the parent's asset resolver. When provided, the child
   * uses this instead of `entry.body` for the initial view-mode
   * markdown render.
   */
  resolvedBody?: string;
  /**
   * For text / textlog archetype entries: snapshot of the resolver
   * input context (assets + mimeByKey + nameByKey) captured at window
   * open time. When present, `openEntryWindow` registers it under
   * `previewResolverContexts[entry.lid]` so the edit-mode Preview tab
   * can resolve asset references against the same container state
   * that produced `resolvedBody`. Cleared when the child closes.
   */
  previewCtx?: AssetResolutionContext;
}

/**
 * Open an entry in a separate browser window.
 * If a window for the same lid is already open, focus it.
 *
 * `assetContext` and `onDownloadAsset` are optional: when absent, the
 * child window falls back to the pre-Phase-4 behavior (no attachment
 * preview, no non-image chip download).
 */
export function openEntryWindow(
  entry: Entry,
  readonly: boolean,
  onSave: (lid: string, title: string, body: string, openedAt: string) => void,
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
  onDownloadAsset?: (assetKey: string) => void,
  onTaskToggle?: (lid: string, taskIndex: number, logId: string | null) => void,
  startEditing = false,
): void {
  // ── Duplicate-open path ─────────────────────────────
  // If a child window for this lid is already open, we do NOT create
  // a second child. Instead, we refresh the preview resolver context
  // so the next time the user switches to the Preview tab the edit-
  // mode asset resolver works against the freshest container snapshot
  // (attachments added / removed between the first open and now).
  //
  // The refresh routes through `pushPreviewContextUpdate`, which both
  // updates the parent-side map AND live-pushes the new snapshot to
  // the child via `pkc-entry-update-preview-ctx` postMessage. The
  // child's view-pane HTML (already written at open time) is NOT
  // touched — redrawing it would require a separate rerender protocol
  // which is deliberately out of scope (see
  // `edit-preview-asset-resolution.md`, "Live refresh foundation").
  //
  // If the caller did not pass a `previewCtx`, the existing context
  // (if any) is preserved rather than cleared — the caller asked to
  // focus an already-open window, not to downgrade its state.
  const existing = openWindows.get(entry.lid);
  if (existing && !existing.closed) {
    if (assetContext?.previewCtx) {
      pushPreviewContextUpdate(entry.lid, assetContext.previewCtx);
    }
    existing.focus();
    return;
  }

  const child = window.open('', `pkc-entry-${entry.lid}`, 'width=720,height=600,menubar=no,toolbar=no');
  if (!child) return;

  openWindows.set(entry.lid, child);
  // Phase γ-A3:state machine へ window open を同期。
  notifyWindowsChanged();

  // Register the edit-mode Preview resolver context so the child's
  // `pkcRenderEntryPreview(lid, text)` call can resolve asset
  // references as the user types in the Source textarea.
  if (assetContext?.previewCtx) {
    previewResolverContexts.set(entry.lid, assetContext.previewCtx);
  }

  const openedAt = entry.updated_at;

  child.document.open();
  child.document.write(buildWindowHtml(entry, readonly, lightSource, assetContext, startEditing));
  child.document.close();

  // Listen for messages from child
  function handleMessage(e: MessageEvent): void {
    if (e.source !== child) return;
    if (!e.data) return;
    if (e.data.type === 'pkc-entry-save') {
      onSave(e.data.lid, e.data.title, e.data.body, openedAt);
      child!.postMessage({ type: 'pkc-entry-saved' }, '*');
      return;
    }
    if (e.data.type === 'pkc-entry-download-asset') {
      if (typeof e.data.assetKey === 'string' && onDownloadAsset) {
        onDownloadAsset(e.data.assetKey);
      }
      return;
    }
    if (e.data.type === 'pkc-entry-task-toggle') {
      if (typeof e.data.taskIndex === 'number' && onTaskToggle) {
        const logId = typeof e.data.logId === 'string' ? e.data.logId : null;
        onTaskToggle(e.data.lid, e.data.taskIndex, logId);
      }
      return;
    }
    if (e.data.type === 'pkc-open-viewer') {
      // γ-A5:editor window の「別窓プレビュー」ボタン → viewer role の
      // 子 window を分離する(spec §3.4 / §6.1)。flag OFF なら
      // `openViewerWindow` 側で no-op。
      openViewerWindow(entry, lightSource, assetContext, onDownloadAsset);
      return;
    }
    if (e.data.type === 'pkc-open-monitor') {
      // γ-A5:editor window の「TOC 別窓」ボタン → monitor role の子 window。
      if (e.data.kind === 'toc') openMonitorWindow('toc', entry);
      return;
    }
    if (e.data.type === 'pkc-window-geometry') {
      handleGeometryMessage(e.data);
      return;
    }
  }
  window.addEventListener('message', handleMessage);

  // Cleanup on child close.
  // 2026-05-03 (R2 / R3 防御): the interval is the only cleanup
  // path for `openWindows` / `previewResolverContexts` / the
  // message listener — if the host page (or a happy-dom test
  // tear-down) disposes `window` before the popup closes, this
  // callback used to throw `ReferenceError: window is not defined`
  // on the next tick. Guard with a `typeof` check so the leak
  // self-clears instead of crashing the CI worker after the test
  // environment is gone.
  const pollClose = setInterval(() => {
    if (typeof window === 'undefined') {
      clearInterval(pollClose);
      return;
    }
    if (child!.closed) {
      clearInterval(pollClose);
      openWindows.delete(entry.lid);
      previewResolverContexts.delete(entry.lid);
      window.removeEventListener('message', handleMessage);
      if (shellWindowLayoutPersistEnabled()) removeWindowLayout('editor', entry.lid);
      // Phase γ-A3:state machine へ window close を同期。
      notifyWindowsChanged();
    }
  }, 500);
}

/**
 * γ-A5(multi-window-vscode-extension-spec §3):entry を **viewer role**
 * (読み取り専用)の別 window で開く。
 *
 * editor window(`openEntryWindow` / `openWindows`)とは独立した
 * `viewerWindows` Map で管理するため、同じ entry を editor + viewer で
 * 同時に開ける。viewer は `buildWindowHtml` を `readonly = true` で呼ぶ
 * ── Edit ボタン / 自動編集開始は既存の readonly 経路で抑止される。
 * entry が保存されると `pushViewBodyUpdate`(editor + viewer 両投)で
 * viewer の `#body-view` が再描画される(spec §3.4「真のマルチウィンドウ」)。
 *
 * `shell.window_roles` flag が OFF のときは **no-op**(完全後方互換)。
 * viewer は未保存編集を持たないため reload guard(`notifyWindowsChanged`)
 * には連動させない。
 */
export function openViewerWindow(
  entry: Entry,
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
  onDownloadAsset?: (assetKey: string) => void,
): void {
  if (!shellWindowRolesEnabled()) return;

  const existing = viewerWindows.get(entry.lid);
  if (existing && !existing.closed) {
    existing.focus();
    return;
  }

  const child = window.open(
    '',
    `pkc-viewer-${entry.lid}`,
    'width=720,height=600,menubar=no,toolbar=no',
  );
  if (!child) return;

  viewerWindows.set(entry.lid, child);

  child.document.open();
  child.document.write(buildWindowHtml(entry, true, lightSource, assetContext, false));
  child.document.close();

  function handleMessage(e: MessageEvent): void {
    if (e.source !== child) return;
    if (!e.data) return;
    if (e.data.type === 'pkc-entry-download-asset') {
      if (typeof e.data.assetKey === 'string' && onDownloadAsset) {
        onDownloadAsset(e.data.assetKey);
      }
    }
    if (e.data.type === 'pkc-window-geometry') {
      handleGeometryMessage(e.data);
    }
  }
  window.addEventListener('message', handleMessage);

  const pollClose = setInterval(() => {
    if (typeof window === 'undefined') {
      clearInterval(pollClose);
      return;
    }
    if (child!.closed) {
      clearInterval(pollClose);
      viewerWindows.delete(entry.lid);
      window.removeEventListener('message', handleMessage);
      if (shellWindowLayoutPersistEnabled()) removeWindowLayout('viewer', entry.lid);
    }
  }, 500);
}

/**
 * γ-A5(spec §3):monitor role の子 window を開く。現状は `toc`(本文見出し
 * アウトラインのライブ panel)。editor / viewer の `openWindows` /
 * `viewerWindows` とは別の `monitorWindows` Map で管理する。`shell.window_roles`
 * flag が OFF のときは no-op(完全後方互換)。
 */
export function openMonitorWindow(kind: MonitorKind, entry: Entry): void {
  if (!shellWindowRolesEnabled()) return;

  const key = `${kind}:${entry.lid}`;
  const existing = monitorWindows.get(key);
  if (existing && !existing.win.closed) {
    existing.win.focus();
    return;
  }

  const child = window.open(
    '',
    `pkc-monitor-${kind}-${entry.lid}`,
    'width=320,height=560,menubar=no,toolbar=no',
  );
  if (!child) return;

  monitorWindows.set(key, { win: child, kind, lid: entry.lid });

  child.document.open();
  child.document.write(buildMonitorHtml(kind, entry, deriveMonitorItems(kind, entry)));
  child.document.close();

  function handleMessage(e: MessageEvent): void {
    if (e.source !== child) return;
    if (e.data && e.data.type === 'pkc-window-geometry') {
      handleGeometryMessage(e.data);
    }
  }
  window.addEventListener('message', handleMessage);

  const pollClose = setInterval(() => {
    if (typeof window === 'undefined') {
      clearInterval(pollClose);
      return;
    }
    if (child!.closed) {
      clearInterval(pollClose);
      monitorWindows.delete(key);
      window.removeEventListener('message', handleMessage);
      if (shellWindowLayoutPersistEnabled()) removeWindowLayout('monitor', entry.lid, kind);
    }
  }, 500);
}

/**
 * γ-A5:monitor window の HTML を組む。テーマ CSS 変数を親から引き継ぎ、
 * inline script が `pkc-monitor-update` を受けて panel を再描画する。初期
 * データは HTML へ JSON literal で埋め込む(`<` は `\\u003c` へ escape し
 * inline script の閉じ漏れを防ぐ)。
 */
function buildMonitorHtml(
  kind: MonitorKind,
  entry: Entry,
  items: MonitorItem[],
): string {
  const heading = kind === 'toc' ? `TOC — ${entry.title}` : 'Monitor';
  const initialJson = JSON.stringify(items).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeForAttr(heading)}</title>
<style>
:root {
${getParentCssVars()}
}
* { box-sizing: border-box; }
body { margin:0; font-family:var(--font-sans); background:var(--c-bg); color:var(--c-fg); }
.pkc-monitor-head { padding:8px 12px; border-bottom:1px solid var(--c-border); font-weight:600; font-size:13px; position:sticky; top:0; background:var(--c-bg); }
#monitor-panel { padding:6px 2px; }
.pkc-monitor-item { padding:3px 8px; font-size:13px; line-height:1.5; color:var(--c-body-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pkc-monitor-empty { padding:14px 12px; color:var(--c-muted); font-size:12px; }
</style>
</head>
<body>
<div class="pkc-monitor-head">${escapeForAttr(heading)}</div>
<div id="monitor-panel"></div>
<script>
var monitorKind = ${escapeForScript(kind)};
function renderMonitor(items) {
  var panel = document.getElementById('monitor-panel');
  panel.textContent = '';
  if (!items || items.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'pkc-monitor-empty';
    empty.textContent = '(見出しなし)';
    panel.appendChild(empty);
    return;
  }
  for (var i = 0; i < items.length; i++) {
    var row = document.createElement('div');
    row.className = 'pkc-monitor-item';
    row.style.paddingLeft = (8 + (items[i].level - 1) * 14) + 'px';
    row.textContent = items[i].text;
    panel.appendChild(row);
  }
}
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'pkc-monitor-update' && e.data.kind === monitorKind) {
    renderMonitor(e.data.items);
  }
});
renderMonitor(${initialJson});
${shellWindowLayoutPersistEnabled() ? geometryReportScript('monitor', entry.lid, kind) : ''}
</script>
</body>
</html>`;
}

/**
 * Notify a child window of a conflict.
 *
 * γ-A5-5 §5.3:`diff`(`DiffRow[]`)を渡すと子 window が banner の下に
 * 2-pane 行 diff を描画する。HTML ではなくデータを送る(canvas 前方互換、
 * spec §11.3)。
 */
export function notifyConflict(
  lid: string,
  message: string,
  diff?: DiffRow[],
): void {
  const child = openWindows.get(lid);
  if (child && !child.closed) {
    child.postMessage(
      { type: 'pkc-entry-conflict', message, diff: diff ?? null },
      '*',
    );
  }
}

function escapeForAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeForScript(text: string): string {
  return JSON.stringify(text);
}

/**
 * γ-A5-3:子 window 内に仕込む geometry 報告 IIFE。load / resize / blur /
 * beforeunload で自 window の screenX/Y/outerW/H を親へ postMessage し、
 * 親が `window-layout-store` へ保存する(spec §4)。`<script>` の中身として
 * 埋め込む(タグは含まない)。flag OFF のときは builder 側で埋め込まない。
 */
function geometryReportScript(
  role: string,
  lid: string,
  monitorKind: string | null,
): string {
  return `
(function () {
  function pkcReportGeo() {
    if (!window.opener) return;
    try {
      window.opener.postMessage({
        type: 'pkc-window-geometry',
        role: ${escapeForScript(role)},
        lid: ${escapeForScript(lid)},
        monitorKind: ${monitorKind === null ? 'null' : escapeForScript(monitorKind)},
        geometry: {
          screenX: window.screenX, screenY: window.screenY,
          outerWidth: window.outerWidth, outerHeight: window.outerHeight
        }
      }, '*');
    } catch (e) { /* opener gone */ }
  }
  window.addEventListener('load', pkcReportGeo);
  window.addEventListener('resize', pkcReportGeo);
  window.addEventListener('blur', pkcReportGeo);
  window.addEventListener('beforeunload', pkcReportGeo);
})();`;
}

/**
 * γ-A5-3:子 window から届いた `pkc-window-geometry` message を layout
 * store へ反映する。flag OFF なら no-op。`upsertWindowLayout` が shape を
 * 検証するため、不正 message は store 側で弾かれる。
 */
function handleGeometryMessage(data: unknown): void {
  if (!shellWindowLayoutPersistEnabled()) return;
  if (!data || typeof data !== 'object') return;
  upsertWindowLayout(data as WindowLayoutEntry);
}

/**
 * Read computed CSS variable values from the parent document's :root
 * so the child window inherits the exact same theme.
 */
function getParentCssVars(): string {
  const vars = [
    '--c-bg', '--c-fg', '--c-accent', '--c-accent-dim', '--c-accent-fg',
    '--c-border', '--c-hover', '--c-danger', '--c-muted', '--c-surface',
    '--c-success', '--c-warn', '--c-warn-fg',
    '--c-text', '--c-text-dim', '--c-body-text', '--c-info',
    '--font-sans', '--font-mono',
    '--radius', '--radius-lg', '--radius-sm',
    '--shadow-sm', '--glow', '--transition-fast',
    // Syntax-highlight token colors — forward them so fenced code
    // blocks inside a popped-out entry window match the main-app
    // palette (see styles/base.css and
    // docs/development/markdown-code-block-highlighting.md).
    '--c-tok-comment', '--c-tok-string', '--c-tok-keyword',
    '--c-tok-number', '--c-tok-builtin', '--c-tok-variable',
    '--c-tok-type', '--c-tok-attr', '--c-tok-tag', '--c-tok-meta',
    '--c-tok-ins', '--c-tok-del', '--c-tok-hunk',
  ];
  // PR-BB hotfix (2026-05-06、user 報告「ダブルクリックで TEXT エントリ
  // 開いたら、テーマ色が反映されていなかった」):
  //
  // 旧:`getComputedStyle(document.documentElement)` で `<html>` から
  // var を読んでいた。しかしテーマの override は `#pkc-root[data-pkc-theme="..."]`
  // にあり、`<html>` 自体の computed value は :root default(dark)
  // のまま → 子 window が常に dark で開く。
  //
  // 新:`#pkc-root` 要素から読み、`data-pkc-theme` の値も同伴する。
  // 子 window 側で同 attribute を再現することで、token に加えて
  // theme-class scoped CSS rule(scanline 等)も届く。
  const root = document.querySelector('#pkc-root') ?? document.documentElement;
  const style = getComputedStyle(root);
  const lines: string[] = [];
  for (const v of vars) {
    const val = style.getPropertyValue(v).trim();
    if (val) lines.push(`  ${v}: ${val};`);
  }
  return lines.join('\n');
}

/**
 * PR-BB (2026-05-06):親 window の `data-pkc-theme` 属性値を読む。
 * 子 window 側 `<html>` に同じ値を stamp して、scoped CSS rule
 * (`#pkc-root[data-pkc-theme="dark"] .X`)も子で発火するようにする。
 * 未設定(system 任せ)の場合は空文字を返す。
 */
function getParentDataPkcTheme(): string {
  const root = document.querySelector('#pkc-root');
  if (!root) return '';
  return root.getAttribute('data-pkc-theme') ?? '';
}

/**
 * Render the view body HTML based on entry archetype.
 * - text/textlog/generic/opaque: markdown render (using resolved body when available)
 * - attachment: MIME-aware preview card
 * - todo: status/date/description card
 * - form: key-value card
 * - folder: markdown render (has no special body)
 */
function renderViewBody(
  entry: Entry,
  lightSource: boolean,
  ctx?: EntryWindowAssetContext,
): string {
  switch (entry.archetype) {
    case 'attachment':
      return renderAttachmentCard(entry.body, lightSource, ctx);
    case 'todo':
      return renderTodoCard(entry.body);
    case 'form':
      return renderFormCard(entry.body);
    case 'textlog': {
      // TEXTLOG: render as a day-grouped document tree matching the
      // live viewer (see `buildTextlogViewBodyHtml`). Each log article
      // carries the `data-pkc-log-id` marker the child-side task-toggle
      // click handler relies on.
      return buildTextlogViewBodyHtml(entry.lid, entry.body);
    }
    case 'spreadsheet': {
      // user direction 2026-06-03:multi-window の閲覧 view body は embed
      // builder を使う(toolbar を含まない、popup window は parent の
      // dispatcher と離れているため action button が機能しない)。
      const el = renderSpreadsheetEmbedBody(entry);
      syncDomPropertiesToHtml(el);
      return el.outerHTML;
    }
    default: {
      // Text / generic: use the pre-resolved body when the parent
      // provided one, so that `![](asset:…)` embeds and
      // `[](asset:…)` chips already appear as inline data URIs /
      // fragment-href chips by the time markdown-it sees them.
      const source = ctx?.resolvedBody != null ? ctx.resolvedBody : entry.body;
      // PR-XX2-fix (2026-05-07、user 報告):popup 別窓 split editor の
      // block 同期が button 押下後も無動作だった root cause。preview HTML
      // に `data-pkc-source-line` anchor が無かったため `pkcFindPreview-
      // ElementForLine` が target 0 件で no-op していた。text archetype
      // は popup でも split editor (entry.archetype === 'text' で確定)
      // なので、anchor を常時 emit して sync を機能させる。
      //
      // pgc-91(audit pgc-77 Gap-6 + Gap-7):S4 view body 初期 render path
      // にも frontmatter strip + extractVars + headingNumber を thread。
      // canonical S1 と同経路。
      // pgc-96(audit pgc-77 Gap-15):features 層 DOM op を inject。
      const raw = source || '';
      const vars = extractVars(raw);
      const stripped = parseFrontmatter(raw).body;
      const headingNumber = extractHeadingNumberConfig(raw);
      const containerId = currentContainerRef?.meta?.container_id ?? '';
      let html = renderMarkdown(stripped, {
        sourceLineAnchors: true,
        vars,
        headingNumber,
        currentContainerId: containerId,
      });
      // pgc-98(audit pgc-77 Gap-8):raw を thread して document globals 反映。
      html = injectFeaturesDomOps(html, entry.lid, currentContainerRef, raw);
      return html || '<em style="color:var(--c-muted)">(empty)</em>';
    }
  }
}

/**
 * Render the attachment view pane.
 *
 * The returned HTML contains the file info card, a MIME-specific
 * preview placeholder, an action row (Open / Download), and explicit
 * fallback messages for Light mode, missing data and unsupported MIME.
 *
 * Actual preview wiring — blob URL creation, iframe srcdoc, `<img>`
 * data URI, chip click interception — runs from the child window's
 * inline `<script>`, which reads the base64 data that `buildWindowHtml`
 * embeds via `pkcAttachmentData` (see bottom of the generated HTML).
 */
function renderAttachmentCard(
  body: string,
  lightSource: boolean,
  ctx?: EntryWindowAssetContext,
): string {
  const att = parseAttachmentBody(body);
  const sizeStr = att.size != null ? formatFileSize(att.size) : 'unknown';
  const ext = att.name.includes('.') ? att.name.split('.').pop() : '—';

  if (!att.name) {
    return `<div class="pkc-ew-card" data-pkc-ew-card="attachment">
  <div class="pkc-ew-empty" data-pkc-region="attachment-empty">No file attached.</div>
</div>`;
  }

  // Resolve data availability. `ctx?.attachmentData` is the only way
  // the child ever sees the bytes — we do NOT trust `att.data` from
  // the body because the new format stores data in container.assets.
  const hasData = !!ctx?.attachmentData && ctx.attachmentData.length > 0;
  const previewType = classifyPreviewType(att.mime);
  const svg = isSvg(att.mime);

  // ── Info card ──
  const infoCard = `<div class="pkc-ew-card" data-pkc-ew-card="attachment">
  <div class="pkc-ew-card-icon">📎</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>File:</strong> <span>${escapeForHtml(att.name)}</span></div>
    <div class="pkc-ew-field"><strong>Type:</strong> <span>${escapeForHtml(att.mime)}</span></div>
    <div class="pkc-ew-field"><strong>Size:</strong> <span>${escapeForHtml(sizeStr)}</span></div>
    <div class="pkc-ew-field"><strong>Ext:</strong> <span>${escapeForHtml(ext ?? '—')}</span></div>
    ${att.asset_key ? `<div class="pkc-ew-field"><strong>Asset:</strong> <span>${escapeForHtml(att.asset_key)}</span></div>` : ''}
  </div>
</div>`;

  // ── Fallback reason (data unavailable) ──
  if (!hasData) {
    const reason = lightSource
      ? 'This is a Light export — attachment file data is not included. Re-export without Light mode to preview or download this file.'
      : att.asset_key
        ? 'File data is not available in this container. The asset may have been removed.'
        : 'File data is not available.';
    return `${infoCard}
<div class="pkc-ew-preview-reason" data-pkc-region="attachment-preview-reason">${escapeForHtml(reason)}</div>`;
  }

  // ── Preview area (populated by child-side script) ──
  const previewHtml = renderPreviewShell(previewType, att.mime, att.name, svg);

  // ── Action row ──
  const openBtnHtml = (previewType === 'image' || previewType === 'pdf' || previewType === 'video')
    ? `<button type="button" class="pkc-btn" data-pkc-ew-action="open-attachment">${previewTypeOpenLabel(previewType)}</button>`
    : '';
  const downloadBtnHtml = `<button type="button" class="pkc-btn" data-pkc-ew-action="download-attachment">📥 Download</button>`;
  const actionRow = `<div class="pkc-ew-action-row" data-pkc-region="attachment-actions">${openBtnHtml}${downloadBtnHtml}</div>`;

  return `${infoCard}
${previewHtml}
${actionRow}`;
}

/**
 * Build the preview shell DOM. Base64 data injection and blob URL
 * wiring happen in the child-side script (`pkcAttachmentData` + the
 * inline `bootAttachmentPreview()` function). The shell carries the
 * MIME category on `data-pkc-ew-preview-type` so the script can
 * dispatch without re-classifying.
 */
function renderPreviewShell(
  previewType: ReturnType<typeof classifyPreviewType>,
  mime: string,
  name: string,
  svg: boolean,
): string {
  const safeName = escapeForHtml(name);
  const safeMime = escapeForAttr(mime);
  const base = `class="pkc-ew-preview" data-pkc-region="attachment-preview" data-pkc-ew-preview-type="${svg ? 'svg' : previewType}" data-pkc-ew-mime="${safeMime}" data-pkc-ew-name="${escapeForAttr(name)}"`;

  switch (previewType) {
    case 'image':
      return `<div ${base}>
  <img class="pkc-ew-preview-img" alt="${escapeForAttr(name)}" data-pkc-ew-slot="img" />
</div>`;
    case 'pdf':
      return `<div ${base}>
  <iframe class="pkc-ew-preview-pdf" title="PDF preview: ${safeName}" data-pkc-ew-slot="iframe"></iframe>
</div>`;
    case 'video':
      return `<div ${base}>
  <video class="pkc-ew-preview-video" controls preload="metadata" data-pkc-ew-slot="video"></video>
</div>`;
    case 'audio':
      return `<div ${base}>
  <audio class="pkc-ew-preview-audio" controls preload="metadata" data-pkc-ew-slot="audio"></audio>
</div>`;
    case 'html':
      // HTML and SVG are both sandboxed. `pkc-ew-preview-type` uses
      // `svg` vs `html` so the child script can decide whether to
      // hand the bytes to `srcdoc` as UTF-8 text.
      return `<div ${base}>
  <iframe class="pkc-ew-preview-html" title="${svg ? 'SVG' : 'HTML'} preview: ${safeName}" data-pkc-ew-slot="iframe"></iframe>
  <div class="pkc-ew-sandbox-note" data-pkc-ew-slot="sandbox-note"></div>
</div>`;
    case 'none':
    default:
      return `<div ${base}>
  <div class="pkc-ew-preview-none">No inline preview for this file type.</div>
</div>`;
  }
}

function previewTypeOpenLabel(previewType: ReturnType<typeof classifyPreviewType>): string {
  switch (previewType) {
    case 'image': return '🖼 Open image in new tab';
    case 'pdf':   return '📄 Open PDF in new tab';
    case 'video': return '🎬 Open video in new tab';
    default:      return 'Open in new tab';
  }
}

function renderTodoCard(body: string): string {
  const todo = parseTodoBody(body);
  const statusIcon = todo.status === 'done' ? '✅' : '⬜';
  const statusLabel = todo.status === 'done' ? 'Done' : 'Open';
  const dateHtml = todo.date
    ? `<div class="pkc-ew-field"><strong>Date:</strong> <span${isTodoPastDue(todo) ? ' style="color:var(--c-danger)"' : ''}>${escapeForHtml(formatTodoDate(todo.date))}</span></div>`
    : '';
  const archivedHtml = todo.archived
    ? '<div class="pkc-ew-field"><span style="color:var(--c-warn)">Archived</span></div>'
    : '';
  return `<div class="pkc-ew-card" data-pkc-ew-card="todo">
  <div class="pkc-ew-card-icon">${statusIcon}</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>Status:</strong> <span>${statusLabel}</span></div>
    ${dateHtml}
    ${archivedHtml}
    <div class="pkc-ew-field"><strong>Description:</strong></div>
    <div class="pkc-ew-desc">${escapeForHtml(todo.description || '(empty)')}</div>
  </div>
</div>`;
}

function renderFormCard(body: string): string {
  const form = parseFormBody(body);
  const checkedLabel = form.checked ? '✅ Yes' : '⬜ No';
  return `<div class="pkc-ew-card" data-pkc-ew-card="form">
  <div class="pkc-ew-card-icon">📋</div>
  <div class="pkc-ew-card-fields">
    <div class="pkc-ew-field"><strong>Name:</strong> <span>${escapeForHtml(form.name || '(empty)')}</span></div>
    <div class="pkc-ew-field"><strong>Note:</strong> <span>${escapeForHtml(form.note || '(empty)')}</span></div>
    <div class="pkc-ew-field"><strong>Checked:</strong> <span>${checkedLabel}</span></div>
  </div>
</div>`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeForHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Sync DOM properties to HTML attributes/content so that `.outerHTML`
 * serializes form element values correctly.
 *
 * Background: presenters set `textarea.value`, `select.value`, and
 * `checkbox.checked` as DOM properties. These are NOT reflected in
 * `.outerHTML` output. Since entry-window injects editor HTML via
 * `document.write(outerHTML)`, the values are lost without this step.
 *
 * This is not a bug workaround — it is the serialization contract for
 * any DOM tree that will be injected into entry-window via outerHTML.
 *
 * If new form element types are added to presenters (e.g. radio,
 * contenteditable), this function must be extended.
 */
function syncDomPropertiesToHtml(root: HTMLElement): void {
  for (const ta of root.querySelectorAll('textarea')) {
    ta.textContent = ta.value;
  }
  for (const sel of root.querySelectorAll('select')) {
    for (const opt of sel.options) {
      if (opt.value === sel.value) opt.setAttribute('selected', '');
      else opt.removeAttribute('selected');
    }
  }
  for (const chk of root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) {
    if (chk.checked) chk.setAttribute('checked', '');
    else chk.removeAttribute('checked');
  }
}

function buildWindowHtml(
  entry: Entry,
  readonly: boolean,
  lightSource = false,
  assetContext?: EntryWindowAssetContext,
  startEditing = false,
): string {
  const escapedTitle = escapeForAttr(entry.title || '');
  // pgc-141 wave-δ #15:archetype → icon の inline 表(child window は
  // module graph を持たないため hardcoded、`adapter/ui/renderer.ts` の
  // archetypeIcon と同じ map を mirror)。
  const entryArchetypeIcon = (arch: string): string => {
    switch (arch) {
      case 'text':       return '📝';
      case 'textlog':    return '📋';
      case 'todo':       return '☑';
      case 'attachment': return '📎';
      case 'folder':     return '📁';
      case 'form':       return '📋';
      default:           return '○';
    }
  };
  const renderedBody = renderViewBody(entry, lightSource, assetContext);
  // Static TOC HTML for TEXT / TEXTLOG — the extractor returns `[]`
  // for other archetypes so this is just `''` there. Every anchor
  // is a native `href="#id"` so scroll works without any JS.
  // 2026-05-03: detached entry-window renders TEXTLOG content with
  // `order: 'asc'` (line ~392); pass the same order to the TOC builder
  // so the TOC top entry matches the visible top of the document.
  const tocHtml = renderStaticTocHtml(
    extractTocFromEntry(entry as Entry, { order: 'asc' }),
  );
  const parentVars = getParentCssVars();

  // Generate archetype-specific editor body for structured types.
  // For textlog/todo/form, use the presenter to produce a structured
  // editor matching the center pane. For TEXT, use a split view that
  // mirrors the center pane TEXT editor (A-2, 2026-04-14). All other
  // non-structured archetypes (attachment / folder / generic / opaque)
  // keep the existing Source/Preview tab bar.
  const structuredArchetypes = new Set(['textlog', 'todo', 'form', 'spreadsheet']);
  const useStructuredEditor = structuredArchetypes.has(entry.archetype);
  // A-2 (USER_REQUEST_LEDGER S-13): live split editor for TEXT only.
  // Reuses the center pane `.pkc-text-split-editor` grid. tab bar is
  // hidden when this is on; preview updates as the user types.
  //
  // pgc-140 wave-δ #14(user bug report 2026-05-24「マルチウィンドウ時の
  // Split View は不要とは言えないがデフォではない」):flag ON 時は text
  // でも split を default OFF にし、従来 Source / Preview tab bar を出す
  // (user 側で split したい場合は別途 toggle で復活、本 PR は default
  // 切替のみ実装)。
  const useSplitEditor = entry.archetype === 'text' && !shellEntryWindowSplitDefaultOffEnabled();
  let editorBodyHtml = '';
  if (useStructuredEditor) {
    const presenterMap: Record<string, { renderEditorBody: (e: Entry) => HTMLElement }> = {
      textlog: textlogPresenter,
      todo: todoPresenter,
      form: formPresenter,
      // user direction 2026-06-02「マルチウィンドウの編集画面もできてない」 fix
      spreadsheet: spreadsheetPresenter,
    };
    const presenter = presenterMap[entry.archetype];
    if (presenter) {
      const el = presenter.renderEditorBody(entry);
      syncDomPropertiesToHtml(el);
      editorBodyHtml = el.outerHTML;
    }
  }

  // Attachment-preview boot data. Only attachment archetype entries
  // carry per-entry bytes (`attachmentData`); everything else leaves
  // this as an empty object and the boot script becomes a no-op.
  const attachmentData = entry.archetype === 'attachment' && assetContext?.attachmentData
    ? assetContext.attachmentData
    : '';
  const attachmentMime = entry.archetype === 'attachment'
    ? parseAttachmentBody(entry.body).mime
    : '';
  const sandboxAllow = (entry.archetype === 'attachment' && assetContext?.sandboxAllow) ?? [];

  // PR-BB (2026-05-06):親の data-pkc-theme を子 <html> にも stamp。
  // 子 window が同 token + 同 theme attribute を持つので、selector
  // (`[data-pkc-theme="dark"] .X`)経由の rule も発火可能。
  const parentTheme = getParentDataPkcTheme();
  const themeAttr = parentTheme ? ` data-pkc-theme="${parentTheme}"` : '';

  return `<!DOCTYPE html>
<html lang="ja"${themeAttr}>
<head>
<meta charset="utf-8">
<title>${escapedTitle} — PKC2</title>
<style>
/* ── Theme: inherited from parent window ── */
:root {
${parentVars}
  color-scheme: dark;
}
@media (prefers-color-scheme: light) {
  :root { color-scheme: light; }
}

/* ── Reset ── */
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--font-sans);
  color: var(--c-fg);
  background: var(--c-bg);
  font-size: 13px;
  line-height: 1.4;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* ── Layout ── */
.pkc-window-content {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1rem;
  /* Slice C: flex column so edit-pane (data-pkc-wide) can flex:1 fill height. */
  display: flex;
  flex-direction: column;
}

/* ── View title row (mirrors center pane) ── */
.pkc-view-title-row {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  margin-bottom: 0.4rem;
}
.pkc-view-title {
  font-size: 1.1rem;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  word-break: break-word;
}
.pkc-archetype-label {
  font-size: 0.65rem;
  padding: 0.05rem 0.3rem;
  border-radius: var(--radius);
  background: var(--c-border);
  color: var(--c-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── View body (mirrors center pane) ── */
.pkc-view-body {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg, 4px);
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  line-height: 1.5;
}

/* ── Markdown rendered (mirrors center pane) ── */
.pkc-md-rendered {
  font-family: var(--font-sans);
  white-space: normal;
  /* Pin the same 1.35 baseline as main base.css .pkc-md-rendered,
     so prose density cannot drift from the center pane. */
  line-height: 1.35;
}
.pkc-md-rendered h1, .pkc-md-rendered h2, .pkc-md-rendered h3,
.pkc-md-rendered h4, .pkc-md-rendered h5, .pkc-md-rendered h6 {
  margin: 0.5em 0 0.25em; line-height: 1.3;
}
.pkc-md-rendered h1 { font-size: 1.3rem; }
.pkc-md-rendered h2 { font-size: 1.15rem; }
.pkc-md-rendered h3 { font-size: 1.0rem; }
.pkc-md-rendered p { margin: 0.35em 0; }
.pkc-md-rendered ul, .pkc-md-rendered ol { margin: 0.35em 0; padding-left: 1.5em; }
.pkc-md-rendered li { margin: 0.15em 0; }
.pkc-md-rendered code {
  background: var(--c-bg); padding: 0.1em 0.3em;
  border-radius: 2px; font-family: var(--font-mono); font-size: 0.85em;
}
.pkc-md-rendered pre {
  background: var(--c-bg); padding: 0.5em 0.75em;
  border-radius: 2px; overflow-x: auto; margin: 0.35em 0;
}
.pkc-md-rendered pre code { background: none; padding: 0; font-size: 0.8rem; }
/* Syntax highlight tokens — inherits colors from the main window
   via getParentCssVars(). Kept in sync with styles/base.css. */
.pkc-md-rendered pre code .pkc-tok-comment { color: var(--c-tok-comment); font-style: italic; }
.pkc-md-rendered pre code .pkc-tok-string { color: var(--c-tok-string); }
.pkc-md-rendered pre code .pkc-tok-keyword { color: var(--c-tok-keyword); font-weight: 600; }
.pkc-md-rendered pre code .pkc-tok-number { color: var(--c-tok-number); }
.pkc-md-rendered pre code .pkc-tok-builtin { color: var(--c-tok-builtin); }
.pkc-md-rendered pre code .pkc-tok-variable { color: var(--c-tok-variable); }
.pkc-md-rendered pre code .pkc-tok-type { color: var(--c-tok-type); }
.pkc-md-rendered pre code .pkc-tok-attr { color: var(--c-tok-attr); }
.pkc-md-rendered pre code .pkc-tok-punct { color: var(--c-text-dim); }
.pkc-md-rendered pre code .pkc-tok-regex { color: var(--c-tok-string); }
.pkc-md-rendered pre code .pkc-tok-tag { color: var(--c-tok-tag); }
.pkc-md-rendered pre code .pkc-tok-meta { color: var(--c-tok-meta); }
.pkc-md-rendered pre code .pkc-tok-ins { color: var(--c-tok-ins); }
.pkc-md-rendered pre code .pkc-tok-del { color: var(--c-tok-del); }
.pkc-md-rendered pre code .pkc-tok-hunk { color: var(--c-tok-hunk); font-weight: 600; }
.pkc-md-rendered blockquote {
  border-left: 3px solid var(--c-accent); padding-left: 0.75em;
  margin: 0.35em 0; color: var(--c-muted);
}
.pkc-md-rendered hr { border: none; border-top: 1px solid var(--c-border); margin: 0.5em 0; }
.pkc-md-rendered img { max-width: 100%; height: auto; }
.pkc-md-rendered a { color: var(--c-accent); text-decoration: underline; }
.pkc-md-rendered table { border-collapse: collapse; margin: 0.35em 0; }
.pkc-md-rendered th, .pkc-md-rendered td { border: 1px solid var(--c-border); padding: 0.3em 0.5em; }
/* Two-column view layout with a sticky TOC sidebar.
   The TOC sidebar pins to the top of the scroll container
   (.pkc-window-content scrolls, not body), so the outline stays
   on screen while the reader scrolls through long TEXT / TEXTLOG
   bodies. Clicking a TOC link uses native anchor scrolling —
   no JS needed. Falls back to a single column below 640px so
   the sidebar does not steal horizontal space on narrow windows. */
#view-pane[data-pkc-has-toc="true"] {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}
.pkc-toc-sidebar {
  flex: 0 0 14rem;
  position: sticky;
  /* Stick just below the top padding of .pkc-window-content so the
     TOC header is not clipped by the scroll container's padding. */
  top: 0.25rem;
  align-self: flex-start;
  max-height: calc(100vh - 2rem);
  overflow-y: auto;
}
.pkc-toc-sidebar .pkc-toc.pkc-toc-preview {
  /* Inside the sidebar the nav fills the column and does not need
     its own bottom margin (the sidebar itself provides the gap). */
  margin: 0;
}
.pkc-viewer-main {
  flex: 1 1 auto;
  min-width: 0;
}
@media (max-width: 640px) {
  #view-pane[data-pkc-has-toc="true"] { flex-direction: column; }
  .pkc-toc-sidebar {
    flex: 0 0 auto;
    position: static;
    max-height: none;
    width: 100%;
  }
}

/* Preview-surface Table of Contents. Mirrors base.css .pkc-toc
   so the popped-out preview exposes the same heading / day / log
   navigation the right pane carries. Anchors are native href to
   #id, so click scrolls via the browsers default anchor behaviour. */
.pkc-toc.pkc-toc-preview {
  padding: 0.35rem 0.5rem;
  margin: 0 0 0.75rem;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-surface);
  font-size: 0.8rem;
}
.pkc-toc-preview .pkc-toc-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--c-muted);
  margin-bottom: 0.2rem;
}
.pkc-toc-preview .pkc-toc-list { list-style: none; margin: 0; padding: 0; }
.pkc-toc-preview .pkc-toc-item { margin: 0; padding: 0; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="2"] { padding-left: 0.75rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="3"] { padding-left: 1.5rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="4"] { padding-left: 2.25rem; }
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-level="5"] { padding-left: 3rem; }
.pkc-toc-preview .pkc-toc-link {
  display: block;
  padding: 0.08rem 0.25rem;
  color: var(--c-fg);
  text-decoration: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-radius: var(--radius-sm);
}
.pkc-toc-preview .pkc-toc-link:hover,
.pkc-toc-preview .pkc-toc-link:focus-visible {
  background: var(--c-border);
  color: var(--c-accent);
}
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link,
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="log"] > .pkc-toc-link {
  color: var(--c-muted);
  font-family: var(--font-mono);
  font-size: 0.72rem;
}
.pkc-toc-preview .pkc-toc-item[data-pkc-toc-kind="day"] > .pkc-toc-link {
  font-weight: 600;
}

/* ── Built-in mermaid placeholder + rendered + error(pgc-203 wave-α'
   polish #24、S4 mirror in pgc-204 wave-α' polish #25 Gap-13 closure):
   base.css の .pkc-mermaid-* 4 rule を S4 inline style にも mirror、
   3 surface(S1 / S2 / S4)CSS parity 完備。editor.mermaid_render_enabled
   ON 時、entry-window で開いた entry にも mermaid fence の SVG render が
   styled で表示される。 */
.pkc-mermaid-placeholder {
  display: block;
  margin: var(--space-3) 0;
  border: 1px dashed var(--c-border);
  border-radius: var(--radius-sm);
  padding: var(--space-1);
  background: var(--c-bg);
}
.pkc-mermaid-source {
  margin: 0;
  padding: var(--space-2);
  background: var(--c-surface);
  color: var(--c-fg-dim);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  overflow-x: auto;
}
.pkc-mermaid-rendered {
  display: block;
  margin: var(--space-3) 0;
  padding: var(--space-2);
  text-align: center;
  background: var(--c-bg);
}
.pkc-mermaid-rendered svg {
  max-width: 100%;
  height: auto;
}
.pkc-mermaid-error {
  margin: 0 0 var(--space-1);
  padding: var(--space-1) var(--space-2);
  background: rgba(229, 62, 62, 0.12);
  color: var(--c-fg);
  border-left: 3px solid #e53e3e;
  font-size: var(--fs-sm);
}

/* ── Task list polish: hanging indent + completed styling.
   Mirrors base.css .pkc-md-rendered task rules so the popped entry
   window renders task lists identically to the main pane. */
.pkc-md-rendered li.pkc-task-item {
  list-style: none;
  margin-left: -1.2em;
  padding-left: 1.5em;
  position: relative;
}
.pkc-md-rendered li.pkc-task-item::marker { content: ''; }
.pkc-md-rendered li.pkc-task-item > .pkc-task-checkbox,
.pkc-md-rendered li.pkc-task-item > p:first-child > .pkc-task-checkbox:first-child {
  position: absolute;
  left: 0.15em;
  top: 0.3em;
  margin: 0;
}
.pkc-md-rendered .pkc-task-checkbox { cursor: pointer; accent-color: var(--c-accent); }
.pkc-md-rendered li.pkc-task-item:has(> .pkc-task-checkbox:checked) {
  color: var(--c-muted);
  text-decoration: line-through;
}
.pkc-md-rendered li.pkc-task-item:has(> p:first-child > .pkc-task-checkbox:checked) > p:first-child {
  color: var(--c-muted);
  text-decoration: line-through;
}
.pkc-md-rendered li.pkc-task-item ul,
.pkc-md-rendered li.pkc-task-item ol { color: var(--c-fg); text-decoration: none; }
${readonly ? '.pkc-task-checkbox { pointer-events: none; cursor: default; opacity: 0.6; }' : ''}

/* ── Editor (mirrors center pane) ── */
.pkc-editor { max-width: 720px; }
/* Slice C: non-structured edit pane follows pane/viewport instead of 720px cap.
   See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C. */
.pkc-editor[data-pkc-wide="true"] {
  max-width: none;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pkc-editor-title-row {
  display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.35rem;
}
.pkc-editor-title {
  flex: 1; font-size: 1rem; font-family: var(--font-sans);
  padding: 0.25rem 0.5rem; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-bg); color: var(--c-fg); outline: none;
}
.pkc-editor-title:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 1px var(--c-accent), var(--glow);
}
.pkc-editor-body {
  display: block; width: 100%; font-family: var(--font-mono); font-size: 0.8rem;
  padding: 0.4rem 0.5rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  margin-bottom: 0.5rem; resize: vertical; line-height: 1.5; outline: none;
  min-height: 120px; background: var(--c-bg); color: var(--c-fg);
}
/* Slice C: non-structured dblclick editor textarea follows viewport height.
   flex:1 fills the edit-pane column; min-height ensures usable size when
   the pane column is short (e.g., on very small windows).
   See docs/development/ui-readability-and-editor-sizing-hardening.md §3-C. */
.pkc-editor-body[data-pkc-viewport-sized="true"] {
  flex: 1;
  min-height: calc(100vh - 12rem);
}
.pkc-editor-body:focus {
  border-color: var(--c-accent);
  box-shadow: 0 0 0 1px var(--c-accent), var(--glow);
}

/* ── TEXT split editor (A-2, 2026-04-14) ──
   Mirrors base.css .pkc-text-split-editor so the entry-window TEXT
   editor feels identical to the center pane split view. Resize
   handle is rendered but non-interactive in the child window for
   the MVP — center pane resize logic lives in parent action-binder
   and is intentionally not replicated here. */
.pkc-text-split-editor {
  display: grid;
  grid-template-columns: 1fr 6px 1fr;
  gap: 0;
  min-height: 200px;
  flex: 1;
}
.pkc-text-split-editor .pkc-editor-body {
  margin-bottom: 0;
  min-height: 200px;
  height: 100%;
}
.pkc-text-split-resize-handle {
  width: 6px;
  background: var(--c-border);
  border-radius: 3px;
  /* PR-XX2 (2026-05-07、user 訂正指示):⇄ toggle button 配置のため
     positioning context に。中央 absolute 配置 = block 同期 ON/OFF。 */
  position: relative;
}
/* PR-XX2 ⇄ toggle button(child window 限定の inline CSS。
   center pane は base.css の .pkc-btn-toggle-sync を使用)。 */
.pkc-btn-toggle-sync {
  position: absolute;
  top: 0.25rem;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--c-border);
  border-radius: 50%;
  background: var(--c-surface);
  color: var(--c-fg);
  font-size: 0.8125rem;
  line-height: 1;
  cursor: pointer;
  z-index: 1;
}
.pkc-btn-toggle-sync[data-pkc-sync-state="on"] {
  background: var(--c-accent);
  border-color: var(--c-accent);
  color: #fff;
}
.pkc-btn-toggle-sync[data-pkc-sync-state="off"] { opacity: 0.6; }
.pkc-text-edit-preview {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 0.5rem;
  overflow-y: auto;
  background: var(--c-surface);
  color: var(--c-fg);
  font-size: 0.85rem;
  line-height: 1.5;
  min-height: 200px;
}
/* PR-XX2-fix (2026-05-07、user 報告 popup sync 無動作):
   data-pkc-active-source highlight rule は base.css にのみ存在し、
   popup は inline style しか持たないため marker が見えなかった。
   center pane と等価な visual を inline で再現する。 */
.pkc-text-edit-preview [data-pkc-active-source]:not(table):not(tr) {
  background: color-mix(in srgb, var(--c-accent) 12%, transparent);
  border-left: 3px solid var(--c-accent);
  padding-left: 0.4rem;
  margin-left: -0.4rem;
  border-radius: 2px;
}

/* ── Tab bar (Source/Preview) ── */
.pkc-tab-bar {
  display: flex; gap: 0; margin-bottom: 0.5rem; border-bottom: 1px solid var(--c-border);
}
.pkc-tab {
  padding: 0.2rem 0.6rem; font-size: 0.75rem; cursor: pointer;
  border: 1px solid var(--c-border); border-bottom: none;
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--c-bg); color: var(--c-muted); margin-bottom: -1px;
  font-family: var(--font-sans);
}
.pkc-tab[data-pkc-active="true"] {
  background: var(--c-surface); color: var(--c-fg); border-bottom: 1px solid var(--c-surface);
}
.pkc-tab:hover:not([data-pkc-active="true"]) {
  background: var(--c-hover);
}

/* pgc-141 wave-δ #15:slim sticky header(user bug report 2026-05-24)。
   body[data-pkc-chrome="true"] 内に sticky で居座る、scroll で隠れない。
   archetype icon + title + container lid を 1 行で表示、視覚ノイズ抑制。
   z-index で conflict-banner / pending-notice より上に。 */
body[data-pkc-chrome="true"] .pkc-window-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid var(--c-accent-dim);
  background: var(--c-surface);
  font-size: 0.75rem;
  position: sticky;
  top: 0;
  z-index: 50;
  flex-shrink: 0;
  user-select: none;
}
body[data-pkc-chrome="true"] .pkc-window-header-archetype {
  font-size: 0.95rem;
  flex-shrink: 0;
}
body[data-pkc-chrome="true"] .pkc-window-header-title {
  flex: 1;
  font-weight: 600;
  color: var(--c-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body[data-pkc-chrome="true"] .pkc-window-header-container {
  font-size: 0.7rem;
  color: var(--c-fg-dim, #888);
  font-family: var(--font-mono);
  opacity: 0.7;
  flex-shrink: 0;
}

/* ── Action bar (mirrors center pane) ── */
.pkc-action-bar {
  display: flex; align-items: center; gap: 0.35rem;
  padding: 0.35rem 1rem; border-top: 1px solid var(--c-accent-dim);
  background: var(--c-surface); flex-shrink: 0;
  box-shadow: 0 -1px 4px rgba(51,255,102,0.06);
}
.pkc-action-bar[data-pkc-editing="true"] {
  border-top-color: var(--c-accent);
  box-shadow: 0 -2px 8px rgba(51,255,102,0.1);
}
.pkc-action-bar-status {
  font-size: 0.75rem; font-weight: 600; color: var(--c-accent);
  margin-right: 0.25rem; text-shadow: 0 0 6px rgba(51,255,102,0.2);
}
.pkc-action-bar-info {
  margin-left: auto; font-size: 0.75rem; color: var(--c-muted);
}

/* ── Buttons (mirrors center pane) ── */
.pkc-btn {
  padding: 0.2rem 0.5rem; font-size: 0.75rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-bg); color: var(--c-fg); cursor: pointer;
  font-family: var(--font-sans); white-space: nowrap;
  transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease;
}
.pkc-btn:hover { background: var(--c-hover); box-shadow: var(--glow); }
.pkc-btn:active { transform: scale(0.96); }
.pkc-btn-primary {
  padding: 0.2rem 0.5rem; font-size: 0.75rem;
  border: 1px solid var(--c-accent); border-radius: var(--radius);
  background: var(--c-accent); color: var(--c-accent-fg); cursor: pointer;
  font-family: var(--font-sans); white-space: nowrap; font-weight: 600;
  box-shadow: var(--glow);
  transition: background 120ms ease, box-shadow 120ms ease, transform 120ms ease, opacity 120ms ease;
}
.pkc-btn-primary:hover { opacity: 0.9; box-shadow: 0 0 10px rgba(51,255,102,0.3); }
.pkc-btn-primary:active { transform: scale(0.96); }

/* ── pgc-93(audit pgc-77 Gap-13 cat-1):S4 critical PKC dialect CSS
   mirror Phase 1 ── :::section / :::details / :::figure / :::quote。
   base.css 該当 rule を popup standalone HTML 用に hardcode 色で再現。
   color は base.css と同じ fallback 値 + var(--c-accent) 等を一部使用。
   2026-05-23 wave-β #4 で S4 critical の chunk-1 を解消。 */
/* :::section{role=tip/warning/...} callout(reform-2026-05 PR-2F)*/
.pkc-md-rendered .pkc-section-callout {
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  border-radius: 4px;
  border-left: 4px solid #6b7280;
  background: rgba(0, 0, 0, 0.02);
}
.pkc-md-rendered .pkc-section-callout > :first-child { margin-top: 0; }
.pkc-md-rendered .pkc-section-callout > :last-child { margin-bottom: 0; }
.pkc-md-rendered .pkc-section-summary  { border-left-color: #6b7280; background: rgba(107, 114, 128, 0.08); }
.pkc-md-rendered .pkc-section-info     { border-left-color: #2563eb; background: rgba(37, 99, 235, 0.08); }
.pkc-md-rendered .pkc-section-note     { border-left-color: #2563eb; background: rgba(37, 99, 235, 0.06); }
.pkc-md-rendered .pkc-section-tip      { border-left-color: #16a34a; background: rgba(22, 163, 74, 0.08); }
.pkc-md-rendered .pkc-section-important{ border-left-color: #9333ea; background: rgba(147, 51, 234, 0.08); }
.pkc-md-rendered .pkc-section-warning  { border-left-color: #ea580c; background: rgba(234, 88, 12, 0.08); }
.pkc-md-rendered .pkc-section-caution  { border-left-color: #d97706; background: rgba(217, 119, 6, 0.08); }
.pkc-md-rendered .pkc-section-danger   { border-left-color: #dc2626; background: rgba(220, 38, 38, 0.08); }
/* L-1 section break — role 別装飾(reform PR-2H)*/
.pkc-md-rendered .pkc-section-break {
  border: none;
  margin: 1.5em 0;
  height: 1px;
  background: #d1d5db;
}
.pkc-md-rendered .pkc-section-break[data-pkc-role="cover"],
.pkc-md-rendered .pkc-section-break[data-pkc-role="section"] {
  height: 0;
  border-top: 1px solid #d1d5db;
  border-bottom: 1px solid #d1d5db;
  padding-top: 0.4em;
  margin: 2em 0;
}
.pkc-md-rendered .pkc-section-break[data-pkc-role="body"] {
  background: transparent;
  border-top: 1px dashed #9ca3af;
  height: 0;
}
/* :::details 折りたたみ block(領域 6)*/
.pkc-md-rendered .pkc-details {
  margin: 0.5em 0;
  padding: 0.4em 0.7em;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.02);
}
.pkc-md-rendered .pkc-details > summary.pkc-details-summary {
  cursor: pointer;
  font-weight: 500;
  color: #1f2937;
  padding: 0.2em 0;
  user-select: none;
}
.pkc-md-rendered .pkc-details > summary.pkc-details-summary:hover {
  color: #2563eb;
}
.pkc-md-rendered .pkc-details[open] > summary.pkc-details-summary {
  margin-bottom: 0.4em;
}
/* :::figure / :::table / :::equation caption + 採番(L-7、reform PR-D前)*/
.pkc-md-rendered .pkc-fig {
  margin: 1em 0;
  padding: 0;
  border: none;
}
.pkc-md-rendered .pkc-fig-caption {
  margin-top: 0.4em;
  font-size: 0.9em;
  color: #6b7280;
  text-align: center;
}
.pkc-md-rendered .pkc-fig-ref {
  text-decoration: none;
  color: #2563eb;
}
.pkc-md-rendered .pkc-fig-ref:hover {
  text-decoration: underline;
}
/* :::quote{author=...} 引用 block(reform PR-D)*/
.pkc-md-rendered blockquote.pkc-quote-citation {
  background: rgba(0, 0, 0, 0.03);
  border-left: 4px solid #4a90e2;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  border-radius: 4px;
}
.pkc-md-rendered blockquote.pkc-quote-citation::after {
  content: attr(data-pkc-quote-author) " (" attr(data-pkc-quote-year) ")";
  display: block;
  text-align: end;
  font-size: 0.875rem;
  color: #6b7280;
  margin-top: 0.25rem;
  font-style: italic;
}
.pkc-md-rendered blockquote.pkc-quote-citation:not([data-pkc-quote-author])::after {
  content: "";
  display: none;
}

/* ── pgc-94(audit pgc-77 Gap-13 cat-2):S4 critical PKC dialect CSS
   mirror Phase 2 ── blank-line marker / em-dot / variable-undefined /
   hallucination-warning / tolerant alias / html-render fence。
   Viewer popup(rendered-viewer.ts L432-540)mirror を S4 entry-window に
   も持ってくる。base.css 該当 rule を hardcode 色で再現。 */
/* L-2 inline 修飾(highlight / ruby / em-dot)*/
.pkc-md-rendered mark {
  background: #fff59d;
  color: inherit;
  padding: 0 0.15em;
  border-radius: 2px;
}
.pkc-md-rendered ruby rt {
  font-size: 0.6em;
  color: #6b7280;
}
.pkc-md-rendered em.pkc-em-dot {
  font-style: normal;
  -webkit-text-emphasis: dot;
  text-emphasis: dot;
  -webkit-text-emphasis-position: over right;
  text-emphasis-position: over right;
}
/* L-9 段落先頭 1 字下げ */
.pkc-md-rendered p[data-pkc-indent="1"] { text-indent: 1em; }
/* L-5 行頭 align prefix */
.pkc-md-rendered p[data-pkc-align="center"] { text-align: center; }
.pkc-md-rendered p[data-pkc-align="end"]    { text-align: end;    }
.pkc-md-rendered p[data-pkc-align="start"]  { text-align: start;  }
.pkc-md-rendered p[data-pkc-align="right"]  { text-align: right;  }
.pkc-md-rendered p[data-pkc-align="left"]   { text-align: left;   }
/* L-8 blank-line marker(_ / _N、1em x N の余白)*/
.pkc-md-rendered .pkc-blank-line {
  --pkc-blank-line-h: 1em;
  height: calc(var(--pkc-blank-line-h) * 1);
}
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="2"]  { height: calc(var(--pkc-blank-line-h) * 2);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="3"]  { height: calc(var(--pkc-blank-line-h) * 3);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="4"]  { height: calc(var(--pkc-blank-line-h) * 4);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="5"]  { height: calc(var(--pkc-blank-line-h) * 5);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="6"]  { height: calc(var(--pkc-blank-line-h) * 6);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="7"]  { height: calc(var(--pkc-blank-line-h) * 7);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="8"]  { height: calc(var(--pkc-blank-line-h) * 8);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="9"]  { height: calc(var(--pkc-blank-line-h) * 9);  }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="10"] { height: calc(var(--pkc-blank-line-h) * 10); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="11"] { height: calc(var(--pkc-blank-line-h) * 11); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="12"] { height: calc(var(--pkc-blank-line-h) * 12); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="13"] { height: calc(var(--pkc-blank-line-h) * 13); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="14"] { height: calc(var(--pkc-blank-line-h) * 14); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="15"] { height: calc(var(--pkc-blank-line-h) * 15); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="16"] { height: calc(var(--pkc-blank-line-h) * 16); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="17"] { height: calc(var(--pkc-blank-line-h) * 17); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="18"] { height: calc(var(--pkc-blank-line-h) * 18); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="19"] { height: calc(var(--pkc-blank-line-h) * 19); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="20"] { height: calc(var(--pkc-blank-line-h) * 20); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="21"] { height: calc(var(--pkc-blank-line-h) * 21); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="22"] { height: calc(var(--pkc-blank-line-h) * 22); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="23"] { height: calc(var(--pkc-blank-line-h) * 23); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="24"] { height: calc(var(--pkc-blank-line-h) * 24); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="25"] { height: calc(var(--pkc-blank-line-h) * 25); }
/* pgc-204 wave-α' polish #25(Gap-13 closure):base.css に存在する 26-29 /
   35 / 45 を S4 inline mirror。base.css と完全 parity に。 */
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="26"] { height: calc(var(--pkc-blank-line-h) * 26); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="27"] { height: calc(var(--pkc-blank-line-h) * 27); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="28"] { height: calc(var(--pkc-blank-line-h) * 28); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="29"] { height: calc(var(--pkc-blank-line-h) * 29); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="30"] { height: calc(var(--pkc-blank-line-h) * 30); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="35"] { height: calc(var(--pkc-blank-line-h) * 35); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="40"] { height: calc(var(--pkc-blank-line-h) * 40); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="45"] { height: calc(var(--pkc-blank-line-h) * 45); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-count="50"] { height: calc(var(--pkc-blank-line-h) * 50); }
.pkc-md-rendered .pkc-blank-line[data-pkc-blank-capped]::before {
  content: '⚠ _' attr(data-pkc-blank-capped) ' (上限 cap)';
  display: block;
  font-size: 0.75em;
  color: #8b6f47;
  background: rgba(255, 200, 0, 0.08);
  padding: 0.15em 0.5em;
  border-left: 2px solid rgba(180, 130, 0, 0.4);
  margin-bottom: 0.3em;
  font-family: monospace;
}
/* M-7 未定義 variable 警告 */
.pkc-md-rendered .pkc-variable-undefined {
  color: #b91c1c;
  text-decoration: underline dotted;
  text-decoration-color: #b91c1c;
  cursor: help;
}
/* PR-2K hallucination 警告 block */
.pkc-md-rendered .pkc-warning-hallucination-block {
  background-color: #fef3c7;
  color: #92400e;
  border-left: 3px solid #d97706;
  padding: 0.5em 0.75em;
  margin: 0.5em 0;
  border-radius: 2px;
  cursor: help;
}
/* PR-2L+2O tolerant alias mirror */
.pkc-md-rendered .pkc-lead {
  font-size: 1.05em;
  font-weight: 500;
  color: #1f2937;
}
.pkc-md-rendered .pkc-attribution {
  display: block;
  text-align: right;
  font-size: 0.85em;
  color: #6b7280;
  font-style: italic;
  margin-top: 0.25em;
}
.pkc-md-rendered .pkc-tolerant-spacing {
  height: calc(1em * var(--pkc-blank-count, 1));
}
.pkc-md-rendered .pkc-align-hint {
  display: none;
}
html[data-pkc-debug-hallucination] .pkc-md-rendered .pkc-lead {
  border-bottom: 1px dotted #9ca3af;
  cursor: help;
}
html[data-pkc-debug-hallucination] .pkc-md-rendered .pkc-attribution {
  cursor: help;
}
html[data-pkc-debug-hallucination] .pkc-md-rendered .pkc-align-hint {
  display: inline-block;
  font-size: 0.75em;
  color: #1d4ed8;
  background-color: #dbeafe;
  padding: 0 0.3em;
  border-radius: 2px;
  cursor: help;
  user-select: none;
}
/* PR-2M html-render fence iframe */
.pkc-md-rendered .pkc-html-render {
  display: block;
  width: 100%;
  border: 0;
  margin: 0.75em 0;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  border-radius: 4px;
  background: #ffffff;
}

/* ── pgc-95(audit pgc-77 Gap-13 cat-3):S4 critical PKC dialect CSS
   mirror Phase 3 ── transclusion 9 件 + heading-fold + embed-blocked /
   todo-embed chrome remaining。Viewer popup(rendered-viewer.ts L541-
   591)mirror を S4 entry-window に porting。 */
/* Transclusion (![label](entry:LID) 経由の他 entry 埋め込み)*/
.pkc-transclusion {
  border-left: 3px solid #4a90e2;
  background: rgba(74, 144, 226, 0.04);
  border-radius: 4px;
  padding: 0.35rem 0.6rem;
  margin: 0.5rem 0;
}
.pkc-transclusion-header {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.35rem;
  padding-bottom: 0.2rem;
  border-bottom: 1px dashed #d1d5db;
}
.pkc-transclusion-source { color: #6b7280; text-decoration: none; }
.pkc-transclusion-source::before { content: '↪ '; color: #6b7280; }
.pkc-transclusion-source:hover { color: #4a90e2; text-decoration: underline; }
.pkc-transclusion-body > :first-child { margin-top: 0; }
.pkc-transclusion-body > :last-child { margin-bottom: 0; }
.pkc-transclusion-fallback { color: #6b7280; font-style: italic; }
/* transclusion-broken(target 不在 fallback marker)*/
.pkc-md-rendered .pkc-transclusion-broken {
  color: #b91c1c;
  background: rgba(220, 38, 38, 0.06);
  padding: 0 0.3em;
  border-radius: 3px;
  font-style: italic;
}
/* transclusion-document(textlog 等の document 経由 embed)*/
.pkc-md-rendered .pkc-transclusion-document {
  border: 1px solid #d8d2c2;
  border-radius: 4px;
  background: #fbf9f1;
  padding: 0.35rem 0.6rem;
  margin: 0.5rem 0;
}
/* transclusion-fallback-link(fallback link 装飾)*/
.pkc-md-rendered .pkc-transclusion-fallback-link {
  color: #4a90e2;
  font-family: var(--font-mono);
  font-size: 0.9em;
}
/* transclusion-log(個別 log 行内 timestamp)*/
.pkc-md-rendered .pkc-transclusion-log .pkc-textlog-timestamp {
  color: #6b7280;
}
/* embed-blocked(blocked / cycle marker)*/
.pkc-embed-blocked {
  display: inline-block;
  color: #6b7280;
  background: rgba(0, 0, 0, 0.04);
  border: 1px dashed rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  padding: 0 0.35em;
  font-size: 0.9em;
  font-family: var(--font-mono);
  font-style: normal;
}
/* todo-embed-meta(todo を embed した時の meta 行)*/
.pkc-todo-embed-meta {
  display: flex;
  gap: 0.6em;
  align-items: baseline;
  font-size: 0.9em;
  color: #6b7280;
}
.pkc-todo-embed-status { font-family: var(--font-mono); }
.pkc-todo-embed-status[data-pkc-todo-status="done"] { color: #4a90e2; }
/* heading-fold(領域 6 折りたたみ見出し)*/
.pkc-md-rendered .pkc-heading-fold { margin: 0.5rem 0 0; }
.pkc-md-rendered .pkc-heading-fold-summary { cursor: pointer; }
.pkc-md-rendered .pkc-heading-fold-summary > :first-child {
  display: inline;
  margin: 0;
}
/* pgc-98(audit pgc-77 Gap-8):document globals(writing / direction /
   align / layout)S4 inline CSS mirror。canonical S1 base.css は
   .pkc-md-rendered 自身に attr を載せるが、S4 は #body-view 配下に
   wrapper div[data-pkc-writing="…" dir="…"] を 1 段挿入する経路
   (injectFeaturesDomOps が wrap)。.pkc-md-rendered > div[data-pkc-*]
   selector で消費し、base.css と同等の rendering 効果。 */
.pkc-md-rendered > div[data-pkc-writing="vertical"] { writing-mode: vertical-rl; }
.pkc-md-rendered > div[data-pkc-writing="vertical"][dir="ltr"] { writing-mode: vertical-lr; }
.pkc-md-rendered > div[data-pkc-doc-align="left"]   { text-align: left; }
.pkc-md-rendered > div[data-pkc-doc-align="right"]  { text-align: right; }
.pkc-md-rendered > div[data-pkc-doc-align="center"] { text-align: center; }
/* layout(用紙サイズ + 段組):screen 表示で用紙幅 center + column-count */
.pkc-md-rendered > div[data-pkc-layout] {
  max-width: var(--pkc-page-w, 21cm);
  margin: 1rem auto;
  padding: 1.5cm 1.8cm;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
  border-radius: 2px;
  box-sizing: border-box;
}
.pkc-md-rendered > div[data-pkc-layout^="a4-"]     { --pkc-page-w: 21cm; }
.pkc-md-rendered > div[data-pkc-layout^="b5-"]     { --pkc-page-w: 17.6cm; }
.pkc-md-rendered > div[data-pkc-layout^="letter-"] { --pkc-page-w: 21.59cm; }
.pkc-md-rendered > div[data-pkc-layout^="legal-"]  { --pkc-page-w: 21.59cm; }
.pkc-md-rendered > div[data-pkc-layout$="-2col"] {
  column-count: 2; column-gap: 0.8cm; column-rule: 1px solid #e5e7eb;
}
.pkc-md-rendered > div[data-pkc-layout$="-3col"] {
  column-count: 3; column-gap: 0.6cm; column-rule: 1px solid #e5e7eb;
}
.pkc-md-rendered > div[data-pkc-layout$="-2col"] h1,
.pkc-md-rendered > div[data-pkc-layout$="-2col"] h2,
.pkc-md-rendered > div[data-pkc-layout$="-3col"] h1,
.pkc-md-rendered > div[data-pkc-layout$="-3col"] h2 { column-span: all; }
.pkc-md-rendered > div[data-pkc-layout$="-2col"] figure,
.pkc-md-rendered > div[data-pkc-layout$="-2col"] table,
.pkc-md-rendered > div[data-pkc-layout$="-2col"] pre,
.pkc-md-rendered > div[data-pkc-layout$="-3col"] figure,
.pkc-md-rendered > div[data-pkc-layout$="-3col"] table,
.pkc-md-rendered > div[data-pkc-layout$="-3col"] pre { break-inside: avoid; }
@media print {
  .pkc-md-rendered > div[data-pkc-layout^="a4-"]     { width: 21cm; }
  .pkc-md-rendered > div[data-pkc-layout^="b5-"]     { width: 17.6cm; }
  .pkc-md-rendered > div[data-pkc-layout^="letter-"] { width: 21.59cm; }
  .pkc-md-rendered > div[data-pkc-layout^="legal-"]  { width: 21.59cm; }
  .pkc-md-rendered > div[data-pkc-layout] {
    margin: 0; box-shadow: none; border-radius: 0; padding: 0;
  }
  .pkc-md-rendered > div[data-pkc-layout$="-2col"],
  .pkc-md-rendered > div[data-pkc-layout$="-3col"] {
    column-rule: none;
  }
}
/* footnote chrome(wave-Z markdown-it-footnote)*/
.pkc-md-rendered .pkc-footnote-ref {
  font-size: 0.75em;
  vertical-align: super;
  line-height: 0;
}
.pkc-md-rendered .pkc-footnote-ref a {
  color: var(--c-accent);
  text-decoration: none;
  padding: 0 0.15em;
}
.pkc-md-rendered .pkc-footnote-ref a::before { content: "["; }
.pkc-md-rendered .pkc-footnote-ref a::after { content: "]"; }
.pkc-md-rendered .pkc-footnote-ref a:hover { text-decoration: underline; }
.pkc-md-rendered .pkc-citation {
  font-style: italic;
  color: var(--c-muted);
  cursor: help;
  padding: 0 0.1em;
  border-bottom: 1px dotted var(--c-accent-dim);
}
.pkc-md-rendered .pkc-citation:hover {
  color: var(--c-fg);
  border-bottom-color: var(--c-accent);
}

/* ── Conflict banner ── */
.pkc-conflict-banner {
  display: none; background: var(--c-danger); color: #fff;
  padding: 0.4rem 0.75rem; font-size: 0.8rem; margin: 0.5rem 0;
  border-radius: var(--radius);
}
/* γ-A5-5 §5.3:競合 banner の下に出す 2-pane 行 diff(子 window 自前描画)。 */
.pkc-conflict-diff {
  display: none; margin: 0.5rem 0; border: 1px solid var(--c-border);
  border-radius: var(--radius); max-height: 12rem; overflow-y: auto;
  font-family: var(--font-mono); font-size: 0.72rem;
}
.pkc-conflict-diff-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; }
.pkc-conflict-diff-cell {
  padding: 1px 6px; white-space: pre-wrap; word-break: break-word; min-height: 1.3em;
}
.pkc-conflict-diff-cell[data-op="del"] { background: color-mix(in srgb, var(--c-danger) 22%, transparent); }
.pkc-conflict-diff-cell[data-op="add"] { background: color-mix(in srgb, var(--c-success) 22%, transparent); }
.pkc-conflict-diff-cell[data-op="empty"] { background: var(--c-hover); }

/* ── Pending view-refresh notice ──
   Shown when a parent → child view-body rerender was received while
   the child was dirty (body-edit or title-input differs from the
   saved originals). The actual DOM replacement is deferred until the
   user cancels or saves — see the "Dirty state policy for view
   rerender" Issue and docs/development/completed/edit-preview-asset-resolution.md.
   Hidden by default via the inline style attribute on the element. */
.pkc-pending-view-notice {
  background: var(--c-surface); color: var(--c-muted);
  border-left: 3px solid var(--c-accent-dim);
  padding: 0.35rem 0.6rem; font-size: 0.75rem; margin: 0.5rem 0;
  border-radius: var(--radius);
}

/* ── Status message ── */
.pkc-status-msg {
  font-size: 0.75rem; color: var(--c-muted); padding: 0.25rem 0;
}

/* ── Archetype info cards (attachment / todo / form) ── */
.pkc-ew-card {
  display: flex; gap: 0.75rem; align-items: flex-start;
  padding: 0.75rem; border: 1px solid var(--c-border); border-radius: var(--radius-lg, 4px);
  background: var(--c-surface);
}
.pkc-ew-card-icon { font-size: 1.5rem; flex-shrink: 0; line-height: 1; }
.pkc-ew-card-fields { flex: 1; min-width: 0; }
.pkc-ew-field { font-size: 0.8rem; line-height: 1.6; }
.pkc-ew-field strong { color: var(--c-muted); font-weight: 600; margin-right: 0.25rem; }
.pkc-ew-desc {
  font-size: 0.8rem; white-space: pre-wrap; word-wrap: break-word;
  margin-top: 0.25rem; padding: 0.3rem 0.5rem;
  background: var(--c-bg); border-radius: var(--radius); border: 1px solid var(--c-border);
}

/* ── Light mode notice ── */
.pkc-light-notice {
  font-size: 0.75rem; padding: 0.35rem 0.5rem; margin: 0.5rem 0;
  border-radius: var(--radius); border-left: 3px solid var(--c-accent-dim);
  background: var(--c-surface); color: var(--c-muted);
}

/* ── Attachment preview (Phase 4) ── */
.pkc-ew-empty {
  font-size: 0.8rem; color: var(--c-muted); padding: 0.4rem 0;
}
.pkc-ew-preview {
  margin: 0.5rem 0; padding: 0.5rem; border: 1px solid var(--c-border);
  border-radius: var(--radius-lg, 4px); background: var(--c-bg);
  display: flex; flex-direction: column; gap: 0.4rem;
}
.pkc-ew-preview-img {
  max-width: 100%; max-height: 60vh; height: auto; display: block;
  object-fit: contain; background: var(--c-surface);
  border-radius: var(--radius);
}
.pkc-ew-preview-pdf {
  width: 100%; height: 60vh; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-surface);
}
.pkc-ew-preview-video {
  max-width: 100%; max-height: 60vh; display: block;
  border-radius: var(--radius); background: #000;
}
.pkc-ew-preview-audio {
  width: 100%; display: block;
}
.pkc-ew-preview-html {
  width: 100%; height: 60vh; border: 1px solid var(--c-border);
  border-radius: var(--radius); background: var(--c-surface);
}
.pkc-ew-preview-none {
  font-size: 0.8rem; color: var(--c-muted); padding: 0.4rem 0.2rem;
  font-style: italic;
}
.pkc-ew-sandbox-note {
  font-size: 0.7rem; color: var(--c-muted); font-family: var(--font-mono);
}
.pkc-ew-preview-reason {
  margin: 0.5rem 0; padding: 0.4rem 0.6rem;
  border: 1px dashed var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-muted);
  font-size: 0.75rem; line-height: 1.5;
}
.pkc-ew-action-row {
  display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.25rem;
}

/* ── Non-image asset chip in resolved text bodies ── */
.pkc-md-rendered a[href^="#asset-"] {
  display: inline-flex; align-items: center; gap: 0.35em;
  padding: 0.1em 0.55em; margin: 0 0.15em;
  border: 1px solid var(--c-border); border-radius: 999px;
  background: var(--c-bg); color: var(--c-fg);
  text-decoration: none; font-size: 0.9em; line-height: 1.35;
  cursor: pointer;
}
.pkc-md-rendered a[href^="#asset-"]:hover {
  background: var(--c-hover); border-color: var(--c-accent-dim);
}
/* ── Task completion badge ── */
.pkc-task-badge {
  font-size: 0.7rem;
  color: var(--c-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
.pkc-task-badge[data-pkc-task-complete="true"] {
  color: var(--c-success);
}
/* ── TEXTLOG rendered view (day-grouped document) ──
 * Slice 4-A mirrors base.css (see
 * docs/development/textlog-viewer-and-linkability-redesign.md). The
 * rendered viewer emits the same <section id="day-…"><article id="log-…">
 * structure as the live viewer so anchors and DOM ids line up across
 * surfaces. DOM order is header → text so plain-text reading starts
 * with the timestamp.
 */
.pkc-textlog-document { display: flex; flex-direction: column; gap: 1.25rem; }
.pkc-textlog-day { display: flex; flex-direction: column; gap: 0.5rem; }
.pkc-textlog-day + .pkc-textlog-day { margin-top: 0.5rem; }
.pkc-textlog-day-header {
  padding: 0.3rem 0 0.35rem;
  border-bottom: 1px solid var(--c-border);
}
.pkc-textlog-day-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--c-fg);
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
}
.pkc-textlog-log {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem 0.5rem 0.6rem;
  border-left: 3px solid var(--c-border);
  font-size: 0.85rem;
}
.pkc-textlog-log + .pkc-textlog-log {
  border-top: 1px dashed var(--c-border);
  padding-top: 0.6rem;
}
.pkc-textlog-log[data-pkc-log-important="true"] {
  border-left-color: #f5a623;
  border-left-width: 4px;
  background: rgba(245,166,35,0.12);
  padding-left: 0.6rem;
}
.pkc-textlog-log[data-pkc-log-important="true"] .pkc-textlog-text {
  font-weight: 600;
  color: var(--c-fg);
}
.pkc-textlog-log-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pkc-textlog-log .pkc-textlog-timestamp {
  color: var(--c-muted);
  font-size: 0.75rem;
  font-family: var(--font-mono);
  white-space: nowrap;
  padding-top: 0.1rem;
  cursor: help;
}
.pkc-textlog-log[data-pkc-log-important="true"] .pkc-textlog-timestamp {
  color: #c88a1c;
}
.pkc-textlog-text {
  color: var(--c-fg);
  white-space: pre-wrap;
  word-break: break-word;
}
/* TEXTLOG-scoped markdown density override — see base.css for the
   rationale. Kept in parity so popped-out TEXTLOG viewers read at
   the same density as the in-app view. */
/* Match TEXT density. See base.css for the full rationale —
   .pkc-textlog-text sets white-space: pre-wrap (for raw logs),
   but rendered-markdown logs must use white-space: normal or the
   newlines markdown-it emits between block tags render as blank
   lines. */
.pkc-textlog-text.pkc-md-rendered { line-height: 1.35; white-space: normal; }
.pkc-textlog-text.pkc-md-rendered > :first-child { margin-top: 0; }
.pkc-textlog-text.pkc-md-rendered > :last-child { margin-bottom: 0; }
.pkc-textlog-text p { margin: 0.2em 0; }
.pkc-textlog-text ul,
.pkc-textlog-text ol { margin: 0.2em 0; padding-left: 1.3em; }
.pkc-textlog-text li { margin: 0.05em 0; }
.pkc-textlog-text blockquote { margin: 0.25em 0; }
.pkc-textlog-text pre { margin: 0.25em 0; }

/* ── Structured editors (textlog / todo / form) ── */
.pkc-textlog-editor { display: flex; flex-direction: column; gap: 0.5rem; }
.pkc-textlog-edit-row {
  display: grid; grid-template-columns: auto auto auto 1fr;
  gap: 0.4rem; align-items: start; padding: 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
}
.pkc-textlog-edit-row[data-pkc-deleted="true"] { display: none; }
.pkc-textlog-flag-label { font-size: 0.85rem; cursor: pointer; white-space: nowrap; }
.pkc-textlog-delete-btn {
  font-size: 0.7rem; padding: 0.1rem 0.3rem;
  color: var(--c-danger, #ff4444); cursor: pointer;
  background: none; border: 1px solid var(--c-border); border-radius: var(--radius);
}
.pkc-textlog-edit-text {
  grid-column: 1 / -1; background: var(--c-surface); color: var(--c-fg);
  border: 1px solid var(--c-border); border-radius: var(--radius);
  padding: 0.3rem; font-family: var(--font-mono); font-size: 0.85rem; resize: vertical;
}
.pkc-textlog-timestamp {
  font-size: 0.75rem; color: var(--c-muted); white-space: nowrap;
  font-family: var(--font-mono);
}
.pkc-todo-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.pkc-todo-status-select {
  width: auto; max-width: 120px; font-size: 0.8rem; padding: 0.25rem 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius); background: var(--c-bg);
  font-family: var(--font-sans); color: var(--c-fg);
}
.pkc-todo-date-input {
  width: auto; max-width: 180px; font-size: 0.8rem; padding: 0.25rem 0.4rem;
  border: 1px solid var(--c-border); border-radius: var(--radius); background: var(--c-bg);
  font-family: var(--font-sans); color: var(--c-fg);
}
.pkc-todo-archived-label { font-size: 0.85rem; cursor: pointer; }
.pkc-todo-description-input {
  width: 100%; font-family: var(--font-mono); font-size: 0.85rem;
  padding: 0.4rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-fg); resize: vertical;
}
.pkc-form-editor { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.75rem; }
.pkc-form-name-input {
  width: 100%; font-size: 0.85rem; padding: 0.4rem 0.6rem;
  border: 1px solid var(--c-border); border-radius: var(--radius);
  font-family: var(--font-sans); color: var(--c-fg); background: var(--c-bg); outline: none;
}
.pkc-form-note-input {
  width: 100%; font-family: var(--font-mono); font-size: 0.85rem;
  padding: 0.4rem; border: 1px solid var(--c-border); border-radius: var(--radius);
  background: var(--c-surface); color: var(--c-fg); resize: vertical;
}
.pkc-form-check-label { font-size: 0.85rem; cursor: pointer; }
</style>
</head>
<body${shellEntryWindowChromeEnabled() ? ' data-pkc-chrome="true"' : ''}>
  ${shellEntryWindowChromeEnabled() ? `<!-- pgc-141 wave-δ #15:slim sticky header(scroll で隠れない)。
       archetype icon + entry title + container 由来を常駐表示、user の
       場所感を保つ。 -->
  <header class="pkc-window-header" data-pkc-region="window-header">
    <span class="pkc-window-header-archetype">${entryArchetypeIcon(entry.archetype)}</span>
    <span class="pkc-window-header-title" id="window-header-title">${escapedTitle}</span>
    <span class="pkc-window-header-container" title="Container">${escapeForHtml(entry.lid)}</span>
  </header>` : ''}
  <!-- Conflict banner (hidden by default) -->
  <div class="pkc-conflict-banner" id="conflict-banner"></div>
  <div class="pkc-conflict-diff" id="conflict-diff"></div>
  <!-- Pending view-refresh notice (hidden by default) -->
  <div class="pkc-pending-view-notice" id="pending-view-notice" style="display:none">View refresh pending &mdash; will apply on save or cancel.</div>
  <!-- Pending title-refresh notice (hidden by default) -->
  <div class="pkc-pending-view-notice" id="pending-title-notice" style="display:none">Title refresh pending &mdash; will apply on save or cancel.</div>
${lightSource && entry.archetype === 'attachment' ? '  <div class="pkc-light-notice" data-pkc-region="light-notice">This is a Light export — attachment file data is not available.</div>' : ''}
  <!-- Scrollable content area -->
  <div class="pkc-window-content" id="window-content">
    <!-- View mode (initial state) -->
    <!--
      Two-column layout when a TOC is available: a sticky sidebar on
      the left (scrolls the TOC itself when it overflows) and the
      title/body as the main column. When the TOC is empty (archetypes
      with no index-worthy content, headingless TEXT) the sidebar is
      omitted entirely and the main column fills the width.
    -->
    <div id="view-pane"${tocHtml ? ' data-pkc-has-toc="true"' : ''}>
      ${tocHtml ? `<aside class="pkc-toc-sidebar" data-pkc-region="toc-sidebar">${tocHtml}</aside>` : ''}
      <div class="pkc-viewer-main">
        <div class="pkc-view-title-row">
          <h2 class="pkc-view-title" id="title-display">${escapedTitle}</h2>
          <span class="pkc-archetype-label">${entry.archetype}</span>
          <span class="pkc-task-badge" id="task-badge" style="display:none"></span>
        </div>
        <div class="pkc-view-body pkc-md-rendered" id="body-view">${renderedBody}</div>
      </div>
    </div>

    <!-- Edit mode (hidden initially) -->
    <div id="edit-pane" class="pkc-editor"${useStructuredEditor ? '' : ' data-pkc-wide="true"'} style="display:none">
      <div class="pkc-editor-title-row">
        <input type="text" class="pkc-editor-title" id="title-input" value="">
        <span class="pkc-archetype-label">${entry.archetype}</span>
      </div>
${useStructuredEditor ? `      <div id="structured-editor">${editorBodyHtml}</div>
      <textarea class="pkc-editor-body" id="body-edit" rows="10" style="display:none"></textarea>` : useSplitEditor ? `      <!-- A-2 split editor: TEXT archetype only. Mirrors center pane
           .pkc-text-split-editor grid (textarea | resize handle | live preview).
           tab-bar / body-preview display toggling in showTab() is bypassed via
           useSplitEditor in the child-side script. -->
      <div class="pkc-text-split-editor" data-pkc-region="text-split-editor">
        <textarea class="pkc-editor-body" id="body-edit" data-pkc-field="body" data-pkc-viewport-sized="true"></textarea>
        <div class="pkc-text-split-resize-handle" aria-hidden="true">
          <!-- PR-XX2 (2026-05-07):popup 別窓にも block 同期 toggle を設置。
               center pane と同じ localStorage key (pkc2.split-sync-enabled)
               を共有するので、片方の ON/OFF が両方に伝播する。 -->
          <button type="button" class="pkc-btn-toggle-sync" id="btn-toggle-sync"
                  data-pkc-action="toggle-source-preview-sync"
                  data-pkc-sync-state="off" aria-pressed="false"
                  title="block 対応ハイライト OFF(クリックで ON)">⇄</button>
        </div>
        <div id="body-preview" class="pkc-text-edit-preview pkc-md-rendered" data-pkc-region="text-edit-preview">${renderedBody}</div>
      </div>` : `      <div class="pkc-tab-bar" id="tab-bar">
        <span class="pkc-tab" id="tab-source" data-pkc-active="true" onclick="showTab('source')">Source</span>
        <span class="pkc-tab" id="tab-preview" onclick="showTab('preview')">Preview</span>
      </div>
      <textarea class="pkc-editor-body" id="body-edit" data-pkc-viewport-sized="true"></textarea>
      <div class="pkc-view-body pkc-md-rendered" id="body-preview" style="display:none"></div>`}
    </div>
  </div>

  <!-- Fixed action bar at bottom (mirrors center pane) -->
  <div class="pkc-action-bar" id="action-bar">
    ${readonly ? '' : '<button class="pkc-btn" id="btn-edit" onclick="enterEdit()">✏️ Edit</button>'}
    ${!readonly && shellWindowRolesEnabled() ? '<button class="pkc-btn" id="btn-viewer" onclick="openViewerWin()" title="このエントリを読み取り専用の別ウィンドウで開く(編集保存で反映)">🔍 別窓プレビュー</button>' : ''}
    ${!readonly && shellWindowRolesEnabled() ? '<button class="pkc-btn" id="btn-toc-monitor" onclick="openTocMonitor()" title="このエントリの見出しアウトラインを別ウィンドウで常時表示">📑 TOC 別窓</button>' : ''}
    <button class="pkc-btn-primary" id="btn-save" style="display:none" onclick="saveEntry()">💾 Save</button>
    <button class="pkc-btn" id="btn-cancel" style="display:none" onclick="cancelEdit()">Cancel</button>
    <span class="pkc-action-bar-status" id="bar-status"></span>
    <span class="pkc-action-bar-info" id="bar-info">${entry.archetype}</span>
    <button class="pkc-btn" id="btn-window-close" onclick="closeEntryWindow()" style="margin-left:auto" title="Close window">✕ Close</button>
  </div>

  <div class="pkc-status-msg" id="status"></div>

<script>
var currentMode = 'view';
var lid = ${escapeForScript(entry.lid)};
var entryArchetype = ${escapeForScript(entry.archetype)};
var useStructuredEditor = ${useStructuredEditor ? 'true' : 'false'};
var useSplitEditor = ${useSplitEditor ? 'true' : 'false'};
var originalTitle = ${escapeForScript(entry.title)};
var originalBody = ${escapeForScript(entry.body)};

/* Phase 4 attachment preview data (empty string when no data is available). */
var pkcAttachmentData = ${escapeForScript(attachmentData)};
var pkcAttachmentMime = ${escapeForScript(attachmentMime)};
var pkcSandboxAllow = ${JSON.stringify(sandboxAllow)};
var pkcActiveBlobUrls = [];

/*
 * Child-local edit-mode Preview resolver context.
 *
 * Starts null and is populated by 'pkc-entry-update-preview-ctx'
 * messages from the parent (see the message listener at the bottom
 * of this script). When populated, it is passed as the third arg to
 * window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx) so
 * the live-refreshed snapshot takes precedence over the parent's
 * initial per-lid map.
 *
 * Only the Preview tab reads this. The Source textarea, the view-
 * pane HTML, and the save/conflict paths do NOT touch it.
 */
var childPreviewCtx = null;

/*
 * Pending view-body HTML, stashed when a parent → child
 * 'pkc-entry-update-view-body' message arrives while the child is
 * dirty (body-edit differs from originalBody OR title-input differs
 * from originalTitle). Dirty state policy:
 *
 *   clean: apply immediately to #body-view.innerHTML, clear stash.
 *   dirty: stash here, show #pending-view-notice, do NOT touch any
 *          DOM other than the notice element.
 *
 * Flushed on dirty → clean transitions:
 *   - cancelEdit(): user discarded the edit — apply the latest
 *     stashed HTML as the now-authoritative view.
 *   - 'pkc-entry-saved' message: the save handler runs its own
 *     body-view rerender from the current textarea contents against
 *     the parent's latest container state, so the pending stash is
 *     DISCARDED (not applied) because the save path is more
 *     authoritative than any earlier snapshot.
 *
 * Holding only the MOST RECENT pending HTML is intentional: if
 * multiple updates arrive while the child is dirty, only the newest
 * one is applied on flush. Older snapshots are unreachable.
 */
var pendingViewBody = null;

/*
 * Pending title, stashed when a parent → child
 * 'pkc-entry-update-title' message arrives while the child is in edit
 * mode. Mirrors pendingViewBody's policy: clean → apply immediately,
 * dirty → stash + show #pending-title-notice, flush on cancelEdit
 * and discard on 'pkc-entry-saved'. Holding only the most recent
 * snapshot is intentional.
 *
 * See docs/development/entry-window-title-live-refresh-v1.md §4.
 */
var pendingTitle = null;

document.getElementById('body-edit').value = originalBody;
if (document.getElementById('title-input')) {
  document.getElementById('title-input').value = originalTitle;
}

/* A-2 split editor: wire live preview refresh. Input fires every
 * keystroke; debounce to coalesce bursts (~100ms feels immediate for
 * a markdown preview without hogging the main thread on large bodies).
 * The renderMd helper below already routes through the parent's
 * pkcRenderEntryPreview so asset / entry refs resolve exactly like
 * the view pane. The initial innerHTML is rendered server-side in
 * buildWindowHtml (renderedBody), so the preview is correct from
 * the moment the window opens — no flash of unrendered markdown. */
if (useSplitEditor) {
  var pkcSplitPreviewTimer = null;
  document.getElementById('body-edit').addEventListener('input', function() {
    if (pkcSplitPreviewTimer) clearTimeout(pkcSplitPreviewTimer);
    pkcSplitPreviewTimer = setTimeout(function() {
      var src = document.getElementById('body-edit').value;
      renderMdInto(document.getElementById('body-preview'), src);
      pkcRefreshSyncMarker();
    }, 100);
  });

  /* user bug 報告 2026-05-28: MW screenshot paste fix.
   * entry-window は独立 document のため main window の paste listener は到達しない。
   * child 内で paste catch → window.opener.PKC.pasteAttachment(payload) 経由で
   * parent dispatcher に PASTE_ATTACHMENT を投げる。asset 化 + textarea への
   * ![name](asset:KEY) marker 挿入で main window と同じ UX を提供する。 */
  document.getElementById('body-edit').addEventListener('paste', function(e) {
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var imageItem = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file' && items[i].type.indexOf('image/') === 0) {
        imageItem = items[i];
        break;
      }
    }
    if (!imageItem) return; /* 非 image は default 動作(text/plain 等)に任せる */
    var file = imageItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    var reader = new FileReader();
    reader.onload = function() {
      var dataUrl = reader.result;
      if (typeof dataUrl !== 'string') return;
      var commaIdx = dataUrl.indexOf(',');
      var base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : '';
      var ext = (file.type.split('/')[1] || 'png').split(';')[0];
      var ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      var name = 'screenshot-' + ts + '.' + ext;
      var assetKey = 'att-mw-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      if (window.opener && window.opener.PKC && typeof window.opener.PKC.pasteAttachment === 'function') {
        try {
          window.opener.PKC.pasteAttachment({
            name: name,
            mime: file.type,
            size: file.size,
            assetKey: assetKey,
            assetData: base64,
            contextLid: lid
          });
        } catch (err) {
          console.warn('[PKC2] MW paste forward failed:', err);
        }
      } else {
        console.warn('[PKC2] window.opener.PKC.pasteAttachment unavailable, MW paste skipped');
        return;
      }
      /* 挿入は paste 経路と同じ: cursor 位置に ![name](asset:KEY) を splice */
      var ta = document.getElementById('body-edit');
      var ref = '![' + name + '](asset:' + assetKey + ')';
      var start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var end = ta.selectionEnd != null ? ta.selectionEnd : start;
      ta.value = ta.value.slice(0, start) + ref + ta.value.slice(end);
      var newCursor = start + ref.length;
      ta.selectionStart = newCursor;
      ta.selectionEnd = newCursor;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    };
    reader.readAsDataURL(file);
  });

  /* ─────────────────────────────────────────────────────────────
   * PR-CC (2026-05-06):entry-window split sync.
   *
   * User report: ダブルクリックで開いた TEXT エントリは スプリット
   * ビューの同期編集機能が不活だった。メインウィンドウの時と同じに
   * してほしい。
   *
   * 親 window 側の source-preview-sync.ts と同じ仕組みを child
   * window のローカル document に inline で実装。child は ES module
   * import できない(document.write 経由の inline HTML)ので、必要な
   * helper(caretSourceLine / findPreviewElementForLine /
   * findSourceLineByPoint / ensureRectInBand)を pure JS で定義。
   *
   * localStorage key は "pkc2.split-sync-enabled"(親と共通)。
   * ON のときに caret 移動 → preview block highlight + scroll、
   * preview click → caret jump、を実施。
   * ───────────────────────────────────────────────────────────── */
  var SYNC_KEY = 'pkc2.split-sync-enabled';
  var ACTIVE_ATTR = 'data-pkc-active-source';
  function pkcSyncEnabled() {
    try { return localStorage.getItem(SYNC_KEY) === 'true'; } catch (_e) { return false; }
  }

  /* PR-Δ9 (2026-05-07、user 報告「左側の編集エリアにキャレット表示
   * されないのがおかしい」):popup の textarea 用 caret-row indicator。
   * center pane の caret-indicator.ts と同じ視覚効果を popup の document
   * 内に inline 再現する。textarea の row 高さに合わせた band を caret
   * 行に重ねる(absolute、tint background、accent left-border)。 */
  var pkcCaretIndicator = null;
  function pkcEnsureCaretIndicator() {
    if (pkcCaretIndicator) return pkcCaretIndicator;
    var el = document.createElement('div');
    el.id = 'pkc-popup-caret-indicator';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = [
      'position:fixed',
      'pointer-events:none',
      'z-index:5',
      'display:none',
      'background:color-mix(in srgb, var(--c-accent) 8%, transparent)',
      'border-left:3px solid color-mix(in srgb, var(--c-accent) 70%, transparent)',
      'transition:top 80ms linear',
    ].join(';');
    document.body.appendChild(el);
    pkcCaretIndicator = el;
    return el;
  }
  function pkcPaintCaretIndicator() {
    var ta = document.getElementById('body-edit');
    if (!ta || document.activeElement !== ta) {
      if (pkcCaretIndicator) pkcCaretIndicator.style.display = 'none';
      return;
    }
    var el = pkcEnsureCaretIndicator();
    /* compute caret line via newline count + line-height */
    var pos = ta.selectionStart || 0;
    var line = 0;
    var v = ta.value;
    for (var i = 0; i < pos; i++) if (v.charCodeAt(i) === 10) line++;
    var cs = window.getComputedStyle(ta);
    var lineH = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) * 1.4);
    var padTop = parseFloat(cs.paddingTop) || 0;
    var rect = ta.getBoundingClientRect();
    var caretYInTextarea = padTop + line * lineH - ta.scrollTop;
    var caretYViewport = rect.top + caretYInTextarea;
    /* PR-Δ12 v2 (2026-05-07、再修正):window viewport 絶対座標で hide
       判定する。textarea 内 clip + viewport 絶対 clip の AND。
       textarea が popup window 自身の scroll で off-screen に出ても
       caret indicator は隠れる。 */
    var winH = window.innerHeight || document.documentElement.clientHeight;
    var inTextareaVisible = caretYInTextarea >= 0 && (caretYInTextarea + lineH) <= rect.height;
    var inViewport = caretYViewport >= 0 && (caretYViewport + lineH) <= winH;
    if (!inTextareaVisible || !inViewport) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.top = caretYViewport + 'px';
    el.style.left = (rect.left + (parseFloat(cs.borderLeftWidth) || 0)) + 'px';
    el.style.width = (rect.width - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)) + 'px';
    el.style.height = lineH + 'px';
  }
  document.addEventListener('selectionchange', pkcPaintCaretIndicator);
  document.addEventListener('focusin', pkcPaintCaretIndicator);
  document.addEventListener('focusout', function() {
    setTimeout(pkcPaintCaretIndicator, 0);
  });
  document.addEventListener('input', pkcPaintCaretIndicator, true);
  document.addEventListener('scroll', pkcPaintCaretIndicator, true);
  window.addEventListener('resize', pkcPaintCaretIndicator);

  function pkcCaretSourceLine(ta) {
    var pos = ta.selectionStart || 0;
    var line = 0;
    var v = ta.value;
    for (var i = 0; i < pos; i++) if (v.charCodeAt(i) === 10) line++;
    return line;
  }
  function pkcFindPreviewElementForLine(preview, targetLine) {
    var nodes = preview.querySelectorAll('[data-pkc-source-line]');
    var best = null, bestLine = -1;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var n = parseInt(el.getAttribute('data-pkc-source-line'), 10);
      if (!isFinite(n)) continue;
      if (n <= targetLine && n > bestLine) { best = el; bestLine = n; }
    }
    return best;
  }
  function pkcFindSourceLineByPoint(preview, viewportY) {
    var nodes = preview.querySelectorAll('[data-pkc-source-line]');
    if (nodes.length === 0) return null;
    var best = null, bestTop = -Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var top = el.getBoundingClientRect().top;
      if (top <= viewportY && top > bestTop) { best = el; bestTop = top; }
    }
    if (!best) best = nodes[0];
    var n = parseInt(best.getAttribute('data-pkc-source-line'), 10);
    return isFinite(n) ? n : null;
  }
  function pkcEnsureRectInBand(scroll, rect) {
    var r = scroll.getBoundingClientRect();
    var bandTop = r.top + r.height * 0.20;
    var bandBot = r.top + r.height * 0.55;
    if (rect.top >= bandTop && rect.bottom <= bandBot) return;
    var delta = rect.top - bandTop;
    scroll.scrollBy({ top: delta, behavior: 'auto' });
  }
  function pkcClearActiveMarker() {
    var marked = document.querySelectorAll('[' + ACTIVE_ATTR + ']');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(ACTIVE_ATTR);
  }
  function pkcRefreshSyncMarker() {
    if (!useSplitEditor) return;
    if (!pkcSyncEnabled()) { pkcClearActiveMarker(); return; }
    var ta = document.getElementById('body-edit');
    var preview = document.getElementById('body-preview');
    if (!ta || !preview) return;
    if (document.activeElement !== ta) return;
    var line = pkcCaretSourceLine(ta);
    var target = pkcFindPreviewElementForLine(preview, line);
    pkcClearActiveMarker();
    if (!target) return;
    target.setAttribute(ACTIVE_ATTR, 'true');
    pkcEnsureRectInBand(preview, target.getBoundingClientRect());
  }
  document.addEventListener('selectionchange', function() {
    if (!useSplitEditor || !pkcSyncEnabled()) return;
    var ta = document.getElementById('body-edit');
    if (document.activeElement !== ta) return;
    pkcRefreshSyncMarker();
  });
  /* preview click → caret jump in textarea */
  var previewEl = document.getElementById('body-preview');
  if (previewEl) {
    previewEl.addEventListener('click', function(e) {
      if (!pkcSyncEnabled()) return;
      var t = e.target;
      /* skip interactive children(<a>, <button>, copy buttons 等) */
      if (t && t.closest && t.closest('a,button,input,textarea,select,[data-pkc-action]')) return;
      var line = pkcFindSourceLineByPoint(previewEl, e.clientY);
      if (line === null) return;
      var ta = document.getElementById('body-edit');
      if (!ta) return;
      /* compute textarea offset from line number */
      var v = ta.value, off = 0, l = 0;
      for (var i = 0; i < v.length; i++) {
        if (l === line) break;
        if (v.charCodeAt(i) === 10) l++;
        off = i + 1;
      }
      ta.focus();
      ta.setSelectionRange(off, off);
      pkcRefreshSyncMarker();
    });
  }

  /* PR-XX2 (2026-05-07、user 訂正指示):⇄ toggle button の click
   * handler + 初期 visual state。center pane と同じ localStorage key
   * を共有しているので、popup 開いた瞬間の値を visual に反映する。 */
  function pkcUpdateSyncToggleVisuals() {
    var btn = document.getElementById('btn-toggle-sync');
    if (!btn) return;
    var on = pkcSyncEnabled();
    btn.setAttribute('data-pkc-sync-state', on ? 'on' : 'off');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('title',
      on ? 'block 対応ハイライト ON(クリックで OFF)'
         : 'block 対応ハイライト OFF(クリックで ON)');
  }
  pkcUpdateSyncToggleVisuals();
  var pkcToggleBtn = document.getElementById('btn-toggle-sync');
  if (pkcToggleBtn) {
    pkcToggleBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      var next = !pkcSyncEnabled();
      try { localStorage.setItem(SYNC_KEY, next ? 'true' : 'false'); }
      catch (_e) { /* localStorage unavailable */ }
      pkcUpdateSyncToggleVisuals();
      if (next) {
        /* 即時 sync で「engage した」感覚を出す。OFF 時は marker を一掃。 */
        pkcRefreshSyncMarker();
      } else {
        pkcClearActiveMarker();
      }
    });
  }

  /* storage event:同 origin の他 window(center pane や別 popup)が
   * toggle した瞬間に本 popup の visual も追従させる。 */
  window.addEventListener('storage', function(ev) {
    if (ev.key !== SYNC_KEY) return;
    pkcUpdateSyncToggleVisuals();
    if (pkcSyncEnabled()) pkcRefreshSyncMarker();
    else pkcClearActiveMarker();
  });
}

/* ── Attachment preview boot ── */
function base64ToBlob(b64, mime) {
  var bin = atob(b64);
  var len = bin.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) { bytes[i] = bin.charCodeAt(i); }
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}
function base64ToText(b64) {
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) { bytes[i] = bin.charCodeAt(i); }
  try { return new TextDecoder().decode(bytes); }
  catch (_e) { return bin; }
}
function trackBlobUrl(url) { pkcActiveBlobUrls.push(url); return url; }
function revokeAllBlobUrls() {
  /*
   * Revoke every URL currently tracked in pkcActiveBlobUrls and reset
   * the array. Called from (a) bootAttachmentPreview at the start so
   * any stale URLs from a previous boot invocation are torn down
   * before new ones are created, and (b) the window unload handler as
   * the last-chance cleanup. Wrapped in try/catch per entry because
   * revoking an already-revoked URL throws in some engines.
   */
  for (var i = 0; i < pkcActiveBlobUrls.length; i++) {
    try { URL.revokeObjectURL(pkcActiveBlobUrls[i]); } catch (_e) { /* ignore */ }
  }
  pkcActiveBlobUrls = [];
}
function bootAttachmentPreview() {
  /*
   * Eager revoke of any previously-tracked URLs. bootAttachmentPreview
   * is normally called exactly once per child window, but this keeps
   * the function idempotent: if a future change ever re-invokes boot
   * (e.g. a hypothetical attachment-swap feature), the prior blob URLs
   * are released before new ones are created, so the array can never
   * grow past the set of URLs actually in use by the current preview.
   */
  revokeAllBlobUrls();
  if (!pkcAttachmentData) return;
  var el = document.querySelector('[data-pkc-ew-preview-type]');
  if (!el) return;
  var type = el.getAttribute('data-pkc-ew-preview-type');
  var mime = el.getAttribute('data-pkc-ew-mime') || pkcAttachmentMime;
  var name = el.getAttribute('data-pkc-ew-name') || '';
  try {
    if (type === 'image') {
      var img = el.querySelector('[data-pkc-ew-slot="img"]');
      if (img) img.src = 'data:' + mime + ';base64,' + pkcAttachmentData;
    } else if (type === 'pdf') {
      var iframe = el.querySelector('[data-pkc-ew-slot="iframe"]');
      if (iframe) {
        var url = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        iframe.src = url;
      }
    } else if (type === 'video') {
      var video = el.querySelector('[data-pkc-ew-slot="video"]');
      if (video) {
        var vurl = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        video.src = vurl;
      }
    } else if (type === 'audio') {
      var audio = el.querySelector('[data-pkc-ew-slot="audio"]');
      if (audio) {
        var aurl = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, mime)));
        audio.src = aurl;
      }
    } else if (type === 'html' || type === 'svg') {
      var htmlIframe = el.querySelector('[data-pkc-ew-slot="iframe"]');
      if (htmlIframe) {
        var allow = ['allow-same-origin'];
        for (var i = 0; i < pkcSandboxAllow.length; i++) {
          if (pkcSandboxAllow[i] !== 'allow-same-origin') allow.push(pkcSandboxAllow[i]);
        }
        htmlIframe.setAttribute('sandbox', allow.join(' '));
        htmlIframe.srcdoc = base64ToText(pkcAttachmentData);
        var note = el.querySelector('[data-pkc-ew-slot="sandbox-note"]');
        if (note) note.textContent = 'Sandbox: ' + allow.join(', ');
      }
    }
  } catch (_e) {
    /* Preview boot errors fall back silently — the info card + action row remain visible. */
  }
}
function openAttachmentInNewTab() {
  if (!pkcAttachmentData) return;
  /*
   * Track the URL in pkcActiveBlobUrls so the window unload handler
   * revokes it if the child closes before the 1500ms setTimeout fires.
   * The setTimeout still provides a best-effort early cleanup while
   * the child is still open — ~1.5s is the standard window-open grace
   * period for new tabs to finish loading the blob.
   */
  var url = trackBlobUrl(URL.createObjectURL(base64ToBlob(pkcAttachmentData, pkcAttachmentMime)));
  window.open(url, '_blank', 'noopener');
  setTimeout(function() {
    try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    /* Also prune the URL from pkcActiveBlobUrls so the unload handler
     * doesn't try to double-revoke it. Linear scan is fine — the array
     * is typically very small. */
    var idx = pkcActiveBlobUrls.indexOf(url);
    if (idx >= 0) pkcActiveBlobUrls.splice(idx, 1);
  }, 1500);
}
function downloadAttachmentFromChild() {
  if (!pkcAttachmentData) return;
  var blob = base64ToBlob(pkcAttachmentData, pkcAttachmentMime);
  /*
   * Track the URL the same way openAttachmentInNewTab does, so a close
   * before the 500ms timer still frees it via the unload handler.
   */
  var url = trackBlobUrl(URL.createObjectURL(blob));
  var a = document.createElement('a');
  a.href = url;
  var name = (document.querySelector('[data-pkc-ew-preview-type]') || { getAttribute: function() { return ''; } }).getAttribute('data-pkc-ew-name');
  a.download = name || 'attachment';
  document.body.appendChild(a);
  a.click();
  setTimeout(function() {
    if (a.parentNode) a.parentNode.removeChild(a);
    try { URL.revokeObjectURL(url); } catch (_e) { /* ignore */ }
    var idx = pkcActiveBlobUrls.indexOf(url);
    if (idx >= 0) pkcActiveBlobUrls.splice(idx, 1);
  }, 500);
}
document.addEventListener('click', function(e) {
  var target = e.target;
  /* Task checkbox toggle: route through parent for source-of-truth update. */
  if (target && target.tagName === 'INPUT' && target.hasAttribute('data-pkc-task-index')) {
    e.preventDefault();
    var taskIndex = parseInt(target.getAttribute('data-pkc-task-index'), 10);
    if (!isNaN(taskIndex) && window.opener) {
      var logRow = target.closest ? target.closest('[data-pkc-log-id]') : null;
      var logId = logRow ? logRow.getAttribute('data-pkc-log-id') : null;
      try { window.opener.postMessage({ type: 'pkc-entry-task-toggle', lid: lid, taskIndex: taskIndex, logId: logId }, '*'); }
      catch (_e) { /* parent closed */ }
    }
    return;
  }
  /* Non-image asset chip click: route download through the parent window. */
  var chip = target && target.closest ? target.closest('a[href^="#asset-"]') : null;
  if (chip) {
    e.preventDefault();
    var key = chip.getAttribute('href').slice('#asset-'.length);
    if (key && window.opener) {
      try { window.opener.postMessage({ type: 'pkc-entry-download-asset', assetKey: key }, '*'); }
      catch (_e) { /* parent closed or cross-origin */ }
    }
    return;
  }
  var actionBtn = target && target.closest ? target.closest('[data-pkc-ew-action]') : null;
  if (actionBtn) {
    var action = actionBtn.getAttribute('data-pkc-ew-action');
    if (action === 'open-attachment') { e.preventDefault(); openAttachmentInNewTab(); return; }
    if (action === 'download-attachment') { e.preventDefault(); downloadAttachmentFromChild(); return; }
  }
});

/*
 * PR-ζ₁ (cluster D) — minimal child-window keyboard bridge. Scope is
 * deliberately narrow: Ctrl+S / Cmd+S (save), Escape (cancel edit →
 * view, or close in view mode). Every other shortcut stays the main
 * window's concern.
 *
 * PR-ζ₂ extends the bridge with the six date/time insertion
 * shortcuts (Ctrl+; / Ctrl+: / Ctrl+Shift+; / Ctrl+D / Ctrl+Shift+D
 * / Ctrl+Shift+Alt+D). Only fires during \`currentMode === 'edit'\`
 * and when a text input (title or body textarea) is focused, so the
 * view mode and non-input targets are unaffected. Formatters are
 * inlined because this script runs in the child document and cannot
 * import \`features/datetime/datetime-format\` at runtime.
 *
 * The save path reuses the same pkc-entry-save postMessage the save
 * button already triggers, so parent-side routing does not change.
 */
document.addEventListener('keydown', function(e) {
  var mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === 's' || e.key === 'S')) {
    /* Always preventDefault so the browser "save page" dialog stays out
     * of the way, even when we are not in edit mode. */
    e.preventDefault();
    if (currentMode === 'edit') saveEntry();
    return;
  }
  if (e.key === 'Escape') {
    if (currentMode === 'edit') {
      e.preventDefault();
      cancelEdit();
    } else {
      e.preventDefault();
      window.close();
    }
    return;
  }
  /* PR-ζ₂: date/time shortcut parity. Only in edit mode, only when
   * a text input / textarea is focused. Mirrors the main-shell
   * catalog (see action-binder.ts getDateTimeShortcutText). */
  if (mod && currentMode === 'edit') {
    var txt = getDateTimeShortcutText(e);
    if (txt !== null) {
      e.preventDefault();
      insertAtCursor(txt);
      return;
    }
  }
  /* B-3 Slice γ (2026-05-14, PR-V3 wave): quote-assist parity in the
   * entry-window child. Inline mirror of features/markdown/quote-assist
   * because the child runs as a standalone document with no module
   * graph. Two behaviours: Enter on a non-empty quote line continues,
   * Enter on an empty quote line exits; Mod+Shift+. bulk-toggles the
   * "> " prefix on selected lines. */
  if (currentMode !== 'edit') return;
  var tgt = e.target;
  if (!(tgt && tgt.tagName === 'TEXTAREA')) return;
  if (mod && e.shiftKey && !e.altKey && !e.isComposing && (e.key === '.' || e.key === '>')) {
    var resQT = computeQuoteToggleChild(tgt.value, tgt.selectionStart || 0, tgt.selectionEnd || 0);
    if (resQT) {
      e.preventDefault();
      applyQuoteToggleChild(tgt, resQT);
    }
    return;
  }
  if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey && !e.isComposing) {
    var s = tgt.selectionStart || 0;
    var en = tgt.selectionEnd != null ? tgt.selectionEnd : s;
    if (s !== en) return;
    var act = computeQuoteAssistEnterChild(tgt.value, s);
    if (!act) return;
    e.preventDefault();
    if (act.type === 'continue') {
      insertAtCursor(act.insert);
    } else {
      replaceRangeChild(tgt, act.rangeStart, act.rangeEnd, act.replacement);
    }
  }
});

/* B-3 Slice γ (2026-05-14): child-side inline mirror of
 * features/markdown/quote-assist.computeQuoteAssistOnEnter. Same
 * contract — caret at end of a non-empty quote line returns continue,
 * empty quote line returns exit, anything else null. Kept hand-mirrored
 * because the child cannot import the features module. */
function computeQuoteAssistEnterChild(value, caretPos) {
  if (caretPos < 0 || caretPos > value.length) return null;
  if (caretPos < value.length && value[caretPos] !== '\\n') return null;
  var lineStart = value.lastIndexOf('\\n', caretPos - 1) + 1;
  var line = value.slice(lineStart, caretPos);
  var m = /^>[ \\t]?(.*)$/.exec(line);
  if (!m) return null;
  var afterPrefix = m[1] || '';
  if (afterPrefix === '') {
    return { type: 'exit', rangeStart: lineStart, rangeEnd: caretPos, replacement: '\\n' };
  }
  return { type: 'continue', insert: '\\n> ' };
}

/* B-3 Slice γ: child-side mirror of computeQuoteToggleOnSelection.
 * Toggles the leading "> " marker across all lines covered by the
 * selection (or the caret line). */
function computeQuoteToggleChild(value, selStart, selEnd) {
  if (selStart < 0 || selEnd < 0 || selStart > value.length || selEnd > value.length) return null;
  if (selStart > selEnd) { var tmp = selStart; selStart = selEnd; selEnd = tmp; }
  var blockStart = value.lastIndexOf('\\n', selStart - 1) + 1;
  var blockEndExclusive = selEnd;
  if (selEnd > selStart && value[selEnd - 1] === '\\n') blockEndExclusive = selEnd - 1;
  var nlAfter = value.indexOf('\\n', blockEndExclusive);
  var blockEnd = nlAfter === -1 ? value.length : nlAfter;
  var block = value.slice(blockStart, blockEnd);
  if (block.length === 0 && selStart === selEnd) {
    var nb = '> ';
    return {
      value: value.slice(0, blockStart) + nb + value.slice(blockEnd),
      selStart: blockStart,
      selEnd: blockStart + nb.length,
    };
  }
  var lines = block.split('\\n');
  var allQuoted = lines.length > 0 && lines.every(function(l) { return /^>[ \\t]?/.test(l); });
  var newLines = allQuoted
    ? lines.map(function(l) { return l.replace(/^>[ \\t]?/, ''); })
    : lines.map(function(l) { return l === '' ? '>' : '> ' + l; });
  var newBlock = newLines.join('\\n');
  if (newBlock === block) return null;
  return {
    value: value.slice(0, blockStart) + newBlock + value.slice(blockEnd),
    selStart: blockStart,
    selEnd: blockStart + newBlock.length,
  };
}

function applyQuoteToggleChild(ta, result) {
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  var inserted = false;
  try { inserted = document.execCommand('insertText', false, result.value); } catch (_) {}
  if (!inserted) {
    ta.value = result.value;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(result.selStart, result.selEnd);
}

function replaceRangeChild(ta, rangeStart, rangeEnd, replacement) {
  ta.focus();
  ta.setSelectionRange(rangeStart, rangeEnd);
  var replaced = false;
  try { replaced = document.execCommand('insertText', false, replacement); } catch (_) {}
  if (!replaced) {
    ta.value = ta.value.slice(0, rangeStart) + replacement + ta.value.slice(rangeEnd);
    var newCaret = rangeStart + replacement.length;
    ta.selectionStart = ta.selectionEnd = newCaret;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
/* Inline date/time helpers — duplicates features/datetime because the
 * child runs as a standalone document with no module graph. Kept
 * compact; each formatter's output matches the main-shell spec
 * verbatim so copy/paste across windows stays byte-identical. */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtDate(d) { return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()); }
function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()); }
function fmtDateTime(d) { return fmtDate(d) + ' ' + fmtTime(d); }
function fmtShortDate(d) {
  var day = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d);
  return pad2(d.getFullYear() % 100) + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()) + ' ' + day;
}
function fmtShortDateTime(d) { return fmtShortDate(d) + ' ' + fmtTime(d); }
function fmtISO8601(d) {
  var offset = -d.getTimezoneOffset();
  var sign = offset >= 0 ? '+' : '-';
  var abs = Math.abs(offset);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + fmtTime(d) + sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
}
function getDateTimeShortcutText(e) {
  var now = new Date();
  if (e.key === ';' && !e.shiftKey && !e.altKey) return fmtDate(now);
  if ((e.key === ':' || (e.key === ';' && e.shiftKey)) && !e.altKey) {
    return e.shiftKey ? fmtDateTime(now) : fmtTime(now);
  }
  if (e.key === 'd' || e.key === 'D') {
    if (e.shiftKey && e.altKey) return fmtISO8601(now);
    if (e.shiftKey) return fmtShortDateTime(now);
    if (!e.altKey) return fmtShortDate(now);
  }
  return null;
}
function insertAtCursor(text) {
  var el = document.activeElement;
  if (!el) return;
  var isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text');
  if (!isText) return;
  var start = el.selectionStart != null ? el.selectionStart : el.value.length;
  var end = el.selectionEnd != null ? el.selectionEnd : start;
  el.focus();
  try { el.setSelectionRange(start, end); } catch (_) {}
  var inserted = false;
  try { inserted = document.execCommand('insertText', false, text); } catch (_) {}
  if (!inserted) {
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + text.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
window.addEventListener('pagehide', revokeAllBlobUrls);
window.addEventListener('unload', revokeAllBlobUrls);
bootAttachmentPreview();

/*
 * Returns true if the current edit-pane state differs from the saved
 * originals captured at window-open time (or refreshed by the most
 * recent 'pkc-entry-saved' message). Used exclusively by the view-
 * body rerender policy below to decide whether a parent-pushed
 * rerender should apply immediately or stash as pending.
 *
 * Intentionally a snapshot comparison: we only check at message-
 * arrival time and at cancel/save transitions. We do not install an
 * 'input' listener to track dirtiness continuously, so a user who
 * manually undoes their edit back to the original and then waits
 * will only see the pending update applied on the next explicit
 * cancel or save. This is acceptable and keeps the policy simple.
 */
function isEntryDirty() {
  var titleEl = document.getElementById('title-input');
  if (!titleEl) return false;
  if (titleEl.value !== originalTitle) return true;
  if (useStructuredEditor) {
    return collectStructuredBody() !== originalBody;
  }
  var bodyEl = document.getElementById('body-edit');
  return bodyEl ? bodyEl.value !== originalBody : false;
}

/*
 * Show / hide the pending-view-refresh notice element. The element's
 * initial hidden state is set via the inline style="display:none"
 * attribute in the HTML, so toggling to '' (auto-inherit) is enough
 * to reveal it. Both helpers are null-safe so that unit tests that
 * build a minimal DOM fragment without the notice element don't
 * throw when exercising the listener path.
 */
function showPendingViewNotice() {
  var el = document.getElementById('pending-view-notice');
  if (el) el.style.display = '';
}
function hidePendingViewNotice() {
  var el = document.getElementById('pending-view-notice');
  if (el) el.style.display = 'none';
}

function showPendingTitleNotice() {
  var el = document.getElementById('pending-title-notice');
  if (el) el.style.display = '';
}
function hidePendingTitleNotice() {
  var el = document.getElementById('pending-title-notice');
  if (el) el.style.display = 'none';
}

/*
 * Apply a stashed pendingTitle after a dirty → clean transition
 * (cancelEdit). Updates document.title, #title-display, originalTitle
 * in one atomic block and clears the pending state.
 *
 * 'pkc-entry-saved' does NOT use this helper — save's own rerender
 * (originalTitle = title-input.value) is authoritative, so any stale
 * pendingTitle is discarded instead.
 */
function flushPendingTitle() {
  if (pendingTitle == null) return;
  var nextTitle = pendingTitle;
  document.title = nextTitle + ' — PKC2';
  var titleEl = document.getElementById('title-display');
  if (titleEl) titleEl.textContent = nextTitle;
  var titleInputEl = document.getElementById('title-input');
  /*
   * Safe to write: flushPendingTitle is invoked after a dirty → clean
   * transition (cancelEdit). The input has just been rolled back to
   * the pre-flush originalTitle, so there is no in-progress user edit
   * to stomp. Updating the input keeps it in sync with the new
   * baseline for the next enterEdit().
   */
  if (titleInputEl) titleInputEl.value = nextTitle;
  originalTitle = nextTitle;
  pendingTitle = null;
  hidePendingTitleNotice();
}

/*
 * Collect body from structured editor fields. Mirrors the center pane's
 * collectBody pattern for each archetype. Returns the serialized body
 * string ready for the save protocol.
 */
function collectStructuredBody() {
  if (entryArchetype === 'textlog') {
    var hiddenBody = document.querySelector('[data-pkc-field="body"]');
    var original = { entries: [] };
    try { original = JSON.parse(hiddenBody ? hiddenBody.value : '{}'); } catch (_e) {}
    var origMap = {};
    for (var k = 0; k < original.entries.length; k++) {
      origMap[original.entries[k].id] = original.entries[k];
    }
    var rows = document.querySelectorAll('.pkc-textlog-edit-row');
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (row.getAttribute('data-pkc-deleted') === 'true') continue;
      var logId = row.getAttribute('data-pkc-log-id');
      var textarea = row.querySelector('[data-pkc-field="textlog-entry-text"]');
      var flagChk = row.querySelector('[data-pkc-field="textlog-flag"]');
      var text = textarea ? textarea.value : '';
      var flags = flagChk && flagChk.checked ? ['important'] : [];
      var orig = origMap[logId] || {};
      entries.push({ id: logId, text: text, createdAt: orig.createdAt || new Date().toISOString(), flags: flags });
    }
    entries.reverse();
    return JSON.stringify({ entries: entries });
  }
  if (entryArchetype === 'todo') {
    var statusEl = document.querySelector('[data-pkc-field="todo-status"]');
    var descEl = document.querySelector('[data-pkc-field="todo-description"]');
    var dateEl = document.querySelector('[data-pkc-field="todo-date"]');
    var archivedEl = document.querySelector('[data-pkc-field="todo-archived"]');
    var obj = { status: statusEl && statusEl.value === 'done' ? 'done' : 'open', description: descEl ? descEl.value : '' };
    if (dateEl && dateEl.value) obj.date = dateEl.value;
    if (archivedEl && archivedEl.checked) obj.archived = true;
    return JSON.stringify(obj);
  }
  if (entryArchetype === 'form') {
    var nameEl = document.querySelector('[data-pkc-field="form-name"]');
    var noteEl = document.querySelector('[data-pkc-field="form-note"]');
    var checkedEl = document.querySelector('[data-pkc-field="form-checked"]');
    return JSON.stringify({ name: nameEl ? nameEl.value : '', note: noteEl ? noteEl.value : '', checked: checkedEl ? checkedEl.checked : false });
  }
  return document.getElementById('body-edit').value;
}

/*
 * Restore structured editor fields to their original values on cancel.
 */
function restoreStructuredEditor() {
  try {
    if (entryArchetype === 'textlog') {
      var parsed = JSON.parse(originalBody);
      if (!parsed.entries) return;
      /* Remove any deletion markers and restore original content */
      var rows = document.querySelectorAll('.pkc-textlog-edit-row');
      var origMap = {};
      var reversed = parsed.entries.slice().reverse();
      for (var k = 0; k < reversed.length; k++) origMap[reversed[k].id] = reversed[k];
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        row.removeAttribute('data-pkc-deleted');
        row.style.display = '';
        var logId = row.getAttribute('data-pkc-log-id');
        var orig = origMap[logId];
        if (orig) {
          var ta = row.querySelector('[data-pkc-field="textlog-entry-text"]');
          if (ta) ta.value = orig.text || '';
          var fl = row.querySelector('[data-pkc-field="textlog-flag"]');
          if (fl) fl.checked = (orig.flags || []).indexOf('important') >= 0;
        }
      }
    }
    if (entryArchetype === 'todo') {
      var todo = JSON.parse(originalBody);
      var s = document.querySelector('[data-pkc-field="todo-status"]');
      if (s) s.value = todo.status || 'open';
      var d = document.querySelector('[data-pkc-field="todo-description"]');
      if (d) d.value = todo.description || '';
      var dt = document.querySelector('[data-pkc-field="todo-date"]');
      if (dt) dt.value = todo.date || '';
      var ar = document.querySelector('[data-pkc-field="todo-archived"]');
      if (ar) ar.checked = !!todo.archived;
    }
    if (entryArchetype === 'form') {
      var form = JSON.parse(originalBody);
      var n = document.querySelector('[data-pkc-field="form-name"]');
      if (n) n.value = form.name || '';
      var nt = document.querySelector('[data-pkc-field="form-note"]');
      if (nt) nt.value = form.note || '';
      var ch = document.querySelector('[data-pkc-field="form-checked"]');
      if (ch) ch.checked = !!form.checked;
    }
  } catch (_e) {}
}

/*
 * Render body HTML for view mode. For TEXTLOG, delegate to the
 * parent-side day-grouped builder via window.opener so the child's
 * post-save rerender produces the exact same DOM shape as the initial
 * renderViewBody and pushTextlogViewBodyUpdate paths. For all other
 * archetypes, delegate to renderMd.
 */
function renderBodyView(body) {
  if (entryArchetype !== 'textlog') return renderMd(body);
  try {
    if (window.opener && typeof window.opener.pkcRenderTextlogViewBody === 'function') {
      return window.opener.pkcRenderTextlogViewBody(lid, body);
    }
  } catch (_e) { /* cross-origin or closed — fall through */ }
  /*
   * Fallback: legacy per-log flat rendering via renderMd. Keeps the
   * data-pkc-log-id markers so task-toggle continues to work even if
   * the opener is unavailable; lacks day grouping and log headers.
   */
  try {
    var parsed = JSON.parse(body);
    if (!parsed.entries || !parsed.entries.length) {
      return '<em style="color:var(--c-muted)">(empty)</em>';
    }
    var parts = [];
    for (var i = 0; i < parsed.entries.length; i++) {
      var le = parsed.entries[i];
      var html = renderMd(le.text || '') || '';
      parts.push('<div data-pkc-log-id="' + le.id + '">' + html + '</div>');
    }
    return parts.join('');
  } catch (_e) {
    return renderMd(body);
  }
}

/*
 * Derive task completion badge from the visible #body-view DOM.
 * Counts .pkc-task-checkbox elements to produce a done/total badge.
 * Called after every body-view innerHTML update (init, push, save, flush).
 */
function updateTaskBadge() {
  var bodyView = document.getElementById('body-view');
  var badge = document.getElementById('task-badge');
  if (!bodyView || !badge) return;
  var checkboxes = bodyView.querySelectorAll('.pkc-task-checkbox');
  if (checkboxes.length === 0) {
    badge.style.display = 'none';
    badge.removeAttribute('data-pkc-task-complete');
    return;
  }
  var done = 0;
  for (var i = 0; i < checkboxes.length; i++) {
    if (checkboxes[i].checked) done++;
  }
  badge.textContent = done + '/' + checkboxes.length;
  badge.style.display = '';
  if (done === checkboxes.length) {
    badge.setAttribute('data-pkc-task-complete', 'true');
  } else {
    badge.removeAttribute('data-pkc-task-complete');
  }
}

/*
 * Apply any stashed pendingViewBody to #body-view.innerHTML and
 * clear the stash. No-op when nothing is pending. This is the
 * canonical dirty → clean transition point invoked by cancelEdit()
 * below. The 'pkc-entry-saved' branch does NOT call this helper —
 * see pendingViewBody's JSDoc for why save discards pending instead
 * of applying it.
 */
function flushPendingViewBody() {
  if (pendingViewBody == null) return;
  var viewBodyEl = document.getElementById('body-view');
  if (viewBodyEl) viewBodyEl.innerHTML = pendingViewBody;
  pendingViewBody = null;
  hidePendingViewNotice();
  updateTaskBadge();
}

// Close affordance for PWA / standalone-mode where OS-level
// window chrome is missing. window.close works for popups opened
// by the same-origin parent; history.back is the fallback path.
function closeEntryWindow() {
  try { window.close(); } catch (e) { /* fall through */ }
  if (!window.closed && window.history.length > 1) {
    window.history.back();
  }
}

/* γ-A5: 別窓プレビュー(viewer role)を分離する。parent が openViewerWindow
 * を呼ぶ。flag OFF のときは btn-viewer 自体が描画されないため到達しない。 */
function openViewerWin() {
  if (window.opener) {
    window.opener.postMessage({ type: 'pkc-open-viewer', lid: lid }, '*');
  }
}

/* γ-A5: TOC 別窓(monitor role)を開く。parent が openMonitorWindow を呼ぶ。 */
function openTocMonitor() {
  if (window.opener) {
    window.opener.postMessage({ type: 'pkc-open-monitor', kind: 'toc', lid: lid }, '*');
  }
}

/* γ-A5-5 §5.3: 競合 banner の下に 2-pane 行 diff を自前描画する。
 * diff(DiffRow[])は parent が computeして postMessage で渡す(データ経路)。 */
function renderConflictDiff(diff) {
  var box = document.getElementById('conflict-diff');
  if (!box) return;
  box.textContent = '';
  if (!diff || !diff.length) { box.style.display = 'none'; return; }
  for (var i = 0; i < diff.length; i++) {
    var r = diff[i];
    var row = document.createElement('div');
    row.className = 'pkc-conflict-diff-row';
    var L = document.createElement('div');
    L.className = 'pkc-conflict-diff-cell';
    L.setAttribute('data-op', r.op === 'add' ? 'empty' : r.op);
    L.textContent = r.left == null ? '' : r.left;
    var R = document.createElement('div');
    R.className = 'pkc-conflict-diff-cell';
    R.setAttribute('data-op', r.op === 'del' ? 'empty' : r.op);
    R.textContent = r.right == null ? '' : r.right;
    row.appendChild(L);
    row.appendChild(R);
    box.appendChild(row);
  }
  box.style.display = '';
}

function enterEdit() {
  currentMode = 'edit';
  document.getElementById('view-pane').style.display = 'none';
  document.getElementById('edit-pane').style.display = '';
  document.getElementById('btn-edit').style.display = 'none';
  document.getElementById('btn-save').style.display = '';
  document.getElementById('btn-cancel').style.display = '';
  document.getElementById('action-bar').setAttribute('data-pkc-editing', 'true');
  document.getElementById('bar-status').textContent = '✎ Editing';
  /* A-2 split editor: both textarea + preview are always visible, so
   * there is no "show source tab" initialization. Refresh the preview
   * once at edit-entry to pick up any view-body update that arrived
   * while the user was still in view mode. */
  if (useSplitEditor) {
    var src = document.getElementById('body-edit').value;
    renderMdInto(document.getElementById('body-preview'), src);
  } else if (!useStructuredEditor) {
    showTab('source');
  }
}

function cancelEdit() {
  currentMode = 'view';
  document.getElementById('view-pane').style.display = '';
  document.getElementById('edit-pane').style.display = 'none';
  document.getElementById('btn-edit').style.display = '';
  document.getElementById('btn-save').style.display = 'none';
  document.getElementById('btn-cancel').style.display = 'none';
  document.getElementById('action-bar').removeAttribute('data-pkc-editing');
  document.getElementById('bar-status').textContent = '';
  if (useStructuredEditor) {
    restoreStructuredEditor();
  } else {
    document.getElementById('body-edit').value = originalBody;
  }
  document.getElementById('title-input').value = originalTitle;
  /*
   * The user just discarded in-progress edits — body-edit and
   * title-input are now back in sync with originalBody / originalTitle,
   * so isEntryDirty() would return false. If a pending view-body
   * rerender was stashed while the child was dirty, apply it now so
   * the view pane shows the freshest parent-side state.
   */
  flushPendingViewBody();
  flushPendingTitle();
}

function showTab(tab) {
  if (tab === 'source') {
    document.getElementById('body-edit').style.display = '';
    document.getElementById('body-preview').style.display = 'none';
    document.getElementById('tab-source').setAttribute('data-pkc-active', 'true');
    document.getElementById('tab-preview').removeAttribute('data-pkc-active');
  } else {
    /* Re-render markdown from the CURRENT textarea value */
    var src = document.getElementById('body-edit').value;
    renderMdInto(document.getElementById('body-preview'), src);
    document.getElementById('body-edit').style.display = 'none';
    document.getElementById('body-preview').style.display = '';
    document.getElementById('tab-preview').setAttribute('data-pkc-active', 'true');
    document.getElementById('tab-source').removeAttribute('data-pkc-active');
  }
}

/*
 * Render markdown using the parent window's markdown-it instance.
 * Preference order:
 *   1. pkcRenderEntryPreview(lid, text) — resolves image embeds and
 *      non-image chips against the per-lid context captured at window
 *      open time, then renders. Used for TEXT / TEXTLOG entries.
 *   2. pkcRenderMarkdown(text) — legacy raw-markdown path, kept for
 *      non-text archetypes and parents without the new helper.
 *   3. Plain-text HTML escape — last-resort fallback if the parent is
 *      unavailable (cross-origin or closed).
 */
function renderMd(text) {
  if (!text) return '<em style="color:var(--c-muted)">(empty)</em>';
  try {
    if (window.opener && typeof window.opener.pkcRenderEntryPreview === 'function') {
      /*
       * Pass childPreviewCtx as the override so any live-refreshed
       * snapshot (pushed after open) wins over the parent's initial
       * per-lid map. When childPreviewCtx is still null (no push has
       * arrived yet), the opener falls back to the initial map — so
       * the first Preview tab switch after open keeps working.
       */
      return window.opener.pkcRenderEntryPreview(lid, text, childPreviewCtx);
    }
    if (window.opener && typeof window.opener.pkcRenderMarkdown === 'function') {
      return window.opener.pkcRenderMarkdown(text);
    }
  } catch (_e) { /* cross-origin or closed — fall through */ }
  /* Fallback: plain text with HTML escaping */
  var escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<pre>' + escaped + '</pre>';
}

/* user direction 2026-05-28: プレビューにおいて負荷を増幅させずに mermaid
 * レンダーを有効化。child の preview element に innerHTML を流し込んだ後、
 * parent の pkcHydratePreviewMermaid(element) を呼んで cross-document に
 * SVG hydrate を走らせる。fire-and-forget(SVG 完了は次 frame 以降)+
 * parent 側 source→svg cache で連続更新時の負荷増幅を抑制。
 * HTML render iframe は HTML 文字列に含まれて自己完結するため別途 hydrate 不要。 */
function renderMdInto(el, text) {
  el.innerHTML = renderMd(text);
  if (window.opener && typeof window.opener.pkcHydratePreviewMermaid === 'function') {
    try { window.opener.pkcHydratePreviewMermaid(el); } catch (_e) { /* parent closed / xorigin */ }
  }
}

function saveEntry() {
  var title = document.getElementById('title-input').value;
  var body = useStructuredEditor ? collectStructuredBody() : document.getElementById('body-edit').value;
  window.opener.postMessage({ type: 'pkc-entry-save', lid: lid, title: title, body: body }, '*');
  document.getElementById('status').textContent = 'Saving...';
}

window.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'pkc-entry-saved') {
    originalTitle = document.getElementById('title-input').value;
    originalBody = useStructuredEditor ? collectStructuredBody() : document.getElementById('body-edit').value;
    /* Update the view-pane body to reflect saved content */
    document.getElementById('title-display').textContent = originalTitle;
    document.getElementById('body-view').innerHTML = renderBodyView(originalBody);
    updateTaskBadge();
    document.getElementById('status').textContent = 'Saved.';
    setTimeout(function() { document.getElementById('status').textContent = ''; }, 2000);
    /*
     * Dirty state policy: save's own rerender (just above) is the
     * authoritative view — it reflects the exact text the user just
     * persisted, resolved through the parent's current container
     * state via renderMd → opener.pkcRenderEntryPreview. Any stale
     * pendingViewBody captured from an earlier parent push is
     * deliberately DISCARDED here, not applied. See pendingViewBody's
     * JSDoc at the top of this script.
     */
    pendingViewBody = null;
    hidePendingViewNotice();
    /*
     * Same policy for a stashed pending title: save just wrote
     * originalTitle from the live title-input, which is authoritative.
     * Any earlier parent push is now stale, so discard it.
     */
    pendingTitle = null;
    hidePendingTitleNotice();
  }
  if (e.data && e.data.type === 'pkc-entry-conflict') {
    var banner = document.getElementById('conflict-banner');
    banner.textContent = e.data.message;
    banner.style.display = '';
    renderConflictDiff(e.data.diff);
  }
  if (e.data && e.data.type === 'pkc-entry-update-preview-ctx') {
    /*
     * Live refresh of the edit-mode Preview resolver context. We only
     * update the local variable; we do NOT re-render anything. The
     * next time the user switches to the Preview tab (or the already-
     * visible preview is re-invoked via showTab('preview')) the new
     * snapshot will be passed to opener.pkcRenderEntryPreview.
     *
     * The Source textarea and the view-pane body are deliberately
     * untouched — this message only affects the preview resolver.
     */
    childPreviewCtx = e.data.previewCtx || null;
    if (currentMode === 'edit' && document.getElementById('body-preview').style.display !== 'none') {
      /*
       * If the Preview tab is currently visible, re-render it in place
       * so the user sees the effect immediately. This does NOT touch
       * body-edit (the Source textarea) and does NOT touch body-view
       * (the view-pane HTML) — only body-preview (the Preview tab's
       * scratch div) is updated.
       */
      var src = document.getElementById('body-edit').value;
      renderMdInto(document.getElementById('body-preview'), src);
    }
  }
  if (e.data && e.data.type === 'pkc-entry-update-view-body') {
    /*
     * View-pane rerender: the parent has computed a fresh HTML
     * string for the view-mode body (e.g. because container assets
     * changed and the resolvedBody needs to be re-rendered) and
     * pushed it here via postMessage.
     *
     * Dirty state policy (see pendingViewBody JSDoc above):
     *   - Clean: apply immediately to #body-view.innerHTML and drop
     *     any stale pending stash.
     *   - Dirty: stash into pendingViewBody and surface the
     *     #pending-view-notice element. Do NOT touch #body-view,
     *     do NOT touch #body-edit, do NOT touch #body-preview,
     *     do NOT touch the title elements, do NOT touch the
     *     originalBody / originalTitle trackers.
     *
     * The dirty branch guarantees the user's in-progress edit is
     * preserved bit-for-bit. The pending stash will be applied on
     * the next cancelEdit() (see flushPendingViewBody), or
     * discarded on the next 'pkc-entry-saved' (save's own rerender
     * is authoritative).
     *
     * Note: Preview live refresh ('pkc-entry-update-preview-ctx',
     * the branch above) runs independently of this policy — the
     * edit-mode Preview tab stays fresh even while the view pane
     * is held stale by a dirty stash.
     *
     * Trust: the payload is rendered HTML produced by the parent's
     * markdown renderer, which runs in the same origin as the
     * initial document.write that built this child. No additional
     * sanitization is applied here.
     */
    if (typeof e.data.viewBody === 'string') {
      if (isEntryDirty()) {
        pendingViewBody = e.data.viewBody;
        showPendingViewNotice();
      } else {
        var viewBodyEl = document.getElementById('body-view');
        if (viewBodyEl) viewBodyEl.innerHTML = e.data.viewBody;
        pendingViewBody = null;
        hidePendingViewNotice();
        updateTaskBadge();
      }
    }
  }
  if (e.data && e.data.type === 'pkc-entry-update-title') {
    /*
     * Title live refresh. The parent has observed that this entry's
     * title changed (rename) and pushed the new string here.
     *
     * Surfaces updated (see docs/development/entry-window-title-live-
     * refresh-v1.md §2): document.title, #title-display.textContent,
     * the script-scope originalTitle variable, and — when safe — the
     * #title-input value.
     *
     * Dirty state policy (§4): if the child is currently in edit mode,
     * stash into pendingTitle and surface #pending-title-notice. The
     * user's in-progress #title-input value is NEVER overwritten while
     * they are editing. The document.title (tab bar) is still updated
     * immediately because it has no dirty-state semantics and users
     * expect it to track the canonical source of truth.
     *
     * Flush / discard mirrors pendingViewBody: cancelEdit() flushes,
     * 'pkc-entry-saved' discards (save path is authoritative).
     */
    if (typeof e.data.title === 'string') {
      var nextTitle = e.data.title;
      document.title = nextTitle + ' — PKC2';
      if (currentMode === 'edit') {
        pendingTitle = nextTitle;
        showPendingTitleNotice();
      } else {
        var titleDisplayEl = document.getElementById('title-display');
        if (titleDisplayEl) titleDisplayEl.textContent = nextTitle;
        var titleInputElLive = document.getElementById('title-input');
        if (titleInputElLive) titleInputElLive.value = nextTitle;
        originalTitle = nextTitle;
        pendingTitle = null;
        hidePendingTitleNotice();
      }
    }
  }
});
/* Derive initial task badge from the rendered body */
updateTaskBadge();
/* TEXTLOG delete button handler — mark row as deleted and hide it */
if (useStructuredEditor && entryArchetype === 'textlog') {
  document.addEventListener('click', function(ev) {
    var btn = ev.target;
    if (!btn || !btn.getAttribute) return;
    if (btn.getAttribute('data-pkc-field') !== 'textlog-delete') return;
    var row = btn.closest('.pkc-textlog-edit-row');
    if (row) {
      row.setAttribute('data-pkc-deleted', 'true');
      row.style.display = 'none';
    }
  });
}
${!readonly && startEditing ? "/* Auto-enter edit mode on open */\nenterEdit();" : ''}
${shellWindowLayoutPersistEnabled() ? geometryReportScript(readonly ? 'viewer' : 'editor', entry.lid, null) : ''}
</script>
</body>
</html>`;
}
