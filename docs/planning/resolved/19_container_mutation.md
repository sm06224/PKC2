# 19. Container Mutation の最小確定

---

## 19.1 目的

persistent domain model (Container) が action を通じて
どう変化するかを確立する。

以下を通すこと:
- UserAction → Reducer → Container mutation → AppState 更新 → DomainEvent 発行 → UI 描画

---

## 19.2 mutation 方針

### 原則

| 項目 | 方針 |
|------|------|
| **不変更新** | 全関数が新 Container を返す。元は変更しない |
| **置き場** | `core/operations/container-ops.ts` — browser API なし |
| **時刻** | core は Date.now() を呼ばない。呼び出し元が ISO 文字列を渡す |
| **reducer から呼ぶ** | reducer 内で container-ops を使い、state と container を同時に更新 |
| **purity 維持** | reducer は副作用なし。mutation 結果は ReduceResult に含まれる |

### DELETE の判断: 物理削除

**物理削除**を採用。理由:

1. Revision に snapshot が残るため、履歴は保持される
2. tombstone (`deleted_at` フィールド) は persistent model に
   ライフサイクル情報を混入させる
3. soft-delete が必要になれば、`trash` という RelationKind で
   Entry の形を変えずに対応可能
4. 現段階でフィールド追加は不可逆（スキーマ互換性に影響する）

### UPDATE の判断: 直接更新 + 事前 snapshot

1. COMMIT_EDIT 時、まず旧 Entry を JSON.stringify して Revision を作成
2. その後 title/body を更新
3. Revision 構造は既存の `{ id, entry_lid, snapshot, created_at }` をそのまま使用
4. 完全な revision/undo は後で DomainEvent 蓄積から構築可能

---

## 19.3 container-ops 関数一覧

| 関数 | 引数 | 戻り値 | 説明 |
|------|------|--------|------|
| `addEntry` | container, lid, archetype, title, now | Container | Entry を末尾に追加 |
| `updateEntry` | container, lid, title, body, now | Container | 既存 Entry を更新 |
| `removeEntry` | container, lid | Container | Entry を物理削除 + 関連 Relation も削除 |
| `nextSelectedAfterRemove` | entriesBefore, removedLid, currentSelected | string \| null | 削除後の選択 LID を決定 |
| `addRelation` | container, id, from, to, kind, now | Container | Relation を追加 |
| `removeRelation` | container, id | Container | Relation を削除 |
| `snapshotEntry` | container, lid, revisionId, now | Container | 更新前の Revision を保存 |

---

## 19.4 delete 後の選択ルール

```
削除対象が非選択 → 選択を維持
削除対象が選択中:
  ├── 同じ index に次のエントリがある → それを選択
  ├── 末尾だった → 一つ前を選択
  └── エントリが空になった → null
```

---

## 19.5 AppPhase との関係

| Phase | 許可される mutation |
|-------|-------------------|
| `initializing` | なし |
| `ready` | CREATE_ENTRY, DELETE_ENTRY, CREATE_RELATION, DELETE_RELATION |
| `editing` | COMMIT_EDIT (update + snapshot) |
| `exporting` | なし |
| `error` | なし（SYS_INIT_COMPLETE で復帰のみ） |

CANCEL_EDIT は Container を変更しない（同一参照が返る）。

---

## 19.6 DomainEvent の出力方針

| action | Container 変化 | DomainEvent |
|--------|---------------|-------------|
| CREATE_ENTRY | entries に追加 | `ENTRY_CREATED` (lid, archetype) |
| DELETE_ENTRY | entries から除去 + relations 除去 | `ENTRY_DELETED` (lid) |
| COMMIT_EDIT | revision 追加 + entry 更新 | `EDIT_COMMITTED` + `ENTRY_UPDATED` |
| CANCEL_EDIT | なし | `EDIT_CANCELLED` |
| CREATE_RELATION | relations に追加 | `RELATION_CREATED` |
| DELETE_RELATION | relations から除去 | `RELATION_DELETED` |

COMMIT_EDIT が 2 イベントを出す理由:
- `EDIT_COMMITTED`: UI の編集状態終了を表す（phase 遷移の事実）
- `ENTRY_UPDATED`: persistent model の変更を表す（IDB 永続化が listen する対象）

---

## 19.7 テスト一覧

| テストファイル | テスト数 | 検証内容 |
|--------------|---------|---------|
| `tests/core/container-ops.test.ts` | 23 | add/update/remove/snapshot の不変性・正確性 |
| `tests/core/app-state.test.ts` | 23 | reducer 全 phase + mutation 反映 + selection ルール |
| `tests/adapter/mutation-shell.test.ts` | 7 | mutation → UI 描画の統合テスト |
| `tests/adapter/renderer.test.ts` | 9 | renderer (既存) |
| `tests/adapter/action-binder.test.ts` | 7 | action binder (既存) |
| `tests/core/dispatcher.test.ts` | 7 | dispatcher (既存) |
| `tests/core/action-types.test.ts` | 6 | 型境界 (既存) |
| `tests/core/model.test.ts` | 3 | domain model (既存) |
| `tests/core/contract.test.ts` | 3 | SLOT 定数 (既存) |

合計: **88 テスト**, 9 ファイル

---

## 19.8 今回あえて入れなかったもの

| 項目 | 理由 |
|------|------|
| Undo/Redo | Revision snapshot は入れたが、逆操作生成は後回し |
| Revision の閲覧 UI | まだ persistence が先 |
| IDB 永続化 | 次の Issue |
| soft-delete / trash | 物理削除で十分。必要なら RelationKind で対応 |
| バッチ mutation | 1 action = 1 mutation で十分 |
| Relation の cascade delete UI | 内部では cascade 済み。UI 確認は後回し |

---

## 19.9 次に着手すべき Issue

| 優先 | Issue | 内容 |
|------|-------|------|
| 次 | **IDB 永続化** | DomainEvent listener として Container を IDB に保存 |
| 次 | **release metadata / manifest** | pkc-meta の型・生成・検証 |
| 後 | **Revision 閲覧** | Revision の一覧と snapshot 表示 |
| 後 | **Undo/Redo** | DomainEvent + Revision から逆操作を構築 |
