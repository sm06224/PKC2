# FI-05 — 編集中の添付経路を TEXTAREA 自動 internal link 貼付に揃える

## Status

proposed

## Priority

**P2**（日常作業の手数削減）

## Problem

- 現状、TEXTAREA 編集中に**スクショを貼付**すると自動で添付化され、本文にリンクが差し込まれる（期待通り）。
- しかし、**DnD やボタンからファイル添付した場合**は同じことが起きず、本文に何も差し込まれない。ユーザーが別途 `![](asset:...)` 等を自分で書く必要があり手数が倍。
- スクショ貼付経路と DnD / ボタン添付経路で**動線が非対称**になっている。

## User value / risk

- **Value**: どの経路で添付しても本文に即リンクが入る、対称な編集体験。作業手数が均等化する。
- **Risk**: 誤った位置 / 意図しないタイミングで自動挿入されるとノイズになるので、トリガ境界は明確化する。

## Scope boundary

### この issue に含む

- TEXT / TEXTLOG の編集モード中に**DnD 経由**でファイルを添付した時の本文内リンク自動挿入
- 同じく**ボタンからファイル添付**した時の本文内リンク自動挿入
- 挿入位置は現在のカーソル位置

### この issue に含まない

- 閲覧モード中の DnD 挙動変更（編集中に限定）
- 添付基盤側の改善（それは FI-04）
- 添付プレビュー生成

## Expected pipeline

1. minimum scope — 現在の貼付経路と DnD 経路を実装レベルで比較し、分岐点を特定
2. behavior contract — 「編集中 + TEXTAREA フォーカス」時の invariants 固定
3. implementation — action-binder と presenter の補正 slice
4. audit — 閲覧モードへの副作用なし確認
5. manual — 05 日常操作同期

## Dependencies

- `src/adapter/ui/action-binder.ts`（貼付 / DnD ハンドラ）
- TEXTLOG presenter の貼付経路（FI-02 と衝突する可能性あり）
- FI-04 の常設 DnD エリアが決まっていれば整合を取る

## Notes

- FI-02（TEXTLOG 貼付先ズレ）と同じ領域を触るため、**実装順序は FI-02 → FI-05** が安全。
- FI-04 の常設 DnD と組み合わせた時の挙動も考慮（常設 DnD は edit 対象の特定が別問題になる）。
