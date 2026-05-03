# PKC-Message v2 — Open Questions decision doc(2026-05-03)

**Status**: LIVE(decision draft、user review 待ち。承認後は v2 spec の根拠 doc として固定)
**Source**: [`pkc-message-v2-prior-art-and-plan-2026-04-26.md`](./pkc-message-v2-prior-art-and-plan-2026-04-26.md) §9 Open questions 5 件
**Scope**: prior-art doc が「architecture 判断 → user 合意が必要」と保留した 5 OQ を、v2.0 minimum 着手前に decision として固定するための doc。各 OQ について **decision** + **wire / spec 影響** + **phase 配分**(v2.0 / v2.1 / v2.2 / v3+)を確定。本書の合意後、v2 spec(別 PR、`docs/spec/pkc-message-api-v2.md` NEW)で normative 化。

---

## 1. 各 OQ への decision

### OQ-1 — postMessage に connection 概念が無いことの扱い

**問題**: graphql-ws / WebSocket は physical connection close で subscription cleanup が来るが、postMessage は iframe が unload されても host 側に通知が来ない(`pagehide` イベントは iframe 内のスクリプトしか受けられない)。

**Decision**: **(a) heartbeat 必須化** — 採用。

**Wire / spec 影響**:
- `initialize` response の `serverCapabilities` に **`heartbeat: { intervalMs: number, toleranceMs: number }`** を含める(host が要求する間隔と猶予)。default = `{ intervalMs: 15000, toleranceMs: 5000 }`(15 秒間隔 + 5 秒猶予)。
- sender は `intervalMs` 周期で **`$/heartbeat`**(JSON-RPC 2.0 notification、id なし、params なし)を送る義務。
- host は `intervalMs + toleranceMs` 経過で sender を `inactive` 扱い、subscription を全て `subscription.cancelled` で終端、pending request は `error.code = -32099 (sender_inactive)` で reject。
- 復活: sender が再度 `$/heartbeat` を送れば revive(新 subscription は再 `subscribe` 必須)。
- subscription TTL は **24 時間 hard cap**(v1 acceptance contract 継承)、heartbeat 維持中でも 24 時間で auto-cancel。

**Phase**: **v2.0 minimum**(subscription を含むため v2.2 だが、heartbeat 自体は initialize 段階で必須宣言)。

**v2 spec section pointer(予定)**: §3.6 Liveness, §5.4 Subscriptions(heartbeat 詳細)

**Open sub-question**: heartbeat を不要とする sender(同一 origin / trusted internal extension 等)に opt-out を許すか? → **拒否**(complexity 増、initial 実装は単純維持)。trusted sender でも heartbeat は cheap(1 message / 15 秒)。

---

### OQ-2 — id 衝突防止の発行責任

**問題**: JSON-RPC では client が id を発行。複数 sender(複数 iframe)が同時に request を投げる場合、host から見ると **異なる sender が同じ id を使う可能性**。

**Decision**: **(a) `(source_id, id)` の複合 key で host が dedupe** + **(b) sender 側で UUID v4 推奨を spec normative**。

**Wire / spec 影響**:
- envelope に **`source_id: string`** field 追加(host が `initialize` 時に sender ごとに発行、UUID v4 string、その後 sender の全 message が同 source_id を carry)。
- host 内部の request map は `Map<\`${source_id}:${id}\`, PendingRequest>` で複合 key 管理。
- sender への spec normative 文言:「id は UUID v4 string を強く推奨。`number` も spec 上は valid だが、複数 iframe 動作時に衝突可能性あり」
- error: 同 sender が同 id で重複 request を送ったら `error.code = -32098 (duplicate_id)` で reject(host 側の防御)。

**Phase**: **v2.0 minimum**(envelope 構造に直結、後付け不可)。

**v2 spec section pointer**: §4.1 Envelope structure(`source_id` field)、§4.3 ID convention

**Open sub-question**: source_id 自体の発行を sender が claim する設計は? → **拒否**(host 集中発行のほうが malicious sender の spoofing 防止に強い)。

---

### OQ-3 — Tasks primitive の永続性

**問題**: MCP の Tasks は session 内でのみ valid。PKC2 で record:offer を task 化したとき、user が iframe を閉じた後で完了したら結果はどう保持するか。

**Decision**: **v2.1: (a) memory-only**(session 終了で task 消滅) + **v3+: (b) Container 内 entry 化を再評価**(`task` archetype 新設は schema 変更慎重)。

**Wire / spec 影響(v2.1)**:
- `tasks/create` request → response に `task_id: string` 返却
- `tasks/get` で polling、`tasks/cancel` で abort
- task の状態は host process memory 内 `Map<task_id, TaskState>` で管理
- session 終了 = host process 終了 / page reload で task は **silently lost**(spec で明示「volatile」と宣言)
- sender は完了通知を期待する場合、`tasks/get` polling か(将来の)subscription を使う

**Phase**: **v2.1**(record:offer task 化と一緒に着地、AI 協働 long-running 用)。

