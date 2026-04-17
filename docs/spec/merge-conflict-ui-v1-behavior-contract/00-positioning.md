# 0. 位置づけ

Status: DRAFT
Created: 2026-04-17
Category: B. Import / Merge Contracts
Parent: docs/spec/merge-import-conflict-resolution.md（canonical spec）
Predecessor: docs/spec/merge-import-conflict-ui-minimum-scope.md
Template: docs/spec/textlog-replace-v1-behavior-contract.md
Scope: Merge import preview 内の entry 単位 conflict resolution UI の v1 behavior contract を固定

---

## 0.1 本書の目的

`docs/spec/merge-import-conflict-ui-minimum-scope.md` の結論（C1/C2/C3 分類、3 操作、2 bulk shortcut）に基づき、merge conflict UI の **v1 behavior contract** を 1 本に固定する。

本書は実装説明ではなく **behavior contract** である：

- どの操作が何をするかの最小仕様
- どの条件で操作が効くか／効かないか
- 永続データに対する不変条件（invariance）
- data contract と UI contract の分離
- State interaction（AppState / reducer / event）
- Gate 条件（Confirm ボタンの enable/disable）
- Error paths
- 意図的に v1 でサポートしないこと

## 0.2 関連 doc との関係

| doc | 関係 |
|-----|------|
| `docs/spec/merge-import-conflict-resolution.md` | 本書の親契約（canonical spec）。§8.1/§8.2 の「非対象」を本書が限定復活させる |
| `docs/spec/merge-import-conflict-ui-minimum-scope.md` | 本書の出発点。scope / 3 分類 / 3 操作 / bulk / provenance を本書が contract 化する |
| `docs/spec/text-textlog-provenance.md` | provenance relation profile。本書は `metadata.kind = 'merge-duplicate'` を additive 追加する |
| `docs/spec/data-model.md` | Container / Entry / Relation schema の定義元 |
| `docs/spec/schema-migration-policy.md` | schema mismatch gate（conflict UI mount より前に reject） |

## 0.3 supervisor 確定事項

本 contract は以下 2 点を supervisor 判断として固定する：

1. **multi-host 代表選定**: `updatedAt` が最新の host entry を代表とする。tie-break は `host.entries` の array index 昇順（先頭を採用）
2. **contentHash 入力範囲**: `body + archetype` のみ。title は除外する（title は C2 分類に別途使用するため、hash 入力に含めない）

## 0.4 章構成

| ファイル | 章 |
|---------|-----|
| `00-positioning.md` | 位置づけ（本ファイル） |
| `01-scope.md` | Scope / 非対象 |
| `02-surface.md` | Surface 条件 |
| `03-invariance.md` | Invariance（I-MergeUI1〜I-MergeUI10） |
| `04-conflict-detection.md` | Conflict 判定（data contract） |
| `05-resolution-ops.md` | Resolution 操作（data contract） |
| `06-api-helpers.md` | API / pure helper |
| `07-state-interaction.md` | State interaction |
| `08-ui-contract.md` | UI contract |
| `09-gate.md` | Gate 条件 |
| `10-error-paths.md` | Error paths |
| `11-testability.md` | Testability |
| `12-non-goal.md` | Non-goal / v1.x 余地 |
