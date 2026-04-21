# PKC2 棚卸しレポート — Issue #41 完了時点

> **⚠️ history-only inventory（2026-04-21 時点）**
>
> 本文書は **Issue #41 完了時点（2026-04-07）の凍結 inventory** であり、**現在のアーキテクチャ / archetype coverage を示す正本ではない**。
> 本文書以降、folder / textlog archetype の追加、Tier 1/2/3、merge import、relations / references / provenance / orphan / P1–P5 が landing している。
>
> - **現行の棚卸し**: `HANDOVER_FINAL.md`（§1–§4 で設計現在地、§18–§22 で直近 wave）
> - **recent wave（2026-04-18〜21）の入口**: `00_index.md` §第5群 末尾 / `../development/INDEX.md` §COMPLETED / `USER_REQUEST_LEDGER.md §1.1`
>
> 本文書は「Phase 1〜4 完了時点で何があったか」の history 専用。以後は更新しない。

**作成日**: 2026-04-07
**対象**: Issue #1〜#41 完了後の全体再構築

---

## 1. 完了済み Issue の再整理

### Phase 1: 基盤構築（#1〜#10）

| # | 内容 | 影響層 | 強化した設計原則 |
|---|------|--------|----------------|
| 1 | Bootstrap（Vite + TS + ESLint + Vitest） | 全層 | Stage1/Stage2 build 分離 |
| 2-3 | Domain model / action contract | core | 6境界分離（UserAction/SystemCommand/DomainEvent） |
| 4 | 最小 UI Shell | adapter/ui | Renderer/ActionBinder/EventLog 責務分離 |
| 5 | Container mutation | core/operations | pure immutable ops、time injection |
| 6 | IDB Persistence | adapter/platform | passive listener パターン、debounce 300ms |
| 7 | Release Metadata | runtime/builder | SHA-256 integrity、builder 生成/runtime 読取 |
| 8 | HTML Export | adapter/platform | Container → 単一 HTML download |
| 9 | Import | adapter/platform | DOMParser + strict validation + full replace |
| 10 | PKC-Message Transport | adapter/transport | MessageEnvelope と内部 action の分離 |

**この Phase で確立したもの**: 5層構造、core 汚染禁止、AppPhase 状態機械、fixed ID contract、data-pkc-* DOM 契約

### Phase 2: 機能拡張（#11〜#25）

| # | 内容 | 影響層 | 強化した設計原則 |
|---|------|--------|----------------|
| 11 | Embed Detection | adapter/platform | standalone/embedded 分岐 |
| 12 | Message Handler Routing | adapter/transport | handler registry パターン |
| 13 | Record Offer/Accept | adapter/transport | pendingOffers + accept/dismiss |
| 14 | Embed Behavior Contract | adapter/transport | capability surface |
| 15 | Revision/History Foundation | core/operations | snapshot + non-destructive revision |
| 16 | Import Confirmation UX | adapter/state | SYS_IMPORT_PREVIEW → CONFIRM/CANCEL |
| 17 | Minimal Restore | core/operations | RESTORE_ENTRY + restoreDeletedEntry |
| 18 | Capability Ping Extension | adapter/transport | pong profile + negotiation |
| 19 | History UX Observation | adapter/ui | revision badge, timestamp |
| 20 | Search/Filter Foundation | features/search | feature 層パターン確立 |
| 21 | Search/Filter Enhancement | features/search | archetype filter + CLEAR_FILTERS |
| 22 | Entry Sort Foundation | features/search | sortEntries + filter→sort pipeline |
| 23 | Relation Observation UI | features/relation | relation list + navigation |
| 24 | Tags Minimal UI | features/relation | categorical relation → tag chips |
| 25 | Tag Filter | features/relation | sidebar 絞り込み + CLEAR_FILTERS 統合 |

**この Phase で確立したもの**: feature 層の独立性パターン、feature state の AppState 直置き、操作パイプライン順序（query→archetype→tag→sort）

### Phase 3: Archetype / Presenter 拡張（#26〜#33）

