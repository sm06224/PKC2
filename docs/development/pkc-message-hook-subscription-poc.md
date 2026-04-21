# PKC-Message Hook Subscription — PoC Design (docs-only)

> **📌 canonical pointer（2026-04-21 時点）**
>
> - **canonical entry point**: `pkc-message-hook-subscription-decision.md`
> - **current decision**: **Defer**（PoC 着手は保留）
> - **優先される proof path**: polling などの simpler な手段を先に通す
>
> 本文書は PoC 設計の価値を保ち続けるが、**現時点で着手すべき PoC ではない**。
> Defer 期間中は凍結保存とし、実装判断を再開するときはまず decision doc を読むこと。

**Status**: PoC design — 2026-04-20. **本 PR は実装を含まない**。
**Purpose**: `pkc-message-hook-subscription-acceptance.md` の受理条件を**一切拡張せず**に満たす **最小 PoC 実装**の設計を提示する。これは実装判断のための材料であり、本書の merge は実装着手の承認ではない。
**Baseline**: acceptance contract に従う。制約が競合する場合 acceptance を優先する。

---

## 0. TL;DR

- **対象**: relation 系 3 event のみ / embedded-only / memory-only / TTL ≤ 24h / projection 必須 / initial-graph snapshot のみ
- **層**: `adapter/transport/` に 3 ファイル追加（registry / projector / handler）。core / features / runtime 無変更
- **フロー**: `ping` → `hook:subscribe` → `hook:subscribed (+ snapshot?)` → `hook:event ...` → `hook:unsubscribe`
- **性能・堅牢性**: at-most-once / 順序保証なし / persistence なし / batching なし / retry なし（§6 Explicit Limitations）
- **Kill switch**: `canHandleMessage('hook:subscribe', ...)` の allow-list 除外 1 行で無効化可能

---

## 1. Scope of PoC

### 1.1 対象イベント: relation 系のみ
- `relation.created` / `relation.updated` / `relation.deleted` の 3 種だけ
- entry / revision / asset / selection / phase は **PoC 範囲外**（acceptance §2.4 準拠）
- 内部 DomainEvent のうち `CREATE_RELATION` / `UPDATE_RELATION` / `DELETE_RELATION` 成立時だけ外向き event を発火

### 1.2 動作モード: embedded-only
- `capability.ts:MESSAGE_RULES` に追加するのは **`'hook:subscribe': { mode: 'embedded-only' }` のみ**
- standalone 実行（`embedded === false`）では `hook:subscribe` 自体を受信しない（`canHandleMessage()` で先に落とす）
- `hook:subscribed` / `hook:event` / `hook:error` は host → guest の出力専用、`hook:unsubscribe` は双方向だが INBOUND rule に入れない（subscription 成立後の動作なので registry 側で処理可否を判定）

### 1.3 Grant 永続性: memory-only
- subscription 情報は `Map<subscriptionId, ActiveSubscription>` に保持。リロード / 再 bootstrap で消失
- `IndexedDB` / `localStorage` / `container.*` には**絶対に**書き込まない
- trusted-origin allow-list / 永続 grant は PoC 非対象（acceptance §3.4）

### 1.4 許容する入力の極小集合
| 入力 | 許容 |
|------|------|
| `scope.type` | `'relation'` のみ |
| `scope.events[]` | `'relation.created'` / `'relation.updated'` / `'relation.deleted'` の部分集合 |
| `scope.filter` | PoC では **無視**（実装はするが value は未使用、仕様だけ残す）|
| `projection[]` | `['id','from','to','kind','created_at','updated_at']` の部分集合（非空） |
| `ttl` (ms) | `1 <= ttl <= 86_400_000` |
| `snapshot` | 省略 or `'initial-graph'` のみ |

上記を外れた `hook:subscribe` は **`hook:error` で reject**。許容集合の列挙が closed set で済むのが PoC の肝。

### 1.5 非対象（acceptance §3 から PoC にも継承）
- 汎用 event bus 化 / DomainEvent 直接露出 / `hook:list` / 永続 grant / body・revision・asset の露出 / `custom` 相乗り / graph コア取り込み / subprotocol 層導入

## 2. Minimal Message Flow

### 2.1 Happy path（タイムライン）

