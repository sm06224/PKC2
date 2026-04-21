# PKC-Message Hook Subscription Protocol — PKC2 側レビュー（docs-only）

> **📌 canonical pointer（2026-04-21 時点）**
>
> - **canonical entry point**: `pkc-message-hook-subscription-decision.md`
> - **current decision**: **Defer**（実装しない）
> - **優先される proof path**: polling などの simpler な手段を先に通す
>
> 本文書は設計検討の論点整理として価値を保ち続けるが、**現時点の実装指示書ではない**。
> 「次にこれを実装すべき」と読まないこと。実装判断を辿るときはまず decision doc を読むこと。

**Status**: design review — 2026-04-20. **本 PR は実装を含まない**。
**Purpose**: 外部から提案された「PKC-Message Hook Subscription Protocol (Opt-in / Secure / Compatible)」について、PKC2 実装チーム側の受理条件付きレビューを文章化する。

---

## 0. TL;DR

- 提案の方向性は前向きに評価できる（ping/pong 保全・version=1 追加・opt-in grant・TTL/projection の明示）
- ただし PKC2 側でまだ詰めるべき論点が複数残る（hook:\* のサブプロトコル扱い、grant モデル、`custom` との関係、DomainEvent と外向き payload の分離、snapshot スコープ）
- **実装受理はまだしない**。設計検討として受理し、下記 v1 最小スコープに narrow した上で別途実装 PR を起こすことを条件とする

---

## 1. 提案要約（中立的再述）

提案は PKC-Message プロトコル (`version: 1`) に **opt-in のイベント購読サブプロトコル** を additive に追加するもの。主な構成要素:

- **新メッセージ型**: `hook:subscribe` / `hook:subscribed` / `hook:event` / `hook:unsubscribe` / `hook:error`（必要なら `hook:list`）
- **Opt-in grant**: PKC2 側が embedded / same-origin / trusted-origin / readonly / editable といった粒度で購読を許可
- **Scope filter**: イベント種別（例: relation.created / entry.updated）+ optional filter（lid / kind）で購読対象を絞る
- **Projection**: payload から field を選択 / redact できる形でホスト側に露出を絞らせる
- **TTL / Revoke**: 購読には有効期限を付け、`hook:unsubscribe` で取り消す
- **Snapshot**: 購読成立時に（任意で）`initial-graph` 等の状態スナップショットを返す
- **互換性**: ping/pong 等の既存メッセージ型を変更しない。`hook:\*` を認識しないホストは従来どおり無視できる

提案は Graph Tool 側のユースケース（PKC2 の relation 変化を別オリジンで可視化する）を具体例として挙げており、**PKC2 を一方的な受動サーフェス化するのではなく、ホスト側が明示許可した上で push 方向の通知を得るためのプロトコル拡張**として設計されている。

## 2. 肯定評価

### 2.1 既存プロトコルを壊さない
`version: 1` の枠内に **新しい type を足すだけ** の additive 拡張で、ping/pong / record:offer / export:request / navigate / custom の意味論を変えない。PKC2 の `src/adapter/transport/envelope.ts` の `KNOWN_TYPES` と `capability.ts` の `MESSAGE_RULES` に追加するだけで既存経路に副作用を及ぼさず済ませられる構造。

### 2.2 Opt-in 原則
購読は PKC2 側が **明示的に grant** しない限り成立しない。デフォルトは「拒否」。これは PKC2 の現行 capability モデル（`canHandleMessage()` の allow-list 方針）と整合する。

### 2.3 Scope / Projection / TTL / Revoke が最初から入っている
「event の種類」「filter」「payload の射影」「有効期限」「撤回」が仕様レベルで揃っている。後付けで差し込むと互換性を壊しやすい項目が最初から一揃いになっているのは前向き。特に projection が必須要素として提示されている点は、**内部 DomainEvent payload を丸ごと露出しない**というレビュー側の最大要件と一致する。