| # | 内容 | 影響層 | 強化した設計原則 |
|---|------|--------|----------------|
| 26 | Detail Presenter / Archetype Dispatch | adapter/ui | registerPresenter() パターン |
| 27 | Todo Presenter | adapter/ui | 初の非 text archetype 実証 |
| 28 | Archetype Editor Commit Boundary | adapter/ui | collectBody on presenter |
| 29 | Todo Usability Minimum | adapter/ui + core | QUICK_UPDATE_ENTRY 導入 |
| 30 | Quick Update Contract Clarification | core + docs | 契約明文化 + テスト補強 |
| 31 | Form Archetype Validation | adapter/ui | 固定3フィールド form presenter |
| 32 | Archetype UX Polishing | adapter/ui | ARCHETYPE_LABELS 統一 |
| 33 | Attachment Archetype Minimal Validation | adapter/ui | base64 file-like archetype（暫定） |

**この Phase で確立したもの**: presenter パターン、collectBody 委譲、QUICK_UPDATE_ENTRY 契約、archetype 拡張可能性の実証

### Phase 4: 保存・再水和・可搬（#35〜#41）

| # | 解決した課題 | 影響層 | 強化した設計原則 |
|---|------------|--------|----------------|
| 35 | body 肥大化問題 → body/assets 分離 | core活用 + adapter | assets は entry.body に入れない |
| 36 | IDB 一括保存問題 → assets store 分離 | adapter/platform | IDB Phase 1 完了、DB version 2 |
| 37 | export 単一モード → Light/Full 4モード | adapter/platform + ui | export_meta 契約、Light/Full 選択 |
| 38 | readonly 不在 → readonly + rehydrate | runtime + adapter | data-pkc-mode 属性、UI ポリシー |
| 39 | Full export 肥大化 → gzip+base64 圧縮 | adapter/platform | compression は export/import のみ |
| 40 | バイナリ可搬性 → ZIP PKC2 Package | adapter/platform（新規） | ZIP 完全再現契約、外部依存ゼロ |
| 41 | ユーザー事故防止 → Guardrail UX | adapter/ui | 非ブロッキング情報提示 |

**この Phase で確立したもの**:
- **body/assets 分離原則**: entry.body にはメタデータのみ、実データは container.assets
- **IDB 非圧縮原則**: IDB は常に非圧縮 base64（CPU コスト回避）
- **compression 境界原則**: gzip は export/import 時のみ適用、IDB・runtime では非圧縮
- **ZIP 完全再現契約**: import → export → import でデータ同一性保証（cid 除く）
- **export_meta 契約**: mode + mutability + asset_encoding で export 状態を完全記録
- **guardrail 非ブロッキング原則**: 警告は情報提示のみ、操作をブロックしない

---

## 2. 現在の到達点 — ユーザー視点の再定義

PKC2 は「知識を構造化し、どこにでも持ち運べるツール」です。

### できること

**日常作業（Workspace）**
- ブラウザで開いて即座に使える
- Note / Todo / Form / File の4種類のエントリを作成・編集・削除
- エントリ間の関連付け（relation）とタグ付け
- 検索・フィルタ・ソートで素早く目的のエントリにアクセス
- 変更履歴の自動記録と復元
- IDB に自動保存（300ms debounce）

**軽量配布（Portable HTML Light）**
- テキスト中心のコンテンツを数十 KB の HTML で配布
- メール添付、USB、GitHub Pages でそのまま閲覧・編集可能
- ファイル添付のメタデータは保持（実データは除外）

**完全アーカイブ（Portable HTML Full）**
- 添付ファイルを含む完全な自己完結 HTML
- gzip+base64 圧縮でサイズ最適化
- オフラインでも全データにアクセス可能

**閲覧専用配布（Readonly HTML）**
- Light / Full いずれも readonly モードで export 可能
- 再水和（Rehydrate）ボタンで Workspace に昇格可能
- プレゼンテーション・レポート配布に最適

