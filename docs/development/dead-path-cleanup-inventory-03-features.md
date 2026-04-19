# Dead Path Cleanup Inventory 03 — features 層 (entry-ref / link-index / auto-placement)

## スコープ

inventory round 3。adapter/ui 層を 2 round 棚卸しした結果「不用意に削る段階ではない」と判断できたため、次は features 層に入る。foundation / future-feature / spec-first 実装が混ざりやすい領域のため、削除より先に「何が live で何が spec-declared なのか」を切り分ける。

対象 (合計 437 行):

- `src/features/entry-ref/entry-ref.ts` (162 行)
- `src/features/entry-ref/extract-entry-refs.ts` (38 行)
- `src/features/link-index/link-index.ts` (112 行)
- `src/features/relation/auto-placement.ts` (125 行)

importer 側として以下も参照する (削除対象外):

- `src/adapter/ui/transclusion.ts`, `src/adapter/ui/action-binder.ts`, `src/adapter/ui/renderer.ts`
- `src/adapter/ui/entry-window-view-body-refresh.ts`
- `src/adapter/state/app-state.ts`
- `src/features/container/build-subset.ts`

## 分類の定義（再掲）

| 分類 | 条件 |
|------|------|
| A | 即削除可能。src/tests/docs すべてに外部参照なし。|
| B | 条件付き削除。tests や docs の更新を伴えば削除できる。|
| C | 保留。spec-declared / foundation / 将来機能。|
| D | 誤検知。live。|

---

## 1. `src/features/entry-ref/entry-ref.ts`

### Export 一覧

| Export | 種別 | 外部 src 参照 | tests | docs |
|--------|------|----------------|-------|------|
| `ParsedEntryRef` | type union | `transclusion.ts`, `action-binder.ts` (間接) | ○ | `textlog-viewer-and-linkability-redesign.md` §4.5 / §6.5 |
| `parseEntryRef` | function | `transclusion.ts:47, 158, 204, 261, 408`, `action-binder.ts:1478` | ○ | spec |
| `formatEntryRef` | function | `transclusion.ts:47, 265` | ○ | spec |
| `isValidEntryRef` | function | **0** | ○ (3 case / 7 assertion) | - |

### User / system flow

```
entry: scheme は下記経路で実体化される:
  (a) transclusion の markdown 描画後展開
      detail-presenter / folder-presenter / textlog-presenter / todo-presenter
        └─ renderMarkdown → expandTransclusions(root, ctx)
            └─ transclusion.ts:158 parseEntryRef(ref)  [inline link 検出時]
                └─ buildReplacement → renderEntryEmbed / linkFallback
  (b) context-menu "copy as entry:ref"
      action-binder.ts:879 formatEntryReference → clipboard
  (c) entry リンク navigation
      action-binder.ts:1478 parseEntryRef(rawRef)
        └─ kind 別 routing (log/range/day/heading/legacy/invalid)
```

### 注目: `isValidEntryRef` の扱い

- 実装: `parseEntryRef(raw).kind !== 'invalid'` の 1 行 wrapper
- src 参照: 0 件
- tests: `tests/features/entry-ref/entry-ref.test.ts:176-189` に 3 case
- docs: 関数自体への言及なし
- 利用動機: 公開 API の convenience。deletion して困る具体的 caller は不在。

**PR #36 で削除した `isPreviewableMedia` と類似のパターンだが、差異がある**:

