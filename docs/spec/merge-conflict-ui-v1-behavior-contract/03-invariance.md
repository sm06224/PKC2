# 3. Invariance（I-MergeUI1〜I-MergeUI10）

v1 の最重要部分。conflict UI のいかなる操作でも以下の不変条件を保証する。

## I-MergeUI1: host absolute preservation

conflict UI のいかなる操作（keep-current / duplicate-as-branch / skip / bulk / cancel / confirm）でも、host container の entry / relation / revision は **一切変更されない**。host 側に新しい entry が追加されることはあっても（duplicate-as-branch による imported の append）、既存 host entry の title / body / archetype / createdAt / updatedAt / lid は不変。

## I-MergeUI2: keep-current と skip の container 副作用同一

`keep-current` と `skip` は container に対する副作用が **完全に同一**（imported entry を MergePlan から除外する）。区別は `CONTAINER_MERGED` event の `suppressed_by_keep_current` / `suppressed_by_skip` 配列でのみ記録される。

## I-MergeUI3: C1 は default 採用で gate 通過、C2 は explicit 選択必須

C1（content-equal）は `keep-current` が default pre-selected されており、ユーザーが何も操作しなくても gate 通過する。C2（title-only / title-only-multi）は default なしで、ユーザーが明示的に resolution を選ぶまで gate を block する。

## I-MergeUI4: provenance 方向は一方向

`duplicate-as-branch` で追加される provenance relation の方向は常に `from = imported（derived）`, `to = host（source）`。逆方向の relation は作成しない。

## I-MergeUI5: resolution state の reset

`CANCEL_IMPORT` / `CONFIRM_MERGE_IMPORT` / 新しい `SYS_IMPORT_PREVIEW` のいずれでも `mergeConflictResolutions` は `{}` または `undefined` に reset される。resolution state は session を跨いで持ち越さない。

## I-MergeUI6: bulk shortcut は v1 で 2 種のみ

v1 の bulk shortcut は `Accept all host`（全 conflict を keep-current）と `Duplicate all`（全 conflict を duplicate-as-branch）の 2 種のみ。`Skip all` / `Accept all incoming` / archetype 別 bulk は v1 に含めない。

## I-MergeUI7: multi-host C2 では keep-current を disable

同 title の host entry が複数存在する `title-only-multi` conflict では、`keep-current` radio を disable する。どの host を「current」として残すかが曖昧なため。ユーザーの選択肢は `duplicate-as-branch` または `skip` の 2 択。

## I-MergeUI8: schema mismatch は conflict UI mount より前に reject

schema mismatch は既存の preview gate で reject される。conflict UI がこの判定を行うことはない。conflict UI は schema 正常な container のみを前提とする。

## I-MergeUI9: readonly / historical / preservation phase では conflict UI は mount されない

これらの phase では import 自体が不可能であり、conflict UI の mount trigger が発火しない。追加ガードは不要（既存 gate で十分）。

## I-MergeUI10: detectEntryConflicts は pure / deterministic / O(H+I)

conflict 検出関数は pure helper として実装され、同一入力に対して常に同一出力を返す。DOM 操作、AppState 読み書き、dispatcher dispatch は一切行わない。計算量は host entry 数 H + imported entry 数 I に対して O(H+I)。