**バックアップ・移行（ZIP PKC2 Package）**
- .pkc2.zip 形式で完全バックアップ
- 添付ファイルは raw binary で保存（ZIP 標準ツールで個別アクセス可能）
- マシン間移行、バージョン管理（Git）対応
- import で新しい Workspace として復元

**安全運用（Guardrail UX）**
- 添付ファイルサイズの警告（1MB soft / 5MB heavy）
- Light export 時の添付除外警告
- Full export サイズ見積もり表示
- 大容量時の ZIP 推奨

---

## 3. 不変条件の再確認

### 基盤不変条件（#1〜#10 で確立）

1. **5層構造**: core → adapter → feature → runtime → builder（依存方向は上位→下位のみ）
2. **core 汚染禁止**: core/ に browser API・外部 npm を入れない
3. **AppPhase 状態機械**: initializing → ready → editing → exporting → error
4. **fixed ID contract**: pkc-root, pkc-data, pkc-meta, pkc-core, pkc-styles, pkc-theme
5. **data-pkc-* DOM 契約**: minify-safe（class name は styling only）
6. **Renderer / ActionBinder / EventLog 分離**: UI = 状態の投影、状態の所有者ではない
7. **container-ops は pure core operation**: time injection パターン（Date.now() を呼ばない）
8. **persistence は passive listener**: DomainEvent を監視、debounce 300ms
9. **MessageEnvelope と内部 action の分離**: 外部プロトコルと内部 action は別系統
10. **Dispatchable = UserAction | SystemCommand**: DomainEvent は出力のみ
11. **Stage1 (Vite bundle) / Stage2 (release-builder) の build 分離**
12. **dist artifact は派生物**: 正本は src/ + docs/ + tests/

### #35〜#41 で新たに強化された不変条件

13. **assets は entry.body に入れない**: body にはメタデータ（name, mime, size, asset_key）のみ
14. **IDB は非圧縮 base64 を保持**: CPU コスト回避。ストレージに余裕あり
15. **compression は export/import のみ**: IDB・runtime では非圧縮で扱う
16. **ZIP は完全再現契約**: manifest + container + assets で lossless round-trip
17. **import は新 cid 発行**: HTML rehydrate・ZIP import とも衝突回避のため新 cid
18. **export_meta は export artifact のメタデータ**: mode + mutability + asset_encoding
19. **pkc-data shape**: `{ container: Container, export_meta?: ExportMeta }`
20. **Light export は assets 空**: 「欠落」ではなく「同梱対象外」
21. **guardrail は非ブロッキング**: 情報提示のみ、操作をブロックしない

---

## 4. future に送ったもの

### 明確に future に送ったもの

| 項目 | 今やらない理由 |
|------|-------------|
| **ZIP Document Set** | best-effort 再構成の設計が未確定。entry→ファイル形式の変換契約が未定義。PKC2 Package で完全再現は達成済み |
| **汎用 ZIP import（best-effort 再構成）** | Document Set の逆方向。任意ファイル→entry の変換ルールが未定義。scope が大きい |
| **Template Package** | 概念定義のみ。archetype schema の動的定義が前提だが、現在 archetype は固定。基盤が不十分 |
| **primitive entry と可換なファイル形式** | text→md、todo→json 等の変換契約が未定義。Document Set の前提要件 |
| **Subset Export** | entry/folder/selection 単位の export。relation の外部参照扱いが未設計 |
| **merge import** | 現在は full replace のみ。conflict resolution の設計が未確定 |
| **embed 本実装** | sandbox / iframe 制御の詳細設計が未着手 |
| **IDB Phase 2（完全分割）** | entry 単位の読み書き。Phase 1 で ~500 entries は十分。実測データなし |
| **feature state namespace** | 2〜3 feature 追加後に検討予定。現状の直置きで問題なし |
| **renderer ファイル分割** | 現在の renderer.ts は機能的に一貫。分割の必然性がない |
| **attachment 高度化** | 複数ファイル、drag & drop、preview、ストリーミング — 個別に大きなテーマ |
| **form 本格化** | 動的 schema, validation engine — archetype 拡張の別系統 |

