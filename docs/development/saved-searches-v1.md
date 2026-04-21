# Saved Searches v1

**Status**: design + implementation — 2026-04-21.
**Scope**: よく使う検索 / filter / sort 条件の組み合わせを **名前付きで container に保存** し、
sidebar 内のワンクリックで復元できるようにする。新規 action 3 本 + ContainerMeta への 1 optional field
追加のみの最小 v1。
**Baseline**: `next-feature-prioritization-after-relations-wave.md` の P4。

---

## 1. 保存対象の仕様（Q1）

**v1 で保存する state field は以下 6 つ固定**:

| AppState field | 型 | 保存時の表現 |
|---|---|---|
| `searchQuery` | `string` | `search_query: string` |
| `archetypeFilter` | `ReadonlySet<ArchetypeId>` | `archetype_filter: ArchetypeId[]`（JSON 化のため array） |
| `tagFilter` | `string \| null` | `tag_filter: string \| null` |
| `sortKey` | `SortKey` | `sort_key: SortKey` |
| `sortDirection` | `SortDirection` | `sort_direction: SortDirection` |
| `showArchived` | `boolean` | `show_archived: boolean` |

**保存しないもの**:

- `viewMode`（detail / calendar / kanban）— 検索とは直交する navigation 軸。saved search 復元時に
  view mode まで切り替えるのは UX 上意外性が高い
- `selectedLid` / `multiSelectedLids` — 選択状態は検索条件ではない
- `archetypeFilterExpanded` — 単なる UI 展開 flag
- `readonly` / `lightSource` / `embedded` — ロード時の artifact 特性であって query 条件ではない
- 今後追加される date range 等のフィルタは v2 以降で順次追加（backward compat のため
  optional field として v2 以降で足し、v1 saved search は新 field が undefined でも apply できる
  設計とする）

**復元時の挙動**:

- 6 fields を一度の reduce で一括上書きする
- `archetype_filter: []` は empty Set に戻る（現状 "全 archetype 表示" と同義）
- 該当する `tag_filter` の lid が現在の container に存在しない場合も v1 では **そのまま適用**
  （UI 側で "no matches" が自然に出る）。silently strip はしない — saved search は "query の意図" を
  保存するものであって、結果の valid 性は container 側の責務

## 2. 保存先の仕様（Q2）

**`container.meta.saved_searches?: SavedSearch[]`**（additive optional field）。

理由:

- runtime-only だと reload / export-import / 別デバイス共有で状態が消える。PKC2 は "single HTML
  で持ち運べる personal knowledge container" が売りなので、"よく使う検索" も container に埋め込む
  のが一貫している
- `container.meta.entry_order`（C-2 v1, 2026-04-17）と同じ additive optional field のパターンで
  前例あり。schema_version は bump しない（additive policy per `src/core/model/container.ts:23-33`）
- import / merge / export の全 round-trip で既に optional meta field は透過的に保存されることを
  `importer.ts:217-254`, `merge-planner.ts:216` 付近で確認済
- IDB persistence は `container.meta` を as-is で保存するので追加コードなし

`SavedSearch` shape（`src/core/model/saved-search.ts` に export）:

```ts
export interface SavedSearch {
  id: string;               // 一意 ID（短い random 文字列）
  name: string;             // user-provided label（非空、trim 済み、最大 80 chars）
  created_at: string;       // ISO 8601
  updated_at: string;       // ISO 8601（v1 では常に created_at と同値、rename 実装時に動き出す）
  search_query: string;
  archetype_filter: ArchetypeId[];
  tag_filter: string | null;
  sort_key: SortKey;
  sort_direction: SortDirection;
  show_archived: boolean;
}
```

`container.meta.saved_searches` を読む時の **defensive unwrap**:

- `undefined` → 空配列として扱う（legacy container 対応）
- 配列内の壊れた要素（id が無い、型が合わない）は renderer / reducer で skip する
  （silent corruption より visible skip が安全）

## 3. 件数制限（Q3）