### 2.4 具体ユースケースがある
Graph Tool という具体的な使い道が示されており、抽象的な "generic event bus" にせず済む。PKC2 としても relation 可視化は v2+ の候補として議論されてきた領域（`backlink-badge-jump-v1.md` §6 で graph deferral を明文化）なので、**外部ツールと分離して提供する**方向は本体を太らせない良い落としどころになり得る。

## 3. PKC2 側の懸念 / オープン論点

### 3.1 `hook:*` は「サブプロトコル」か「単なる追加メッセージ型」か
提案は `hook:*` を群としてまとめて語っているが、PKC2 側の実装粒度では `hook:subscribe` / `hook:event` / ... は **`VALID_MESSAGE_TYPES` に並ぶ個別型** に過ぎない。`capability.ts` の `MESSAGE_RULES` もメッセージ型単位の判定なので「hook サブプロトコル全体を許可する」という概念は現状のコードに存在しない。

**論点**: 「サブプロトコル」という粒度の概念を導入するか、`hook:*` を**個別 type の集合として扱い内部で別レイヤを構築しない**か。PKC2 側のミニマリズム方針としては **後者（個別 type 扱い）** を推す。サブプロトコル層を持ち込むと `canHandleMessage()` / envelope 検証の責務が増え、5-layer 構造にない概念が transport レイヤに生える。

### 3.2 Grant モデルの粒度
提案では embedded / same-origin / trusted-origin / readonly / editable 等の grant 粒度が語られるが、**PKC2 側の現行 embedded 判定は boolean 1 本**（`canHandleMessage(type, embedded)` の第 2 引数）。same-origin / trusted-origin を判定するには `event.origin` の記録・比較が必要で、そのストアをどこに置くかも未決。

**論点**: v1 で対応する grant 粒度をどこまで広げるか。PKC2 側としては **embedded-only（既存 `export:request` と同モード）+ memory-only grant（永続化しない）** に narrow することを推奨。trusted-origin の allow-list 永続化は v2+。

### 3.3 既存 `custom` メッセージ型との関係
PKC2 には `custom` 型が **envelope 上は宣言されているが `MESSAGE_RULES` で routing されていない** という未活用サーフェスがある（`envelope.ts:53` vs `capability.ts:49-52`）。「`custom` で包めば hook も載るのでは」という主張も成り立ち得る。

**論点**: `custom` を hook の運び手として使うか / `hook:*` を独立 type として持つか。レビュー側の見解は **独立 type を推奨**。理由:
- `custom` は「プロトコル外のアプリ固有ペイロード」を意図した出口であり、hook は**プロトコルそのものの機能**である
- `custom` に乗せると projection / TTL / revoke といった制御フィールドの位置が仕様化しにくい
- 独立 type なら `capability.ts` の allow-list で grant / reject を単純な真偽判定として記述できる

### 3.4 内部 DomainEvent と外部 hook event payload の分離
PKC2 内部には `Dispatcher.onEvent()` が流す DomainEvent (`ENTRY_SELECTED` / `RELATION_DELETED` 等) があるが、これらは **UI state 同期のための内部バス** であって、外部に安定契約として露出することを想定していない。

**論点**: hook event payload は **DomainEvent と独立した外向きスキーマ**として定義する必要がある。内部 DomainEvent をそのまま流すと:
- reducer / state 改修のたびに外向き契約が割れる
- UI 専用フィールド（selection 等）が意図せず漏れる
- projection 実装が「内部フィールドを削る」方向になり redact 漏れのリスクが構造的に残る

**推奨**: `src/adapter/transport/` 配下に **hook-event-projector** 相当の pure 関数層を設け、`Relation` / `Entry` の **公開フィールドのみをコピーした外向き型** (`HookRelationEventPayload` 等) を組み立てる。DomainEvent を直接 serialize しない。