```
guest (host アプリ)                    host (PKC2)
─────────────────────                  ───────────
ping ─────────────────────────────────▶
                              ◀───────── pong
hook:subscribe ───────────────────────▶
  { scope, projection, ttl, snapshot? }
                              ◀───────── hook:subscribed
                                         { subscriptionId, expiresAt,
                                           snapshot? (initial-graph) }
                              ◀───────── hook:event (relation.created)
                              ◀───────── hook:event (relation.updated)
                              ◀───────── hook:event (relation.deleted)
                                         ...（TTL 内）
hook:unsubscribe ─────────────────────▶
  { subscriptionId }
                              ◀───────── (registry 側で close / 送信停止)
```

### 2.2 TTL-expired path

```
...（TTL 経過）
                              ◀───────── hook:unsubscribe
                                         { subscriptionId, reason: 'ttl-expired' }
(registry から削除、以後 hook:event 発火なし)
```

### 2.3 Reject path

```
hook:subscribe ───────────────────────▶  // 例: projection が不正
                              ◀───────── hook:error
                                         { code: 'INVALID_PROJECTION', message }
(subscription は作成されない)
```

### 2.4 受信判定順序（adapter 側）
1. `envelope.ts:validateEnvelope()` → `type: 'hook:subscribe'` を `KNOWN_TYPES` が許す
2. `capability.ts:canHandleMessage('hook:subscribe', embedded)` → `embedded` が true でないと reject
3. `hook-subscribe-handler.ts` が payload を検証（scope / projection / ttl / snapshot）
4. 検証通過 → registry に登録 → `hook:subscribed` 送信 → snapshot 要求時のみ `snapshot` 埋め込み
5. 以降、`Dispatcher.onEvent()` 経由で relation DomainEvent が届くたびに projector を通して `hook:event` を送信

**ping/pong は既存処理のまま変更しない**。

## 3. Internal Architecture Mapping

### 3.1 追加ファイル（3 本）と責務
| ファイル | 責務 | 依存先 |
|----------|------|--------|
| `src/adapter/transport/hook-subscription-registry.ts` | in-memory subscription store / TTL タイマ / 送信 gate | `MessageBridge`（送信器） |
| `src/adapter/transport/hook-event-projector.ts` | DomainEvent → HookEventPayload の **pure 変換** | なし（`core/model/relation.ts` の型のみ import） |
| `src/adapter/transport/hook-subscribe-handler.ts` | `hook:subscribe` / `hook:unsubscribe` の受信処理・検証 | registry / projector |

### 3.2 既存ファイルへの最小変更
| ファイル | 変更 |
|----------|------|
| `src/adapter/transport/envelope.ts` | `KNOWN_TYPES` に `hook:subscribe` / `hook:subscribed` / `hook:event` / `hook:unsubscribe` / `hook:error` を追加 |
| `src/adapter/transport/capability.ts` | `MESSAGE_RULES` に `'hook:subscribe': { mode: 'embedded-only' }` を追加 |
| `src/adapter/transport/message-bridge.ts`（既存） | `hook:subscribe` / `hook:unsubscribe` 到着時に `hook-subscribe-handler` へ routing |
| `src/main.ts` | boot 時に `Dispatcher.onEvent()` を registry の relation event bridge に接続（subscription が 1 本もなければ no-op） |

### 3.3 変更しないファイル（acceptance §1.2 準拠）
- `core/**` — Container / Entry / Relation / Revision の schema・operations は一切変更しない
- `features/**` — pure 関数層には触らない
- `adapter/state/**` — reducer / Dispatcher API は変更しない
- `runtime/**` — build 定数は無変更

### 3.4 Dispatcher.onEvent の tap
```
main.ts boot:
  const dispatcher = createDispatcher(...)
  const registry = createHookSubscriptionRegistry(bridge)
  dispatcher.onEvent((event) => {
    if (event.type === 'RELATION_CREATED' ||
        event.type === 'RELATION_UPDATED' ||
        event.type === 'RELATION_DELETED') {
      registry.dispatchRelationEvent(event)  // ← registry 内で各 subscription に projector 経由で送信
    }
    // その他の event は無視（PoC ではホストに流さない）
  })
```
- subscription 0 本 / relation 系以外の event は early return、既存実行経路に影響を出さない
- `onEvent` の返り値（unsubscribe 関数）は main.ts の lifetime で保持（ページ生涯）

