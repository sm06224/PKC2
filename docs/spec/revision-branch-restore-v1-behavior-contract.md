# Revision Branch Restore v1 — Behavior Contract

Status: 実装済み(v2.1.0 以前に landing、v2.1.1 時点で稼働中)。本書は behavior contract / historical design record として保持。実装の現物は `src/adapter/state/app-state.ts` の `BRANCH_RESTORE_REVISION` 系 / `tests/core/branch-restore.test.ts` / `tests/adapter/revision-branch-restore-ui.test.ts`。
Created: 2026-04-17
Category: C. Data Model Extensions
Predecessor: `docs/spec/revision-branch-restore-v1-minimum-scope.md`（同日、feasibility spec）
Purpose: C-1 revision-branch-restore v1 の振る舞い契約を固定し、pure → state → UI → audit → manual の実装 pipeline の入口を確定する

---

## 0. 位置づけ

本書は C-1 テーマの **behavior contract** である。minimum scope が「何を対象にするか」を決めたのに対し、本書は「**どう動くか**」を 1 本に固定する（operation / data / invariance / provenance / state / gate / UI / error / non-goal）。

- 本書の役割: pure / state / UI 実装が参照する **唯一の契約**
- 本書承認後に pure slice → state slice → UI slice → post-impl audit → manual sync の順で進める

### 0.1 supervisor 固定事項（本 contract で pin する 4 点）

minimum scope §8「未確定事項」および supervisor 指示で以下 4 点を固定する:

1. **provenance 向き = canonical**: branch restore の provenance relation は `from = source（元 entry、lid unchanged）`, `to = derived（新 branch entry）`。`docs/spec/provenance-relation-profile.md §3.1` の canonical direction（source → derived）に厳密一致させる。minimum scope §2.3 step 3 の逆記述（from=新 / to=元）は本書で **訂正** する（§9.3 の canonical 照合を参照）
2. **branch entry の初期値 = 最小コピー**: branch entry は snapshot の `title` / `body` / `archetype` を **そのままコピー** し、`created_at` / `updated_at` のみ操作時刻で上書きする。title 装飾（`(branch)` suffix 等）は v1 で付与しない
3. **revision picker 最小 UX = list + select のみ**: diff 表示 / 検索 / フィルタ / 多選択 / drag-reorder は v1 非対象
4. **in-place restore 規則 = forward-mutation**: 任意 revision への in-place restore は、まず **現在状態を新 revision として snapshot に追加**（pre-restore 退避）してから body を上書きする。revision 本体の上書き / 削除は行わない（`data-model.md §6.5` I-V3）

### 0.2 関連 doc

| doc | 関係 |
|-----|-----|
| `docs/spec/revision-branch-restore-v1-minimum-scope.md` | 前段 feasibility。scope / invariants / 非対象の根拠 |
| `docs/spec/data-model.md §6` | Revision 型 / prev_rid / content_hash / snapshot 契約 / forward-mutation 原則 |
| `docs/spec/data-model.md §8` | `RESTORE_ENTRY` action 既存仕様 / I-V3 |
| `docs/spec/provenance-relation-profile.md §3.1` | provenance 向きの canonical direction |
| `docs/spec/text-textlog-provenance.md` | `kind = 'provenance'` Relation の additive 追加根拠（H-8） |
| `src/core/operations/container-ops.ts` | `snapshotEntry` / `restoreEntry` / `restoreDeletedEntry` 実装 |
| `src/adapter/state/app-state.ts` | `RESTORE_ENTRY` reducer 既存実装（任意 revision_id 受理済み） |

---

## 1. Operation contract

### 1.1 v1 で扱う 2 operation

| operation | payload | 副作用 | selectedLid |
|---|---|---|---|
| `RESTORE_ENTRY`（既存、UI 拡張のみ） | `{ lid, revision_id }` | 現状態を新 revision として snapshot 追加 → title/body 上書き → `updated_at` 進める | 変えない |
| `BRANCH_RESTORE_REVISION`（新規） | `{ entryLid, revisionId }` | 新 entry（新 lid）を append + provenance relation を 1 件 append | 新 entry の lid に移す |

