# Record Offer — Capture Profile (v0)

**Status**: accepted spec — 2026-04-21。docs-only。**本 PR に実装は含まれない**。
**Scope**: 外部 sender（browser extension / bookmarklet / host page）から `record:offer` 経由で PKC2 に「1 件のコンテンツを送り込む」最小フロー（capture flow）の **receiver side contract** を、実装着手前の正本として固定する。
**Baseline**: `docs/development/extension-capture-v0-draft.md`（設計 draft、Option B 採用）、`docs/planning/resolved/24_message_transport.md`（`pkc-message` v1 protocol 正本）、`docs/spec/provenance-relation-profile.md`（`RelationKind = 'provenance'` v1 profile）、`docs/development/pkc-message-hook-subscription-decision.md`（hook は **Defer**）、`docs/development/transport-record-reject-decision.md`（`record:reject` は **sender-only by design**）。

---

## 0. TL;DR

- 新 message type は足さない。既存 `record:offer` の **payload を superset で拡張**するのみ
- payload の追加 optional field は **4 本のみ**（`source_url` / `captured_at` / `selection_text` / `page_title`）
- receiver は **即 commit しない**。既存 `PendingOffer` preview → 明示 Accept で entry 化する path を再利用する
- provenance は v0 では **body 先頭の quote block header**（`> Source:` / `> Captured:`）で表現する。formal な external-provenance schema（新 `conversion_kind` 値 / `container.meta.external_sources` 等）は **v1+ defer**
- 安全性は **origin allowlist の default restrictive 化 + body size hard cap** の 2 軸
- hook subscription / graph / attachment capture / multipart / auto-dedup / sender 実装詳細は v0 **non-goal**

---

## 1. Purpose / Status

### 1.1 目的

`extension-capture-v0-draft.md` で示した方向性を、receiver side 実装 PR が **契約・用語・メッセージ境界・エラー方針で迷わない** レベルまで正本として固定する。

本 profile は:

- 新 wire protocol を作らず、既存 `record:offer` の superset を採ること
- 受理を PendingOffer preview の明示 Accept に載せること
- v0 provenance を body header 形式に留めること
- 受信時の reject / ignore / no-op を明確に区別すること

の 4 点を **normative** に固定する。

### 1.2 ステータスと改訂

- Status: **accepted spec**（v0）。v1 で superset 的 additive extension を許容する（後方互換は §7.3）
- 改訂は docs-only PR で本 profile を更新し、implementation PR は更新後の profile を参照すること
- v0 で「曖昧」と明記した論点（§13）は implementation PR で fix せず、改訂 PR で fix する

### 1.3 本 PR の scope

- **docs-only**。実装コード・テストの変更は含まない
- `docs/spec/record-offer-capture-profile.md` の新規作成が唯一の成果物
- 既存 doc の修正は cross-link 追加の最小編集に限定する（本 PR では触らない方針、§3 参照）

---

## 2. Scope

### 2.1 In-scope（v0 で固定する範囲）

- **receiver side** の wire contract（envelope / payload validation / capability / size cap / origin allowlist）
- **reducer path**（`SYS_RECORD_OFFERED` → `AppState.pendingOffer` → `ACCEPT_OFFER` → entry mint）の再利用方針
- **body header injection** ルール（`> Source:` / `> Captured:`）
- **provenance attach の v0 分担**（body header として見せる層 / metadata には v0 では載せない）
- **security / UX constraints**（origin allowlist / size cap / unreadable payload の扱い）

### 2.2 Out-of-scope（本 profile で扱わない）

- **sender side 実装**（browser extension manifest / bookmarklet code / content script）
- **PKC2 自体を拡張化する path**（single HTML invariant により永続的な non-goal）
- **新 message type / 新 MessageRule**（`record:offer` の superset で閉じる）
- **multipart / attachment / rich media capture**（images / PDF / zip）
- **auto archetype detection**（URL pattern → archetype などの推論）
- **offline queue / service worker buffering**
- **capability negotiation 拡張**（sender 側の `record:offer-capture/v0` advertise など）
- **formal external-provenance schema**（`conversion_kind = 'external-capture'` / `container.meta.external_sources?[]`）
- **rate limit / multi-offer queue UI**
- **hook subscription**（`pkc-message-hook-subscription-decision.md` に従い Defer 継続）

---

## 3. Relationship to existing docs

### 3.1 正本（canonical）との関係

| doc | 関係 |
|---|---|
| `docs/planning/resolved/24_message_transport.md` | `pkc-message` v1 protocol の正本。本 profile は envelope / message type を **変更しない** |
| `docs/development/extension-capture-v0-draft.md` | 設計 draft（Option B 採用）。本 profile はそれを **契約化**する superset |
| `docs/spec/provenance-relation-profile.md` | `RelationKind = 'provenance'` v1 profile。本 profile は v0 では formal な provenance Relation を **張らない**（body header のみ） |
| `docs/development/pkc-message-hook-subscription-decision.md` | hook は **Defer**。本 profile は hook 非前提で閉じる |
| `docs/development/transport-record-reject-decision.md` | `record:reject` は **sender-only by design**。本 profile で inbound 受信能力を追加しない |
| `docs/development/transport-record-accept-reject-consistency-review.md` | accept/reject の drift 解消記録。本 profile はその整合を前提に立つ |