### 3.5 Projection の適用点
```
registry.dispatchRelationEvent(internalEvent):
  for (sub of activeSubscriptions):
    if (!sub.scope.events.includes(internalEvent.type.toLowerCase())) continue
    if (Date.now() > sub.expiresAt) { close(sub, 'ttl-expired'); continue }
    const payload = projectRelationEvent(
      externalType(internalEvent.type),
      internalEvent.relation,
      sub.projection,
    )
    bridge.send(sub.origin, {
      protocol: 'pkc-message',
      version: 1,
      type: 'hook:event',
      timestamp: nowIso(),
      payload: { subscriptionId: sub.id, type, data: payload },
    })
```
- **projector 以外の経路で `hook:event` を作らない**。これが acceptance §3.2 / §4.1 の構造的担保。

## 4. Data Shape

v1 で**固定**の payload 型。`metadata` は含めない（acceptance §4.2）。

### 4.1 `hook:subscribe` payload（guest → host）
```ts
interface HookSubscribePayload {
  scope: {
    type: 'relation';
    events: ReadonlyArray<'relation.created' | 'relation.updated' | 'relation.deleted'>;
    filter?: { kind?: Relation['kind']; lid?: string };  // PoC では受理のみ、フィルタ未適用
  };
  projection: ReadonlyArray<'id' | 'from' | 'to' | 'kind' | 'created_at' | 'updated_at'>;
  ttl: number;  // ms, 1..86_400_000
  snapshot?: 'initial-graph';
}
```

### 4.2 `hook:subscribed` payload（host → guest）
```ts
interface HookSubscribedPayload {
  subscriptionId: string;  // UUID 相当
  expiresAt: string;       // ISO 8601
  snapshot?: InitialGraphSnapshot;
}

interface InitialGraphSnapshot {
  relations: HookRelationEventPayload[];
  endpoints: ReadonlyArray<{ lid: string; title: string }>;
}
```

### 4.3 `hook:event` payload（host → guest）
```ts
interface HookEventPayload {
  subscriptionId: string;
  type: 'relation.created' | 'relation.updated' | 'relation.deleted';
  data: HookRelationEventPayload;
}

interface HookRelationEventPayload {
  id: string;
  from: string;
  to: string;
  kind: 'structural' | 'categorical' | 'semantic' | 'temporal' | 'provenance';
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
  // projection で指定されたフィールドのみ最終送信時に含まれる
}
```

### 4.4 `hook:unsubscribe` payload（双方向）
```ts
interface HookUnsubscribePayload {
  subscriptionId: string;
  reason?: 'client-request' | 'ttl-expired' | 'host-shutdown';
}
```

### 4.5 `hook:error` payload（host → guest）
```ts
interface HookErrorPayload {
  code:
    | 'NOT_EMBEDDED'
    | 'INVALID_SCOPE'
    | 'INVALID_PROJECTION'
    | 'INVALID_SNAPSHOT'
    | 'INVALID_TTL'
    | 'TTL_EXCEEDED'
    | 'UNKNOWN_SUBSCRIPTION'
    | 'INTERNAL';
  message: string;
  subscriptionId?: string;  // 既存 subscription 関連のときのみ
}
```

### 4.6 Envelope（既存、無変更）
```ts
{
  protocol: 'pkc-message',
  version: 1,
  type: 'hook:subscribe' | 'hook:subscribed' | 'hook:event' | 'hook:unsubscribe' | 'hook:error',
  timestamp: string,  // ISO 8601
  payload: <上記のいずれか>,
}
```

## 5. Grant Model (PoC)

### 5.1 ActiveSubscription レコード
```ts
interface ActiveSubscription {
  id: string;             // subscriptionId (UUID)
  origin: string;         // 送信元 MessageEventSource を特定する key（refs §5.4）
  scope: HookSubscribePayload['scope'];
  projection: HookSubscribePayload['projection'];
  expiresAt: number;      // Date.now() base, ms
  createdAt: number;
}
```

### 5.2 In-memory store
```ts
const subscriptions = new Map<string, ActiveSubscription>()
```
- プロセス（タブ / iframe コンテキスト）の生存期間で保持
- リロード / navigate で失われる（**これは PoC の仕様**）
- container / localStorage / IndexedDB に一切書き込まない

### 5.3 Grant 判定（embedded-only）
```
if (!embedded) → hook:error { code: 'NOT_EMBEDDED' }
else → scope / projection / ttl / snapshot を検証
```
- user 承認ダイアログ / trusted-origin allow-list は PoC 範囲外
- 「embedded である」= 「ホストが PKC2 を iframe に埋め込んだ」= 埋め込み側が暗黙の grant 保持者

