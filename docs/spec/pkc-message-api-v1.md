# PKC-Message API v1 — Canonical Specification

**Status**: Accepted (2026-04-26)
**Audience**: Extension implementers (host-side and embedded-side), AI 協働 implementers, PKC2 contributors
**Replaces (as canonical reference for embedded HTML / Extension authors)**:
- `docs/development/extension-capture-v0-draft.md` (design draft, superseded)
- `docs/planning/resolved/24_message_transport.md` (planning doc, kept for archeology)

**Normative cross-spec**:
- `docs/spec/record-offer-capture-profile.md` (record:offer payload + capture-side rules、本 spec §7.2 で取り込む)
- `docs/spec/provenance-relation-profile.md` (将来の formal provenance、v1 では body header 形式のみ)

**Source-of-truth implementation**:
- `src/adapter/transport/{envelope,capability,profile,message-bridge,message-handler,record-offer-handler,export-handler}.ts`(行 ref を本 spec 各章で引用)

---

## 1. Purpose

PKC-Message v1 は、**PKC2 の単一 HTML(host)** と **外部 sender(embedded iframe / parent window / OS-side launcher / Extension)** の間で通信するための `postMessage` 上の **structured envelope protocol** を定義する。

主な目的:

1. **Extension が PKC2 内部 storage に "安全な範囲で" 書き込み・読み出しできる** ようにする
2. **AI 協働 extension の implementer が "PKC 側の何を信用していいか" を判断できる** 規約を 1 枚目で固定する
3. **storage shape / asset base64 / container 全体の漏洩を構造的に防ぐ** boundary を spec で文書化する
4. **versioning / 後方互換 / 拡張ルール** を明文化し、v2+ で破壊的変更が起きても extension 側が壊れない gate を提供する

## 2. Scope

### 2.1 In scope (本 v1 で確定)

- Transport layer: `window.postMessage` + origin allowlist + source/target window 関係
- Envelope shape: protocol / version / type / source_id / target_id / payload / timestamp
- 9 message types(`ping` / `pong` / `record:offer` / `record:accept` / `record:reject` / `export:request` / `export:result` / `navigate` / `custom`)の **形** と **責務**
- Capability negotiation(ping/pong with PongProfile + MESSAGE_RULES の AcceptanceMode)
- Storage access boundary(read / write / append / delete / subscribe いずれを許可するか / しないか)
- Error vocabulary(envelope-level `RejectCode` enum + handler-level rejection logging)
- Versioning policy(v1 内は additive、breaking change は v2 bump)
- Compatibility commitment(unknown field / unknown type / 未登録 handler の扱い)

### 2.2 Out of scope (v1 では未定義、v2+ または別 PR)

- **Hook subscription**(現時点 Defer 決定、§11.1 参照)
- **Bidirectional error response inbound channel**(§11.2)
- **`record:accept` outbound sender 実装**(§11.3、type 予約のみ)
- **`record:reject` inbound handler**(§11.4、Option A: sender-only by design)
- **External provenance formal Relation schema**(現状 body header 形式、§11.5)
- **correlation_id / idempotency / dedup**(§11.6)
- **Default origin allowlist の concrete value**(implementation PR で別途、§3.4 で方針のみ固定)
- **Capability advertise from sender side**(現状 implicit、§5.4)

## 3. Transport Layer

### 3.1 postMessage

PKC-Message v1 は **`window.postMessage`** を transport とする。host(PKC2 single HTML)は `window.addEventListener('message', handler)` で受信し、応答時は明示的な target window を `target.postMessage(envelope, targetOrigin)` で指定する。

実装 ref: `src/adapter/transport/message-bridge.ts:169`(receive)/ `:193`(send)。

### 3.2 Source / Target Window

- 受信した `MessageEvent.source` を **必ず保持** し、応答時の target window として使う(implementation: `HandlerContext.sourceWindow: Window`、`message-handler.ts:32`)。
- `target_id` field(envelope §4.1)は **論理的な宛先 container ID** を表し、window object とは独立。複数 PKC2 instance が同 origin に存在するケース(将来の multi-tab broadcast 等)を想定。
- broadcast 用途では `target_id: null` を許可(receiver 全員が処理対象とする)、specific 宛先では receiver 側 active container ID と一致したときのみ handler に到達(`message-bridge.ts:145-149`)。

### 3.3 Origin Allowlist

- bridge mount 時に **`allowedOrigins: string[]`** を渡す(`mountMessageBridge({ allowedOrigins: [...] })`、`message-bridge.ts:34-48`)。
- 受信した `MessageEvent.origin` が allowlist に含まれない場合、envelope validation 前に **早期 reject**(`onReject` callback + console.warn、`message-bridge.ts:101-110`)。
- **`"null"` origin**(`file://` / sandboxed iframe / data: URI 経由の起動)は **明示 opt-in なしでは reject**(`message-bridge.ts:123-126`、`record-offer-capture-profile.md §9.2`)。`"null"` を allowlist に含めるかどうかは implementer の判断、production では非推奨。

### 3.4 Default Policy