### 3.2 本 profile の superset 方向

extension-capture-v0-draft.md §2 / §4 の内容を本 profile が上位互換で具体化する。draft 側は「設計方針の歴史記録」として保存し、以後 normative な参照は本 profile に向ける。

### 3.3 既存 doc への修正方針

本 PR では原則として新規 spec 1 本のみの変更に留める。extension-capture-v0-draft.md / handover / ledger 等の cross-link 更新は **別 PR**（本 spec が main merge された後）で最小差分で行う。

---

## 4. Terminology

本 profile で用いる用語の定義。既存 doc と衝突しないよう、spec / コメント / commit message では以下の語を **必ず前置つきで** 使う。

| 用語 | 意味 |
|---|---|
| `record:offer` | 既存 `MessageType`（`src/core/model/message.ts`）。本 profile ではこの type を capture flow で再利用する |
| `capture` | 外部 sender が「1 件のコンテンツを PKC2 に送り込む」操作の抽象名。**always single-shot**（1 message = 1 capture = 1 entry）|
| `capture receiver` | PKC2 側。envelope validation / capability check / origin check / payload profile check / PendingOffer stash / preview UI までの一連を担う |
| `offer sender` | 外部 sender 側。本 profile は実装詳細に踏み込まない |
| `accepted offer` | PendingOffer state から **ユーザの明示 Accept** を経て新 entry が mint された状態。silent accept は採らない（§6.4）|
| `capture payload` | `record:offer` envelope の `payload` field。本 profile §8 で profile 固定する superset |
| `provenance attachment` | capture 時に entry に付与する来歴情報の総称。v0 では **body header のみ**、formal provenance Relation は defer |
| `origin allowlist` | `mountMessageBridge({ allowedOrigins })` の設定。本 profile で **default restrictive** を規定 |
| `capability` | `src/adapter/transport/capability.ts` の `MESSAGE_RULES`。本 profile は `'record:offer': { mode: 'any' }` を **変えない** |
| `body header injection` | accept 時に body 先頭へ `> Source: ...` / `> Captured: ...` blockquote を追加する変換。v0 provenance の唯一の visible 表現 |
| `size cap` | payload の合計サイズ上限。body に対して hard cap を置く |
| `reducer path` | envelope → handler → dispatcher → reducer → `AppState.pendingOffer` → user Accept → `ACCEPT_OFFER` → entry mint の流れ |

### 4.1 禁止語 / 注意語

- **"capture hook"**: hook subscription と紛らわしい。capture は hook ではなく 1-shot envelope で成立する。使わない
- **"PKC extension"**: PKC2 自体を拡張化する意味に誤読される。sender 側を指すなら "offer sender" / "external sender" / "browser extension sender" と明示
- **"silent capture" / "auto-import"**: 本 profile では不採用（§9.5）。使う場合は常に "silent" と明示して拒否理由を添える
- **"hook" を単独で使用しない**: hook subscription は Defer。本 profile の文脈で "hook" と書く必要はない

---

## 5. Reuse of `record:offer`

### 5.1 方針

v0 は **既存 `record:offer` を capture flow に再利用**する。新 message type を追加しない。

具体的には以下を **固定**する:

- `MessageType` union に新値を加えない（`src/core/model/message.ts` 不変）
- `capability.ts` の `MESSAGE_RULES['record:offer']` を変えない（`{ mode: 'any' }` 継続）
- `validateEnvelope()` の `KNOWN_TYPES` / parser を変えない
- receiver 側 handler registry には **既存 `recordOfferHandler` をそのまま使う**（新 handler を registry に足さない）

payload の superset のみを採用する（§8）。

### 5.2 採用理由

- **新 transport を増やさない**: transport 層の API surface を広げることは長期的な互換性負債を生む。本 profile は "capture" を独立 transport として扱わず、既存 offer flow の **最小 superset** で閉じる
- **hook Defer 方針との整合**: `pkc-message-hook-subscription-decision.md` は PKC2 を "プラットフォーム化" する方向を現時点で採らないと決定している。新 transport を追加することは platformization への 1 歩と解釈されうる。本 profile はその線を踏まない
- **simpler proof path**: extension-capture-v0-draft.md §5.4 で推奨した Option B は、receiver 側の既存資産（`validateEnvelope` / `canHandleMessage` / `recordOfferHandler` / `AppState.pendingOffer` / `ACCEPT_OFFER` reducer）の **すべて** をそのまま使える。追加コードが最小で済む
- **可逆性**: v1 で必要になった時点で、capability negotiation や新 type を additive に導入できる。本 profile の決定はそれを塞がない