### 3.5 Snapshot のスコープ
提案は購読成立時の snapshot（`initial-graph` 等）を挙げる。relation 全件返却は中規模 container（数百〜数千 relation）では妥当だが、`entries` / `revisions` / `assets` を snapshot に含めると **単発メッセージで MB 級ペイロード**になりうる。

**論点**: v1 で許可する snapshot 種別。**`initial-graph`（relation 全件 + 最小の endpoint entry 情報 lid / title のみ）に限定**し、`initial-entries` / `initial-revisions` / `initial-assets` は受け付けない。assets は transport 上の size 前提を変えるので特に要注意。

## 4. 推奨 PKC2 v1 スコープ

実装受理するとすれば、最小で次のとおり narrow する:

### 4.1 メッセージ型（5 種に限定）
- `hook:subscribe` — 購読要求（scope / filter / projection / ttl 指定）
- `hook:subscribed` — grant 成立通知（subscriptionId / expiresAt / 返送 snapshot 添付可）
- `hook:event` — イベント push（subscriptionId / type / payload）
- `hook:unsubscribe` — 撤回（subscriptionId 指定、host / guest どちらからも可）
- `hook:error` — grant 拒否 / invalid scope / expired / internal 等の通知

**`hook:list` は v1 含めない**（購読一覧は diagnostics にすぎず、外部から問い合わせる必要性が v1 では不明）。

### 4.2 Grant モード: `embedded-only` + `memory-only`
- `MESSAGE_RULES` に `'hook:subscribe': { mode: 'embedded-only' }` を追加
- grant は **メモリ上のみ**（`Map<subscriptionId, ActiveSubscription>`）で保持、リロードで消える
- trusted-origin allow-list / 永続 grant は v2+

### 4.3 TTL 必須
- `hook:subscribe` は `ttl` (ms) を必須フィールドに
- 無期限購読は v1 では認めない
- 上限（例: 24h）を設け、超過要求は `hook:error` で拒否
- TTL 経過で host 側が自動 `hook:unsubscribe` 相当の終了通知を送る

### 4.4 対象イベントは relation 系のみ
- `relation.created` / `relation.updated` / `relation.deleted`
- entry 本体・revision・asset 系は v1 含めない（payload size / privacy リスクが relation より大きい）
- DomainEvent → HookEventPayload の projection は **relation 用の専用型** (`HookRelationEventPayload { id, from, to, kind, created_at, updated_at }`) で固定。`metadata` は v1 では露出しない

### 4.5 Projection は必須
- `hook:subscribe` の `projection` フィールドは必須（omit / empty は reject）
- 許可フィールドの allow-list を実装側で持ち、未知フィールド要求は `hook:error`
- これで「内部 DomainEvent を丸ごと流す」経路が構造的に塞がれる

### 4.6 Snapshot は `initial-graph` のみ
- 値は `{ relations: HookRelationEventPayload[], endpoints: { lid, title }[] }` のみ
- body / revision / asset を snapshot に含めるオプションは受け付けない
- endpoints.title は表示補助用。body は絶対に含めない

### 4.7 レートリミット
- 単純な throttle（e.g. `hook:event` は最小 50 ms 間隔 / 同一 subscriptionId あたり）
- bursty な bulk relation 変更時は coalesce でまとめる（詳細は実装 PR で詰める）
- 適応的バックオフは v2+

### 4.8 実装レイヤ想定（参考）
| 層 | ファイル（想定） | 追加内容 |
|----|------------------|----------|
| transport | `capability.ts` | `MESSAGE_RULES` に hook:subscribe を追加 |
| transport | `envelope.ts` | `KNOWN_TYPES` に `hook:*` 5 種を追加 |
| transport | `hook-subscription-registry.ts`（新） | in-memory subscription store / TTL タイマ / throttle |
| transport | `hook-event-projector.ts`（新） | DomainEvent → HookEventPayload の純関数変換 |
| transport | `hook-subscribe-handler.ts`（新） | subscribe/unsubscribe のハンドラ |
| adapter | 既存 `Dispatcher.onEvent()` | subscribe 済みのときだけ projector 経由で hook:event を送信 |
| core | — | 変更なし（core に hook 概念を持ち込まない） |