### 5.4 送信先の特定
- `message-bridge` は受信 `MessageEvent` の `event.source` を保持して subscription に紐付ける
- `source.postMessage()` が使えなくなったとき（host が detach 等）は次回送信失敗時に silent drop + registry から削除
- 複数 subscription が同じ source に載ってもよい（異なる subscriptionId として独立管理）

### 5.5 TTL 処理
```
subscribe:
  expiresAt = now + ttl
  schedule setTimeout(ttl) → close(id, 'ttl-expired')
unsubscribe:
  clearTimeout / delete from map
ttl-expired:
  send hook:unsubscribe { subscriptionId, reason: 'ttl-expired' }
  delete from map
```
- 最小実装: **`setTimeout` 1 本 / subscription**
- `hook:renew` / keep-alive は PoC 非対応
- ttl 上限（24h）を超える要求は `hook:error` で拒否

### 5.6 Snapshot 送出
```
if (payload.snapshot === 'initial-graph'):
  snapshot = {
    relations: container.relations.map((r) => projectRelationEvent('relation.created', r, projection)),
    endpoints: [...uniqLids(relations)].map((lid) => ({ lid, title: entryTitleOrEmpty(lid) })),
  }
```
- body / archetype / revisions / assets は**絶対に含めない**
- snapshot は `hook:subscribed` 1 メッセージに同梱。別メッセージに分割しない（PoC 簡素化）
- snapshot サイズ上限は PoC では設けない（acceptance §2.6 の閉じた構造で自然に抑えられる見積もり）

## 6. Explicit Limitations

PoC が**敢えてやらない**こと。すべて acceptance §3 / §6 の defer 枠と整合（acceptance §5 の Non-Responsibility Boundary による構造的担保も併用）。

### 6.1 配信保証: at-most-once
- 送信失敗（`postMessage` throw / target detach）時の **retry は行わない**
- 失敗した event は黙って drop（PoC では log だけ残す選択肢あり、ただし本番ログへの格納は行わない）
- guest 側が「流れてくる event を真実の source of truth」にしないことが前提

### 6.2 順序保証なし
- `relation.created` → `relation.updated` → `relation.deleted` の観測順が PKC2 内部の発火順と一致する保証を**しない**
- JavaScript single-thread + `Dispatcher.onEvent()` 同期発火で事実上は順序一致するが、**契約としては保証しない**
- guest は `id` / `updated_at` でキー付けして idempotent に処理する前提

### 6.3 バッチングなし
- 同一 event type を束ねて送る coalesce は PoC では実装しない（acceptance §2.7 は permit だが PoC では**省略**）
- bulk import / bulk delete 時に N 件の `hook:event` が逐次流れる
- これが性能問題になるか自体を PoC の判断材料として計測する

### 6.4 Persistence なし
- リロード / 再 boot で全 subscription 消失（acceptance §2.2 準拠）
- IndexedDB / localStorage / container 書込み一切なし

### 6.5 Reconnect / catch-up なし
- guest がしばらく postMessage を受けられなかった場合の差分配信なし
- 再 subscribe したら再度 snapshot を取り直す前提

### 6.6 認証・同意 UI なし
- trusted-origin allow-list / user 承認ダイアログは PoC 非対応（acceptance §3.4）
- "embedded === true" のみを grant 条件とする（最小）

### 6.7 監視・診断 API なし
- `hook:list` / `hook:stats` は PoC 非実装
- dev panel への可視化なし
- PoC では `console.debug` による軽い log だけを想定（production build での有効化は別判断）

### 6.8 filter の実適用なし
- `scope.filter.kind` / `scope.filter.lid` は payload としては受理するが**絞り込みは未実装**
- PoC では全 relation event をそのまま流す
- filter 実装は acceptance §2 を満たす範囲で v1 GA までの別 PR

### 6.9 PKC2 の責務外（Non-Responsibility Boundary — normative source: `acceptance §5`）
PoC が生み出すのは「通知」であって「同期基盤」ではない。**本項の normative source は acceptance contract §5（Non-Responsibility Boundary）** であり、以下は acceptance §5 の要点を PoC 向けに再掲したもの。矛盾が生じた場合は acceptance §5 が優先する。

