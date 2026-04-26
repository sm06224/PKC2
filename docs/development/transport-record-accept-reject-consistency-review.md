# Transport Record Accept / Reject — Consistency Review

> **Status (2026-04-26)**: 本 doc は v1 spec(`docs/spec/pkc-message-api-v1.md`)で **superseded** された。canonical reference は v1 spec §7.3 / §7.4 を参照。本 doc は archeology(consistency review の記録)として保持する。

**Status**: review complete — 2026-04-19.
**Scope**: transport `record:accept` / `record:reject` の実装 / 仕様 / capability / handler の整合性確認。削除ではなく差分の明文化が目的。

**Resolution status** (2026-04-19):

| Finding | Resolution |
|---------|------------|
| `record-offer-handler.ts` JSDoc の `2-phase contract` + `SYS_ACCEPT_OFFER` | **Resolved by PR #45** — JSDoc を実装と一致する 1-phase inbound 記述に置換、`SYS_ACCEPT_OFFER` → `ACCEPT_OFFER` に訂正。|
| `record:reject` capability 宣言 vs handler 不在 (implementation drift) | **Resolved by PR #47** — **Option A: sender-only by design** に確定。capability rule から `record:reject` を削除、tests 更新、decision doc (`transport-record-reject-decision.md`) 作成。|
| `record:accept` spec-declared surface (`RecordAcceptPayload` 未使用) | 未解決 (future-only として retain) — sender / receiver いずれの実装も現 architecture に組み込む計画なし。spec 保存のため削除せず。|