### 1.2 RESTORE_ENTRY の振る舞い（既存仕様の確認）

`app-state.ts:758-782` に実装済み。reducer は任意 `revision_id` をすでに受理している。v1 で変更するのは UI 側だけ（latest 限定から、picker から選んだ任意 revision を渡せるようにする）。

- 入力: `{ type: 'RESTORE_ENTRY', lid: string, revision_id: string }`
- 既存 entry 経路: `restoreEntry(container, lid, revision_id, snapshotRevId, now)`
  - `snapshotEntry` で現 entry を **新 revision として追加**（pre-restore 退避、forward-mutation）
  - `updateEntry` で title / body を snapshot 内容で上書き、`updated_at` を now に進める
  - archetype mismatch は reject（`container-ops.ts:504`）
- 削除済み entry 経路: `restoreDeletedEntry(container, revision_id, now)`（v1 で変更なし）
- 事件: `ENTRY_RESTORED { lid, revision_id }` を 1 件発火（既存）

### 1.3 BRANCH_RESTORE_REVISION の振る舞い（新規）

- 入力: `{ type: 'BRANCH_RESTORE_REVISION', entryLid: string, revisionId: string }`
- 手順:
  1. `container.revisions` から `id === revisionId` の Revision を探す。見つからなければ container 無変更
  2. `parseRevisionSnapshot(revision)` で Entry を復元。`null` なら container 無変更
  3. `revision.entry_lid !== entryLid` なら container 無変更（cross-entry reject）
  4. 新 lid / 新 relation id / now は reducer から注入される（I-Rbr10）
  5. `addEntry(container, newLid, snapshot.archetype, snapshot.title, now)` で新 entry を追加
  6. `updateEntry(container, newLid, snapshot.title, snapshot.body, now)` で body を snapshot 内容にする（`addEntry` は body 初期値が空のため 2 段階で確定）
  7. `addRelation(container, relId, 'provenance', entryLid, newLid, now, metadata)` で provenance relation を 1 件追加（§4.1）
- 事件: `ENTRY_BRANCHED_FROM_REVISION { sourceLid, newLid, revision_id }` を 1 件発火
- reducer: `selectedLid = newLid` に差し替え

### 1.4 既存 revision / entry / relation への副作用

- 元 entry: 変更なし（title / body / archetype / created_at / updated_at / lid すべて不変）
- 元 entry の revision chain: 変更なし（追加・削除なし）
- 新 entry の revision chain: 空で開始（I-Rbr2）
- relations: provenance 1 件のみ追加

---

## 2. Data contract

### 2.1 action payload schema

```ts
type RestoreEntryAction = {
  type: 'RESTORE_ENTRY';
  lid: string;           // 復元対象 entry の lid（任意 revision でも変わらない）
  revision_id: string;   // Revision.id。任意の過去 revision を指定可
};

type BranchRestoreRevisionAction = {
  type: 'BRANCH_RESTORE_REVISION';
  entryLid: string;      // 元 entry の lid（scope guard に使う）
  revisionId: string;    // snapshot source となる Revision.id
};
```

- 両 action とも `lid` / `revision_id` / `entryLid` / `revisionId` を **非空 string** で受ける
- `BRANCH_RESTORE_REVISION` の `entryLid` は「revision が本当に同 entry のものか」を guard するためだけに使う。pure helper は `container.revisions` 側の `entry_lid` を必ず check する（§1.3 step 3）

### 2.2 revision / entry / relation の shape（読むのみ）

