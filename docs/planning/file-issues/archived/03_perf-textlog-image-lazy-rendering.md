# FI-03 — 複数画像 TEXTLOG の表示 / 編集時の遅延解消

## Status

proposed

## Priority

**P1**（性能劣化 / 無言で遅くなる問題）

## Problem

- 複数スクショを含む TEXTLOG の**表示**が重い。ログ数が増えるほど体感速度が落ちる。
- **編集モードで複数画像を添付**した場合も同様に重くなる。
- 遅延は無言で起こる（進捗表示 / skeleton / lazy load のいずれも未実装）。ユーザーは「壊れたのか / ただ待てば良いのか」判断できない。

## User value / risk

- **Value**: 画像を多く含む TEXTLOG が実用耐えする。スクショログのユースケース（作業記録 / バグ報告等）が本来の設計意図通りに使える。
- **Risk**: 性能劣化は体感コストが高く、ユーザー離脱直結の痛み。

## Scope boundary

### この issue に含む

- ログ行単位での**画像の lazy rendering**（viewport 外は defer）
- 画像デコード / 表示の**非同期化**
- 編集モードでの貼付時の UI フリーズ軽減
- 「なぜ待っているか」を伝える最小限の視覚的手がかり（skeleton / spinner 等、過剰にはしない）

### この issue に含まない

- 画像圧縮 / 再エンコード（データ側に手を入れるのは非対象）
- Asset base64 → Blob URL の storage 変更
- 他 archetype（TEXT 本文など）の lazy 化
- virtualization の本格導入（entry list ではなく、TEXTLOG 内の log 行粒度に限定）

## Expected pipeline

1. minimum scope — 遅延の**再現ケース**（何枚 / 何 KB で体感悪化か）測定、bottleneck 特定
2. behavior contract — lazy load の境界（何をいつロードするか）明文化
3. implementation — renderer / presenter の lazy 化 slice
4. audit — baseline 計測との比較、regression 確認
5. manual — 09 トラブルシューティング「複数画像 TEXTLOG が重い」の解消追記

## Dependencies

- `src/adapter/ui/textlog-presenter.ts`
- asset 参照経路（`container.assets` の base64 → data URL 生成ロジック）
- IntersectionObserver / loading="lazy" 等の browser API

## Notes

- 計測ベースで進めること。「体感で速くなった」だけで完了しない。
- 単一 HTML の制約（file://）で IntersectionObserver が使えることは確認済み想定。
- lazy load が原因で scroll 位置復元や印刷が壊れないかを audit 段階で検証。
