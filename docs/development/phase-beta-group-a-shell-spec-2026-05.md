# Phase β PR-β1:Group A 統合 spec — shell 再構成(2026-05-19)

**Status**:docs-only spec(PR-β1、Phase β の Group A 詳細設計)
**前提 doc**:[`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md)
(PR-β0 = Phase β 全体計画、open Q1〜Q3 暫定回答済)
**Scope**:v3 提案 **#1 編集 mode 3 分割 + #4 マルチウィンドウ + #5 ファイラ統合 / 左ペイン廃止** を 1 spec に統合
**実装**:Phase γ-A1〜γ-A4 で順次着手(本 spec は **設計合意 doc**、src 変更なし)
**Audience**:PKC2 を初めて触る engineer、6 ヶ月後でも陳腐化せず読める粒度

---

## §0 本書の位置付け

v3 提案 8 案のうち、**Group A(UI shell 再構成)= #1 + #4 + #5** は
**3 案すべてが PKC2 の center pane / sidebar / entry-window の配置を
書き換える** ため、互いに依存して spec を別 doc にすると cross-ref が
破綻する。1 spec で全部固める(Phase β plan §2.1 で確定済)。

本 spec の **読み方**:
- §1 で **現状の事実関係** を file path + line range 付きで整理(将来 grep
  で陳腐化を検知できるよう、code anchor を残す)
- §2〜§4 で **3 提案の詳細設計**(各々で UX / data flow / state 拡張 /
  Tier 0 flag を spec)
- §5 で **Tier 0 flag 経由の段階導入経路**
- §6 で **rollback contract**(backward compat 保証)
- §7 で **visual parity test 計画**(CLAUDE.md 規約 §5)
- §8 で **spec 起こし中に出た新 open question**(user 追加合意待ち)

---

## §1 現状 shell の事実関係(spec の前提)

### §1.1 center pane と view-mode tab

**File**:[`src/adapter/ui/renderer.ts:4349-4493`](../../src/adapter/ui/renderer.ts) (`renderCenter`)

DOM 構造:
```
<section data-pkc-region="center">
  <div class="pkc-view-mode-bar" data-pkc-region="view-mode-bar">
    <button data-pkc-action="set-view-mode" data-pkc-view-mode="detail">...
    (6 buttons: detail / calendar / kanban / filer / graph / launcher)
  </div>
  <!-- view-mode 切替 -->
  - detail   → renderEditor (editing) or renderView (ready)
  - calendar → renderCalendarView
  - kanban   → renderKanbanView
  - filer    → renderFilerView
  - graph    → renderGraphView
  - launcher → renderLauncherView
</section>
```

state field:`state.viewMode: 'detail' | 'calendar' | 'kanban' | 'filer' |
'graph' | 'launcher'`。SET_VIEW_MODE action は action-binder.ts の
`set-view-mode` 属性 binding から dispatch。

**Group A 統合への含意**:
- 新 view-mode 追加は `renderCenterImpl` の `if` 分岐 + toggle bar
  `modes` list 拡張で対応
- 提案 #5(ファイラ統合)は **新 view-mode を作らない**、既存 filer
  view-mode + sidebar の sidebarMode 'filer' を統合運用する経路で済む
  可能性あり(後述 §4)

### §1.2 sidebar(左ペイン)

**File**:[`src/adapter/ui/renderer.ts:2979-3150`](../../src/adapter/ui/renderer.ts)
(`renderSidebar` / `renderSidebarImpl` / `renderSidebarAsFiler`)

DOM 構造:
```
<aside class="pkc-sidebar" data-pkc-region="sidebar"
       data-pkc-collapsed="false">
  <!-- sidebarMode() で分岐 -->
  - 'tree' (legacy)  → renderSidebarImpl
      search input + archetype filter + saved-searches + recent-entries
      + advanced-filters disclosure
  - 'filer' (compact) → renderSidebarAsFiler
      親 folder label + 直下 children list
      (<ul class="pkc-sidebar-filer-list">)
</aside>
```

state field:`searchQuery / archetypeFilter / tagFilter / colorTagFilter /
sortKey / sortDirection / advancedFiltersOpen / recentPaneCollapsed`。

**`folder.detail_as_filer` flag**(現状、default `false`):
- detail view-mode で entry 選択時、entry が folder archetype なら
  `renderFilerView` に差し替え(center pane の detail を filer 化)
- **sidebar 自体には作用しない**(sidebar mode 切替とは別軸)
- nav-history.ts で hidden state restore 注意点あり

**Group A 統合への含意**:
- **sidebar 廃止と `folder.detail_as_filer` は別軸**。私(Claude)が plan
  §3.1 Q3 で「`folder.detail_as_filer = true` を default ON で sidebar
  廃止」と書いたのは **事実誤認**。訂正:sidebar 廃止は **`sidebarMode()`
  の default を 'filer' に切替 + ゆくゆく sidebar 自体を removal** が
  正しい経路(後述 §4)
- sidebar mode 'tree' ↔ 'filer' は既に基盤あり、提案 #5 は基盤拡張で済む

### §1.3 meta pane(右ペイン、Group B 領域、本 spec 参考)

**File**:[`src/adapter/ui/renderer.ts:7439-7600+`](../../src/adapter/ui/renderer.ts)
(`renderMetaPane` / `renderMetaPaneImpl`)

DOM 構造:`<aside class="pkc-meta-pane" data-pkc-region="meta">`。
内容:archetype header + timestamps + frontmatter + TOC(TEXT heading)
+ entry tags + relations + move interface。frontmatter / tags / relations
が混在(= Group B 提案 #6 の専門化対象)。

panePrefs(`pkc2.panePrefs` localStorage + DOM `data-pkc-collapsed`)で
collapse 管理。

**Group A 統合への含意**:Group A は meta pane を **触らない**。Group B
(PR-β2)で別 spec 化。本 spec では「現状の meta pane を保持」が前提。

### §1.4 entry-window(子 window、提案 #4 の基盤)

**File**:[`src/adapter/ui/entry-window.ts:511-610`](../../src/adapter/ui/entry-window.ts)
(`openEntryWindow`)

```typescript
window.open('', `pkc-entry-${lid}`,
            'width=720,height=600,menubar=no,toolbar=no')
```

**現 postMessage protocol**(parent ↔ child):
| dir | type | payload |
|---|---|---|
| parent → child | `pkc-entry-init` | `{ entry, readonly }` |
| child → parent | `pkc-entry-save` | `{ lid, title, body, openedAt }` |
| parent → child | `pkc-entry-saved` | save 完了通知 |
| parent → child | `pkc-entry-conflict` | revision 衝突通知 |
| parent → child | `pkc-entry-task-toggle` | task completion sync |
| parent → child | `pkc-entry-download-asset` | attachment DL trigger |

child window 内の container 編集は **parent dispatcher に COMMIT_EDIT
action 経由で反映**(container mutation は centralized、child 独立保存
なし)。duplicate-open は **focus + preview context refresh**(同 lid で
2 child を開かない)。

**Group A 統合への含意**:
- 提案 #4 マルチウィンドウは **entry-window の拡張** で実現可能
- protocol 拡張で **同時複数 child window** をサポート、main reload
  抑制 / 編集 phase 多値化を本 spec で詰める

### §1.5 AppPhase と editing(提案 #1 の基盤)

**File**:[`src/adapter/state/app-state.ts:84-101`](../../src/adapter/state/app-state.ts)

```typescript
type AppPhase = 'initializing' | 'ready' | 'editing' | 'exporting' | 'error'
```

state field:`editingLid: string | null`(**single-entry scope**)。

- BEGIN_EDIT action → phase 'editing' + editingLid set
- COMMIT_EDIT → phase 'ready' + editingLid clear
- canEdit gate:`phase === 'ready' && !state.readonly`

**Group A 統合への含意**:
- 提案 #4 マルチウィンドウで **複数 child が同時編集** したい場合、
  現 `editingLid: string | null` を **`editingLids: Set<string>`** に
  拡張する必要が出る(後述 §3.4)
- 提案 #1 透過 / Split / 専用窓 は phase 'editing' の **render path
  違い** で吸収できる、phase 自体の多値化は不要

### §1.6 dispatcher

**File**:[`src/adapter/state/dispatcher.ts:42-159`](../../src/adapter/state/dispatcher.ts)

```typescript
interface Dispatcher {
  dispatch(action: Dispatchable): ReduceResult
  getState(): AppState
  onState(listener: (state) => void): () => void
  onEvent(listener: (events: DomainEvent[]) => void): () => void
}
```

reduce → state listener flush → event listener flush の純粋順序。
postMessage transport は `src/adapter/transport/message-bridge.ts` で
MessageEnvelope → SystemCommand 変換 → dispatcher.dispatch にルーティング。

**Group A 統合への含意**:
- 提案 #4 マルチウィンドウで child → parent の write-back は
  dispatcher.dispatch 経由で centralized 維持(direct container mutation
  禁止 doctrine)
- main reload 抑制(plan §3.1 Q2)は `beforeunload` event を
  dispatcher.getState() + editingLids 多値判定で gate

### §1.7 PiP 廃止後の現状(Phase α #A1、commit `d641afb`)

PR #475 で Document Picture-in-Picture API を完全廃止、`window.open('',
'_blank', 'width=900,height=640')` に統一(activePipWindow → activeWindow
名称統一)。media-viewer + entry-window が **同一 `window.open()` 経路** を
通る基盤が完成。

**Group A 統合への含意**:提案 #4 マルチウィンドウは既に統一 path を
共有、popup blocker / user activation chain / iOS Safari 互換性は
PR #475 + #477 で baseline 済(再発防止規約は規約 doc に反映済)。

---

## §2 提案 #1 編集 mode 3 分割

### §2.1 3 mode 定義(plan §3.1 Q1 暫定回答の詳細化)

| mode | 名称 | 用途 | 既存実装との関係 |
|---|---|---|---|
| (a) | **透過レイヤー編集**(Overlay Edit) | 「読みながら少し直したい」、render 済 content 上に半透明 textarea overlay | **新規**(現状なし、`renderEditor` の新 path) |
| (b) | **Split View 編集**(Split Edit) | 「書きながらプレビュー見たい」、editor + preview 並列 | **既存**(TEXT presenter `renderEditorBody`)|
| (c) | **専用別窓編集**(Window Edit) | 「集中して書きたい」、編集専用 child window + render 専用 window(or main = render) | **既存拡張**(`openEntryWindow` の拡張)|

### §2.2 mode 遷移 UX

各 mode の **entry trigger** と **exit trigger**:

| mode | entry trigger | exit trigger |
|---|---|---|
| (a) Overlay | detail view で `Cmd/Ctrl+E`、または header の `✎ Quick edit` button | `Esc` / outside click / `Cmd/Ctrl+Enter` で COMMIT_EDIT |
| (b) Split | detail view で `Cmd/Ctrl+Shift+E`、または header の `⫶ Split edit` button | `Esc` / `Cmd/Ctrl+Enter` で COMMIT_EDIT |
| (c) Window | detail view で `Cmd/Ctrl+Alt+E`、または header の `↗ Window edit` button | child window close で auto-save、または explicit save button |

**mode 切替**:編集中に mode 切替したい場合(例:Overlay → Split)、
- editor content を **memory hold**(IndexedDB 経由でなく state.draft に
  保持)
- 旧 mode の DOM teardown → 新 mode の DOM 生成
- caret position は **column-based**(行内 char index)で best-effort 復元

### §2.3 persist 規約

- **mode 選択**:`localStorage` key `pkc2.editMode.default = 'overlay' |
  'split' | 'window'`(初期値 = `'split'` = 現状互換)
- **per-archetype override**:`pkc2.editMode.byArchetype = { text:
  'overlay', textlog: 'split', ... }`(table-based、編集ごとに柔軟切替)
- migration:既存 user(localStorage に key なし)は default `'split'` で
  完全互換

### §2.4 既存 detail-edit + Split View との互換性

- **既存 Split View** = mode (b) と同等、実装名称を `'split'` に統一
- **既存 detail-edit**(`renderEditor` 単体、preview なし)= **mode (a)
  Overlay** に置き換え(透過 overlay として再実装)
- backward compat:Tier 0 flag `editor.mode_legacy = false`(default)で
  3 mode 経路を有効化、`= true` で旧 detail-edit + Split View に完全戻し

### §2.5 γ-A2 実装での mode model 精緻化(2026-05-20、γ-A2 A2-1 着手時)

編集 mode は wave map §4.2 の **γ-A2**(sub-wave、A2-1〜A2-10)。本 §2.5
は A2-1(foundation)着手時の model 精緻化記録。

§2.1 の 3 mode(`overlay` / `split` / `window`)は **2 軸を 1 列に潰して**
いた:**編集 surface**(中央ペイン内 vs 子 window)と **中央ペイン内の
layout**(plain / split-preview / 透過 overlay)。`split` は `window` の
peer ではなく、中央ペイン編集の sub-layout に過ぎない。

γ-A2 foundation では surface 軸のみを `AppState.editMode` として model
化する:

| `editMode` | 意味 | 既存実装との関係 |
|---|---|---|
| `'inline'`(default、undefined 含む)| 中央ペイン内編集(従来 detail-edit + Split View を包含)| 現状そのまま |
| `'window'` | 専用 entry-window(子 window)編集 | `openEntryWindow` 拡張 |

中央ペイン内の layout(split-preview ON/OFF、透過 overlay)は **直交した
別 concern** として後段で扱う。透過 Overlay は §8 OQ-A-1 で UX 不確実と
されているため、`editMode` enum には含めず deferred とする。

foundation の構成要素(γ-A2 A2-1、本 PR):

- `AppState.editMode?: 'inline' | 'window'`(runtime state のみ、§6.3
  schema 不変は維持)
- `SET_EDIT_MODE` action + reducer(`reduceReady` 内、純粋 state mutation)
- Tier 0 flag `shell.edit_mode_enabled`(default `false`、OFF で従来の
  inline 編集のみ = 完全後方互換)

UI / wiring(mode 選択 trigger、entry-window への分岐)は後続 A2 PR で
接続。§5.2 の `editor.mode_*` 系 flag は 3-mode 経路を採る場合の予約で
あり、γ-A2 foundation は `shell.edit_mode_enabled` 1 本で gate する。

### §2.6 γ-A2 A2-2:picker + window 配線(2026-05-20、pgc-28)

A2-1 foundation の `editMode` を user-facing にする slice。

- **picker UI**:center pane 下部の action bar(`renderActionBar`)に
  inline / window の 2-button picker(`data-pkc-region="edit-mode-picker"`)。
  flag `shell.edit_mode_enabled` ON かつ編集可能 entry 選択時のみ表示。
  picker click → `SET_EDIT_MODE` dispatch → re-render で active 遷移。
- **window 配線**:✏️ Edit button / `Ctrl+E` / `Enter` の 3 編集トリガを
  action-binder の `triggerEdit(lid, target)` 共通経路に集約。`flag ON
  かつ editMode==='window'` のとき `BEGIN_EDIT`(inline 編集)に入らず
  `openEntryWindow`(既存の子 window 経路、double-click と同一)へ分岐。
- **後方互換**:flag OFF / `editMode` が `'inline'` or undefined のときは
  従来通り `BEGIN_EDIT`。picker も非表示。

§2.2 の keyboard shortcut 体系(`Cmd/Ctrl+Shift+E` 等の mode 別 shortcut)
と §2.3 の localStorage 永続化は後続 A2 PR。本 slice は editMode を runtime
state として保持するのみ(reload で inline に戻る)。

### §2.7 γ-A2 A2-3:editMode 永続化(2026-05-20、pgc-29)

§2.6 で「reload で inline に戻る」とした runtime-only 制約を解消する slice。

- **persistence module**:`src/adapter/platform/edit-mode-prefs.ts`
  (`loadEditMode` / `saveEditMode`)。localStorage key は `pkc2.editMode`、
  値は `'inline'` / `'window'` の文字列そのもの。
- **write**:action-binder の `set-edit-mode` handler が user の picker
  選択時に `saveEditMode(mode)` を呼ぶ(boot restore の dispatch は
  handler を通らないので user 操作のみ永続化される)。
- **read**:main.ts の `restoreEditModeFromStorage` が SYS_INIT_COMPLETE
  後に `loadEditMode()` → 非 null なら `SET_EDIT_MODE` を dispatch。
  `restoreSettings` / `restoreCollapsedFolders` と同じ boot-restore pattern。

§2.3 の key 名は当初 `pkc2.editMode.default`(3-mode + per-archetype
override `pkc2.editMode.byArchetype` 前提)だったが、§2.5 の 2-mode
surface model では per-archetype override を採らないため単一 key
`pkc2.editMode` に簡約した。

editMode は **viewer-local preference**:`container.meta` には書かず、
export / import に不参加、device 間同期なし(§6.3 / `folder-prefs.ts` と
同方針)。localStorage 不可環境では runtime state のみ(reload で inline)
= 完全後方互換。

**γ-A2 の到達点**:foundation(A2-1)+ picker / window 配線(A2-2)+
永続化(A2-3)で編集 mode 選択は機能的に完了。A2-6 per-archetype default
は §2.5 の方針で不採用、A2-7 mode 別 keyboard shortcut は picker + 既存
`Ctrl+E`(triggerEdit 経由で editMode 尊重)で充足のため不要。A2-10 の
flag default ON 切替は user 判断に委ねる(本 stack では
`shell.edit_mode_enabled` は OFF のまま)。

---

## §3 提案 #4 マルチウィンドウ + main 遷移抑制

### §3.1 子 window の data flow(現 entry-window 拡張)

現:1 child window per lid(duplicate prevention)、parent dispatch
中心。

**拡張案**:
- **複数 child window 同時許可**(同 lid は依然 1 child、別 lid は複数 OK)
- main は **navigation view-mode**(filer / launcher / graph)を固定保持、
  detail 編集は child window に逃がす(提案 #4 の核心)
- 各 child は独立 postMessage channel(`pkc-entry-${lid}-${windowId}`
  identifier 拡張)

### §3.2 main reload 抑制(plan §3.1 Q2 暫定回答の詳細化)

trigger:
- `state.editingLids.size > 0` の場合、main の `beforeunload` event
  handler が confirm dialog を出す(browser native)
- main → child broadcast `pkc-main-shutdown-request` で child の編集
  状態を query、`pkc-main-shutdown-response` で各 child から save 状態
  を返す。すべて saved なら main reload を許可

Tier 0 flag:`shell.main_reload_guard = true`(default ON、reform 経路
で OFF にして旧挙動戻し可)

### §3.3 postMessage protocol 拡張

新 message type 追加:
| dir | type | payload | 用途 |
|---|---|---|---|
| parent → child | `pkc-container-sync` | `{ rev, entries delta }` | 別 child が編集した entry を本 child の preview に反映 |
| child → parent | `pkc-child-ready` | `{ lid, windowId }` | child が boot 完了通知、parent が editingLids に追加 |
| child → parent | `pkc-child-close` | `{ lid, windowId, hasUnsavedChanges }` | child が close 直前通知、parent が editingLids から削除 |
| parent ↔ all child | `pkc-broadcast-revision` | `{ lid, rev }` | revision 衝突検知の早期通知 |

既存 6 message type(§1.4)は **保持**、新 4 message type を追加。
backward compat 維持。

### §3.4 AppState 拡張:`editingLid` → `editingLids`

現:`editingLid: string | null`(single-entry)
提案:`editingLids: Set<string>`(multi-entry)

- main 自身の編集(従来 detail-edit):`editingLids.has(mainEditingLid)`
- child window 編集:`editingLids.has(childLid)` × N child
- 各 dispatch(BEGIN_EDIT / COMMIT_EDIT)は **`editingLids` 操作** に変更
- canEdit gate:`phase === 'ready' && !state.readonly` は維持、scope は
  per-lid

Tier 0 flag:`shell.multi_window = true`(default OFF、Phase γ-A3 で ON
切替検討)

### §3.5 競合解決(revision 衝突)

- 既存 `openedAt` timestamp による衝突検知を **revision counter** に
  refactor(`pkc-entry-save` payload に `{ baseRev, newBody }` を含む、
  `pkc-entry-conflict` を返すか `pkc-entry-saved` を返すか parent が
  判定)
- 衝突時:child window 内で **3-pane diff UI**(自分の変更 / 別 child の
  変更 / 共通祖先)、user が手動 merge → save

実装難易度:**高**、Phase γ-A4 まで遅延可。Phase γ-A3 では「2 child 同時
編集禁止 + 検知 dialog」で済ませる選択肢あり(後述 §8 OQ-A-3)。

### §3.6 γ-A3 実装記録(2026-05-20、stack pgc-30〜)

**A3-4 main reload guard(pgc-30)**:`src/adapter/ui/main-reload-guard.ts`
新設。`installMainReloadGuard(getOpenWindowLids)` が `beforeunload`
listener を張り、`shouldGuardReload`(flag ON かつ子 window ≥ 1)なら
`preventDefault` + `returnValue` で browser native の確認を出す。子
window 一覧は entry-window.ts の既存 `getOpenEntryWindowLids` を main.ts
から **注入**(adapter/ui 内の循環 import 回避 + テスト容易性)。

flag は `shell.main_reload_guard`。§3.2 / §5.2 は default ON を想定して
いたが、γ-A stack は **全 flag OFF 出荷**(opt-in するまで完全 no-op、
stack ごと close しても安全)の方針に統一しているため default OFF で
出荷する。採用時に user が ON に切り替える(§5.2 表も false に更新済)。

`editingLid → editingLids` の Set 化(§3.4、A3-1)は state machine 全体
+ 多数 test に波及する大規模 refactor。reload guard(A3-4)は子 window
の有無を `getOpenEntryWindowLids()` で参照できれば足り、§3.4 の Set 化に
依存しないため先行着地した。

**γ-A3 既存能力 audit(2026-05-20、pgc-31)**:wave map §4.3 の
A3-1〜A3-11 を `entry-window.ts`(約 2977 行)+ main.ts wiring と突き
合わせた結果、multi-window 基盤は **大半が実装済** と判明した。

| 能力 | 状態 | 根拠 |
|---|---|---|
| 複数 child window 同時(別 lid)| 実装済 | `openWindows` Map(entry-window.ts:105)、dedup は per-lid のみ |
| parent → child live refresh | 実装済 | `pushPreviewContextUpdate` / `pushViewBodyUpdate` / `pushTitleUpdate` + `wireEntryWindow*` 3 本(main.ts)|
| postMessage protocol | 実装済 | 8 message type(`pkc-entry-init` / `-save` / `-saved` / `-conflict` / `-update-{preview-ctx,view-body,title}` / `-task-toggle` / `-download-asset`)|
| 競合検知 | 実装済 | `handleDblClickAction` onSave の `updated_at !== openedAt` → `notifyConflict`(`pkc-entry-conflict`)|
| child close / crash recovery | 実装済 | 500ms `setInterval` poll で `child.closed` 検知 → `openWindows.delete`(entry-window.ts:600-611)|
| reload guard | **pgc-30 で着地** | `main-reload-guard.ts`(本 §3.6 上記)|
| AppState の child-window 集約 | 未(不要)| reload guard は `getOpenEntryWindowLids()` を直接参照、`editingLids` 集約の consumer が存在しない |

**結論**:γ-A3 は **機能的に完了**。A3-1(`editingLid → editingLids`
Set 化)は consumer 不在のため着手しない(YAGNI / CLAUDE.md「No
premature abstraction」。§3.4 は将来 consumer が出現した時点で再評価)。
A3-6 の競合解決は **検知**まで実装済で、spec §3.5 の 3-pane diff UI への
格上げは §3.5 自身が「難易度 高、γ-A4 まで遅延可」と明記しており
deferred。A3-8(main = navigation 専用)は §4 の sidebar / filer 再編と
同一概念のため γ-A1 で扱う。wave map §4.3 の 11 PR 内訳は γ-A3 が「ほぼ
新規実装」だった前提で書かれていたが、実際は format-panel(§γ-C)と
同様に既存資産が spec を上回っていた。

---

## §4 提案 #5 ファイラ統合 + 左ペイン廃止

### §4.1 訂正:plan §3.1 Q3 の事実誤認

plan §3.1 Q3 で「`folder.detail_as_filer = true` を default ON で
sidebar 廃止」と書いたが、§1.2 で確認した通り **`folder.detail_as_filer`
は sidebar 廃止と無関係**(center pane detail の filer 置き換え flag、
sidebar には触れない)。

**訂正版の段階導入経路**:

| Phase | 操作 | flag 状態 |
|---|---|---|
| γ-A1 | `sidebarMode()` default を `'tree'` → `'filer'` に切替 | `shell.sidebar_mode_default = 'filer'`(現:暗黙 `'tree'`)|
| γ-A2 | sidebar 自体に **deprecated marker**(Beta)を表示、user 不満 1 month 観測 | `shell.sidebar_deprecated_marker = true` |
| γ-A3 | sidebar 完全 removal(`shell.sidebar_enabled = false` 不可逆)、center pane filer を navigation の単一窓口 | `shell.sidebar_enabled = false`(v3.0 lineup)|

### §4.2 sidebar 廃止後の navigation(center pane filer 主役化)

- center pane filer は既に `data-pkc-region="center"` 内で view-mode
  'filer' として存在(§1.1)
- sidebar 廃止後、main window の navigation は **filer view-mode +
  view-mode toggle bar** に集約
- breadcrumb(現 detail view header に存在)は filer view にも常設、
  parent folder への navigation 経路を保証

### §4.3 既存 sidebar 機能の移行先

| 機能 | 移行先 |
|---|---|
| search input | center pane filer の上部 search bar |
| archetype filter | center pane filer の filter strip(既存)|
| tag filter | 同上 |
| saved-searches | center pane filer の左カラム(新規)、または launcher view-mode に統合 |
| recent-entries | launcher view-mode の recent section に集約 |
| advanced-filters disclosure | center pane filer の disclosure(既存 UI を center に展開)|

### §4.4 `folder.detail_as_filer` flag の扱い

現 flag は **center pane detail の filer 置き換え** scope であり、
sidebar 廃止と独立。Phase γ-A1 完了後も flag は保持(folder entry を
detail view で開く場合の挙動制御として有効)。

**ただし** sidebar 廃止後は filer が default navigation なので、folder
entry のクリック挙動は **filer に navigate**(folderDetailAsFiler の意味
が薄まる)。flag の default を `true` に変更検討は Phase γ-A2 で再評価。

### §4.5 γ-A1 実装記録(2026-05-20、stack pgc-32〜)

**filer モード sidebar の現状**:`sidebar.mode = 'filer'`(`sidebar-flags.ts`、
領域 10-6 ζ'' Phase 4 follow-up で導入済)で左ペインを filer-explorer 化
する `renderSidebarAsFiler` が **既に実装済**。wave map §4.1 A1-1 が新設を
想定する `shell.sidebar_mode_default` は既存 `sidebar.mode` と機能重複の
ため **導入しない**(γ-A3 / format-panel と同じく既存資産が spec を上回る
事例)。

**pgc-32 品質固め**:`renderSidebarAsFiler` は shipped 機能ながら active
test 被覆が皆無だった。clickable な navigation surface(CLAUDE.md §5 で
visual parity test 必須)に対し:

- `tests/adapter/sidebar-filer-mode.test.ts`(happy-dom 8 件):flag gate /
  root scope 列挙 / item 属性 / folder scope ナビゲーション / nav-up /
  active marker / click→SELECT_ENTRY→再 scope(Phase 8 順序性)/ 空状態
- `tests/smoke/sidebar-filer-mode.spec.ts`(Playwright parity 1 件):実 OS
  click で sidebar item 選択遷移

pgc-32 は src 変更なし(既存実装は test で正当性確認、bug 0)。

**pgc-33 drag-and-drop**(user direction「filer モードを機能強化して
続行」、2026-05-20):filer-mode sidebar は tree-mode 比で機能が minimal
だったため、parity 向けの機能強化を開始。第 1 弾は **entry の folder 間
DnD 移動**:

- `renderSidebarAsFiler` の item に `draggable` / `data-pkc-draggable`、
  folder item + nav-up に `data-pkc-drop-target`(nav-up は root sentinel
  なら `root`)を付与
- DnD 機構は action-binder の汎用 `handleDragStart` / `handleDragOver` /
  `handleDrop`(`data-pkc-draggable` / `data-pkc-drop-target` を見て
  structural relation を付け替える)を **再利用** — 新規 handler 不要
- drag 状態の CSS も既存の `[data-pkc-dragging]` / `[data-pkc-drag-over]`
  属性 selector が自動適用 — 新規 CSS 不要
- `tests/adapter/sidebar-filer-dnd.test.ts`(happy-dom 12 件、case
  matrix)+ `tests/smoke/sidebar-filer-dnd.spec.ts`(Playwright parity 1
  件、実 OS `dragTo`)

機能強化の残り(search / filter、multi-select + bulk action、entry
metadata badge、copy-link 等)は後続 pgc で順次。default 切替(A1-4)+
deprecated marker(A1-5)は user 判断保留。

---

## §5 migration plan + Tier 0 flag 一覧

### §5.1 Phase γ-A1〜A4 の段階表

| wave | 内容 | flag default 切替 | breakage risk |
|---|---|---|---|
| γ-A1 | `sidebarMode()` default を 'filer' に切替 | `shell.sidebar_mode_default = 'filer'` | 低(user 設定で 'tree' に戻せる)|
| γ-A2 | sidebar deprecated marker + center filer 機能補完 | `shell.sidebar_deprecated_marker = true` | 低 |
| γ-A3 | 編集 mode 3 分割 + マルチウィンドウ(`editingLids` Set 化、postMessage 拡張)| `editor.mode_legacy = false`(3 mode 有効化)+ `shell.multi_window = true` | **中-高**(state schema 拡張、Test 多数再書直)|
| γ-A4 | sidebar 完全 removal + revision 衝突 3-pane diff UI | `shell.sidebar_enabled = false`(不可逆)| 高(v3.0 lineup)|

### §5.2 Tier 0 flag 一覧(本 spec で導入)

| flag key | type | default | scope |
|---|---|---|---|
| `shell.edit_mode_enabled` | bool | `false` | 編集モード選択(inline / window)を有効化(γ-A2 foundation、§2.5)|
| `editor.mode_legacy` | bool | `false` | 3 mode 経路の無効化(旧 detail-edit + Split View に戻す)|
| `editor.mode_default` | string | `'split'` | 新規 3 mode のうち初期値 |
| `editor.mode_by_archetype` | object | `{}` | per-archetype override(`{ text: 'overlay', ... }`)|
| `shell.main_reload_guard` | bool | `false` | main reload 抑制 ON/OFF(spec §3.2 は ON 想定、γ-A stack 全 flag OFF 方針で出荷時 OFF、§3.6 参照)|
| `shell.multi_window` | bool | `false` | 複数 child window 許可 |
| `shell.sidebar_mode_default` | string | `'tree'`(γ-A1 で `'filer'` に切替)| sidebar 初期 mode |
| `shell.sidebar_deprecated_marker` | bool | `false`(γ-A2 で `true`)| Beta marker 表示 |
| `shell.sidebar_enabled` | bool | `true`(γ-A4 で `false`)| sidebar 自体の存在 |

### §5.3 既存 user 設定の保存・移行

- 既存 `pkc2.panePrefs` は **保持**(sidebar collapse 状態を sidebar
  removal までは尊重)
- 新 key `pkc2.editMode.default` / `pkc2.editMode.byArchetype` は
  migration 不要(初期値 `'split'` で完全互換)
- `pkc2.shellPrefs`(新 key、複数 flag を 1 object に集約)を導入、
  Phase γ-A1 で起こす

---

## §6 backward compat contract

### §6.1 「既存 detail-edit + Split View」は保持

- mode (a) Overlay は **新規実装**、既存 detail-edit を置き換えるが
  Tier 0 flag `editor.mode_legacy = true` で旧挙動戻し可
- mode (b) Split は **既存 Split View そのまま**、内部命名のみ統一
  (TEXT presenter `renderEditorBody` に変更なし)
- mode (c) Window は **既存 `openEntryWindow` 拡張**、postMessage protocol
  は backward compat(新 message type 追加のみ、旧 6 type は削除しない)

### §6.2 sidebar 廃止は 3 段階、各段階で rollback 可

- γ-A1:`shell.sidebar_mode_default = 'tree'` で旧 sidebar tree に戻す
- γ-A2:`shell.sidebar_deprecated_marker = false` で marker 非表示
- γ-A3:state schema 拡張(`editingLids` Set)は **migration 関数**
  経由(`migrateEditingLid: string | null → Set<string>`)、save 経路で
  reverse migration 提供
- γ-A4:`shell.sidebar_enabled = false` は v3.0 lineup 合流、それ
  以前は flag で sidebar 復活可能

### §6.3 schema breaking なし

- container schema(`entries / relations / revisions / assets`)は **触らない**
- AppState 拡張(`editingLid → editingLids`)は **runtime state のみ**、
  IndexedDB persistence layer の schema には触れない(supreme invariant
  「container = source of truth、UI state はランタイム」 §CLAUDE.md
  Invariants 5 遵守)

---

## §7 visual parity test 計画

CLAUDE.md §5「視覚を持つ feature の PR では visual parity test 最低
1 件」に準拠、Phase γ-A1〜A4 各 wave で 1 件以上添付:

| wave | parity test 内容 |
|---|---|
| γ-A1 | sidebar mode default 切替で、main window roots の `<aside data-pkc-region="sidebar">` の DOM 構造が `'tree'` → `'filer'` UI に遷移、`elementFromPoint` で filer list item を click → center pane detail に navigate を実 OS event で assert |
| γ-A2 | sidebar deprecated marker が右上に visible、`page.mouse.click(x, y)` で marker dismiss → marker 消失を assert |
| γ-A3 | 編集 mode 3 切替で center pane の DOM 構造 + computed style が確定値に遷移(Overlay は半透明 textarea、Split は editor + preview 並列、Window は main center 空 + child window open) |
| γ-A3 | child window で書いた編集が main IDB に反映、`pkc-entry-save` → `COMMIT_EDIT` → IDB write を実 OS event ベースで assert |
| γ-A4 | sidebar 完全 removal で `<aside data-pkc-region="sidebar">` が DOM tree に存在しない、center pane filer が main の navigation 唯一窓口 |

各 parity test は **同 PR 内に添付**、green 確認まで「ユーザー側で merge
判断してよい状態」を報告しない(plan §5.3 doctrine 準拠)。

---

## §8 spec 起こし中に出た新 open question(user 追加合意待ち)

### §8.1 OQ-A-1:Overlay 編集の DOM 重ね合わせ精度

透過 layer の半透明 textarea を rendered HTML の **真上に pixel 一致** で
重ねるためには:
- `getBoundingClientRect()` で各 block の position 取得 → textarea を
  absolute positioning(`top` / `left` / `width` / `height`)
- font / line-height / letter-spacing を **完全一致** させる必要あり
  (CSS variables 統一)
- subpixel 差は Phase δ(canvas 化)でしか根本解決できない、Phase γ-A3
  時点では **「block 単位」の overlay**(段落 1 つを丸ごと textarea に
  差し替え)で妥協する案

**user 合意待ち**:Overlay 編集は (i) 「block 単位差し替え」で着地、
(ii) 「文字単位 overlay」を目指して subpixel 妥協、(iii) Phase δ canvas
までは未実装(Split + Window のみ)、のいずれか。

### §8.2 OQ-A-2:複数 child window の同時編集を Phase γ-A3 で許可するか

§3.5 で書いた revision 衝突 3-pane diff UI は実装難易度が高い。
Phase γ-A3 では:
- (i) 同 lid の child window は **1 つに制限**(現状維持)、別 lid なら
  複数 OK(easy)
- (ii) 同 lid 複数 child OK、衝突時は **後勝ち + revision warning toast**
- (iii) 同 lid 複数 child OK、衝突時 3-pane diff UI で手動 merge(full
  spec、難易度高)

**user 合意待ち**:γ-A3 では (i) を採用、γ-A4 で (iii) に進める段階導入
を推奨。

### §8.3 OQ-A-3:sidebar `'tree'` mode の最終的 fate

§4.1 の段階導入で γ-A4 で sidebar 完全 removal するが、`sidebarMode()`
の `'tree'` 経路(advanced filter / saved-searches 等)を **center pane に
完全 port** できるかは未確定。Phase γ-A2 で実機検証して判断。

**user 合意待ち**:γ-A2 で port 困難判定された場合、γ-A4 の sidebar
removal は v3.0 lineup から **v3.1 / v4.0 へ delay** する余地あり。

### §8.4 OQ-A-4:main window で main = render(編集なし)はどう保持?

提案 #4「メイン window は固定 view を保持」は plan §3.1 Q2 で
「navigation view-mode(filer / launcher / graph)を固定保持」と書いた。
detail / editing は **すべて child window に逃がす** 解釈で良いか。

**user 合意待ち**:
- (i) main = navigation 専用、detail / 編集は **常に child** に逃がす
- (ii) main で detail view も可、編集だけ child に逃がす
- (iii) user 設定で (i) / (ii) を選択

### §8.5 OQ-A-5:user の per-window state(scroll position 等)の persistence

複数 child window の **scroll position / selection / view-mode** を
session 間で復元するか:
- (i) **localStorage に sessionId × windowId で persist**、boot 時に
  全 child window を復元
- (ii) per-session で揮発(現状)、復元しない
- (iii) opt-in 設定(`shell.restore_child_windows`)で user 選択

**user 合意待ち**:(ii) が最 simple、(i) は Phase γ-A4 以降の拡張案。

---

## §9 history

| date | event |
|---|---|
| 2026-05-19 | PR #480(PR-β0)merge、Phase β plan 着地 |
| 2026-05-19 | **本書起こし(PR-β1)**:Group A 統合 spec、現状事実 + 3 提案詳細 + Tier 0 flag + visual parity 計画 + 新 OQ 5 件 |
| TBD | PR-β2 Group B 右ペイン spec |
| TBD | PR-β3 Group C 書式機能 spec |
| TBD | Phase γ-A1 着手判断 |

---

## §10 関連 doc

- [`phase-beta-plan-2026-05-19.md`](./phase-beta-plan-2026-05-19.md):
  Phase β 全体計画、本 spec は §2.1 PR-β1 として位置付け
- [`v3-architecture-proposals-2026-05-18.md`](./v3-architecture-proposals-2026-05-18.md):
  8 案受領 doc、本 spec は #1 + #4 + #5 を統合 + Phase α #A1(PiP 廃止 +
  `window.open()` 統一、PR #475 + #477)の baseline を継承
- [`pkc2-vision-modern-emacs-2026-05.md`](./pkc2-vision-modern-emacs-2026-05.md):
  vision、shell 再構成が「モダン emacs」doctrine と整合する根拠
- [`visual-state-parity-testing.md`](./visual-state-parity-testing.md):
  §7 visual parity test の方法論 reference
