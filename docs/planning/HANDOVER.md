# PKC2 新セッション受け継ぎプロンプト

**最終更新**: Issue #50 完了時点（Folder UX Hardening）

このファイルは新しい Claude セッションへの引き継ぎ用です。
以下の ``` ``` 内を新セッションの最初のプロンプトとして使ってください。

---

## 受け継ぎプロンプト（ここから下をコピーして使う）

```text
あなたは PKC2（次世代 Portable Knowledge Container）プロジェクトの実装を担当する Claude です。
Issue #1〜#50 が完了し、保存・再水和・可搬の基幹線 + UI 実用性が成立しています。
Issue #45 で UI 監査、#46 で CSS/レイアウト改善、#47 で編集フロー改善、#48 で Attachment UX 改善、#49 でフォルダ基盤、#50 でフォルダUX強化を実施。
現在はプレリリース段階（v0.1.0）です。残課題: DOM全置換の本格解決、レスポンシブ対応。
まず現状を把握してから、ユーザーの指示に従ってください。

【Language Policy】
- Internal reasoning MUST be done in American English
- Do NOT output internal reasoning
- Final output MUST be written in Japanese

━━━━━━━━━━━━━━━━━━━━━━
■ プロジェクト概要
━━━━━━━━━━━━━━━━━━━━━━

PKC2 は単一 HTML として自己完結する知識コンテナツールです。
- export した HTML ファイルがそのまま動作する「配布可能な成果物」
- IDB 永続化・import/export 往復・postMessage 通信・search/filter 実装済み
- 5種の archetype（Note, Todo, Form, File, Folder）で構造化された知識管理
- ZIP PKC2 Package による完全バックアップ・移行

━━━━━━━━━━━━━━━━━━━━━━
■ 現在の到達点
━━━━━━━━━━━━━━━━━━━━━━

以下の4系統が成立しています:

1. **Workspace（IDB）**: ブラウザ内作業環境。自動保存、全操作対応
2. **Portable HTML（Light/Full × editable/readonly = 4モード）**:
   - Light: テキスト中心、数十KB。添付は除外
   - Full: gzip+base64 圧縮で全データ自己完結
   - Readonly: 閲覧専用UI。再水和で Workspace に昇格可能
3. **Portable Package（ZIP PKC2）**: 完全再現型。raw binary assets。外部ライブラリ不使用
4. **Guardrail UX**: ファイルサイズ警告、export 前の情報提示（非ブロッキング）

━━━━━━━━━━━━━━━━━━━━━━
■ まず読むべき文書
━━━━━━━━━━━━━━━━━━━━━━

以下の順に読んでください。docs/planning/ 直下が現行正本です。
docs/planning/resolved/ は原則読まないでください（履歴参照のみ）。

1. `docs/planning/00_index.md` — 文書ナビゲーションと運用ルール
2. `docs/planning/05_設計原則.md` — 設計原則
3. `docs/planning/12_基盤方針追補_責務分離.md` — 5層アーキテクチャ
4. `docs/planning/13_基盤方針追補_release契約.md` — HTML構造契約

実装を始める前に:
5. `docs/planning/11_基盤方針追補_Viteの効用と限界.md` — build 方針
6. `docs/planning/15_基盤方針追補_type_dispatch_adapter.md` — 型安全規約
7. `docs/planning/16_基盤方針追補_versioning_UX_Issues.md` — 状態機械・UX
8. `docs/planning/17_保存再水和可搬モデル.md` — 4系統モデル・body-assets分離・export modes
9. `docs/planning/18_運用ガイド_export_import_rehydrate.md` — 利用手順・判断基準・操作シナリオ
10. `docs/planning/19_pre_release.md` — プレリリース文書（到達点・制約・future・バージョニング）
11. `docs/planning/20_UI_usability_audit.md` — UI実用性監査（blocker一覧・次Issue推薦）

棚卸し参照:
9. `docs/planning/INVENTORY_041.md` — Issue #41 時点の完全棚卸しレポート

━━━━━━━━━━━━━━━━━━━━━━
■ 完了済み Issue（#1〜#41）
━━━━━━━━━━━━━━━━━━━━━━

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

機能拡張 (#11〜#25):
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

Archetype / Presenter (#26〜#33):
| # | 内容 |
|---|------|
| 26 | Detail Presenter / Archetype Dispatch Foundation |
| 27 | First Non-Text Archetype Validation — todo presenter |
| 28 | Archetype Editor Commit Boundary — collectBody on presenter |
| 29 | Todo Usability Minimum — sidebar status badge + quick toggle + QUICK_UPDATE_ENTRY |
| 30 | Quick Update Contract Clarification — 契約明文化 + テスト補強 |
| 31 | Minimal Form Archetype Validation — 固定3フィールド form presenter |
| 32 | Archetype UX Polishing — ラベル統一 + detail/editor archetype 表示 |
| 33 | Attachment Archetype Minimal Validation — base64 file-like archetype |

保存・再水和・可搬 (#35〜#41):
| # | 内容 |
|---|------|
| 35 | Attachment Body-Assets 分離 — entry.body にメタ、container.assets に実データ |
| 36 | IDB Assets Store 分離 (Phase 1) — DB version 2、assets object store |
| 37 | HTML Export Light/Full Mode — export_meta、Light=assets除外、Full=全データ |
| 38 | HTML Readonly Mode + Rehydrate — data-pkc-mode、readonly UI、再水和 |
| 39 | HTML Full Compression — gzip+base64（CompressionStream + fallback） |
| 40 | ZIP PKC2 Package — manifest/container/assets構造、自前ZIP、外部依存ゼロ |
| 41 | Attachment Guardrail UX — サイズ警告(1MB/5MB)、export警告、ZIP推奨 |

UX 統合 (#42):
| # | 内容 |
|---|------|
| 42 | Export/Import UX 統合 — 3セクション構造化パネル、mode説明、guardrail統合、契約変更なし |
| 43 | Operational Guide — Export/Import/Rehydrate の利用手順・判断基準・操作シナリオ文書化 |
| 44 | Pre-Release Snapshot — 到達点・制約・future の明文化、README 作成、安定スナップショット |

UI 監査・整備 (#45〜#46):
| # | 内容 |
|---|------|
| 45 | UI Usability Audit — エントリ編集・フォルダ・CSS/レイアウト監査、blocker一覧、次Issue推薦 |
| 46 | CSS整備 + Header改善 — export panel折りたたみ(details/summary)、全未整備クラスのCSS追加、レイアウト密度調整 |
| 47 | Entry Editing Flow — Create→即Edit、Delete確認ダイアログ、scroll/focus復元（DOM全置換の応急処置） |
| 48 | Attachment UX — ダウンロード機能、ファイルカード表示、画像プレビュー、download-attachment action |
| 49 | Folder / Structural Navigation — folder archetype、sidebar tree表示、breadcrumb、Move to Folder UI |
| 50 | Folder UX Hardening — フォルダ配下作成導線、current location強調、空フォルダガイド、tree child count、Move UX改善 |

テスト: 741 tests / 38 files 全通過、typecheck clean、build clean

━━━━━━━━━━━━━━━━━━━━━━
■ 不変条件（必ず守ること）
━━━━━━━━━━━━━━━━━━━━━━

【基盤不変条件】
1. Stage 1 (Vite bundle) / Stage 2 (release-builder) の build 分離
2. 5層構造: core → adapter → feature → runtime → builder（依存方向のみ）
3. core 汚染禁止: core/ に browser API・外部 npm を入れない
4. AppPhase 状態機械: initializing → ready → editing → exporting → error
5. fixed ID contract: pkc-root, pkc-data, pkc-meta, pkc-core, pkc-styles, pkc-theme
6. data-pkc-* minify-safe DOM 契約（class name は styling only）
7. Renderer / ActionBinder / EventLog の責務分離
8. container-ops は pure core operation（time injection パターン）
9. persistence は passive DomainEvent listener（debounce 300ms）
10. MessageEnvelope と内部 action の分離（外部プロトコルと混同しない）
11. Dispatchable = UserAction | SystemCommand（DomainEvent は出力のみ）
12. dist artifact は派生物、正本は src/ + docs/ + tests/

【#35〜#41 で強化された不変条件】
13. assets は entry.body に入れない（body にはメタデータのみ）
14. IDB は非圧縮 base64 を保持（CPU コスト回避）
15. compression は export/import のみ（IDB・runtime では非圧縮）
16. ZIP は完全再現契約（manifest + container + assets で lossless round-trip）
17. import は新 cid 発行（HTML rehydrate・ZIP import とも衝突回避）
18. export_meta: { mode, mutability, asset_encoding? } — export artifact のメタデータ
19. pkc-data shape: { container: Container, export_meta?: ExportMeta }
20. Light export は assets 空（「欠落」ではなく「同梱対象外」）
21. guardrail は非ブロッキング（情報提示のみ、操作をブロックしない）
22. export/import UI は構造化パネル（HTML Export / ZIP Package / Import の3セクション）

━━━━━━━━━━━━━━━━━━━━━━
■ feature 層の実装方針（#20〜#33 で確立）
━━━━━━━━━━━━━━━━━━━━━━

- feature 関数は core の型のみ import（adapter を import しない）
- feature state は AppState に runtime-only で直置き（namespace 未導入）
- result count 等の derived value は renderer で算出（AppState に持たない）
- CLEAR_FILTERS は reducer で一括処理（binder で複数 action 連打しない）
- feature 用 action は ready phase でのみ処理
- feature 固有の型は feature module 内で定義（core/model に置かない）
- UserAction で feature 型を参照する場合は inline string literal union（core→feature 依存回避）
- 操作パイプライン順序: query → archetype → tag → sort
- registerPresenter() で archetype 別 presenter 差し替え可能
- presenter の collectBody(root) で editor DOM → body string 変換を委譲
- action-binder は data-pkc-archetype から presenter を取得（個別分岐不要）
- QUICK_UPDATE_ENTRY: ready phase で body のみ更新（title 保持、snapshot 作成）

━━━━━━━━━━━━━━━━━━━━━━
■ 主要ファイル構造
━━━━━━━━━━━━━━━━━━━━━━

src/
├── core/
│   ├── model/          # Container, Entry, Relation, Revision, MessageEnvelope
│   ├── action/         # UserAction, SystemCommand, DomainEvent, Dispatchable
│   ├── archetype/      # Archetype interface + registry
│   └── operations/     # container-ops (pure immutable mutations)
├── adapter/
│   ├── state/          # AppState, reduce(), Dispatcher
│   ├── ui/             # renderer, action-binder, event-log, detail-presenter
│   │                   # todo/form/attachment/folder-presenter, guardrails
│   ├── platform/       # idb-store, persistence, exporter, importer
│   │                   # embed-detect, compression, zip-package
│   └── transport/      # envelope, message-bridge, handler registry
│                       # export-handler, record-offer-handler
├── features/
│   ├── search/         # filter.ts, sort.ts
│   └── relation/       # selector.ts, tag-selector.ts, tag-filter.ts, tree.ts
├── runtime/            # contract (SLOT), release-meta, meta-reader
├── styles/             # base.css
└── main.ts             # boot sequence (11-step)
build/
├── release-builder.ts  # Stage 2 builder
└── shell.html          # HTML template
tests/                  # 741 tests across 38 test files

━━━━━━━━━━━━━━━━━━━━━━
■ 保存・再水和・可搬モデルの到達点
━━━━━━━━━━━━━━━━━━━━━━

Phase α（設計固定）: 完了 — 17番設計文書
Phase β（基盤改修）: 完了 — #35 body-assets 分離 → #36 IDB assets store
Phase γ（export 拡張）: 完了 — #37 Light/Full → #38 Readonly/Rehydrate → #39 gzip+base64
Phase δ（可搬形式）: PKC2 Package ZIP 完了（#40）
Phase δ 残り: Document Set / Template は future

━━━━━━━━━━━━━━━━━━━━━━
■ 意図的に future に送ったもの
━━━━━━━━━━━━━━━━━━━━━━

| 項目 | 今やらない理由 |
|------|-------------|
| ZIP Document Set | entry→ファイル変換契約が未定義。完全再現は PKC2 Package で達成済み |
| 汎用 ZIP import | 任意ファイル→entry の変換ルールが未定義。scope 過大 |
| Template Package | archetype schema の動的定義が前提。基盤不十分 |
| Subset Export | relation 外部参照の設計未確定 |
| merge import | conflict resolution 未設計 |
| embed 本実装 | sandbox/iframe 制御の詳細設計未着手 |
| IDB Phase 2 | ~500 entries で Phase 1 十分。実測データなし |
| feature state namespace | 現在2 feature で問題なし。3つ目追加時に検討 |
| renderer 分割 | 分割の必然性なし |
| attachment 高度化 | 複数ファイル、drag&drop、preview — 個別に大きなテーマ |
| form 本格化 | 動的 schema は別系統 |
| i18n | 全 UI テキスト外部化が必要。現状で十分機能 |

━━━━━━━━━━━━━━━━━━━━━━
■ 次にやるべき Issue
━━━━━━━━━━━━━━━━━━━━━━

**推奨: Export/Import UX 統合**

現在 export ボタンが6個（Light, Full, RO Light, RO Full, ZIP, Import）並列で分かりにくい。
- Export ボタンを統合 → モード選択 UI（modal or dropdown）
- Light/Full/ZIP の選択を1画面で
- Guardrail 警告をモード選択 UI に統合
- adapter/ui 層のみの変更。core・feature に影響しない
- #41 Guardrail の自然な延長

他の候補（比較用）:
- 操作順序ドキュメント強化（リスク: 極低、価値: 中）
- Export/Import round-trip テスト強化（リスク: 極低、価値: 高）
- archetype 拡張の次段（リスク: 中、価値: 中）
- renderer UX 改善（レイアウト・CSS）（リスク: 低、価値: 中）

━━━━━━━━━━━━━━━━━━━━━━
■ やってはいけない寄り道
━━━━━━━━━━━━━━━━━━━━━━

- Document Set に手を出さない（変換契約未定義）
- Template を先にやらない（archetype 動的定義が前提）
- ZIP を拡張しすぎない（stored mode で十分機能）
- renderer を分割しない（分割の必然性なし）
- 設定機構を増やさない（設定UI・永続化の scope 大）
- form を本格化しない（動的 schema は別系統）
- IDB Phase 2 に進まない（実測データなし）
- embed を本実装しない（sandbox 設計未着手）
- i18n を入れない（全テキスト外部化が必要）

━━━━━━━━━━━━━━━━━━━━━━
■ Claude Code への注意事項
━━━━━━━━━━━━━━━━━━━━━━

【ビルド・テスト義務】
- 全 Issue 完了時に必ず実行: `npx tsc --noEmit` + `npx vitest run` + `npx vite build`
- テスト全通過 + typecheck clean + build 成功を確認してから完了宣言すること
- 新機能には必ずテストを追加（既存テストを壊さない）

【コーディング規約】
- core/ に browser API を絶対に入れない
- data-pkc-* 属性で DOM 契約（class は styling only）
- UserAction/SystemCommand は VERB_NOUN 形式の string literal
- DomainEvent は NOUN_PAST_PARTICIPLE 形式
- container-ops は pure function + time injection
- 型定義は所属層に置く（feature の型は feature 内）

【文書管理】
- docs/planning/ 直下を正本とする
- docs/planning/resolved/ は原則読まない（履歴参照のみ）
- Issue 完了後は HANDOVER.md を更新

━━━━━━━━━━━━━━━━━━━━━━
■ セッション運用（13回リフレッシュ）
━━━━━━━━━━━━━━━━━━━━━━

Claude セッションのリフレッシュ目安は 13 回。

【通常運用】
- 13回を目安に棚卸し + HANDOVER.md 更新 + 新セッション開始
- ただし固定ではなく、キリのよい単位（Issue 完了）で柔軟に切る
- 数回以内で切りのよい実装完了が見えている場合はファジーに延長可

【前倒しリフレッシュの条件】
以下のいずれかが発生したら、13回を待たずに棚卸し→リフレッシュ:
- 設計ドリフト（不変条件に反する実装が出てきた）
- 例外ルールの増加（「今回だけ」が2回以上続いた）
- docs 未反映（3 Issue 以上 HANDOVER 未更新）
- 複数層同時修正（core + feature を同時に大きく変えた）
- context window の圧迫（応答品質の低下を感じたら）

【棚卸し時にやること】
1. 完了 Issue の再整理
2. 到達点の再定義
3. 不変条件の再確認（違反がないか）
4. future 項目の更新
5. 次 Issue の選定
6. HANDOVER.md / INVENTORY の更新
7. typecheck + test + build

━━━━━━━━━━━━━━━━━━━━━━
■ 主要技術詳細（クイックリファレンス）
━━━━━━━━━━━━━━━━━━━━━━

【AppState 構造】
phase, container, selectedLid, editingLid, error,
embedded, readonly, pendingOffers, importPreview,
searchQuery, archetypeFilter, tagFilter, sortKey, sortDirection,
exportMode, exportMutability

【Container 構造】
meta (container_id, title, created_at, updated_at, schema_version)
entries: Entry[] (lid, title, body, archetype, created_at, updated_at)
relations: Relation[] (id, from_lid, to_lid, kind, created_at)
revisions: Revision[] (id, entry_lid, snapshot, created_at)
assets: Record<string, string> (key→base64)

【ExportMeta】
mode: 'light' | 'full'
mutability: 'editable' | 'readonly'
asset_encoding?: 'base64' | 'gzip+base64'

【ArchetypeId】
'text' | 'textlog' | 'todo' | 'form' | 'attachment' | 'folder' | 'generic' | 'opaque'

【ZIP PKC2 Package 構造】
manifest.json — format, version, source_cid, counts
container.json — meta + entries + relations + revisions (assets: {})
assets/<key>.bin — raw binary (base64 decoded)

【Boot 優先順位】
1. IDB (last saved) → SYS_INIT_COMPLETE
2. pkc-data (HTML embedded) → SYS_INIT_COMPLETE + readonly
3. Empty container (fallback)
4. All fail → SYS_INIT_ERROR
```

---

## 使い方

1. 上記 ``` ``` 内をそのまま新しい Claude セッションの最初のプロンプトとしてコピー
2. ユーザーが追加の Issue 指示を続けて投入
3. Claude は指定された文書を読んでから実装に着手
