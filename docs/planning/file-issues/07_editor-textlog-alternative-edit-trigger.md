# FI-07 — TEXTLOG ログ編集トリガをダブルクリック以外に割当

## Status

proposed

## Priority

**P2**（日常作業の手数 / OS 標準機能との衝突解消）

## Problem

- TEXTLOG ログ行の**ダブルクリック**で編集を開始する現行 UX は入りやすい一方、OS 標準の「ダブルクリック = 単語選択」「トリプルクリック = 段落選択」が**使えなくなる**。
- 参照のために単語選択したいユーザーにとっては常時ストレス。

## User value / risk

- **Value**: 閲覧時の OS 標準テキスト選択が機能する。編集は明示的な操作から入る。
- **Risk**: 既存のダブルクリック編集に慣れたユーザーの移行コスト。

## Scope boundary

### この issue に含む

- **ダブルクリックで即編集する挙動の廃止 or 条件化**
- 代替の編集開始トリガ（**右クリックメニュー項目** / 専用ボタン / キーバインド等）を最低 1 つ提供
- 選ばれたトリガが既存の context menu / shortcut helper と整合すること

### この issue に含まない

- TEXTLOG 全体の編集 UX 刷新
- 他 archetype のダブルクリック挙動変更

## Expected pipeline

1. minimum scope — 候補（右クリック項目 / 専用ボタン / キー）から 1 つ選定
2. behavior contract — 閲覧モード時のクリック / DblClick 意味論固定
3. implementation — presenter と action-binder の修正 slice
4. audit — 選択系 regression（range selection と衝突しないか）
5. manual — 05 日常操作 / 06 キーボードショートカット同期

## Dependencies

- `src/adapter/ui/textlog-presenter.ts`
- `src/adapter/ui/action-binder.ts`（context menu 経路）
- 既存 context menu の描画 clamp（S-12 / `context-menu-clamp.test.ts`）

## Notes

- 「右クリックメニューに入れとくとか」がユーザー提案。これを第一候補に minimum scope を組み立てる。
- DblClick を**完全廃止**するか、**修飾キー付き条件化**（例: Shift+DblClick）するかは scope 段階で supervisor が決定。
- SELECT 範囲が壊れない保証を contract で明文化。
