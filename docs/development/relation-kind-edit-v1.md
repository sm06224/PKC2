# Relation Kind Edit v1 — Implementation

**Status**: implementation — 2026-04-20.
**Scope**: relations-based `pkc-relations` sub-panel の既存 relation row に「kind を後から変更する」インライン edit UI を 1 つ追加する。**用語も機能境界も relation 限定**（markdown-reference backlinks は一切触らない）。Unified Backlinks v1（2026-04-20 merged, `unified-backlinks-v1.md`）で置き場所が `References` umbrella 下に確定したことを前提にしている。
**Baseline**: `docs/development/unified-backlinks-v1.md`（References umbrella）と `docs/development/relation-delete-ui-v1.md`（行レベル編集アフォーダンスの前例）の 2 つ。

---

## 1. 設計原則

v0 roadmap / 本 PR 依頼の要件:
- scope は **`[data-pkc-region="relations"]`** のみ（link-index は非対象）
- 既存 relation の kind をその場で変更可能にする（delete → re-create を強制しない）
- `unified` 系の generic backlink 編集に広げない（用語は relation に固定）
- `delete-relation` の行レベル UI と**同じアフォーダンス階層**に収める
- readonly / manual / light-source での編集抑止は reducer 側でも gate する

## 2. action / event / reducer

### 2.1 新規 UserAction
```ts
| {
    type: 'UPDATE_RELATION_KIND';
    id: string;          // target relation id
    kind: RelationKind;  // new kind
  }
```

### 2.2 新規 DomainEvent
```ts
| {
    type: 'RELATION_KIND_UPDATED';
    id: string;
    kind: RelationKind;       // new
    previous: RelationKind;   // old（記録用・後続の diff / undo 余地）
  }
```

### 2.3 reducer 契約（`case 'UPDATE_RELATION_KIND'`）
以下の順で gate:
1. `state.readonly` → blocked（defence-in-depth / UI 側も `canEdit` gate 済）
2. `state.container == null` → blocked
3. target relation が存在しない → blocked
4. **target の現 kind が `'provenance'`** → blocked（provenance は `metadata.conversion_kind` 等の履歴情報を保持しており、UI からの変更は整合性破壊）
5. **action.kind が `'provenance'`** → blocked（UI 経由で provenance を後付けすることは禁止）
6. `existing.kind === action.kind` → no-op（state identity 保持、event 空配列）
7. 上記を通った場合のみ `updateRelationKind(container, id, kind, now())` で relations を再構築し、`RELATION_KIND_UPDATED` を emit

### 2.4 core op
```ts
updateRelationKind(container, id, kind, now): Container
```
- 対象 relation のみ `{ ...r, kind, updated_at: now }` に差し替え
- `container.meta.updated_at` も更新
- 該当 id なし / 同一 kind → 入力コンテナを identity 返し（`===` 保持）

### 2.5 persistence
`SAVE_TRIGGERS` に `'RELATION_KIND_UPDATED'` を追加（container 変更を伴うため debounce save の対象）。

## 3. UI 仕様

### 3.1 DOM（relation row 内、peer link と delete button の間）

**editable かつ kind !== 'provenance' の場合**:
```html
<li class="pkc-relation-item" data-pkc-relation-id="r1">
  <span class="pkc-relation-peer" data-pkc-action="select-entry" data-pkc-lid="...">...</span>
  <select
    class="pkc-relation-kind pkc-relation-kind-select"
    data-pkc-action="update-relation-kind"
    data-pkc-relation-id="r1"
    title="Change relation kind"
    aria-label="Change relation kind">
    <option value="structural">structural</option>
    <option value="categorical">categorical</option>
    <option value="semantic">semantic</option>
    <option value="temporal">temporal</option>
  </select>
  <button class="pkc-relation-delete" ...>×</button>
</li>
```

**readonly または kind === 'provenance' の場合**:
既存の read-only badge を維持。
```html
<span class="pkc-relation-kind">structural</span>  <!-- または provenance -->
```

### 3.2 control の選定

- **inline `<select>`** を採用。理由:
  - 5 択以下の固定語彙（structural / categorical / semantic / temporal の 4 + provenance）
  - OS native / a11y 良好 / keyboard-only で完結
  - pop menu の独自実装を避けたい（v0 draft の "最小拡張" 方針準拠）
- 採用しなかった選択肢:
  - **クリックで popup menu** → 独自 state 管理 / outside-click 処理 / a11y を再実装する必要あり
  - **inline text edit** → free-form 入力を許すと `RelationKind` 型の不変条件が崩れる
  - **badge click → cycle through kinds** → 選択肢が明示されない（discoverability が低い）

### 3.3 配置
既存 `.pkc-relation-kind` badge を**同じ DOM 位置**で `<select>` に差し替え（class `pkc-relation-kind` を select 側にも付与して CSS 互換を保つ）。delete button との相対位置は不変。

### 3.4 inbound / outgoing の扱い
**両方向同一**。relation の `kind` は方向に依存しないプロパティのため、`Outgoing relations` group の行でも `Backlinks` group の行でも同じ select を出す。backlink 側の select 変更は、内部的には `peer → current` 関係の kind を変えるのと同値。

### 3.5 編集可能な kind
4 種のみ: `structural` / `categorical` / `semantic` / `temporal`。
`provenance` は option に含めない（= UI から付与不可 / 剥奪不可）。理由:
- `provenance` は merge-duplicate / text-textlog conversion のシステム生成 kind
- `Relation.metadata?` に `conversion_kind` 等を保持しており、kind だけ書き換えるとデータ整合性が破壊
- `docs/spec/text-textlog-provenance.md` §6 / `docs/spec/textlog-text-conversion-policy.md` の契約を維持

