# Entry Rename Freshness Audit

**Status**: audit — 2026-04-21.
**Scope**: entry の title を rename した直後、どの UI surface が即座に refresh されるかを実装レベルで確認し、stale な箇所があれば修正要否を判断する。
**Baseline**: `next-feature-prioritization-after-relations-wave.md` の P3（rename 鮮度監査）。

---

## 1. 背景

Recent Entries Pane v1 (P1) と Breadcrumb / Path Trail v1 (P2) で **位置把握系 navigation** が
強化された結果、各 UI surface に表示される entry title の **鮮度** が UX 上重要になった。
本監査は P3 として、rename 操作が発生した後に

- どの UI surface が即座に新 title へ追随するか
- どの surface が stale なまま残るか
- `updated_at` / 並び順 / revisions への影響

を実装レベルで確認し、**修正の要否** を判断するためのもの。コード変更は「明確に小さく・well-scoped な
stale 問題がある場合のみ」とし、原則として docs-only で完結させる。

## 2. Rename action の経路

PKC2 には **独立した `RENAME_ENTRY` action は存在しない**。entry.title の mutation 経路は以下のとおり。

| Action | File:Line | Title 変更の起こり方 |
|---|---|---|
| `COMMIT_EDIT` | `src/adapter/state/app-state.ts:2171-2250` | 通常編集 flow のコミット。`updateEntry(container, lid, title, body, ts)` 経由で body とセットで差し替え。revision snapshot を直前に作成。 |
| `QUICK_UPDATE_ENTRY` | `src/adapter/state/app-state.ts:1763-1779` | body 専用更新。action に title フィールドは無く、既存 `entry.title` を preserve（line 1773）。title は動かない。 |
| `CREATE_ENTRY` / `ACCEPT_OFFER` / `RESTORE_ENTRY` / `BRANCH_RESTORE_REVISION` | `addEntry()` / `updateEntry()` 経由 | entry 新規 / 復元時に title をセット。 |
| `CONFIRM_MERGE_IMPORT` ほか import / merge 系 | `addEntry()` / `updateEntry()` 経由 | import で入ってくる entry は新 title で上書きされる。 |

つまり rename の実体は "title フィールドを書き換える `COMMIT_EDIT`" であり、専用 action では
なく **編集 flow の副作用** として title が変わる。

## 3. updated_at / revisions 挙動

`updateEntry()` (`src/adapter/state/container-ops.ts`) の挙動:

- 対象 `entry.updated_at = now` を **必ず** 更新（line 65）
- `container.meta.updated_at = now` を **必ず** 更新（line 72）
- `COMMIT_EDIT` 側で `revisions` に snapshot を push（app-state.ts:2228）

title だけを変更した場合でも body だけを変更した場合でも **同じ動作**。つまり純粋な rename でも:

- ✅ `entry.updated_at` は bump される
- ✅ `container.meta.updated_at` は bump される
- ✅ revision が残る（undo / branch 可能）

この挙動は本監査の時点で **仕様として固定** する。「rename は updated_at を動かさない」は選ばない。
理由:

- Recent Entries Pane v1 の並び替えで "直近触った entry" に rename も含めたい
- revision 履歴で "いつ title を変えたか" を追えるようにしたい
- body / title の 2 系統で bump ポリシーを分岐させると regression 源になる

## 4. Title を表示する UI surface 一覧

全ての surface は **render 時に `entry.title` を直接読む** か、**毎 render 再構築される Map** 経由で
読む。closure で title 文字列をキャプチャしているコードは検出されなかった。

### Main window（render(state, root) 経路）

