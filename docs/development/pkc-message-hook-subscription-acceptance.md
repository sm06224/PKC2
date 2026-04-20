# PKC-Message Hook Subscription Protocol — Acceptance Contract (docs-only)

**Status**: acceptance contract draft — 2026-04-20. **本 PR は実装を含まない**。
**Purpose**: `docs/development/pkc-message-hook-subscription-review.md` で確立した「設計検討としては受理、実装受理はまだしない」という方針を、**PKC2 側が実装に踏み切るための受理条件集**へ変換する。実装 PR を起こす前に本書で定めた条件が **すべて** 満たされていることが前提となる。

---

## 0. TL;DR

- 本書は review（解釈の余地を残す議論）を **受理条件（contract）** に畳んだもの
- 条件を 1 つでも満たさない実装提案は **受理しない**（merge しない / 差し戻す）
- v1 の許容面積は意図的に極小：**embedded-only / memory-only / TTL 必須 / relation 系のみ / projection 必須 / snapshot は initial-graph のみ**
- 「PKC2 を generic event bus にしない」「core を汚染しない」の 2 点が最上位不変条件
- v2+ の拡張パスは本書に明記。条件を満たす前に v2 機能を v1 実装に混ぜない

---

## 1. Acceptance Preconditions（実装着手前に満たすべき条件）

実装 PR を起こす前に **以下すべて** が満たされていなければならない。1 つでも欠ければ差し戻す。

### 1.1 合意の前提
- **P1-1**: 提案側と本書の §2 / §3 について合意が取れている（repo 内文書への反映 or PR コメントログで追跡可能）
- **P1-2**: 外向き HookEventPayload スキーマが DomainEvent とは別の型として**文書化**されている（`docs/development/` 配下に別文書、あるいは本書の follow-up PR）
- **P1-3**: projection allow-list（許可フィールドの閉じた集合）が文書化されている

### 1.2 アーキテクチャ不変条件
- **P2-1 (Layer)**: 実装は `adapter/transport/` 配下に閉じる。`core/` / `features/` / `runtime/` に hook 概念を持ち込まない
- **P2-2 (Model)**: `core/model/` に新規データ型を追加しない（`Entry` / `Relation` / `Revision` / `Container` の schema を変更しない）
- **P2-3 (Dispatcher)**: 既存 `Dispatcher` / `AppState` / reducer 群の API を変更しない。hook 配信は `Dispatcher.onEvent()` の subscriber として **adapter 側で** 取り付ける
- **P2-4 (Envelope)**: `envelope.ts:KNOWN_TYPES` に `hook:*` 5 種を追加するのみ。`pkc-message` protocol / `version: 1` の意味論を変えない
- **P2-5 (Capability)**: `capability.ts:MESSAGE_RULES` への追加は `hook:subscribe` のみ。`hook:subscribed` / `hook:event` / `hook:unsubscribe` / `hook:error` はホスト→ゲストの**出力専用** or subscription 成立後のペア messsage であり INBOUND allow-list には入れない

### 1.3 テスト / ドキュメント前提
- **P3-1**: 実装 PR には transport 層の単体テストが **同梱** される（envelope / capability / projector / subscription lifecycle / TTL 経過 / projection allow-list 逸脱）
- **P3-2**: 実装 PR に spec 文書が含まれる（`docs/development/pkc-message-hook-subscription-v1.md` 相当、API / error code / projection allow-list / TTL 上限を明記）
- **P3-3**: `npm test` / `npm run build:bundle` がすべて pass していること、dist の size 差分をコミットメッセージに記録すること

### 1.4 Review 反映前提
- **P4-1**: `pkc-message-hook-subscription-review.md` §3 の 5 懸念（サブプロトコル扱い / grant 粒度 / `custom` 関係 / DomainEvent 分離 / snapshot scope）について、本書の §2〜§4 に記載された決定と**矛盾しない**実装であること
- **P4-2**: 矛盾が生じる場合は実装を見送り、本書の改訂 PR を先に起こす

## 2. Mandatory Constraints for v1（v1 実装の必須制約）

### 2.1 Grant モード: `embedded-only`
- `hook:subscribe` は `MESSAGE_RULES` 上 `mode: 'embedded-only'` として宣言
- `embedded === false`（standalone 実行）で受信したら **無条件で reject**（`hook:error` 応答 or 黙殺）
- `event.origin` による trusted-origin allow-list は **v1 では実装しない**（v2+）

### 2.2 Grant 永続性: `memory-only`
- subscription store は **メモリ上の `Map<subscriptionId, ActiveSubscription>` のみ**
- `IndexedDB` / `localStorage` / `container.assets` / `container.entries` への永続化は禁止
- リロード / セッション再初期化で全 subscription が失われることを仕様として許容（ホストが再 subscribe する責任）

