# Dead Path Cleanup Inventory 02 — adapter/ui 4本

## スコープ

inventory round 2。`adapter/ui` 層のうち、round 1 で触れなかった中〜大サイズの 4 ファイルを棚卸し対象とする。

- `src/adapter/ui/transclusion.ts` (709 行)
- `src/adapter/ui/rendered-viewer.ts` (643 行)
- `src/adapter/ui/entry-window.ts` (2292 行)
- `src/adapter/ui/asset-picker.ts` (263 行)

本 PR の方針は inventory-first。A 分類が「参照なし・テスト影響なし・曖昧さなし」で成立する場合のみ最小削除を同梱する。

## 分類の定義（再掲）

| 分類 | 条件 |
|------|------|
| A | 即削除可能。src/tests/docs すべてに外部参照なし。安全側。|
| B | 条件付き削除。tests や docs の更新を伴えば削除できる。|
| C | 保留。将来機能 / foundation / 仕様未確定の可能性。|
| D | 誤検知。文字列ヒットはあるが dead path ではない。|

---

## 1. `src/adapter/ui/transclusion.ts`

### Runtime entry points

```
detail-presenter.ts:82       ─┐
folder-presenter.ts:55        │
textlog-presenter.ts:434      ├──▶ expandTransclusions(root, ctx)
todo-presenter.ts:182         ─┘      │
                                      ▼
                              buildReplacement(ref, ctx)
                                      │
                           ┌──────────┼──────────────┐
                           ▼          ▼              ▼
                   blockedPlaceholder  linkFallback   buildEmbedSection
                                      │
                         ┌────────────┴────────────┐
                         ▼                         ▼
                   renderEntryEmbed          renderTextlogSlice
                         │
                         ▼
                 (再帰) expandTransclusions(body, { embedded: true, ... })
```

Guard:

- `embedded: true` で depth ≤ 1 不変を強制（line 167-172）
- self-embed guard（line 176-178）
- missing target guard（line 180-183）
- `EMBEDDABLE_ARCHETYPES` で archetype gate（line 75-79, 195-197）

### Export 一覧

| Export | 種別 | 内部使用 | 外部 src 参照 | tests | docs |
|--------|------|----------|----------------|-------|------|
| `expandTransclusions` | function | ○ | 4 presenter | ○ | `embedded-preview-and-cycle-guard.md`, `entry-transformation-and-embedded-preview.md` |
| `TransclusionContext` | interface | ○ | 4 files | ○ | spec |

内部 (非 export) helper: `EMBEDDABLE_ARCHETYPES`, `buildReplacement`, `blockedPlaceholder`, `linkFallback`, `stripSubtreeIds`, `disableSubtreeTaskCheckboxes` — いずれも 1 回以上 call site あり。

### rendered-viewer.ts との境界

| 側面 | transclusion.ts | rendered-viewer.ts |
|------|-----------------|---------------------|
| 実行タイミング | detail 描画 **ライブ** | 「別窓で開く」スナップショット |
| 操作対象 | DOM node 置換 | HTML 文字列生成 |
| 再帰展開 | あり | なし |
| cycle/depth guard | あり | 不要 |

**重複なし。** responsibility は明確に分離されている。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `expandTransclusions` / `TransclusionContext` | D | 4 presenter から live 呼出し。|
| 内部 helper 6 個 | D | いずれも 1 回以上 call site あり。|

**結論**: dead path なし。

---

## 2. `src/adapter/ui/rendered-viewer.ts`

### Runtime entry points

```
action-binder.ts:907  (open-rendered-viewer)  ─┐
                                                ├──▶ openRenderedViewer(entry, container)
action-binder.ts:1219 (ctx-preview)            ─┘        │
                                                         ▼
                                              buildRenderedViewerHtml(entry, container)
                                                         │
                                                         ▼
                                              buildBodyHtml → archetype dispatch
                                                         │
                                              ┌──────────┴──────────┐
                                              ▼                     ▼
                                     TEXT (renderMarkdown)   TEXTLOG (buildTextlogBodyHtml)
                                              │                     │
                                              └────── resolveAssetSource ────
```

両 call site とも read-only な新窓 (`window.open('')` + `document.write(blob-serialized HTML)`)。`entry-window.ts` の edit-capable postMessage 経路とは完全に区別される。

