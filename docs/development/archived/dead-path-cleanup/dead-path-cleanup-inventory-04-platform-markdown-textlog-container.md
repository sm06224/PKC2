# Dead Path Cleanup Inventory 04 — adapter/platform + features/container + features/markdown + features/textlog

**Resolution status** (2026-04-19):

| Finding | 分類 | Resolution |
|---------|------|------------|
| `exporter.ts` の local `slugify` / `formatDateCompact` 重複 | B (refactor) | **Resolved by PR #40** — `zip-package.ts` 側 export からの import に置換、bundle ~200 bytes 減。|
| `updateLogEntry` (textlog-body.ts) | B | **Removed by PR #41** — architectural mismatch 判定 (collectBody が DOM 再構築する設計、helper を呼ぶ経路が構造上不在)。|
| `isUlid` (log-id.ts) | B | **Retained as C by PR #41** — docstring が "debugging / audit tooling only" を明示し非 production 使用が設計意図と判明。昇格して retain 確定。|
| `getMarkdownInstance` (markdown-render.ts) | C | 保留 — `ux-regression-recovery.md:128` で明示された plugin extension API。|
| CSV flags 列 compat / legacy log-id accept / FI-03 placeholder hydrate fallback | C | 保留 — backward compat invariant。|
| その他全 export | D | live。|

## スコープ

inventory round 4。これまでの 3 round で adapter/ui 層と features の一部 (entry-ref / link-index / auto-placement) を棚卸しした上で、残る大きな領域を 4 グループに分けて精査する。

合計 30 ファイル / 8251 行:

| 領域 | ファイル数 | 行数 | 位置づけ |
|------|-----------|------|---------|
| `src/adapter/platform/` (export-oriented) | 6 | 2956 | HTML / ZIP / TEXT / TEXTLOG bundle export + import |
| `src/adapter/platform/` (runtime/util) | 11 | 2491 | IndexedDB / compression / boot source / batch-import / pane-prefs |
| `src/features/container/` + `src/features/markdown/` | 8 | 1955 | subset build + markdown pipeline + asset resolve + TOC |
| `src/features/textlog/` | 5 | 1049 | body JSON / CSV / doc / text conversion / log-id |

方針は inventory-first。A 級（参照なし・テスト影響なし・曖昧さなし）が 1 件だけ明確に成立する場合のみ最小削除を同梱。

## 分類の定義（再掲）

| 分類 | 条件 |
|------|------|
| A | 即削除可能。src/tests/docs すべてに外部参照なし。|
| B | 条件付き削除 (tests / docs / 重複 refactor を伴う)。|
| C | 保留 (spec-declared / foundation / backward compat)。|
| D | 誤検知 / live。|

---

## 1. `src/adapter/platform/` — Export-oriented (6 files, 2956 L)

### 対象

- `exporter.ts` (259): HTML self-contained export
- `zip-package.ts` (765): `.pkc2.zip` + ZIP writer primitives + helpers
- `text-bundle.ts` (594): TEXT `.text.zip` + container-wide + import
- `textlog-bundle.ts` (747): TEXTLOG `.textlog.zip` + container-wide + import
- `mixed-bundle.ts` (170): container-wide TEXT+TEXTLOG
- `folder-export.ts` (221): folder-scoped recursive export

### Runtime wiring

action-binder.ts の UserAction から呼ばれる entry points:

| UserAction | 呼出し関数 |
|------------|-----------|
| `export-selected-entry-html` | `exportContainerAsHtml()` |
| `export-text-zip` / `export-selected-entry` (text) | `buildTextBundle()` |
| `export-textlog-csv-zip` / `export-selected-entry` (textlog) | `buildTextlogBundle()` |
| `export-texts-container` | `buildTextsContainerBundle()` |
| `export-textlogs-container` | `buildTextlogsContainerBundle()` |
| `export-mixed-container` | `buildMixedContainerBundle()` |
| `export-folder` | `buildFolderExportBundle()` |

import path: `importContainerFromZip` (main.ts / batch-import), `importTextBundle*` (main.ts / batch-import), `importTextlogBundle*` (main.ts / batch-import).

### Dead path 候補

#### 候補 1.1 (B): exporter.ts の local helper 重複

- `exporter.ts:246-252 slugify()` と `zip-package.ts:721 export function slugify()` は **byte-identical**
- `exporter.ts:254-259 formatDateCompact()` と `zip-package.ts:733 export function formatDateCompact()` は **byte-identical**
- exporter.ts はこれらを local (非 export) で定義している
- exporter.ts は zip-package.ts から何も import していない

→ **refactor 候補**: exporter.ts の local 2 関数を削除し zip-package.ts から import に置換。動作変更なし。
削除ではなく import 追加を伴う 2 ステップ操作のため、A 級の "zero ambiguity" 基準を満たさない → **B**。

