# FI-02 — 編集安全性: TEXTLOG 貼付先ズレ / FOLDER Ctrl+S 不可

## Status

proposed

## Priority

**P0**（貼付先誤り / 保存不可はどちらも編集意図の直接破壊）

## Problem

1. **TEXTLOG 貼付先ズレ**: TEXTLOG に複数ログが存在する編集モードで、**真ん中のセルにスクショを貼付すると、リンクが先頭セルに貼付され、フォーカスも先頭セルに戻る**。ユーザーの貼付対象意図と逆方向のセルが書き換わる。
2. **FOLDER Ctrl+S 保存不可**: FOLDER の DESCRIPTION 編集中に Ctrl+S を押しても保存コマンドが発火しない。TEXT / TEXTLOG では Ctrl+S が効くのに FOLDER では効かない。

## User value / risk

- **Value**: ユーザーの編集意図が常に期待通りのセル / entry に反映される。キーボード完結の保存動線が全 archetype 共通化する。
- **Risk**: (1) は「気付かないうちに別ログが書き換わる」サイレント破壊経路。(2) は save 忘れによる未保存喪失経路。

## Scope boundary

### この issue に含む

- TEXTLOG 編集中の**貼付ターゲット解決ロジック**（active log row の決定）の修正
- FOLDER description 編集中の Ctrl+S キーバインドの**保存コマンド発火**
- 2 件を「編集安全性」として 1 issue 内で閉じる

### この issue に含まない

- TEXTLOG の drag-to-reorder など範囲外の UX 改善
- FOLDER そのものの編集 UX 刷新
- Ctrl+S の全 archetype 共通 contract 再定義（もしあれば別 issue）

## Expected pipeline

1. minimum scope — 2 件の症状再現条件固定、影響範囲の洗い出し
2. behavior contract — 貼付先決定ルールの明文化、Ctrl+S hook の責務境界
3. implementation — pure helper（active row resolution）+ UI binder 修正
4. audit — regression 確認（他 archetype で Ctrl+S が壊れないこと）
5. manual — 09 トラブルシューティング更新（過去の「TEXTLOG の複数ログをまとめて置換したい」近辺と衝突しないか確認）

## Dependencies

- `src/adapter/ui/textlog-presenter.ts`（貼付経路）
- `src/adapter/ui/action-binder.ts`（Ctrl+S hook）
- folder presenter（description 編集 textarea）

## Notes

- 2 件とも「編集安全性」の観点で grouping 許可対象（grouping guidance §「TEXTLOG 貼付先ズレ + FOLDER Ctrl+S のような『編集安全性』 → 近ければ 1 issue」に合致）。
- 再現手順は minimum scope 段階で確実に固定すること。
- どちらも既存テストでカバーできていない想定 → regression 防止のため slice 内でテスト追加必須。