### Export 一覧

| Export | 種別 | 外部 src 参照 | tests | docs |
|--------|------|----------------|-------|------|
| `buildRenderedViewerHtml` | function | `openRenderedViewer` 内 | ○ (多数) | - |
| `openRenderedViewer` | function | `action-binder.ts` (2 箇所) | - | `markdown-code-block-highlighting.md` |

内部 helper: `buildBodyHtml`, `buildTextlogBodyHtml`, `resolveAssetSource`, `buildDownloadFilename`, `slugifyTitle`, `isoToDateStamp`, `escapeForHtml`, `escapeForAttr` — いずれも使用中。

### 注目: `resolveAssetSource` の `container: null` ガード (line 570-572)

- 型シグネチャ: `(source: string, container: Container | null) => string`
- production call site: `action-binder.ts:907 / 1219` はいずれも `st.container` を渡す。readyState の container は non-null。
- test call site (`tests/adapter/rendered-viewer.test.ts`): 全ケースで `baseContainer()` を渡す。**null は一度も渡されない。**
- null branch は型レベルの防御コードに留まる。

→ "dead branch" ではなく、Container 型の nullable シグネチャに追従した defensive branch。型を `Container` (non-nullable) に絞り込む refactor 候補だが、削除対象ではない。本 PR のスコープ外。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `buildRenderedViewerHtml` / `openRenderedViewer` | D | live 呼出し。|
| 内部 helper 全 8 個 | D | 呼出し鎖から到達可能。|
| `resolveAssetSource` container=null branch | D | defensive null-guard。シグネチャ依存。|

**結論**: dead path なし。`resolveAssetSource` のシグネチャ型絞り込みは将来の refactor として別扱い。

---

## 3. `src/adapter/ui/entry-window.ts`

### 操作フロー (明文化)

本ファイルは live refresh / postMessage / interactive task toggle / asset resolver / archetype dispatch の **交差点**。user flow を順番に辿ることで dead path と思えた分岐の大半が live であることを確認した。

#### Parent ↔ Child postMessage protocol

| Type | Dir | Sender | Receiver | 実装状況 |
|------|-----|--------|----------|----------|
| `pkc-entry-save` | C→P | child inline L2172 | parent handleMessage L521 | **active** |
| `pkc-entry-saved` | P→C | parent L523 | child listener L2177 | **active** |
| `pkc-entry-conflict` | P→C | `notifyConflict()` L559 | child listener L2198 | **active** |
| `pkc-entry-download-asset` | C→P | child inline L1835 | parent handleMessage L526 | **active** |
| `pkc-entry-task-toggle` | C→P | child inline L1824 | parent handleMessage L532 | **active** |
| `pkc-entry-update-preview-ctx` | P→C | `pushPreviewContextUpdate()` L231 | child L2203 | **active** |
| `pkc-entry-update-view-body` | P→C | `pushViewBodyUpdate()` L310 | child L2227 | **active** |

#### JSDoc 記述 L10 の `pkc-entry-init` 参照

L10 のヘッダ JSDoc が Protocol 例の筆頭に `Parent → Child: { type: 'pkc-entry-init', entry, readonly }` を挙げているが、**この message type は実装されていない**。初期化は `child.document.write(buildWindowHtml())` で state を child 側に直接 bake する設計で、message のやり取りは発生しない。

この JSDoc の 1 行は **stale documentation (= doc comment drift)**。

- dead code ではない（1 行のコメント）
- 削除影響: なし (comment のみ)
- test 影響: なし
- docs 影響: なし

→ 分類 **D (doc drift)**。削除扱いではなく、別 PR で 1 行コメント修正を推奨。

#### Live refresh flow

```
Parent dispatcher state change
  │
  ├─ assets/entries identity changed
  │
  ├─ entry-window-live-refresh.ts
  │   └─ getOpenEntryWindowLids() → push all
  │       └─ buildEntryPreviewCtx()
  │           └─ pushPreviewContextUpdate(lid, ctx)
  │               ▼ postMessage
  │           child listener stores in childPreviewCtx
  │               (if Preview tab visible: re-render #body-preview)
  │
  └─ entry-window-view-body-refresh.ts
      └─ getOpenEntryWindowLids() → push all
          └─ resolveAssetReferences()
              └─ pushViewBodyUpdate(lid, html)
                  ▼ postMessage
              child listener:
                if dirty:   stash to pendingViewBody + notice
                if clean:   #body-view.innerHTML = html
```