### 5.3 Option B 再利用の利点と制約

**利点**:

- receiver 側の新規コードは「payload の新 optional field 4 本を validator に追加」「body header injection を accept path に 1 箇所差し込む」「origin allowlist の default 変更」「size cap 判定の追加」のみ
- 既存 PendingOffer UI がそのまま使える（sidebar 上部 / モーダル的 offer panel）
- `record:reject` の sender-only 契約（`transport-record-reject-decision.md`）も変えずに済む

**制約**:

- `source_id` / `target_id` / `timestamp` などの envelope field は `pkc-message` v1 の既存 semantics を継承する（本 profile で再定義しない）
- envelope レベルでは capture と通常 offer を区別しない。区別は payload の optional field の有無による（§8）
- 1 message = 1 capture 固定。multipart / attachment を同一 envelope に乗せる道は v0 では開けない

---

## 6. Receiver-side contract

### 6.1 責務の全体像

receiver は以下の順で **fail-fast** にチェックし、**いずれか一つでも満たせないときは PendingOffer に積まない**:

1. envelope が PKC message か（`isPkcMessage`）
2. origin allowlist に一致するか（`mountMessageBridge.allowedOrigins`）
3. envelope が schema 的に valid か（`validateEnvelope`）
4. `target_id` が自 container_id に一致するか（null は broadcast として受理）
5. `canHandleMessage('record:offer', embedded)` が真か
6. payload の必須 field（`title` / `body`）が揃っているか
7. body **size cap** 内か（§9.3）
8. origin が `"null"`（file://）の場合の特別扱い（§9.2）

7 / 8 は本 profile で **追加**する条件。1–6 は既存実装の継承。

### 6.2 accept 時の reducer path

5–8 を通過した envelope は:

1. `SYS_RECORD_OFFERED` を dispatch（既存 `recordOfferHandler` の挙動そのまま）
2. reducer が `AppState.pendingOffer` に stash
3. render が PendingOffer UI（既存）を描画
4. user が **明示的に Accept** を押す → action-binder が `ACCEPT_OFFER` を dispatch
5. reducer が新 entry を mint（本 profile で body header injection を 1 箇所差し込む、§10）

user が Dismiss した場合は既存 path で `OFFER_DISMISSED` → `record:reject` sender（`src/main.ts:391`）に戻る。本 profile で変更しない。

### 6.3 receiver が「やらない」こと

- **silent accept** しない。常に PendingOffer preview を経由する（§9.5）
- **内容の意味論的検証**（markdown 構文チェック / URL reachability / MIME sniff）をしない
- **自動 archetype 判定**をしない。`payload.archetype` 未指定なら `'text'` 固定
- **duplicate 検出 / dedup** をしない（v0、§10.6）
- **複数 pending offer のキューイング** をしない。新 offer は既存 slot を上書き（v0 の既存挙動を継承、§9.6）
- **fetch / network call** をしない（active content 取得・preview 生成の類）
- **container meta への書き込み**をしない（formal external-source list は defer）
- **user notification の自動生成**（toast 等）をしない（PendingOffer UI 表示がそのまま通知を兼ねる）

### 6.4 reject / ignore / no-op の区別

| 挙動 | 条件 | 動作 |
|---|---|---|
| **silent ignore** | 非 PKC message / target_id 不一致 | 何もしない（既存 bridge 挙動） |
| **reject**（log + `onReject`）| origin 不一致 / envelope invalid / capability mismatch / payload invalid / size 超過 / unsupported capture payload | `onReject` callback（console.warn を含む）を呼び、PendingOffer 状態は変えない。sender に **エラー replyは送らない**（`record:reject` は outbound-only かつ "dismissed" semantics 専用、`transport-record-reject-decision.md` 準拠） |
| **accept as pending** | §6.1 の全条件を満たす | `SYS_RECORD_OFFERED` を dispatch、PendingOffer 状態を更新 |
| **user accept** | user の明示操作のみ | `ACCEPT_OFFER` を dispatch、entry を mint |
| **user dismiss** | user の明示操作のみ | `OFFER_DISMISSED` を発火、`record:reject` を送信（既存挙動） |

---

## 7. Envelope shape

### 7.1 envelope は既存 `MessageEnvelope` のまま

`src/core/model/message.ts` の `MessageEnvelope` interface を変更しない:

```ts
interface MessageEnvelope {
  protocol: 'pkc-message';
  version: 1;
  type: 'record:offer';         // capture flow でも必ずこの値
  source_id: string | null;
  target_id: string | null;
  payload: unknown;              // 本 profile は payload を §8 で拡張
  timestamp: string;
}
```

- `protocol` / `version` / `type` / `timestamp`: 既存 validator のまま
- `source_id`: 外部 sender の container_id 相当。外部 sender は PKC2 container を持たないため **null**（または任意の自由な文字列識別子）でよい。receiver はこれを信頼根拠に使わない
- `target_id`: **null（broadcast）または現 active container の id** を受理。それ以外は既存 bridge が silent skip する（`message-bridge.ts:125`）