**core には一切変更を入れない**。hook は transport の機能であり、データモデルではない。

## 5. 非スコープ（明示的 defer）

本 PR（= 本レビュー文書）では以下を**行わない**:

- **実装**: `hook:*` 型のコード追加・テスト追加・dist 更新はすべて別 PR とする。本 PR はドキュメントのみ
- **汎用 event bus 化**: entry / revision / asset / selection / phase など何でも流せる "generic pub-sub" にはしない。v1 は relation 系のみ
- **永続 grant**: trusted-origin allow-list を IndexedDB などに保存する機構は v1 に入れない
- **`hook:list` / 診断 API**: 購読一覧参照は v1 に入れない
- **Graph コアの取り込み**: PKC2 本体に graph 可視化を実装しない。hook はあくまで「外部ツールから購読できる」ようにするプロトコル拡張であり、可視化は別アプリ（別オリジン）で行う（`backlink-badge-jump-v1.md` §6 の graph deferral 方針と整合）
- **`custom` への相乗り**: `custom` メッセージ型を hook の運び手にしない。hook は独立した type で扱う
- **TTL 無制限購読 / 長期接続**: 最大 TTL を設け、無期限購読は許容しない
- **Body / revision / asset の snapshot**: snapshot は relation グラフ骨格のみ

## 6. 最終推奨

**設計検討としては受理、実装受理はまだしない**。

理由:
- 方向性（opt-in / additive / projection / TTL / revoke）は PKC2 の既存設計原則と整合する
- しかし §3 に挙げた 5 つの論点（サブプロトコル扱い、grant 粒度、`custom` との関係、DomainEvent 分離、snapshot スコープ）は **実装 PR に入る前に決着させる必要がある**
- 実装に入ると `transport/` にレイヤが増え、後戻りコストが docs-only の今より大きく上がる

### 受理条件（実装 PR を起こす前に満たすべき前提）
1. §4 の v1 スコープ narrow（5 型 / embedded-only / memory-only / TTL 必須 / relation-only / projection 必須 / `initial-graph` のみ / simple throttle）で提案側と合意
2. HookEventPayload スキーマを DomainEvent と独立した**外向き契約**として文書化
3. `hook:*` は独立 type として扱い、`custom` の相乗りはしないと合意
4. 実装 PR は **features / core を変更しない**（transport + adapter 限定）という境界条件を確認

### 進め方
- 本レビュー文書を merge（docs-only）
- 提案側と §3 / §4 の論点について text round-trip（docs PR のコメント or 別文書）で合意形成
- 合意後、**別 PR** で `transport` 層への実装を起こす。その際は
  - 実装 PR の仕様書（scope / API / projection allow-list）を先に 1 つ書く
  - テスト（envelope / capability / projector / subscription lifecycle）を実装と同 PR に含める
  - dist bundle の size 増を計測して報告する

### 一行結論
**提案は筋が良い。ただし v1 narrow と外向きスキーマ分離を前提条件として、実装受理は別 PR で改めて判断する。**

---

## 関連文書

- `docs/development/transport-record-accept-reject-consistency-review.md` — transport レイヤにおける allow-list 判定の先行事例
- `docs/development/transport-record-reject-decision.md` — 受信経路未整備型を `MESSAGE_RULES` に載せない判断の実例
- `docs/development/backlink-badge-jump-v1.md` §6 — graph 機能の本体取り込みを defer する方針
- `docs/development/unified-backlinks-v0-draft.md` — 同種の docs-only 設計 draft の先行例（terminology 先行確立パターン）
- `src/adapter/transport/envelope.ts` — `KNOWN_TYPES` / `custom` の現状
- `src/adapter/transport/capability.ts` — `MESSAGE_RULES` / `canHandleMessage()` の現状