### Export 一覧

| # | Export | 種別 | 呼出し元 | 分類 |
|---|--------|------|----------|------|
| 1 | `getOpenEntryWindowLids` | function | `entry-window-live-refresh.ts`, `entry-window-view-body-refresh.ts` | D |
| 2 | `ENTRY_WINDOW_PREVIEW_CTX_UPDATE_MSG` | const string | protocol shared constant | D |
| 3 | `ENTRY_WINDOW_VIEW_BODY_UPDATE_MSG` | const string | protocol shared constant | D |
| 4 | `pushPreviewContextUpdate` | function | `entry-window-live-refresh.ts:73` | D |
| 5 | `pushViewBodyUpdate` | function | `action-binder.ts:3707`, `entry-window-view-body-refresh.ts:73` | D |
| 6 | `pushTextlogViewBodyUpdate` | function | `action-binder.ts:3703` (task toggle) | D |
| 7 | `EntryWindowAssetContext` | interface | `action-binder.ts:77, 4294` | D |
| 8 | `openEntryWindow` | function | `action-binder.ts:3660` | D |
| 9 | `notifyConflict` | function | `action-binder.ts` 動的 import | D |

### このファイルの 5 つの設計特性（今後の削除判断時の warning）

1. **postMessage protocol hub** — 7 種類の message type が parent/child 間で双方向契約を構成。1 つ削ると契約が破綻。
2. **asset resolver の 2 層 (parent-side `previewResolverContexts` map + child-side `childPreviewCtx`)** — text/textlog の edit-mode Preview 表示はこれに完全依存。
3. **dirty state policy** — `pendingViewBody` + `#pending-view-notice` で user の in-progress edit を保護しながら、親の push を pending 化する仕組み。save/cancel/conflict と連動。
4. **archetype-aware dispatch** — `renderViewBody` が attachment / todo / form / textlog / default に分岐。各々固有の HTML builder 呼出し。
5. **500ms close poll** — `setInterval` で `child.closed` を監視。unload event を確実に catch できない環境向け fallback。

> **warning**: これら 5 特性は相互依存。`protocol type を 1 つ削る` / `resolver context の field を 1 つ削る` / `archetype case を 1 つ削る` 等の操作は、必ず cross-file の依存を可視化してから着手する。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| 9 個の export すべて | D | 全て live。B (動的 import 依存) も `notifyConflict` が該当するが削除候補ではない。|
| JSDoc L10 の `pkc-entry-init` 参照 | D (doc drift) | 1 行コメント修正の別 PR 推奨。|

**結論**: dead path なし。このファイルは交差点なので削除 PR を立てる前に必ず 5 特性を意識すること。

---

## 4. `src/adapter/ui/asset-picker.ts`

### 操作フロー (明文化)

#### Path 1: slash command `/asset`

```
user types "/" in textarea
  └─ slash-menu opens
      └─ user selects "asset"
          └─ slash-menu.ts:76-82 onSelect
              └─ action-binder.ts:139-151 registered callback
                  └─ collectImageAssets(container)
                      └─ openAssetPicker(textarea, candidates, onInsert)
                          ▼ DOM
                      popover[data-pkc-region="asset-picker"]
                          ▼ keyboard
                      handleAssetPickerKeydown() (priority=1 in action-binder.ts:1680)
                          ▼ Enter/Tab
                      insertCandidate() → buildAssetInsertion()
                          ▼
                      textarea.value 更新 + input event dispatch
                          ▼
                      closeAssetPicker()
```

#### Path 2: inline autocomplete `(asset:<q>`

```
user types "(asset:" in textarea
  └─ action-binder.ts:2401-2409 findAssetCompletionContext()
      └─ openAssetAutocomplete() (asset-autocomplete.ts)
          ▼ 型として
      AssetCandidate interface を共有
```

#### Dismiss

- action-binder.ts:1892-1894: Escape key handler
- action-binder.ts:3067-3069: click-outside handler

### Export 一覧