**Hard cap: 20 件**。超過時の SAVE_SEARCH action は blocked（reducer が reject し、state 不変）。

理由:

- sidebar の縦占有を抑える
- 20 件を超える "よく使う検索" は運用として破綻気味なので、v1 ではその運用を許容しない
- 必要なら v2 でページング / アーカイブ / folder 化を検討

## 4. 名前（Q4）

**user-provided**。`window.prompt()` で最小構成。

- 入力値は `trim()` → 空文字列なら SAVE_SEARCH を dispatch しない（UI 側で短絡）
- 最大長 80 chars（超えたら truncate、警告は出さない）
- **重複名は許容**: uniqueness を強制すると save 時に UX フリクションが増える。同名の saved search が
  複数あっても id が異なるので apply / delete は区別できる。重複の整理は user 判断に委ねる
- v1 では rename 機能は提供しない（delete + save し直し）。rename は v2 のスコープ

## 5. UI 配置と操作フロー（Q5 / Q6）

### 5.1 Save button

search row（`pkc-search-row`）内、search input の右側、clear-filters button の **直前**に追加する。
data attrs: `data-pkc-action="save-search"`.

- 常時表示。default state（何も filter していない）でも保存可能（UX simplicity を優先）
- click → `window.prompt('Save current search as:')` でラベルを受け取る
- 空 / キャンセルなら何もしない
- 非空なら `SAVE_SEARCH` を dispatch

### 5.2 Saved searches pane

`<details data-pkc-region="saved-searches" open>` を sidebar 内に追加。
placement: **sort-controls の直後 / recent-entries pane の直前**（検索条件と並べる位置）。

- `<summary>Saved (n)</summary>`
- `<ul>` 内に `<li class="pkc-saved-search-item">` で 1 件ずつ描画
- 各 `<li>` は `data-pkc-action="apply-saved-search"` + `data-pkc-saved-id="<id>"` を持つ clickable
- delete × button を各 item 末尾に。`data-pkc-action="delete-saved-search"` + `data-pkc-saved-id="<id>"`
  click は `stopPropagation` で parent の apply をトリガしない
- 0 件の時は `<details>` 自体を描画しない（sidebar を不必要に長くしない）

### 5.3 操作フロー

- **Create**: Save button click → prompt → SAVE_SEARCH action → reducer が `SavedSearch` を作成して
  `container.meta.saved_searches` に push、`container.meta.updated_at` を bump
- **Apply**: item click → APPLY_SAVED_SEARCH action → reducer が 6 fields を state に適用。
  container 側は **変更しない**（updated_at も bump しない — apply は read 系操作）
- **Delete**: × button click → DELETE_SAVED_SEARCH action → reducer が該当 id を filter で除く、
  `container.meta.updated_at` を bump

delete 時の確認は v1 では **出さない**（× が小さすぎて誤 click する UX でもないため）。
v2 で誤操作が多ければ undo / confirm を検討。

## 6. Actions / reducer / events

新規 `UserAction` 3 本を `src/core/action/user-action.ts` に追加:

```ts
| { type: 'SAVE_SEARCH'; name: string }
| { type: 'APPLY_SAVED_SEARCH'; id: string }
| { type: 'DELETE_SAVED_SEARCH'; id: string }
```

reducer 側（`src/adapter/state/app-state.ts`）:

- **`SAVE_SEARCH`**:
  - container 不在 / readonly なら blocked
  - name を trim、空なら blocked
  - 80 chars で truncate
  - 現状の saved_searches が 20 以上なら blocked（cap）
  - `createSavedSearch(name, state)` で `SavedSearch` を作り meta に append、`meta.updated_at` を bump
  - DomainEvent 発行なし（v1 は silent）
- **`APPLY_SAVED_SEARCH`**:
  - container 不在なら blocked
  - 該当 id が見つからなければ blocked
  - saved search から 6 fields を state に適用。archetype_filter は `new Set(...)` で Set 化
  - container / revision は変更しない（read-only 系）
