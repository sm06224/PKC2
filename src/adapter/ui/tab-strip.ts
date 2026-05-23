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

interface TabInfo {
  readonly lid: string;
  readonly archetype: string;
  readonly title: string;
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
};

/**
 * `ENTRY_SELECTED` で呼ばれる ── tab list に lid を追加 / 更新 + active 化。
 * すでに open なら append しない、active のみ更新。
 */
export function recordTabOpen(lid: string, container: Container | null): void {
  if (!container) return;
  const entry = container.entries.find((e) => e.lid === lid);
  if (!entry) return;
  // 既存なら active 更新だけ
  const found = openTabs.find((t) => t.lid === lid);
  if (found) {
    activeLid = lid;
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
}

/**
 * tab を close する。close 対象が active なら、隣接 tab に active を移す
 * (戻り値 = 新 active lid、なければ null)。
 */
export function recordTabClose(lid: string): string | null {
  const idx = openTabs.findIndex((t) => t.lid === lid);
  if (idx < 0) return activeLid;
  const closed = openTabs[idx]!;
  openTabs.splice(idx, 1);
  // recently closed に push(限定数で trim)
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
  // 既知 entry のみ rehydrate、順序保持
  const entryMap = new Map(container.entries.map((e) => [e.lid, e] as const));
  const rehydrated: TabInfo[] = [];
  for (const lid of saved.lids) {
    if (typeof lid !== 'string') continue;
    const e = entryMap.get(lid);
    if (!e) continue;
    if (e.archetype === 'opaque') continue;
    rehydrated.push({ lid: e.lid, archetype: e.archetype, title: e.title || '(untitled)' });
  }
  openTabs = rehydrated;
  // active が rehydrated に含まれていればそれを採用、無ければ末尾 fallback
  if (saved.active && entryMap.has(saved.active) && rehydrated.find((t) => t.lid === saved.active)) {
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
 */
export function closeActiveTab(): string | null {
  if (!activeLid) return null;
  return recordTabClose(activeLid);
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

  // Active tab は **canonical な state.selectedLid** で判定する。
  // module-local `activeLid` は close 時の neighbor 計算用 fallback としては
  // 持つが、render では state を信じる(reducer → state listener の順序で
  // module-local 更新が遅れるケースを回避)。
  const renderActive = state.selectedLid ?? activeLid;
  for (const t of openTabs) {
    const tab = document.createElement('div');
    tab.className = 'pkc-tab';
    tab.setAttribute('data-pkc-action', 'select-entry');
    tab.setAttribute('data-pkc-lid', t.lid);
    tab.setAttribute('role', 'tab');
    if (t.lid === renderActive) {
      tab.classList.add('pkc-tab-active');
      tab.setAttribute('aria-selected', 'true');
      // dirty marker
      if (state.phase === 'editing' && state.editingLid === t.lid) {
        tab.classList.add('pkc-tab-dirty');
      }
    }
    const icon = document.createElement('span');
    icon.className = 'pkc-tab-icon';
    icon.textContent = ARCHETYPE_ICON[t.archetype] ?? '📄';
    tab.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'pkc-tab-title';
    title.textContent = t.title;
    title.setAttribute('title', `${t.title} (${t.archetype})`);
    tab.appendChild(title);

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
  const off2 = dispatcher.onState((s, prev) => {
    if (s.container && s.container !== prev.container) {
      refreshTabTitles(s.container);
      persistTabState();
    }
    if (s.selectedLid && s.selectedLid !== prev.selectedLid && s.container) {
      recordTabOpen(s.selectedLid, s.container);
      persistTabState();
    }
  });
  return () => {
    off1();
    off2();
  };
}

export { shellTabsEnabled };
