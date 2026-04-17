# FI-04 — 添付基盤: まとめて追加 / 重複排除 / 常設 DnD エリア

## Status

proposed

## Priority

**P2**（日常作業の手数削減）

## Problem

- **複数ファイルをまとめて添付できない**。1 ファイルずつの操作になっていてフローが重い。
- **重複添付の検知と排除が怪しい**。同じスクショ / HTML を添付したのに 2 件付く事象が実観測されている。
- **DnD エリアがセンターペインにしかなく、縦に長いエントリを表示していると使いにくい**。常時見えている別場所（例: サイドバー / トレイ / 画面端の dock）での DnD 受け入れが欲しい。

## User value / risk

- **Value**: 添付ワークフローが多ファイル運用に耐える。重複を気にせず放り込める。DnD 到達性が上がり手数が減る。
- **Risk**: 添付 dedupe の誤判定は逆方向のデータ損失につながり得る。hash 判定の厳密さを担保しないと危険。

## Scope boundary

### この issue に含む

- ファイル選択 / DnD で**複数ファイルを 1 アクションで取り込む**経路
- 添付時の**重複検知（content hash ベース）** と UI 提示（「すでに存在します、再利用しますか」選択式）
- DnD エリアを**常時可視な別位置**（具体位置は minimum scope 段階で決定）に追加、または既存エリアを画面端固定に

### この issue に含まない

- クリップボードからの複数画像貼付（編集機能系 FI-05 の領域）
- Asset storage 層の再設計（IDB key 構造の変更）
- 添付プレビュー / ギャラリ機能

## Expected pipeline

1. minimum scope — 複数選択の UI（ファイルダイアログ multiple / DnD files[] 両方）、dedupe の hash アルゴ（既存 FNV-1a-64 流用か）、常設 DnD 位置の候補 1 つに絞る
2. behavior contract — 重複時の振る舞い（skip / reuse / always-add）、新旧 asset の関係
3. implementation — pure helper（dedupe 判定）+ UI slice
4. audit — dedupe の偽陽性 / 偽陰性両方の regression
5. manual — 05 日常操作 / 09 トラブルシューティング同期

## Dependencies

- `src/adapter/platform/` の asset I/O
- `container.assets: Record<string, string>` の key 構造
- 既存 hash helper `src/core/operations/hash.ts`（S-22 で追加）

## Notes

- 「スクショや HTML を添付した際に同じものなのに 2 つついていた気がする」は再現手順が曖昧 → minimum scope で確実に再現させる。
- 常設 DnD の位置選定は UI 面への波及が大きい。既存 pane (sidebar / meta / tray) との共存を最初に決める。
- dedupe 挙動は**明示的に可視化**すること（無言 reuse はユーザーが混乱する）。
