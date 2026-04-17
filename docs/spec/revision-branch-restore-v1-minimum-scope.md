# Revision Branch Restore v1 — Minimum Scope

Status: MINIMUM SCOPE（feasibility / scope 確定文書）
Created: 2026-04-17
Category: C. Data Model Extensions
Predecessor: `docs/development/data-model/revision-branch-restore.md`（CANDIDATE 設計メモ）
Related: H-6 / S-22（`Revision.prev_rid` / `content_hash` 導入、2026-04-15）

---

## 0. 位置づけ

本書は C-1 revision-branch-restore の **v1 minimum scope** を確定する feasibility 文書である。
behavior contract → 実装 → audit → manual の pipeline に入る前に、
scope と非 scope を固定して実装を事故らせない目的で書く。

### 0.1 既存機能の確認（出発点）

C-1 を始める前に、すでに実装済みの revision 機能を整理する。

| 機能 | 状態 | 実装場所 |
|---|---|---|
| Revision の自動記録（編集確定のたび） | 実装済み | `snapshotEntry` in `container-ops.ts` |
| `Revision.prev_rid` / `content_hash` optional field | 実装済み（H-6/S-22） | `container-ops.ts` + `hash.ts` |
| **最新 revision への in-place restore** | **実装済み** | `RESTORE_ENTRY` action / `restoreEntry` pure fn / renderer "Revert" ボタン |
| **削除済み entry の restore** | **実装済み** | `restoreDeletedEntry` / restore-candidates セクション |
| Bulk restore（BULK_* 操作の一括 revert） | 実装済み（S-4） | `RESTORE_BULK` / `restore-bulk` action |
| **任意の過去 revision を選んで restore / branch** | **未実装（C-1 v1 の対象）** | — |

### 0.2 H-6 との関係

`prev_rid` / `content_hash` は「branch 検知の fingerprint」として敷設済み（§6.2.1 data-model.md）。
C-1 v1 はこれらを *読む* 実装を初めて追加する。

---

## 1. 問題定義

### 1.1 現状の revision UX の痛み

現在の "Revert" ボタンは **最新 revision のみ** を対象とする。

```
[最新 revision] ← Revert ボタン（これだけ）
[2世代前]       ← UIなし
[3世代前]       ← UIなし
```

利用者が「2世代前の版が良かった」と思っても、手段がない。
また「過去版を見ながら現在版も残したい」という分岐復元もできない。

### 1.2 "restore" と "branch restore" の違い

| 操作 | 動作 | 結果 |
|---|---|---|
| **Restore（in-place）** | 選択 entry の現在本文を過去 snapshot で上書き | 現在の状態は新 revision に退避、entry は 1 件のまま |
| **Branch restore** | 過去 snapshot から**新 entry**（branch）を生成 | 元 entry は無変更、新 entry と provenance relation が追加 |

v1 で追加するのは主に branch restore。ただし revision picker UI は
in-place restore（任意 revision 対象）にも同時に使えるようにする。

### 1.3 事故が起きやすい点

- in-place restore は **取り消せない**（直前状態が revision に残るため履歴は失われないが、
  entry 本体は上書きされる）
- branch restore は **元 entry を変えない** ため安全。ただし新 entry が増え続ける
- archetype が mismatch のまま restore すると body が壊れる（既存ガードで防止済み）

---

## 2. v1 scope

### 2.1 対象

- **操作**: 任意の過去 revision を選んで branch restore / in-place restore（ any revision 対象）
- **対象 entry**: 選択中の entry（`state.selectedLid`）
- **対象 archetype**: すべて（branch は新 entry を作るので archetype mismatch のリスクがない）
- **操作起点**: meta pane の revision history セクション

### 2.2 revision picker

- meta pane に全 revision を一覧表示（`created_at` 降順）
- 各行: タイムスタンプ / archetype / `content_hash` 先頭 8 文字（ある場合）
- 各行に 2 つのアクション:
  - **「Restore」** — in-place restore（既存 `RESTORE_ENTRY` を任意 revision_id に対応させる。現在は latest のみ）
  - **「Branch」** — branch restore（新 entry を作る、今回追加）

### 2.3 branch restore の挙動

1. 選択した revision の snapshot を `parseRevisionSnapshot` でパース
2. 新 lid を生成し、新 Entry を作成:
   - `title`: `"${snapshot.title} (branch)"` — 重複回避のための最小サフィックス
   - `body`: `snapshot.body`
   - `archetype`: `snapshot.archetype`
   - `created_at` / `updated_at`: 操作時刻
