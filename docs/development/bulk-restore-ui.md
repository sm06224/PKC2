# Bulk Restore UI

**Status**: implemented (Tier 2-2)
**Date**: 2026-04-14
**Scope**: add a UI affordance to revert an entire `BULK_*` operation
in a single click, using the existing `Revision.bulk_id` tagging and
the existing `RESTORE_ENTRY` action.

## 1. 背景

PKC2 の BULK_* 操作（`BULK_DELETE` / `BULK_SET_STATUS` /
`BULK_SET_DATE`）は、対象エントリごとに pre-mutation snapshot を
残す契約で、snapshot には共通の `bulk_id` が刻まれている
（data-model §6.1 / Tier 2 前段）。foundation としては
`getRevisionsByBulkId(container, bulkId)` が用意されており、
任意の bulk_id に属する revision 群を created_at 昇順で取り出せる。

しかし v0.1.0 までは UI 側にこの情報を使う入口がなく、bulk を
undo したいユーザーは **対象エントリを 1 件ずつ開いて Revert を
押す** しかなかった。

Tier 2-2 はこの "1 クリックで bulk 全体を戻す" 入口を最小実装で
追加する。

## 2. 採用した設計（選択肢 A）

**UI のみの追加、新 reducer action は導入しない。**

- `data-pkc-action="restore-bulk"` + `data-pkc-bulk-id` の 1 対の
  ボタンを renderer から発行する
- action-binder がクリックを受けて、`getRevisionsByBulkId` で
  該当 revision 群を解決し、確認ダイアログを経て **N 件の
  `RESTORE_ENTRY` を順に dispatch** する
- 失敗（archetype mismatch / 不正 snapshot / stale revision）は
  既存の単体 `RESTORE_ENTRY` と同じ semantic で **silent-skip**

### 選ばなかった設計

| 選択肢 | 理由 |
|--------|-----|
| **B: 新 `RESTORE_BULK` action を追加** | reducer / event / data model の膨張なしで同じ UX が実現できる。atomicity 要件もない |
| **C: UI-only の grouped button だけ（handler なし）** | handler なしではクリック時の動作がない |

選択肢 A は「既存 RESTORE_ENTRY の意味論をそのまま多重 dispatch
で転用する」最小策。partial success（一部の revision が stale な
ときに残りだけ適用）は既存 single restore の silent-skip 契約と
同形のため、ユーザーから見える振る舞いも自然に一貫する。

## 3. 置き場所（UI 2 か所）

### 3.1 Meta pane の History セクション（右ペイン）

対象エントリを選択すると右ペインに「History (N)」パネルが出る。
最新 revision が bulk_id を持ち、その bulk グループのサイズが 2
以上のとき、既存の「Revert」ボタンの隣に:

```
[Revert] [Revert bulk (3)]
```

- `BULK_SET_STATUS` / `BULK_SET_DATE` の直後に、対象の 1 件を選
  択した状況で出現する
- 単体 Revert は今まで通り動く（regression なし）

### 3.2 Trash panel（左サイドバーの "🗑️ Deleted"）

`BULK_DELETE` で消された複数エントリが同じ bulk_id を共有している
とき、グループの **最初の item にだけ** もう 1 つボタンを生やす:

```
Deleted entry A  [Restore] [Restore bulk (3)]
Deleted entry B  [Restore]
Deleted entry C  [Restore]
```

De-duplication は `shownBulkIds: Set<string>` で行う。グループ
サイズが 1（bulk_id はあるが単独削除扱い）のときは出さない。

## 4. action-binder のハンドラ

```ts
case 'restore-bulk': {
  const bulkId = target.getAttribute('data-pkc-bulk-id');
  if (!bulkId) break;
  const st = dispatcher.getState();
  if (!st.container) break;
  const revs = getRevisionsByBulkId(st.container, bulkId);
  if (revs.length === 0) break;
  if (!confirm(`このバルク操作の ${revs.length} 件をまとめて元に戻しますか？`)) break;
  for (const rev of revs) {
    dispatcher.dispatch({ type: 'RESTORE_ENTRY', lid: rev.entry_lid, revision_id: rev.id });
  }
  break;
}
```

### 確認ダイアログの方針

- 件数を明示
- 単体 Revert は confirm なし（従来どおり）
- これは既存 BULK_DELETE / PURGE_TRASH の confirm パターンに合わせた UX

### 失敗時の振る舞い

各 `RESTORE_ENTRY` は独立。reducer 内で

- revision が消えた → identity 維持で silent no-op
- snapshot の JSON parse 失敗 → 同上
- archetype 不一致 → 同上