- `Revision`: `data-model.md §6.1` に既定。`prev_rid` / `content_hash` は本 contract で **書かない**（chain を延ばさないため）。**読むのは branch restore の `source_content_hash` を populate する経路のみ**（§4.1）
- `Entry`: `data-model.md §3` に既定。branch entry は新 lid で追加され、既存 entry と同じ schema を満たす
- `Relation`: `data-model.md §5` に既定。本 contract では `kind = 'provenance'` の 1 件のみを additive に追加する

### 2.3 新 lid / relation id / 時刻の採番

| 値 | 採番 / 取得者 | pure helper への渡し方 |
|---|---|---|
| branch entry の新 lid | reducer が `generateLid()` | `branchRestoreRevision` の `newLid` 引数 |
| provenance relation の id | reducer が `generateLid()` | `branchRestoreRevision` の `relationId` 引数 |
| `now` タイムスタンプ | reducer が `now()` | `branchRestoreRevision` の `now` 引数 |
| `RESTORE_ENTRY` の pre-restore revision id | 既存 `app-state.ts:766` が `generateLid()` | `restoreEntry` の `snapshotRevId` 引数 |

採番は **reducer 内で行う**。pure helper は外部注入された id / 時刻を受け取る（testability、I-Rbr10）。

---

## 3. Invariance — I-Rbr1〜I-Rbr10

minimum scope §4 の 8 項目を踏襲し、本 contract で最終化する。I-Rbr9 / I-Rbr10 は contract 段階での追加。以後の pure / state / UI slice がこの番号で参照する。

### I-Rbr1: revision chain 非破壊

本 contract のいかなる operation（`RESTORE_ENTRY` / `BRANCH_RESTORE_REVISION`）でも、既存 Revision を **削除・上書き・並び替え** しない。Revision の追加（pre-restore snapshot）のみ許す。

### I-Rbr2: prev_rid / content_hash の意味不変

- `prev_rid` は常に **同 `entry_lid`** の直前 Revision を指す。branch 先の新 lid と元 lid の chain を跨いだ `prev_rid` は作らない
- 新 entry の Revision chain は新 lid 単独で始まる（最初の snapshot は pre-restore ではなく、将来の編集時に初めて生成される）
- 既存 `content_hash` の再計算は行わない

### I-Rbr3: forward-mutation

- `RESTORE_ENTRY`: 現状態を新 Revision として snapshot に **追加** してから body を上書き（rewind ではない）
- `BRANCH_RESTORE_REVISION`: 新 entry を **追加**（元 entry は変更なし）
- いずれも「過去に戻る」のではなく「現在を先に退避して、新しい状態を前方に作る」

### I-Rbr4: schema 不変

- `SCHEMA_VERSION` は据え置き
- `Revision` / `Entry` / `Relation` の型に **field を追加しない**
- `Relation.metadata` に新 key を入れるのは additive のみ（`Record<string, string>` 型制約内、§4.2）

### I-Rbr5: relation 非干渉

`BRANCH_RESTORE_REVISION` が追加する provenance relation 以外の relation（structural / categorical / semantic / temporal / 既存 provenance）は変更しない。

### I-Rbr6: merge 非干渉

`mergeConflicts` / `mergeConflictResolutions` / `importPreview` / `importMode` は本 contract から一切触らない。import / merge pipeline とは独立経路。

### I-Rbr7: readonly / viewOnly 整合

`state.readonly === true` / `state.viewOnlySource === true` / `state.phase !== 'ready'` / `state.editingLid !== null` / historical revision 閲覧中では **mutation operation は dispatch しても blocked** になる（reducer の既存 blocker 経路を再利用）。revision picker の表示そのものは禁止しない。

### I-Rbr8: archetype 安全性

- `RESTORE_ENTRY`: 既存 archetype mismatch ガード（`restoreEntry` 内）を維持
- `BRANCH_RESTORE_REVISION`: 新 entry を作るため archetype mismatch は原理的に発生しない（snapshot の archetype をそのまま採用）

### I-Rbr9: provenance 向きの canonical 固定

`BRANCH_RESTORE_REVISION` が追加する provenance relation の向きは常に:

