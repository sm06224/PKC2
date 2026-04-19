# Dead Path Cleanup Inventory 05 — Round 5 (action-binder + transport + todo/calendar/kanban + search + image-optimize)

## スコープ

inventory round 5。round 1-4 でカバーしていない残り adapter/features 領域を 4 トラック並列で棚卸し。1 文書にまとめるが調査は分割して進めた (round 4 と同じ方式)。

| Track | 範囲 | ファイル | 行数 |
|-------|------|---------|------|
| A | `src/adapter/ui/action-binder.ts` 単独 | 1 | 5131 |
| B | `src/adapter/transport/` | 7 | 753 |
| C | `src/features/todo,calendar,kanban` | 3 | 201 |
| D | `src/features/search,image-optimize` | 6 | 469 |

合計 17 ファイル / 6554 行。

## 分類の定義 (再掲)

| 分類 | 条件 |
|------|------|
| A | 即削除可能 (src 0 + tests 0 + docs 0)。|
| B | 条件付き削除 (tests/docs 整理を伴う)。|
| C | 保留 (spec/future/order-sensitive)。|
| D | 誤検知 / live。|

---

## Track A: `src/adapter/ui/action-binder.ts` (5131 L)

### Wiring

- `bindActions(root, dispatcher)` (主 export, main.ts §3): event delegation on root via `data-pkc-action` attributes → 118 UserAction case の switch
- 4 補助 export: `flashEntry`, `populateAttachmentPreviews`, `populateInlineAssetPreviews`, `cleanupBlobUrls`
- `buildEntryPreviewCtx` (entry-window との交差点 — inventory 02 で警告済み)
- DnD は **三者別** (基本/kanban/calendar) で stale cleanup pipeline 構築

### 候補

| 項目 | 分類 | 根拠 |
|------|------|------|
| `case 'legacy'` (action-binder.ts:1569) | **D** | `parseEntryRef` (`features/entry-ref/entry-ref.ts`) の `legacy` kind 受信先。pre-ULID ref のための **意図的 backward compat**。round 3 で `isUlid` を C 判定した背景と整合。|
| `calendar-prev` / `calendar-next` (1379, 1387) の月計算重複 | **B** | 削除対象ではなく統合 refactor 候補。bundle 影響微小。|
| kanban DnD vs calendar DnD の構造重複 | **C** | target selector が異なるため単純統合不可。order-sensitive。|

### Order-sensitive な点