provenance relation の行は通常の `<span>` badge を出して、変更アフォーダンスを露出させない。

### 3.6 変更確定フロー
- `<select>` の `change` event で即時確定（confirm prompt なし）
- reducer が gate を通せば RELATION_KIND_UPDATED 発火 → 次の render で select が新しい値を映す
- **undo UI は v1 ではなし**。delete-relation UI と同等の「即時適用」ポリシに合わせる（履歴観点が必要になったら v2 で summary row と併せて検討）

## 4. action-binder 変更

`handleChange` 内に新規分岐を追加:

```ts
if (action === 'update-relation-kind') {
  const relId = target.getAttribute('data-pkc-relation-id');
  const val = (target as HTMLSelectElement).value as RelationKind;
  if (relId && val) {
    dispatcher.dispatch({ type: 'UPDATE_RELATION_KIND', id: relId, kind: val });
  }
  return;
}
```

`change` イベントは `root.addEventListener('change', handleChange)` で既にルート delegation されているため、新規 listener 登録は不要。

## 5. 維持した既存挙動

- **relation row の delete UI**（`pkc-relation-delete`）— 不変
- **relation peer link の navigation**（`data-pkc-action="select-entry"`）— 不変
- **relation-create form**（`[data-pkc-region="relation-create"]`）— 不変（作成フローと編集フローは分離維持）
- **link-index 側**（`data-pkc-region="link-index"` / outgoing / backlinks / broken）— 完全に非対象
- **provenance relation の保護**（text-textlog 変換 / merge-duplicate の来歴）— 行 UI からも reducer からも二重ガード
- **`data-pkc-region="relations"` / `data-pkc-relation-direction` / `data-pkc-relation-id`** — すべて維持

## 6. 用語整理

- **"relation kind edit"**: 本 PR の正式名。"backlink kind edit" とは呼ばない
- **editable kinds**: 4 種（structural / categorical / semantic / temporal）
- **system-only kinds**: `provenance`（UI からの追加・削除・変更すべて不可）
- spec / commit / コメントでは必ず **"relation"** を前置（"backlink" 単独語で語らない）
- 機能境界: **relations-based backlinks の kind 編集のみ**。markdown-reference backlinks / link-index は範囲外

## 7. テスト

| ファイル | 追加 |
|---|---|
| `tests/core/container-ops.test.ts` | +4 tests（`updateRelationKind`: 成功 / 他 relation 非影響 / id なし identity / same-kind identity）|
| `tests/core/app-state.test.ts` | +6 tests（成功 + event / no-op / provenance 入口 block / provenance 出口 block / missing id / readonly block）|
| `tests/core/action-types.test.ts` | +2 (action literal 追加 / ユーザー action 列挙に追加) |
| `tests/adapter/renderer.test.ts` | +4 tests（outgoing の inline select / backlinks の inline select / provenance 行の badge / readonly の badge）|
| `tests/adapter/mutation-shell.test.ts` | +1 test（change event で dispatch → reducer → 再 render まで E2E）|
| 既存 `shows relation kind badge` test | select 前提に書き換え（`span.pkc-relation-kind` → `select.pkc-relation-kind`）|

## 8. 非スコープ

- **provenance relation の編集フロー**（metadata 保全を前提にした別契約が必要、別 PR）
- **bulk edit UI**（複数行の kind を一括変更）— 未着手、必要性が出たら v2+
- **関連する DomainEvent の UI 通知**（トースト等）— 既存 delete UI と同様、現状はサイレント適用
- **undo / redo**（編集履歴）— 未着手。`RELATION_KIND_UPDATED.previous` を記録しているのは将来の undo への保険
- **link-index 側の "kind" 概念導入** — 採用しない（link-index backlinks は markdown 本文が正、kind という型を持たない）

## 9. 関連文書

- `docs/development/unified-backlinks-v1.md` — References umbrella（本 PR の前提）
- `docs/development/relation-delete-ui-v1.md` — 行レベル delete UI（本 PR のアフォーダンス前例）
- `docs/development/backlinks-panel-v1.md` — relations-based backlinks の成立
- `docs/spec/data-model.md §5` — Relation / RelationKind 正規定義
- `docs/spec/text-textlog-provenance.md §6` — `provenance` kind の契約（本 PR で保護する対象）
- `src/core/action/user-action.ts` — `UPDATE_RELATION_KIND` 定義
- `src/core/action/domain-event.ts` — `RELATION_KIND_UPDATED` 定義
- `src/core/operations/container-ops.ts` — `updateRelationKind` 実装
- `src/adapter/state/app-state.ts` — reducer `case 'UPDATE_RELATION_KIND'`
- `src/adapter/ui/renderer.ts` — 行レベル select 描画
- `src/adapter/ui/action-binder.ts` — change event wiring
- `src/adapter/platform/persistence.ts` — SAVE_TRIGGERS に event 追加
- `src/styles/base.css` — `.pkc-relation-kind-select` スタイル

## 10. 後続 PR 候補

1. **References summary row (v2)**: `"Relations: N  |  Markdown refs: M  |  Broken: K"` を umbrella heading 下に
2. **Non-Responsibility Boundary の acceptance 昇格**（PKC-Message Hook 系列 docs）
3. **Unified orphan detection draft**（v3+）
4. **provenance relation の metadata 閲覧 UI**（provenance は変更不可だが内容の閲覧はできる方が情報価値が高い、optional）
