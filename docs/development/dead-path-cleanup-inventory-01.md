# Dead Path Cleanup Inventory 01 — adapter/ui 三本

## スコープ

本 inventory は `adapter/ui` 層の legacy / fallback / unreachable path の **初回棚卸し** を目的とする。対象は以下の 3 ファイルに限定し、「即削除」ではなく「dead path 候補」を A/B/C/D に分類することを主眼とする。

- `src/adapter/ui/clipboard.ts`
- `src/adapter/ui/attachment-presenter.ts`
- `src/adapter/ui/folder-presenter.ts`

調査観点:

- export 一覧と import 元の網羅
- 実行時に到達する main path / 到達しない分岐
- テスト被覆の有無
- `docs/` (manual, spec, development) への参照有無
- 残置理由の推定

---

## 分類の定義（再掲）

| 分類 | 条件 |
|------|------|
| A | 即削除可能。src/tests/docs すべてに外部参照なし。安全側。|
| B | 条件付き削除。tests や docs の更新を伴えば削除できる。|
| C | 保留。将来機能 / foundation / 仕様未確定の可能性。|
| D | 誤検知。文字列ヒットはあるが dead path ではない。|

---

## 1. `src/adapter/ui/clipboard.ts`

### Export 一覧

| Export | 種別 |
|--------|------|
| `copyPlainText(text)` | async function |
| `copyMarkdownAndHtml(markdown, html)` | async function |

内部関数: `legacyCopy(text)` (非 export, fallback 実装)

### 外部参照 (src 側)

- `src/adapter/ui/action-binder.ts`
  - `copyPlainText`: 6 call site（dual-edit conflict copy、TEXT/TEXTLOG のマークダウンコピー、entry-ref / asset-ref / entry-embed の参照文字列コピー）
  - `copyMarkdownAndHtml`: 1 call site（"Copy Rendered"）

### 外部参照 (tests 側)

- `tests/adapter/clipboard.test.ts`: 両 export をカバー。

### 到達する main path

- `navigator.clipboard.writeText` → 現代ブラウザの happy-path
- `navigator.clipboard.write([ClipboardItem({...})])` → rich copy
- `document.execCommand('copy')` → happy-dom / legacy browser fallback（**3 段 fallback のうち最深部**）

### 「legacy」文字列ヒットの由来

- `legacyCopy()` は happy-dom test env と古い browser 向けの **意図された fallback** 実装。
- コメント `// fall through to execCommand` / `// fall through to plain text` は 3 段 fallback の説明。
- 文字列としての "legacy" はヒットするが、現行仕様 (FI-01 reject overlay / Copy Rendered / 参照文字列コピー) を支える。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `copyPlainText` / `copyMarkdownAndHtml` | D | 6 + 1 call sites で実運用。誤検知。|
| `legacyCopy` (fallback) | D | happy-dom ＋ 旧環境対応として必要。docs にも明示（docstring 冒頭）。|

**結論**: 本ファイルに dead path は見つからなかった。

### docs/spec 影響

- 削除対象がないため影響なし。

---

## 2. `src/adapter/ui/attachment-presenter.ts`

### Export 一覧 (18 件)

| Export | 種別 | 内部使用 | 外部使用 (src) | tests | docs |
|--------|------|----------|----------------|-------|------|
| `AttachmentBody` | interface | ○ | 0 | 参照型として輸出なし | `docs/planning/17_…md` |
| `parseAttachmentBody` | function | ○ | 7 files | ○ | 複数 |
| `serializeAttachmentBody` | function | ○ | `main.ts`, `action-binder`, `entry-window` | ○ | - |
| `SANDBOX_ATTRIBUTES` | const array | - | `renderer.ts` | ○ | `docs/spec/body-formats.md` |
| `SandboxAttribute` | type alias | ○ | **0** | 0 | 0 |
| `SANDBOX_DESCRIPTIONS` | const record | ○ | `renderer.ts` | ○ | - |
| `estimateSize` | function | ○ | 0 | ○ | - |
| `resolveDisplaySize` | function | ○ (2 call sites) | 0 | ○ | - |
| `generateAssetKey` | function | ○ (1 call site) | 0 | ○ | `docs/spec/data-model.md`, `docs/development/asset-reference-resolution.md` |
| `isLegacyFormat` | function | ○ (1 call site) | 0 | ○ | - |
| `isPreviewableImage` | function | ○ | `asset-picker.ts` | ○ | `attachment-preview-strategy.md` |
| `isSvg` | function | ○ | `renderer.ts` | ○ | `attachment-preview-strategy.md` |
| `isPreviewableMedia` | function | **0** | **0** | ○ (5 case) | `attachment-preview-strategy.md` (1 行の列挙) |
| `isPdf` | function | ○ | 0 | ○ | - |
| `isHtml` | function | ○ | `renderer.ts` | ○ | - |
| `classifyPreviewType` | function | ○ | `renderer.ts`, `action-binder.ts` | ○ | `attachment-preview-strategy.md` |
| `previewModeLabel` | function | ○ (1 call site) | 0 | ○ | `attachment-preview-strategy.md` |
| `attachmentPresenter` | const (Presenter) | - | `main.ts` | ○ | - |
| `collectAssetData` | function | - | `action-binder.ts`, `entry-window.ts` | (間接) | - |