### 2.3 TTL: 必須フィールド
- `hook:subscribe.payload.ttl` (ms) は **必須**。省略・非数値・≤0 は `hook:error` で拒否
- 上限: **24h (86_400_000 ms)**。超過は reject
- TTL 経過時、adapter 側のタイマで `hook:unsubscribe`（reason: `'ttl-expired'`）相当を自動送出し、subscription を store から削除

### 2.4 対象イベント: relation 系のみ
- v1 で配信する event type は次の 3 種に**限定**:
  - `relation.created`
  - `relation.updated`
  - `relation.deleted`
- 内部 DomainEvent のうち `CREATE_RELATION` / `UPDATE_RELATION` / `DELETE_RELATION` の成立時のみ上記 event を生成
- `entry.*` / `revision.*` / `asset.*` / `selection.*` / `phase.*` は **v1 では未対応**。subscribe で指定された場合は `hook:error` で reject

### 2.5 Projection: 必須
- `hook:subscribe.payload.projection` は **必須** フィールド（string[]）
- allow-list（relation event 用）:
  - `id` / `from` / `to` / `kind` / `created_at` / `updated_at`
- allow-list 外のフィールド名を含む subscribe は `hook:error` で reject
- projection が空配列の場合も reject（明示的に 1 つ以上を要求）

### 2.6 Snapshot: `initial-graph` のみ
- `hook:subscribe.payload.snapshot` は optional。受理する値は **`'initial-graph'` のみ**
- `initial-graph` の中身:
  - `relations: HookRelationEventPayload[]`（projection 適用済み）
  - `endpoints: { lid: string; title: string }[]`（relation の `from` / `to` に出現する entry の lid / title のみ）
- `body` / `archetype` / `revisions` / `assets` は **絶対に含めない**
- `'initial-entries'` / `'initial-revisions'` / `'initial-assets'` / その他の値は `hook:error` で reject

### 2.7 Throttle / Coalescing
- 同一 `subscriptionId` あたり `hook:event` の**最小送出間隔**を設ける（目安: 50 ms）
- bursty な bulk relation 変更では、同一 event type の payload を queue してまとめて送る（coalesce）
- adaptive backoff / priority queue は v1 では実装しない（v2+）

### 2.8 Message 型: 5 種のみ
| 方向 | 型 | 用途 |
|------|----|------|
| guest → host | `hook:subscribe` | 購読要求 |
| host → guest | `hook:subscribed` | grant 成立通知（subscriptionId / expiresAt / snapshot?） |
| host → guest | `hook:event` | イベント push |
| 双方向 | `hook:unsubscribe` | 撤回通知 |
| host → guest | `hook:error` | grant 拒否 / 期限切れ / invalid scope 等 |

**`hook:list` は v1 で実装しない**。

### 2.9 Error Code 固定集合
v1 で許容する `hook:error.payload.code` は以下の閉じた集合:
- `NOT_EMBEDDED` / `INVALID_SCOPE` / `INVALID_PROJECTION` / `INVALID_SNAPSHOT` / `INVALID_TTL` / `TTL_EXCEEDED` / `UNKNOWN_SUBSCRIPTION` / `INTERNAL`

## 3. Explicitly Rejected Patterns（明示的に拒否するパターン）

以下のパターンは **v1 / v2 問わず PKC2 では採用しない**。実装提案に含まれていれば差し戻す。

### 3.1 Generic Event Bus 化
- PKC2 を「任意の内部 event を外部に流せる汎用 pub-sub サーバ」に**しない**
- 許容 event type は closed set として仕様化する。wildcard subscribe（`*` / `entry.*` 等）は受け付けない
- 「とりあえず全部流す」パターンは internal DomainEvent の privacy 漏洩・後方互換破壊を招くため**禁止**

### 3.2 DomainEvent の直接露出
- 内部 `Dispatcher.onEvent()` の payload をそのまま `hook:event.payload` に詰めることは**禁止**
- 必ず `hook-event-projector` 層で外向き型へ変換し、projection allow-list を通す
- 将来 DomainEvent の形が変わっても外向きスキーマは安定して保つ（後方互換はホスト側の責任ではなく PKC2 側の契約）

### 3.3 無期限 / 長期購読
- TTL なし subscription は**禁止**
- TTL 上限（24h）を超える要求は**禁止**
- "keep-alive" による TTL 無限延長も v1 では**禁止**（v2+ で検討）

### 3.4 永続 Grant / Trusted Origin Allow-list
- IndexedDB / localStorage / container への grant 永続化は **v1 では禁止**
- 起動ごとにホストが再 subscribe するモデルで運用。永続化は v2+ で別文書にて検討