| Surface | File:Line | 読み取り方 |
|---|---|---|
| detail view header（title row） | renderer.ts:2870 | `title.textContent = entry.title` |
| sidebar tree / flat entry label | renderer.ts:2164 | `title.textContent = entry.title` |
| Breadcrumb ancestors + current | renderer.ts:2923, 2933 | `ancestor.title` / `entry.title` |
| Recent Entries pane | renderer.ts:1648 | `title.textContent = entry.title`（`selectRecentEntries()` が再計算） |
| folder contents panel | renderer.ts:4599 | `link.textContent = child.title` |
| move-to-folder selector | renderer.ts:3084, 3101 | `currentParent.title` / `f.title` |
| backlinks / peer tag chips | renderer.ts:3020, 3052, 3584 | `titleByLid.get(lid)`（renderer.ts:3431-3432 で毎回 Map を build） |
| calendar view todo cell | renderer.ts:2546 | `item.textContent = t.entry.title` |
| kanban view card | renderer.ts:2624 | `title.textContent = item.entry.title` |
| entry-ref autocomplete chip | entry-ref-autocomplete.ts:197 | `cand.title`（Entry を毎回渡す） |
| import / merge conflict line | renderer.ts:4106 | `conflict.imported_title`（immutable snapshot） |
| batch import preview list | renderer.ts:4271 | `entry.title` |
| revision history preview | renderer.ts:3139 | `parsed.title`（JSON snapshot から毎回 parse） |
| storage profile row | renderer.ts:1347 | `row.title` |
| create-context indicator | renderer.ts:484 | `in ${contextFolder.title}:` |
| folder option dropdown | renderer.ts:1893, 3809, 4211 | `f.title` |
| editor `#title-input` 初期値 | renderer.ts:3845 | `titleInput.value = entry.title`（render 時に注入） |

**結論**: main window の全 surface は **即座に fresh**。`dispatcher.onState` → `render()` が
state 変更ごとに走るので、`COMMIT_EDIT` 直後に全 surface が新 title で再描画される。

### Pop-out entry-window（`window.open` の別ウィンドウ）

entry-window は `buildWindowHtml()`（entry-window.ts:854-） が返す **static HTML string** を
子 window に書き込むことで表示する。title は以下の 3 箇所に **焼き付け** られる:

| 位置 | File:Line | 形 |
|---|---|---|
| `<title>` タグ | entry-window.ts:911 | `<title>${escapedTitle} — PKC2</title>` |
| `<h2 id="title-display">` | entry-window.ts:1567 | `${escapedTitle}` |
| script 内 `originalTitle` 変数 | entry-window.ts:1616 | `var originalTitle = ${escapeForScript(entry.title)}` |

さらに edit ↔ view 切替時に child-side で `document.getElementById('title-display').textContent = originalTitle`
(entry-window.ts:2181) を使っているので、**`originalTitle` は child の真実として機能する**。

親 window の state 変化を child に push する wiring は 2 本だけ:

- `wireEntryWindowLiveRefresh`（`entry-window-live-refresh.ts`）→ preview resolver ctx のみ更新
- `wireEntryWindowViewBodyRefresh`（`entry-window-view-body-refresh.ts`）→ view-body HTML のみ更新

**どちらも title は触らない**。entry-window.ts:176 のコメントにも "title sync は separate concern で
本 foundation 外" と明記されている。

## 5. Stale になりうる構造の調査

### 5.1 main window 側 — 問題なし

- `titleByLid` Map（renderer.ts:3431-3432）は毎 render で `for (const e of container.entries) titleByLid.set(e.lid, e.title)`。
  closure に保持されず、render 間で引き継がれない。
- `TreeNode` (`src/features/relation/tree.ts:26-71`) は **Entry オブジェクトへの参照** を保持し、
  title 文字列をコピーしない。`node.entry.title` で render 時に毎回読む。
- `getBreadcrumb()` も **Entry[] を返す** だけで、path の title を別 cache に写さない。
- `selectRecentEntries()` (`src/features/entry-order/recent-entries.ts`) は Entry[] を返すだけ。
- revision snapshot は JSON 文字列として保存され、表示時に `parseRevisionSnapshot()` で都度 parse。
- storage profile 行は毎 render で container から rebuild。

**memoize / 永続 cache / closure capture のいずれも検出されず**。main window は原理的に stale 不可。

### 5.2 pop-out entry-window 側 — stale 有り

