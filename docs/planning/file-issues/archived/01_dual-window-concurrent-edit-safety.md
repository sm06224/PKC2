# FI-01 — 別ウィンドウ / センターペイン 並行編集の安全性

## Status

proposed

## Priority

**P0**（データ損失・上書き消失懸念）

## Problem

- エントリをダブルクリックして開く別ウィンドウ（Entry Window）と、メインワークスペースのセンターペインとの間で、**双方向の変更反映が完了していない**。
- 両方で同じエントリを編集した場合、**あとから Save した側がもう一方の変更を無言で上書き**する。エラー / 警告 / コンフリクト通知は現状ない。
- ユーザーは上書きが起きたことに気付けず、未保存の変更がサイレントに消える。

## User value / risk

- **Value**: 別ウィンドウを「補助ペイン」として安心して使える。複数画面運用（資料参照 + 編集）の信頼性が大きく上がる。
- **Risk**: 現状はサイレントデータ損失の経路。ユーザーの信頼を最も損なう類のバグ。

## Scope boundary

### この issue に含む

- メイン側 → 別ウィンドウ側、および別ウィンドウ側 → メイン側の**双方向 state 反映**
- 同一エントリを双方で編集中の**競合検知**
- 競合時の挙動: セーフ方向の自動マージ **or** 明示エラー（supervisor 判断で決定）
- 別ウィンドウを閉じた / リロードした時点での未保存変更の救済経路

### この issue に含まない

- 複数ブラウザ / 複数デバイス間の同期（これは D-3 WebRTC vision の領域）
- 3 ウィンドウ以上の同時編集
- 編集ロックを OS 機構で強制する類のこと（browser 内で自主運用）

## Expected pipeline

1. minimum scope — 競合検知の粒度（entry 単位 / field 単位）、「セーフ方向自動マージ or エラー」の決定
2. behavior contract — state 伝搬経路の fix、conflict 判定 / 解決の invariants
3. implementation — 3 slice（pure diff / state / UI 通知）
4. audit — post-impl invariance audit
5. manual — 05 日常操作 / 09 トラブルシューティング同期

## Dependencies

- 既存の entry window 経路（`src/adapter/ui/entry-window.ts`）
- postMessage transport（`src/adapter/transport/`）
- 過去完了の A-2（text split edit in entry window）を前提にする

## Notes

- 操作順序バグの中でも最重要カテゴリ。minimum scope 化の段階で「セーフ自動マージ」か「エラー通知」かを**最初に決める**こと。
- ユーザー要望は「**なるべくならセーフ方向で自動**で大丈夫な方向に」。
- テスト観点: 両側同時編集のレース、片側 save → 片側もう一度 save の順序、closing race。