| 観点 | isPreviewableMedia (PR #36 削除) | isValidEntryRef |
|------|---------------------------------|-----------------|
| src 参照 | 0 | 0 |
| tests | 5 | 3 |
| docs 記述 | 実装と矛盾（"doc drift smoking gun"） | 記述なし |
| 振る舞い分岐の非対称性 | あり（strict allowlist vs loose prefix） | なし（parseEntryRef の 1 行 wrapper） |
| 削除の "smoking gun" | あり | **なし** |

→ 分類 **B**: 削除は可能だが、`isPreviewableMedia` のような矛盾根拠がないため、積極削除の動機が弱い。API surface 縮小の単独 refactor PR として別途処理するかどうかはプロジェクト方針次第。本 PR では保留。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `parseEntryRef` / `formatEntryRef` / `ParsedEntryRef` | D | transclusion / action-binder で live。|
| `isValidEntryRef` | **B** | src 0 参照 + tests 3 case、削除の smoking gun なし。本 PR 保留。|
| 内部 helper (`invalid`, `isRealDate`) | D | parseEntryRef からの live 呼出し。|

---

## 2. `src/features/entry-ref/extract-entry-refs.ts`

### Export 一覧

| Export | 種別 | 外部 src 参照 | tests | docs |
|--------|------|----------------|-------|------|
| `extractEntryReferences` | function | 4 files | ○ | 複数 spec |

### Runtime wiring

```
extractEntryReferences(markdown) → Set<string> (LID のみ)
  caller 1: src/features/container/build-subset.ts:53
            subset export 時に参照解決済みの entry を選択するのに使用
  caller 2: src/features/link-index/link-index.ts:13
            entry.body から outgoing ref を走査
  caller 3: src/adapter/ui/entry-window-view-body-refresh.ts:70
            別窓で見ている entry が参照している LID が変更されたら view-body を更新
  caller 4: tests
```

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `extractEntryReferences` | D | 3 箇所から live 呼出し。|

---

## 3. `src/features/link-index/link-index.ts`

### Export 一覧

| Export | 種別 | 外部 src 参照 | tests | docs |
|--------|------|----------------|-------|------|
| `LinkSourceArchetype` | type alias | **0** (内部のみ) | - | spec §2.1 |
| `LinkRef` | interface | `renderer.ts:52` (type import) | ○ | spec §2.1 |
| `LinkIndex` | interface | `renderer.ts:52` (type import) | ○ | spec §2.2 |
| `extractRefsFromEntry` | function | **0** (内部のみ) | ○ | spec **§3.2** |
| `collectLinkRefs` | function | **0** (内部のみ) | ○ | spec **§3.2** |
| `buildLinkIndex` | function | `renderer.ts:51, 3166` | ○ | spec **§3.2** |

### System flow

```
renderer.ts:3166 (detail pane meta セクション描画時)
  └─ buildLinkIndex(container) → { outgoingBySource, backlinksByTarget, broken }
      └─ collectLinkRefs(container)
          └─ for each entry:
               extractRefsFromEntry(entry, existingLids)
                 └─ sourceBody(entry) [archetype 別]
                     └─ extractEntryReferences(body)
  └─ renderLinkRefsSection('Outgoing links' / 'Backlinks' / 'Broken links')
```

### 注目: `extractRefsFromEntry` / `collectLinkRefs` の扱い

- src 参照: 0 (内部で `buildLinkIndex` からのみ呼出し)
- tests: 直接テスト対象
- docs `link-index-v1-behavior-contract.md §3.2`: **helper シグネチャとして明示的に契約公開**
  ```ts
  function extractRefsFromEntry(entry: Entry): LinkRef[];
  function collectLinkRefs(container: Container): LinkRef[];
  function buildLinkIndex(container: Container): LinkIndex;
  ```
- `docs/development/link-index-v1-audit.md:73-78`: contract §3.2 との signature 差異 (existingLids 第 2 引数) について audit 済み、"behavior に影響しない" と判定済み

→ 分類 **C: 保留 (spec-declared API surface)**。削除すると contract 文書との乖離を招く。現在 live caller がないことはこの分類の変更理由にならない。

### 注目: `LinkSourceArchetype` type alias の扱い

- src 参照: 0 (LinkRef interface 内の `sourceArchetype` フィールド型として内部のみ)
- spec §2.1 で明示的に export 型として declare
- 将来の archetype 拡張 (generic / form 等) のためにユーザー拡張点として設計 (spec §§)

→ 分類 **C: 保留 (spec-declared extension point)**。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `buildLinkIndex` / `LinkRef` / `LinkIndex` | D | renderer.ts から live。|
| `extractRefsFromEntry` / `collectLinkRefs` | **C** | spec §3.2 に helper として明示公開。|
| `LinkSourceArchetype` | **C** | spec §2.1 で拡張点として declare。|

---

## 4. `src/features/relation/auto-placement.ts`

### Export 一覧

| Export | 種別 | 外部 src 参照 | tests | docs |
|--------|------|----------------|-------|------|
| `ARCHETYPE_SUBFOLDER_NAMES` | const record | (間接) | ○ | `auto-folder-placement-for-generated-entries.md` |
| `getSubfolderNameForArchetype` | function | `action-binder.ts:336` | ○ | 同上 |
| `resolveAutoPlacementFolder` | function | `app-state.ts:2040`, `action-binder.ts:340` | ○ | 同上 + `user-action.ts:293` |
| `findSubfolder` | function | `app-state.ts:813, 2052` | ○ | 同上 |

### User flow

```
ユーザーが todo / attachment / image paste を実行 (選択状態=selectedLid):

(a) pre-dispatch (action-binder.ts:336-340)
    subfolderName = getSubfolderNameForArchetype(arch)        [例: 'TODOS']
    contextFolderLid = resolveAutoPlacementFolder(container, selectedLid)

(b) reducer (app-state.ts)
    case CREATE_TODO / CREATE_ATTACHMENT / ...
      contextFolderLid = resolveAutoPlacementFolder(container, action.contextLid)
      if (subName) {
        existing = findSubfolder(container, contextFolderLid, subName)
        if (!existing) { → 同じ reduction で subfolder を atomic に create }
      }
      structural relation を parent → newEntry に張る
```

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| 4 export すべて | D | app-state + action-binder で live。tests 多数。docs 完備。|

---

## 総括

### A 分類（即削除可能）

- **なし**。

### B 分類（条件付き削除）

1. `isValidEntryRef` (entry-ref.ts) — src 参照 0、tests 3 case、削除の smoking gun (doc drift / 振る舞い不一致) **なし**。本 PR では保留。

### C 分類（保留 — spec-declared）

1. `extractRefsFromEntry` / `collectLinkRefs` (link-index.ts) — spec §3.2 で helper シグネチャとして明示公開済み。削除は contract 更新を伴う。
2. `LinkSourceArchetype` (link-index.ts) — spec §2.1 で拡張点として declare。

### D 分類（誤検知 / live）

- entry-ref.ts: `parseEntryRef` / `formatEntryRef` / `ParsedEntryRef`
- extract-entry-refs.ts: `extractEntryReferences`
- link-index.ts: `buildLinkIndex` / `LinkRef` / `LinkIndex`
- auto-placement.ts: 4 export すべて

---

## 本 PR での削除アクション

**なし**。

プロンプト指示 "A が無ければ削除は行わず inventory 文書だけ作成" に従う。`isValidEntryRef` は B 候補だが、`isPreviewableMedia` のような矛盾根拠がないため積極削除の動機を欠く。

---

## 補足: "foundation 未接続" 仮説の検証結果

round 0 (本 inventory シリーズ開始時) に以下が foundation-only の疑いとして挙がっていた:

| 対象 | 初期疑い | 本 inventory での結論 |
|------|----------|------------------------|
| `entry-ref/entry-ref.ts` | 「transclusion / link 展開の補助、実 wiring 薄いか?」 | **live**: transclusion と action-binder の navigation で中核的に wire 済み |
| `entry-ref/extract-entry-refs.ts` | 「抽出器だけ残って wiring 薄い?」 | **live**: build-subset / link-index / entry-window の 3 箇所から使用 |
| `link-index/link-index.ts` | 「foundation 先行・UI 未接続?」 | **live**: renderer の meta pane で Outgoing / Backlinks / Broken の 3 section を描画 |
| `relation/auto-placement.ts` | 「自動配置、UI から呼ばれているか?」 | **live**: todo / attachment 作成時の reducer + dispatch pre-computation で wire 済み |

いずれも **未接続 foundation ではなく live 実装**。round 0 の疑いは払拭。

---

## 次 PR 候補

### 候補 A: `isValidEntryRef` を削除 (任意 / 非推奨)

- 影響: src 無変更、tests 3 case 削除、docs 無変更、bundle 無変化 (tree-shake 済み想定)。
- 非推奨の理由: `isPreviewableMedia` のような明示的矛盾がなく、積極動機が弱い。PR #36 のように「矛盾解消」ではなく単なる surface 縮小になる。レビューで「なぜ今削るのか」を説明しづらい。

### 候補 B: `link-index` contract 側の見直し (中 / spec 作業)

- `extractRefsFromEntry` / `collectLinkRefs` を contract §3.2 から降格 (internal helper 扱い) すれば C → B → 削除の道が開く。
- これは inventory ではなく contract revision の領域。features round 3 のスコープ外。

### 候補 C: 追加 inventory round 4 (推奨)

次に棚卸ししうる候補:

1. `src/features/markdown/` 一式 (markdown-render / asset-resolver / markdown-toc 等)
2. `src/features/textlog/` 一式 (textlog-body / textlog-doc / log-id 等)
3. `src/features/container/` 一式 (build-subset / diff / snapshot 等)
4. `src/adapter/platform/` 一式 (indexed-db / compression / textlog-bundle / text-bundle)

特に `features/markdown/` は asset-resolver / transclusion / rendered-viewer と絡むので、adapter/ui round 2 で触れた境界が features 側にどう投影されているかを確認する価値が高い。

### 候補 D: round-1 / round-2 inventory docs に "resolved" マーク追記 (補助)

- round-1 の `isPreviewableMedia` 項目を "resolved by PR #36" で更新。
- round-3 (本 PR) で検証した foundation 仮説の結論を round-0 計画文書に反映。
- scope 混線を避けるため別 PR 推奨。

---

## 付録: 調査コマンド

```
対象ファイル:
  - wc -l src/features/entry-ref/*.ts src/features/link-index/*.ts src/features/relation/auto-placement.ts

importer:
  - Grep "from ['\"].*entry-ref/entry-ref|@features/entry-ref/entry-ref"
  - Grep "from ['\"].*extract-entry-refs|@features/entry-ref/extract-entry-refs"
  - Grep "from ['\"].*link-index|@features/link-index"
  - Grep "from ['\"].*relation/auto-placement|@features/relation/auto-placement"

各 export:
  - Grep "\\b<symbol>\\b"

spec 文書:
  - Grep "link-index|auto-placement|entry-ref" -path=docs
```
