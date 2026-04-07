# PKC2 設計文書ナビゲーション

本ディレクトリは PKC2 の**現行正本**を格納する。
新しいセッションでは、まずここの文書だけを読むこと。

## 運用ルール

1. **`docs/planning/` 直下は「現行正本」** — Claude はまずここだけ読む
2. **`docs/planning/resolved/` は「履歴・経緯」** — 原則読まない。矛盾や判断理由の調査時のみ参照
3. **Issue 完了時**: 直下の設計書に必要事項を反映 → Issue 個別文書は resolved へ移動

## 現行正本文書（読む順序付き）

新しい Claude セッションが最初に読むべき順序:

### 第1群: アーキテクチャ（最優先で読む）

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `05_設計原則.md` | 単一HTML自己完結、非破壊revision、データモデル一貫性、可搬性、段階的進化 | ★★★ |
| `12_基盤方針追補_責務分離.md` | 5層アーキテクチャ（core/adapter/feature/runtime/builder）と依存関係ルール | ★★★ |
| `13_基盤方針追補_release契約.md` | HTML構造契約、固定ID（pkc-root等）、pkc-data/pkc-meta仕様、integrity | ★★★ |

### 第2群: 実装方針（実装前に読む）

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `11_基盤方針追補_Viteの効用と限界.md` | Viteの責務境界、3段階build pipeline、minify-safe規約 | ★★ |
| `15_基盤方針追補_type_dispatch_adapter.md` | discriminated union、Archetype dispatch、dependency governance、ESLint規約 | ★★ |
| `16_基盤方針追補_versioning_UX_Issues.md` | semver+kind+timestamp、AppPhase状態機械、操作契約 | ★★ |

### 第3群: 将来計画（必要時に読む）

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `06_初期開発スコープ.md` | Phase 0/1/2 の段階分解、ロードマップ | ★ |
| `14_基盤方針追補_clone_embed_message.md` | clone同型性、iframe sandbox主権、PKC-Message envelope仕様 | ★ |

## resolved/ 配下（原則非参照）

### requirements 分析（Issue #0 相当）
| ファイル | 内容 |
|---------|------|
| `01_requirements読解結果.md` | requirements 17章の読解・分類結果 |
| `02_requirementsの再構造化.md` | 要求・設計方針・実装方式案の分離 |
| `03_現行PKCとの対応付け.md` | 現行PKC v36の機能突き合わせ |
| `04_継承判断ABCD.md` | 継承区分（A:中核/B:簡素化/C:外出し/D:凍結） |

### 初期計画（実装により超越済み）
| ファイル | 内容 |
|---------|------|
| `07_ドキュメント一覧.md` | 必須ドキュメント計画 |
| `08_初期Issue案.md` | 開始準備Issue 12件（実際のIssue進行で超越） |
| `09_ディレクトリ構成.md` | 初期構成案（12_責務分離で超越） |
| `10_着手順と残課題.md` | 着手順・判断保留事項 |

### Issue 実装記録（#1〜#10 完了、#11〜#28 はコード＋HANDOVER.mdに記録）
| ファイル | Issue | 内容 |
|---------|-------|------|
| `17_domain_action_contract.md` | #2-3 | domain/state/action/command/event/message境界 |
| `18_ui_shell.md` | #4 | 最小UI Shell |
| `19_container_mutation.md` | #5 | Container mutation |
| `20_idb_persistence.md` | #6 | IDB永続化 |
| `21_release_metadata.md` | #7 | Release Metadata |
| `22_html_export.md` | #8 | HTML Export |
| `23_import.md` | #9 | Import |
| `24_message_transport.md` | #10 | PKC-Message Transport |

Issue #11〜#29 は個別設計文書なし（基盤方針の延長として実装）。
到達点は `HANDOVER.md` に集約。feature 層パターンは `12_基盤方針追補_責務分離.md` に反映済み。

## 前提文書

- requirements: `docs/requirements/00_最初の要件.md`（全17章）
- 現行PKC参考: `docs/requirements/00-01_参考_前世代PKC1.html`（v36.0.4, 24,222行）

## 基本方針（不変）

- requirements を読まずに勝手に決めない
- 「要求」「設計方針」「実装方式案」を分離する
- 現行PKCの多機能さに引きずられず核を絞る
- "全部入りをもう一回作る" 方針にしない
- bundled な巨大 PKC.HTML を正本として扱わない
- split source / docs / tests を正本とする
- Vite は開発補助に限定し、最終配布契約を支配させない
- 操作順序バグ抑止を最重要非機能要件として扱う
