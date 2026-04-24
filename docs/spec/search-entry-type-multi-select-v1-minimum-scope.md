# FI-09 検索エントリ種別フィルタの複数選択 + TODO/FILE 既定非表示 — v1 Minimum Scope

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は minimum-scope / historical design record として保持。実装の現物は `src/adapter/state/app-state.ts` の archetype filter 系 / `tests/adapter/action-binder-content.test.ts`、ユーザー向け説明は `../manual/09_トラブルシューティングと用語集.md` §種別フィルタ。
Pipeline position: minimum scope

---

## 1. 問題の再定義

### 現状の 2 つの不満

#### 1-A. 単一選択しかできない

サイドバーのアーキタイプフィルタは **1 種類しか同時に選べない**。

```
現状: [All] [Text] [Textlog] [Todo] [Form] [File] [Folder] [Generic] [Opaque]
              ↑ どれか 1 つのみ ON
```

「TEXT と TEXTLOG を両方見たい」「FOLDER と TEXT を同時に絞り込みたい」という自然な組み合わせが実現できない。結果として "All" に戻してから目視で探すか、検索テキストで代用するしかない。

#### 1-B. TODO / FILE ボタンが常時露出していて視覚ノイズになっている

フィルタバーには 8 archetype のボタンが常時並ぶ。日常の検索操作で頻繁に使われるのは **Text / Textlog / Folder** が中心で、**Todo / File（attachment）** はまれにしか選ばない。使用頻度の低いボタンが常時表示されることで、バーが視覚的に重くなっている。

### 既存実装の現在地

| 項目 | 現状 |
|------|------|
| 状態型 | `AppState.archetypeFilter: ArchetypeId \| null` |
| null の意味 | 全表示（フィルタなし） |
| 操作 | `SET_ARCHETYPE_FILTER(archetype)` で 1 種類を選択 |
| クリア | `CLEAR_FILTERS` で null に戻す |
| filter 関数 | `filterByArchetype(entries, archetype \| null)` |
| UI | `ARCHETYPE_FILTER_OPTIONS` から 1 ボタン生成、選択中に `data-pkc-active="true"` |

変更箇所は `app-state.ts`・`renderer.ts`（`renderArchetypeFilter`）・`action-binder.ts`・`features/search/filter.ts` の 4 か所に限定できる。

---

## 2. 対象 surface

- サイドバー内の **アーキタイプフィルタバー**（`data-pkc-region="archetype-filter"`）
- 同バーの各ボタン（`data-pkc-action="set-archetype-filter"` 系）
- サイドバー上部の **× Clear** ボタン（`data-pkc-action="clear-filters"`）
- `AppState.archetypeFilter` とそれに依存するフィルタパイプライン

非対象:
- サイドバーの検索テキスト入力（`searchQuery`）
- タグフィルタ（`tagFilter`）
- ソート設定
- Calendar / Kanban ビューのフィルタ（archetypeFilter は Detail / sidebar にのみ適用）

---

## 3. v1 スコープ

### 含む

#### 3-1. フィルタボタンの複数選択化

アーキタイプボタンを **独立 toggle** にする。各ボタンを ON / OFF できて、複数を同時に ON にできる。

- **"All" ボタン**: 選択中の全 archetype を解除して「全表示」に戻す専用ボタン
- **個別ボタン**: 押すたびに ON / OFF を切り替える。複数同時 ON 可
- "All" と個別ボタンは排他でなく、**「選択なし = All と等価」**という規則で整合させる

#### 3-2. フィルタバーの 2 段階 tier 構成

ボタンを **Primary tier**（常時表示）と **Secondary tier**（既定折りたたみ）に分ける。

| Tier | archetype | 理由 |
|------|-----------|------|
| **Primary** | All / Text / Textlog / Folder | 日常的な絞り込みで頻用 |
| **Secondary** | Todo / File / Form / Generic / Opaque | 使用頻度が低く、日常的にはノイズ |

Secondary tier は「＋ More」のような展開トリガーで表示 / 非表示を切り替える。展開状態はセッション内で維持。

#### 3-3. 0 件選択の semantics（"All" と等価）

全 archetype ボタンが OFF の状態 = 選択なし = **全エントリを表示（フィルタなし）**。  
0 件選択が「0 件表示」になることはない。この規則は behavior contract で逐条固定する。

#### 3-4. 状態型の変更

`archetypeFilter: ArchetypeId | null` → `archetypeFilter: ReadonlySet<ArchetypeId>`  
（空 Set = 全表示。behavior contract で型宣言を確定する）

### 含まない（意図的に v1 外）

- 選択状態の **localStorage への永続化**（セッション限りで十分。将来の v1.x）
- **保存済み検索 / フィルタ preset**
- **AND / OR を切り替える高度な組み合わせロジック**（AND を前提。OR は v1 不要）
- **検索 UI 全体の redesign**（テキスト検索 / ソート / タグフィルタには手を入れない）
- **archetype 追加時の tier 自動割り当て仕様**（手動で ARCHETYPE_FILTER_OPTIONS を更新する既存方式を維持）

---

## 4. 最小修正戦略

### 4-1. state 変更

```typescript
// before
archetypeFilter: ArchetypeId | null;  // null = all

// after
archetypeFilter: ReadonlySet<ArchetypeId>;  // empty Set = all
```

初期値は空 Set（= 全表示）とし、既存の「フィルタなし = 全表示」の意味を維持する。

### 4-2. filter 関数の拡張

```typescript
// 既存（維持）
filterByArchetype(entries, archetype | null): Entry[]

// 新規追加
filterByArchetypes(entries, Set<ArchetypeId>): Entry[]
// 空 Set → entries をそのまま返す
// 非空 Set → Set に含まれる archetype のみ通す
```

