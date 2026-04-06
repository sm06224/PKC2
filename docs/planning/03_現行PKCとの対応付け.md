# 03. 現行PKCとの対応付け

現行 PKC v36.0.4（約24,000行の単一HTML）の主要機能・構造を、
requirements と突き合わせた結果を示す。

---

## 3.1 現行PKCの主要機能一覧

現行PKC1のソースコードから特定した主要モジュール:

| 領域 | 機能 | 実装規模感 |
|------|------|-----------|
| **データモデル** | Entry(header+payload+sig)、Container(meta+entries) | 中核 |
| **エントリ種別** | text, attachment, snapshot, relation, system_log, form, todo, eml_thread | 多数 |
| **リビジョン** | LID/RID方式、非破壊改訂、getLatestByLid | 中核 |
| **フォルダ** | FOLDERS IIFE、groups in meta、入れ子構造 | 大 |
| **タグ** | payload.tags配列、タグフィルタ | 中 |
| **リレーション** | relation entry type、source_lid/target_lid/rel_type | 中 |
| **検索・フィルタ** | query/type/driftedOnly/hasRevisions/tag | 中 |
| **UI: 3ペイン** | entry-list / detail-scroll / meta-content | 大 |
| **UI: ビューモード** | detail / timeline / graph / eml-thread | 大 |
| **UI: フォーム描画** | renderFormDetail、YAML定義、条件付き表示、バリデーション | 非常に大 |
| **UI: TODO** | todo-detail、2カラムプレビュー、identity badge | 大 |
| **UI: Markdown** | marked.js連携、PKCトークン、フォールバックレンダラ | 大 |
| **UI: 差分表示** | diff2html、lineDiff、2ペイン差分 | 中 |
| **UI: Force Graph** | D3ベースのノードグラフ表示 | 中 |
| **永続化** | IndexedDB(IDB)、ローカルファイル同期(File System Access API) | 大 |
| **Export** | rehydratable HTML、observer HTML、PKC JSON、ZIP | 非常に大 |
| **Import** | テキスト、HTML、ファイル、URL、EML、バッチ | 大 |
| **Audit** | ハッシュ整合性検証、Self-Check | 中 |
| **設定** | localStorage設定、UIモード(daily/advanced/maintenance) | 中 |
| **ワークスペース** | 保存/復元、ピン、最近使用 | 中 |
| **テンプレート** | ZIP出力、FORM YAML定義 | 中 |
| **L10N** | 多言語対応(日/英)、_PKC_L10N_API | 中 |
| **チュートリアル** | 3種のガイドツアー | 小 |
| **コンテキストメニュー** | LID/RID/ハッシュコピー、スニペット生成 | 小 |

---

## 3.2 対応付け結果

### A. すでに現行PKCが持っているもの（requirements対応あり）

| requirements要件 | 現行PKCの対応実装 | 対応度 |
|-----------------|------------------|--------|
| 統一レコード構造(Ch.4) | Entry(header+payload) | **部分的** — typeで分岐、完全統一ではない |
| Archetype概念(Ch.5) | header.type で種別判定 | **未到達** — 後付け拡張性なし |
| Relation(Ch.7) | relation entry type | **部分的** — 専用entry型であり正規化不足 |
| Revision(Ch.9) | LID/RID非破壊改訂 | **ほぼ対応** — 基本思想は同じ |
| 時間モデル(Ch.9) | timestamp(ISO)全エントリ | **ほぼ対応** — unix時刻ではないがISO |
| Asset管理(Ch.4.6) | S.assets + base64 | **対応** — ただし効率面に課題 |
| 単一HTML自己完結(Ch.3.5) | 完全対応 | **完全対応** |
| フォルダ構造(Ch.8) | FOLDERS in meta.groups | **部分的** — リレーション化されていない |
| タグ(Ch.8.5) | payload.tags配列 | **部分的** — リレーション化されていない |
| スナップショット(Ch.10.7) | snapshot entry type | **対応** |
| 複数ビュー(Ch.13) | detail/timeline/graph | **部分的** — 併用は限定的 |

### B. 現行PKCにあるが再設計が必要なもの

| 機能 | 現状の問題 | 再設計方針 |
|------|-----------|-----------|
| **エントリ型分岐** | text/attach/snapshot/relation/form/todo/eml_threadが個別実装 | 統一Record + Archetype分離 |
| **フォルダシステム** | meta.groupsに独自ツリー構造。Relationと別系統 | structural Relationに統合 |
| **タグ** | payload.tags配列。Relationと別系統 | categorical Relationに統合 |
| **リレーション** | relation entry type。from/toのみ、kind体系不在 | 正規化Relation(structural/categorical/semantic/temporal) |
| **FORM実装** | YAML定義、条件付き表示、バリデーション等が巨大化 | Archetype + 最小bodyパーサに簡素化 |
| **状態管理** | グローバル変数S + 直接DOM操作 | UIと状態の分離 |
| **Export/Build** | rehydratable HTMLビルドが複雑 | ビルドパイプライン分離 |

### C. requirementsにあるが現行には未整備なもの

| requirements要件 | 状態 |
|-----------------|------|
| Archetype概念（後付け拡張可能な類型） | **未実装** |
| 統一Relationモデル（4種別の正規化） | **未実装** |
| 成果物予約型TODO（未来時点のデータとしてのTODO） | **部分的** — TODOは存在するが成果物予約の概念なし |
| 逆算型進捗管理 | **未実装** |
| ヒストリカルビュー（構造変遷の追跡） | **部分的** — レコード履歴のみ、構造変遷なし |
| 活動量ダッシュボード | **未実装** |
| 3種クローン（完全/構造/成果物予約） | **未実装** |
| Data/Logic/View層分離 | **未達成** — 全体がモノリシック |

### D. 現行にあるがrequirements的には核ではないもの

| 機能 | 理由 |
|------|------|
| EMLスレッド表示 | 特殊用途。requirements言及なし |
| FORM YAML定義の高度バリデーション | 実装詳細。requirementsはformを類型の一つとしか定義していない |
| FORM visible_when条件付き表示 | 実装詳細。巨大化の原因 |
| 3モード(daily/advanced/maintenance) | UI実装。requirementsはビュー分離を求めているがモード切替ではない |
| チュートリアル | UI補助。初期には不要 |
| コンテキストメニュー | UI便利機能 |
| ワークスペース（保存/復元/ピン） | UI便利機能 |
| Storage Health | 運用補助 |
| Private Mode | 特殊運用 |

### E. 現行で負債化しておりPKC2では切り離したいもの

| 負債 | 理由 | PKC2での対応 |
|------|------|-------------|
| **グローバル状態S** | 巨大な可変オブジェクト。テスト困難、操作順序バグの温床 | 状態管理を分離 |
| **DOM直接操作** | renderList/renderDetail等が直接innerHTML操作。競合しやすい | UIフレームワークまたは仮想DOM |
| **IIFE後付けパッチ群** | MutationObserverで既存関数をラップ。読解困難、順序依存 | モジュール化で解消 |
| **inline化されたCDNライブラリ** | marked.js/highlight.js/KaTeX等がHTML内にminified埋め込み | ビルドパイプラインで管理 |
| **FORM系の巨大コード** | renderFormDetail + バリデーション + checkbox-group + 条件付き表示 | feature moduleとして分離 |
| **Export/Buildの複雑さ** | rehydratable/observer/JSON/ZIPが密結合 | ビルドスクリプト分離 |
| **型安全性の欠如** | JSDoc参照はあるが実質untyped | TypeScript導入 |