| Export | 種別 | 呼出し元 | 分類 |
|--------|------|----------|------|
| `AssetCandidate` | interface | asset-autocomplete, action-binder, tests | D |
| `collectImageAssets` | function | action-binder (2 箇所), asset-autocomplete, tests | D |
| `buildAssetInsertion` | function | insertCandidate() 内部 + tests | D |
| `isAssetPickerOpen` | function | action-binder (多点) | D |
| `openAssetPicker` | function | action-binder (slash-menu callback + autocomplete trigger) | D |
| `handleAssetPickerKeydown` | function | action-binder.ts:1680 keyboard priority chain | D |
| `closeAssetPicker` | function | action-binder (4 call sites: Escape / click-outside / safety-net / cleanup) | D |

### Foundation vs live wiring の判定

`docs/development/asset-picker-foundation.md` は仕様書で、本ファイルはその実装。仕様の全要素が実 UI に wiring 済み:

- slash command 経路、autocomplete 経路、dismiss 経路、keyboard priority、 DOM attribute (`data-pkc-region="asset-picker"`, `data-pkc-asset-key`)、CSS (`pkc-asset-picker-*`)、テスト 12 case。

**結論**: **live UI**。foundation-only の残骸はなし。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| 7 個の export すべて | D | live UI。削除候補なし。|

---

## 総括

### A 分類（即削除可能）

- **なし**。

全 4 ファイルとも、厳密な棚卸しの結果 A 分類に落ちる dead path は見つからなかった。

### B 分類（条件付き削除）

- **なし**。

### C 分類（保留）

- なし（resolveAssetSource の container=null ガードは型絞り込み refactor 候補であって削除候補ではない）。

### D 分類（誤検知 or live）

- transclusion.ts: 全 export / 全内部 helper
- rendered-viewer.ts: 全 export / 全内部 helper / container=null defensive guard
- entry-window.ts: 全 9 export
- entry-window.ts JSDoc L10 の `pkc-entry-init` 参照 (doc drift — 別 PR での 1 行修正推奨)
- asset-picker.ts: 全 7 export

---

## 本 PR での削除アクション

**なし**。

round 1 と同じく、本 PR は inventory 文書のみをコミットする。プロンプト指示 "A が無ければ削除は行わず、inventory 文書だけ作成" に従う。

---

## 次 PR 候補

### 候補 A (小・任意): entry-window.ts JSDoc L10 の修正

- `pkc-entry-init` 参照を削除し、初期化が `document.write(buildWindowHtml())` 経由であることを記述する 1 行 (コメント) 修正。
- 影響: code なし / test なし / bundle なし。
- 本 PR に同梱しない理由: 「dead path 削除」ではなく comment drift 修正のため。必要性は低く、単独化する場合もごく小さな PR で十分。

### 候補 B (中): rendered-viewer.ts の `Container | null` 型絞り込み

- `resolveAssetSource` のシグネチャを `(source, container: Container) => string` に絞り込み、null branch を削除。
- 影響: action-binder の 2 call site は既に non-null を渡すため、引数側は無変更。tests も baseContainer を渡すだけで影響なし。
- 本 PR に同梱しない理由: 純粋に refactor PR として独立させた方が review しやすい。

### 候補 C (大・推奨): `src/features/` 層 round 3 inventory

- 対象候補: `src/features/entry-ref/`, `src/features/link-index/`, `src/features/relation/auto-placement.ts`
- foundation と live wiring が混ざりやすい領域。inventory-first で 1 PR。
- adapter/ui 側が 2 round の棚卸しで落ち着いたので、features 側に入るタイミングとして適切。

### 候補 D (補助): 第 1 回 inventory 文書に resolved マーク付与

- PR #36 で `isPreviewableMedia` を削除した結果を round-1 inventory 文書に追記 (1 段落)。
- 本 PR に同梱しても良いが、scope 混線を避けるため別 PR 推奨。

---

## 付録: 調査コマンド

```
Glob / Grep:
  - "from ['\"].*transclusion['\"]"
  - "from ['\"].*rendered-viewer['\"]"
  - "from ['\"].*entry-window['\"]"
  - "from ['\"].*asset-picker['\"]"

各 export 個別:
  - "\\b<export>\\b"

postMessage 経路:
  - "pkc-entry-"

docs 側:
  - "Grep -path=docs -pattern=<file-stem>"
```
