# PKC2 新セッション受け継ぎプロンプト

**最終更新**: Issue #31 完了時点（Minimal Form Archetype Validation）

このファイルは新しい Claude セッションへの引き継ぎ用です。
以下の内容を新セッションの最初のプロンプトとして使ってください。

---

## 受け継ぎプロンプト（ここから下をコピーして使う）

```text
あなたは PKC2（次世代 Portable Knowledge Container）プロジェクトの実装を担当する Claude です。
前セッションで Issue #1〜#31 が完了しており、feature 層の検索・ソート・relation 観測・tags・tag filter・archetype dispatch（todo + form 実証 + editor commit 整理 + quick update 契約明文化）が成立しています。
まず現状を把握してから、ユーザーの指示に従ってください。

【Language Policy】
- Internal reasoning MUST be done in American English
- Do NOT output internal reasoning
- Final output MUST be written in Japanese

【プロジェクト概要】
PKC2 は単一 HTML として自己完結する知識コンテナツールです。
export した HTML ファイルがそのまま動作する「配布可能な成果物」であり、
IDB 永続化・import/export 往復・postMessage 通信・search/filter が実装済みです。

【まず読むべき文書】
以下の順に読んでください。docs/planning/ 直下が現行正本です。
docs/planning/resolved/ は原則読まないでください（履歴参照のみ）。

1. `docs/planning/00_index.md` — 文書ナビゲーションと運用ルール
2. `docs/planning/05_設計原則.md` — 設計原則
3. `docs/planning/12_基盤方針追補_責務分離.md` — 5層アーキテクチャ
4. `docs/planning/13_基盤方針追補_release契約.md` — HTML構造契約

実装を始める前に：
5. `docs/planning/11_基盤方針追補_Viteの効用と限界.md` — build 方針
6. `docs/planning/15_基盤方針追補_type_dispatch_adapter.md` — 型安全規約
7. `docs/planning/16_基盤方針追補_versioning_UX_Issues.md` — 状態機械・UX

【完了済み Issue（#1〜#21）】

基盤 (#1〜#10):
| # | 内容 |
|---|------|
| 1 | Bootstrap（Vite + TypeScript + ESLint + Vitest） |
| 2-3 | Domain model / action contract（6境界分離） |
| 4 | 最小 UI Shell（renderer + action-binder + event-log） |
| 5 | Container mutation（pure immutable ops in core） |
| 6 | IDB Persistence（ContainerStore + passive listener） |
| 7 | Release Metadata（ReleaseMeta + SHA-256 integrity） |
| 8 | HTML Export（Container → 単一 HTML download） |
| 9 | Import（DOMParser + validation + full replace） |
| 10 | PKC-Message Transport（bridge + envelope validation + ping/pong） |

拡張 (#11〜#21):
| # | 内容 |
|---|------|
| 11 | Embed Detection（isEmbedded + standalone/embedded 分岐） |
| 12 | Message Handler Routing（handler registry + type-based routing） |
| 13 | Record Offer/Accept（record:offer → pendingOffers → accept/dismiss） |
| 14 | Embed Behavior Contract（capability surface + embed 判定連携） |
| 15 | Revision/History Foundation（snapshot + getRevisionCount + parseRevisionSnapshot） |
| 16 | Import Confirmation UX（SYS_IMPORT_PREVIEW → CONFIRM/CANCEL） |
| 17 | Minimal Restore（RESTORE_ENTRY + restoreEntry + restoreDeletedEntry） |
| 18 | Capability Ping Extension（pong profile + capability negotiation） |
| 19 | History UX Observation（revision badge, timestamp, restore candidates） |
| 20 | Search/Filter Foundation（filterEntries + SET_SEARCH_QUERY + feature 層パターン確立） |
| 21 | Search/Filter Enhancement（archetype filter + result count + CLEAR_FILTERS） |
| 22 | Entry Sort Foundation（sortEntries + SET_SORT + sort UI + filter→sort pipeline） |
| 23 | Relation Observation UI（relation list + navigation + minimal create） |
| 24 | Tags Minimal UI（categorical relation → tag chips + add/remove） |
| 25 | Tag Filter（sidebar tag 絞り込み + click-to-filter + CLEAR_FILTERS 統合） |
| 26 | Detail Presenter / Archetype Dispatch Foundation |
| 27 | First Non-Text Archetype Validation — todo presenter |
| 28 | Archetype Editor Commit Boundary — collectBody on presenter |
| 29 | Todo Usability Minimum — sidebar status badge + quick toggle + QUICK_UPDATE_ENTRY |
| 30 | Quick Update Contract Clarification — 契約明文化 + テスト補強 |
| 31 | Minimal Form Archetype Validation — 固定3フィールド form presenter |

テスト: 505 tests 全通過、typecheck clean、lint clean

【不変条件（必ず守ること）】
- Stage 1 (Vite bundle) / Stage 2 (release-builder) の build 分離
- 5層構造: core → adapter → feature → runtime → builder
- core 汚染禁止: core/ に browser API を入れない
- AppPhase 状態機械: initializing → ready → editing → exporting → error
- fixed ID contract: pkc-root, pkc-data, pkc-meta, pkc-core, pkc-styles, pkc-theme
- data-pkc-* minify-safe DOM 契約（class name は styling only）
- Renderer / ActionBinder / EventLog の責務分離
- container-ops は pure core operation（time injection パターン）
- persistence は passive DomainEvent listener（debounce 300ms）
- release meta は builder 生成 / runtime 読取
- export は runtime exporter（DOM 読取 + Blob download）
- import は DOMParser + strict validation + full replace（merge しない）
- MessageEnvelope は外部プロトコル（内部 action と混同しない）
- Dispatchable = UserAction | SystemCommand（DomainEvent は出力のみ）
- pkc-data shape: { container: Container }
- dist artifact は派生物、正本は split source / docs / tests

【feature 層の実装方針（#20-#22 で確立）】
- feature 関数は core の型のみ import（adapter を import しない）
- feature state（searchQuery, archetypeFilter, tagFilter, sortKey, sortDirection）は AppState に runtime-only で直置き
- feature state namespace はまだ導入していない（2〜3 feature 追加後に検討）
- result count 等の derived value は renderer で算出（AppState に持たない）
- CLEAR_FILTERS は reducer で一括処理（binder で複数 action 連打しない）
- feature 用 action は ready phase でのみ処理、他 phase では block
- feature 固有の型（SortKey, SortDirection）は feature module 内で定義（core/model に置かない）
- UserAction で feature 型を参照する場合は inline string literal union を使用（core→feature 依存回避）
- 操作パイプライン順序: query → archetype → tag → sort（CLEAR_FILTERS は query+archetype+tag をリセット、sort は独立関心事）
- detail view は DetailPresenter で archetype 別 body 表示を dispatch（shared chrome は renderer に残る）
- registerPresenter() で archetype 別 presenter 差し替え可能（未登録時は default text presenter）
- presenter の collectBody(root) で editor DOM → body string 変換を archetype 別に委譲
- action-binder は data-pkc-archetype から presenter を取得し collectBody を呼ぶだけ（archetype 個別分岐不要）
- QUICK_UPDATE_ENTRY: ready phase で body のみ更新（title 保持、snapshot 作成）— quick toggle 等の軽量即時操作に限定（契約は 12_責務分離.md 参照）
- sidebar の renderEntryItem は todo archetype の場合 parseTodoBody で status badge を表示
- detail view の todo status は button 要素で data-pkc-action="toggle-todo-status" — click で open↔done 切替
- form presenter: 固定3フィールド（name/note/checked）の最小 archetype。presenter 基盤が todo 以外でも成立することの検証用

【主要ファイル構造】
src/
├── core/
│   ├── model/          # Container, Entry, Relation, Revision, MessageEnvelope
│   ├── action/         # UserAction, SystemCommand, DomainEvent, Dispatchable
│   ├── archetype/      # Archetype interface + registry
│   └── operations/     # container-ops (pure immutable mutations)
├── adapter/
│   ├── state/          # AppState, reduce(), Dispatcher
│   ├── ui/             # renderer, action-binder, event-log, detail-presenter, todo-presenter, form-presenter
│   ├── platform/       # idb-store, persistence, exporter, importer, embed-detect
│   └── transport/      # envelope, message-bridge, handler registry, export/offer handlers
├── features/
│   ├── search/         # filter.ts (filterEntries, filterByArchetype, applyFilters), sort.ts (sortEntries)
│   └── relation/       # selector.ts, tag-selector.ts, tag-filter.ts (filterByTag)
├── runtime/            # contract (SLOT), release-meta, meta-reader
├── styles/             # base.css
└── main.ts             # boot sequence (11-step)
build/
├── release-builder.ts  # Stage 2 builder
└── shell.html          # HTML template
tests/                  # 505 tests across 32 test files

【まだ意図的にやっていないこと】
- merge import（完全置換のみ）
- embed 本実装（sandbox / iframe 制御）
- capability negotiation 本実装
- i18n 本実装
- fuzzy search / saved filters
- relation 削除 UI / relation 編集 UI / relation 種別追加
- 複数 tag AND/OR filter
- tag autocomplete の高度化
- saved filter preset / filter 永続化
- archetype 別 presenter 拡充（textlog 等）
- form の本格化（動的 schema, validation engine, conditional display）
- todo の高度化（due_date, priority, filter/sort 特化）
- editor framework 本格化（validation, undo 等）
- feature state namespace
- renderer ファイル分割
- PKC1 互換 import
- data_integrity（pkc-data の hash）
- correlation_id（request/response ペアリング）
- rate limiting / payload size limit

【運用注意】
- docs/planning/ 直下を正本とする
- docs/planning/resolved/ は原則参照しない
- 必要な場合のみ理由を示して resolved を読む
- 新しい Issue が完了したら、直下の設計書に反映し、個別文書は resolved へ

【セッション運用】
- Claude セッションのリフレッシュ目安は 13 回
- ただし固定ではなく、前倒しリフレッシュあり
- 数回以内で切りのよい実装完了が見えている場合はファジーに延長可
- 設計ドリフト、例外ルール増加、docs 未反映、複数層同時修正が出たら前倒しを優先
```

---

## 使い方

1. 上記 ``` ``` 内をそのまま新しい Claude セッションの最初のプロンプトとしてコピー
2. ユーザーが追加の Issue 指示を続けて投入
3. Claude は指定された文書を読んでから実装に着手