### 7.2 capture identification は payload で行う

envelope レベルでは「通常 offer か capture か」を区別しない。区別は **payload に capture-specific optional field（§8.2）が含まれるか**で推測されるに留まる。

receiver は区別を活用しない。ただし body header injection（§10）は「`source_url` または `captured_at` が与えられているとき」に trigger するため、実質的に capture は区別されて扱われる。

### 7.3 versioning / future extension

- 本 profile は **v0**。v1 で additive に field を足す余地を残す
- receiver は **unknown extra field を黙って無視する**（後方互換）。存在を理由に reject しない
- 将来 capability negotiation が必要になった場合（`record:offer-capture/v0` など）は、本 profile の改訂 PR で固定する。本 PR では固定しない

### 7.4 invalid envelope の扱い

既存 `validateEnvelope` の挙動を変えない:

- `protocol` / `version` / `type` / `timestamp` のいずれかが invalid → `RejectCode` 付きで `onReject` callback、pending には積まない
- `target_id` 不一致は silent skip
- origin 不一致は bridge 層で `onReject`

### 7.5 capability negotiation 前提

**本 profile では前提としない**。

sender は:

- `record:offer` を送れば受理されうる（ただし本 profile の条件に全て合致する必要がある）
- capability 広告（"supports record:offer-capture/v0"）を送る必要はない
- PKC2 が capture 対応版かを事前に問い合わせる手段は v0 にはない

受信側として判断するのは本 profile の条件だけである。将来 capability-level の区別が必要になった場合、v1 で固定する。

---

## 8. Capture payload profile

### 8.1 payload は `RecordOfferPayload` の superset

既存:

```ts
interface RecordOfferPayload {
  title: string;
  body: string;
  archetype?: ArchetypeId;
  source_container_id?: string;
}
```

本 profile はこれに以下の optional field を **additive**に加える:

```ts
interface RecordOfferPayloadWithCapture extends RecordOfferPayload {
  source_url?: string;          // capture-specific. 取得元 URL
  captured_at?: string;         // capture-specific. ISO 8601
  selection_text?: string;      // capture-specific. 選択テキスト（v0 では格納のみ、body 加工には使わない）
  page_title?: string;          // capture-specific. <title>（v0 では格納のみ、title 置換には使わない）
}
```

### 8.2 v0 で採る / 採らない の確定表

| field | 型 | 必須 | v0 での扱い |
|---|---|---|---|
| `title` | string | **✓ required** | 既存通り。空文字は reject 対象（§8.4）|
| `body` | string | **✓ required** | 既存通り。空文字は **許容**（notes-only archetype 目的）|
| `archetype` | `ArchetypeId` | optional | 既存通り。未指定時 `'text'`。`'text'` 以外の値も **受理はするが v0 では実質 `'text'` と同じ path を通る**（§10.2）|
| `source_container_id` | string | optional | 既存通り。外部 sender では基本 null / omit |
| `source_url` | string | optional | **v0 採用**。body header に注入（§10.4）|
| `captured_at` | string (ISO 8601) | optional | **v0 採用**。body header に注入。未指定時は受信側 `now`（§10.4）|
| `selection_text` | string | optional | **v0 では格納しない**。receiver は受け取っても読み捨て |
| `page_title` | string | optional | **v0 では格納しない**。receiver は受け取っても読み捨て |

明示的に **v0 で読み捨てる** 2 field（`selection_text` / `page_title`）は、sender が送信する互換性を確保するために payload profile に記載するが、receiver はこれらを accept path に反映させない。

### 8.3 invalid payload の扱い

以下のいずれかを満たす payload は **reject**（PendingOffer に積まない）:

- payload が object でない
- `title` が string でない、または空文字
- `body` が string でない（空文字は OK）
- `body` の size が §9.3 の cap を超える
- `source_url` が存在し string でない
- `captured_at` が存在し string でない

**unknown extra field は reject 理由にしない**（§7.3）。

### 8.4 title / body の最小要件

- `title`: string かつ **trim 後の長さ > 0**。空タイトルは意味のある entry を作れないため reject
- `body`: string で可。空文字は notes-only / title-only entry として成立を許す

### 8.5 v0 で認めない payload 項目

以下を sender が乗せても v0 receiver は **読み捨てる**（エラーにはしない）:

- assets（image / PDF / zip 等の payload 内埋め込み）
- relations（from / to）
- tags
- archived flag / sort position
- revisions
- sub-entries / child entries
- correlation_id / merge semantics
- external-provenance full schema（`provenance_relation` / `external_sources[]` 等）

v1 で採用判断する候補として本 profile は位置を残すが、**現 PR では未採用と確定**する。

---

## 9. Security / UX constraints

### 9.1 origin allowlist — default restrictive