inventory 05 (PR #43) で "capability 宣言 vs handler 不在" として C 保留にした 2 項目について、実装と仕様のどちらが drift しているのかを切り分ける。

## 1. 結論サマリ

> **📌 2026-04-21 追補（status）**: 下記 §1/§5/§6 の「本 PR / 別 PR」区分は初版（2026-04-19）時点の計画で、**2 件の "drift" はいずれも解消済み**。冒頭 **Resolution status** 表（JSDoc 系は PR #45、`record:reject` 系は PR #47 + `transport-record-reject-decision.md` が Option A sender-only を確定）が現時点の authoritative な整理。`RecordAcceptPayload` の spec-declared surface のみが future-only として保留継続。

| 項目 | 現状 | 判定 |
|------|------|------|
| `record:accept` declaration (message.ts + envelope) | 受理許容なし / sender なし / handler なし / payload 型だけ残留 | **doc drift + 未接続 payload 残留** |
| `record:reject` declaration + capability 'any' | outbound 送信のみ実装 / 受信 handler なし | **implementation drift**（capability が "handle" と言っているが handler なし）|
| `record-offer-handler.ts` 冒頭 JSDoc の "2-phase contract" + `SYS_ACCEPT_OFFER` | 2 phase と書いているが実装は phase 1 のみ。`SYS_ACCEPT_OFFER` は存在しない識別子 (実在は `ACCEPT_OFFER` UserAction) | **doc drift (code comment)** |
| `RecordAcceptPayload` interface | sender / receiver どちらも使っていない | **orphan (将来の wire-up を意図した残留)** |

フォローアップは 2 段階:
- **本 PR**: review 文書 + `record-offer-handler.ts` の JSDoc を事実と一致するよう修正（tiny, obvious code fix として同梱）
- **別 PR (推奨)**: capability.ts の `record:reject` 宣言を見直すか handler を追加するかの設計判断

---

## 2. `record:accept` トレース

### Declaration
- `src/core/model/message.ts:13` — MessageType union
- `src/adapter/transport/envelope.ts:48` — VALID_MESSAGE_TYPES (parse を許容)
- `src/adapter/transport/record-offer-handler.ts:44-49` — `RecordAcceptPayload` interface

### Sender (outbound)
- **なし**。`record:accept` を送信するコード `bridgeHandle.sender.send(..., 'record:accept', ...)` は存在しない。

### Receiver (inbound)
- capability.ts MESSAGE_RULES に **含まれていない** → `canHandleMessage('record:accept', ...)` は常に `false`
- registry に `record:accept` handler は register されていない
- 仮に外部から `record:accept` envelope が届いても capability guard で reject される

### Internal UserAction (要区別)
- `ACCEPT_OFFER` UserAction が `core/action/user-action.ts:79` に存在
- dispatcher 経由で `action-binder.ts:374` から dispatch され `app-state.ts:964` の reducer が PendingOffer → Entry 変換を行う
- **これは内部処理であり、外部 message `record:accept` とは別系統**。PendingOffer の UI accept ボタンは内部 UserAction を発火するだけで、offerer へのメッセージ送信は行わない。

### 仕様 (docs/planning/resolved/24_message_transport.md:90)
- "record:accept" = informational. 送信側の確認用途
- 仕様意図: receiver (PKC2) が accept を受け取った offerer に **送り返す** informational message
- **現状**: 仕様は定義されているが wire-up されていない → 未実装の outbound confirmation

### 判定
- **"dead/unused declaration residue" + "implementation drift (未実装)"**
- `RecordAcceptPayload` interface は sender の wire-up を待つ spec-declared surface。削除は不可（24_message_transport.md と整合が崩れる）。
- message.ts / envelope.ts の declaration は将来の双方向化のための保守対象として retain。

---

## 3. `record:reject` トレース

### Declaration
- `src/core/model/message.ts:14` — MessageType union
- `src/adapter/transport/envelope.ts:49` — VALID_MESSAGE_TYPES
- `src/adapter/transport/capability.ts:45` — `'record:reject': { mode: 'any' }` （"any mode で handle 可能" と宣言）

### Sender (outbound)
- `src/main.ts:391-399`
  ```
  dispatcher.onEvent((event) => {
    if (event.type === 'OFFER_DISMISSED' && event.reply_to_id && bridgeHandle) {
      bridgeHandle.sender.send(
        window.parent,
        'record:reject',
        { offer_id: event.offer_id, reason: 'dismissed' },
        event.reply_to_id,
      );
  ```
- PendingOffer が dismiss された際に offerer (window.parent) に送信

### Receiver (inbound)
- capability で **accept 宣言あり** (`mode: 'any'`)
- registry に **handler 未 register** → router が該当 handler を見つけられず no-op
- 仮に外部から `record:reject` が届いた場合、capability guard は通過するが routing で noop → 実質的に受信不能

### 判定
- **"implementation drift"**: capability.ts が `'any'` で受信許容を宣言しているが、対応 handler が実装されていない
- PKC2 は実質的に送信専用 (outbound-only)
- 整合案は 2 通り:
  - (A) capability から `record:reject` を外す (PKC2 は sender のみ。receiver 能力は宣言しない)
  - (B) handler を実装する (将来 PKC2 同士が reject を受信してエラー表示するなど)

---

## 4. `record-offer-handler.ts` JSDoc の drift

### 現状 (lines 1-19 の抜粋)
```
/**
 * Record offer/accept message handlers.
 *
 * Implements the minimal 2-phase record transfer contract:
 * 1. record:offer — sender proposes a record, receiver stores it as pending
 * 2. record:accept — receiver accepts, dispatches SYS_ACCEPT_OFFER to add Entry
 */
```

### 問題
- "2-phase contract" を **実装しているように記述しているが実装は phase 1 のみ**
- `SYS_ACCEPT_OFFER` と書かれているが、実際の UserAction は `ACCEPT_OFFER` (no `SYS_` prefix)
- "receiver dispatches ..." と書かれているが、これは内部 UserAction であり message ではない

### 本 PR の修正案（tiny, obvious code fix）
JSDoc を実装と一致するよう最小修正:
- "2-phase contract" → "1-phase offer reception" と事実記述に修正
- `SYS_ACCEPT_OFFER` → `ACCEPT_OFFER` に訂正
- `record:accept` の wire-up 未実装を明記
- 行数増減なしまたは微増 (runtime 無変更)

---

## 5. 実装 / 仕様の整合性判定

| 領域 | drift 種類 | 優先度 | 対応案 |
|------|-----------|--------|--------|
| record-offer-handler.ts JSDoc | doc drift | **本 PR で修正** | tiny fix: 2-phase 記述と SYS_ACCEPT_OFFER の訂正 |
| capability.ts の `record:reject` 宣言 | implementation drift | 別 PR | 設計判断 (A or B) が必要 → 本 PR のスコープ外 |
| `RecordAcceptPayload` interface orphan | dead/residue | 保留 (C) | 24_message_transport.md との整合で retain |
| `record:accept` MessageType + envelope | spec-declared surface | 保留 (C) | 将来の双方向化候補 |

---

## 6. 必要なフォローアップ

> **📌 2026-04-21 追補**: 下記 2 群のうち「本 PR で実施」と「別 PR 推奨」はいずれも **閉じ済み**。冒頭 Resolution status 表を参照。`record:accept` spec-declared surface だけは future-only として retain。

### 本 PR で実施
- 本 review doc の追加
- `record-offer-handler.ts` の JSDoc を実装と一致させる最小修正

### 別 PR 推奨
- **capability.ts の `record:reject` 設計判断**: "PKC2 は sender-only か bidirectional か" を決める spec review。合わせて capability.test.ts の該当 case も更新。
- **将来の wire-up**: `record:accept` を実装する場合、`RecordAcceptPayload` を使う sender を main.ts か action-binder に追加。`record:reject` を受信したい場合は handler を register する。

## 7. 5 層構造 / layering 影響

なし。本 PR は docs + docstring 修正のみ。transport 層の API surface は不変。

---

## 8. Rollback

本 PR 由来の変更は (i) 新規 docs 1 件 + (ii) 既存 docstring の文言修正のみ。`git revert` で復元可能。runtime 挙動は不変。

---

## 9. 関連文書 / コード

- `src/core/model/message.ts:9-18` — MessageType union
- `src/adapter/transport/envelope.ts:40-58` — VALID_MESSAGE_TYPES set
- `src/adapter/transport/capability.ts:42-46` — MESSAGE_RULES
- `src/adapter/transport/record-offer-handler.ts` — handler + payload types
- `src/main.ts:391-400` — `record:reject` sender
- `src/core/action/user-action.ts:79` — `ACCEPT_OFFER` UserAction
- `src/adapter/state/app-state.ts:964` — ACCEPT_OFFER reducer
- `docs/planning/resolved/24_message_transport.md:84-92` — 初期 spec の "未実装表"
- `docs/planning/14_基盤方針追補_clone_embed_message.md:121,153` — 基盤方針における role
- `docs/development/boot-initialization-order.md:62` — §9b の record:reject 送信 step
