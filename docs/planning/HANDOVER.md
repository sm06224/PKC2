# PKC2 新セッション受け継ぎプロンプト

**最終更新**: Issue #10 完了時点（PKC-Message Transport）

このファイルは新しい Claude セッションへの引き継ぎ用です。
以下の内容を新セッションの最初のプロンプトとして使ってください。

---

## 受け継ぎプロンプト（ここから下をコピーして使う）

```text
あなたは PKC2（次世代 Portable Knowledge Container）プロジェクトの実装を担当する Claude です。
前セッションで Issue #1〜#10 が完了しており、最小骨格が成立しています。
まず現状を把握してから、ユーザーの指示に従ってください。

【Language Policy】
- Internal reasoning MUST be done in American English
- Do NOT output internal reasoning
- Final output MUST be written in Japanese

【プロジェクト概要】
PKC2 は単一 HTML として自己完結する知識コンテナツールです。
export した HTML ファイルがそのまま動作する「配布可能な成果物」であり、
IDB 永続化・import/export 往復・postMessage 通信が最小実装済みです。

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

【完了済み Issue（#1〜#10）】
| # | 内容 | コミット |
|---|------|---------|
| 1 | Bootstrap（Vite + TypeScript + ESLint + Vitest） | c364609 |
| 2-3 | Domain model / action contract（6境界分離） | 5f275f0 |
| 4 | 最小 UI Shell（renderer + action-binder + event-log） | 8c65ab3 |
| 5 | Container mutation（pure immutable ops in core） | 356fd49 |
| 6 | IDB Persistence（ContainerStore + passive listener） | f31bec3 |
| 7 | Release Metadata（ReleaseMeta + SHA-256 integrity） | a29b78e |
| 8 | HTML Export（Container → 単一 HTML download） | 13b04f8 |
| 9 | Import（DOMParser + validation + full replace） | e3cdba2 |
| 10 | PKC-Message Transport（bridge + envelope validation + ping/pong） | 48a7240 |

テスト: 202 tests 全通過、typecheck clean、lint clean

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

【主要ファイル構造】
src/
├── core/
│   ├── model/          # Container, Entry, Relation, Revision, MessageEnvelope
│   ├── action/         # UserAction, SystemCommand, DomainEvent, Dispatchable
│   └── operations/     # container-ops (pure immutable mutations)
├── adapter/
│   ├── state/          # AppState, reduce(), Dispatcher
│   ├── ui/             # renderer, action-binder, event-log
│   ├── platform/       # idb-store, persistence, exporter, importer
│   └── transport/      # envelope validation, message-bridge
├── runtime/            # contract (SLOT), release-meta, meta-reader
├── styles/             # base.css
└── main.ts             # boot sequence
build/
├── release-builder.ts  # Stage 2 builder
└── shell.html          # HTML template
tests/                  # 202 tests across 18 test files

【次の優先課題】
1. export:request / export:result — 親ページからの export 指令を message で受信
2. record:offer / record:accept — Container 間レコード転送
3. embed detection — isEmbedded() + standalone/embedded 挙動分岐
4. Revision/History 本格化
5. capability negotiation

【まだ意図的にやっていないこと】
- merge import（完全置換のみ）
- embed 本実装（sandbox / iframe 制御）
- capability negotiation 本実装
- revision/history の本格実装
- i18n 本実装
- feature 群の大量実装
- PKC1 互換 import
- data_integrity（pkc-data の hash）
- correlation_id（request/response ペアリング）
- rate limiting / payload size limit

【運用注意】
- docs/planning/ 直下を正本とする
- docs/planning/resolved/ は原則参照しない
- 必要な場合のみ理由を示して resolved を読む
- 新しい Issue が完了したら、直下の設計書に反映し、個別文書は resolved へ
```

---

## 使い方

1. 上記 ``` ``` 内をそのまま新しい Claude セッションの最初のプロンプトとしてコピー
2. ユーザーが追加の Issue 指示を続けて投入
3. Claude は指定された文書を読んでから実装に着手
