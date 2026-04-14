# CHANGELOG — PKC2 v0.1.0

**Release date**: 2026-04-13 (proposed)
**Branch**: `claude/pkc2-handover-restructure-WNRHU`
**Status**: プレリリース（pre-release）

前回のマージポイント（`main` の `25f028a Merge claude/design-multilingual-spec-953wO`）
から本ブランチが到達した状態までの差分 CHANGELOG。266 files / +75,159 /
-705 行の大規模ブランチで、Slice 1〜6 および P0/P1 主要タスクを全て含む。

フォーマット: [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に
準拠し、`Added` / `Changed` / `Fixed` / `Internal` の 4 区分で整理する。

---

## Added

### TEXTLOG ↔ TEXT 相互変換（P1 Slice 4 / 5）

- **TEXTLOG → TEXT 変換**（Slice 4）
  - TEXTLOG viewer に「Begin log selection」ボタンを追加。per-log に
    checkbox を表示し、複数選択の上でプレビューモーダルを開ける
  - プレビューは `features/textlog/textlog-to-text.ts` の純関数で計算、
    title と markdown body を表示
  - Confirm で新 TEXT エントリを生成（元 TEXTLOG は不変）
  - meta 自動追加: どの TEXTLOG から生まれたかの backlink log

- **TEXT → TEXTLOG 変換**（Slice 5）
  - TEXT viewer に「→ TEXTLOG に変換」ボタン
  - 分割モード radio: ATX heading (`#`, `##`, `###`) / horizontal rule (`---`)
  - プレビューモーダルで log 構造を確認した上で確定
  - 新 TEXTLOG 生成、title 編集可能（auto-title と user-edit を data-attr で判別）

### embed 拡張 / cycle guard（P1 Slice 2）

- 全 markdown surface（TEXT / TEXTLOG / TODO description / FOLDER description）
  で `![](entry:<lid>)` の transclusion をサポート
- 対応 archetype: `text` / `textlog` / `todo` / `attachment` / `folder`
- 5 種の embed guard:
  - depth > 1 → "embed is limited to one level" placeholder
  - cycle detection → "cycle detected" placeholder
  - self-reference → "self-reference blocked" placeholder
  - missing entry → "missing entry: <lid>" placeholder
  - invalid ref → "(invalid entry ref: ...)" placeholder
- 全 placeholder は `data-pkc-embed-blocked` 統一属性で output
- 「TODO embed を含む TEXT」→ TODO の status カードがインライン展開

### TODO / FOLDER description の markdown 化（P1 Slice 3）

- TODO の `description` が markdown としてレンダリング（`hasMarkdownSyntax`
  で自動判別）
- FOLDER の body も同様に markdown レンダリング。folder がダッシュボード
  代わりに使える
- 他 Entry 埋め込み（`![](entry:<todo-lid>)` や asset 画像）が TODO /
  FOLDER 内でも使える
- legacy 形式（plain text body）は変更なしでレンダリング可能
- build-subset が TODO / FOLDER description も scan して closure に含める

### pane 再トグル shortcut（P1 Slice 6）

- `Ctrl+\` / `Cmd+\` — 左ペイン（サイドバー）を表示 / 非表示
- `Ctrl+Shift+\` / `Cmd+Shift+\` — 右ペイン（情報パネル）を表示 / 非表示
- 同じショートカットで元に戻せる（state は session 内のみ保持、永続化なし）

### bulk operation snapshot（bulk_id）

- `Revision` に optional `bulk_id?: string` field 追加
- `BULK_DELETE` / `BULK_SET_STATUS` / `BULK_SET_DATE` で作られる N 件の
  revisions が共通 `bulk_id` を持つ
- 単体操作（COMMIT_EDIT / DELETE_ENTRY / QUICK_UPDATE_ENTRY / RESTORE_ENTRY）
  では `bulk_id` absent を維持（JSON footprint 不変）
- `getRevisionsByBulkId(container, bulkId)` クエリヘルパー追加（created_at
  昇順で全 revisions を返す）
- 将来の "restore whole bulk" UI の下地として integrate。現状の UI は変化なし

### データモデル仕様書（P0-1）

- `docs/spec/data-model.md` 新規作成（867 行）
  - Container / ContainerMeta / Entry / ArchetypeId / Relation / Revision /
    Assets の JSON schema を正本化
  - 識別子階層（cid / lid / rid / log-id）、タイムスタンプ規約
  - IDB 保存レイアウト、HTML Export 契約、ZIP Export 契約、Sister Bundle 契約
  - データモデル不変条件（I-C1 〜 I-IO3）
  - 後方互換性と migration 原則
  - §11.7: ZIP import collision policy（P0-5 で追加）

- `docs/spec/body-formats.md` 新規作成（870 行）
  - 8 archetype 別 body 契約
  - asset 参照記法（`asset:<key>`）、entry 参照 / embed 記法（`entry:<lid>`）
  - parse / serialize 契約総括、title 派生、status
  - Import/Export 時の body 扱い、legacy 形式と migration
  - body レベル不変条件（I-B1 〜 I-BF2）

- `docs/planning/HANDOVER_SLICE6.md` 新規作成（Slice 6 完了時点の棚卸し）

### round-trip テスト基盤（P0-2a / P0-2b）

- `tests/adapter/round-trip/` ディレクトリ新規作成
- 成功パス 5 経路（15 tests）
  - HTML Full / HTML Light / ZIP / text-bundle / textlog-bundle
  - 各経路で logical equivalence rule を明示
  - spec 節番号を inline comment で参照
- 境界ケース観測（28 tests）
  - CompressionStream 有/無 両パス
  - ZIP `meta.updated_at` 時刻進行挙動
  - text-bundle 空 title fallback
  - asset key 文字集合境界（ASCII / 日本語 / 特殊文字）
  - TEXTLOG flags unknown 値の CSV 損失
  - CRLF / LF / mixed line endings の全経路保全
- ZIP collision 検知テスト（15 tests、P0-5）
  - 5 種の warning code をケース別に pin

### ZIP import collision 検知（P0-5）

- `importContainerFromZip` に silent overwrite 禁止を追加
- `ZipImportWarning` / `ZipImportWarningCode` 型を新規 export
- 5 種の警告コード:
  - `DUPLICATE_ASSET_SAME_CONTENT` — 同 key + 同 bytes、dedup
  - `DUPLICATE_ASSET_CONFLICT` — 同 key + 異 bytes、first-wins + warn
  - `DUPLICATE_MANIFEST` — manifest.json が複数
  - `DUPLICATE_CONTAINER_JSON` — container.json が複数
  - `INVALID_ASSET_KEY` — path-unsafe key（空 / `.` / `..` / `/` / `\`）
- Import 自体は失敗させず `ZipImportSuccess.warnings?: ZipImportWarning[]`
  で返す
- ZIP が clean なら warnings field は absent（空配列でなく省略、presence が
  シグナル）

### ZIP warnings UI surface（P0-5b）

- `src/adapter/ui/zip-import-warnings.ts` 新規（pure formatter）
  - `formatZipImportWarning(w)` — 単一警告を人間向け 1 行に整形
  - `summarizeZipImportWarnings(warnings)` — summary + details を返す
  - 複数警告は count + most-common kind で集約
  - 1 warning 時は per-warning text をそのまま表示
- `main.ts` ZIP import handler から warn-kind toast で surface
- 全 warning で `kind: 'warn'`、`'error'` は使わない（import は成功のため）
- console.warn で detail を 1 件ずつ出力（operator audit trail）

### UI singleton audit ドキュメント

- `docs/development/ui-singleton-state-audit.md` 新規（281 行）
- 6 対象について A（reducer 編入）/ B（clear hook）/ C（現状維持）で分類
- 実装コスト・テスト方針・将来拡張の余地を明示

### textlog-preview-modal auto-close sync

- `syncTextlogPreviewModalFromState(state)` 関数を追加
- `renderer.ts` から 1 行で呼ぶ close-only sync
- 2 ルールで自動 close:
  - rule (1): `state.textlogSelection === null && activeModal !== null`
  - rule (2): `activeModal !== null && !activeModal.isConnected`（orphan 掃除）
- SELECT_ENTRY 別 lid / BEGIN_EDIT / DELETE_ENTRY / SYS_IMPORT_COMPLETE で
  modal singleton pointer を正しく null に

### ユーザーマニュアル全面アップデート

- `docs/manual/` の 9 章すべてを v0.1.0 機能に追従
- 新節 15 本を追加:
  - multi-select と一括操作、Drag & Drop、コンテキストメニュー、別ウィンドウ
    表示、TEXT ↔ TEXTLOG 変換、Batch Import、ZIP Import warnings、など
- キーボードショートカット章に 6 Phase ナビゲーション / pane toggle / Escape
  優先順位を追加
- `docs/manual/images/README.md` に「差し替え推奨リスト」を追加

---

## Changed

### Revision parse 契約の strict 化（P0-4）

- `parseRevisionSnapshot(rev)` の契約を tighten
- 受け入れ条件を以下に厳格化:
  - JSON.parse が成功し、結果が非 null の plain object
  - `lid` が **非空** string
  - `title` / `body` が string
  - `archetype` が 8 種の既知値（whitelist）
  - `created_at` / `updated_at` が string
- 未知 archetype / 空 lid / timestamp 欠落は **null 返却**（silent corruption
  を排除）
- `restoreEntry` に archetype-mismatch guard 追加（現 entry の archetype と
  snapshot の archetype が異なる場合は container 無変更で返す）

### `meta.updated_at` の ZIP import 挙動を spec に明文化（F1）

- ZIP import 時、`meta.updated_at` は **import 時刻で無条件上書き**
- source の `updated_at` は保持されない（spec §11.4 / §11.5 / §12.3 / §14.1
  I-C4 に反映）
- F1 監督判断に従い「spec を実装に寄せる」方針を採用

### text-bundle title の trim 挙動を canonical 化（F2）

- text-bundle import は `source_title.trim() || 'Imported text'`
- 空 / whitespace-only → `'Imported text'` fallback
- 前後空白付きの title → 空白が除去される（body-formats.md §13.4.1 に明記）

### textlog-bundle (CSV) を lossy format として明言（F3）

- body-formats.md §3.6.1 新設
- CSV schema は固定 5 列（`log_id` / `timestamp_iso` / `timestamp_display` /
  `important` / `text_markdown`）
- `important` 以外の flag は CSV 経由で失われる（将来の flag 追加時に顕在化）
- JSON 経路（HTML Full / ZIP）は `flags: string[]` を完全保持

### UI singleton state の reducer 編入（P1-1）

- `AppState.textlogSelection?: TextlogSelectionState | null` 追加
- `AppState.textToTextlogModal?: TextToTextlogModalState | null` 追加
- 6 つの新 UserAction:
  - `BEGIN_TEXTLOG_SELECTION` / `TOGGLE_TEXTLOG_LOG_SELECTION` /
    `CANCEL_TEXTLOG_SELECTION`
  - `OPEN_TEXT_TO_TEXTLOG_MODAL` / `SET_TEXT_TO_TEXTLOG_SPLIT_MODE` /
    `CLOSE_TEXT_TO_TEXTLOG_MODAL`
- 既存 action への clear 論理追加:
  - `SELECT_ENTRY`（別 lid 時のみ）/ `DESELECT_ENTRY` / `BEGIN_EDIT` /
    `DELETE_ENTRY`（当該 lid 時のみ）/ `SYS_IMPORT_COMPLETE`
- `textlog-selection.ts` / `text-to-textlog-modal.ts` が reducer mirror
  または DOM sync 方式に書き換え
- action-binder が dispatch 経由に完全移行、mutator 直接呼び出しは全廃

### entry-window live-refresh の gate 拡張（P1-2）

- `wireEntryWindowLiveRefresh` / `wireEntryWindowViewBodyRefresh` の gate
  を `prevAssets !== nextAssets` から `prevAssets !== nextAssets OR
  prevEntries !== nextEntries` に広げる
- TODO embed stale（別窓で host を表示中に TODO を更新しても追従しない）を解消
- view-body wiring に host-identity 変化 / hasAssetRef / hasEntryRef 検査を追加
- 5 経路の stale 表示が解消（P0-2a 棚卸し TOP 5）

---

## Fixed

### ZIP import silent overwrite（P0-5）

- 複数の `assets/<key>.bin` が含まれる不正な ZIP で、最後の 1 件が silent に
  上書きされていた問題を修正
- 全 duplicate entry を warning として記録し、first-wins policy で
  deterministic に解決

### Revision restore の silent archetype corruption（P0-4）

- 旧 / hand-crafted snapshot に未知 archetype が含まれる場合、
  `restoreDeletedEntry` が `addEntry(container, lid, <bogus archetype>, ...)`
  を呼んで Entry を corrupt していた問題を修正
- strict parse が無効 archetype を reject、restore 経路に入らなくなった

### Revision restore の archetype mismatch による body 破壊

- 旧 snapshot の archetype と現 Entry の archetype が異なる場合、
  `restoreEntry` が title + body を上書きしてしまい、body format が archetype
  と不整合になる問題を修正
- archetype mismatch guard を追加、不整合 restore は container 無変更で返す

### TEXTLOG selection mode の残留チェックボックス

- 別エントリ選択後も旧 TEXTLOG のチェック状態が新 viewer に表示される可能性
  があった問題を、P1-1 の reducer 編入で解消
- SELECT_ENTRY で activeLid 一致しない場合は selection を clear

### TEXT → TEXTLOG preview modal の BEGIN_EDIT 時残存

- preview modal を開いたまま BEGIN_EDIT した場合、structured editor の上に
  overlay が残存する可能性を P1-1 の reducer clear で排除

### entry-window の TODO embed stale

- 別窓で TEXT を表示中に main window で embed 先の TODO を更新しても
  preview が古いままだった問題を P1-2 で解消
- entries identity change が wiring の trigger に加わる

### textlog-preview-modal の stale pointer

- renderer の `root.innerHTML = ''` で overlay が detach された後、
  `activeModal` singleton が stale な DOM ノードを保持し続ける問題を、
  renderer 駆動 close-only sync で解消

---

## Internal

### Test 基盤

- 新規 test files 追加:
  - `tests/adapter/round-trip/_helpers.ts`（共有 fixture）
  - `tests/adapter/round-trip/html-full.test.ts`
  - `tests/adapter/round-trip/html-light.test.ts`
  - `tests/adapter/round-trip/zip.test.ts`
  - `tests/adapter/round-trip/text-bundle.test.ts`
  - `tests/adapter/round-trip/textlog-bundle.test.ts`
  - `tests/adapter/round-trip/boundary-compression.test.ts`
  - `tests/adapter/round-trip/boundary-zip-meta.test.ts`
  - `tests/adapter/round-trip/boundary-bundle-edge.test.ts`
  - `tests/adapter/round-trip/boundary-body-content.test.ts`
  - `tests/adapter/round-trip/zip-collision.test.ts`
  - `tests/adapter/entry-window-entries-refresh.test.ts`
  - `tests/adapter/zip-import-warnings.test.ts`
  - `tests/adapter/zip-import-warnings-toast.test.ts`
  - `tests/adapter/textlog-preview-modal-sync.test.ts`
  - `tests/core/app-state-p1-1-clear.test.ts`
  - `tests/core/bulk-snapshot.test.ts`
  - `tests/core/app-state-bulk-snapshot.test.ts`

- Test 統計: 3378 → **3556**（+178 tests、全 pass）

### Dependency / 構成

- `node_modules` の dev install が必要な状況で `npm install` → 243 packages
  取得。production dependencies には変更なし
- Vite 6.4.2、Vitest 3.2.4 で動作確認

### Build

- `dist/bundle.js`: 488.80 → 495.28 kB（+6.48 kB）
- `dist/bundle.css`: 72.31 kB（不変）
- `dist/pkc2.html`: `build:release` で更新（本ブランチでは明示的に触らず）

### Spec 拡張

- `docs/spec/data-model.md` に以下の新節:
  - §6.3 bulk_id の含めた table
  - §6.3.1 bulk_id の保証契約
  - §6.4.4 failure contract 総括表
  - §11.7 ZIP import collision policy
  - §16 に 5 項目の「解決済み」マーク追加

- `docs/spec/body-formats.md` に:
  - §3.6.1 textlog-bundle lossy 宣言
  - §13.4.1 text-bundle title trim canonical 化

### Observability

- `ZipImportSuccess.warnings?: ZipImportWarning[]` を追加（optional、空配列
  ではなく absent を clean シグナルとする）
- `getRevisionsByBulkId(container, bulkId): Revision[]` クエリ API 追加
- console.warn への diagnostic 出力系統を warnings 経路でも維持

### コミット履歴（main から本ブランチへの 14 コミット）

```
7130f5b  textlog-preview-modal: renderer-driven auto-close sync
020f44d  docs: UI singleton state audit (post-P1-1 remainder)
1ff4508  A10: close build-subset cycle & multi-path observation gaps
47fc34c  bulk ops: group snapshots via Revision.bulk_id
95584db  manual: follow implementation through P1-1 and warnings surfacing
a051fb1  ZIP import warnings: surface to toast (P0-5 follow-through)
11e5fe0  P1-1: move UI singleton state into the reducer
9b4f8b9  P0-4: tighten Revision snapshot parse / restore failure contract
673941d  P1-2: entry-window live-refresh now tracks entries-identity changes
d3348fd  P0-5: detect asset-key collisions on ZIP import (+ F1/F2/F3 spec)
2757425  P0-2b: surface round-trip boundary cases (observation-only)
8519b1f  P0-2a: introduce round-trip success-path test suite
c3e3fe3  P0-1: canonicalize data-model and body-format specifications
a12de52  Slice 2-6: Embed fallback unification, TODO embeds, TEXTLOG↔TEXT conversion
```

---

## Migration Notes

**既存 Container の扱い**: 全て後方互換。このリリース以降で保存された
Container を v0.0.x で読んだ場合:

- `Revision.bulk_id` は unknown field として無視される（破壊なし）
- `AppState.textlogSelection` / `textToTextlogModal` は optional のため
  既存 test fixture に手を入れなくてよい

**古い Container をこのリリースで開いた場合**:
- `revisions` が array でない古い snapshot も `importer.ts` の補填で `[]`
  にフォールバック
- legacy attachment（`data` inline）は lazy migration で next save 時に
  new format に書き戻される
- `schema_version === 1` を満たさないものは import 時に `SCHEMA_MISMATCH`
  で拒否される（既存挙動、不変）

**API 変更**:
- `snapshotEntry(container, lid, revisionId, now)` に第 5 引数 `bulkId?:
  string` を optional 追加。既存 caller は影響なし
- `ZipImportSuccess` に `warnings?: ZipImportWarning[]` を optional 追加。
  既存 destructuring は動く

**非互換変更**: なし。v0.1.0 は v0.0.x からの pure superset。

---

## Known Issues

- **Pre-existing lint errors**: `no-restricted-imports` ルールが adapter →
  features import を 80 件エラーとして検出している。規則自体が `CLAUDE.md`
  の層規則と逆で、実装上は合法。本リリースでは無変更で放置（P2 で解消予定）
- **Manual screenshot**: v0.1.0 の新 UI（multi-select / DnD / コンテキスト
  メニュー / 別窓 / Batch Import / ZIP warning toast）が既存スクリーンショット
  に反映されていない。`docs/manual/images/README.md` に差し替え推奨リスト
  記載済み、実画像差し替えは後続タスク
- **`dist/pkc2.html`**: 本ブランチでは `build:release` を明示実行していない。
  リリース前に `npm run build:release` で更新することを推奨

---

## Next Release Targets

詳細は `docs/planning/HANDOVER_FINAL.md §7` を参照。

- v0.1.x patch: screenshot 差し替え、CI 導入、i18n 基盤
- v0.2.0: merge import、complex archetype 系、bulk restore UI
- v0.3.0+: P2P / multi-user（vision 文書参照）

---

## 変更履歴（この CHANGELOG ファイル自体の）

| 日付 | 変更 |
|-----|-----|
| 2026-04-13 | v0.1.0 リリース note 初版 |