現実装（`message-bridge.ts:101`）は `allowedOrigins` 未指定 / 空配列で **accept-all** になる。本 profile は以下を **normative** に定める:

- **production bootstrap（`src/main.ts` 相当の場所）は allowedOrigins を明示して構成するべき（should）**
- capture flow が前提にするのは「origin 単位の信頼境界」。accept-all の状態で capture を本番運用することは本 profile の前提を満たさない
- テスト / 開発環境での accept-all 維持は許容する（既存 bridge 挙動）。ただしその場合でも `onReject` / `console.warn` を監視可能にしておくこと

具体的な allowlist 値（pkc.local / 特定 extension ID など）は implementation PR 時に決める。本 profile は **default を restrictive に倒す方針** のみを固定する。

### 9.2 `"null"` origin（file:// / sandboxed iframe）

- postMessage の `event.origin` が文字列 `"null"` のケースを意識する
- file:// で開いた PKC2 に対し、同様に file:// の sender が postMessage する状況、または sandboxed iframe 経由の場合に発生
- **v0 の default**: `"null"` origin は **reject**
- opt-in で許可したい場合は `allowedOrigins` に `"null"` を **明示追加**させる（accept-all を介した通過は許さない方針）

implementation PR で `"null"` を明示リストに入れた場合の挙動をテストし、spec 追補が必要なら本 profile を改訂する。

### 9.3 body size hard cap

- 本 profile は **body に対して hard cap** を規定する
- v0 の数値: **256 KiB (262144 bytes)**（UTF-16 length ベースでの近似、`body.length <= 262144` で判定）
- **body のみ** を対象にする。title / optional field の size は v0 では cap しない（title は `<= 数百文字` が現実的な上限で cap の必然性が低い、optional field は定性的に短い）
- cap 超過 payload は §8.3 に従い reject
- 将来 `selection_text` 等も格納対象に昇格した場合、cap の再定義を行う

256 KiB は `extension-capture-v0-draft.md §6.1` で提案した仮数値を spec 値として昇格させたもの。後続 PR で実測に基づき改訂余地あり。

### 9.4 html 断片 / active content の扱い

- v0 payload に html 断片を直接埋める field は **ない**。`body` は markdown 推奨、sender が html を送ってもそれは body 内テキストとして扱われる
- receiver は sanitize しない（markdown レンダラ側の既存 sanitize に委ねる、CLAUDE.md § Architecture 範囲内）
- `<script>` / iframe 等の active content は markdown renderer の既存挙動に従う（PKC2 renderer は markdown パース後に script 実行しない設計）
- capture の結果 body に signal を残すのが受け入れ時の唯一の変更で、receiver が fetch / network call を行うことはない（§6.3）

### 9.5 silent accept の禁止

- 本 profile は **silent accept を禁止**する（must not）
- 必ず PendingOffer UI を経由し、**user の明示 Accept** を経て entry を mint する
- 理由:
  - 外部 sender は信頼境界の外。内容は untrusted
  - preview 無しで container を書き換えることは "気付かないうちに汚れる" リスクが高い
  - readonly モードでは既存 guard により `ACCEPT_OFFER` が block されるため、silent 動作との整合も取りやすい

user confirmation は既存 PendingOffer UI が担当する。新 UI は追加しない。

### 9.6 spoofing / confused deputy 懸念

- 外部 sender が PKC2 の parent window / content script / 同一 origin から postMessage を送れる状況で、`source_id` / `source_container_id` を偽装する可能性がある
- receiver は **これらを信頼根拠に使わない**。`source_id` は informational 情報として envelope に保持されるが、認可判断には使わない
- 認可境界は常に **origin allowlist** の 1 軸のみ（§9.1）

### 9.7 rate limit / spam 懸念

- v0 は rate limit を置かない
- 連打に対しては「最後の offer が PendingOffer slot を上書き」する既存挙動をそのまま継承する
- implementation PR は rate limit / queue を **足さない**（v1+ defer）

### 9.8 unreadable / over-limit / unsupported payload の扱い

- size 超過: §8.3 で reject、`onReject` callback
- title 欠落 / 空: reject、`onReject` callback
- `body` が string でない: reject、`onReject` callback
- 未知の optional field: **黙って無視**（§7.3）
- `archetype` が unknown 値: v0 では `'text'` path を通る（既存挙動、§10.2）。reject にはしない

---

## 10. Entry creation / reducer path

### 10.1 基本前提

- v0 の accept path は **常に新規 entry を mint** する。既存 entry の更新 / append は扱わない
- archetype は **TEXT 前提**（v0）。TEXTLOG / form / attachment 等への変換は scope 外
- revision は初回 save 時に PKC2 既存 path で切られるだけで、sender 由来の history は継承しない

### 10.2 archetype

- `payload.archetype` 未指定 → `'text'` 固定
- `'text'` 以外の値が指定された場合、**v0 では `'text'` と同じ path を通る**（受理はするが意味論上 `'text'` として扱う）
- `'textlog'` / `'form'` / `'attachment'` 等への自動切替は v1 defer