### Dead path 候補の深掘り

#### 候補 1: `isPreviewableMedia`

- 実装は `/^(video\/(mp4\|webm\|ogg)\|audio\/(mp3\|mpeg\|ogg\|wav\|webm))$/i` を用いた厳密な allowlist。
- `classifyPreviewType` は `isPreviewableMedia` を **呼んでいない**。代わりに `/^video\//i` / `/^audio\//i` という緩い prefix match を直接 inline 実装。
- src 内の call site は 0 件。
- `tests/adapter/attachment-presenter.test.ts` に 5 つの直接テスト。
- `docs/development/attachment-preview-strategy.md:48` に判定ヘルパー列挙として 1 行登場。
- **残置理由の推定**: 厳密 allowlist 版として導入された後、preview 分類が `classifyPreviewType` 側へ集約された際に wiring が `isPreviewableMedia` を跨ぐことなく inline 化された結果、孤立 export として残った可能性。
- **注意**: 振る舞いが `classifyPreviewType` の inline 分類と **非互換**（mp4/webm/ogg, mp3/mpeg/ogg/wav/webm のみ許容 vs 全 `video/*` / `audio/*`）。削除時は docs と tests の更新が必須。inline 分類が「緩すぎる」可能性もあるため、security review 観点で別 issue として扱う方が安全。

#### 候補 2: `SandboxAttribute` type

- export されているが外部参照 0 件。内部では `SANDBOX_DESCRIPTIONS: Record<SandboxAttribute, string>` の key 型としてのみ使用。
- `renderer.ts` は `attr as keyof typeof SANDBOX_DESCRIPTIONS` で keyof 経由アクセスし、この型名を import しない。
- docs 参照なし。
- tests 参照なし。
- **これは "dead export" であり、厳密には "dead code" ではない**。`export` キーワードだけ落とせば API surface が縮む。

#### 候補 3: `AttachmentBody` interface

- 型そのものは内部でフル活用。
- 外部 import が 0 件。
- `docs/planning/17_保存再水和可搬モデル.md` に 1 行の固有名参照。
- 削除は不可（内部型として必要）。`export` を外すことは可能だが、docs への影響があり、将来 action-binder 等が interface 参照を必要とする可能性が高い。

#### 「legacy」文字列ヒットの由来

- `AttachmentBody.data` / `isLegacyFormat` / serialize path の legacy round-trip は、**body-assets 分離以前の保存データを読み込むための backward compat**。具体的には:
  - `parseAttachmentBody` が旧 `{ name, mime, data }` を受理
  - `renderBody` が `hasAssetData` / legacy `att.data` 双方から preview 可否を決定
  - `renderEditorBody` が legacy entry に対して `dataField.value = att.data ?? ''` を pre-populate して保存時に lazy migrate
- いずれも **backward compatibility invariant (CLAUDE.md §5)** に属するため、削除は仕様違反。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `isPreviewableMedia` | **B** | src 参照 0 だが tests 5 + docs 1 行の削除が伴う。削除前に「`classifyPreviewType` の inline 判定を厳密化すべきか」という設計判断が先。|
| `SandboxAttribute` 型の `export` | B (cosmetic) | 削除不可だが `export` を落とすことは安全。ただし「dead code 削除」ではなく API surface cleanup。別 PR 対象にするほどの価値は低い。|
| `AttachmentBody.data` (legacy field) | C | 後方互換 invariant。永遠保留 or 別リリースで migration 完了宣言後に検討。|
| `isLegacyFormat` / legacy pre-populate 分岐 | C | 同上。|
| `parseAttachmentBody` / `serializeAttachmentBody` / `attachmentPresenter` / `collectAssetData` / `classifyPreviewType` / `SANDBOX_*` / `isPreviewableImage` / `isSvg` / `isHtml` / `isPdf` / `estimateSize` / `resolveDisplaySize` / `generateAssetKey` / `previewModeLabel` | D | 誤検知。いずれも live。|

### docs/spec/manual 影響

- `isPreviewableMedia` 削除時:
  - `docs/development/attachment-preview-strategy.md:48` を更新。
  - `tests/adapter/attachment-presenter.test.ts` の該当 describe ブロック削除。
  - `classifyPreviewType` の厳密化方針の明文化 (別 PR 推奨)。
- `SandboxAttribute` の `export` 削除時:
  - 影響なし（外部参照なし）。

---

## 3. `src/adapter/ui/folder-presenter.ts`

### Export 一覧

| Export | 種別 |
|--------|------|
| `folderPresenter` | const (DetailPresenter) |

### 外部参照