- **v1 spec の方針**: 「production deployment では allowedOrigins を **明示設定すべき**」を normative requirement として固定。
- **default は restrictive**(empty allowlist は受信全 reject)に倒すことを v0 で確定済み(`record-offer-capture-profile.md §9.1`)。
- **具体値の選定は implementation PR で別途**。Extension 側の origin / `chrome-extension://...` / `moz-extension://...` / OS-launcher origin / 組織内 host name など、deployment context によって異なるため本 spec では列挙しない。

## 4. Envelope

### 4.1 Fields

| field | type | required | 役割 | implementation ref |
|---|---|---|---|---|
| `protocol` | `'pkc-message'`(literal) | yes | protocol discriminant、誤配信弾き | `envelope.ts:209` |
| `version` | `1`(literal number) | yes | protocol version、本 spec が v1 | `envelope.ts:210` |
| `type` | `MessageType`(union) | yes | message type discriminant、§4.2 / §7 参照 | `envelope.ts:44-54` |
| `source_id` | `string \| null` | yes | 送信者の論理 ID、null 可(任意値許容) | `message-bridge.ts:212` |
| `target_id` | `string \| null` | yes | 宛先 container 論理 ID、null は broadcast | `message-bridge.ts:213` |
| `payload` | `unknown`(type-specific) | yes(空 object でも必須) | type 固有 body、validation は handler 責務 | `envelope.ts` |
| `timestamp` | ISO 8601 string | yes | 送信時刻、handler 側で informational | `envelope.ts:215` |

**形式 example**:

```json
{
  "protocol": "pkc-message",
  "version": 1,
  "type": "record:offer",
  "source_id": "extension:web-clipper@1.0",
  "target_id": null,
  "payload": { "title": "...", "body": "..." },
  "timestamp": "2026-04-26T01:23:45.678Z"
}
```

### 4.2 Validation Rules

bridge 層は受信 envelope を **以下の順** で validate(`envelope.ts:62-109`、`validateEnvelope()`):

1. **`NOT_OBJECT`**: payload が plain object でない(null / array / primitive など)→ reject
2. **`WRONG_PROTOCOL`**: `protocol !== 'pkc-message'` → reject
3. **`WRONG_VERSION`**: `version !== 1` → reject(本 spec では future version は別 envelope と見なす)
4. **`MISSING_TYPE`**: `type` が string でない / 空 → reject
5. **`INVALID_TYPE`**: `type` が `KNOWN_TYPES` に未登録 → reject(`envelope.ts:44-54`、§7 で列挙)
6. **`MISSING_TIMESTAMP`**: `timestamp` が string でない → reject

validation pass 後、envelope は **handler routing layer** に渡される(`message-handler.ts:79-85`、§5 capability gate を経由)。

### 4.3 RejectCode と reject 経路

envelope-level の `RejectCode` enum(`envelope.ts:17-23`):

```ts
type RejectCode =
  | 'NOT_OBJECT'
  | 'WRONG_PROTOCOL'
  | 'WRONG_VERSION'
  | 'MISSING_TYPE'
  | 'INVALID_TYPE'
  | 'MISSING_TIMESTAMP';
```

reject 経路は **inbound のみで完結**(host が黙って捨てる + console.warn + `onReject` callback で観測点を提供):

- v1 では **error response message を返さない**(deferred、§11.2 / §8.3 参照)
- 外部 sender 側は応答が無いことを「reject されたか / loss されたか / 未着か」を区別できない(at-most-once delivery、§11.6 で拡張余地あり)
- handler-level の rejection(payload validation failure 等)は §8.2 で別途扱う

詳細は §8 Error Vocabulary を参照。

## 5. Capability Negotiation

### 5.1 ping / pong Handshake

外部 sender が host に **`ping`** を送信し、host(bridge layer)は **`pong`** を自動応答する。

- ping は payload 任意(空 object も可)、handler に到達せず bridge 層で完結(`message-bridge.ts:151-160`)。
- pong の payload は `PongProfile`(§5.2)を含み、host が「自分は何者で、どの capability を受理するか」を sender に伝える。
- sender は pong を受信して、**送れる message type を決定する**(MESSAGE_RULES に基づく gate を予測)。

### 5.2 PongProfile

```ts
interface PongProfile {
  app_id: string;          // 'pkc2'
  version: string;         // semver, e.g. '2.1.1'
  schema_version: number;  // container schema version, e.g. 1
  embedded: boolean;       // standalone HTML か embedded iframe か
  capabilities: string[];  // 'record:offer' / 'export:request' 等
}
```

実装 ref: `src/adapter/transport/profile.ts:29-40`。`capabilities` の string vocabulary は `src/runtime/release-meta.ts` の `CAPABILITIES` で管理。

**v1 commitment**: pong profile の field は **additive only**(v1 内で field を削除しない)。新規 field は optional として追加(§9.4)。

### 5.3 MESSAGE_RULES と AcceptanceMode

receiver 側で各 message type を「どの mode で受け入れるか」を **`MESSAGE_RULES`** で宣言する(`capability.ts:49-52`):