### 10.3 title / body / source_url / tags / relations / provenance の入り方

| field | v0 での扱い |
|---|---|
| `title` | entry.title にそのまま格納。加工なし |
| `body` | entry.body に格納。`source_url` / `captured_at` のいずれかが与えられたときは **body 先頭に header を注入**（§10.4） |
| `source_url` | body header のみ。metadata / relation には格納しない（v0） |
| `captured_at` | body header のみ。metadata / relation には格納しない（v0） |
| `tags` | payload に乗せても v0 は読み捨て |
| `relations` | v0 は張らない（user が entry mint 後に relation-create UI で張る）|
| `provenance` (formal) | v0 は張らない。v1 で formal schema が定まった時点で追加判断 |

### 10.4 body header injection

- **trigger 条件**: `source_url` と `captured_at` の **少なくとも一方が与えられている** とき
- 書式（v0 固定）:

```markdown
> Source: <source_url>
> Captured: <captured_at>

<元の body>
```

- `source_url` のみがあるとき: `> Source: <source_url>\n\n<元の body>`
- `captured_at` のみがあるとき: `> Captured: <captured_at>\n\n<元の body>`
- 両方なし: header 非注入（= 既存 ACCEPT_OFFER 挙動と完全互換）
- header と元 body の間には **空行 1 行**を挟む（markdown 上の blockquote を自然に閉じるため）
- `captured_at` が unspecified のとき、receiver が生成した now（ISO 8601 UTC）を用いてよい。**ただし v0 では captured_at 未指定なら header 行自体を注入しない** 方針が single source of truth（sender 明示を優先、receiver の now 注入は既存 entry の updated_at に残る）

### 10.5 single entry / single mint

- 1 offer = 1 entry。multipart / multi-entry への expansion は v0 でやらない
- TEXTLOG への変換は現在 UI（`text-to-textlog-modal`）経由で user が明示的に行う操作で、capture path では **走らせない**

### 10.6 duplicate / idempotency

- v0 は **duplicate 判定を行わない**。同一 `source_url` の multiple capture は個別 entry として成立する
- `correlation_id` / offer_id による idempotency は v0 で採用しない（existing `offer_id` は receiver 側で発行される一時識別子で、sender が制御する領域ではない）
- v1+ で実需が出た場合、`source_url` をキーにした dedup UI（user への "既に capture 済みです" 警告）を別 feature として検討する

### 10.7 既存 reducer への変更点（実装済み、PR-A 2026-04-26 更新）

本 profile で固定した accept 時の body header injection は、**既存 `ACCEPT_OFFER` reducer の 1 箇所**（`src/adapter/state/app-state.ts:1190` の `ACCEPT_OFFER` case 内、`injectCaptureHeader()` 呼び出し）で実装済み。本 profile が規定する設計原則は以下:

- injection は **reducer 層で行う**（renderer / action-binder ではなく）
- injection は **新 action を追加せず** `ACCEPT_OFFER` 既存 path 内で完結させる
- injection の trigger 条件は §10.4 に固定
- **純関数 helper**: `injectCaptureHeader(body, sourceUrl, capturedAt) → string`（`src/adapter/state/app-state.ts:570` 付近）に切り出し済み、reducer から呼ぶ形を取ることで test 可能性 + 単一責務を確保

**Cross-reference**: `pkc-message-api-v1.md` §7.2.4 でも同 location を明記、integrator が spec 一読で「どの layer で provenance が body に注入されるか」を把握できる(PR-A 2026-04-26)。

---

## 11. Provenance attach policy

### 11.1 v0 provenance の 2 層分担

| 層 | v0 での扱い | v1 defer |
|---|---|---|
| **machine-readable provenance**（`Relation.kind = 'provenance'` + `metadata`）| **採用しない**（§11.2） | `conversion_kind = 'external-capture'` 等を新設する形で v1 で検討 |
| **user-visible provenance**（body header blockquote）| **採用**（§10.4） | 継続運用。v1 の machine-readable 層と併用可能な設計を保つ |

### 11.2 v0 で formal provenance Relation を張らない理由

- `provenance-relation-profile.md §2.2.1` は `conversion_kind` と `converted_at` を required とする。`conversion_kind` の列挙値は v1 profile で `'text-to-textlog'` / `'textlog-to-text'` / `'import-derived'`（将来）で固定されており、**`'external-capture'` は v1 profile に未登録**
- 新 `conversion_kind` 値を追加するには `provenance-relation-profile.md` の改訂 PR が必要
- 本 profile の v0 scope は receiver wire contract に閉じる方針であり、provenance Relation profile の改訂は別 PR で行う
- 暫定として v0 は body header（人間可読）のみ採用する。将来 machine-readable 層を足しても body header は残る（superset 的共存）

### 11.3 v0 で body header が担うこと

