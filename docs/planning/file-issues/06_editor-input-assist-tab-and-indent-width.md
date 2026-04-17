# FI-06 — 入力操作: TAB キー半角化 / markdown-it インデント幅設定

## Status

proposed

## Priority

**P2**（日常作業の手数削減 / 入力操作の自然化）

## Problem

- TEXTAREA で TAB キーを押すと**全角スペース**が入る現状。Markdown 本文では半角スペースによるネストが期待で、全角では markdown-it に拾われない。
- **markdown-it のインデント認識幅**（ネスト判定に使うスペース数）が設定不可。ユーザーによって好みが分かれる（2 / 4 スペース等）。

## User value / risk

- **Value**: TAB の 1 打鍵で想定通りの markdown ネストが入る。環境に合わせて幅を調整できる。
- **Risk**: 既存の全角 TAB 挙動に慣れているユーザーの体感変化。デフォルト切替時の移行コスト。

## Scope boundary

### この issue に含む

- TEXTAREA 内 TAB キーで**markdown-it のインデント幅に等しい半角スペース**を挿入
- インデント幅の**ユーザー設定**（デフォ **2 個**）
- 設定値が markdown-it の parse と TAB キーの insert の**両方**で共有される構造

### この issue に含まない

- リッチエディタへの置換
- Shift+Tab の outdent（自然拡張だがまず 1 方向のみ）
- TEXTLOG の log 内 textarea（同じ経路なので自然に揃うが、TEXTLOG 固有は別 slice 扱いしてよい）

## Expected pipeline

1. minimum scope — 設定の保存場所（localStorage / settings entry / env 定数）、現状の全角 TAB 実装箇所特定
2. behavior contract — TAB キー insert の invariants、IME 中 / selection 中の扱い
3. implementation — features/adapter 境界遵守で slice
4. audit — IME / selection range の regression
5. manual — 05 日常操作 / 09 用語集同期

## Dependencies

- `src/adapter/ui/action-binder.ts` の keydown handler（既存 Enter / quote assist と同経路）
- markdown-it 初期化コード（インデント幅 option を渡す経路）
- user preferences の persist 機構（localStorage 系、現状 `pane-prefs.ts` 等がある）

## Notes

- デフォルトを**半角 2 スペース**で固定する（ユーザー明示）。
- 既存 B-3 Slice α（quote-assist の Enter 自動継続）と同じ keydown handler を触る → regression 注意。
- markdown-it option 一箇所で共有できる構造にしておかないと設定値がズレる。