```ts
type AcceptanceMode = 'any' | 'embedded-only';

const MESSAGE_RULES: Record<string, { mode: AcceptanceMode }> = {
  'record:offer':    { mode: 'any' },
  'export:request':  { mode: 'embedded-only' },
  // ping / pong は bridge 層で完結、rule 不要
  // record:accept / record:reject / navigate / custom は handler 任意登録
};
```

- **`'any'`**: standalone(`pkc2.html` を直接開いた状態)/ embedded(iframe 等にホストされた状態)の両方で受理。
- **`'embedded-only'`**: embedded のときのみ受理(host page が PKC2 を埋め込んだケースで意味を持つ機能、例: export を host 側に html 文字列で返す)。

**capability gate** は handler routing 前に必ず通る(`canHandleMessage(type, embedded)`、`capability.ts:60-70`)。gate 失敗時は handler に到達しない(handler 未登録扱いと等価、§8.2)。

### 5.4 Sender-Side Advertise (Deferred)

- v1 では **sender が「自分は何ができる」を host に通知する仕組みは未定義**(implicit、ping payload に何を入れるかは sender 自由)。
- 将来 sender capability advertise が必要になったら、ping payload に `client_capabilities: string[]` を additive 追加し、host は pong に互換結果を返す方式が想定経路(v2+ で formal 化、§11)。
- v1 では sender が「送ってみて pong の `capabilities` を見て judge する」運用で問題ない(現状の Extension 想定 use case では十分)。

## 6. Storage Access Boundary

### 6.1 Read 範囲

**v1 で外部 sender が read できる host 内部 storage の情報**:

| 取得経路 | 提供される情報 | 提供されない情報 |
|---|---|---|
| `pong` の `PongProfile` | app_id / version / schema_version / embedded / capabilities | container 内容 / entry 一覧 / asset / 設定 |
| `export:result` の `html` | container 全体を **既に export と等価な形** で(=user が "Export" を押したのと同じ rendered HTML) | base64 asset の生データ単体 / 内部 lid / revision history など、export HTML に含まれない構造 |
| `record:offer` の **応答**(reject 含む) | **応答無し**(v1 では inbound error response 未定義、§8.3) | accept されたか / 既存 entry の内容 |

**v1 では sender が host の任意 entry を read する API は無い**。`export:request` は **container 全体を 1 まとめの html string にして渡す**ため、partial read / search / query は sender 側で export 後に行う前提。

### 6.2 Write 範囲

**v1 で外部 sender が host に書き込める唯一の経路は `record:offer`**(§7.2)。

- sender → host の流れ: `record:offer` 送信 → host 側で PendingOffer 化 → **user が UI で accept** → `ACCEPT_OFFER` reducer が走り新規 entry mint。
- **user の同意が無ければ書き込みは発生しない**(automatic accept は v1 では存在しない)。
- 既存 entry の **append / update / delete は v1 では未定義**(§11)。Extension は「新しい entry を提案する」ことのみができる。

### 6.3 漏洩防止 (Confidentiality)

host から sender への情報流出を構造的に防ぐ仕掛け:

1. **container shape を渡さない**: `export:result.html` は **rendered HTML 文字列のみ**(`export-handler.ts:58-62`)、container JSON や revision graph を渡さない。html parsing は sender 側の責務(かつ user が export を user の意思で要求したケースに限定、`export:request` は embedded-only)。
2. **asset base64 を渡さない**: `record:offer.payload` に `assets` 埋め込みは禁止(`capture-profile.md §8.5`、`extension-capture-v0-draft.md §4.3`)。**capture flow では asset 直送を non-goal** に倒している。
3. **selection_text / page_title は読み捨て**: `record:offer` payload に capture-flow で含まれる `selection_text` / `page_title` は v1 では **type check のみ通して結果に格納しない**(`record-offer-handler.ts:141`)。将来 provenance Relation で activate するための予約 field。
4. **provenance は body header のみ**: source_url / captured_at は body 先頭の blockquote header に注入される(§7.2.4)。container.meta.external_sources / formal Relation は v1 では未定義(§11.5)。
5. **target_id mismatch で broadcast を弾く**: `target_id` 指定があり host の active container と不一致なら handler に到達しない(`message-bridge.ts:145-149`)。意図しない container への混信を防ぐ。

### 6.4 ACL / Permission Scope

v1 では permission scope は **粗粒度**(message type 単位):

- **origin allowlist**: bridge mount 時の `allowedOrigins` で「誰が送ってよいか」を制御(§3.3)。
- **type-level capability**: `MESSAGE_RULES` の AcceptanceMode で「embedded のみ / 全部受理」を制御(§5.3)。
- **per-message permission(細粒度 ACL)は v1 では未定義**: 例えば「Extension A は record:offer 可、export:request 不可」のような per-source の制限は **origin allowlist で制御するか、もしくは sender id を見て handler 内で判断する** 運用。formal な per-source ACL は v2+ で検討(§11)。
- **user consent gate**: write 系(record:offer)は **必ず user の accept クリックを経由**(§6.2)。これが事実上の最重要 ACL。

## 7. Per-Type Contracts

