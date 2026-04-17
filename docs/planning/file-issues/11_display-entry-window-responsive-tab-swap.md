# FI-11 — 別ウィンドウ編集 UI とセンターペインの UX 乖離解消

## Status

proposed

## Priority

**P2**（表示改善。操作文脈の非対称を減らす）

## Problem

- エントリをダブルクリックで開く別ウィンドウ（Entry Window）の**編集画面 UI** がセンターペインの編集 UI と**乖離**している（A-2 で TEXT 編集は split に揃ったが、他 archetype / レイアウト全般で未整合が残る）。
- 画面幅によっては別ウィンドウ内の情報密度が破綻する。**画面幅でタブ表示 / 常時 2 ペイン表示を切り替える**ような responsive な UX を要望。

## User value / risk

- **Value**: メイン / 別ウィンドウの編集体験が対称化し、学習コストが下がる。画面幅に応じて最適な密度に自動切替する。
- **Risk**: 画面幅ブレイクポイントを決め打つと端末依存の不具合が出やすい。

## Scope boundary

### この issue に含む

- 別ウィンドウ内の archetype 編集 UI を**センターペインと同じ構造**に寄せる（A-2 を全 archetype に拡張する方向）
- **ビューポート幅ベースのレイアウト切替**（狭い: タブ / 広い: 2 ペイン）
- 画面幅ブレイクポイントと transition の invariants

### この issue に含まない

- 別ウィンドウと本体の**状態同期 / 競合検知**（それは **FI-01** の領域）
- 他 archetype 本体の UI 刷新
- 3 ペイン以上の拡張

## Expected pipeline

1. minimum scope — 現状の乖離を archetype × 画面幅で洗い出し、最初に揃える 1 archetype を決定
2. behavior contract — responsive 切替の境界、保存 / キャンセル系動線の不変
3. implementation — entry-window の presenter 統合 slice
4. audit — メイン側に副作用ないこと確認
5. manual — 05 / 09 同期

## Dependencies

- A-2（S-13 / text split edit in entry window、2026-04-14）
- **FI-01** と作業領域が強く重なる（同ファイル entry-window.ts を触る）
- センターペイン renderer の presenter 構造

## Notes

- FI-01（データ損失懸念）と**別ウィンドウ周りを触る順序**は FI-01 を先に整えるのが安全。
- 「画面幅で切替」はメディアクエリ or ResizeObserver 相当の実装で、OS ウィンドウ resize 中の flicker に注意。
- A-2 でできたことを全 archetype に広げる、という構造として位置付ける。
