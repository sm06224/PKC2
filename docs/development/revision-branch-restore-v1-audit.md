# C-1 revision-branch-restore v1 — post-implementation audit

Status: FINAL
Audited: 2026-04-17
Scope: pure slice + reducer/state slice + UI picker slice（post-UI）
Contract: [`docs/spec/revision-branch-restore-v1-behavior-contract.md`](../spec/revision-branch-restore-v1-behavior-contract.md)

---

## 0. 位置づけ

C-1 v1 の 3 slice（pure / state / UI）実装後に、contract と実装の整合性を確認する統合監査。本書は v1 の最終 gate であり、ここで「問題なし」が確定した時点で manual sync に進む。

コミット履歴:

| slice | commit |
|---|---|
| behavior contract | `3236b0b` |
| pure slice | `e09b6cb` |
| reducer/state slice | `c5ce6f7` |
| UI picker slice | `5f506e4` |
| release rebuild（state slice 直後） | `0ebeae5` |

---

## 1. 監査観点

contract §3 invariance（I-Rbr1〜10）、§6 gate、§7 UI contract、§8 error paths の 4 柱に対して、3 slice の実装コードとテストが契約に実際に従っているかを、ソースとテストの両方から読み直して確認する。

監査対象ファイル:

- `src/core/operations/container-ops.ts` の `branchRestoreRevision`（L591-647）
- `src/adapter/state/app-state.ts` の `reduceReady` 内 `BRANCH_RESTORE_REVISION` case（L784-821）
- `src/adapter/state/app-state.ts` の `reduceEditing` default 経路（L1667）
- `src/adapter/ui/renderer.ts` の revision picker block（`renderMetaPane` 末尾）
- `src/adapter/ui/action-binder.ts` の `branch-restore-revision` case
- `tests/core/branch-restore.test.ts`（14 件）
- `tests/core/app-state-branch-restore.test.ts`（12 件）
- `tests/adapter/revision-branch-restore-ui.test.ts`（10 件）

---

## 2. 監査結果サマリ

**総合判定: 問題なし。manual sync へ進んで良い。**

| 領域 | 判定 | 根拠 |
|---|---|---|
| Pure contract | OK | `branchRestoreRevision` は外部注入 deterministic、5 guard 経由の no-op、最小コピー、canonical provenance 向き |
| State / reducer | OK | 6 gate 全て state identity 保持、success で `selectedLid = newLid`、`RESTORE_ENTRY` は一切変更されず |
| UI semantics | OK | picker は newest-first、任意 revision 対象、readonly でボタン抑止、0 件で非 mount、既存 Revert 温存 |
| Invariance I-Rbr1〜10 | OK | 全 10 条の実装対応を確認。詳細は §4 |
| End-to-end | OK | pure → reducer → UI の 36 件 test が緑、invalid / stray / mismatch は safe no-op |

実行確認: `npx vitest run tests/core/branch-restore.test.ts tests/core/app-state-branch-restore.test.ts tests/adapter/revision-branch-restore-ui.test.ts` → 3 files / 36 pass / 0 fail。

---

## 3. 監査所見（領域別）

### 3.1 Pure contract — `branchRestoreRevision`

`src/core/operations/container-ops.ts:591-647`。

| 観点 | 実装 | 判定 |
|---|---|---|
| deterministic（I-Rbr10） | `newLid` / `relationId` / `now` は引数受け取り、内部で `Date.now()` や `generateLid()` を呼ばない | OK |
| 元 entry 不変 | `addEntry(..., newLid, ...)` / `updateEntry(..., newLid, ...)` は新 entry のみを対象。source entry 側の title / body / updated_at / archetype は一切参照書き換えなし | OK |
| 最小コピー | snapshot の `archetype` / `title` / `body` のみ、`created_at` / `updated_at` は `now` で上書き。title 装飾なし | OK（契約 §0.1-2） |
| provenance 向き | `from: entryLid, to: newLid` でリテラル固定（L635-636 にコメント `// source (I-Rbr9 canonical direction)`） | OK（I-Rbr9） |
| `source_content_hash` | `revision.content_hash !== undefined` 時のみ metadata に追加（L629-631）、absent 時は omit | OK（§4.1） |
| reject 経路 | revision absent / snapshot parse 失敗 / entry_lid mismatch / source entry 不在 / newLid collision / relationId collision の 6 パターンで `return container` | OK（§8） |

### 3.2 Reducer — `BRANCH_RESTORE_REVISION` case

`src/adapter/state/app-state.ts:784-821`。

| 観点 | 実装 | 判定 |
|---|---|---|
| Gate §6.1 完全性 | `!container` / `readonly` / `viewOnlySource` / `editingLid !== null` / `importPreview` / `batchImportPreview` の 6 gate すべてを実装 | OK |
| state identity 保持 | 各 gate は `blocked(state, action)` を返し、`state` 参照をそのまま返す | OK |
| editing phase | `reduceReady` には到達しない（`phase='editing'` は `reduceEditing` に routing）。`reduceEditing` は `default: return blocked(...)` で blocking。UI test 9 でも確認済 | OK |
| `selectedLid = newLid` | 成功時のみ `{ ...state, container, selectedLid: newLid }` | OK |
| pure reject | `container === state.container` イディオムで再 blocked に流す（L809） | OK |
| event emission | `ENTRY_BRANCHED_FROM_REVISION { sourceLid, newLid, revision_id }` 1 件のみ。`RELATION_CREATED` は contract §5.3 に含まれず、意図的に出さない | OK |
| RESTORE_ENTRY 回帰 | `RESTORE_ENTRY` case（L758-782）は未変更。reducer test 12 で追加の E2E 回帰チェック済 | OK |