各 type の **payload shape / direction / capability mode / handler 責務 / 応答有無** を本章で固定する。type の追加は §9 Versioning Policy に従い v1 内で additive に許容。

### 7.1 `ping` / `pong`

- **direction**: sender → host(`ping`)、host → sender(`pong`)
- **capability**: bridge 層で完結、`MESSAGE_RULES` 不要
- **payload(`ping`)**: 任意(空 object 推奨)
- **payload(`pong`)**: `PongProfile`(§5.2)
- **応答**: `ping` には `pong` が常に返る(envelope validation pass の場合のみ)

```json
// ping
{ "protocol": "pkc-message", "version": 1, "type": "ping",
  "source_id": "ext:foo", "target_id": null, "payload": {}, "timestamp": "..." }

// pong
{ "protocol": "pkc-message", "version": 1, "type": "pong",
  "source_id": null, "target_id": "ext:foo",
  "payload": { "app_id": "pkc2", "version": "2.1.1", "schema_version": 1,
                "embedded": false, "capabilities": ["record:offer", "export:request"] },
  "timestamp": "..." }
```

### 7.2 `record:offer` (Capture)

**最重要 type**。外部 sender が host に対して **新 entry の作成を提案** するメッセージ。

- **direction**: sender → host
- **capability mode**: `'any'`(standalone / embedded どちらも可)
- **payload type**: `RecordOfferPayload`(`record-offer-handler.ts:65-79`)
- **応答**: **無し**(host 側 UI で user が accept / dismiss するまで非同期、§6.1)

#### 7.2.1 `RecordOfferPayload` shape

```ts
interface RecordOfferPayload {
  // required
  title: string;          // entry title、空文字不可
  body: string;           // entry body、UTF-8 文字列、size cap §7.2.2
  // optional
  archetype?: ArchetypeId; // 'text' | 'textlog' | 'todo' | 'form' | 'attachment' | 'folder' | 'generic' | 'opaque'
  // capture-specific (optional, body header injection に使われる)
  source_url?: string;    // capture 元 URL
  captured_at?: string;   // ISO 8601、capture 時刻
  // capture-specific (受信時に型 check のみ、結果には格納されない)
  selection_text?: string;
  page_title?: string;
}
```

詳細は `docs/spec/record-offer-capture-profile.md`(canonical capture profile)を参照。本 spec §7.2 はその要約。

#### 7.2.2 Size Cap

- `body.length ≤ 262144 bytes`(`BODY_SIZE_CAP_BYTES`、`record-offer-handler.ts:127`)
- 超過時は handler が console.warn 出して reject(handler-level rejection、§8.2)
- title には size cap 無し(現実的には UI 表示で長すぎは破綻するため、sender 側で 256 文字程度を推奨)

#### 7.2.3 PendingOffer 化

handler が payload validation pass すると、host 内部で **`PendingOffer`** 構造に格納される(`record-offer-handler.ts:99-118`):

```ts
interface PendingOffer {
  offer_id: string;     // host が生成
  title: string;
  body: string;
  archetype?: ArchetypeId;
  source_url?: string;
  captured_at?: string;
  source_id: string | null;  // envelope.source_id を保持
  received_at: string;       // host 受信時刻
}
```

`SYS_RECORD_OFFERED` event が dispatch され、UI が PendingOffer banner を render(`record-offer-handler.ts:176`)。

#### 7.2.4 Body Header Injection

`source_url` / `captured_at` が指定されている場合、host は body 先頭に **provenance blockquote** を注入する(`capture-profile.md §10.3`):

```markdown
> source: https://example.com/article
> captured: 2026-04-26T01:23:45Z

(original body が続く)
```

これは **v1 における provenance の唯一の表現** である。formal Relation / container.meta.external_sources は v1 では未定義(§11.5)。

#### 7.2.5 Accept / Reject の流れ

- **accept**: user が PendingOffer banner で "保存" クリック → `ACCEPT_OFFER` reducer → 新規 entry mint(`generateLid()` で新 lid 採番、container に追加)。
- **reject (dismiss)**: user が dismiss → `DISMISS_OFFER` reducer → host から `record:reject` outbound 送信(§7.4、`main.ts:391-399`)。

### 7.3 `record:accept` (Reserved)

- **direction**: host → sender(将来予定、未実装)
- **capability**: receiver 側 handler 未登録(`MESSAGE_RULES` に列挙なし)
- **status**: **type 予約のみ**。outbound sender 実装は v1 では存在しない(§11.3)。
- **rationale**: spec として `record:accept` を将来チャネルとして残す予定。実装は extension 側が "accept された" を確実に知りたい use case が出たときに wire up(現状は user UI で直接見る前提)。

### 7.4 `record:reject` (Sender-Only by Design)

- **direction**: host → sender(現状の唯一の direction)
- **capability**: receiver 側 handler **意図的に未登録**(`transport-record-reject-decision.md` Option A)
- **送信契機**: PendingOffer を user が dismiss したとき(`main.ts:391-399`)
- **payload**: `RecordRejectPayload`(envelope.ts に type 定義)、`offer_id` + `reason: 'dismissed'` を含む
- **rationale**: v1 では reject signal は **host が sender に "あなたの offer は dismiss された" を伝える方向のみ** 必要。逆方向(sender が "ごめん撤回" を host に送る)は use case が無いため inbound handler を作らない設計判断(§11.4)。

