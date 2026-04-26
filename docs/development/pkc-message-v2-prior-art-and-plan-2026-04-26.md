# PKC-Message v2 — Prior art survey + spec outline

**Status**: Draft plan(2026-04-26)
**Audience**: PKC2 contributors / AI 協働 Extension implementer / 別 PRJ「PKCにAIを住まわせる会」implementer
**Scope**: docs-first audit、実装ゼロ。
**Trigger**: User 提案 — PKC-Message v1 wave クローズ後の「先行技術調査 → PKC が必要なものを v2 として固める」要請。v1 の deferred 群(§11、8 件)を整理して取り込む次世代プロトコルの planning。

> **Sister docs**:
>
> - `docs/spec/pkc-message-api-v1.md`(canonical v1、690 行)
> - `docs/spec/record-offer-capture-profile.md`(record:offer 詳細)
> - `docs/development/pkc-message-implementation-gap-audit-2026-04-26.md`(v1 implementation gap audit)
> - `docs/integration/message-bridge-setup.md`(v1 integration guide)

## 1. 目的 / 範囲 / 非目的

### 1.1 v1 の到達点と限界

PKC-Message v1(2026-04-26 着地、PR #154 / PR-A〜PR-D / PR-B' / PR-E1)は以下を提供する:

- 7 fields envelope(`protocol/version/type/source_id/target_id/payload/timestamp`)
- 9 message types(`ping / pong / record:offer / record:accept / record:reject / export:request / export:result / navigate / custom`)
- ping/pong-based capability negotiation(`PongProfile.capabilities = ['record:offer', 'export:request']`)
- 6 envelope-level RejectCode + handler-level rejection(logging-only)
- postMessage transport + `allowedOrigins`(static or provider function)
- record:offer + body header injection + size cap(256 KiB)
- record:reject sender-only + sourceWindow threading

**限界**: at-most-once / fire-and-forget が主、双方向は record:offer ↔ record:reject の 1 ペアのみ。応答は **無し**(spec §8.3)= sender は accept されたか reject されたかを直接観測できない。version negotiation も静的(`version: 1` literal)で sender capability advertise も implicit(spec §5.4)。

### 1.2 v2 の存在意義

別 PRJ「PKCにAIを住まわせる会」の AI Extension が PKC2 と integration を始めた今、v1 の **fire-and-forget モデルでは「AI が PKC に住んでいる」感覚を作れない**。AI 協働 use case は以下を要求する:

1. **bidirectional response**: AI Extension が record:offer を投げて結果(accept / reject / queued)を確認したい
2. **long-running operation**: AI summary 等の生成が時間かかる場合 task 化したい
3. **streaming partial result**: AI が文章を生成しながら preview を流したい
4. **subscription**: AI が container 変化を real-time で観測したい
5. **user input requesting**: AI Extension が user 確認を取る正規ルート
6. **per-method ACL**: 複数 Extension に対し method 単位で permission を管理

これらは v1 §11(deferred 8 件)の大半に対応する。v1 設計者が deferred 化した理由は「polling で先に必然性を検証」だが、AI Extension の出現でその検証段階が終わった。

### 1.3 範囲

本 audit doc は以下を fix する(実装は別 PR):

- prior art 12 件の survey 結果 + 6 軸抽出 + matrix
- v2 で borrow / 部分 borrow / 棄却の judgment(根拠付き)
- v2 candidate 機能群の detail(envelope refactor / initialize handshake / Tasks / Subscription / Elicitation / per-method ACL / error code)
- v2 spec の章立て outline 案
- v1 → v2 migration 戦略(breaking vs additive、並行運用方針)
- 着地段階(milestones)v2.0 / v2.1 / v2.2 / v3+
- Open questions(architecture 判断が必要、prior art だけでは決められない 5 件)

### 1.4 非目的

- v2 spec の本実装(本 doc は計画固定のみ、別 PR で着地)
- v2 src 実装(本 doc は wire spec の plan、code は別 PR)
- v1 の deprecation timeline 確定(v2.0 着地時に再検討)
- 別 PRJ Companion mockup の改造(mockup は v1 で動作中、v2 移行は別 wave)
- Card / Color / test-strategy 等の並走 wave への影響(本 doc は PKC-Message wave 内で完結)
- **wrapper library(Penpal / Comlink / Zoid 等)を PKC 本体に組み込むこと**(下記 §1.5 哲学に従い Extension 側で opt-in、PKC 本体は依存しない)

### 1.5 PKC simplicity philosophy(2026-04-26 確定、user input)

User 提案で明示された PKC2 の **設計哲学**。v2 spec を起こす際の最上位制約:

1. **PKC 本体は wire protocol primitives のみ実装する**
   - envelope shape / handshake / id correlation / error code / subscription registry 等は wire 上で発生する単純な動作
   - **Promise wrap / RPC wrap / Observable wrap 等の便利層 は実装しない**
   - これらの「使い勝手のよい sender SDK 層」は **Extension 側で opt-in** に書く

2. **PKC 本体は外部 library に依存しない**
   - 現行 v2.1.1 で唯一 runtime 依存しているのは `markdown-it`(spec 統合のため不可避)
   - v2 でも **postMessage 系の wrapper library(Penpal / Comlink / Zoid 等)を PKC bundle に取り込まない**
   - 単一 HTML 哲学(§5-layer + dist が 1 file) は v2 でも維持

3. **PKC-Extension は security boundary**
   - 同じ deployment(同 origin / 同 host)で動くが、PKC 本体と **意図的に責務分離**
   - Extension 側は外部 library を自由に使ってよい場所
   - PKC 本体は Extension が壊れても影響を受けない設計

4. **基本機能以外は opt-in**
   - core / idb / export / record:offer は default(`BUILD_FEATURES`)
   - subscription / Tasks / Elicitation 等の v2 新機能は **capability flag で gate**、sender が initialize で advertise しない限り host も発火しない
   - 「全部入り」ではなく「必要分だけ入る」設計

#### この哲学が v2 plan に与える影響

| 項目 | 哲学整合 | 備考 |
|---|---|---|
| (a) JSON-RPC 2.0 envelope | ✅ | wire format の置換のみ、library 依存なし |
| (b) initialize handshake | ✅ | wire pattern、PKC は capability flag を交換するだけ |
| (c) id-based correlation | ✅ | PKC は id で response を返すだけ、**Promise wrap は Extension 側の責任** |
| (d) Elicitation | ✅ | wire pattern、PKC は reverse request を送るだけ |
| (e) Tasks primitive | ✅ | PKC は task state 保持 + polling 応答、**non-blocking wrap は Extension 側** |
| (f) Subscription | ✅ | PKC は registry を持つだけ、**Observable / Promise wrap は Extension 側** |
| (g) Per-method ACL | ✅ | PKC 内部 enforcement、library 不要 |
| (h) MessagePort upgrade | ✅ | postMessage primitive の延長、library 不要 |
| (j) content block delta | ✅ | wire notification、PKC は受信して preview 表示するだけ |

**結論**: v2 plan の borrow 候補は **全て wire protocol design** に閉じており、library 依存を PKC 本体に持ち込まない。User 哲学と完全整合。Penpal / Comlink / Zoid 等の便利 wrapper は Extension 側の opt-in option として §5.8 で紹介する形を取る。

## 2. v1 の現状ベース

### 2.1 完成範囲(2026-04-26 時点)

| 項目 | 状態 | 主要 PR / file |
|---|---|---|
| envelope + 6 RejectCode | ✅ | `envelope.ts` / spec §4 |
| ping/pong + PongProfile | ✅ | `profile.ts` / spec §5 / §7.1 |
| capability gate(MESSAGE_RULES)| ✅ | `capability.ts` / spec §5.3 |
| capabilities advertise(message-type 名 colon-separated) | ✅(PR #162 PR-B')| `capability.ts:73-92` MESSAGE_CAPABILITIES |
| record:offer 受信 + body header injection | ✅ | `record-offer-handler.ts` + `app-state.ts:1190` |
| record:reject sender-only(sourceWindow threading)| ✅(PR #164 PR-C)| `record-offer-handler.ts` registry + `main.ts:438-457` |
| export:request / export:result(embedded-only)| ✅ | `export-handler.ts` |
| allowedOrigins provider function 形式 | ✅(PR #165 PR-B)| `message-bridge.ts:resolveAllowedOrigins` |
| integration guide | ✅(PR #166 PR-D)| `docs/integration/message-bridge-setup.md` |

### 2.2 §11 deferred 8 件(v2 で取り込む候補)

| ID | 項目 | v2 で扱う方針 |
|---|---|---|
| §11.1 | hook subscription | **v2.2** で id-stream subscription として実装(graphql-ws idiom) |
| §11.2 | inbound error response | **v2.0** で JSON-RPC response error として解決 |
| §11.3 | record:accept outbound sender | **v2.0** で JSON-RPC response success(=accept)として解決 |
| §11.4 | record:reject inbound handler | v2 でも **採用しない**(Option A 維持、sender-only by design)。または v2.2+ で reverse request として再検討 |
| §11.5 | formal provenance Relation | v2 scope 外、container schema 側の wave で別途 |
| §11.6 | correlation_id / idempotency / dedup | **v2.0** で JSON-RPC `id` field により解決 |
| §11.7 | per-source fine-grained ACL | **v2.2** で middleware-based per-method ACL として解決 |
| §11.8 | sender-side capability advertise | **v2.0** で `initialize` request の `clientCapabilities` で解決 |

8 件中 7 件が v2 で何らかの形で取り込まれる(§11.5 のみ別 wave)。

### 2.3 別 PRJ AI Extension integration の到達点と限界

**到達点**(mockup-driven audit §7 / PR #161 で確定):

- mockup は spec §5.2 通りで正、PongProfile.capabilities が `['record:offer', 'export:request']` で完全一致(PR #162)
- record:reject が sourceWindow に直送(PR #164、cross-window で機能)
- mockup 側修正不要

**限界**(AI Extension が AI 住まわせ project で本格稼働するときに見える):

- record:offer 投げっぱなしで accept / reject 結果が直接受け取れない(polling か別 export:request)
- 長時間の AI 生成中、user に進捗が見えない(progress notification 無し)
- AI が container 変化を観測する手段が無い(hook subscription 無し)
- AI が user 確認を取りたい場合、別 PRJ 側で UI を組む必要がある(elicitation 無し)
- 複数 AI Extension が同居するとき per-extension permission 管理が無い

これらが v2 の motivation。本 audit はこの限界を **docs-first** で計画化する。

## 3. 先行技術 survey サマリ

### 3.1 調査対象 12 件と要約

| # | Prior art | 要約(2-3 行) |
|---|---|---|
| 1 | **MCP**(Model Context Protocol、Anthropic、最新 2025-11-25)| AI モデル(client)と外部 tools/data(server)の標準。JSON-RPC 2.0 base、stdio + Streamable HTTP の 2 transport。`initialize` で client/server capabilities 双方向交換、Tasks primitive(call-now / fetch-later)、Elicitation(server → user 入力要求)、OAuth 2.1 + PKCE 必須(2025-11-25)。**PKC-Message の最も近い参考**。 |
| 2 | **LSP**(Language Server Protocol、Microsoft、3.17 / 3.18) | editor ↔ language server の双方向 RPC、JSON-RPC 2.0 + Content-Length header。`initialize` で 数百個の capability flag、dynamic registration で後付け登録、`$/cancelRequest` + `$/progress`(token-issued)。MCP / DAP の祖。 |
| 3 | **DAP**(Debug Adapter Protocol、Microsoft) | debugger との通信、LSP の兄弟。独自 envelope `{seq, type:request/response/event}`(JSON-RPC 2.0 ではない)。`initialize` → `initialized` event → configuration → `configurationDone` の明確 lifecycle、reverse request(`runInTerminal`)。 |
| 4 | **JSON-RPC 2.0**(2010 公開、不変) | stateless / light-weight RPC、transport 非依存。4 形式(request / notification / response success / response error)、id correlation、reserved error code -32700/-32600/-32601/-32602/-32603 + -32099〜-32000。MCP / LSP の base。 |
| 5 | **WebExtension messaging**(Chrome / Firefox) | extension の background ↔ content script ↔ popup ↔ web page。`sendMessage`(one-shot)/ `connect`(long-lived Port)/ `externally_connectable`(web → ext)。任意 JSON、formal envelope 無し、`MessageSender` で sender 自動識別、Port + onDisconnect で long-lived。 |
| 6 | **W3C postMessage**(WHATWG HTML LS) | PKC2 の現行 transport。`window.postMessage` + `MessageChannel`(2 ports dedicated channel)+ `BroadcastChannel`(同 origin 1-to-many)。Envelope は app 層で定義、targetOrigin / event.origin で security、CSP frame-src / sandbox / CSPEE で iframe 制御。 |
| 7 | **Server-Sent Events**(SSE / EventSource) | server → client uni-direction streaming over HTTP、`text/event-stream`。行プロトコル `event/data/id/retry`、auto-reconnect + `Last-Event-ID` で at-least-once-ish replay。MCP Streamable HTTP / tRPC httpSubscriptionLink / OpenAI が依拠。 |
| 8 | **WebSocket**(RFC 6455) | bidirectional streaming primitive、HTTP Upgrade 後 frame protocol。subprotocol negotiation で wire format pin。multiplexing は app 層。 |
| 9 | **GraphQL Subscriptions**(graphql-transport-ws) | WebSocket 上の subscription protocol。8 message types(`connection_init/ack`, `ping/pong`, `subscribe`, `next`, `error`, `complete`)、id を unique stream identifier として `subscribe → next* → complete\|error` lifecycle。 |
| 10 | **tRPC**(v11) | TypeScript-first end-to-end type-safe RPC。query/mutation/subscription、SSE or WebSocket transport。**context-based middleware**(`protectedProcedure` で per-method ACL)、input validator(Zod 等)で per-method schema。 |
| 11 | **Yjs / Automerge**(CRDT) | 分散環境で衝突無し state sync。binary message、commutative + idempotent、state-vector based sync、Awareness で ephemeral presence broadcast。 |
| 12 | **OpenAI Realtime / Assistants / Anthropic Messages** | AI agent との streaming 通信。typed event stream(`{event_id, type, ...}`)、Anthropic は `message_start → content_block_start → content_block_delta(text/input_json/thinking)→ content_block_stop → message_stop` の階層 SSE。fine-grained tool argument streaming で tool 引数 partial JSON が流れる。 |

### 3.2 6 軸 pattern matrix(横断比較)

13 列(12 prior art + PKC v1)× 6 軸の比較表。短記号で密度高めに。

| 軸 \\ Prior art | MCP 2025-11-25 | LSP 3.17 | DAP | JSON-RPC 2.0 | WebExt msg | postMessage | SSE | WebSocket | graphql-ws | tRPC v11 | Yjs/Automerge | OpenAI/Anthropic | **PKC v1** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Envelope** | JSON-RPC 2.0 厳格 | JSON-RPC 2.0 + Content-Length | 独自 seq + type | jsonrpc/method/id/params or result/error | 任意 JSON + auto MessageSender | 任意(structured clone) | 行プロトコル `event/data/id/retry` | binary frame(app envelope) | JSON `{type,id,payload}` | JSON、links + transformer | binary(varUint type + diff) | typed `{event_id,type,...}` | 7 fields 平坦 |
| **Addressing** | session 1:1, id multiplex, Mcp-Session-Id | client 1↔server 1, id multiplex | client 1↔adapter 1, seq multiplex | transport 任せ | extension ID + tab ID + frameId, externally_connectable | targetOrigin + event.origin、MessagePort で dedicated | endpoint URL | 1 conn 1 endpoint, app multiplex | id per subscription stream | HTTP path = procedure | actor/client ID per peer | session ID, ephemeral key | source_id/target_id 文字列、allowedOrigins |
| **Capability negotiation** | initialize で client/server capabilities + sub-flag(listChanged/subscribe), 日付 protocolVersion | initialize で巨大階層 + dynamic registration | initialize → Capabilities 静的 + initialized event | 仕様外 | 仕様外 | 仕様外 | 仕様外 | Sec-WebSocket-Protocol で subprotocol 1 つ | connection_init / ack で payload 自由 | 静的 schema, 型推論 | 仕様外 | session.update で動的 | ping/pong + capabilities `['record:offer','export:request']` |
| **Bidirectional pattern** | request-response + notification + server→client request + progress + Tasks(call-now/fetch-later)+ cancellation | request + notification + reverse request + $/progress(token)+ $/cancelRequest + partialResult | request + response + event + reverse request | request + notification + 双方向 | sendMessage + Port + onDisconnect | 片方向 push、MessagePort で対称化 | server-only push + Last-Event-ID replay | 完全双方向 frame、app 多重化 | id-based stream: subscribe → next* → complete\|error | query/mutation/subscription, SSE or WS | state-vector sync + Update + Awareness | event delta stream, fine-grained content block | 9 message types fire-and-forget |
| **Security model** | OAuth 2.1 + RFC 9728 + PKCE 必須, CIMD, audience claim | プロセス境界 trust | プロセス境界 trust | 仕様外 | externally_connectable allowlist + content script validate | targetOrigin + event.origin + HTTPS + CSP frame-src/sandbox/CSPEE | HTTPS + CORS + cookie | Origin header + wss + subprotocol pin | connection_init payload auth | context middleware + input validator | 仕様外 | ephemeral key + server-trusted tool + safety filter | allowedOrigins(static/function)+ event.origin |
| **Schema versioning** | 日付バージョン, MCP-Protocol-Version header pin, SEP, JSON Schema 2020-12 | SemVer + capability flag で gate | capability flag で gate | "2.0" 固定 | 仕様外 | 仕様外 | 仕様外 | subprotocol 名に version | subprotocol 名 graphql-transport-ws | 静的型 + procedure 名 | binary format バージョン | path version + additive | semver `1.x.y`, additive policy |

### 3.3 主要観察(収束した設計言語)

12 prior art + PKC v1 を横断して以下が見える:

1. **JSON-RPC 2.0 を base にした初期化 handshake で capability flag を交換し、それ以降は flag-gated に method/notification を運用する** — MCP / LSP / DAP / graphql-ws / tRPC が全てこの形に収束。**新規プロトコルを起こす v2 で独自 envelope を続ける合理性は薄い**。
2. **request の id を correlation_id として使い request-response / cancellation / progress を統一的に表現する** — graphql-ws の `id-stream` lifecycle、LSP の `$/progress` token、MCP の Tasks handle、いずれも id を分離キーとして使う。
3. **双方向は「一本の transport を request-response / push-notification / streaming-by-id 多重化」で扱う** — MCP / LSP / DAP / graphql-ws / tRPC のすべてが同パターン。**双方向用に複数 transport を用意する設計は流行っていない**。
4. **MCP 2025-11-25 の Tasks primitive(call-now / fetch-later)と Elicitation(server → user 入力要求)** は AI agent 文脈での long-running / human-in-the-loop を formal 化した最新解。PKC v2 が AI Extension を正面から扱うときの最有力モデル。
5. **OAuth 2.1 + PKCE / CRDT / WebRTC は postMessage 単体トランスポートと PKC2 の単一 HTML 制約とは噛み合わない** — 部分 borrow か棄却が妥当。

PKC v1 は **graphql-ws の `connection_init` を ping/pong に置き換えたもの** に最も近いが、id correlation も subscription lifecycle も持たないので **graphql-ws v0.5 相当の段階** とも言える。v2 で id correlation + initialize handshake + subscription lifecycle を入れれば一気に「現代的なプロトコル」として扱える土台になる。

## 4. PKC-Message v2 で borrow すべきもの

### 4.1 必ず borrow(v2.0 minimum)

#### (a) JSON-RPC 2.0 envelope への全面移行

**Origin**: MCP / LSP / DAP / JSON-RPC 2.0 / tRPC(全 5 件が JSON-RPC 系列に収束)

**Why**:
1. MCP / LSP / DAP / graphql-ws / tRPC が全て JSON-RPC 系に収束しており、prior art 全部の **SDK / mental model を流用できる**
2. `id` field で correlation_id(§11.6 deferred 解決)
3. reserved error code range(-32700/-32600/-32601/-32602/-32603 / -32099〜-32000)で v1 RejectCode を整理
4. request / notification の使い分けで「応答が要る / 要らない」を envelope 自身が表現(現 v1 は記述が無く、応答無しがデフォ)

**移行**:
- v1 `{protocol, version, type, source_id, target_id, payload, timestamp}`(7 fields)
- v2 `{jsonrpc:"2.0", id?, method, params?}` request / `{jsonrpc:"2.0", id, result|error}` response / `{jsonrpc:"2.0", method, params?}` notification(id 無し、応答返さない)
- `source_id` / `target_id` は postMessage で `MessageEvent.origin` / `event.source.window` から取れるので envelope から外して transport metadata に降格可能

**解決される v1 §11**: §11.6 correlation_id / idempotency / dedup(`id` field 自体が dedup key)

#### (b) initialize handshake で capability 双方向交換

**Origin**: MCP / LSP / DAP

**Why**: v1 の ping/pong は **host 単方向 advertise** に過ぎない。AI Extension(sender)が「何ができる」を host に伝える経路が無く、§11.8 sender-side capability advertise が deferred 化されていた。**MCP の `initialize` に置き換えれば双方向交換が解ける**。

**設計**:
- sender(client)が `initialize` request で `protocolVersion + clientCapabilities + clientInfo`(name, version)を送信
- host(server)が `protocolVersion + serverCapabilities + serverInfo + instructions` を返す
- capabilities は MCP-style sub-flag で個別機能を gate(例: `record.offer.subscribe`、`record.offer.delta`、`elicitation`)
- version negotiation: client 最新提示 → host 最新で response → 不一致なら disconnect(MCP idiom)

**解決される v1 §11**: §11.8 sender-side capability advertise(client capabilities で完全解決)

#### (c) id-based correlation で request-response + cancellation + progress 統一

**Origin**: MCP(Tasks + cancellation + progress)/ LSP($/cancelRequest + $/progress)/ graphql-ws(id-stream)

**Why**: v1 record:offer は応答無し(spec §8.3)= sender が accept / reject 結果を直接観測できない。**JSON-RPC `id` を correlation_id として使えば、host は `result` を返すだけで accept、`error` を返すだけで reject を表現できる**。これで §11.2 / §11.3 / §11.4 / §11.6 が一気に解決。

**設計**:
- record:offer に id を付ける → host は id 付き result(=accept、payload に lid)/ error(=reject、payload に reason)を返す
- LSP-style `$/cancelRequest` notification で長時間操作を中断
- LSP-style `$/progress`(token-issued)で進捗 push

**解決される v1 §11**: §11.2 inbound error response、§11.3 record:accept outbound、§11.4 record:reject inbound(の reverse、accept/reject を id でペアリング)、§11.6 correlation_id

#### (i) reserved error code range を採用

**Origin**: JSON-RPC 2.0

**Why**: v1 6 RejectCode(`NOT_OBJECT / WRONG_PROTOCOL / WRONG_VERSION / MISSING_TYPE / INVALID_TYPE / MISSING_TIMESTAMP`)を JSON-RPC 標準 code に mapping 可能。**handler-level error も同じ番号系で揃えられる**(§8.2 logging-only から脱却)。

**設計**:
- 標準範囲: `-32700/-32600/-32601/-32602/-32603` を JSON-RPC 標準準拠
- PKC 固有範囲: `-32000〜-32099` に置く(例: `-32001 origin_not_allowed`、`-32002 user_declined`、`-32003 type_unsupported`、`-32004 quota_exceeded`、`-32005 rate_limited`、`-32006 invalid_payload`)
- error response の `data` field に PKC 固有メタを入れる(reject reason 詳細)

**解決される v1 §11**: §11.2 inbound error response の error code 体系化

### 4.2 部分 borrow(v2.1 / v2.2 additive)

#### (d) MCP-style Elicitation

**Origin**: MCP 2025-11-25

**設計**: host(server)が sender(client)に「このフィールドが足りないので user に入力させて返して」と要求する reverse request。`elicitation/create` method、payload に required schema を含む、sender 側で UI を表示し user 入力を返す。AI Extension が PKC を介して user 確認を取る正規ルート。

**Adapt 点**: postMessage では sender = iframe の場合、user input UI は **host(PKC2)の DOM**に出すべきか **iframe(sender)側 DOM**に出すべきか判断分岐。MCP は client 側で出す前提だが、PKC2 では host が container UI を持っているので、host 側で user input を取って結果を sender に返す方が自然な場合もある。**v2.1 で host-side elicitation を default**、URL Mode 相当の sender-side fallback を opt-in にする方針が無難。

#### (e) MCP-style Tasks primitive で長時間操作を deferred-result 化

**Origin**: MCP 2025-11-25(SEP-1686)

**設計**: 任意の request が `_meta.task: true` で task handle を返し、`tasks/get`、`tasks/result`、`tasks/list`、`tasks/cancel` でポーリング、状態は `working / input_required / completed / failed / cancelled`。

**Adapt 点**: PKC2 で record:offer を task 化したとき、task handle の永続性が問題(§9 Open question 3)。Container に task entry を作って永続化(record:offer 自体を Container 内 entry 化)するのが PKC philosophy 整合的だが、task archetype 新設要。**v2.1 では memory-only task** から始め、永続化は v3+ で再評価。

#### (f) graphql-ws style id-stream で hook subscription

**Origin**: graphql-ws / GraphQL Subscriptions

**設計**: `subscribe` 相当の method(例: `pkc.subscribe`)で sender が「container.events に id=X で購読開始」を要求、host は `next` notification を id=X で 0 回以上 push、`complete` か `error` で終端。MCP の `notifications/resources/updated` + `subscribe` も同等。

**Adapt 点**: postMessage には connection 概念が無いので、**iframe unload / sender absent 検知**を host 側で打つ workaround が必要(§9 Open question 1)。**v2.2 で heartbeat 必須化**(sender が定期 ping、N 秒タイムアウトで host が subscription 解約)が現実解。

**解決される v1 §11**: §11.1 hook subscription(既存 acceptance / poc / decision の 4 doc を活用)

#### (g) tRPC-style middleware で per-method ACL

**Origin**: tRPC v11

**設計**: method 単位で ACL middleware を chain — `record:offer` は origin allowlist + per-extension scope check、`export:request` は origin allowlist + user consent check、というふうに method ごとに ACL を分けられる。tRPC の `protectedProcedure` idiom をそのまま採用可能。

**Adapt 点**: tRPC の context は HTTP req 由来、PKC では `event.origin + sender_id` から context を作る必要あり。**v2.2 で host 側 dispatch 層に middleware chain を追加**、wire spec には現れない(host 内部実装で完結)。

**解決される v1 §11**: §11.7 per-source fine-grained ACL

#### (h) MessagePort upgrade を opt-in で提供

**Origin**: postMessage / MessageChannel

**設計**: 初回 `initialize` 時に sender が `wantsDedicatedChannel: true` を提示すれば host が `MessageChannel.port2` を transfer して以降はその port で完全双方向 — origin spoofing リスクが消え、addressing も transport に閉じる。

**Adapt 点**: AI Extension の hot path で latency / security に効くが、複数 sender で iframe ごとに port 管理が必要。default は現行 `window.postMessage` で OK、opt-in upgrade。**v3+ optional**(必要性が AI Extension で実証されたら検討)。

#### (j) Anthropic-style content block delta

**Origin**: OpenAI Realtime / Anthropic Messages SSE

**設計**: AI Extension が長文を生成しながら entry に書き込む use case では、`record:offer.delta` notification(method: `pkc.record.offer.delta`、params: `{id, content_block_delta}`)で partial body を流し、最後に `record:offer.done` で完成。host 側は preview を progressive 表示。

**Adapt 点**: 既存 record:offer の atomic 性を破らないよう、delta 経路は **別 method として並走**。下位互換確保。**v2.2 additive**。詳細は §9 Open question 5 で(atomic 性 vs live update の選好分岐)。

### 4.3 棄却(scope 外 / philosophy 不一致)

| 項目 | 棄却理由 |
|---|---|
| **OAuth 2.1 / RFC 9728 / PKCE / CIMD**(MCP) | postMessage 単独 transport では `allowedOrigins` で代替十分、PKC2 は cloud server を持たないので OAuth は scope 外。将来 cloud sync 導入時に再検討。 |
| **WebSocket / SSE / WebRTC transport** | PKC2 は単一 HTML / network 接続不要 / iframe-friendly が哲学。transport は **postMessage / MessagePort 限定**を維持。SSE の Last-Event-ID idiom は使うが SSE 自体は使わない。 |
| **JSON-RPC 2.0 batch** | MCP 自身が 2025-06-18 で廃止、複雑性に見合わない。v2 では single message のみ。 |
| **LSP-style dynamic registration** | static capability で十分(PKC2 の Extension 数は 1 桁想定、LSP のような数百 capability は無い)。後付けが必要なら `initialize` 再実行で済ます。 |
| **CRDT 全面採用**(Yjs / Automerge) | Container は revision-based で十分、CRDT は op log のセマンティクスが違いすぎる。**idempotency キーとしての client UUID** だけ borrow して dedup を実装。 |
| **Awareness presence broadcast**(Yjs) | AI Extension の「カーソル / 思考中」表示は面白いが v2 scope 外、v3+ で検討。 |
| **TypeScript 型推論 end-to-end**(tRPC) | PKC2 は client/server が同じ HTML 内で型共有してるので不要。superjson も `body: string` JSON で済む PKC では不要。 |
| **Wrapper libraries inside PKC core**(Penpal / Comlink / Zoid 等) | **§1.5 哲学に従い PKC 本体に組み込まない**。PKC 本体は wire protocol primitives のみ提供、Promise/RPC/Observable 系の便利 wrap は Extension 側で opt-in に使う。詳細は §5.8 で Extension 実装者向け option として紹介。 |

## 5. v2 candidate 機能群(detail)

### 5.1 envelope refactor(JSON-RPC 2.0 移行)

```jsonc
// v2 request(id 付き、応答が要る)
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "method": "record.offer",
  "params": { "title": "...", "body": "...", "source_url": "..." }
}

// v2 response success(accept、host が新 entry の lid を返す)
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "result": { "lid": "abc123-0001", "accepted_at": "2026-..." }
}

// v2 response error(reject)
{
  "jsonrpc": "2.0",
  "id": "req-uuid-001",
  "error": { "code": -32002, "message": "user_declined", "data": { "reason": "dismissed" } }
}

// v2 notification(id 無し、応答返さない)
{
  "jsonrpc": "2.0",
  "method": "pkc.record.offer.delta",
  "params": { "id": "req-uuid-001", "content_block_delta": "..." }
}
```

**v1 → v2 mapping**:

| v1 field | v2 location |
|---|---|
| `protocol: 'pkc-message'` | wire 上は `jsonrpc: "2.0"` で代替、識別は MessageEvent + `Mcp-like protocolVersion`(initialize で交換) |
| `version: 1` | `initialize` の `protocolVersion`(日付ベース推奨、例 `'2026-12-01'`) |
| `type` | `method` field(例: `record.offer` / `export.request` / `pkc.subscribe`) |
| `source_id` | transport metadata(MessageEvent.origin / source.window から取得)、envelope から外す |
| `target_id` | 同上、broadcast は引き続き null 相当を transport で扱う |
| `payload` | `params`(request)/ `result` or `error.data`(response) |
| `timestamp` | optional metadata、JSON-RPC は不要 field なので外す or `params._meta.timestamp` に降格 |

**batch は採用しない**(MCP 自身が 2025-06-18 で廃止、複雑性 vs 利益が見合わない)。

### 5.2 initialize handshake(capability 双方向)

```jsonc
// sender → host
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "method": "initialize",
  "params": {
    "protocolVersion": "2026-12-01",
    "clientInfo": { "name": "ai-collab-companion", "version": "0.1.0" },
    "clientCapabilities": {
      "elicitation": {},                  // accept host elicitation
      "record.offer.delta": { "supported": true },
      "subscriptions": { "list": ["relation.created", "relation.updated", "relation.deleted"] }
    }
  }
}

// host → sender
{
  "jsonrpc": "2.0",
  "id": "init-1",
  "result": {
    "protocolVersion": "2026-12-01",
    "serverInfo": { "name": "pkc2", "version": "2.2.0" },
    "serverCapabilities": {
      "record.offer": { "subscribe": false, "delta": true, "task": true },
      "export.request": { "embeddedOnly": true },
      "subscriptions": { "supported": ["relation.created", "relation.updated", "relation.deleted"] },
      "elicitation": { "supported": true, "modes": ["host-side"] }
    },
    "instructions": "PKC-Message v2.x ..."
  }
}
```

- **protocolVersion 日付化**: MCP 同様(`'YYYY-MM-DD'`)、breaking change で bump、v1 の semver 互換は捨てる
- **sub-flag**: 各機能を boolean / object で gate、新機能は **新 sub-flag を additive 追加**で互換維持
- **disconnect on mismatch**: client 最新 → host 最新で response → 不一致なら client が disconnect(MCP idiom)

### 5.3 record:offer の v2 化(Tasks + delta + correlation)

#### request(同期 accept、id 付き)

```jsonc
{
  "jsonrpc": "2.0", "id": "offer-1",
  "method": "record.offer",
  "params": { "title": "...", "body": "...", "source_url": "...", "captured_at": "..." }
}
```

response: 即時 accept なら success(`result.lid`)、reject なら error(`code: -32002, message: 'user_declined'` 等)。**ここで §11.2 / §11.3 / §11.4 / §11.6 が一度に解決**。

#### request(task 化、長時間 / 非同期 accept)

```jsonc
// sender
{
  "jsonrpc": "2.0", "id": "offer-2",
  "method": "record.offer",
  "params": { "title": "...", "body": "...", "_meta": { "task": true } }
}

// host(即返却、user dialog 表示中)
{
  "jsonrpc": "2.0", "id": "offer-2",
  "result": { "_meta": { "taskHandle": "task-uuid-002", "state": "working" } }
}

// sender が後で polling
{ "jsonrpc": "2.0", "id": "task-1", "method": "tasks/get", "params": { "taskHandle": "task-uuid-002" } }
// host
{ "jsonrpc": "2.0", "id": "task-1", "result": { "state": "completed", "lid": "abc123-0001" } }
```

#### notification(content block delta、AI 系)

```jsonc
{
  "jsonrpc": "2.0",
  "method": "pkc.record.offer.delta",
  "params": { "id": "offer-1", "content_block_delta": { "text": "次の段落..." } }
}
```

**Adapt 点**: delta は record:offer の **preview update** として扱い、最終 body は `record.offer` request の `params.body` で確定する(host が delta を accumulate してプレビュー表示するが、accept 時は params.body を使う)。詳細は §9 Open question 5 で議論。

### 5.4 Subscription / hook subscription

#### subscribe / next / complete lifecycle

```jsonc
// sender → host
{ "jsonrpc": "2.0", "id": "sub-1", "method": "pkc.subscribe",
  "params": { "events": ["relation.created", "relation.updated"], "filter": { /* optional */ } } }

// host → sender(success → stream 開始)
{ "jsonrpc": "2.0", "id": "sub-1", "result": { "subscriptionId": "sub-uuid-001", "snapshot": null } }

// host → sender(notifications、id-stream)
{ "jsonrpc": "2.0", "method": "pkc.subscription.next",
  "params": { "subscriptionId": "sub-uuid-001", "event": { "type": "relation.created", "relation": { /* projection */ } } } }

// 解約: sender → host
{ "jsonrpc": "2.0", "method": "pkc.subscription.unsubscribe",
  "params": { "subscriptionId": "sub-uuid-001" } }
```

#### postMessage / connection 問題への対処

postMessage には physical connection 概念が無い。subscription を host 側で「sender 死活」を検知する仕組みが必要:

- **heartbeat 必須**: sender が `pkc.subscription.heartbeat` notification を例えば 30 秒ごとに打つ、host が 90 秒 timeout で subscription 解約
- 既存 acceptance contract(`pkc-message-hook-subscription-acceptance.md`)の memory-only / TTL 必須 / projection 必須 / relation 系のみ の v1 minimum scope を v2 でも維持
- **詳細は §9 Open question 1**

### 5.5 Elicitation

```jsonc
// host → sender(reverse request、user 入力要求)
{ "jsonrpc": "2.0", "id": "eli-1", "method": "elicitation/create",
  "params": {
    "schema": { "type": "object", "properties": { "title": { "type": "string" } } },
    "context": "AI summary needs a title"
  } }

// sender(または host-side UI で user 入力を取って return)
{ "jsonrpc": "2.0", "id": "eli-1", "result": { "title": "Daily summary 2026-04-26" } }
```

**Adapt**: PKC2 は host(top-level)が container UI を持っているので、**host-side UI で user 入力を取って sender に返す**のが自然な default。sender-side UI(URL Mode 相当)は opt-in。

### 5.6 Per-method ACL

```ts
// host 側 internal (wire spec には現れない)
const acl = createMethodAclChain({
  'record.offer': [originAllowlist(['extension://abc']), userConsentGate('record.offer')],
  'export.request': [originAllowlist(['extension://abc']), embeddedGate(), userConsentGate('export')],
  'pkc.subscribe': [originAllowlist(['extension://abc']), perScopeGate()],
});
```

3 軸:
1. **origin**: `event.origin` を per-method allowlist で gate(v1 の global allowlist より細粒度)
2. **user consent**: `Container.meta.extensionGrants` に user-managed permission を保存、初回利用時に dialog で承認(§9 Open question 4)
3. **scope**(subscription): 「relation.created のみ」「特定 entry のみ」など

middleware chain は host 内部実装で完結、wire spec には影響しない(spec で「ACL は host responsibility」と記述)。

### 5.7 Error code 整理

| Code | Message | 由来 |
|---|---|---|
| -32700 | parse_error | JSON-RPC 標準 |
| -32600 | invalid_request | JSON-RPC 標準(envelope shape NG) |
| -32601 | method_not_found | JSON-RPC 標準(method 未登録) |
| -32602 | invalid_params | JSON-RPC 標準(params shape NG) |
| -32603 | internal_error | JSON-RPC 標準 |
| -32001 | origin_not_allowed | PKC 固有(allowlist 違反) |
| -32002 | user_declined | PKC 固有(record.offer dismiss) |
| -32003 | type_unsupported | PKC 固有(method 未実装) |
| -32004 | quota_exceeded | PKC 固有(body size cap 等) |
| -32005 | rate_limited | PKC 固有(将来用) |
| -32006 | invalid_payload | PKC 固有(handler-level validation NG) |
| -32007 | not_embedded | PKC 固有(embedded-only method を standalone で呼んだ) |
| -32008 | subscription_unknown | PKC 固有(subscription_id 不在) |
| -32009 | task_unknown | PKC 固有(task handle 不在) |

**v1 6 RejectCode の mapping**:

| v1 | v2 |
|---|---|
| NOT_OBJECT | -32600 invalid_request |
| WRONG_PROTOCOL | -32600 invalid_request |
| WRONG_VERSION | -32600 invalid_request(`data.protocolVersionMismatch: true`)|
| MISSING_TYPE | -32600 invalid_request(`data.missingField: 'method'`)|
| INVALID_TYPE | -32601 method_not_found |
| MISSING_TIMESTAMP | v2 では timestamp 不要 fields のため概念が消える |

### 5.8 Extension-side library options(§1.5 哲学に基づく recommendation)

PKC 本体には wrapper library を入れないが、**Extension 実装者が Promise / RPC スタイルで書きたい** 場合の選択肢を以下に紹介する(別 PRJ の Gemini 調査結果も反映、2026-04-26 user input):

| Library | 特徴 | 用途 | PKC v2 との相性 |
|---|---|---|---|
| **[Penpal](https://github.com/Aaronius/penpal)** | iframe ↔ parent の Promise-based RPC、最も popular。`Penpal.connectToChild({ iframe })` で connection 作成、await で別 window の関数呼び出し。 | 親ページ ↔ iframe の双方向 | ⭐ **推奨**(JSON-RPC 2.0 wire の上に薄く乗せやすい、双方向 capability が PKC v2 と整合) |
| **[Comlink](https://github.com/GoogleChromeLabs/comlink)** | Google Chrome team 製、本来 Web Worker 用だが Window 間でも使える。RPC スタイル、proxy で別 window のオブジェクトを直接操作している感覚。 | Web Worker / Window 間の重い処理移譲 | △ 高機能だが PKC v2 の wire shape(JSON-RPC 2.0)と auto-mapping するには glue が要る |
| **[Zoid](https://github.com/krakenjs/zoid)**(PayPal) | クロスドメイン UI コンポーネントを React component のように埋め込めるようにする。 | 自社サービスをサードパーティ向け provider として提供する場合 | △ サードパーティ UI 提供寄り、PKC integration には heavy |

**推奨パターン**:

1. **PKC 本体は v2 wire spec(JSON-RPC 2.0)を実装するだけ**(本 doc の §4-§6 通り)
2. **Extension 実装者は Penpal を使って Promise wrap を Extension 側に書く**:

```ts
// Extension 側(opt-in)
import { connectToParent } from 'penpal';

const connection = connectToParent({
  parentOrigin: 'https://pkc.example.com',
  methods: {
    // PKC からの reverse request(elicitation 等)を受ける
    async elicitInput(schema: object): Promise<unknown> { ... },
  },
});

const pkc = await connection.promise;
// PKC 側 method を Promise で呼ぶ
const offer = await pkc.recordOffer({ title: '...', body: '...' });
//   ↑ wire 上は JSON-RPC `record.offer` request、Penpal が id correlation を hide
```

3. **PKC 側は Penpal に依存しない**(Penpal が出す JSON-RPC envelope を直接 receive、id で response 返すだけ)

**Adapt 注**: Penpal v6 以降は実は内部 envelope が独自で完全 JSON-RPC 2.0 互換ではない可能性あり、別 PRJ implementer が採用する場合は **wire format を実機で確認** + adapter shim を書く必要があるかも。具体的な adapter pattern は v2.0 minimum 着地後の Extension 側 example doc で示す候補。

**棄却された alternative**:

- **PKC 本体に Penpal / Comlink / Zoid を bundle する案** → §1.5 哲学に反する(外部 library 依存禁止、単一 HTML 哲学を破る)
- **PKC 本体に独自 Promise wrap helper を書く案** → §1.5 哲学に反する(便利層は Extension 責務)

## 6. v2 spec outline(章立て案)

v1 spec(13 章)からの増分を明示。**v2 spec doc が起こされるときの章立て**として参考にする:

```
docs/spec/pkc-message-api-v2.md(v2 着地時に新規作成)
├ §1 Purpose(v2 の存在意義 + v1 から何が変わるか)
├ §2 Scope(in / out)
├ §3 Transport(postMessage 維持、MessagePort upgrade は §10)
├ §4 Envelope(JSON-RPC 2.0 厳格、id 必須 / nullable)
│   §4.1 Request shape
│   §4.2 Response shape(success / error)
│   §4.3 Notification shape
│   §4.4 Reserved error codes(-32700 / -32099 範囲)
│   §4.5 batch は採用しない理由
├ §5 Initialize handshake
│   §5.1 protocolVersion(日付ベース、bump rule)
│   §5.2 clientCapabilities / serverCapabilities sub-flag
│   §5.3 Disconnect on mismatch
│   §5.4 Re-initialize(後付け capability の代替)
├ §6 Storage access boundary(v1 §6 を継承)
├ §7 Methods catalog
│   §7.1 protocol primitives(ping replaced by initialize)
│   §7.2 record.offer(+ task / delta variants)
│   §7.3 record.accept(廃止 — response success が代替)
│   §7.4 record.reject(廃止 — response error が代替)
│   §7.5 export.request / export.result
│   §7.6 navigate
│   §7.7 custom
│   §7.8 elicitation/create(host → sender reverse)
│   §7.9 tasks/get / tasks/result / tasks/cancel
│   §7.10 pkc.subscribe / pkc.subscription.next / pkc.subscription.unsubscribe / pkc.subscription.heartbeat
│   §7.11 $/cancelRequest / $/progress(LSP-style)
├ §8 Error vocabulary
│   §8.1 Reserved code range mapping
│   §8.2 PKC 固有 -32000〜-32099 割当
│   §8.3 error.data shape
├ §9 Versioning policy
│   §9.1 protocolVersion bump rule(日付ベース)
│   §9.2 v2 内 additive rule(sub-flag 追加 OK)
│   §9.3 v3 bump trigger
│   §9.4 v1 並行運用方針(§7 で詳述)
├ §10 MessagePort upgrade(opt-in)
├ §11 Compatibility commitments(v2 内保証)
├ §12 Deferred / Reserved(v3+)
├ §13 Migration from v1(detail は別 doc)
└ §14 References
```

## 7. v1 → v2 migration 戦略

### 7.1 wire format 変更を伴うため breaking、ただし並行運用可能

v2 は **JSON-RPC 2.0 envelope** に切替えるため v1 の `{protocol: 'pkc-message', version: 1, ...}` 形式とは互換性が無い(breaking change)。が、host 側で **両 envelope を受信判別**することは可能:

```ts
// host 側 message-bridge 拡張案
function detectVersion(data: unknown): 'v1' | 'v2' | 'unknown' {
  if (typeof data !== 'object' || data === null) return 'unknown';
  // v1: {protocol: 'pkc-message', version: 1, ...}
  if ((data as any).protocol === 'pkc-message' && (data as any).version === 1) return 'v1';
  // v2: {jsonrpc: '2.0', ...}
  if ((data as any).jsonrpc === '2.0') return 'v2';
  return 'unknown';
}
```

→ host は v1 / v2 両方を 1 つの bridge で捌ける。**1 世代の並行運用**(v2.0 → v2.x 期間)で v1 sender の deprecation を促す。

### 7.2 capability flag による gating

v2 内の新機能(Tasks / Subscription / delta 等)は **`serverCapabilities` の sub-flag で gate**、sender 側で flag を見て送れる method を判定する。**v2 spec 内では additive rule**(sub-flag 追加は breaking ではない、既存 spec の互換維持)。

### 7.3 Deprecation timeline(目安)

| timeline | v1 status | v2 status |
|---|---|---|
| v2.0 着地時 | active(default) | beta(opt-in、`?api=v2` 等で) |
| v2.1 着地時 | active(default) | stable(both default) |
| v2.2 着地時 | deprecated(warning log) | active(default) |
| v3 着地時 | retired | deprecated |
| v3.1+ | (削除) | active |

具体的な日数は別 PR で確定。**user 利用統計 / 別 PRJ implementer の v2 移行進捗** を見て調整。

### 7.4 別 PRJ Companion mockup の v2 移行

mockup は v1 で動作中、v2 移行は **別 wave**。本 doc は PKC2 側の v2 spec plan のみに focus し、mockup の v2 対応は v2 spec 着地後に別 PR で議論。**mockup 側 implementer は本 doc の outline を参考に v2 client SDK を作れる**。

## 8. 着地段階(milestones)

### Milestone v2.0 minimum(必須着地、~4-5 PR)

**含む**:
- (a) JSON-RPC 2.0 envelope 移行(spec + 実装)
- (b) initialize handshake(ping/pong から置換、両並行運用)
- (c) id-based correlation(record.offer の result/error を受け取れる)
- (i) reserved error code range(JSON-RPC + PKC 固有 -32001〜-32009)

**規模**: ~600-800 行 src + ~400-500 行 tests + ~600-800 行 docs(spec v2 + migration guide)

**リスク**: wire format 変更で sender 全部に影響。並行運用設計を spec に明記する必要あり。

**解決される v1 §11**: §11.2 / §11.3 / §11.4(reverse)/ §11.6 / §11.8

### Milestone v2.1 additive(AI 協働 long-running、~3-4 PR)

**含む**:
- (d) Elicitation(host-side UI default、sender-side opt-in)
- (e) Tasks primitive(record.offer task 化 opt-in、tasks/get / tasks/cancel)

**規模**: ~300-400 行 src + ~200-300 行 tests + ~200-300 行 docs

**リスク**: Tasks 永続性の判断(§9 Open question 3)、Elicitation の UI ownership(§9 Open question 5 と関連)

### Milestone v2.2 additive(streaming + ACL、~3-4 PR)

**含む**:
- (f) Subscription(pkc.subscribe lifecycle + heartbeat)
- (g) Per-method ACL(middleware chain)
- (j) content block delta

**規模**: ~400-500 行 src + ~300-400 行 tests + ~300-400 行 docs

**リスク**: postMessage の connection 不在問題(§9 Open question 1)、heartbeat 設計の妥当性、Container.meta.extensionGrants schema(§9 Open question 4)

**解決される v1 §11**: §11.1 / §11.7

### Milestone v3+ optional

**含む**:
- (h) MessagePort upgrade(opt-in、必要性が AI Extension で実証されたら)
- CRDT idempotency(client UUID 経由の dedup)
- Awareness presence
- 別 PRJ AI 住まわせ project の運用知見からの拡張

## 9. Open questions

prior art だけでは決められない、**PKC2 architecture 判断が必要**な項目。v2 spec 起こす時の決定点。

### 9.1 postMessage に connection 概念が無いことの扱い

**問題**: graphql-ws / WebSocket は physical connection close で subscription cleanup が来るが、postMessage は iframe が unload されても host 側に通知が来ない(`pagehide` イベントは iframe 内のスクリプトしか受けられない)。

**選択肢**:
- (a) **dead-man's-switch**: sender が定期 heartbeat、host が N 秒 timeout で subscription 解約
- (b) **GC-on-detach**: source.window が detached になったら定期スキャンで GC(unreliable)
- (c) **polling-only**: subscription は採用せず、sender が定期的に状態を pull する設計

**推奨**: (a) heartbeat 必須化。MCP Tasks も polling 設計なので、PKC v2 でも polling 寄りで良い。subscription の lifetime は明示限定(TTL ≤ 24h、v1 acceptance contract 通り)。

### 9.2 id 衝突防止の発行責任

**問題**: JSON-RPC では client が id を発行。複数 sender(複数 iframe)が同時に request を投げる場合、host から見ると **異なる sender が同じ id を使う可能性**。

**選択肢**:
- (a) `(source_id, id)` の複合 key で host が dedupe(host 実装は安全、spec が複雑)
- (b) sender 側で UUID 強制(spec が単純、sender が誤実装すると衝突)

**推奨**: (a) 複合 key + (b) UUID 推奨を spec に併記。host 実装は防御的に複合 key、spec は sender に「UUID v4 を使ってください」と推奨。

### 9.3 Tasks primitive の永続性

**問題**: MCP の Tasks は session 内でのみ valid(session 終了で task も消える)。PKC2 で record:offer を task 化したとき、user が iframe を閉じた後で完了したら結果はどう保持するか。

**選択肢**:
- (a) memory-only(session 終了で task 消滅、結果は失われる)
- (b) Container 内 entry 化(`task` archetype 新設、永続化、user が後から見られる)
- (c) state.tasks(AppState 拡張、session reload で消える)

**推奨**: v2.1 で (a) memory-only、v3+ で (b) Container 内 entry 化を再評価。`task` archetype 新設は schema 変更を伴うので慎重に。

### 9.4 per-method ACL の表現場所

**問題**: v1 は host 側 handler 内で sender_id を見て if 文で済ませる運用。v2 で formal 化するときに表現場所をどこに置くか。

**選択肢**:
- (i) `initialize` で host 側 capabilities に scope をくっつける(spec wire 上に)
- (ii) `Container.meta.extensionGrants` に user-managed permission を保存(永続化)
- (iii) 起動時に user が consent dialog で都度承認(永続化なし)

**推奨**: v2.2 で (ii) `Container.meta.extensionGrants` を default、(iii) 初回利用時 dialog で consent → meta に保存、(i) は内部実装で(wire spec には現れない)。Browser Extension の permission UI と同様の UX。

### 9.5 AI Extension の content block delta が record:offer の atomic 性とどう両立するか

**問題**: v1 record:offer は host が user dialog で確認 → accept で 1 entry 作成、という atomic flow。AI が delta で書き続けるとき:
- (a) delta は preview のみで accept 時に最終 body を取る(現行 v1 と最も親和)
- (b) accept 後に entry が live で更新される(append-style、AI as live collaborator 像)
- (c) delta 終了後にしか accept dialog を出さない(user 体験が遅延)

**推奨**: (a) を default。(b) は AI agent の "live writing" を実現するが、v1 の accept-then-mint contract と相性が悪い。(c) は user が AI 出力完了まで待たされる。**v2.2 では (a) のみ実装**、(b) は別 method(例: `record.live`)として v3+ で再評価。

## 10. References

### 10.1 Prior art 公式 spec / docs

#### MCP(Model Context Protocol)
- [MCP specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Tasks utility](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)
- [MCP changelog](https://modelcontextprotocol.io/specification/2025-11-25/changelog)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [WorkOS - MCP 2025-11-25 update](https://workos.com/blog/mcp-2025-11-25-spec-update)
- [Den Delimarsky - MCP November authorization](https://den.dev/blog/mcp-november-authorization-spec/)
- [WorkOS - MCP elicitation](https://workos.com/blog/mcp-elicitation)

#### LSP / DAP
- [LSP 3.17 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)
- [LSP 3.18 draft](https://github.com/microsoft/language-server-protocol/blob/gh-pages/_specifications/lsp/3.18/specification.md)
- [LSP base protocol 0.9](https://microsoft.github.io/language-server-protocol/specifications/base/0.9/specification/)
- [DAP specification](https://microsoft.github.io/debug-adapter-protocol/specification.html)
- [DAP overview](https://microsoft.github.io/debug-adapter-protocol/overview.html)

#### JSON-RPC + WebExtension
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [JSON-RPC error codes reference](https://json-rpc.dev/docs/reference/error-codes)
- [Chrome Extensions message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [Chrome Extensions runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime)
- [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [MDN runtime.Port](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/Port)
- [Duo Labs - Message passing security](https://duo.com/labs/tech-notes/message-passing-and-security-considerations-in-chrome-extensions)

#### Web Messaging / Streaming primitives
- [WHATWG Web Messaging](https://html.spec.whatwg.org/multipage/web-messaging.html)
- [MDN Window.postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [W3C CSP Embedded Enforcement](https://w3c.github.io/webappsec-cspee/)
- [WHATWG Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [MDN SSE usage](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [RFC 6455 WebSocket](https://datatracker.ietf.org/doc/html/rfc6455)

#### GraphQL Subscriptions / tRPC
- [graphql-ws PROTOCOL.md](https://github.com/enisdenjo/graphql-ws/blob/master/PROTOCOL.md)
- [tRPC main](https://trpc.io/)
- [tRPC subscriptions](https://trpc.io/docs/server/subscriptions)
- [tRPC httpSubscriptionLink](https://trpc.io/docs/client/links/httpSubscriptionLink)
- [tRPC authorization](https://trpc.io/docs/server/authorization)

#### CRDT
- [Yjs y-protocols PROTOCOL.md](https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md)
- [Yjs Awareness](https://docs.yjs.dev/api/about-awareness)
- [Automerge GitHub](https://github.com/automerge/automerge)

#### AI streaming
- [OpenAI Realtime guide](https://platform.openai.com/docs/guides/realtime)
- [OpenAI Realtime client events](https://platform.openai.com/docs/api-reference/realtime-client-events)
- [OpenAI Realtime server events](https://platform.openai.com/docs/api-reference/realtime-server-events)
- [OpenAI Assistants streaming](https://platform.openai.com/docs/api-reference/assistants-streaming)
- [Anthropic Messages streaming](https://docs.anthropic.com/en/api/messages-streaming)
- [Anthropic fine-grained tool streaming](https://platform.claude.com/docs/en/agents-and-tools/tool-use/fine-grained-tool-streaming)

### 10.2 Related PKC2 docs

- `docs/spec/pkc-message-api-v1.md`(canonical v1)
- `docs/spec/record-offer-capture-profile.md`(record:offer detail)
- `docs/development/pkc-message-implementation-gap-audit-2026-04-26.md`(v1 implementation gap + mockup-driven decisions)
- `docs/development/pkc-message-hook-subscription-{decision,acceptance,review,poc}.md`(v1 で deferred 化された hook subscription 設計、v2.2 で活用)
- `docs/development/transport-record-reject-decision.md`(record:reject sender-only Option A 維持)
- `docs/integration/message-bridge-setup.md`(v1 integration guide)

### 10.3 Implementation source(v1)

- `src/adapter/transport/envelope.ts`(v1 envelope)
- `src/adapter/transport/capability.ts`(MESSAGE_RULES + MESSAGE_CAPABILITIES)
- `src/adapter/transport/profile.ts`(PongProfile)
- `src/adapter/transport/message-bridge.ts`(mountMessageBridge + allowedOrigins provider)
- `src/adapter/transport/message-handler.ts`(HandlerContext + registry)
- `src/adapter/transport/record-offer-handler.ts`(record:offer + replyWindowRegistry)
- `src/adapter/transport/export-handler.ts`(export:request)
- `src/main.ts:393-460`(bridge mount + handler 登録 + dismiss/accept event hookup)

### 10.4 Related PR landings(本 doc 着地時点)

| PR | 内容 |
|---|---|
| #154 | v1 spec PR-E1 着地 |
| #160-#166 | v1 implementation gap audit + 4 Decisions + 4 Must src + integration guide(7 PR で wave クローズ) |
| (本 PR) | v2 prior art survey + v2 plan(本 doc)|

### 10.5 Extension-side library options(§5.8 用、参考)

User input(2026-04-26、別 PRJ Gemini 調査結果共有)に基づく Extension 実装者向け option:

- [Penpal — Promise-based iframe RPC](https://github.com/Aaronius/penpal)(最も popular、§5.8 ⭐ 推奨)
- [Comlink — Web Worker / Window proxy RPC](https://github.com/GoogleChromeLabs/comlink)(Google Chrome team)
- [Zoid — Cross-domain UI components](https://github.com/krakenjs/zoid)(PayPal、UI provider 寄り)

**注意**: これらは **Extension 側で opt-in** に使う library であり、PKC 本体 bundle には組み込まない(§1.5 哲学)。Extension 実装者が自身の bundle に追加して PKC v2 wire(JSON-RPC 2.0)の上に Promise / RPC wrapper を作るのに使う。

---

**Status footer**: 本 audit は **docs-only**、実装ゼロ。v2 spec の本実装は別 PR で着地。本 doc は v2 計画の **canonical reference** として保持し、v2.0 / v2.1 / v2.2 の各 milestone PR が本 doc を引用する設計。User 提案「先行する技術を調査 → PKC が必要なものを v2 としてまとめる」要請に直接応える docs-first audit。次の動きは bug fix 提案(user が next で受ける予定)。

---

**Status footer**: 本 audit は **docs-only**、実装ゼロ。v2 spec の本実装は別 PR で着地。本 doc は v2 計画の **canonical reference** として保持し、v2.0 / v2.1 / v2.2 の各 milestone PR が本 doc を引用する設計。