- user が後から entry を見た時の **可視的来歴**（markdown renderer が blockquote を視覚的に区別）
- 検索 / export / batch-import 経路での **自然な含有**（body に書かれた情報として追随）
- `entry-ref` autocomplete / references / backlinks には影響しない（body 先頭の blockquote は既存 link-index の走査対象でもある）

### 11.4 v0 で body header が担わないこと

- machine-readable クエリ（「external-capture で来た entry だけ一覧したい」など）— v1 defer
- container-level external source list への集計 — v1 defer（`container.meta.external_sources?[]`）
- sender identity の認証 / 非否認 — 永続的に本 profile の scope 外
- per-entry external-provenance diff / merge — v1 defer

### 11.5 future 拡張余地（defer）

v1 で検討する候補（本 profile の改訂 PR で固定）:

- `provenance-relation-profile.md` に `conversion_kind = 'external-capture'` を additive に追加
- `metadata` key として `source_url` / `captured_at` / `sender_id?` / `user_agent?` を規定
- body header と metadata の **整合契約**（両方に同じ情報が記録される、drift を避ける）
- container-level `external_sources[]` を additive schema として提案（受理は別 PR）

これらは本 profile では未採用と確定し、v0 implementation PR の範囲外とする。

---

## 12. Non-goals

以下は **本 profile で明示的にやらない**。将来 profile 改訂で採る場合は本章を更新してから実装する:

- **hook subscription**（push 型 event 配信）— `pkc-message-hook-subscription-decision.md` の Defer を継続。polling ベースのプロトタイプで必然性を実証してから再判定
- **background push 型 capture**（PKC2 未起動時の受信キュー）— single HTML 制約と両立しない（service worker / offline queue を持たない設計）
- **arbitrary HTML full-fidelity import** — sanitize / preserve の balance を取る設計が未成立。v0 では body を markdown 前提にする
- **attachment capture**（images / PDF / zip 等の payload 内埋め込み）— multipart 受信経路が未設計。v1+ で別 profile が必要
- **TEXTLOG / multipart / media capture** — 1 offer = 1 TEXT entry を固定
- **automated dedup** — `source_url` キー等の dedup は v1+ で別 feature
- **bookmarklet / browser extension 実装詳細** — sender 側の責務。PKC2 repo では sample レベルの参考実装を appendix 扱いで置く余地はあるが、normative spec 化しない
- **sender 実装 spec の詳細化** — capability negotiation / extension manifest / content script の正本化は本 PR の scope 外
- **graph / telemetry 連携** — `backlink-badge-jump-v1.md §6` / `unified-orphan-detection-v3-contract.md §6.2.1` と整合、永続的な non-goal
- **PKC2 本体の拡張化**（plugin loader / dynamic import）— single HTML invariant により永続的に non-goal

---

## 13. Open questions intentionally left for implementation PR

以下は本 profile で **意図的に fix せず、implementation PR で決定を委ねる** 論点。どれも本 profile の正本を破らない範囲で具体化される:

1. **allowedOrigins の具体値**: production bootstrap で何を入れるか（同一 origin のみ / 特定 extension ID / pkc.local など）。本 profile は "default restrictive" の方針のみ固定する
2. **size cap の実測チューニング**: 256 KiB を目安とするが、実 capture ケースで短すぎ / 長すぎが判明したら implementation PR で数値改訂候補になる。数値変更は spec 改訂 PR で合意する
3. **header 注入の locale / format**: `> Source:` / `> Captured:` の英語固定で十分か、locale 追従させるか。v0 の第 1 案は英語固定。user 可視文字列のため CLAUDE.md § Language Policy（final output は Japanese）と衝突しないかを implementation PR で要確認
4. **`"null"` origin を明示許可する運用**: file:// ユーザ向けに `allowedOrigins: ['null']` を recommend するか。本 profile はオプトインで許容と規定するが、recommend にするかは implementation PR で判断
5. **captured_at 欠落時に receiver now を注入するか**: 本 profile §10.4 は "sender 明示を優先、欠落時は header 行非注入" を single source of truth としたが、body header に now を書き出したい UX 要望が出た場合は改訂 PR で合意
6. **`selection_text` / `page_title` の v1 昇格判断**: v0 読み捨てが適切か、実 capture ケースで判断が入る場合は profile 改訂 PR で
7. **error handling の user-visible feedback**: size 超過 / invalid payload の reject を console.warn 以外に UI で示すか（非 pending な notification を出すか）。v0 は既存挙動（log のみ）継続、UI 追加は v1+

---

## 14. Next PR handoff

### 14.1 実装 PR の最小スコープ（本 profile 正本下の想定）

implementation PR はおおよそ以下の 5 点に絞って行うことが本 profile で示唆される境界:

1. **payload validator 拡張**（`src/adapter/transport/record-offer-handler.ts`）:
   - `validateOfferPayload` に `source_url` / `captured_at` / `selection_text` / `page_title` の optional field を追加
   - `body.length > 262144` の reject 分岐
   - unknown extra field は silent pass
