# Transport `record:reject` — Sender-Only Decision

> **Status (2026-04-26)**: 本 doc は v1 spec(`docs/spec/pkc-message-api-v1.md`)で **active** な決定として §7.4 / §11.4 から参照される(Option A: sender-only by design の根拠)。本 doc は引き続き正本として保持する。

**Status**: active — 2026-04-19 decision.
**Scope**: capability declaration / handler asymmetry resolution.
**Follow-up of**: `docs/development/transport-record-accept-reject-consistency-review.md` (PR #45).

PR #45 で `record:reject` を **implementation drift** (capability で `'any'` 宣言だが handler 未 register) と分類した。本 PR でその扱いを **sender-only by design** に確定する。

## 1. 結論

- **採用**: Option A — `record:reject` を **outbound sender-only** と確定し、inbound capability 宣言を削除する
- **理由**: 現在の architecture に inbound 経路の必要性がなく、宣言だけ残すと誤読リスクが高い

## 2. 現状トレース (再確認)

| 側面 | 場所 | 状態 |
|------|------|------|
| Type declaration | `src/core/model/message.ts:14` | `'record:reject'` in MessageType union |
| Envelope parser | `src/adapter/transport/envelope.ts:49` | VALID_MESSAGE_TYPES に含む (in/out 両方向で parse 許容) |
| Capability gate (inbound) | `src/adapter/transport/capability.ts:45` | `'record:reject': { mode: 'any' }` ← **本 PR で削除** |
| Receiver handler | (なし) | registry に register されていない |
| Sender (outbound) | `src/main.ts:391-399` | `OFFER_DISMISSED` 時に `bridgeHandle.sender.send(window.parent, 'record:reject', ...)` |
| Tests | `tests/adapter/transport/capability.test.ts:22-25, 44` | "allows record:reject in any mode" を断言 ← **本 PR で更新** |

実状: PKC2 は **送信のみ**。受信 capability 宣言は handler 不在のため routing が成立せず実質 noop だが、`canHandleMessage('record:reject', ...)` は `true` を返すため "受信能力あり" と誤読される。

## 3. Option A vs B 比較

### Option A: sender-only by design

- **変更**: `MESSAGE_RULES` から `'record:reject'` を削除。tests を「sender-only であることの assertion」に置換。
- **runtime**: send は不変 (envelope.VALID_MESSAGE_TYPES に残る)。受信 envelope は capability で reject される (元々 handler 不在で noop だった点と一致)。
- **コード変更量**: capability.ts -1 行 + JSDoc 追記、capability.test.ts 2 ブロック書き換え。
- **方向性**: API surface を縮小し、現実 (送信のみ) と一致させる。

### Option B: bidirectional by design

- **変更**: `record:reject` 受信 handler を実装。新規 SystemCommand (`SYS_OFFER_REJECTED` 等) を作って、reducer / app-state に "outgoing offer pending reply" のステートを導入。tests / docs / type 群を拡張。
- **runtime**: 新たに inbound 経路で reducer ディスパッチが発生。
- **コード変更量**: 数百行規模 (state 追加 + reducer + 新 SystemCommand + handler + tests + docs)。
- **架構性**: 現状 PKC2 は **outgoing offer** の概念を持たない。受信した reject を表示する UI も pending-out 一覧も存在しない。受信実装は **新機能の構築** であり、現在の architecture から spec が出ていない。

### 比較表

| 観点 | A (sender-only) | B (bidirectional) |
|------|----------------|-------------------|
| current architecture fit | ○ 既存挙動と一致 | ✗ 新機能構築が必要 |
| existing user flow | ○ ユーザー操作経路に変化なし | ✗ "送ったオファーが拒否されたら表示" の UI が無い |
| least surprising behavior | ○ 宣言と挙動が一致 | △ noop 受信より明確だが、新たな振る舞いが増える |
| smallest safe change | ○ -1 行 + テスト書換 | ✗ 多重 Layer 修正が必要 |
| 仕様根拠 | `24_message_transport.md:90` の "informational" 位置付けと整合 | 仕様書に inbound 受信の扱い記述なし |

prompt 指示 "If receiver implementation is not clearly justified by current architecture, choose A" に従い、**Option A** を採用。

## 4. 実装内容

### `src/adapter/transport/capability.ts`

- `MESSAGE_RULES` から `'record:reject': { mode: 'any' }` 行を削除
- JSDoc に `record:reject` を **意図的に含めない** 旨と理由を追記、本 doc を cross-link

### `tests/adapter/transport/capability.test.ts`

- "allows record:reject in any mode" → "rejects record:reject in any mode (sender-only by design)" に置換
  - `canHandleMessage('record:reject', true)` → `false`
  - `canHandleMessage('record:reject', false)` → `false`
- "returns all supported types" の `expect(types).toContain('record:reject')` を削除
- 新 it: "does not include record:reject (sender-only by design)"

### 保持 (touch なし)

- `src/core/model/message.ts:14` MessageType に `'record:reject'` を残す: outbound sender が型として必要
- `src/adapter/transport/envelope.ts:49` VALID_MESSAGE_TYPES に残す: 自分が送信する envelope を validate するため
- `src/main.ts:391` sender wiring 不変
- `src/adapter/transport/record-offer-handler.ts` JSDoc は PR #45 で既に "outbound sender lives in main.ts" と明記済み

## 5. Code / Tests / Docs Impact

| ファイル | 変更 |
|---------|------|
| `src/adapter/transport/capability.ts` | -1 行 (rule 削除) + JSDoc 追記 |
| `tests/adapter/transport/capability.test.ts` | 2 describe-it ブロック書換 |
| `docs/development/transport-record-reject-decision.md` | 新規 (本 doc) |

bundle 影響: capability rule 1 行削除 + JSDoc は minify で消える。`canHandleMessage` の switch 分岐も実質変化なし → 数バイト減または不変。

## 6. なぜ Option B を採らなかったか

1. **current architecture に outgoing offer tracking がない**: PendingOffer は受信側のみ管理。送信側の "送った offer" を保持する state も UI もない。
2. **inbound `record:reject` の意味が定義されていない**: spec doc (`24_message_transport.md:90`) には informational 記述のみで、受信時の挙動は定義されていない。
3. **新機能 vs 整合修正の規模差**: A は -1 行 + テスト書換、B は新 state + reducer + handler + UI が必要。本 PR は inventory followup として「整合修正」のスコープに留めるべき。
4. **将来 B が必要になった場合の戻し容易さ**: A 適用後でも、B が必要になったら capability rule を 1 行追加 + handler 実装で復元できる。逆方向 (B → A 縮退) のほうが状態剥離コストが大きい。

## 7. Rollback

`git revert` 1 コミットで `capability.ts` の 1 行と test 2 ブロックを元に戻せる。runtime 影響: revert すると「受信 envelope が capability 通過 → handler 不在で noop」の元の drift 状態に戻る。production 動作差はない (元々 noop だったため)。

## 8. 関連文書

- `docs/development/transport-record-accept-reject-consistency-review.md` (PR #45) — 本決定の前提となる review
- `docs/planning/resolved/24_message_transport.md:84-92` — 初期 spec の "未実装表"
- `docs/development/boot-initialization-order.md:62` — §9b record:reject 送信 step
- `docs/development/dead-path-cleanup-inventory-05-round5.md:79` — round 5 で C 保留と分類した行 (本 PR で resolve)