1. **DnD cleanup pipeline**: `dragend → document dragend → mousedown stale check` の順序固定。1 段でも欠落すると stale state 残置リスク。
2. **entry-window 交差点** (PR #37 警告 follow-up): `openEntryWindow` × 2 + `pushViewBodyUpdate` / `pushTextlogViewBodyUpdate` の非同期 race。closure 順序前提あり。
3. **paste guard**: `pasteInProgress` flag が同時 paste 複数発火を抑制。entry-window sidebar からの paste は別経路のため保護対象外。

### A 級判定: **なし**。すべて live + order-sensitive。

---

## Track B: `src/adapter/transport/` (7 files, 753 L)

### Wiring

`main.ts §9` で lazy mount (phase==='ready' 時のみ)。詳細は `boot-initialization-order.md §3.4`。

| File | Export | importer |
|------|--------|----------|
| `capability.ts` | `canHandleMessage`, `getSupportedMessageTypes`, `getAcceptanceMode` | main.ts |
| `envelope.ts` | `validateEnvelope`, `isPkcMessage`, `formatRejectReasons` | message-bridge |
| `export-handler.ts` | `exportRequestHandler` | main.ts |
| `message-bridge.ts` | `mountMessageBridge`, `buildEnvelope` | main.ts |
| `message-handler.ts` | `createHandlerRegistry` 他 type | main.ts |
| `profile.ts` | `buildPongProfile` | main.ts |
| `record-offer-handler.ts` | `recordOfferHandler`, `PendingOffer` | main.ts, app-state |

### Protocol message type 一覧と handler 対応

| Type | validate | capability | handler | 状況 |
|------|----------|-----------|---------|------|
| `ping`/`pong` | bridge 内 | (auto) | bridge 内 | live |
| `export:request` | ○ | embedded-only | ○ | live |
| `export:result` | ○ | (送信のみ) | (送信のみ) | live (片方向) |
| `record:offer` | ○ | any | ○ | live |
| `record:accept` | ○ | × | × | future-only |
| `record:reject` | ○ | any | (送信側) | **要 spec 確認**: PKC2 は main.ts:391-396 で **送信側**。capability `any` 宣言は bidirectional 想定の可能性。capability spec consistency review の対象。|
| `navigate` / `custom` | ○ | × | × | future-only (vision scope) |

### 候補

| 項目 | 分類 | 根拠 |
|------|------|------|
| `record:accept` 型 + `PendingOffer.RecordAcceptPayload` | **C** | spec 公開のみ、handler 未実装。future-only として hold。|
| `record:reject` capability 宣言 vs handler 不在 | **C** | PKC2 は送信側のため、receiver 側 capability 宣言は spec 整合性の review 対象。round 5 では削除しない。|
| `navigate` / `custom` validate 受理 | **C** | vision 文書言及、handler なし。future protocol。|

### A 級判定: **なし**。

---

## Track C: `src/features/todo,calendar,kanban` (3 files, 201 L)

### Wiring

| File | Export | 用途 |
|------|--------|------|
| `todo-body.ts` | `parseTodoBody`, `serializeTodoBody`, `formatTodoDate`, `isTodoPastDue` | todo-presenter / transclusion / renderer |
| `calendar-data.ts` | `groupTodosByDate(showArchived)`, `getMonthGrid`, `dateKey`, `monthName` | renderer L2345-2362 |
| `kanban-data.ts` | `groupTodosByStatus`, `KANBAN_COLUMNS` | renderer L2437 |

### 候補

| 項目 | 分類 | 根拠 |
|------|------|------|
| `groupTodosByStatus()` に showArchived パラメータが**ない** | **D** | `docs/development/todo-view-consistency.md §4` "Kanban: Always excluded" の **意図的設計**。仕様 invariant。|
| `groupTodosByDate(showArchived)` 分岐 | **D** | calendar 側は `showArchived` flag を尊重。renderer から渡されている。|

### A 級判定: **なし**。全 9 export live、view 別 logic は仕様で justified。

---

## Track D: `src/features/search,image-optimize` (6 files, 469 L)

### Wiring

| File | Export | importer |
|------|--------|----------|
| `search/filter.ts` | `filterEntries`, `entryMatchesQuery`, `filterByArchetype`, `filterByArchetypes`, `applyFilters` | renderer / action-binder / **features/index.ts barrel (dead)** |
| `search/sort.ts` | `sortEntries`, `SortKey`, `SortDirection` | renderer / action-binder / app-state |
| `search/sub-location-search.ts` | `findSubLocationHits`, `SubLocationHit` | renderer (S-18) |
| `image-optimize/classifier.ts` | `classifyIntakeCandidate`, `isAboveOptimizationThreshold` | paste-optimization |
| `image-optimize/config.ts` | `DEFAULT_*` 定数 4 個 | paste-optimization |
| `image-optimize/preference.ts` | `parsePreference`, `serializePreference`, type 群 | preference-store |

### 候補

| 項目 | 分類 | 根拠 |
|------|------|------|
| `entryMatchesQuery` (filter.ts:50) | **B** | src 直接 caller 0、tests 4、`features/index.ts` barrel から re-export ありだが barrel 自体が dead。docstring に "highlighting" の forward intent あり。`isPreviewableMedia` のような behavior divergence なしのため smoking gun は弱い。|
| `clearPreference` (preference-store.ts:41) | **C** | preference reset UI 未接続。FI-03 v2 の future feature 候補。|
| `isAboveOptimizationThreshold` (classifier.ts:18) | **C** | tests のみ呼出し、paste-optimization は inline threshold check。pure helper として retain で十分。|
| `src/features/index.ts` barrel 全体 | **重要発見**: src/tests のいずれからも `from '@features'` / `from '.../features'` で import されていない。barrel 全体が dead re-export ファイル。**B (削除候補だが Round 6 で扱う)**。|

### image-optimize preference UI wiring 確認結果

- `prepareOptimizedIntake(file, base64, surface)` × 4 surface (paste / drop inline / drop sidebar / attach) で live
- `showOptimizeConfirm()` UI live (`step [7b]`)
- `getPreference / setPreference` localStorage 経由で live
- `clearPreference` のみ UI 未接続 → C

### A 級判定: **なし**。

---

## 総括

### A 分類: **なし**

すべての候補が tests / spec / future intent のいずれかを伴うため、ゼロ曖昧性で削除できるものは見つからなかった。

### B 分類 (条件付き / refactor 候補)

1. **`src/features/index.ts` barrel 全体** — caller 0。barrel 削除 + 内部 re-export を直接 import に置換する refactor。Round 6 候補。
2. `entryMatchesQuery` (filter.ts) — barrel 内に同居。barrel 削除と同時に処理が自然。
3. `calendar-prev` / `calendar-next` の月計算重複 (action-binder) — 統合 refactor 候補。

### C 分類 (保留)

1. `record:accept` / `record:reject` capability vs handler 整合 — spec consistency review (transport)。
2. `clearPreference` — FI-03 v2 future feature。
3. `isAboveOptimizationThreshold` — pure helper retain。
4. `case 'legacy'` (action-binder navigate-entry-ref) — pre-ULID backward compat。
5. todo/calendar/kanban の view 別分岐 — 仕様 invariant。

### D 分類 (live)

- action-binder の 118 UserAction case と 5 補助 export
- transport 7 ファイルすべて
- todo/calendar/kanban すべて
- search 三軸 (filter / sort / sub-location)
- image-optimize の paste-optimization wiring

---

## 本 PR での削除アクション

**なし**。docs-only。round 4 と同じ運用 (boot doc 成功パターン)。

## 次 PR 候補

### 候補 A (推奨): `src/features/index.ts` barrel 削除

- caller 0 と確認済 (`grep` で `from '@features'` / `from '.../features'` 0 件)
- 内部 re-export は既に各 importer が直接 import している (renderer / action-binder / app-state はすべてサブモジュールから直接 import)
- barrel 削除に伴い `entryMatchesQuery` も連帯削除可能 (barrel 経由でしか公開されておらず、production caller 0)
- 影響: src 数行削除 + tests `entryMatchesQuery` describe ブロック削除
- 推奨度: **高**。Round 5 唯一の "小さく安全" な refactor。

### 候補 B (中): `record:accept` / `record:reject` capability spec consistency review

- 削除ではなく **spec doc** との整合確認。capability 宣言が sender / receiver の方向性を反映しているか整理。
- 影響: 仕様 doc 更新中心、コード変更は最小。

### 候補 C (低-中): action-binder の `calendar-prev` / `calendar-next` 月計算統合

- ±1 月計算ロジックの helper 抽出。
- bundle 影響微小。

### 候補 D (補助): inventory round 1-4 docs に "resolved" マーク追記

- PR #36 / #41 で削除した isPreviewableMedia / updateLogEntry を round-1 / round-4 doc に "resolved by PR #" として追記
- PR #40 で refactor した slugify / formatDateCompact を round-4 doc に "refactored by PR #40" として追記
- 推奨度: 低 (後回し可)

---

## Test / Build 実行結果

- [x] inventory のみのため src 変更なし
- [x] `npm run typecheck`: 次セクション
- [ ] `npm test`: **未実行** (docs-only、round 1-4 / boot doc と同じ運用)
- [ ] `npm run build`: **未実行** (docs-only、dist 無影響)

## docs/spec/manual 整合性

新規 inventory doc 1 件のみ追加。既存 docs に破壊的変更なし。`boot-initialization-order.md` の dead path 6 カテゴリ分類と整合。