```
from = 元 entry の lid（source）  ─[provenance]─►  to = 新 branch entry の lid（derived）
```

逆向き（from=branch / to=source）の relation は作らない。`provenance-relation-profile.md §3.1` の canonical direction に厳密に従う。minimum scope §2.3 step 3 の逆記述は本 I-Rbr9 で訂正される。

### I-Rbr10: 採番決定性

pure helper `branchRestoreRevision` は、新 lid / relation id / 時刻を **外部から注入**で受け取り、内部で乱数・時計に依存しない。reducer が `generateLid()` / `now()` を呼び、pure helper に渡す。テストでは id / 時刻を fix して決定的に挙動を検証できる。

---

## 4. Provenance

### 4.1 branch restore で追加する provenance relation

```ts
{
  id: <relationId (reducer 注入)>,
  kind: 'provenance',
  from: sourceLid,        // 元 entry の lid（source、I-Rbr9）
  to: branchLid,          // 新 branch entry の lid（derived）
  created_at: now,
  updated_at: now,
  metadata: {
    conversion_kind: 'revision-branch',        // §4.2 profile additive 追加値
    converted_at: now,                         // provenance-profile §2.2.1 required
    source_revision_id: revisionId,            // §4.2 optional key（新規）
    source_content_hash: <rev.content_hash>,   // §4.2 recommended。元 Revision.content_hash を流用
  },
}
```

- `source_content_hash` が元 Revision に欠けている場合（`content_hash` absent の古い revision）は metadata に key を含めない（`Record<string, string>` で undefined 値は許容しない）
- snapshot 本体を再ハッシュしない（I-Rbr2）

### 4.2 `provenance-relation-profile` への additive 追加

本 contract で profile に additive に追加する key / value:

| 追加要素 | 種別 | profile 内の位置 |
|---|---|---|
| `conversion_kind = 'revision-branch'` | 新規 **値**（string） | §2.2.1 required の列挙に additive |
| `source_revision_id: string` | 新規 **optional key** | §2.2.3 context-specific（conversion_kind='revision-branch' 専用） |

- 追加は additive のみ。既存 `conversion_kind` 値（`'text-to-textlog'` / `'textlog-to-text'` / `'import-derived'`）の意味は変わらない
- `source_content_hash` は既存 recommended key を流用（新設しない）
- profile §2.2.2 の「欠けていても Relation は有効」方針を踏襲（`source_content_hash` は欠けうる）

### 4.3 provenance の読み取り経路（v1 では追加しない）

- backlinks グラフ描画 / ancestor chain traversal / provenance hover tooltip は v1 非対象
- link-index（C-3）は `entry:` scheme 参照のみを対象とし、`Relation.kind='provenance'` を touch しない（I-LinkIdx との独立）
- branch 関係の list 表示は v1 で提供しない（v1.x 余地、§9.2）

---

## 5. State interaction

### 5.1 AppState への field 追加 — なし

v1 で `AppState` に新 field を追加しない。

- revision picker の展開状態は **runtime DOM state**（`<details>` の `open` 属性）で保持し、AppState には持たない
- 選択中 revision はボタン click 直前にユーザーが暗黙的に決めるのみ。`state.selectedRevisionId` のような field は追加しない（hover / focus は DOM に閉じる）

### 5.2 reducer case

#### 5.2.1 RESTORE_ENTRY（変更なし）

既存 reducer（`app-state.ts:758-782`）をそのまま使う。UI 側が任意 `revision_id` を渡せるようになることで、latest 以外の revision への in-place restore が成立する。

#### 5.2.2 BRANCH_RESTORE_REVISION（新規）

pseudocode:

