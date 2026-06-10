# PKC-Extensions host 設計 — launcher + 機能退避器(2026-06-10)

**Status**: 設計 doc(L3 #772)。**設計のみ、実装はプライム・ディレクティブ下で凍結 — go は user 判断**
**Issues**: #772(PKC-Extensions host 設計)/ #791(graph 拡張 bespoke channel の envelope v2 正式統合 — 本書 §6 で吸収)/ Epic #764
**前提 doc**: `v3-consolidation-and-direction-2026-06.md` §4(North Star)、`pkc-message-v2-open-questions-decisions-2026-05.md`(OQ-1〜5 decision)、`pkc-message-v2-prior-art-and-plan-2026-04-26.md`

---

## 1. 目的と位置づけ

North Star(#764)の柱②「コアを薄く、ランチャー + PKC-Extensions に多機能を退避」を設計高度に固定する。#790 で graph view を core から撤去し `PKC2-Extensions/graph/`(Cytoscape 再実装、単一 HTML)へ移植したことで、**Extension host の第1実装が事実として存在する**。本書はその実証パターンを host の正式 I/F に昇格させ、graph 固有の bespoke 部分(`pkc-graph-ext` channel)を PKC-Message v2(JSON-RPC 2.0)へ統合する道筋(#791)を定義する。

**実装はしない。** 本書の成果物は (a) core/extension 境界の定義、(b) host I/F(チャネル・method catalog・セキュリティ不変条件)、(c) launcher 契約、(d) 退避候補機能リスト、(e) graph channel の v2 移行計画、(f) user 判断事項の列挙。

## 2. 現状資産の棚卸し(#790 後)

| 資産 | 場所 | 状態 |
|---|---|---|
| PKC-Message v1 envelope + bridge | `src/adapter/transport/message-bridge.ts` ほか | embedded(iframe 内 PKC2)→ host 方向が主。`export:request` / `record:offer` / ping-pong。origin allowlist + container_id filter |
| v2 JSON-RPC minimum | `src/core/model/message-v2.ts`、`envelope-v2.ts`、`heartbeat-handler-v2.ts` | `jsonrpc:'2.0'` discriminate で v1 と並列稼働。`pkc.heartbeat` のみ実装済 |
| graph 拡張 bespoke channel | `src/adapter/ui/graph-extension-launcher.ts` ↔ `PKC2-Extensions/graph/src/protocol.ts` | `pkc-graph-ext` v1。**host→child 方向の唯一の実装**。hello / welcome{nonce, projection} / select / projection |
| 拡張の起動・自動起動 | `src/adapter/ui/pkc-extension-startup.ts` | `pkc_extension && startup` の autostart、`?pkc-safe-mode=1`、popup ブロック時 retry prompt |
| 拡張メタデータ | `AttachmentBody`(`attachment-presenter.ts`) | `pkc_extension` / `startup` / `registered_as_app` / `app_icon(_asset_key)` |
| launcher view | `renderer.ts` `renderLauncherView` | `registered_as_app === true` の HTML attachment を tile 列挙、新規ウィンドウ起動 |
| data-safe 編集ハンドラ | `pkc-extension-startup.ts` `moveEntryToFolder` / `relateEntries` | 全入力検証 + dispatch + 永続化。拡張起点の編集が container を壊せない |
| projection 算出 | `src/features/graph-extension/projection.ts` | body/assets/revisions を**送らない**最小投影。pkc-data 不変更 |

## 3. core / extension 境界

### 3.1 core に残すもの(薄いコア)

- Container CRUD + 不変条件(invariant 4: Container = source of truth)
- state machine(dispatcher / reducer)・render shell・storage(idb、将来 OPFS #771)
- PKC-Message transport(v1/v2 bridge)と **Extension host**(本書の I/F)
- 基本 view(detail / sidebar tree)。view の取捨は L2 #769 の keep/drop に従う

### 3.2 extension へ退避する判断基準

1. **data contract に触れない**: 拡張は projection(読み)+ 検証済み編集 method(書き)のみ。schema / archetype を増やさない
2. **専用 view を持つ**: 独立 surface として成立する(graph が該当した)
3. **bundle 寄与が大きい**: `bundle-audit-2026-06.md` の実測で KB を取り戻せる

### 3.3 退避候補リスト(#772 受け入れ条件)

| 候補 | bundle 寄与(audit 実測) | 退避形態 | 備考 |
|---|---|---|---|
| graph view | ✅ 退避済(#790) | 独立拡張(Cytoscape) | 第1実装・パターン実証 |
| mermaid レンダリング | **~3.1MB(bundle の 56.7%)** | 拡張 or lazy-load 分離 | L1 #767 最大項目。viewer 連携の設計が必要 |
| Word/PPT export(docx/pptxgenjs) | ~725KB | 拡張(export 専用) | `export.request` 系 method と相性良 |
| spreadsheet archetype(#760 系) | L2 #769 仕分け待ち | keep なら拡張化を第一候補 | 凍結 10-4。archetype 追加はコア汚染が大きい |
| calendar / kanban view | 中 | **当面 core 残置** | 利用頻度高・projection だけでは完結しない |

> 退避 = 機能追加ではなく **subtract の受け皿**。優先順位は L1(bundle)× L2(実機 keep/drop)の結果に従い、本書では順序を確定しない(§9 D3)。

## 4. Host I/F 設計

### 4.1 実行モデル(graph 拡張で実証済みのパターンを標準化)

- 拡張本体 = **container.assets 内の単一 HTML**(classic IIFE。`type="module"` は Firefox の `document.write` 注入で動かないため不可)
- 起動 2 モード:
  - **window モード**(user gesture): `window.open('')` + `document.write` → 同一オリジン子ウィンドウ
  - **iframe overlay モード**(autostart、popup ブロック回避): about:blank iframe の `contentWindow.document` へ直接 write
- どちらも**同一オリジン**になることが本 host モデルの根幹(origin 検証と window identity 検証が可能)
- 失敗時の不変条件: autostart の popup ブロックで**画面を乗っ取る fallback をしない**(#790 で確立、retry prompt のみ)。hang した拡張は `?pkc-safe-mode=1` で必ず回避可能

### 4.2 チャネル: PKC-Message v2(JSON-RPC 2.0)に host→child 方向を正式定義

bespoke `pkc-graph-ext` の handshake を v2 の語彙に写像する:

| bespoke v1(現行 graph) | v2 正式化 | 備考 |
|---|---|---|
| child→host `hello` | child→host `initialize` request | host は `event.source === childWin && event.origin === location.origin` の時のみ受理 |
| host→child `welcome {nonce, projection}` | `initialize` response `{ source_id, serverCapabilities, …初期 payload }` | **per-launch nonce の役割は host 集中発行の `source_id` が兼ねる**(OQ-2 decision と一致: host 発行 UUID v4、以後の全 message が carry、`(source_id,id)` 複合 key で dedupe) |
| child→host `select {nonce, lid}` | `pkc.entry.select` notification | params に source_id 必須 |
| host→child `projection {nonce, …}` | `ext.projection.update` notification | host→child の push 更新 |

**セキュリティ不変条件(v1 から弱めない)**:

1. window identity バインド: `event.source === childWin / iframe.contentWindow`(偽造不能)
2. `event.origin === location.origin` 検証(`file://` = origin `"null"` は targetOrigin `'*'` fallback + identity/secret で担保 — 現行どおり)
3. per-launch secret(v2 では source_id)を全 message で検証
4. **データ最小化**: host→child は projection のみ。entry `body` / `assets`(base64)/ `revisions` は送らない(graph の `GraphProjection` 前例を host 原則に昇格)

**heartbeat**: OQ-1 decision(opt-out 不許可)に従い、同一オリジン拡張にも `$/heartbeat` を適用する。子ウィンドウ close を host が検知できない問題(まさに OQ-1 の動機)への解にもなる。ただし現行 graph 拡張は `closeChild` + unload 連携で実用上足りており、heartbeat 導入は v2 移行と同時で良い(§9 D2)。

### 4.3 method catalog(host I/F 初版・案)

| 方向 | method | 形態 | 意味 |
|---|---|---|---|
| child→host | `initialize` | request | handshake。response に source_id / serverCapabilities / 初期 projection |
| child→host | `$/heartbeat` | notification | OQ-1 |
| child→host | `pkc.entry.select` | notification | host の `SELECT_ENTRY` に写像 |
| child→host | `pkc.entry.open` | notification | `SELECT_ENTRY {revealInSidebar}` + `window.focus()` |
| child→host | `pkc.entry.moveToFolder` | request | 検証済み `moveEntryToFolder`(cycle guard 含む)。result = 成否 |
| child→host | `pkc.relation.create` | request | 検証済み `relateEntries`。result = 成否 |
| host→child | `ext.projection.update` | notification | container 変化時の差分 push(現 `pushUpdate`) |
| host→child | `ext.selected.update` | notification | host 側選択の追従(現 `pushSelected`) |
| 将来(v2.x) | `pkc.ast.parseMarkdown` ほか | request | roadmap 10-5(IR を拡張に渡す)— 凍結、catalog 枠だけ予約 |

命名は decision doc の dot-separated 規約。**書き込み系は必ず request(成否を返す)**、読み push は notification。

### 4.4 ACL

OQ-4(`Container.meta.extensionGrants`、v2.2)とどう接続するか: container 内 asset 由来・同一オリジンの拡張は外部 origin の sender と信頼レベルが異なる。案: **asset 由来拡張は `granted_by:'auto'` の暗黙 grant(scope = 上記 catalog の read 系 + 検証済み write 2 種)**、外部 origin は従来どおり dialog consent。→ §9 D4(user 判断)。

## 5. Launcher 契約

現状 2 系統あるメタデータを 1 つの起動面に統合する(**新 UI mode は作らない** — 既存 launcher view の列挙条件を拡げるだけ):

1. `registered_as_app === true`(plain HTML app、チャネルなし)→ 現行どおり新規ウィンドウで起動
2. `pkc_extension === true`(PKC-Extension)→ **launcher tile に同列表示**し、起動経路だけ secure channel(`launchPkcExtensionEntry`)に振り分け。`startup === true` で boot 自動起動(現行)

manifest は `AttachmentBody` の既存 field で足りる(追加するなら将来 `required_scopes?: string[]` のみ、ACL v2.2 と同時)。拡張の列挙・起動 UI 契約は「attachment の body を読むだけ」= container schema 不変。

## 6. graph 拡張の v2 移行計画(#791 の設計)

両対応期間を置く 3 段階。**asset 内に既に配布された旧 protocol の拡張 HTML が動き続ける**ことが後方互換の要件(invariant 5)。

- **段階 1 — spec**: v2 spec doc(decision doc §4 の PR-α)に **host→child 章**(§4.2/4.3 の写像表)を追加。`pkc-graph-ext` v1 を「bespoke 前例、deprecated 予定」として記録
- **段階 2 — host 側 both-accept**: launcher の message listener が v1 bespoke と v2 envelope を `jsonrpc:'2.0'` field で discriminate(message-bridge の v1/v2 並列稼働と同じ手法)。セキュリティ検証(§4.2 不変条件)は両経路共通の前段に括り出す
- **段階 3 — child 側 v2 化 + 共通モジュール抽出**: `PKC2-Extensions/graph/src/protocol.ts` を v2 envelope に書き換え、host 側の channel 配線を `graph-extension-launcher.ts` から **拡張非依存の host モジュール**(仮: `src/adapter/transport/extension-host.ts`)へ抽出。graph は最初のコンシューマとして乗り換え

旧 asset の HTML は段階 2 以降も v1 経路で動作(deprecation は v2 拡張が普及してから、期限は決めない)。

## 7. 実装しない宣言と、go 後の PR 分割(参考)

本書は設計のみ。user の go が出た場合の参考分割: PR-1 = 段階 1(spec doc のみ)→ PR-2 = 段階 2(host both-accept、~100-150 行 + parity test)→ PR-3 = 段階 3(child v2 化 + ホストモジュール抽出 + 拡張 HTML 再ビルド)。bundle 影響は transport 純増 ~2-3KB 見込み(decision doc の v2.0 試算と同程度)。launcher 統合(§5)は独立 PR 可。

## 8. 受け入れ条件との対応(#772 / #791)

- core ↔ extension 境界の定義 → §3
- 既存 PKC-Message / postMessage transport の host I/F 拡張 → §4
- extension runtime の選定(sandbox iframe / worker / WASM)→ §4.1: **同一オリジン iframe + window.open の 2 モード**を初版採用(graph で実証済)。sandbox iframe(別オリジン化)は ACL v2.2 + 外部配布拡張の段で再評価、worker / WASM は UI を持たない演算拡張(IR 処理)用に v3+ 保留
- launcher が extension を列挙/起動する UI 契約 → §5
- 退避候補機能リスト → §3.3
- #791(graph channel v2 統合)の設計 → §6

## 9. 判断事項(user 確認待ち)

- **D1 — #791 の扱い**: 本書 §6 をもって #791 の「設計」受け入れ条件を満たしたとし、#791 は実装 go 待ち(凍結)に置き換えてよいか
- **D2 — 同一オリジン拡張への heartbeat 必須**: OQ-1 の「opt-out 不許可」を host→child にも適用(v2 移行と同時に導入)でよいか
- **D3 — 退避候補の優先順位**: §3.3 のうち次に着手すべきは mermaid 分離(L1 bundle 最大)か、Word/PPT export か、L2 #769 の実機仕分け完了を待つか
- **D4 — asset 由来拡張の auto-grant**: container 内 asset 由来・同一オリジン拡張に dialog なしの暗黙 grant(§4.4)を許容するか
- **D5 — 実装 go/no-go**: 段階 1(spec doc のみ、コード不変)だけ先行着手を許可するか、全凍結のままにするか

---

## 関連

- 方針正本: [`v3-consolidation-and-direction-2026-06.md`](./v3-consolidation-and-direction-2026-06.md) §4 / §6 L3
- v2 decision: [`pkc-message-v2-open-questions-decisions-2026-05.md`](./pkc-message-v2-open-questions-decisions-2026-05.md)
- v2 prior-art: [`pkc-message-v2-prior-art-and-plan-2026-04-26.md`](./pkc-message-v2-prior-art-and-plan-2026-04-26.md)
- bundle 実測: [`bundle-audit-2026-06.md`](./bundle-audit-2026-06.md)
- INDEX: [`INDEX.md`](./INDEX.md)
