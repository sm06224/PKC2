# FI-13 — センターペイン タブとしての拡張ツールランチャ

## Status

proposed

## Priority

**P3**（拡張ランチャ等の後段機能）

## Problem

- PKC の単一 HTML を**拡張ツールとして併用**することが増えてきた（PKC2-Extensions ディレクトリにある補助 HTML 等）。
- 今はそれらを別ウィンドウ / 別タブで開いており、**主ワークスペースから直に起動できる場所**がない。
- センターペインのタブに「ランチャ」タブを足し、ユーザーが自分のツール一覧をそこに並べたい。

## User value / risk

- **Value**: 補助ツール群への到達性が大幅向上。構成をユーザー自身が管理できる。
- **Risk**: 拡張ツール起動は外部 HTML への遷移 / iframe / window.open の使い分けが必要。sandbox / 主権境界を壊すと他機能へ波及する。

## Scope boundary

### この issue に含む

- センターペインのタブ集合に**ランチャタブ**を追加する導線
- **ユーザーがランチャ内容をカスタマイズ**できる保存モデル（最小形: URL + ラベルのリスト）
- 起動方式（新規タブ / iframe）の minimum scope 段階での決定

### この issue に含まない

- 拡張ツール側の刷新 / PKC2-Extensions の統合設計
- 拡張ツールとの深い data 連携（Container 共有等）
- 認証 / 権限 / MCP 的な拡張 API

## Expected pipeline

1. minimum scope — タブ追加位置 / ランチャ項目の保存場所 / 起動方式を 1 つに絞る
2. behavior contract — 埋め込み時の sandbox / transport / 主権境界明文化
3. implementation — UI slice（タブ追加 + 項目 CRUD）
4. audit — 埋め込み / clone / message transport の既存不変条件に副作用ないこと
5. manual — 運用ガイド 08 / 09 同期

## Dependencies

- 14_基盤方針追補_clone_embed_message.md の iframe sandbox 主権
- 既存 transport / PKC-Message envelope
- センターペインのタブ構造

## Notes

- **他 issue の後** に着手する前提で P3。データ損失や日常手数削減の方が先。
- 埋め込み方式（iframe / window.open）は主権モデルに直結するので、minimum scope 段階で supervisor 確認必須。
- 既存拡張 HTML の具体 URL を最初の 1 項目としてデフォ配置しておくと helpful。
