/**
 * Tab strip(vscode-grade-overhaul-2026-05 MASTER.md §4.3、wave-α PR pgc-85
 * POC)。
 *
 * VSCode 流 「複数 entry 同時 open」 を tab で実装する第 1 段階。本 POC は
 * **module-local state**(reducer に手を入れず adapter のみ完結)で「最近
 * select した entry 群」 を tab strip として描画する skeleton を提供。
 *
 * Tier 0 flag `shell.tabs_enabled`(default OFF)で gate ── OFF で完全 no-op、
 * 既存挙動(1 entry = center pane 表示)を維持。
 *
 * POC scope(本 PR):
 *   - SELECT_ENTRY を listen して openTabs に append + activeTab を更新
 *   - tab strip(`.pkc-tab-strip`)を view-mode bar の **上** に描画
 *   - tab click → SELECT_ENTRY、× ボタン → close、middle-click → close
 *   - dirty 状態(`state.phase === 'editing'` で activeTab と一致)を `●` 表示
 *
 * 後続 PR(pgc-86〜):
 *   - tab restoration on reload(localStorage)
 *   - Ctrl+W で close / Ctrl+Shift+T で reopen 直前 tab
 *   - 並べ替え DnD
 *   - split editor(horizontal / vertical)
 *   - pin tab
 *   - view-mode を tab 化(workspace-level vs entry-level)
 */

import type { Container } from '../../core/model/container';
import type { AppState } from '../state/app-state';
import type { Dispatcher } from '../state/dispatcher';
import { shellTabsEnabled } from './shell-flags';

/**
 * Tab info ── entry tab(specific entry を open)と view tab(workspace-level
 * の view-mode、pgc-87 で導入)を **同じ array** で扱う discriminated union。
 *
 * - kind === 'entry':lid は entry の lid、archetype は entry の archetype
 * - kind === 'view':lid は `__view:${mode}` sentinel、archetype は `'view'`、
 *   mode は workspace view-mode(calendar / kanban / filer / graph / launcher)
 */
type ViewMode = 'calendar' | 'kanban' | 'filer' | 'launcher';

interface TabInfo {
  readonly lid: string;
  readonly archetype: string;
  readonly title: string;
  readonly kind?: 'entry' | 'view';
  readonly mode?: ViewMode;
  /** pgc-88:pinned tab は close 不可、close 系操作で skip される。 */
  readonly pinned?: boolean;
}

let openTabs: TabInfo[] = [];
let activeLid: string | null = null;
let recentlyClosed: TabInfo[] = []; // for future Ctrl+Shift+T

const MAX_TABS = 32;
const MAX_RECENTLY_CLOSED = 16;

const ARCHETYPE_ICON: Record<string, string> = {
  text: '📝',
  textlog: '📋',
  todo: '☑',
  attachment: '📎',
  folder: '📁',
  form: '📝',
  generic: '📄',
  opaque: '⚫',
  view: '📊',
};

const VIEW_TAB_LID_PREFIX = '__view:';
export function viewTabLid(mode: ViewMode): string {
  return `${VIEW_TAB_LID_PREFIX}${mode}`;
}
function isViewTabLid(lid: string): boolean {
  return lid.startsWith(VIEW_TAB_LID_PREFIX);
}
function viewTabModeFromLid(lid: string): ViewMode | null {
  if (!isViewTabLid(lid)) return null;
  return lid.slice(VIEW_TAB_LID_PREFIX.length) as ViewMode;
}

const VIEW_TAB_META: Record<ViewMode, { title: string; icon: string }> = {
  calendar: { title: 'カレンダー / Calendar', icon: '📅' },
  kanban:   { title: 'カンバン / Kanban',     icon: '🗂' },
  filer:    { title: 'ファイラー / Filer',     icon: '🗃' },
  launcher: { title: 'ランチャー / Launcher',  icon: '🚀' },
};

/**
 * View tab(workspace-level の view-mode tab)を open。既存なら active 化。
 * 戻り値:tab lid(`__view:${mode}`)。
 */