`applyFilters` を `filterByArchetypes` 呼び出しに切り替える。  
`filterByArchetype`（旧）はそのまま残す（呼び出し元がなくなれば削除は別タスク）。

### 4-3. アクション変更

```typescript
// before
SET_ARCHETYPE_FILTER(archetype: ArchetypeId | null)

// after
TOGGLE_ARCHETYPE_FILTER(archetype: ArchetypeId)   // 1 つを ON/OFF
CLEAR_ARCHETYPE_FILTER()                           // 全解除（= All）
```

`CLEAR_FILTERS`（テキスト + archetype の両方を消す複合アクション）は維持する。

### 4-4. renderer 変更

`renderArchetypeFilter(current: ArchetypeId | null)` を  
`renderArchetypeFilter(current: ReadonlySet<ArchetypeId>)` に変更。  
Primary / Secondary の 2 グループを生成し、Secondary は展開状態を `data-pkc-*` attribute でトグルする。

### 4-5. 変更規模の見積もり

| ファイル | 変更内容 |
|----------|---------|
| `src/features/search/filter.ts` | `filterByArchetypes` 追加（純粋関数、小） |
| `src/adapter/state/app-state.ts` | 型変更・reducer 更新（中） |
| `src/adapter/ui/renderer.ts` | `renderArchetypeFilter` 更新（中） |
| `src/adapter/ui/action-binder.ts` | アクションハンドラ変更（小） |

合計: 中規模。新設 DOM 領域なし。純粋関数のテストは容易。

---

## 5. 不変条件

### I-FI09-1 — 空選択は全表示と等価

`archetypeFilter` が空 Set のとき、サイドバーのエントリ一覧は全エントリを表示する（0 件にならない）。

### I-FI09-2 — 単一選択は既存動作と等価

1 つの archetype だけ選んだ場合、旧来の `archetypeFilter = archetype` と完全に同じ結果を返す。

### I-FI09-3 — All ボタンは強制全解除

"All" ボタンを押すと、個別選択が何件あっても全解除されて空 Set になる。"All" を OFF にする操作はない（"All" = 全解除のトリガー専用）。

### I-FI09-4 — silent filter reset 不可

ユーザーが設定したフィルタは、ページをリロードした場合を除き、ユーザー操作（clear-filters / All ボタン）なしにリセットされない。ビュー切り替えでも維持される。

### I-FI09-5 — Secondary tier 展開状態はセッション内で維持

「＋ More」で Secondary tier を展開した後、他の操作をしても折りたたまれない（再レンダリング時に展開状態を保持する）。セッションを越えた永続化は v1 対象外。

### I-FI09-6 — テキスト検索との AND 結合は不変

archetype フィルタと `searchQuery` テキストフィルタは常に AND で結合される。この結合ロジックは変更しない。

---

## 6. 非対象

以下は v1 スコープ外（意図的）。

- **フィルタ選択の永続化**（localStorage / IDB への保存）
- **保存済みフィルタプリセット**（名前を付けて保存する UI）
- **OR モード**（選択中の archetype を OR で OR するかどうか。v1 は常に OR として扱う — 複数選択の直感に合う）

> 補足: 「AND モード（選んだ archetype すべてに属するエントリ」は 1 エントリが複数 archetype を持てない設計上ありえない。したがって複数選択の結合は常に「いずれかに該当する」= OR が正しい。behavior contract で明示する。

- **Calendar / Kanban への archetype フィルタ適用**（これらのビューは独自のフィルタ軸を持つ）
- **"None" / 0 件表示モード**（empty = all の規則を崩す選択肢）
- **テキスト検索 UI の変更**
- **タグフィルタとのブール結合 UI**

---

## 7. 推奨 pipeline

1. **minimum scope**（本文書）— 問題・対象 surface・2 tier 構成・状態型変更の確定
2. **behavior contract** — 空選択の semantics 逐条、Secondary tier 展開の state machine、Clear ボタンの正確な定義、TOGGLE_ARCHETYPE_FILTER の reducer contract
3. **implementation** — `filterByArchetypes` pure helper → reducer → renderer → action-binder
4. **audit** — A-4 sub-location 検索と S-18 sub-location 表示の regression 確認、clear-filters の regression 確認
5. **manual** — 05_日常操作.md のフィルタ節更新

---

## 8. 例

### TEXT + FOLDER で絞り込む

```
操作: [Text] ボタン ON → [Folder] ボタンも ON
結果: archetype が text OR folder のエントリだけ表示
```

### Secondary tier から Todo を選ぶ

```
操作: [+ More] で Secondary tier を展開 → [Todo] ボタン ON
結果: Todo エントリが表示される。Text などがすでに ON なら Text + Todo の OR
```

### 全解除（= All に戻す）

```
操作: [All] ボタン押下
結果: archetypeFilter = 空 Set → 全エントリ表示。テキスト検索は維持
```

### 0 件選択状態（全解除直後）

```
archetypeFilter = empty Set
表示: 全エントリ（= フィルタなし。"All" が active 扱いになる）
```

### TODO / FILE を探したいとき

```
操作: [+ More] → [Todo] または [File] を ON
結果: Todo / attachment エントリが対象に追加される
デフォルトでは Secondary tier は折りたたまれているため、開くまで目に入らない
```

---

## References

- Issue ledger: `docs/planning/file-issues/09_search-entry-type-filter-multi-select.md`
- 現行 filter 実装: `src/features/search/filter.ts`
- 現行 state: `src/adapter/state/app-state.ts` — `archetypeFilter: ArchetypeId | null`
- 現行 renderer: `src/adapter/ui/renderer.ts` — `renderArchetypeFilter` / `ARCHETYPE_FILTER_OPTIONS`