- `src/main.ts`: `registerPresenter('folder', folderPresenter)`
- `tests/adapter/folder-presenter.test.ts`
- `tests/adapter/action-binder-edit-safety.test.ts`
- `tests/adapter/action-binder-attach-while-editing.test.ts`

### 到達する main path

- `renderBody`:
  1. `entry.body` が空 → empty state
  2. `hasAssetReferences(source)` → `asset:` ref 解決
  3. `hasMarkdownSyntax(source)` → markdown-it 描画 + `expandTransclusions`
  4. plain-text fallback → `<pre class="pkc-view-body">`
- `renderEditorBody`: bare `<textarea>` (folder-ctrl-s-browser-repro.md で議論済みの仕様)
- `collectBody`: `[data-pkc-field="body"]` から値取得

### 「legacy」文字列ヒットの由来

- コメント内の "legacy folders without intentional markdown" / "legacy `<pre>` shape" は、**Slice 3 markdown 対応前の plain-text description を描画互換で残すための意図的設計**。dead path ではない。
- spec: `docs/spec/body-formats.md:413`, `docs/development/embedded-preview-and-cycle-guard.md` が現行仕様として言及。

### 分類

| 対象 | 分類 | 根拠 |
|------|------|------|
| `folderPresenter` | D | live。|
| markdown / plain-text 分岐 | D | 両経路とも現行仕様で到達。|
| bare `<textarea>` | D | `folder-ctrl-s-browser-repro.md` で検証済み。Ctrl+S 保存を阻害しない。|

**結論**: 本ファイルに dead path は見つからなかった。

### docs/spec/manual 影響

- 削除対象がないため影響なし。

---

## 総括

### A 分類（即削除可能）

- **なし**。

「参照なし・テスト影響なし」の基準を厳密に適用すると、本 PR で即削除できる項目は存在しない。`isPreviewableMedia` は src 参照 0 だが tests + docs を伴うため B。

### B 分類（条件付き削除）

1. `isPreviewableMedia` — src 0 参照 + tests 5 ケース + docs 1 行。削除には設計判断 (`classifyPreviewType` の厳密化方針) を先行させるべき。
2. `SandboxAttribute` 型の `export` — cosmetic cleanup。単独 PR には弱い。

### C 分類（保留）

1. `AttachmentBody.data` legacy field — backward compat invariant。
2. `isLegacyFormat` / legacy pre-populate 分岐 — backward compat invariant。

### D 分類（誤検知）

- `copyPlainText` / `copyMarkdownAndHtml` / `legacyCopy` — 全て live。
- `attachmentPresenter` とその主要ヘルパー群 — 全て live。
- `folderPresenter` と markdown/plain-text 分岐 — 全て live。

---

## 本 PR での削除アクション

**なし**。

プロンプト指示 "4. A が無ければ削除は行わず、inventory 文書だけ作成、次PR候補を提案する" に従い、本 PR では削除を行わず本 inventory 文書のみをコミットする。

---

## 次 PR 候補

優先順:

### 候補 A (推奨): `isPreviewableMedia` の扱い決定 + 削除 or 昇格

設計判断 2 択:

1. **削除方針**: `classifyPreviewType` の `video/*` / `audio/*` 緩い prefix match を正とし、`isPreviewableMedia` を厳密 allowlist と見なして削除。tests + docs line 1 行を削除。
2. **昇格方針**: 厳密 allowlist を正とし、`classifyPreviewType` 内部で `isPreviewableMedia` を呼び出すよう wiring 修正。security 面でより安全。

**推奨**: 2 (昇格)。理由: 任意 MIME を含む `audio/*` / `video/*` は新出コーデックやブラウザ依存があり、allowlist のほうが安全側。1 の削除方針は ad-hoc 修正で後から現れた緩めの match を正として固定化するリスクがある。

### 候補 B: `adapter/ui` 周辺の横断棚卸し第 2 回

次に棚卸しすべきファイル群（本 PR では触れていない）:

- `src/adapter/ui/transclusion.ts` — docs `entry-transformation-and-embedded-preview.md` 経路と実装の差分確認
- `src/adapter/ui/rendered-viewer.ts` — 最新の preview 経路統合後に孤立関数がないか
- `src/adapter/ui/entry-window.ts` — 大きめのファイル。archetype-display docs と照合
- `src/adapter/ui/asset-picker.ts` — `asset-picker-foundation.md` 経路と実 wiring

### 候補 C: `src/features/` 層の foundation inventory

本 PR の対象外。

- `src/features/entry-ref/`
- `src/features/link-index/`
- `src/features/relation/auto-placement.ts`

いずれも「docs 先行 foundation」の可能性があり、実 wiring を先に確認する必要がある。

---

## 付録: 調査コマンド

```
# import 元の網羅
Grep: "from ['\"].*adapter/ui/<file>['\"]"

# 各 export の利用状況
Grep: "\\b<export>\\b" (src / tests / docs)

# legacy / fallback / unreachable 痕跡
Grep: "legacy" -i (対象ファイル)
```