export function openViewTab(mode: ViewMode): string {
  const lid = viewTabLid(mode);
  const meta = VIEW_TAB_META[mode];
  const found = openTabs.find((t) => t.lid === lid);
  if (found) {
    activeLid = lid;
    return lid;
  }
  if (openTabs.length >= MAX_TABS) {
    const idx = openTabs.findIndex((t) => t.lid !== activeLid);
    if (idx >= 0) openTabs.splice(idx, 1);
  }
  openTabs.push({
    lid,
    archetype: 'view',
    title: meta.title,
    kind: 'view',
    mode,
  });
  activeLid = lid;
  return lid;
}

/**
 * tab が view tab か(adapter / smoke 内部で識別する helper)。
 */
export function isViewTabInfo(t: TabInfo): boolean {
  return t.kind === 'view' || isViewTabLid(t.lid);
}

/**
 * 与えた view-mode を tab strip で active 状態にする(既存 view tab があれば
 * active のみ更新)。state.viewMode 変化を listen する wireTabStrip で
 * 呼ばれる。
 */
export function syncActiveViewTab(mode: ViewMode): void {
  const lid = viewTabLid(mode);
  if (openTabs.find((t) => t.lid === lid)) {
    activeLid = lid;
  }
}

/**
 * `ENTRY_SELECTED` で呼ばれる ── tab list に lid を追加 / 更新 + active 化。
 * すでに open なら append しない、active のみ更新。
 */
export function recordTabOpen(lid: string, container: Container | null): void {
  if (!container) return;
  // view tab(__view:*)は entry lookup の対象外、別経路で開かれる
  if (isViewTabLid(lid)) return;
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return;
  // 既存なら active 更新だけ ── pgc-137 wave-δ #11:重複 Open 意識づけ。
  // 既存 tab の re-focus は `justFocusedLid` を立て、buildTabStripElement
  // が `data-pkc-just-focused="true"` を付けて CSS で短い「pulse」flash。
  const found = openTabs.find((t) => t.lid === lid);
  if (found) {
    activeLid = lid;
    markJustFocused(lid);
    return;
  }
  // 新規 ── 上限 reached なら最も古い non-active を削る
  if (openTabs.length >= MAX_TABS) {
    const idx = openTabs.findIndex((t) => t.lid !== activeLid);
    if (idx >= 0) openTabs.splice(idx, 1);
  }
  openTabs.push({
    lid,
    archetype: entry.archetype,
    title: entry.title || '(untitled)',
  });
  activeLid = lid;
  // pgc-137 wave-δ #11:新規 tab open ── `data-pkc-just-opened="true"`
  // を付けて CSS で別の(やや長い)slide-in animation を再生、user に
  // 「新 tab が増えた」と「既存 tab に re-focus した」の違いを視覚提示。
  markJustOpened(lid);
}

// pgc-137 wave-δ #11:tab open / focus 視覚 feedback の module-local state。
let justOpenedLid: string | null = null;
let justFocusedLid: string | null = null;
let openedClearTimer: number | null = null;
let focusedClearTimer: number | null = null;

function markJustOpened(lid: string): void {
  justOpenedLid = lid;
  if (openedClearTimer != null) clearTimeout(openedClearTimer);
  openedClearTimer = window.setTimeout(() => {
    justOpenedLid = null;
    openedClearTimer = null;
  }, 400);
}

function markJustFocused(lid: string): void {
  justFocusedLid = lid;
  if (focusedClearTimer != null) clearTimeout(focusedClearTimer);
  focusedClearTimer = window.setTimeout(() => {
    justFocusedLid = null;
    focusedClearTimer = null;
  }, 250);
}

/** pgc-137 wave-δ #11 test helper:強制リセット。 */
export function resetTabOpenFeedback(): void {
  justOpenedLid = null;
  justFocusedLid = null;
  if (openedClearTimer != null) { clearTimeout(openedClearTimer); openedClearTimer = null; }
  if (focusedClearTimer != null) { clearTimeout(focusedClearTimer); focusedClearTimer = null; }
}

export function getJustOpenedLid(): string | null { return justOpenedLid; }
export function getJustFocusedLid(): string | null { return justFocusedLid; }

/**
 * tab を close する。close 対象が active なら、隣接 tab に active を移す
 * (戻り値 = 新 active lid、なければ null)。
 *
 * pgc-88:pinned tab は close を拒否(戻り値は現 activeLid 維持)。
 */