2. **origin allowlist の default 調整**（`src/adapter/transport/message-bridge.ts` の caller 側、実質 `src/main.ts` の `mountMessageBridge` 呼び出し箇所）:
   - production 経路で `allowedOrigins` を明示設定する
   - accept-all を避ける（少なくとも debug ログが残るように）
3. **body header injection**（`src/adapter/state/app-state.ts` の `ACCEPT_OFFER` case）:
   - `source_url` / `captured_at` のどちらかが pending.metadata 相当の slot に存在するとき、body 先頭に blockquote header を注入
   - PendingOffer interface に optional slot を足す必要がある場合、**core の Container schema は触らず**、runtime-only の AppState 内で閉じる
4. **tests**（新規 4 系統）:
   - payload validator: optional field 受理 / size 超過 reject / title 空 reject / unknown extra field silent pass
   - header injection: source_url のみ / captured_at のみ / 両方 / どちらもなし の 4 ケース
   - origin allowlist: 一致 accept / 不一致 reject / `"null"` default reject
   - reducer integration: capture-specific payload → PendingOffer → ACCEPT_OFFER → body header 付き entry mint
5. **dist / manual build**（`npm run build:bundle` + `npm run build:release`）— 既存 pipeline に乗せる

### 14.2 層の境界（CLAUDE.md §Architecture 準拠）

- `core/`: **touch しない**（Container / Entry / Relation schema 変更なし）
- `features/`: **touch しない**（capture 固有の derived selector を v0 で作らない）
- `adapter/`:
  - `transport/record-offer-handler.ts`: validator 拡張
  - `transport/message-bridge.ts`: 既存のまま（allowedOrigins を呼び出し側で明示するだけ）
  - `state/app-state.ts`: `ACCEPT_OFFER` reducer に body header injection を差し込む
  - `ui/`: **新規 UI を足さない**（PendingOffer UI は既存）
- `runtime/`: **touch しない**（capability 文字列を CAPABILITIES に増やさない、§5.1）
- `builder/`: **touch しない**

### 14.3 docs-first で先に固定した点（本 PR で決めたこと）

- 新 message type を **追加しない**（§5）
- payload の superset field を **4 本に限定**（§8.2）
- body size hard cap を **256 KiB** に規定（§9.3）
- silent accept を **禁止**（§9.5）
- origin `"null"` は **default reject**（§9.2）
- v0 provenance は **body header のみ**（§11）
- duplicate / idempotency は **v0 で行わない**（§10.6）
- reducer 層で body header injection を行い、**新 action を増やさない**（§10.7）

implementation PR はこれらを破らない範囲で実装する。破る必要が出た場合は spec 改訂 PR を先行させる。

### 14.4 tests の観点（本 profile 由来）

- envelope validation × payload validation × size cap × origin allowlist の 4 系統を組み合わせたテストマトリクス
- `record:reject` sender path に変更がないことの回帰確認（`transport-record-reject-decision.md` 整合）
- PendingOffer UI が既存挙動のまま表示されること（silent accept 禁止の機械的検証）
- body header injection の trigger 条件 4 ケース（both / source only / captured only / neither）
- readonly モードでの ACCEPT_OFFER block が既存挙動のまま維持されること

### 14.5 関連文書

- `docs/development/extension-capture-v0-draft.md` — 設計 draft（本 profile の直接の親）
- `docs/planning/resolved/24_message_transport.md` — `pkc-message` v1 protocol 正本
- `docs/spec/provenance-relation-profile.md` — `RelationKind = 'provenance'` v1 profile（本 profile は v0 で未採用）
- `docs/development/pkc-message-hook-subscription-decision.md` — hook **Defer**（本 profile と整合）
- `docs/development/transport-record-reject-decision.md` — `record:reject` sender-only（本 profile と整合）
- `docs/development/transport-record-accept-reject-consistency-review.md` — accept/reject 整合 review
- `docs/development/backlink-badge-jump-v1.md §6` — graph defer policy（本 profile と整合）
- `docs/development/unified-orphan-detection-v3-contract.md §4.8 / §6.2.1` — graph 意味論の永続 non-goal
- `src/adapter/transport/record-offer-handler.ts` — receiver handler（implementation PR で payload validator 拡張対象）
- `src/adapter/transport/capability.ts` — capability rule（本 profile で変更しない）
- `src/adapter/transport/envelope.ts` — envelope parser（本 profile で変更しない）
- `src/adapter/transport/message-bridge.ts` — bridge + origin check（allowedOrigins 呼び出し側の default 調整対象）
- `src/adapter/state/app-state.ts` — `ACCEPT_OFFER` reducer（body header injection の差し込み箇所）
- `src/core/model/message.ts` — `MessageType` union（本 profile で変更しない）
- `CLAUDE.md` §Architecture — 5-layer / single HTML / Container is source of truth / no premature abstraction（本 profile の設計前提）
