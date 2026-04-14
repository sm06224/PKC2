# Merge Import — Tier 3-1 Implementation Notes

**Status**: COMPLETED — Tier 3-1（2026-04-14）
**Spec**: `docs/spec/merge-import-conflict-resolution.md`（canonical）
**Invariants**: I-Merge1 / I-Merge2（`HANDOVER_FINAL.md` §18.2）
**Scope**: Overlay MVP — append-only merge import。spec 通りに MVP
契約を厳守し、Option B / C 要素は一切入れない。

## 1. 実装した範囲

| 要素 | 変更 |
|------|-----|
| pure helper | 新規 `src/features/import/merge-planner.ts`（`planMergeImport` / `applyMergePlan`） |
| user action | 新規 `CONFIRM_MERGE_IMPORT`（payload `{ now: string }`）と `SET_IMPORT_MODE`（`{ mode: 'replace' \| 'merge' }`） |
| domain event | 新規 `CONTAINER_MERGED`（`{ container_id, source, added_entries, added_assets, added_relations }`） |
| AppState | optional field `importMode?: 'replace' \| 'merge'` を追加（defaulted to 'replace' when absent） |
| reducer | `SYS_IMPORT_PREVIEW` / `CANCEL_IMPORT` / `CONFIRM_IMPORT` で `importMode` を適切にリセット。新規 `SET_IMPORT_MODE` / `CONFIRM_MERGE_IMPORT` case |
| renderer | `renderImportConfirmation(preview, mode, host)` に mode radio + mode 依存のサマリ（5 行）を追加 |
| action-binder | `confirm-merge-import` / `set-import-mode` ケースを追加 |
| docs | spec 2 本に I-IO1b / implemented 印を追加、HANDOVER §18.5 A を完了に |
| tests | 29 件追加（planner 13、reducer + integration + UI 16） |

## 2. 重要な設計判断

### 2.1 `importMode` は optional
AppState に `importMode?: 'replace' | 'merge'` で optional として追加
した。理由: 既存テストが `AppState` リテラルを手で組み立てている箇所
が 20 箇所以上あり、必須化すると massive diff になる。optional で
read 側は `state.importMode ?? 'replace'` で扱う。createInitialState
では常に `'replace'` で初期化される。

### 2.2 2 action 分離
- `CONFIRM_IMPORT`（既存、無変更）= full replace 経路
- `CONFIRM_MERGE_IMPORT`（新規）= Overlay 経路

`CONFIRM_IMPORT` に `mode` payload を後付けする案もあったが、2 経路を
明示的に分離することで既存 test が完全に regression 耐性を持つ。
spec §7.3 の推奨にも整合。

### 2.3 lid / asset key minting は pure helper 内で完結
`app-state.ts` の `generateLid()` は Date.now + counter の runtime
stateful helper で、features 層から使えない。merge-planner は `now`
を引数で受け取り、`m-<stamp>-<seq>` / `<key>-m<stamp>-<seq>` のパ
ターンで collision-free な id を deterministic に生成する。

### 2.4 UI の件数サマリは render 時に再計算
mode radio を切り替えると、reducer で `importMode` が更新され →
renderer が `planMergeImport(state.container, state.importPreview.container, now)`
を再実行して 5 行のサマリを更新する。`MergePlan` は AppState に
格納しない（stale になると preview と実際の commit 結果がずれるリス
ク）。reducer は CONFIRM 時にもう一度 planner を走らせる。

### 2.5 Orphan auto-GC を merge 経路にも wiring
I-AutoGC1 は import 経路 3 本に限定する契約だが、merge import は
「container replacement の自然な延長」なので同じ rationale が効く
（imported の revision を drop する以上、purge 済み asset を restore
する経路がない）。そのため merge 後にも `removeOrphanAssets` を
走らせて `ORPHAN_ASSETS_PURGED` イベントを発する。

## 3. ファイル変更一覧

### 新規
- `src/features/import/merge-planner.ts`（pure, ~230 行）
- `tests/features/import/merge-planner.test.ts`（13 件）
- `tests/adapter/merge-import.test.ts`（16 件）
- `docs/development/merge-import-implementation.md`（本書）

### 変更
- `src/core/action/user-action.ts` — `CONFIRM_MERGE_IMPORT` +
  `SET_IMPORT_MODE` 追加
- `src/core/action/domain-event.ts` — `CONTAINER_MERGED` 追加
- `src/adapter/state/app-state.ts` — `importMode` field、2 新 case、
  既存 3 case でリセット
- `src/adapter/ui/renderer.ts` — `renderImportConfirmation` を mode
  対応に改修