### 3.5 Graph コアの本体取り込み
- PKC2 本体に graph レイアウト / graph 可視化 / graph 計算を組み込まない
- graph 表示は **別アプリ（別オリジン）** が hook を購読して実装する
- `backlink-badge-jump-v1.md` §6 の graph deferral 方針を継承

### 3.6 `custom` メッセージへの相乗り
- `hook:*` を既存 `custom` type でラップする実装は**禁止**
- `custom` は「プロトコル外のアプリ固有ペイロード」用の出口であり、hook はプロトコル第一級市民として独立 type を割り当てる

### 3.7 Body / Revision / Asset の露出
- `hook:event.payload` および `initial-graph` snapshot に `body` / `archetype` payload / `revisions[]` / `assets` を**絶対に含めない**
- projection allow-list に body 系フィールドを追加する提案は**差し戻す**
- entry の識別補助に使うのは `lid` と `title` のみ

### 3.8 サブプロトコル概念の transport 内導入
- `hook:*` を「サブプロトコル」として `capability.ts` / `envelope.ts` のスキーマに **層を増やして** 表現しない
- 個別 message type の集合として扱う（実装シンプルさ優先）

## 4. PKC2-side API Contract Direction（内部 / 外部の分離契約）

### 4.1 内部 DomainEvent と外部 HookEventPayload の分離
PKC2 は以下 2 つを **別レイヤ** として扱う:

| 層 | 型 | 位置 | 用途 | 安定性 |
|----|-----|------|------|--------|
| 内部 | `DomainEvent`（`ENTRY_SELECTED` / `RELATION_DELETED` 等） | `adapter/state/` | UI state 同期 | 実装都合で変化可、外部契約ではない |
| 外部 | `HookEventPayload`（`HookRelationEventPayload` 等） | `adapter/transport/hook-event-projector.ts`（新） | 外部ホストへの通知契約 | version=1 の間は形を変えない |

両者の間には **純関数 projector** を置く:

```ts
// 概念シグネチャ（実装 PR で確定）
function projectRelationEvent(
  type: 'relation.created' | 'relation.updated' | 'relation.deleted',
  relation: Relation,
  projection: readonly string[],
): HookRelationEventPayload
```

- projector は `core/model/relation.ts` の公開フィールドのみ読み取り、allow-list に従って payload を組み立てる
- `metadata` / 将来追加されるフィールドは **allow-list に入らない限り露出しない**（default opt-out）

### 4.2 HookRelationEventPayload の形状（v1 固定）
```ts
interface HookRelationEventPayload {
  id: string;
  from: string;
  to: string;
  kind: 'structural' | 'categorical' | 'semantic' | 'temporal' | 'provenance';
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
}
```
- `metadata` は **v1 では含めない**
- 各フィールドは projection で指定されたもののみ最終 payload に含まれる
- version=1 の間、このシェイプ（フィールド名・型・意味）を**変えない**

### 4.3 形状安定性の期待
- **フィールド削除 / rename 禁止**: 一度 v1 に入れたフィールドは v1 の間削除 / rename しない
- **フィールド追加は allow-list 経由でのみ**: 追加候補は本書の follow-up 改訂で明示
- **payload 意味の変更禁止**: 例えば `updated_at` を「編集時刻」から「event 発火時刻」に変えるような意味変更は version=2 を切って行う
- **enum 拡張注意**: `kind` に新しい値を追加するのは **v1 互換拡張として許容**するが、ホスト側が未知 kind を受け取った場合のフォールバック表現は projector 側で保証する（e.g. そのまま文字列で通す）

### 4.4 Envelope との関係
- hook は `MessageEnvelope` の `payload` 内に収まる。envelope 層（`protocol` / `version` / `type` / `timestamp`）は変更しない
- `type` 値は `hook:subscribe` / `hook:subscribed` / `hook:event` / `hook:unsubscribe` / `hook:error` の **文字列固定**

### 4.5 Subscription Lifecycle（adapter 側 state machine）
```
[idle] --subscribe--> [active] --event*--> [active]
                        |
                        +--unsubscribe / ttl-expired--> [closed]
```
- `[active]` 状態の subscription のみ `hook:event` を発火
- `[closed]` に入った subscription への以降の event は発火しない（store から削除済み）
- reducer / container には影響しない（pure adapter 機構）

## 5. Future Expansion Path（v2+ の拡張余地）

v1 で **敢えて外した**機能のうち、将来検討対象となるもの。各項目は独立した別文書で検討する前提（本書では scope 外）。