**副次所見**: `editingLid !== null` の gate は `reduceReady` 内では実質 dead branch（ready phase で editingLid が non-null になるシナリオが現 AppState 上存在しない）だが、contract §6.1 と実装を 1:1 にするための defensive gate であり、コメントでもその旨が明示されている（L787-789）。受け入れる。

### 3.3 UI — revision picker

`src/adapter/ui/renderer.ts` の `renderMetaPane` 内（revision-info の直後に追加）、`src/adapter/ui/action-binder.ts` の `case 'branch-restore-revision'`。

| 観点 | 実装 | 判定 |
|---|---|---|
| newest-first | `getEntryRevisions(container, entry.lid)` は ascending 返却。UI 側で `[...allRevs].reverse()` して descending に並べる | OK |
| 任意 revision 対象 | 各 row の `data-pkc-revision-id` にその revision の id、`data-pkc-lid` に entry の lid を付与。binder はこれを `RESTORE_ENTRY.revision_id` / `BRANCH_RESTORE_REVISION.revisionId` に直送 | OK |
| readonly でボタン抑止 | `if (canEdit)` の中でだけボタンを append。`canEdit = state.phase === 'ready' && !state.readonly` は `renderContent` から渡る引数 | OK（UI test 8） |
| 0 件で非 mount | picker は `revCount > 0` ブロック内に閉じている（revision-info と同じ条件） | OK（UI test 7） |
| 既存 Revert 温存 | 既存 `revision-info` ブロック（`restore-entry` ボタン、最新 revision 固定）を一切変更していない。追加は picker（`revision-history` region）の append のみ | OK（UI test 6） |
| data-pkc-* 固定 | `data-pkc-region="revision-history"` / `data-pkc-revision-id` / `data-pkc-revision-index` / `data-pkc-action="restore-entry" or "branch-restore-revision"` が contract §7.1 と一致 | OK |
| 二重 gate | binder は `lid` と `revisionId` が両方揃った時だけ dispatch（defensive）、reducer は §6.1 を再チェック | OK（§6.2） |

### 3.4 Invariance I-Rbr1〜10 対応マトリクス

| Invariant | 実装対応 | 根拠 |
|---|---|---|
| I-Rbr1 revision chain 非破壊 | `branchRestoreRevision` は `container.revisions` を一切 mutate しない。`.revisions` の参照は出力 container でもそのまま | pure test 6 / reducer test 10（`state.container!.revisions === revsBefore`） |
| I-Rbr2 prev_rid / content_hash 意味不変 | 新 entry に Revision を追加しないため、cross-entry な `prev_rid` が発生する余地がない。`content_hash` 再計算なし | pure test 6 / reducer test 10 |
| I-Rbr3 forward-mutation | 新 entry + 新 relation を append、元 entry も元 revision chain も不変 | pure test 2 / reducer test 10 |
| I-Rbr4 schema 不変 | `SCHEMA_VERSION` 据置、Revision / Entry / Relation 型に field 追加なし。`metadata` は `Record<string, string>` 制約内で additive key のみ | 型定義と pure test 7 |
| I-Rbr5 relation 非干渉 | provenance 1 件のみ append、他 relation は不変 | pure test 1 / 7 |
| I-Rbr6 merge 非干渉 | reducer は `importPreview` / `batchImportPreview` で block、pure helper は merge 系 field に一切触らない | reducer test 5 / 6 |
| I-Rbr7 readonly / viewOnly 整合 | reducer §6.1 の 6 gate、UI の `canEdit` による 1 段目 gate | reducer test 3 / 4 / 7、UI test 8 |
| I-Rbr8 archetype 安全性 | branch は新 entry 採番、archetype はコピー → mismatch 発生不能。RESTORE_ENTRY は既存 `restoreEntry` の archetype guard を維持 | 既存 `container-ops.ts:504` のガード（未変更） |
| I-Rbr9 provenance 向き canonical | `from: entryLid, to: newLid` リテラル固定 | pure test 7（`rel.from === 'e1' && rel.to === 'e2'`） |
| I-Rbr10 採番決定性 | `branchRestoreRevision` は `newLid` / `relationId` / `now` を引数受け取り、内部で時計・乱数未使用 | pure test 11（determinism） |

### 3.5 End-to-end

