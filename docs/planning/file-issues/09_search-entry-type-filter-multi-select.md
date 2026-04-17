# FI-09 — 検索エントリ種別フィルタの複数選択 + TODO / FILE 既定非表示

## Status

proposed

## Priority

**P2**（検索 / 表示改善）

## Problem

- 検索機能のエントリ種別ボタンは**単一選択**のため、「TEXT と TEXTLOG を両方見たい」のような自然な組み合わせができない。
- **TODO / FILE (attachment)** は常時表示されているが、日常の検索操作ではほとんど対象にしないケースが多く、視覚ノイズになっている。

## User value / risk

- **Value**: 検索時の柔軟性が上がる。主要 archetype（text / textlog / folder 等）の組み合わせ絞り込みが可能に。ノイズ削減で検索 UI が軽くなる。
- **Risk**: 多選択 UI は状態数が増えるため、セレクタのキー保存 / 復元 / リセットの contract を明示しないと混乱する。

## Scope boundary

### この issue に含む

- エントリ種別ボタンの**複数選択化**（N 個同時 ON 可）
- デフォルト可視 / 折りたたみの分離（**TODO / FILE は既定非表示**、必要時に展開する）
- 選択状態の永続化有無の決定（セッション限りか localStorage か）

### この issue に含まない

- 検索結果の並び替えロジック変更
- archetype 追加時の UI 拡張設計
- A-4 / S-18 の sub-location 検索との integration 再設計

## Expected pipeline

1. minimum scope — UI 方式（toggle button group / multi-checkbox / dropdown 等）を 1 つに絞る
2. behavior contract — 多選択の invariants、0 件選択時の挙動、デフォルト状態
3. implementation — 検索 filter pure helper + UI slice
4. audit — A-4 sub-location 検索 regression
5. manual — 05 日常操作同期

## Dependencies

- 既存の search pipeline（`src/features/search/**`）
- S-18 で追加された sub-location 結果表示
- pane-prefs と同系の persistence 流儀

## Notes

- 「常時は TODO / FILE は見えなくても問題ない」はユーザー明示の順序感。
- 0 件選択を「全選択と同義」にするか「0 件結果」にするかは contract 段階で決定。
- 多選択 UX が A-4 / S-18 の sub-location 表示を壊さないか audit 段階で確認。