### 7.5 `export:request` / `export:result`

#### 7.5.1 `export:request`

- **direction**: sender → host
- **capability mode**: `'embedded-only'`(host が embedded のときのみ受理、§5.3)
- **payload**:

  ```ts
  interface ExportRequestPayload {
    filename?: string;  // optional, host が default 生成名を持つ
  }
  ```

- **応答**: `export:result` を `MessageEvent.source` に対して送信(`export-handler.ts:64-69`)
- **handler 内部**: `buildExportHtml()` を async 実行(`export-handler.ts:55`)、container 全体を rendered HTML 1 ファイルに圧縮 + 文字列化

#### 7.5.2 `export:result`

- **direction**: host → sender
- **payload**:

  ```ts
  interface ExportResultPayload {
    filename: string;    // host が決定した実際のファイル名
    html: string;        // export HTML 全文
  }
  ```

- **size**: html string は数 MB に達することがある(asset embed 含む)、sender 側は受信後の取り扱い(IndexedDB / Blob save / streaming)を考慮すること。

#### 7.5.3 Why embedded-only?

standalone(`pkc2.html` 直開き)状態で `export:request` を受け付けると、user 操作なしに container 全体が出ていく経路が生まれてしまう。embedded(host page が PKC2 を埋め込み、host page が trusted partner として export を要求する)の場面に限定するのが boundary の取り方として安全。

### 7.6 `navigate`

- **direction**: sender → host
- **capability**: handler 任意登録(現状は host 実装で wire される)
- **payload**:

  ```ts
  interface NavigatePayload {
    target_lid?: string;  // 移動先 entry lid
    view?: 'detail' | 'calendar' | 'kanban';
    // 他、host 実装が解釈する optional fields
  }
  ```

- **応答**: 無し(state 変更で sender に return しない、必要なら sender が後続 ping で確認)
- **use case**: 外部 launcher / cross-tab notification から特定 entry を開く

### 7.7 `custom`

- **direction**: 任意(sender ↔ host)
- **capability**: handler 任意登録
- **payload**: 任意 shape(handler が型 check)
- **目的**: v1 spec で名前付きで定義していない type を試験的に通すための **escape hatch**。
- **commitment**: sender / host 双方が `payload.command: string` のような sub-discriminator を payload 内に持たせる運用を **推奨**(将来 named type に昇格しやすい構造)。
- **stability**: v1 spec は `custom` の **payload shape を保証しない**。implementer 同士で別途契約を結ぶこと(extension 側 doc に書く)。

## 8. Error Vocabulary

### 8.1 Envelope-Level RejectCode

§4.3 で列挙した `RejectCode` enum がすべて。bridge 層が envelope validation 失敗時に **`onReject(code, raw)` callback** を呼ぶ(`message-bridge.ts:135-140`)。

| RejectCode | 発生条件 | 観測点 |
|---|---|---|
| `NOT_OBJECT` | payload 全体が非 object | `validateEnvelope` |
| `WRONG_PROTOCOL` | `protocol !== 'pkc-message'` | `validateEnvelope` |
| `WRONG_VERSION` | `version !== 1` | `validateEnvelope` |
| `MISSING_TYPE` | `type` が string でない / 空 | `validateEnvelope` |
| `INVALID_TYPE` | `type` が `KNOWN_TYPES` に未登録 | `validateEnvelope` |
| `MISSING_TIMESTAMP` | `timestamp` が string でない | `validateEnvelope` |

**reject 時の host 振る舞い**: console.warn + `onReject` callback、message は **黙って捨てる**(error response は返さない、§8.3)。

### 8.2 Handler-Level Rejection

envelope validation pass 後、handler が payload を見て reject するケース(`record:offer` の size cap 超過 / payload validation failure 等):

- handler は **`return false`** で「処理しなかった」を bridge に伝える(`record-offer-handler.ts:159-161`)
- bridge は **応答送信せず、console.warn を出すのみ**(`message-handler.ts:81-82`、handler 未登録扱いと等価)
- 現時点では handler-level の rejection に **明示的な error-code enum は無い**(`RejectCode` は envelope-level のみ)

**v1 commitment**: handler-level rejection は **logging-only** で、外部 sender に reject reason を返さない。

### 8.3 Inbound Error Response が無いことの帰結

v1 では host → sender 方向の **error response message type が存在しない**。これにより以下の制約が生じる:

1. sender は `record:offer` 送信後、host が「accept したか / reject したか / そもそも届かなかったか」を **応答だけでは判断できない**
2. sender は応答待ちタイムアウトを実装しても、それは「host が user UI で accept / dismiss するまでの時間」と切り分けできない
3. retry 戦略は sender 側の自己責任(idempotency が無いため重複 offer 化のリスクあり、§11.6)

