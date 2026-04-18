# 9. Gate 条件

## 9.1 Confirm ボタンの enable/disable 完全判定表

| C1 全件 resolved | C2 全件 explicit | C2-multi 全件 explicit | Confirm enabled |
|-----------------|-----------------|----------------------|-----------------|
| yes（default or override） | yes | yes | **YES** |
| yes | no | — | **NO** |
| yes | yes | no | **NO** |
| no | — | — | **NO** |

## 9.2 「resolved」の定義

- C1 は `keep-current` が default pre-selected されているため、ユーザーが何も操作しなくても「resolved」として扱う
- C2 / C2-multi はユーザーが明示的に radio を選択するまで「unresolved」

## 9.3 gate 未通過時の表示

- `Confirm merge` button は `disabled` attribute を持つ
- button の近傍に残件数を表示：`Resolve N pending conflicts`（N は unresolved の C2 / C2-multi 件数）

## 9.4 既存 gate との共存

conflict UI の gate は既存の gate 条件（schema mismatch / importPreview null）に **追加** される。既存 gate が block している場合、conflict gate の判定は行わない（既存 gate が先に reject する）。
