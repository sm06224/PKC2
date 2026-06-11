# Transport hardening + observability 設計 — #795 A-3 / A-4 / B-1 / C-3(2026-06-10)

**Status**: 設計 doc → **実装 go 済み(user 判断 2026-06-11、#795 コメント)**。進捗: **B-1 + C-3 = ✅ 実装着地**(`onTraffic` seam + spec §Observability(v1 §13 / v2 §6)、ring buffer `kind:'transport'` 配線)。**A-3 = ✅ 実装着地**(fail-closed: empty/未指定 = deny-all、accept-all は `['*']` sentinel のみ、provider 例外 = deny-all。v1 spec §3.4 への準拠修正 + integration doc §4 更新)。**A-4 = ✅ 実装着地**(粗サイズ上限 1Mi units + origin 別固定窓 120msg/60s、v1 spec §3.5 新設。数値は user 最終確認待ちの提案値 — exported 定数で変更容易)。**4 項目すべて完了。**
**Issues**: #795(transport 監査)/ 関連 #796(封じ込め)・#791(v2 統合)
**前提**: A-1(targetOrigin ピン留め、PR #797)/ A-2+C-2(size cap 名実一致、PR #798)/ B-2(PR #799)/ C-1(PR #800)は着地済み。

---

## 1. A-3 — allowedOrigins provider の fail-closed 既定化

### 現状(fail-OPEN)

`message-bridge.ts` `resolveAllowedOrigins()`: provider が throw すると `onReject` 通知後 `[]` を返し、`[]` は「`'null'` 以外 accept-all」に解決される。**設定読み込み失敗が即「全 origin 受理」に倒れる**。module doc と `message-bridge-setup.md` §4.2 は「fail-safe、fail-closed は deployment が選べ」と明記しており設計判断ではあるが、セキュリティ既定として危険側。

### 設計(挙動変更 — 実装 go 待ち)

1. **意味論の分離**: 「accept-all」は明示 sentinel **`['*']`** のみで表現する。`[]` は **deny-all** に変更。
2. **provider 例外時**: `[]`(= deny-all)を返す。`onReject` への監査通知は維持。
3. **互換性影響(要注意)**: 現 mount(`main.ts`)は静的 `[window.location.origin]` なので**無影響**。影響するのは (a) `allowedOrigins` 未指定 / `[]` を「accept-all のつもり」で渡している deployment、(b) provider 例外に依存して accept-all へ倒れていた deployment。(a) は in-repo に存在しない(grep 済: mount は明示リストのみ)が、**外部 embed 利用者には breaking** — v1 spec §9.2(additive rule)に照らすと「受信が狭まる変更」なので、**spec 追補 + CHANGELOG 周知つきで 1 PR**、または v2 経路のみ先行適用の 2 案。
4. **spec 明文化(実装より先に可能)**: v1 spec §3.x に「provider 例外時の既定挙動は実装定義。本実装は fail-closed(v2026-06 以降)/それ以前は fail-open」を normative に書く。

**推奨着地**: spec 明文化 → 実装変更(`[]` deny-all + `['*']` sentinel)を 1 PR(test: provider throw → 全 reject / `['*']` → accept-all 維持)。

## 2. A-4 — rate / 受信サイズ上限の最小設計

### 現状

bridge は rate limiting / payload size limit を**意図的に持たない**(module doc 明記)。allowlist 内 sender の flood は validate + handler コストを毎回払う(record:offer なら PendingOffer 量産)。

### 設計(最小、実装 go 待ち)

1. **受信 envelope 粗サイズ上限**: `handleMessage` 冒頭、validation の前に「`event.data` が string 換算で N を超えるなら drop + onReject」。測定は `JSON.stringify` の再走を避け、**structured clone 済み object に対する概算**(`body` 等の主要 string field 長の合計)か、sender 側 contract として「envelope 全体 ≤ 1 MiB(UTF-16 units)」を spec に置き receiver は best-effort 検査とする。既存の body cap(262144 UTF-16 units)とは別の外側の壁。
2. **rate limit**: origin 単位の固定窓カウンタ(例: 60 秒窓で 120 msg、超過分は drop + onReject 1 回/窓)。token bucket は過剰。**メモリは `Map<origin, {windowStart, count}>`** で十分、`'null'` origin は 1 バケツに集約。
3. **spec(実装より先に可能)**: 「v1 は rate/size を規定しない。receiver 実装の裁量で drop してよい(sender は drop を前提に再送設計せよ)」を v1 spec に明文化 + 本実装の既定値を informative に記載。
4. **観測**: drop は B-1 の `onTraffic`(verdict: 'dropped')に乗せる — A-4 単独で UI/console を増やさない。

**数値は user 判断**(1 MiB / 120 msg/min は提案値)。PKC2-Extension SR-07 と対。

## 3. B-1 — 統一トラフィック観測 seam `onTraffic`

### 目的

ホスト内部から PKC-Message の**全トラフィックを 1 箇所で観測可能にする** seam。可視化 UI はホストに足さない(プライム・ディレクティブ)— 消費者はデバッグ導線と将来の拡張側 recorder。

### 型(BridgeOptions に追加、既定 undefined = 完全後方互換)

#795 本文の型案を採用(direction / protocol / verdict / type / origin / sourceId / targetId / rejectCode? / at)。**payload は既定で含めない**。

### Emit 点(現状の盲点を全て塞ぐ)

| トラフィック | verdict | 現状 |
|---|---|---|
| inbound v1 正常(handler delegate) | accepted | onMessage で可視 |
| inbound ping(bridge 内部処理) | accepted | **不可視 → 塞ぐ** |
| inbound origin reject / invalid | rejected | onReject で可視 |
| inbound target_id 不一致 silent drop | dropped | **不可視 → 塞ぐ** |
| outbound 全部(pong / record:reject / export:result / v2 応答) | sent | **不可視 → 塞ぐ** |
| v2 往復(heartbeat 成功含む) | accepted / sent | 成功は**不可視 → 塞ぐ** |
| 非 PKC message(quick filter skip) | — | emit しない(ノイズ、foreign は jsonrpc 持ち等の準 PKC のみ) |

実装は bridge の各分岐 + `createSender.send` から 1 行 emit。**handler 内部(record-offer の payload 検証 reject 等)は v1 では scope 外**(handler-level reject は従来どおり console、seam 化は v2 gate 一貫性設計と合流)。

### payload と redaction(本設計の線引き)

- 既定: **メタデータのみ**。payload を流す経路は作らない。
- `?pkc-debug=transport` フラグ(`debug-via-url-flag-protocol.md` の枠組みに 1 feature 追加)が立っている場合のみ、`onTraffic` event に `payloadPreview?: string` を付与: **先頭 256 文字 + 長さ**、かつ redaction(`assets` / base64 様 field(`data:` / 連続 base64 1KB 超)を `[redacted]` に置換)。full payload は出さない。
- debug recorder(既存 `debug-flags.ts` の ring buffer)に `kind: 'transport'` として載せ、既存の debug report 導線で輸出。**新 UI ゼロ**。

### Bundle / 実装規模

emit 1 行 × ~10 箇所 + 型 + redaction helper ≒ 80-120 行、bundle +1KB 未満見込み。

## 4. C-3 — spec §Observability(B-1 と対、文面ドラフト)

B-1 実装 go と同時に v1 / v2 spec へ追加する節のドラフト:

> **§ Observability**
> 1. receiver は受信・送信・drop・reject の各イベントを実装定義の観測点(callback / ログ)に公開してよい(MAY)。
> 2. 観測点に payload を含める場合、(a) 明示的なデバッグフラグ下に限定し(MUST)、(b) assets / base64 データを redact し(MUST)、(c) 全文ではなく bounded preview とする(SHOULD)。
> 3. 観測点はプロトコル挙動(応答・受理判定)に影響してはならない(MUST NOT)。observer の例外は握り潰す。
> 4. sender は観測の有無を検知できない(観測は receiver のローカル事項)。

## 5. 着地順の提案(すべて go 待ち)

1. **B-1 + C-3**(観測 seam + spec 節)— 他項目の検証手段になるため先行価値が最大。実装 ~120 行、後方互換完全
2. **A-3**(fail-closed)— spec 追補と同時。外部 embed への周知要
3. **A-4**(rate/size)— 数値の user 合意後。drop は B-1 の seam に乗せる

## 関連

- 発端: #795(A-3 / A-4 / B-1 / C-3 の各節)
- 封じ込め設計(#796)とは独立して着地可能。ただし B-1 の seam は封じ込めパイロットの検証にも使える
- `docs/development/debug-via-url-flag-protocol.md`(`?pkc-debug=` 枠組み)
- INDEX: [`INDEX.md`](./INDEX.md)