**v1 における推奨実装**: sender は「offer を投げて UI を user に見せた」後は **応答を待たない fire-and-forget** モデルで設計する。確実な acceptance 確認が必要なら future hook subscription(§11.1)または polling(`export:request` で状態確認)を検討。

将来的な inbound error response の導入は §11.2 で reserved。

## 9. Versioning Policy

### 9.1 envelope.version の扱い

- **v1**: `version: 1`(literal)を envelope に必ず格納。
- v1 範囲では receiver は **`version === 1` のみ受理**、それ以外は `WRONG_VERSION` で reject(§4.2)。
- 将来 v2 が出るときは sender が `version: 2` を送り、受信側 PKC2 が v2 対応していなければ `WRONG_VERSION` reject。**sender は pong の `app_id` / `version`(semver)で v1 / v2 を判別する** 運用を推奨。

### 9.2 v1 内 Additive Rule

v1 が ship された後、**v1 範囲で許可される変更**:

- 新 message type の追加(`KNOWN_TYPES` に追加 + 新 handler 登録)
- 既存 payload への optional field 追加(必須化は不可)
- `PongProfile.capabilities` への新 capability 追加
- handler の internal logic 改善(public contract を変えない)

**v1 範囲で禁止される変更**:

- 既存 payload の required field 削除 / 型変更
- 既存 RejectCode の意味変更 / 削除
- AcceptanceMode の strictness 強化(例: `'any' → 'embedded-only'` は v2 扱い)
- envelope core field(protocol / version / type / source_id / target_id / timestamp)の削除 / 型変更

### 9.3 v2 Bump Trigger

以下のいずれかに該当する変更は **v2 bump が必要**:

- envelope core field の breaking change
- 既存 message type の payload required field 削除 / 型変更
- AcceptanceMode の意味変更(現 v1 の 2 値 enum を 3 値以上にするなど互換性を破る形)
- `PongProfile` の field 削除
- `RejectCode` enum の semantics 変更

v2 への bump は **必ず docs/spec/pkc-message-api-v2.md を新設** し、本 v1 spec は archive(凍結)する運用。v1 と v2 は同 host で **並列 support 可能**(envelope の `version` field で discriminate、bridge mount 時に対応 version を選択)。

### 9.4 Unknown Field Handling

envelope validation pass 後、payload 内に **未知の field がある場合**:

- handler は **未知 field を黙って無視**(`record-offer-handler.ts:122-143` の payload validation で必要 field のみ抽出)
- 未知 field の存在は **error にしない**(`capture-profile.md §7.3`、`extension-capture-v0-draft.md §4.3` で確認済み)
- これにより sender 側が「v1.x で追加された optional field」を v1.0 host に送っても、host は壊れず受理する

**implementer commitment**: handler を実装するときは、**known field のみ抽出する pattern** を使うこと(`payload.foo`, `payload.bar` の destructuring + 必要なら type guard)。`Object.keys(payload)` で全 enumerate する pattern は避ける(forward-compat を壊す)。

### 9.5 Unknown Type Handling

envelope の `type` field が `KNOWN_TYPES` に未登録のケース:

- bridge 層が **`INVALID_TYPE` で reject**(§4.2)
- これは v1 spec の **意図的な strictness**(unknown type を黙って通すと、別 protocol との混信や misrouting の温床になる)

ただし v1 spec の `KNOWN_TYPES` には `'custom'` が含まれており(§7.7)、**実験的 type は `custom` 経由で通す** ことを推奨する。新 type を named で追加するときは v1 範囲内の additive rule で進める。

## 10. Migration Table

既存 doc / spec / decision が本 v1 spec に対してどう位置付けられるかを以下に固定する。**本 v1 spec が canonical reference**、他 doc は補足 / archive となる。

| Doc | 位置付け | 本 spec での扱い |
|---|---|---|
| `docs/spec/record-offer-capture-profile.md` | **Normative cross-spec**(canonical の一部) | §7.2 で要約し、詳細は cross-spec を参照させる。本 spec と齟齬があれば本 spec が優先。 |
| `docs/spec/provenance-relation-profile.md` | Future-only | §7.2.4 / §11.5 から参照。v1 では body header 形式のみ、formal Relation は v2+。 |
| `docs/planning/resolved/24_message_transport.md` | Archeology | 初期 design doc、本 v1 spec 完成後は **canonical 性を喪失**。冒頭に "see canonical" 注記を追加(§10.1)。 |
| `docs/development/extension-capture-v0-draft.md` | Superseded | `record-offer-capture-profile.md` + 本 v1 spec で完全に置き換え。冒頭に redirect 注記。 |
| `docs/development/pkc-message-hook-subscription-decision.md` | Active(Defer 決定) | hook subscription は v1 では **未定義**(§11.1)。本 doc は deferred decision の正本として残す。 |
| `docs/development/pkc-message-hook-subscription-acceptance.md` | Active(v2+ minimum scope の正本) | hook subscription を将来実装する際の acceptance contract、本 v1 spec とは独立。冒頭に "v1 では未実装、v2+" を注記。 |
| `docs/development/pkc-message-hook-subscription-review.md` | Archive(設計レビュー記録) | acceptance / decision で superseded、冒頭に redirect 注記。 |
| `docs/development/pkc-message-hook-subscription-poc.md` | Frozen(Defer により凍結) | decision で go/no-go 判定済み、冒頭に "Defer により凍結" を注記。 |
| `docs/development/transport-record-accept-reject-consistency-review.md` | Archive(review 完了 2026-04-19) | 本 v1 spec §7.3 / §7.4 で結論を取り込み済み、冒頭に redirect 注記。 |
| `docs/development/transport-record-reject-decision.md` | Active(Option A 決定の正本) | sender-only by design 決定の根拠、本 v1 spec §7.4 から参照。 |