export function recordTabClose(lid: string): string | null {
  const idx = openTabs.findIndex((t) => t.lid === lid);
  if (idx < 0) return activeLid;
  const closed = openTabs[idx]!;
  // pinned guard ── 明示 close 操作は拒否、user 体感的に "閉じない" を担保
  if (closed.pinned) return activeLid;
  openTabs.splice(idx, 1);
  // recently closed に push(限定数で trim)── pinned は push しない
  recentlyClosed.unshift(closed);
  if (recentlyClosed.length > MAX_RECENTLY_CLOSED) recentlyClosed.length = MAX_RECENTLY_CLOSED;
  // active 再配置
  if (activeLid === lid) {
    if (openTabs.length === 0) {
      activeLid = null;
    } else {
      // 削除位置の左隣 → 無ければ右隣
      const newIdx = Math.max(0, Math.min(idx - 1, openTabs.length - 1));
      activeLid = openTabs[newIdx]?.lid ?? null;
    }
  }
  return activeLid;
}

/**
 * 削除された entry の tab を自動的に閉じる(user direction 2026-06-02
 * 「削除したエントリのタブが開きっぱなし」 fix)。pinned tab も含めて
 * 強制 close(削除済 entry を pin で保持する意味は無いため)。
 * `ENTRY_DELETED` event listener / SYS_SYNC 経路から呼ばれる。
 *
 * 戻り値:新しい active lid(削除 entry が active だった場合の再配置先)。
 */
export function closeTabsForDeletedEntries(container: Container | null): string | null {
  if (!container) return activeLid;
  const alive = new Set(container.entries.map((e) => e.lid));
  const before = openTabs.length;
  openTabs = openTabs.filter((t) => {
    // view tab(`__view:...`)は entry に紐付かないので保持
    if (t.lid.startsWith('__view:')) return true;
    return alive.has(t.lid);
  });
  if (openTabs.length === before) return activeLid;
  // active が消えていたら近い tab に再配置
  if (activeLid && !openTabs.find((t) => t.lid === activeLid)) {
    activeLid = openTabs.length > 0 ? openTabs[0]!.lid : null;
  }
  return activeLid;
}

/**
 * title 更新を反映(entry の title が変わった時、tab の表示も update)。
 */
export function refreshTabTitles(container: Container | null): void {
  if (!container) return;
  const map = new Map<string, string>();
  for (const e of container.entries) map.set(e.lid, e.title || '(untitled)');
  // openTabs を rebuild(title が変わった行だけ replace)── 順序は維持
  openTabs = openTabs.map((t) => {
    const newTitle = map.get(t.lid);
    if (newTitle == null) return t; // entry 消えた ── 後段で remove
    if (newTitle === t.title) return t;
    return { ...t, title: newTitle };
  });
  // entry 消失で undefined になった tab を除去
  openTabs = openTabs.filter((t) => map.has(t.lid));
  if (activeLid && !map.has(activeLid)) {
    activeLid = openTabs[openTabs.length - 1]?.lid ?? null;
  }
}

export function getOpenTabs(): readonly TabInfo[] {
  return openTabs;
}

export function getActiveTabLid(): string | null {
  return activeLid;
}

// pgc-182 wave-α' #5(v3 統合 master G2、roadmap 領域 1 nav 統一の延長):
// 開いている tab を cyclic に next / previous 移動する helper(VSCode 流
// `Ctrl+PageDown` / `Ctrl+PageUp` shortcut の data source)。
// 開 tab が 0 件 or 1 件のみなら null を返す ── caller は no-op 判断。
// 現 active の前後で 1 つ先 / 1 つ前を返し、末尾 ↔ 先頭で wrap-around。
export function getNextOpenTabLid(): string | null {
  if (openTabs.length <= 1) return null;
  const i = openTabs.findIndex((t) => t.lid === activeLid);
  if (i < 0) return openTabs[0]!.lid;
  return openTabs[(i + 1) % openTabs.length]!.lid;
}

export function getPreviousOpenTabLid(): string | null {
  if (openTabs.length <= 1) return null;
  const i = openTabs.findIndex((t) => t.lid === activeLid);
  if (i < 0) return openTabs[openTabs.length - 1]!.lid;
  return openTabs[(i - 1 + openTabs.length) % openTabs.length]!.lid;
}