- **外部ツールの状態整合**: PKC2 は保証しない。hook は片方向通知（acceptance §5.1）
- **再送・順序保証**: PKC2 は at-most-once / 順序保証なし（本書 §6.1 / §6.2、acceptance §5.2 / §5.3）
- **snapshot の完全性 / 履歴**: best-effort。送信中の更新は snapshot に含まれないか、次の `hook:event` で届くかのどちらか。購読前 event の replay は行わない（acceptance §5.4 / §5.10）
- **遅延上限**: PKC2 は送信遅延の上限を保証しない（acceptance §5.6）
- **ホスト側の idempotency 保証**: guest 側の責任。PKC2 は同一 event を複数回送らないが、再 subscribe による再送は起こりうる（acceptance §5.7）
- **grant の永続性 / cross-tool consistency / transactionality**: いずれも保証しない（acceptance §5.5 / §5.8 / §5.9）

この境界をまたがる要求は PoC / v1 / v2+ いずれでも PKC2 の責務ではない。上位レイヤ（host アプリ / 外部 broker）が担う。境界逸脱を求める仕様変更は **acceptance §5.11** に従い acceptance doc の改訂 PR を先行させること。

## 7. Kill Switch Strategy

### 7.1 第一手段: capability allow-list から除外（1 行）
```ts
// src/adapter/transport/capability.ts
const MESSAGE_RULES: Partial<Record<MessageType, MessageRule>> = {
  'export:request': { mode: 'embedded-only' },
  'record:offer':   { mode: 'any' },
  // 'hook:subscribe': { mode: 'embedded-only' },  ← この 1 行をコメントアウト
}
```
- これで `canHandleMessage('hook:subscribe', _) === false` となり、`hook:subscribe` が到着しても handler に届かない
- 既存 subscription は残らない（registry 初期化が走るため）
- 副作用最小。dist を再ビルドして配布するだけで全面停止
- **もっとも早い無効化手段**

### 7.2 第二手段: envelope の `KNOWN_TYPES` から除外
- `envelope.ts:KNOWN_TYPES` から `hook:*` 5 種を外すと、validator レベルで invalid になり `INVALID_TYPE` reject される
- guest 側に「明示的に拒否」のシグナルが返るので debug しやすい
- 第一手段でも機能停止はするが、envelope レベルで落とすと responder 側に payload が届かない

### 7.3 第三手段: registry を空実装に差し替え
```ts
// hook-subscription-registry.ts を呼び出し元で no-op 版にスワップ
// 例: main.ts
const registry = createNoopHookSubscriptionRegistry()
```
- Dispatcher.onEvent は tap されているが、registry.dispatchRelationEvent が no-op なので event は流れない
- subscribe には `hook:error { code: 'INTERNAL', message: 'Hook subscription disabled' }` を返す実装に切替
- capability 層は変えたくないが runtime 挙動だけ殺したい場合に使う

### 7.4 巻き戻し粒度
| 障害レベル | 手段 | 所要 |
|-----------|------|------|
| 最小（単発問題） | §7.1 の 1 行コメントアウト + rebuild | 分単位 |
| 中（プロトコル汚染疑い） | §7.2 で envelope 層から遮断 + rebuild | 分単位 |
| 大（security インシデント） | `git revert` で PoC 実装 PR 丸ごと戻す | PR revert 1 本 |

### 7.5 意思決定トリガー
以下のいずれかが観測されたら Kill Switch を**即座に発動**:
- hook:event による postMessage 大量送出でホスト側がハングする
- projection allow-list を回避する payload 漏洩が発見される
- DomainEvent の意図しないフィールドが外部に到達していると判明
- TTL を超える subscription がメモリに残留していると判明
- embedded=false の環境で subscription が成立する事象

### 7.6 Recovery
- Kill Switch 後の再有効化は、原因根絶を acceptance §1 の Review 反映前提 (P4-1 / P4-2) に従って改訂した上で、**別 PR** で行う
- 既存 PoC 実装をそのまま再投入することは**許可しない**

---

## 関連文書

- `docs/development/pkc-message-hook-subscription-review.md` — 懸念 5 点の源泉議論
- `docs/development/pkc-message-hook-subscription-acceptance.md` — 本 PoC が従う受理条件
- `docs/development/transport-record-reject-decision.md` — allow-list 運用の先行事例
- `src/adapter/transport/envelope.ts` — `KNOWN_TYPES` 拡張点
- `src/adapter/transport/capability.ts` — `MESSAGE_RULES` 拡張点
- `src/adapter/state/dispatcher.ts` — `onEvent()` tap 点
- `src/core/model/relation.ts` — HookRelationEventPayload の源となる公開フィールド