**v3+ 拡張(deferred、本書では確定しない)**:
- `task` archetype 新設の是非
- 永続化された task entry の表示 UX
- task → record:offer 結果 entry への conversion

**v2 spec section pointer**: §5.3 Tasks(volatile 宣言 + lifecycle)

**Open sub-question**: v2.1 着地時に「next time persist」予告を spec に書くか? → **書く**(v3+ migration への期待値設定、spec §13.2 として「Future: persistent tasks」)

---

### OQ-4 — per-method ACL の表現場所

**問題**: v1 は host 側 handler 内で sender_id を見て if 文で済ませる運用。v2 で formal 化するときに表現場所をどこに置くか。

**Decision**: **(ii) `Container.meta.extensionGrants` を canonical** + **(iii) 初回利用時 dialog で consent → meta に保存** + **(i) wire spec には現れない**(host 内部実装の詳細)。

**Wire / spec 影響**:
- Container schema 拡張: `meta.extensionGrants?: ExtensionGrant[]`
- `ExtensionGrant`:
  ```ts
  {
    sender_origin: string;           // e.g. "https://example.com"
    sender_id_hash?: string;         // optional finer-grained ID (sha256 of source_id seed)
    scopes: string[];                // e.g. ["record.offer", "tasks.create", "search.read"]
    granted_at: string;              // ISO 8601
    granted_by: 'user' | 'auto';     // 'auto' = whitelist via initial trust
    expires_at?: string;             // optional expiry
  }
  ```
- host 内部の ACL check: 各 method handler の前段で `extensionGrants` を look up、未許可なら **dialog 表示**(initial use)→ user 承認後に grant 追加 → request 続行。
- user は SETTINGS UI で grant 一覧 / 取消 / 期限変更 可能(別 PR で UI 着地)。

**Phase**: **v2.2**(ACL は wave 後段、まずは ping/pong / record.offer / tasks の minimum を v2.0 で固める)。

**Schema migration**: Container schema_version を **2 → 3** に上げ、`migrations/v2-to-v3.ts` で `meta.extensionGrants = []` を inject(空配列 default、既存 container は影響なし)。

**v2 spec section pointer**: §6 Authorization(extensionGrants schema + flow)、§5.7 Per-method ACL

**Open sub-question(本書で deferred)**:
- scope 命名規則(`record.offer` vs `record:offer` vs `record.write` 階層化)
- grant 期限 default(無期限 / 30 日)
- revoke 時の pending request の扱い

---

### OQ-5 — AI Extension の content block delta が record:offer の atomic 性とどう両立するか

**問題**: v1 record:offer は host が user dialog で確認 → accept で 1 entry 作成、という atomic flow。AI が delta で書き続けるとき、(a) delta は preview のみ / (b) live update / (c) delta 終了後 dialog のいずれにすべきか。

**Decision**: **v2.2: (a) preview-only delta** のみ実装。**(b) は別 method `record.live` として v3+ で再評価**(現行 contract と分離)。**(c) は不採用**(user 体験劣化)。

**Wire / spec 影響(v2.2)**:
- `record.offer` の `params` に `delta_supported?: boolean` を追加可、true の場合に host が `record.offer.delta` notification を受け付ける。
- `record.offer.delta` notification: `{ task_id, body_delta_text, append_only: true }`(append-only protocol、本文は累積で host が保持)
- host は dialog 内で「現在の累積 body」を live preview 表示、ただし accept 時は最終的に `record.offer` request の `params.body`(完全形)を採用 = atomic 性維持。
- delta は **dialog 表示中にのみ意味あり**、user が dismiss / accept した後の delta は silently dropped。
- AI が "live writing 完了" を伝えるには `record.offer.delta` の最後に `{ final: true }` flag、host はこの flag を見て dialog の Accept ボタンを enable。

**Phase**: **v2.2**(record.offer 自体は v2.0、delta は後段)。

**v3+ 検討(deferred)**:
- `record.live`: accept 後の entry を live で更新できる別 method。AI agent の "live collaborator" 像。spec / UX / conflict resolution / undo の設計が大きいため v3+。

**v2 spec section pointer**: §5.5 record.offer with delta(append-only protocol)

**Open sub-question(本書で deferred)**:
- delta の rate limit(1 秒に何 message まで?)
- delta encoding(plain text / op-based / CRDT?)→ **plain text append が default、op-based / CRDT は v3+ `record.live` で検討**

---

## 2. Phase 配分まとめ

| OQ | v2.0 minimum | v2.1 | v2.2 | v3+ |
|---|---|---|---|---|
| OQ-1 heartbeat | initialize で必須宣言 + wire 構造 | — | subscription 着地 | — |
| OQ-2 id 衝突防止 | source_id field + 複合 key | — | — | — |
| OQ-3 tasks 永続性 | — | memory-only Tasks | — | Container 内 entry 化評価 |
| OQ-4 per-method ACL | — | — | extensionGrants + dialog | scope 階層化 / revoke flow |
| OQ-5 delta | — | — | preview-only delta | record.live separate method |