3. `provenance` Relation を追加:
   - `from`: 新 entry の lid（derived）
   - `to`: 元 entry の lid（source）
   - `kind`: `'provenance'`
   - `metadata`: `{ branch_source: 'revision', source_revision_id: revisionId, branched_at: timestamp }`
4. `selectedLid` を新 entry に移す

### 2.4 gate 条件

| 条件 | Restore | Branch |
|---|---|---|
| `state.phase !== 'ready'` | 禁止 | 禁止 |
| `state.readonly` | 禁止 | 禁止 |
| `state.viewOnlySource` | 禁止 | 禁止 |
| `state.editingLid !== null` | 禁止 | 禁止 |
| `state.lightSource` | 許可（select のみ） | 許可（select のみ） |
| historical revision 閲覧中 | 禁止 | 禁止 |
| snapshot の archetype mismatch | 禁止（既存ガード） | 許可（新 entry のため） |

---

## 3. 最小機能リスト

v1 として実装するもの:

1. **revision picker セクション** — meta pane で全 revision を降順一覧。`data-pkc-region="revision-history"` を新設
2. **任意 revision への in-place restore** — 既存 `RESTORE_ENTRY` は任意 `revision_id` を既にサポートしているが、UI が latest 限定だった。revision picker の各行に "Restore" ボタンを追加
3. **`BRANCH_RESTORE_REVISION` user action** — pure + reducer + UI
4. **`branchRestoreRevision(container, entryLid, revisionId): Container`** — pure function（features 層 or core operations 層）
5. **provenance relation の自動付与** — `from = new_lid / to = original_lid / kind = 'provenance' / metadata.branch_source = 'revision'`

---

## 4. Invariants

| # | 名前 | 定義 |
|---|---|---|
| **I-Rbr1** | revision chain 非破壊 | 既存 revision を削除・上書き・並び替えしない |
| **I-Rbr2** | prev_rid / content_hash 意味の不変 | `prev_rid` は同 entry_lid の直前 revision のみを指す。branch の新 entry の revision chain は new_lid 単独で始まる |
| **I-Rbr3** | forward-mutation | branch restore も in-place restore も rewind ではない。branch は新 entry を作り、in-place は現状を revision に退避してから上書き |
| **I-Rbr4** | schema 不変 | `SCHEMA_VERSION` 据え置き。新 action / relation metadata は additive |
| **I-Rbr5** | relation 非干渉 | branch restore が追加する provenance relation 以外の relation（structural / categorical / semantic / temporal）は変更しない |
| **I-Rbr6** | merge 非干渉 | conflict UI / mergeConflicts / mergeConflictResolutions とは独立 |
| **I-Rbr7** | readonly / viewOnly 整合 | readonly / viewOnlySource では mutation 操作を行わない。一覧表示は可 |
| **I-Rbr8** | archetype 安全性 | in-place restore は既存の archetype mismatch ガードを継続。branch restore は新 entry を作るため archetype mismatch ガードは不要 |

---

## 5. 非対象（v1 では実装しない）

- **revision diff viewer**: 2 revision 間の本文 diff を表示する機能
- **multi-entry branch restore**: 複数 entry を一括で branch 化
- **cross-container branch**: 別 container の entry への branch
- **semantic merge**: branch と元 entry の内容をマージ
- **revision の削除 / 圧縮 UI**: revision リストの整理操作
- **named snapshot / revision tagging**: 任意の revision に名前を付ける
- **asset 参照の完全引き継ぎ**: snapshot 内に asset 参照が含まれる場合の整合（asset は branch entry でも同一 asset_key を参照するため多くの場合問題ないが、完全な asset 独立コピーは非対象）
- **branch の自動フォルダ配置**: branch 先の entry をどのフォルダに入れるかの制御
- **undo / redo**: restore / branch の取り消し操作

---

## 6. 推奨実装方針

### 6.1 pipeline 順序

```
本文書（minimum scope）
  ↓
behavior contract（invariant 確定 / DOM selector 固定 / action signature）
  ↓
pure slice（branchRestoreRevision + テスト）
  ↓
state slice（BRANCH_RESTORE_REVISION reducer case）
  ↓
UI slice（revision picker + Branch / Restore ボタン）
  ↓
audit
  ↓
manual sync
```