- **`DELETE_SAVED_SEARCH`**:
  - container 不在 / readonly なら blocked
  - 該当 id を filter で除去、`meta.updated_at` を bump（saved searches が 0 件になっても OK）

events は v1 では発行しない（既存の `SET_SEARCH_QUERY` 等の UI 系 action と同格扱い）。
将来の telemetry / audit log で必要になった時点で追加する。

## 7. 既存機能との相互作用

- **readonly モード**: Save button / delete button は **非表示**（container を mutate するため）。
  apply は有効（state のみ変更）。Light export でも同様。
- **import preview**: preview 中は saved-searches pane を描画しない（preview container と現 container の
  saved_searches が混ざる混乱を避ける）。
- **CLEAR_FILTERS**: 既存 action。saved search apply 後の状態も CLEAR_FILTERS で普通にクリアできる。
  CLEAR_FILTERS は saved_searches 配列自体には触らない。
- **manual sort 時の entry_order**: sort_key を manual に復元したケースで entry_order がまだ空なら、
  既存 `SET_SORT` reducer と同じく snapshot roll-in を行う — ここは saved search 経路を
  **SET_SORT と別にせず**、APPLY_SAVED_SEARCH 内で `SET_SORT` と同じ内部ヘルパを呼ぶ or 複製する。
  v1 では **複製で済ます**（premature abstraction 回避）。
- **Recent Entries Pane v1 / Breadcrumb v1**: いずれも saved search とは独立。apply で selectedLid が
  変わらないので、breadcrumb 表示は据え置き。

## 8. テスト方針

1. **Pure helper** (`tests/features/search/saved-searches.test.ts`)
   - `createSavedSearch` が 6 fields を正しく capture
   - name は trim される / 80 chars で truncate
   - archetype_filter は配列で格納される
2. **Reducer** (`tests/adapter/saved-searches-reducer.test.ts`)
   - SAVE_SEARCH が `meta.saved_searches` に append、`meta.updated_at` を bump
   - SAVE_SEARCH: 20 件 cap を超えると blocked
   - SAVE_SEARCH: readonly で blocked
   - APPLY_SAVED_SEARCH が 6 fields を state に反映
   - APPLY_SAVED_SEARCH: 未知 id で blocked
   - APPLY_SAVED_SEARCH: manual sort への切替で entry_order snapshot roll-in が走る
   - DELETE_SAVED_SEARCH が該当 id を除く、他は残す
3. **Renderer** (`tests/adapter/renderer.test.ts`)
   - Save button が search row 内に表示される（readonly 時は非表示）
   - saved-searches pane: 0 件で非表示、1+ 件で描画、name と delete button を持つ
   - import preview 中は非表示
4. **E2E action-binder** (`tests/adapter/saved-searches.test.ts`)
   - save-search click → window.prompt モック → SAVE_SEARCH dispatch
   - apply-saved-search click → APPLY_SAVED_SEARCH dispatch
   - delete-saved-search click → DELETE_SAVED_SEARCH dispatch + apply click がトリガされない（stopPropagation）

## 9. Non-scope（v1 で扱わない）

- rename（delete + save で代替）
- pin / reorder
- 自動 history / 最近の検索
- saved search の diff / export
- 日付範囲 / 全文検索 / 演算子（AND / OR / NOT）
- keyboard shortcut（v1 は click UI のみ）
- undo / confirm（delete 時の確認 dialog）
- 検索結果 preview（apply 前に該当件数を見せる）
- embed / transport 層経由での saved search push
- telemetry / recommendation / history mining

## 10. Related docs

- `recent-entries-pane-v1.md` — sidebar 内 `<details>` ベース pane の先行例。配置・DOM 構造を踏襲
- `entry-order-move-c-2-v1.md` / `sort.ts` — manual sort + entry_order snapshot roll-in の前例
  （APPLY_SAVED_SEARCH で sort_key=manual 復元時に reuse する）
- `next-feature-prioritization-after-relations-wave.md` — 本 v1 の発端（P4）
- `container-schema.md` — ContainerMeta additive field 方針の参照