#### 候補 1.2 (D): exporter.ts の escapeAttr / escapeHtml

- local, export なし、exporter.ts 内部でのみ使用。重複実装なし (zip-package.ts は HTML 文字列を出さないので不要)。
- → D (live, unique)

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `slugify` / `formatDateCompact` in exporter.ts | **B** | zip-package.ts の exports と byte-identical 重複。refactor 可。|
| その他の export 全般 | D | action-binder entry point から live。|

---

## 2. `src/adapter/platform/` — Runtime/util (11 files, 2491 L)

### 対象 + 役割

| File | 行 | 役割 |
|------|-----|------|
| `idb-store.ts` | 427 | IDB backend + migration (v1→v2 asset separation) |
| `persistence.ts` | 220 | dispatcher → debounced save wiring (300ms) + pagehide |
| `pkc-data-source.ts` | 256 | boot priority decision (pkc-data → IDB → empty) |
| `idb-warning-banner.ts` | 268 | boot probe failure + runtime save failure UI |
| `batch-import.ts` | 509 | container-wide batch ZIP → format detection → route |
| `importer.ts` | 255 | HTML import (decompress gzip+base64 → Container) |
| `compression.ts` | 159 | gzip+base64 codec (HTML Full export のみ) |
| `storage-estimate.ts` | 194 | navigator.storage.estimate quota preflight |
| `pane-prefs.ts` | 115 | sidebar/meta pane collapse state (localStorage) |
| `embed-detect.ts` | 54 | cross-origin iframe detect + bridge capability guard |
| `entry-package-router.ts` | 34 | filename → entry-package importer routing |

### Boot order 前提 (operation-order assumption)

```
1. createDispatcher()
2. createIDBStore()                            — IDB backend
3. mountPersistence(store)                     — dispatcher subscriber (debounced save)
4. probeIDBAvailability().then(...)            — async, non-blocking
5. estimateStorage().then(...)                 — async, non-blocking
6. readPkcData() + loadFromStore(store)        — parallel data loads
7. chooseBootSource(pkcData, idbContainer)     — pure decision
8. [chooser modal 必要時]                      — showBootSourceChooser
9. finalizeChooserChoice() → dispatch SYS_INIT_COMPLETE
10. mountMessageBridge()                       — phase="ready" 後
```

**critical invariant**: `mountPersistence` は boot 完了前に走ること。そうでないと最初の render mutation (e.g. RESTORE_SETTINGS) が IDB に落ちない。

### Dead path 候補

- 11 ファイルすべて boot / UserAction / runtime subscriber から実到達。
- `embed-detect.ts` / `entry-package-router.ts` は 50 行未満の小粒で single call site だが、test 分離のため独立ファイルを維持する価値あり。inline 化は A 級削除ではなく単なる organization refactor。
- 旧 import format / legacy JSON schema の互換分岐は発見されず。CompressionStream fallback は no-op、storage API 失敗は silent、IDB 失敗は banner + session-only — いずれも graceful degradation で意図的。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| 全 11 ファイル | D | boot / runtime / UserAction から live。|

---

## 3. `src/features/container/` + `src/features/markdown/` (8 files, 1955 L)

### 対象

| File | 行 | 役割 |
|------|-----|------|
| `container/build-subset.ts` | 267 | entry/asset reachability closure (subset export) |
| `markdown/markdown-render.ts` | 297 | markdown-it instance + plugin 装着 |
| `markdown/asset-resolver.ts` | 325 | pre-render `asset:` substitution (image→data URI / link→chip) |
| `markdown/code-highlight.ts` | 320 | syntax highlight hook |
| `markdown/csv-table.ts` | 206 | fence renderer (CSV / TSV / PSV → HTML table) |
| `markdown/markdown-task-list.ts` | 164 | checkbox emit + toggle / progress count |
| `markdown/markdown-toc.ts` | 296 | TOC extraction (TEXT / TEXTLOG) + heading slug |
| `markdown/quote-assist.ts` | 80 | Slice α: `\n> ` Enter-key continuation |

### Markdown plugin 装着順序 (operation-order assumption)

```
new MarkdownIt({ ... })
  .use(validateLink-hardening)     [safe URL schemes: http(s)/entry:/ms-office/...]
  .rule(link_open)                 [entry: → navigate-entry-ref / others → target=_blank]
  .rule(image)                     [entry: → pkc-transclusion-placeholder]
  .rule(heading_open)              [id stamp via makeSlugCounter from markdown-toc]
  .rule(fence, PRE-process)        [csv-table.renderCsvFence short-circuit]
  .hook(highlight)                 [code-highlight.highlightCode]
  .coreRule(pkc-task-list)         [task checkbox emit + disabled]

→ md.render(text)
  → (adapter/ui) pre-render: resolveAssetReferences
  → (adapter/ui) post-render: expandTransclusions
  → (adapter/ui) post-DOM: search-mark highlighter
```

