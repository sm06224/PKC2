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
import {
  openViewTab,
  persistTabState,
  togglePinTab,
  getActiveTabLid,
  getNextOpenTabLid,
  getPreviousOpenTabLid,
  closeActiveTab,
  reopenLastClosedTab,
} from './tab-strip';
import { toggleSplitView } from './split-view';
import { toggleFormatPanelVisible } from './format-panel-visibility';
import { setActivityBarActiveTab, type ActivityTab } from './activity-bar';
// 領域 5 編集 command 拡充(user 督促 2026-05-28、roadmap §領域 5 残)── editing
// 中の body textarea に対して inline wrap / line prefix snippet を palette から
// 呼べるようにする。既存 keyboard shortcut(Ctrl+B 等)と同じ helper を共有して
// 二重実装を避ける。
import { wrapInline, type Selection } from './format-panel';
import { applyTransformToTextarea } from './editor-format-shortcuts';
import { applySnippet, type SnippetKind } from './snippet-toolbar';

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
    { id: 'text',        ja: '新規 TEXT エントリ',        en: 'New TEXT entry' },
    { id: 'textlog',     ja: '新規 TEXTLOG エントリ',     en: 'New TEXTLOG entry' },
    { id: 'todo',        ja: '新規 TODO エントリ',        en: 'New TODO entry' },
    { id: 'spreadsheet', ja: '新規 SPREADSHEET エントリ', en: 'New SPREADSHEET entry' },
    { id: 'attachment',  ja: '新規 添付ファイル',         en: 'New attachment' },
    { id: 'folder',      ja: '新規 フォルダ',             en: 'New folder' },
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

  // ─── Navigation history(pgc-179 wave-α' G2、roadmap 領域 1)──
  // browser history を Alt+←/→ で操作する VSCode / Obsidian 流の動線。
  // 既存 `data-pkc-action="go-back"/"go-forward"` button(pgc-55、header
  // nav + breadcrumb)と同経路 ── `window.history.back/forward()` →
  // popstate → nav-history bridge が `GO_BACK` / `GO_FORWARD` dispatch。
  // textarea / input 編集中は handleKeymapKeydown が skip するため、
  // cursor 移動(Alt+← = 単語単位移動)とは衝突しない。
  registerCommand(
    {
      id: 'history.back',
      titleJa: '履歴を戻る',
      titleEn: 'Go back',
      category: 'Navigation',
      keybind: 'Alt+ArrowLeft',
    },
    () => {
      window.history.back();
    },
  );
  registerCommand(
    {
      id: 'history.forward',
      titleJa: '履歴を進む',
      titleEn: 'Go forward',
      category: 'Navigation',
      keybind: 'Alt+ArrowRight',
    },
    () => {
      window.history.forward();
    },
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
  const viewTabModes: { mode: 'calendar' | 'kanban' | 'filer' | 'launcher'; ja: string; en: string }[] = [
    { mode: 'calendar', ja: 'カレンダーを tab で開く', en: 'Open Calendar as tab' },
    { mode: 'kanban',   ja: 'カンバンを tab で開く',   en: 'Open Kanban as tab' },
    { mode: 'filer',    ja: 'ファイラーを tab で開く', en: 'Open Filer as tab' },
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

  // ─── Tab navigation(pgc-182 wave-α' #5、v3 統合 master G2 nav 統一)─
  // 開いている tab 間を cyclic に next / previous で移動する VSCode 流
  // 動線。`Ctrl+PageDown` / `Ctrl+PageUp`(browser tab 切替と衝突するが
  // keymap registry opt-in なので user 同意済)。textarea 編集中は
  // handleKeymapKeydown が skip するため、編集中の cursor 移動と衝突なし。
  registerCommand(
    {
      id: 'tab.next',
      titleJa: '次の tab に移動',
      titleEn: 'Next tab',
      category: 'View',
      keybind: 'Ctrl+PageDown',
    },
    () => {
      const next = getNextOpenTabLid();
      if (!next) return;
      // view tab(__view:<mode>)なら SET_VIEW_MODE、entry tab なら SELECT_ENTRY
      if (next.startsWith('__view:')) {
        const mode = next.slice('__view:'.length) as 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher';
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: next });
      }
    },
  );
  registerCommand(
    {
      id: 'tab.previous',
      titleJa: '前の tab に移動',
      titleEn: 'Previous tab',
      category: 'View',
      keybind: 'Ctrl+PageUp',
    },
    () => {
      const prev = getPreviousOpenTabLid();
      if (!prev) return;
      if (prev.startsWith('__view:')) {
        const mode = prev.slice('__view:'.length) as 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher';
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: prev });
      }
    },
  );
  registerCommand(
    {
      id: 'tab.close-active',
      titleJa: 'アクティブな tab を閉じる',
      titleEn: 'Close active tab',
      category: 'View',
      keybind: 'Alt+W',
    },
    () => {
      const nextLid = closeActiveTab();
      persistTabState();
      // closeActiveTab は次に focus すべき lid を返す ── 続けて SELECT/SET_VIEW
      if (nextLid) {
        if (nextLid.startsWith('__view:')) {
          const mode = nextLid.slice('__view:'.length) as 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher';
          dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
        } else {
          dispatcher.dispatch({ type: 'SELECT_ENTRY', lid: nextLid });
        }
      }
    },
  );
  registerCommand(
    {
      id: 'tab.reopen-last-closed',
      titleJa: '直近閉じた tab を復元',
      titleEn: 'Reopen last closed tab',
      category: 'View',
      keybind: 'Ctrl+Shift+T',
    },
    () => {
      const lid = reopenLastClosedTab();
      if (!lid) return;
      persistTabState();
      if (lid.startsWith('__view:')) {
        const mode = lid.slice('__view:'.length) as 'detail' | 'calendar' | 'kanban' | 'filer' | 'launcher';
        dispatcher.dispatch({ type: 'SET_VIEW_MODE', mode });
      } else {
        dispatcher.dispatch({ type: 'SELECT_ENTRY', lid });
      }
    },
  );

  // ─── Split View(pgc-89、MASTER.md §5.5)─────
  // pgc-144 wave-δ #18(user bug report 2026-05-24「センターペインに
  // 編集結果を Split View のように反映する動線」):keybind `Ctrl+\\` 追加。
  // VSCode の Split editor shortcut(Ctrl+\\)と一致、編集中に 1 step で
  // Split View(右に read-only viewer = ライブ render 結果)が出る。
  registerCommand(
    {
      id: 'split-view.toggle',
      titleJa: 'Split View を toggle(右に read-only viewer)',
      titleEn: 'Toggle Split View(right read-only viewer)',
      category: 'View',
      keybind: 'Ctrl+\\',
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

  // pgc-188 wave-α' #11(v3 統合 master G8 visual layer / theme):theme
  // cycle command。`theme.light` / `theme.dark` / `theme.system` に加え、
  // 1 command で 3 値を rotate(light → dark → auto → light)。Notion 流の
  // 「Toggle theme」 動線、shortcut として keybind 可能。
  registerCommand(
    {
      id: 'theme.cycle',
      titleJa: 'テーマを順に切替(light → dark → system)',
      titleEn: 'Theme: Cycle(light → dark → system)',
      category: 'Theme',
    },
    () => {
      const st = dispatcher.getState();
      const cur = st.settings?.theme?.mode ?? 'auto';
      // rotate light → dark → auto → light
      const next: 'light' | 'dark' | 'auto' =
        cur === 'light' ? 'dark' : cur === 'dark' ? 'auto' : 'light';
      dispatcher.dispatch({ type: 'SET_THEME_MODE', mode: next });
    },
  );

  // ─── Filter ──────────────────────────────────
  // pgc-188 wave-α' #11:Clear all filters。tag / archetype / search /
  // color tag 等の active filter を一括 reset(CLEAR_FILTERS action 経路)。
  registerCommand(
    {
      id: 'view.clear-filters',
      titleJa: 'すべてのフィルタを解除',
      titleEn: 'View: Clear all filters',
      category: 'View',
    },
    () => {
      dispatcher.dispatch({ type: 'CLEAR_FILTERS' });
    },
  );

  // ─── Entry duplicate ─────────────────────────
  // pgc-188 wave-α' #11(handoff §3.4 wave-δ phase 2 entry UX):選択中
  // entry を複製。CREATE_ENTRY action に archetype + title + body を
  // 渡す経路を再利用 ── 新 entry が自動的に select される(reducer 経路)。
  // title は「Copy of <orig>」 ── orig 空なら「Copy of (untitled)」。
  registerCommand(
    {
      id: 'entry.duplicate',
      titleJa: '選択中のエントリを複製',
      titleEn: 'Entry: Duplicate selected',
      category: 'Entry',
    },
    () => {
      const st = dispatcher.getState();
      const lid = st.selectedLid;
      if (!lid) return;
      const entry = st.container?.entries.find((e) => e.lid === lid);
      if (!entry) return;
      const origTitle = entry.title?.trim() || '(untitled)';
      dispatcher.dispatch({
        type: 'CREATE_ENTRY',
        archetype: entry.archetype,
        title: `Copy of ${origTitle}`,
        body: entry.body ?? '',
      });
    },
  );

  // pgc-190 wave-α' #13(handoff §3.4 wave-δ phase 2 textlog):textlog
  // の「今日」 day section にジャンプする command。textlog presenter は
  // 各 day section に `id="day-YYYY-MM-DD"` を付与する(textlog-presenter
  // line 265-266)── DOM 上で id を query して scrollIntoView。
  // 現 entry が textlog 以外、または today section が存在しない場合は
  // **fallback**:textlog の最新 day section(`.pkc-textlog-day:first-
  // child`)にジャンプ。両方 fail なら silent no-op。
  registerCommand(
    {
      id: 'textlog.jump-today',
      titleJa: 'Textlog の今日のログにジャンプ',
      titleEn: 'Textlog: Jump to today(or latest day)',
      category: 'View',
    },
    () => {
      if (typeof document === 'undefined') return;
      const center = document.querySelector('[data-pkc-region="center"]')
        ?? document.querySelector('.pkc-center');
      const root: ParentNode = center ?? document;
      // 今日の date key を YYYY-MM-DD で生成(local time)
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayId = `day-${yyyy}-${mm}-${dd}`;
      const todayEl = root.querySelector<HTMLElement>(`#${CSS.escape(todayId)}`);
      if (todayEl) {
        todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      // fallback:最新 day section(textlog は desc order なので最初の section が最新)
      const latestEl = root.querySelector<HTMLElement>('.pkc-textlog-day');
      if (latestEl) {
        latestEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
  );

  // ─── 領域 5 編集 command 拡充(2026-05-28、user 督促)─────────────────
  // 編集中の body textarea を取得する helper。優先順位:
  //   (1) `document.activeElement` が body textarea ならそれ(直前まで focus)
  //   (2) 可視 body textarea(`textarea[data-pkc-field="body"]`)を 1 件 query
  //   (3) 無ければ no-op + warn(palette 操作で「編集中でない」を user に知らせる)
  function activeBodyTextarea(): HTMLTextAreaElement | null {
    if (typeof document === 'undefined') return null;
    const active = document.activeElement;
    if (active instanceof HTMLTextAreaElement && active.getAttribute('data-pkc-field') === 'body') {
      return active;
    }
    return document.querySelector<HTMLTextAreaElement>('textarea[data-pkc-field="body"]');
  }
  function runWithBodyTextarea(label: string, action: (ta: HTMLTextAreaElement) => void): void {
    const ta = activeBodyTextarea();
    if (!ta) {
      if (typeof console !== 'undefined') {
        console.warn(`[command-palette] ${label}: 編集中の body textarea が無いため no-op`);
      }
      return;
    }
    action(ta);
  }

  // inline wrap 系(format-panel の Ctrl+B / I / S / ` / == と同じ marker)
  const inlineWraps: { id: string; titleJa: string; titleEn: string; marker: string; keybind?: string }[] = [
    { id: 'editor.format.bold',         titleJa: '太字で囲む(**)',           titleEn: 'Edit: Bold (**)',        marker: '**',  keybind: 'Ctrl+B' },
    { id: 'editor.format.italic',       titleJa: '斜体で囲む(*)',            titleEn: 'Edit: Italic (*)',       marker: '*',   keybind: 'Ctrl+I' },
    { id: 'editor.format.strike',       titleJa: '打ち消しで囲む(~~)',       titleEn: 'Edit: Strikethrough (~~)', marker: '~~', keybind: 'Ctrl+Shift+S' },
    { id: 'editor.format.code-inline',  titleJa: 'inline code で囲む(`)',    titleEn: 'Edit: Inline code (`)',  marker: '`',   keybind: 'Ctrl+`' },
    { id: 'editor.format.highlight',    titleJa: 'マーカーで囲む(==)',       titleEn: 'Edit: Highlight (==)',   marker: '==' },
  ];
  for (const w of inlineWraps) {
    const meta: CommandMeta = {
      id: w.id,
      titleJa: w.titleJa,
      titleEn: w.titleEn,
      category: 'Edit',
      ...(w.keybind ? { keybind: w.keybind } : {}),
    };
    registerCommand(meta, () => {
      runWithBodyTextarea(w.id, (ta) => {
        applyTransformToTextarea(ta, (s: Selection) => wrapInline(s, w.marker));
      });
    });
  }

  // snippet 系(line-prefix / block insert)── snippet-toolbar の applySnippet 経路を共有
  const snippets: { id: string; titleJa: string; titleEn: string; kind: SnippetKind }[] = [
    { id: 'editor.insert.code-block',     titleJa: 'コードブロック(``` ```)挿入',    titleEn: 'Edit: Insert code block (``` ```)',  kind: 'fence' },
    { id: 'editor.insert.heading1',       titleJa: '見出し 1(#)に',                  titleEn: 'Edit: Heading 1 (#)',                kind: 'heading' },
    { id: 'editor.insert.heading2',       titleJa: '見出し 2(##)に',                 titleEn: 'Edit: Heading 2 (##)',               kind: 'heading2' },
    { id: 'editor.insert.heading3',       titleJa: '見出し 3(###)に',                titleEn: 'Edit: Heading 3 (###)',              kind: 'heading3' },
    { id: 'editor.insert.quote',          titleJa: '引用(>)に',                      titleEn: 'Edit: Quote (>)',                    kind: 'quote' },
    { id: 'editor.insert.list-bullet',    titleJa: '箇条書き(-)に',                  titleEn: 'Edit: Bullet list (-)',              kind: 'dash' },
    { id: 'editor.insert.section-break',  titleJa: 'セクション区切り(+++)を挿入',    titleEn: 'Edit: Insert section break (+++)',   kind: 'section-break' },
    { id: 'editor.insert.align-center',   titleJa: '行を中央寄せ(||)',                titleEn: 'Edit: Align center (||)',            kind: 'align-center' },
    { id: 'editor.insert.align-right',    titleJa: '行を右寄せ(|>)',                  titleEn: 'Edit: Align right (|>)',             kind: 'align-right' },
    { id: 'editor.insert.align-left',     titleJa: '行を左寄せ(<|)',                  titleEn: 'Edit: Align left (<|)',              kind: 'align-left' },
    { id: 'editor.insert.ruby',           titleJa: 'ルビ([[ruby:...]])を挿入',       titleEn: 'Edit: Insert ruby ([[ruby:...]])',   kind: 'ruby' },
    { id: 'editor.insert.em-dot',         titleJa: '強調点([[em:...]])を挿入',       titleEn: 'Edit: Insert em-dot ([[em:...]])',   kind: 'em-dot' },
    { id: 'editor.insert.comment',        titleJa: 'コメント(%% ... %%)を挿入',      titleEn: 'Edit: Insert comment (%% ... %%)',   kind: 'comment-inline' },
    { id: 'editor.insert.simple-inline',  titleJa: 'simple inline(:text:attrs:)を挿入', titleEn: 'Edit: Insert simple inline',     kind: 'simple-inline' },
  ];
  for (const s of snippets) {
    registerCommand(
      { id: s.id, titleJa: s.titleJa, titleEn: s.titleEn, category: 'Edit' },
      () => {
        runWithBodyTextarea(s.id, (ta) => applySnippet(ta, s.kind));
      },
    );
  }
}
