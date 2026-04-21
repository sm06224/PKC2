# PKC2 Pre-Release Snapshot — v0.1.0

> **⚠️ historical pre-release snapshot（2026-04-21 時点）**
>
> 本文書は **Issue #43 完了時点（v0.1.0 プレリリース直前）の凍結スナップショット**であり、**現在の機能状態を示す正本ではない**。
> 本文書以降、folder / textlog archetype の追加、merge import、relations / references / provenance / orphan / P1–P4 が landing し、
> 「機能凍結」の前提は**解除されている**（次の大きなフェーズに入っている）。
>
> - **現状の handover（canonical）**: `HANDOVER_FINAL.md`（§18–§22 に直近 wave）
> - **recent wave（2026-04-18〜21）の入口**: `00_index.md` §第5群 末尾 / `../development/INDEX.md` §COMPLETED / `USER_REQUEST_LEDGER.md §1.1`
> - **v0.1.0 の changelog**: `CHANGELOG_v0.1.0.md`
>
> 本文書は「v0.1.0 プレリリース時点で何を約束していたか」を示す history として保全するのみ。

本文書は PKC2 の現時点（Issue #43 完了）をプレリリース可能な安定スナップショットとして
固定・明文化するものです。

**ステータス**: Pre-Release（機能凍結、安定化優先）

---

## 1. PKC2 とは何か

PKC2 は**単一 HTML で自己完結する知識コンテナツール**です。

ブラウザで開くだけで動作し、ネットワーク接続を必要としません。
テキスト、Todo、フォーム、ファイル添付の4種類のエントリで知識を構造化し、
リレーションとタグで相互に接続できます。

作業データはブラウザの IndexedDB に自動保存され、
HTML ファイルまたは ZIP パッケージとしてどこにでも持ち運べます。

### できること

- **構造化された知識管理**: Note / Todo / Form / File の4つの archetype
- **自動保存**: IndexedDB への 300ms debounce 保存。明示保存不要
- **検索・フィルタ・ソート**: テキスト検索、archetype フィルタ、タグフィルタ、作成日/更新日/タイトルソート
- **リレーションとタグ**: エントリ間の関連付け（structural / categorical / semantic / temporal）
- **変更履歴**: 自動スナップショット。過去バージョンの閲覧と復元
- **HTML Export（4モード）**:
  - Light: テキスト中心、軽量（添付実体なし）
  - Full: 全データ自己完結（gzip+base64 圧縮）
  - Editable / Readonly の2軸と組み合わせて4モード
- **ZIP PKC2 Package**: 完全再現型バックアップ。添付ファイルは生バイナリ
- **Rehydrate**: Readonly HTML を Workspace に昇格
- **Import**: HTML / ZIP からの復元（確認 UI 付き）
- **Guardrail UX**: ファイルサイズ警告、export 時の情報提示
- **PostMessage 通信**: iframe 埋め込み対応の envelope プロトコル

---

## 2. 意図的に未実装のもの（future）

以下は「やっていない」のではなく「意図的にやっていない」ものです。

| 項目 | 理由 |
|------|------|
| **ZIP Document Set** | entry→ファイル変換契約（text→md、todo→json 等）が未定義。完全再現は PKC2 Package で達成済み。変換ルールを拙速に決めると後の拡張を阻害する |
| **汎用 ZIP Import** | 任意ファイル→entry の変換ルールが未定義。Document Set の逆方向であり、同様に契約未確定 |
| **Template Package** | archetype schema の動的定義が前提。現在の固定 archetype 体制では「何を再利用するか」が定まらない。概念定義は 17 番文書に記載済み |
| **Subset Export** | entry/folder/selection 単位の export。relation の外部参照（export 対象外エントリへの参照）の扱いが未設計 |
| **Merge Import** | conflict resolution の設計が未確定。現在の full replace は安全で予測可能 |
| **IDB Phase 2** | entry 単位の読み書き。Phase 1（assets 分離）で ~500 entries は十分。実測でボトルネックが出るまで着手根拠なし |
| **Embed 本実装** | sandbox / iframe 制御の詳細設計が未着手。transport 層の基盤（envelope + ping/pong）は完成済み |
| **Feature State Namespace** | 現在2つの独立 feature（search, relation）で問題なし。3つ目の追加時に検討 |
| **Renderer 分割** | 現在の renderer.ts は単一責務（state→DOM）。分割の必然性なし |
| **Attachment 高度化** | 複数ファイル、drag & drop、preview、ストリーミング、外部ストレージ — 個別に大きなテーマ |
| **Form 本格化** | 動的 schema、validation engine、conditional display — archetype 拡張の別系統 |
| **i18n** | 全 UI テキストの外部化が必要。現状の英語 UI で機能上問題なし |
| **PKC1 互換 Import** | 前世代 PKC（v36, 24,222行 HTML）からの移行。データモデルの差異が大きく、優先度低 |