```
case 'BRANCH_RESTORE_REVISION': {
  if (!state.container) return blocked(state, action);
  if (state.readonly) return blocked(state, action);
  if (state.viewOnlySource) return blocked(state, action);
  if (state.phase !== 'ready') return blocked(state, action);
  if (state.editingLid !== null) return blocked(state, action);

  const newLid = generateLid();
  const relId = generateLid();
  const ts = now();

  const container = branchRestoreRevision(
    state.container,
    action.entryLid,
    action.revisionId,
    newLid,
    relId,
    ts,
  );
  if (container === state.container) return blocked(state, action);

  const next: AppState = { ...state, container, selectedLid: newLid };
  return {
    state: next,
    events: [{
      type: 'ENTRY_BRANCHED_FROM_REVISION',
      sourceLid: action.entryLid,
      newLid,
      revision_id: action.revisionId,
    }],
  };
}
```

### 5.3 新規 DomainEvent

```ts
{
  type: 'ENTRY_BRANCHED_FROM_REVISION';
  sourceLid: string;    // 元 entry の lid
  newLid: string;       // 新 branch entry の lid
  revision_id: string;  // snapshot source の Revision.id
}
```

### 5.4 lifecycle

| trigger | AppState 変化 |
|---|---|
| `RESTORE_ENTRY`（既存） | `selectedLid` 不変、container に pre-restore snapshot + overwritten entry |
| `BRANCH_RESTORE_REVISION`（新規） | `selectedLid = newLid`、container に新 entry + provenance relation |
| CANCEL / SET_VIEW_MODE / 他 view 遷移 | branch / restore 結果は persistent（forward-mutation で元に戻らない） |

### 5.5 reducer 非依存の原則

- snapshot parse（`parseRevisionSnapshot`）は pure helper 内で実行
- reducer は `branchRestoreRevision` pure helper を呼ぶだけ。DOM / dispatcher / 乱数 / 時計に依存する処理を pure helper に入れない（I-Rbr10）

---

## 6. Gate 条件

### 6.1 Restore / Branch ボタンの enable/disable 完全判定表

| 条件 | Restore ボタン | Branch ボタン |
|---|---|---|
| `state.phase !== 'ready'` | disabled | disabled |
| `state.readonly === true` | disabled | disabled |
| `state.viewOnlySource === true` | disabled | disabled |
| `state.editingLid !== null` | disabled | disabled |
| historical revision 閲覧中（別 container snapshot） | disabled | disabled |
| `selectedLid === null` | picker 自体を非 mount | 同左 |
| 選択 entry の revision 0 件 | picker 自体を非 mount | 同左 |
| archetype mismatch（snapshot vs 現 entry） | disabled | enabled（branch は新 entry のため安全） |
| 上記いずれにも該当しない | enabled | enabled |

### 6.2 二重 gate の原則

- UI 側で `disabled` 属性により 1 段目の gate
- reducer 側でも同条件で `blocked(state, action)` を返す（二重ガード）
- どちらか片方を bypass されても container は変化しない（I-Rbr7）

### 6.3 archetype mismatch の扱い

`restoreEntry` の既存ガード（`container-ops.ts:504`）を維持。mismatch は reducer が no-op を返す。`ENTRY_RESTORED` event は発火されず、UI は単に何も起きないように見える。v1 では toast / notification は出さない（§9.1）。

### 6.4 「historical revision 閲覧中」の具体条件

現状 AppState に「historical モード」専用 flag は存在しない（revision picker は meta pane 内の現 entry 情報を扱う）。本書でも flag を新設しない。picker に出す revision は **常に選択中 entry の revisions** のみで、別 container snapshot を閲覧しているような runtime mode は scope 外。

---

## 7. UI contract

### 7.1 DOM selectors

| selector | purpose |
|---|---|
| `data-pkc-region="revision-history"` | revision picker のコンテナ（`<details>` 要素） |
| `data-pkc-revision-id="<rid>"` | 1 件の revision row（identity は `Revision.id`） |
| `data-pkc-action="restore-revision"` | Restore ボタン click |
| `data-pkc-action="branch-restore-revision"` | Branch ボタン click |
| `data-pkc-revision-index` | 表示順インデックス（降順 1, 2, 3, ...）。テスト用 |