### 5.1 Event 種別の拡大
- `entry.created` / `entry.updated` / `entry.deleted`（projection allow-list を慎重に設計。body は常に除外）
- `revision.created`（metadata のみ、body は除外）
- `phase.changed` / `selection.changed` は敢えて defer（UI 状態を外部に流す必然性が薄い）
- `asset.*` は defer（binary payload は hook に乗せない。別プロトコルで扱う）

### 5.2 Grant / Origin モデルの拡張
- **trusted-origin allow-list**: `event.origin` を正規化し、ユーザが承認した origin のみ subscribe を許可
- **readonly / editable grant の粒度**: v1 は通知のみなので意味なし。write 系 API が増えた段階で検討
- **standalone モード対応**: 同一オリジンからの postMessage を許可（iframe 無しでも購読）

### 5.3 Grant 永続化
- IndexedDB に trusted-origin + grant profile を保存
- 再起動後の自動 restore / revoke UI

### 5.4 TTL 延長 / Keep-alive
- `hook:renew` による TTL 延長
- 上限の緩和（24h → 週単位）

### 5.5 診断 API
- `hook:list`（現在の subscription 一覧）
- `hook:stats`（配信件数 / throttle drop 件数）
- dev-only panel での可視化

### 5.6 配信制御の高度化
- priority queue / adaptive backoff
- per-subscription rate limit / global rate limit
- reconnect 時の差分配信（`since` token）

### 5.7 Snapshot の拡張
- `initial-graph-with-titles`（entries title map を同梱） — ただし body は引き続き除外
- differential snapshot（前回 snapshot からの差分）

### 5.8 契約バージョニング
- `version: 2` envelope での breaking change は、本書と同レベルの acceptance contract を改めて起こしてから着手

**v2+ は v1 が十分 stable に稼働していることを前提条件とし、v1 未完成のうちに v2 機能を v1 実装に先行投入することを禁止する。**

## 6. Final Position（最終方針）

**PKC2 は、本書 §1〜§4 の条件すべてを満たす提案に限り、PKC-Message Hook Subscription Protocol の実装を受理する。**

言い換え:
- §1 Acceptance Preconditions を 1 つでも欠く提案は **実装 PR を merge しない**
- §2 Mandatory Constraints for v1 を逸脱する実装は **差し戻す**
- §3 Explicitly Rejected Patterns を踏む提案は **v1 / v2 を問わず採用しない**
- §4 API Contract Direction に沿わない実装は **差し戻す**
- §5 Future Expansion Path は **v1 実装に混ぜない**（v2+ 以降で別文書・別 PR）

### 6.1 受理フロー
1. 本書 merge（docs-only / 本 PR）
2. 提案側と §2〜§4 について text round-trip で合意（PR コメント or 別文書）
3. 実装 spec 文書（`pkc-message-hook-subscription-v1.md` 相当）を docs-only PR で先行 merge
4. 実装 PR（transport 層のみ + テスト同梱 + dist 差分記録）
5. 別オリジンのホスト側 PoC（PKC2 外）が hook を購読して動作することを確認
6. v2+ の拡張要求が出た時点で本書の follow-up 改訂 PR を検討

### 6.2 受理しないケースの明示例
- 「`hook:subscribe` を standalone でも通したい」→ 却下（§2.1）
- 「subscription を IndexedDB に保存して自動復元したい」→ 却下（§2.2 / §3.4）
- 「TTL なしで常時購読したい」→ 却下（§2.3 / §3.3）
- 「entry の body を snapshot に入れたい」→ 却下（§2.6 / §3.7）
- 「DomainEvent をそのまま転送したい」→ 却下（§3.2 / §4.1）
- 「`custom` で hook を包みたい」→ 却下（§3.6）
- 「graph レイアウトを PKC2 本体に持ちたい」→ 却下（§3.5）

### 6.3 一行結論
**Opt-in / layered / narrow / projected / time-boxed — この 5 原則を満たす提案のみ、PKC2 は hook 購読を実装する。**

---

## 関連文書

- `docs/development/pkc-message-hook-subscription-review.md` — 本書の前段となるレビュー文書（5 懸念の議論）
- `docs/development/transport-record-accept-reject-consistency-review.md` — transport layer allow-list 運用の先行事例
- `docs/development/backlink-badge-jump-v1.md` §6 — graph deferral 方針
- `docs/development/unified-backlinks-v0-draft.md` — 段階分離（draft → contract → impl）の先行パターン
- `src/adapter/transport/envelope.ts` — `KNOWN_TYPES` 拡張ポイント
- `src/adapter/transport/capability.ts` — `MESSAGE_RULES` 拡張ポイント
- `src/adapter/state/dispatcher.ts` — `onEvent()` を subscription と結ぶ adapter フック点
- `src/core/model/relation.ts` — HookRelationEventPayload の源となる公開フィールド