export function resetTabState(): void {
  openTabs = [];
  activeLid = null;
  recentlyClosed = [];
}

// ─── persistence(pgc-86):localStorage に open tabs を保存 / 復元 ───

const STORAGE_KEY = 'pkc2.tabStrip';

interface SavedTabStrip {
  readonly lids: readonly string[];
  readonly active: string | null;
  /** pgc-88:pinned lid 一覧。backward compat のため optional。 */
  readonly pinned?: readonly string[];
}

/**
 * 現状 openTabs を localStorage に書き出す。failure(quota / disabled)は
 * silent ignore(persistence は best-effort、必須でない)。
 */
export function persistTabState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const payload: SavedTabStrip = {
      lids: openTabs.map((t) => t.lid),
      active: activeLid,
      pinned: openTabs.filter((t) => t.pinned).map((t) => t.lid),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / disabled storage ── silent
  }
}

/**
 * localStorage の saved tab state を読んで openTabs に反映する。
 * - container に存在する lid のみ rehydrate(消えた entry は skip)
 * - 戻り値:rehydrate された active lid(SELECT_ENTRY すべき値)or null
 *
 * caller(main.ts boot)は active lid が null でないときに **1 度だけ**
 * `dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: active })` を呼ぶこと
 * (rehydrate UX = boot 時 last-active entry が selected な状態に復元)。
 */
export function restoreTabState(container: Container | null): string | null {
  if (typeof localStorage === 'undefined') return null;
  if (!container) return null;
  let saved: SavedTabStrip | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed || typeof parsed !== 'object'
      || !Array.isArray(parsed.lids)
      || (parsed.active !== null && typeof parsed.active !== 'string')
    ) {
      return null;
    }
    saved = parsed as SavedTabStrip;
  } catch {
    return null;
  }
  // 既知 entry / view tab のみ rehydrate、順序保持
  const entryMap = new Map(container.entries.map((e) => [e.lid, e] as const));
  const pinnedSet = new Set<string>(Array.isArray(saved.pinned) ? saved.pinned : []);
  const rehydrated: TabInfo[] = [];
  for (const lid of saved.lids) {
    if (typeof lid !== 'string') continue;
    const pinned = pinnedSet.has(lid);
    // view tab(__view:mode)は entry lookup を skip、meta から復元
    if (isViewTabLid(lid)) {
      const mode = viewTabModeFromLid(lid);
      if (mode && VIEW_TAB_META[mode]) {
        rehydrated.push({
          lid, archetype: 'view', kind: 'view', mode,
          title: VIEW_TAB_META[mode].title,
          pinned,
        });
      }
      continue;
    }
    const e = entryMap.get(lid);
    if (!e) continue;
    if (e.archetype === 'opaque') continue;
    rehydrated.push({
      lid: e.lid, archetype: e.archetype, title: e.title || '(untitled)',
      pinned,
    });
  }
  openTabs = rehydrated;
  // active が rehydrated に含まれていればそれを採用、無ければ末尾 fallback
  const inRehydrated = (lid: string): boolean => rehydrated.some((t) => t.lid === lid);
  if (saved.active && inRehydrated(saved.active)) {
    // view tab か entry-lookup を skip して直接 active 設定
    activeLid = saved.active;
  } else {
    activeLid = rehydrated[rehydrated.length - 1]?.lid ?? null;
  }
  return activeLid;
}

export function clearPersistedTabState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ─── keyboard handlers(pgc-86):Ctrl+W close / Ctrl+Shift+T reopen ───

/**
 * 「現 active tab を閉じる」アクション。`Ctrl+W` から呼ばれる。
 * 戻り値:新 active lid(or null)。caller が SELECT_ENTRY を dispatch。
 *
 * pgc-88:active が pinned ならば close を拒否(現 activeLid を維持)。
 */
export function closeActiveTab(): string | null {
  if (!activeLid) return null;
  const active = openTabs.find((t) => t.lid === activeLid);
  if (active?.pinned) return activeLid;
  return recordTabClose(activeLid);
}