### Dead path 候補

#### 候補 3.1 (C): `markdown-render.ts:295 getMarkdownInstance()`

- export されているが src 呼出し 0 件
- tests 1 箇所 (`tests/features/markdown/markdown-render.test.ts:435`)
- `docs/development/completed/ux-regression-recovery.md:128`: **"Phase 3 は `getMarkdownInstance().use(plugin)` で追加可能"** という拡張 API として明示

→ **C: spec-declared extension point**。削除は docs 更新を伴う。現在呼ばれていないことを理由に削るのは round 3 で保留にした `extractRefsFromEntry` / `collectLinkRefs` と同じ状況。

#### 候補 3.2 (B → C 検討): `quote-assist.ts` Slice α

- 80 行、`computeQuoteAssistOnEnter()` のみ export
- action-binder の Enter keydown handler で live 呼出し
- Slice β (empty-line exit) / Slice γ (bulk toggle) は deferred (spec `markdown-quote-input-assist.md` 記載)
- → **D (live)**。Slice β/γ は future-feature。残置理由明確。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `getMarkdownInstance` (markdown-render.ts) | **C** | docs 明示の plugin extension API。|
| その他 export 全般 | D | markdown pipeline 中核 / build-subset / TOC 等すべて live。|

---

## 4. `src/features/textlog/` (5 files, 1049 L)

### 対象

| File | 行 | 役割 |
|------|-----|------|
| `log-id.ts` | 101 | ULID 生成 + legacy 判定 |
| `textlog-body.ts` | 149 | body JSON parse/serialize + append/update/toggle/delete |
| `textlog-csv.ts` | 465 | CSV export/import + asset key collect + compact |
| `textlog-doc.ts` | 141 | 共通 render 表現 (order: asc/desc) |
| `textlog-to-text.ts` | 193 | TEXTLOG → TEXT 変換 (Slice 4) |

### TEXTLOG 書き込み / 描画 / export 順序前提

1. **Write order = storage order = append order**: CSV export / parseTextlogBody は常に entry 配列順序を保持。log-id の時系列値は参考のみ。
2. **Render order は viewer 次第**: live viewer は `desc` (newest first)、printed / rendered-viewer は `asc` (chronological)、textlog-to-text は内部で `asc` 強制。共通は `buildTextlogDoc(order)` で統一。
3. **flags column backward compat**: 旧 CSV (flags 列なし) → `important` boolean から推論 / 新 CSV は `flags` 列優先 (`textlog-csv.ts:256-270` の `idxFlags >= 0` 分岐)。H-4 (2026-04-14) で導入された forward-safe migration。
4. **Asset key dedup**: CSV の `asset_keys` 列は source position order (left-to-right) 固定。`collectTextlogAssetKeys()` が unified regex で単一パス。
5. **Placeholder hydrate は best-effort (FI-03)**: hydrate 失敗時は console.warn のみで placeholder 残置。`textlog-hydrator.ts:107-117`, beforeprint は `forceHydrateAll()` で確定化 (`:142-150`)。

### Dead path 候補

#### 候補 4.1 (B): `log-id.ts:95 isUlid()`

- src 呼出し 0 件 (tests のみ: 6 箇所)
- docs 記述なし
- round 3 の `isValidEntryRef` と同パターン: 便宜ヘルパーだが production で使われていない
- smoking gun (挙動矛盾 / doc drift) なし

→ **B: 削除可能だが積極動機なし**。

#### 候補 4.2 (B): `textlog-body.ts:73 updateLogEntry()`

- src 呼出し 0 件 (tests のみ: 3 箇所)
- docs 記述なし
- テキスト編集経路は `action-binder` 内で直接 body をいじっている設計らしく、この helper は使われていない
- → **B**。

#### 候補 4.3 (C): CSV flags 列 backward compat (`textlog-csv.ts:256-270`)

- 旧 CSV reader が `important` bool に fallback する互換分岐
- backward compat invariant (CLAUDE.md §5) に該当
- → **C: 保留**。schema migration policy の範疇。

#### 候補 4.4 (C): Legacy log-id accept-only path (`log-id.ts:11` policy)

- pre-ULID log-id を opaque token として受理
- resolver は強制書き換えしない
- → **C: backward compat invariant**。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `isUlid` (log-id.ts) | **B** | src 0 参照、tests のみ、smoking gun なし。|
| `updateLogEntry` (textlog-body.ts) | **B** | src 0 参照、tests のみ、smoking gun なし。|
| CSV flags 列 compat / legacy log-id accept | C | backward compat invariant。|
| その他 export | D | FI-03 / Slice 4 / CSV round-trip 経路で live。|

