# 5. Resolution 操作（data contract）

## 5.1 3 操作の定義

| 操作 | container 副作用 | provenance | event 記録 |
|------|-----------------|------------|-----------|
| **`keep-current`** | imported entry を MergePlan から除外 | なし | `suppressed_by_keep_current[]` に追加 |
| **`duplicate-as-branch`** | imported を新 lid で append（MVP default と同じ） | provenance relation 1 件追加 | `added_entries` に計上 |
| **`skip`** | imported entry を MergePlan から除外 | なし | `suppressed_by_skip[]` に追加 |

## 5.2 keep-current の厳密な意味

- MergePlan から該当 imported_lid を除外
- imported 側 relation で from/to に該当 lid を持つものは dangling drop（既存経路）
- imported 側 asset 参照は merge 後 orphan GC で除去（既存経路）
- host 側は一切変更なし（revision も増えない）

## 5.3 duplicate-as-branch の厳密な意味

- MergePlan は無変更（既存 MVP rename 経路でそのまま append）
- provenance relation を 1 件追加（§5.5 参照）
- imported は新 lid で host に並存
- host 側は一切変更なし

## 5.4 skip の厳密な意味

- MergePlan から該当 imported_lid を除外（keep-current と副作用同一 — I-MergeUI2）
- event payload の記録先のみ異なる（`suppressed_by_skip[]`）

## 5.5 provenance relation schema

`duplicate-as-branch` で追加する provenance relation：

```ts
{
  id: "<new relation id>",
  kind: "provenance",
  from_lid: "<imported_new_lid>",   // derived（merge で生成された新 lid）
  to_lid: "<host_lid>",             // source（対応 host entry）
  metadata: {
    kind: "merge-duplicate",
    detected_at: "<ISO datetime>",
    match_kind: "content-equal" | "title-only" | "title-only-multi",
    imported_title: "<snapshot>",
    imported_archetype: "<archetype>",
  }
}
```

**向き**（I-MergeUI4）：`from = imported (derived)`, `to = host (source)`。`text-textlog-provenance.md` §4 の「derived から source を指す」規則を踏襲。

**multi-host の場合**：provenance の `to_lid` は代表 host（updatedAt 最新）を指す。`metadata` に `host_candidates: string[]` を追加して全候補を記録する。

## 5.6 accept-incoming を v1 に含めない理由

canonical spec §6.2（I-Merge1 = append-only）を維持する。host entry の上書きは：

1. host absolute preservation（I-MergeUI1）に違反する
2. 上書き操作は revision 契約の別設計が必要
3. multi-host ambiguous で上書き対象が不定
4. 実運用では duplicate-as-branch → 手動 delete で同等の結果が audit trail 付きで得られる
