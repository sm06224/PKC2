# PKC-Message API v2 — Specification (Draft)

**Status**: Draft — **stage 2**(2026-06-10、#795 C-1)
**本版で normative**: **§2(稼働中の v2 経路 — 現実装の記述)** と **§3(Host→Extension channel — 設計)**。§2 は `message-bridge.ts` で**本番稼働中**の経路を記述する(v1 spec §9.3 の「v2 は別 doc 必須」を充足)。将来計画(handshake / source_id / heartbeat 義務)は §2.6 に分離。
**Audience**: PKC-Extension implementers(別リポジトリでの拡張研究を含む)、PKC2 contributors
**Normative cross-spec**:
- `docs/spec/pkc-message-api-v1.md`(v1 envelope。v2 と並列稼働)
- `docs/development/pkc-message-v2-open-questions-decisions-2026-05.md`(OQ-1〜5 decision、本 spec の根拠)
- `docs/development/pkc-extensions-host-design-2026-06.md`(host 設計、#772/#791)

**Source-of-truth implementation**:
- `src/core/model/message-v2.ts`(JSON-RPC 2.0 envelope 型 + `pkc.heartbeat`)
- `src/adapter/transport/envelope-v2.ts` / `heartbeat-handler-v2.ts` / `message-bridge.ts`(v1/v2 discriminate)
- `src/adapter/ui/graph-extension-launcher.ts` ↔ `PKC2-Extensions/graph/src/protocol.ts`(§3 の前例 = bespoke `pkc-graph-ext` v1)

---

## 1. Purpose / 章構成

PKC-Message v2 は wire を **JSON-RPC 2.0** に全面移行する(prior-art 調査の結論)。v1 独自 envelope は互換 fallback として並列稼働し、受信側は `jsonrpc: '2.0'` field の有無で discriminate する(実装済: `message-bridge.ts`)。

| 章 | 内容 | 本版の状態 |
|---|---|---|
| §2 | 稼働中の v2 経路(envelope / `pkc.heartbeat` / error / gate) | **normative(現実装、stage 2)** |
| §3 | **Host→Extension channel** | **normative(設計、stage 1)** |
| §4 | Versioning / v1 互換 | normative(短) |
| §5 | Tasks / ACL / delta / Elicitation | 予約(v2.1+、decision doc 参照) |
| §6 | Observability | **normative(#795 B-1/C-3、2026-06-11)** |

## 2. 稼働中の v2 経路(normative — 現実装の記述)

本章は **2026-06 時点で本番稼働している** v2 経路を記述する。sender(外部 page / 拡張 / 検証器)は本章を実挙動の正とせよ。

### 2.1 Discriminate(v1 並列稼働)

受信 message は最初に `jsonrpc === '2.0'` field の有無で判別される(`isV2Envelope`)。**この field を持つ message は v1 検証を一切通らず**、本章の v2 経路で処理される。持たない message は v1 経路(v1 spec §4)へ。

### 2.2 Envelope(4 形態)

`validateEnvelopeV2` の form 判定規則(normative):

| form | 判定 | 例 |
|---|---|---|
| request | `method`(string)+ `id`(string \| number \| null) | `{jsonrpc:'2.0', method:'pkc.heartbeat', id:1, params?}` |
| notification | `method` のみ(`id` 無し) | `{jsonrpc:'2.0', method:'...', params?}` |
| response (success) | `result` + `id` | `{jsonrpc:'2.0', id:1, result}` |
| response (error) | `error` + `id` | `{jsonrpc:'2.0', id:1, error:{code,message,data?}}` |

- どの形にも当てはまらない envelope は **Invalid Request(-32600)** の error response(`id: null`)が返る。
- host が受信した response 形(success / error)は**無視される**(現状 host 発の v2 request が存在しないため)。
- notification には response を返さない(JSON-RPC 2.0 準拠)。`pkc.heartbeat` の notification 形も無視。

### 2.3 既知 method(現状 1 つ)

**`pkc.heartbeat`**(request):
- params: `{ seq?: number }`(省略可)
- result: `{ container_id: string, server_time: string(ISO 8601), pkc_version: string, seq?: number(echo) }`
- 未知 method の request には **Method not found(-32601)** error response。

### 2.4 Error codes

- JSON-RPC 2.0 標準: `-32700 Parse error` / `-32600 Invalid Request` / `-32601 Method not found` / `-32602 Invalid params` / `-32603 Internal error`
- PKC 固有 range: `-32000..-32099`。`-32099 sender_inactive` / `-32098 duplicate_id` は decision doc で**予約済み・未実装**(heartbeat 義務 / 複合 key correlation の導入時に有効化)。

### 2.5 Gate / 応答先(現実装の重要な性質)

1. **origin gate**: v2 経路も v1 と同じ origin allowlist 検査を行う(`'null'` は明示 opt-in 必須、allowlist 不一致は reject)。ただし**検査コードは v1 経路と重複実装**(bridge 内 2 箇所)。
2. **capability gate を通らない**: v1 経路の `canHandleMessage`(capability gate、v1 spec §5)と **handler registry を v2 は経由しない** — `pkc.heartbeat` は bridge 内で直接処理される。per-method gate / ACL の一貫性は設計課題(#795 C-1 補足、§5 の ACL 設計と合流予定)。
3. **応答の targetOrigin**: すべての v2 response は受信時 `event.origin` にピン留めされる(#795 A-1 / PR #797)。opaque origin(`"null"`)のみ `'*'` フォールバック。
4. **観測点**: invalid envelope は `onReject` に乗るほか、**全 v2 トラフィック(成功往復・notification・unsolicited response の drop を含む)が `onTraffic` seam で観測可能**(§6、#795 B-1 実装済み 2026-06-11)。

### 2.6 将来計画(未実装 — decision doc 確定事項)

以下は **wire 上まだ存在しない**。sender は実装を仮定してはならない:

- `initialize` handshake(capability 交換)+ host 発行 `source_id`(UUID v4、`(source_id, id)` 複合 key correlation、OQ-2)
- `$/heartbeat` notification の送信義務(`serverCapabilities.heartbeat { intervalMs: 15000, toleranceMs: 5000 }`、opt-out 無し、OQ-1)
- method 命名は dot-separated(`record.offer` 形)で拡充予定。

## 3. Host→Extension channel(normative)

**PKC-Extension** = `container.assets` 内の単一 HTML(`AttachmentBody.pkc_extension === true`)として配布され、host PKC2 が起動して双方向通信する拡張。v1 spec が扱った「外部 sender → host」と逆向きの **host 起動・host 主導 push** を本章で定義する。前例実装は graph 拡張(#790)の bespoke channel `pkc-graph-ext` v1(§3.7)。

> **改訂(2026-06-12、#806 host-push 体系を実装)**: `asset-access-and-consent-design-2026-06.md` rev.2 の確定モデルに基づき、**実装済みの host-push wire は §3.8 を正とする**。§3.2-3.6 の `initialize`/`source_id`/heartbeat 等の写像は将来計画で、現行実装は §3.8 の `pkc-ext` チャネル(`src/adapter/transport/extension-channel.ts`)。**拡張から実体を pull する経路は存在しない**(consent は host 側の send ジェスチャと紐付けで成立)。

### 3.1 実行モデル

- 拡張本体は **classic IIFE の単一 HTML** でなければならない(MUST)。`type="module"` script は `document.write` 注入で動作しない browser があるため不可。
- host は次のいずれかで起動する:
  - **window モード**(user gesture 起点): `window.open('')` + `document.write`
  - **iframe overlay モード**(boot autostart、popup ブロック回避): about:blank iframe の `contentWindow.document` へ write
- どちらも child は **host と同一オリジン**になる。これが §3.3 の origin / window-identity 検証の前提(MUST)。
- autostart の popup がブロックされた場合、host は**画面を乗っ取る fallback をしてはならない**(MUST NOT)。retry prompt 等の非侵襲 UI のみ許す。`?pkc-safe-mode=1` で autostart を必ず無効化できること(MUST)。

### 3.2 Handshake(bespoke v1 → v2 写像)

| bespoke `pkc-graph-ext` v1 | v2 正式形 | 方向 |
|---|---|---|
| `hello` | `initialize` request | child→host |
| `welcome {nonce, projection}` | `initialize` response `{ source_id, serverCapabilities, …初期 payload }` | host→child |
| `select {nonce, lid}` | `pkc.entry.select` notification | child→host |
| `projection {nonce, …}` | `ext.projection.update` notification | host→child |

- per-launch **nonce の役割は `source_id` が兼ねる**: host が launch ごとに発行し、child は以後の全 message に carry、host は不一致を破棄する(MUST)。
- `initialize` の受理条件は §3.3 の検証 2 点(window identity + origin)を**すべて**満たすこと(MUST)。

### 3.3 セキュリティ不変条件(MUST、v1 bespoke から弱めない)

1. **Window identity バインド**: host は `event.source === childWin / iframe.contentWindow` の時のみ受理する。
2. **Origin 検証**: `event.origin === location.origin` を要求する。`file://`(origin `"null"`)では `postMessage` の targetOrigin に `'*'` fallback を許すが、その場合も 1 と 3 で担保する。
3. **Per-launch secret**: `source_id`(launch ごとに host 発行)を全 message で検証する。
4. **データ最小化**: host→child に送るのは **projection(必要最小限のメタ)のみ**。entry `body` / `assets`(base64)/ `revisions` を送ってはならない(MUST NOT)。前例: `src/features/graph-extension/projection.ts` の `GraphProjection`。

### 3.4 Method catalog(host↔extension v0)

| 方向 | method | 形態 | 意味 / host 側写像 |
|---|---|---|---|
| child→host | `initialize` | request | handshake(§3.2) |
| child→host | `$/heartbeat` | notification | §3.5 |
| child→host | `pkc.entry.select` | notification | `SELECT_ENTRY` |
| child→host | `pkc.entry.open` | notification | `SELECT_ENTRY {revealInSidebar}` + host 前面化 |
| child→host | `pkc.entry.moveToFolder` | request | 検証済み move(cycle guard 含む)。result = 成否 |
| child→host | `pkc.relation.create` | request | 検証済み relate。result = 成否 |
| host→child | `ext.projection.update` | notification | container 変化時の push |
| host→child | `ext.selected.update` | notification | host 側選択の追従 |

- **書き込み系は必ず request**(成否を返す。host は全入力を検証し、無効入力は安全な no-op + error response とする。MUST)。読み push は notification。
- 将来枠(凍結中、catalog 名のみ予約): `pkc.ast.*`(IR を拡張に渡す機構、roadmap 10-5)。

### 3.5 Heartbeat の適用

同一オリジン拡張にも `$/heartbeat` を適用する(OQ-1 の opt-out 不許可に従う)。導入は v2 移行(host 設計 doc §6 段階 2 以降)と同時でよい。child window close を host が検知できない問題への解を兼ねる。

> 注: D2(host 設計 doc §9)は実装 go まで保留中。本節は OQ-1 decision をそのまま適用した場合の normative 案であり、実装着手時に D2 の確認を要する。

### 3.6 Trust / ACL との関係

container 内 asset 由来・同一オリジンの拡張は、外部 origin の sender(v1 spec の主対象)と信頼レベルが異なる。`Container.meta.extensionGrants`(OQ-4、v2.2)への接続 — 特に asset 由来拡張への `granted_by:'auto'` 暗黙 grant の可否(D4)— は実装 go まで保留。本版では §3.4 の catalog を超える method を host が拒否すること(MUST)のみ定める。

### 3.7 Legacy: bespoke `pkc-graph-ext` v1(**廃止済み 2026-06-12**)

- graph 拡張(#790)が使用していた bespoke channel(`hello` / `welcome` / `select` / `projection` + `PKC_GRAPH_V = 1`)。
- 互換性切り捨ての user 決定(2026-06-12)により **host 実装から削除済み**(both-accept 併存なし)。全 PKC-Extension 起動経路(launcher tile / autostart / 送付ジェスチャ)は §3.8 の `pkc-ext` チャネルに一本化。旧 channel しか話せない拡張 HTML は handshake しない(再ビルド要)。

### 3.8 host-push `pkc-ext` チャネル(normative、実装済み 2026-06-12)

実装 = `src/adapter/transport/extension-channel.ts`。envelope は `{ pkc: 'pkc-ext', v: 1, nonce, t, ... }`。

**信頼 3 tier**(`asset-access-and-consent-design-2026-06.md` rev.2):

| tier | opt-in | 受け取るもの |
|---|---|---|
| T0 起動 viewer(graph) | ユーザーが起動 | projection のみ |
| T1 紐付け受信 | ユーザーが紐付け導入 | projection + send された実体 |
| T2 io権(editor) | T1 + 書き戻し付与 | T1 + 検証付き `pkc:write` |

**wire**:

| t | 方向 | payload | 意味 |
|---|---|---|---|
| `hello` | child→host | — | handshake。host が established → projection を返す |
| `projection` | host→child | `ContainerProjection`(index/list/統計 + body 由来の **link 集計** `links.internal/external` + body から導出した **per-entry 派生メタ**: attachment は `mime`/`filename`/`asset_size`、todo は `todo:{status,date?,archived?}`(#830 R1、`description` は載せない)+ soft delete 済み復元候補 `restoreCandidates:{lid,title,archetype}[]`(#830 R4、body/snapshot は載せない)+ 孤児アセット `orphanAssets:{key,size}[]`(#830 R8、base64 本体は載せない、size は base64 長)。**body/assets/revisions を含まない**、MUST) | 既定露出。container 変化で再 push |
| `deliver` | host→child | `{ kind:'asset'|'entry', lid?, asset_key?, mime?, filename?, body?, data_base64?, correlation_id? }` | **ユーザーの send ジェスチャ**で実体 1 件。pull 経路は無い(MUST NOT)。handshake 前の send は host が buffer し、`hello` 後に projection → deliver の順で配送 |
| `selected` | host→child | `{ lid }` | host 側の選択変更(graph 等が focus を追従)。established 後のみ |
| `write` | child→host | `{ lid?, ops:[...], correlation_id? }` | T2 書き戻し。host が `validateWriteOps` で検証してから適用(G2、MUST) |
| `write-result` | host→child | `{ ok, correlation_id? }` | 書き戻しの成否 |
| `hint` | child→host | `{ kind, lid? }` | 軽量ヒント。host が処理するのは `open`(選択 + sidebar reveal + host 前面化)と `select`(選択のみ)。実体は流れない |
| `propose` | child→host | `{ offer:{ title, body, archetype?, ... }, correlation_id? }` | **新規 entry の作成提案**(#830 R5)。host は `offer` を検証して既存 `record:offer` 同意 banner に流す。**silent 作成は無い**(ユーザー accept で初めて mint)。`offer` は record:offer payload と同型 |
| `propose-result` | host→child | `{ accepted, assigned_lid?, correlation_id? }` | 作成の成否。accept なら `assigned_lid`、reject/dismiss なら `accepted:false`。検証 NG は即 `accepted:false` |
| `structure` | host→child | `{ text }` | 構成 export text(DSL 語彙説明つき、`exportStructureText` と同一。lid/title/archetype/階層のみ — body は載せない)。**ユーザーの送付ジェスチャでのみ**送る(自動 push しない、MUST NOT)。handshake 前の send は最新 1 件を buffer し `hello` 後に配送(改善バッチ⑤ 2026-07、`ai-structure-automation-design-2026-07.md`) |
| `structure-plan` | child→host | `{ text, correlation_id? }` | **整理プラン(構成コマンド DSL)の提案**。host は parse/plan 検証のうえ既存 structure-plan modal(dry-run プレビュー)に流す。**silent apply は無い**(適用は必ずユーザーが modal で確認、MUST)。text は文字列・64KB 以下(違反は即 `rejected`)。pending は同時 1 件(modal 表示中の後続は `rejected`)。readonly / view-only は即 `rejected` |
| `structure-plan-result` | host→child | `{ status:'applied'\|'rejected'\|'dismissed', applied?, errors?, correlation_id? }` | 提案の結末。`applied` は適用 op 数。`rejected` は検証 NG / readonly / pending 中(`errors` に理由)、`dismissed` はユーザーが適用せず閉じた |

**write op 語彙**(最小、検証必須): `update-body`(QUICK_UPDATE_ENTRY)/ `move`(検証済み folder 移動)/ `relate`(semantic relation)/ `set-todo-status`(#830 R2: todo の `status` のみ差し替え。host が archetype==='todo' を検証し、現 body を parse→swap→serialize で `description`/`date`/`archived` を保全。拡張は body を持たないため status 専用 op)/ `rename`(#830 R3: `{lid,title}` で title のみ差し替え。host が trim、非空を検証)/ `unfile`(#830 R7: `{lid}` で structural relation を除去し未整理(root)へ。`move` は folderLid が folder 必須で root を表現できないための専用 op)/ `delete`(#830 R4: `{lid}` で soft delete。PKC2 の delete は revision snapshot を残す物理削除で復元可能。**purge=hard delete は host-only で開放しない**)/ `restore`(#830 R4: `{lid}` で soft delete 済み entry を復元。host が最新 revision を解決して RESTORE_ENTRY に流す)/ `purge-orphan-assets`(#830 R8: 引数なし。どの entry からも参照されない孤児アセットを一括掃除。既存ユーザー向け PURGE_ORPHAN_ASSETS を再利用。参照中アセットは消えない。**per-key の hard delete は開放しない**)。1 件でも不正なら全体拒否(部分適用しない、MUST)。

**封じ込め 2 層**(#796、`pkc-extension-containment-design-2026-06.md` §2/§3 — 実装済み):

| | Tier S sandboxed(**既定**) | Tier T trusted(manifest 明示 opt-in) |
|---|---|---|
| load | popup shell(same-origin)内 `<iframe sandbox="allow-scripts" srcdoc>`。`allow-same-origin` は**決して付かない**(MUST NOT) | `window.open + document.write`(same-origin 全権) |
| 子の origin | opaque(`'null'`) | `location.origin` |
| gate | window identity + nonce(origin 検証は opaque で自滅するため捨てる) | identity + origin + nonce |
| 送信 targetOrigin | `'*'`(identity が宛先を一意化) | `location.origin` にピン留め(#797) |
| 子の送信先 | `window.parent`(= shell。host が shell に listener を張る) | `window.opener` |
| 永続化 | **不可**(opaque で localStorage / IDB は SecurityError)。Tier S 拡張は再起動で状態を失う。永続化はホスト経由 API(将来) | 可(全権ゆえ) |
| 同意 | 不要(構造的に封じ込め済み) | **起動毎に明示同意ダイアログ**(MUST、#796 PR-4): 全権で開く / サンドボックスで開く(Tier S 降格、capability 宣言は維持)/ キャンセル。永続 grant(OQ-4 `extensionGrants`)は v2.2 予約 |

manifest は `AttachmentBody.extension_manifest`(additive): `{ tier?: 'sandboxed'|'trusted', capabilities?: string[] }`。capability → トークン写像(#796 §4.2): `downloads`→`allow-downloads` / `popups`→`allow-popups` / `forms`→`allow-forms` / `clipboard-write`・`fullscreen`→iframe `allow` 属性。未知 capability は無視(forward 互換)。

**security gate**(§3.3 と同一 primitive、MUST): window identity(`event.source === childWin`)+ per-launch nonce(`hello` 以外必須)+ Tier T のみ origin 検証。

**consent**: 拡張は asset を pull できない。実体は (a) ユーザーの右クリック「拡張へ送る」/ 既定送り先(`extension-bindings`)、(b) 紐付け(導入)= standing opt-in、の 2 段で host が制御する。banner は出さない(send ジェスチャ自体が同意)。**ただし `propose`(新規 entry 作成、#830 R5)だけは例外** — 作成は既存 entry の編集と信頼の質が違うため、既存 `record:offer` の PendingOffer banner(ユーザー accept)を必ず経る。**Tier S sandboxed 拡張の offer 正本は `propose`**(v1 envelope `record:offer` は子の送信先=shell に届くが host main window の message-bridge には到達しないため、#830 R6)。

## 4. Versioning / v1 互換

- v1 envelope(7-fields 平坦)と v2(JSON-RPC 2.0)は**並列稼働**。受信側は `jsonrpc` field で discriminate する(実装済)。
- v2 内の変更は additive。breaking change は v3 bump。
- v1 の deprecation timeline は prior-art doc §7 の段階(v2.0 beta → v2.1 stable → v2.2 v1 deprecated → v3 retired)を踏襲するが、日付は確定しない。

## 5. 予約章(v2.1+、本版では定義しない)

| 機能 | phase | 根拠 decision |
|---|---|---|
| Tasks(memory-only、volatile 宣言) | v2.1 | OQ-3 |
| per-method ACL(`extensionGrants`、schema 2→3 migration) | v2.2 | OQ-4 |
| `record.offer.delta`(preview-only) | v2.2 | OQ-5 |
| Elicitation(reverse RPC)/ subscription registry | v2.x | prior-art doc |
| `record.live` / 永続 Tasks | v3+ | OQ-3/5 |

## 6. Observability(normative)

v1 spec §13 と共通の規約(receiver 実装 = `mountMessageBridge` の `onTraffic` seam、#795 B-1/C-3):

1. receiver は受信・送信・drop・reject の各イベントを実装定義の観測点に公開して**よい**(MAY)。本実装の seam は **v2 経路の成功往復を含む全判定**で発火する(§2.5 で「成功往復は観測不能」とした既知ギャップは本節の実装で解消)。
2. payload を観測点に含めるのは明示デバッグフラグ(`?pkc-debug=transport`)下のみ(MUST)。assets / base64 は redact(MUST)、bounded preview(SHOULD、本実装 256 字)。既定はメタデータのみ(MUST NOT — payload を流さない)。
3. 観測点はプロトコル挙動に影響してはならない(MUST NOT)。observer 例外は握り潰す。
4. sender は観測の有無を検知できない。

---

## 関連

- v1 spec: [`pkc-message-api-v1.md`](./pkc-message-api-v1.md)
- decision doc: [`../development/pkc-message-v2-open-questions-decisions-2026-05.md`](../development/pkc-message-v2-open-questions-decisions-2026-05.md)
- host 設計: [`../development/pkc-extensions-host-design-2026-06.md`](../development/pkc-extensions-host-design-2026-06.md)
- prior-art: [`../development/pkc-message-v2-prior-art-and-plan-2026-04-26.md`](../development/pkc-message-v2-prior-art-and-plan-2026-04-26.md)
