# FI-09 検索エントリ種別フィルタの複数選択 + TODO/FILE 既定非表示 — v1 Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は behavior contract / historical design record として保持。実装の現物は `src/adapter/state/app-state.ts` の archetype filter 系 / `tests/adapter/action-binder-content.test.ts`。
Pipeline position: behavior contract
Predecessor: `docs/spec/search-entry-type-multi-select-v1-minimum-scope.md`

---

## 0. 位置づけ

本文書は FI-09 の実装者が迷わず進めるための確定仕様書。minimum scope で「何をするか」を定義したのに対し、本文書は「state の形・reducer の振る舞い・UI の DOM contract・filter semantics・error path」を逐条で固定する。

---

## 1. Scope

### 対象

| 対象 | 変更内容 |
|------|---------|
| `AppState.archetypeFilter` | `ArchetypeId \| null` → `ReadonlySet<ArchetypeId>` |
| `AppState.archetypeFilterExpanded` | 新規追加: `boolean`（Secondary tier 展開状態） |
| `UserAction` 型 | `TOGGLE_ARCHETYPE_FILTER` 新規追加、`TOGGLE_ARCHETYPE_FILTER_EXPANDED` 新規追加 |
| `SET_ARCHETYPE_FILTER` | backwards compat として維持。reducer の実体を変更 |
| `CLEAR_FILTERS` | `archetypeFilter` を `null` → 空 Set に変更（他は現行と同じ） |
| `filterByArchetypes` | `src/features/search/filter.ts` に純粋関数として追加 |
| `applyFilters` | 引数の型を更新（archetypeFilter の型変更に追随） |
| `renderArchetypeFilter` | Primary / Secondary 2 tier 生成に更新 |
| `hasActiveFilter` 判定 | `archetypeFilter !== null` → `archetypeFilter.size > 0` |

### 非対象

- `searchQuery` / `tagFilter` / `sortKey` / `sortDirection`（変更なし）
- Calendar / Kanban ビューのフィルタ（archetypeFilter は sidebar にのみ適用）
- フィルタ選択の localStorage 永続化
- filter preset / 保存済み検索

---

## 2. State contract（data contract）

### 2-1. AppState 型変更

```typescript
// before
archetypeFilter: ArchetypeId | null;   // null = show all

// after
archetypeFilter: ReadonlySet<ArchetypeId>;  // empty Set = show all
archetypeFilterExpanded: boolean;            // Secondary tier visible
```

### 2-2. 初期値

```typescript
archetypeFilter: new Set<ArchetypeId>(),  // 全表示（フィルタなし）
archetypeFilterExpanded: false,           // Secondary tier 既定折りたたみ
```

### 2-3. 空集合の意味

`archetypeFilter.size === 0` ならエントリを archetype でフィルタしない（全エントリを通す）。  
これは旧来の `archetypeFilter === null` と等価で、初期状態および "All" 押下後の状態。  
**空集合が「0 件表示」を意味することはない**（I-FI09-1）。

### 2-4. 非空集合の意味

`archetypeFilter = {text, folder}` のとき、`archetype === 'text' || archetype === 'folder'` のエントリのみを通す。複数要素の結合は **OR**（Union）。エントリは 1 つの archetype のみ持つため AND は意味をなさない。

### 2-5. CLEAR_FILTERS 後の状態

```typescript
// CLEAR_FILTERS reducer の変更部分
searchQuery: '',
archetypeFilter: new Set<ArchetypeId>(),   // ← null から変更
tagFilter: null,
// archetypeFilterExpanded: UNCHANGED (展開中なら展開を維持)
```

### 2-6. Tier 定義（実装の single source of truth）

```typescript
const ARCHETYPE_FILTER_PRIMARY: readonly ArchetypeId[] = ['text', 'textlog', 'folder'];
const ARCHETYPE_FILTER_SECONDARY: readonly ArchetypeId[] = ['todo', 'attachment', 'form', 'generic', 'opaque'];
```

Primary には "All" ボタンも含む（これは `ArchetypeId` ではなく全解除のトリガー）。

---

## 3. Filter semantics

### 3-1. `filterByArchetypes`（新規純粋関数）