**v2.0 minimum** wave 着手で必要な OQ 決定はすべて 1+2 の **2 件のみ**。tasks / ACL / delta は phase 後段。これにより v2.0 minimum は wire envelope + handshake + correlation + error code の 4 軸固めに集中可能。

---

## 3. 確定した v2.0 minimum spec の必須項目

本書の decision を踏まえた v2.0 minimum spec の **normative** 項目:

1. **Envelope**: JSON-RPC 2.0 ベース + `source_id` field 追加(OQ-2)
2. **Initialize handshake**: `clientCapabilities` / `serverCapabilities` 双方向交換 + `heartbeat` 設定(OQ-1)
3. **ID correlation**: `(source_id, id)` 複合 key で host dedupe、UUID v4 sender 推奨(OQ-2)
4. **Error code 範囲**: `-32000`〜`-32099` を PKC 固有割当、本書で確定したのは:
   - `-32099 sender_inactive`(heartbeat timeout)
   - `-32098 duplicate_id`(同 sender 同 id)
   - 残り未使用 codes は v2 spec で table 化
5. **Heartbeat protocol**: `$/heartbeat` notification、interval/tolerance は `serverCapabilities` で host が指定(OQ-1)
6. **Subscription TTL**: 24 時間 hard cap(v1 acceptance contract 継承)
7. **Method catalog v2.0**: `initialize` / `$/heartbeat` / `ping` / `record.offer` / `export.request` / `pong`(legacy v1 の互換最小、Tasks / Subscription / Elicitation は v2.1+ 段階)

**未確定項目**(v2 spec で詰める、本書 scope 外):
- protocolVersion 文字列の format(`'2026-05'` 日付形式 vs `'2.0.0'` semver vs `'YYYYMMDD'`)
- Migration from v1 の wire bridge(host が両 envelope 受信を判別する logic 詳細)
- Method namespace convention(`record.offer` vs `record:offer` vs `record/offer`)→ JSON-RPC convention に従い **dot-separated**(`record.offer`)を採用予定
- Standard error code 14 値(JSON-RPC 標準 6 + PKC 固有 8)の詳細割当

---

## 4. v2.0 minimum 着地の予定 PR 順序(本書承認後)

1. **PR-α: v2 spec doc 起こし**(`docs/spec/pkc-message-api-v2.md` NEW、~600-800 行、本書を canonical reference として normative 化)
2. **PR-β: envelope + source_id 実装**(`src/adapter/transport/envelope.ts` 拡張、~80-120 行、v1 backward-compat 経路維持)
3. **PR-γ: handshake + heartbeat**(`src/adapter/transport/capability.ts` + 新 `heartbeat.ts`、~150-200 行)
4. **PR-δ: id correlation 複合 key**(`src/adapter/transport/message-bridge.ts` 改修、~50-80 行)
5. **PR-ε: error code table + reject reason migration**(spec table 確定 + handler 統合、~50 行 + spec)

5 PR で v2.0 minimum 着地、bundle 影響は ~2-3 KB 見込み(transport 層の純増)。test は per-PR で integration 経路を pin(coverage gate と組み合わせ regression 防止)。

v1 deprecation timeline(prior-art doc §7):
- v2.0 beta(本 5 PR 着地)→ v2.1 stable(Tasks 加算)→ v2.2 v1 deprecated(ACL + delta 加算)→ v3 v1 retired

---

## 5. user review 観点

本書を merge 前に user に確認頂きたい点:

- **OQ-1 heartbeat default 値**: `intervalMs: 15000, toleranceMs: 5000` の妥当性。AI agent が 15 秒間隔で ping を送ることが許容できる頻度か?
- **OQ-2 source_id host 集中発行**: sender 側で source_id を claim する pattern を許容しないこと(spoofing 防止優先)に同意か?
- **OQ-3 v2.1 memory-only Tasks**: session 終了で task 消滅(silently lost)を v2.1 default 挙動として許容するか? user に明示的な warning を出すべきか?
- **OQ-4 v2.2 extensionGrants schema**: schema_version を 2 → 3 に上げる migration を v2.2 で実施することの影響評価(既存 container は影響無いが、export/import で schema_version 検査がある場合)
- **OQ-5 v2.2 preview-only delta**: AI 協働での "live writing" 体験を v3+ まで保留することへの user 同意

各点で「変更したい」「保留したい」「OK」のいずれかを user 側で判断、本書を updated して再 review が標準フロー。

---

## 関連

- 上位 plan: [`pkc-message-v2-prior-art-and-plan-2026-04-26.md`](./pkc-message-v2-prior-art-and-plan-2026-04-26.md)
- v1 spec: [`../spec/pkc-message-api-v1.md`](../spec/pkc-message-api-v1.md)
- v1 implementation gap audit: [`pkc-message-implementation-gap-audit-2026-04-26.md`](./pkc-message-implementation-gap-audit-2026-04-26.md)
- INDEX: [`INDEX.md`](./INDEX.md) §LIVE