`buildWindowHtml()` が open 時点の entry を HTML 文字列に焼き付けて `childDoc.write()` するため、
以下のケースで stale になる:

1. 子 window を open（dblclick で `handleDblClickAction` 経由）
2. 親 window で同じ entry を rename（`COMMIT_EDIT`）
3. 親 window 側は即 refresh される（§4）
4. **子 window の `<title>` / `#title-display` / `originalTitle` は open 時の古い title のまま**

副次効果:

- 子 window の `view ↔ edit` 切替で `title-display.textContent = originalTitle` が走るため、
  edit に入ってから view に戻っても古い title に戻ってしまう
- 子 window 内で独自に edit → save した場合は、save 処理（`window.opener.postMessage` 経由）が
  親の `COMMIT_EDIT` を dispatch するので、親側は新 title、子側は自 save した title、という整合は
  保たれる。**問題が起きるのは「親側で rename、子は開きっぱなし」のパターン**
- 将来 graph view / backlink panel にポップアウト機能が増えた時、同様の焼き付け型 child window が
  増えるなら同じ問題が起きる

## 6. Recent Entries Pane への影響

§3 で確認したとおり rename は `updated_at` を bump するので、

1. 親 window で entry を rename
2. reducer が `updateEntry()` → `entry.updated_at = now`、`container.meta.updated_at = now`
3. `dispatcher.onState` が render を呼ぶ
4. `selectRecentEntries()` が `updated_at desc` で並び替え
5. **rename した entry は Recent pane の先頭に浮上** し、新 title で表示される

この挙動は Recent Entries Pane v1 の "最近アクティブ" 定義と一致している（§recent-entries-pane-v1.md Q1）。
rename だけした場合でも "最近触った entry" として上に出るのが意図どおり。

## 7. 監査結果サマリ

| Category | Status | 備考 |
|---|---|---|
| rename の dispatch 経路 | ✅ 正常 | `COMMIT_EDIT` → `updateEntry()`。専用 `RENAME_ENTRY` は無し。 |
| `entry.updated_at` bump | ✅ 正常 | title のみ変更でも bump される |
| `container.meta.updated_at` bump | ✅ 正常 | 同上 |
| revision snapshot | ✅ 正常 | `COMMIT_EDIT` で push。title 変更の履歴が残る |
| main window detail view | ✅ fresh | `dispatcher.onState` → `render()` で即時反映 |
| main window sidebar tree / flat | ✅ fresh | `entry.title` を毎 render 読む |
| main window breadcrumb | ✅ fresh | `getBreadcrumb()` は Entry 参照を返すのみ |
| main window Recent Entries pane | ✅ fresh | 再ソート + 新 title で描画 |
| main window calendar / kanban | ✅ fresh | `t.entry.title` / `item.entry.title` を毎回読む |
| main window folder contents | ✅ fresh | `child.title` を毎回読む |
| main window backlinks / tag chip | ✅ fresh | `titleByLid` は毎 render rebuild |
| main window import / merge preview | ✅ fresh | immutable snapshot を表示するだけ |
| main window storage profile | ✅ fresh | container から毎回 rebuild |
| edit form `#title-input` | ✅ fresh | render 時に `titleInput.value = entry.title` |
| **pop-out entry-window `<title>`** | ⚠️ stale | open 時に焼き付け。親 rename で古いまま |
| **pop-out entry-window `#title-display`** | ⚠️ stale | 同上。view ↔ edit 切替でも古い `originalTitle` に戻る |
| **pop-out entry-window script `originalTitle` 変数** | ⚠️ stale | 同上。子 window が child-local の真実として保持 |

## 8. 修正要否

### 8.1 main window — **修正不要**

pure reducer + pure renderer 構成が成立している。memoize も closure capture も存在せず、
**現状維持で正しい**。追加のテスト・ガードも不要。

### 8.2 pop-out entry-window — **本監査では修正しない（docs-only）**