```typescript
// src/features/search/filter.ts に追加
function filterByArchetypes(
  entries: Entry[],
  filter: ReadonlySet<ArchetypeId>,
): Entry[] {
  if (filter.size === 0) return entries;  // empty = pass-through
  return entries.filter((e) => filter.has(e.archetype));
}
```

### 3-2. `applyFilters` の型更新

```typescript
// before
function applyFilters(entries: Entry[], query: string, archetype: ArchetypeId | null): Entry[]

// after
function applyFilters(entries: Entry[], query: string, filter: ReadonlySet<ArchetypeId>): Entry[]
```

内部: `filterEntries(entries, query)` → `filterByArchetypes(result, filter)` の順で適用。  
text query と archetype filter は **AND** 結合のまま変更なし。

### 3-3. `filterByArchetype`（旧関数）の扱い

`filterByArchetype(entries, archetype: ArchetypeId | null)` はそのまま維持する。  
`applyFilters` は呼び出さなくなるが、外部から参照している可能性を考慮して即削除しない。

### 3-4. `hasActiveFilter` の更新

```typescript
// before
state.archetypeFilter !== null

// after
state.archetypeFilter.size > 0
```

`hasActiveFilter` は `app-state.ts` と `renderer.ts` の 2 箇所にある。両方を更新する。

---

## 4. Action contract

### 4-1. 新規アクション: `TOGGLE_ARCHETYPE_FILTER`

```typescript
{ type: 'TOGGLE_ARCHETYPE_FILTER'; archetype: ArchetypeId }
```

**Reducer**:

```typescript
case 'TOGGLE_ARCHETYPE_FILTER': {
  const next = new Set(state.archetypeFilter);
  if (next.has(action.archetype)) {
    next.delete(action.archetype);
  } else {
    next.add(action.archetype);
  }
  return { state: { ...state, archetypeFilter: next }, events: [] };
}
```

- 結果の Set が空になることを許す（全解除 → 全表示 = I-FI09-1）
- 未知の archetype（型外の文字列）を渡しても追加してよい（filter 関数で単に 0 件になる）

### 4-2. 新規アクション: `TOGGLE_ARCHETYPE_FILTER_EXPANDED`

```typescript
{ type: 'TOGGLE_ARCHETYPE_FILTER_EXPANDED' }
```

**Reducer**:

```typescript
case 'TOGGLE_ARCHETYPE_FILTER_EXPANDED': {
  return { state: { ...state, archetypeFilterExpanded: !state.archetypeFilterExpanded }, events: [] };
}
```

### 4-3. 既存アクション: `SET_ARCHETYPE_FILTER`（backwards compat）

シグネチャは変更しない。Reducer の実体を更新する。

```typescript
// before: { ...state, archetypeFilter: action.archetype }  // ArchetypeId | null

// after:
case 'SET_ARCHETYPE_FILTER': {
  const next = action.archetype === null
    ? new Set<ArchetypeId>()
    : new Set([action.archetype]);
  return { state: { ...state, archetypeFilter: next }, events: [] };
}
```

新 UI は `TOGGLE_ARCHETYPE_FILTER` を使い、`SET_ARCHETYPE_FILTER` はディスパッチしない。  
既存テストで `SET_ARCHETYPE_FILTER` を使っているものはそのまま通る（reducer の意味が null → 空 Set、単一 → 1 要素 Set に変わるだけ）。

### 4-4. 既存アクション: `CLEAR_FILTERS`

```typescript
case 'CLEAR_FILTERS': {
  const next: AppState = {
    ...state,
    searchQuery: '',
    archetypeFilter: new Set<ArchetypeId>(),  // ← 変更点
    tagFilter: null,
    // archetypeFilterExpanded は UNCHANGED
  };
  return { state: next, events: [] };
}
```

### 4-5. アクションと UI 操作のマッピング

| ユーザー操作 | ディスパッチされるアクション |
|------------|--------------------------|
| "All" ボタン押下 | `SET_ARCHETYPE_FILTER(null)` → 空 Set |
| Primary の個別ボタン（例: Text）押下 | `TOGGLE_ARCHETYPE_FILTER('text')` |
| Secondary の個別ボタン押下 | `TOGGLE_ARCHETYPE_FILTER('todo')` など |
| "▾ More" / "▴ Less" ボタン押下 | `TOGGLE_ARCHETYPE_FILTER_EXPANDED` |
| × Clear ボタン押下 | `CLEAR_FILTERS` |