---

## 3. 制約と注意事項

### ストレージ

- **IndexedDB 依存**: ブラウザのストレージ quota に制約される
- **同一 origin**: 異なる origin（ドメイン/ポート）間でデータは共有されない
- **ブラウザ変更時**: データは引き継がれない。Export → Import で移行する

### Attachment

- **1 MB 以上**: Soft warning（export サイズ増加を通知）
- **5 MB 以上**: Heavy warning（外部ストレージの検討を推奨）
- **これらは制限ではなく警告**: 操作はブロックされない
- **単一ファイル/エントリ**: 複数ファイル添付は未対応
- **ストリーミング非対応**: ファイル全体を base64 でメモリに保持

### HTML Export

- **Light**: 添付ファイル実体は「同梱対象外」として除外される。メタデータ（名前、MIME、サイズ）は保持
- **Full**: gzip+base64 圧縮で全データ埋め込み。添付が多いとファイルサイズが数十 MB になりうる
- **推奨上限**: HTML 全体で 10 MB 以下。これを超える場合は ZIP を推奨
- **CompressionStream 非対応ブラウザ**: 非圧縮 base64 にフォールバック（export は失敗しない）

### Readonly

- **セキュリティ機能ではない**: HTML ソースを編集すれば bypass 可能
- **UI ポリシーである**: 編集ボタン非表示、Rehydrate ボタン表示
- **Rehydrate**: 新しい Container ID を発行して Workspace 化

### Import

- **全置換**: 現在の Workspace データを完全に置き換える。マージ機能なし
- **新 CID 発行**: Import / Rehydrate とも新しい Container ID が発行される
- **確認 UI**: プレビュー画面で CONFIRM / CANCEL を選択

### ZIP PKC2 Package

- **PKC2 でのみ Import 可能**: ブラウザで直接開けない
- **Stored mode**: ZIP 内の deflate 圧縮は未実装（raw binary のまま格納）
- **完全再現契約**: Import → Export → Import でデータ同一性保証（CID 除く）

---

## 4. 想定ユースケース

### 1. 軽量共有（HTML Light）

テキスト中心のノートやTodoリストを同僚に共有する。
数十 KB の HTML ファイルをメール添付や共有ドライブで送る。
受け取った人はブラウザで開いてそのまま編集できる。

### 2. 完全アーカイブ（HTML Full）

添付ファイルを含む完全なプロジェクトドキュメントをオフライン保存する。
ネットワーク接続なしで全データにアクセスできる自己完結 HTML。

### 3. 配布（Readonly HTML）

レポートやプレゼンテーション資料を配布する。
受け取った人は閲覧のみ。必要なら Rehydrate で手元に取り込める。

### 4. バックアップ（ZIP Package）

定期的に ZIP でバックアップを取る。
添付ファイルは生バイナリで保存されるため、サイズ効率が最もよい。
ZIP 標準ツールで個別ファイルにアクセスできる。

### 5. PC 移行（ZIP + Import）

元の PC で ZIP Export → 新しい PC で PKC2 を開いて Import。
新しい Workspace として完全復元される。

### 6. iframe 埋め込み

PKC2 HTML を iframe で他のアプリに埋め込む。
PostMessage プロトコル（PKC-Message envelope）で通信可能。
record:offer / capability:ping 等の基盤メッセージ対応済み。

---

## 5. 推奨運用パターン