### 7.2 revision picker の表示項目

| 区分 | 項目 | 表示形式 |
|---|---|---|
| Identity | タイムスタンプ | ISO 短縮（`YYYY-MM-DD HH:mm`） |
| Identity | archetype | text ラベル（`TEXT` / `TEXTLOG` / ...） |
| Fingerprint | `content_hash` 先頭 8 文字 | ある場合のみ。absent なら `—`（em-dash） |
| Action | Restore ボタン | 右端、§6.1 に従い disabled/enabled |
| Action | Branch ボタン | Restore の隣 |

### 7.3 既存 "Revert" ボタンの扱い

- 既存 "Revert"（最新 revision のみ）は **そのまま維持** する
- revision picker は既存 "Revert" の **下** に配置する
- 最新 revision の行に表示される Restore ボタンは Revert と機能重複するが、v1 では両方残す（統合は v1.x、§9.2）

### 7.4 revision picker の展開方法

- `<details>` アコーディオンで常時 mount（default: 折りたたみ / `open` なし）
- revision 数 0 件のときは `<details>` 自体を mount しない
- 展開状態は runtime DOM state（§5.1）。再描画時の展開状態保持は v1 で保証しない（初回描画時は閉じる）

### 7.5 minimum UX — v1 は list + select のみ

v1 では以下の UX パターンを **提供しない**（§0.1-3）:

- revision 間 diff 表示
- revision 検索 / フィルタ（日付範囲、archetype 別、等）
- revision 多選択
- drag-and-drop による revision 並び替え
- snapshot プレビューの inline 展開
- 専用 keyboard shortcut（Tab / Enter のブラウザ既定のみ）

### 7.6 画面レイアウト（概念）

```
┌─ Meta pane ─────────────────────────────┐
│ Entry: "...Title..."                    │
│ Created: 2026-04-01                     │
│ [ Revert ]  ← 最新 revision への既存ボタン │
├─────────────────────────────────────────┤
│ ▼ Revision history (N)                  │
│  2026-04-15 10:30  TEXT  abc12345       │
│    [ Restore ] [ Branch ]               │
│  2026-04-14 18:20  TEXT  def67890       │
│    [ Restore ] [ Branch ]               │
│  2026-04-10 09:00  TEXT  —              │
│    [ Restore ] [ Branch ]               │
└─────────────────────────────────────────┘
```

### 7.7 選択 entry 変更時の picker 再描画

- `selectedLid` が変化したら picker は選択 entry の revisions で再描画される（renderer の通常経路）
- 選択 entry の revision 数が 0 件になれば picker は unmount
- branch restore 成功後は `selectedLid` が新 entry に移るため、picker は新 entry の revisions（通常 0 件）で再描画され、結果として picker は自然に消える

---

## 8. Error paths

### 8.1 `revision_id` が container.revisions に存在しない

- `RESTORE_ENTRY`: 既存 `restoreEntry` が container 無変更で返す
- `BRANCH_RESTORE_REVISION`: pure helper 内で §1.3 step 1 reject、container 無変更
- reducer: `blocked(state, action)` を返す（既存経路）
- UI: toast は v1 で出さない（§9.1）

### 8.2 snapshot parse 失敗（非 JSON / lid 欠落 / archetype 不明 等）

- `parseRevisionSnapshot` が `null` を返す
- いずれの operation でも container 無変更で返す
- UI: 該当 revision row に disabled を付ける（fingerprint が `—` のように表示）ことは v1 で行わない（parse 失敗は hand-crafted データのみで発生し、通常経路では起きない）

### 8.3 `entry_lid` mismatch（branch only）

`BRANCH_RESTORE_REVISION` のみ: `revision.entry_lid !== action.entryLid` の場合、pure helper 内で reject（§1.3 step 3）。この経路は UI からは通常発生しないが、pure helper の defensive guard として置く。