### 10.1 Redirect Notice の文言テンプレート

各 superseded / archive doc の冒頭に以下を挿入する(本 PR で機械的に追加):

```markdown
> **Status (2026-04-26)**: 本 doc は本 PR で `docs/spec/pkc-message-api-v1.md` に
> superseded された。現在の canonical は v1 spec を参照。
> 本 doc は archeology / 設計検討の記録として保持する(履歴削除しない)。
```

active な deferred decision doc(decision / acceptance / reject-decision)には redirect ではなく **status 注記** を追加(本 v1 spec との関係性を 1 行で示す):

```markdown
> **Status (2026-04-26)**: 本 doc は v1 では deferred / active な決定として `docs/spec/pkc-message-api-v1.md` から参照される。
```

## 11. Deferred / Reserved (v2+)

本章は v1 では **意図的に未定義** とした項目を列挙する。v2+ で改訂 PR を起こすときの起点として参照されること。

### 11.1 Hook Subscription

- **status**: Defer 決定(`pkc-message-hook-subscription-decision.md`、2026-04-19)
- **理由**: hook は PKC2 を "platform 方向" に踏み出す決定であり、polling では満たせない UX 課題が未検証。先に polling prototype で必然性を実証する方針。
- **acceptance contract**: 既に `pkc-message-hook-subscription-acceptance.md` で v1(=本 spec とは別の "hook subscription v1")の minimum scope が固定されており、go 判定が降りたら implementation guide(`pkc-message-hook-subscription-poc.md`)を参照して新 PR で着地。
- **本 v1 spec での文言**: 「hook subscription は本 v1 では未定義。実装は deferred(decision-doc を参照)」

### 11.2 Inbound Error Response

- **status**: 未定義
- **想定 use case**: subscription failed / TTL expired / capability mismatch を host が sender に通知する path
- **future shape の候補**: 新 message type `error:notify`(payload に `code: string`, `message: string`, `correlated_envelope?: { type, source_id, ... }` を含む)
- **v1 での代替**: console.warn + onReject callback の **observe** で対応。sender 側は応答無しを想定して fire-and-forget 設計。

### 11.3 `record:accept` Outbound Sender

- **status**: type 予約のみ、sender 実装無し
- **理由**: 現状の use case では「accept されたか」を sender が確実に知る必要が無い(user UI で見える + accept 後の effect は sender 側に届かなくても問題ない)
- **future trigger**: extension が "accept されたら次の action を取る" UX を要求してきた時点で wire-up

### 11.4 `record:reject` Inbound Handler

- **status**: 意図的に未登録(`transport-record-reject-decision.md` Option A: sender-only by design)
- **理由**: 「sender が host に "撤回したい" を送る」use case が無い。一方向(host → sender)で十分。
- **future trigger**: bidirectional reject が必要な extension が現れたら、Option B(別 PR で acceptance contract 起こし → handler 登録)で着地。

### 11.5 Formal Provenance Relation

- **status**: 未定義(本 v1 では body header の blockquote 形式のみ)
- **future**: `RelationKind = 'provenance'` の formal Relation + `container.meta.external_sources` を導入し、**body から source_url を分離**(searchable / queryable に)
- **canonical future spec**: `docs/spec/provenance-relation-profile.md`(現在 draft、v0 で blockquote のみ採用、formal Relation は本 v1 spec とは別 wave で進める)

### 11.6 correlation_id / Idempotency / Dedup

- **status**: 未定義
- **v1 の delivery semantics**: at-most-once、dedup なし
- **v2 で導入する場合の shape**(参考): envelope に optional `correlation_id?: string` を追加、sender が retry 時に同 id を流用、host 側が `(source_id, correlation_id)` キーで dedup
- **v1 での回避策**: sender 側で「直前 N 秒以内の同 title+body 送信」を抑止する。host 側は user UI で重複を user に判断させる(2026-04-26 時点でこれが現実解)

### 11.7 Per-Source Fine-Grained ACL

- **status**: 未定義(現状は origin allowlist + type-level capability で粗粒度制御)
- **future**: `(source_id, message_type)` の matrix で per-source ACL を host 設定として保持
- **trigger**: 単一 origin に複数 extension が同居する scenario(例: marketplace から複数 AI ext を install)で必要になる

### 11.8 Sender-Side Capability Advertise