- `src/adapter/ui/action-binder.ts` — 2 ケース追加
- `docs/spec/data-model.md` — I-IO1b 追加、§11.7.4 / §15.5 の文言更新
- `docs/spec/merge-import-conflict-resolution.md` — Status を
  "implemented"、変更履歴 1 行追加
- `docs/planning/HANDOVER_FINAL.md` — §18.5 / §18.7 の進捗反映
- `docs/development/INDEX.md` — #67 として追加

## 4. テスト 29 件の内訳

### 4.1 planner（13 件）
- planMergeImport — 9 件（schema mismatch、lid passthrough、lid
  rename、asset dedup、asset rehash、dangling relation drop、relation
  dedup、revision drop、empty imported）
- applyMergePlan — 4 件（host 不変、asset ref rewrite、relation remap、
  host.meta.updated_at のみ更新）

### 4.2 reducer（7 件）
- SET_IMPORT_MODE — 2 件（切替、preview 無しで no-op）
- CONFIRM_MERGE_IMPORT — 4 件（append、preview 無しで blocked、
  schema-mismatch で blocked、CONTAINER_IMPORTED を emit しない）
- CONFIRM_IMPORT regression — 1 件（importMode=merge でも replace
  が動作、既存挙動保全）
- CANCEL_IMPORT — 1 件（importMode リセット）

### 4.3 integration（3 件）
- dedupe + rename combo
- 2 回 merge で append semantics（dedup しない）
- merge 後の orphan auto-GC

### 4.4 UI（5 件）
- mode radio が出る、デフォルト replace
- mode=merge で 5 行サマリ + confirm-merge-import button
- schema 不一致で merge 確定ボタンが disabled
- mode radio クリックで SET_IMPORT_MODE が dispatch され、再 render
  で merge サマリが出る
- confirm-merge-import クリックが CONFIRM_MERGE_IMPORT + `now` を
  dispatch する

## 5. Spec §8（非スコープ）に含めた項目

以下は **MVP に入れていない**（spec 通り）。

- per-entry 選択 UI
- title / body ハッシュによる同一性判定
- Revision 持ち込み（bulk_id 含む）
- Policy UI（Option B 相当）
- Staging container（Option C 相当）
- Schema migration（schema-mismatch は error で reject）
- Folder semantic merge
- Bulk_id の container 越境保持
- Merge 自体の 1 クリック revert

これらは spec §9 将来拡張として後付け可能。MVP 実装は後付けの邪魔に
ならない形を保っている。

## 6. Backward compatibility

- 既存 `CONFIRM_IMPORT` path は 1 ビットも変更なし
- 既存 import preview UI は mode radio 追加以外は無変更
- 既存テスト 3578 件は全 pass（importMode を optional にすることで
  AppState リテラルを手組みする既存 fixture が壊れない）
- production code へは 4 ファイル（pure helper 1 / reducer 1 /
  renderer 1 / action-binder 1）のみの touch

## 7. 既知の制約

### 7.1 merge 実行時の新 lid は手動で再選択しない
merge 後の selection は host 側のまま保持（spec §6.2 の append-only
契約の自然な帰結）。imported 側のどの entry が merge されたかは
`CONTAINER_MERGED` event の `added_entries` 件数でしか確認できない。

### 7.2 Merge の 1-click revert は無し
各 imported entry を個別に `DELETE_ENTRY` で消す必要がある。spec
§9.1 の merge_session_id 拡張は将来実装。

### 7.3 Preview UI は planner を 2 回走らせる
render 時の件数表示用に 1 回、CONFIRM 時の commit 用にもう 1 回。
planner は pure で軽量（typical entry 数 100 件未満で O(N+M)）なので
実害はない。結果が確実に一致するメリットが勝る。

## 8. 参考コード位置

- `src/features/import/merge-planner.ts`（全体）
- `src/adapter/state/app-state.ts`
  - L23: import追加
  - L56+: AppState.importMode 定義
  - L160+: createInitialState の初期値
  - SYS_IMPORT_PREVIEW / CONFIRM_IMPORT / CONFIRM_MERGE_IMPORT /
    SET_IMPORT_MODE / CANCEL_IMPORT の各 case
- `src/adapter/ui/renderer.ts`
  - L217: renderImportConfirmation 呼び出し箇所（シグネチャ拡張）
  - L2700+: renderImportConfirmation 本体
- `src/adapter/ui/action-binder.ts`
  - confirm-merge-import / set-import-mode の case
- `src/core/action/user-action.ts` L61-63: 新 action 3 種
- `src/core/action/domain-event.ts` L29: CONTAINER_MERGED
- `tests/features/import/merge-planner.test.ts`
- `tests/adapter/merge-import.test.ts`

## 9. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 3-1 実装と同時） |
