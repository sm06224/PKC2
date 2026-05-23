/**
 * Command Palette ── 標準 command 登録(vscode-grade-overhaul-2026-05
 * MASTER.md §4.1、pgc-80 POC)。
 *
 * boot 時 main.ts から呼ばれる。各 command は (a) dispatcher へ UserAction
 * を投げる経路、または (b) 既存の `data-pkc-action` button を query で
 * 取り出して `.click()` で trigger する経路、のどちらかで実装する。
 *
 * (b) 経由は **POC 用の橋渡し** ── DOM 上に対象 button が無ければ no-op
 * (例:entry 未選択で view-mode button が描画されていない時)。本書の
 * 後続 PR(pgc-82 keymap registry / pgc-104 render-pipeline-unification)
 * で各 command を **declarative な「dispatch するだけ」** に寄せていく。
 */

import type { Dispatcher } from '../state/dispatcher';
import type { ArchetypeId } from '../../core/model/record';
import type { CommandMeta } from '../../features/command/types';
import { registerCommand } from './command-palette';
import { openViewTab, persistTabState, togglePinTab, getActiveTabLid } from './tab-strip';
import { toggleSplitView } from './split-view';
import { toggleFormatPanelVisible } from './format-panel-visibility';
import { setActivityBarActiveTab, type ActivityTab } from './activity-bar';
import {
  setMetaPaneInspectorActiveTab,
  type InspectorTab,
} from './meta-pane-inspector';

/**
 * 既存 `data-pkc-action` button を root から探して click を emit する
 * fallback。button が見つからなければ no-op。
 */
function clickAction(
  selector: string,
): () => void {
  return () => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      if (typeof console !== 'undefined') {
        console.warn(`[command-palette] no element matches: ${selector}`);
      }
      return;
    }
    el.click();
  };
}

/**
 * builtin commands を全 register。複数回呼んでも duplicate id で警告 +
 * skip されるだけなので idempotent。
 */