---

## 5. UI contract（DOM selectors）

### 5-1. フィルタバー全体

```
data-pkc-region="archetype-filter"
```

### 5-2. "All" ボタン

```
data-pkc-action="set-archetype-filter"
data-pkc-archetype=""  (空文字 = null の意味)
data-pkc-active="true" when archetypeFilter.size === 0
```

### 5-3. 個別 archetype ボタン（Primary / Secondary 共通）

```
data-pkc-action="toggle-archetype-filter"
data-pkc-archetype="{archetype id}"      例: data-pkc-archetype="text"
data-pkc-active="true"  when archetype ∈ state.archetypeFilter
```

### 5-4. Tier グループ

```
data-pkc-filter-group="primary"    // 常時表示
data-pkc-filter-group="secondary"  // 展開状態で切替
```

Secondary グループには展開状態を反映:

```
data-pkc-visible="true"   when archetypeFilterExpanded === true
data-pkc-visible="false"  when archetypeFilterExpanded === false
```

CSS は `[data-pkc-visible="false"] { display: none; }` などで制御する。

### 5-5. 展開 / 折りたたみトリガー

```
data-pkc-action="toggle-archetype-filter-expanded"
```

ラベルはレンダラーが状態に応じて切り替える:

```
archetypeFilterExpanded === false → "▾ More"
archetypeFilterExpanded === true  → "▴ Less"
```

### 5-6. × Clear ボタン表示条件

```typescript
// before: state.searchQuery !== '' || state.archetypeFilter !== null
// after:
if (state.searchQuery !== '' || state.archetypeFilter.size > 0) { /* show clear button */ }
```

tagFilter による Clear ボタン表示は既存動作を変更しない。

---

## 6. Invariants

### I-FI09-1 — 空集合は全表示と等価

`archetypeFilter.size === 0` のとき `filterByArchetypes` は全エントリをそのまま返す。  
UI では "All" ボタンが `data-pkc-active="true"` になる。

### I-FI09-2 — 単一選択は旧来と等価

`archetypeFilter = new Set(['text'])` のとき、旧来の `archetypeFilter === 'text'` と完全に同じエントリセットを返す。

### I-FI09-3 — 複数選択は OR

`archetypeFilter = new Set(['text', 'folder'])` のとき、`archetype === 'text' || archetype === 'folder'` のエントリを返す。AND 結合は発生しない。

### I-FI09-4 — "All" ボタン押下は常に全解除

`SET_ARCHETYPE_FILTER(null)` で `archetypeFilter` を無条件に空 Set にする。個別選択が何件あっても消える。

### I-FI09-5 — silent filter reset 不可

`TOGGLE_ARCHETYPE_FILTER_EXPANDED` / ビュー切替 / `SET_VIEW_MODE` / `SELECT_ENTRY` など、フィルタをリセットする意図のないアクションで `archetypeFilter` は変化しない。

### I-FI09-6 — text query との AND 結合は不変

`applyFilters` の結合順: `filterEntries`（text）→ `filterByArchetypes`（archetype）は変更しない。  
どちらか一方が全通過（query = '' / filter = empty Set）の場合も、結合 semantics は同じ。

### I-FI09-7 — archetypeFilterExpanded は CLEAR_FILTERS で変化しない

`CLEAR_FILTERS` は検索・archetype・tag フィルタをリセットするが、Secondary tier の展開状態は維持する。

### I-FI09-8 — 後方互換性

`SET_ARCHETYPE_FILTER(archetype | null)` を dispatch したテスト・コードは、reducer の意味が変わっても同じ結果エントリを得る（null → 全表示、specific → そのタイプのみ）。

---

## 7. Gate 条件 / error path