| 場面 | 推奨 |
|------|------|
| 日常作業 | Workspace（ブラウザで開いてそのまま使う） |
| 定期バックアップ | ZIP Package Export（週1回程度） |
| 軽量共有 | HTML Light Editable |
| 添付付き共有 | HTML Full Editable（小さい場合）/ ZIP（大きい場合） |
| 配布 | HTML Readonly（Light or Full） |
| PC 移行 | ZIP Export → Import |
| オフライン保存 | HTML Full Editable |

### バックアップの推奨

1. **最低限**: 重要な変更のたびに ZIP Export
2. **推奨**: 週1回の定期 ZIP Export + バックアップストレージへの保存
3. **安全策**: バックアップ前に Import で復元テストを行う

---

## 6. バージョニングの考え方

### 現在のステータス

**Pre-Release v0.1.0**

- 主要機能は安定している
- 仕様は固定し始めているが、変更の余地はある
- 外部公開可能な品質に達している

### 後方互換の方針

| 対象 | 方針 |
|------|------|
| **Container データ構造** | 可能な限り互換維持。schema_version で管理 |
| **pkc-data 形式** | export_meta の拡張は許容。既存フィールドの削除は避ける |
| **IDB 構造** | onupgradeneeded で migration。downgrade は非対応 |
| **ZIP Package** | manifest.version で互換管理。format: 'pkc2-package' は固定 |
| **HTML 構造契約** | fixed ID（pkc-root, pkc-data 等）は変更しない |
| **PostMessage Protocol** | envelope 形式（type + payload + source）は固定 |

### 互換を壊す可能性があるもの（将来）

- IDB Phase 2（entry 単位分割）への移行
- archetype schema の動的定義
- subset export の relation 外部参照

これらは明確なバージョン境界を設けて実施する。

---

## 7. 技術仕様サマリ

| 項目 | 値 |
|------|-----|
| **言語** | TypeScript（strict mode） |
| **ビルド** | Vite（Stage 1）+ release-builder（Stage 2） |
| **テストフレームワーク** | Vitest + happy-dom |
| **外部 npm 依存** | 実質ゼロ（ランタイムに外部ライブラリなし） |
| **テスト数** | 702（693 passed + 9 skipped） |
| **bundle サイズ** | JS 70.74 KB (gzip 18.39 KB) + CSS 4.73 KB (gzip 1.29 KB) |
| **ソースファイル数** | 46 (.ts) |
| **テストファイル数** | 36 |
| **設計文書数** | 19（00〜19、直下正本） |
| **アーキテクチャ** | 5層（core → adapter → feature → runtime → builder） |
| **状態管理** | AppPhase 状態機械 + Dispatcher + immutable reduce |
| **永続化** | IndexedDB（version 2、containers + assets store） |
| **ブラウザ API** | IDB, Blob, CompressionStream, DOMParser, postMessage |

---

## 8. ファイル構成

```
PKC2/
├── src/                    # ソースコード（正本）
│   ├── core/               # Layer 1: モデル・操作（browser API 禁止）
│   ├── adapter/            # Layer 2: ブラウザ抽象化・UI
│   ├── features/           # Layer 3: 検索・リレーション
│   ├── runtime/            # Layer 4: 契約・メタ情報
│   ├── styles/             # CSS
│   └── main.ts             # ブートシーケンス
├── build/                  # Stage 2 builder
├── tests/                  # テスト（702 tests）
├── docs/
│   ├── planning/           # 設計文書（現行正本）
│   └── requirements/       # 要件定義
├── dist/                   # ビルド成果物（派生物）
└── README.md               # プロジェクト概要
```

---

## 本文書の位置づけ

| 文書 | 役割 |
|------|------|
| `17_保存再水和可搬モデル.md` | 設計文書 — 4系統モデルの技術仕様 |
| `18_運用ガイド_export_import_rehydrate.md` | 利用ガイド — 操作手順と判断基準 |
| **本文書（19_pre_release.md）** | プレリリース文書 — 到達点・制約・future の明文化 |
| `HANDOVER.md` | セッション引き継ぎ — Claude 向け |
| `INVENTORY_041.md` | 棚卸しレポート — Issue #41 時点の全体像 |
| `README.md` | 外部向け概要 — GitHub 公開用 |