`<title>` / `#title-display` / `originalTitle` の stale は **実在する UX 問題** だが、以下の理由から
本 PR では **docs-only で止める**:

1. **発生頻度が低い**: pop-out を開いた状態で親から rename、という操作は日常的ではない
2. **データ整合性は保たれる**: 表示が古いだけで save / conflict resolution は既存 postMessage 経路で健全
3. **fix の設計に追加考慮点がある**:
   - 子 window が edit モードで `#title-input` に未保存の入力を抱えている間に parent から title を
     push すると **"dirty stomp"** が起きうる → view-body-refresh と同様の dirty-agnostic policy を
     child 側で設計し直す必要がある
   - `<title>` と `#title-display` と `originalTitle` で更新タイミングが微妙に異なる（edit ↔ view
     切替で `originalTitle` を触る既存コード line 2181 との協調）
   - 既存の view-body-refresh / preview-refresh の 2 本と対になる 3 本目の wire として導入するなら、
     命名・messaging contract を 3 本一貫に揃えたい
4. **単独 PR として切り出した方が安全**: 新しい postMessage tag / 子 listener / wire module / test
   を入れるので "audit 副産物" として混ぜない方が review しやすい

### 8.3 推奨する follow-up

> **📌 2026-04-21 追補（status）**: 本節で推奨した follow-up は **`entry-window-title-live-refresh-v1.md` として SHIPPED** 済み。ENTRY_WINDOW_TITLE_UPDATE_MSG / `pushTitleUpdate` / `wireEntryWindowTitleRefresh` / child listener の dirty-agnostic policy いずれも設計通り実装され、pop-out entry-window の `<title>` / `#title-display` / `originalTitle` stale は解消済み。以下の記述は当時の設計メモとして保存する。

後続 PR「**Entry-window title live refresh v1**」として切り出す。設計概要:

- `ENTRY_WINDOW_TITLE_UPDATE_MSG = 'pkc-entry-update-title'` を追加
- `pushTitleUpdate(lid, title)` helper（`pushViewBodyUpdate` の mirror）を entry-window.ts に追加
- `wireEntryWindowTitleRefresh(dispatcher)` wire を新規作成し main.ts で配線
  - gate: `prev.container.entries !== next.container.entries` AND 対象 lid の entry identity 変化 AND
    `prev.title !== next.title`（title が実際に動いた時だけ push）
- child 側 message listener で
  - `document.title = newTitle + " — PKC2"`
  - `#title-display.textContent = newTitle`
  - `originalTitle = newTitle`
  - edit モード中は dirty 判定（`#title-input.value !== originalTitle`）で stomp を避けるか、
    `pendingTitle` に stash する（view-body と同じ dirty-agnostic policy）

scope / risk / test 面積の試算: wire + helper + child listener + 単体テスト 3〜4 本 + 統合テスト 1 本。
1 PR で完結する粒度。

## 9. Non-scope（本監査で扱わない）

- pop-out entry-window の title live refresh 実装（§8.3 で次 PR 化を提案）
- rename 専用 action (`RENAME_ENTRY`) の導入 — 現状 `COMMIT_EDIT` 経由で問題ないため
- `updated_at` bump policy の条件分岐化（"title-only 変更は bump しない" 案の却下理由は §3）
- backlinks panel の cache 化（現状 Map rebuild で問題なし）
- browser tab 自体の document.title 調整（embed 環境や未 bundle 環境で別途考慮）

## 10. Related docs

- `recent-entries-pane-v1.md` — rename で bump された `updated_at` が Recent 浮上に直結する
- `breadcrumb-path-trail-v1.md` — breadcrumb 内の ancestor title 表示。本監査で fresh を確認
- `edit-preview-asset-resolution.md` — pop-out entry-window の live refresh 基礎。title refresh は
  この foundation の外と明示されている
- `stale-listener-prevention.md` — dispatcher 購読の teardown 規約。main window は "page lifetime"
  なので問題なし
- `next-feature-prioritization-after-relations-wave.md` — 本監査の発端（P3）