| シナリオ | 挙動 | 根拠 |
|---|---|---|
| 任意 revision → branch restore → 新 entry 選択 | UI click → binder → reducer → pure → container advance、`selectedLid = newLid` | UI test 5 |
| invalid revision | binder dispatch → reducer → pure reject → `container === state.container` → reducer blocked | reducer test 8 |
| stray button（`revision-id` 欠落） | binder の defensive guard `if (lid && revisionId)` で dispatch されない | UI test 10 |
| mismatched entry_lid | pure helper が L605 で reject、reducer が `container === state.container` で blocked | pure test 10b（reducer 層は等価経路のため独立 test なし。合格） |
| readonly で branch 試行 | UI ではボタン非表示、binder には到達しない。仮に直接 dispatch しても reducer §6.1 で block | UI test 8 + reducer test 3 |
| editing 中 | UI は present だが reducer が editing phase の default で block | UI test 9 + reducer test 7 |

---

## 4. 発見した問題

**なし。** 実装は contract §0.1 の 4 件 pin（provenance 向き canonical / 最小コピー / list+select / forward-mutation）と §3 の invariant I-Rbr1〜10 を全て満たしている。

潜在的な改善余地（いずれも contract §9.2 で v1.x 余地として明示済み、v1 audit の修正対象外）:

1. 最新 "Revert" ボタンと picker 内 Restore の UI 統合（contract §7.3 / §9.2）
2. branch 関係の逆引き表示（provenance から「派生 entries」を出す）
3. revision hover での snapshot preview

これらは v1 では意図的に非対象なので、今回の audit で指摘しない。

---

## 5. 作成 / 変更ファイル一覧

| ファイル | 種別 |
|---|---|
| `docs/development/revision-branch-restore-v1-audit.md` | 新規（本書） |

production code / tests の変更なし（audit 結果が clean のため）。

---

## 6. Contract / 実装との整合点

| contract 箇所 | 実装箇所 | 整合 |
|---|---|---|
| §1.3 操作手順（7 ステップ） | `branchRestoreRevision` L591-647 | ✓ step 1-7 を 1:1 でコード化 |
| §2.1 action payload shape | `user-action.ts:102` | ✓ `{ type, entryLid, revisionId }` |
| §2.3 採番者 | reducer L797-799（`generateLid()` × 2 + `now()`） | ✓ |
| §3 I-Rbr1〜10 | §3.4 マトリクス参照 | ✓ 全条対応 |
| §4.1 metadata schema | pure L623-631 | ✓ `conversion_kind / converted_at / source_revision_id / source_content_hash` |
| §5.1 AppState 新 field なし | app-state.ts に AppState 変更なし | ✓ |
| §5.2.2 reducer pseudocode | reducer L784-821 | ✓ 完全一致 |
| §5.3 DomainEvent | domain-event.ts の `ENTRY_BRANCHED_FROM_REVISION` 追加 | ✓ `{ sourceLid, newLid, revision_id }` |
| §6.1 gate 完全表 | reducer 6 gate + UI `canEdit` | ✓ |
| §7.1 DOM selectors | renderer picker block | ✓ 全 selector を契約どおり付与 |
| §7.3 既存 Revert 温存 | renderer の revision-info ブロック未変更 | ✓ |
| §7.4 `<details>` 常時 mount | `<details data-pkc-region="revision-history">` | ✓ |
| §7.5 list + select のみ | diff / search / multi-select / DnD いずれも実装していない | ✓ |

---

## 7. 品質チェック結果

本 audit は docs-only のため production code / tests の変更なし。直近の baseline（commit `5f506e4`）が clean であることを再確認:

- `npx vitest run tests/core/branch-restore.test.ts tests/core/app-state-branch-restore.test.ts tests/adapter/revision-branch-restore-ui.test.ts` → 3 files / 36 pass / 0 fail（再確認、2026-04-17）
- `npm test` 直近実行（commit `5f506e4`）→ 157 files / 4104 pass / 0 fail
- `npm run typecheck` 直近実行 → PASS
- `npm run build:bundle` / `npm run build:release` 直近実行 → PASS（`dist/pkc2.html` 596.7 KB）

---

## 8. Non-regression（他テーマ非干渉の再確認）

| 他テーマ | 影響の有無 | 根拠 |
|---|---|---|
| merge-import（H-10） | なし | reducer §6.1 で `importPreview` / `batchImportPreview` を gate、`mergeConflicts*` 未参照 |
| entry-ordering（C-2） | なし | `container.meta.entry_order` / `applyManualOrder` 未参照 |
| link-index（C-3） | なし | `entry:` scheme と `Relation.kind='provenance'` は独立（contract §4.3） |
| boot-source policy | なし | `viewOnlySource` は gate 側で尊重、新規 mutation で clear せず |
| undo / redo | なし | 全体 undo 機構自体が未整備。I-V3 forward-mutation 前提を崩していない |
| SCHEMA_VERSION | 据置 | 型定義 / migration 変更なし |

---

## 9. 結論

**C-1 revision-branch-restore v1 は manual sync に進んで良い。**

pure / state / UI 3 slice はいずれも behavior contract と完全整合、I-Rbr1〜10 invariant は全て保持、他テーマへの干渉なし、テスト 36 件 + 全体 4104 件 green。contract §9.1 の v1 非対象機能に手を出した跡もない。

---

**Audit completed 2026-04-17.**
