# FI-10 — `csv2table` の fenced block 表変換対応（B-1 の alias 整備 or 周知）

## Status

proposed

## Priority

**P3**（表示改善。既存機能の alias / 周知寄り）

## Problem

- ユーザーが過去にも要望した「CSV をコードブロックに書き、種別を **csv2table** にしたらテーブルに変換して出してほしい」が再掲された。
- 現状は **B-1**（S-16）で `csv` / `tsv` / `psv` の fenced block を自動 `<table>` 化している。ユーザーが求めている lang 名 `csv2table` はこの alias に含まれていない可能性がある。
- 別言語名 alias 追加 or ユーザーへの既存機能の周知のどちらかで解消する。

## User value / risk

- **Value**: ユーザーの語彙（`csv2table`）で意図した表示になる。既存 B-1 で解決している場合は周知コスト最小で終わる。
- **Risk**: alias を増やすと syntax highlight 側（B-2）との衝突リスクが増える。

## Scope boundary

### この issue に含む

- 現行 B-1 実装が `csv2table` / `tsv2table` 等を受け付けるか**まず確認**
- 未対応なら最小差分で alias を追加
- すでに対応済みなら manual 05（日常操作）に「利用可能な lang 名」を明示

### この issue に含まない

- CSV parser の再実装 / RFC 4180 範囲の拡張
- XLSX 等バイナリ形式の対応（C-4 spreadsheet-entry-archetype の領域）
- 表示後の編集 UI（読み取り専用表示のまま）

## Expected pipeline

1. minimum scope — `src/features/markdown/csv-table.ts` の lang 判定箇所を確認し、要望が既存実装で満たせるか判定
2. behavior contract — alias を増やす場合のみ作成（周知のみで足りるなら不要）
3. implementation — 最小差分 alias 追加 or manual 追記のみ
4. audit — B-2 syntax highlight 経路の regression 確認
5. manual — 05 日常操作 / 用語集同期

## Dependencies

- `src/features/markdown/csv-table.ts`
- `src/features/markdown/markdown-render.ts`（fence rule override）
- B-2 code-highlight との共存

## Notes

- ユーザー要望「以前にも要望した」は、過去セッションで**既に B-1 として実装済み**のテーマ。alias 名違いでユーザーが気付けていない可能性が高い。
- まず周知で足りるか scope 段階で判断。コード変更は最小にする。
- 他 2table 系 alias（`tsv2table` / `psv2table`）の一貫性も決める。