---

## 5. 次に着手すべき Issue の再評価

### 候補比較

| 候補 | 価値 | リスク | 前提条件 | 評価 |
|------|------|--------|----------|------|
| **A. Export/Import UX 統合** | ボタン配置の整理、モード選択 UI、進捗表示 | 低 | なし | ★★★★ |
| **B. 操作順序ドキュメント強化** | 設計一貫性の維持 | 極低 | なし | ★★★ |
| **C. IDB Phase 2 検討** | 大容量対応 | 高（container-ops 全面改修） | 実測データが必要 | ★ |
| **D. archetype 拡張の次段** | textlog 等の新 archetype | 中（presenter 追加のみ） | 新 archetype の設計 | ★★ |
| **E. performance 可視化** | ボトルネック発見 | 低 | なし | ★★ |
| **F. Export/Import round-trip テスト強化** | 品質保証 | 極低 | なし | ★★★★ |
| **G. renderer の UX 改善（レイアウト・CSS）** | 実用性向上 | 低 | なし | ★★★ |

### 選定: A. Export/Import UX 統合

**理由**:
1. **安全**: adapter/ui 層のみの変更。core・feature に影響しない
2. **価値が高い**: 現在 6 個のボタンが並列で分かりにくい。モード選択を統合することで UX が大幅改善
3. **設計を壊さない**: 既存の action/reducer 構造をそのまま使える
4. **#41 の自然な延長**: Guardrail UX と組み合わせると export 体験が完成する
5. **完成度に直結**: 「使えるツール」としての最後の仕上げ

**具体的な内容案**:
- Export ボタンを1つに統合 → モード選択 UI（modal or dropdown）
- Light/Full/ZIP の選択を1画面で
- Guardrail 警告をモード選択 UI に統合
- Import ボタンの位置・ラベル整理

---

## 6. やってはいけない寄り道

| やってはいけないこと | 理由 |
|-------------------|------|
| **Document Set に手を出さない** | entry→ファイル変換契約が未定義。PKC2 Package で完全再現は達成済み。今やると中途半端な変換ルールが固定される |
| **Template を先にやらない** | archetype schema の動的定義が前提。現在の固定 archetype 体制では Template の「何を再利用するか」が定まらない |
| **ZIP を拡張しすぎない** | stored mode で十分機能している。deflate 追加は外部依存 or 複雑な実装が必要。サイズ効率の改善は ROI が低い |
| **renderer を分割しない** | 現在の renderer.ts は単一責務（state→DOM）。分割すると import graph が複雑化し、設計上のメリットがない |
| **設定機構を増やさない** | guardrail のしきい値等をユーザー設定可能にする誘惑があるが、設定 UI・永続化・デフォルト管理の scope が大きい |
| **form を本格化しない** | 動的 schema は archetype 拡張の別系統。現在の固定3フィールドは「presenter 基盤の検証」という目的を達成済み |
| **feature state namespace を導入しない** | 現在の feature 数（search + relation）では namespace の恩恵がない。3つ目の独立 feature 追加時に検討 |
| **IDB Phase 2 に進まない** | ~500 entries で十分な Phase 1。実測でボトルネックが出るまで着手する根拠がない |
| **embed を本実装しない** | sandbox / iframe の詳細設計が未着手。transport 層の拡張が前提で scope が大きい |
| **i18n を入れない** | 国際化は全 UI テキストの外部化が必要。現在は日英混在で十分機能している |

---

## 7. テスト・ビルド状況

- **テスト**: 693 tests / 36 test files — 全通過
- **typecheck**: clean（エラーなし）
- **build**: Vite build 成功（bundle.js 69.25 KB gzip 17.95 KB）
- **テストカバレッジ分布**:
  - core: 5 files（model, action-types, container-ops, dispatcher, app-state, contract）
  - adapter: 18 files（ui, platform, transport 全域）
  - features: 4 files（search/filter, search/sort, relation/selector, relation/tag-*）
  - runtime: 3 files（release-meta, meta-reader, builder-output）