export function registerBuiltinCommands(dispatcher: Dispatcher): void {
  // ─── View mode ──────────────────────────────
  const viewModes = [
    { mode: 'detail',   ja: '詳細ビュー',     en: 'View: Detail' },
    { mode: 'calendar', ja: 'カレンダービュー', en: 'View: Calendar' },
    { mode: 'kanban',   ja: 'カンバンビュー',   en: 'View: Kanban' },
    { mode: 'filer',    ja: 'ファイラービュー', en: 'View: Filer' },
    { mode: 'graph',    ja: 'グラフビュー',     en: 'View: Graph' },
    { mode: 'launcher', ja: 'ランチャービュー', en: 'View: Launcher' },
  ] as const;
  for (const v of viewModes) {
    const meta: CommandMeta = {
      id: `view.${v.mode}`,
      titleJa: v.ja,
      titleEn: v.en,
      category: 'View',
    };
    registerCommand(meta, () => {
      dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: v.mode });
    });
  }

  // ─── Entry create ───────────────────────────
  const archetypes: { id: ArchetypeId; ja: string; en: string }[] = [
    { id: 'text',       ja: '新規 TEXT エントリ',     en: 'New TEXT entry' },
    { id: 'textlog',    ja: '新規 TEXTLOG エントリ',  en: 'New TEXTLOG entry' },
    { id: 'todo',       ja: '新規 TODO エントリ',     en: 'New TODO entry' },
    { id: 'attachment', ja: '新規 添付ファイル',       en: 'New attachment' },
    { id: 'folder',     ja: '新規 フォルダ',           en: 'New folder' },
  ];
  for (const a of archetypes) {
    const meta: CommandMeta = {
      id: `entry.create.${a.id}`,
      titleJa: a.ja,
      titleEn: a.en,
      category: 'Entry',
    };
    registerCommand(meta, () => {
      // CREATE_ENTRY action は title 必須なので空文字で create、reducer 側で
      // default title が当てられる(既存 button の click 挙動と一致)。
      dispatcher.dispatch({
        type: 'CREATE_ENTRY',
        archetype: a.id,
        title: '',
      });
    });
  }

  // ─── Shell toggles(既存 button click を借りる)─────
  registerCommand(
    {
      id: 'shell.toggle-sidebar',
      titleJa: 'サイドバーを開閉',
      titleEn: 'Toggle sidebar',
      category: 'Shell',
      keybind: 'Ctrl+\\',
    },
    clickAction('[data-pkc-action="toggle-sidebar"]'),
  );
  registerCommand(
    {
      id: 'shell.toggle-meta',
      titleJa: 'メタペインを開閉',
      titleEn: 'Toggle meta pane',
      category: 'Shell',
      keybind: 'Ctrl+Shift+\\',
    },
    clickAction('[data-pkc-action="toggle-meta"]'),
  );
  registerCommand(
    {
      id: 'shell.toggle-focus-mode',
      titleJa: 'フォーカスモードを開閉',
      titleEn: 'Toggle focus mode',
      category: 'Shell',
    },
    clickAction('[data-pkc-action="toggle-focus-mode"]'),
  );
  registerCommand(
    {
      id: 'shell.open-menu',
      titleJa: '設定メニューを開く',
      titleEn: 'Open shell menu',
      category: 'Shell',
    },
    clickAction('[data-pkc-action="toggle-shell-menu"]'),
  );

  // ─── App ─────────────────────────────────────
  // About 表示は固定 lid を select するだけ(`select-about` action handler と
  // 同等)── action-binder.ts:3266 の挙動を migrate せず inline で再現。
  registerCommand(
    {
      id: 'app.about',
      titleJa: 'About PKC2 を開く',
      titleEn: 'Open About PKC2',
      category: 'Help',
    },
    clickAction('[data-pkc-action="select-about"]'),
  );
  registerCommand(
    {
      id: 'app.shortcuts',
      titleJa: 'キーボードショートカット一覧',
      titleEn: 'Show keyboard shortcuts',
      category: 'Help',
      keybind: 'Ctrl+?',
    },
    () => dispatcher.dispatch({ type: 'OPEN_SHORTCUT_HELP' }),
  );
  registerCommand(
    {
      id: 'app.flags',
      titleJa: 'Flags Inspector を開く',
      titleEn: 'Open Flags Inspector',
      category: 'Debug',
    },
    () => dispatcher.dispatch({ type: 'OPEN_FLAGS_INSPECTOR' }),
  );

  // ─── View tabs(pgc-87、MASTER.md §4.3)─────────
  // tab strip(`shell.tabs_enabled` 必須)に workspace-level view tab を
  // open する。`SET_VIEW_MODE` も同時に dispatch して mode 切替。
  const viewTabModes: { mode: 'calendar' | 'kanban' | 'filer' | 'graph' | 'launcher'; ja: string; en: string }[] = [
    { mode: 'calendar', ja: 'カレンダーを tab で開く', en: 'Open Calendar as tab' },
    { mode: 'kanban',   ja: 'カンバンを tab で開く',   en: 'Open Kanban as tab' },
    { mode: 'filer',    ja: 'ファイラーを tab で開く', en: 'Open Filer as tab' },
    { mode: 'graph',    ja: 'グラフを tab で開く',     en: 'Open Graph as tab' },
    { mode: 'launcher', ja: 'ランチャーを tab で開く', en: 'Open Launcher as tab' },
  ];
  for (const v of viewTabModes) {
    const meta: CommandMeta = {
      id: `view-tab.open.${v.mode}`,
      titleJa: v.ja,
      titleEn: v.en,
      category: 'View',
    };
    registerCommand(meta, () => {
      openViewTab(v.mode);
      persistTabState();
      dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode: v.mode });
    });
  }

  // ─── Tab pin(pgc-88、MASTER.md §4.3)─────────
  // active tab の pin / unpin toggle。pinned tab は close 不可、reload で
  // 復元される(永続化)。
  registerCommand(
    {
      id: 'tab.toggle-pin-active',
      titleJa: 'アクティブな tab を pin / unpin',
      titleEn: 'Toggle pin: active tab',
      category: 'View',
    },
    () => {
      const lid = getActiveTabLid();
      if (!lid) return;
      togglePinTab(lid);
      persistTabState();
      const st = dispatcher.getState();
      dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
    },
  );

  // ─── Split View(pgc-89、MASTER.md §5.5)─────
  registerCommand(
    {
      id: 'split-view.toggle',
      titleJa: 'Split View を toggle(右に read-only viewer)',
      titleEn: 'Toggle Split View(right read-only viewer)',
      category: 'View',
    },
    () => {
      toggleSplitView('right');
      const st = dispatcher.getState();
      dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
    },
  );

  // ─── Format panel toggle(pgc-110 + pgc-120、MASTER.md §6.4 step 2)
  // editor の format panel を toggle(`shell.format_panel_default_hidden_
  // enabled` 必須、OFF だと panel が常時表示なので command 自体 no-op)。
  // keymap registry が ON なら `Alt+Shift+F` で同 command を発火可能。
  registerCommand(
    {
      id: 'format.toggle',
      titleJa: 'Format panel の表示を toggle',
      titleEn: 'Toggle Format panel visibility',
      category: 'View',
      keybind: 'Alt+Shift+F',
    },
    () => {
      toggleFormatPanelVisible();
      const st = dispatcher.getState();
      dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
    },
  );

  // ─── Activity Bar tab(pgc-102+〜108、pgc-121:keyboard shortcut 追加)
  // MASTER.md §6.2:`shell.activity_bar_enabled` 必須(OFF だと bar が描画
  // されず command 自体は state 更新だけして再描画は no-op)。VSCode の
  // Ctrl+Shift+E(Explorer)/ F(Search) と衝突するため、PKC2 は
  // `Alt+Shift+1`〜`6` で各 tab を選択する別系列の shortcut を持つ。
  // pgc-101 で導入した keymap registry で `view.detail`〜`view.launcher` が
  // `Alt+1`〜`Alt+6` に bind 済なので、`Alt+Shift+N` で衝突回避。
  const activityTabs: { id: ActivityTab; icon: string; ja: string; en: string; key: string }[] = [
    { id: 'explorer',  icon: '📁', ja: 'Activity: Explorer',  en: 'Activity: Explorer',  key: 'Alt+Shift+1' },
    { id: 'search',    icon: '🔍', ja: 'Activity: Search',    en: 'Activity: Search',    key: 'Alt+Shift+2' },
    { id: 'outline',   icon: '📊', ja: 'Activity: Outline',   en: 'Activity: Outline',   key: 'Alt+Shift+3' },
    { id: 'relations', icon: '🔗', ja: 'Activity: Relations', en: 'Activity: Relations', key: 'Alt+Shift+4' },
    { id: 'recent',    icon: '📜', ja: 'Activity: Recent',    en: 'Activity: Recent',    key: 'Alt+Shift+5' },
    { id: 'pinned',    icon: '📌', ja: 'Activity: Pinned',    en: 'Activity: Pinned',    key: 'Alt+Shift+6' },
  ];
  for (const t of activityTabs) {
    registerCommand(
      {
        id: `activity.${t.id}`,
        titleJa: `${t.icon} ${t.ja}`,
        titleEn: `${t.icon} ${t.en}`,
        category: 'View',
        keybind: t.key,
      },
      () => {
        setActivityBarActiveTab(t.id);
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
      },
    );
  }

  // ─── Meta pane Inspector tab(pgc-109+〜118、pgc-123:keyboard shortcut)
  // MASTER.md §6.3:`shell.meta_pane_inspector_enabled` 必須(OFF だと
  // tab strip 自体が出ない、command 自体は state 更新だけして再描画は
  // 通常通り)。VSCode の Ctrl+Shift+I(DevTools)と衝突するため、PKC2 は
  // **chord** `Ctrl+K` + 文字 で発火する 2-step shortcut(VSCode 流の
  // `Ctrl+K Ctrl+S` keybinding system 流儀)。Activity Bar の
  // `Alt+Shift+N`(pgc-121)とも別系列で衝突なし。
  const inspectorTabs: { id: InspectorTab; icon: string; ja: string; en: string; key: string }[] = [
    { id: 'properties', icon: '📋', ja: 'Inspector: Properties', en: 'Inspector: Properties', key: 'Ctrl+K P' },
    { id: 'references', icon: '🔗', ja: 'Inspector: References', en: 'Inspector: References', key: 'Ctrl+K R' },
    { id: 'history',    icon: '📜', ja: 'Inspector: History',    en: 'Inspector: History',    key: 'Ctrl+K H' },
    { id: 'style',      icon: '🎨', ja: 'Inspector: Style',      en: 'Inspector: Style',      key: 'Ctrl+K Y' },
    { id: 'ai',         icon: '🧠', ja: 'Inspector: AI',         en: 'Inspector: AI',         key: 'Ctrl+K I' },
  ];
  for (const t of inspectorTabs) {
    registerCommand(
      {
        id: `inspector.${t.id}`,
        titleJa: `${t.icon} ${t.ja}`,
        titleEn: `${t.icon} ${t.en}`,
        category: 'View',
        keybind: t.key,
      },
      () => {
        setMetaPaneInspectorActiveTab(t.id);
        const st = dispatcher.getState();
        dispatcher.dispatch({ type: 'SYS_SYNC_CHILD_WINDOWS', lids: st.childWindowLids ?? [] });
      },
    );
  }

  // ─── Theme ───────────────────────────────────
  // 注:system は payload 上は `auto`(`src/core/model/system-settings-payload.ts`)。
  // UI label は「システム」、dispatch value は 'auto' に変換。
  const themes: { mode: 'light' | 'dark' | 'auto'; id: string; ja: string; en: string }[] = [
    { mode: 'light',  id: 'light',  ja: 'ライトテーマに切替',   en: 'Theme: Light' },
    { mode: 'dark',   id: 'dark',   ja: 'ダークテーマに切替',   en: 'Theme: Dark' },
    { mode: 'auto',   id: 'system', ja: 'システムテーマに切替', en: 'Theme: System' },
  ];
  for (const t of themes) {
    const meta: CommandMeta = {
      id: `theme.${t.id}`,
      titleJa: t.ja,
      titleEn: t.en,
      category: 'Theme',
    };
    registerCommand(meta, () => {
      dispatcher.dispatch({ type: 'SET_THEME_MODE', mode: t.mode });
    });
  }
}