/**
 * pgc-88:lid 指定で pin 状態を toggle。戻り値:新 pin 状態。lid が無ければ
 * `null`(no-op)。
 */
export function togglePinTab(lid: string): boolean | null {
  const idx = openTabs.findIndex((t) => t.lid === lid);
  if (idx < 0) return null;
  const old = openTabs[idx]!;
  const next: TabInfo = { ...old, pinned: !old.pinned };
  openTabs[idx] = next;
  return next.pinned ?? false;
}

/**
 * pgc-88:現在 pinned な tab の lid 一覧(test / persistence で参照)。
 */
export function getPinnedTabLids(): readonly string[] {
  return openTabs.filter((t) => t.pinned).map((t) => t.lid);
}

/**
 * 「最近閉じた tab を復元」アクション。`Ctrl+Shift+T` から呼ばれる。
 * 戻り値:復元 lid(or null、recently-closed が空)。caller が SELECT_ENTRY
 * を dispatch すると wire 経路で recordTabOpen が走り tab が復活する。
 */
export function reopenLastClosedTab(): string | null {
  const last = popRecentlyClosed();
  return last?.lid ?? null;
}

export function popRecentlyClosed(): TabInfo | null {
  return recentlyClosed.shift() ?? null;
}

/**
 * tab strip element を build する(pure DOM 構築、host への append は caller)。
 * `state.phase === 'editing'` で active なら dirty `●` を出す。
 */
export function buildTabStripElement(state: AppState): HTMLElement {
  const strip = document.createElement('div');
  strip.className = 'pkc-tab-strip';
  strip.setAttribute('data-pkc-region', 'tab-strip');

  if (openTabs.length === 0) {
    strip.classList.add('pkc-tab-strip-empty');
    const placeholder = document.createElement('div');
    placeholder.className = 'pkc-tab-strip-placeholder';
    placeholder.textContent = '(open entries will appear here)';
    strip.appendChild(placeholder);
    return strip;
  }

  // Active tab は **canonical な state を信じる**(reducer → state listener
  // の順序で module-local 更新が遅れるケースを回避):
  // - state.viewMode が detail 以外 → 対応する view tab(`__view:${mode}`)が
  //   active(あれば)。view-mode が active な間は entry tab は inactive。
  // - state.viewMode === 'detail' → state.selectedLid が active(entry tab)。
  // - 両 fallback として module-local activeLid を使う。
  let renderActive: string | null = null;
  if (state.viewMode && state.viewMode !== 'detail') {
    const candidate = viewTabLid(state.viewMode as ViewMode);
    if (openTabs.some((t) => t.lid === candidate)) {
      renderActive = candidate;
    }
  }
  if (!renderActive) {
    renderActive = state.selectedLid ?? activeLid;
  }
  for (const t of openTabs) {
    const isView = isViewTabInfo(t);
    const isPinned = !!t.pinned;
    const tab = document.createElement('div');
    let cls = 'pkc-tab';
    if (isView) cls += ' pkc-tab-view';
    if (isPinned) cls += ' pkc-tab-pinned';
    tab.className = cls;
    // view tab は select-entry ではなく専用 action(switch-view-tab)。
    // entry tab は従来どおり select-entry(action-binder が SELECT_ENTRY
    // dispatch)、view tab は SET_VIEW_MODE dispatch する別 case。
    tab.setAttribute('data-pkc-action', isView ? 'switch-view-tab' : 'select-entry');
    tab.setAttribute('data-pkc-lid', t.lid);
    if (isView && t.mode) {
      tab.setAttribute('data-pkc-view-mode', t.mode);
    }
    tab.setAttribute('role', 'tab');
    if (t.lid === renderActive) {
      tab.classList.add('pkc-tab-active');
      tab.setAttribute('aria-selected', 'true');
      // dirty marker(view tab は dirty にならない)
      if (!isView && state.phase === 'editing' && state.editingLid === t.lid) {
        tab.classList.add('pkc-tab-dirty');
      }
    }
    // pgc-137 wave-δ #11:重複 Open 意識づけ / 新規 open feedback。
    // recordTabOpen が module-local の just-* lid を立てた直後の render で
    // 該当 tab に attr が乗り、CSS animation が再生される。timer が clear
    // する前に再び recordTabOpen されると attr が継続(連打にも追従)。
    if (t.lid === justOpenedLid) tab.setAttribute('data-pkc-just-opened', 'true');
    if (t.lid === justFocusedLid) tab.setAttribute('data-pkc-just-focused', 'true');
    const icon = document.createElement('span');
    icon.className = 'pkc-tab-icon';
    if (isView && t.mode) {
      icon.textContent = VIEW_TAB_META[t.mode].icon;
    } else {
      icon.textContent = ARCHETYPE_ICON[t.archetype] ?? '📄';
    }
    tab.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'pkc-tab-title';
    title.textContent = t.title;
    title.setAttribute('title', `${t.title} (${t.archetype})`);
    tab.appendChild(title);

    if (isPinned) {
      // pgc-88:pinned tab は close ボタン非表示、代わりに 🔒 toggle ボタン。
      // 「pin 解除」は togglePinTab を呼ぶ専用 action。
      const lock = document.createElement('button');
      lock.className = 'pkc-tab-pin';
      lock.setAttribute('type', 'button');
      lock.setAttribute('data-pkc-action', 'toggle-pin-tab');
      lock.setAttribute('data-pkc-lid', t.lid);
      lock.setAttribute('aria-label', `Unpin ${t.title}`);
      lock.setAttribute('title', 'Pinned ── click to unpin');
      lock.textContent = '🔒';
      tab.appendChild(lock);
    } else {
      const close = document.createElement('button');
      close.className = 'pkc-tab-close';
      close.setAttribute('type', 'button');
      close.setAttribute('data-pkc-action', 'close-tab');
      close.setAttribute('data-pkc-lid', t.lid);
      close.setAttribute('aria-label', `Close ${t.title}`);
      close.textContent = '×';
      // dirty 状態で × の代わりに ● を表示
      if (tab.classList.contains('pkc-tab-dirty')) {
        close.classList.add('pkc-tab-close-dirty');
        close.textContent = '●';
      }
      tab.appendChild(close);
    }

    strip.appendChild(tab);
  }
  return strip;
}