### 8.4 archetype mismatch

- `RESTORE_ENTRY`: 既存の archetype mismatch ガード（§6.3）で reject。container 無変更
- `BRANCH_RESTORE_REVISION`: 発生しない（新 entry を作るため）

### 8.5 readonly / editing / viewOnly / phase 違反

`state.readonly === true` / `state.viewOnlySource === true` / `state.editingLid !== null` / `state.phase !== 'ready'` のいずれかで reducer が blocked を返す（§6）。UI 側は disabled で 1 段目の gate を掛ける。

### 8.6 lid 採番衝突

`generateLid()` が既存 entry と衝突するケースは ULID-like の衝突確率から無視する（H-1 以前からの既存仮定）。v1 で追加検出は行わない。

### 8.7 container null

`state.container === null` では reducer が blocked を返す（§5.2.2 冒頭 guard）。pure helper は呼ばれない。

---

## 9. Non-goal / v1.x 余地

### 9.1 v1 で意図的に実装しないもの

| 機能 | 理由 |
|---|---|
| revision 間 diff viewer | 独立テーマ、archetype 別 diff 戦略の確定が必要 |
| multi-entry branch restore | bulk API 設計が必要、v1 は単 entry のみ |
| cross-container branch | 別 container の entry への branch は import/merge pipeline の拡張 |
| semantic merge（branch と元 entry のマージ） | 上書き / 選択的マージの UX 確定が必要 |
| revision の削除 / 圧縮 UI | I-Rbr1 を揺らす操作、別テーマ |
| named snapshot / revision tagging | UX 拡張、別テーマ |
| asset 独立コピー | 現状は asset key 共有で済む、完全独立は別テーマ |
| branch の自動フォルダ配置 | 配置ルール UI が必要 |
| undo / redo | 全体 undo 機構が未整備（I-V3 forward-mutation が前提） |
| toast / notification（restore 成功/拒否） | UX polish、別テーマ |
| branch tree 可視化 | graph UI の独立テーマ |
| branch 削除の特別 UI | 通常の `DELETE_ENTRY` で十分 |

### 9.2 v1.x で additive に追加可能なもの

以下は本 contract を破壊せずに拡張できる:

- revision picker の検索 / date range フィルタ（§7.5）
- archetype 別 picker（textlog のみ、等）
- revision hover での snapshot 先頭 N 文字 preview
- 最新 "Revert" と picker 内 Restore の統合 UI（§7.3）
- branch entry title の suffix 装飾オプション（`(branch)` / `[v${n}]`）
- branch 関係の一覧表示（provenance を逆引きして「この entry から派生した branches」を表示）

### 9.3 canonical spec との関係（破壊せず・緩めず）

| canonical 項目 | 本 contract での扱い |
|---|---|
| `data-model.md §6.5` I-V3 forward-mutation | 維持（I-Rbr3 で明文化） |
| `data-model.md §6.2.1` `prev_rid` は同 `entry_lid` scope | 維持（I-Rbr2） |
| `data-model.md §6.4` `parseRevisionSnapshot` strict 契約 | 維持（§8.2 の reject 経路で流用） |
| `provenance-relation-profile.md §3.1` canonical direction（source → derived） | **厳守**（I-Rbr9。minimum scope §2.3 step 3 の逆記述を本 contract で訂正） |
| `provenance-relation-profile.md §2.2.1` required metadata（`conversion_kind` + `converted_at`） | 両 key を必ず populate（§4.1） |
| `provenance-relation-profile.md §2.2.2` recommended metadata（`source_content_hash`） | 元 Revision に `content_hash` があれば populate、なければ omit（§4.1） |
| `data-model.md §5` `Relation.kind = 'provenance'`（H-8） | additive `conversion_kind = 'revision-branch'` のみ追加 |
| `SCHEMA_VERSION` | 据え置き（I-Rbr4） |

---

**Contract drafted 2026-04-17.**