### 6.2 各 slice のガイドライン

- **pure**: `branchRestoreRevision` は `container-ops.ts` に追加（core operations 層）。pure function、副作用なし。引数は `(container, entryLid, revisionId)` → `Container`。snapshot parse 失敗時は container 無変更で返す
- **state**: `BRANCH_RESTORE_REVISION { entryLid: string; revisionId: string }` を action types に追加。reducer で `branchRestoreRevision` を呼び、`selectedLid` を新 entry lid に変更。`snapshotEntry` で現 entry を退避（in-place restore と同様の pre-snapshot）
- **UI**: revision picker を既存の revision info セクション（meta pane）の拡張として追加。既存 Revert ボタンは最新 revision への in-place restore として維持し、revision picker の各行に "Restore" と "Branch" を追加

### 6.3 テスト方針

- **pure**: 正常系（snapshot valid / provenance relation 付与 / new lid 生成）/ 異常系（revisionId 不一致 / snapshot parse 失敗）/ 既存 revision chain 非破壊 / archetype 複数 archetype でのスモーク
- **reducer**: `BRANCH_RESTORE_REVISION` の state 変化 / `selectedLid` 更新 / gate 拒否（readonly / viewOnly / mismatch なし）
- **UI**: revision picker の行数 / Restore ボタン / Branch ボタン / gate（readonly で disabled）

---

## 7. Examples

### 7.1 単純 branch restore

Entry `A`（text, 現在 v3）に revision が 3 件ある。ユーザーが v1 の snapshot から Branch を選択:

```
実行前:
  entries: [A(v3)]
  revisions: [A@v1, A@v2, A@v3]
  relations: []

実行後:
  entries: [A(v3), A'(= A@v1 branch)]
  revisions: [A@v1, A@v2, A@v3]  ← 変化なし
  relations: [{from: A'.lid, to: A.lid, kind: 'provenance',
               metadata: {branch_source:'revision', source_revision_id:'A@v1.id'}}]
  selectedLid: A'.lid
```

### 7.2 in-place restore from picker（任意 revision）

Entry `A`（v3）の revision picker で v1 を選んで "Restore" をクリック:

```
実行前: entries: [A(v3)], revisions: [A@v1, A@v2, A@v3]

実行後: entries: [A(v1 content)]  ← 上書き
        revisions: [A@v1, A@v2, A@v3, A@v3-pre-restore]  ← 復元前を退避
        selectedLid: A.lid（変わらない）
```

これは既存 `RESTORE_ENTRY` の拡張（任意 revision_id 対応）。

### 7.3 禁止例：readonly モードでの branch restore

```
state.readonly = true の場合:
  → "Branch" ボタンは disabled（または非表示）
  → dispatcher に dispatch しても reducer が無変更で返す（二重ガード）
```

---

## 8. 未確定事項（behavior contract 段階で決定）

| 事項 | 候補 |
|---|---|
| branch entry のタイトル形式 | `"${title} (branch)"` / `"${title} [v${n}]"` / そのまま |
| revision picker の展開方法 | 常時展開 / `<details>` アコーディオン / 件数 N 以上で展開 |
| Restore / Branch のラベル文言 | "Restore" / "Branch" / "In-place" / "Fork" |
| 既存 "Revert" ボタンの扱い | 維持（最新のみ） + picker との共存、または picker に統合 |
| snapshot に prev_rid / content_hash がない場合の表示 | ハッシュ表示なしで通常行として表示 |

---

## 9. 関連文書

| 文書 | 関係 |
|---|---|
| `docs/spec/data-model.md §6` | Revision 型定義 / prev_rid / content_hash / restore 挙動ルール |
| `docs/spec/data-model.md §8` | `RESTORE_ENTRY` action / I-V3（forward-mutation 原則） |
| `docs/spec/text-textlog-provenance.md` | provenance Relation の設計根拠 |
| `docs/spec/provenance-relation-profile.md` | provenance payload の v1 profile（`metadata` キー定義） |
| `docs/development/data-model/revision-branch-restore.md` | CANDIDATE 設計メモ（本文書の前身） |
| `src/core/operations/container-ops.ts` | `restoreEntry` / `restoreDeletedEntry` / `snapshotEntry` の実装 |
| `src/core/operations/hash.ts` | `fnv1a64Hex`（content_hash 計算 helper） |