/**
 * dispatcher の `ENTRY_SELECTED` event を listen して recordTabOpen + UI 再描画
 * を行う wiring。main.ts boot で呼ぶ。flag OFF なら tab を記録するが描画は
 * renderer が判断する。本 wiring 自体は always-on(open 履歴を保持しておく)。
 */
export function wireTabStrip(dispatcher: Dispatcher): () => void {
  // SELECT_ENTRY 経路の ENTRY_SELECTED event
  const off1 = dispatcher.onEvent((ev) => {
    if (ev.type === 'ENTRY_SELECTED') {
      recordTabOpen(ev.lid, dispatcher.getState().container);
      persistTabState();
    }
  });
  // state.selectedLid 変化を直接 listen ── CREATE_ENTRY 等で
  // ENTRY_SELECTED が emit されないが selectedLid だけ変わる経路を救う。
  // 同時に container 変更を listen して title 更新を反映する。
  // pgc-87:state.viewMode 変化も listen して、対応する view tab があれば
  // active 化する(state.viewMode → active view tab の片方向 sync)。
  const off2 = dispatcher.onState((s, prev) => {
    if (s.container && s.container !== prev.container) {
      refreshTabTitles(s.container);
      // user direction 2026-06-02「削除したエントリのタブが開きっぱなし」 fix:
      // container 変化のたびに削除済 entry の tab を自動 close。pinned tab も
      // 含めて(削除済 entry を pin で持つ意味はない)。
      closeTabsForDeletedEntries(s.container);
      persistTabState();
    }
    if (s.selectedLid && s.selectedLid !== prev.selectedLid && s.container) {
      recordTabOpen(s.selectedLid, s.container);
      persistTabState();
    }
    if (s.viewMode !== prev.viewMode && s.viewMode !== 'detail') {
      // detail mode 以外は対応する view tab を active 化(open は別経路 ──
      // command palette / context menu / 明示 action)。
      syncActiveViewTab(s.viewMode as ViewMode);
      persistTabState();
    }
  });
  return () => {
    off1();
    off2();
  };
}

export { shellTabsEnabled };