| 状況 | 挙動 |
|------|------|
| `TOGGLE_ARCHETYPE_FILTER` で既に Set 内の archetype を再 toggle | Set から除去（off → on → off）。空 Set になれば全表示 |
| `TOGGLE_ARCHETYPE_FILTER` で空 Set に unknown archetype を追加 | 追加する。`filterByArchetypes` でそのタイプが 0 件なら空リストになるが、それは正常動作 |
| `archetypeFilter` が空 Set かつ `searchQuery` も空 | 全エントリを表示（フィルタなし）。× Clear ボタンは非表示 |
| `archetypeFilter.size > 0` で Container が null | `entries = []` → `filterByArchetypes([], filter) = []`（変化なし） |
| Secondary tier を展開した状態で `CLEAR_FILTERS` | `archetypeFilter` は空 Set になるが `archetypeFilterExpanded` は変化しない（Secondary tier は展開中のまま） |
| `SET_ARCHETYPE_FILTER(null)` のバックポート | reducer が `new Set()` を返す。旧来の null と同じ全表示になる |
| Secondary 内の archetype を ON にしたまま Secondary を閉じる | `archetypeFilter` に残り続ける。表示はフィルタが効いた状態のまま。× Clear を押すまで維持 |

---

## 8. Testability

### Pure unit（`filterByArchetypes` 単独テスト）

| # | テスト | 検証内容 |
|---|--------|---------|
| 1 | 空 Set | 全エントリが返る |
| 2 | `{text}` | text エントリのみ |
| 3 | `{text, textlog}` | text と textlog の OR |
| 4 | `{attachment}` | attachment エントリのみ |
| 5 | 存在しない archetype のみの Set | 0 件 |

### Reducer unit（`AppState` reducer テスト）

| # | テスト | 検証内容 |
|---|--------|---------|
| 6 | `TOGGLE_ARCHETYPE_FILTER('text')` on empty Set | `{text}` になる |
| 7 | `TOGGLE_ARCHETYPE_FILTER('text')` on `{text}` | 空 Set になる |
| 8 | `TOGGLE_ARCHETYPE_FILTER('text')` on `{text, textlog}` | `{textlog}` になる |
| 9 | `CLEAR_FILTERS` | searchQuery = '', archetypeFilter = empty, tagFilter = null, archetypeFilterExpanded 不変 |
| 10 | `SET_ARCHETYPE_FILTER(null)` | archetypeFilter = empty Set（後方互換） |
| 11 | `SET_ARCHETYPE_FILTER('text')` | archetypeFilter = `{text}`（後方互換） |
| 12 | `TOGGLE_ARCHETYPE_FILTER_EXPANDED` from false | archetypeFilterExpanded = true |

### Integration（renderer + DOM）

| # | テスト | 検証内容 |
|---|--------|---------|
| 13 | archetypeFilter = empty Set | "All" ボタンが `data-pkc-active="true"` |
| 14 | archetypeFilter = `{text}` | "Text" ボタンが `data-pkc-active="true"`、"All" は inactive |
| 15 | archetypeFilterExpanded = false | secondary group が `data-pkc-visible="false"` |
| 16 | archetypeFilterExpanded = true | secondary group が `data-pkc-visible="true"` |
| 17 | archetypeFilter = empty かつ searchQuery = '' | × Clear ボタンが非表示 |
| 18 | archetypeFilter = `{text}` | × Clear ボタンが表示 |

---

## 9. Non-goal / v1.x 余地

- **フィルタ選択の永続化**（localStorage / IDB）— セッション限り。v1.x で追加可能
- **件数バッジ**（各 archetype ボタンに一致件数 N を表示）— v1.x
- **キーボードショートカット**（フィルタを Alt+1...9 などで選ぶ）— v1.x
- **保存済みフィルタプリセット** — v1.x 以降
- **OR / AND 切り替えモード** — 1 エントリ 1 archetype の設計上不要
- **"None" モード（0 件強制表示）** — 採用しない（空集合 = 全表示で固定）

---

## References

- Minimum scope: `docs/spec/search-entry-type-multi-select-v1-minimum-scope.md`
- 現行 filter: `src/features/search/filter.ts`
- 現行 state: `src/adapter/state/app-state.ts` — `archetypeFilter`, `hasActiveFilter`, `applyFilters`
- 現行 action 型: `src/core/action/user-action.ts` — `SET_ARCHETYPE_FILTER`, `CLEAR_FILTERS`
- 現行 renderer: `src/adapter/ui/renderer.ts` — `renderArchetypeFilter`, `ARCHETYPE_FILTER_OPTIONS`