- **status**: implicit(ping payload 自由、host は pong で `capabilities` を返すのみ)
- **future shape**: ping payload に `client_capabilities: string[]` を additive 追加、host が pong で intersection を返す
- **v1 では不要**: 現 use case では host capability を sender が見て判断する片方向で十分。

## 12. Compatibility Commitments

### 12.1 v1 内の互換性保証

PKC2 host が **v1 spec 範囲内** で commit する保証:

1. envelope validation の **pass 条件は変えない**(v1 内で新たな field を required 化しない)
2. 既存 message type の payload **required field を削除しない**
3. `RejectCode` enum を **削除しない / 意味を変えない**
4. `MESSAGE_RULES` の AcceptanceMode を **strictness 強化方向に変えない**(`'any' → 'embedded-only'` は v2 扱い)
5. `PongProfile` の field を **削除しない**

### 12.2 Unknown Field / Unknown Type の不変式

- **unknown field in known payload**: 黙って無視(§9.4)。host は **壊れない**。
- **unknown message type**: bridge 層で `INVALID_TYPE` reject(§4.2)。host は **壊れない**(silent ignore ではなく明示 reject)。
- 未来の type 増設に備えて、sender は **`type === 'INVALID_TYPE' reject を受けても再送 loop に陥らない`** ように reject reason を観察すること(`onReject` を sender 側で実装する場合)。

### 12.3 Sender 側 Forward-Compat の心構え

extension implementer に対する推奨事項:

1. **pong の `capabilities` を見てから送る**: host が古い PKC2 で新 type に未対応のとき、ping/pong で確認してから本送信する(silent reject を未然に防ぐ)
2. **payload の required field のみ作る、optional はそれと判らないように送る**: 将来 spec で optional 化された field は host 側で無視されるが、required 化される field を勝手に追加しない
3. **応答無しを想定**: v1 では inbound error response が無い(§8.3)。応答が来ないことを「reject」と即断せず、user UI を観察する設計に倒す
4. **version をハードコードしない**: `version: 1` は本 v1 spec の literal、将来 v2 が出たら **両方サポートできるよう** sender 側を設計する(pong の `app_id` + semver で判別)

## 13. References

### 13.1 Source-of-truth Implementation

| layer | path | line ref |
|---|---|---|
| Envelope validation | `src/adapter/transport/envelope.ts` | 17-29 (RejectCode), 44-54 (KNOWN_TYPES), 62-109 (validateEnvelope) |
| Capability gate | `src/adapter/transport/capability.ts` | 31 (AcceptanceMode), 49-52 (MESSAGE_RULES), 60-70 (canHandleMessage) |
| Pong profile | `src/adapter/transport/profile.ts` | 21, 29-40 (PongProfile), 61-63 (CAPABILITIES) |
| Bridge | `src/adapter/transport/message-bridge.ts` | 34-68 (BridgeOptions), 101-110 (origin check), 112-167 (handleMessage), 169 (receive), 193 (send), 202-216 (buildEnvelope) |
| Handler registry | `src/adapter/transport/message-handler.ts` | 28-43 (HandlerContext), 79-85 (route) |
| Record offer | `src/adapter/transport/record-offer-handler.ts` | 65-79 (RecordOfferPayload), 99-118 (PendingOffer), 122-143 (validation), 157-178 (handler) |
| Export | `src/adapter/transport/export-handler.ts` | 25-37 (payload types), 44 (capability), 47-69 (handler) |

### 13.2 Normative Spec Cross-Reference

- `docs/spec/record-offer-capture-profile.md`(record:offer の詳細、§7.2 から参照)
- `docs/spec/provenance-relation-profile.md`(future formal provenance、§11.5 から参照)

### 13.3 Decision / Acceptance / Review Doc

- `docs/development/pkc-message-hook-subscription-decision.md`(Defer 決定、§11.1)
- `docs/development/pkc-message-hook-subscription-acceptance.md`(v2+ minimum scope)
- `docs/development/pkc-message-hook-subscription-review.md`(設計 review 記録、archive)
- `docs/development/pkc-message-hook-subscription-poc.md`(PoC 設計、frozen)
- `docs/development/transport-record-reject-decision.md`(sender-only Option A、§7.4)
- `docs/development/transport-record-accept-reject-consistency-review.md`(consistency review、archive)

### 13.4 Archeology

- `docs/planning/resolved/24_message_transport.md`(初期 design doc、本 v1 spec 完成後は archeology)
- `docs/development/extension-capture-v0-draft.md`(draft、`record-offer-capture-profile.md` + 本 v1 spec で superseded)

---

**Status footer**: 本 v1 spec は 2026-04-26 に accepted。AI 協働拡張(別プロジェクト「PKCにAIを住まわせる会」)の implementer は本 spec を canonical reference として参照すること。v1 範囲での変更は §9.2 additive rule に従う。v2 bump trigger は §9.3 を参照。

---

**Status**: Skeleton committed. Sections §3–§13 are expanded incrementally in subsequent commits / Edits. Total target ≈ 1000 行(実装 PR で 1 PR にまとめて landing する、または 4-5 commit に分割する判断は本 PR で決める)。
