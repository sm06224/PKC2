# PKC-Message Implementation Gap Audit — 2026-04-26

**Status**: Active audit (2026-04-26)、Plan 1 wave クローズ後の test-strategy wave からの一時迂回。
**Scope**: docs-only audit、実装ゼロ。
**Trigger**: 別プロジェクト「PKCにAIを住まわせる会」が PKC-Message 用のモックアップを作成中。PKC2 が integration target になる前に、v1 spec(`docs/spec/pkc-message-api-v1.md`、PR #154 / 656 行)と現状の実装(`src/adapter/transport/*.ts`、7 file / 839 行)のギャップを正確に把握する必要が生じた。

## 1. 目的 / 範囲 / 非目的

### 目的

1. **Completion matrix**: v1 spec §3〜§9 の各項目が実装で完成 / 部分 / 未実装 / N/A のいずれかを 1 表で固定
2. **統合フロー別 trace**: 別PRJ モックアップが想定する 3 つの典型 flow(ping/pong / record:offer / export:request)を end-to-end で trace、各ステップで実装が動くか / 動かないかを断定
3. **躓くであろう点リスト**: integration で実際に困りそうなポイントを P0(ブロッカー)/ P1(困難)/ P2(あった方がよい)で優先度付け
4. **最小実装 priority list**: 別PRJ モックアップを unblock する must / should / could 項目
5. **推奨 PR 順序**: audit 着地後の follow-up PR(複数)の概要 + diff 規模

### 範囲

- v1 spec(`docs/spec/pkc-message-api-v1.md`)
- 実装 7 src(`src/adapter/transport/*.ts`)
- 統合点(`src/main.ts` / `src/runtime/release-meta.ts`)
- 関連 spec / decision(`record-offer-capture-profile.md` / `transport-record-reject-decision.md` / `pkc-message-hook-subscription-decision.md`)

### 非目的

- v1 spec の改訂(audit doc 段階では spec 変更しない、必要なら別 PR)
- 実装変更(本 PR は docs-only、follow-up PR で実装)
- §11 で deferred 化された項目(hook subscription / correlation_id / per-source ACL 等)の再検討
- 別PRJ モックアップ HTML の受領後の追補(本 audit doc は spec/実装側からの view のみ、mockup driven view は §7 で TBD)

## 2. Completion Matrix

| spec § | 内容 | 実装ファイル(行 ref) | 状態 | 備考 |
|---|---|---|---|---|
| §3.1 postMessage | transport 基盤 | `message-bridge.ts:169` (recv), `:193` (send) | ✅ | `window.addEventListener('message')` + `target.postMessage()` |
| §3.2 Source/Target Window | envelope 保持 + routing | `message-bridge.ts:165` (`event.source`), `message-handler.ts:32` (`sourceWindow`) | ✅ | target_id mismatch early skip(`message-bridge.ts:145-149`)も実装 |
| §3.3 Origin Allowlist | 許可 origin リスト + null 特別扱い | `message-bridge.ts:34-48` (BridgeOptions), `:123-126` (null) | ⚠️ | type は完成。ただし `main.ts:402` で **`[window.location.origin]` の same-origin only hardcode**、cross-origin は受け入れ不可 = **P0** |
| §3.4 Default Policy | restrictive 宣言 | spec で policy 固定 | ⚠️ | policy 文言のみ、runtime 設定経路なし。implementer が build 時に hardcode しか書けない = **P0** |
| §4.1 Envelope Fields | 7 field + KNOWN_TYPES | `envelope.ts:44-54` (KNOWN_TYPES), `:62-109` (validate), `message-bridge.ts:202-216` (build) | ✅ | protocol / version / type / source_id / target_id / payload / timestamp 全実装 |
| §4.2 Validation Rules | 6 段階の validation | `envelope.ts:62-109` | ✅ | NOT_OBJECT → WRONG_PROTOCOL → WRONG_VERSION → MISSING_TYPE → INVALID_TYPE → MISSING_TIMESTAMP の順 |
| §4.3 RejectCode + reject 経路 | enum + host-only discard | `envelope.ts:17-23` (enum), `message-bridge.ts:135-140` (onReject) | ✅ | inbound error response 無し(v1 仕様通り) |
| §5.1 ping/pong Handshake | bridge 層完結 | `message-bridge.ts:151-160` | ✅ | ping は handler に到達せず、bridge 層で auto pong |
| §5.2 PongProfile | profile shape | `profile.ts:29-40` (PongProfile), `:55-63` (build) | ✅ | `app_id` / `version` / `schema_version` / `embedded` / `capabilities`、`CAPABILITIES = ['core', 'idb', 'export', 'record-offer']`(`release-meta.ts:105-110`) |
| §5.3 MESSAGE_RULES + AcceptanceMode | capability gate | `capability.ts:49-52` (rules), `:60-70` (canHandleMessage) | ✅ | `record:offer`(any)/ `export:request`(embedded-only)の 2 rule |
| §5.4 Sender-Side Advertise | v1 では未定義 | spec §5.4 で deferred 明示 | N/A | sender が ping payload に何を入れても無視、pong の `capabilities` 参照のみ |
| §6.1 Read 範囲 | 漏洩防止設計 | `export-handler.ts:47-69` (html string のみ), `record-offer-handler.ts:141` (selection_text/page_title 読み捨て) | ✅ | base64 asset 生 / container JSON 不返却、structural に保証 |
| §6.2 Write 範囲 | record:offer + user consent | `record-offer-handler.ts:157-178` | ✅ | sender からの write は record:offer 経路 1 本、accept クリック必須 |
| §6.3 漏洩防止 5 仕掛け | structural な 5 対策 | 複数 file(export / record-offer / message-bridge) | ✅ | export HTML のみ / asset embed 禁止 / selection 読み捨て / body header のみ provenance / target_id mismatch skip |
| §6.4 ACL / Permission Scope | origin + type-level | `capability.ts` + `message-bridge.ts` + user consent | ⚠️ | type-level / origin-level は実装。per-source fine-grained は §11.7 で deferred(v2+ 想定) |
| §7.1 ping/pong | auto-respond | `message-bridge.ts:151-160` + `profile.ts` | ✅ | spec 通り |
| §7.2 record:offer | offer + size cap + pending 化 | `record-offer-handler.ts:65-179` | ✅ | RecordOfferPayload / BODY_SIZE_CAP_BYTES(262144)/ PendingOffer / SYS_RECORD_OFFERED dispatch |
| §7.2.1 Payload shape | required / optional fields | `record-offer-handler.ts:65-79` | ✅ | spec と field 一致 |
| §7.2.2 Size Cap | 256 KiB | `record-offer-handler.ts:127` (`BODY_SIZE_CAP_BYTES = 262144`) | ✅ | 超過時は console.warn + false return |
| §7.2.3 PendingOffer 化 | offer_id + stored state | `record-offer-handler.ts:99-118` (interface), `:164-176` (handler) | ⚠️ | offer_id / source_id / received_at は保持。**sourceWindow 未保持** = reject outbound で window.parent hardcode に依存(下記 P1) |
| §7.2.4 Body Header Injection | `accept 時 blockquote` | reducer 側(`app-state.ts` の ACCEPT_OFFER 経路、本 audit では別 layer のため未確認) | ⚠️ | spec で「accept path で 1 箇所差し込む」と明示。reducer 実装の location は未 trace |
| §7.2.5 Accept/Reject の流れ | UI 経由 + reject outbound | `main.ts:437-446`(reject 送信) | ⚠️ | dismiss → reject outbound 実装は確認、ただし `window.parent` 固定送信(下記 P1) |
| §7.3 record:accept(Reserved) | type 予約のみ | `envelope.ts:48` (KNOWN_TYPES), MESSAGE_RULES に無し | N/A | spec §11.3 で intentional deferred、outbound sender 未実装は仕様通り |
| §7.4 record:reject sender-only | by design | `main.ts:437-446` (outbound) + capability inbound 意図的に未登録 | ✅ | `transport-record-reject-decision.md` Option A 確定 |
| §7.5 export:request/result | embedded-only request + html return | `export-handler.ts:43-73` (handler), `:25-37` (payload types) | ✅ | embedded-only mode 強制、async `buildExportHtml()` 後 `ctx.sourceWindow` に return |
| §7.6 navigate | handler 任意登録 | 本 audit scope 外(host 実装 wire) | N/A | v1 では handler 任意、type 予約のみ |
| §7.7 custom | escape hatch type | `envelope.ts:53` (KNOWN_TYPES) | ✅ | handler 任意登録、payload shape 保証なし(spec 通り) |
| §8.1 Envelope-Level RejectCode | 6 code enum | `envelope.ts:17-23` | ✅ | NOT_OBJECT / WRONG_PROTOCOL / WRONG_VERSION / MISSING_TYPE / INVALID_TYPE / MISSING_TIMESTAMP |
| §8.2 Handler-Level Rejection | false return + console.warn | `record-offer-handler.ts:159-161`, `message-handler.ts:81-82` | ✅ | logging-only、明示 error-code enum なし(spec 通り) |
| §8.3 Inbound Error Response 無し | fire-and-forget 設計 | spec §8.3 / §11.2 で deferred 明示 | N/A | sender は応答無しを前提、§11.2 で v2+ 検討 |
| §9.1 envelope.version | `version === 1` のみ受理 | `envelope.ts:81` | ✅ | v2 が出るときは pong の semver 経由で判別 |
| §9.2 v1 内 Additive Rule | optional 追加可 / required 削除不可 | spec で policy、`record-offer-handler.ts:130-134` (unknown field 黙殺) | ✅ | known field のみ抽出 pattern で forward-compat 確保 |
| §9.3 v2 Bump Trigger | breaking change で v2 bump | spec で trigger 明記 | ✅ | policy 宣言のみ |
| §9.4 Unknown Field Handling | 黙殺 | `record-offer-handler.ts:122-143` | ✅ | Object.keys enumerate 回避 pattern |
| §9.5 Unknown Type Handling | INVALID_TYPE reject | `envelope.ts:91-95` | ✅ | KNOWN_TYPES 未登録 → INVALID_TYPE、custom で escape |

### Completion 統計

- ✅ **完成**: 26 項目
- ⚠️ **部分**: 5 項目(§3.3 / §3.4 / §6.4 / §7.2.3 / §7.2.4 / §7.2.5)
- ❌ **未実装**: 0 項目
- N/A(spec で deferred 明示): 5 項目(§5.4 / §7.3 / §7.6 / §8.3 / §11 全般)

**全体評価**: spec と実装の **整合度は ~95%**。⚠️ 部分項目のうち §6.4 / §7.2.3 / §7.2.4 / §7.2.5 は spec で「deferred / 別 layer」と整合済み(残課題は §3.3 / §3.4 の origin allowlist の runtime flexibility と、§7.2.3 / §7.2.5 の sourceWindow threading 2 件 = §4 で深掘り)。

## 3. 統合フロー別の実装ギャップ

### 3.1 Flow 1: ping/pong handshake(capability discovery)

**spec 期待**: sender が `ping` 送信 → host(bridge 層)が自動 `pong` 返却 → sender は pong の `capabilities` で送信可能 type を判定。

**実装 trace**:

1. sender → `ping` envelope 送信
2. `message-bridge.ts:114` — `isPkcMessage` filter で PKC envelope のみ通す
3. `message-bridge.ts:123-132` — origin allowlist check
4. `envelope.ts:62-109` — `validateEnvelope` 6 段階 pass
5. `message-bridge.ts:152` — `type === 'ping'` → 自動 pong 返却(`:154-158`)
6. `profile.ts:55-63` — `buildPongProfile` で payload 生成:
   - `app_id: 'pkc2'`(hardcode)
   - `version: VERSION`(`release-meta.ts:93` = `'2.1.1'`)
   - `schema_version: SCHEMA_VERSION`(`release-meta.ts:99` = `1`)
   - `embedded: <current state>`(`dispatcher.getState().embedded`)
   - `capabilities: CAPABILITIES`(`release-meta.ts:105-110` = `['core', 'idb', 'export', 'record-offer']`)
7. handler registry に到達せず bridge 層で完結

**実装状態**: ✅ **完全に動く**、既知 issue なし

**Production 観点**:
- `capabilities` 値は static、新 message type 追加時は `CAPABILITIES` 編集が必要(自動 discovery 機構なし、§5.4 で intentional)

### 3.2 Flow 2: record:offer による entry 提案(capture flow)

**spec 期待**: sender が `record:offer` 送信(`title`/`body` + optional `source_url`/`captured_at`)→ host で payload validation + PendingOffer 化 → UI が accept/dismiss を user に提示 → accept なら entry mint(provenance body header injection 付き)、dismiss なら `record:reject` outbound 送信。

**実装 trace(inbound)**:

1. sender → `record:offer` envelope
2. `message-bridge.ts:112-141` — origin / PKC filter / validation
3. `message-bridge.ts:145-149` — target_id mismatch なら skip
4. `message-bridge.ts:164-166` — onMessage callback 呼び出し
5. `main.ts:403-422` — capability gate(`canHandleMessage('record:offer', embedded)`)、`mode='any'` なので standalone / embedded どちらも pass
6. `record-offer-handler.ts:157-178` — handler 呼び出し
   - `:122-143` — `validateOfferPayload`(title/body 必須 / size cap / archetype optional / source_url + captured_at type check / selection_text + page_title 受け取って結果に格納しない)
   - `:148-151` — `generateOfferId`
   - `:164-174` — `PendingOffer` 構築
   - `:176` — `SYS_RECORD_OFFERED` dispatch

**実装 trace(outbound: dismiss → reject)**:

1. user dismiss → reducer が `OFFER_DISMISSED` event 発行
2. `main.ts:437-446` — event listener
3. `bridgeHandle.sender.send(window.parent, 'record:reject', { offer_id, reason: 'dismissed' }, event.reply_to_id)` で送信(`:439-444`)

**Accept path**(本 audit では未 trace)**:

- spec §7.2.4 で「accept 時に body 先頭に provenance blockquote 注入」と明示
- 実装は reducer(おそらく `app-state.ts` の `ACCEPT_OFFER` case)で発生
- 本 audit では adapter/transport 層に絞ったため未確認 → §4 P1-1 で扱う

**実装状態**:
- ✅ inbound + dismiss outbound は完全に動く
- ⚠️ outbound `record:reject` は **`window.parent` に hardcode 送信**(`main.ts:440`)、cross-window context で fail のおそれ → §4 P1-2
- ⚠️ accept path の body header injection は本 audit 未確認 → §4 P1-1

**Production 観点**:
- **`main.ts:402` で `allowedOrigins: [window.location.origin]` の same-origin only hardcode** → 別origin の sender(Extension / launcher / parent page)は **全 reject** → §4 **P0-1**
- body size cap 256 KiB(`record-offer-handler.ts:127` `BODY_SIZE_CAP_BYTES = 262144`)、画像/markdown rich content では超過の可能性あり → §4 P0-2

### 3.3 Flow 3: export:request による snapshot 取得

**spec 期待**: sender が `export:request`(embedded-only)→ host が container を rendered HTML 1 枚に圧縮 → `export:result` で sender(`MessageEvent.source`)に返却。

**実装 trace**:

1. sender → `export:request` envelope
2. `message-bridge.ts` — origin / PKC filter / validation(同上)
3. `main.ts:409` — `canHandleMessage('export:request', embedded)` check
   - `embedded === true` のみ pass(`capability.ts:50`、`mode='embedded-only'`)
   - standalone 時は **bridge 段階で reject**(spec §7.5.3 の防止対策が機能)
4. `export-handler.ts:43-73` — handler 呼び出し
   - `:47-50` — `ctx.container` 存在確認
   - `:52` — payload から `filename` optional 抽出
   - `:55` — async `buildExportHtml(ctx.container)` 実行(圧縮 + HTML 化)
   - `:56` — `generateExportFilename` で final filename 決定
   - `:58-62` — `ExportResultPayload`(`html` / `filename` / `size`)構築
   - `:64-69` — `ctx.sourceWindow` に `export:result` を送信

**実装状態**: ✅ **完全に動く**

**Production 観点**:
- `embedded` detection が正しく動くか(`main.ts:449`、`embed-detect.ts`)
- HTML size が大きい場合の postMessage data 制限は spec §7.5.2 で警告のみ、実装では no-op

## 4. 躓くであろう点リスト

### 4.1 P0: Integration ブロッカー

#### P0-1: Origin allowlist の same-origin only hardcode

- **場所**: `main.ts:402` 付近
  ```ts
  allowedOrigins: [window.location.origin],
  ```
- **問題**: 別 origin の sender(別 PRJ Extension content script / launcher / parent page)からのメッセージは bridge の origin check(`message-bridge.ts:129-132`)で **全 reject**。別PRJ モックアップが file:// / chrome-extension:// / 別ホストで動く場合、physically blocking。
- **spec での扱い**: §3.3 / §3.4 で「production deployment では allowedOrigins を明示設定すべき」と policy 宣言済み、ただし **runtime 設定経路は未定義**(spec §3.4 で「具体値の選定は implementation PR で別途」と明示)。
- **推奨対応**:
  - **短期(mockup unblock)**: `BridgeOptions.allowedOrigins` に 配列 直接指定する形を維持しつつ、`main.ts:402` を「app-level config / build-time constant / env var」のいずれかから読む形に開放
  - **中期(production)**: provider function pattern(`allowedOrigins: () => string[]`)で runtime / boot-time に拡張可能化
  - **spec 側**: 既に deferred 済みなので追加変更なし、docs に「allowlist setup checklist」を追加

#### P0-2: record:offer の body size cap が用途次第で小さい

- **場所**: `record-offer-handler.ts:127`(`BODY_SIZE_CAP_BYTES = 262144` = 256 KiB)
- **問題**: 別PRJ モックアップが web clipper 系 / AI summary 系で長文 markdown を送る場合、256 KiB を超える可能性。spec 上は asset embed 禁止(§6.3.2)で plain text 前提だが、URL link rich + table + heading の markdown ではあり得る。
- **spec での扱い**: 明示 size cap(§7.2.2 / `record-offer-capture-profile.md` §9.3)。
- **推奨対応**:
  - **確認**: 別PRJ モックアップが想定する typical capture size を確認 → 256 KiB で足りるか検証
  - **足りない場合**: `BODY_SIZE_CAP_BYTES` 引き上げ + spec(`record-offer-capture-profile.md` §9.3)同期、non-breaking change として 1 PR で着地可能

### 4.2 P1: Integration 困難

#### P1-1: Body header injection 位置が docs で曖昧

- **場所**: spec §7.2.4 で「accept 時に body 先頭に provenance blockquote 注入」と明示、実装 location が未明記。reducer の ACCEPT_OFFER case と推定されるが、本 audit では adapter/transport 層に scope を絞ったため未 trace。
- **問題**: 別PRJ implementer が「injection はどの layer で発生?」を spec / docs から見つけにくい。reducer か別 helper か曖昧。
- **spec での扱い**: §7.2.4 で挙動明示、実装 layer は未明記(spec の責任ではないが integration guide には欲しい)。
- **推奨対応**: spec / `record-offer-capture-profile.md` §10 に **「injection は reducer ACCEPT_OFFER 時点で発生」** を 1 行追加(docs-only)。

#### P1-2: record:reject outbound 送信先が `window.parent` 固定

- **場所**: `main.ts:440`
  ```ts
  bridgeHandle.sender.send(window.parent, 'record:reject', ...)
  ```
- **問題**: PendingOffer に sourceWindow が保持されておらず(`record-offer-handler.ts:99-118` の interface に該当 field なし)、dismiss 時の reject 送信で sender window を復元できない。`window.parent` 固定では:
  - cross-window scenario(同 origin 多 tab で iframe 親が sender でない場合)で reject が届かない
  - standalone(top-level)PKC2 に対する sender が iframe 子の場合 unreachable
- **spec での扱い**: §7.4 で「host → sender」direction、`MessageEvent.source` 経由を spec は assume(§3.2)。実装で sourceWindow を thread していないのは spec drift。
- **推奨対応**:
  - PendingOffer に `reply_to_window: Window | null` を additive 追加
  - `record-offer-handler.ts:164-174` で `ctx.sourceWindow` を threaded
  - OFFER_DISMISSED event payload に sourceWindow を含める
  - `main.ts:440` で event.sourceWindow を使う(fallback で `window.parent` を維持してよい)
- **PR 規模**: ~20-30 行(type + 1 reducer + 1 handler edit)

#### P1-3: `null` origin opt-in の audit trail が無い

- **場所**: `message-bridge.ts:123-126` で `origin === 'null'` の特別扱い実装済み(明示 opt-in なしでは reject)
- **問題**: file:// / sandboxed iframe 経由の sender を受け入れるかは security 判断、`allowedOrigins` に明示的に `'null'` を含めない限り reject される設計。これは正しいが、audit log が無いため「いつ誰が `'null'` を allowlist に加えたか」が code review でしか追えない。
- **spec での扱い**: `record-offer-capture-profile.md` §9.2 で明記、design は OK。
- **推奨対応**:
  - **production checklist**(integration guide doc): `allowedOrigins` に `'null'` を含めるとき code review で必ず確認
  - `'null'` 受理時に boot log に warning を出す helper を追加(small)、optional

### 4.3 P2: あった方がよい(deferred 確認)

#### P2-1: handler-level rejection の error-code enum

- **場所**: `message-handler.ts:81-82`(console.warn のみ)、`record-offer-handler.ts:159-161`(false return)
- **状況**: spec §8.2 で「logging-only、明示 error-code enum なし」と intentional。§11.2 で inbound error response が deferred。
- **判断**: **spec 通りで OK**、実装変更不要。sender 側は「応答無し = reject」の fire-and-forget 設計を採る。

#### P2-2: record:accept 未 wire

- **場所**: `envelope.ts:48`(KNOWN_TYPES に含む)、`capability.ts` の MESSAGE_RULES に未登録
- **状況**: spec §7.3 / §11.3 で「type 予約のみ、outbound sender 未実装」と intentional deferred。sender が「offer accept されたか」を知る use case は §11.3 で「polling(export:request)or hook subscription(§11.1)」で operationalize 推奨。
- **判断**: **spec 通りで OK**、別PRJ モックアップが accept 確認を強く要求する場合のみ再検討。

#### P2-3: correlation_id / idempotency / dedup なし

- **場所**: 実装に無し(spec §11.6 で deferred)
- **状況**: at-most-once delivery、retry 時の重複は sender 側で抑止が必要(直前 N 秒以内同 title+body 送信を sender が止める運用)。
- **判断**: **spec 通りで OK**、v2 で correlation_id 導入を再検討。

## 5. 最小実装 Priority List

### 5.1 必須(Must)— integration が物理的に不可能な箇所

#### Must-1: Origin allowlist の runtime flexibility(P0-1 解消)

- **想定実装**: 
  - `BridgeOptions.allowedOrigins` の型を `string[]` から `string[] | (() => string[])` に拡張(backward compat 維持)
  - `main.ts:402` の hardcode を「app-level config provider」に置き換え(build-time constant / env var / settings entry のいずれか)
- **影響範囲**: envelope contract 不変、type 拡張 + mount site 1 箇所のみ
- **行数目安**: ~40-50 行(type + helper + tests)
- **1 PR で着地**: ✅ Yes、non-breaking additive

#### Must-2: record:reject sourceWindow threading(P1-2 解消)

- **想定実装**:
  - PendingOffer interface に `reply_to_window: Window | null` を additive 追加
  - `record-offer-handler.ts:164-174` で `ctx.sourceWindow` を threaded
  - OFFER_DISMISSED event に sourceWindow を含める
  - `main.ts:440` で event.sourceWindow を使う(fallback `window.parent` 維持)
- **影響範囲**: PendingOffer type + 1 handler + 1 reducer event payload + 1 listener
- **行数目安**: ~20-30 行(type + 各 location 微小編集 + tests)
- **1 PR で着地**: ✅ Yes、non-breaking
- **注意**: Window object は serialize 不可なので、PendingOffer を IndexedDB persist する layer がある場合 in-memory only field として扱う必要あり

### 5.2 推奨(Should)— production の integration には欲しい

#### Should-1: Body header injection の docs 明確化(P1-1 解消)

- **想定実装**: `record-offer-capture-profile.md` §10 に「injection は reducer ACCEPT_OFFER 時点で発生、reducer code path は `app-state.ts:<line>`」と 1 行明記。または spec §7.2.4 に同様の追記。
- **影響範囲**: docs-only
- **行数目安**: ~5-10 行
- **1 PR で着地**: ✅ Yes

#### Should-2: Integration guide doc 新設

- **想定実装**: `docs/integration/message-bridge-setup.md`(NEW)を新規作成、以下を含める:
  - Basic setup 例(allowedOrigins 設定、mount 時の bridge 取得)
  - allowlist 設定 pattern(hardcode / env / provider function)
  - 典型 sender flow walkthrough(ping/pong → record:offer → pending UI)
  - Capability negotiation rule(pong の `capabilities` のみ参照)
  - Common pitfalls(origin mismatch / size cap / embedded-only / null origin opt-in)
- **影響範囲**: docs-only(`docs/integration/` ディレクトリは新設なら別途作成)
- **行数目安**: ~200-250 行
- **1 PR で着地**: ✅ Yes
- **配置**: `docs/integration/` を新設 vs `docs/spec/` に置く vs `docs/manual/extensions/` に置くの判断は別途。canonical refs の所在から `docs/spec/` 配下が無難?

### 5.3 任意(Could)— あった方がよいが Defer 継続でも OK

#### Could-1: handler-level error code 体系化

- **状況**: spec §8.2 で intentional logging-only、§11.2 で deferred 化済み
- **判断**: 別PRJ モックアップから「reject 理由が知りたい」要望が出るまで保留

#### Could-2: ping payload の validation + debug log

- **状況**: spec §5.4 で「sender-side capability advertise は v1 で未定義」と明示。ping payload は無視するのが正
- **判断**: debug log を出すこと自体は無害だが、新たな contract を作らないため deferred で OK

#### Could-3: `null` origin 受理時の boot log warning

- **状況**: §4 P1-3 の対応として「audit trail を残す」目的で boot log に warning を出す helper を追加可能
- **判断**: docs(integration guide)で十分カバーできるなら不要、別PRJ deployment が file:// / sandbox を使う場合のみ追加検討

## 6. 推奨 PR 順序(audit 着地後の follow-up)

audit doc 着地(本 PR)→ 別PRJ モックアップ受領 → §7 追補の有無を見て下記順を確定。**最低でも PR-A / PR-B / PR-C の 3 件は確実に必要**(§5.1 Must-1 / Must-2 + 関連 docs 同期)。PR-D / PR-E は §7 mockup 受領後に確定。

### PR-A: [docs] audit findings の spec / docs 反映

**内容**:
- `docs/spec/pkc-message-api-v1.md` §3.4 に「runtime allowlist provider pattern(provider function)」セクション追加 → P0-1 / Must-1 の準備
- `docs/spec/record-offer-capture-profile.md` §10 に「body header injection は ACCEPT_OFFER reducer 時点で発生」を 1 行明記 → P1-1 / Should-1
- 必要なら spec §7.2.5 に reject outbound の sourceWindow threading 仕様を明記 → P1-2 / Must-2 の準備

**diff 規模**: ~50-80 行(2-3 docs)
**実装ゼロ**: docs-only
**順序の根拠**: spec が先に決まれば src PR の review が「spec 通りに書けているか」で自動的に判定可能

### PR-B: [src + tests] Must-1 — Origin allowlist runtime flexibility

**内容**:
- `BridgeOptions.allowedOrigins` 型拡張(`string[] | (() => string[])`)
- `main.ts:402` を provider function 経由に置換、build-time constant / env / settings 連携(具体は実装時に確定)
- `tests/adapter/transport/message-bridge.test.ts` に provider pattern の単体 test 追加

**diff 規模**: ~40-60 行(src 30-40 + tests 10-20)
**影響**: backward compat 維持(`string[]` 直接渡しも動く)
**順序**: PR-A merge 後、spec が provider pattern を canonical 化してから着手

### PR-C: [src + tests] Must-2 — record:reject sourceWindow threading

**内容**:
- `record-offer-handler.ts` PendingOffer interface に `reply_to_window` 追加(in-memory only)
- handler で `ctx.sourceWindow` を threaded
- OFFER_DISMISSED event payload に sourceWindow 追加
- `main.ts:440` で event.sourceWindow を優先(fallback `window.parent` 維持)
- `tests/adapter/transport/record-offer-handler.test.ts` に sourceWindow threading の test 追加

**diff 規模**: ~30-50 行(type + handler + reducer + listener + tests)
**影響**: non-breaking、IDB persist 層は触らない(in-memory only field)
**順序**: PR-A merge 後 / PR-B と並走可能(独立 file 群)

### PR-D: [docs] Integration guide(Should-2)

**内容**:
- `docs/integration/message-bridge-setup.md`(NEW、~200-250 行)
- §1 Basic setup / §2 allowedOrigins 設定 pattern / §3 typical sender flows / §4 capability negotiation / §5 common pitfalls
- canonical refs: spec / record-offer-capture-profile / 本 audit

**diff 規模**: ~200-250 行(1 new doc + INDEX entry)
**順序**: PR-B + PR-C merge 後(integration guide は実装と同期して書く)

### PR-E: [audit 改訂] mockup-driven gap 追補(§7 expand)

**内容**:
- 別PRJ モックアップ HTML 受領後、本 audit doc §7 を埋める
- 実 sender が使う message type / payload / origin / flow を整理、spec / 実装との差分を追補
- 必要なら追加の Must / Should を identify、PR-F 以降の slot を作る

**diff 規模**: ~100-150 行(本 audit doc の §7 expand)
**実装ゼロ**: docs-only
**順序**: 別PRJ から HTML 受領後、最優先で着手

## 7. Mockup-driven gap(別PRJ HTML 受領後の追補、2026-04-26)

別PRJ「PKCにAIを住まわせる会」から **PKC-Message Companion v0** mockup HTML を受領 → §6 PR-E の予告通り、本 §7 を expand。**重要**: mockup は spec §5.2 / §5.3 の例示と整合しており、PKC2 実装側が drift していることが判明。本セクションでは PKC2 側の API ルール / 標準実装に関する **決定** を含む(spec / 実装の更新は次 PR で)。

### 7.1 Mockup の構成

PKC-Message Companion v0(単一 HTML、~30 KB):

- **2 mode 切替**: `?mode=harness` で top-level(parent / PKC2 host のモック)、`?mode=sender` で iframe(child / sender、本来 PKC2 が host する企画形)
- **harness は self-iframe**: 同じ HTML を `?mode=sender` で iframe 化、parent ↔ iframe の postMessage を mock
- **5 message type compose form**: `ping` / `record:offer` / `export:request` / `navigate` / `custom`
- **Bad envelope 6 preset**: `RejectCode` enum の 6 値(NOT_OBJECT / WRONG_PROTOCOL / WRONG_VERSION / MISSING_TYPE / INVALID_TYPE / MISSING_TIMESTAMP)を 1 button ずつ
- **Capability advertise UI**: harness 側で `record:offer` / `export:request` / `navigate` / `custom` を checkbox で advertise on/off(spec §5.2 通り、message-type 名 with colon)
- **Accept policy 3 値**: `manual`(spec §6.2 default)/ `auto-accept`(debug)/ `auto-dismiss`(debug、§6.2 違反を体感)
- **Forward-compat probe**: `record:offer` form に "extra payload fields" textarea(unknown field 黙殺の §9.4 を probe)
- **Sender postMessage**: `window.parent.postMessage(env, '*')`(targetOrigin = `'*'`、receiver 側 PKC2 の allowedOrigins が gating)
- **Non-envelope control channel**: `{ kind: 'sender-ready' }` で harness が iframe boot を観測(`isPkcMessage` filter で envelope path に到達せず安全)

### 7.2 確認済み(本 audit §3-§5 と一致)

| Finding | 確認結果 |
|---|---|
| **§3 Flow 1 ping/pong** | mockup の sender が ping → bridge 自動 pong → `pong.payload.<capabilities>` を見て type 判定する想定。spec §5.1 / §7.1 通り。 |
| **§3 Flow 2 record:offer** | sender → host で title/body 必須、size cap 認知(byte counter 262144 で red 化)、`extra` field 経由で §9.4 forward-compat を probe。spec §7.2 通り。 |
| **§3 Flow 3 export:request** | mockup harness は `embedded` checkbox を持ち、`canHandleMessage` の embedded-only gate を mock 実装で再現。spec §7.5.3 通り。 |
| **§4 P0-1**(allowedOrigins hardcode)| mockup sender 側は `'*'` で送信、PKC2 host 側 allowedOrigins が gating。production で「PKC2 が iframe を host」なら same-origin で works、それ以外なら audit 通り blocker。**確認、変更なし**。 |
| **§4 P0-2**(body size cap)| mockup は byte counter で 262144 を red 化、**limit を spec 通り尊重**。AI 協働会 implementer も認知済み。**追加対応不要**。 |
| **§4 P1-2**(record:reject `window.parent` hardcode)| mockup は `record:reject` を `window.parent` から受信前提。production で companion iframe ↔ PKC2 parent なら works、cross-window context で fail する audit 結論は変わらず。**Must-2 で対応**。 |
| **§4 P2-x**(deferred 確認)| spec §11 deferred 項目について mockup から追加要望なし。すべて spec 通り deferred 継続で OK。 |

### 7.3 NEW finding(mockup-driven、本 audit に追加)

#### NEW P0-3: CAPABILITIES vocabulary drift(integration UX ブロッカー)

**事象**:

| 出所 | vocabulary |
|---|---|
| **PKC2 実装** `release-meta.ts:104-110` | `['core', 'idb', 'export', 'record-offer']`(kebab-case、内部 feature flag + 1 message type 混在) |
| **spec §5.2 example** | `'record:offer' / 'export:request' 等`(colon 区切り、message-type 名) |
| **mockup default advertise** | `record:offer` / `export:request` / `navigate` / `custom`(colon 区切り、message-type 名) |

**問題**: mockup(spec 通り)は pong の `capabilities` array で `'record:offer'` を探す → PKC2 は `'record-offer'`(ハイフン)を返す → mockup が「PKC2 は record:offer 非対応」と誤判定。実際の `MESSAGE_RULES` gate は `'record:offer'` で受理するため envelope 自体は通るが、**defensive な sender なら "advertised されていない type は送らない" 設計を採るため UX 上 broken に見える**。

**スコープ**: PKC2 側の実装が spec から drift。mockup ではない。

**判定**: **NEW P0-3、Must-3 として priority list 入り**(本 audit §5 を §7.5 で改訂)。

#### NEW finding F: navigate / custom の handler 未登録

**事象**:
- mockup は capability checkbox UI に `navigate` / `custom` を持つ(off by default)
- PKC2 は `KNOWN_TYPES`(`envelope.ts:44-54`)に両方含むが、**handler は未登録**
- spec §7.6 / §7.7 で「handler 任意登録」と明示、unhandled type は `message-handler.ts:81-82` で console.warn(handler-level rejection)

**判定**: **PKC2 側の advertise vocabulary 改訂時、handler 未登録の type は advertise しない** ルールを §7.4 Decision 2 で固定。これにより mockup が advertise 列を見て type 送信を判定する運用が壊れない。

#### NEW finding G: All 6 RejectCode preset 全部カバー

**事象**:
- mockup の "bad envelopes" tab に 6 個 button(NOT_OBJECT / WRONG_PROTOCOL / WRONG_VERSION / MISSING_TYPE / INVALID_TYPE / MISSING_TIMESTAMP)
- PKC2 の `validateEnvelope`(`envelope.ts:62-109`)の検査順序と完全一致

**判定**: 互換性 OK。**追加対応不要**。

#### NEW finding H: forward-compat probe 通過

**事象**:
- mockup `record:offer` form に "extra payload fields" textarea(任意 JSON を payload に追加)
- PKC2 の `record-offer-handler.ts:122-143` は known field のみ extract → unknown field は黙殺

**判定**: spec §9.4 Unknown Field Handling 通り。**追加対応不要**。

#### NEW finding I: Non-envelope control channel(`{ kind: 'sender-ready' }`)

**事象**:
- mockup harness と sender iframe が `{ kind: 'sender-ready' }` 等の non-envelope オブジェクトで boot 通知
- PKC2 の `isPkcMessage` filter で envelope path には到達せず安全に drop

**判定**: spec compliance 良好(non-PKC message を silent ignore)。**追加対応不要**。

### 7.4 Decisions(PKC2 project lead としての決定、別 Claude に伝える内容)

> **これは spec を進化させる、または PKC2 実装を spec に揃えるための決定です**。別PRJ 側 mockup は spec §5.2 / §5.3 の通りに書かれており「mockup が正、PKC2 実装が drift」が判明。以下は次の docs / src PR でそのまま実行されます。

#### Decision 1: PongProfile.capabilities vocabulary は **message-type 名(colon 区切り)に限定**

- **正**: `pong.payload.capabilities: string[]` の各 element は `KNOWN_TYPES`(spec §4.1)に含まれる文字列のみ
- **誤(現行 PKC2)**: `'core'` / `'idb'` のような内部 feature flag を混ぜる
- **理由**: sender が「自分が送れる type」を判定する array であり、内部実装フラグは sender に無関係
- **mockup との整合**: ✅ mockup は spec 通り、PKC2 を mockup に合わせる(= spec に合わせる)

#### Decision 2: 「Advertise する type は handler が登録されている type に限定」

- **正**: `MESSAGE_RULES`(`capability.ts:49-52`)に登録 + handler 実装あり、または bridge 層完結(ping/pong)
- **誤**: KNOWN_TYPES 全列挙(handler 未登録の `navigate` / `custom` まで広告)
- **特別ケース**: `ping` / `pong` は protocol primitive、advertise しない(常時利用可能、sender は ping から始める)
- **PKC2 v1 結果**: `capabilities = ['record:offer', 'export:request']`(2 item)

#### Decision 3: spec §5.2 / §7.1 に **vocabulary rule を明文化**(別 PR で実装)

- 現 §5.2 は example のみ(`'record:offer' / 'export:request' 等`)、normative rule 不在
- **新 normative**: 「`PongProfile.capabilities` は message-type 名(colon 区切り、`KNOWN_TYPES` 部分集合)、handler 登録 + 利用可能な type のみを列挙する。`ping` / `pong` は protocol primitive のため列挙しない」

#### Decision 4: build / about 用の internal feature flag は **別 constant に分離**

- 現 `CAPABILITIES`(`release-meta.ts:105-110`)は build メタデータと PongProfile の 2 用途で oversharing
- **新方針**: PongProfile.capabilities は **`MESSAGE_RULES` から派生**(または専用 `MESSAGE_CAPABILITIES` array)、build メタデータは `BUILD_FEATURES` 等の別 constant
- **互換性**: about page / pkc-meta json は内部 metadata 用途なので external API ではない、改名 OK

### 7.5 改訂後 priority list(§5 を更新)

#### 必須(Must)— 別PRJ mockup integration の unblock

| 旧 ID | NEW ID | 内容 | 行数目安 |
|---|---|---|---|
| Must-1 | Must-1 | Origin allowlist runtime flexibility(P0-1)| ~40-60 行 |
| Must-2 | Must-2 | record:reject sourceWindow threading(P1-2)| ~30-50 行 |
| **新規** | **Must-3** | **CAPABILITIES vocabulary alignment**(NEW P0-3)| ~30-50 行 |

**Must-3 の実装スケッチ**:
- `release-meta.ts`: `CAPABILITIES` を `MESSAGE_CAPABILITIES = ['record:offer', 'export:request']` に置換、build 用は別 constant に
- `profile.ts:55-63`: `buildPongProfile` の `capabilities` source を切り替え
- builder / about: 旧 `CAPABILITIES` 参照を新 constant 名に追従
- tests: pong payload の `capabilities` array が新 vocabulary を返すことを pin

### 7.6 改訂後 PR 順序(§6 を更新)

```
PR-E1: [docs] 本 audit §7 expand(本 PR)+ spec §5.2/§7.1 vocabulary rule 明文化
PR-A:  [docs] record-offer-capture-profile §10 body header injection 位置明文化(Should-1)
PR-B:  [src + tests] Must-1 — allowedOrigins runtime flexibility
PR-B': [src + tests] Must-3 — CAPABILITIES vocabulary alignment(NEW)
PR-C:  [src + tests] Must-2 — record:reject sourceWindow threading
PR-D:  [docs] Integration guide(NEW docs/integration/...)
```

PR-E1 が **本 PR**、merge 後に PR-A / PR-B / PR-B' / PR-C を順次着地、最後に PR-D で integrator 向け文書を仕上げる。

### 7.7 別 Claude(別PRJ AI 協働会)への message

> 本 audit + spec §5.2 / §7.1 改訂(本 PR)の通り、**mockup は spec §5.2 通りで正しい**。PKC2 側の実装が drift しており、Must-3(PR-B')で実装を mockup の vocabulary(`'record:offer'`、`'export:request'`)に揃える。
>
> mockup 側で **追加対応必要なし**。次の動き:
>
> 1. PKC2 側 PR-A〜PR-D 着地まで mockup を **そのまま保持**
> 2. PR-B(allowedOrigins)着地後、production deployment で companion iframe を PKC2 origin で host する設定例を docs/integration で提供予定
> 3. PR-B'(CAPABILITIES alignment)着地後、`pong.capabilities` が mockup の advertise UI 期待値と整合する
> 4. PR-C(sourceWindow threading)着地後、cross-window context での `record:reject` 受信が安定
>
> mockup の HTML 中に markdown auto-link 化 artifact(`[ev.target](http://ev.target)` 等)があったため、execute するときは clean copy が必要(audit reference 用には保持)。

## 8. References

- `docs/spec/pkc-message-api-v1.md`(v1 spec、canonical reference)
- `docs/spec/record-offer-capture-profile.md`(record:offer の詳細)
- `docs/development/transport-record-reject-decision.md`(Option A: sender-only)
- `docs/development/pkc-message-hook-subscription-decision.md`(Defer 決定)
- `src/adapter/transport/*.ts`(7 file の実装)
- `src/main.ts`(bridge mount + handler 登録 wiring)
- `src/runtime/release-meta.ts`(CAPABILITIES / VERSION / SCHEMA_VERSION)

---

**Status footer**: 本 audit は 2026-04-26 に accepted。docs-only PR で着地後、follow-up §6 の PR 順序に従って実装に進む。§7(mockup-driven gap)は user から HTML 受領次第別 PR で追補。
