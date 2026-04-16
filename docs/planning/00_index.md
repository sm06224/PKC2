# PKC2 設計文書ナビゲーション

本ディレクトリは PKC2 の**現行正本**を格納する。
新しいセッションでは、まずここの文書だけを読むこと。

## 運用ルール

1. **`docs/planning/` 直下は「現行正本」** — Claude はまずここだけ読む
2. **`docs/planning/resolved/` は「履歴・経緯」** — 原則読まない。矛盾や判断理由の調査時のみ参照
3. **Issue 完了時**: 直下の設計書に必要事項を反映 → Issue 個別文書は resolved へ移動

## 現行正本文書（読む順序付き）

新しい Claude セッションが最初に読むべき順序:

### 第0群: リリース前 HANDOVER（**最優先 — 必ず読む**）

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `HANDOVER_FINAL.md` | v0.1.0 リリース前の最終 HANDOVER + §18 Tier 2 完了追記（2026-04-14）。全体サマリ・不変条件・意図的 non-done・既知制約・次段計画 | ★★★★ |
| `USER_REQUEST_LEDGER.md` | ユーザー明示要望の棚卸し台帳（2026-04-14 起点、living）。完了 / 部分完了 / 未完 の 3 値で管理、未完ゼロなら user value 最大の polish を 1 件選ぶ運用 | ★★★★ |
| `TIER3_PRIORITIZATION.md` | Tier 3 優先順位決定（2026-04-14）。Tier 3-1 = merge import 実装 / Tier 3-2 = release automation + CI 軽量強化 / 保留 = archetype 拡張・広範 E2E・lint baseline・長期ビジョン系 | ★★★ |
| `TIER3_3_REEVALUATION.md` | Tier 3-3 再評価（2026-04-14）。Tier 3-1 / 3-2 完了後の保留 4 群を 7 軸で再評価し、**C-4（lint baseline 解消）を採用**。B / C-3 / E は昇格条件付きで据え置き | ★★★ |
| `CHANGELOG_v0.1.0.md` | v0.1.0 の差分 changelog（Added / Changed / Fixed / Internal） | ★★★ |
| `../spec/data-model.md` | データモデル正本（Container / Entry / Revision + bulk_id / HTML・ZIP export 契約） | ★★★★ |
| `../spec/body-formats.md` | archetype 別 body 契約 + embed / transclusion 仕様 | ★★★ |
| `../spec/merge-import-conflict-resolution.md` | merge import 衝突解決の設計正本（Tier 2-3 で凍結、実装は Tier 3） | ★★★ |
| `../spec/schema-migration-policy.md` | schema_version 昇格時の判断基準・hook 位置・lazy/eager 適用・test 戦略・v2 実装順序（2026-04-15 / H-3 / 自主運転モード第3号、docs-only） | ★★★ |
| `../spec/text-textlog-provenance.md` | TEXT ↔ TEXTLOG 変換の非可逆境界 canonical spec・`provenance` RelationKind・`Relation.metadata?` 設計・実装スライス A–D（2026-04-16 / H-8 / 自主運転モード第5号、docs-only） | ★★★ |
| `../spec/textlog-text-conversion-policy.md` | TEXTLOG → TEXT 単方向変換の補助 spec（H-8 を補完）。変換単位 / 非可逆境界 / provenance 適用 / migration 境界 / v1 canonical rendering 決定 / examples（2026-04-16 / H-7 相当 / 自主運転モード第6号、docs-only） | ★★ |

これら 6 つが PKC2 の「今の正本」。これ以下の章は**詳細・履歴**として読む。

### 第1群: アーキテクチャ（設計の芯）

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
| `17_保存再水和可搬モデル.md` | 4系統モデル、HTML mode行列、body-assets分離、IDB進化、export形式、圧縮方針 | ★★ |
| `18_運用ガイド_export_import_rehydrate.md` | Export/Import/Rehydrate の利用手順・判断基準・操作シナリオ（利用ガイド）※ユーザーマニュアル `docs/manual/08_...` にもビルド時に自動取り込みされる | ★★ |
| `19_pre_release.md` | プレリリース文書 — 到達点・制約・future・バージョニング・技術仕様サマリ | ★★ |
| `20_UI_usability_audit.md` | UI実用性監査 — エントリ編集・フォルダ・CSS/レイアウト・blocker一覧・次Issue推薦 | ★★ |

### 第3群: 将来計画（必要時に読む）

| ファイル | 内容 | 重要度 |
|---------|------|--------|
| `06_初期開発スコープ.md` | Phase 0/1/2 の段階分解、ロードマップ | ★ |
| `14_基盤方針追補_clone_embed_message.md` | clone同型性、iframe sandbox主権、PKC-Message envelope仕様 | ★ |

### 第4群: 履歴 HANDOVER（参照のみ、超越済み）

| ファイル | 時点 | 備考 |
|---------|-----|-----|
| `HANDOVER_SLICE6.md` | Slice 6 完了時点 | P0/P1 群が未完了の状態のスナップショット。`HANDOVER_FINAL.md` で超越済み |
| `HANDOVER.md` | Issue #54 時点 | さらに前、プレリリース前段の棚卸し |
| `INVENTORY_041.md` | Issue #41 時点 | Phase 1〜4 完了時点の詳細棚卸し |

### 第5群: 開発記録（adapter 実装の細目）

| 位置 | 内容 |
|-----|-----|
| `../development/INDEX.md` | Issue 別実装 note のインデックス（CLOSED / COMPLETED / CANDIDATE）。Tier 1-1 / 1-2 / 2-1 / 2-2 は COMPLETED に反映済み |
| `../development/orphan-asset-auto-gc.md` | Tier 2-1 — import 経路に限定した orphan asset auto-GC（2026-04-14） |
| `../development/bulk-restore-ui.md` | Tier 2-2 — BULK_* revision の 1-click restore UI（2026-04-14） |
| `../development/ui-singleton-state-audit.md` | 残 singleton 棚卸し（2026-04-13） |
| `../development/stale-listener-prevention.md` | テスト dispatcher leak 回避 pattern |
| `../development/textlog-text-conversion.md` | TEXTLOG ↔ TEXT 変換仕様 |
| `../development/embedded-preview-and-cycle-guard.md` | embed / cycle guard 設計 |
| `../development/zip-export-contract.md` | ZIP stored mode 採用理由 |

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

Issue #11〜#42 は個別設計文書なし（基盤方針の延長として実装）。
到達点は `HANDOVER.md` に集約。feature 層パターンは `12_基盤方針追補_責務分離.md` に反映済み。
Issue #43 の運用ガイドは `18_運用ガイド_export_import_rehydrate.md` として直下に配置。
ユーザー向けマニュアル（`docs/manual/`）および PKC2 形式 HTML マニュアル（`PKC2-Extensions/pkc2-manual.html`）は、この 18 番文書の内容をビルド時に取り込んで利用する（二重管理回避のため）。

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