いずれも「この 1 件はスキップ、残りは継続」の partial success で
終わる。UI 側で failure 集計・toast は **出さない**（既存の
single RESTORE_ENTRY も出していない。一貫性優先）。

## 5. テスト

`tests/adapter/bulk-restore.test.ts` の 14 件:

**renderer — meta pane（4 件）**:
1. 最新 revision が bulk_id を持ちグループサイズ > 1 のとき
   `data-pkc-action="restore-bulk"` を発行する
2. bulk_id 無しでは出さない
3. グループサイズ 1 では出さない
4. readonly モードでは出さない

**renderer — trash panel（4 件）**:
5. 同一 bulk_id の deleted entry 群の先頭にのみ bulk ボタン
6. group size 1 では出さない
7. bulk_id 無しの deleted entry では出さない
8. readonly モードでは出さない

**action-binder（3 件）**:
9. confirm OK → N 件の `RESTORE_ENTRY` dispatch
10. confirm Cancel → 0 件 dispatch
11. 単体 `restore-entry` は従来どおり 1 件 dispatch

**integration（3 件）**:
12. `BULK_SET_STATUS` → Revert bulk → 3 件すべて pre-status に復帰
13. `BULK_DELETE` → Restore bulk → 3 件すべて再作成
14. partial success — 1 件 stale でも残り 2 件は復元される

## 6. Backward compatibility

- 既存 `RESTORE_ENTRY` reducer / event / API は無変更
- 既存 Revert ボタン UI は無変更
- Trash panel の per-item Restore ボタンも無変更（bulk グループの
  項目にも個別ボタンは残る）
- data model に新フィールド追加なし
- bundle size 増加: 約 +1.4 KB（renderer + action-binder 計）

## 7. 既知の UX 制約（pre-existing）

### 7.1 "すべて消えた" container では trash panel が出ない

`renderSidebar` は `allEntries.length === 0` のとき empty-guidance
を出して早期 return する。この早期 return は restore-candidates の
描画より前に走るので、**生きているエントリが 0 件の container**
では trash panel 自体が出ない。

この制約は Tier 2-2 以前から存在しており、bulk restore とは独立
した UX の穴。ユーザーが container の全エントリを BULK_DELETE で
消してしまうと、trash panel も見えなくなる（データは失われていない
が、ユーザーには見えない）。

**現時点で fix しない理由**:
- scope が bulk restore に限定されている
- 影響は稀なケース（全エントリ一括削除）
- 自然な fix は renderSidebar の早期 return を削除する変更で、
  別 Issue として切り出すのが妥当

test fixture 側で survivor entry を 1 件残して "trash panel が
render される典型的な状態" を検証している（詳細は
`containerWithBulkDeleteHistory` の JSDoc）。

### 7.2 Revert bulk を連打すると新しい snapshot の列が増える

各 `RESTORE_ENTRY` は独立に pre-restore snapshot を作る。つまり
bulk restore を実行すると、N 件の新しい revision が追加される
（どれも bulk_id なし — bulk-restore 時点での新しい grouping は
作らない）。これは意図した振る舞いで、「bulk restore 自体を
もう一度 bulk で undo する」機能を今は持たない。

将来そこまで欲しくなったら新しい `RESTORE_BULK` reducer action を
導入して、新しい snapshot 群に共通の restore-bulk-id を振る設計を
検討する。

## 8. 未対応 / intentionally not done

- **Revert bulk の結果 toast / 件数サマリ**: 失敗集計が不要な
  ので省略
- **Revert bulk の undo 用 bulk_id 発行**: §7.2 参照
- **空 container の trash 表示**: §7.1 参照
- **Meta pane で "全 N 件の bulk 中 どれが現在 entry 側に生きて
  いるか" の表示**: 実装が重くなるため今回はスキップ

## 9. 参考コード位置

- `src/adapter/ui/renderer.ts`
  - L8-13: `getRevisionsByBulkId` import
  - L1449-1517: trash panel の bulk affordance
  - L2365-2380: meta pane の bulk affordance
- `src/adapter/ui/action-binder.ts`
  - L7-9 付近: `getRevisionsByBulkId` import
  - L301-325: `restore-bulk` handler
- `src/core/operations/container-ops.ts` L285-292: `getRevisionsByBulkId`（既存）
- `tests/adapter/bulk-restore.test.ts`: 14 件のテスト

## 10. 変更履歴

| 日付 | 変更 |
|-----|-----|
| 2026-04-14 | 初版（Tier 2-2 実装と同時） |
