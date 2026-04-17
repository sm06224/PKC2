# FI-12 — UI テーマ設定化: Kanban ハイライト / アクセントカラー / スキャンライン

## Status

proposed

## Priority

**P2**（テーマ / 見た目）

## Problem

- **Kanban 表示でハイライトが強すぎ**、カード本文が読めなくなることがある。
- **スキャンライン**（走査線風装飾）が視認性を下げている。
- UI テーマの一部がハードコードされており、ユーザーが調整できない。

## User value / risk

- **Value**: ユーザーが視認性と好みを両立できる。Kanban の情報可読性が改善。
- **Risk**: テーマ切替の persistence と復元に失敗するとユーザー体験が劣化する。

## Scope boundary

### この issue に含む

- **アクセントカラー** をユーザーが選べるスタイルに（デフォは**ネオングリーン系**）
- **スキャンライン** を on/off トグル（デフォ **オフ**）
- **Kanban セレクション / ハイライト** の強度を不透明度や色で緩和
- 設定の永続化（localStorage）とブート時の適用経路

### この issue に含まない

- 完全カスタマイズ可能な theme editor（色全部 / フォント等）
- ダーク / ライトモードの本格切替
- 印刷用スタイル

## Expected pipeline

1. minimum scope — CSS 変数化の範囲決定（`--c-accent` / `--c-scanline-opacity` 等）、設定 UI の最小形
2. behavior contract — 設定 schema、デフォルト値、invalid 値フォールバック
3. implementation — CSS 変数 + settings adapter + UI slice
4. audit — 全 archetype / 全 view のビジュアル regression
5. manual — 05 日常操作 / 用語集同期

## Dependencies

- `src/styles/base.css`
- pane-prefs と同系の persistence 流儀（localStorage）
- Kanban / Calendar 側の view CSS

## Notes

- **デフォ変更**はユーザー明示: アクセント=ネオングリーン系、スキャンライン=オフ。
- Kanban ハイライトは「選択 / ドラッグ / hover / 期限超過」など複数起点が混じる。**どれが強すぎるか**を minimum scope で切り分ける。
- 既存の `.pkc-tok-*` / `--c-tok-*`（B-2）とは分離して設計する。
