# PKC2 開始レポート — 目次

本レポートは、PKC2 プロジェクト開始にあたり���
repository 内の requirements ドキュメント��`docs/requirements/00_最初の要件.md`）を起点に、
要件の読解・構造化・継承判断・初期計画化を行った結果をまとめたものである。

## 構成ファイル

| # | ファイル | 内容 |
|---|---------|------|
| 01 | `01_requirements読解結果.md` | requirements 17章の読解・分類結果 |
| 02 | `02_requirementsの再構造化.md` | 要求・設計方針・実装方式案の分離と再構造化 |
| 03 | `03_現行PKCとの対応付け.md` | 現行PKC v36の機能とrequirementsの突き合わせ |
| 04 | `04_継承判断ABCD.md` | PKC2での継承区分（A:中核/B:簡素化/C:外出し/D:凍結） |
| 05 | `05_設計原則.md` | PKC2の設計原則 |
| 06 | `06_初期開発スコープ.md` | Phase 0/1/2 の段階分解 |
| 07 | `07_ドキュメ��ト一覧.md` | PKC2開始時の必須ドキュメント計画 |
| 08 | `08_初期Issue案.md` | 開始準備Issue 12件 |
| 09 | `09_ディレクトリ構成.md` | 推奨ディレクトリ構成 |
| 10 | `10_着手順と残課題.md` | 最初の実装着手順・残課題・判断保留事項 |
| 11 | `11_基盤方針追補_Viteの効用と限界.md` | Viteの責務境界、3段階build pipeline、minify-safe規約 |
| 12 | `12_基盤方針追補_責務分離.md` | 5層アーキテクチャ（core/adapter/feature/runtime/builder） |
| 13 | `13_基盤方針追補_release契約.md` | HTML構造契約、固定ID、pkc-data/pkc-meta仕様、integrity |
| 14 | `14_基盤方針追補_clone_embed_message.md` | clone同型性、iframe sandbox主権、PKC-Message envelope |
| 15 | `15_基盤方針追補_type_dispatch_adapter.md` | discriminated union、Archetype dispatch、dependency governance |
| 16 | `16_基盤方針追補_versioning_UX_Issues.md` | semver+kind+timestamp、状態機械、操作契約、修正版Issue一覧 |
| 17 | `17_domain_action_contract.md` | domain/state/action/command/event/messageの境界確定 |
| 18 | `18_ui_shell.md` | 最小UI Shell: renderer/action-binder/event-log/DOM契約 |
| 19 | `19_container_mutation.md` | Container mutation: 不変更新・物理削除・事前snapshot |

## 前提文書

- requirements: `docs/requirements/00_最初の要件.md`（全17章）
- 現行PKC参考: `docs/requirements/00-01_参考_前世代PKC1.html`（v36.0.4, 24,222行）

## 基本方針

- requirements を読まずに勝手に決めない
- 「要求」「設計方針」「実装方式案」を分離する
- 現行PKCの多機能さに引きずられず核を絞る
- "全部入りをもう一回作る" 方針にしない
- 操作手順想定・利用フロー文書を重視する

## 追補方針（11〜16）

- bundled な巨大 PKC.HTML を正本として扱わない
- split source / docs / tests を正本とする
- Vite は開発補助に限定し、最終配布契約を支配させない
- 操作順序バグ抑止を最重要非機能要件として扱う