---

## 総括

### A 分類（即削除可能）

- **なし**。

### B 分類（条件付き削除 / 要判断）

1. `exporter.ts` の local `slugify` / `formatDateCompact` — zip-package.ts と byte-identical。import に置換する refactor 候補。
2. `markdown-render.ts` `getMarkdownInstance` は **C (spec-declared)** に落ち、B ではない。
3. `log-id.ts` `isUlid` — src 0 参照、tests only、smoking gun なし。
4. `textlog-body.ts` `updateLogEntry` — src 0 参照、tests only、smoking gun なし。

### C 分類（保留 — spec / backward compat）

1. `markdown-render.ts` `getMarkdownInstance` — docs `ux-regression-recovery.md:128` で明示された plugin 拡張 API。
2. TEXTLOG CSV の `flags` 列 backward compat (H-4 migration)。
3. legacy log-id accept-only policy。
4. FI-03 placeholder hydrate best-effort fallback。

### D 分類（誤検知 / live）

- adapter/platform 全 17 ファイル（`slugify` / `formatDateCompact` 重複のみ B、その他すべて live）。
- features/container build-subset。
- features/markdown 全 8 export (quote-assist Slice α 含む)。
- features/textlog の FI-03 pipeline / CSV round-trip / TEXTLOG→TEXT 変換。

---

## 本 PR での削除アクション

**なし**。

プロンプト指示 "If and only if one tiny A-case exists with zero ambiguity: remove just that one case" に従い、docs-only とする。A 級に満たない B 候補 3 つ (`slugify`/`formatDateCompact` 重複、`isUlid`、`updateLogEntry`) は別 PR または方針決定後に処理する。

---

## 次 PR 候補

### 候補 A (小・refactor): exporter.ts の `slugify` / `formatDateCompact` を zip-package.ts import に置換

- 変更: exporter.ts local 定義 2 関数削除、zip-package.ts から import 追加。
- 影響: byte-identical 動作、bundle 微減、tests 全通。
- 動機: adapter/platform 内部の重複解消。
- 推奨度: **中**。単独 PR として独立させれば review が明快。

### 候補 B (小・削除): `isUlid` / `updateLogEntry` の 2 関数削除

- 変更: log-id.ts / textlog-body.ts から該当 export 削除、tests 該当 describe ブロック削除。
- 影響: src 無変更、tests 計 9 ケース削除、bundle tree-shake 済み想定で byte-identical。
- 動機: test-only contract residue 解消。ただし `isPreviewableMedia` のような smoking gun はない。
- 推奨度: **低-中**。round 3 の `isValidEntryRef` と合わせて「helper の surface を縮小するか」という方針判断を先行させるべき。

### 候補 C (推奨): inventory 結果を反映した boot order doc の新設

- agent 2 の分析で明文化された 10 ステップの boot order は `docs/development/boot-initialization-order.md` に独立 doc として切り出す価値あり。
- 既存の `boot-container-source-policy-*.md` とは別観点 (dispatcher / persistence / IDB / storage-estimate の順序) を扱う。
- 推奨度: **中**。

### 候補 D (補助): round 1 / 2 / 3 inventory docs に PR #36 の "resolved" マーク追記

- round 1 の `isPreviewableMedia` 候補を "resolved by PR #36" と明記。
- round 4 の発見 (exporter 重複 / isUlid / updateLogEntry) を将来 resolve する際の cross-ref を準備。
- 推奨度: 低 (後回し可)。

### Round 5 候補

まだ棚卸ししていない主要領域:

- `src/adapter/ui/action-binder.ts` 単独 (4000+ 行想定 — 分割調査が必要)
- `src/adapter/transport/` 一式 (postMessage protocol / handler 群)
- `src/features/todo/` / `src/features/calendar/` / `src/features/kanban/`
- `src/features/search/` 一式
- `src/features/image-optimize/` 一式
- `src/features/color/` / `src/features/datetime/` / `src/features/text/`

優先度は使いやすさが分かりづらい `transport/` と分量の多い `todo/calendar/kanban/` の順と推定。

---

## 付録: 調査コマンド

```
対象ファイル:
  - wc -l src/adapter/platform/*.ts src/features/container/*.ts
          src/features/markdown/*.ts src/features/textlog/*.ts

importer:
  - Grep "from ['\"].*<filename>['\"]" ÷ 各ファイル

各 export:
  - Grep "\\b<symbol>\\b" (src / tests / docs)

ボイスチェック:
  - slugify / formatDateCompact : exporter.ts vs zip-package.ts 比較
  - getMarkdownInstance : caller 一覧
  - isUlid / updateLogEntry : caller 一覧
```
